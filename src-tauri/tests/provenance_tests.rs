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

#[test]
fn test_memoization_reuses_directory_verdict() {
    let td = tempfile::tempdir().unwrap();
    let asset_a = td.path().join("x/a.md");
    let asset_b = td.path().join("x/b.md");
    let mut cache = HashMap::new();
    git_remote_origin(&asset_a, td.path(), &mut cache);
    let before = cache.len();
    git_remote_origin(&asset_b, td.path(), &mut cache);
    assert_eq!(cache.len(), before, "second file in same dir reads nothing new");
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
