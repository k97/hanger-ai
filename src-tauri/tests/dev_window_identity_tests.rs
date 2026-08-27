//! A dev window must name itself, or a capture cannot say which build it came
//! from.
//!
//! `tauri dev` runs the bare binary while an installed `Hanger AI.app` may be
//! running beside it — `src/dev_icon.rs` exists for exactly that case and
//! solved it for the Dock tile and ⌘-Tab. It left the *window* identical:
//! same title, same size, and on 2026-08-27 the same bounds to the pixel
//! (1024x700 @244,79 for both). Every capture path reads the window, not the
//! Dock: `screencapture -l<id>`, `kCGWindowName`, the Window menu. So a
//! screenshot of the release build is indistinguishable from one of the dev
//! build, while its DOM and stylesheet come from an older commit — it shows
//! layout no reading of the working tree can explain. That cost four sessions
//! an evening and produced a wrong "the dev webview is dead" report.
//!
//! `window_title` takes `is_dev` rather than reading `cfg!` inside, so both
//! branches are reachable from one test binary. Gating on `cfg` internally
//! would leave the release branch unexecuted by `cargo test`, which only ever
//! builds debug.

use tauri_app_lib::dev_icon::window_title;

#[test]
fn a_dev_build_marks_its_window_and_a_release_build_does_not() {
    assert_eq!(window_title(false), "Hanger AI");
    assert_ne!(
        window_title(true),
        window_title(false),
        "dev and release must not share a window title -- that identity is the \
         only thing distinguishing two windows at identical bounds"
    );
    assert!(
        window_title(true).contains("dev"),
        "the dev suffix has to be legible to a human reading a CGWindowList \
         row or a Window menu, not just different: {}",
        window_title(true)
    );
}

/// The release title is also declared in `tauri.conf.json`, which is what the
/// window is born with. If the two drift, a release build would rename itself
/// at startup for no reason -- and this test is the only thing reading both.
#[test]
fn the_release_title_matches_the_one_tauri_conf_declares() {
    let conf = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json"))
        .expect("tauri.conf.json must be readable from the crate root");
    let parsed: serde_json::Value = serde_json::from_str(&conf).expect("tauri.conf.json must parse");
    let declared = parsed["app"]["windows"][0]["title"]
        .as_str()
        .expect("tauri.conf.json must declare app.windows[0].title");
    assert_eq!(
        declared,
        window_title(false),
        "tauri.conf.json's title and the release branch of window_title have drifted"
    );
}
