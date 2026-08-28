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

/// Clears both variables on drop, including on panic, so one test cannot
/// leak a relocated base into the next.
struct EnvGuard;
impl Drop for EnvGuard {
    fn drop(&mut self) {
        std::env::remove_var("CLAUDE_CONFIG_DIR");
        std::env::remove_var("CODEX_HOME");
    }
}

fn guard() -> (std::sync::MutexGuard<'static, ()>, EnvGuard) {
    let l = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap_or_else(|e| e.into_inner());
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("CODEX_HOME");
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
