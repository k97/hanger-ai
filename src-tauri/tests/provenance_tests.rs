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
    assert!(o.installed_at_ms.is_some());
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
