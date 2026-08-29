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
    for found in tauri_app_lib::editors::detect() {
        assert!(!found.path.is_empty(), "{} resolved to an empty path", found.name);
        assert!(std::path::Path::new(&found.path).exists(), "{} does not exist", found.path);
        assert_eq!(
            tauri_app_lib::editors::editor_name_for_bundle_id(&found.bundle_id),
            Some(found.name.as_str()),
            "detection returned a name the table does not agree with"
        );
    }
}
