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

/// A JSON Schema object with `required` string properties and optional
/// integer ones, accepting nothing else.
fn schema(strings: &[&str], integers: &[&str]) -> JsonObject {
    let mut properties = serde_json::Map::new();
    for s in strings {
        properties.insert(s.to_string(), json!({ "type": "string" }));
    }
    for i in integers {
        properties.insert(i.to_string(), json!({ "type": "integer" }));
    }
    let mut out = serde_json::Map::new();
    out.insert("type".into(), json!("object"));
    if !properties.is_empty() {
        out.insert("properties".into(), Value::Object(properties));
        out.insert("required".into(), json!(strings));
    }
    out.insert("additionalProperties".into(), json!(false));
    out
}

/// The five tools, in the order `tools/list` returns them.
fn tool_list() -> Vec<Tool> {
    use strings::*;
    [
        (LIST_ENGINES, schema(&[], &[])),
        (ENGINE_CONTEXT, schema(&["engine_id"], &[])),
        (FIND_ASSETS, schema(&["query"], &["limit"])),
        (REACH, schema(&["asset_path"], &[])),
        (FINDINGS, schema(&[], &[])),
    ]
    .into_iter()
    .map(|((name, title, description), input)| Tool::new(name, description, input).with_title(title))
    .collect()
}

fn refused(r: Refusal) -> CallToolResult {
    CallToolResult::error(vec![ContentBlock::text(strings::refusal(r))])
}

/// The arguments a tool's schema allows, or a protocol error when they do
/// not fit it (the spec's "malformed request").
struct Args(JsonObject);

impl Args {
    fn check(arguments: Option<JsonObject>, allowed: &[&str]) -> Result<Args, ErrorData> {
        let args = arguments.unwrap_or_default();
        if args.keys().any(|k| !allowed.contains(&k.as_str())) {
            return Err(ErrorData::invalid_params("Invalid params", None));
        }
        Ok(Args(args))
    }

    fn text(&self, key: &str) -> Result<String, ErrorData> {
        self.0.get(key).and_then(Value::as_str).map(str::to_string).ok_or_else(|| ErrorData::invalid_params("Invalid params", None))
    }
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
        Ok(ListToolsResult::with_all_items(tool_list()))
    }

    async fn call_tool(
        &self,
        request: CallToolRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> Result<CallToolResponse, ErrorData> {
        let name = request.name.to_string();
        let allowed: &[&str] = match name.as_str() {
            "list_engines" | "findings" => &[],
            "engine_context" => &["engine_id"],
            "find_assets" => &["query", "limit"],
            "reach" => &["asset_path"],
            _ => return Err(ErrorData::invalid_params("Unknown tool", None)),
        };
        let args = Args::check(request.arguments, allowed)?;
        // shortcut: a lock poisoned by a panic keeps limiting; a panic here is a bug anyway.
        let allowed_now = self.limit.lock().unwrap_or_else(|e| e.into_inner()).allow(Instant::now());
        if !allowed_now {
            return Ok(CallToolResponse::Complete(refused(Refusal::SlowDown)));
        }
        let call: Box<dyn FnOnce(&ServerPlaces) -> Result<Value, Refusal> + Send> = match name.as_str() {
            "list_engines" => Box::new(|p| to_value(tools::list_engines(p))),
            "findings" => Box::new(|p| to_value(tools::findings(p))),
            "engine_context" => {
                let id = args.text("engine_id")?;
                Box::new(move |p| to_value(tools::engine_context(p, &id)))
            }
            "find_assets" => {
                let query = args.text("query")?;
                // Omitted: the 50 the description promises at most.
                let limit = match args.0.get("limit") {
                    None => 50,
                    Some(v) => v.as_u64().map(|n| n as usize).unwrap_or(0),
                };
                Box::new(move |p| to_value(tools::find_assets(p, &query, limit)))
            }
            _ => {
                let path = args.text("asset_path")?;
                Box::new(move |p| to_value(tools::reach(p, &path)))
            }
        };
        let places = self.places.clone();
        let answer = tokio::task::spawn_blocking(move || call(&places))
            .await
            .unwrap_or(Err(Refusal::Unreadable));
        Ok(CallToolResponse::Complete(match answer {
            Ok(value) => CallToolResult::structured(value),
            Err(r) => refused(r),
        }))
    }
}

fn to_value<T: serde::Serialize>(reply: Result<T, Refusal>) -> Result<Value, Refusal> {
    reply.and_then(|r| serde_json::to_value(r).map_err(|_| Refusal::Unreadable))
}
