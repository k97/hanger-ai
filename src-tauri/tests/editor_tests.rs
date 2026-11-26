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

/// The webview opens a path with a named app only through `open_in_editor`,
/// which checks the name against what Hanger detected. An `app` entry here
/// would be a second route that skips that check: `openPath(p, "Xcode")`
/// runs `open -a "Xcode"` whether or not this Mac has it, and opens nothing
/// when Xcode is installed under another filename. `"app": true` would let
/// the webview open a path in any app at all.
///
/// Replaces `every_known_editor_is_allowed_by_the_capability` and its
/// mirror, which kept one `app` entry per table name in step with the table.
#[test]
fn the_capability_lets_the_webview_name_no_app() {
    let raw = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json"),
    )
    .expect("capabilities/default.json must be readable");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

    let mut entries = 0;
    for permission in parsed["permissions"].as_array().expect("permissions array") {
        if permission["identifier"] == "opener:allow-open-path" {
            for entry in permission["allow"].as_array().expect("allow array") {
                entries += 1;
                assert!(
                    entry.get("app").is_none(),
                    "opener:allow-open-path grants {entry} — editors open through \
                     open_in_editor, never openPath with an app"
                );
            }
        }
    }
    assert!(entries > 0, "no opener:allow-open-path entries: this test checked nothing");
}

/// Every Hanger asset lives under a dot-directory — `~/.agents/skills`,
/// `~/.claude`, `~/.codex`, `~/.mcp.json`, and a project's own `.claude/`.
///
/// `tauri/src/scope/fs.rs:215-225` defaults `require_literal_leading_dot` to
/// **true on unix** when the opener plugin carries no config, and with that
/// flag `$HOME/**` matches no path containing a dot component. So the
/// capability silently refused every open — the original "Open in editor does
/// nothing", and then "Hanger couldn't open …" once failures were surfaced
/// (2026-08-29, reported against the running app).
///
/// This pins the config that turns it off. Delete the `plugins.opener` block
/// from `tauri.conf.json` and this test reddens.
#[test]
fn the_opener_scope_reaches_dot_directories() {
    let raw = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json"),
    )
    .expect("tauri.conf.json must be readable");
    let conf: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");

    let literal_dot = conf["plugins"]["opener"]["requireLiteralLeadingDot"].as_bool();
    assert_eq!(
        literal_dot,
        Some(false),
        "plugins.opener.requireLiteralLeadingDot must be false — Tauri defaults it to true on \
         unix, and every Hanger asset path contains a dot component, so the opener scope \
         refuses all of them"
    );

    // The property that setting actually buys, asserted positively against the
    // same glob options Tauri builds (`fs.rs:235-241`).
    let pattern = glob::Pattern::new("/Users/someone/**").expect("valid glob");
    let options = glob::MatchOptions {
        require_literal_separator: true,
        require_literal_leading_dot: literal_dot.unwrap_or(true),
        ..Default::default()
    };
    for path in [
        "/Users/someone/.agents/skills/animation-vocabulary",
        "/Users/someone/.claude/skills/some-skill",
        "/Users/someone/.mcp.json",
        "/Users/someone/Work/project/.claude/rules/a-rule.md",
    ] {
        assert!(
            pattern.matches_with(path, options),
            "the opener scope would refuse {path}"
        );
    }
}

/// The bundle id an app on disk declares, read from its own `Info.plist`.
/// `PlistBuddy` reads binary plists too, which is what most shipped apps carry.
fn declared_bundle_id(app: &std::path::Path) -> Option<String> {
    let out = std::process::Command::new("/usr/libexec/PlistBuddy")
        .args(["-c", "Print :CFBundleIdentifier"])
        .arg(app.join("Contents/Info.plist"))
        .output()
        .ok()?;
    out.status
        .success()
        .then(|| String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// A fake app bundle on disk, named however the test likes, declaring `id`.
fn fixture_app(dir: &std::path::Path, file_name: &str, id: &str) -> std::path::PathBuf {
    let app = dir.join(file_name);
    std::fs::create_dir_all(app.join("Contents")).unwrap();
    std::fs::write(
        app.join("Contents/Info.plist"),
        format!(
            "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
             <plist version=\"1.0\"><dict>\
             <key>CFBundleIdentifier</key><string>{id}</string>\
             </dict></plist>\n"
        ),
    )
    .unwrap();
    app
}

/// Replaces `every_table_name_matches_the_installed_app`, which failed on
/// GitHub's runner because its Xcode is installed as `Xcode_26.6.app`. That
/// test asserted a property the opener should never have needed: that the
/// table's display name is the app's filename. What must hold is that the
/// app Hanger opens is the one it found — so for every editor this Mac has,
/// the open target is the detected path, and that path is a bundle declaring
/// the bundle id detection matched.
///
/// On a machine with none of the table's editors this loop asserts nothing;
/// `a_renamed_app_is_opened_by_the_path_hanger_found` is the case that always
/// runs.
#[test]
fn every_detected_editor_opens_the_bundle_it_detected() {
    use tauri_app_lib::editors::resolve_installed_editor;
    for found in tauri_app_lib::editors::detect() {
        let resolved = resolve_installed_editor(&found.name)
            .unwrap_or_else(|r| panic!("{} was detected but refused: {r:?}", found.name));
        assert_eq!(
            resolved.open_target(),
            found.path,
            "{} would be opened by something other than the app Hanger found",
            found.name
        );
        assert_eq!(
            declared_bundle_id(std::path::Path::new(resolved.open_target())).as_deref(),
            Some(found.bundle_id.as_str()),
            "{}'s open target {:?} is not the bundle {} that detection matched",
            found.name,
            resolved.open_target(),
            found.bundle_id
        );
    }
}

/// The CI failure as a fixture: LaunchServices finds `com.apple.dt.Xcode` at
/// `Xcode_26.6.app`. Hanger must open that bundle by its path — `open -a
/// "Xcode"` resolves by filename and finds nothing — while still calling it
/// "Xcode" on screen.
#[test]
fn a_renamed_app_is_opened_by_the_path_hanger_found() {
    use tauri_app_lib::editors::resolve_editor;
    let dir = tempfile::tempdir().unwrap();
    let app = fixture_app(dir.path(), "Xcode_26.6.app", "com.apple.dt.Xcode");
    let app_path = app.to_string_lossy().to_string();

    let resolved = resolve_editor("Xcode", |id| {
        (id == "com.apple.dt.Xcode").then(|| app_path.clone())
    })
    .expect("an installed Xcode must resolve, whatever its filename");

    assert_eq!(resolved.open_target(), app_path, "opened by name, not by the app Hanger found");
    assert_eq!(resolved.name, "Xcode", "the display name is the table's, not the filename");
    assert_eq!(resolved.bundle_id, "com.apple.dt.Xcode");
    assert_eq!(
        declared_bundle_id(std::path::Path::new(resolved.open_target())).as_deref(),
        Some("com.apple.dt.Xcode")
    );
}

/// The webview names an editor; only a table name that LaunchServices
/// resolved may be opened. A path, a bundle id, a near-miss name, or a table
/// editor this Mac does not have is refused — even with a resolver that would
/// say yes to anything, because the name is checked against the table before
/// anything is resolved.
#[test]
fn an_editor_hanger_did_not_detect_is_refused() {
    use tauri_app_lib::editors::{OpenRefusal, resolve_editor};

    assert_eq!(
        resolve_editor("Xcode", |_| None).map(|e| e.path),
        Err(OpenRefusal::NotInstalled("Xcode".into())),
        "a table editor that is not installed must be refused, not handed to `open`"
    );

    let says_yes = |id: &str| Some(format!("/Applications/{id}.app"));
    for not_a_table_name in [
        "/Applications/Calculator.app",
        "/System/Applications/Utilities/Terminal.app",
        "com.apple.dt.Xcode",
        "com.apple.Terminal",
        "Terminal",
        "xcode",
        "",
    ] {
        assert_eq!(
            resolve_editor(not_a_table_name, says_yes).map(|e| e.path),
            Err(OpenRefusal::UnknownEditor(not_a_table_name.into())),
            "{not_a_table_name:?} is not an editor Hanger detected and must be refused"
        );
    }
}

/// The capability's `$HOME/**` scope, which `openPath` enforced, now has to
/// be enforced by Hanger's own command. Same rule as Tauri's: the path is
/// canonicalised first, so a symlink under home that points outside it is
/// refused, and a dot directory is not.
#[test]
fn only_paths_under_home_may_be_opened_in_an_editor() {
    use tauri_app_lib::editors::path_in_editor_scope;
    let root = tempfile::tempdir().unwrap();
    let home = root.path().join("home");
    let outside = root.path().join("elsewhere");
    std::fs::create_dir_all(home.join(".agents/skills/x")).unwrap();
    std::fs::create_dir_all(&outside).unwrap();
    std::fs::write(home.join(".mcp.json"), "{}").unwrap();
    std::fs::write(outside.join("secret"), "").unwrap();
    std::os::unix::fs::symlink(outside.join("secret"), home.join("escape")).unwrap();
    let home = home.canonicalize().unwrap();

    assert!(path_in_editor_scope(&home.join(".agents/skills/x"), &home));
    assert!(path_in_editor_scope(&home.join(".mcp.json"), &home));

    assert!(!path_in_editor_scope(&outside.join("secret"), &home), "a path outside home");
    assert!(!path_in_editor_scope(&home.join("escape"), &home), "a symlink out of home");
    assert!(
        !path_in_editor_scope(&home.join(".agents/../../elsewhere/secret"), &home),
        "a `..` walk out of home"
    );
    assert!(!path_in_editor_scope(&home.join("nope"), &home), "a path that does not exist");
    assert!(!path_in_editor_scope(&home, &home), "home itself: `$HOME/**` does not match it");
}

/// The value the command enforces is the one the capability grants a plain
/// `openPath`; if one moves, this goes red rather than the two scopes drifting.
#[test]
fn the_editor_scope_matches_the_capability_path_scope() {
    let raw = std::fs::read_to_string(
        concat!(env!("CARGO_MANIFEST_DIR"), "/capabilities/default.json"),
    )
    .expect("capabilities/default.json must be readable");
    let parsed: serde_json::Value = serde_json::from_str(&raw).expect("valid JSON");
    let plain: Vec<&str> = parsed["permissions"]
        .as_array()
        .expect("permissions array")
        .iter()
        .filter(|p| p["identifier"] == "opener:allow-open-path")
        .flat_map(|p| p["allow"].as_array().expect("allow array").iter())
        .filter(|e| e.get("app").is_none())
        .filter_map(|e| e["path"].as_str())
        .collect();
    assert_eq!(plain, vec![tauri_app_lib::editors::EDITOR_OPEN_SCOPE]);
}
