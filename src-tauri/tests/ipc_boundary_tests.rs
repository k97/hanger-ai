//! What the webview is allowed to receive.
//!
//! A config file may declare a credential in its launch arguments. The Rust
//! process legitimately holds it — it read the file. The webview must never
//! see it: once a value is in the JS heap it is in devtools, in any render site
//! that joins it, and in any future component that reaches for the field.
//!
//! This asserts the property directly rather than grepping call sites, so
//! removing the serde attribute fails here rather than shipping.

use tauri_app_lib::domain::{Scope, Tool};

fn tool_with_a_credential() -> Tool {
    Tool {
        id: "/tmp/mcp.json-protected".to_string(),
        name: "protected".to_string(),
        command: "npx".to_string(),
        args: vec![
            "mcp-remote".to_string(),
            "https://example.com/sse".to_string(),
            "--header".to_string(),
            "Authorization: Bearer REDACT_ME_1".to_string(),
        ],
        launch_display: "npx mcp-remote https://example.com/sse --header Authorization: <redacted>"
            .to_string(),
        transport: "stdio".to_string(),
        // Fix round 1 (task 9): this fixture's command/args ARE an
        // mcp-remote invocation -- `bridged: false` was internally
        // inconsistent with its own shape. `true` matches what
        // `unwrap_bridge` would derive for this exact command/args pair;
        // `transport` stays "stdio" untouched because no test in this file
        // asserts on it and correcting it is outside this fix's scope.
        bridged: true,
        config_path: "/tmp/mcp.json".to_string(),
        scope: Scope::Global { agent: "claude-code".to_string() },
        owning_agent: "claude-code".to_string(),
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
        origin: None,
        origin_blocked: None,
    }
}

#[test]
fn a_serialised_tool_carries_no_launch_arguments() {
    let tool = tool_with_a_credential();
    // The fixture must actually carry the credential, or the assertion below
    // passes for the wrong reason. A guard that cannot fail is not a guard.
    assert!(
        tool.args.iter().any(|a| a.contains("REDACT_ME_1")),
        "the fixture stopped carrying a credential; this test now proves nothing"
    );
    let json = serde_json::to_string(&tool).expect("serialise");
    assert!(
        !json.contains("REDACT_ME_1"),
        "a credential from the config reached the IPC payload: {}",
        json
    );
    assert!(
        !json.contains("\"args\""),
        "the args field is serialised; the webview can read it: {}",
        json
    );
}

#[test]
fn a_serialised_tool_still_carries_its_redacted_launch() {
    // The counterpart: suppressing args must not suppress the thing that
    // replaced it, or the panel has nothing to show and the fix reads as a
    // regression rather than a redaction.
    let json = serde_json::to_string(&tool_with_a_credential()).expect("serialise");
    assert!(json.contains("launch_display"), "{}", json);
    assert!(json.contains("<redacted>"), "{}", json);
}

#[test]
fn a_tool_survives_a_json_round_trip_without_its_arguments() {
    // `default` is what keeps Deserialize working once the field stops being
    // written. Without it a round-trip fails at runtime rather than at compile
    // time.
    let json = serde_json::to_string(&tool_with_a_credential()).expect("serialise");
    let back: Tool = serde_json::from_str(&json).expect("deserialise");
    assert_eq!(back.name, "protected");
    assert!(back.args.is_empty(), "args must default to empty, not fail to parse");
}

// ---------------------------------------------------------------------------
// Switching an MCP server off and on (`mcp::switch::ops`, behind the four
// commands `get_engine_context`, `set_mcp_server_enabled`, `undo_mcp_switch`
// and `measure_engine_context`).
//
// To switch a server Hanger reads the whole of its config file, and for
// Claude Code keeps the server's entry and runs a command that prints. None
// of that may come back: a reply says which servers there are and whether
// each is on, and a refusal is one word.
// ---------------------------------------------------------------------------

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use tauri_app_lib::mcp::dialect::McpServer;
use tauri_app_lib::mcp::discover;
use tauri_app_lib::mcp::probe::cache_key;
use tauri_app_lib::mcp::switch::context::EngineContext;
use tauri_app_lib::mcp::switch::ops::{self, ClaudeCli, SwitchFailure, SwitchPlaces, SwitchReply};
use tauri_app_lib::mcp::switch::vendor;

/// What the fixture entries hold: a command, an argument, an env variable's
/// name and its value. None may appear in anything the webview is handed.
const SWITCH_COMMAND: &str = "switch-marker-command";
const SWITCH_ARG: &str = "switch-marker-arg";
const SWITCH_ENV_NAME: &str = "SWITCH_MARKER_SETTING";
const SWITCH_ENV_VALUE: &str = "switch-marker-env-value";
const SWITCH_MARKERS: [&str; 4] = [SWITCH_COMMAND, SWITCH_ARG, SWITCH_ENV_NAME, SWITCH_ENV_VALUE];

const MARKED_CODEX: &str = "# kept\n[mcp_servers.alpha]\ncommand = \"switch-marker-command\"\nargs = [\"switch-marker-arg\"]\n\n[mcp_servers.alpha.env]\nSWITCH_MARKER_SETTING = \"switch-marker-env-value\"\n\n[mcp_servers.beta]\ncommand = \"beta-server\"\n";
const MARKED_CLAUDE: &str = r#"{
  "mcpServers": {
    "alpha": {
      "command": "switch-marker-command",
      "args": ["switch-marker-arg"],
      "env": { "SWITCH_MARKER_SETTING": "switch-marker-env-value" }
    }
  }
}
"#;

/// A home, a system root and Hanger's two folders, all in one temp folder.
struct SwitchBench {
    _dir: tempfile::TempDir,
    root: PathBuf,
    places: SwitchPlaces,
}

fn switch_bench(home_file: &str, body: &str) -> SwitchBench {
    // Discovery resolves a relocated config folder from the process
    // environment, not from the home it is handed.
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("CODEX_HOME");
    let dir = tempfile::tempdir().expect("temp dir");
    let root = fs::canonicalize(dir.path()).expect("real temp dir");
    let file = root.join("home").join(home_file);
    fs::create_dir_all(file.parent().unwrap()).unwrap();
    fs::write(&file, body).unwrap();
    let switch = root.join("data").join("switch");
    let places = SwitchPlaces { home: root.join("home"), system: root.join("system"), backups: switch.join("backups"), stash: switch.join("stash") };
    SwitchBench { _dir: dir, root, places }
}

impl SwitchBench {
    fn file(&self, home_file: &str) -> PathBuf {
        self.places.home.join(home_file)
    }

    /// A stand-in for `claude` that removes and adds a user-scope server the
    /// way the real one does, and prints the fixture's values while it does:
    /// what a command prints must not come back either.
    fn fake_claude(&self) -> ClaudeCli {
        let quoted = |path: &Path| {
            let text = path.to_str().expect("a UTF-8 temp path");
            assert!(!text.contains('\''), "the temp path cannot be quoted: {text}");
            format!("'{text}'")
        };
        let config = quoted(&self.file(".claude.json"));
        let script = format!(
            "#!/bin/sh
printf 'Handling %s: {SWITCH_COMMAND} {SWITCH_ARG} {SWITCH_ENV_NAME}={SWITCH_ENV_VALUE}\\n' \"$3\"
case \"$CLAUDE_CONFIG_DIR\" in
  */.preflight-*)
    {{ printf '{{\"mcpServers\": {{\"%s\": ' \"$3\"; cat; printf '}}}}'; }} > \"$CLAUDE_CONFIG_DIR/.claude.json\"
    exit 0 ;;
esac
if [ \"$2\" = remove ]; then
  printf '{{\"mcpServers\": {{}}}}' > {config}
else
  {{ printf '{{\"mcpServers\": {{\"%s\": ' \"$3\"; cat; printf '}}}}'; }} > {config}
fi
"
        );
        let program = self.root.join("bin").join("claude");
        fs::create_dir_all(program.parent().unwrap()).unwrap();
        fs::write(&program, script).unwrap();
        fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).unwrap();
        ClaudeCli { program: Some(program), path_env: "/usr/bin:/bin".to_string() }
    }

    /// What the machine pass read out of the fixture for `alpha`.
    fn alpha_as_read(&self, host_id: &str) -> McpServer {
        let found = discover::discover_machine_at(&self.places.home, &self.places.system);
        let alpha = found.registrations.iter().find(|reg| reg.host_id == host_id && reg.server.name == "alpha").expect("alpha is declared");
        alpha.server.clone()
    }
}

/// What one run handed back, as the webview would receive it. Each thing is
/// checked as it is said, before the next call is made: a value that rode
/// along in a receipt id would otherwise break the Undo that follows, and the
/// test would stop there without having named what was wrong.
#[derive(Default)]
struct Said {
    replies: usize,
    contexts: usize,
    refusals: usize,
}

impl Said {
    fn check(&self, line: &str) {
        for marker in SWITCH_MARKERS {
            assert!(!line.contains(marker), "{marker} reached the webview: {line}");
        }
    }

    /// A reply or a context describes `alpha` by name, so a check that finds
    /// no value in it has not simply been handed something empty.
    fn check_described(&self, line: &str) {
        assert!(line.contains("\"name\":\"alpha\""), "this does not describe the server at all: {line}");
        self.check(line);
    }

    fn reply(&mut self, result: Result<SwitchReply, SwitchFailure>) -> SwitchReply {
        let reply = result.unwrap_or_else(|failure| panic!("refused: {}", failure.code()));
        self.check_described(&serde_json::to_string(&reply).expect("serialise"));
        self.replies += 1;
        reply
    }

    fn context(&mut self, context: &EngineContext) {
        self.check_described(&serde_json::to_string(context).expect("serialise"));
        self.contexts += 1;
    }

    fn refusal(&mut self, result: Result<SwitchReply, SwitchFailure>, expected: SwitchFailure) {
        let failure = result.err().expect("this must be refused");
        assert_eq!(failure, expected);
        // The command's `Err`, the same thing serialised, and its Debug form.
        self.check(failure.code());
        self.check(&serde_json::to_string(&failure).expect("serialise"));
        self.check(&format!("{failure:?}"));
        self.refusals += 1;
    }
}

fn receipt(reply: &SwitchReply) -> String {
    reply.receipt_id.clone().expect("this switch changed something")
}

#[tokio::test]
async fn switch_replies_never_carry_a_config_value() {
    // --- A flag in a Codex file ---------------------------------------------
    let bench = switch_bench(".codex/config.toml", MARKED_CODEX);
    let file = bench.file(".codex/config.toml");
    let key = format!("{}:alpha", file.display());
    let db = bench.root.join("data").join("hanger.db");
    let no_cli = ClaudeCli { program: None, path_env: String::new() };
    // The fixture does hold the values, and Rust did read them.
    let alpha = bench.alpha_as_read("codex");
    assert_eq!((alpha.command.as_str(), alpha.args.as_slice(), alpha.env_keys.as_slice()), (SWITCH_COMMAND, [SWITCH_ARG.to_string()].as_slice(), [SWITCH_ENV_NAME.to_string()].as_slice()));
    for marker in SWITCH_MARKERS {
        assert!(MARKED_CODEX.contains(marker) && MARKED_CLAUDE.contains(marker), "a fixture lost {marker}");
    }

    let mut said = Said::default();
    said.context(&ops::context_for(&bench.places, "codex", |key| ops::cached_measure(&db, key)));
    let off = said.reply(ops::set_enabled_for(&bench.places, &no_cli, "codex", &key, false, |_| None).await);
    assert!(fs::read_to_string(&file).unwrap().contains("enabled = false"), "the switch did not happen");
    let on = said.reply(ops::set_enabled_for(&bench.places, &no_cli, "codex", &key, true, |_| None).await);
    let undone = said.reply(ops::undo_for(&bench.places, &no_cli, "codex", &receipt(&on), |_| None).await);
    said.reply(ops::undo_for(&bench.places, &no_cli, "codex", &receipt(&off), |_| None).await);
    assert_eq!(fs::read_to_string(&file).unwrap(), MARKED_CODEX);
    // Asking the server what it costs starts `switch-marker-command`, which
    // is not a program: the probe's own error names it, and is stored.
    said.context(&ops::measure_for(&bench.places, "codex", &db, 1_700_000_000_000).await);
    let launch = cache_key(&alpha.command, &alpha.args, &alpha.env_keys, alpha.project_root.as_deref(), &alpha.transport);
    let stored = tauri_app_lib::preferences::get_probe_result(&db, &launch).unwrap().expect("the probe's answer is in the store");
    assert!(stored.result.error.is_some_and(|error| error.contains(SWITCH_COMMAND)), "the probe error no longer names the program, so the measured context proves less");

    // Refusals, each for a file that holds the values.
    said.refusal(ops::set_enabled_for(&bench.places, &no_cli, "codex", &format!("{}:nobody", file.display()), false, |_| None).await, SwitchFailure::NotFound);
    said.refusal(ops::set_enabled_for(&bench.places, &no_cli, "gemini", &key, false, |_| None).await, SwitchFailure::WrongEngine);
    said.refusal(ops::undo_for(&bench.places, &no_cli, "codex", &receipt(&undone), |_| None).await, SwitchFailure::NotUndoable);
    said.refusal(ops::undo_for(&bench.places, &no_cli, "gemini", &receipt(&off), |_| None).await, SwitchFailure::NotUndoable);
    let resaved = format!("{MARKED_CODEX}# saved by someone else\n");
    let resave = || fs::write(&file, &resaved).unwrap();
    said.refusal(
        ops::set_enabled_with(&bench.places, &no_cli, "codex", &key, false, |_| None, ops::Seams { before_write: &resave }).await,
        SwitchFailure::ChangedSinceRead,
    );
    assert_eq!((said.replies, said.contexts, said.refusals), (4, 2, 5));

    // --- Claude Code, through its own command -------------------------------
    let bench = switch_bench(".claude.json", MARKED_CLAUDE);
    let claude = bench.fake_claude();
    let key = format!("{}:alpha", bench.file(".claude.json").display());
    let alpha = bench.alpha_as_read("claude-code");
    assert_eq!((alpha.command.as_str(), alpha.env_keys.as_slice()), (SWITCH_COMMAND, [SWITCH_ENV_NAME.to_string()].as_slice()));

    let mut said = Said::default();
    said.context(&ops::context_for(&bench.places, "claude-code", |_| None));
    let off = said.reply(ops::set_enabled_for(&bench.places, &claude, "claude-code", &key, false, |_| None).await);
    // Hanger now holds the only copy of the entry, values and all, and lists
    // the env variable's name on the Rust side.
    let kept = vendor::claude_stashed(&bench.places.stash);
    assert_eq!(kept.len(), 1);
    assert_eq!(kept[0].env_keys, vec![SWITCH_ENV_NAME.to_string()]);
    let kept_text = fs::read_to_string(bench.places.stash.join("claude-code").join(format!("{}.json", kept[0].id))).unwrap();
    assert!(kept_text.contains(SWITCH_ENV_VALUE), "the kept copy does not hold the entry");
    assert!(!fs::read_to_string(bench.file(".claude.json")).unwrap().contains(SWITCH_COMMAND), "the fake removed nothing");

    let on = said.reply(ops::set_enabled_for(&bench.places, &claude, "claude-code", &format!("stash:{}", kept[0].id), true, |_| None).await);
    assert!(fs::read_to_string(bench.file(".claude.json")).unwrap().contains(SWITCH_ENV_VALUE), "the fake added nothing");
    let off_again = said.reply(ops::undo_for(&bench.places, &claude, "claude-code", &receipt(&on), |_| None).await);
    said.reply(ops::undo_for(&bench.places, &claude, "claude-code", &receipt(&off_again), |_| None).await);
    said.context(&ops::measure_for(&bench.places, "claude-code", &db, 1_700_000_000_000).await);

    said.refusal(ops::undo_for(&bench.places, &claude, "claude-code", &receipt(&off), |_| None).await, SwitchFailure::NotUndoable);
    said.refusal(ops::set_enabled_for(&bench.places, &no_cli, "claude-code", &key, false, |_| None).await, SwitchFailure::CliNotFound);
    said.refusal(ops::set_enabled_for(&bench.places, &claude, "codex", &key, false, |_| None).await, SwitchFailure::WrongEngine);
    assert_eq!((said.replies, said.contexts, said.refusals), (4, 2, 3));
}

// The skill switch: what its four commands hand the webview.

use tauri_app_lib::skill_switch::ops::{self as skill_ops, SkillPlaces};

const SKILL_MARKER: &str = "SKILL_BODY_MARKER_7f3a";

#[test]
fn skill_switch_replies_carry_no_content_and_no_raw_home() {
    let dir = tempfile::tempdir().unwrap();
    let home = dir.path().join("home");
    let store = home.join(".agents/skills");
    let skill = store.join("marked");
    fs::create_dir_all(&skill).unwrap();
    fs::write(skill.join("SKILL.md"), format!("---\nname: marked\ndescription: {SKILL_MARKER}\n---\n{SKILL_MARKER}\n")).unwrap();
    // A link to it, and a folder for it that will be gone at On.
    let links = home.join(".cursor/skills");
    fs::create_dir_all(&links).unwrap();
    std::os::unix::fs::symlink(&skill, links.join("marked")).unwrap();
    let places = SkillPlaces {
        home: home.clone(),
        store: store.clone(),
        keep: home.join("Library/Application Support/com.rkarthik.hanger/kept/skills"),
        db_path: dir.path().join("hanger.db"),
    };
    let raw_homes = [home.to_str().unwrap().to_string(), fs::canonicalize(&home).unwrap().to_str().unwrap().to_string()];
    let mut seen = Vec::new();

    let info = skill_ops::switch_info_for(&places, &skill);
    seen.push(serde_json::to_string(&info).unwrap());
    let off = skill_ops::set_enabled_for(&places, &[], "skill:marked", false).unwrap();
    seen.push(serde_json::to_string(&off).unwrap());
    seen.push(serde_json::to_string(&skill_ops::kept_for(&places)).unwrap());
    fs::remove_dir(&links).unwrap();
    let on = skill_ops::undo_for(&places, &[], off.receipt_id.as_deref().unwrap()).unwrap();
    assert_eq!(on.links_not_restored.len(), 1, "the gone folder's link is named");
    seen.push(serde_json::to_string(&on).unwrap());
    let off_again = skill_ops::undo_for(&places, &[], on.receipt_id.as_deref().unwrap()).unwrap();
    seen.push(serde_json::to_string(&off_again).unwrap());
    fs::create_dir_all(&skill).unwrap();
    let refused = skill_ops::undo_for(&places, &[], off_again.receipt_id.as_deref().unwrap()).unwrap_err();
    seen.push(serde_json::to_string(&refused).unwrap());
    seen.push(refused.code().to_string());
    seen.push(skill_ops::set_enabled_for(&places, &[], "skill:../marked", false).unwrap_err().code().to_string());

    assert_eq!(seen.len(), 8);
    for text in &seen {
        assert!(!text.contains(SKILL_MARKER), "a skill's content reached the webview: {text}");
        for raw in &raw_homes {
            assert!(!text.contains(raw.as_str()), "the raw home reached the webview: {text}");
        }
    }
}
