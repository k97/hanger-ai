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
