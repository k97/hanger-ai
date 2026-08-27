use tauri_app_lib::provenance::{normalize_source_url, origin_from_declared, OriginKind};

#[test]
fn test_normalize_ssh_scp_form() {
    let (label, url) = normalize_source_url("git@github.com:owner/repo.git").unwrap();
    assert_eq!(label, "owner/repo");
    assert_eq!(url, "https://github.com/owner/repo");
}

#[test]
fn test_normalize_https_tree_url_keeps_full_path_link_short_label() {
    let (label, url) =
        normalize_source_url("https://github.com/owner/repo/tree/main/skills/x").unwrap();
    assert_eq!(label, "owner/repo");
    assert_eq!(url, "https://github.com/owner/repo/tree/main/skills/x");
}

#[test]
fn test_normalize_non_forge_host_labels_host() {
    let (label, url) = normalize_source_url("https://example.dev/docs/").unwrap();
    assert_eq!(label, "example.dev");
    assert_eq!(url, "https://example.dev/docs");
}

#[test]
fn test_normalize_rejects_non_url() {
    assert!(normalize_source_url("community").is_none());
    assert!(normalize_source_url("file:///etc/passwd").is_none());
}

#[test]
fn test_declared_non_url_is_label_only() {
    let o = origin_from_declared("community");
    assert_eq!(o.label, "community");
    assert_eq!(o.url, None);
    assert_eq!(o.kind, OriginKind::Declared);
}

#[test]
fn test_declared_url_is_linked() {
    let o = origin_from_declared("https://github.com/owner/repo");
    assert_eq!(o.label, "owner/repo");
    assert_eq!(o.url.as_deref(), Some("https://github.com/owner/repo"));
}

use std::fs;
use tauri_app_lib::provenance::PluginIndex;

fn plugin_home() -> tempfile::TempDir {
    let td = tempfile::tempdir().unwrap();
    let pl = td.path().join(".claude/plugins");
    fs::create_dir_all(&pl).unwrap();
    fs::write(
        pl.join("known_marketplaces.json"),
        r#"{"mkt-a":{"source":{"source":"github","repo":"owner/market-repo"},
             "installLocation":"/ignored"}}"#,
    )
    .unwrap();
    fs::write(
        pl.join("installed_plugins.json"),
        r#"{"version":2,"plugins":{"tool-x@mkt-a":[{"scope":"user",
             "installPath":"/ignored","version":"1.0.0",
             "installedAt":"2026-07-20T02:30:08.089Z",
             "gitCommitSha":"b0b9f02b0581696da41e20d6c536ec639b44080f"}]}}"#,
    )
    .unwrap();
    td
}

#[test]
fn test_plugin_cache_path_resolves_repo_and_commit() {
    let td = plugin_home();
    let (idx, blocked) = PluginIndex::load(td.path());
    assert!(!blocked);
    let idx = idx.unwrap();
    let p = td
        .path()
        .join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s/SKILL.md");
    let o = idx.origin_for(&p.to_string_lossy()).unwrap();
    assert_eq!(o.label, "owner/market-repo");
    assert_eq!(o.url.as_deref(), Some("https://github.com/owner/market-repo"));
    assert_eq!(o.commit.as_deref(), Some("b0b9f02b0581696da41e20d6c536ec639b44080f"));
    assert_eq!(o.delivered_by.as_deref(), Some("tool-x"));
    assert_eq!(o.installed_at_ms, Some(1_784_514_608_089));
}

/// A scoped plugin key ("@scoped-tool@mkt-a") has TWO '@'s; the plugin name
/// is everything before the LAST one, not the first. Splitting at the first
/// '@' yields an empty plugin name and the lookup misses commit/installed-at
/// entirely.
#[test]
fn test_scoped_plugin_key_resolves_commit_and_installed_at() {
    let td = tempfile::tempdir().unwrap();
    let pl = td.path().join(".claude/plugins");
    fs::create_dir_all(&pl).unwrap();
    fs::write(
        pl.join("known_marketplaces.json"),
        r#"{"mkt-a":{"source":{"source":"github","repo":"owner/market-repo"},
             "installLocation":"/ignored"}}"#,
    )
    .unwrap();
    fs::write(
        pl.join("installed_plugins.json"),
        r#"{"version":2,"plugins":{"@scoped-tool@mkt-a":[{"scope":"user",
             "installPath":"/ignored","version":"1.0.0",
             "installedAt":"2026-07-20T02:30:08.089Z",
             "gitCommitSha":"b0b9f02b0581696da41e20d6c536ec639b44080f"}]}}"#,
    )
    .unwrap();
    let (idx, _) = PluginIndex::load(td.path());
    let p = td
        .path()
        .join(".claude/plugins/cache/mkt-a/@scoped-tool/1.0.0/skills/s/SKILL.md");
    let o = idx.unwrap().origin_for(&p.to_string_lossy()).unwrap();
    assert_eq!(o.delivered_by.as_deref(), Some("@scoped-tool"));
    assert_eq!(o.commit.as_deref(), Some("b0b9f02b0581696da41e20d6c536ec639b44080f"));
    assert_eq!(o.installed_at_ms, Some(1_784_514_608_089));
}

#[test]
fn test_marketplace_clone_path_resolves_repo_without_commit() {
    let td = plugin_home();
    let (idx, _) = PluginIndex::load(td.path());
    let p = td.path().join(".claude/plugins/marketplaces/mkt-a/skills/y/SKILL.md");
    let o = idx.unwrap().origin_for(&p.to_string_lossy()).unwrap();
    assert_eq!(o.label, "owner/market-repo");
    assert_eq!(o.commit, None);
}

#[test]
fn test_missing_manifests_is_absence_not_error() {
    let td = tempfile::tempdir().unwrap();
    let (idx, blocked) = PluginIndex::load(td.path());
    assert!(idx.is_none());
    assert!(!blocked);
}

#[test]
fn test_malformed_manifest_is_absence_not_error() {
    let td = tempfile::tempdir().unwrap();
    let pl = td.path().join(".claude/plugins");
    fs::create_dir_all(&pl).unwrap();
    fs::write(pl.join("known_marketplaces.json"), "{not json").unwrap();
    let (idx, blocked) = PluginIndex::load(td.path());
    assert!(idx.is_none());
    assert!(!blocked);
}

/// Pins the exact epoch-ms value for the fixture's `installedAt`, verified
/// independently against `date -j -u -f "%Y-%m-%dT%H:%M:%S"
/// "2026-07-20T02:30:08" +%s` => 1784514608, so ms = 1784514608_000 + 89.
#[test]
fn test_plugin_installed_at_exact_epoch_ms() {
    let td = plugin_home();
    let (idx, _) = PluginIndex::load(td.path());
    let p = td
        .path()
        .join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s/SKILL.md");
    let o = idx.unwrap().origin_for(&p.to_string_lossy()).unwrap();
    assert_eq!(o.installed_at_ms, Some(1_784_514_608_089));
}

use std::collections::HashMap;
use std::path::PathBuf;
use tauri_app_lib::provenance::git_remote_origin;

#[test]
fn test_git_config_origin_url_resolves() {
    let td = tempfile::tempdir().unwrap();
    let repo = td.path().join("dotfiles");
    fs::create_dir_all(repo.join(".git")).unwrap();
    fs::write(
        repo.join(".git/config"),
        "[core]\n\trepositoryformatversion = 0\n[remote \"origin\"]\n\turl = git@github.com:owner/dotfiles.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n",
    )
    .unwrap();
    let asset = repo.join("claude/rules/style.md");
    let mut cache = HashMap::new();
    let (o, blocked) = git_remote_origin(&asset, td.path(), &mut cache);
    assert!(!blocked);
    let o = o.unwrap();
    assert_eq!(o.label, "owner/dotfiles");
    assert_eq!(o.url.as_deref(), Some("https://github.com/owner/dotfiles"));
}

#[test]
fn test_no_repo_above_is_none() {
    let td = tempfile::tempdir().unwrap();
    let asset = td.path().join("plain/dir/file.md");
    let mut cache = HashMap::new();
    let (o, blocked) = git_remote_origin(&asset, td.path(), &mut cache);
    assert!(o.is_none());
    assert!(!blocked);
}

#[test]
fn test_walk_stops_at_home() {
    // A repo ABOVE home must not be found: home is the fence.
    let td = tempfile::tempdir().unwrap();
    fs::create_dir_all(td.path().join(".git")).unwrap();
    fs::write(
        td.path().join(".git/config"),
        "[remote \"origin\"]\n\turl = https://github.com/owner/above-home\n",
    )
    .unwrap();
    let home = td.path().join("home");
    let asset = home.join("thing/file.md");
    fs::create_dir_all(asset.parent().unwrap()).unwrap();
    let mut cache = HashMap::new();
    let (o, _) = git_remote_origin(&asset, &home, &mut cache);
    assert!(o.is_none());
}

/// `cache.len()` cannot move either way here: both assets share directory
/// `x`, so the set of directories *visited* is identical whether or not
/// memoization exists — `HashMap::insert` on an existing key never changes
/// `.len()`. Deleting the early-return entirely would leave this green.
/// Prove memoization by its observable consequence instead: change the
/// on-disk remote between the two calls and assert the SECOND call still
/// returns the FIRST value. That only holds if the second call trusts the
/// cache rather than re-reading `.git/config`.
#[test]
fn test_memoization_reuses_directory_verdict() {
    let td = tempfile::tempdir().unwrap();
    let dir = td.path().join("x");
    fs::create_dir_all(dir.join(".git")).unwrap();
    fs::write(
        dir.join(".git/config"),
        "[remote \"origin\"]\n\turl = https://github.com/owner/first\n",
    )
    .unwrap();
    let asset_a = dir.join("a.md");
    let asset_b = dir.join("b.md");
    let mut cache = HashMap::new();

    let (o_a, _) = git_remote_origin(&asset_a, td.path(), &mut cache);
    assert_eq!(o_a.unwrap().label, "owner/first");

    fs::write(
        dir.join(".git/config"),
        "[remote \"origin\"]\n\turl = https://github.com/owner/second\n",
    )
    .unwrap();

    let (o_b, _) = git_remote_origin(&asset_b, td.path(), &mut cache);
    assert_eq!(
        o_b.unwrap().label,
        "owner/first",
        "second file in same dir must reuse the cached verdict, not re-read the changed file"
    );
}

/// A cache hit must not silently drop a `blocked` disclosure. Directory `x`
/// has a `.git/config` chmod'd unreadable; the FIRST asset that walks
/// through `x` correctly reports `blocked`. Before this fix, the loop broke
/// on the cache hit for the SECOND asset before any read was attempted, so
/// `blocked` stayed at its initial `false` — a different answer for
/// identical filesystem state, silently dropping the access-denied
/// disclosure for every asset after the first.
#[test]
fn test_memoization_carries_blocked_across_cache_hits() {
    use std::os::unix::fs::PermissionsExt;

    let td = tempfile::tempdir().unwrap();
    let dir = td.path().join("x");
    fs::create_dir_all(dir.join(".git")).unwrap();
    let cfg = dir.join(".git/config");
    fs::write(&cfg, "[remote \"origin\"]\n\turl = https://github.com/owner/repo\n").unwrap();
    fs::set_permissions(&cfg, fs::Permissions::from_mode(0o000)).unwrap();

    let asset_a = dir.join("a.md");
    let asset_b = dir.join("b.md");
    let mut cache = HashMap::new();

    let (_, blocked_a) = git_remote_origin(&asset_a, td.path(), &mut cache);
    assert!(blocked_a, "first read of an unreadable .git/config must report blocked");

    let (_, blocked_b) = git_remote_origin(&asset_b, td.path(), &mut cache);
    assert!(
        blocked_b,
        "a cache hit for the same directory must still report blocked, not silently drop it"
    );

    // Restore so the tempdir's own Drop cleanup can remove the file.
    let _ = fs::set_permissions(&cfg, fs::Permissions::from_mode(0o644));
}

/// `.git/config` has no realistic size — the task's own constraints flag it
/// as possibly enormous. `std::fs::read_to_string` with no size check is an
/// unbounded-memory read during a home-directory walk. The codebase already
/// has this exact pattern: `scanner.rs`'s hash budget skips a file over a
/// 10MB cap rather than reading it (`src-tauri/src/scanner.rs:698-702`). A
/// config far larger than any real one is an absent origin, not something
/// to read fully into memory first.
#[test]
fn test_oversized_git_config_is_absent_not_read() {
    let td = tempfile::tempdir().unwrap();
    let repo = td.path().join("dotfiles");
    fs::create_dir_all(repo.join(".git")).unwrap();
    // A genuinely parseable remote, padded past the 10MB cap with a comment
    // line. If the cap is honoured, this is never parsed — proven by the
    // origin coming back None despite the valid url being present in the
    // file.
    let padding = "x".repeat(10_000_001);
    let cfg_text = format!(
        "[remote \"origin\"]\n\turl = https://github.com/owner/dotfiles\n# {}\n",
        padding
    );
    fs::write(repo.join(".git/config"), cfg_text).unwrap();
    let asset = repo.join("skills/a/SKILL.md");
    fs::create_dir_all(asset.parent().unwrap()).unwrap();
    let mut cache = HashMap::new();
    let (o, blocked) = git_remote_origin(&asset, td.path(), &mut cache);
    assert!(o.is_none(), "a config over the size cap must be treated as absent, not parsed");
    assert!(!blocked, "an oversized file is an absent origin, not an access-denied block");
}

/// `home` is a fence, not a hint: a symlink that sits INSIDE home but
/// resolves to a directory OUTSIDE it must not let the walk read that
/// outside directory's `.git/config`. A purely lexical `starts_with(home)`
/// check does not see this — the symlink's own path lexically starts with
/// `home`, so the naive walk follows it and reads the outside repo's
/// remote through the OS's own symlink resolution inside `read_to_string`.
#[test]
fn test_walk_does_not_follow_symlinked_ancestor_outside_home() {
    let td = tempfile::tempdir().unwrap();
    let home = td.path().join("home");
    fs::create_dir_all(&home).unwrap();
    let outside = td.path().join("outside");
    fs::create_dir_all(outside.join(".git")).unwrap();
    fs::write(
        outside.join(".git/config"),
        "[remote \"origin\"]\n\turl = https://github.com/owner/outside-home\n",
    )
    .unwrap();
    let link = home.join("link");
    std::os::unix::fs::symlink(&outside, &link).unwrap();
    let asset = link.join("thing/file.md");
    let mut cache = HashMap::new();
    let (o, _) = git_remote_origin(&asset, &home, &mut cache);
    assert!(
        o.is_none(),
        "must not resolve a remote through a symlinked ancestor that escapes home"
    );
}

/// The fence also has to hold for the leaf file, not just the directories
/// walked to reach it: a directory genuinely inside `home` can still house
/// a `.git/config` that is ITSELF a symlink to a file outside `home`, and
/// `read_to_string` follows that transparently. The ancestor-canonicalize
/// check alone does not see this — `d` (the containing directory) resolves
/// fine inside home; only the leaf file resolves outside it.
#[test]
fn test_git_config_itself_a_symlink_outside_home_is_not_followed() {
    let td = tempfile::tempdir().unwrap();
    let home = td.path().join("home");
    let repo = home.join("repo");
    fs::create_dir_all(repo.join(".git")).unwrap();
    let outside_cfg = td.path().join("evil-config");
    fs::write(
        &outside_cfg,
        "[remote \"origin\"]\n\turl = https://github.com/owner/evil\n",
    )
    .unwrap();
    std::os::unix::fs::symlink(&outside_cfg, repo.join(".git/config")).unwrap();
    let asset = repo.join("skills/a/SKILL.md");
    fs::create_dir_all(asset.parent().unwrap()).unwrap();
    let mut cache = HashMap::new();
    let (o, _) = git_remote_origin(&asset, &home, &mut cache);
    assert!(
        o.is_none(),
        "must not resolve a remote through a symlinked .git/config that escapes home"
    );
}

// --- Task 4: launched_origin ---

use tauri_app_lib::provenance::launched_origin;

#[test]
fn test_npx_package_in_args() {
    let o = launched_origin("npx", &["chrome-devtools-mcp@latest".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: chrome-devtools-mcp");
    assert_eq!(o.url.as_deref(), Some("https://www.npmjs.com/package/chrome-devtools-mcp"));
}

#[test]
fn test_scoped_package_embedded_in_command() {
    // Codex writes the whole launch into `command` with empty args.
    let o = launched_origin("npx @hypothesi/tauri-mcp-server", &[], "stdio").unwrap();
    assert_eq!(o.label, "npm: @hypothesi/tauri-mcp-server");
    assert_eq!(
        o.url.as_deref(),
        Some("https://www.npmjs.com/package/@hypothesi/tauri-mcp-server")
    );
}

#[test]
fn test_flags_are_skipped() {
    let o = launched_origin(
        "npx",
        &["-y".into(), "some-server".into(), "--port".into(), "3000".into()],
        "stdio",
    )
    .unwrap();
    assert_eq!(o.label, "npm: some-server");
}

#[test]
fn test_uvx_maps_to_pypi() {
    let o = launched_origin("uvx", &["mcp-server-fetch".into()], "stdio").unwrap();
    assert_eq!(o.label, "PyPI: mcp-server-fetch");
    assert_eq!(o.url.as_deref(), Some("https://pypi.org/project/mcp-server-fetch/"));
}

#[test]
fn test_remote_transport_keeps_host_only() {
    let o = launched_origin("", &[], "https://mcp.example.com/v1/sse?key=SECRET").unwrap();
    assert_eq!(o.label, "mcp.example.com");
    assert_eq!(o.url.as_deref(), Some("https://mcp.example.com"));
}

#[test]
fn test_plain_binary_yields_nothing() {
    assert!(launched_origin("node", &["/some/local/index.js".into()], "stdio").is_none());
}

#[test]
fn test_secret_bearing_args_never_reach_the_origin() {
    let o = launched_origin(
        "npx",
        &[
            "some-server".into(),
            "--header".into(),
            "Authorization: Bearer sk-SECRET-TOKEN".into(),
        ],
        "stdio",
    )
    .unwrap();
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("SECRET"), "origin must never carry arg values: {json}");
}

/// The pinned control above places the package name FIRST, so the fence is
/// never actually tested against a secret occupying the "first non-flag
/// token" slot the package-picking scan reads from. Put the secret there
/// instead. Unlike the original version of this test, the outcome is no
/// longer left open with an `if let` hedge: an unrecognized flag without
/// `=` (`--header` here) is assumed to consume the next token as its
/// value, so the scan lands on `some-server`, not on the flag's value —
/// this must hold, not merely "if it happens to hold".
#[test]
fn test_secret_bearing_flag_value_before_package_never_leaks() {
    let o = launched_origin(
        "npx",
        &[
            "--header".into(),
            "Authorization: Bearer sk-SECRET-TOKEN".into(),
            "some-server".into(),
        ],
        "stdio",
    )
    .unwrap();
    assert_eq!(o.label, "npm: some-server");
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("SECRET"), "origin must never carry arg values: {json}");
}

// --- Fix: value-taking flags must never donate their value as the package ---
//
// `is_valid_package_name` admits any lowercase `[a-z0-9-._~]+` token, which
// is exactly the shape of many API keys, ports and other flag values. The
// original scan ("first token that doesn't start with '-'") had no notion
// that a preceding flag might have consumed the very next token as its
// value, so `npx --api-key <secret> some-server` minted an Origin whose
// label and url WERE the secret. These tests pin the fix: an unrecognized
// flag without `=` is assumed to consume the next token, so scanning skips
// past it rather than risk treating that token as the package.

#[test]
fn test_flag_value_never_becomes_package_name() {
    let o = launched_origin(
        "npx",
        &["--api-key".into(), "sk-live-abc123".into(), "some-server".into()],
        "stdio",
    );
    if let Some(o) = &o {
        assert_eq!(o.label, "npm: some-server");
        let json = serde_json::to_string(o).unwrap();
        assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
    }
}

#[test]
fn test_port_flag_value_never_becomes_package_name() {
    let o = launched_origin(
        "npx",
        &["--port".into(), "3000".into(), "some-server".into()],
        "stdio",
    );
    if let Some(o) = &o {
        assert_ne!(o.label, "npm: 3000", "a port number is not a package name");
    }
}

#[test]
fn test_valueless_flag_still_resolves_package() {
    // -y takes no value; the scan must not skip past the package after it.
    let o = launched_origin("npx", &["-y".into(), "some-server".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: some-server");
}

#[test]
fn test_versioned_package_after_runner_still_resolves() {
    let o = launched_origin("npx", &["some-pkg@latest".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: some-pkg");
}

#[test]
fn test_equals_joined_flag_value_is_unambiguous() {
    // `--flag=value` is self-contained: it cannot consume a following
    // token, so the scan should not skip past the package looking for one.
    let o = launched_origin("npx", &["--api-key=sk-LEAK".into(), "pkg".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: pkg");
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("LEAK"), "equals-joined flag value leaked: {json}");
}

#[test]
fn test_codex_single_string_form_matches_split_form_and_never_leaks() {
    let split = launched_origin(
        "npx",
        &["--api-key".into(), "sk-live-abc123".into(), "mcp-server".into()],
        "stdio",
    );
    let combined = launched_origin("npx --api-key sk-live-abc123 mcp-server", &[], "stdio");
    assert_eq!(
        split.as_ref().map(|o| o.label.clone()),
        combined.as_ref().map(|o| o.label.clone()),
        "the split-args and single-string launch shapes must resolve identically"
    );
    if let Some(o) = &combined {
        let json = serde_json::to_string(o).unwrap();
        assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
    }
}
