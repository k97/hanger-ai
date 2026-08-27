//! Dev-only Dock icon override.
//!
//! `tauri dev` runs the bare binary out of `target/debug/` rather than an `.app`
//! bundle, so macOS has no Info.plist or Assets.car to read and the Dock falls
//! back to a generic executable icon. Setting the icon on NSApplication at
//! runtime is the only way to give a dev instance its own identity in the Dock
//! and in the ⌘-Tab switcher, which matters when an installed Hanger AI is
//! running alongside it.
//!
//! Rather than embed a flat PNG, this writes a throwaway stub `.app` around the
//! compiled dev icon catalog and asks the system for *its* icon. That hands the
//! rendering to Apple, so the dev icon gets real Liquid Glass and follows the
//! light/dark appearance exactly like the shipped app does. A pre-rendered PNG
//! cannot: icon appearance is resolved by `iconservicesagent` against the live
//! system setting, so a build-time render bakes in whichever appearance the
//! build machine was using, and never changes afterwards.
//!
//! Re-applied on `WindowEvent::ThemeChanged` so the Dock follows the system.
//! Compiled out of release builds entirely — catalog bytes included.

/// The window title for this build.
///
/// The Dock icon below gives a dev instance its own identity in the Dock and
/// in ⌘-Tab. It does nothing for the *window*, and the window is what every
/// capture path actually reads — `screencapture -l<id>`, `kCGWindowName`, the
/// Window menu. On 2026-08-27 a `tauri dev` window and an installed
/// `Hanger AI.app` window were both "Hanger AI" at 1024x700 @244,79, byte
/// for byte, and a session screenshotted the release one, found it blank and
/// reported the dev webview as dead to three other sessions. The release
/// binary is an older build, so its DOM and stylesheet do not come from the
/// working tree at all — a capture of it shows layout no reading of current
/// source can explain, which is indistinguishable from a real defect.
///
/// A suffix on the title costs nothing visually: `titleBarStyle` is
/// `"Overlay"` (`tauri.conf.json`), so the title is never drawn in the window
/// chrome. It surfaces exactly where the confusion happens.
///
/// Takes `is_dev` rather than reading `cfg!` here so both branches are
/// reachable from one test binary; `cargo test` only ever builds debug.
pub fn window_title(is_dev: bool) -> &'static str {
    if is_dev {
        "Hanger AI (dev)"
    } else {
        "Hanger AI"
    }
}

/// Point the Dock tile at the DEV icon, rendered for the current appearance.
///
/// Best-effort: any failure leaves the existing icon alone rather than
/// disturbing startup. A dev Dock icon is never worth failing a launch over.
#[cfg(all(debug_assertions, target_os = "macos"))]
pub fn install() {
    use objc2::rc::Retained;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage, NSWorkspace};
    use objc2_foundation::NSString;

    let Some(mtm) = MainThreadMarker::new() else {
        log::debug!("dev icon: not on the main thread, skipping");
        return;
    };

    let Some(stub) = stub_bundle() else { return };

    // NSWorkspace resolves the catalog through iconservicesagent, which applies
    // the current system appearance. Re-fetching is what makes theme changes
    // take effect, so this must not be cached.
    let path = NSString::from_str(&stub);
    let icon: Retained<NSImage> = NSWorkspace::sharedWorkspace().iconForFile(&path);

    // SAFETY: `mtm` proves we are on the main thread, AppKit's requirement for
    // mutating the shared application. `icon` outlives the call.
    unsafe {
        NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&icon));
    }
    log::debug!("dev icon: Dock icon refreshed from {stub}");
}

/// Materialise a minimal `.app` carrying the dev icon catalog, returning its
/// path. The bundle only has to be well-formed enough for LaunchServices to
/// resolve an icon from it — a stub executable is required or the icon comes
/// back with the "unlaunchable" slash badge over it.
///
/// Keyed by the catalog's length so a regenerated icon lands on a fresh path
/// instead of fighting the per-path icon cache.
#[cfg(all(debug_assertions, target_os = "macos"))]
fn stub_bundle() -> Option<String> {
    use std::fs;
    use std::io::Write;
    use std::os::unix::fs::PermissionsExt;

    const CATALOG: &[u8] = include_bytes!("../icons/dev-Assets.car");

    let root = std::env::temp_dir().join(format!("hanger-dev-icon-{}", CATALOG.len()));
    let app = root.join("Hanger AI Dev.app");
    let contents = app.join("Contents");

    if !contents.join("Resources/Assets.car").exists() {
        fs::create_dir_all(contents.join("Resources")).ok()?;
        fs::create_dir_all(contents.join("MacOS")).ok()?;
        fs::write(contents.join("Resources/Assets.car"), CATALOG).ok()?;
        fs::write(
            contents.join("Info.plist"),
            r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>Hanger AI Dev</string>
<key>CFBundleIdentifier</key><string>com.rkarthik.hanger.dev-icon</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>stub</string>
<key>CFBundleIconName</key><string>AppIcon-Dev</string>
</dict></plist>
"#,
        )
        .ok()?;

        let stub = contents.join("MacOS/stub");
        let mut f = fs::File::create(&stub).ok()?;
        f.write_all(b"#!/bin/sh\nexit 0\n").ok()?;
        fs::set_permissions(&stub, fs::Permissions::from_mode(0o755)).ok()?;
    }

    Some(app.to_string_lossy().into_owned())
}

#[cfg(not(all(debug_assertions, target_os = "macos")))]
pub fn install() {}
