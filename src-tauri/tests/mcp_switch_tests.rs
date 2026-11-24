//! Switching an MCP server off and on: which engines Hanger may switch, and how.
//!
//! Plan: docs/plans/2026-11-24-context-control.md
//! Evidence for every row: docs/plans/2026-11-24-context-control-engine-matrix.md

use std::collections::HashSet;

use tauri_app_lib::mcp::registry::{self, ScopeTier, SwitchKind};

/// The kind a host is switched by at one tier, or `None` where it has no switch.
fn kind_at(host_id: &str, tier: ScopeTier) -> Option<SwitchKind> {
    registry::switch_for(host_id, tier).map(|row| row.kind)
}

/// A key written into the server's own declaration.
fn is_a_key_in_the_file(kind: SwitchKind) -> bool {
    matches!(kind, SwitchKind::EnabledKey | SwitchKind::DisabledKey)
}

#[test]
fn every_switch_row_names_a_host() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    for row in registry::SWITCHES {
        assert!(
            registry::host_by_id(row.host_id).is_some(),
            "switch row names {}, which is not in registry::HOSTS",
            row.host_id
        );
    }
}

#[test]
fn every_switch_row_says_what_confirmed_it() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    for row in registry::SWITCHES {
        // The text is prose that gets re-dated, so only its presence is
        // pinned: a row with no evidence is a guess about someone's config.
        assert!(
            !row.confirmed.trim().is_empty(),
            "the {} row does not say which engine version and date confirmed it",
            row.host_id
        );
    }
}

#[test]
fn switch_rows_are_unique_per_host_and_tier() {
    assert!(!registry::SWITCHES.is_empty(), "the switch table is empty, so the loop below checks nothing");
    let mut seen = HashSet::new();
    for row in registry::SWITCHES {
        assert!(!row.tiers.is_empty(), "the {} row covers no tier, so it switches nothing", row.host_id);
        for tier in row.tiers {
            assert!(
                seen.insert((row.host_id, *tier)),
                "{} at {:?} has two switch rows; switch_for could only ever return the first",
                row.host_id,
                tier
            );
        }
    }
}

#[test]
fn codex_is_switchable_at_both_scopes() {
    // `enabled = false` reads `disabled` in `codex mcp list` from the global
    // file and from a trusted project's file alike.
    assert_eq!(kind_at("codex", ScopeTier::Global), Some(SwitchKind::EnabledKey));
    assert_eq!(kind_at("codex", ScopeTier::Project), Some(SwitchKind::EnabledKey));
    // Codex declares servers at no other tier, so a switch there would have
    // no file to write.
    for tier in [ScopeTier::Local, ScopeTier::User] {
        assert!(
            registry::switch_for("codex", tier).is_none(),
            "codex has a switch at {:?}, a tier it declares no servers in",
            tier
        );
    }
}

#[test]
fn gemini_is_never_switched_by_a_key_in_the_file() {
    // Positive first: a table with no gemini row would pass the loop below
    // without looking at anything.
    assert_eq!(kind_at("gemini", ScopeTier::Global), Some(SwitchKind::GeminiEnablementFile));
    for row in registry::SWITCHES.iter().filter(|row| row.host_id == "gemini") {
        assert!(
            !is_a_key_in_the_file(row.kind),
            "gemini 0.56.0 rejects its whole settings file over an unrecognised key; got {:?}",
            row.kind
        );
    }
}

#[test]
fn claude_code_is_never_switched_by_a_key_in_the_file() {
    assert_eq!(kind_at("claude-code", ScopeTier::User), Some(SwitchKind::ClaudeCli));
    for row in registry::SWITCHES.iter().filter(|row| row.host_id == "claude-code") {
        assert!(
            !is_a_key_in_the_file(row.kind),
            "claude 2.1.331 ignores a flag in the file and starts the server anyway; got {:?}",
            row.kind
        );
    }
}

#[test]
fn a_host_with_no_row_is_read_only() {
    for host_id in ["cursor", "opencode"] {
        // The id has to be a real host, or `None` below is only a typo.
        assert!(registry::host_by_id(host_id).is_some(), "{} is not in registry::HOSTS", host_id);
        assert!(
            registry::switch_for(host_id, ScopeTier::Global).is_none(),
            "{} has a switch row, and nothing in the engine matrix confirms one",
            host_id
        );
    }
}

#[test]
fn gemini_project_servers_have_no_switch() {
    // The global switch exists, so `None` at Project is a fact about the tier
    // and not about a lookup that finds nothing.
    assert!(registry::switch_for("gemini", ScopeTier::Global).is_some());
    assert!(registry::switch_for("gemini", ScopeTier::Project).is_none());
}

#[test]
fn claude_code_is_switchable_at_user_scope_only() {
    assert!(registry::switch_for("claude-code", ScopeTier::User).is_some());
    for tier in [ScopeTier::Global, ScopeTier::Local, ScopeTier::Project] {
        assert!(
            registry::switch_for("claude-code", tier).is_none(),
            "claude-code has a switch at {:?}; only user scope is covered",
            tier
        );
    }
}

// ---------------------------------------------------------------------------
// Editing one flag: `mcp::switch::edit`. Strings in, strings out; nothing in
// this half of the file touches a real config, a path, or the filesystem.
//
// The enable and disable cases are ported from mcpick's
// `client-config.test.ts` and `codex-adapter.test.ts` (MIT, Copyright (c)
// 2026 Scott Spence), with one deliberate difference each of them now pins:
// mcpick rewrites the flag on every server in the file, and this editor
// touches the named one only.
// ---------------------------------------------------------------------------

use tauri_app_lib::mcp::registry::Dialect;
use tauri_app_lib::mcp::switch::edit::{self, EditError};

const CODEX: &str = include_str!("fixtures/mcp_switch/codex.toml");
const JSONC: &str = include_str!("fixtures/mcp_switch/servers.jsonc");
const BROKEN_TOML: &str = include_str!("fixtures/mcp_switch/broken.toml");
const BROKEN_JSONC: &str = include_str!("fixtures/mcp_switch/broken.jsonc");

/// Sits on the broken line of both malformed fixtures, and in the Gemini one.
/// An error that quotes its source line carries this.
const MARKER: &str = "marker-do-not-quote";

/// Every JSON dialect the editor handles, with the key its servers live under
/// (`dialect::parse` is where each is read).
const JSON_DIALECTS: [(Dialect, &str); 5] = [
    (Dialect::McpServers, "mcpServers"),
    (Dialect::VsCodeServers, "servers"),
    (Dialect::OpenCodeMcp, "mcp"),
    (Dialect::ZedContextServers, "context_servers"),
    (Dialect::AmpSettingsKey, "amp.mcpServers"),
];

/// The server names `mcp::dialect::parse`, the reader, finds in `body`.
fn read_names(body: &str, dialect: Dialect) -> Vec<String> {
    tauri_app_lib::mcp::dialect::parse(body, dialect, ScopeTier::Global)
        .unwrap_or_else(|e| panic!("the reader could not parse a {dialect:?} body: {e}"))
        .into_iter()
        .map(|server| server.name)
        .collect()
}

fn switch_off(body: &str, dialect: Dialect, kind: SwitchKind, name: &str) -> String {
    edit::set_enabled(body, dialect, kind, name, false)
        .unwrap_or_else(|e| panic!("switching {name} off failed: {e:?}"))
}

fn switch_on(body: &str, dialect: Dialect, kind: SwitchKind, name: &str) -> String {
    edit::set_enabled(body, dialect, kind, name, true)
        .unwrap_or_else(|e| panic!("switching {name} on failed: {e:?}"))
}

/// The lines only `after` has, and the lines only `before` has.
///
/// Split on `\n` and nothing else, so a changed line ending or a lost final
/// newline shows up as a changed line instead of vanishing the way it would
/// under `str::lines`.
fn line_diff(before: &str, after: &str) -> (Vec<String>, Vec<String>) {
    let a: Vec<&str> = before.split('\n').collect();
    let b: Vec<&str> = after.split('\n').collect();
    let mut common = vec![vec![0usize; b.len() + 1]; a.len() + 1];
    for i in (0..a.len()).rev() {
        for j in (0..b.len()).rev() {
            common[i][j] = if a[i] == b[j] {
                common[i + 1][j + 1] + 1
            } else {
                common[i + 1][j].max(common[i][j + 1])
            };
        }
    }
    let (mut i, mut j) = (0, 0);
    let (mut added, mut removed) = (Vec::new(), Vec::new());
    while i < a.len() && j < b.len() {
        if a[i] == b[j] {
            i += 1;
            j += 1;
        } else if common[i + 1][j] >= common[i][j + 1] {
            removed.push(a[i].to_string());
            i += 1;
        } else {
            added.push(b[j].to_string());
            j += 1;
        }
    }
    removed.extend(a[i..].iter().map(|line| line.to_string()));
    added.extend(b[j..].iter().map(|line| line.to_string()));
    (added, removed)
}

#[test]
fn the_line_diff_helper_sees_an_added_an_altered_and_a_re_ended_line() {
    // The two tests named after one changed line lean on this helper, so it
    // is shown here to report each kind of change it must not sleep through.
    assert_eq!(line_diff("a\nb\n", "a\nb\n"), (vec![], vec![]));
    assert_eq!(line_diff("a\nb\n", "a\nnew\nb\n"), (vec!["new".to_string()], vec![]));
    assert_eq!(line_diff("a\nb\n", "a\nB\n"), (vec!["B".to_string()], vec!["b".to_string()]));
    // A line ending that changed, and a final newline that went missing.
    assert_eq!(line_diff("a\r\nb\r\n", "a\nb\r\n"), (vec!["a".to_string()], vec!["a\r".to_string()]));
    assert_eq!(line_diff("a\nb\n", "a\nb"), (vec![], vec!["".to_string()]));
}

#[test]
fn only_the_flag_line_changes_in_toml() {
    // The fixture has to hold what the test says survives, or it proves nothing.
    assert!(CODEX.contains("# beta talks to example.com"), "the fixture lost its comment");
    assert!(CODEX.contains("command = \"echo\" # the launcher"), "the fixture lost its trailing comment");
    assert!(CODEX.contains("\n\n"), "the fixture lost its blank lines");
    assert!(CODEX.contains("env = { GREETING = \"fixture-value\" }"), "the fixture lost its inline table");

    let after = switch_off(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "beta");

    let (added, removed) = line_diff(CODEX, &after);
    assert_eq!(added, vec!["enabled = false".to_string()], "exactly one line is added");
    assert!(removed.is_empty(), "no line is removed or altered: {removed:?}");
    // And where: under the last key of beta's own table, above the blank line
    // that separates it from the next server.
    let last_key = "env = { GREETING = \"fixture-value\" }\n";
    assert_eq!(after, CODEX.replacen(last_key, &format!("{last_key}enabled = false\n"), 1));
    assert_eq!(
        edit::read_flag(&after, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"),
        Ok(Some(false))
    );
}

/// "One line" for JSON, exactly: the entry gains one new line that holds the
/// flag and its own comma, and that line goes first in the entry. Going first
/// is what makes it one line: a key added last needs a comma put on the line
/// above it unless that line already ends in one. So a line diff shows one
/// line added and none removed or altered, whether or not the file uses
/// trailing commas.
#[test]
fn only_the_flag_line_changes_in_jsonc() {
    assert!(JSONC.contains("    // An engine's settings."), "the fixture lost its line comment");
    assert!(JSONC.contains("/* beta talks to example.com */"), "the fixture lost its block comment");
    assert!(JSONC.contains("\"command\": \"echo\", // the launcher"), "the fixture lost its trailing comment");
    assert!(JSONC.contains("\"env\": { \"GREETING\": \"fixture-value\" },\n        },"), "the fixture lost its trailing commas");
    assert!(JSONC.contains("\n            \"command\""), "the fixture lost its four-space indent");

    // beta ends in a trailing comma and zebra does not; both get one line.
    for name in ["beta", "zebra"] {
        let after = switch_off(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, name);

        let (added, removed) = line_diff(JSONC, &after);
        assert_eq!(added, vec!["            \"disabled\": true,".to_string()], "{name}: exactly one line is added");
        assert!(removed.is_empty(), "{name}: no line is removed or altered: {removed:?}");
        let opening = format!("        \"{name}\": {{\n");
        assert_eq!(
            after,
            JSONC.replacen(&opening, &format!("{opening}            \"disabled\": true,\n"), 1),
            "{name}: the new line is the first line of its own entry"
        );
        assert_eq!(
            edit::read_flag(&after, Dialect::McpServers, SwitchKind::DisabledKey, name),
            Ok(Some(false))
        );
    }
}

#[test]
fn key_order_survives() {
    // zebra is declared before alpha in both fixtures. A writer that goes
    // through a map sorts them, which is how a config comes back reordered.
    let toml = switch_off(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "beta");
    let places: Vec<usize> = ["[mcp_servers.zebra]", "[mcp_servers.beta]", "[mcp_servers.alpha]", "[tools.legacy]"]
        .iter()
        .map(|header| toml.find(header).unwrap_or_else(|| panic!("{header} is gone")))
        .collect();
    assert!(places.windows(2).all(|pair| pair[0] < pair[1]), "tables were reordered: {places:?}");
    // Keys inside the switched table keep their order too.
    let keys: Vec<usize> = ["command = \"echo\" # the launcher", "args = [\"hi\"", "env = {", "enabled = false"]
        .iter()
        .map(|key| toml.find(key).unwrap_or_else(|| panic!("{key} is gone")))
        .collect();
    assert!(keys.windows(2).all(|pair| pair[0] < pair[1]), "beta's keys were reordered: {keys:?}");

    let json = switch_off(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "beta");
    let places: Vec<usize> = ["\"theme\"", "\"mcpServers\"", "\"zebra\"", "\"beta\"", "\"alpha\""]
        .iter()
        .map(|key| json.find(key).unwrap_or_else(|| panic!("{key} is gone")))
        .collect();
    assert!(places.windows(2).all(|pair| pair[0] < pair[1]), "keys were reordered: {places:?}");
}

#[test]
fn an_unknown_server_is_not_found() {
    // "beta" is found in both fixtures, so NotFound below is about the name.
    assert_eq!(edit::read_flag(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), Ok(None));
    assert_eq!(edit::read_flag(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "beta"), Ok(None));

    // A name nobody declared, and a name that differs only in case.
    for name in ["nope", "Beta"] {
        for enabled in [false, true] {
            assert_eq!(
                edit::set_enabled(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, name, enabled),
                Err(EditError::NotFound)
            );
            assert_eq!(
                edit::set_enabled(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, name, enabled),
                Err(EditError::NotFound)
            );
        }
        assert_eq!(edit::read_flag(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, name), Err(EditError::NotFound));
        assert_eq!(edit::read_flag(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, name), Err(EditError::NotFound));
    }

    // A well-formed file with no server map at all.
    assert_eq!(
        edit::set_enabled("model = \"fixture-model\"\n", Dialect::CodexToml, SwitchKind::EnabledKey, "beta", false),
        Err(EditError::NotFound)
    );
    assert_eq!(
        edit::set_enabled("{ \"theme\": \"fixture-theme\" }\n", Dialect::McpServers, SwitchKind::DisabledKey, "beta", false),
        Err(EditError::NotFound)
    );
    // A name whose value is not a table or an object declares no server.
    assert_eq!(
        edit::set_enabled("[mcp_servers]\nbeta = true\n", Dialect::CodexToml, SwitchKind::EnabledKey, "beta", false),
        Err(EditError::NotFound)
    );
    assert_eq!(
        edit::set_enabled("{ \"mcpServers\": { \"beta\": true } }\n", Dialect::McpServers, SwitchKind::DisabledKey, "beta", false),
        Err(EditError::NotFound)
    );
}

#[test]
fn a_malformed_file_is_unparseable_and_returns_no_text() {
    // The broken line of each fixture, 1-indexed, where the marker also sits.
    let cases = [
        (BROKEN_TOML, Dialect::CodexToml, SwitchKind::EnabledKey, 6),
        (BROKEN_JSONC, Dialect::McpServers, SwitchKind::DisabledKey, 4),
    ];
    for (body, dialect, kind, broken_line) in cases {
        let marked = body.split('\n').nth(broken_line - 1).unwrap_or("");
        assert!(marked.contains(MARKER), "the marker is not on line {broken_line} of the fixture: {marked:?}");

        let results = [
            edit::set_enabled(body, dialect, kind, "alpha", false).map(|_| ()),
            edit::set_enabled(body, dialect, kind, "alpha", true).map(|_| ()),
            edit::read_flag(body, dialect, kind, "alpha").map(|_| ()),
        ];
        for result in results {
            let Err(EditError::Unparseable(locator)) = &result else {
                panic!("a malformed {dialect:?} file must be Unparseable, got {result:?}");
            };
            // The whole string is a line and a column: asserting its exact
            // shape is what proves nothing from the file rode along with it.
            let column = locator
                .strip_prefix(&format!("line {broken_line}, column "))
                .unwrap_or_else(|| panic!("the locator does not point at line {broken_line}: {locator:?}"));
            assert!(column.parse::<usize>().is_ok(), "the locator carries more than a line and a column: {locator:?}");
            assert!(!format!("{result:?}").contains(MARKER), "the error quotes the file: {result:?}");
        }
    }

    // A column counts characters. The stray word below starts at the 15th
    // character of its line and the 16th byte, because of the accent.
    let accented = "[mcp_servers.alpha]\nname = \"caf\u{e9}\" stray\n";
    assert_eq!(
        edit::read_flag(accented, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"),
        Err(EditError::Unparseable("line 2, column 15".to_string()))
    );
}

#[test]
fn read_flag_reads_both_spellings() {
    let toml = "[mcp_servers.enabled_off]\ncommand = \"echo\"\nenabled = false\n\n\
                [mcp_servers.disabled_on]\ncommand = \"echo\"\ndisabled = true\n\n\
                [mcp_servers.neither]\ncommand = \"echo\"\n\n\
                [mcp_servers.enabled_on]\ncommand = \"echo\"\nenabled = true\n\n\
                [mcp_servers.disabled_off]\ncommand = \"echo\"\ndisabled = false\n";
    let json = r#"{ "mcpServers": {
        "enabled_off": { "command": "echo", "enabled": false },
        "disabled_on": { "command": "echo", "disabled": true },
        "neither": { "command": "echo" },
        "enabled_on": { "command": "echo", "enabled": true },
        "disabled_off": { "command": "echo", "disabled": false }
    } }"#;
    let expected = [
        ("enabled_off", Some(false)),
        ("disabled_on", Some(false)),
        ("neither", None),
        ("enabled_on", Some(true)),
        ("disabled_off", Some(true)),
    ];
    // Either spelling is read whichever key the engine is switched by.
    for kind in [SwitchKind::EnabledKey, SwitchKind::DisabledKey] {
        for (name, flag) in expected {
            assert_eq!(edit::read_flag(toml, Dialect::CodexToml, kind, name), Ok(flag), "toml {name} under {kind:?}");
            assert_eq!(edit::read_flag(json, Dialect::McpServers, kind, name), Ok(flag), "json {name} under {kind:?}");
        }
    }
}

#[test]
fn when_both_keys_disagree_the_one_the_engine_is_switched_by_is_read() {
    let toml = "[mcp_servers.beta]\ncommand = \"echo\"\nenabled = true\ndisabled = true\n";
    let json = r#"{ "mcpServers": { "beta": { "enabled": true, "disabled": true } } }"#;
    assert_eq!(edit::read_flag(toml, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), Ok(Some(true)));
    assert_eq!(edit::read_flag(toml, Dialect::CodexToml, SwitchKind::DisabledKey, "beta"), Ok(Some(false)));
    assert_eq!(edit::read_flag(json, Dialect::McpServers, SwitchKind::EnabledKey, "beta"), Ok(Some(true)));
    assert_eq!(edit::read_flag(json, Dialect::McpServers, SwitchKind::DisabledKey, "beta"), Ok(Some(false)));
}

#[test]
fn the_other_servers_are_untouched() {
    // mcpick's writeEnabled sets the flag on every server in the file: one
    // switch there leaves `enabled = true` on each server it was not asked
    // about. Here the neighbours must come back exactly as they were.
    let toml = "[mcp_servers.one]\ncommand = \"echo\"\n\n\
                [mcp_servers.two]\ncommand = \"echo\"\n\n\
                [mcp_servers.three]\ncommand = \"echo\"\nenabled = false\n";
    let after = switch_off(toml, Dialect::CodexToml, SwitchKind::EnabledKey, "one");
    assert_eq!(
        after,
        "[mcp_servers.one]\ncommand = \"echo\"\nenabled = false\n\n\
         [mcp_servers.two]\ncommand = \"echo\"\n\n\
         [mcp_servers.three]\ncommand = \"echo\"\nenabled = false\n"
    );
    assert_eq!(edit::read_flag(&after, Dialect::CodexToml, SwitchKind::EnabledKey, "two"), Ok(None));
    assert_eq!(edit::read_flag(&after, Dialect::CodexToml, SwitchKind::EnabledKey, "three"), Ok(Some(false)));

    let json = "{\n  \"servers\": {\n    \"one\": {\n      \"command\": \"echo\"\n    },\n    \
                \"two\": {\n      \"command\": \"echo\"\n    },\n    \
                \"three\": {\n      \"command\": \"echo\",\n      \"disabled\": true\n    }\n  }\n}\n";
    let after = switch_off(json, Dialect::VsCodeServers, SwitchKind::DisabledKey, "one");
    assert_eq!(
        after,
        json.replacen("\"one\": {\n", "\"one\": {\n      \"disabled\": true,\n", 1),
        "one line in one entry, and nothing on the other two"
    );
    assert_eq!(edit::read_flag(&after, Dialect::VsCodeServers, SwitchKind::DisabledKey, "two"), Ok(None));
    assert_eq!(edit::read_flag(&after, Dialect::VsCodeServers, SwitchKind::DisabledKey, "three"), Ok(Some(false)));

    // Switching one back on leaves a neighbour that is off still off.
    let back = switch_on(&after, Dialect::VsCodeServers, SwitchKind::DisabledKey, "one");
    assert_eq!(edit::read_flag(&back, Dialect::VsCodeServers, SwitchKind::DisabledKey, "one"), Ok(Some(true)));
    assert_eq!(edit::read_flag(&back, Dialect::VsCodeServers, SwitchKind::DisabledKey, "two"), Ok(None));
    assert_eq!(edit::read_flag(&back, Dialect::VsCodeServers, SwitchKind::DisabledKey, "three"), Ok(Some(false)));
}

// --- Ported from mcpick. Each names the case it came from. -----------------

/// mcpick `client-config.test.ts`: "toggles JSON client servers with disabled
/// flags" and "sets enabled servers through the shared adapter service". Same
/// compact `.vscode/mcp.json` body. mcpick expects `disabled` on both servers
/// afterwards; here only the server that was switched carries one.
#[test]
fn a_json_server_is_switched_off_with_a_disabled_flag() {
    let body = r#"{"servers":{"memory":{"command":"npx","args":["memory"]},"filesystem":{"command":"npx","args":["filesystem"]}}}"#;

    let after = switch_off(body, Dialect::VsCodeServers, SwitchKind::DisabledKey, "filesystem");
    assert_eq!(
        after,
        r#"{"servers":{"memory":{"command":"npx","args":["memory"]},"filesystem":{"disabled": true,"command":"npx","args":["filesystem"]}}}"#
    );
    assert_eq!(edit::read_flag(&after, Dialect::VsCodeServers, SwitchKind::DisabledKey, "filesystem"), Ok(Some(false)));
    assert_eq!(edit::read_flag(&after, Dialect::VsCodeServers, SwitchKind::DisabledKey, "memory"), Ok(None));

    // The other half of the mcpick case: memory off, filesystem left alone.
    let after = switch_off(body, Dialect::VsCodeServers, SwitchKind::DisabledKey, "memory");
    assert_eq!(
        after,
        r#"{"servers":{"memory":{"disabled": true,"command":"npx","args":["memory"]},"filesystem":{"command":"npx","args":["filesystem"]}}}"#
    );
}

/// mcpick `client-config.test.ts`: "toggles OpenCode servers with enabled
/// flags". OpenCode's `mcp` map, `enabled` as the key, and no `disabled` key
/// written beside it.
#[test]
fn an_opencode_server_is_switched_off_with_an_enabled_flag() {
    let body = r#"{"mcp":{"everything":{"command":["npx","everything"]},"sentry":{"type":"remote","url":"https://mcp.example"}}}"#;

    let after = switch_off(body, Dialect::OpenCodeMcp, SwitchKind::EnabledKey, "everything");
    assert_eq!(
        after,
        r#"{"mcp":{"everything":{"enabled": false,"command":["npx","everything"]},"sentry":{"type":"remote","url":"https://mcp.example"}}}"#
    );
    assert!(!after.contains("disabled"), "an enabled-key engine is never given a disabled key");
    assert_eq!(edit::read_flag(&after, Dialect::OpenCodeMcp, SwitchKind::EnabledKey, "everything"), Ok(Some(false)));
    // mcpick writes `enabled: true` on sentry here. This editor does not.
    assert_eq!(edit::read_flag(&after, Dialect::OpenCodeMcp, SwitchKind::EnabledKey, "sentry"), Ok(None));
}

/// mcpick `client-config.test.ts`: "writes, disables, and removes servers
/// round-trip", its disable step. A Claude Desktop shaped file; off writes
/// `disabled: true`, and on, now that the key is there, sets it to false.
#[test]
fn a_server_switched_off_and_on_again_ends_with_its_flag_saying_on() {
    let body = "{\n  \"mcpServers\": {\n    \"memory\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"server-memory@1.2.3\"]\n    },\n    \
                \"remote\": {\n      \"type\": \"http\",\n      \"url\": \"https://mcp.example\"\n    }\n  }\n}\n";

    let off = switch_off(body, Dialect::McpServers, SwitchKind::DisabledKey, "memory");
    assert_eq!(off, body.replacen("\"memory\": {\n", "\"memory\": {\n      \"disabled\": true,\n", 1));

    let on = switch_on(&off, Dialect::McpServers, SwitchKind::DisabledKey, "memory");
    assert_eq!(on, body.replacen("\"memory\": {\n", "\"memory\": {\n      \"disabled\": false,\n", 1));
    assert_eq!(edit::read_flag(&on, Dialect::McpServers, SwitchKind::DisabledKey, "memory"), Ok(Some(true)));
    assert_eq!(edit::read_flag(&on, Dialect::McpServers, SwitchKind::DisabledKey, "remote"), Ok(None));
}

/// mcpick `client-config.ts` → `set_server_enabled`, the `'enabled' in config`
/// branch: an entry that already carries `enabled` keeps that key and has it
/// set, even for an engine switched by `disabled`.
#[test]
fn an_entry_that_already_says_enabled_keeps_that_key() {
    let body = r#"{"servers":{"memory":{"command":"npx","enabled":true}}}"#;

    let off = switch_off(body, Dialect::VsCodeServers, SwitchKind::DisabledKey, "memory");
    assert_eq!(off, r#"{"servers":{"memory":{"command":"npx","enabled":false}}}"#);

    let toml = "[mcp_servers.memory]\ncommand = \"npx\"\nenabled = true\n";
    let off = switch_off(toml, Dialect::CodexToml, SwitchKind::DisabledKey, "memory");
    assert_eq!(off, "[mcp_servers.memory]\ncommand = \"npx\"\nenabled = false\n");
}

/// mcpick `client-config.ts` → `set_server_enabled` (`delete config.disabled`)
/// and `codex-adapter.ts` → `writeEnabled` (`delete config.disabled`): once
/// `enabled` is the key being written, a leftover `disabled` goes.
#[test]
fn a_stale_disabled_key_is_removed_when_enabled_is_written() {
    let toml = "[mcp_servers.one]\ncommand = \"npx\"\ndisabled = true\n\n[mcp_servers.two]\ncommand = \"node\"\n";
    let off = switch_off(toml, Dialect::CodexToml, SwitchKind::EnabledKey, "one");
    assert_eq!(off, "[mcp_servers.one]\ncommand = \"npx\"\nenabled = false\n\n[mcp_servers.two]\ncommand = \"node\"\n");
    // On, from the same starting point: the stale key said off, so on has to
    // write something or the server would still read as off.
    let on = switch_on(toml, Dialect::CodexToml, SwitchKind::EnabledKey, "one");
    assert_eq!(on, "[mcp_servers.one]\ncommand = \"npx\"\nenabled = true\n\n[mcp_servers.two]\ncommand = \"node\"\n");
    assert_eq!(edit::read_flag(&on, Dialect::CodexToml, SwitchKind::EnabledKey, "one"), Ok(Some(true)));

    let json = r#"{"mcp":{"one":{"command":["npx"],"disabled":true},"two":{"command":["node"]}}}"#;
    let off = switch_off(json, Dialect::OpenCodeMcp, SwitchKind::EnabledKey, "one");
    assert_eq!(off, r#"{"mcp":{"one":{"enabled": false,"command":["npx"]},"two":{"command":["node"]}}}"#);

    // Both keys present: `enabled` is set and `disabled` goes.
    let both = r#"{"mcp":{"one":{"command":["npx"],"enabled":true,"disabled":true}}}"#;
    let off = switch_off(both, Dialect::OpenCodeMcp, SwitchKind::EnabledKey, "one");
    assert_eq!(off, r#"{"mcp":{"one":{"command":["npx"],"enabled":false}}}"#);
}

/// mcpick `codex-adapter.test.ts`: "writes native enabled keys". Two servers,
/// one switched off. mcpick leaves `enabled = true` on `one`; here `one` has
/// no key at all afterwards.
#[test]
fn a_codex_server_is_switched_off_with_a_native_enabled_key() {
    let body = "[mcp_servers.one]\ncommand = \"npx\"\n\n[mcp_servers.two]\ncommand = \"node\"\n";

    let after = switch_off(body, Dialect::CodexToml, SwitchKind::EnabledKey, "two");
    assert_eq!(after, "[mcp_servers.one]\ncommand = \"npx\"\n\n[mcp_servers.two]\ncommand = \"node\"\nenabled = false\n");
    assert_eq!(edit::read_flag(&after, Dialect::CodexToml, SwitchKind::EnabledKey, "two"), Ok(Some(false)));
    assert_eq!(edit::read_flag(&after, Dialect::CodexToml, SwitchKind::EnabledKey, "one"), Ok(None));
}

/// mcpick `codex-adapter.test.ts`: "maps enabled = false to disabled". The
/// same three-line body.
#[test]
fn a_codex_server_with_enabled_false_reads_as_off() {
    let body = "[mcp_servers.off]\ncommand = \"npx\"\nenabled = false\n";
    assert_eq!(edit::read_flag(body, Dialect::CodexToml, SwitchKind::EnabledKey, "off"), Ok(Some(false)));
}

// --- Round trips and no-ops -------------------------------------------------

#[test]
fn off_then_on_of_a_flag_that_was_already_there_returns_the_original_bytes() {
    // alpha carries `enabled = true # left on by hand` in the TOML fixture and
    // `"disabled": false // left on by hand` in the JSONC one.
    let off = switch_off(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha");
    let (added, removed) = line_diff(CODEX, &off);
    assert_eq!(added, vec!["enabled = false # left on by hand".to_string()]);
    assert_eq!(removed, vec!["enabled = true # left on by hand".to_string()]);
    assert_eq!(switch_on(&off, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), CODEX);

    let off = switch_off(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "alpha");
    let (added, removed) = line_diff(JSONC, &off);
    assert_eq!(added, vec!["            \"disabled\": true // left on by hand".to_string()]);
    assert_eq!(removed, vec!["            \"disabled\": false // left on by hand".to_string()]);
    assert_eq!(switch_on(&off, Dialect::McpServers, SwitchKind::DisabledKey, "alpha"), JSONC);
}

#[test]
fn switching_on_a_server_with_no_flag_returns_the_file_untouched() {
    assert_eq!(switch_on(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), CODEX);
    assert_eq!(switch_on(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "beta"), JSONC);
    assert_eq!(switch_on(JSONC, Dialect::McpServers, SwitchKind::EnabledKey, "beta"), JSONC);

    // And a flag that already says what was asked for is left as written.
    assert_eq!(switch_on(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), CODEX);
    assert_eq!(switch_on(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "alpha"), JSONC);
    let off = "[mcp_servers.beta]\ncommand = \"echo\"\nenabled   =   false   # odd spacing\n";
    assert_eq!(switch_off(off, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), off);
}

// --- Dialects ---------------------------------------------------------------

#[test]
fn every_json_dialect_is_switched_under_its_own_server_map() {
    for (dialect, map_key) in JSON_DIALECTS {
        let body = format!("{{\n  \"{map_key}\": {{\n    \"beta\": {{\n      \"command\": \"echo\"\n    }}\n  }}\n}}\n");

        let after = switch_off(&body, dialect, SwitchKind::EnabledKey, "beta");
        assert_eq!(
            after,
            body.replacen("\"beta\": {\n", "\"beta\": {\n      \"enabled\": false,\n", 1),
            "{dialect:?} did not switch the server under {map_key}"
        );
        assert_eq!(edit::read_flag(&after, dialect, SwitchKind::EnabledKey, "beta"), Ok(Some(false)));
        // The reader finds the server in the same place. `edit` keeps its own
        // list of map keys beside `dialect::parse`'s, and this is what would
        // go red if the two drifted apart.
        assert_eq!(read_names(&body, dialect), vec!["beta".to_string()], "{dialect:?} is read from somewhere else");

        // The same file read as any other dialect has no such server: the map
        // key is what decides, and no dialect falls back to another's.
        for (other, _) in JSON_DIALECTS.iter().filter(|(other, _)| *other != dialect) {
            assert_eq!(
                edit::set_enabled(&body, *other, SwitchKind::EnabledKey, "beta", false),
                Err(EditError::NotFound),
                "{other:?} found a server under {map_key}"
            );
            assert!(read_names(&body, *other).is_empty(), "{other:?} reads a server from {map_key}");
        }
    }

    // And Codex: the reader lists every server the TOML fixture declares, and
    // the editor switches the ones under `mcp_servers`.
    let mut listed = read_names(CODEX, Dialect::CodexToml);
    listed.sort();
    assert_eq!(listed, vec!["alpha", "beta", "legacy", "zebra"]);
    for name in ["alpha", "beta", "zebra"] {
        assert!(edit::read_flag(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, name).is_ok(), "{name}");
    }

    // Amp's key is one literal key with a dot in it, never a nested path.
    let nested = "{ \"amp\": { \"mcpServers\": { \"beta\": { \"command\": \"echo\" } } } }";
    assert_eq!(
        edit::set_enabled(nested, Dialect::AmpSettingsKey, SwitchKind::EnabledKey, "beta", false),
        Err(EditError::NotFound)
    );
}

#[test]
fn the_editor_parses_what_the_reader_parses_and_nothing_looser() {
    // `edit` and `dialect::parse` use different parsers on the same files.
    // Comments and trailing commas get through both; the looser JSON5-style
    // forms jsonc-parser allows by default get through neither.
    let mut listed = read_names(JSONC, Dialect::McpServers);
    listed.sort();
    assert_eq!(listed, vec!["alpha", "beta", "zebra"], "the reader no longer reads the JSONC fixture");
    assert_eq!(edit::read_flag(JSONC, Dialect::McpServers, SwitchKind::DisabledKey, "beta"), Ok(None));

    let looser = [
        "{ 'mcpServers': { 'beta': { 'command': 'echo' } } }",
        "{ mcpServers: { beta: { command: \"echo\" } } }",
        "{ \"mcpServers\": { \"beta\": { \"command\": \"echo\" \"args\": [] } } }",
        "{ \"mcpServers\": { \"beta\": { \"command\": \"echo\", \"port\": 0x1F } } }",
    ];
    for body in looser {
        assert!(
            tauri_app_lib::mcp::dialect::parse(body, Dialect::McpServers, ScopeTier::Global).is_err(),
            "the reader accepts {body}"
        );
        assert!(
            matches!(
                edit::read_flag(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta"),
                Err(EditError::Unparseable(_))
            ),
            "the editor accepts a file the reader refuses: {body}"
        );
        assert!(
            matches!(
                edit::set_enabled(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta", false),
                Err(EditError::Unparseable(_))
            ),
            "the editor would write to a file the reader refuses: {body}"
        );
    }
}

#[test]
fn what_hanger_does_not_switch_by_a_flag_is_unsupported() {
    // Each of these would find "beta" if it tried, so the refusal is about
    // the dialect or the kind and not about a lookup that came back empty.
    for dialect in [Dialect::ClaudeJson, Dialect::ClaudeAiConnectors, Dialect::Unsupported] {
        assert_eq!(
            edit::set_enabled(JSONC, dialect, SwitchKind::DisabledKey, "beta", false),
            Err(EditError::UnsupportedDialect),
            "{dialect:?}"
        );
        assert_eq!(
            edit::read_flag(JSONC, dialect, SwitchKind::DisabledKey, "beta"),
            Err(EditError::UnsupportedDialect),
            "{dialect:?}"
        );
    }
    // Claude Code and Gemini CLI are not switched by a key in the declaration.
    for kind in [SwitchKind::ClaudeCli, SwitchKind::GeminiEnablementFile] {
        for (body, dialect) in [(CODEX, Dialect::CodexToml), (JSONC, Dialect::McpServers)] {
            assert_eq!(edit::set_enabled(body, dialect, kind, "beta", false), Err(EditError::UnsupportedDialect), "{kind:?}");
            assert_eq!(edit::read_flag(body, dialect, kind, "beta"), Err(EditError::UnsupportedDialect), "{kind:?}");
        }
    }
}

#[test]
fn a_codex_server_under_the_legacy_tools_table_is_unsupported() {
    // `dialect::parse` still reads `[tools.*]`, so the server is listed; the
    // engine matrix confirmed `enabled` under `[mcp_servers.*]` only.
    assert!(CODEX.contains("[tools.legacy]"));
    assert_eq!(
        edit::set_enabled(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "legacy", false),
        Err(EditError::UnsupportedDialect)
    );
    assert_eq!(
        edit::read_flag(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "legacy"),
        Err(EditError::UnsupportedDialect)
    );
    // A plain key under `[tools]` is not a server in either spelling.
    assert_eq!(
        edit::set_enabled("[tools]\nweb_search = true\n", Dialect::CodexToml, SwitchKind::EnabledKey, "web_search", false),
        Err(EditError::NotFound)
    );
}

#[test]
fn a_codex_server_written_as_an_inline_table_is_switched_on_its_own_line() {
    let body = "[mcp_servers]\nalpha = { command = \"x\" }\nbeta = { command = \"y\", args = [\"a\"] } # tail\n";

    let off = switch_off(body, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha");
    assert_eq!(off, "[mcp_servers]\nalpha = { command = \"x\", enabled = false }\nbeta = { command = \"y\", args = [\"a\"] } # tail\n");
    assert_eq!(edit::read_flag(&off, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), Ok(Some(false)));

    let off = switch_off(body, Dialect::CodexToml, SwitchKind::EnabledKey, "beta");
    assert_eq!(off, "[mcp_servers]\nalpha = { command = \"x\" }\nbeta = { command = \"y\", args = [\"a\"], enabled = false } # tail\n");
    let on = switch_on(&off, Dialect::CodexToml, SwitchKind::EnabledKey, "beta");
    assert_eq!(on, "[mcp_servers]\nalpha = { command = \"x\" }\nbeta = { command = \"y\", args = [\"a\"], enabled = true } # tail\n");
}

#[test]
fn a_codex_server_written_with_dotted_keys_gets_a_dotted_flag() {
    let body = "[mcp_servers]\nalpha.command = \"x\"\nalpha.args = [\"a\"]\nbeta.command = \"y\"\n";
    let off = switch_off(body, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha");
    assert_eq!(off, "[mcp_servers]\nalpha.command = \"x\"\nalpha.args = [\"a\"]\nalpha.enabled = false\nbeta.command = \"y\"\n");
}

// --- Layouts the two editors do not keep on their own ----------------------

#[test]
fn a_json_entry_written_on_one_line_stays_on_one_line() {
    let body = "{\n    \"mcpServers\": {\n        \"alpha\": { \"command\": \"a\" },\n        \
                \"beta\": { \"command\": \"echo\", \"args\": [\"hi\"] },\n        \"empty\": {}\n    }\n}\n";

    let after = switch_off(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta");
    let (added, removed) = line_diff(body, &after);
    assert_eq!(added, vec!["        \"beta\": { \"disabled\": true, \"command\": \"echo\", \"args\": [\"hi\"] },".to_string()]);
    assert_eq!(removed, vec!["        \"beta\": { \"command\": \"echo\", \"args\": [\"hi\"] },".to_string()]);

    let after = switch_off(body, Dialect::McpServers, SwitchKind::DisabledKey, "empty");
    let (added, removed) = line_diff(body, &after);
    assert_eq!(added, vec!["        \"empty\": {\"disabled\": true}".to_string()]);
    assert_eq!(removed, vec!["        \"empty\": {}".to_string()]);
}

#[test]
fn a_comment_beside_an_open_brace_stays_beside_it() {
    // A key put first would land between the brace and its comment and carry
    // the comment off onto the new line. Here the key goes last instead, which
    // costs a comma on the line above and leaves the comment where it was.
    let body = "{\n    \"mcpServers\": {\n        \"beta\": { // about beta\n            \"command\": \"echo\",\n            \"args\": [\"hi\"]\n        }\n    }\n}\n";
    let after = switch_off(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta");
    assert_eq!(
        after,
        "{\n    \"mcpServers\": {\n        \"beta\": { // about beta\n            \"command\": \"echo\",\n            \"args\": [\"hi\"],\n            \"disabled\": true\n        }\n    }\n}\n"
    );
}

#[test]
fn line_endings_and_a_missing_final_newline_survive() {
    // toml_edit writes `\n` throughout and always ends the file with one.
    let crlf = "[mcp_servers.alpha]\r\ncommand = \"x\"\r\n\r\n[mcp_servers.beta]\r\ncommand = \"y\"\r\n";
    assert_eq!(
        switch_off(crlf, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"),
        "[mcp_servers.alpha]\r\ncommand = \"x\"\r\nenabled = false\r\n\r\n[mcp_servers.beta]\r\ncommand = \"y\"\r\n"
    );

    let unended = "[mcp_servers.alpha]\ncommand = \"x\"\n\n[mcp_servers.beta]\ncommand = \"y\"";
    assert_eq!(
        switch_off(unended, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"),
        "[mcp_servers.alpha]\ncommand = \"x\"\nenabled = false\n\n[mcp_servers.beta]\ncommand = \"y\""
    );
    assert_eq!(
        switch_off(unended, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"),
        "[mcp_servers.alpha]\ncommand = \"x\"\n\n[mcp_servers.beta]\ncommand = \"y\"\nenabled = false"
    );

    let json_crlf = "{\r\n  \"mcpServers\": {\r\n    \"beta\": {\r\n      \"command\": \"echo\"\r\n    }\r\n  }\r\n}";
    assert_eq!(
        switch_off(json_crlf, Dialect::McpServers, SwitchKind::DisabledKey, "beta"),
        "{\r\n  \"mcpServers\": {\r\n    \"beta\": {\r\n      \"disabled\": true,\r\n      \"command\": \"echo\"\r\n    }\r\n  }\r\n}"
    );
}

#[test]
fn a_toml_file_that_would_not_come_back_byte_for_byte_is_refused() {
    // One CRLF line and one LF line: whichever ending the file is written
    // back with, a line the switch never touched would change.
    let mixed = "[mcp_servers.alpha]\r\ncommand = \"marker-do-not-quote\"\n";
    let result = edit::set_enabled(mixed, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha", false);
    let Err(EditError::Unparseable(reason)) = &result else {
        panic!("a file with mixed line endings must be refused, got {result:?}");
    };
    assert!(!reason.contains(MARKER), "the refusal quotes the file: {reason:?}");
    // Reading it changes nothing, so reading still works, and so does a
    // switch that has nothing to write.
    assert_eq!(edit::read_flag(mixed, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), Ok(None));
    assert_eq!(switch_on(mixed, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), mixed);
}

#[test]
fn a_json_key_written_twice_is_switched_where_it_is_read() {
    // serde_json, like the engines' own parsers, keeps the last of two equal
    // keys. The flag has to land on the entry that is actually loaded.
    let body = r#"{"mcpServers":{"beta":{"command":"old","disabled":true},"beta":{"command":"new"}}}"#;
    assert_eq!(edit::read_flag(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta"), Ok(None));
    assert_eq!(
        switch_off(body, Dialect::McpServers, SwitchKind::DisabledKey, "beta"),
        r#"{"mcpServers":{"beta":{"command":"old","disabled":true},"beta":{"disabled": true,"command":"new"}}}"#
    );
}

#[test]
fn a_flag_that_is_not_true_or_false_reads_as_absent_and_is_never_overwritten() {
    let toml = "[mcp_servers.beta]\ncommand = \"echo\"\nenabled = \"marker-do-not-quote\"\n";
    let json = r#"{ "mcpServers": { "beta": { "command": "echo", "disabled": "marker-do-not-quote" } } }"#;
    for (body, dialect) in [(toml, Dialect::CodexToml), (json, Dialect::McpServers)] {
        for kind in [SwitchKind::EnabledKey, SwitchKind::DisabledKey] {
            assert_eq!(edit::read_flag(body, dialect, kind, "beta"), Ok(None), "{dialect:?} {kind:?}");
            for enabled in [false, true] {
                let result = edit::set_enabled(body, dialect, kind, "beta", enabled);
                let Err(EditError::Unparseable(reason)) = &result else {
                    panic!("a flag holding a string must not be overwritten, got {result:?}");
                };
                assert!(!reason.contains(MARKER), "the refusal quotes the file: {reason:?}");
            }
        }
    }
}

// --- Gemini CLI's state file ------------------------------------------------
//
// `~/.gemini/mcp-server-enablement.json` is not a server declaration, so it
// has a pair of functions of its own. The expected text below is what Gemini
// CLI 0.56.0 writes itself: `JSON.stringify(config, null, 2)`, no final
// newline.

const GEMINI_ALPHA_OFF: &str = "{\n  \"alpha\": {\n    \"enabled\": false\n  }\n}";

#[test]
fn gemini_off_adds_one_key_and_on_removes_it() {
    assert_eq!(edit::gemini_is_enabled(Some(GEMINI_ALPHA_OFF), "beta"), Ok(true));

    let off = edit::gemini_set_enabled(Some(GEMINI_ALPHA_OFF), "beta", false).expect("off");
    assert_eq!(off, "{\n  \"alpha\": {\n    \"enabled\": false\n  },\n  \"beta\": {\n    \"enabled\": false\n  }\n}");
    assert_eq!(edit::gemini_is_enabled(Some(&off), "beta"), Ok(false));

    let on = edit::gemini_set_enabled(Some(&off), "beta", true).expect("on");
    assert_eq!(on, GEMINI_ALPHA_OFF, "on removes the key and leaves the file as it was");
    assert_eq!(edit::gemini_is_enabled(Some(&on), "beta"), Ok(true));

    // A key written twice is gone after on, not merely gone once.
    let twice = r#"{"beta": {"enabled": false}, "beta": {"enabled": false}}"#;
    let on = edit::gemini_set_enabled(Some(twice), "beta", true).expect("on");
    assert_eq!(edit::gemini_is_enabled(Some(&on), "beta"), Ok(true), "{on}");
    assert!(!on.contains("beta"), "{on}");

    // Off when already off, and on when already on, write nothing new.
    assert_eq!(edit::gemini_set_enabled(Some(&off), "beta", false).as_deref(), Ok(off.as_str()));
    assert_eq!(edit::gemini_set_enabled(Some(GEMINI_ALPHA_OFF), "beta", true).as_deref(), Ok(GEMINI_ALPHA_OFF));
}

#[test]
fn gemini_keys_are_lowercased_and_trimmed() {
    let off = edit::gemini_set_enabled(None, " GitHub ", false).expect("off");
    assert_eq!(off, "{\n  \"github\": {\n    \"enabled\": false\n  }\n}");

    // Any spelling of the name reads the one key.
    for name in ["github", "GitHub", " GITHUB ", "\tgithub\n"] {
        assert_eq!(edit::gemini_is_enabled(Some(&off), name), Ok(false), "{name:?}");
    }
    assert_eq!(edit::gemini_set_enabled(Some(&off), "GITHUB", true).as_deref(), Ok("{}"));

    // Gemini looks up the lowercased name and nothing else, so a key somebody
    // typed with capitals is one it never finds: that server is on.
    let capitals = "{\n  \"GitHub\": {\n    \"enabled\": false\n  }\n}";
    assert_eq!(edit::gemini_is_enabled(Some(capitals), "GitHub"), Ok(true));
}

#[test]
fn gemini_absent_file_reads_as_enabled_and_off_creates_it() {
    assert_eq!(edit::gemini_is_enabled(None, "beta"), Ok(true));

    let created = edit::gemini_set_enabled(None, "beta", false).expect("off with no file");
    assert_eq!(created, "{\n  \"beta\": {\n    \"enabled\": false\n  }\n}");
    assert_eq!(edit::gemini_is_enabled(Some(&created), "beta"), Ok(false));

    // On with no file has no key to remove: the result is an empty state file.
    assert_eq!(edit::gemini_set_enabled(None, "beta", true).as_deref(), Ok("{}"));
    // An existing empty file is the same as no file.
    assert_eq!(edit::gemini_is_enabled(Some("{}"), "beta"), Ok(true));
    assert_eq!(edit::gemini_set_enabled(Some("{}"), "beta", false).as_deref(), Ok(created.as_str()));
}

#[test]
fn gemini_other_names_are_untouched() {
    let three = "{\n  \"alpha\": {\n    \"enabled\": false\n  },\n  \"beta\": {\n    \"enabled\": false\n  },\n  \"gamma\": {\n    \"enabled\": false\n  }\n}";

    let on = edit::gemini_set_enabled(Some(three), "beta", true).expect("on");
    assert_eq!(on, "{\n  \"alpha\": {\n    \"enabled\": false\n  },\n  \"gamma\": {\n    \"enabled\": false\n  }\n}");
    assert_eq!(edit::gemini_is_enabled(Some(&on), "alpha"), Ok(false));
    assert_eq!(edit::gemini_is_enabled(Some(&on), "beta"), Ok(true));
    assert_eq!(edit::gemini_is_enabled(Some(&on), "gamma"), Ok(false));

    // A name that merely contains another is a different key.
    assert_eq!(edit::gemini_is_enabled(Some(three), "alph"), Ok(true));
    let off = edit::gemini_set_enabled(Some(GEMINI_ALPHA_OFF), "alph", false).expect("off");
    assert_eq!(off, "{\n  \"alpha\": {\n    \"enabled\": false\n  },\n  \"alph\": {\n    \"enabled\": false\n  }\n}");
}

#[test]
fn gemini_entries_that_do_not_say_enabled_false_read_as_on() {
    // Gemini's reader is `state?.enabled ?? true`: an entry that is not an
    // object, or has no `enabled`, or has it null, leaves the server on.
    for body in [
        r#"{"beta": {}}"#,
        r#"{"beta": {"enabled": true}}"#,
        r#"{"beta": {"enabled": null}}"#,
        r#"{"beta": "off"}"#,
        r#"{"beta": null}"#,
    ] {
        assert_eq!(edit::gemini_is_enabled(Some(body), "beta"), Ok(true), "{body}");
        // And off, from any of them, ends with the server reading as off.
        let off = edit::gemini_set_enabled(Some(body), "beta", false).unwrap_or_else(|e| panic!("{body}: {e:?}"));
        assert_eq!(edit::gemini_is_enabled(Some(&off), "beta"), Ok(false), "{body} became {off}");
    }
}

#[test]
fn a_gemini_state_file_gemini_could_not_read_is_unparseable() {
    // Gemini reads this file with JSON.parse: a comment is as fatal as a
    // stray word, and Gemini then treats every server as on.
    let stray = "{\n  \"beta\": {\n    \"enabled\": false marker-do-not-quote\n  }\n}";
    let commented = "{\n  // marker-do-not-quote\n  \"beta\": {\n    \"enabled\": false\n  }\n}";
    for (body, line) in [(stray, 3), (commented, 2)] {
        let results = [
            edit::gemini_is_enabled(Some(body), "beta").map(|_| ()),
            edit::gemini_set_enabled(Some(body), "beta", false).map(|_| ()),
            edit::gemini_set_enabled(Some(body), "beta", true).map(|_| ()),
        ];
        for result in results {
            let Err(EditError::Unparseable(locator)) = &result else {
                panic!("a state file that is not strict JSON must be Unparseable, got {result:?}");
            };
            let column = locator
                .strip_prefix(&format!("line {line}, column "))
                .unwrap_or_else(|| panic!("the locator does not point at line {line}: {locator:?}"));
            assert!(column.parse::<usize>().is_ok(), "the locator carries more than a line and a column: {locator:?}");
        }
    }
    // An `enabled` that is neither a boolean nor null: Gemini would decide by
    // JavaScript truthiness, and this module does not guess at that.
    let odd = r#"{"beta": {"enabled": "marker-do-not-quote"}}"#;
    let result = edit::gemini_is_enabled(Some(odd), "beta");
    let Err(EditError::Unparseable(reason)) = &result else {
        panic!("an enabled that is a string must not be read as a state, got {result:?}");
    };
    assert!(!reason.contains(MARKER), "the refusal quotes the file: {reason:?}");
    // Off overwrites it, as `gemini mcp disable` is written to.
    let off = edit::gemini_set_enabled(Some(odd), "beta", false).expect("off");
    assert_eq!(edit::gemini_is_enabled(Some(&off), "beta"), Ok(false), "{off}");

    // Not an object at the root: there is nowhere to keep a name.
    for body in ["[]", "null", ""] {
        assert!(matches!(edit::gemini_is_enabled(Some(body), "beta"), Err(EditError::Unparseable(_))), "{body:?}");
        assert!(matches!(edit::gemini_set_enabled(Some(body), "beta", false), Err(EditError::Unparseable(_))), "{body:?}");
    }
}
