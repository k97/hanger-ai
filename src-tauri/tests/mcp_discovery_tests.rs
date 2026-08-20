//! MCP discovery: registry shape, dialect parsing, and filesystem resolution.
//!
//! Spec: docs/superpowers/specs/2026-08-14-mcp-server-visibility-design.md
//! Plan: docs/superpowers/plans/2026-08-14-mcp-discovery-correctness.md

use tauri_app_lib::mcp::registry::{self, Dialect, HostKind, ScopeTier, SourceLocation};

#[test]
fn registry_declares_every_known_host() {
    let ids: Vec<&str> = registry::HOSTS.iter().map(|h| h.id).collect();
    for expected in [
        "claude-code",
        "codex",
        "gemini",
        "claude-desktop",
        "vscode",
        "cursor",
        "windsurf",
        "zed",
    ] {
        assert!(ids.contains(&expected), "registry is missing host {}", expected);
    }
}

#[test]
fn agent_hosts_are_separated_from_mcp_only_hosts() {
    let kind = |id: &str| registry::host_by_id(id).unwrap().kind;
    assert_eq!(kind("claude-code"), HostKind::Agent);
    assert_eq!(kind("codex"), HostKind::Agent);
    assert_eq!(kind("gemini"), HostKind::Agent);
    assert_eq!(kind("claude-desktop"), HostKind::McpHost);
    assert_eq!(kind("vscode"), HostKind::McpHost);
    assert_eq!(kind("cursor"), HostKind::McpHost);
}

#[test]
fn every_source_names_a_declared_host() {
    for source in registry::SOURCES {
        assert!(
            registry::host_by_id(source.host_id).is_some(),
            "source {} names unknown host {}",
            source.path,
            source.host_id
        );
    }
}

#[test]
fn claude_json_supplies_both_user_and_local_tiers() {
    let tiers: Vec<ScopeTier> = registry::SOURCES
        .iter()
        .filter(|s| s.path.contains(".claude.json"))
        .map(|s| s.tier)
        .collect();
    assert!(
        tiers.contains(&ScopeTier::User),
        "expected a user-tier .claude.json source"
    );
    assert!(
        tiers.contains(&ScopeTier::Local),
        "expected a local-tier .claude.json source"
    );
}

#[test]
fn vscode_and_codex_declare_their_own_dialects() {
    let dialect_for = |needle: &str| {
        registry::SOURCES
            .iter()
            .find(|s| s.path.contains(needle))
            .unwrap_or_else(|| panic!("no source matching {}", needle))
            .dialect
    };
    assert_eq!(dialect_for("Code/User/mcp.json"), Dialect::VsCodeServers);
    assert_eq!(dialect_for(".codex/config.toml"), Dialect::CodexToml);
    assert_eq!(dialect_for("zed/settings.json"), Dialect::ZedContextServers);
}

#[test]
fn repo_relative_sources_use_relative_paths() {
    for source in registry::SOURCES {
        if source.location == SourceLocation::RepoRelative {
            assert!(
                !source.path.starts_with('/') && !source.path.starts_with('~'),
                "repo-relative source {} must not be absolute",
                source.path
            );
        }
    }
}

// ─── Dialects ────────────────────────────────────────────────────────────────

use tauri_app_lib::mcp::dialect::{self, McpServer};

fn names(servers: &[McpServer]) -> Vec<String> {
    let mut n: Vec<String> = servers.iter().map(|s| s.name.clone()).collect();
    n.sort();
    n
}

#[test]
fn codex_toml_reads_mcp_servers_not_tools() {
    // The real shape of ~/.codex/config.toml. The pre-existing parser read a
    // `tools` key and found nothing here.
    let body = r#"
[features]
web_search = true

[mcp_servers]
[mcp_servers.node_repl]
command = "node"
args = ["--experimental-repl"]
[mcp_servers.node_repl.env]
NODE_OPTIONS = "--max-old-space-size=4096"

[mcp_servers.computer-use]
command = "codex"
args = [ "mcp" ]

[mcp_servers.tauri]
command = "npx @hypothesi/tauri-mcp-server"
args = []
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["computer-use", "node_repl", "tauri"]);
}

#[test]
fn codex_toml_captures_env_names_but_never_values() {
    let body = r#"
[mcp_servers.secretive]
command = "node"
[mcp_servers.secretive.env]
API_KEY = "sk-live-do-not-store-this"
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].env_keys, vec!["API_KEY"]);
    let rendered = format!("{:?}", servers);
    assert!(!rendered.contains("sk-live"), "env value leaked into the domain struct");
}

#[test]
fn vscode_servers_key_is_read() {
    let body = r#"{"servers": {"figma": {"type": "http", "url": "https://mcp.figma.com/mcp"}}}"#;
    let servers = dialect::parse(body, Dialect::VsCodeServers, ScopeTier::Global).unwrap();
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].name, "figma");
    assert_eq!(servers[0].transport, "https://mcp.figma.com/mcp");
}

#[test]
fn zed_context_servers_key_is_read() {
    let body = r#"{"context_servers": {"local-tool": {"command": "node"}}}"#;
    let servers = dialect::parse(body, Dialect::ZedContextServers, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["local-tool"]);
}

#[test]
fn zed_declares_its_command_as_an_object_and_still_yields_a_runnable_launch() {
    // The read was `.as_str()` on an object, which returns None. The command
    // came out empty and transport_for called it "unknown", so every Zed
    // server rendered as a blank row.
    let body = r#"{
  "context_servers": {
    "spades": {
      "command": {
        "path": "node",
        "args": ["/tmp/index.js"],
        "env": { "SPADES_TOKEN": "REDACT_ME_1" }
      }
    }
  }
}"#;
    let servers = dialect::parse(body, dialect::Dialect::ZedContextServers, dialect::ScopeTier::Global)
        .expect("nested command must parse");
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].command, "node");
    assert_eq!(servers[0].args, vec!["/tmp/index.js".to_string()]);
    assert_eq!(servers[0].transport, "stdio");
    // Lifted from inside the nested object. Reading the entry root would find
    // nothing and report a server with no environment at all.
    assert_eq!(servers[0].env_keys, vec!["SPADES_TOKEN".to_string()]);
    // The standing constraint: names only, never values.
    assert!(!format!("{:?}", servers[0]).contains("REDACT_ME_1"));
}

#[test]
fn zeds_flat_command_shape_keeps_working() {
    // Newer Zed writes the flat shape. Both are in the wild, so both parse.
    let body = r#"{
  "context_servers": {
    "spades": { "command": "node", "args": ["/tmp/index.js"] }
  }
}"#;
    let servers = dialect::parse(body, dialect::Dialect::ZedContextServers, dialect::ScopeTier::Global)
        .expect("flat command must parse");
    assert_eq!(servers[0].command, "node");
    assert_eq!(servers[0].args, vec!["/tmp/index.js".to_string()]);
}

#[test]
fn a_zed_remote_entry_without_a_command_is_untouched() {
    // A `url`-only entry has no `command` at all. The normaliser must pass it
    // through rather than assuming the nested shape.
    let body = r#"{
  "context_servers": { "linear": { "url": "https://mcp.linear.app/sse" } }
}"#;
    let servers = dialect::parse(body, dialect::Dialect::ZedContextServers, dialect::ScopeTier::Global)
        .expect("remote entry must parse");
    assert_eq!(servers[0].command, "");
    assert_eq!(servers[0].transport, "https://mcp.linear.app/sse");
}

#[test]
fn a_zed_config_with_comments_still_parses() {
    // Zed ships settings.json with comments by default. This is covered by
    // strip_jsonc, but Zed is the reason it matters, so it is pinned here too.
    let body = r#"{
  // The MCP servers Zed can reach.
  "context_servers": {
    "spades": { "command": { "path": "node", "args": [] } },
  },
}"#;
    let servers = dialect::parse(body, dialect::Dialect::ZedContextServers, dialect::ScopeTier::Global)
        .expect("JSONC must parse");
    assert_eq!(servers[0].command, "node");
}

#[test]
fn claude_json_user_tier_reads_only_top_level_mcp_servers() {
    let body = r#"{
      "mcpServers": {"spades-audio": {"command": "node"}, "tauri": {"command": "npx tauri-mcp"}},
      "projects": {"/repo/a": {"mcpServers": {"local-only": {"command": "node"}}}},
      "history": [{"display": "secret prompt text"}]
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeJson, ScopeTier::User).unwrap();
    assert_eq!(names(&servers), vec!["spades-audio", "tauri"]);
    assert!(servers.iter().all(|s| s.project_root.is_none()));
    assert!(!format!("{:?}", servers).contains("secret prompt text"));
}

#[test]
fn claude_json_local_tier_reads_only_project_keyed_servers() {
    let body = r#"{
      "mcpServers": {"user-wide": {"command": "node"}},
      "projects": {
        "/repo/a": {"mcpServers": {"local-only": {"command": "node"}}},
        "/repo/b": {"mcpServers": {}}
      }
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeJson, ScopeTier::Local).unwrap();
    assert_eq!(names(&servers), vec!["local-only"]);
    assert_eq!(servers[0].project_root.as_deref(), Some("/repo/a"));
}

#[test]
fn url_credentials_are_stripped_from_transport() {
    let body = r#"{"mcpServers": {"remote": {"url": "https://user:pw@example.com/mcp?api_key=123"}}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].transport, "https://example.com/mcp");
}

#[test]
fn a_url_with_a_second_scheme_embedded_in_its_query_still_gets_sanitised() {
    // An OAuth callback keeps the whole redirect target, `://` and all, in
    // one query parameter. `split("://").collect()` counted three parts for
    // a URL shaped like this -- not the two `sanitise_url` checked for -- and
    // returned the RAW string untouched, secret query string included.
    // `split_once` cuts at only the first `://` regardless of how many more
    // follow.
    let raw = "https://provider.example.com/callback?redirect_uri=https://app.example.com/oauth&token=REDACT_ME_1";
    assert_eq!(
        dialect::sanitise_url(raw),
        "https://provider.example.com/callback"
    );
}

#[test]
fn a_url_fragment_is_stripped_along_with_the_query_string() {
    // `sanitise_url` cut at `?` only. A fragment can carry a credential too
    // -- an implicit OAuth grant returns its access token in one
    // (`#access_token=…`), never a query string -- and passed whole.
    let raw = "https://mcp.example.com/sse#access_token=REDACT_ME_1";
    assert_eq!(dialect::sanitise_url(raw), "https://mcp.example.com/sse");
}

#[test]
fn a_bridged_remote_server_and_a_direct_one_share_an_identity() {
    // Zed is stdio-only, so a remote server reaches it through mcp-remote.
    // Reported unwrapped, that is the same logical server as the direct
    // registration elsewhere; reported raw, it is two unrelated rows and the
    // cross-engine reading is wrong on every machine using Zed.
    let bridged = r#"{
  "context_servers": {
    "linear": { "command": "npx", "args": ["-y", "mcp-remote", "https://mcp.linear.app/sse"] }
  }
}"#;
    let direct = r#"{ "mcpServers": { "linear": { "url": "https://mcp.linear.app/sse" } } }"#;

    let b = dialect::parse(bridged, dialect::Dialect::ZedContextServers, dialect::ScopeTier::Global).unwrap();
    let d = dialect::parse(direct, dialect::Dialect::McpServers, dialect::ScopeTier::Global).unwrap();

    assert_eq!(b[0].transport, d[0].transport);
    assert_eq!(b[0].transport, "https://mcp.linear.app/sse");
    assert!(b[0].bridged, "the bridge is worth saying, even though the identity matches");
    assert!(!d[0].bridged);
}

#[test]
fn a_bridged_servers_fingerprint_is_set_from_the_raw_url_not_the_sanitised_one() {
    // `url_fingerprint` used to stay `None` for a bridged registration --
    // `mcp::agreement::comparison_key` re-derived its own copy instead, and
    // did so from an already-sanitised url, dropping the query string. Both
    // halves are fixed now: this field is populated at parse time, and it
    // hashes the RAW url, before `transport`'s own sanitisation would strip
    // the query string that distinguishes it from another bridge at a
    // different one.
    let body = r#"{ "mcpServers": { "linear": { "command": "npx",
        "args": ["mcp-remote", "https://mcp.linear.app/sse?region=eu"] } } }"#;
    let s = dialect::parse(body, dialect::Dialect::McpServers, dialect::ScopeTier::Global).unwrap();
    assert!(s[0].bridged);
    assert_eq!(
        s[0].url_fingerprint,
        Some(dialect::url_fingerprint("https://mcp.linear.app/sse?region=eu")),
        "fingerprint must hash the raw url, query string included"
    );
}

#[test]
fn a_launch_that_merely_mentions_a_url_is_not_a_bridge() {
    // Over-eager unwrapping would rewrite the identity of any stdio server
    // whose arguments happen to carry a URL.
    let body = r#"{ "mcpServers": { "docs": { "command": "node",
        "args": ["/tmp/server.js", "--upstream", "https://example.com/api"] } } }"#;
    let s = dialect::parse(body, dialect::Dialect::McpServers, dialect::ScopeTier::Global).unwrap();
    assert_eq!(s[0].transport, "stdio");
    assert!(!s[0].bridged);
}

#[test]
fn credentials_in_a_bridged_url_do_not_survive_the_unwrap() {
    let body = r#"{ "mcpServers": { "x": { "command": "npx",
        "args": ["mcp-remote", "https://u:REDACT_ME_1@example.com/sse?k=REDACT_ME_1"] } } }"#;
    let s = dialect::parse(body, dialect::Dialect::McpServers, dialect::ScopeTier::Global).unwrap();
    assert!(!s[0].transport.contains("REDACT_ME_1"), "{}", s[0].transport);
    assert_eq!(s[0].transport, "https://example.com/sse");
}

#[test]
fn a_recognised_file_with_no_servers_is_an_empty_success_not_an_error() {
    // Callers distinguish "parsed, zero servers" (warn) from "failed to parse"
    // (error). Both were previously indistinguishable Ok(0).
    let servers = dialect::parse("{}", Dialect::McpServers, ScopeTier::Global).unwrap();
    assert!(servers.is_empty());
}

#[test]
fn malformed_json_is_an_error() {
    assert!(dialect::parse("{ not json", Dialect::McpServers, ScopeTier::Global).is_err());
}

#[test]
fn opencode_mcp_key_is_parsed_and_discriminated_by_type() {
    let json = r#"{
      "mcp": {
        "local-tool": { "type": "local", "command": ["run", "me"] },
        "remote-tool": { "type": "remote", "url": "https://example.test/mcp" }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(names(&servers), vec!["local-tool", "remote-tool"]);
}

#[test]
fn amp_reads_its_servers_from_a_nested_settings_key() {
    let json = r#"{
      "editor.fontSize": 13,
      "amp.mcpServers": { "notes": { "command": "notes-mcp" } }
    }"#;
    let servers = dialect::parse(json, Dialect::AmpSettingsKey, ScopeTier::Global).expect("must parse");
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].name, "notes");
}

#[test]
fn jsonc_comments_and_trailing_commas_do_not_read_as_zero_servers() {
    // Kilo Code ships JSONC. serde_json rejects both comments and trailing
    // commas, so without a pre-pass a commented config reads as no servers at
    // all — the silent-miss failure this refactor exists to remove.
    let jsonc = r#"{
      // the tools I actually use
      "mcp": {
        "notes": { "type": "local", "command": ["notes-mcp"] }, /* trailing */
      },
    }"#;
    let servers = dialect::parse(jsonc, Dialect::OpenCodeMcp, ScopeTier::Global)
        .expect("a commented JSONC config must parse");
    assert_eq!(servers.len(), 1, "a comment must not hide a server");
}

#[test]
fn jsonc_stripping_leaves_a_double_slash_inside_a_string_intact() {
    // `//` inside a quoted value — a URL, here — is not a line comment. If
    // strip_jsonc mistook it for one, the rest of the line (including the
    // closing quote and brace) would be eaten and the file would fail to
    // parse, or the transport would come out truncated.
    let jsonc = r#"{
      // config
      "mcp": {
        "remote": { "type": "remote", "url": "https://example.test/mcp" }
      }
    }"#;
    let servers = dialect::parse(jsonc, Dialect::OpenCodeMcp, ScopeTier::Global)
        .expect("a URL containing // must survive the strip");
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].transport, "https://example.test/mcp");
}

#[test]
fn opencode_array_command_becomes_command_plus_args() {
    // `server_from_json` only reads `command` as a string; left alone this
    // silently drops both the executable and its arguments to empty, for a
    // `type: "local"` server where the command IS the actionable content.
    let json = r#"{
      "mcp": {
        "local-tool": { "type": "local", "command": ["run", "me", "now"] }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers.len(), 1);
    assert_eq!(servers[0].command, "run");
    assert_eq!(servers[0].args, vec!["me", "now"]);
}

#[test]
fn opencode_single_element_array_command_has_no_args() {
    let json = r#"{
      "mcp": {
        "solo": { "type": "local", "command": ["serve"] }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "serve");
    assert!(servers[0].args.is_empty());
}

#[test]
fn opencode_declared_args_survive_an_array_command() {
    // The clobber. `{"command": ["docker"], "args": [...]}` is an ordinary
    // shape, and an unconditional `insert("args", …)` replaced the declared
    // launch with the (empty) tail of the command array — leaving `docker`
    // alone in the inventory, which starts nothing.
    let json = r#"{
      "mcp": {
        "boxed": { "type": "local", "command": ["docker"], "args": ["run", "-i", "img"] }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "docker");
    assert_eq!(servers[0].args, vec!["run", "-i", "img"]);
}

#[test]
fn opencode_merges_both_halves_of_a_split_launch_and_drops_neither() {
    // Both sources populated. Neither may be discarded, and the command
    // array's own tail comes first: that is the order the tokens sit in.
    let json = r#"{
      "mcp": {
        "split": { "type": "local", "command": ["a", "b"], "args": ["c"] }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "a");
    assert_eq!(servers[0].args, vec!["b", "c"]);
}

#[test]
fn opencode_keeps_an_unquoted_number_in_the_launch() {
    // `--port 8080` is the natural thing to write, and a filter that kept
    // only strings dropped the port — showing a launch that is not the one on
    // disk, with nothing said about the difference. There is exactly one text
    // 8080 means, so it is carried rather than guessed at.
    let json = r#"{
      "mcp": {
        "served": { "type": "local", "command": ["node", "server.js", "--port", 8080] }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "node");
    assert_eq!(servers[0].args, vec!["server.js", "--port", "8080"]);
}

#[test]
fn an_unquoted_number_survives_a_plain_args_array_too() {
    // The same drop lived in `args_json`, which every dialect reads through.
    // Fixing only the OpenCode side would have moved the defect one key over.
    let json = r#"{ "mcpServers": { "served": { "command": "node", "args": ["--port", 8080] } } }"#;
    let servers = dialect::parse(json, Dialect::McpServers, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].args, vec!["--port", "8080"]);
}

#[test]
fn an_unreadable_opencode_command_is_stated_not_swallowed() {
    // Both of these previously returned the entry untouched, straight into
    // the empty-command path the normaliser exists to close: a server present
    // in the inventory with nothing to run and no diagnostic anywhere.
    for (json, why) in [
        (
            r#"{ "mcp": { "empty": { "type": "local", "command": [] } } }"#,
            "an empty command array declares no launch",
        ),
        (
            r#"{ "mcp": { "nested": { "type": "local", "command": [{ "path": "x" }] } } }"#,
            "an object has no launch-token form",
        ),
        (
            r#"{ "mcp": { "nulled": { "type": "local", "command": ["node", null] } } }"#,
            "neither does a null",
        ),
    ] {
        let err = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global)
            .expect_err(why);
        assert!(
            err.contains("command"),
            "the error must name what it could not read, got: {err}"
        );
    }
}

#[test]
fn opencode_remote_type_is_unaffected_by_command_normalisation() {
    let json = r#"{
      "mcp": {
        "remote-tool": { "type": "remote", "url": "https://example.test/mcp" }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "");
    assert_eq!(servers[0].transport, "https://example.test/mcp");
}

#[test]
fn opencode_string_command_is_unaffected_by_array_normalisation() {
    // The normalisation is additive: an entry that already matches the
    // string-command shape every other dialect uses must pass through
    // untouched, not get rewritten into something else.
    let json = r#"{
      "mcp": {
        "classic": { "command": "notes-mcp" }
      }
    }"#;
    let servers = dialect::parse(json, Dialect::OpenCodeMcp, ScopeTier::Global).expect("must parse");
    assert_eq!(servers[0].command, "notes-mcp");
    assert!(servers[0].args.is_empty());
}

// ─── Host kind is derived, never stored ──────────────────────────────────────

#[test]
fn engine_kind_derives_from_the_registry_not_the_database() {
    // `kind` is a compile-time fact about what a program IS, not per-machine
    // state. Storing it in the `engines` table would duplicate this registry
    // in SQLite and require a schema migration to correct a typo.
    assert_eq!(registry::host_by_engine_key("claude_code").unwrap().kind, HostKind::Agent);
    assert_eq!(registry::host_by_engine_key("codex").unwrap().kind, HostKind::Agent);
    assert_eq!(registry::host_by_engine_key("claude_desktop").unwrap().kind, HostKind::McpHost);
    assert_eq!(registry::host_by_engine_key("vscode").unwrap().kind, HostKind::McpHost);
    assert!(registry::host_by_engine_key("nonexistent").is_none());
}

#[test]
fn engine_keys_are_underscored_and_round_trip_to_their_host() {
    for host in registry::HOSTS {
        let key = host.engine_key();
        assert!(!key.contains('-'), "engine key {} must not contain hyphens", key);
        assert_eq!(
            registry::host_by_engine_key(&key).unwrap().id,
            host.id,
            "engine key {} did not round-trip", key
        );
    }
}

// ─── Engine key resolution ───────────────────────────────────────────────────

#[test]
fn unknown_engine_ids_are_not_silently_filed_under_gemini() {
    assert_eq!(tauri_app_lib::scanner::get_engine_key("claude-code"), Some("claude_code"));
    assert_eq!(tauri_app_lib::scanner::get_engine_key("codex"), Some("codex"));
    assert_eq!(tauri_app_lib::scanner::get_engine_key("gemini"), Some("gemini"));

    // The regression this test exists for: these previously all returned
    // "gemini" via a `_ =>` catch-all, which would misattribute every
    // MCP-only host's servers to the Gemini engine while looking like it
    // worked.
    assert_eq!(tauri_app_lib::scanner::get_engine_key("claude-desktop"), None);
    assert_eq!(tauri_app_lib::scanner::get_engine_key("vscode"), None);
    assert_eq!(tauri_app_lib::scanner::get_engine_key("totally-unknown"), None);
}

#[test]
fn every_agent_config_id_resolves_to_an_engine_key() {
    // `scanner.rs` calls `.expect("every AGENT_CONFIGS id must have an engine
    // key")` twice, on the scan thread, and nothing pinned the claim. The
    // neighbouring agreement test looks like it does and does not: its
    // assertion sits inside `if let Some(...)`, so a missing key skips the
    // body and the test passes.
    //
    // The design's headline promise is that an agent is one declarative table
    // row. A contributor who believes it adds a row, sees green here, and
    // ships a scan that panics the moment that agent is installed.
    for config in tauri_app_lib::agents::AGENT_CONFIGS {
        assert!(
            tauri_app_lib::scanner::get_engine_key(config.id).is_some(),
            "AGENT_CONFIGS row \"{}\" has no arm in get_engine_key — the scan thread will panic on any machine with it installed",
            config.id
        );
    }
}

#[test]
fn scanner_and_registry_agree_on_every_engine_key_they_both_know() {
    // scanner::get_engine_key covers every engine Hanger records, including
    // rules-only ones like copilot that declare no MCP servers. The MCP
    // registry covers MCP hosts. The sets overlap but are not equal, so the
    // invariant to enforce is agreement on the intersection, not identity.
    for host in registry::HOSTS {
        if let Some(scanner_key) = tauri_app_lib::scanner::get_engine_key(host.id) {
            assert_eq!(
                scanner_key,
                host.engine_key(),
                "scanner and registry disagree on the engine key for {}",
                host.id
            );
        }
    }
}

// ─── Discovery ───────────────────────────────────────────────────────────────

use std::path::Path;
use tauri_app_lib::mcp::discover::{self, ConfigProblemKind};

fn fixture_home() -> &'static Path {
    Path::new("tests/fixtures/mcp_home")
}

#[test]
fn discovery_finds_every_registration_in_the_fixture_home() {
    let result = discover::discover_machine(fixture_home());
    assert_eq!(
        result.registrations.len(),
        16,
        // 14 servers plus 2 Claude.ai connectors read from the same
        // ~/.claude.json by a different dialect.
        "expected 16 registrations, got {:#?}",
        result.registrations.iter().map(|r| (&r.server.name, r.host_id)).collect::<Vec<_>>()
    );
}

#[test]
fn library_resident_sources_are_read_despite_the_walk_exclusion() {
    let result = discover::discover_machine(fixture_home());
    let desktop: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.host_id == "claude-desktop")
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(desktop, vec!["spades-audio"]);

    let vscode: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.host_id == "vscode")
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(vscode, vec!["figma"], "VS Code's `servers` key must be read");
}

#[test]
fn the_walk_exclusion_itself_is_unchanged() {
    // The carve-out is "open registry paths directly", NOT "weaken
    // is_excluded". A Library path presented to the walk guard must still be
    // excluded.
    assert!(tauri_app_lib::scanner::is_excluded(Path::new(
        "/Users/x/Library/Application Support/Code/User/mcp.json"
    )));
}

#[test]
fn one_host_registering_the_same_server_twice_yields_two_registrations() {
    let result = discover::discover_machine(fixture_home());
    let spades: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.server.name == "spades-audio" && r.host_id == "claude-code")
        .map(|r| r.config_path.as_str())
        .collect();
    assert_eq!(
        spades.len(),
        2,
        "expected .claude.json and .claude/mcp.json, got {:?}",
        spades
    );
}

#[test]
fn plugin_marketplace_servers_are_discovered_through_the_glob() {
    let result = discover::discover_machine(fixture_home());
    let names: Vec<&str> = result
        .registrations
        .iter()
        .filter(|r| r.config_path.contains("marketplaces"))
        .map(|r| r.server.name.as_str())
        .collect();
    assert_eq!(names.len(), 2, "expected github and context7, got {:?}", names);
}

#[test]
fn local_tier_registrations_carry_their_project_root() {
    let result = discover::discover_machine(fixture_home());
    let local: Vec<(&str, &str)> = result
        .registrations
        .iter()
        .filter(|r| r.tier == ScopeTier::Local)
        .map(|r| (r.server.name.as_str(), r.server.project_root.as_deref().unwrap()))
        .collect();
    assert!(local.contains(&("repo-local", "/repo/tracked")), "got {:?}", local);
    assert!(local.contains(&("stray", "/repo/untracked")), "got {:?}", local);
}

#[test]
fn nothing_outside_the_two_mcp_keys_is_read_from_claude_json() {
    let result = discover::discover_machine(fixture_home());
    let rendered = format!("{:#?}", result.registrations);
    assert!(!rendered.contains("must never be read"));
}

#[test]
fn a_recognised_source_yielding_no_servers_warns_instead_of_vanishing() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".claude")).unwrap();
    // Valid JSON, recognised path, zero servers — the exact shape that made
    // VS Code's figma server disappear without trace.
    std::fs::write(dir.path().join(".claude/mcp.json"), "{}").unwrap();

    let result = discover::discover_machine(dir.path());
    assert!(
        result.problems.iter().any(|p| matches!(p.kind, ConfigProblemKind::DeclaredNothing)
            && p.path.contains("mcp.json")),
        "expected a DeclaredNothing problem naming the empty source, got {:?}",
        result.problems
    );
}

#[test]
fn a_missing_source_is_silent() {
    let dir = tempfile::tempdir().unwrap();
    let result = discover::discover_machine(dir.path());
    assert!(result.registrations.is_empty());
    assert!(
        result.problems.is_empty(),
        "absent files must not warn: {:?}",
        result.problems
    );
}

// ─── Coverage: what discovery actually checked ─────────────────────────────
//
// A file that parses cleanly to zero servers and is not `is_mcp_dedicated`
// (§ "declared nothing" above) leaves no trace in `registrations` or
// `problems` — it is otherwise invisible. Appendix A.1's "Checked {n} config
// files across {m} engines" needs a place that knows every file the sweep
// actually opened, not just the ones that yielded something.

#[test]
fn checked_records_every_file_the_sweep_actually_opened() {
    // mcp_home has exactly seven physical config files on disk; three
    // MachineAbsolute SOURCES rows (claude-code/User, claude-code/Local,
    // claude-ai/Global) all name the same `.claude.json`, so a naive
    // per-row tally would over-count that one file three times over.
    let result = discover::discover_machine(fixture_home());
    assert_eq!(
        result.checked.len(),
        9,
        "expected one checked entry per (source row, file) pair — 7 files, \
         with .claude.json read by 3 rows — got {:#?}",
        result.checked.iter().map(|c| (c.host_id, c.path.as_str())).collect::<Vec<_>>()
    );
}

#[test]
fn coverage_deduplicates_files_but_not_the_engines_reading_them() {
    // The same physical file must not be counted, or shown, three times just
    // because three registry rows happen to name it.
    let result = discover::discover_machine(fixture_home());
    // Fix round 2: `{m}` is the intersection of checked host ids with the
    // DETECTED engine population (the same one the headline's engine list
    // draws from), not a `HostKind` proxy — passed in explicitly here
    // rather than through `scanner::get_global_agents()`, which is the
    // command's job, not this pure function's.
    let detected: std::collections::HashSet<String> =
        ["claude-code", "codex", "gemini"].iter().map(|s| s.to_string()).collect();
    let coverage = discover::coverage(&result, &detected);
    assert_eq!(
        coverage.checked_file_count, 7,
        "got {:#?}", coverage.checked_files
    );
    assert_eq!(
        coverage.checked_files.len(),
        coverage.checked_file_count,
        "the count field and the disclosure list must agree"
    );
    // claude-ai, claude-desktop and vscode all have a checked file in this
    // fixture but are not in `detected` — they must not inflate the count,
    // regardless of what `HostKind` the registry happens to assign them.
    // `checked_engine_count_counts_only_detected_engines` below pins the
    // general shape directly.
    assert_eq!(coverage.checked_engine_count, 3);
}

#[test]
fn checked_engine_count_counts_only_detected_engines() {
    // A machine where an MCP-only host (claude-ai) has a checked file but is
    // not itself a detected engine (claude-ai has no `AGENT_CONFIGS` row —
    // it never could be): `m` must read 1, never 2, for a Claude-Code-only
    // machine. The sentence this backs says "{engine list} is/are installed
    // here" — the SAME population `{m}` counts against — so counting
    // claude-ai here would make the number disagree with the noun next to
    // it (the defect this test exists to catch: a Claude-Code-only machine
    // rendered "Checked 1 config file across 2 engines" before the round 1
    // fix, and — round 1's own `HostKind::Agent` proxy would have
    // undercounted a Zed-only machine to 0, since the registry marks Zed
    // `HostKind::McpHost` despite it being one of `AGENT_CONFIGS`'s 11
    // engines. Population is `detected`, passed in directly, never derived
    // from `HostKind`.
    let dir = tempfile::tempdir().unwrap();
    // .claude.json is read by three MachineAbsolute rows: claude-code/User,
    // claude-code/Local and claude-ai/Global — one physical file, three
    // checked entries, only one of which (claude-code) is ever detectable.
    std::fs::write(dir.path().join(".claude.json"), "{}").unwrap();

    let result = discover::discover_machine(dir.path());
    let detected: std::collections::HashSet<String> = ["claude-code".to_string()].into_iter().collect();
    let coverage = discover::coverage(&result, &detected);
    assert_eq!(coverage.checked_file_count, 1, "one physical file");
    assert_eq!(
        coverage.checked_engine_count, 1,
        "claude-code only — claude-ai was never a candidate to begin with, detected or not"
    );
}

#[test]
fn checked_engine_count_counts_zed_when_zed_is_the_detected_engine() {
    // The case round 1's `HostKind::Agent` proxy got backwards: Zed is one
    // of `AGENT_CONFIGS`'s 11 engines (id "zed", literally the same string
    // as `registry::HOSTS`'s "zed" row — the two id spaces already agree,
    // no mapping needed), but the registry marks that HOSTS row
    // `HostKind::McpHost`. A machine where Zed is the only detected engine,
    // with its own MCP config file checked, must still read `m = 1` — the
    // population is "detected engine", not "HostKind::Agent".
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".config/zed")).unwrap();
    std::fs::write(dir.path().join(".config/zed/settings.json"), "{}").unwrap();

    let result = discover::discover_machine(dir.path());
    let detected: std::collections::HashSet<String> = ["zed".to_string()].into_iter().collect();
    let coverage = discover::coverage(&result, &detected);
    assert_eq!(coverage.checked_file_count, 1, "one physical file, Zed's own settings.json");
    assert_eq!(coverage.checked_engine_count, 1, "Zed is detected, so its own checked file must count");
}

#[test]
fn coverage_of_a_machine_with_nothing_present_checked_nothing() {
    let dir = tempfile::tempdir().unwrap();
    let result = discover::discover_machine(dir.path());
    let coverage = discover::coverage(&result, &std::collections::HashSet::new());
    assert_eq!(coverage.checked_file_count, 0);
    assert_eq!(coverage.checked_engine_count, 0);
    assert!(coverage.checked_files.is_empty());
}

#[test]
fn a_config_that_parses_clean_and_empty_is_still_checked() {
    // The exact shape `a_recognised_source_yielding_no_servers_warns_instead_
    // of_vanishing` above already covers for `problems` — this pins the same
    // fact for `checked`, which must not depend on `is_mcp_dedicated` the way
    // the `DeclaredNothing` problem does.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".claude")).unwrap();
    std::fs::write(dir.path().join(".claude/mcp.json"), "{}").unwrap();

    let result = discover::discover_machine(dir.path());
    assert_eq!(discover::coverage(&result, &std::collections::HashSet::new()).checked_file_count, 1);
}

#[test]
fn coverage_carries_every_problem_discovery_found() {
    // `McpCoverage` is the payload `get_mcp_coverage` hands the frontend, and
    // ProfilePane's Tools section renders Appendix A.3/A.4's rows from
    // whatever it finds on `mcpCoverage.problems`. `coverage()` was only
    // ever asked to fold `checked` into the two A.1 counts before this task;
    // `problems` must survive the same fold untouched, or the rows have
    // nothing to render from.
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join(".claude")).unwrap();
    // Unparseable: recognised path, broken JSON.
    std::fs::write(dir.path().join(".claude/mcp.json"), "{ \"mcpServers\": { \"a\": {").unwrap();

    let result = discover::discover_machine(dir.path());
    let coverage = discover::coverage(&result, &std::collections::HashSet::new());
    assert_eq!(
        coverage.problems.len(),
        result.problems.len(),
        "coverage() must carry every problem discover_machine found, not a subset"
    );
    assert!(
        coverage.problems.iter().any(|p| matches!(p.kind, ConfigProblemKind::Unparseable)
            && p.path.contains("mcp.json")
            && p.engine == "Claude Code"),
        "expected the unparseable .claude/mcp.json problem, with its engine resolved, got {:#?}",
        coverage.problems
    );
}

#[test]
fn codex_toml_reads_both_mcp_servers_and_the_legacy_tools_table() {
    // Current Codex writes [mcp_servers.*]. Hanger's own fixture -- and the
    // URL-credential sanitisation assertion attached to it -- uses [tools.*].
    // Supporting both is strictly additive and loses nothing.
    let body = r#"
[tools.git-reader]
command = "git"
url = "http://fake-user:fake-pass@localhost:9000/codex?secret=abc&token=my_token"

[tools.file-writer]
command = "fs"

[mcp_servers.modern]
command = "node"
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["file-writer", "git-reader", "modern"]);

    let git = servers.iter().find(|s| s.name == "git-reader").unwrap();
    assert_eq!(
        git.transport, "http://localhost:9000/codex",
        "userinfo and query string must be stripped"
    );
}

// ─── Arguments ───────────────────────────────────────────────────────────────

#[test]
fn args_are_captured_because_a_command_alone_cannot_start_a_server() {
    // ~/.claude.json declares spades-audio as `node <path>`. Storing only
    // "node" makes the Verify probe launch a bare Node REPL that never speaks
    // MCP -- the command is meaningless without its arguments.
    let body = r#"{"mcpServers": {"spades-audio": {
        "command": "node",
        "args": ["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"]
    }}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert_eq!(
        servers[0].args,
        vec!["/Applications/Spades Audio.app/Contents/Resources/mcp-server/dist/index.js"]
    );
}

#[test]
fn codex_toml_captures_args_from_both_spellings() {
    let body = r#"
[mcp_servers.computer-use]
command = "codex"
args = ["mcp"]

[tools.legacy]
command = "git"
args = ["--version", "--quiet"]
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    let modern = servers.iter().find(|s| s.name == "computer-use").unwrap();
    assert_eq!(modern.args, vec!["mcp"]);
    let legacy = servers.iter().find(|s| s.name == "legacy").unwrap();
    assert_eq!(legacy.args, vec!["--version", "--quiet"]);
}

#[test]
fn a_server_with_no_args_gets_an_empty_list_not_a_missing_field() {
    let body = r#"{"mcpServers": {"bare": {"command": "node"}}}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Global).unwrap();
    assert!(servers[0].args.is_empty());
}

// ─── Claude.ai connectors ────────────────────────────────────────────────────

#[test]
fn claude_ai_connectors_are_discovered_from_the_breadcrumb() {
    // Account-level connectors live on Anthropic's servers, not on disk, so
    // there is no config file to read. What IS on disk is the list of ones ever
    // connected. Ignoring it means Hanger claims to show every MCP server while
    // silently omitting seven of them.
    let body = r#"{
      "claudeAiMcpEverConnected": [
        "claude.ai Google Drive",
        "claude.ai mei-recipes",
        "claude.ai Notion"
      ],
      "mcpServers": {"local-one": {"command": "node"}}
    }"#;
    let servers = dialect::parse(body, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert_eq!(names(&servers), vec!["Google Drive", "Notion", "mei-recipes"]);
}

#[test]
fn a_connector_carries_no_command_because_there_is_nothing_local_to_run() {
    let body = r#"{"claudeAiMcpEverConnected": ["claude.ai Gmail"]}"#;
    let servers = dialect::parse(body, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert_eq!(servers[0].name, "Gmail");
    assert!(servers[0].command.is_empty());
    assert!(servers[0].args.is_empty());
    assert_eq!(
        servers[0].transport, "claude.ai",
        "transport must say where it actually lives"
    );
}

#[test]
fn a_file_with_no_connector_breadcrumb_yields_none() {
    let servers = dialect::parse(r#"{"mcpServers":{}}"#, Dialect::ClaudeAiConnectors, ScopeTier::Global).unwrap();
    assert!(servers.is_empty());
}

#[test]
fn the_registry_declares_claude_ai_as_a_host() {
    let host = registry::host_by_id("claude-ai").expect("claude-ai host");
    assert_eq!(host.kind, HostKind::McpHost);
    assert!(
        registry::SOURCES.iter().any(|s| s.dialect == Dialect::ClaudeAiConnectors),
        "no source reads the connector breadcrumb"
    );
}

// ─── Transports ──────────────────────────────────────────────────────────────

/// Every dialect must read a `url` declaration as a remote server, not skip it.
/// A server is a server whether it is spawned or dialled.
#[test]
fn http_servers_are_discovered_by_every_json_dialect() {
    let cases = [
        (Dialect::McpServers, r#"{"mcpServers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
        (Dialect::VsCodeServers, r#"{"servers":{"remote":{"type":"http","url":"https://api.example.com/mcp"}}}"#),
        (Dialect::ZedContextServers, r#"{"context_servers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
        (Dialect::ClaudeJson, r#"{"mcpServers":{"remote":{"url":"https://api.example.com/mcp"}}}"#),
    ];
    for (dialect, body) in cases {
        let servers = dialect::parse(body, dialect, ScopeTier::Global)
            .unwrap_or_else(|e| panic!("{:?} failed: {}", dialect, e));
        assert_eq!(servers.len(), 1, "{:?} found no remote server", dialect);
        assert_eq!(servers[0].transport, "https://api.example.com/mcp", "{:?}", dialect);
        assert!(servers[0].command.is_empty(), "{:?} invented a command", dialect);
    }
}

#[test]
fn codex_toml_discovers_http_servers_too() {
    let body = r#"
[mcp_servers.remote]
url = "https://api.example.com/mcp"

[mcp_servers.local]
command = "node"
args = ["server.js"]
"#;
    let servers = dialect::parse(body, Dialect::CodexToml, ScopeTier::Global).unwrap();
    let remote = servers.iter().find(|s| s.name == "remote").unwrap();
    let local = servers.iter().find(|s| s.name == "local").unwrap();
    assert_eq!(remote.transport, "https://api.example.com/mcp");
    assert_eq!(local.transport, "stdio");
    assert_eq!(local.args, vec!["server.js"]);
}

// ─── Windsurf is Devin Desktop ───────────────────────────────────────────────

#[test]
fn the_windsurf_host_is_named_devin_desktop_and_keeps_its_id() {
    use tauri_app_lib::mcp::registry::{HOSTS, SOURCES};

    let host = HOSTS
        .iter()
        .find(|h| h.id == "windsurf")
        .expect("the host id stays `windsurf` — it keys existing rows");
    assert_eq!(host.display_name, "Devin Desktop");

    let paths: Vec<&str> = SOURCES
        .iter()
        .filter(|s| s.host_id == "windsurf")
        .map(|s| s.path)
        .collect();

    // Legacy, not dead: Cascade still reads it.
    assert!(paths.contains(&".codeium/windsurf/mcp_config.json"));
    // Devin Local — the default agent — reads these.
    assert!(paths.contains(&".config/devin/config.json"));
    assert!(paths.contains(&".devin/config.json"));
    assert!(paths.contains(&".devin/mcp_config.json"));
}

#[test]
fn a_mixed_file_yields_both_transports_side_by_side() {
    // The real shape of a repo .mcp.json next to a machine config: stdio and
    // http servers coexist and both must be listed.
    let body = r#"{"mcpServers": {
        "mei-recipes": {"url": "https://mei-recipes-api.example.workers.dev/mcp"},
        "spades-audio": {"command": "node", "args": ["/Applications/x/index.js"]}
    }}"#;
    let servers = dialect::parse(body, Dialect::McpServers, ScopeTier::Project).unwrap();
    assert_eq!(names(&servers), vec!["mei-recipes", "spades-audio"]);
    let remote = servers.iter().find(|s| s.name == "mei-recipes").unwrap();
    assert!(remote.transport.starts_with("https://"));
    assert!(remote.command.is_empty(), "a remote server has nothing to spawn");
}

// ─── Config problems ─────────────────────────────────────────────────────────

use std::io::Write;

#[test]
fn an_unreadable_config_is_a_different_problem_from_an_unparseable_one() {
    // Collapsed into one Vec<String> until now. They have different fixes:
    // one is chmod, the other is an editor. A user told only "there was a
    // problem" has to guess which.
    let dir = tempfile::tempdir().expect("tempdir");

    let bad = dir.path().join("mcp.json");
    let mut f = std::fs::File::create(&bad).expect("create");
    writeln!(f, "{{ \"mcpServers\": {{ \"a\": {{ }}").expect("write");

    let result = discover::read_swept(&bad, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(result.problems.len(), 1);
    assert!(matches!(result.problems[0].kind, ConfigProblemKind::Unparseable));
    assert!(
        result.problems[0].line.is_some(),
        "an unparseable file without a location is a dead end"
    );

    let missing = dir.path().join("gone.json");
    let result = discover::read_swept(&missing, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(result.problems.len(), 1);
    assert!(matches!(result.problems[0].kind, ConfigProblemKind::Unreadable));
    assert!(result.problems[0].line.is_none());
}

#[test]
fn a_problem_s_detail_never_carries_the_raw_unsanitised_path() {
    // Appendix A.4's `{os error}` substitutes `detail` directly into a row
    // the user sees; `path` is already sanitised (the struct's own doc
    // comment), but `detail` comes straight from `io::Error`/the parser and
    // was never audited for the same thing. `io::Error::to_string()` for an
    // OS-level failure is exactly its strerror plus the OS code — Rust does
    // not embed the path unless the caller wraps it in, and neither call
    // site here does; `dialect::parse` is documented pure ("no filesystem,
    // no paths" — it never receives one to begin with). Proven against the
    // real tempdir path rather than asserted from memory of the stdlib.
    let dir = tempfile::tempdir().expect("tempdir");
    let raw_dir = dir.path().to_string_lossy().to_string();

    let missing = dir.path().join("gone.json");
    let unreadable = discover::read_swept(&missing, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(unreadable.problems.len(), 1);
    assert!(
        !unreadable.problems[0].detail.contains(&raw_dir),
        "Unreadable detail leaked the raw path: {:?}",
        unreadable.problems[0]
    );

    let bad = dir.path().join("bad.json");
    std::fs::write(&bad, "{ \"mcpServers\": { \"a\": { }").expect("write");
    let unparseable = discover::read_swept(&bad, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(unparseable.problems.len(), 1);
    assert!(
        !unparseable.problems[0].detail.contains(&raw_dir),
        "Unparseable detail leaked the raw path: {:?}",
        unparseable.problems[0]
    );
}

#[test]
fn a_well_formed_file_declaring_nothing_is_its_own_state() {
    let dir = tempfile::tempdir().expect("tempdir");
    let empty = dir.path().join("mcp.json");
    std::fs::write(&empty, "{}").expect("write");

    let result = discover::read_swept(&empty, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(result.problems.len(), 1);
    assert!(matches!(result.problems[0].kind, ConfigProblemKind::DeclaredNothing));
}

#[test]
fn a_line_number_survives_a_multi_line_block_comment() {
    // strip_jsonc rewrites the body before serde sees it. Its `//` branch keeps
    // the newline it consumes; its `/* */` branch did not, so every line number
    // after a multi-line comment came back short — pointing the user at the
    // wrong line of a file they then have to search by hand.
    //
    // The fixture: the comment opens on line 2 and closes on line 4, so it
    // CONTAINS two newlines (ending lines 2 and 3). The `*/` terminator does not
    // carry one, so the shift is two, not three. The syntax error — an unquoted
    // value — is on line 7. Before the fix serde reports 5; after it, 7.
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("mcp.json");
    std::fs::write(
        &path,
        "{\n  /* one\n     two\n     three */\n  \"mcpServers\": {\n    \"a\": {\n      \"command\": x\n    }\n  }\n}\n",
    )
    .expect("write");

    let result = discover::read_swept(&path, "claude-code", dialect::ScopeTier::Global);
    assert_eq!(result.problems.len(), 1);
    assert!(matches!(result.problems[0].kind, ConfigProblemKind::Unparseable));
    assert_eq!(
        result.problems[0].line,
        Some(7),
        "line number must point at the original file, not the stripped one"
    );
}

#[test]
fn a_format_we_choose_not_to_parse_reports_itself_rather_than_reading_as_empty() {
    // Zero servers and "we cannot read this file" look identical to a user.
    // The second is a fact about Hanger, and saying so is the difference
    // between an honest gap and an app that looks broken.
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("config.yaml");
    std::fs::write(&path, "mcpServers:\n  - name: x\n").expect("write");

    let result = discover::read_one_for_test(
        &path,
        dialect::Dialect::Unsupported,
        "continue",
        dialect::ScopeTier::Global,
    );
    assert!(result.registrations.is_empty());
    assert_eq!(result.problems.len(), 1);
    assert!(matches!(result.problems[0].kind, ConfigProblemKind::FormatUnread));
}

#[test]
fn a_config_problem_carries_the_host_s_display_name_not_a_bare_id() {
    // Appendix A.3's row is `{engine} · config format not yet supported` —
    // the view layer substitutes a data field, never a literal
    // (`no-hardcoded-engine-copy.test.ts`), so the display name has to be
    // resolved here, backend side, the same way `scanner.rs` already resolves
    // `registry::host_by_id(..).display_name` rather than handing a raw id
    // across IPC and making the frontend look it up itself.
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("config.yaml");
    std::fs::write(&path, "mcpServers:\n  - name: x\n").expect("write");

    let result = discover::read_one_for_test(
        &path,
        dialect::Dialect::Unsupported,
        "vscode",
        dialect::ScopeTier::Global,
    );
    assert_eq!(result.problems.len(), 1);
    assert_eq!(
        result.problems[0].engine, "VS Code",
        "expected the registry's own display_name for host_id \"vscode\", got {:?}",
        result.problems[0]
    );
}

#[test]
fn an_unregistered_host_id_falls_back_to_the_bare_id_rather_than_panicking() {
    // `read_swept`'s own doc comment: host_id is "" for an ad-hoc sweep file
    // the registry does not name. `registry::host_by_id("")` returns `None`;
    // the fallback must be graceful, not a panic or an empty string.
    let dir = tempfile::tempdir().expect("tempdir");
    let path = dir.path().join("mcp.json");
    // Missing entirely -- Unreadable, the simplest problem to trigger.
    let missing = dir.path().join("gone.json");
    let _ = std::fs::remove_file(&path);
    let result = discover::read_swept(&missing, "", dialect::ScopeTier::Global);
    assert_eq!(result.problems.len(), 1);
    assert_eq!(result.problems[0].engine, "", "the bare id, unresolved, is the honest fallback");
}

// ─── Fixture machines ────────────────────────────────────────────────────────
//
// Spec §4.7: proven against machines that are not this one. Assertions here
// are relationships the fixtures make true, not counts that happen to be true
// today — the registry gained seven hosts while this plan ran and will gain
// more.

#[test]
fn each_fixture_machine_reports_what_it_declares() {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");

    let claude_only = discover::discover_machine(&base.join("claude_only_home"));
    assert!(claude_only.problems.is_empty(), "{:?}", claude_only.problems);
    let names: Vec<&str> = claude_only.registrations.iter().map(|r| r.server.name.as_str()).collect();
    assert!(names.contains(&"memory") && names.contains(&"protected"), "{:?}", names);

    let jsonc = discover::discover_machine(&base.join("jsonc_home"));
    assert!(jsonc.problems.is_empty(), "JSONC must parse cleanly: {:?}", jsonc.problems);

    // Zed's nested command survived normalisation into a runnable launch.
    let spades = jsonc.registrations.iter().find(|r| r.server.name == "spades")
        .expect("Zed's server must be discovered");
    assert_eq!(spades.server.command, "node");
    assert_eq!(spades.server.env_keys, vec!["SPADES_TOKEN".to_string()]);

    // The bridged Zed entry and the direct VS Code entry are the same endpoint.
    // This is the cross-engine reading the whole feature exists for: without the
    // mcp-remote unwrap they are two unrelated servers.
    let linear: Vec<&str> = jsonc.registrations.iter()
        .filter(|r| r.server.name == "linear")
        .map(|r| r.server.transport.as_str()).collect();
    assert_eq!(linear.len(), 2, "both hosts must declare it: {:?}", linear);
    assert_eq!(linear[0], linear[1], "bridged and direct must agree: {:?}", linear);
    assert!(linear[0].starts_with("https://"), "{:?}", linear);

    let empty = discover::discover_machine(&base.join("empty_home"));
    assert!(empty.registrations.is_empty());
    assert!(empty.problems.is_empty(), "an empty machine is not a broken one: {:?}", empty.problems);
}

#[test]
fn no_fixture_credential_survives_into_a_displayable_launch() {
    let base = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    for machine in ["claude_only_home", "jsonc_home", "empty_home"] {
        let registrations = discover::discover_machine(&base.join(machine)).registrations;
        // A regression that made discovery return nothing would make this loop
        // iterate zero times and the test would report ok while proving the
        // opposite of what its name claims. claude_only_home and jsonc_home
        // both declare servers, so both must actually yield some; empty_home
        // legitimately has none and is exempt.
        if machine != "empty_home" {
            assert!(!registrations.is_empty(), "{} declares servers but discovery found none", machine);
        }
        for reg in registrations {
            let shown = tauri_app_lib::mcp::redact::redact_launch(&reg.server.command, &reg.server.args);
            for secret in ["REDACT_ME_1", "REDACT_ME_2", "REDACT_ME_3"] {
                assert!(!shown.contains(secret), "{} leaked in {}: {}", secret, machine, shown);
            }
        }
    }
}
