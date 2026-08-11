use rusqlite::{params, Connection, OptionalExtension};
use std::fs;
use std::path::{Path, PathBuf};

pub struct SanitisedError(pub String);

impl std::fmt::Debug for SanitisedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "SanitisedError({:?})", sanitise_msg(&self.0))
    }
}

impl std::fmt::Display for SanitisedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", sanitise_msg(&self.0))
    }
}

impl std::error::Error for SanitisedError {}

/// Path sanitisation helper to prevent path disclosure in errors or logs
pub fn sanitise_path(path: &str) -> String {
    if let Ok(home_val) = std::env::var("HOME") {
        if !home_val.is_empty() && path.starts_with(&home_val) {
            return path.replace(&home_val, "~");
        }
    }
    if let Ok(user_profile) = std::env::var("USERPROFILE") {
        if !user_profile.is_empty() && path.starts_with(&user_profile) {
            return path.replace(&user_profile, "~");
        }
    }
    if let Some(filename) = std::path::Path::new(path).file_name() {
        return format!("<sanitised>/{}", filename.to_string_lossy());
    }
    "<sanitised-path>".to_string()
}

pub fn sanitise_msg(msg: &str) -> String {
    let mut s = msg.to_string();

    if let Ok(home_val) = std::env::var("HOME") {
        if !home_val.is_empty() {
            s = s.replace(&home_val, "~");
        }
    }
    if let Ok(profile_val) = std::env::var("USERPROFILE") {
        if !profile_val.is_empty() {
            s = s.replace(&profile_val, "~");
        }
    }

    let words: Vec<String> = s.split(' ').map(|word| {
        let cleaned = word.trim_matches(|c| c == '(' || c == ')' || c == '[' || c == ']' || c == '"' || c == '\'' || c == '`');
        if cleaned.starts_with('/') || cleaned.contains('\\') || cleaned.contains("tests/fixtures") {
            if let Some(filename) = Path::new(cleaned).file_name() {
                let sanitised = format!("<sanitised>/{}", filename.to_string_lossy());
                word.replace(cleaned, &sanitised)
            } else {
                word.to_string()
            }
        } else {
            word.to_string()
        }
    }).collect();
    s = words.join(" ");

    let words: Vec<String> = s.split(' ').map(|word| {
        if word.contains("gho_") {
            "<redacted-github-token>".to_string()
        } else if word.to_lowercase().contains("password=") || word.to_lowercase().contains("api_key=") || word.to_lowercase().contains("token=") {
            if let Some(pos) = word.find('=') {
                format!("{}=<redacted-secret>", &word[..pos])
            } else {
                "<redacted-secret>".to_string()
            }
        } else {
            word.to_string()
        }
    }).collect();
    s = words.join(" ");

    s
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ExportData {
    pub version: u32,
    pub classifications: Vec<ClassificationRow>,
    pub rules_target_memory: Vec<RulesTargetMemoryRow>,
    pub deploy_checksums: Vec<DeployChecksumRow>,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ClassificationRow {
    pub file_path: String,
    pub category: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct RulesTargetMemoryRow {
    pub project_path: String,
    pub rule_path: String,
    pub target_file: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct DeployChecksumRow {
    pub source_path: String,
    pub destination_path: String,
    pub blake3_hash: String,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct EngineRow {
    pub id: i64,
    pub key: String,
    pub display_name: String,
    pub config_root: String,
    pub detected_at: i64,
}

pub struct PreferencesStore {
    db_path: PathBuf,
}

#[allow(dead_code)]
impl PreferencesStore {
    pub fn new(db_path: &Path) -> Result<Self, SanitisedError> {
        let store = Self {
            db_path: db_path.to_path_buf(),
        };
        store.init_db()?;
        Ok(store)
    }

    pub fn connect(&self) -> Result<Connection, SanitisedError> {
        if let Some(parent) = self.db_path.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                SanitisedError("Failed to create database directory".to_string())
            })?;
        }
        let conn = Connection::open(&self.db_path).map_err(|_| {
            SanitisedError("Database connection failed".to_string())
        })?;
        conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|_| {
            SanitisedError("Failed to enable foreign keys".to_string())
        })?;
        Ok(conn)
    }

    fn init_db(&self) -> Result<(), SanitisedError> {
        let mut conn = self.connect()?;
        conn.execute(
            "CREATE TABLE IF NOT EXISTS linked_directories (
                path TEXT PRIMARY KEY,
                added_at INTEGER NOT NULL
            );",
            [],
        ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );",
            [],
        ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS rules_target_memory (
                project_path TEXT NOT NULL,
                rule_path TEXT NOT NULL,
                target_file TEXT NOT NULL,
                PRIMARY KEY (project_path, rule_path)
            );",
            [],
        ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS asset_classifications (
                file_path TEXT PRIMARY KEY,
                category TEXT NOT NULL
            );",
            [],
        ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS deploy_checksums (
                source_path TEXT NOT NULL,
                destination_path TEXT NOT NULL,
                blake3_hash TEXT NOT NULL,
                PRIMARY KEY (source_path, destination_path)
            );",
            [],
        ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

        // Schema versioning & migration to v1
        let current_version: i32 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .map_err(|_| SanitisedError("Failed to query database schema version".to_string()))?;

        if current_version < 1 {
            let tx = conn.transaction().map_err(|_| {
                SanitisedError("Failed to start database migration transaction".to_string())
            })?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS engines (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    key TEXT UNIQUE NOT NULL,
                    display_name TEXT NOT NULL,
                    config_root TEXT NOT NULL,
                    detected_at INTEGER NOT NULL
                );",
                [],
            ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS roots (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    kind TEXT NOT NULL,
                    abs_path TEXT UNIQUE NOT NULL,
                    engine_id INTEGER REFERENCES engines(id),
                    label TEXT NOT NULL,
                    added_at INTEGER NOT NULL
                );",
                [],
            ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    root_id INTEGER NOT NULL REFERENCES roots(id),
                    engine_id INTEGER REFERENCES engines(id),
                    category TEXT NOT NULL,
                    scope TEXT NOT NULL,
                    name TEXT NOT NULL,
                    abs_path TEXT NOT NULL,
                    version TEXT,
                    content_hash TEXT,
                    parse_status TEXT NOT NULL,
                    parse_error TEXT,
                    first_seen INTEGER NOT NULL,
                    last_seen INTEGER NOT NULL
                );",
                [],
            ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

            tx.execute(
                "CREATE TABLE IF NOT EXISTS links (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    asset_id INTEGER NOT NULL REFERENCES assets(id),
                    dest_root_id INTEGER NOT NULL REFERENCES roots(id),
                    dest_path TEXT NOT NULL,
                    mechanism TEXT NOT NULL,
                    source_hash TEXT NOT NULL,
                    dest_hash TEXT,
                    created_at INTEGER NOT NULL,
                    last_verified_at INTEGER
                );",
                [],
            ).map_err(|_| SanitisedError("Database initialisation failed".to_string()))?;

            // Migrate pre-existing linked_directories into roots table with clean directory labels
            let mut stmt = tx
                .prepare("SELECT path, added_at FROM linked_directories")
                .map_err(|_| SanitisedError("Database query failed during migration".to_string()))?;
            let rows = stmt
                .query_map([], |row| {
                    Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
                })
                .map_err(|_| SanitisedError("Database query failed during migration".to_string()))?;

            let mut legacy_dirs = Vec::new();
            for r in rows.flatten() {
                legacy_dirs.push(r);
            }
            drop(stmt);

            for (path, added_at) in legacy_dirs {
                let label = Path::new(&path)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(&path)
                    .to_string();

                tx.execute(
                    "INSERT OR IGNORE INTO roots (kind, abs_path, engine_id, label, added_at)
                     VALUES ('project', ?1, NULL, ?2, ?3);",
                    params![path, label, added_at],
                ).map_err(|_| SanitisedError("Database migration failed".to_string()))?;
            }

            tx.execute_batch("PRAGMA user_version = 1;")
                .map_err(|_| SanitisedError("Failed to set user_version".to_string()))?;

            tx.commit().map_err(|_| {
                SanitisedError("Failed to commit database migration transaction".to_string())
            })?;
        }

        Ok(())
    }

    pub fn link_directory(&self, path: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let label = Path::new(path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(path)
            .to_string();

        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES ('project', ?1, NULL, ?2, ?3)
             ON CONFLICT(abs_path) DO UPDATE SET label = excluded.label",
            params![path, label, now],
        ).map_err(|_| {
            SanitisedError("Failed to link directory in roots table".to_string())
        })?;

        Ok(())
    }

    pub fn unlink_directory(&self, path: &str) -> Result<(), SanitisedError> {
        let mut conn = self.connect()?;
        let tx = conn.transaction().map_err(|_| {
            SanitisedError("Failed to start transaction for unlinking directory".to_string())
        })?;

        tx.execute(
            "DELETE FROM assets WHERE root_id = (SELECT id FROM roots WHERE abs_path = ?1 AND kind = 'project')",
            params![path],
        ).map_err(|_| {
            SanitisedError("Failed to delete assets for directory".to_string())
        })?;

        tx.execute(
            "DELETE FROM roots WHERE abs_path = ?1 AND kind = 'project'",
            params![path],
        ).map_err(|_| {
            SanitisedError("Failed to unlink directory in roots table".to_string())
        })?;

        tx.commit().map_err(|_| {
            SanitisedError("Failed to commit transaction for unlinking directory".to_string())
        })?;

        Ok(())
    }

    pub fn get_linked_directories(&self) -> Result<Vec<String>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT abs_path FROM roots WHERE kind = 'project' ORDER BY added_at ASC")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let rows = stmt
            .query_map([], |row| row.get(0))
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        let mut dirs = Vec::new();
        for path in rows.flatten() {
            dirs.push(path);
        }
        Ok(dirs)
    }

    pub fn set_preference(&self, key: &str, value: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO preferences (key, value) VALUES (?1, ?2)",
            params![key, value],
        ).map_err(|_| {
            SanitisedError("Failed to write preference".to_string())
        })?;
        Ok(())
    }

    pub fn get_preference(&self, key: &str) -> Result<Option<String>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT value FROM preferences WHERE key = ?1")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut rows = stmt
            .query_map(params![key], |row| row.get(0))
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        if let Some(r) = rows.next() {
            let val = r.map_err(|_| SanitisedError("Database fetch failed".to_string()))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set_rules_target_memory(&self, project_path: &str, rule_path: &str, target_file: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO rules_target_memory (project_path, rule_path, target_file) VALUES (?1, ?2, ?3)",
            params![project_path, rule_path, target_file],
        ).map_err(|_| {
            SanitisedError("Failed to write rules target memory".to_string())
        })?;
        Ok(())
    }

    pub fn get_rules_target_memory(&self, project_path: &str, rule_path: &str) -> Result<Option<String>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT target_file FROM rules_target_memory WHERE project_path = ?1 AND rule_path = ?2")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut rows = stmt
            .query_map(params![project_path, rule_path], |row| row.get(0))
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        if let Some(r) = rows.next() {
            let val = r.map_err(|_| SanitisedError("Database fetch failed".to_string()))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set_asset_classification(&self, file_path: &str, category: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO asset_classifications (file_path, category) VALUES (?1, ?2)",
            params![file_path, category],
        ).map_err(|_| {
            SanitisedError("Failed to write asset classification".to_string())
        })?;
        Ok(())
    }

    pub fn get_asset_classification(&self, file_path: &str) -> Result<Option<String>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT category FROM asset_classifications WHERE file_path = ?1")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut rows = stmt
            .query_map(params![file_path], |row| row.get(0))
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        if let Some(r) = rows.next() {
            let val = r.map_err(|_| SanitisedError("Database fetch failed".to_string()))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn export_store(&self, export_path: &Path) -> Result<(), SanitisedError> {
        let conn = self.connect()?;

        let mut stmt = conn
            .prepare("SELECT file_path, category FROM asset_classifications")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let class_rows = stmt
            .query_map([], |row| {
                Ok(ClassificationRow {
                    file_path: row.get(0)?,
                    category: row.get(1)?,
                })
            })
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut classifications = Vec::new();
        for r in class_rows.flatten() {
            classifications.push(r);
        }
        drop(stmt);

        let mut stmt = conn
            .prepare("SELECT project_path, rule_path, target_file FROM rules_target_memory")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mem_rows = stmt
            .query_map([], |row| {
                Ok(RulesTargetMemoryRow {
                    project_path: row.get(0)?,
                    rule_path: row.get(1)?,
                    target_file: row.get(2)?,
                })
            })
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut rules_target_memory = Vec::new();
        for r in mem_rows.flatten() {
            rules_target_memory.push(r);
        }
        drop(stmt);

        let mut stmt = conn
            .prepare("SELECT source_path, destination_path, blake3_hash FROM deploy_checksums")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let check_rows = stmt
            .query_map([], |row| {
                Ok(DeployChecksumRow {
                    source_path: row.get(0)?,
                    destination_path: row.get(1)?,
                    blake3_hash: row.get(2)?,
                })
            })
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut deploy_checksums = Vec::new();
        for r in check_rows.flatten() {
            deploy_checksums.push(r);
        }
        drop(stmt);

        let export_data = ExportData {
            version: 1,
            classifications,
            rules_target_memory,
            deploy_checksums,
        };

        if let Some(parent) = export_path.parent() {
            fs::create_dir_all(parent).map_err(|_| {
                SanitisedError("Failed to create export directory".to_string())
            })?;
        }

        let json = serde_json::to_string_pretty(&export_data).map_err(|_| {
            SanitisedError("Failed to serialize store".to_string())
        })?;

        fs::write(export_path, json).map_err(|_| {
            SanitisedError("Failed to write export file".to_string())
        })?;

        Ok(())
    }

    pub fn import_store(&self, import_path: &Path) -> Result<(), SanitisedError> {
        if !import_path.exists() {
            return Err(SanitisedError("Import path does not exist".to_string()));
        }

        let json_content = fs::read_to_string(import_path).map_err(|_| {
            SanitisedError("Failed to read import file".to_string())
        })?;

        let data: ExportData = serde_json::from_str(&json_content).map_err(|_| {
            SanitisedError("Invalid import file schema or version".to_string())
        })?;

        if data.version != 1 {
            return Err(SanitisedError(format!("Unsupported schema version: {}", data.version)));
        }

        let db_path = &self.db_path;
        let backup_path = db_path.with_extension("db.bak");
        let temp_path = db_path.with_extension("db.tmp");

        if db_path.exists() {
            fs::copy(db_path, &backup_path).map_err(|_| {
                SanitisedError("Failed to create database backup".to_string())
            })?;
        }

        if db_path.exists() {
            fs::copy(db_path, &temp_path).map_err(|_| {
                SanitisedError("Failed to create temporary database copy".to_string())
            })?;
        } else {
            let _conn = Connection::open(&temp_path).map_err(|_| {
                SanitisedError("Failed to create temporary database connection".to_string())
            })?;
        }

        let apply_res = (|| -> Result<(), rusqlite::Error> {
            let mut temp_conn = Connection::open(&temp_path)?;
            
            // Re-initialize tables in temp DB to be absolutely sure they exist
            temp_conn.execute(
                "CREATE TABLE IF NOT EXISTS asset_classifications (
                    file_path TEXT PRIMARY KEY,
                    category TEXT NOT NULL
                )",
                [],
            )?;
            temp_conn.execute(
                "CREATE TABLE IF NOT EXISTS rules_target_memory (
                    project_path TEXT NOT NULL,
                    rule_path TEXT NOT NULL,
                    target_file TEXT NOT NULL,
                    PRIMARY KEY (project_path, rule_path)
                )",
                [],
            )?;
            temp_conn.execute(
                "CREATE TABLE IF NOT EXISTS deploy_checksums (
                    source_path TEXT NOT NULL,
                    destination_path TEXT NOT NULL,
                    blake3_hash TEXT NOT NULL,
                    PRIMARY KEY (source_path, destination_path)
                )",
                [],
            )?;

            let tx = temp_conn.transaction()?;

            tx.execute("DELETE FROM asset_classifications", [])?;
            tx.execute("DELETE FROM rules_target_memory", [])?;
            tx.execute("DELETE FROM deploy_checksums", [])?;

            let mut stmt = tx.prepare("INSERT INTO asset_classifications (file_path, category) VALUES (?1, ?2)")?;
            for row in &data.classifications {
                stmt.execute(params![row.file_path, row.category])?;
            }
            drop(stmt);

            let mut stmt = tx.prepare("INSERT INTO rules_target_memory (project_path, rule_path, target_file) VALUES (?1, ?2, ?3)")?;
            for row in &data.rules_target_memory {
                stmt.execute(params![row.project_path, row.rule_path, row.target_file])?;
            }
            drop(stmt);

            let mut stmt = tx.prepare("INSERT INTO deploy_checksums (source_path, destination_path, blake3_hash) VALUES (?1, ?2, ?3)")?;
            for row in &data.deploy_checksums {
                stmt.execute(params![row.source_path, row.destination_path, row.blake3_hash])?;
            }
            drop(stmt);

            tx.commit()?;
            Ok(())
        })();

        if apply_res.is_err() {
            if temp_path.exists() {
                let _ = fs::remove_file(&temp_path);
            }
            return Err(SanitisedError("Import transaction failed".to_string()));
        }

        let val_res = (|| -> Result<(), rusqlite::Error> {
            let temp_conn = Connection::open(&temp_path)?;
            temp_conn.pragma_query(None, "integrity_check", |_| Ok(()))?;
            Ok(())
        })();

        if val_res.is_err() {
            if temp_path.exists() {
                let _ = fs::remove_file(&temp_path);
            }
            return Err(SanitisedError("Database integrity check failed".to_string()));
        }

        if fs::rename(&temp_path, db_path).is_err() {
            if temp_path.exists() {
                let _ = fs::remove_file(&temp_path);
            }
            if backup_path.exists() {
                let _ = fs::copy(&backup_path, db_path);
            }
            return Err(SanitisedError("Failed to replace database file".to_string()));
        }

        if backup_path.exists() {
            let _ = fs::remove_file(&backup_path);
        }

        Ok(())
    }

    pub fn set_deploy_checksum(&self, source_path: &str, destination_path: &str, hash: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT OR REPLACE INTO deploy_checksums (source_path, destination_path, blake3_hash) VALUES (?1, ?2, ?3)",
            params![source_path, destination_path, hash],
        ).map_err(|_| {
            SanitisedError("Failed to write deploy checksum".to_string())
        })?;
        Ok(())
    }

    pub fn get_deploy_checksum(&self, source_path: &str, destination_path: &str) -> Result<Option<String>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn
            .prepare("SELECT blake3_hash FROM deploy_checksums WHERE source_path = ?1 AND destination_path = ?2")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let mut rows = stmt
            .query_map(params![source_path, destination_path], |row| row.get(0))
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        if let Some(r) = rows.next() {
            let val = r.map_err(|_| SanitisedError("Database fetch failed".to_string()))?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn get_all_deploy_checksums(&self) -> Result<Vec<(String, String, String)>, SanitisedError> {
        let conn = self.connect()?;
        let mut fn_stmt = conn
            .prepare("SELECT source_path, destination_path, blake3_hash FROM deploy_checksums")
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;
        let rows = fn_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|_| SanitisedError("Database query failed".to_string()))?;

        let mut checksums = Vec::new();
        for r in rows.flatten() {
            checksums.push(r);
        }
        Ok(checksums)
    }

    pub fn remove_deploy_checksum(&self, destination_path: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM deploy_checksums WHERE destination_path = ?1",
            params![destination_path],
        ).map_err(|_| {
            SanitisedError("Failed to delete deploy checksum record".to_string())
        })?;
        Ok(())
    }

    pub fn clear_rules_target_memory(&self, project_path: &str, rule_path: &str) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "DELETE FROM rules_target_memory WHERE project_path = ?1 AND rule_path = ?2",
            params![project_path, rule_path],
        ).map_err(|_| {
            SanitisedError("Failed to clear rules memory".to_string())
        })?;
        Ok(())
    }

    pub fn upsert_engine(&self, key: &str, display_name: &str, config_root: &str, detected_at: i64) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO engines (key, display_name, config_root, detected_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET
               display_name = excluded.display_name,
               config_root = excluded.config_root,
               detected_at = excluded.detected_at;",
            params![key, display_name, config_root, detected_at],
        ).map_err(|_| SanitisedError("Failed to upsert engine".to_string()))?;

        let id: i64 = conn.query_row(
            "SELECT id FROM engines WHERE key = ?1",
            params![key],
            |r| r.get(0),
        ).map_err(|_| SanitisedError("Failed to query engine ID".to_string()))?;

        Ok(id)
    }

    pub fn get_engines(&self) -> Result<Vec<EngineRow>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare("SELECT id, key, display_name, config_root, detected_at FROM engines")
            .map_err(|_| SanitisedError("Failed to prepare engine query".to_string()))?;
        let rows = stmt.query_map([], |row| {
            Ok(EngineRow {
                id: row.get(0)?,
                key: row.get(1)?,
                display_name: row.get(2)?,
                config_root: row.get(3)?,
                detected_at: row.get(4)?,
            })
        }).map_err(|_| SanitisedError("Failed to query engines".to_string()))?;

        let mut engines = Vec::new();
        for r in rows.flatten() {
            engines.push(r);
        }
        Ok(engines)
    }

    pub fn count_assets_by_category(&self, category: &str) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM assets WHERE category = ?1",
                params![category],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(count)
    }

    pub fn count_assets_by_parse_status(&self, parse_status: &str) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM assets WHERE parse_status = ?1",
                params![parse_status],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok(count)
    }

    pub fn upsert_root(&self, kind: &str, abs_path: &str, engine_id: Option<i64>, label: &str, added_at: i64) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(abs_path) DO UPDATE SET
               kind = excluded.kind,
               engine_id = excluded.engine_id,
               label = excluded.label,
               added_at = excluded.added_at;",
            params![kind, abs_path, engine_id, label, added_at],
        ).map_err(|_| SanitisedError("Failed to upsert root".to_string()))?;

        let id: i64 = conn.query_row(
            "SELECT id FROM roots WHERE abs_path = ?1",
            params![abs_path],
            |r| r.get(0),
        ).map_err(|_| SanitisedError("Failed to query root ID".to_string()))?;

        Ok(id)
    }

pub fn resolve_deepest_root(asset_path: &Path, project_roots: &[(i64, String)]) -> Option<i64> {
    let mut best: Option<(i64, usize)> = None;

    for (id, root_path_str) in project_roots {
        let root_path = Path::new(root_path_str);
        if asset_path.starts_with(root_path) {
            let component_count = root_path.components().count();
            match best {
                Some((_, max_count)) if component_count > max_count => {
                    best = Some((*id, component_count));
                }
                None => {
                    best = Some((*id, component_count));
                }
                _ => {}
            }
        }
    }

    best.map(|(id, _)| id)
}

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_asset(
        &self,
        root_id: i64,
        engine_id: Option<i64>,
        category: &str,
        scope: &str,
        name: &str,
        abs_path: &str,
        version: Option<&str>,
        content_hash: Option<&str>,
        parse_status: &str,
        parse_error: Option<&str>,
        first_seen: i64,
        last_seen: i64,
    ) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;

        let canonical_abs_path = if scope == "global" {
            let (file_part, suffix) = abs_path.split_once(':').unwrap_or((abs_path, ""));
            let canon_file = match fs::canonicalize(Path::new(file_part)) {
                Ok(p) => {
                    let s = p.to_string_lossy().to_string();
                    if s.starts_with("/private/") && !file_part.starts_with("/private/") {
                        s.strip_prefix("/private").unwrap_or(&s).to_string()
                    } else {
                        s
                    }
                }
                Err(e) => {
                    eprintln!("[HANGER WARNING] Failed to canonicalize global asset path {}: {}", file_part, e);
                    file_part.to_string()
                }
            };
            if suffix.is_empty() {
                canon_file
            } else {
                format!("{}:{}", canon_file, suffix)
            }
        } else {
            abs_path.to_string()
        };

        let project_roots: Vec<(i64, String)> = {
            let mut stmt = conn
                .prepare("SELECT id, abs_path FROM roots WHERE kind = 'project'")
                .map_err(|_| SanitisedError("Failed to prepare roots query".to_string()))?;
            let rows = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(|_| SanitisedError("Failed to query roots".to_string()))?;
            let mut res = Vec::new();
            for pair in rows.flatten() {
                res.push(pair);
            }
            res
        };

        let effective_root_id = if scope == "project" {
            Self::resolve_deepest_root(Path::new(&canonical_abs_path), &project_roots)
                .unwrap_or(root_id)
        } else {
            root_id
        };

        let existing: Option<(i64, Option<i64>)> = conn
            .query_row(
                "SELECT id, engine_id FROM assets WHERE abs_path = ?1",
                params![canonical_abs_path],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()
            .map_err(|_| SanitisedError("Failed to query existing asset".to_string()))?;

        if let Some((existing_id, existing_engine_id)) = existing {
            let new_engine_id = if existing_engine_id != engine_id {
                None
            } else {
                existing_engine_id
            };

            conn.execute(
                "UPDATE assets SET root_id = ?1, engine_id = ?2, parse_status = ?3, parse_error = ?4, last_seen = ?5 WHERE id = ?6",
                params![effective_root_id, new_engine_id, parse_status, parse_error, last_seen, existing_id],
            ).map_err(|_| SanitisedError("Failed to update existing asset row".to_string()))?;

            Ok(existing_id)
        } else {
            conn.execute(
                "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, version, content_hash, parse_status, parse_error, first_seen, last_seen)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![effective_root_id, engine_id, category, scope, name, canonical_abs_path, version, content_hash, parse_status, parse_error, first_seen, last_seen],
            ).map_err(|_| SanitisedError("Failed to insert asset row".to_string()))?;

            let id = conn.last_insert_rowid();
            Ok(id)
        }
    }

    pub fn reap_stale_assets(&self, root_id: i64, scan_start_time: i64) -> Result<usize, SanitisedError> {
        let enabled = std::env::var("HANGER_ENABLE_REAP")
            .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if !enabled {
            return Ok(0);
        }
        let conn = self.connect()?;
        let reaped = conn
            .execute(
                "DELETE FROM assets WHERE root_id = ?1 AND last_seen < ?2",
                params![root_id, scan_start_time],
            )
            .map_err(|_| SanitisedError("Failed to reap stale assets".to_string()))?;
        Ok(reaped)
    }

    pub fn count_assets_by_engine_null(&self, is_null: bool) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        let query = if is_null {
            "SELECT COUNT(*) FROM assets WHERE engine_id IS NULL"
        } else {
            "SELECT COUNT(*) FROM assets WHERE engine_id IS NOT NULL"
        };
        let count: i64 = conn.query_row(query, [], |r| r.get(0)).unwrap_or(0);
        Ok(count)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn upsert_link(
        &self,
        asset_id: i64,
        dest_root_id: i64,
        dest_path: &str,
        mechanism: &str,
        source_hash: &str,
        dest_hash: Option<&str>,
        created_at: i64,
        last_verified_at: Option<i64>,
    ) -> Result<i64, SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "INSERT INTO links (asset_id, dest_root_id, dest_path, mechanism, source_hash, dest_hash, created_at, last_verified_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![asset_id, dest_root_id, dest_path, mechanism, source_hash, dest_hash, created_at, last_verified_at],
        ).map_err(|_| SanitisedError("Failed to insert link row".to_string()))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn get_hydrated_links(&self) -> Result<Vec<crate::domain::HydratedLink>, SanitisedError> {
        let conn = self.connect()?;
        let mut stmt = conn.prepare(
            "SELECT l.id, l.asset_id, l.dest_root_id, a.abs_path, l.dest_path, l.mechanism, l.source_hash, l.dest_hash, l.created_at, l.last_verified_at
             FROM links l
             JOIN assets a ON l.asset_id = a.id"
        ).map_err(|_| SanitisedError("Failed to query links".to_string()))?;

        let rows = stmt.query_map([], |r| {
            let mech_str: String = r.get(5)?;
            let mechanism = match mech_str.as_str() {
                "symlink" => crate::domain::Mechanism::Symlink,
                "copy" => crate::domain::Mechanism::Copy,
                _ => crate::domain::Mechanism::TrackedCopy,
            };
            Ok(crate::domain::HydratedLink {
                id: r.get(0)?,
                asset_id: r.get(1)?,
                dest_root_id: r.get(2)?,
                source_path: r.get(3)?,
                dest_path: r.get(4)?,
                mechanism,
                source_hash: r.get(6)?,
                dest_hash: r.get(7)?,
                created_at: r.get(8)?,
                last_verified_at: r.get(9)?,
            })
        }).map_err(|_| SanitisedError("Failed to map hydrated links".to_string()))?;

        let mut res = Vec::new();
        for link in rows.flatten() {
            res.push(link);
        }
        Ok(res)
    }

    pub fn update_link_state(&self, link_id: i64, dest_hash: Option<&str>, last_verified_at: i64) -> Result<(), SanitisedError> {
        let conn = self.connect()?;
        conn.execute(
            "UPDATE links SET dest_hash = ?1, last_verified_at = ?2 WHERE id = ?3",
            params![dest_hash, last_verified_at, link_id],
        ).map_err(|_| SanitisedError("Failed to update link state".to_string()))?;
        Ok(())
    }
}
