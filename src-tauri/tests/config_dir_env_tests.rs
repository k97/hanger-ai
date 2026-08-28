//! Config-directory env var resolution.
//!
//! Deliberately its own test binary. These tests set process-global env vars
//! (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`), and cargo runs integration tests in
//! parallel threads WITHIN a binary but gives each binary its own process.
//! Owning the variables here cannot disturb another file's tests. The
//! ENV_MUTEX below still serialises this file's own tests against each other.
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::agents;

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

/// Clears all three variables on drop, including on panic, so one test cannot
/// leak a relocated base into the next.
///
/// HANGER_TEST_HOME added alongside CLAUDE_CONFIG_DIR/CODEX_HOME (task 2):
/// `a_relocated_claude_dir_is_detected_as_the_agent_root` sets it to point
/// `get_home_dir()` at a temp dir distinct from the relocated config dir, and
/// a leaked value would silently point later tests' home resolution at a
/// directory that no longer exists.
struct EnvGuard;
impl Drop for EnvGuard {
    fn drop(&mut self) {
        std::env::remove_var("CLAUDE_CONFIG_DIR");
        std::env::remove_var("CODEX_HOME");
        std::env::remove_var("HANGER_TEST_HOME");
    }
}

fn guard() -> (std::sync::MutexGuard<'static, ()>, EnvGuard) {
    let l = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("CODEX_HOME");
    std::env::remove_var("HANGER_TEST_HOME");
    (l, EnvGuard)
}

#[test]
fn unset_vars_resolve_against_home_exactly_as_before() {
    // The no-op guarantee. With nothing set, engine_base must be
    // indistinguishable from home.join(rel) — this is what keeps the plan
    // from moving a single count on a normal machine.
    let (_l, _g) = guard();
    let home = Path::new("/Users/probe");
    for rel in [".claude", ".claude/skills", ".claude.json", ".codex", ".codex/config.toml", ".gemini/settings.json"] {
        assert_eq!(
            agents::engine_base(home, rel),
            home.join(rel),
            "unset env must leave {rel} on the home path"
        );
    }
}

#[test]
fn claude_config_dir_relocates_the_claude_directory_and_claude_json() {
    // Finding 2, measured 2026-08-28: with CLAUDE_CONFIG_DIR set, Claude Code
    // read $DIR/.claude.json and stopped reading the real ~/.claude.json.
    let (_l, _g) = guard();
    std::env::set_var("CLAUDE_CONFIG_DIR", "/relocated/cc");
    let home = Path::new("/Users/probe");
    assert_eq!(agents::engine_base(home, ".claude"), PathBuf::from("/relocated/cc"));
    assert_eq!(agents::engine_base(home, ".claude/skills"), PathBuf::from("/relocated/cc/skills"));
    assert_eq!(agents::engine_base(home, ".claude/rules"), PathBuf::from("/relocated/cc/rules"));
    assert_eq!(agents::engine_base(home, ".claude/agents"), PathBuf::from("/relocated/cc/agents"));
    assert_eq!(agents::engine_base(home, ".claude.json"), PathBuf::from("/relocated/cc/.claude.json"));
}

#[test]
fn codex_home_relocates_the_codex_directory() {
    let (_l, _g) = guard();
    std::env::set_var("CODEX_HOME", "/relocated/codex");
    let home = Path::new("/Users/probe");
    assert_eq!(agents::engine_base(home, ".codex"), PathBuf::from("/relocated/codex"));
    assert_eq!(agents::engine_base(home, ".codex/config.toml"), PathBuf::from("/relocated/codex/config.toml"));
    assert_eq!(agents::engine_base(home, ".codex/skills"), PathBuf::from("/relocated/codex/skills"));
}

#[test]
fn one_var_does_not_relocate_another_engine() {
    // A prefix table is easy to write so that any set variable wins. Pin the
    // isolation: relocating Claude Code must leave Codex and Gemini alone.
    let (_l, _g) = guard();
    std::env::set_var("CLAUDE_CONFIG_DIR", "/relocated/cc");
    let home = Path::new("/Users/probe");
    assert_eq!(agents::engine_base(home, ".codex/config.toml"), home.join(".codex/config.toml"));
    assert_eq!(agents::engine_base(home, ".gemini/settings.json"), home.join(".gemini/settings.json"));
}

#[test]
fn a_prefix_matches_only_on_a_path_boundary() {
    // ".claude" must not swallow ".claudia" or ".claude-backup". A naive
    // starts_with does exactly that, and the bug is invisible until someone
    // has such a directory.
    let (_l, _g) = guard();
    std::env::set_var("CLAUDE_CONFIG_DIR", "/relocated/cc");
    let home = Path::new("/Users/probe");
    assert_eq!(agents::engine_base(home, ".claudia/skills"), home.join(".claudia/skills"));
    assert_eq!(agents::engine_base(home, ".claude-backup"), home.join(".claude-backup"));
}

#[test]
fn every_env_table_entry_names_a_real_agent_root() {
    // Keeps the table honest against AGENT_CONFIGS: a prefix nothing declares
    // is a typo that silently never fires.
    let roots: Vec<&str> = agents::AGENT_CONFIGS
        .iter()
        .flat_map(|c| c.global_roots.iter().copied())
        .collect();
    for (prefix, var) in agents::CONFIG_DIR_ENVS {
        assert!(
            roots.contains(prefix),
            "CONFIG_DIR_ENVS entry ({prefix}, {var}) names no AGENT_CONFIGS global_root"
        );
    }
}

#[test]
fn an_exported_but_empty_var_is_treated_as_unset() {
    // Review finding, Minor 4: `relocated()` filters empty values on the
    // reasoning that an exported-but-empty variable means "unset" far more
    // often than "resolve to /". Nothing pinned that choice — deleting the
    // filter left every other test in this suite green, because none of them
    // ever exports the variable empty.
    let (_l, _g) = guard();
    let home = Path::new("/Users/probe");
    std::env::set_var("CLAUDE_CONFIG_DIR", "");
    assert_eq!(agents::engine_base(home, ".claude"), home.join(".claude"));
    std::env::set_var("CODEX_HOME", "");
    assert_eq!(agents::engine_base(home, ".codex"), home.join(".codex"));
}

// ─── Task 2: agent-root detection ──────────────────────────────────────────

#[test]
fn a_relocated_claude_dir_is_detected_as_the_agent_root() {
    let (_l, _g) = guard();
    let home = tempfile::tempdir().unwrap();
    let relocated = tempfile::tempdir().unwrap();
    // The engine's assets live in the relocated directory, NOT under home.
    std::fs::create_dir_all(relocated.path().join("skills/probe-skill")).unwrap();
    std::fs::write(
        relocated.path().join("skills/probe-skill/SKILL.md"),
        "---\nname: probe-skill\ndescription: d\n---\nbody\n",
    )
    .unwrap();

    std::env::set_var("HANGER_TEST_HOME", home.path());
    std::env::set_var("CLAUDE_CONFIG_DIR", relocated.path());

    let agents = tauri_app_lib::scanner::get_global_agents();
    let cc = agents.iter().find(|a| a.id == "claude-code");

    std::env::remove_var("HANGER_TEST_HOME");

    let cc = cc.expect("claude-code must be detected at its relocated root");
    assert!(
        cc.global_config_path.as_deref().unwrap_or("").starts_with(
            relocated.path().to_str().unwrap()
        ),
        "expected the relocated path, got {:?}",
        cc.global_config_path
    );
}

// ─── Task 3: MCP HomeRelative source resolution ────────────────────────────

#[test]
fn a_relocated_claude_dir_moves_its_mcp_sources() {
    let (_l, _g) = guard();
    let home = tempfile::tempdir().unwrap();
    let relocated = tempfile::tempdir().unwrap();
    // .claude.json is a SIBLING file inside the relocated dir (finding 2).
    std::fs::write(
        relocated.path().join(".claude.json"),
        r#"{"mcpServers": {"relocated-probe": {"command": "/bin/true", "args": []}}}"#,
    )
    .unwrap();
    // A decoy at the old location must NOT be read once the var is set.
    std::fs::write(
        home.path().join(".claude.json"),
        r#"{"mcpServers": {"stale-probe": {"command": "/bin/true", "args": []}}}"#,
    )
    .unwrap();

    std::env::set_var("CLAUDE_CONFIG_DIR", relocated.path());
    let r = tauri_app_lib::mcp::discover::discover_machine_at(
        home.path(),
        Path::new("tests/fixtures/no_such_system_root"),
    );
    let names: Vec<&str> = r.registrations.iter().map(|x| x.server.name.as_str()).collect();

    assert!(names.contains(&"relocated-probe"), "relocated .claude.json not read: {names:?}");
    assert!(
        !names.contains(&"stale-probe"),
        "the old ~/.claude.json must stop being read once CLAUDE_CONFIG_DIR is set — \
         measured 2026-08-28, Claude Code substitutes rather than adding a search root"
    );
}

// ─── Task 4: the no-op guarantee, end to end ───────────────────────────────

#[test]
fn with_no_vars_set_discovery_is_byte_identical_to_the_fixture_baseline() {
    // The no-op guarantee, end to end rather than at engine_base alone.
    // The fixture home is the same one mcp_discovery_tests asserts 16
    // registrations against; if this plan changed resolution for an
    // unrelocated machine, this count moves.
    let (_l, _g) = guard();
    let r = tauri_app_lib::mcp::discover::discover_machine_at(
        Path::new("tests/fixtures/mcp_home"),
        Path::new("tests/fixtures/no_such_system_root"),
    );
    assert_eq!(
        r.registrations.len(),
        16,
        "with no env var set, discovery must be unchanged — got {:?}",
        r.registrations.iter().map(|x| &x.server.name).collect::<Vec<_>>()
    );
}
