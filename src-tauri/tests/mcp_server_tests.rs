//! Hanger's own MCP server: where it finds Hanger's folders.

use std::path::{Path, PathBuf};

use tauri_app_lib::mcp::switch::ops::SwitchPlaces;
use tauri_app_lib::mcp_server::places::{data_dir_for, server_places_at, BUNDLE_ID};
use tauri_app_lib::skill_switch::ops::SkillPlaces;

const DATA: &str = "/h/Library/Application Support/com.rkarthik.hanger";

#[test]
fn the_bundle_id_is_tauri_confs_identifier() {
    let conf: serde_json::Value = serde_json::from_str(
        &std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/tauri.conf.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(conf["identifier"], BUNDLE_ID);
}

#[test]
fn the_data_dir_is_application_support_under_the_bundle_id() {
    assert_eq!(data_dir_for(Path::new("/h")), PathBuf::from(DATA));
}

#[test]
fn switch_places_under_a_data_dir_match_the_apps_spelling() {
    let p = SwitchPlaces::under(PathBuf::from("/h"), PathBuf::from("/"), Path::new(DATA));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.system, PathBuf::from("/"));
    assert_eq!(p.backups, PathBuf::from(format!("{DATA}/switch/backups")));
    assert_eq!(p.stash, PathBuf::from(format!("{DATA}/switch/stash")));
}

#[test]
fn skill_places_under_a_data_dir_match_the_apps_spelling() {
    let p = SkillPlaces::under(PathBuf::from("/h"), Path::new(DATA));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.store, PathBuf::from("/h/.agents/skills"));
    assert_eq!(p.keep, PathBuf::from(format!("{DATA}/kept/skills")));
    assert_eq!(p.db_path, PathBuf::from(format!("{DATA}/hanger.db")));
}

#[test]
fn server_places_put_everything_under_the_home_and_the_given_system_root() {
    let p = server_places_at(Path::new("/h"), Path::new("/sys"));
    assert_eq!(p.home, PathBuf::from("/h"));
    assert_eq!(p.db_path, PathBuf::from(format!("{DATA}/hanger.db")));
    assert_eq!(p.switch.system, PathBuf::from("/sys"));
    assert_eq!(p.switch.backups, PathBuf::from(format!("{DATA}/switch/backups")));
    assert_eq!(p.skills.db_path, p.db_path);
}
