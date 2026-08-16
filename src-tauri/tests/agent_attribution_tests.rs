use std::path::Path;
use tauri_app_lib::agents::{engine_for_path, AGENT_CONFIGS};

#[test]
fn every_declared_root_resolves_to_its_own_agent() {
    let home = Path::new("/Users/test");
    for config in AGENT_CONFIGS {
        for root in config.global_roots {
            let p = home.join(root).join("skills/demo/SKILL.md");
            let found = engine_for_path(&p)
                .unwrap_or_else(|| panic!("no agent claimed its own global root {:?}", p));
            assert_eq!(
                found.id, config.id,
                "global root {:?} resolved to {} instead of {}",
                p, found.id, config.id
            );
        }
        for root in config.project_roots {
            let p = Path::new("/repo/proj").join(root).join("rules/demo.md");
            let found = engine_for_path(&p)
                .unwrap_or_else(|| panic!("no agent claimed its own project root {:?}", p));
            assert_eq!(
                found.id, config.id,
                "project root {:?} resolved to {} instead of {}",
                p, found.id, config.id
            );
        }
    }
}

#[test]
fn shared_agents_dir_has_no_owner() {
    // The defect this whole refactor exists to fix: `.agents/` is the
    // vendor-neutral convention, read by Zed, Amp, Roo Code and Claude Code.
    // Ownership is exclusive; readability is not. It belongs to the store.
    for p in [
        "/Users/test/.agents/skills/demo/SKILL.md",
        "/Users/test/.agents/reviewer.md",
        "/repo/proj/.agents/skills/demo/SKILL.md",
    ] {
        assert!(
            engine_for_path(Path::new(p)).is_none(),
            "{} must have no owner — it is store-owned",
            p
        );
    }
}

#[test]
fn matching_is_on_whole_components_not_substrings() {
    // `contains("/.claude/")` matched none of these correctly.
    for p in [
        "/Users/test/.claude-backup/skills/demo/SKILL.md",
        "/Users/test/notes/.claudex/demo.md",
        "/srv/kiroshi/skills/demo/SKILL.md",
        "/Users/test/my.codex.notes/demo.md",
    ] {
        assert!(
            engine_for_path(Path::new(p)).is_none(),
            "{} is not an agent root — substring matching would claim it",
            p
        );
    }
}

#[test]
fn longest_root_wins_when_one_root_nests_inside_another() {
    // A vendor root inside a project root must beat the shorter match.
    let p = Path::new("/repo/proj/.claude/skills/demo/SKILL.md");
    let found = engine_for_path(p).expect("nested vendor root must resolve");
    assert_eq!(found.id, "claude-code");
}

#[test]
fn agent_ids_are_unique() {
    let mut ids: Vec<&str> = AGENT_CONFIGS.iter().map(|c| c.id).collect();
    ids.sort_unstable();
    let before = ids.len();
    ids.dedup();
    assert_eq!(before, ids.len(), "duplicate agent id in AGENT_CONFIGS");
}

/// The chains this refactor exists to delete. A forgotten branch in one of
/// them fails silently: on the read side an asset files under the wrong
/// engine, on the write side lib.rs:504 wrote into the project root. Pin
/// their absence so they cannot grow back.
#[test]
fn scanner_has_no_hardcoded_attribution_chains() {
    let src = include_str!("../src/scanner.rs");
    for needle in [
        "contains(\"/.claude/\")",
        "contains(\"/.codex/\")",
        "contains(\"/.gemini/\")",
        "contains(\"/.claude/agents/\")",
        "contains(\"/.codex/agents/\")",
    ] {
        assert!(
            !src.contains(needle),
            "scanner.rs still hardcodes {needle} — use agents::engine_for_path"
        );
    }
}
