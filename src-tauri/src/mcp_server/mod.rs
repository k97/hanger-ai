//! Hanger's own MCP server: a stdio server inside the Hanger binary that the
//! user's engines launch as `<Hanger AI> mcp`, answering read-only questions
//! about the harness from Hanger's store and the engines' config files. It
//! never writes an engine's config. Plan: `docs/plans/2026-11-27-hanger-mcp-server.md`.
//!
//! Nothing in this module prints: stdout carries only `rmcp`'s messages
//! (`mcp_server_tests.rs` → `the_server_module_never_prints`). It starts no
//! telemetry and touches nothing Tauri. Every string an engine sees is in
//! `strings`, signed off in `docs/plans/2026-11-27-hanger-mcp-server-naming-brief.md`.

pub mod limit;
pub mod places;
mod strings;
pub mod tools;

use std::process::ExitCode;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use rmcp::model::{
    CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Implementation, JsonObject,
    ListToolsResult, PaginatedRequestParams, ServerCapabilities, ServerConfig, Tool,
};
use rmcp::service::RequestContext;
use rmcp::{ErrorData, RoleServer, ServerHandler, ServiceExt};
use serde_json::{json, Value};

use limit::RateLimit;
use places::ServerPlaces;
use tools::Refusal;

/// `Some` when `args[1]` is `mcp`, after serving until stdin closes; `None`
/// otherwise, and the app starts as usual.
pub fn run_from_args(args: &[String]) -> Option<ExitCode> {
    if args.get(1).map(String::as_str) != Some("mcp") {
        return None;
    }
    let runtime = match tokio::runtime::Builder::new_current_thread().enable_all().build() {
        Ok(rt) => rt,
        Err(_) => return Some(ExitCode::FAILURE),
    };
    Some(runtime.block_on(serve_stdio()))
}

/// Serve the five read tools on stdin and stdout until stdin closes.
pub async fn serve_stdio() -> ExitCode {
    let server = HangerServer {
        places: Arc::new(places::server_places(&crate::scanner::get_home_dir())),
        limit: Arc::new(Mutex::new(RateLimit::new(30, Duration::from_secs(10)))),
    };
    let Ok(running) = server.serve(rmcp::transport::stdio()).await else {
        return ExitCode::FAILURE;
    };
    match running.waiting().await {
        Ok(_) => ExitCode::SUCCESS,
        Err(_) => ExitCode::FAILURE,
    }
}

#[derive(Clone)]
struct HangerServer {
    places: Arc<ServerPlaces>,
    limit: Arc<Mutex<RateLimit>>,
}

/// One tool: its strings, the arguments it takes, and what it runs. The
/// schema, the argument check and the dispatch are all read from here.
struct Spec {
    text: strings::ToolText,
    /// Required string arguments.
    required: &'static [&'static str],
    /// Whether it takes the optional integer `limit`, from 1 to `MAX_LIMIT`.
    limit: bool,
    /// Runs on arguments that `fits` has passed.
    run: fn(&ServerPlaces, &JsonObject) -> Result<Value, Refusal>,
}

const MAX_LIMIT: u64 = 50;

fn text_arg(args: &JsonObject, key: &str) -> String {
    args.get(key).and_then(Value::as_str).unwrap_or_default().to_string()
}

/// The five tools, in the order `tools/list` returns them.
const TOOLS: [Spec; 5] = [
    Spec { text: strings::LIST_ENGINES, required: &[], limit: false, run: |p, _| to_value(tools::list_engines(p)) },
    Spec {
        text: strings::ENGINE_CONTEXT,
        required: &["engine_id"],
        limit: false,
        run: |p, a| to_value(tools::engine_context(p, &text_arg(a, "engine_id"))),
    },
    Spec {
        text: strings::FIND_ASSETS,
        required: &["query"],
        limit: true,
        // Omitted: the 50 the description promises at most.
        run: |p, a| {
            let limit = a.get("limit").and_then(Value::as_u64).unwrap_or(MAX_LIMIT) as usize;
            to_value(tools::find_assets(p, &text_arg(a, "query"), limit))
        },
    },
    Spec {
        text: strings::REACH,
        required: &["asset_id"],
        limit: false,
        run: |p, a| to_value(tools::reach(p, &text_arg(a, "asset_id"))),
    },
    Spec { text: strings::FINDINGS, required: &[], limit: false, run: |p, _| to_value(tools::findings(p)) },
];

impl Spec {
    /// The tool's input schema: its string arguments required, `limit`
    /// bounded, nothing else accepted.
    fn schema(&self) -> JsonObject {
        let mut properties = serde_json::Map::new();
        for key in self.required {
            properties.insert(key.to_string(), json!({ "type": "string" }));
        }
        if self.limit {
            properties.insert("limit".into(), json!({ "type": "integer", "minimum": 1, "maximum": MAX_LIMIT }));
        }
        let mut out = serde_json::Map::new();
        out.insert("type".into(), json!("object"));
        if !properties.is_empty() {
            out.insert("properties".into(), Value::Object(properties));
            out.insert("required".into(), json!(self.required));
        }
        out.insert("additionalProperties".into(), json!(false));
        out
    }

    /// Whether `args` fit the schema above.
    fn fits(&self, args: &JsonObject) -> bool {
        let known = |k: &str| self.required.contains(&k) || (self.limit && k == "limit");
        args.keys().all(|k| known(k))
            && self.required.iter().all(|k| args.get(*k).is_some_and(Value::is_string))
            && args.get("limit").is_none_or(|v| v.as_u64().is_some_and(|n| (1..=MAX_LIMIT).contains(&n)))
    }
}

fn refused(text: &str) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(text.to_string())])
}

impl ServerHandler for HangerServer {
    fn get_info(&self) -> ServerConfig {
        ServerConfig::new(ServerCapabilities::builder().enable_tools().build())
            .with_server_info(Implementation::new("hanger", env!("CARGO_PKG_VERSION")))
            .with_instructions(strings::INSTRUCTIONS)
    }

    async fn list_tools(
        &self,
        _request: Option<PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> Result<ListToolsResult, ErrorData> {
        let tools = TOOLS
            .iter()
            .map(|t| {
                let (name, title, description, _) = t.text;
                Tool::new(name, description, t.schema()).with_title(title)
            })
            .collect();
        Ok(ListToolsResult::with_all_items(tools))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let Some(spec) = TOOLS.iter().find(|t| t.text.0 == request.name) else {
            // The spec keeps an unknown tool a protocol error (round 34).
            let message = format!("Unknown tool: {}", tools::public_name(&request.name));
            return Err(ErrorData::invalid_params(message, None));
        };
        let args = request.arguments.unwrap_or_default();
        if !spec.fits(&args) {
            // An input error is a tool result, so the model can fix its call.
            return Ok(CallToolResponse::Complete(refused(spec.text.3)));
        }
        // shortcut: a lock poisoned by a panic keeps limiting; a panic here is a bug anyway.
        let allowed_now = self.limit.lock().unwrap_or_else(|e| e.into_inner()).allow(Instant::now());
        if !allowed_now {
            return Ok(CallToolResponse::Complete(refused(strings::refusal(Refusal::SlowDown))));
        }
        let (places, run) = (self.places.clone(), spec.run);
        let answer = tokio::task::spawn_blocking(move || run(&places, &args))
            .await
            .unwrap_or(Err(Refusal::Unreadable));
        Ok(CallToolResponse::Complete(match answer {
            Ok(value) => CallToolResult::structured(value),
            Err(r) => refused(strings::refusal(r)),
        }))
    }
}

fn to_value<T: serde::Serialize>(reply: Result<T, Refusal>) -> Result<Value, Refusal> {
    reply.and_then(|r| serde_json::to_value(r).map_err(|_| Refusal::Unreadable))
}
