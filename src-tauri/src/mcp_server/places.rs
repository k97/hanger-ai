//! Where Hanger keeps its own files, spelled once for the app and its server.
//!
//! The app asks Tauri for its data directory; the server runs before Tauri
//! starts and has no `AppHandle`, so it spells the macOS path itself from the
//! bundle id. `mcp_server_tests.rs` pins the id against `tauri.conf.json`.

use std::path::{Path, PathBuf};

use crate::mcp::switch::ops::SwitchPlaces;
use crate::skill_switch::ops::SkillPlaces;

/// `tauri.conf.json`'s `identifier`.
pub const BUNDLE_ID: &str = "com.rkarthik.hanger";

/// Hanger's data directory on macOS: `<home>/Library/Application Support/<BUNDLE_ID>`.
pub fn data_dir_for(home: &Path) -> PathBuf {
    home.join("Library").join("Application Support").join(BUNDLE_ID)
}

/// Every place the server reads.
#[derive(Debug, Clone)]
pub struct ServerPlaces {
    pub home: PathBuf,
    pub db_path: PathBuf,
    pub switch: SwitchPlaces,
    pub skills: SkillPlaces,
}

/// The places under `home`, reading system-wide config under `system`. A
/// parameter so that tests never read the real `/Library`.
pub fn server_places_at(home: &Path, system: &Path) -> ServerPlaces {
    let data_dir = data_dir_for(home);
    let skills = SkillPlaces::under(home.to_path_buf(), &data_dir);
    ServerPlaces {
        home: home.to_path_buf(),
        db_path: skills.db_path.clone(),
        switch: SwitchPlaces::under(home.to_path_buf(), system.to_path_buf(), &data_dir),
        skills,
    }
}

/// The places under `home`, reading system-wide config under `/`.
pub fn server_places(home: &Path) -> ServerPlaces {
    server_places_at(home, Path::new("/"))
}
