use tauri_app_lib::editors::{KNOWN_EDITORS, editor_name_for_bundle_id};

#[test]
fn table_has_no_duplicate_bundle_ids() {
    let mut seen = std::collections::HashSet::new();
    for editor in KNOWN_EDITORS {
        for id in editor.bundle_ids {
            assert!(seen.insert(*id), "bundle id {id} appears twice in KNOWN_EDITORS");
        }
    }
}

#[test]
fn table_has_no_duplicate_names() {
    let mut seen = std::collections::HashSet::new();
    for editor in KNOWN_EDITORS {
        assert!(seen.insert(editor.name), "name {} appears twice", editor.name);
    }
}

#[test]
fn every_entry_has_at_least_one_bundle_id() {
    for editor in KNOWN_EDITORS {
        assert!(!editor.bundle_ids.is_empty(), "{} has no bundle id", editor.name);
    }
}

/// Terminal editors cannot be launched by a GUI app: they need a tty, and
/// `open -a` gives them none, so they start invisibly and never show a
/// window. An entry for one is a menu item that silently does nothing.
#[test]
fn table_excludes_terminal_only_editors() {
    for banned in ["Neovim", "Vim", "Helix", "Emacs"] {
        assert!(
            !KNOWN_EDITORS.iter().any(|e| e.name == banned),
            "{banned} is a terminal editor and cannot be launched with `open -a`"
        );
    }
}

#[test]
fn lookup_maps_a_known_bundle_id_to_its_display_name() {
    assert_eq!(editor_name_for_bundle_id("com.microsoft.VSCode"), Some("Visual Studio Code"));
}

#[test]
fn lookup_returns_none_for_an_unknown_bundle_id() {
    assert_eq!(editor_name_for_bundle_id("com.example.NotAnEditor"), None);
}

/// Not an assertion about THIS machine's editors — that would be a fact about
/// one Mac, which `design-for-any-machine` forbids designing from. It asserts
/// the shape: whatever comes back is well-formed and consistent with the table.
#[test]
fn detection_returns_well_formed_rows() {
    let found = tauri_app_lib::editors::detect();
    for editor in &found {
        assert!(!editor.path.is_empty(), "{} resolved to an empty path", editor.name);
        assert!(std::path::Path::new(&editor.path).exists(), "{} does not exist", editor.path);
        assert_eq!(
            tauri_app_lib::editors::editor_name_for_bundle_id(&editor.bundle_id),
            Some(editor.name.as_str()),
            "detection returned a name the table does not agree with"
        );
    }
}

/// The guard above is a loop; on a machine with none of the table's editors
/// installed it would pass having asserted nothing. This names that state
/// instead of hiding it: detection must at least RUN and return a vector
/// whose length never exceeds the table it is drawn from.
#[test]
fn detection_never_returns_more_rows_than_the_table_has() {
    let found = tauri_app_lib::editors::detect();
    assert!(
        found.len() <= KNOWN_EDITORS.len(),
        "detect() returned {} rows from a {}-entry table",
        found.len(),
        KNOWN_EDITORS.len()
    );
}

use std::collections::HashSet;

/// The capability file is static config; the table is code. Nothing links
/// them, so they drift — and drift here is SILENT: an editor missing from the
/// capability is offered in the picker, chosen, and then refused by the scope
/// with the rejection swallowed frontend-side. This guard is the link.
///
/// It must be able to fail. Delete any entry from the capability's `allow`
/// list and this test goes red; that is the check to run before trusting it.
#[test]
fn every_known_editor_is_allowed_by_the_capability() {
    let raw = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json"),
    )
    .expect("capabilities/default.json must be readable");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

    let mut allowed: HashSet<String> = HashSet::new();
    for permission in parsed["permissions"].as_array().expect("permissions array") {
        if permission["identifier"] == "opener:allow-open-path" {
            for entry in permission["allow"].as_array().expect("allow array") {
                if let Some(app) = entry["app"].as_str() {
                    allowed.insert(app.to_string());
                }
            }
        }
    }

    for editor in KNOWN_EDITORS {
        assert!(
            allowed.contains(editor.name),
            "{} is in KNOWN_EDITORS but not allowed by capabilities/default.json — \
             it would be offered in the picker and then silently refused",
            editor.name
        );
    }
}

/// The mirror: an allowlist entry with no table row is a permission granted
/// for nothing, and usually means an editor was renamed on one side only.
#[test]
fn the_capability_allows_no_editor_the_table_does_not_know() {
    let raw = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json"),
    )
    .expect("capabilities/default.json must be readable");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

    let known: HashSet<&str> = KNOWN_EDITORS.iter().map(|e| e.name).collect();
    for permission in parsed["permissions"].as_array().expect("permissions array") {
        if permission["identifier"] == "opener:allow-open-path" {
            for entry in permission["allow"].as_array().expect("allow array") {
                if let Some(app) = entry["app"].as_str() {
                    assert!(known.contains(app), "capability allows {app}, which is not in KNOWN_EDITORS");
                }
            }
        }
    }
}
