//! Which editors this Mac has, and what they are called.
//!
//! Two halves that must stay separate. The TABLE answers "is this an editor,
//! and what is its display name" — no OS metadata can answer that: QuickTime
//! Player declares `public.folder` with `CFBundleTypeRole = Editor`,
//! byte-identical to Visual Studio Code's declaration (measured 2026-08-29).
//! LAUNCHSERVICES answers "is it installed, and where" — a bundle-id lookup
//! measured 6.12 ms for eight ids on the author's machine, 2026-08-29, no
//! Spotlight dependency, `None` for a miss.
//!
//! `name` is what gets passed to `open -a` and what must appear verbatim in
//! `capabilities/default.json` (`editor_capability_tests` pins the two
//! together). It is an app NAME, never a path: `Application::App` compares
//! byte-for-byte (`tauri-plugin-opener-2.5.4/src/scope.rs:67`), so a path
//! entry would refuse any user whose editor lives outside `/Applications`.

use serde::Serialize;

pub struct KnownEditor {
    /// Passed to `open -a`, shown in the UI, and mirrored in the capability.
    pub name: &'static str,
    /// Several when an editor ships channels or major versions under
    /// different identifiers.
    pub bundle_ids: &'static [&'static str],
}

/// **`name` must be the app's `.app` filename**, because `open -a <name>`
/// resolves by it and the opener capability compares it byte-for-byte
/// (`scope.rs:67`). A name that reads well but does not match the bundle is a
/// menu item that silently does nothing —
/// `every_table_name_matches_the_installed_app` catches that for whatever the
/// developer has installed.
///
/// Bundle identifiers below are read from two sources, never from memory: the
/// five originally verified against each app's own `Bundle.bundleIdentifier`
/// on this machine, and the rest from GitHub Desktop's
/// `app/src/lib/editors/darwin.ts` (MIT), fetched 2026-08-29. A wrong id is
/// indistinguishable from "not installed", so it fails silently and no test
/// goes red — which is exactly why guessing one is forbidden.
///
/// Deliberately absent:
/// - **Eclipse (11 variants) and Aptana** — every variant ships as
///   `Eclipse.app`, so no single `name` can both identify the variant and
///   satisfy `open -a`.
/// - **Fleet** — GitHub Desktop lists its identifier as `Fleet.app`, which is
///   a filename, not a bundle id; JetBrains also withdrew it 2025-12-22.
/// - **Emacs** — `table_excludes_terminal_only_editors` bans the name. Adding
///   it needs a deliberate ruling on that denylist, not a quiet exception.
///   Terminal editors generally stay out: launched by a GUI app they get no
///   tty and start invisibly.
pub const KNOWN_EDITORS: &[KnownEditor] = &[
    // Verified on this machine from each app's own bundle, 2026-08-29.
    KnownEditor { name: "Visual Studio Code", bundle_ids: &["com.microsoft.VSCode"] },
    KnownEditor { name: "Cursor",             bundle_ids: &["com.todesktop.230313mzl4w4u92"] },
    KnownEditor { name: "Zed",                bundle_ids: &["dev.zed.Zed"] },
    KnownEditor { name: "Antigravity IDE",    bundle_ids: &["com.google.antigravity-ide"] },
    KnownEditor { name: "Xcode",              bundle_ids: &["com.apple.dt.Xcode"] },
    // From GitHub Desktop's darwin.ts.
    KnownEditor { name: "Visual Studio Code - Insiders", bundle_ids: &["com.microsoft.VSCodeInsiders"] },
    KnownEditor { name: "VSCodium",           bundle_ids: &["com.vscodium", "com.visualstudio.code.oss"] },
    KnownEditor { name: "Zed Preview",        bundle_ids: &["dev.zed.Zed-Preview"] },
    KnownEditor { name: "Windsurf",           bundle_ids: &["com.exafunction.windsurf"] },
    KnownEditor { name: "Sublime Text",       bundle_ids: &["com.sublimetext.4", "com.sublimetext.3", "com.sublimetext.2"] },
    KnownEditor { name: "BBEdit",             bundle_ids: &["com.barebones.bbedit"] },
    KnownEditor { name: "Nova",               bundle_ids: &["com.panic.Nova"] },
    KnownEditor { name: "TextMate",           bundle_ids: &["com.macromates.TextMate"] },
    KnownEditor { name: "Typora",             bundle_ids: &["abnerworks.Typora"] },
    KnownEditor { name: "CodeRunner",         bundle_ids: &["com.krill.CodeRunner"] },
    KnownEditor { name: "Pulsar",             bundle_ids: &["dev.pulsar-edit.pulsar"] },
    KnownEditor { name: "Atom",               bundle_ids: &["com.github.atom"] },
    KnownEditor { name: "Brackets",           bundle_ids: &["io.brackets.appshell"] },
    KnownEditor { name: "Lite XL",            bundle_ids: &["com.lite-xl"] },
    KnownEditor { name: "MacVim",             bundle_ids: &["org.vim.MacVim"] },
    KnownEditor { name: "Neovide",            bundle_ids: &["com.neovide.neovide"] },
    KnownEditor { name: "VimR",               bundle_ids: &["com.qvacua.VimR"] },
    KnownEditor { name: "RStudio",            bundle_ids: &["org.rstudio.RStudio", "com.rstudio.desktop"] },
    KnownEditor { name: "Android Studio",     bundle_ids: &["com.google.android.studio"] },
    KnownEditor { name: "IntelliJ IDEA",      bundle_ids: &["com.jetbrains.intellij"] },
    KnownEditor { name: "IntelliJ IDEA CE",   bundle_ids: &["com.jetbrains.intellij.ce"] },
    KnownEditor { name: "PyCharm",            bundle_ids: &["com.jetbrains.PyCharm"] },
    KnownEditor { name: "PyCharm CE",         bundle_ids: &["com.jetbrains.pycharm.ce"] },
    KnownEditor { name: "WebStorm",           bundle_ids: &["com.jetbrains.WebStorm"] },
    KnownEditor { name: "PhpStorm",           bundle_ids: &["com.jetbrains.PhpStorm"] },
    KnownEditor { name: "RubyMine",           bundle_ids: &["com.jetbrains.RubyMine"] },
    KnownEditor { name: "RustRover",          bundle_ids: &["com.jetbrains.RustRover"] },
    KnownEditor { name: "CLion",              bundle_ids: &["com.jetbrains.CLion"] },
    KnownEditor { name: "GoLand",             bundle_ids: &["com.jetbrains.goland"] },
    KnownEditor { name: "Rider",              bundle_ids: &["com.jetbrains.rider"] },
    KnownEditor { name: "DataSpell",          bundle_ids: &["com.jetbrains.DataSpell"] },
];

pub fn editor_name_for_bundle_id(bundle_id: &str) -> Option<&'static str> {
    KNOWN_EDITORS
        .iter()
        .find(|e| e.bundle_ids.contains(&bundle_id))
        .map(|e| e.name)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedEditor {
    pub name: String,
    pub bundle_id: String,
    pub path: String,
}

#[cfg(target_os = "macos")]
fn application_path(bundle_id: &str) -> Option<String> {
    use objc2_app_kit::NSWorkspace;
    use objc2_foundation::NSString;

    // No `unsafe` needed: objc2-app-kit 0.3 declares these three as safe `fn`s
    // — the `#[unsafe(method(...))]` in its generated bindings marks the FFI
    // declaration, not the Rust call.
    let workspace = NSWorkspace::sharedWorkspace();
    let identifier = NSString::from_str(bundle_id);
    let url = workspace.URLForApplicationWithBundleIdentifier(&identifier)?;
    let path = url.path()?;
    Some(path.to_string())
}

#[cfg(not(target_os = "macos"))]
fn application_path(_bundle_id: &str) -> Option<String> {
    None
}

/// Picks the first bundle id in `bundle_ids` for which `resolve` returns a
/// path, mirroring `detect()`'s precedence when an editor lists several
/// bundle ids for different channels or major versions: only the first one
/// installed is reported. `resolve` is `application_path` in production and
/// a fake in `tests::first_installed_short_circuits_at_the_first_match`,
/// which is what lets that precedence be tested without hitting LaunchServices
/// or adding a multi-id entry to `KNOWN_EDITORS`.
fn first_installed(
    bundle_ids: &'static [&'static str],
    mut resolve: impl FnMut(&str) -> Option<String>,
) -> Option<(&'static str, String)> {
    bundle_ids.iter().find_map(|id| resolve(id).map(|path| (*id, path)))
}

/// The table intersected with what is installed. First bundle id that
/// resolves wins, so an editor listing several channels reports once.
pub fn detect() -> Vec<DetectedEditor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|editor| {
            first_installed(editor.bundle_ids, application_path).map(|(id, path)| DetectedEditor {
                name: editor.name.to_string(),
                bundle_id: id.to_string(),
                path,
            })
        })
        .collect()
}

#[tauri::command]
pub fn detect_editors() -> Vec<DetectedEditor> {
    detect()
}

#[tauri::command]
pub fn known_editor_names() -> Vec<String> {
    KNOWN_EDITORS.iter().map(|e| e.name.to_string()).collect()
}

/// `openPath` skips its own existence check once an app is named
/// (`tauri-plugin-opener-2.5.4/src/open.rs:56`), which turns a bad path into
/// a silent no-op. Callers stat first through this.
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

#[cfg(test)]
mod tests {
    use super::first_installed;

    /// `KNOWN_EDITORS` currently has no multi-bundle-id entry to exercise
    /// this against, and one must not be added just to cover it — a fake
    /// entry would be exactly the kind of bundle id `editors.rs`'s own
    /// module doc warns against: not read from a real source, indistinguishable
    /// from a real one, and it would ship in the table `detect_editors`
    /// serves to the frontend. `first_installed` isolates the "first id that
    /// resolves wins" precedence from both `KNOWN_EDITORS` and LaunchServices,
    /// so it can be exercised with a fake resolver instead.
    #[test]
    fn first_installed_short_circuits_at_the_first_match() {
        let ids: &[&str] = &["com.example.first", "com.example.second"];
        let mut calls = Vec::new();
        let found = first_installed(ids, |id| {
            calls.push(id.to_string());
            Some(format!("/Applications/{id}.app"))
        });
        assert_eq!(
            found,
            Some(("com.example.first", "/Applications/com.example.first.app".to_string()))
        );
        assert_eq!(
            calls,
            vec!["com.example.first"],
            "resolve was called for an id after the first match; it should have short-circuited"
        );
    }

    /// The complementary case: the first id does not resolve, so the second
    /// one is used and reported under its own bundle id, not the first's.
    #[test]
    fn first_installed_falls_through_to_a_later_id_when_the_first_does_not_resolve() {
        let ids: &[&str] = &["com.example.beta", "com.example.stable"];
        let found = first_installed(ids, |id| {
            if id == "com.example.stable" {
                Some("/Applications/Example.app".to_string())
            } else {
                None
            }
        });
        assert_eq!(found, Some(("com.example.stable", "/Applications/Example.app".to_string())));
    }

    #[test]
    fn first_installed_returns_none_when_nothing_resolves() {
        let ids: &[&str] = &["com.example.beta", "com.example.stable"];
        assert_eq!(first_installed(ids, |_| None), None);
    }
}
