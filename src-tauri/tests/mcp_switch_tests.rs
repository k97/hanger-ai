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

// ---------------------------------------------------------------------------
// Writing the file: `mcp::switch::apply`. Every test works in a temp
// directory of its own; none reads or writes anything under the real home.
//
// The backup, list and restore cases are ported by behaviour from mcpick's
// `safe-apply.test.ts` (MIT, Copyright (c) 2026 Scott Spence). Its four
// dry-run cases have no counterpart: `edit` is pure, so the text a switch
// would write can be had without a write.
// ---------------------------------------------------------------------------

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri_app_lib::mcp::switch::apply::{self, ApplyError, Format, Receipt, Seams};

/// A config with a comment, a blank line, CRLF on one line and no final
/// newline: bytes a re-serialiser would not give back.
const TOML_BEFORE: &str = "# kept\r\n[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[mcp_servers.beta]\ncommand = \"beta-server\"";
const TOML_AFTER: &str = "# kept\r\n[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\nenabled = false";
const JSONC_BEFORE: &str = "{\n    // kept\n    \"mcpServers\": {\n        \"alpha\": { \"command\": \"alpha-server\", },\n    },\n}";
const JSONC_AFTER: &str = "{\n    // kept\n    \"mcpServers\": {\n        \"alpha\": { \"disabled\": true, \"command\": \"alpha-server\", },\n    },\n}";
const WHAT: &str = "codex · beta · off";

/// A temp directory with a folder for config files and a place where the
/// backups folder will go. The backups folder itself is not created: making
/// it is `apply`'s job.
struct Bench {
    _dir: tempfile::TempDir,
    /// Where config files go. The real path: macOS keeps its temp
    /// directories behind a link, and receipts name real paths.
    home: PathBuf,
    backups: PathBuf,
}

fn bench() -> Bench {
    let dir = tempfile::tempdir().expect("temp dir");
    let root = fs::canonicalize(dir.path()).expect("real temp dir");
    let home = root.join("home");
    fs::create_dir(&home).expect("home");
    Bench { _dir: dir, home, backups: root.join("data").join("switch").join("backups") }
}

fn write_with_mode(path: &Path, text: &str, mode: u32) {
    fs::write(path, text).expect("write fixture");
    fs::set_permissions(path, fs::Permissions::from_mode(mode)).expect("chmod fixture");
}

fn mode_of(path: &Path) -> u32 {
    fs::metadata(path).unwrap_or_else(|e| panic!("{}: {e}", path.display())).permissions().mode() & 0o7777
}

fn sha(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// Every name in a directory, sorted. A directory that is not there is empty.
fn names_in(dir: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else { return Vec::new() };
    let mut names: Vec<String> = entries.map(|e| e.expect("dir entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    names
}

/// macOS's "user immutable" flag. A file that carries it can be read and
/// cannot be renamed over, which is the one way to let a write get as far as
/// its temp file and no further.
#[cfg(target_os = "macos")]
fn set_immutable(path: &Path, on: bool) {
    use std::os::unix::ffi::OsStrExt;
    let c_path = std::ffi::CString::new(path.as_os_str().as_bytes()).expect("path");
    let flags = if on { libc::UF_IMMUTABLE } else { 0 };
    // SAFETY: `c_path` is a NUL-terminated string that outlives the call.
    let result = unsafe { libc::chflags(c_path.as_ptr(), flags) };
    assert_eq!(result, 0, "chflags on {}", path.display());
}

const RECEIPT_SUFFIX: &str = ".receipt.json";

/// The backups in the backups folder: every file that is not a receipt.
fn backups_in(dir: &Path) -> Vec<String> {
    names_in(dir).into_iter().filter(|name| !name.ends_with(RECEIPT_SUFFIX)).collect()
}

fn receipt_files_in(dir: &Path) -> Vec<String> {
    names_in(dir).into_iter().filter(|name| name.ends_with(RECEIPT_SUFFIX)).collect()
}

fn backup_of(bench: &Bench, receipt: &Receipt) -> PathBuf {
    bench.backups.join(receipt.backup_file.as_ref().expect("this write replaced a file, so it has a backup"))
}

fn replace(bench: &Bench, path: &Path, before: &str, next: &str, format: Format) -> Receipt {
    apply::safe_replace(path, Some(before), next, format, &bench.backups, WHAT)
        .unwrap_or_else(|e| panic!("safe_replace refused: {e:?}"))
}

/// `{"n": <n>}`: a different, valid file for each write of a run.
fn numbered(n: usize) -> String {
    format!("{{\"n\": {n}}}")
}

#[test]
fn a_write_replaces_the_file_and_backs_up_what_was_there() {
    // mcpick: "writes JSON and backs up existing content".
    let bench = bench();
    let path = bench.home.join("settings.json");
    fs::write(&path, JSONC_BEFORE).unwrap();

    let receipt = replace(&bench, &path, JSONC_BEFORE, JSONC_AFTER, Format::Jsonc);

    assert_eq!(fs::read_to_string(&path).unwrap(), JSONC_AFTER);
    // The backup holds the exact bytes that were replaced, comment and
    // trailing commas included.
    assert_eq!(fs::read(backup_of(&bench, &receipt)).unwrap(), JSONC_BEFORE.as_bytes());

    assert_eq!(receipt.path, path.to_str().unwrap());
    assert_eq!(receipt.before_sha256, sha(JSONC_BEFORE.as_bytes()));
    assert_eq!(receipt.after_sha256, sha(JSONC_AFTER.as_bytes()));
    assert_eq!(receipt.what, WHAT);
    assert!(uuid::Uuid::parse_str(&receipt.id).is_ok(), "the id is not a uuid: {}", receipt.id);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    assert!((now - 60_000..=now).contains(&receipt.at_ms), "at_ms is not this minute: {} against {now}", receipt.at_ms);

    // The name: config-<basename>-<milliseconds>-<first 10 hex of sha256(path)>.<ext>
    let name = receipt.backup_file.clone().unwrap();
    let hash = &sha(path.to_str().unwrap().as_bytes())[..10];
    let stamp = name
        .strip_prefix("config-settings.json-")
        .and_then(|rest| rest.strip_suffix(&format!("-{hash}.json")))
        .unwrap_or_else(|| panic!("the backup is not named for its file and path: {name}"));
    assert_eq!(stamp.trim_start_matches('0').parse::<i64>().ok(), Some(receipt.at_ms), "{name}");
    assert_eq!(stamp.len(), 14, "the stamp is not zero-padded to a fixed width: {name}");

    // The receipt is a file beside the backup, and it is what is listed.
    assert_eq!(names_in(&bench.backups), vec![name.clone(), format!("{name}{RECEIPT_SUFFIX}")]);
    assert_eq!(apply::latest_receipts(&bench.backups), vec![receipt]);
}

#[test]
fn a_toml_backup_keeps_its_extension_and_is_listed() {
    // mcpick: "lists .toml backups alongside .json ones".
    let bench = bench();
    let toml_path = bench.home.join("config.toml");
    let json_path = bench.home.join("settings.json");
    fs::write(&toml_path, TOML_BEFORE).unwrap();
    fs::write(&json_path, JSONC_BEFORE).unwrap();

    let toml_receipt = replace(&bench, &toml_path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    let json_receipt = replace(&bench, &json_path, JSONC_BEFORE, JSONC_AFTER, Format::Jsonc);

    assert!(toml_receipt.backup_file.as_ref().unwrap().ends_with(".toml"), "{toml_receipt:?}");
    assert!(json_receipt.backup_file.as_ref().unwrap().ends_with(".json"), "{json_receipt:?}");
    let mut listed: Vec<String> = apply::latest_receipts(&bench.backups).into_iter().map(|r| r.path).collect();
    listed.sort();
    assert_eq!(listed, vec![toml_path.to_str().unwrap(), json_path.to_str().unwrap()]);
}

#[test]
fn a_file_with_no_extension_is_backed_up_as_json_and_odd_names_are_made_safe() {
    let bench = bench();
    let path = bench.home.join("my settings");
    fs::write(&path, "{}").unwrap();

    let receipt = replace(&bench, &path, "{}", "{\"a\": 1}", Format::StrictJson);

    let name = receipt.backup_file.unwrap();
    assert!(name.starts_with("config-my_settings-"), "{name}");
    assert!(name.ends_with(".json"), "{name}");
}

#[test]
fn undo_restores_the_exact_bytes() {
    // mcpick: "restores config backups by filename" and "restores TOML
    // backups byte-identical".
    for (file, before, after, format) in [
        ("config.toml", TOML_BEFORE, TOML_AFTER, Format::Toml),
        ("settings.json", JSONC_BEFORE, JSONC_AFTER, Format::Jsonc),
    ] {
        let bench = bench();
        let path = bench.home.join(file);
        fs::write(&path, before).unwrap();
        let receipt = replace(&bench, &path, before, after, format);
        assert_eq!(fs::read(&path).unwrap(), after.as_bytes(), "{file}: the write did not land, so undo has nothing to prove");

        let undone = apply::undo(&receipt.id, &bench.backups).unwrap_or_else(|e| panic!("{file}: {e:?}"));

        assert_eq!(fs::read(&path).unwrap(), before.as_bytes(), "{file}");
        assert_eq!(undone.before_sha256, sha(after.as_bytes()), "{file}");
        assert_eq!(undone.after_sha256, sha(before.as_bytes()), "{file}");
        assert_ne!(undone.id, receipt.id, "{file}: the undo is a write of its own");
    }
}

#[test]
fn undo_refuses_a_backup_that_is_no_longer_what_was_backed_up() {
    // mcpick: "rejects an invalid TOML backup without touching the file".
    let bench = bench();
    let path = bench.home.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    let receipt = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    fs::write(backup_of(&bench, &receipt), "not = [valid toml").unwrap();

    let result = apply::undo(&receipt.id, &bench.backups);

    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), TOML_AFTER);
}

#[test]
fn undo_with_a_missing_backup_is_not_undoable() {
    let bench = bench();
    let path = bench.home.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    let receipt = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    fs::remove_file(backup_of(&bench, &receipt)).unwrap();

    let result = apply::undo(&receipt.id, &bench.backups);

    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), TOML_AFTER);

    // And an id no receipt carries, in a folder that has receipts and in one
    // that does not exist.
    for backups in [bench.backups.clone(), bench.home.join("no-such-folder")] {
        let unknown = apply::undo("00000000-0000-4000-8000-000000000000", &backups);
        assert!(matches!(unknown, Err(ApplyError::NotUndoable(_))), "{unknown:?}");
    }
}

#[test]
fn a_file_changed_since_read_is_not_overwritten() {
    // Review focus 1: the engine, or an editor, saved the file between
    // Hanger's read and its write.
    let bench = bench();
    let path = bench.home.join("config.toml");
    let theirs = "[mcp_servers.gamma]\ncommand = \"gamma-server\"\n";
    fs::write(&path, theirs).unwrap();

    let result = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT);

    assert_eq!(result, Err(ApplyError::ChangedSinceRead));
    assert_eq!(fs::read_to_string(&path).unwrap(), theirs, "their save was overwritten");
    assert_eq!(names_in(&bench.backups), Vec::<String>::new(), "a refused write left something in the backups folder");
    assert_eq!(names_in(&bench.home), vec!["config.toml"]);

    // One byte is enough: a final newline their editor added.
    let with_newline = format!("{TOML_BEFORE}\n");
    fs::write(&path, &with_newline).unwrap();
    let result = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT);
    assert_eq!(result, Err(ApplyError::ChangedSinceRead));
    assert_eq!(fs::read_to_string(&path).unwrap(), with_newline);

    // And a file that was deleted since it was read is not brought back.
    fs::remove_file(&path).unwrap();
    let result = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT);
    assert_eq!(result, Err(ApplyError::ChangedSinceRead));
    assert_eq!(names_in(&bench.home), Vec::<String>::new());
}

#[test]
fn a_file_that_appeared_since_read_is_not_overwritten() {
    let bench = bench();
    let path = bench.home.join("mcp-server-enablement.json");
    let theirs = "{\"alpha\": {\"enabled\": false}}";
    fs::write(&path, theirs).unwrap();

    // `None`: when Hanger read, there was no file.
    let result = apply::safe_replace(&path, None, GEMINI_ALPHA_OFF, Format::StrictJson, &bench.backups, WHAT);

    assert_eq!(result, Err(ApplyError::ChangedSinceRead));
    assert_eq!(fs::read_to_string(&path).unwrap(), theirs);
    assert_eq!(names_in(&bench.backups), Vec::<String>::new());
    assert_eq!(names_in(&bench.home), vec!["mcp-server-enablement.json"]);
}

#[test]
fn a_symlinked_config_keeps_its_link() {
    // Review focus 2: the config is a link into a dotfiles repo. A rename
    // onto the link would replace it with a plain file.
    let bench = bench();
    let dotfiles = bench.home.join("dotfiles");
    let codex = bench.home.join(".codex");
    fs::create_dir(&dotfiles).unwrap();
    fs::create_dir(&codex).unwrap();
    let real = dotfiles.join("codex.toml");
    let link = codex.join("config.toml");
    write_with_mode(&real, TOML_BEFORE, 0o600);
    std::os::unix::fs::symlink(&real, &link).unwrap();

    let receipt = replace(&bench, &link, TOML_BEFORE, TOML_AFTER, Format::Toml);

    let is_link = |path: &Path| fs::symlink_metadata(path).unwrap().file_type().is_symlink();
    assert!(is_link(&link), "the link was replaced by a file");
    assert_eq!(fs::read_link(&link).unwrap(), real);
    assert!(!is_link(&real));
    assert_eq!(fs::read_to_string(&real).unwrap(), TOML_AFTER, "the write did not reach the link's target");
    assert_eq!(mode_of(&real), 0o600);
    assert_eq!(receipt.path, real.to_str().unwrap(), "the receipt names the link, not the real file");
    // The temp file was made beside the real file and is gone from both folders.
    assert_eq!(names_in(&dotfiles), vec!["codex.toml"]);
    assert_eq!(names_in(&codex), vec!["config.toml"]);

    // Undo goes the same way.
    apply::undo(&receipt.id, &bench.backups).expect("undo");
    assert!(is_link(&link), "undo replaced the link with a file");
    assert_eq!(fs::read(&real).unwrap(), TOML_BEFORE.as_bytes());
    assert_eq!(names_in(&dotfiles), vec!["codex.toml"]);
}

#[test]
fn mode_is_preserved_on_the_file_and_its_backup() {
    // Review focus 3. 0o664 is here because a process umask of 022 turns a
    // file *created* 0o664 into 0o644: the mode has to be set, not asked for.
    for mode in [0o600, 0o644, 0o664, 0o400] {
        let bench = bench();
        let path = bench.home.join("config.toml");
        write_with_mode(&path, TOML_BEFORE, mode);

        let receipt = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);

        assert_eq!(fs::read_to_string(&path).unwrap(), TOML_AFTER);
        assert_eq!(mode_of(&path), mode, "the rewritten file went from {mode:o} to {:o}", mode_of(&path));
        // The backup is 0600 whatever the original was: it is a copy of a
        // file that may hold a credential, in a folder of Hanger's own.
        assert_eq!(mode_of(&backup_of(&bench, &receipt)), 0o600, "backup of a {mode:o} file");

        apply::undo(&receipt.id, &bench.backups).expect("undo");
        assert_eq!(mode_of(&path), mode, "undo changed the mode of a {mode:o} file");
    }
}

#[test]
fn the_backups_folder_is_private() {
    let bench = bench();
    let path = bench.home.join("config.toml");
    write_with_mode(&path, TOML_BEFORE, 0o644);
    let created = bench.home.join("mcp-server-enablement.json");
    assert!(!bench.backups.parent().unwrap().exists(), "the fixture already made the folder this test watches being made");

    replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    apply::safe_replace(&created, None, GEMINI_ALPHA_OFF, Format::StrictJson, &bench.backups, WHAT).expect("create");

    // The folder, and the one above it that had to be made too.
    assert_eq!(mode_of(&bench.backups), 0o700);
    assert_eq!(mode_of(bench.backups.parent().unwrap()), 0o700);
    // A backup, its receipt, and the receipt of the write that made a file.
    let names = names_in(&bench.backups);
    assert_eq!(names.len(), 3, "{names:?}");
    for name in names {
        assert_eq!(mode_of(&bench.backups.join(&name)), 0o600, "{name}");
    }
}

#[test]
fn undo_refuses_when_the_file_moved_on() {
    // Review focus 4: the user edited the file after Hanger's write.
    let bench = bench();
    let path = bench.home.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    let receipt = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    let theirs = format!("{TOML_AFTER}\n\n[mcp_servers.gamma]\ncommand = \"gamma-server\"\n");
    fs::write(&path, &theirs).unwrap();
    let before_undo = names_in(&bench.backups);

    let result = apply::undo(&receipt.id, &bench.backups);

    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), theirs, "undo discarded their edit");
    assert_eq!(names_in(&bench.backups), before_undo, "a refused undo wrote to the backups folder");
    assert_eq!(names_in(&bench.home), vec!["config.toml"]);

    // A file they deleted is not brought back either.
    fs::remove_file(&path).unwrap();
    let result = apply::undo(&receipt.id, &bench.backups);
    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert!(!path.exists());
}

#[test]
fn an_undo_can_be_undone() {
    let bench = bench();
    let path = bench.home.join("config.toml");
    write_with_mode(&path, TOML_BEFORE, 0o600);
    let written = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);

    let undone = apply::undo(&written.id, &bench.backups).expect("undo");
    assert_eq!(fs::read(&path).unwrap(), TOML_BEFORE.as_bytes());
    // The undo is a write like any other: backed up and receipted.
    assert_eq!(fs::read(backup_of(&bench, &undone)).unwrap(), TOML_AFTER.as_bytes());
    assert_eq!(apply::latest_receipts(&bench.backups).first().map(|r| r.id.clone()), Some(undone.id.clone()));

    let redone = apply::undo(&undone.id, &bench.backups).expect("undo of the undo");
    assert_eq!(fs::read(&path).unwrap(), TOML_AFTER.as_bytes());
    assert_eq!(mode_of(&path), 0o600);
    assert_eq!(redone.after_sha256, written.after_sha256);
    assert_eq!(apply::latest_receipts(&bench.backups).len(), 3);

    // The first undo's receipt is spent: the file no longer holds what that
    // undo left.
    let stale = apply::undo(&undone.id, &bench.backups);
    assert!(matches!(stale, Err(ApplyError::NotUndoable(_))), "{stale:?}");
    assert_eq!(fs::read(&path).unwrap(), TOML_AFTER.as_bytes());
}

#[test]
fn a_failed_verify_puts_the_original_back() {
    // The check made after the rename is the one thing here a test cannot
    // make fail from outside, so it is a parameter. `safe_replace` passes the
    // real one.
    let refuse = |_: &str| false;
    let bench = bench();
    let dotfiles = bench.home.join("dotfiles");
    fs::create_dir(&dotfiles).unwrap();
    let real = dotfiles.join("codex.toml");
    let link = bench.home.join("config.toml");
    write_with_mode(&real, TOML_BEFORE, 0o600);
    std::os::unix::fs::symlink(&real, &link).unwrap();

    let result = apply::safe_replace_with(
        &link,
        Some(TOML_BEFORE),
        TOML_AFTER,
        Format::Toml,
        &bench.backups,
        WHAT,
        Seams { at_ms: 1_000, verify: &refuse },
    );

    assert!(matches!(result, Err(ApplyError::Verify(_))), "{result:?}");
    assert_eq!(fs::read(&real).unwrap(), TOML_BEFORE.as_bytes(), "the original was not put back");
    assert_eq!(mode_of(&real), 0o600);
    assert!(fs::symlink_metadata(&link).unwrap().file_type().is_symlink());
    assert_eq!(names_in(&dotfiles), vec!["codex.toml"]);
    // The write did not happen, so nothing says it did.
    assert_eq!(apply::latest_receipts(&bench.backups), Vec::<Receipt>::new());
    assert_eq!(names_in(&bench.backups), Vec::<String>::new());

    // A write that would have created the file leaves no file.
    let created = bench.home.join("mcp-server-enablement.json");
    let result = apply::safe_replace_with(
        &created,
        None,
        GEMINI_ALPHA_OFF,
        Format::StrictJson,
        &bench.backups,
        WHAT,
        Seams { at_ms: 2_000, verify: &refuse },
    );
    assert!(matches!(result, Err(ApplyError::Verify(_))), "{result:?}");
    assert!(!created.exists(), "a file that failed its check was left in place");
    assert_eq!(names_in(&bench.backups), Vec::<String>::new());

    // The same calls with a check that passes do write: the refusals above
    // came from the check, not from the fixture.
    let accept = |_: &str| true;
    let seams = Seams { at_ms: 3_000, verify: &accept };
    apply::safe_replace_with(&link, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT, seams).expect("write");
    assert_eq!(fs::read(&real).unwrap(), TOML_AFTER.as_bytes());
}

#[test]
fn a_write_that_cannot_land_leaves_the_file_and_no_backup() {
    let bench = bench();
    let folder = bench.home.join(".codex");
    fs::create_dir(&folder).unwrap();
    let path = folder.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    // Readable, and closed to new files: the temp file cannot be made.
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o500)).unwrap();

    let result = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT);
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o700)).unwrap();

    // The reason is one of the module's sentences and the kind of I/O error.
    let Err(ApplyError::Write(reason)) = &result else { panic!("expected Write, got {result:?}") };
    assert!(reason.ends_with(" (PermissionDenied)"), "{reason:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), TOML_BEFORE);
    assert_eq!(names_in(&folder), vec!["config.toml"]);
    // The backup was made before the write was tried, and is gone again:
    // nothing says a write happened.
    assert!(bench.backups.exists(), "the backups folder was never made, so no backup was ever at risk of being left");
    assert_eq!(names_in(&bench.backups), Vec::<String>::new());
}

#[test]
fn when_the_original_cannot_be_put_back_its_backup_and_receipt_stay() {
    let bench = bench();
    let folder = bench.home.join(".codex");
    fs::create_dir(&folder).unwrap();
    let path = folder.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    // The check fails, and closes the folder to new files as it does: the
    // new text has landed and the original cannot be written back.
    let refuse_and_close = |_: &str| {
        fs::set_permissions(&folder, fs::Permissions::from_mode(0o500)).unwrap();
        false
    };

    let seams = Seams { at_ms: 1_000, verify: &refuse_and_close };
    let result = apply::safe_replace_with(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, &bench.backups, WHAT, seams);
    fs::set_permissions(&folder, fs::Permissions::from_mode(0o700)).unwrap();

    let Err(ApplyError::Verify(reason)) = &result else { panic!("expected Verify, got {result:?}") };
    assert!(reason.ends_with(" (PermissionDenied)"), "{reason:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), TOML_AFTER, "the fixture did not strand the new text, so this proves nothing");
    assert_eq!(names_in(&folder), vec!["config.toml"]);
    // The original is still to be had, and by the ordinary route.
    let receipts = apply::latest_receipts(&bench.backups);
    assert_eq!(receipts.len(), 1);
    assert_eq!(fs::read(backup_of(&bench, &receipts[0])).unwrap(), TOML_BEFORE.as_bytes());
    apply::undo(&receipts[0].id, &bench.backups).expect("undo");
    assert_eq!(fs::read(&path).unwrap(), TOML_BEFORE.as_bytes());
}

#[test]
fn text_that_does_not_parse_is_refused_before_anything_is_written() {
    let broken_toml = format!("[mcp_servers.alpha]\ncommand = \"{MARKER}\nenabled = false\n");
    let broken_json = format!("{{\"mcpServers\": {{\"alpha\": {{\"command\": \"{MARKER}\" \"disabled\": true}}}}}}");
    let commented_json = format!("{{\n  // {MARKER}\n  \"alpha\": {{\"enabled\": false}}\n}}");
    for (file, before, next, format) in [
        ("config.toml", TOML_BEFORE, broken_toml.as_str(), Format::Toml),
        ("settings.json", JSONC_BEFORE, broken_json.as_str(), Format::Jsonc),
        ("settings.json", JSONC_BEFORE, broken_json.as_str(), Format::StrictJson),
        // Gemini reads its state file with JSON.parse: a comment is fatal.
        ("mcp-server-enablement.json", "{}", commented_json.as_str(), Format::StrictJson),
        // The right text under the wrong format.
        ("config.toml", TOML_BEFORE, JSONC_AFTER, Format::Toml),
        ("settings.json", JSONC_BEFORE, TOML_AFTER, Format::Jsonc),
    ] {
        let bench = bench();
        let path = bench.home.join(file);
        write_with_mode(&path, before, 0o600);

        let result = apply::safe_replace(&path, Some(before), next, format, &bench.backups, WHAT);

        let Err(ApplyError::Verify(reason)) = &result else {
            panic!("{file} as {format:?}: text that does not parse must be refused with Verify, got {result:?}");
        };
        assert!(!reason.contains(MARKER), "the refusal quotes the text it refused: {reason:?}");
        assert!(!format!("{result:?}").contains(MARKER), "{result:?}");
        assert_eq!(fs::read(&path).unwrap(), before.as_bytes(), "{file} as {format:?}");
        assert_eq!(names_in(&bench.home), vec![file]);
        assert!(!bench.backups.exists(), "{file} as {format:?}: a refused write made the backups folder");

        // A file that would be created by it is not.
        let absent = bench.home.join("absent.json");
        let result = apply::safe_replace(&absent, None, next, format, &bench.backups, WHAT);
        assert!(matches!(result, Err(ApplyError::Verify(_))), "{result:?}");
        assert!(!absent.exists());
    }

    // What each format does accept, so the refusals above are about the text.
    let bench = bench();
    let path = bench.home.join("mcp-server-enablement.json");
    fs::write(&path, "{}").unwrap();
    replace(&bench, &path, "{}", &commented_json, Format::Jsonc);
    replace(&bench, &path, &commented_json, GEMINI_ALPHA_OFF, Format::StrictJson);
}

#[test]
fn no_temp_file_is_left_behind() {
    let bench = bench();
    let path = bench.home.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();
    let only_the_config = vec!["config.toml".to_string()];

    // A write that lands.
    let receipt = replace(&bench, &path, TOML_BEFORE, TOML_AFTER, Format::Toml);
    assert_eq!(names_in(&bench.home), only_the_config);
    // One refused because the file moved on.
    let stale = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_BEFORE, Format::Toml, &bench.backups, WHAT);
    assert_eq!(stale, Err(ApplyError::ChangedSinceRead));
    assert_eq!(names_in(&bench.home), only_the_config);
    // One refused because the text does not parse.
    let broken = apply::safe_replace(&path, Some(TOML_AFTER), "[broken", Format::Toml, &bench.backups, WHAT);
    assert!(matches!(broken, Err(ApplyError::Verify(_))), "{broken:?}");
    assert_eq!(names_in(&bench.home), only_the_config);
    // One that landed and was put back.
    let refuse = |_: &str| false;
    let seams = Seams { at_ms: 1_000, verify: &refuse };
    let put_back = apply::safe_replace_with(&path, Some(TOML_AFTER), TOML_BEFORE, Format::Toml, &bench.backups, WHAT, seams);
    assert!(matches!(put_back, Err(ApplyError::Verify(_))), "{put_back:?}");
    assert_eq!(names_in(&bench.home), only_the_config);
    // One whose temp file was written and could not be renamed into place.
    #[cfg(target_os = "macos")]
    {
        let before_it = names_in(&bench.backups);
        set_immutable(&path, true);
        let stuck = apply::safe_replace(&path, Some(TOML_AFTER), TOML_BEFORE, Format::Toml, &bench.backups, WHAT);
        set_immutable(&path, false);
        let Err(ApplyError::Write(reason)) = &stuck else { panic!("expected Write, got {stuck:?}") };
        assert!(reason.ends_with(" (PermissionDenied)"), "{reason:?}");
        assert_eq!(fs::read_to_string(&path).unwrap(), TOML_AFTER);
        assert_eq!(names_in(&bench.home), only_the_config);
        assert_eq!(names_in(&bench.backups), before_it, "a write that did not land left its backup");
    }
    // An undo.
    apply::undo(&receipt.id, &bench.backups).expect("undo");
    assert_eq!(names_in(&bench.home), only_the_config);
    // And nothing with a temp file's name is in the backups folder.
    let names = names_in(&bench.backups);
    assert!(!names.is_empty());
    assert!(names.iter().all(|name| !name.ends_with(".tmp")), "{names:?}");
}

#[test]
fn creating_a_file_is_undone_by_removing_it() {
    let bench = bench();
    let path = bench.home.join("mcp-server-enablement.json");

    let receipt = apply::safe_replace(&path, None, GEMINI_ALPHA_OFF, Format::StrictJson, &bench.backups, "gemini · alpha · off")
        .expect("create");

    assert_eq!(fs::read_to_string(&path).unwrap(), GEMINI_ALPHA_OFF);
    assert_eq!(mode_of(&path), 0o600, "a file Hanger creates is private");
    // There was nothing to back up, and the receipt says so.
    assert_eq!(receipt.backup_file, None);
    assert_eq!(receipt.before_sha256, "");
    assert_eq!(receipt.after_sha256, sha(GEMINI_ALPHA_OFF.as_bytes()));
    assert_eq!(receipt.path, path.to_str().unwrap());
    assert_eq!(backups_in(&bench.backups), Vec::<String>::new());
    let receipt_files = receipt_files_in(&bench.backups);
    assert_eq!(receipt_files.len(), 1);
    assert!(receipt_files[0].starts_with("created-mcp-server-enablement.json-"), "{receipt_files:?}");
    assert_eq!(apply::latest_receipts(&bench.backups), vec![receipt.clone()]);

    // Undo is refused once the file holds something else.
    let theirs = "{\"alpha\": {\"enabled\": false}, \"beta\": {\"enabled\": false}}";
    fs::write(&path, theirs).unwrap();
    let result = apply::undo(&receipt.id, &bench.backups);
    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), theirs, "undo removed a file that had been edited");

    // And removes the file while it still holds what Hanger wrote.
    fs::write(&path, GEMINI_ALPHA_OFF).unwrap();
    let removed = apply::undo(&receipt.id, &bench.backups).expect("undo");
    assert!(!path.exists(), "undo of a creation left the file");
    assert_eq!(names_in(&bench.home), Vec::<String>::new());
    assert_eq!(removed.after_sha256, "", "the receipt of a removal says there is no file after it");
    assert_eq!(removed.before_sha256, sha(GEMINI_ALPHA_OFF.as_bytes()));

    // The removal kept a copy, so it can be undone too: the file comes back,
    // byte for byte and private.
    assert_eq!(fs::read(backup_of(&bench, &removed)).unwrap(), GEMINI_ALPHA_OFF.as_bytes());
    apply::undo(&removed.id, &bench.backups).expect("undo of the removal");
    assert_eq!(fs::read(&path).unwrap(), GEMINI_ALPHA_OFF.as_bytes());
    assert_eq!(mode_of(&path), 0o600);
}

#[test]
fn a_file_is_not_created_in_a_folder_that_is_not_there() {
    let bench = bench();
    let path = bench.home.join(".gemini").join("mcp-server-enablement.json");

    let result = apply::safe_replace(&path, None, GEMINI_ALPHA_OFF, Format::StrictJson, &bench.backups, WHAT);

    assert!(matches!(result, Err(ApplyError::Write(_))), "{result:?}");
    assert_eq!(names_in(&bench.home), Vec::<String>::new(), "the engine's folder was made for it");
    assert!(!bench.backups.exists());
}

#[test]
fn a_path_that_is_not_absolute_is_refused() {
    // A relative path resolves against the working directory, which is `/`
    // for an app opened from Finder.
    let bench = bench();
    let path = bench.home.join("config.toml");
    fs::write(&path, TOML_BEFORE).unwrap();

    let relative_file = apply::safe_replace(Path::new("config.toml"), None, TOML_AFTER, Format::Toml, &bench.backups, WHAT);
    assert!(matches!(relative_file, Err(ApplyError::Write(_))), "{relative_file:?}");

    let relative_backups = apply::safe_replace(&path, Some(TOML_BEFORE), TOML_AFTER, Format::Toml, Path::new("backups"), WHAT);
    assert!(matches!(relative_backups, Err(ApplyError::Backup(_))), "{relative_backups:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), TOML_BEFORE);
    assert!(!Path::new("backups").exists() && !Path::new("config.toml").exists());
}

#[test]
fn the_twenty_first_backup_evicts_the_oldest() {
    // Ruling 21: the newest 20 backups per file are kept.
    let bench = bench();
    let path = bench.home.join("settings.json");
    fs::write(&path, numbered(0)).unwrap();

    let mut receipts = Vec::new();
    for n in 1..=20 {
        receipts.push(replace(&bench, &path, &numbered(n - 1), &numbered(n), Format::StrictJson));
    }
    assert_eq!(backups_in(&bench.backups).len(), 20, "twenty writes keep twenty backups");
    assert!(backup_of(&bench, &receipts[0]).exists());

    receipts.push(replace(&bench, &path, &numbered(20), &numbered(21), Format::StrictJson));

    assert_eq!(backups_in(&bench.backups).len(), 20);
    assert_eq!(receipt_files_in(&bench.backups).len(), 20);
    let oldest = backup_of(&bench, &receipts[0]);
    assert!(!oldest.exists(), "the oldest backup outlived the twenty-first");
    assert!(backup_of(&bench, &receipts[1]).exists(), "the second-oldest backup was evicted too");
    assert!(backup_of(&bench, &receipts[20]).exists());
    let listed: Vec<String> = apply::latest_receipts(&bench.backups).into_iter().map(|r| r.id).collect();
    let newest_twenty: Vec<String> = receipts[1..].iter().rev().map(|r| r.id.clone()).collect();
    assert_eq!(listed, newest_twenty);

    // A write whose backup was evicted can no longer be undone.
    let result = apply::undo(&receipts[0].id, &bench.backups);
    assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{result:?}");
    assert_eq!(fs::read_to_string(&path).unwrap(), numbered(21));
}

#[test]
fn eviction_removes_the_receipt_with_its_backup_and_leaves_other_files_alone() {
    let bench = bench();
    // Two files with one name, so only the path can tell their backups apart.
    let (quiet_dir, busy_dir) = (bench.home.join("quiet"), bench.home.join("busy"));
    fs::create_dir(&quiet_dir).unwrap();
    fs::create_dir(&busy_dir).unwrap();
    let (quiet, busy) = (quiet_dir.join("settings.json"), busy_dir.join("settings.json"));
    fs::write(&quiet, numbered(0)).unwrap();
    fs::write(&busy, numbered(0)).unwrap();

    let quiet_first = replace(&bench, &quiet, &numbered(0), &numbered(1), Format::StrictJson);
    let mut busy_receipts = Vec::new();
    for n in 1..=22 {
        busy_receipts.push(replace(&bench, &busy, &numbered(n - 1), &numbered(n), Format::StrictJson));
    }
    let quiet_second = replace(&bench, &quiet, &numbered(1), &numbered(2), Format::StrictJson);

    // The busy file is down to twenty; both of the quiet file's are still
    // there, though the first is older than everything that was evicted.
    let quiet_path = quiet.to_str().unwrap();
    let listed = apply::latest_receipts(&bench.backups);
    let of_quiet: Vec<&Receipt> = listed.iter().filter(|r| r.path == quiet_path).collect();
    assert_eq!(of_quiet, vec![&quiet_second, &quiet_first]);
    assert_eq!(listed.len(), 22);
    assert!(backup_of(&bench, &quiet_first).exists());
    assert!(backup_of(&bench, &quiet_second).exists());

    // Each evicted backup took its receipt file with it, and each receipt
    // file left has its backup beside it.
    for evicted in &busy_receipts[..2] {
        let backup = backup_of(&bench, evicted);
        assert!(!backup.exists(), "{}", backup.display());
        assert!(!PathBuf::from(format!("{}{RECEIPT_SUFFIX}", backup.display())).exists(), "an evicted backup left its receipt");
    }
    let backups = backups_in(&bench.backups);
    let receipt_files = receipt_files_in(&bench.backups);
    assert_eq!(backups.len(), 22);
    let expected: Vec<String> = backups.iter().map(|name| format!("{name}{RECEIPT_SUFFIX}")).collect();
    assert_eq!(receipt_files, expected);

    // The quiet file's first write is still undoable in the only way that
    // matters: its backup is there to read.
    assert_eq!(fs::read_to_string(backup_of(&bench, &quiet_first)).unwrap(), numbered(0));
}

#[test]
fn receipts_list_newest_first() {
    let bench = bench();
    assert_eq!(apply::latest_receipts(&bench.backups), Vec::<Receipt>::new(), "a folder that is not there has no receipts");

    let accept = |_: &str| true;
    let at = |at_ms: i64| Seams { at_ms, verify: &accept };
    let (a, b) = (bench.home.join("a.json"), bench.home.join("b.json"));
    fs::write(&a, numbered(0)).unwrap();
    fs::write(&b, numbered(0)).unwrap();
    // Written out of order, across two files, so neither the order of the
    // calls nor the order of the names can stand in for the time.
    let middle = apply::safe_replace_with(&b, Some(&numbered(0)), &numbered(1), Format::StrictJson, &bench.backups, WHAT, at(2_000)).unwrap();
    let newest = apply::safe_replace_with(&a, Some(&numbered(0)), &numbered(1), Format::StrictJson, &bench.backups, WHAT, at(3_000)).unwrap();
    let oldest = apply::safe_replace_with(&b, Some(&numbered(1)), &numbered(2), Format::StrictJson, &bench.backups, WHAT, at(1_000)).unwrap();
    assert_eq!([middle.at_ms, newest.at_ms, oldest.at_ms], [2_000, 3_000, 1_000]);

    // Receipt files that cannot be read as receipts are skipped.
    fs::write(bench.backups.join("junk.receipt.json"), "not json").unwrap();
    fs::write(bench.backups.join("other.receipt.json"), "{\"id\": 4}").unwrap();
    fs::create_dir(bench.backups.join("folder.receipt.json")).unwrap();
    // So is a receipt under a name that is not the one its own path and time
    // give: a copy of a real one, renamed.
    let mut stray = newest.clone();
    stray.id = "stray".to_string();
    fs::write(bench.backups.join("stray.receipt.json"), serde_json::to_string(&stray).unwrap()).unwrap();
    // And one that names a backup other than the file it sits beside: a
    // receipt is not followed to a file elsewhere. This is a fourth write's
    // own receipt, in place, with only that field changed.
    let rewritten = apply::safe_replace_with(&a, Some(&numbered(1)), &numbered(2), Format::StrictJson, &bench.backups, WHAT, at(4_000)).unwrap();
    let its_receipt_file = bench.backups.join(format!("{}{RECEIPT_SUFFIX}", rewritten.backup_file.as_ref().unwrap()));
    assert!(apply::latest_receipts(&bench.backups).contains(&rewritten), "the fourth write is not listed, so its removal below proves nothing");
    let mut elsewhere = rewritten.clone();
    elsewhere.backup_file = Some("../../home/b.json".to_string());
    fs::write(&its_receipt_file, serde_json::to_string(&elsewhere).unwrap()).unwrap();

    assert_eq!(apply::latest_receipts(&bench.backups), vec![newest, middle, oldest]);
    for id in ["stray", rewritten.id.as_str()] {
        let result = apply::undo(id, &bench.backups);
        assert!(matches!(result, Err(ApplyError::NotUndoable(_))), "{id}: {result:?}");
    }
    assert_eq!(fs::read_to_string(&a).unwrap(), numbered(2));
    assert_eq!(fs::read_to_string(&b).unwrap(), numbered(2));
}

#[test]
fn a_receipt_carries_no_file_content() {
    let bench = bench();
    let path = bench.home.join("config.toml");
    // Both sides of the write hold a value; neither may reach the receipt.
    let before = format!("[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[mcp_servers.alpha.env]\nSETTING = \"{MARKER}\"\n");
    let next = format!("{before}\n[mcp_servers.beta]\ncommand = \"second-{MARKER}\"\n");
    fs::write(&path, &before).unwrap();

    let receipt = replace(&bench, &path, &before, &next, Format::Toml);
    let undone = apply::undo(&receipt.id, &bench.backups).expect("undo");

    for receipt in [&receipt, &undone] {
        let json = serde_json::to_string(receipt).unwrap();
        assert!(!json.contains(MARKER), "a serialised receipt carries file content: {json}");
        assert!(!format!("{receipt:?}").contains(MARKER), "{receipt:?}");
    }
    let receipt_files = receipt_files_in(&bench.backups);
    assert_eq!(receipt_files.len(), 2);
    for name in receipt_files {
        assert!(!name.contains(MARKER), "{name}");
        let on_disk = fs::read_to_string(bench.backups.join(&name)).unwrap();
        assert!(!on_disk.contains(MARKER), "{name} carries file content");
        // What it does carry: exactly the receipt's own fields.
        let value: serde_json::Value = serde_json::from_str(&on_disk).unwrap();
        let mut keys: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["after_sha256", "at_ms", "backup_file", "before_sha256", "id", "path", "what"]);
    }
    // The backups do hold it: that is what a backup is, and where the marker
    // is allowed to be.
    assert!(fs::read_to_string(backup_of(&bench, &receipt)).unwrap().contains(MARKER));
}

#[test]
fn two_writes_in_one_millisecond_do_not_collide() {
    let bench = bench();
    let path = bench.home.join("settings.json");
    fs::write(&path, numbered(0)).unwrap();
    let accept = |_: &str| true;
    let same_instant = || Seams { at_ms: 1_732_400_000_000, verify: &accept };

    let first = apply::safe_replace_with(&path, Some(&numbered(0)), &numbered(1), Format::StrictJson, &bench.backups, WHAT, same_instant()).unwrap();
    let second = apply::safe_replace_with(&path, Some(&numbered(1)), &numbered(2), Format::StrictJson, &bench.backups, WHAT, same_instant()).unwrap();
    let third = apply::safe_replace_with(&path, Some(&numbered(2)), &numbered(3), Format::StrictJson, &bench.backups, WHAT, same_instant()).unwrap();

    // Three backups, each still holding what its own write replaced.
    assert_eq!(backups_in(&bench.backups).len(), 3);
    for (receipt, replaced) in [(&first, 0), (&second, 1), (&third, 2)] {
        assert_eq!(fs::read_to_string(backup_of(&bench, receipt)).unwrap(), numbered(replaced));
    }
    // And they still list in the order they happened.
    assert_eq!(apply::latest_receipts(&bench.backups), vec![third.clone(), second, first]);
    apply::undo(&third.id, &bench.backups).expect("undo");
    assert_eq!(fs::read_to_string(&path).unwrap(), numbered(2));

    // The same for two writes that each create a file of one name, in one
    // millisecond, with the first removed in between.
    let created = bench.home.join("mcp-server-enablement.json");
    let one = apply::safe_replace_with(&created, None, &numbered(1), Format::StrictJson, &bench.backups, WHAT, same_instant()).unwrap();
    fs::remove_file(&created).unwrap();
    let two = apply::safe_replace_with(&created, None, &numbered(2), Format::StrictJson, &bench.backups, WHAT, same_instant()).unwrap();
    let ids: Vec<String> = apply::latest_receipts(&bench.backups).into_iter().map(|r| r.id).collect();
    assert!(ids.contains(&one.id) && ids.contains(&two.id), "one creation's receipt overwrote the other's");
}

#[test]
fn an_apply_error_never_quotes_the_file() {
    // The file on disk holds a value, the caller's stale copy holds one, and
    // so does the text to write. Whatever is refused, none is repeated.
    let bench = bench();
    let path = bench.home.join("config.toml");
    let on_disk = format!("[mcp_servers.alpha]\ncommand = \"disk-{MARKER}\"\n");
    let stale = format!("[mcp_servers.alpha]\ncommand = \"stale-{MARKER}\"\n");
    let next = format!("[mcp_servers.alpha]\ncommand = \"next-{MARKER}\"\n");
    fs::write(&path, &on_disk).unwrap();

    let refuse = |_: &str| false;
    let results = [
        apply::safe_replace(&path, Some(&stale), &next, Format::Toml, &bench.backups, WHAT),
        apply::safe_replace(&path, None, &next, Format::Toml, &bench.backups, WHAT),
        apply::safe_replace(&path, Some(&on_disk), &format!("{next}[broken"), Format::Toml, &bench.backups, WHAT),
        apply::safe_replace_with(&path, Some(&on_disk), &next, Format::Toml, &bench.backups, WHAT, Seams { at_ms: 1_000, verify: &refuse }),
        apply::safe_replace(&bench.home.join("gone").join("config.toml"), None, &next, Format::Toml, &bench.backups, WHAT),
    ];
    let kinds: Vec<&str> = results
        .iter()
        .map(|result| match result {
            Err(ApplyError::ChangedSinceRead) => "changed",
            Err(ApplyError::Verify(_)) => "verify",
            Err(ApplyError::Write(_)) => "write",
            other => panic!("expected a refusal, got {other:?}"),
        })
        .collect();
    assert_eq!(kinds, ["changed", "changed", "verify", "verify", "write"]);
    for result in &results {
        assert!(!format!("{result:?}").contains(MARKER), "an error quotes the file: {result:?}");
    }
    assert_eq!(fs::read_to_string(&path).unwrap(), on_disk);
}

// ---------------------------------------------------------------------------
// Claude Code, switched through its own command: `mcp::switch::vendor`.
//
// Every test works in a temp directory of its own. The `claude` here is a
// `#!/bin/sh` script the test writes, which does what the real one was
// measured to do (the engine matrix, "Claude Code"): it never is the real
// CLI, and nothing under the real home is read. The script needs only sh,
// cat, cp, mv, ls, grep, chmod and sleep.
// ---------------------------------------------------------------------------

use std::time::{Duration, Instant};

use tauri_app_lib::mcp::switch::vendor::{self, StashedServer, SwitchError};

/// What the kept entries hold. None of these may appear in anything Hanger
/// says about a kept server.
const KEPT_COMMAND: &str = "beta-server-cmd";
const KEPT_ARG: &str = "two words";
const KEPT_ENV_VALUE: &str = "fixture-value-1";
const KEPT_QUERY_VALUE: &str = "fixture-value-3";
const KEPT_HEADER_VALUE: &str = "fixture-value-4";
const KEPT_VALUES: [&str; 5] = [KEPT_COMMAND, KEPT_ARG, KEPT_ENV_VALUE, KEPT_QUERY_VALUE, KEPT_HEADER_VALUE];

/// A user-scope server whose keys are in no sorted order: `type` before
/// `command`, `ZED_SETTING` before `ALPHA_SETTING`. A copy that went through
/// a sorted map would not give these back as written.
const BETA: &str = r#"{
      "type": "stdio",
      "command": "beta-server-cmd",
      "args": ["serve", "--flag", "two words"],
      "env": {
        "ZED_SETTING": "fixture-value-1",
        "ALPHA_SETTING": "x y"
      }
    }"#;
const BETA_KEY_ORDER: [&str; 6] = ["\"type\"", "\"command\"", "\"args\"", "\"env\"", "\"ZED_SETTING\"", "\"ALPHA_SETTING\""];
/// The same server after somebody else edited it.
const BETA_EDITED: &str = r#"{
      "type": "stdio",
      "command": "another-command"
    }"#;
/// A remote server: a query string and a header, both of which can hold a
/// credential.
const DELTA: &str = r#"{
      "type": "http",
      "url": "https://example.test/mcp?setting=fixture-value-3",
      "headers": {
        "X-Setting": "fixture-value-4"
      }
    }"#;

/// The rest of a `.claude.json`: a key that is not a server, one user-scope
/// server that is never switched, and a project with a server of its own.
const CLAUDE_HEAD: &str = "{\n  \"numStartups\": 12,\n  \"mcpServers\": {\n    \"alpha\": {\n      \"command\": \"alpha-server\"\n    }";
const CLAUDE_TAIL: &str = "\n  },\n  \"projects\": {\n    \"/work/app\": {\n      \"mcpServers\": {\n        \"gamma\": {\n          \"command\": \"gamma-server\"\n        }\n      }\n    }\n  }\n}\n";

/// A `.claude.json` with `alpha` and these user-scope servers after it.
fn claude_json(servers: &[(&str, &str)]) -> String {
    let mut text = CLAUDE_HEAD.to_string();
    for (name, entry) in servers {
        text.push_str(&format!(",\n    \"{name}\": {entry}"));
    }
    text + CLAUDE_TAIL
}

fn json(text: &str) -> serde_json::Value {
    serde_json::from_str(text).unwrap_or_else(|e| panic!("not JSON ({e}): {text}"))
}

/// The PATH handed to the fake `claude`: where its own commands live.
const CHILD_PATH: &str = "/usr/bin:/bin";
/// The longest any test waits for the fake. Five seconds, as
/// `engine_status_tests` gives the same kind of script: at two, fourteen of
/// these tests failed at a load average of 81 and all passed at 24
/// (2026-11-25). The three tests whose fake hangs (`sleep 20`) wait this long.
const QUICK_CLI: Duration = Duration::from_secs(5);
const SAYS_REMOVED: &str = "printf 'Removed MCP server %s from user config\\n' \"$3\"";
const SAYS_ADDED: &str = "printf 'Added stdio MCP server %s to user config\\n' \"$3\"";
/// `claude mcp remove` for a server it does not find (measured: exit 1).
const SAYS_NO_SUCH_SERVER: &str = "printf 'No MCP server named \"%s\" in user scope\\n' \"$3\"\nexit 1";

/// A path as one word of a shell script.
fn sh(path: &Path) -> String {
    let text = path.to_str().expect("a UTF-8 temp path");
    assert!(!text.contains('\''), "the temp path cannot be quoted: {text}");
    format!("'{text}'")
}

/// Each needle, in this order, in `text`.
fn assert_in_order(text: &str, needles: &[&str]) {
    let mut from = 0;
    for needle in needles {
        let at = text[from..].find(needle).unwrap_or_else(|| panic!("{needle} is missing, or out of order, in: {text}"));
        from += at + needle.len();
    }
}

/// A temp directory holding a `.claude.json`, a place where Hanger's stash
/// will go, and a fake `claude`.
struct Stage {
    _dir: tempfile::TempDir,
    root: PathBuf,
    config: PathBuf,
    stash: PathBuf,
    cli: PathBuf,
}

fn stage(config_text: &str) -> Stage {
    let dir = tempfile::tempdir().expect("temp dir");
    let root = fs::canonicalize(dir.path()).expect("real temp dir");
    fs::create_dir(root.join("home")).unwrap();
    fs::create_dir(root.join("bin")).unwrap();
    let config = root.join("home").join(".claude.json");
    fs::write(&config, config_text).unwrap();
    Stage { _dir: dir, config, stash: root.join("data").join("switch").join("stash"), cli: root.join("bin").join("claude"), root }
}

impl Stage {
    /// Write the fake `claude`, with a trial run that hands back what it is
    /// given: what the real one does with an entry it knows every key of.
    fn fake(&self, then: &str) {
        self.fake_with_trial(&self.hands_back(), then);
    }

    /// Write the fake `claude`. Like the real one, it writes where
    /// `CLAUDE_CONFIG_DIR` says. That makes two kinds of run:
    ///
    /// - a trial: `add-json` with `CLAUDE_CONFIG_DIR` naming a scratch folder
    ///   inside Hanger's stash. It records its input, that folder and the
    ///   folder's mode, then does `trial`.
    /// - a real one: anything else, which is aimed at the stage's config. It
    ///   records its input, its PATH and the names in the stash folder at
    ///   that moment, then does `then`.
    ///
    /// Every run first notes its kind and appends its arguments, one per line.
    fn fake_with_trial(&self, trial: &str, then: &str) {
        let at = |name: &str| sh(&self.root.join(name));
        let script = format!(
            "#!/bin/sh
kind=real
if [ \"$2\" = add-json ]; then
  case \"$CLAUDE_CONFIG_DIR\" in
    {kept}/.preflight-*) kind=trial ;;
  esac
fi
printf '%s %s\\n' \"$kind\" \"$2\" >> {calls}
for arg in \"$@\"; do printf '%s\\n' \"$arg\"; done >> {argv}
if [ \"$kind\" = trial ]; then
cat > {trial_stdin}
printf '%s' \"$CLAUDE_CONFIG_DIR\" > {trial_dir}
ls -ld \"$CLAUDE_CONFIG_DIR\" > {trial_mode}
printf '%s' \"$PATH\" > {trial_path}
{trial}
exit
fi
cat > {stdin}
printf '%s' \"$PATH\" > {path}
ls {kept} > {seen} 2>/dev/null
{then}
",
            kept = sh(&self.kept_folder()),
            calls = at("calls.log"),
            argv = at("argv.log"),
            trial_stdin = at("trial-stdin.log"),
            trial_dir = at("trial-dir.log"),
            trial_mode = at("trial-mode.log"),
            trial_path = at("trial-path.log"),
            stdin = at("stdin.log"),
            path = at("path.log"),
            seen = at("seen.log"),
        );
        fs::write(&self.cli, script).unwrap();
        fs::set_permissions(&self.cli, fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// Trial script: write back the entry that arrived on stdin, as it came.
    fn hands_back(&self) -> String {
        format!(
            "{{ printf '{{\"mcpServers\": {{\"%s\": ' \"$3\"; cat {}; printf '}}}}'; }} > \"$CLAUDE_CONFIG_DIR/.claude.json\"\n{SAYS_ADDED}",
            sh(&self.root.join("trial-stdin.log")),
        )
    }

    /// Trial script: write `wrote` as the scratch folder's `.claude.json`,
    /// whatever arrived, and report success.
    fn writes_instead(&self, wrote: &str) -> String {
        format!("cp {} \"$CLAUDE_CONFIG_DIR/.claude.json\"\n{SAYS_ADDED}", sh(&self.bake("trial-wrote.json", wrote)))
    }

    /// A file for the fake to copy into place.
    fn bake(&self, name: &str, text: &str) -> PathBuf {
        let path = self.root.join(name);
        fs::write(&path, text).unwrap();
        path
    }

    /// Script: leave `after` as the config, the way a command that worked
    /// leaves the file changed.
    fn leaves(&self, after: &str) -> String {
        format!("cp {} {}", sh(&self.bake("after.json", after)), sh(&self.config))
    }

    /// Script: what `claude mcp remove` does when it works.
    fn removes(&self, after: &str) -> String {
        format!("{}\n{SAYS_REMOVED}", self.leaves(after))
    }

    /// Script: what `claude mcp add-json <name> -` does when it works. The
    /// entry that lands in the config is the one that arrived on stdin, put
    /// after `servers`.
    fn adds(&self, name: &str, servers: &[(&str, &str)]) -> String {
        let whole = claude_json(servers);
        let head = whole.strip_suffix(CLAUDE_TAIL).unwrap();
        let before = self.bake("add-head.json", &format!("{head},\n    \"{name}\": "));
        let after = self.bake("add-tail.json", CLAUDE_TAIL);
        let next = self.root.join("next.json");
        format!(
            "cat {} {} {} > {} && mv {} {}\n{SAYS_ADDED}",
            sh(&before),
            sh(&self.root.join("stdin.log")),
            sh(&after),
            sh(&next),
            sh(&next),
            sh(&self.config),
        )
    }

    async fn off(&self, name: &str) -> Result<StashedServer, SwitchError> {
        vendor::claude_off_within(&self.config, name, &self.stash, &self.cli, CHILD_PATH, QUICK_CLI).await
    }

    async fn on(&self, id: &str) -> Result<StashedServer, SwitchError> {
        vendor::claude_on_within(&self.config, id, &self.stash, &self.cli, CHILD_PATH, QUICK_CLI).await
    }

    fn log(&self, name: &str) -> String {
        fs::read_to_string(self.root.join(name)).unwrap_or_default()
    }

    /// Whether the fake was ever started.
    fn ran(&self) -> bool {
        self.root.join("argv.log").exists()
    }

    /// Each run of the fake, in order: `trial add-json`, `real remove` or
    /// `real add-json`.
    fn calls(&self) -> Vec<String> {
        self.log("calls.log").lines().map(str::to_string).collect()
    }

    /// The scratch folder the last trial run was pointed at.
    fn trial_folder(&self) -> PathBuf {
        PathBuf::from(self.log("trial-dir.log"))
    }

    /// Every argument the fake has been given, across all its runs.
    fn argv(&self) -> Vec<String> {
        self.log("argv.log").lines().map(str::to_string).collect()
    }

    /// What the fake's last real run read on stdin.
    fn stdin(&self) -> String {
        self.log("stdin.log")
    }

    /// The names in the stash folder at the moment the fake's last real run
    /// started.
    fn kept_when_the_cli_ran(&self) -> Vec<String> {
        self.log("seen.log").lines().map(str::to_string).collect()
    }

    fn forget_runs(&self) {
        for name in ["calls.log", "argv.log", "stdin.log", "path.log", "seen.log", "trial-stdin.log", "trial-dir.log", "trial-mode.log", "trial-path.log"] {
            let _ = fs::remove_file(self.root.join(name));
        }
    }

    fn kept_folder(&self) -> PathBuf {
        self.stash.join("claude-code")
    }

    /// Every name in the stash folder, a scratch folder included.
    fn kept_files(&self) -> Vec<String> {
        names_in(&self.kept_folder())
    }

    fn config_text(&self) -> String {
        fs::read_to_string(&self.config).expect("the config")
    }

    /// The user-scope entry of that name in the config now.
    fn entry(&self, name: &str) -> Option<serde_json::Value> {
        json(&self.config_text()).get("mcpServers")?.get(name).cloned()
    }

    /// Put a stash file in place by hand, in the layout Hanger writes.
    fn keep_by_hand(&self, id: &str, name: &str, at_ms: i64, entry: &str) -> PathBuf {
        fs::create_dir_all(self.kept_folder()).unwrap();
        let path = self.kept_folder().join(format!("{id}.json"));
        let name = serde_json::Value::from(name);
        fs::write(&path, format!("{{\"id\": \"{id}\", \"name\": {name}, \"scope\": \"user\", \"at_ms\": {at_ms}, \"entry\": {entry}}}")).unwrap();
        path
    }
}

/// `beta` switched off on a stage that began with it: the stage, what
/// `claude_off` returned, and the stash file's name. The fake's logs are
/// cleared, so what a test reads from them afterwards is its own run.
async fn with_beta_off() -> (Stage, StashedServer, String) {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(&stage.removes(&claude_json(&[])));
    let kept = stage.off("beta").await.expect("beta is switched off");
    stage.forget_runs();
    let file = format!("{}.json", kept.id);
    assert_eq!(stage.kept_files(), vec![file.clone()]);
    (stage, kept, file)
}

#[tokio::test]
async fn the_stash_exists_before_remove_runs() {
    // Review focus 6: were Hanger to stop between the remove and the keeping,
    // the server would be in neither place.
    let stage = stage(&claude_json(&[("beta", BETA)]));
    // The fake refuses, and changes nothing, unless the entry is already in
    // the stash folder when it is started.
    let looks = format!("cat {}/*.json 2>/dev/null | grep -q '{KEPT_ENV_VALUE}' || exit 3", sh(&stage.kept_folder()));
    stage.fake(&format!("{looks}\n{}", stage.removes(&claude_json(&[]))));

    let kept = stage.off("beta").await.expect("the entry was kept before the remove ran");

    assert_eq!(stage.entry("beta"), None, "the remove did not happen");
    assert_eq!(stage.entry("alpha"), Some(json("{\"command\": \"alpha-server\"}")));
    assert_eq!(stage.kept_when_the_cli_ran(), vec![format!("{}.json", kept.id)]);
    assert_eq!(stage.kept_files(), vec![format!("{}.json", kept.id)]);
}

#[tokio::test]
async fn the_kept_file_holds_the_entry_as_written_and_is_private() {
    let (stage, kept, file) = with_beta_off().await;

    assert_eq!(mode_of(&stage.kept_folder()), 0o700);
    assert_eq!(mode_of(&stage.stash), 0o700, "a folder made on the way is private too");
    assert_eq!(mode_of(&stage.kept_folder().join(&file)), 0o600);

    let text = fs::read_to_string(stage.kept_folder().join(&file)).unwrap();
    let on_disk = json(&text);
    let mut keys: Vec<&str> = on_disk.as_object().unwrap().keys().map(String::as_str).collect();
    keys.sort_unstable();
    assert_eq!(keys, ["at_ms", "entry", "id", "name", "scope"]);
    assert_eq!(on_disk["id"], kept.id.as_str());
    assert_eq!(on_disk["name"], "beta");
    assert_eq!(on_disk["scope"], "user");
    assert_eq!(on_disk["at_ms"], kept.at_ms);
    assert_eq!(on_disk["entry"], json(BETA));
    assert_in_order(&text, &BETA_KEY_ORDER);

    assert!(uuid::Uuid::parse_str(&kept.id).is_ok(), "the id is not a uuid: {}", kept.id);
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    assert!((now - 60_000..=now).contains(&kept.at_ms), "at_ms is not this minute: {} against {now}", kept.at_ms);
}

#[tokio::test]
async fn off_and_on_run_claude_codes_own_two_commands() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(&stage.removes(&claude_json(&[])));
    let kept = stage.off("beta").await.expect("off");

    // The trial `add-json`, then the remove.
    assert_eq!(stage.calls(), ["trial add-json", "real remove"]);
    assert_eq!(stage.argv(), ["mcp", "add-json", "beta", "-", "--scope", "user", "mcp", "remove", "beta", "--scope", "user"]);
    assert_eq!(stage.stdin(), "", "a remove is handed nothing on stdin");
    assert_eq!(stage.log("path.log"), CHILD_PATH, "the search path given is the child's PATH");
    assert_eq!(stage.log("trial-path.log"), CHILD_PATH);

    stage.forget_runs();
    stage.fake(&stage.adds("beta", &[]));
    stage.on(&kept.id).await.expect("on");

    assert_eq!(stage.calls(), ["real add-json"]);
    assert_eq!(stage.argv(), ["mcp", "add-json", "beta", "-", "--scope", "user"]);
    assert_eq!(stage.log("path.log"), CHILD_PATH);
}

#[tokio::test]
async fn a_remove_that_exits_nonzero_is_an_error() {
    // Measured: `claude mcp remove` exits 1 for a server it does not find,
    // which is what happens if it is looking at another file than Hanger is.
    let before = claude_json(&[("beta", BETA)]);
    let stage = stage(&before);
    stage.fake(SAYS_NO_SUCH_SERVER);

    assert_eq!(stage.off("beta").await, Err(SwitchError::CliFailed));

    assert_eq!(stage.calls(), ["trial add-json", "real remove"]);
    assert_eq!(stage.argv()[6..], ["mcp", "remove", "beta", "--scope", "user"]);
    assert_eq!(stage.config_text(), before);
}

#[tokio::test]
async fn a_failed_remove_leaves_no_stash() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(SAYS_NO_SUCH_SERVER);

    assert_eq!(stage.off("beta").await, Err(SwitchError::CliFailed));

    // It was kept while the command ran, and is not kept now: the server is
    // still declared, so a kept copy would list it as switched off.
    assert_eq!(stage.kept_when_the_cli_ran().len(), 1, "{:?}", stage.kept_when_the_cli_ran());
    assert_eq!(stage.kept_files(), Vec::<String>::new());
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![]);
}

#[tokio::test]
async fn a_remove_that_reports_success_and_changes_nothing_is_a_failure() {
    // The Gemini lesson (engine matrix): `gemini mcp disable` fails and exits
    // 0. The file decides, never the exit status.
    let before = claude_json(&[("beta", BETA)]);
    let stage = stage(&before);
    stage.fake(SAYS_REMOVED);

    assert_eq!(stage.off("beta").await, Err(SwitchError::CliFailed));

    assert!(stage.ran());
    assert_eq!(stage.config_text(), before);
    assert_eq!(stage.kept_when_the_cli_ran().len(), 1);
    assert_eq!(stage.kept_files(), Vec::<String>::new());
}

#[tokio::test]
async fn a_remove_that_timed_out_after_removing_is_a_success() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    // It removes the entry and then never exits. `exec`, so the sleeper is
    // the process that gets killed.
    stage.fake(&format!("{}\nexec /bin/sleep 20", stage.leaves(&claude_json(&[]))));

    // The whole wait: the fake has to have changed the file before it is
    // killed, or this is a different case (a remove that never happened).
    let started = Instant::now();
    let result = stage.off("beta").await;
    let elapsed = started.elapsed();

    let kept = result.expect("the entry is gone from the file, so the server is off");
    assert!(elapsed >= QUICK_CLI - Duration::from_millis(100), "the command was not waited for: {elapsed:?}");
    assert!(elapsed < Duration::from_secs(10), "the command was not given up on: {elapsed:?}");
    assert_eq!(stage.entry("beta"), None);
    assert_eq!(stage.kept_files(), vec![format!("{}.json", kept.id)]);
}

#[tokio::test]
async fn an_entry_that_changed_under_the_remove_is_not_verified_and_stays_kept() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    let edited = claude_json(&[("beta", BETA_EDITED)]);
    stage.fake(&stage.removes(&edited));

    assert_eq!(stage.off("beta").await, Err(SwitchError::NotVerified));

    // The copy of what Hanger read is the only one there is now.
    assert_eq!(stage.config_text(), edited);
    let listed = vendor::claude_stashed(&stage.stash);
    assert_eq!(listed.len(), 1);
    let kept: serde_json::Value = json(&fs::read_to_string(stage.kept_folder().join(format!("{}.json", listed[0].id))).unwrap());
    assert_eq!(kept["entry"], json(BETA));
}

#[tokio::test]
async fn a_config_that_cannot_be_read_back_is_not_verified_and_stays_kept() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(&stage.removes("{ this is not JSON"));

    assert_eq!(stage.off("beta").await, Err(SwitchError::NotVerified));
    assert_eq!(stage.kept_files().len(), 1);

    // The same before an `on`: with a file that cannot say whether the name
    // is free, the command is not run.
    let id = vendor::claude_stashed(&stage.stash)[0].id.clone();
    stage.forget_runs();
    assert_eq!(stage.on(&id).await, Err(SwitchError::NotVerified));
    assert!(!stage.ran());
    assert_eq!(stage.kept_files().len(), 1);
}

#[tokio::test]
async fn on_restores_env_args_and_type() {
    let (stage, kept, _) = with_beta_off().await;
    stage.fake(&stage.adds("beta", &[]));

    let back = stage.on(&kept.id).await.expect("on");

    // What Claude Code was handed is the entry as it was written.
    let sent = stage.stdin();
    assert_eq!(json(&sent), json(BETA));
    assert_in_order(&sent, &BETA_KEY_ORDER);
    // And its file has the server again, env, args and type included.
    let entry = stage.entry("beta").expect("beta is declared again");
    assert_eq!(entry, json(BETA));
    assert_eq!(entry["type"], "stdio");
    assert_eq!(entry["args"], serde_json::json!(["serve", "--flag", KEPT_ARG]));
    assert_eq!(entry["env"], serde_json::json!({"ZED_SETTING": KEPT_ENV_VALUE, "ALPHA_SETTING": "x y"}));
    assert_eq!(back, kept, "on reports the server it gave back");
}

#[tokio::test]
async fn the_stash_is_deleted_only_after_the_entry_is_back() {
    let (stage, kept, file) = with_beta_off().await;

    // An add that says it worked and added nothing: the entry is not back.
    stage.fake(SAYS_ADDED);
    assert_eq!(stage.on(&kept.id).await, Err(SwitchError::CliFailed));
    assert_eq!(stage.kept_when_the_cli_ran(), vec![file.clone()]);
    assert_eq!(stage.kept_files(), vec![file.clone()], "the only copy was deleted with the server still gone");

    // An add that works: kept while it ran, deleted once the file has it.
    stage.fake(&stage.adds("beta", &[]));
    stage.on(&kept.id).await.expect("on");
    assert_eq!(stage.kept_when_the_cli_ran(), vec![file]);
    assert_eq!(stage.entry("beta"), Some(json(BETA)));
    assert_eq!(stage.kept_files(), Vec::<String>::new());
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![]);
}

#[tokio::test]
async fn an_add_that_reports_success_and_adds_nothing_is_a_failure_and_stays_kept() {
    let (stage, kept, file) = with_beta_off().await;
    let without = stage.config_text();
    let kept_bytes = fs::read(stage.kept_folder().join(&file)).unwrap();
    stage.fake(SAYS_ADDED);

    assert_eq!(stage.on(&kept.id).await, Err(SwitchError::CliFailed));

    assert!(stage.ran());
    assert_eq!(stage.config_text(), without);
    assert_eq!(fs::read(stage.kept_folder().join(&file)).unwrap(), kept_bytes);
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![kept]);
}

#[tokio::test]
async fn an_add_that_adds_a_different_entry_is_not_verified_and_stays_kept() {
    let (stage, kept, file) = with_beta_off().await;
    stage.fake(&format!("{}\n{SAYS_ADDED}", stage.leaves(&claude_json(&[("beta", BETA_EDITED)]))));

    assert_eq!(stage.on(&kept.id).await, Err(SwitchError::NotVerified));

    assert_eq!(stage.kept_files(), vec![file]);
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![kept]);
}

#[tokio::test]
async fn on_when_the_name_is_declared_again_is_already_there() {
    let (stage, kept, file) = with_beta_off().await;
    // The user added a server of that name themselves, meanwhile.
    let readded = claude_json(&[("beta", BETA_EDITED)]);
    fs::write(&stage.config, &readded).unwrap();
    stage.fake(&stage.adds("beta", &[]));

    assert_eq!(stage.on(&kept.id).await, Err(SwitchError::AlreadyThere));

    assert!(!stage.ran(), "the command was run over a server the user declared: {:?}", stage.argv());
    assert_eq!(stage.config_text(), readded);
    assert_eq!(stage.kept_files(), vec![file]);
}

#[tokio::test]
async fn when_the_kept_copy_cannot_be_deleted_the_caller_is_told() {
    let (stage, kept, file) = with_beta_off().await;
    // The add works, and the stash folder stops accepting changes.
    stage.fake(&format!("{}\nchmod 500 {}", stage.adds("beta", &[]), sh(&stage.kept_folder())));

    let result = stage.on(&kept.id).await;
    fs::set_permissions(stage.kept_folder(), fs::Permissions::from_mode(0o700)).unwrap();

    // The server is back, and still listed as kept: not a clean success.
    assert!(matches!(result, Err(SwitchError::StashFailed(_))), "{result:?}");
    assert_eq!(stage.entry("beta"), Some(json(BETA)));
    assert_eq!(stage.kept_files(), vec![file]);
}

#[tokio::test]
async fn secrets_go_over_stdin_never_argv() {
    // Review focus 7. Arguments are in the process table for any user of the
    // machine to read.
    assert!(BETA.contains(KEPT_ENV_VALUE) && BETA.contains(KEPT_COMMAND) && BETA.contains(KEPT_ARG));
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(&stage.removes(&claude_json(&[])));
    let kept = stage.off("beta").await.expect("off");
    stage.fake(&stage.adds("beta", &[]));
    let on = stage.on(&kept.id).await;

    // Every run's arguments: the trial add's, the remove's, then the add's.
    let argv = stage.argv();
    for value in [KEPT_ENV_VALUE, KEPT_COMMAND, KEPT_ARG, "ZED_SETTING"] {
        assert!(!argv.iter().any(|arg| arg.contains(value)), "{value} was passed as an argument: {argv:?}");
    }
    assert_eq!(argv.len(), 17, "five arguments to remove and six to each add-json: {argv:?}");
    assert!(stage.stdin().contains(KEPT_ENV_VALUE), "the entry did not arrive on stdin: {:?}", stage.stdin());
    on.expect("on");
}

#[tokio::test]
async fn stashed_listing_carries_key_names_only() {
    for (entry, value) in [(BETA, KEPT_COMMAND), (BETA, KEPT_ARG), (BETA, KEPT_ENV_VALUE), (DELTA, KEPT_QUERY_VALUE), (DELTA, KEPT_HEADER_VALUE)] {
        assert!(entry.contains(value), "the fixture no longer holds {value}");
    }
    let stage = stage(&claude_json(&[("beta", BETA), ("delta", DELTA)]));
    stage.fake(&stage.removes(&claude_json(&[("delta", DELTA)])));
    let beta = stage.off("beta").await.expect("beta off");
    stage.fake(&stage.removes(&claude_json(&[])));
    let delta = stage.off("delta").await.expect("delta off");

    let listed = vendor::claude_stashed(&stage.stash);
    assert_eq!(listed.len(), 2);
    assert!(listed.contains(&beta) && listed.contains(&delta), "the listing is not what off returned: {listed:?}");

    for said in [serde_json::to_string(&listed).unwrap(), serde_json::to_string(&[&beta, &delta]).unwrap(), format!("{listed:?}")] {
        for value in KEPT_VALUES {
            assert!(!said.contains(value), "a value from the entry ({value}) is in: {said}");
        }
        // The names are there: that is what a kept server may say.
        assert!(said.contains("ZED_SETTING") && said.contains("ALPHA_SETTING"), "{said}");
    }
    for server in &listed {
        let value = serde_json::to_value(server).unwrap();
        let mut keys: Vec<&str> = value.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["at_ms", "env_keys", "id", "name", "scope", "transport"]);
    }

    assert_eq!((beta.name.as_str(), beta.scope.as_str(), beta.transport.as_str()), ("beta", "user", "stdio"));
    assert_eq!(beta.env_keys, ["ALPHA_SETTING", "ZED_SETTING"]);
    // A remote server's transport is its address with the query string cut.
    assert_eq!((delta.name.as_str(), delta.scope.as_str(), delta.transport.as_str()), ("delta", "user", "https://example.test/mcp"));
    assert_eq!(delta.env_keys, Vec::<String>::new());
}

#[tokio::test]
async fn stashed_skips_a_malformed_file_and_lists_newest_first() {
    let stage = stage(&claude_json(&[]));
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![], "a stash folder that is not there holds nothing");

    let id = |n: u32| format!("00000000-0000-4000-8000-{n:012}");
    let entry = "{\"command\": \"kept-server\"}";
    stage.keep_by_hand(&id(1), "oldest", 100, entry);
    stage.keep_by_hand(&id(2), "newest", 300, entry);
    stage.keep_by_hand(&id(3), "middle", 200, entry);

    // None of these is a kept server.
    let folder = stage.kept_folder();
    fs::write(folder.join(format!("{}.json", id(4))), "{ not JSON").unwrap();
    fs::write(folder.join(format!("{}.json", id(5))), format!("{{\"id\": \"{}\", \"name\": \"other-id\", \"scope\": \"user\", \"at_ms\": 900, \"entry\": {entry}}}", id(6))).unwrap();
    fs::write(folder.join(format!("{}.json", id(7))), format!("{{\"id\": \"{}\", \"name\": \"other-scope\", \"scope\": \"project\", \"at_ms\": 900, \"entry\": {entry}}}", id(7))).unwrap();
    fs::write(folder.join(format!("{}.json", id(8))), format!("{{\"id\": \"{}\", \"name\": \"no-entry\", \"scope\": \"user\", \"at_ms\": 900}}", id(8))).unwrap();
    stage.keep_by_hand(&id(9), "entry-is-text", 900, "\"kept-server\"");
    stage.keep_by_hand("not-an-id", "odd-file-name", 900, entry);
    fs::write(folder.join(id(10)), format!("{{\"id\": \"{}\", \"name\": \"no-extension\", \"scope\": \"user\", \"at_ms\": 900, \"entry\": {entry}}}", id(10))).unwrap();

    let listed = vendor::claude_stashed(&stage.stash);
    let names: Vec<&str> = listed.iter().map(|server| server.name.as_str()).collect();
    assert_eq!(names, ["newest", "middle", "oldest"]);
    assert_eq!(listed[0].id, id(2));
    assert_eq!(listed[0].at_ms, 300);

    // And none of them can be switched on.
    stage.fake(&stage.adds("beta", &[]));
    for odd in [id(4), id(5), id(6), id(7), id(8), id(9), "not-an-id".to_string(), id(10), id(11), "../../home/.claude".to_string(), String::new()] {
        assert_eq!(stage.on(&odd).await, Err(SwitchError::NotFound), "{odd}");
    }
    assert!(!stage.ran());
}

#[tokio::test]
async fn a_name_that_would_read_as_an_option_is_refused_and_the_cli_is_not_run() {
    // Each name is declared, so "no such server" is not why it is refused.
    let names = ["-beta", "--scope", "", "be\nta", "be\u{7}ta"];
    let mut servers = serde_json::Map::new();
    for name in names {
        servers.insert(name.to_string(), serde_json::json!({"command": "odd-server"}));
    }
    let before = serde_json::json!({ "mcpServers": servers }).to_string();
    let stage = stage(&before);
    stage.fake(&stage.removes("{}"));

    for name in names {
        assert_eq!(stage.off(name).await, Err(SwitchError::NameRefused), "{name:?}");
    }
    assert!(!stage.ran(), "{:?}", stage.argv());
    assert_eq!(stage.kept_files(), Vec::<String>::new());
    assert_eq!(stage.config_text(), before);

    // A kept file that names one is refused on the way back, too.
    let id = "00000000-0000-4000-8000-000000000001";
    fs::write(&stage.config, "{\"mcpServers\": {}}").unwrap();
    for name in names {
        let file = stage.keep_by_hand(id, name, 1, "{\"command\": \"odd-server\"}");
        assert_eq!(stage.on(id).await, Err(SwitchError::NameRefused), "{name:?}");
        assert!(file.exists());
    }
    assert!(!stage.ran(), "{:?}", stage.argv());
}

#[tokio::test]
async fn only_a_user_scope_server_declared_as_an_object_is_found() {
    let before = claude_json(&[("words", "\"not an entry\"")]);
    let stage = stage(&before);
    stage.fake(&stage.removes("{\"mcpServers\": {}}"));

    // `gamma` is declared, under a project: local scope, which is not switched.
    for name in ["gamma", "nobody", "words", "mcpServers", "numStartups"] {
        assert_eq!(stage.off(name).await, Err(SwitchError::NotFound), "{name}");
    }
    // The control: on the same stage, a user-scope server is found.
    assert!(stage.kept_files().is_empty() && !stage.ran());
    assert_eq!(stage.config_text(), before);
    stage.off("alpha").await.expect("alpha is declared at user scope");

    let missing = self::stage("{}");
    fs::remove_file(&missing.config).unwrap();
    missing.fake(SAYS_REMOVED);
    assert_eq!(missing.off("alpha").await, Err(SwitchError::NotFound));
    assert!(!missing.ran());
}

#[tokio::test]
async fn an_entry_with_a_comment_in_it_is_kept_and_handed_back_as_plain_json() {
    // `dialect` reads this file through `strip_jsonc`, so a server Hanger
    // lists can sit in a file with comments. Claude Code is handed JSON.
    let commented = "{\n      // why this server is here\n      \"command\": \"gamma-cmd\",\n      \"args\": [\"one\",],\n    }";
    let stage = stage(&claude_json(&[("beta", commented)]));
    stage.fake(&stage.removes(&claude_json(&[])));
    let kept = stage.off("beta").await.expect("off");

    let file = fs::read_to_string(stage.kept_folder().join(format!("{}.json", kept.id))).unwrap();
    assert_eq!(json(&file)["entry"], serde_json::json!({"command": "gamma-cmd", "args": ["one"]}));

    stage.fake(&stage.adds("beta", &[]));
    stage.on(&kept.id).await.expect("on");
    assert_eq!(json(&stage.stdin()), serde_json::json!({"command": "gamma-cmd", "args": ["one"]}));
}

#[tokio::test]
async fn a_stash_that_cannot_be_written_stops_the_switch_before_the_cli_runs() {
    let before = claude_json(&[("beta", BETA)]);
    let stage = stage(&before);
    stage.fake(&stage.removes(&claude_json(&[])));
    let run = |stash: PathBuf| {
        let stage = &stage;
        async move { vendor::claude_off_within(&stage.config, "beta", &stash, &stage.cli, CHILD_PATH, QUICK_CLI).await }
    };

    // A stash folder that cannot be made: its parent is a file.
    let blocker = stage.bake("blocker", "a file");
    let under_a_file = run(blocker.join("stash")).await;
    // One that is there and takes no new file.
    let closed = stage.root.join("closed");
    fs::create_dir_all(closed.join("claude-code")).unwrap();
    fs::set_permissions(closed.join("claude-code"), fs::Permissions::from_mode(0o500)).unwrap();
    let read_only = run(closed.clone()).await;
    fs::set_permissions(closed.join("claude-code"), fs::Permissions::from_mode(0o700)).unwrap();
    // One that is relative to wherever the app was started from.
    let relative = PathBuf::from("hanger-test-relative-stash-do-not-create");
    let not_absolute = run(relative.clone()).await;
    let made = relative.exists();
    let _ = fs::remove_dir_all(&relative);

    for result in [&under_a_file, &read_only, &not_absolute] {
        assert!(matches!(result, Err(SwitchError::StashFailed(_))), "{result:?}");
    }
    assert!(!made, "a stash folder was made relative to the working directory");
    // With no kept copy the server is never removed.
    assert!(!stage.ran(), "{:?}", stage.argv());
    assert_eq!(stage.config_text(), before);
}

#[tokio::test]
async fn no_switch_error_quotes_the_entry() {
    let before = claude_json(&[("beta", BETA), ("delta", DELTA)]);
    let stage = stage(&before);
    let blocker = stage.bake("blocker", "a file");

    let mut errors = Vec::new();
    stage.fake(SAYS_NO_SUCH_SERVER);
    errors.push(stage.off("beta").await);
    errors.push(stage.off("-beta").await);
    errors.push(stage.off("nobody").await);
    errors.push(vendor::claude_off_within(&stage.config, "delta", &blocker.join("stash"), &stage.cli, CHILD_PATH, QUICK_CLI).await);
    stage.fake(&stage.removes(&claude_json(&[("beta", BETA_EDITED), ("delta", DELTA)])));
    errors.push(stage.off("beta").await);
    let id = vendor::claude_stashed(&stage.stash)[0].id.clone();
    errors.push(stage.on(&id).await);
    fs::write(&stage.config, claude_json(&[("delta", DELTA)])).unwrap();
    stage.fake(&stage.leaves(&claude_json(&[("beta", DELTA)])));
    errors.push(stage.on(&id).await);
    fs::write(&stage.config, claude_json(&[("delta", DELTA)])).unwrap();
    stage.fake(&stage.leaves(&claude_json(&[("delta", DELTA)])));
    errors.push(stage.on(&id).await);
    stage.fake_with_trial(&stage.writes_instead("{\"mcpServers\": {\"delta\": {\"type\": \"http\"}}}"), SAYS_REMOVED);
    errors.push(stage.off("delta").await);

    let kinds: Vec<&str> = errors
        .iter()
        .map(|result| match result {
            Err(SwitchError::CliFailed) => "cli",
            Err(SwitchError::NameRefused) => "name",
            Err(SwitchError::NotFound) => "not found",
            Err(SwitchError::StashFailed(_)) => "stash",
            Err(SwitchError::NotVerified) => "not verified",
            Err(SwitchError::AlreadyThere) => "already there",
            Err(SwitchError::WouldNotComeBack) => "would not come back",
            Ok(_) => panic!("expected a refusal"),
        })
        .collect();
    assert_eq!(kinds, ["cli", "name", "not found", "stash", "not verified", "already there", "not verified", "cli", "would not come back"]);
    for result in &errors {
        let said = format!("{result:?}");
        for value in KEPT_VALUES.into_iter().chain(["ZED_SETTING", "another-command"]) {
            assert!(!said.contains(value), "an error quotes the entry ({value}): {said}");
        }
    }
}

// --- The trial run: `claude_off` removes only what `add-json` gives back ----
//
// Measured against claude 2.1.331 on 2026-11-24, in a throwaway
// `CLAUDE_CONFIG_DIR`: `claude mcp add-json` drops every key it does not
// know, `description` included, and still exits 0 saying the server was
// added; and it refuses an entry that has a `url` and no `type`.

/// An entry with a key Claude Code does not know.
const EPSILON: &str = r#"{
      "command": "epsilon-server",
      "args": ["serve"],
      "description": "what this server is for"
    }"#;
/// The scratch `.claude.json` Claude Code was measured to write for it.
const EPSILON_AS_WRITTEN_BACK: &str = "{\"mcpServers\": {\"epsilon\": {\"command\": \"epsilon-server\", \"args\": [\"serve\"]}}}";
/// A remote server with no `type`.
const ZETA: &str = r#"{
      "url": "https://example.test/mcp"
    }"#;
/// What Claude Code was measured to say to it. It writes nothing.
const REFUSES_TO_ADD: &str = "printf 'Invalid configuration: it has a \"url\" but no \"type\". Add \"type\": \"http\" (or \"sse\" / \"ws\").\\n'\nexit 1";

/// The server was left alone: the config's bytes are as they were, nothing
/// is kept, no scratch folder is left, and the one thing run was the trial.
fn assert_not_switched_off(stage: &Stage, before: &str) {
    assert_eq!(stage.config_text(), before, "the real config was changed");
    assert_eq!(stage.kept_files(), Vec::<String>::new());
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![]);
    assert_eq!(stage.calls(), ["trial add-json"], "{:?}", stage.argv());
    assert!(!stage.argv().iter().any(|arg| arg == "remove"), "{:?}", stage.argv());
}

#[tokio::test]
async fn a_server_claude_code_would_drop_a_key_from_is_not_switched_off() {
    // The fixture is the measured case: what comes back is the entry without
    // `description`, and nothing else differs.
    let mut without = json(EPSILON);
    without.as_object_mut().unwrap().remove("description").expect("the fixture carries a description");
    assert_eq!(json(EPSILON_AS_WRITTEN_BACK)["mcpServers"]["epsilon"], without);

    let before = claude_json(&[("epsilon", EPSILON)]);
    let stage = stage(&before);
    // The remove would work if it were asked.
    stage.fake_with_trial(&stage.writes_instead(EPSILON_AS_WRITTEN_BACK), &stage.removes(&claude_json(&[])));

    assert_eq!(stage.off("epsilon").await, Err(SwitchError::WouldNotComeBack));

    assert_not_switched_off(&stage, &before);
}

#[tokio::test]
async fn a_server_claude_code_refuses_to_add_is_not_switched_off() {
    let before = claude_json(&[("zeta", ZETA)]);
    let stage = stage(&before);
    stage.fake_with_trial(REFUSES_TO_ADD, &stage.removes(&claude_json(&[])));

    assert_eq!(stage.off("zeta").await, Err(SwitchError::WouldNotComeBack));

    assert_not_switched_off(&stage, &before);
}

#[tokio::test]
async fn the_preflight_hands_the_entry_over_stdin_and_never_argv() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake(&stage.removes(&claude_json(&[])));

    let off = stage.off("beta").await;

    let argv = stage.argv();
    for value in [KEPT_ENV_VALUE, KEPT_COMMAND, KEPT_ARG, "ZED_SETTING"] {
        assert!(!argv.iter().any(|arg| arg.contains(value)), "{value} was passed as an argument: {argv:?}");
    }
    assert_eq!(argv[..6], ["mcp", "add-json", "beta", "-", "--scope", "user"]);
    // What the trial was handed is the entry, as it was written.
    let handed = stage.log("trial-stdin.log");
    assert_eq!(json(&handed), json(BETA));
    assert_in_order(&handed, &BETA_KEY_ORDER);
    off.expect("off");
}

#[tokio::test]
async fn the_preflight_scratch_folder_is_private_and_is_gone_afterwards() {
    // Claude Code writes the entry into it, credentials and all.
    let passes = stage(&claude_json(&[("beta", BETA)]));
    passes.fake(&passes.removes(&claude_json(&[])));
    let kept = passes.off("beta").await.expect("off");

    let fails = stage(&claude_json(&[("zeta", ZETA)]));
    fails.fake_with_trial(REFUSES_TO_ADD, SAYS_REMOVED);
    assert_eq!(fails.off("zeta").await, Err(SwitchError::WouldNotComeBack));

    for stage in [&passes, &fails] {
        let scratch = stage.trial_folder();
        // Inside the stash folder, which is private too, and never in the
        // system's temp folder.
        assert_eq!(scratch.parent(), Some(stage.kept_folder().as_path()), "{}", scratch.display());
        assert!(scratch.file_name().unwrap().to_str().unwrap().starts_with(".preflight-"), "{}", scratch.display());
        let mode = stage.log("trial-mode.log");
        assert!(mode.starts_with("drwx------"), "the scratch folder was not private while the command ran: {mode}");
        assert!(!scratch.exists(), "the scratch folder was left behind: {}", scratch.display());
    }
    assert_eq!(passes.kept_files(), vec![format!("{}.json", kept.id)]);
    assert_eq!(fails.kept_files(), Vec::<String>::new());
}

#[tokio::test]
async fn the_preflight_never_runs_against_the_real_config() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    // An `add-json` that is not aimed at a scratch folder is aimed at the
    // file Claude Code really reads. During an off that must not happen, so
    // this fake leaves a marker and fails.
    let marker = stage.root.join("add-json-ran-against-the-real-config");
    let loud = format!("if [ \"$2\" = add-json ]; then : > {}; echo 'add-json: not a scratch folder' >&2; exit 9; fi", sh(&marker));
    stage.fake(&format!("{loud}\n{}", stage.removes(&claude_json(&[]))));

    let off = stage.off("beta").await;

    assert!(!marker.exists(), "the trial add-json was run against the real config: {:?}", stage.calls());
    assert_eq!(stage.calls(), ["trial add-json", "real remove"]);
    assert_ne!(Some(stage.trial_folder().as_path()), stage.config.parent());
    assert!(stage.trial_folder().starts_with(stage.kept_folder()));
    // The real file changed once, and the remove is what changed it.
    assert_eq!(stage.config_text(), claude_json(&[]));
    off.expect("off");
}

#[tokio::test]
async fn a_preflight_that_cannot_run_or_never_ends_is_a_cli_failure() {
    // Neither says anything about the entry, so neither is "would not come
    // back". What matters is the same: nothing kept, nothing removed.
    let before = claude_json(&[("beta", BETA)]);
    let stage = stage(&before);

    let no_such_program = stage.root.join("bin").join("no-such-claude");
    let result = vendor::claude_off_within(&stage.config, "beta", &stage.stash, &no_such_program, CHILD_PATH, QUICK_CLI).await;
    assert_eq!(result, Err(SwitchError::CliFailed));
    assert_eq!(stage.config_text(), before);
    assert_eq!(stage.kept_files(), Vec::<String>::new());

    stage.fake_with_trial("exec /bin/sleep 20", &stage.removes(&claude_json(&[])));
    assert_eq!(stage.off("beta").await, Err(SwitchError::CliFailed));
    assert_not_switched_off(&stage, &before);
}

#[tokio::test]
async fn a_preflight_that_wrote_the_entry_back_and_then_hung_still_passes() {
    // As for the remove: the file decides, not whether the command ended.
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_with_trial(&format!("{}\nexec /bin/sleep 20", stage.hands_back()), &stage.removes(&claude_json(&[])));

    let kept = stage.off("beta").await.expect("the entry came back equal, so the server is switched off");

    assert_eq!(stage.calls(), ["trial add-json", "real remove"]);
    assert_eq!(stage.entry("beta"), None);
    assert_eq!(stage.kept_files(), vec![format!("{}.json", kept.id)]);
}

#[tokio::test]
async fn a_stash_that_stops_taking_files_after_the_preflight_stops_the_switch_before_the_remove() {
    let before = claude_json(&[("beta", BETA)]);
    let stage = stage(&before);
    // The trial passes, and the stash folder stops accepting changes.
    let closes = format!("{}\nchmod 500 {}", stage.hands_back(), sh(&stage.kept_folder()));
    stage.fake_with_trial(&closes, &stage.removes(&claude_json(&[])));

    let result = stage.off("beta").await;
    fs::set_permissions(stage.kept_folder(), fs::Permissions::from_mode(0o700)).unwrap();

    // With no kept copy the server is never removed.
    assert!(matches!(result, Err(SwitchError::StashFailed(_))), "{result:?}");
    assert_eq!(stage.calls(), ["trial add-json"]);
    assert_eq!(stage.config_text(), before);
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![]);
}

#[tokio::test]
async fn a_stray_preflight_folder_is_not_listed_as_a_kept_server() {
    // What a crash in the middle of a trial run leaves behind.
    let stage = stage(&claude_json(&[("beta", BETA)]));
    let stray = stage.kept_folder().join(".preflight-00000000-0000-4000-8000-000000000009");
    fs::create_dir_all(&stray).unwrap();
    fs::write(stray.join(".claude.json"), "{\"mcpServers\": {\"left-behind\": {\"command\": \"stray-server\"}}}").unwrap();

    assert_eq!(vendor::claude_stashed(&stage.stash), vec![]);
    stage.fake(&stage.adds("left-behind", &[]));
    for id in [".preflight-00000000-0000-4000-8000-000000000009", "00000000-0000-4000-8000-000000000009"] {
        assert_eq!(stage.on(id).await, Err(SwitchError::NotFound), "{id}");
    }
    assert!(!stage.ran());

    // It does not get in the way of a later switch, and nothing tidies it.
    stage.fake(&stage.removes(&claude_json(&[])));
    let kept = stage.off("beta").await.expect("off, with a stray folder in the stash");
    assert_eq!(vendor::claude_stashed(&stage.stash), vec![kept]);
    assert!(stray.join(".claude.json").exists());
}

// ---------------------------------------------------------------------------
// One engine's context: `mcp::switch::context`. A fold: it opens no file, no
// database and no process, so everything it is told arrives as a parameter.
//
// The fixtures are what the producers emit. Registrations come from
// `discover` reading config files written into a temp folder (the machine
// pass, and `discover_repo` for a project's file); kept servers come from
// `vendor::claude_stashed`; every probe answer goes through
// `probe::tool_cost`, the one place a cost is made. No `Registration` here is
// built by hand.
// ---------------------------------------------------------------------------

use std::cell::RefCell;
use std::collections::HashMap;

use tauri_app_lib::mcp::discover::{self, DiscoveryResult};
use tauri_app_lib::mcp::probe::{self, ProbeResult, ProbedTool};
use tauri_app_lib::mcp::switch::context::{self, ContextItem, EngineContext, ItemState, Measured, ReadOnlyReason};

/// Values a config file holds and a context must not: a command, an
/// argument, an env variable's name and value, a query string and a header.
const CTX_COMMAND: &str = "ctx-marker-command";
const CTX_ARG: &str = "ctx-marker-arg";
const CTX_ENV_NAME: &str = "CTX_MARKER_SETTING";
const CTX_ENV_VALUE: &str = "ctx-marker-env-value";
const CTX_QUERY_VALUE: &str = "ctx-marker-query";
const CTX_HEADER_VALUE: &str = "ctx-marker-header";
const CTX_VALUES: [&str; 6] = [CTX_COMMAND, CTX_ARG, CTX_ENV_NAME, CTX_ENV_VALUE, CTX_QUERY_VALUE, CTX_HEADER_VALUE];

/// Codex's global file: no flag, off, on said out loud, and no flag again.
const CTX_CODEX: &str = "# kept\n[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\nenabled = false\n\n[mcp_servers.gamma]\ncommand = \"gamma-server\"\nenabled = true\n\n[mcp_servers.delta]\ncommand = \"delta-server\"\n";
/// One server under `[mcp_servers]` and one under the legacy `[tools]` table.
const CTX_CODEX_LEGACY: &str = "[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[tools.legacy]\ncommand = \"legacy-server\"\n";
/// A server whose every value is a marker, switched off.
const CTX_CODEX_MARKED: &str = "[mcp_servers.alpha]\ncommand = \"ctx-marker-command\"\nargs = [\"ctx-marker-arg\"]\nenabled = false\n\n[mcp_servers.alpha.env]\nCTX_MARKER_SETTING = \"ctx-marker-env-value\"\n";
/// The same, as the `mcpServers` hosts write it, with a remote server beside it.
const CTX_JSON_MARKED: &str = r#"{
  "mcpServers": {
    "alpha": {
      "command": "ctx-marker-command",
      "args": ["ctx-marker-arg"],
      "env": { "CTX_MARKER_SETTING": "ctx-marker-env-value" }
    },
    "remote": {
      "url": "https://example.test/mcp?setting=ctx-marker-query",
      "headers": { "X-Setting": "ctx-marker-header" }
    }
  }
}"#;

/// A `.claude.json`: one user-scope server, one server pinned to a project
/// (local scope), and two Claude.ai connectors.
const CTX_CLAUDE_JSON: &str = r#"{
  "mcpServers": { "declared": { "command": "declared-server" } },
  "projects": { "/work/app": { "mcpServers": { "pinned": { "command": "pinned-server" } } } },
  "claudeAiMcpEverConnected": ["claude.ai Notion", "claude.ai Linear"]
}"#;
/// `~/.mcp.json` and `~/.claude/mcp.json` both declare `shared`, with one launch.
const CTX_HOME_MCP_JSON: &str = r#"{"mcpServers": {"shared": {"command": "shared-server", "args": ["serve"]}, "homewide": {"command": "homewide-server"}}}"#;
const CTX_CLAUDE_MCP_JSON: &str = r#"{"mcpServers": {"shared": {"command": "shared-server", "args": ["serve"]}}}"#;
const CTX_PLUGIN_MCP_JSON: &str = r#"{"mcpServers": {"plugged": {"command": "plugged-server"}}}"#;
const CTX_MANAGED_MCP_JSON: &str = r#"{"mcpServers": {"fleet": {"command": "fleet-server"}}}"#;

/// Gemini's three places, each declaring `beta`: the user's settings, the
/// system settings, and a project's.
const CTX_GEMINI_HOME: &str = r#"{"mcpServers": {"alpha": {"command": "alpha-server"}, "beta": {"command": "beta-server"}}}"#;
const CTX_GEMINI_SYSTEM: &str = r#"{"mcpServers": {"beta": {"command": "beta-system-server"}}}"#;
const CTX_GEMINI_PROJECT: &str = r#"{"mcpServers": {"beta": {"command": "beta-project-server"}}}"#;
const CTX_GEMINI_BETA_OFF: &str = r#"{"beta": {"enabled": false}}"#;

const CLAUDE_MANAGED_FILE: &str = "Library/Application Support/ClaudeCode/managed-mcp.json";
const GEMINI_SYSTEM_FILE: &str = "Library/Application Support/GeminiCli/settings.json";

/// A machine in a temp folder: a home, a system root and one project.
struct Machine {
    _dir: tempfile::TempDir,
    root: PathBuf,
}

/// A machine whose home holds these files, by home-relative path.
fn machine(home_files: &[(&str, &str)]) -> Machine {
    // `discover` resolves a relocated config folder from the process
    // environment, not from the home it is handed. With either variable set
    // in the launching shell the fixtures below would not be what is read.
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("CODEX_HOME");
    let dir = tempfile::tempdir().expect("temp dir");
    let root = fs::canonicalize(dir.path()).expect("real temp dir");
    let machine = Machine { _dir: dir, root };
    for (rel, body) in home_files {
        machine.put(&machine.home().join(rel), body);
    }
    machine
}

impl Machine {
    fn home(&self) -> PathBuf {
        self.root.join("home")
    }

    fn system(&self) -> PathBuf {
        self.root.join("system")
    }

    /// A repository under the home.
    fn repo(&self) -> PathBuf {
        self.home().join("work").join("app")
    }

    fn put(&self, path: &Path, body: &str) {
        fs::create_dir_all(path.parent().expect("a file in a folder")).unwrap();
        fs::write(path, body).unwrap();
    }

    /// What Hanger's machine pass finds here.
    fn found(&self) -> DiscoveryResult {
        discover::discover_machine_at(&self.home(), &self.system())
    }

    /// The machine pass, and the project's own files after it.
    fn found_with_project(&self) -> DiscoveryResult {
        let mut found = self.found();
        found.registrations.extend(discover::discover_repo(&self.repo()).registrations);
        found
    }

    /// One engine's context with no kept servers and no Gemini state file.
    fn context(&self, host_id: &str, found: &DiscoveryResult, cache: &HashMap<String, Measured>) -> EngineContext {
        context::engine_context(host_id, found, &[], None, reader(&self.root), |key| cache.get(key).copied())
    }

    fn gemini_context(&self, found: &DiscoveryResult, state: Option<&str>) -> EngineContext {
        context::engine_context("gemini", found, &[], state, reader(&self.root), |_| None)
    }
}

/// The file reader a caller hands the fold. It reads the path it is asked
/// for, and that path has to be inside the fixture: nothing here may open a
/// file of the machine the tests run on.
fn reader(root: &Path) -> impl Fn(&str) -> Option<String> + '_ {
    move |path| {
        assert!(Path::new(path).starts_with(root), "the fold asked for a file outside the fixture: {path}");
        fs::read_to_string(path).ok()
    }
}

/// What a caller hands the fold for one cached probe: the cost
/// `probe::tool_cost` makes of the stored result.
fn measured(result: &ProbeResult) -> Measured {
    let cost = probe::tool_cost(result);
    Measured { estimated_tokens: cost.estimated_tokens, tool_count: cost.tool_count }
}

/// A probe that answered: one tool for each entry, described in that many bytes.
fn answered(description_bytes: &[usize]) -> ProbeResult {
    ProbeResult {
        tools: description_bytes
            .iter()
            .enumerate()
            .map(|(i, bytes)| ProbedTool { name: format!("tool-{i}"), description: Some("d".repeat(*bytes)) })
            .collect(),
        ..Default::default()
    }
}

/// A probe that did not complete, as `probe` builds one: an error and no tools.
fn unanswered() -> ProbeResult {
    ProbeResult { error: Some("Timed out after 10s waiting for the server to respond".to_string()), ..Default::default() }
}

/// The probe cache's key for one registration: `probe::cache_key` over its
/// own declaration, the key `cached_probe` reads and writes for it.
fn launch_of(found: &DiscoveryResult, host_id: &str, name: &str) -> String {
    let reg = found
        .registrations
        .iter()
        .find(|reg| reg.host_id == host_id && reg.server.name == name)
        .unwrap_or_else(|| panic!("discovery found no {host_id} server named {name}"));
    probe::cache_key(
        &reg.server.command,
        &reg.server.args,
        &reg.server.env_keys,
        reg.server.project_root.as_deref(),
        &reg.server.transport,
    )
}

/// A probe cache holding these answers, by host and server name.
fn cached(found: &DiscoveryResult, answers: &[(&str, &str, ProbeResult)]) -> HashMap<String, Measured> {
    answers.iter().map(|(host_id, name, result)| (launch_of(found, host_id, name), measured(result))).collect()
}

fn no_probes() -> HashMap<String, Measured> {
    HashMap::new()
}

/// The one item of that name.
fn item<'a>(context: &'a EngineContext, name: &str) -> &'a ContextItem {
    let named: Vec<&ContextItem> = context.items.iter().filter(|item| item.name == name).collect();
    assert_eq!(named.len(), 1, "expected one item named {name}, got {:?}", context.items);
    named[0]
}

fn item_names(context: &EngineContext) -> Vec<&str> {
    context.items.iter().map(|item| item.name.as_str()).collect()
}

/// What an item says about itself: its state, and why it has no switch.
fn verdict(item: &ContextItem) -> (ItemState, Option<ReadOnlyReason>) {
    (item.state, item.read_only)
}

/// The counts on a context, taken again from its items.
fn assert_counts_agree(context: &EngineContext) {
    let on: Vec<&ContextItem> = context.items.iter().filter(|item| item.state == ItemState::On).collect();
    let off = context.items.iter().filter(|item| item.state == ItemState::Off).count();
    assert_eq!(context.on_count, on.len(), "on_count, {}", context.engine_id);
    assert_eq!(context.off_count, off, "off_count, {}", context.engine_id);
    assert_eq!(context.on_count + context.off_count, context.items.len(), "{}", context.engine_id);
    assert_eq!(
        context.measured_on_count,
        on.iter().filter(|item| item.estimated_tokens.is_some()).count(),
        "measured_on_count, {}",
        context.engine_id
    );
    for item in &context.items {
        assert_eq!(item.estimated_tokens.is_some(), item.tool_count.is_some(), "{} is half measured", item.name);
    }
}

// --- State ------------------------------------------------------------------

#[test]
fn an_absent_flag_is_on() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let found = machine.found();
    let context = machine.context("codex", &found, &no_probes());

    let alpha = item(&context, "alpha");
    assert_eq!(verdict(alpha), (ItemState::On, None));
    // `enabled = true` says the same thing out loud.
    assert_eq!(verdict(item(&context, "gamma")), (ItemState::On, None));

    // What identifies the item, and where it is declared.
    let file = machine.home().join(".codex/config.toml");
    assert_eq!(alpha.key, format!("{}:alpha", file.display()));
    assert_eq!(alpha.tier, "global");
    assert!(alpha.config_path.ends_with("config.toml"), "{}", alpha.config_path);
    assert!(
        !alpha.config_path.contains(machine.root.to_str().unwrap()),
        "the path was not sanitised: {}",
        alpha.config_path
    );

    assert_eq!(context.engine_id, "codex");
    assert_eq!(context.engine_name, registry::host_by_id("codex").unwrap().display_name);
}

#[test]
fn enabled_false_is_off() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let found = machine.found();
    let context = machine.context("codex", &found, &no_probes());

    // Off, and still Hanger's to switch back on.
    assert_eq!(verdict(item(&context, "beta")), (ItemState::Off, None));
    assert_eq!((context.on_count, context.off_count), (3, 1));
}

#[test]
fn a_codex_server_under_the_legacy_tools_table_is_on_and_has_no_switch() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX_LEGACY)]);
    let found = machine.found();
    let context = machine.context("codex", &found, &no_probes());

    // `enabled` was confirmed for `[mcp_servers.*]` alone.
    assert_eq!(verdict(item(&context, "legacy")), (ItemState::On, Some(ReadOnlyReason::EngineNotConfirmed)));
    // Its neighbour in the same file keeps its switch.
    assert_eq!(verdict(item(&context, "alpha")), (ItemState::On, None));
}

#[tokio::test]
async fn a_stashed_claude_server_is_an_off_item() {
    let (stage, kept, _) = with_beta_off().await;
    let found = discover::discover_machine_at(&stage.root.join("home"), &stage.root.join("system"));
    let stashed = vendor::claude_stashed(&stage.stash);
    assert_eq!(stashed, vec![kept.clone()]);
    // A probe cache that would answer for anything it was asked about.
    let any_answer = measured(&answered(&[400]));

    let context = context::engine_context("claude-code", &found, &stashed, None, reader(&stage.root), |_| Some(any_answer));

    // Declared servers first, then what Hanger keeps.
    assert_eq!(item_names(&context), ["alpha", "beta"]);
    let alpha = item(&context, "alpha");
    assert_eq!(verdict(alpha), (ItemState::On, None));
    assert_eq!(alpha.tier, "user");
    assert_eq!(alpha.estimated_tokens, Some(100));

    let beta = item(&context, "beta");
    assert_eq!(verdict(beta), (ItemState::Off, None), "a kept server is off, and Hanger can switch it back on");
    assert_eq!(beta.key, format!("stash:{}", kept.id));
    assert!(beta.key.starts_with("stash:"));
    assert_eq!(beta.tier, "user");
    assert_eq!(beta.config_path, "", "a kept server is declared in no file");
    // It carries no launch to look up, whatever the cache holds.
    assert_eq!((beta.estimated_tokens, beta.tool_count), (None, None));

    assert_eq!((context.on_count, context.off_count), (1, 1));
    assert_eq!(context.on_tokens_measured, 100);
    assert_counts_agree(&context);
}

#[tokio::test]
async fn kept_servers_follow_the_declared_ones_in_the_order_given() {
    let (stage, kept, _) = with_beta_off().await;
    stage.keep_by_hand("00000000-0000-4000-8000-000000000007", "older", 5, "{\"command\": \"older-server\"}");
    let found = discover::discover_machine_at(&stage.root.join("home"), &stage.root.join("system"));
    let newest_first = vendor::claude_stashed(&stage.stash);
    assert_eq!(newest_first.iter().map(|kept| kept.name.as_str()).collect::<Vec<_>>(), ["beta", "older"]);
    assert_eq!(newest_first[0], kept);

    let context = context::engine_context("claude-code", &found, &newest_first, None, reader(&stage.root), |_| None);
    assert_eq!(item_names(&context), ["alpha", "beta", "older"]);

    // The order is the caller's: the fold does not sort.
    let oldest_first: Vec<StashedServer> = newest_first.iter().rev().cloned().collect();
    let context = context::engine_context("claude-code", &found, &oldest_first, None, reader(&stage.root), |_| None);
    assert_eq!(item_names(&context), ["alpha", "older", "beta"]);
}

#[tokio::test]
async fn kept_servers_and_the_gemini_state_file_belong_to_their_own_engines() {
    let (stage, _, _) = with_beta_off().await;
    let stashed = vendor::claude_stashed(&stage.stash);
    assert_eq!(stashed.len(), 1);
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let found = machine.found();
    // A state file that names a Codex server.
    let alpha_off = r#"{"alpha": {"enabled": false}}"#;

    let codex = context::engine_context("codex", &found, &stashed, Some(alpha_off), reader(&machine.root), |_| None);
    assert_eq!(item_names(&codex).len(), 4, "{:?}", codex.items);
    assert!(codex.items.iter().all(|item| !item.key.starts_with("stash:")), "{:?}", codex.items);
    assert_eq!(verdict(item(&codex, "alpha")), (ItemState::On, None), "Gemini's state file does not switch a Codex server");

    let gemini = context::engine_context("gemini", &found, &stashed, Some(alpha_off), reader(&machine.root), |_| None);
    assert_eq!(item_names(&gemini).len(), 2, "{:?}", gemini.items);
    assert_eq!(verdict(item(&gemini, "alpha")), (ItemState::Off, None));
}

// --- Gemini CLI: one state file, keyed by name ------------------------------

/// A machine with `beta` declared for Gemini at all three places.
fn gemini_machine() -> Machine {
    let machine = machine(&[(".gemini/settings.json", CTX_GEMINI_HOME)]);
    machine.put(&machine.system().join(GEMINI_SYSTEM_FILE), CTX_GEMINI_SYSTEM);
    machine.put(&machine.repo().join(".gemini/settings.json"), CTX_GEMINI_PROJECT);
    machine
}

/// The Gemini item declared in that file.
fn gemini_item<'a>(context: &'a EngineContext, file: &Path, name: &str) -> &'a ContextItem {
    let key = format!("{}:{name}", file.display());
    context.items.iter().find(|item| item.key == key).unwrap_or_else(|| panic!("no item {key} in {:?}", context.items))
}

#[test]
fn a_gemini_server_named_in_the_state_file_is_off_at_every_scope() {
    let machine = gemini_machine();
    let found = machine.found_with_project();
    let user = machine.home().join(".gemini/settings.json");
    let system = machine.system().join(GEMINI_SYSTEM_FILE);
    let project = machine.repo().join(".gemini/settings.json");

    let context = machine.gemini_context(&found, Some(CTX_GEMINI_BETA_OFF));
    assert_eq!(context.items.len(), 4, "{:?}", context.items);
    for file in [&user, &system, &project] {
        assert_eq!(gemini_item(&context, file, "beta").state, ItemState::Off, "{}", file.display());
    }
    assert_eq!(gemini_item(&context, &user, "alpha").state, ItemState::On);
    assert_eq!((context.on_count, context.off_count), (1, 3));
    assert_counts_agree(&context);

    // With no state file, nothing has been switched off.
    let context = machine.gemini_context(&found, None);
    for file in [&user, &system, &project] {
        assert_eq!(gemini_item(&context, file, "beta").state, ItemState::On, "{}", file.display());
    }
    assert_eq!((context.on_count, context.off_count), (4, 0));
}

#[test]
fn a_gemini_project_server_is_read_only_because_the_switch_is_by_name() {
    let machine = gemini_machine();
    let found = machine.found_with_project();
    let project = machine.repo().join(".gemini/settings.json");
    let user = machine.home().join(".gemini/settings.json");

    for (state, expected) in [(None, ItemState::On), (Some(CTX_GEMINI_BETA_OFF), ItemState::Off)] {
        let context = machine.gemini_context(&found, state);
        let in_project = gemini_item(&context, &project, "beta");
        assert_eq!(in_project.tier, "project");
        // It has no switch, and it still says what the state file says.
        assert_eq!(verdict(in_project), (expected, Some(ReadOnlyReason::SwitchesByNameEverywhere)));
        // The user's own server of that name is the one Hanger switches.
        assert_eq!(verdict(gemini_item(&context, &user, "beta")), (expected, None));
    }
}

// --- Why an item has no switch: one test for each reason --------------------

#[test]
fn read_only_with_its_reason_engine_not_confirmed() {
    let machine = machine(&[
        (".cursor/mcp.json", r#"{"mcpServers": {"alpha": {"command": "alpha-server"}}}"#),
        // OpenCode's reader accepts this key. Nothing has confirmed OpenCode
        // acts on it, so Hanger does not say the server is off.
        (".config/opencode/opencode.json", r#"{"mcp": {"alpha": {"type": "local", "command": ["alpha-server"], "enabled": false}}}"#),
    ]);
    let found = machine.found();

    for host_id in ["cursor", "opencode"] {
        let context = machine.context(host_id, &found, &no_probes());
        assert_eq!(
            verdict(item(&context, "alpha")),
            (ItemState::On, Some(ReadOnlyReason::EngineNotConfirmed)),
            "{host_id}"
        );
    }
}

/// A machine with a Claude Code server in each place the machine pass reads.
fn claude_machine() -> Machine {
    let machine = machine(&[
        (".claude.json", CTX_CLAUDE_JSON),
        (".mcp.json", CTX_HOME_MCP_JSON),
        (".claude/mcp.json", CTX_CLAUDE_MCP_JSON),
        (".claude/plugins/marketplaces/acme/.mcp.json", CTX_PLUGIN_MCP_JSON),
    ]);
    machine.put(&machine.system().join(CLAUDE_MANAGED_FILE), CTX_MANAGED_MCP_JSON);
    machine
}

#[test]
fn read_only_with_its_reason_per_project_comes_next() {
    let machine = claude_machine();
    let found = machine.found();
    let context = machine.context("claude-code", &found, &no_probes());

    // `~/.mcp.json`: Claude Code is switched at user scope only.
    let homewide = item(&context, "homewide");
    assert_eq!(homewide.tier, "global");
    assert_eq!(verdict(homewide), (ItemState::On, Some(ReadOnlyReason::PerProjectComesNext)));
    // The user-scope server beside it is the one with a switch.
    let declared = item(&context, "declared");
    assert_eq!(declared.tier, "user");
    assert_eq!(verdict(declared), (ItemState::On, None));
}

#[test]
fn read_only_with_its_reason_switches_by_name_everywhere() {
    // A machine where the project's file is the only one declaring `beta`:
    // there is no global server of that name to offer a switch on instead.
    let machine = machine(&[(".gemini/settings.json", r#"{"mcpServers": {"alpha": {"command": "alpha-server"}}}"#)]);
    machine.put(&machine.repo().join(".gemini/settings.json"), CTX_GEMINI_PROJECT);
    let found = machine.found_with_project();

    let context = machine.gemini_context(&found, None);
    assert_eq!(verdict(item(&context, "beta")), (ItemState::On, Some(ReadOnlyReason::SwitchesByNameEverywhere)));
    assert_eq!(verdict(item(&context, "alpha")), (ItemState::On, None));
}

#[test]
fn read_only_with_its_reason_managed_by_plugin() {
    let machine = claude_machine();
    let found = machine.found();
    let context = machine.context("claude-code", &found, &no_probes());

    assert_eq!(verdict(item(&context, "plugged")), (ItemState::On, Some(ReadOnlyReason::ManagedByPlugin)));
}

#[test]
fn read_only_with_its_reason_managed_by_policy() {
    let machine = claude_machine();
    let found = machine.found();
    let context = machine.context("claude-code", &found, &no_probes());
    assert_eq!(verdict(item(&context, "fleet")), (ItemState::On, Some(ReadOnlyReason::ManagedByPolicy)));

    // Gemini's system settings are the other managed file. The tier has a
    // switch (`gemini`, global), so the reason comes from the file.
    let machine = gemini_machine();
    let found = machine.found();
    let system = machine.system().join(GEMINI_SYSTEM_FILE);
    for (state, expected) in [(None, ItemState::On), (Some(CTX_GEMINI_BETA_OFF), ItemState::Off)] {
        let context = machine.gemini_context(&found, state);
        let managed = gemini_item(&context, &system, "beta");
        assert_eq!(managed.tier, "global");
        assert_eq!(verdict(managed), (expected, Some(ReadOnlyReason::ManagedByPolicy)));
    }
}

#[test]
fn read_only_with_its_reason_runs_on_vendor_servers() {
    let machine = claude_machine();
    let found = machine.found();
    let context = machine.context("claude-ai", &found, &no_probes());

    assert_eq!(item_names(&context), ["Notion", "Linear"]);
    for name in ["Notion", "Linear"] {
        assert_eq!(verdict(item(&context, name)), (ItemState::On, Some(ReadOnlyReason::RunsOnVendorServers)));
    }
    // The connectors are Claude.ai's, not Claude Code's.
    let claude_code = machine.context("claude-code", &found, &no_probes());
    assert!(!item_names(&claude_code).contains(&"Notion"), "{:?}", claude_code.items);
}

#[test]
fn read_only_with_its_reason_file_unparseable() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let found = machine.found();
    let codex_file = machine.home().join(".codex/config.toml");
    let unparseable = (ItemState::On, Some(ReadOnlyReason::FileUnparseable));
    // Before anything changes, `beta` is off and switchable.
    assert_eq!(verdict(item(&machine.context("codex", &found, &no_probes()), "beta")), (ItemState::Off, None));

    // The file changed after discovery read it: it no longer parses.
    fs::write(&codex_file, BROKEN_TOML).unwrap();
    let context = machine.context("codex", &found, &no_probes());
    for name in ["alpha", "beta"] {
        assert_eq!(verdict(item(&context, name)), unparseable, "{name}, in a file that does not parse");
    }

    // It parses, and no longer declares the server discovery saw.
    fs::write(&codex_file, "[mcp_servers.alpha]\ncommand = \"alpha-server\"\n").unwrap();
    let context = machine.context("codex", &found, &no_probes());
    assert_eq!(verdict(item(&context, "beta")), unparseable, "a server the file no longer declares");
    assert_eq!(verdict(item(&context, "alpha")), (ItemState::On, None));

    // It is gone.
    fs::remove_file(&codex_file).unwrap();
    let context = machine.context("codex", &found, &no_probes());
    assert_eq!(verdict(item(&context, "beta")), unparseable, "a file that cannot be read");
    assert_eq!((context.on_count, context.off_count), (4, 0));

    // Gemini's state file, when Gemini itself could not read it.
    let context = machine.gemini_context(&found, Some("{\"beta\": {\"enabled\": false},"));
    assert_eq!(verdict(item(&context, "beta")), unparseable);
}

#[test]
fn a_reason_that_stands_on_its_own_outranks_a_state_file_that_does_not_parse() {
    let machine = gemini_machine();
    let found = machine.found_with_project();
    let context = machine.gemini_context(&found, Some("not json"));

    let user = machine.home().join(".gemini/settings.json");
    let system = machine.system().join(GEMINI_SYSTEM_FILE);
    let project = machine.repo().join(".gemini/settings.json");
    assert_eq!(verdict(gemini_item(&context, &user, "beta")), (ItemState::On, Some(ReadOnlyReason::FileUnparseable)));
    assert_eq!(verdict(gemini_item(&context, &system, "beta")), (ItemState::On, Some(ReadOnlyReason::ManagedByPolicy)));
    assert_eq!(
        verdict(gemini_item(&context, &project, "beta")),
        (ItemState::On, Some(ReadOnlyReason::SwitchesByNameEverywhere))
    );
}

// --- Population -------------------------------------------------------------

#[test]
fn a_server_pinned_to_one_project_is_not_an_item() {
    let machine = claude_machine();
    let found = machine.found();
    // Discovery does find it, at local scope: its absence below is the fold's.
    let pinned: Vec<ScopeTier> =
        found.registrations.iter().filter(|reg| reg.server.name == "pinned").map(|reg| reg.tier).collect();
    assert_eq!(pinned, [ScopeTier::Local]);

    let context = machine.context("claude-code", &found, &no_probes());
    assert!(!item_names(&context).contains(&"pinned"), "{:?}", context.items);
    // Every other Claude Code server on the machine is there: one user-scope
    // server, `shared` in two files, and one each from `~/.mcp.json`, a
    // plugin and the managed file.
    let mut names = item_names(&context);
    names.sort_unstable();
    assert_eq!(names, ["declared", "fleet", "homewide", "plugged", "shared", "shared"]);
    assert_eq!((context.on_count, context.off_count), (6, 0));
}

#[test]
fn an_unknown_host_id_is_an_empty_context() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let found = machine.found();
    assert!(registry::host_by_id("no-such-engine").is_none());

    let context = machine.context("no-such-engine", &found, &no_probes());
    assert_eq!(context.engine_id, "no-such-engine");
    assert_eq!(context.engine_name, "no-such-engine");
    assert_eq!(context.items, vec![]);
    assert_eq!(
        (context.on_count, context.off_count, context.measured_on_count, context.on_tokens_measured),
        (0, 0, 0, 0)
    );
}

#[test]
fn no_engine_says_when_a_change_applies_yet() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let found = machine.found();
    assert!(!registry::HOSTS.is_empty());
    for host in registry::HOSTS {
        let context = machine.context(host.id, &found, &no_probes());
        assert_eq!(context.applies, None, "{}", host.id);
        assert_eq!(context.engine_name, host.display_name);
    }
    // Present in what the webview receives, and null.
    let codex = serde_json::to_value(machine.context("codex", &found, &no_probes())).unwrap();
    assert_eq!(codex.get("applies"), Some(&serde_json::Value::Null));
}

#[test]
fn a_context_says_when_its_switch_covers_every_server_of_a_name() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let found = machine.found();

    assert!(machine.context("gemini", &found, &no_probes()).switches_by_name);
    for host_id in ["codex", "claude-code", "cursor", "no-such-engine"] {
        assert!(!machine.context(host_id, &found, &no_probes()).switches_by_name, "{host_id}");
    }
    // Decided by the engine's switch kind, for every host there is.
    for host in registry::HOSTS {
        let by_name = registry::SWITCHES.iter().any(|row| row.host_id == host.id && row.kind == SwitchKind::GeminiEnablementFile);
        assert_eq!(machine.context(host.id, &found, &no_probes()).switches_by_name, by_name, "{}", host.id);
    }

    // The webview reads it under this name.
    let gemini = serde_json::to_value(machine.context("gemini", &found, &no_probes())).unwrap();
    assert_eq!(gemini.get("switches_by_name"), Some(&serde_json::Value::Bool(true)));
    let codex = serde_json::to_value(machine.context("codex", &found, &no_probes())).unwrap();
    assert_eq!(codex.get("switches_by_name"), Some(&serde_json::Value::Bool(false)));
}

// --- Cost and the budget ----------------------------------------------------

#[test]
fn off_servers_cost_nothing_in_the_budget() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let found = machine.found();
    let cache = cached(&found, &[("codex", "alpha", answered(&[400])), ("codex", "beta", answered(&[1200, 400]))]);
    let context = machine.context("codex", &found, &cache);

    let alpha = item(&context, "alpha");
    assert_eq!((alpha.state, alpha.estimated_tokens, alpha.tool_count), (ItemState::On, Some(100), Some(1)));
    // What `beta` would cost is still shown on its row.
    let beta = item(&context, "beta");
    assert_eq!((beta.state, beta.estimated_tokens, beta.tool_count), (ItemState::Off, Some(400), Some(2)));

    assert_eq!(context.on_tokens_measured, 100, "beta is off, so its 400 is not in the budget");
    assert_eq!(context.measured_on_count, 1, "beta is measured and off: not one of the switched-on servers");
    assert_eq!((context.on_count, context.off_count), (3, 1));
}

#[test]
fn unmeasured_servers_are_counted_but_not_summed() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let found = machine.found();
    // Three are on: alpha, gamma and delta. Two of them have been measured.
    let cache = cached(&found, &[("codex", "alpha", answered(&[400])), ("codex", "gamma", answered(&[120, 80]))]);
    let context = machine.context("codex", &found, &cache);

    assert_eq!(context.on_count, 3);
    assert_eq!(context.measured_on_count, 2);
    assert_eq!(context.on_tokens_measured, 150);
    let delta = item(&context, "delta");
    assert_eq!((delta.state, delta.estimated_tokens, delta.tool_count), (ItemState::On, None, None));
}

#[test]
fn a_failed_probe_is_measured_at_zero_not_unmeasured() {
    // What the producer makes of a probe that did not complete: an error,
    // and a cost of zero built over its empty tool list.
    let failed = unanswered();
    assert!(failed.error.is_some());
    assert_eq!(measured(&failed), Measured { estimated_tokens: 0, tool_count: 0 });

    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let found = machine.found();
    let cache = cached(&found, &[("codex", "alpha", failed)]);
    let context = machine.context("codex", &found, &cache);

    let alpha = item(&context, "alpha");
    assert_eq!((alpha.estimated_tokens, alpha.tool_count), (Some(0), Some(0)));
    assert_eq!(context.measured_on_count, 1);
    assert_eq!(context.on_tokens_measured, 0);
    // A server nobody asked is a different finding.
    let gamma = item(&context, "gamma");
    assert_eq!((gamma.estimated_tokens, gamma.tool_count), (None, None));
}

#[test]
fn a_launch_one_engine_declares_twice_is_summed_once() {
    let machine = claude_machine();
    let found = machine.found();
    // `shared` is in `~/.mcp.json` and in `~/.claude/mcp.json`, with one launch.
    let cache = cached(&found, &[("claude-code", "shared", answered(&[400])), ("claude-code", "homewide", answered(&[80]))]);
    let context = machine.context("claude-code", &found, &cache);

    let shared: Vec<&ContextItem> = context.items.iter().filter(|item| item.name == "shared").collect();
    assert_eq!(shared.len(), 2);
    assert_ne!(shared[0].key, shared[1].key);
    for one in &shared {
        assert_eq!((one.state, one.estimated_tokens), (ItemState::On, Some(100)));
    }
    // Two rows carry the figure; the model is told about the launch once.
    assert_eq!(context.measured_on_count, 3);
    assert_eq!(context.on_tokens_measured, 120);
}

#[test]
fn the_probe_cache_is_asked_once_for_each_launch() {
    let machine = claude_machine();
    let found = machine.found();
    let asked = RefCell::new(Vec::new());
    let context = context::engine_context("claude-code", &found, &[], None, reader(&machine.root), |key| {
        asked.borrow_mut().push(key.to_string());
        None
    });
    assert_eq!(context.items.len(), 6);

    // Six items, five launches: `shared` is declared twice.
    let mut asked = asked.into_inner();
    asked.sort();
    let mut launches: Vec<String> =
        ["declared", "fleet", "homewide", "plugged", "shared"].iter().map(|name| launch_of(&found, "claude-code", name)).collect();
    launches.sort();
    assert_eq!(asked, launches);
}

#[test]
fn a_connector_is_never_measured_whatever_the_cache_holds_under_its_key() {
    let machine = claude_machine();
    let found = machine.found();
    // Every connector on a machine has the same cache key: nothing can be
    // started or dialled, so nothing could have written an answer there.
    assert_eq!(launch_of(&found, "claude-ai", "Notion"), launch_of(&found, "claude-ai", "Linear"));
    let cache = cached(&found, &[("claude-ai", "Notion", answered(&[400]))]);
    let context = machine.context("claude-ai", &found, &cache);

    for name in ["Notion", "Linear"] {
        let connector = item(&context, name);
        assert_eq!((connector.estimated_tokens, connector.tool_count), (None, None), "{name}");
    }
    assert_eq!((context.on_count, context.measured_on_count, context.on_tokens_measured), (2, 0, 0));
}

#[tokio::test]
async fn counts_agree_with_items() {
    let (stage, _, _) = with_beta_off().await;
    let stashed = vendor::claude_stashed(&stage.stash);
    let claude_found = discover::discover_machine_at(&stage.root.join("home"), &stage.root.join("system"));
    let claude = context::engine_context("claude-code", &claude_found, &stashed, None, reader(&stage.root), |_| None);

    let machine = gemini_machine();
    machine.put(&machine.home().join(".codex/config.toml"), CTX_CODEX);
    let found = machine.found_with_project();
    let cache = cached(&found, &[("codex", "alpha", answered(&[400])), ("codex", "beta", answered(&[1200]))]);
    let codex = machine.context("codex", &found, &cache);
    let gemini = machine.gemini_context(&found, Some(CTX_GEMINI_BETA_OFF));
    let none = machine.context("cursor", &found, &cache);

    for context in [&claude, &codex, &gemini] {
        // Each has servers on and servers off, so neither count is checked
        // against an empty list.
        assert!(context.on_count > 0 && context.off_count > 0, "{}: {:?}", context.engine_id, context.items);
        assert_counts_agree(context);
    }
    assert_eq!(codex.measured_on_count, 1);
    assert_counts_agree(&none);
    assert_eq!(none.items.len(), 0);
}

// --- What crosses to the webview --------------------------------------------

/// The names of a JSON object's keys, sorted.
fn keys_of(value: &serde_json::Value) -> Vec<&str> {
    let mut keys: Vec<&str> = value.as_object().expect("an object").keys().map(String::as_str).collect();
    keys.sort_unstable();
    keys
}

#[tokio::test]
async fn a_serialised_context_carries_no_value_from_a_config_file() {
    let machine = machine(&[
        (".codex/config.toml", CTX_CODEX_MARKED),
        (".cursor/mcp.json", CTX_JSON_MARKED),
        (".gemini/settings.json", CTX_JSON_MARKED),
        (".mcp.json", CTX_JSON_MARKED),
        (".claude.json", CTX_JSON_MARKED),
    ]);
    let found = machine.found();
    // The fixtures do hold the values: discovery read the command and the
    // env variable's name out of every one of them.
    for host_id in ["codex", "cursor", "gemini", "claude-code"] {
        let alpha = found.registrations.iter().find(|reg| reg.host_id == host_id && reg.server.name == "alpha").expect(host_id);
        assert_eq!((alpha.server.command.as_str(), alpha.server.env_keys.as_slice()), (CTX_COMMAND, [CTX_ENV_NAME.to_string()].as_slice()));
    }
    let cache = cached(&found, &[("codex", "alpha", answered(&[400])), ("cursor", "alpha", answered(&[400]))]);

    for host_id in ["codex", "cursor", "gemini", "claude-code"] {
        let context = context::engine_context(host_id, &found, &[], Some(r#"{"alpha": {"enabled": false}}"#), reader(&machine.root), |key| {
            cache.get(key).copied()
        });
        let text = serde_json::to_string(&context).unwrap();
        assert!(text.contains("\"name\":\"alpha\""), "{host_id}: {text}");
        for value in CTX_VALUES {
            assert!(!text.contains(value), "{host_id}: the context carries {value}: {text}");
        }

        // Nothing rides along in a field of its own: these are all there are.
        let whole = serde_json::to_value(&context).unwrap();
        assert_eq!(
            keys_of(&whole),
            ["applies", "engine_id", "engine_name", "items", "measured_on_count", "off_count", "on_count", "on_tokens_measured", "switches_by_name"],
            "{host_id}"
        );
        let items = whole["items"].as_array().unwrap();
        assert!(!items.is_empty(), "{host_id}");
        for one in items {
            assert_eq!(
                keys_of(one),
                ["config_path", "estimated_tokens", "key", "name", "read_only", "state", "tier", "tool_count"],
                "{host_id}"
            );
        }
    }

    // A kept server: its entry holds a command, an argument and an env value.
    let (stage, kept, _) = with_beta_off().await;
    let found = discover::discover_machine_at(&stage.root.join("home"), &stage.root.join("system"));
    let context = context::engine_context("claude-code", &found, &[kept], None, reader(&stage.root), |_| None);
    let text = serde_json::to_string(&context).unwrap();
    assert!(text.contains("\"name\":\"beta\""), "{text}");
    for value in KEPT_VALUES.iter().chain(&["alpha-server", "ZED_SETTING", "ALPHA_SETTING"]) {
        assert!(!text.contains(value), "the context carries {value}: {text}");
    }
}

#[test]
fn states_and_reasons_are_spelled_in_snake_case() {
    let spelled = |value: serde_json::Value| value.as_str().expect("a string").to_string();
    assert_eq!(spelled(serde_json::to_value(ItemState::On).unwrap()), "on");
    assert_eq!(spelled(serde_json::to_value(ItemState::Off).unwrap()), "off");
    for (reason, spelling) in [
        (ReadOnlyReason::EngineNotConfirmed, "engine_not_confirmed"),
        (ReadOnlyReason::PerProjectComesNext, "per_project_comes_next"),
        (ReadOnlyReason::SwitchesByNameEverywhere, "switches_by_name_everywhere"),
        (ReadOnlyReason::ManagedByPlugin, "managed_by_plugin"),
        (ReadOnlyReason::ManagedByPolicy, "managed_by_policy"),
        (ReadOnlyReason::RunsOnVendorServers, "runs_on_vendor_servers"),
        (ReadOnlyReason::FileUnparseable, "file_unparseable"),
    ] {
        assert_eq!(spelled(serde_json::to_value(reason).unwrap()), spelling);
    }

    // And as they sit in a context: a reason, no reason, and each tier.
    let machine = claude_machine();
    machine.put(&machine.home().join(".codex/config.toml"), CTX_CODEX);
    machine.put(&machine.repo().join(".codex/config.toml"), "[mcp_servers.epsilon]\ncommand = \"epsilon-server\"\n");
    let found = machine.found_with_project();
    let codex = serde_json::to_value(machine.context("codex", &found, &no_probes())).unwrap();
    let named = |context: &serde_json::Value, name: &str| {
        context["items"].as_array().unwrap().iter().find(|item| item["name"] == name).cloned().expect("the item")
    };
    assert_eq!(named(&codex, "beta")["state"], "off");
    assert_eq!(named(&codex, "beta")["read_only"], serde_json::Value::Null);
    assert_eq!(named(&codex, "beta")["tier"], "global");
    assert_eq!(named(&codex, "epsilon")["tier"], "project");
    assert_eq!(named(&codex, "epsilon")["state"], "on");
    let claude = serde_json::to_value(machine.context("claude-code", &found, &no_probes())).unwrap();
    assert_eq!(named(&claude, "homewide")["read_only"], "per_project_comes_next");
    assert_eq!(named(&claude, "declared")["tier"], "user");
}

#[test]
fn a_codex_project_server_is_switched_in_its_own_file() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    machine.put(&machine.repo().join(".codex/config.toml"), "[mcp_servers.epsilon]\ncommand = \"epsilon-server\"\nenabled = false\n");
    let found = machine.found_with_project();
    let context = machine.context("codex", &found, &no_probes());

    let epsilon = item(&context, "epsilon");
    assert_eq!(epsilon.tier, "project");
    assert_eq!(verdict(epsilon), (ItemState::Off, None));
    assert_eq!(epsilon.key, format!("{}:epsilon", machine.repo().join(".codex/config.toml").display()));
}

// --- What the fold takes from the registry on trust -------------------------

#[test]
fn every_flag_switched_tier_is_declared_in_one_dialect() {
    // A registration does not say which `SOURCES` row it was read through.
    // The fold finds its dialect from its host and tier, which is sound only
    // while every row for that pair names the same one.
    let mut checked = 0;
    for row in registry::SWITCHES.iter().filter(|row| is_a_key_in_the_file(row.kind)) {
        for tier in row.tiers {
            let dialects: HashSet<Dialect> = registry::SOURCES
                .iter()
                .filter(|source| source.host_id == row.host_id && source.tier == *tier)
                .map(|source| source.dialect)
                .collect();
            assert_eq!(dialects.len(), 1, "{} at {:?} is declared in {:?}", row.host_id, tier, dialects);
            checked += 1;
        }
    }
    assert!(checked > 0, "no engine is switched by a key in the file, so the loop above checked nothing");
}

#[test]
fn no_system_wide_source_is_a_glob() {
    // A managed file is recognised by its path ending in a system-wide row's
    // path, which a `*` segment would never match.
    let system: Vec<&str> = registry::SOURCES
        .iter()
        .filter(|source| source.location == registry::SourceLocation::SystemAbsolute)
        .map(|source| source.path)
        .collect();
    assert!(!system.is_empty(), "no system-wide source, so the loop below checks nothing");
    for path in system {
        assert!(!path.contains('*'), "{path}");
    }
}

// ---------------------------------------------------------------------------
// From the webview: `mcp::switch::ops`. The four commands in `lib.rs` are thin
// wrappers over these functions, which take every folder as a parameter: the
// home, the system root, the backups folder and the stash are all inside a
// temp folder here, and the only `claude` is the fake above.
//
// The key and the receipt id are what the webview sends, so they are treated
// as untrusted: most of this section is about what is refused.
// ---------------------------------------------------------------------------

use tauri_app_lib::mcp::switch::ops::{self, ClaudeCli, SwitchFailure, SwitchPlaces, SwitchReply};

/// The four folders, all under one temp root, laid out as `Stage` and
/// `Machine` lay theirs out.
fn places_at(root: &Path) -> SwitchPlaces {
    // As in `machine`: discovery resolves a relocated config folder from the
    // process environment, not from the home it is handed.
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("CODEX_HOME");
    let switch = root.join("data").join("switch");
    SwitchPlaces { home: root.join("home"), system: root.join("system"), backups: switch.join("backups"), stash: switch.join("stash") }
}

/// No `claude` on the search path.
fn no_cli() -> ClaudeCli {
    ClaudeCli { program: None, path_env: CHILD_PATH.to_string() }
}

impl Machine {
    fn places(&self) -> SwitchPlaces {
        places_at(&self.root)
    }

    fn backups(&self) -> PathBuf {
        self.places().backups
    }
}

impl Stage {
    fn places(&self) -> SwitchPlaces {
        let places = places_at(&self.root);
        assert_eq!(places.stash, self.stash);
        places
    }

    /// The fake, as the resolved `claude`.
    fn claude(&self) -> ClaudeCli {
        ClaudeCli { program: Some(self.cli.clone()), path_env: CHILD_PATH.to_string() }
    }

    /// A fake that removes and adds `beta` as the real one would, whichever
    /// of the two it is asked for.
    fn fake_that_does_both(&self) {
        let script = format!(
            "if [ \"$2\" = remove ]; then\n{}\nelse\n{}\nfi",
            self.removes(&claude_json(&[])),
            self.adds("beta", &[]),
        );
        self.fake(&script);
    }

    fn key(&self, name: &str) -> String {
        key_in(&self.config, name)
    }
}

/// The key the webview holds for a server: its file's path and its name.
fn key_in(file: &Path, name: &str) -> String {
    format!("{}:{name}", file.display())
}

async fn ops_set(places: &SwitchPlaces, cli: &ClaudeCli, engine: &str, key: &str, enabled: bool) -> Result<SwitchReply, SwitchFailure> {
    ops::set_enabled_for(places, cli, engine, key, enabled, |_| None).await
}

async fn ops_undo(places: &SwitchPlaces, cli: &ClaudeCli, engine: &str, receipt_id: &str) -> Result<SwitchReply, SwitchFailure> {
    ops::undo_for(places, cli, engine, receipt_id, |_| None).await
}

/// The receipt id of a switch that changed something.
fn receipt_of(reply: &SwitchReply) -> String {
    assert!(reply.undoable, "a switch that changed something can be undone");
    reply.receipt_id.clone().expect("a switch that changed something has a receipt")
}

fn failure(result: Result<SwitchReply, SwitchFailure>) -> SwitchFailure {
    match result {
        Ok(reply) => panic!("the switch was not refused: {reply:?}"),
        Err(failure) => failure,
    }
}

fn modified(path: &Path) -> std::time::SystemTime {
    fs::metadata(path).and_then(|meta| meta.modified()).unwrap_or_else(|e| panic!("{}: {e}", path.display()))
}

// --- A real file, round trip -------------------------------------------------

#[tokio::test]
async fn switching_codex_off_and_on_round_trips_a_real_file() {
    let machine = machine(&[(".codex/config.toml", CODEX)]);
    let file = machine.home().join(".codex/config.toml");
    let (places, key) = (machine.places(), key_in(&file, "beta"));

    // Off: one line is added to beta's table, and nothing else moves.
    let off = ops_set(&places, &no_cli(), "codex", &key, false).await.expect("beta is switched off");
    let after_off = fs::read_to_string(&file).unwrap();
    let (added, removed) = line_diff(CODEX, &after_off);
    assert_eq!(added, vec!["enabled = false".to_string()]);
    assert!(removed.is_empty(), "{removed:?}");
    let last_key = "env = { GREETING = \"fixture-value\" }\n";
    assert_eq!(after_off, CODEX.replacen(last_key, &format!("{last_key}enabled = false\n"), 1), "every other byte is as it was");
    assert_eq!(edit::read_flag(&after_off, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), Ok(Some(false)));
    let off_receipt = receipt_of(&off);
    assert!(off_receipt.starts_with("file:"), "{off_receipt}");
    // As the webview receives it: three fields and no more.
    let said = serde_json::to_value(&off).unwrap();
    assert_eq!(keys_of(&said), ["context", "receipt_id", "undoable"]);
    assert_eq!((&said["receipt_id"], &said["undoable"]), (&serde_json::Value::String(off_receipt.clone()), &serde_json::Value::Bool(true)));
    // The reply's context was built after the write.
    assert_eq!(verdict(item(&off.context, "beta")), (ItemState::Off, None));
    assert_eq!(verdict(item(&off.context, "zebra")), (ItemState::On, None));
    assert_eq!(off.context.engine_id, "codex");
    assert_counts_agree(&off.context);
    // And what was replaced is in the backups folder, byte for byte.
    let backups = backups_in(&machine.backups());
    assert_eq!(backups.len(), 1, "{backups:?}");
    assert_eq!(fs::read_to_string(machine.backups().join(&backups[0])).unwrap(), CODEX);

    // On: the flag says true.
    let on = ops_set(&places, &no_cli(), "codex", &key, true).await.expect("beta is switched on");
    let after_on = fs::read_to_string(&file).unwrap();
    assert_eq!(after_on, after_off.replacen("enabled = false\n", "enabled = true\n", 1));
    assert_eq!(verdict(item(&on.context, "beta")), (ItemState::On, None));
    let on_receipt = receipt_of(&on);
    assert_ne!(on_receipt, off_receipt);

    // The off cannot be taken back while the file holds what the on left.
    assert_eq!(failure(ops_undo(&places, &no_cli(), "codex", &off_receipt).await), SwitchFailure::NotUndoable);
    assert_eq!(fs::read_to_string(&file).unwrap(), after_on);

    // Undo the on, then the off: the exact original bytes.
    let back_off = ops_undo(&places, &no_cli(), "codex", &on_receipt).await.expect("the on is undone");
    assert_eq!(fs::read_to_string(&file).unwrap(), after_off);
    assert_eq!(verdict(item(&back_off.context, "beta")), (ItemState::Off, None));
    assert!(receipt_of(&back_off).starts_with("file:"), "an Undo has a receipt of its own");
    let back = ops_undo(&places, &no_cli(), "codex", &off_receipt).await.expect("the off is undone");
    assert_eq!(fs::read(&file).unwrap(), CODEX.as_bytes(), "Undo gives back the exact original bytes");
    assert_eq!(verdict(item(&back.context, "beta")), (ItemState::On, None));

    // And an Undo can be undone: beta is off again.
    let again = ops_undo(&places, &no_cli(), "codex", &receipt_of(&back)).await.expect("the Undo is undone");
    assert_eq!(fs::read_to_string(&file).unwrap(), after_off);
    assert_eq!(verdict(item(&again.context, "beta")), (ItemState::Off, None));
}

#[tokio::test]
async fn switching_to_the_state_a_server_already_has_writes_nothing() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let codex = machine.home().join(".codex/config.toml");
    let before = modified(&codex);

    // alpha has no flag and is on; beta says `enabled = false`; gamma says
    // `enabled = true`.
    for (name, enabled) in [("alpha", true), ("beta", false), ("gamma", true)] {
        let reply = ops_set(&places, &no_cli(), "codex", &key_in(&codex, name), enabled).await.expect(name);
        assert_eq!((reply.receipt_id.as_deref(), reply.undoable), (None, false), "{name}");
        assert_eq!(reply.context.items.len(), 4, "the reply still carries the context");
        let said = serde_json::to_value(&reply).unwrap();
        assert_eq!((&said["receipt_id"], &said["undoable"]), (&serde_json::Value::Null, &serde_json::Value::Bool(false)), "{name}");
    }
    assert_eq!(fs::read_to_string(&codex).unwrap(), CTX_CODEX);
    assert_eq!(modified(&codex), before);

    // Gemini: on, with no state file. Nothing is switched off, so no file is made.
    let gemini = machine.home().join(".gemini/settings.json");
    let reply = ops_set(&places, &no_cli(), "gemini", &key_in(&gemini, "beta"), true).await.expect("beta is already on");
    assert_eq!((reply.receipt_id.as_deref(), reply.undoable), (None, false));
    assert!(!machine.home().join(".gemini/mcp-server-enablement.json").exists());

    assert!(!machine.backups().exists(), "nothing was written, so nothing was backed up");
}

// --- What a key has to be ----------------------------------------------------

#[tokio::test]
async fn a_key_for_another_engine_is_refused() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let codex = machine.home().join(".codex/config.toml");
    let key = key_in(&codex, "alpha");
    // The key is a real one: Codex can be switched by it.
    let context = ops::context_for(&places, "codex", |_| None);
    assert_eq!((item(&context, "alpha").key.as_str(), item(&context, "alpha").read_only), (key.as_str(), None));

    // Gemini declares an `alpha` of its own, in another file. Asked to switch
    // Codex's, it must not write Codex's file, and must not take the name and
    // write its own state file either.
    for enabled in [false, true] {
        assert_eq!(failure(ops_set(&places, &no_cli(), "gemini", &key, enabled).await), SwitchFailure::WrongEngine);
    }
    for engine in ["claude-code", "cursor"] {
        assert_eq!(failure(ops_set(&places, &no_cli(), engine, &key, false).await), SwitchFailure::WrongEngine, "{engine}");
    }
    // An engine Hanger has never heard of owns nothing.
    assert_eq!(failure(ops_set(&places, &no_cli(), "no-such-engine", &key, false).await), SwitchFailure::WrongEngine);

    assert_eq!(fs::read_to_string(&codex).unwrap(), CTX_CODEX);
    assert!(!machine.home().join(".gemini/mcp-server-enablement.json").exists());
    assert!(!machine.backups().exists());
}

#[tokio::test]
async fn a_key_naming_a_file_another_engine_declares_servers_in_is_refused() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".cursor/mcp.json", CTX_JSON_MARKED), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let cursor = machine.home().join(".cursor/mcp.json");
    let gemini = machine.home().join(".gemini/settings.json");
    let (cursor_before, gemini_before) = (modified(&cursor), modified(&gemini));

    // A real file of another engine's, and a server it does declare.
    assert_eq!(failure(ops_set(&places, &no_cli(), "codex", &key_in(&cursor, "alpha"), false).await), SwitchFailure::WrongEngine);
    assert_eq!(failure(ops_set(&places, &no_cli(), "codex", &key_in(&gemini, "beta"), false).await), SwitchFailure::WrongEngine);
    // The same file, and a name nobody declares in it.
    assert_eq!(failure(ops_set(&places, &no_cli(), "codex", &key_in(&cursor, "nobody"), false).await), SwitchFailure::NotFound);

    assert_eq!(fs::read_to_string(&cursor).unwrap(), CTX_JSON_MARKED);
    assert_eq!(fs::read_to_string(&gemini).unwrap(), CTX_GEMINI_HOME);
    assert_eq!((modified(&cursor), modified(&gemini)), (cursor_before, gemini_before));
    assert!(!machine.backups().exists());
}

#[tokio::test]
async fn a_key_for_a_file_discovery_did_not_produce_is_refused_and_the_file_is_left_alone() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let places = machine.places();
    let real = machine.home().join(".codex/config.toml");
    // Files that would parse as a config, somewhere no engine keeps one.
    let stray_toml = machine.root.join("stray").join("config.toml");
    let stray_json = machine.home().join("notes").join("mcp.json");
    machine.put(&stray_toml, CTX_CODEX);
    machine.put(&stray_json, CTX_HOME_MCP_JSON);
    // The fixtures are what the test says: `alpha` is in the stray TOML file,
    // as it is in the real one, and `shared` is in the stray JSON one.
    assert!(read_names(CTX_CODEX, Dialect::CodexToml).contains(&"alpha".to_string()));
    assert!(read_names(CTX_HOME_MCP_JSON, Dialect::McpServers).contains(&"shared".to_string()));
    let before = (modified(&stray_toml), modified(&stray_json), modified(&real));

    for engine in ["codex", "claude-code", "cursor", "gemini"] {
        for enabled in [false, true] {
            assert_eq!(failure(ops_set(&places, &no_cli(), engine, &key_in(&stray_toml, "alpha"), enabled).await), SwitchFailure::NotFound, "{engine}");
            assert_eq!(failure(ops_set(&places, &no_cli(), engine, &key_in(&stray_json, "shared"), enabled).await), SwitchFailure::NotFound, "{engine}");
        }
    }
    // The real file under another spelling of its path is not the key
    // discovery produced, and is not looked up.
    let respelled = machine.home().join(".codex").join("..").join(".codex").join("config.toml");
    assert_eq!(fs::read_to_string(&respelled).unwrap(), CTX_CODEX, "the respelled path does lead to the real file");
    assert_eq!(failure(ops_set(&places, &no_cli(), "codex", &key_in(&respelled, "alpha"), false).await), SwitchFailure::NotFound);
    // Things that are not keys at all.
    for key in ["", ":", "alpha", ":alpha", "stash", "file:alpha"] {
        assert_eq!(failure(ops_set(&places, &no_cli(), "codex", key, false).await), SwitchFailure::NotFound, "{key:?}");
    }
    // A path nothing is at.
    let nowhere = key_in(&machine.root.join("nowhere").join("config.toml"), "alpha");
    assert_eq!(failure(ops_set(&places, &no_cli(), "codex", &nowhere, false).await), SwitchFailure::NotFound);

    assert_eq!(fs::read_to_string(&stray_toml).unwrap(), CTX_CODEX);
    assert_eq!(fs::read_to_string(&stray_json).unwrap(), CTX_HOME_MCP_JSON);
    assert_eq!(fs::read_to_string(&real).unwrap(), CTX_CODEX);
    assert_eq!((modified(&stray_toml), modified(&stray_json), modified(&real)), before);
    assert_eq!(names_in(stray_toml.parent().unwrap()), ["config.toml"], "nothing was left beside the stray file");
    assert!(!machine.backups().exists(), "nothing was backed up, because nothing was to be written");
    assert!(!places.stash.exists());
}

#[tokio::test]
async fn a_read_only_item_is_refused() {
    let machine = machine(&[
        (".cursor/mcp.json", CTX_JSON_MARKED),
        (".mcp.json", CTX_HOME_MCP_JSON),
        (".gemini/settings.json", CTX_GEMINI_HOME),
        (".codex/config.toml", CTX_CODEX_LEGACY),
    ]);
    let gemini_system = machine.system().join(GEMINI_SYSTEM_FILE);
    machine.put(&gemini_system, CTX_GEMINI_SYSTEM);
    let places = machine.places();
    let state_file = machine.home().join(".gemini/mcp-server-enablement.json");

    // Each is an item of its engine's context, shown with a reason and no switch.
    let cases = [
        ("cursor", machine.home().join(".cursor/mcp.json"), "alpha", ReadOnlyReason::EngineNotConfirmed),
        ("claude-code", machine.home().join(".mcp.json"), "homewide", ReadOnlyReason::PerProjectComesNext),
        // Gemini's switch does cover this tier: only the reason stands in the way.
        ("gemini", gemini_system.clone(), "beta", ReadOnlyReason::ManagedByPolicy),
        ("codex", machine.home().join(".codex/config.toml"), "legacy", ReadOnlyReason::EngineNotConfirmed),
    ];
    for (engine, file, name, reason) in &cases {
        let key = key_in(file, name);
        let context = ops::context_for(&places, engine, |_| None);
        let shown = context.items.iter().find(|item| item.key == key).unwrap_or_else(|| panic!("{engine} has no item {key}"));
        assert_eq!(shown.read_only, Some(*reason), "{engine} {name}");
        let before = fs::read_to_string(file).unwrap();

        for enabled in [false, true] {
            assert_eq!(failure(ops_set(&places, &no_cli(), engine, &key, enabled).await), SwitchFailure::ReadOnly, "{engine} {name} {enabled}");
        }
        assert_eq!(fs::read_to_string(file).unwrap(), before, "{engine} {name}");
    }
    assert!(!state_file.exists(), "a server Gemini is handed by policy was switched off by name");
    assert!(!machine.backups().exists());

    // A state file Gemini could not read: every Gemini server loses its switch.
    machine.put(&state_file, "{ not json");
    let key = key_in(&machine.home().join(".gemini/settings.json"), "alpha");
    assert_eq!(item(&ops::context_for(&places, "gemini", |_| None), "alpha").read_only, Some(ReadOnlyReason::FileUnparseable));
    assert_eq!(failure(ops_set(&places, &no_cli(), "gemini", &key, false).await), SwitchFailure::ReadOnly);
    assert_eq!(fs::read_to_string(&state_file).unwrap(), "{ not json");
    assert!(!machine.backups().exists());
}

#[tokio::test]
async fn a_server_pinned_to_one_project_cannot_be_switched() {
    // `gamma` is a local-scope server: declared in `.claude.json`, under one
    // project. It is no item of the machine-wide context, so no key names it.
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let before = stage.config_text();
    assert!(before.contains("\"gamma\""), "the fixture lost its local-scope server");
    let context = ops::context_for(&stage.places(), "claude-code", |_| None);
    assert_eq!(item_names(&context), ["alpha", "beta"]);

    for enabled in [false, true] {
        assert_eq!(failure(ops_set(&stage.places(), &stage.claude(), "claude-code", &stage.key("gamma"), enabled).await), SwitchFailure::NotFound);
    }

    assert!(!stage.ran(), "claude was started for a server Hanger does not switch");
    assert_eq!(stage.config_text(), before);
    assert!(stage.kept_files().is_empty());
}

// --- Gemini CLI: its state file ----------------------------------------------

#[tokio::test]
async fn gemini_off_creates_the_state_file_and_undo_removes_it() {
    let machine = machine(&[(".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let settings = machine.home().join(".gemini/settings.json");
    let state_file = machine.home().join(".gemini/mcp-server-enablement.json");
    assert!(!state_file.exists());

    let off = ops_set(&places, &no_cli(), "gemini", &key_in(&settings, "beta"), false).await.expect("beta is switched off");
    assert_eq!(json(&fs::read_to_string(&state_file).unwrap()), json(CTX_GEMINI_BETA_OFF));
    assert_eq!(mode_of(&state_file), 0o600);
    assert_eq!(verdict(item(&off.context, "beta")), (ItemState::Off, None));
    assert_eq!(verdict(item(&off.context, "alpha")), (ItemState::On, None));
    // The server's own declaration is never written: Gemini rejects a key there.
    assert_eq!(fs::read_to_string(&settings).unwrap(), CTX_GEMINI_HOME);

    // Undo takes the file away again: there was none before.
    let undone = ops_undo(&places, &no_cli(), "gemini", &receipt_of(&off)).await.expect("the off is undone");
    assert!(!state_file.exists(), "the state file Hanger made is still there");
    assert_eq!(verdict(item(&undone.context, "beta")), (ItemState::On, None));

    // And that Undo can be undone.
    let again = ops_undo(&places, &no_cli(), "gemini", &receipt_of(&undone)).await.expect("the Undo is undone");
    assert_eq!(json(&fs::read_to_string(&state_file).unwrap()), json(CTX_GEMINI_BETA_OFF));
    assert_eq!(verdict(item(&again.context, "beta")), (ItemState::Off, None));
    assert_eq!(fs::read_to_string(&settings).unwrap(), CTX_GEMINI_HOME);
}

#[tokio::test]
async fn gemini_off_for_a_second_server_keeps_the_first() {
    let machine = machine(&[(".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let settings = machine.home().join(".gemini/settings.json");
    let state_file = machine.home().join(".gemini/mcp-server-enablement.json");

    ops_set(&places, &no_cli(), "gemini", &key_in(&settings, "beta"), false).await.expect("beta off");
    let both = ops_set(&places, &no_cli(), "gemini", &key_in(&settings, "alpha"), false).await.expect("alpha off");
    assert_eq!(json(&fs::read_to_string(&state_file).unwrap()), json(r#"{"beta": {"enabled": false}, "alpha": {"enabled": false}}"#));
    assert_eq!((both.context.on_count, both.context.off_count), (0, 2));

    // On removes that server's entry and leaves the other.
    let one = ops_set(&places, &no_cli(), "gemini", &key_in(&settings, "beta"), true).await.expect("beta on");
    assert_eq!(json(&fs::read_to_string(&state_file).unwrap()), json(r#"{"alpha": {"enabled": false}}"#));
    assert_eq!(verdict(item(&one.context, "beta")), (ItemState::On, None));
    assert_eq!(verdict(item(&one.context, "alpha")), (ItemState::Off, None));
    assert!(receipt_of(&one).starts_with("file:"));
}

// --- Claude Code: through its own command ------------------------------------

#[tokio::test]
async fn claude_off_then_undo_restores_it_through_the_cli() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let (places, cli) = (stage.places(), stage.claude());

    let off = ops_set(&places, &cli, "claude-code", &stage.key("beta"), false).await.expect("beta is switched off");
    assert_eq!(stage.entry("beta"), None);
    let kept = vendor::claude_stashed(&stage.stash);
    assert_eq!(kept.len(), 1);
    assert_eq!(receipt_of(&off), format!("kept:{}", kept[0].id));
    // It stays in the context, off, under the key that switches it back on.
    let beta = item(&off.context, "beta");
    assert_eq!((beta.key.clone(), verdict(beta)), (format!("stash:{}", kept[0].id), (ItemState::Off, None)));
    assert_eq!(stage.calls(), ["trial add-json", "real remove"]);
    stage.forget_runs();

    let back = ops_undo(&places, &cli, "claude-code", &receipt_of(&off)).await.expect("the off is undone");
    assert_eq!(stage.entry("beta"), Some(json(BETA)), "the entry is back as it was");
    assert!(vendor::claude_stashed(&stage.stash).is_empty(), "the kept copy is gone once the entry is back");
    assert_eq!(receipt_of(&back), "restored:beta");
    let beta = item(&back.context, "beta");
    assert_eq!((beta.key.clone(), verdict(beta)), (stage.key("beta"), (ItemState::On, None)));
    assert_eq!(stage.calls(), ["real add-json"]);
    // The entry went to the command on stdin, never as an argument.
    assert_eq!(stage.argv(), ["mcp", "add-json", "beta", "-", "--scope", "user"]);
}

#[tokio::test]
async fn undoing_a_restore_switches_the_server_off_again() {
    let (stage, kept, _) = with_beta_off().await;
    stage.fake_that_does_both();
    let (places, cli) = (stage.places(), stage.claude());

    // On, by the key a kept server has.
    let on = ops_set(&places, &cli, "claude-code", &format!("stash:{}", kept.id), true).await.expect("beta is switched on");
    assert_eq!(receipt_of(&on), "restored:beta");
    assert_eq!(stage.entry("beta"), Some(json(BETA)));
    assert!(vendor::claude_stashed(&stage.stash).is_empty());

    let off = ops_undo(&places, &cli, "claude-code", "restored:beta").await.expect("the on is undone");
    assert_eq!(stage.entry("beta"), None);
    let kept_again = vendor::claude_stashed(&stage.stash);
    assert_eq!(kept_again.len(), 1);
    assert_ne!(kept_again[0].id, kept.id, "a new kept copy, under a new id");
    assert_eq!(receipt_of(&off), format!("kept:{}", kept_again[0].id));
    assert_eq!(verdict(item(&off.context, "beta")), (ItemState::Off, None));

    // A declared server asked to be on already is: nothing is run.
    stage.forget_runs();
    let noop = ops_set(&places, &cli, "claude-code", &stage.key("alpha"), true).await.expect("alpha is already on");
    assert_eq!((noop.receipt_id.as_deref(), noop.undoable), (None, false));
    assert!(!stage.ran());
}

#[tokio::test]
async fn a_kept_server_is_switched_on_and_nothing_else() {
    let (stage, kept, file) = with_beta_off().await;
    stage.fake_that_does_both();
    let (places, cli) = (stage.places(), stage.claude());
    let key = format!("stash:{}", kept.id);

    // Off, for a server that is already off and kept: there is nothing to
    // remove, and its kept copy is not Hanger's to throw away.
    assert_eq!(failure(ops_set(&places, &cli, "claude-code", &key, false).await), SwitchFailure::ReadOnly);
    // Kept servers are Claude Code's. No other engine is handed one.
    for engine in ["codex", "gemini", "claude-ai"] {
        assert_eq!(failure(ops_set(&places, &cli, engine, &key, true).await), SwitchFailure::WrongEngine, "{engine}");
    }
    // An id nothing is kept under, and ids that are not ids.
    for key in ["stash:00000000-0000-4000-8000-000000000009", "stash:", "stash:../../home/.claude", "stash:alpha"] {
        assert_eq!(failure(ops_set(&places, &cli, "claude-code", key, true).await), SwitchFailure::NotFound, "{key}");
    }

    assert!(!stage.ran());
    assert_eq!(stage.kept_files(), vec![file]);
    assert_eq!(stage.entry("beta"), None);
}

#[tokio::test]
async fn with_no_claude_on_the_search_path_nothing_is_kept_or_removed() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let places = stage.places();
    let before = stage.config_text();

    assert_eq!(failure(ops_set(&places, &no_cli(), "claude-code", &stage.key("beta"), false).await), SwitchFailure::CliNotFound);
    assert!(!stage.kept_folder().exists(), "something was kept for a switch that could not run");
    assert_eq!(stage.config_text(), before);

    // The same for switching a kept server back on, and for both Undos.
    let (stage, kept, file) = with_beta_off().await;
    let places = stage.places();
    assert_eq!(failure(ops_set(&places, &no_cli(), "claude-code", &format!("stash:{}", kept.id), true).await), SwitchFailure::CliNotFound);
    assert_eq!(failure(ops_undo(&places, &no_cli(), "claude-code", &format!("kept:{}", kept.id)).await), SwitchFailure::CliNotFound);
    assert_eq!(failure(ops_undo(&places, &no_cli(), "claude-code", "restored:alpha").await), SwitchFailure::CliNotFound);
    assert_eq!(stage.kept_files(), vec![file]);
    assert!(!stage.ran());
}

// --- Undo ---------------------------------------------------------------------

#[tokio::test]
async fn a_receipt_for_a_file_another_engine_reads_is_not_undoable() {
    let machine = machine(&[(".codex/config.toml", CTX_CODEX), (".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let codex = machine.home().join(".codex/config.toml");
    let off = ops_set(&places, &no_cli(), "codex", &key_in(&codex, "alpha"), false).await.expect("alpha off");
    let after_off = fs::read_to_string(&codex).unwrap();
    let gemini_off = ops_set(&places, &no_cli(), "gemini", &key_in(&machine.home().join(".gemini/settings.json"), "beta"), false).await.expect("beta off");
    let state_file = machine.home().join(".gemini/mcp-server-enablement.json");

    // Each receipt is a real one, and is refused under any engine but its own.
    for engine in ["gemini", "claude-code", "cursor", "no-such-engine"] {
        assert_eq!(failure(ops_undo(&places, &no_cli(), engine, &receipt_of(&off)).await), SwitchFailure::NotUndoable, "{engine}");
    }
    for engine in ["codex", "claude-code"] {
        assert_eq!(failure(ops_undo(&places, &no_cli(), engine, &receipt_of(&gemini_off)).await), SwitchFailure::NotUndoable, "{engine}");
    }
    assert_eq!(fs::read_to_string(&codex).unwrap(), after_off);
    assert!(state_file.exists());

    // Under their own engines both still undo.
    ops_undo(&places, &no_cli(), "codex", &receipt_of(&off)).await.expect("codex's own receipt");
    assert_eq!(fs::read_to_string(&codex).unwrap(), CTX_CODEX);
    ops_undo(&places, &no_cli(), "gemini", &receipt_of(&gemini_off)).await.expect("gemini's own receipt");
    assert!(!state_file.exists());
}

#[tokio::test]
async fn an_undo_of_nothing_hanger_did_is_not_undoable() {
    let (stage, kept, file) = with_beta_off().await;
    stage.fake_that_does_both();
    let (places, cli) = (stage.places(), stage.claude());
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);

    let garbage = [
        "",
        "garbage",
        "file",
        "file:",
        "file:not-a-receipt",
        "file:00000000-0000-4000-8000-000000000009",
        "file:../../home/.codex/config.toml",
        "kept:",
        "kept:not-an-id",
        "kept:00000000-0000-4000-8000-000000000009",
        "restored:",
        "restored:nobody",
        // A local-scope server, and a name that would read as an option.
        "restored:gamma",
        "restored:--scope",
        "stash:00000000-0000-4000-8000-000000000009",
    ];
    for receipt_id in garbage {
        assert_eq!(failure(ops_undo(&places, &cli, "claude-code", receipt_id).await), SwitchFailure::NotUndoable, "claude-code {receipt_id:?}");
        assert_eq!(failure(ops_undo(&machine.places(), &cli, "codex", receipt_id).await), SwitchFailure::NotUndoable, "codex {receipt_id:?}");
    }
    // A kept server's receipt, and a restore's, under an engine that is not
    // switched through a command.
    for engine in ["codex", "gemini", "cursor"] {
        assert_eq!(failure(ops_undo(&places, &cli, engine, &format!("kept:{}", kept.id)).await), SwitchFailure::NotUndoable, "{engine}");
        assert_eq!(failure(ops_undo(&places, &cli, engine, "restored:alpha").await), SwitchFailure::NotUndoable, "{engine}");
    }

    assert!(!stage.ran());
    assert_eq!(stage.kept_files(), vec![file]);
    assert_eq!(fs::read_to_string(machine.home().join(".codex/config.toml")).unwrap(), CTX_CODEX);
}

// --- Between the read and the write ------------------------------------------

#[tokio::test]
async fn a_file_saved_by_someone_else_mid_switch_is_not_overwritten() {
    // Review focus 1. `set_enabled_with` is `set_enabled_for` with one seam:
    // a hook run after Hanger has read the file and worked out the new text,
    // and before the write. Here it is the engine saving its own config.
    let machine = machine(&[(".codex/config.toml", CTX_CODEX)]);
    let places = machine.places();
    let codex = machine.home().join(".codex/config.toml");
    let saved_meanwhile = format!("{CTX_CODEX}\n[mcp_servers.epsilon]\ncommand = \"epsilon-server\"\n");
    let save = || fs::write(&codex, &saved_meanwhile).unwrap();

    let refused = ops::set_enabled_with(&places, &no_cli(), "codex", &key_in(&codex, "alpha"), false, |_| None, ops::Seams { before_write: &save }).await;

    assert_eq!(failure(refused), SwitchFailure::ChangedSinceRead);
    assert_eq!(fs::read_to_string(&codex).unwrap(), saved_meanwhile, "their save was written over");
    assert!(backups_in(&machine.backups()).is_empty() && receipt_files_in(&machine.backups()).is_empty(), "a write that did not happen left a receipt");
}

#[tokio::test]
async fn a_state_file_that_appeared_mid_switch_is_not_overwritten() {
    // The same for Gemini's state file: there was none when Hanger looked.
    let machine = machine(&[(".gemini/settings.json", CTX_GEMINI_HOME)]);
    let places = machine.places();
    let state_file = machine.home().join(".gemini/mcp-server-enablement.json");
    let theirs = "{\"alpha\": {\"enabled\": false}}";
    let appear = || fs::write(&state_file, theirs).unwrap();
    let key = key_in(&machine.home().join(".gemini/settings.json"), "beta");

    let refused = ops::set_enabled_with(&places, &no_cli(), "gemini", &key, false, |_| None, ops::Seams { before_write: &appear }).await;

    assert_eq!(failure(refused), SwitchFailure::ChangedSinceRead);
    assert_eq!(fs::read_to_string(&state_file).unwrap(), theirs);
    assert!(receipt_files_in(&machine.backups()).is_empty(), "a write that did not happen left a receipt");
}

// --- The second check before a write -----------------------------------------

#[test]
fn the_guard_passes_a_rewrite_that_changed_one_servers_flag_and_refuses_any_other() {
    let passes = |before: &str, after: &str, dialect: Dialect, name: &str| ops::only_the_flag_differs(before, after, dialect, name);

    // What the editor really produces, in both formats and both directions.
    let off = switch_off(CODEX, Dialect::CodexToml, SwitchKind::EnabledKey, "beta");
    assert_ne!(off, CODEX);
    assert!(passes(CODEX, &off, Dialect::CodexToml, "beta"));
    assert!(passes(&off, &switch_on(&off, Dialect::CodexToml, SwitchKind::EnabledKey, "beta"), Dialect::CodexToml, "beta"));
    for (dialect, servers_key) in JSON_DIALECTS {
        let body = format!("{{\n  // kept\n  \"{servers_key}\": {{\n    \"alpha\": {{ \"command\": \"alpha-server\" }},\n    \"beta\": {{ \"command\": \"beta-server\", }},\n  }},\n}}");
        assert_eq!(read_names(&body, dialect).len(), 2, "{dialect:?}");
        let off = switch_off(&body, dialect, SwitchKind::DisabledKey, "beta");
        assert_ne!(off, body);
        assert!(passes(&body, &off, dialect, "beta"), "{dialect:?}");
        assert!(!passes(&body, &off, dialect, "alpha"), "{dialect:?}");
    }
    let json_before = r#"{"mcpServers": {"alpha": {"command": "alpha-server"}, "beta": {"command": "beta-server"}}}"#;
    let json_after = r#"{"mcpServers": {"alpha": {"disabled": true, "command": "alpha-server"}, "beta": {"command": "beta-server"}}}"#;
    assert!(passes(json_before, json_after, Dialect::McpServers, "alpha"));
    // A stale `disabled` dropped as `enabled` is written is still only the flag.
    assert!(passes(
        "[mcp_servers.alpha]\ncommand = \"alpha-server\"\ndisabled = true\n",
        "[mcp_servers.alpha]\ncommand = \"alpha-server\"\nenabled = false\n",
        Dialect::CodexToml,
        "alpha"
    ));

    // The flag changed, and so did something else.
    let toml_before = "[mcp_servers.alpha]\ncommand = \"alpha-server\"\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\n";
    let refused_toml = [
        // the same server's command
        "[mcp_servers.alpha]\ncommand = \"another\"\nenabled = false\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\n",
        // another server's command
        "[mcp_servers.alpha]\ncommand = \"alpha-server\"\nenabled = false\n\n[mcp_servers.beta]\ncommand = \"another\"\n",
        // another server's flag
        "[mcp_servers.alpha]\ncommand = \"alpha-server\"\nenabled = false\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\nenabled = false\n",
        // another server gone
        "[mcp_servers.alpha]\ncommand = \"alpha-server\"\nenabled = false\n",
        // a setting outside the servers
        "model = \"another\"\n\n[mcp_servers.alpha]\ncommand = \"alpha-server\"\nenabled = false\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\n",
        // the server itself gone
        "[mcp_servers.beta]\ncommand = \"beta-server\"\n",
        // not TOML
        "[mcp_servers.alpha\ncommand = \"alpha-server\"\n",
    ];
    for after in refused_toml {
        assert!(!passes(toml_before, after, Dialect::CodexToml, "alpha"), "passed: {after}");
    }
    // The right change, checked for the wrong server.
    assert!(!passes(toml_before, &switch_off(toml_before, Dialect::CodexToml, SwitchKind::EnabledKey, "alpha"), Dialect::CodexToml, "beta"));
    assert!(!passes(toml_before, toml_before, Dialect::CodexToml, "nobody"));

    let refused_json = [
        r#"{"mcpServers": {"alpha": {"disabled": true, "command": "another"}, "beta": {"command": "beta-server"}}}"#,
        r#"{"mcpServers": {"alpha": {"disabled": true, "command": "alpha-server"}, "beta": {"command": "another"}}}"#,
        r#"{"mcpServers": {"alpha": {"disabled": true, "command": "alpha-server"}}}"#,
        r#"{"other": 1, "mcpServers": {"alpha": {"disabled": true, "command": "alpha-server"}, "beta": {"command": "beta-server"}}}"#,
        r#"{"mcpServers": {"alpha": {"disabled": true, "command": "alpha-server"}, "beta": {"command": "beta-server"}}"#,
    ];
    for after in refused_json {
        assert!(!passes(json_before, after, Dialect::McpServers, "alpha"), "passed: {after}");
    }
    // The servers of one dialect are not looked for under another's key.
    assert!(!passes(json_before, json_after, Dialect::VsCodeServers, "alpha"));
    // And nothing Hanger does not switch by a flag passes at all.
    for dialect in [Dialect::ClaudeJson, Dialect::ClaudeAiConnectors, Dialect::Unsupported] {
        assert!(!passes(json_before, json_after, dialect, "alpha"), "{dialect:?}");
    }
}

// --- What a refusal says ------------------------------------------------------

#[test]
fn every_failure_is_a_snake_case_code_and_nothing_more() {
    let every = [
        (SwitchFailure::NotFound, "not_found"),
        (SwitchFailure::WrongEngine, "wrong_engine"),
        (SwitchFailure::ReadOnly, "read_only"),
        (SwitchFailure::Unparseable, "unparseable"),
        (SwitchFailure::ChangedSinceRead, "changed_since_read"),
        (SwitchFailure::WriteFailed, "write_failed"),
        (SwitchFailure::NotVerified, "not_verified"),
        (SwitchFailure::WouldNotComeBack, "would_not_come_back"),
        (SwitchFailure::CliNotFound, "cli_not_found"),
        (SwitchFailure::CliFailed, "cli_failed"),
        (SwitchFailure::AlreadyThere, "already_there"),
        (SwitchFailure::NotUndoable, "not_undoable"),
        (SwitchFailure::NameRefused, "name_refused"),
    ];
    for (failure, code) in every {
        // What the command hands the webview as its `Err`.
        assert_eq!(failure.code(), code);
        // And the same thing if it is ever serialised: a bare string.
        assert_eq!(serde_json::to_value(failure).unwrap(), serde_json::Value::String(code.to_string()));
    }

    // What `mcp::switch`'s own errors become. The ones that carry a sentence
    // lose it: a code has nowhere to put one.
    let sentence = || MARKER.to_string();
    let from_edit = [
        (EditError::NotFound, SwitchFailure::NotFound),
        (EditError::Unparseable(sentence()), SwitchFailure::Unparseable),
        (EditError::UnsupportedDialect, SwitchFailure::ReadOnly),
    ];
    for (error, failure) in from_edit {
        assert_eq!(SwitchFailure::from(error), failure);
    }
    let from_apply = [
        (ApplyError::ChangedSinceRead, SwitchFailure::ChangedSinceRead),
        (ApplyError::Backup(sentence()), SwitchFailure::WriteFailed),
        (ApplyError::Write(sentence()), SwitchFailure::WriteFailed),
        (ApplyError::Verify(sentence()), SwitchFailure::NotVerified),
        (ApplyError::NotUndoable(sentence()), SwitchFailure::NotUndoable),
    ];
    for (error, failure) in from_apply {
        assert_eq!(SwitchFailure::from(error), failure);
        assert!(!failure.code().contains(MARKER) && !format!("{failure:?}").contains(MARKER));
    }
    let from_vendor = [
        (SwitchError::NotFound, SwitchFailure::NotFound),
        (SwitchError::NameRefused, SwitchFailure::NameRefused),
        (SwitchError::CliFailed, SwitchFailure::CliFailed),
        (SwitchError::NotVerified, SwitchFailure::NotVerified),
        (SwitchError::StashFailed(sentence()), SwitchFailure::WriteFailed),
        (SwitchError::AlreadyThere, SwitchFailure::AlreadyThere),
        (SwitchError::WouldNotComeBack, SwitchFailure::WouldNotComeBack),
    ];
    for (error, failure) in from_vendor {
        assert_eq!(SwitchFailure::from(error), failure);
    }
}

#[tokio::test]
async fn a_server_claude_code_would_not_give_back_is_refused_by_its_code() {
    // A vendor failure reaches the webview as its code: here, the pre-flight's.
    let stage = stage(&claude_json(&[("epsilon", EPSILON)]));
    stage.fake_with_trial(&stage.writes_instead(EPSILON_AS_WRITTEN_BACK), &stage.removes(&claude_json(&[])));
    let before = stage.config_text();

    let refused = ops_set(&stage.places(), &stage.claude(), "claude-code", &stage.key("epsilon"), false).await;

    assert_eq!(failure(refused), SwitchFailure::WouldNotComeBack);
    assert_not_switched_off(&stage, &before);
}

// --- Measure all ---------------------------------------------------------------

#[tokio::test]
async fn measure_never_starts_a_switched_off_server() {
    let machine = machine(&[]);
    let places = machine.places();
    let db = machine.root.join("data").join("hanger.db");
    fs::create_dir_all(db.parent().unwrap()).unwrap();
    // Two servers whose programs leave a file behind when they are started,
    // and then exit without speaking MCP.
    let server = |name: &str| -> (PathBuf, PathBuf) {
        let (program, started) = (machine.root.join("bin").join(name), machine.root.join(format!("{name}.started")));
        machine.put(&program, &format!("#!/bin/sh\ntouch {}\n", sh(&started)));
        fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
        (program, started)
    };
    let (on_program, on_started) = server("on-server");
    let (off_program, off_started) = server("off-server");
    machine.put(
        &machine.home().join(".codex/config.toml"),
        &format!(
            "[mcp_servers.alpha]\ncommand = \"{}\"\n\n[mcp_servers.beta]\ncommand = \"{}\"\nenabled = false\n",
            on_program.display(),
            off_program.display()
        ),
    );
    // Nothing is measured before anybody asks.
    let before = ops::context_for(&places, "codex", |key| ops::cached_measure(&db, key));
    assert_eq!((verdict(item(&before, "alpha")), verdict(item(&before, "beta"))), ((ItemState::On, None), (ItemState::Off, None)));
    assert_eq!((item(&before, "alpha").estimated_tokens, before.measured_on_count), (None, 0));
    assert!(!on_started.exists() && !off_started.exists(), "reading the context started a server");

    let asked_at = Instant::now();
    let context = ops::measure_for(&places, "codex", &db, 1_700_000_000_000).await;
    assert!(asked_at.elapsed() < Duration::from_secs(15), "a server that exits at once took {:?} to measure", asked_at.elapsed());

    assert!(on_started.exists(), "the switched-on server was never started, so nothing was measured");
    assert!(!off_started.exists(), "a switched-off server was started to measure it");
    // The one that was started did not complete a handshake. That is an
    // answer, of zero: it is measured, and the other is not.
    let alpha = item(&context, "alpha");
    assert_eq!((alpha.estimated_tokens, alpha.tool_count), (Some(0), Some(0)));
    let beta = item(&context, "beta");
    assert_eq!((beta.state, beta.estimated_tokens, beta.tool_count), (ItemState::Off, None, None));
    assert_eq!((context.on_count, context.measured_on_count, context.on_tokens_measured), (1, 1, 0));
    assert_counts_agree(&context);

    // Asked again a moment later, the answer is in the store: nothing is started.
    fs::remove_file(&on_started).unwrap();
    let again = ops::measure_for(&places, "codex", &db, 1_700_000_000_001).await;
    assert!(!on_started.exists(), "a server with a fresh answer was started again");
    assert!(!off_started.exists());
    assert_eq!(item(&again, "alpha").estimated_tokens, Some(0));

    // An engine with nothing declared measures nothing, and says so.
    let none = ops::measure_for(&places, "cursor", &db, 1_700_000_000_002).await;
    assert_eq!((none.items.len(), none.on_count), (0, 0));
}

// ---------------------------------------------------------------------------
// Kept servers, beside the MCP servers list: `ops::kept_off_for`.
//
// A server switched off for Claude Code is declared in no file while it is
// off, so it is no registration. It joins no row of the list and no count the
// list's header is built from; it is reported beside the list, with figures
// of its own.
// ---------------------------------------------------------------------------

use tauri_app_lib::mcp::servers::{self, McpServerRow};
use tauri_app_lib::mcp::switch::ops::{KeptOff, KeptOffServer};
use tauri_app_lib::scanner::{self as asset_scanner, DirectoryScanner, Grouping, Scanner};

/// A Codex config in the stage's home declaring these servers.
fn codex_declares(stage: &Stage, names: &[&str]) {
    let path = stage.root.join("home").join(".codex").join("config.toml");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    let text: String = names.iter().map(|name| format!("[mcp_servers.{name}]\ncommand = \"{name}-server\"\n\n")).collect();
    fs::write(&path, text).unwrap();
}

/// `beta` switched off through `ops` and the fake `claude`.
async fn switch_beta_off(stage: &Stage, places: &SwitchPlaces) {
    ops_set(places, &stage.claude(), "claude-code", &stage.key("beta"), false).await.expect("beta is switched off");
    assert_eq!(stage.entry("beta"), None, "the fake removed beta");
}

/// The MCP servers list's rows. `lib.rs::mcp_server_rows_for` is private to
/// the crate, so this is its grouping step: `servers::group_servers` over the
/// machine pass without `ScopeTier::Local` (`lib.rs::machine_wide`). The two
/// steps it leaves out, `apply_tool_counts` and the override note, fill in
/// fields of rows that already exist and add none.
fn list_rows(places: &SwitchPlaces) -> Vec<McpServerRow> {
    let found = discover::discover_machine_at(&places.home, &places.system);
    let machine_wide: Vec<_> = found.registrations.into_iter().filter(|reg| reg.tier != ScopeTier::Local).collect();
    servers::group_servers(&machine_wide)
}

fn kept_names(report: &KeptOff) -> Vec<&str> {
    report.servers.iter().map(|kept| kept.name.as_str()).collect()
}

fn empty_report() -> KeptOff {
    KeptOff { servers: Vec::new(), count: 0, only_kept_count: 0 }
}

#[tokio::test]
async fn a_server_kept_off_and_declared_elsewhere_says_so() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    codex_declares(&stage, &["beta"]);
    stage.fake_that_does_both();
    let places = stage.places();
    switch_beta_off(&stage, &places).await;

    let stashed = vendor::claude_stashed(&stage.stash);
    assert_eq!(stashed.len(), 1);
    let claude_code = registry::host_by_id("claude-code").expect("Claude Code is a host");
    let report = ops::kept_off_for(&places);
    assert_eq!(
        report.servers,
        vec![KeptOffServer {
            key: format!("stash:{}", stashed[0].id),
            name: "beta".to_string(),
            engine_id: "claude-code".to_string(),
            engine_name: claude_code.display_name.to_string(),
            transport: "stdio".to_string(),
            at_ms: stashed[0].at_ms,
            also_declared: true,
        }]
    );
    assert_eq!((report.count, report.only_kept_count), (1, 0));
    // The list does have a row for it: Codex's.
    assert!(list_rows(&places).iter().any(|row| row.name == "beta"));
}

#[tokio::test]
async fn a_server_only_the_stash_knows_is_still_reported() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let places = stage.places();
    switch_beta_off(&stage, &places).await;

    let report = ops::kept_off_for(&places);
    assert_eq!(kept_names(&report), ["beta"]);
    assert!(!report.servers[0].also_declared);
    assert_eq!((report.count, report.only_kept_count), (1, 1));
    assert!(!list_rows(&places).iter().any(|row| row.name == "beta"), "nothing declares beta now");
}

#[tokio::test]
async fn kept_servers_join_no_row_and_no_count_of_the_servers_list() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let places = stage.places();
    let before = list_rows(&places);
    assert!(before.iter().any(|row| row.name == "beta"), "beta has a row while it is declared");

    switch_beta_off(&stage, &places).await;
    let after = list_rows(&places);

    assert!(!after.iter().any(|row| row.name == "beta"), "a kept server became a row: {after:?}");
    assert_eq!(after.len(), before.len() - 1);
    // Every other row is as it was: no registration, file or name joined one.
    let shape = |rows: &[McpServerRow]| -> Vec<(String, usize, usize, Vec<String>)> {
        rows.iter()
            .filter(|row| row.name != "beta")
            .map(|row| (row.name.clone(), row.registration_count, row.file_count, row.registrations.clone()))
            .collect()
    };
    assert_eq!(shape(&after), shape(&before));
    // Beside the list, not inside it.
    let report = ops::kept_off_for(&places);
    assert_eq!(kept_names(&report), ["beta"]);
    assert_eq!((report.count, report.only_kept_count), (1, 1));
}

#[tokio::test]
async fn the_key_switches_the_server_back_on() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let (places, cli) = (stage.places(), stage.claude());
    switch_beta_off(&stage, &places).await;

    let report = ops::kept_off_for(&places);
    let kept = report.servers.first().expect("beta is reported as kept");
    let on = ops::set_enabled_for(&places, &cli, &kept.engine_id, &kept.key, true, |_| None)
        .await
        .expect("the reported key switches beta back on");
    assert_eq!(receipt_of(&on), "restored:beta");
    assert_eq!(stage.entry("beta"), Some(json(BETA)));
    assert_eq!(ops::kept_off_for(&places), empty_report());
}

#[test]
fn a_local_tier_declaration_does_not_count_as_declared() {
    // `CLAUDE_TAIL` declares `gamma` under `projects["/work/app"].mcpServers`
    // and nowhere else.
    let stage = stage(&claude_json(&[]));
    let places = stage.places();
    let found = discover::discover_machine_at(&places.home, &places.system);
    let gamma: Vec<ScopeTier> = found.registrations.iter().filter(|reg| reg.server.name == "gamma").map(|reg| reg.tier).collect();
    assert_eq!(gamma, [ScopeTier::Local], "the fixture declares gamma at local scope only");

    stage.keep_by_hand("00000000-0000-4000-8000-000000000001", "gamma", 1_700_000_000_000, r#"{"command": "gamma-server"}"#);
    let report = ops::kept_off_for(&places);
    assert_eq!(kept_names(&report), ["gamma"]);
    assert!(!report.servers[0].also_declared, "a local-scope server has no row in the list");
    assert_eq!((report.count, report.only_kept_count), (1, 1));
}

#[test]
fn kept_names_are_matched_as_the_list_groups_them() {
    // `CLAUDE_HEAD` declares `alpha` at user scope. The list groups by the
    // name trimmed, and folds nothing else.
    let stage = stage(&claude_json(&[]));
    let places = stage.places();
    stage.keep_by_hand("00000000-0000-4000-8000-000000000002", "Alpha", 1_700_000_000_002, r#"{"command": "alpha-server"}"#);
    stage.keep_by_hand("00000000-0000-4000-8000-000000000001", " alpha ", 1_700_000_000_001, r#"{"command": "alpha-server"}"#);

    let report = ops::kept_off_for(&places);
    assert_eq!(kept_names(&report), ["Alpha", " alpha "]);
    assert!(!report.servers[0].also_declared, "a kept Alpha and a declared alpha are not the same name");
    assert!(report.servers[1].also_declared, "the list groups a name trimmed");
    assert_eq!((report.count, report.only_kept_count), (2, 1));
}

#[test]
fn nothing_kept_is_an_empty_report() {
    let stage = stage(&claude_json(&[]));
    let places = stage.places();
    assert!(!places.stash.exists());
    assert_eq!(ops::kept_off_for(&places), empty_report(), "no stash folder");

    fs::create_dir_all(stage.kept_folder()).unwrap();
    assert_eq!(ops::kept_off_for(&places), empty_report(), "an empty stash folder");

    let said = serde_json::to_value(empty_report()).unwrap();
    assert_eq!(said, serde_json::json!({"servers": [], "count": 0, "only_kept_count": 0}));
}

#[tokio::test]
async fn the_kept_report_carries_no_value_from_the_entry() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    stage.fake_that_does_both();
    let places = stage.places();
    switch_beta_off(&stage, &places).await;
    stage.keep_by_hand("00000000-0000-4000-8000-000000000003", "delta", 1, DELTA);
    // The fixture does carry every value: in the kept files.
    let kept_text: String =
        stage.kept_files().iter().map(|file| fs::read_to_string(stage.kept_folder().join(file)).unwrap()).collect();
    for value in KEPT_VALUES {
        assert!(kept_text.contains(value), "the fixture no longer holds {value}");
    }

    let report = ops::kept_off_for(&places);
    assert_eq!(kept_names(&report), ["beta", "delta"]);
    let said = serde_json::to_value(&report).unwrap();
    assert_eq!(keys_of(&said), ["count", "only_kept_count", "servers"]);
    for server in said["servers"].as_array().unwrap() {
        assert_eq!(keys_of(server), ["also_declared", "at_ms", "engine_id", "engine_name", "key", "name", "transport"]);
    }
    let text = said.to_string();
    for value in KEPT_VALUES {
        assert!(!text.contains(value), "{value} reached the report: {text}");
    }
    assert_eq!(report.servers[1].transport, "https://example.test/mcp");
}

#[tokio::test]
async fn counts_agree_with_the_list() {
    let stage = stage(&claude_json(&[("beta", BETA)]));
    codex_declares(&stage, &["beta"]);
    stage.fake_that_does_both();
    let places = stage.places();
    switch_beta_off(&stage, &places).await;
    stage.keep_by_hand("00000000-0000-4000-8000-000000000004", "solo", 1, r#"{"command": "solo-server"}"#);

    let report = ops::kept_off_for(&places);
    let mut names = kept_names(&report);
    names.sort_unstable();
    assert_eq!(names, ["beta", "solo"]);
    assert_eq!(report.count, report.servers.len());
    assert_eq!(report.only_kept_count, report.servers.iter().filter(|kept| !kept.also_declared).count());
    assert_eq!((report.count, report.only_kept_count), (2, 1));
}

/// Scan the home into a new database and count it as `get_asset_counts`
/// does, under both groupings.
fn asset_counts(stage: &Stage, label: &str) -> [tauri_app_lib::domain::AssetCounts; 2] {
    let home = stage.root.join("home");
    let db_path = stage.root.join(format!("{label}.db"));
    // The scanner finds its home through `scanner::get_home_dir`. No other
    // test in this file reads that variable.
    std::env::set_var("HANGER_TEST_HOME", &home);
    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    scanner.scan(&home).expect("the temp home scans");
    std::env::remove_var("HANGER_TEST_HOME");
    [Grouping::PerRegistration, Grouping::Grouped]
        .map(|grouping| asset_scanner::count_assets(&db_path, None, grouping).expect("counted"))
}

#[tokio::test]
async fn per_kind_asset_counts_are_unchanged_by_a_kept_server() {
    let mut stage = stage(&claude_json(&[("beta", BETA)]));
    // The stash where production keeps it: in the app's data folder, which is
    // under the home.
    stage.stash = stage.root.join("home/Library/Application Support/com.rkarthik.hanger/switch/stash");
    stage.fake_that_does_both();
    let places = SwitchPlaces { stash: stage.stash.clone(), ..places_at(&stage.root) };
    // One of each of the other three kinds.
    let home = stage.root.join("home");
    for (rel, body) in [
        (".claude/skills/probe/SKILL.md", "---\nname: probe\ndescription: A probe skill\n---\n# Probe\n"),
        (".claude/agents/probe.md", "---\nname: probe-agent\ndescription: A probe subagent\n---\n# Probe\n"),
        (".claude/CLAUDE.md", "# Probe rules\n"),
    ] {
        fs::create_dir_all(home.join(rel).parent().unwrap()).unwrap();
        fs::write(home.join(rel), body).unwrap();
    }

    let before = asset_counts(&stage, "before");
    ops_set(&places, &stage.claude(), "claude-code", &stage.key("beta"), false).await.expect("beta is switched off");
    assert_eq!(kept_names(&ops::kept_off_for(&places)), ["beta"]);
    let kept = asset_counts(&stage, "kept");
    // The same home with the stash moved out of it.
    fs::rename(&stage.stash, stage.root.join("stash-elsewhere")).unwrap();
    let without_stash = asset_counts(&stage, "without-stash");

    println!("before: {before:?}\nkept: {kept:?}\nwithout stash: {without_stash:?}");
    // A kept server adds nothing to any figure.
    assert_eq!(kept, without_stash);
    for (before, kept) in before.iter().zip(&kept) {
        assert!(before.skill.as_ref().is_some_and(|count| count.total > 0), "the fixture's skill is counted: {before:?}");
        assert!(before.subagent.as_ref().is_some_and(|count| count.total > 0), "the fixture's subagent is counted: {before:?}");
        assert!(before.rule.as_ref().is_some_and(|count| count.total > 0), "the fixture's rule is counted: {before:?}");
        assert_eq!((&kept.skill, &kept.rule, &kept.subagent), (&before.skill, &before.rule, &before.subagent));
        // The switch-off removed beta's one declaration, so the tools figure
        // loses it, and gains nothing back from the stash.
        let tools = |counts: &tauri_app_lib::domain::AssetCounts| counts.tool.as_ref().map_or(0, |count| count.total);
        assert_eq!(tools(kept), tools(before) - 1, "before: {before:?}, kept: {kept:?}");
    }
}
