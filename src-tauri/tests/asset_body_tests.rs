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
    assert!(body.modified_ms > 0 && body.modified_ms <= now_ms, "mtime is read at request time");
}

#[test]
fn a_file_that_is_not_text_is_refused_with_the_panel_s_own_words() {
    let dir = fresh_dir("hanger_test_asset_body_binary");
    let doc = dir.join("blob.md");
    fs::write(&doc, [0xff, 0xfe, 0x00, 0x80]).unwrap();
    assert_eq!(asset_body_of(&doc).unwrap_err(), "File is not text");
}
