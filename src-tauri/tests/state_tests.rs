use std::path::Path;
use tauri_app_lib::domain::{resolve_state, HydratedLink, LinkState, Mechanism};

fn mock_link(mechanism: Mechanism, source_hash: &str) -> HydratedLink {
    HydratedLink {
        id: 1,
        asset_id: 10,
        dest_root_id: 20,
        source_path: "/home/user/.claude/skills/test-skill".to_string(),
        dest_path: "/home/user/project/.claude/skills/test-skill".to_string(),
        mechanism,
        source_hash: source_hash.to_string(),
        dest_hash: Some("hash123".to_string()),
        created_at: 1700000000,
        last_verified_at: Some(1700000050),
    }
}

#[test]
fn test_resolve_state_linked_symlink() {
    let link = mock_link(Mechanism::Symlink, "hash123");
    let target = Path::new("/home/user/.claude/skills/test-skill");
    let state = resolve_state(&link, Some("hash123"), true, Some(target));
    assert_eq!(state, LinkState::Linked);
}

#[test]
fn test_resolve_state_linked_copy() {
    let link = mock_link(Mechanism::Copy, "hash123");
    let state = resolve_state(&link, Some("hash123"), true, None);
    assert_eq!(state, LinkState::Linked);
}

#[test]
fn test_resolve_state_drifted() {
    let link = mock_link(Mechanism::TrackedCopy, "original_hash");
    let state = resolve_state(&link, Some("modified_source_hash"), true, None);
    assert_eq!(state, LinkState::Drifted);
}

#[test]
fn test_resolve_state_local_destination_edit_is_linked() {
    let mut link = mock_link(Mechanism::TrackedCopy, "original_source_hash");
    link.dest_hash = Some("edited_dest_hash".to_string()); // Destination file edited locally
    // Source file on disk has NOT changed (source_hash_now == link.source_hash)
    let state = resolve_state(&link, Some("original_source_hash"), true, None);
    assert_eq!(state, LinkState::Linked, "Local destination edits do NOT constitute drift when source has not advanced");
}

#[test]
fn test_resolve_state_foreign() {
    let link = mock_link(Mechanism::Symlink, "hash123");
    let foreign_target = Path::new("/other/tool/skill");
    let state = resolve_state(&link, Some("hash123"), true, Some(foreign_target));
    assert_eq!(state, LinkState::Foreign);
}

#[test]
fn test_resolve_state_broken_missing() {
    let link = mock_link(Mechanism::Symlink, "hash123");
    let state = resolve_state(&link, Some("hash123"), false, None);
    assert_eq!(state, LinkState::Broken);
}

#[test]
fn test_resolve_state_broken_unresolvable() {
    // Symlink exists as a dangling symlink (target missing -> dest_exists is false)
    let link = mock_link(Mechanism::Symlink, "hash123");
    let state = resolve_state(&link, Some("hash123"), false, None);
    assert_eq!(state, LinkState::Broken);
}

#[test]
fn test_resolve_state_mechanism_mismatch_copy_with_symlink() {
    // Expected standalone copy, but destination holds a symlink (even if pointing to source)
    let link = mock_link(Mechanism::Copy, "hash123");
    let symlink_target = Path::new("/home/user/.claude/skills/test-skill");
    let state = resolve_state(&link, Some("hash123"), true, Some(symlink_target));
    assert_eq!(state, LinkState::Foreign);
}

#[test]
fn test_resolve_state_mechanism_mismatch_symlink_with_file_returns_foreign() {
    // Expected symlink, but destination holds a regular file (symlink_target is None while dest_exists is true).
    // Decision: Foreign. Destination exists as an asset, but its filesystem mechanism (regular file) does not match
    // the managed link (Symlink). It represents a local unmanaged edit/replacement, not a missing file (Broken).
    let link = mock_link(Mechanism::Symlink, "hash123");
    let state = resolve_state(&link, Some("hash123"), true, None);
    assert_eq!(state, LinkState::Foreign);
}

#[test]
fn test_resolve_state_pending_copy() {
    // Copy mechanism when source_hash_now is None (Pass 2 has not run to compute current source hash)
    let link = mock_link(Mechanism::Copy, "hash123");
    let state = resolve_state(&link, None, true, None);
    assert_eq!(state, LinkState::Pending);
}

#[test]
fn test_resolve_state_pending_symlink() {
    // Symlinks do NOT require content hashing to verify state — their link integrity depends strictly on readlink (symlink_target == source_path).
    // Therefore, when source_hash_now is None (Pass 2 hash pending), a valid symlink returns Linked (Pass 1 resolved).
    let link = mock_link(Mechanism::Symlink, "hash123");
    let target = Path::new("/home/user/.claude/skills/test-skill");
    let state = resolve_state(&link, None, true, Some(target));
    assert_eq!(state, LinkState::Linked);
}

#[test]
fn test_resolve_state_null_dest_hash() {
    let mut link = mock_link(Mechanism::Copy, "hash123");
    link.dest_hash = None; // Pass 2 has not run yet to calculate dest hash
    let state = resolve_state(&link, Some("hash123"), true, None);
    assert_eq!(state, LinkState::Linked);
}

#[test]
fn test_resolve_state_null_last_verified_at() {
    let mut link = mock_link(Mechanism::Copy, "hash123");
    link.last_verified_at = None; // Pass 2 has not run yet to update verification timestamp
    let state = resolve_state(&link, Some("hash123"), true, None);
    assert_eq!(state, LinkState::Linked);
}

#[test]
fn test_link_state_serde_pending_and_variants() {
    // IPC Contract §6 requirement: LinkState::Pending MUST serialize to JSON Value::Null, and variants serialize to lowercase strings
    assert_eq!(serde_json::to_value(LinkState::Pending).unwrap(), serde_json::Value::Null);
    assert_eq!(serde_json::to_value(LinkState::Linked).unwrap(), serde_json::json!("linked"));
    assert_eq!(serde_json::to_value(LinkState::Drifted).unwrap(), serde_json::json!("drifted"));
    assert_eq!(serde_json::to_value(LinkState::Foreign).unwrap(), serde_json::json!("foreign"));
    assert_eq!(serde_json::to_value(LinkState::Broken).unwrap(), serde_json::json!("broken"));
}

#[test]
fn test_link_state_serde_round_trip() {
    // Test inverse deserialization: null -> Pending, "linked" -> Linked, and full round-trip for all 5 variants
    let variants = vec![
        (LinkState::Pending, serde_json::Value::Null),
        (LinkState::Linked, serde_json::json!("linked")),
        (LinkState::Drifted, serde_json::json!("drifted")),
        (LinkState::Foreign, serde_json::json!("foreign")),
        (LinkState::Broken, serde_json::json!("broken")),
    ];

    for (variant, expected_val) in variants {
        let serialized = serde_json::to_value(&variant).unwrap();
        assert_eq!(serialized, expected_val, "Failed serialization for {:?}", variant);

        let deserialized: LinkState = serde_json::from_value(serialized).unwrap();
        assert_eq!(deserialized, variant, "Failed deserialization round-trip for {:?}", variant);
    }
}
