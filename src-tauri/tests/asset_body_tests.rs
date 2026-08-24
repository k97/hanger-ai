//! `asset_body_of`: the inspector's document read, with the figures the
//! Size row and the Context line render. Every figure is the backend's.

use std::fs;
use tauri_app_lib::asset_body_of;

fn fresh_dir(name: &str) -> std::path::PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

#[test]
fn a_document_read_carries_bytes_lines_mtime_and_a_token_estimate() {
    let dir = fresh_dir("hanger_test_asset_body");
    let doc = dir.join("SKILL.md");
    // 8 ASCII bytes + newline + 3 bytes + newline = 13 bytes, 3 lines by split('\n').
    fs::write(&doc, "---\nx: 1\n---\n").unwrap();

    let body = asset_body_of(&doc).expect("a readable UTF-8 file");
    assert_eq!(body.path, doc.to_string_lossy());
    assert_eq!(body.text, "---\nx: 1\n---\n");
    assert_eq!(body.bytes, 13);
    assert_eq!(body.lines, 4, "split('\\n') counts the trailing newline as an empty last line, as the panel always has");
    assert_eq!(body.estimated_tokens, 3, "13 / 4, integer division");
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap().as_millis() as i64;
    let modified_ms = body.modified_ms.expect("a freshly written file has a real mtime");
    assert!(modified_ms > 0 && modified_ms <= now_ms, "mtime is read at request time");
}

/// A file whose mtime cannot be expressed as milliseconds since the epoch —
/// here, a real mtime set before 1970, which `duration_since(UNIX_EPOCH)`
/// refuses — must report `None`, not a fabricated epoch date. `unwrap_or(0)`
/// used to render this identically to a file genuinely last touched at
/// midnight UTC, January 1 1970: the frontend has no way to tell "no mtime"
/// from "mtime is exactly zero".
#[test]
fn a_document_whose_mtime_cannot_be_read_reports_none_not_a_fabricated_epoch() {
    let dir = fresh_dir("hanger_test_asset_body_no_mtime");
    let doc = dir.join("SKILL.md");
    fs::write(&doc, "x").unwrap();

    let before_epoch = std::time::UNIX_EPOCH - std::time::Duration::from_secs(3600);
    let file = fs::File::options().write(true).open(&doc).unwrap();
    let times = fs::FileTimes::new().set_modified(before_epoch);
    file.set_times(times).expect("this filesystem accepts a pre-epoch mtime");

    let body = asset_body_of(&doc).expect("a readable UTF-8 file");
    assert_eq!(body.modified_ms, None, "no epoch date is invented when the real mtime can't be expressed since UNIX_EPOCH");
}

#[test]
fn a_file_that_is_not_text_is_refused_with_the_panel_s_own_words() {
    let dir = fresh_dir("hanger_test_asset_body_binary");
    let doc = dir.join("blob.md");
    fs::write(&doc, [0xff, 0xfe, 0x00, 0x80]).unwrap();
    assert_eq!(asset_body_of(&doc).unwrap_err(), "File is not text");
}
