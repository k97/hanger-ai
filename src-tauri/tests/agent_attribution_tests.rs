use std::path::Path;
use tauri_app_lib::agents::{engine_for_path, subagent_owner_for_path, AGENT_CONFIGS};
use tauri_app_lib::resolve_target_path_for_test as resolve_target_path;

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

/// `engine_for_path` alone is too loose for subagent ownership: it only
/// requires the root to appear *somewhere* in the path, so
/// `.claude/plugins/foo/agents/bar.md` would resolve as a Claude Code
/// subagent even though the `agents` directory is nested three levels under
/// a plugin, not a direct child of `.claude`. The old
/// `contains("/.claude/agents/")` chain required contiguity by construction;
/// `subagent_owner_for_path` restores it deliberately, and this pins both
/// directions so neither regresses silently.
#[test]
fn subagent_ownership_requires_the_agents_dir_directly_under_the_root() {
    let direct = Path::new("/Users/test/.claude/agents/reviewer.md");
    let found = subagent_owner_for_path(direct).expect("agents/ directly under .claude/ must resolve");
    assert_eq!(found.id, "claude-code");

    let nested = Path::new("/Users/test/.claude/plugins/foo/agents/reviewer.md");
    assert!(
        subagent_owner_for_path(nested).is_none(),
        "an agents/ directory nested under a plugin must not resolve to an owner — Claude Code ships plugin agents/ dirs that are not the user's own subagents"
    );

    let project_direct = Path::new("/repo/proj/.codex/agents/reviewer.md");
    let found = subagent_owner_for_path(project_direct).expect("agents/ directly under .codex/ must resolve");
    assert_eq!(found.id, "codex");

    let project_nested = Path::new("/repo/proj/.codex/plugins/foo/agents/reviewer.md");
    assert!(
        subagent_owner_for_path(project_nested).is_none(),
        "same nesting problem, project-scoped"
    );
}

#[test]
fn deploy_refuses_a_source_no_agent_claims() {
    // The old `else` branch wrote the file into the project root, which is
    // both wrong and silent. Refusing is the whole point.
    let err = resolve_target_path("/Users/test/Downloads/random.md", "/repo/proj", &[])
        .expect_err("an unclaimed source must not resolve to a target");
    let msg = format!("{err:?}");
    assert!(
        msg.contains("no agent"),
        "the error must say why it refused, got: {msg}"
    );
}

#[test]
fn deploy_resolves_a_claimed_source_into_that_agents_directory() {
    let target = resolve_target_path("/Users/test/.claude/skills/demo/SKILL.md", "/repo/proj", &[])
        .expect("a claimed source must resolve");
    assert_eq!(target, Path::new("/repo/proj/.claude/SKILL.md"));
}

#[test]
fn deploy_prefers_an_explicit_linked_dir_over_the_table() {
    let linked = vec!["/Users/test/store".to_string()];
    let target = resolve_target_path("/Users/test/store/skills/demo/SKILL.md", "/repo/proj", &linked)
        .expect("a linked dir must resolve");
    assert_eq!(target, Path::new("/repo/proj/skills/demo/SKILL.md"));
}

#[test]
fn deploy_refuses_a_shared_convention_source() {
    // `.agents/` has no owner, so there is no agent directory to deploy into.
    let err = resolve_target_path("/Users/test/.agents/skills/demo/SKILL.md", "/repo/proj", &[])
        .expect_err("a store-owned source has no single agent target");
    assert!(format!("{err:?}").contains("no agent"));
}

#[test]
fn deploy_refuses_without_writing_anything_to_disk() {
    // A test that only checked the return value would still pass if the
    // function wrote the file before returning an error. Assert the
    // filesystem, not just the Result.
    let tmp = std::env::temp_dir().join(format!(
        "hanger-deploy-refuse-test-{}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&tmp);
    std::fs::create_dir_all(&tmp).expect("failed to create temp project dir");

    let target_project_path = tmp.to_string_lossy().to_string();
    let err = resolve_target_path(
        "/Users/test/Downloads/random.md",
        &target_project_path,
        &[],
    )
    .expect_err("an unclaimed source must not resolve to a target");
    assert!(format!("{err:?}").contains("no agent"));

    let entries: Vec<_> = std::fs::read_dir(&tmp)
        .expect("temp project dir must still exist")
        .collect();
    assert!(
        entries.is_empty(),
        "deploy refusal must not write anything to disk, found: {entries:?}"
    );

    std::fs::remove_dir_all(&tmp).expect("failed to clean up temp project dir");
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

/// The invariant Task 3 exists to guarantee: `execute_deploy` must resolve —
/// and be free to refuse — the target before it touches the filesystem.
/// `deploy_refuses_without_writing_anything_to_disk` above pins
/// `resolve_target_path`'s own contract as a pure function, but that function
/// never wrote anything in either the old or new implementation; the real
/// risk is a refactor of `execute_deploy` that hoists a write (most plausibly
/// `fs::create_dir_all`) above the `resolve_target_path(...)?` call, which
/// would reintroduce the exact stray write this task removed while leaving
/// every other test green. There is no `AppHandle` test harness to call
/// `execute_deploy` directly, so — in the same idiom as
/// `scanner_has_no_hardcoded_attribution_chains` above, and the
/// no-frontend-counting / no-blocking-dialogs guards in `src/__tests__/` —
/// this is a source scan: it isolates `execute_deploy`'s own body by brace
/// depth (so a write call in a *different* function can never satisfy it)
/// and asserts the `resolve_target_path` call's byte offset precedes every
/// known filesystem-write call's byte offset within it.
#[test]
fn execute_deploy_resolves_the_target_before_writing_anything() {
    let src = include_str!("../src/lib.rs");
    let fn_start = src
        .find("fn execute_deploy(")
        .expect("execute_deploy must exist in lib.rs");

    let body_start = src[fn_start..]
        .find('{')
        .map(|i| fn_start + i)
        .expect("execute_deploy must have a body");

    // Brace-balance from the opening `{` to find this function's own closing
    // `}`, so the scan cannot spill into a later function (e.g.
    // execute_deploy_merged_rule) and match a write call that isn't this
    // function's.
    let mut depth: i32 = 0;
    let mut body_end = None;
    for (offset, ch) in src[body_start..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    body_end = Some(body_start + offset + 1);
                    break;
                }
            }
            _ => {}
        }
    }
    let body = &src[body_start..body_end.expect("execute_deploy's braces must balance")];

    let resolve_at = body
        .find("resolve_target_path(")
        .expect("execute_deploy must call resolve_target_path");

    // Every way this function is allowed to reach the filesystem with a
    // write. Deliberately explicit rather than a generic `fs::` scan — reads
    // like `src.exists()` are fine ahead of the refusal check; only writes
    // matter for this invariant.
    let write_calls = [
        "fs::create_dir_all(",
        "fs::write(",
        "fs::copy(",
        "fs::rename(",
        "fs::remove_file(",
        "fs::remove_dir_all(",
        "write_transactional(",
        "write_transactional_dir(",
        "::symlink(",
        "symlink_dir(",
        "symlink_file(",
    ];
    let first_write = write_calls
        .iter()
        .filter_map(|needle| body.find(needle))
        .min()
        .expect(
            "execute_deploy must write the asset somewhere — \
             this guard has nothing to order resolve_target_path against",
        );

    assert!(
        resolve_at < first_write,
        "resolve_target_path (byte {resolve_at} of the function body) must run before the \
         first filesystem write (byte {first_write}) in execute_deploy — a write hoisted above \
         the refusal check would silently reintroduce the stray write Task 3 removed"
    );
}
