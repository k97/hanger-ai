//! Which editors this Mac has, and what they are called.
//!
//! Two halves that must stay separate. The TABLE answers "is this an editor,
//! and what is its display name" — no OS metadata can answer that: QuickTime
//! Player declares `public.folder` with `CFBundleTypeRole = Editor`,
//! byte-identical to Visual Studio Code's declaration (measured 2026-08-29).
//! LAUNCHSERVICES answers "is it installed, and where" — 8 lookups in 6.12 ms,
//! no Spotlight dependency, `None` for a miss.
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

/// Seeded with the six identifiers read from each app's own
/// `Bundle.bundleIdentifier` on this machine, 2026-08-29. **Every further
/// entry must come from a source you read** — a vendor `Info.plist`, a
/// vendor `product.json`, or GitHub Desktop's `app/src/lib/editors/darwin.ts`
/// (50 macOS editors, MIT). Never write a bundle id from memory: a wrong one
/// is indistinguishable from "not installed" (`tree-facts.md` §9), so it
/// fails silently and no test goes red.
///
/// Terminal editors are deliberately absent — see
/// `table_excludes_terminal_only_editors`.
pub const KNOWN_EDITORS: &[KnownEditor] = &[
    KnownEditor { name: "Visual Studio Code", bundle_ids: &["com.microsoft.VSCode"] },
    KnownEditor { name: "Cursor",             bundle_ids: &["com.todesktop.230313mzl4w4u92"] },
    KnownEditor { name: "Zed",                bundle_ids: &["dev.zed.Zed"] },
    KnownEditor { name: "Antigravity IDE",    bundle_ids: &["com.google.antigravity-ide"] },
    KnownEditor { name: "Xcode",              bundle_ids: &["com.apple.dt.Xcode"] },
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

    let workspace = unsafe { NSWorkspace::sharedWorkspace() };
    let identifier = NSString::from_str(bundle_id);
    let url = unsafe { workspace.URLForApplicationWithBundleIdentifier(&identifier) }?;
    let path = unsafe { url.path() }?;
    Some(path.to_string())
}

#[cfg(not(target_os = "macos"))]
fn application_path(_bundle_id: &str) -> Option<String> {
    None
}

/// The table intersected with what is installed. First bundle id that
/// resolves wins, so an editor listing several channels reports once.
pub fn detect() -> Vec<DetectedEditor> {
    KNOWN_EDITORS
        .iter()
        .filter_map(|editor| {
            editor.bundle_ids.iter().find_map(|id| {
                application_path(id).map(|path| DetectedEditor {
                    name: editor.name.to_string(),
                    bundle_id: (*id).to_string(),
                    path,
                })
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
