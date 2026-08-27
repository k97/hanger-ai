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
/// instead. Under the recognition-only rule (round 2), `--header` is not a
/// flag any runner's recognized set names, so the scan declines outright —
/// `None`, not a guess at `some-server`. That is the point: an unattributed
/// server is honest.
///
/// Round 3 note: this used to be ONE test asserting `o.is_none()` and THEN
/// checking the JSON for the secret. That second assertion could never
/// discriminate — once `is_none()` holds, the serialized value is always
/// the literal `null`, so no input could ever make it fail; and if a
/// mutation ever made `is_none()` false, the test would already have
/// panicked on that first assertion and never reached the second. Split
/// per the ruling: the outcome and the no-leak property are now two
/// separate tests, and the leak test below does NOT pre-assert `None`, so
/// it is live — it fails for real if a mutation reintroduces the leak
/// while still returning `Some`.
#[test]
fn test_secret_bearing_flag_value_before_package_declines() {
    let o = launched_origin(
        "npx",
        &[
            "--header".into(),
            "Authorization: Bearer sk-SECRET-TOKEN".into(),
            "some-server".into(),
        ],
        "stdio",
    );
    assert!(o.is_none(), "an unrecognized flag must decline, not guess: {o:?}");
}

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
    );
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("SECRET"), "origin must never carry arg values: {json}");
}

// --- Fix: value-taking flags must never donate their value as the package ---
//
// `is_valid_package_name` admits any lowercase `[a-z0-9-._~]+` token, which
// is exactly the shape of many API keys, ports and other flag values. Round
// 1 fixed the case where the package sat right after the flag by assuming
// any unrecognized flag without `=` consumes the next token — but that is
// still a guess, and guessing a flag's arity is unsound in both directions
// (see the doc comment on `launched_origin`). Round 2 replaces the guess
// with recognition: an unrecognized flag makes the whole call decline.
// These tests assert that positively — no more `if let Some(o)` hedges,
// per the ruling that a hedge which happens to hold today asserts nothing
// against a future mutation that makes the input resolve to `None` for the
// wrong reason. And per round 3: the outcome (`None`) and the no-leak
// property are asserted in separate tests, not stacked in one, so the
// no-leak check stays a live control rather than unreachable decoration.

#[test]
fn test_flag_value_never_becomes_package_name() {
    let o = launched_origin(
        "npx",
        &["--api-key".into(), "sk-live-abc123".into(), "some-server".into()],
        "stdio",
    );
    assert!(o.is_none(), "--api-key is not a recognized npx flag; must decline: {o:?}");
}

#[test]
fn test_flag_value_never_leaks_into_origin() {
    let o = launched_origin(
        "npx",
        &["--api-key".into(), "sk-live-abc123".into(), "some-server".into()],
        "stdio",
    );
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
}

#[test]
fn test_port_flag_value_never_becomes_package_name() {
    let o = launched_origin(
        "npx",
        &["--port".into(), "3000".into(), "some-server".into()],
        "stdio",
    );
    assert!(o.is_none(), "--port is not a recognized npx flag; must decline: {o:?}");
}

// The regression the recognition-only rule exists to close: an
// unrecognized flag that happens to be valueless (`--silent`) used to be
// skipped bare by the old "assume value-taking" guess only when it matched
// a hardcoded allowlist; anything else fell through the "assume it
// consumes a value" branch, which for an ODD number of unknown flags
// before a real value-taking one landed the scan on the secret two hops
// later. Recognition fixes this the same way as a single unknown flag:
// `--silent` itself is unrecognized, so the call declines before it ever
// reaches `--api-key`. Outcome and no-leak property are separate tests
// (round 3) so the leak check stays live rather than unreachable once the
// outcome assertion already holds.

#[test]
fn test_unknown_valueless_flag_before_a_value_taking_flag_declines() {
    let o = launched_origin(
        "npx",
        &[
            "--silent".into(),
            "--api-key".into(),
            "sk-live-abc123".into(),
            "some-server".into(),
        ],
        "stdio",
    );
    assert!(o.is_none(), "an unrecognized flag must decline, not guess past it: {o:?}");
}

#[test]
fn test_unknown_valueless_flag_before_a_value_taking_flag_never_leaks() {
    let o = launched_origin(
        "npx",
        &[
            "--silent".into(),
            "--api-key".into(),
            "sk-live-abc123".into(),
            "some-server".into(),
        ],
        "stdio",
    );
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
}

#[test]
fn test_another_unknown_valueless_flag_before_a_value_taking_flag_declines() {
    let o = launched_origin(
        "npx",
        &[
            "--no-install".into(),
            "--api-key".into(),
            "sk-live-abc123".into(),
            "pkg".into(),
        ],
        "stdio",
    );
    assert!(o.is_none(), "an unrecognized flag must decline, not guess past it: {o:?}");
}

#[test]
fn test_another_unknown_valueless_flag_before_a_value_taking_flag_never_leaks() {
    let o = launched_origin(
        "npx",
        &[
            "--no-install".into(),
            "--api-key".into(),
            "sk-live-abc123".into(),
            "pkg".into(),
        ],
        "stdio",
    );
    let json = serde_json::to_string(&o).unwrap();
    assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
}

#[test]
fn test_uvx_from_names_the_package_directly() {
    // --from is uvx's package-flag: its OWN value is the package, not the
    // token after it.
    let o = launched_origin(
        "uvx",
        &["--from".into(), "mcp-server-fetch".into(), "fetch-server".into()],
        "stdio",
    )
    .unwrap();
    assert_eq!(o.label, "PyPI: mcp-server-fetch");
}

#[test]
fn test_uvx_from_a_git_source_declines_rather_than_falling_through() {
    // --from's value can be a git URL, a local path, or anything pip
    // accepts as a source -- none of that is a package name. When it fails
    // validation, the call must return None outright, not scan past it to
    // whatever token comes next.
    let o = launched_origin(
        "uvx",
        &["--from".into(), "git+https://github.com/foo/bar".into(), "mcp-foo".into()],
        "stdio",
    );
    assert!(o.is_none(), "a non-package --from value must decline, not fall through: {o:?}");
}

#[test]
fn test_npx_package_flag_names_the_package_directly() {
    let o = launched_origin(
        "npx",
        &["--package".into(), "some-pkg".into(), "cmd".into()],
        "stdio",
    )
    .unwrap();
    assert_eq!(o.label, "npm: some-pkg");
}

// --- Round 3, finding 1: the `=`-joined form of a package-flag must read
// ITS value as the package, not fall through to a later token. Round 2
// checked for `=` before looking up the flag's name, so any `=`-joined
// token -- including `--from=pkg` and `--package=pkg` -- was treated as
// self-contained-and-irrelevant and skipped whole, leaving the scan to
// land on the command token that follows instead of the real package.

#[test]
fn test_uvx_from_equals_joined_names_the_package_directly() {
    let o = launched_origin(
        "uvx",
        &["--from=mcp-server-fetch".into(), "fetch-server".into()],
        "stdio",
    )
    .unwrap();
    assert_eq!(o.label, "PyPI: mcp-server-fetch");
}

#[test]
fn test_uvx_from_equals_joined_git_source_declines() {
    let o = launched_origin(
        "uvx",
        &["--from=git+https://github.com/foo/bar".into(), "mcp-foo".into()],
        "stdio",
    );
    assert!(o.is_none(), "an equals-joined non-package --from value must decline: {o:?}");
}

#[test]
fn test_npx_package_equals_joined_names_the_package_directly() {
    let o = launched_origin("npx", &["--package=some-pkg".into(), "cmd".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: some-pkg");
}

#[test]
fn test_double_dash_marks_the_next_token_as_the_package() {
    let o = launched_origin("npx", &["--".into(), "some-server".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: some-server");
}

/// Round 3, finding 3: `--` waives runner-flag RECOGNITION, not package
/// NAME VALIDATION -- the doc comment's earlier "whatever it looks like"
/// wording was inaccurate. This was already true of the code before round
/// 3 (validation runs on `raw_pkg` unconditionally, however it was
/// captured), so this test is not a red-before-green regression pin the
/// way findings 1 and 5 are: it documents behavior that was already
/// correct, contradicting what the old comment claimed.
#[test]
fn test_double_dash_does_not_waive_package_name_validation() {
    let o = launched_origin("npx", &["--".into(), "./local/server".into()], "stdio");
    assert!(o.is_none(), "-- marks the next token as the package, but it must still validate: {o:?}");
}

#[test]
fn test_valueless_flag_still_resolves_package() {
    // -y takes no value; the scan must not skip past the package after it.
    let o = launched_origin("npx", &["-y".into(), "some-server".into()], "stdio").unwrap();
    assert_eq!(o.label, "npm: some-server");
}

#[test]
fn test_bunx_yes_flag_still_resolves_package() {
    // Round 3, finding 5: bunx accepts -y/--yes the same as npx, and real
    // configs use it. It was missing from the bunx recognized set, so a
    // launch like `bunx -y pkg` declined instead of resolving.
    let o = launched_origin("bunx", &["-y".into(), "some-server".into()], "stdio").unwrap();
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

// Round 3 splits the outcome/equivalence check from the no-leak check: the
// no-leak assertion used to follow `assert!(combined.is_none())` in the
// same test, so once that held, the serialized value was always the
// literal `null` and the leak check could never fail for any input.

#[test]
fn test_codex_single_string_form_matches_split_form_and_declines() {
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
    assert!(combined.is_none(), "--api-key is not recognized; both forms must decline: {combined:?}");
}

#[test]
fn test_codex_single_string_form_never_leaks() {
    let combined = launched_origin("npx --api-key sk-live-abc123 mcp-server", &[], "stdio");
    let json = serde_json::to_string(&combined).unwrap();
    assert!(!json.contains("sk-live-abc123"), "flag value leaked into origin: {json}");
}

// --- Fix: three MINOR findings from the same review round ---

#[test]
fn test_dot_dot_is_not_a_package_name() {
    // `npx ..` currently yields a URL that browsers normalize to the npm
    // root — a link that does not go where its label claims. Real npm
    // forbids `.` and `..` as package names outright.
    assert!(
        launched_origin("npx", &["..".into()], "stdio").is_none(),
        "'..' must never resolve to an origin"
    );
    assert!(
        launched_origin("npx", &[".".into()], "stdio").is_none(),
        "'.' must never resolve to an origin"
    );
}

#[test]
fn test_leading_dot_or_underscore_package_name_is_rejected() {
    // Real npm forbids a leading '.' or '_' in a package name.
    assert!(launched_origin("npx", &[".hidden-pkg".into()], "stdio").is_none());
    assert!(launched_origin("npx", &["_private-pkg".into()], "stdio").is_none());
}

#[test]
fn test_package_name_over_214_chars_is_rejected() {
    // npm's own limit is 214 characters, including any scope.
    let long_name = "a".repeat(215);
    assert!(
        launched_origin("npx", &[long_name.into()], "stdio").is_none(),
        "a package name over npm's 214-char limit must not resolve"
    );
}

#[test]
fn test_package_name_at_214_chars_still_resolves() {
    let name_214 = "a".repeat(214);
    let o = launched_origin("npx", &[name_214.clone().into()], "stdio").unwrap();
    assert_eq!(o.label, format!("npm: {}", name_214));
}

#[test]
fn test_remote_transport_preserves_original_scheme() {
    // The transport may be a plain http:// endpoint; relabelling it https://
    // produces a link to a scheme the endpoint may not actually serve.
    let o = launched_origin("", &[], "http://mcp.example.com/v1/sse").unwrap();
    assert_eq!(o.label, "mcp.example.com");
    assert_eq!(o.url.as_deref(), Some("http://mcp.example.com"));
}

// --- Task 7: resolver scope rule ---

#[test]
fn test_project_scope_skips_checkout_lookup() {
    // resolve_file with is_global=false must not consult git at all: a
    // project asset's repo is already the pane's subject.
    let td = tempfile::tempdir().unwrap();
    let repo = td.path().join("proj");
    std::fs::create_dir_all(repo.join(".git")).unwrap();
    std::fs::write(repo.join(".git/config"),
        "[remote \"origin\"]\n\turl = https://github.com/owner/proj\n").unwrap();
    let mut r = tauri_app_lib::provenance::OriginResolver::new(td.path());
    let file = repo.join("CLAUDE.md");
    let res = r.resolve_file(None, &file.to_string_lossy(), false);
    assert!(res.origin.is_none());
    let res_global = r.resolve_file(None, &file.to_string_lossy(), true);
    assert_eq!(res_global.origin.unwrap().label, "owner/proj");
}

/// The Delivered class through the resolver, not just through
/// `PluginIndex::origin_for` directly (Task 2 already pins that): proves
/// `OriginResolver::resolve_file` reaches the plugin index at all, that
/// declared still outranks it even when the path would ALSO resolve via the
/// plugin index, and that it does not require global scope (unlike the
/// checked-out class). No real scan fixture can exercise this end-to-end —
/// see the comment on `test_origin_resolution_per_class` in
/// `scanner_tests.rs`.
#[test]
fn test_resolver_delivered_class_and_precedence() {
    let td = plugin_home();
    let mut r = tauri_app_lib::provenance::OriginResolver::new(td.path());
    // Canonicalized, matching what the resolver now does to `home`
    // internally and what a real scan always feeds `resolve_file` (via
    // `canonicalize_asset_path`) -- `td.path()` itself can be a symlink
    // (macOS's /var -> /private/var), so building the asset path from the
    // raw, uncanonicalized base would silently fail the prefix match this
    // test exists to prove.
    let home_canon = fs::canonicalize(td.path()).unwrap();
    let p = home_canon.join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s/SKILL.md");

    // No declaration: falls through to the plugin index.
    let res = r.resolve_file(None, &p.to_string_lossy(), false);
    assert!(!res.blocked);
    let o = res.origin.unwrap();
    assert!(matches!(o.kind, tauri_app_lib::provenance::OriginKind::Delivered));
    assert_eq!(o.label, "owner/market-repo");
    assert_eq!(o.delivered_by.as_deref(), Some("tool-x"));
    assert_eq!(o.commit.as_deref(), Some("b0b9f02b0581696da41e20d6c536ec639b44080f"));

    // A declared source on the SAME path still wins outright: declared >
    // delivered, even though the plugin index would also match.
    let declared_res = r.resolve_file(
        Some("https://github.com/other/declared"),
        &p.to_string_lossy(),
        false,
    );
    let d = declared_res.origin.unwrap();
    assert!(matches!(d.kind, tauri_app_lib::provenance::OriginKind::Declared));
    assert_eq!(d.label, "other/declared");
}

/// A refused read of the plugin manifest, with nothing else found, must
/// surface as "could not check" — not silently collapse to "nothing here".
#[test]
fn test_resolver_reports_blocked_when_plugin_manifest_unreadable_and_nothing_found() {
    use std::os::unix::fs::PermissionsExt;

    let td = tempfile::tempdir().unwrap();
    let pl = td.path().join(".claude/plugins");
    fs::create_dir_all(&pl).unwrap();
    let known = pl.join("known_marketplaces.json");
    fs::write(&known, r#"{"mkt-a":{"source":{"source":"github","repo":"owner/x"}}}"#).unwrap();
    fs::set_permissions(&known, fs::Permissions::from_mode(0o000)).unwrap();

    let mut r = tauri_app_lib::provenance::OriginResolver::new(td.path());
    let p = td.path().join("some/unrelated/file.md");
    let res = r.resolve_file(None, &p.to_string_lossy(), false);
    assert!(res.origin.is_none());
    assert!(res.blocked, "an unreadable manifest with nothing else found must report blocked");

    let _ = fs::set_permissions(&known, fs::Permissions::from_mode(0o644));
}

/// The inverse of the test above: a found origin outranks a blocked
/// side-path. `installed_plugins.json` is unreadable (degrading commit /
/// installed-at metadata only), but `known_marketplaces.json` still
/// resolves the marketplace for a path under its cache — that resolved
/// origin must not be reported as blocked.
#[test]
fn test_resolver_found_origin_outranks_blocked_plugin_index() {
    use std::os::unix::fs::PermissionsExt;

    let td = plugin_home();
    let installed = td.path().join(".claude/plugins/installed_plugins.json");
    fs::set_permissions(&installed, fs::Permissions::from_mode(0o000)).unwrap();

    let mut r = tauri_app_lib::provenance::OriginResolver::new(td.path());
    // Canonicalized — see the comment in
    // `test_resolver_delivered_class_and_precedence` on why the raw
    // `td.path()` no longer matches post-fix.
    let home_canon = fs::canonicalize(td.path()).unwrap();
    let p = home_canon.join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s/SKILL.md");
    let res = r.resolve_file(None, &p.to_string_lossy(), false);
    assert!(
        !res.blocked,
        "a resolved origin must win over a blocked side-path, not be reported as blocked"
    );
    assert_eq!(res.origin.unwrap().label, "owner/market-repo");

    let _ = fs::set_permissions(&installed, fs::Permissions::from_mode(0o644));
}

/// `PluginIndex` builds its cache/marketplaces prefixes LEXICALLY from
/// whatever `home` it is handed, while every path this resolver is asked
/// about (`resolve_file`'s `path` argument) comes from
/// `canonicalize_asset_path` -- fully symlink-resolved. Unequalised, a
/// symlinked `$HOME` (`ln -s ~/dotfiles/claude_home ~/.claude_home`, then
/// point `HANGER_TEST_HOME`/`HOME` at the symlink, which is exactly how a
/// real dotfiles-managed machine is laid out) makes every Delivered lookup
/// silently miss: the canonical asset path resolves through the symlink to
/// the REAL directory, but the prefix built from the raw (lexical) home
/// still names the symlink path, so `strip_dir_prefix` never matches.
#[test]
fn test_resolver_delivered_resolves_under_symlinked_home() {
    let td = tempfile::tempdir().unwrap();

    let real_home = td.path().join("dotfiles/claude_home");
    let pl = real_home.join(".claude/plugins");
    fs::create_dir_all(&pl).unwrap();
    fs::write(
        pl.join("known_marketplaces.json"),
        r#"{"mkt-a":{"source":{"source":"github","repo":"owner/market-repo"}}}"#,
    )
    .unwrap();
    let cache_leaf = real_home.join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s");
    fs::create_dir_all(&cache_leaf).unwrap();
    fs::write(cache_leaf.join("SKILL.md"), "---\nname: s\ndescription: d\n---\n").unwrap();

    // The symlinked home a scan would actually be pointed at.
    let symlinked_home = td.path().join("home");
    std::os::unix::fs::symlink(&real_home, &symlinked_home).unwrap();

    // The path a scan would actually feed `resolve_file`: canonicalized,
    // i.e. resolved straight through the symlink to the real directory --
    // `canonicalize_asset_path` in scanner.rs does exactly this.
    let lexical_asset_path =
        symlinked_home.join(".claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/s/SKILL.md");
    let canonical_asset_path = fs::canonicalize(&lexical_asset_path).unwrap();

    // Resolver constructed with the LEXICAL (symlinked) home, exactly as
    // `scanner.rs` builds it from `get_home_dir()`.
    let mut r = tauri_app_lib::provenance::OriginResolver::new(&symlinked_home);
    let res = r.resolve_file(None, &canonical_asset_path.to_string_lossy(), false);
    let o = res
        .origin
        .expect("a symlinked $HOME must not hide a Delivered origin the plugin index actually has");
    assert_eq!(o.label, "owner/market-repo");
}

/// The git-refusal arm of `blocked`, driven through `resolve_file` rather
/// than through `git_remote_origin` directly (already pinned at
/// `test_memoization_carries_blocked_across_cache_hits` and friends, but
/// never through the resolver's own precedence chain). No plugin manifests
/// exist here, so the plugin-index arm of `blocked` stays false and this
/// isolates the checked-out arm.
#[test]
fn test_resolver_reports_blocked_via_git_refusal_arm() {
    use std::os::unix::fs::PermissionsExt;

    let td = tempfile::tempdir().unwrap();
    let repo = td.path().join("proj");
    fs::create_dir_all(repo.join(".git")).unwrap();
    let cfg = repo.join(".git/config");
    fs::write(&cfg, "[remote \"origin\"]\n\turl = https://github.com/owner/repo\n").unwrap();
    fs::set_permissions(&cfg, fs::Permissions::from_mode(0o000)).unwrap();

    let mut r = tauri_app_lib::provenance::OriginResolver::new(td.path());
    let file = repo.join("CLAUDE.md");
    let res = r.resolve_file(None, &file.to_string_lossy(), true);
    assert!(res.origin.is_none());
    assert!(res.blocked, "an EACCES on .git/config reached through resolve_file must report blocked");

    let _ = fs::set_permissions(&cfg, fs::Permissions::from_mode(0o644));
}
