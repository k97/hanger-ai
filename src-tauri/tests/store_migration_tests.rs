use std::fs;
use std::path::Path;
use rusqlite::Connection;
use tauri_app_lib::preferences::PreferencesStore;

#[test]
fn test_v1_5_0_migration_clean_and_no_data_loss() {
    let fixture_path = Path::new("tests/fixtures/v1_5_0_store.db");
    assert!(
        fixture_path.exists(),
        "v1_5_0_store.db fixture must exist at src-tauri/tests/fixtures/v1_5_0_store.db"
    );

    let temp_dir = std::env::temp_dir().join("hanger_test_v1_5_0_migration");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let test_db_path = temp_dir.join("migrated_store.db");
    fs::copy(fixture_path, &test_db_path).unwrap();

    // Initialize PreferencesStore against the copied v1.5.0 database
    let store = PreferencesStore::new(&test_db_path).expect("Store initialization/migration failed");

    let conn = store.connect().expect("Failed to connect via store");

    // 1. Verify PRAGMA user_version == 6 (v1 schema + v2 engine-root purge +
    //    v3 root-path canonicalisation + v4 links constraints and backfill +
    //    v5 .agents/ misattribution clear and re-attribution unstick + v6
    //    persisted verification's probe_results table)
    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .expect("PRAGMA user_version query should succeed");
    assert_eq!(version, 6, "PRAGMA user_version must be 6 after migration");

    // 2. Verify 'engines' table exists and has correct columns
    let mut stmt = conn.prepare("PRAGMA table_info(engines)").unwrap();
    let engine_cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(
        !engine_cols.is_empty(),
        "Table 'engines' must exist"
    );
    for col in &["id", "key", "display_name", "config_root", "detected_at"] {
        assert!(
            engine_cols.contains(&col.to_string()),
            "Table 'engines' missing column {}",
            col
        );
    }

    // 3. Verify 'roots' table exists and has correct columns
    let mut stmt = conn.prepare("PRAGMA table_info(roots)").unwrap();
    let root_cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(
        !root_cols.is_empty(),
        "Table 'roots' must exist"
    );
    for col in &["id", "kind", "abs_path", "engine_id", "label", "added_at"] {
        assert!(
            root_cols.contains(&col.to_string()),
            "Table 'roots' missing column {}",
            col
        );
    }

    // 4. Verify 'assets' table exists and has correct columns
    let mut stmt = conn.prepare("PRAGMA table_info(assets)").unwrap();
    let asset_cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(
        !asset_cols.is_empty(),
        "Table 'assets' must exist"
    );
    for col in &[
        "id",
        "root_id",
        "engine_id",
        "category",
        "scope",
        "name",
        "abs_path",
        "version",
        "content_hash",
        "parse_status",
        "parse_error",
        "first_seen",
        "last_seen",
    ] {
        assert!(
            asset_cols.contains(&col.to_string()),
            "Table 'assets' missing column {}",
            col
        );
    }

    // 5. Verify 'links' table exists and has correct columns
    let mut stmt = conn.prepare("PRAGMA table_info(links)").unwrap();
    let link_cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(
        !link_cols.is_empty(),
        "Table 'links' must exist"
    );
    for col in &[
        "id",
        "asset_id",
        "dest_root_id",
        "dest_path",
        "mechanism",
        "source_hash",
        "dest_hash",
        "created_at",
        "last_verified_at",
    ] {
        assert!(
            link_cols.contains(&col.to_string()),
            "Table 'links' missing column {}",
            col
        );
    }

    // 6. CRITICAL: Verify there is NO 'state' column on links
    assert!(
        !link_cols.contains(&"state".to_string()),
        "Table 'links' MUST NOT have a 'state' column"
    );

    // 7. Verify migrated contents in 'roots' table
    let (kind, abs_path, engine_id, label, added_at): (String, String, Option<i64>, String, i64) = conn
        .query_row(
            "SELECT kind, abs_path, engine_id, label, added_at FROM roots WHERE abs_path = '/Users/test/project-alpha'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
        )
        .expect("Migrated root for project-alpha should exist");

    assert_eq!(kind, "project", "Migrated root kind must be 'project'");
    assert_eq!(abs_path, "/Users/test/project-alpha");
    assert_eq!(engine_id, None, "Migrated root engine_id must be NULL");
    assert_eq!(label, "project-alpha", "Migrated root label must be directory basename 'project-alpha'");
    assert_eq!(added_at, 1700000000);

    let (kind_b, label_b): (String, String) = conn
        .query_row(
            "SELECT kind, label FROM roots WHERE abs_path = '/Users/test/project-beta'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .expect("Migrated root for project-beta should exist");
    assert_eq!(kind_b, "project");
    assert_eq!(label_b, "project-beta", "Migrated root label must be directory basename 'project-beta'");

    // 8. Verify legacy table data retention in database
    // Explicitly verify linked_directories table rows survived in SQLite
    let mut stmt = conn.prepare("SELECT path FROM linked_directories ORDER BY added_at ASC").unwrap();
    let legacy_paths: Vec<String> = stmt.query_map([], |r| r.get(0)).unwrap().map(|r| r.unwrap()).collect();
    assert_eq!(legacy_paths, vec!["/Users/test/project-alpha", "/Users/test/project-beta"]);

    // Verify store getters for other legacy tables
    let theme = store.get_preference("theme").unwrap();
    assert_eq!(theme, Some("dark".to_string()));

    let target_mem = store
        .get_rules_target_memory("/Users/test/project-alpha", "/Users/test/.claude/rules/test.md")
        .unwrap();
    assert_eq!(target_mem, Some("CLAUDE.md".to_string()));

    let class = store
        .get_asset_classification("/Users/test/.claude/skills/deploy.md")
        .unwrap();
    assert_eq!(class, Some("skill".to_string()));

    let checksum = store
        .get_deploy_checksum(
            "/Users/test/.claude/skills/deploy.md",
            "/Users/test/project-alpha/.claude/skills/deploy.md",
        )
        .unwrap();
    assert_eq!(checksum, Some("abc123blake3hash".to_string()));

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_v1_5_0_migration_idempotency() {
    let fixture_path = Path::new("tests/fixtures/v1_5_0_store.db");
    assert!(fixture_path.exists());

    let temp_dir = std::env::temp_dir().join("hanger_test_v1_5_0_idempotency");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let test_db_path = temp_dir.join("idempotency_store.db");
    fs::copy(fixture_path, &test_db_path).unwrap();

    // First migration run
    let store1 = PreferencesStore::new(&test_db_path).expect("First store init failed");

    // Second migration run on the exact same database file
    let _store2 = PreferencesStore::new(&test_db_path).expect("Second store init failed");

    let conn = store1.connect().expect("Failed to connect via store");

    let version: i32 = conn
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 6, "User version must remain 6 after second migration");

    let root_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM roots", [], |row| row.get(0))
        .unwrap();
    assert_eq!(
        root_count, 2,
        "Roots count must remain exactly 2 after second run (no duplicates)"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_foreign_keys_enforced() {
    let temp_dir = std::env::temp_dir().join("hanger_test_foreign_keys");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let test_db_path = temp_dir.join("fk_test.db");
    let store = PreferencesStore::new(&test_db_path).expect("Store init failed");
    let conn = store.connect().expect("Failed to connect via PreferencesStore");

    // Connections issued by PreferencesStore MUST have PRAGMA foreign_keys = ON;
    // Assert that inserting an asset with non-existent root_id (999) and engine_id (999) fails
    let res = conn.execute(
        "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
         VALUES (999, 999, 'skill', 'project', 'test', '/tmp/test.md', 'ok', 1000, 1000)",
        [],
    );

    assert!(
        res.is_err(),
        "Insert with non-existent root_id and engine_id MUST fail foreign key constraint check"
    );

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_roots_authoritative_for_linked_directories() {
    let fixture_path = Path::new("tests/fixtures/v1_5_0_store.db");
    assert!(fixture_path.exists());

    let temp_dir = std::env::temp_dir().join("hanger_test_roots_authoritative");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let test_db_path = temp_dir.join("authoritative_store.db");
    fs::copy(fixture_path, &test_db_path).unwrap();

    let store = PreferencesStore::new(&test_db_path).expect("Store init failed");

    // Add a new directory via store
    store.link_directory("/Users/test/project-gamma").unwrap();

    let dirs = store.get_linked_directories().unwrap();
    assert_eq!(dirs.len(), 3);
    assert_eq!(dirs[0], "/Users/test/project-alpha");
    assert_eq!(dirs[1], "/Users/test/project-beta");
    assert_eq!(dirs[2], "/Users/test/project-gamma");

    // Verify directly in roots table that roots is authoritative
    let conn = store.connect().unwrap();
    let roots_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM roots WHERE kind = 'project'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(roots_count, 3, "roots table must contain 3 project entries");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_relink_directory_preserves_root_id_and_fk_relations() {
    let temp_dir = std::env::temp_dir().join("hanger_test_relink_fk_preservation");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();

    let test_db_path = temp_dir.join("relink_test.db");
    let store = PreferencesStore::new(&test_db_path).expect("Store init failed");

    // 1. Link a directory
    let proj_path = "/Users/test/project-delta";
    store.link_directory(proj_path).unwrap();

    let conn = store.connect().unwrap();

    // Get initial root_id for project-delta
    let initial_root_id: i64 = conn
        .query_row("SELECT id FROM roots WHERE abs_path = ?1", [proj_path], |r| r.get(0))
        .unwrap();

    // 2. Insert dummy engine into engines table
    conn.execute(
        "INSERT INTO engines (key, display_name, config_root, detected_at) VALUES ('claude_code', 'Claude Code', '~/.claude', 1000)",
        [],
    ).unwrap();
    let engine_id: i64 = conn.last_insert_rowid();

    // 3. Insert asset referencing root_id and engine_id
    conn.execute(
        "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
         VALUES (?1, ?2, 'skill', 'project', 'delta-skill', '/Users/test/project-delta/SKILL.md', 'ok', 1000, 1000)",
        [initial_root_id, engine_id],
    ).unwrap();

    // 4. Re-link the exact same directory path
    store.link_directory(proj_path).unwrap();

    // 5. Assert root_id is unchanged
    let re_linked_root_id: i64 = conn
        .query_row("SELECT id FROM roots WHERE abs_path = ?1", [proj_path], |r| r.get(0))
        .unwrap();

    assert_eq!(
        initial_root_id, re_linked_root_id,
        "Re-linking a directory MUST NOT replace/re-create the root row or change its id"
    );

    // 6. Assert asset still resolves cleanly
    let asset_root_id: i64 = conn
        .query_row("SELECT root_id FROM assets WHERE name = 'delta-skill'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(asset_root_id, initial_root_id, "Asset FK relation must remain valid after re-linking");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_v2_migration_purges_engine_root_project_rows() {
    let temp_dir = std::env::temp_dir().join("hanger_test_v2_purge");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();
    let db_path = temp_dir.join("store.db");

    // Build a store, then plant the corruption shape and wind the version
    // back to 1 so re-opening replays exactly the v2 migration.
    {
        let store = PreferencesStore::new(&db_path).expect("fresh store");
        let conn = store.connect().unwrap();

        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES ('engine_global', '/tmp/hanger-v2-test/.claude', NULL, 'Claude Code', 1)",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO roots (kind, abs_path, engine_id, label, added_at)
             VALUES ('project', '/tmp/hanger-v2-test/work', NULL, 'work', 1)",
            [],
        )
        .unwrap();
        let engine_root: i64 = conn
            .query_row("SELECT id FROM roots WHERE kind = 'engine_global'", [], |r| r.get(0))
            .unwrap();
        let project_root: i64 = conn
            .query_row("SELECT id FROM roots WHERE kind = 'project'", [], |r| r.get(0))
            .unwrap();

        // Stale: project-scoped rows owned by the engine root (the Aug-9 shape)
        conn.execute(
            "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
             VALUES (?1, NULL, 'skill', 'project', 'stale-a', '/tmp/hanger-v2-test/.claude/plugins/a', 'ok', 1, 1),
                    (?1, NULL, 'rule', 'project', 'stale-b', '/tmp/hanger-v2-test/.claude/plugins/b', 'ok', 1, 1)",
            [engine_root],
        )
        .unwrap();
        // Legitimate: a global row under the engine root, and project rows under a project root
        conn.execute(
            "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
             VALUES (?1, NULL, 'rule', 'global', 'keep-global', '/tmp/hanger-v2-test/.claude/CLAUDE.md', 'ok', 1, 1)",
            [engine_root],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO assets (root_id, engine_id, category, scope, name, abs_path, parse_status, first_seen, last_seen)
             VALUES (?1, NULL, 'skill', 'project', 'keep-project', '/tmp/hanger-v2-test/work/skill', 'ok', 1, 1)",
            [project_root],
        )
        .unwrap();

        conn.execute_batch("PRAGMA user_version = 1;").unwrap();
    }

    // Re-open: v2 replays and must purge exactly the stale rows.
    let store = PreferencesStore::new(&db_path).expect("reopen runs v2");
    let conn = store.connect().unwrap();

    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 6, "user_version must be 6 after v2 replay, v3, v4, v5, and v6");

    let stale: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE scope = 'project'
             AND root_id IN (SELECT id FROM roots WHERE kind = 'engine_global')",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stale, 0, "engine-root project rows must be purged");

    let kept: i64 = conn.query_row("SELECT COUNT(*) FROM assets", [], |r| r.get(0)).unwrap();
    assert_eq!(kept, 2, "global row and legit project row must survive");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn test_upsert_root_kind_is_immutable() {
    let temp_dir = std::env::temp_dir().join("hanger_test_kind_immutable");
    let _ = fs::remove_dir_all(&temp_dir);
    fs::create_dir_all(&temp_dir).unwrap();
    let db_path = temp_dir.join("store.db");

    let store = PreferencesStore::new(&db_path).unwrap();
    let first = store
        .upsert_root("engine_global", "/tmp/hanger-kind-test/.claude", None, "Claude Code", 1)
        .unwrap();
    // A project walk hitting the same abs_path must reuse the row without
    // re-kinding it.
    let second = store
        .upsert_root("project", "/tmp/hanger-kind-test/.claude", None, ".claude", 2)
        .unwrap();
    assert_eq!(first, second, "same abs_path must resolve to the same root id");

    let conn = store.connect().unwrap();
    let kind: String = conn
        .query_row("SELECT kind FROM roots WHERE id = ?1", [first], |r| r.get(0))
        .unwrap();
    assert_eq!(kind, "engine_global", "kind must not be rewritten by a later walk");

    let _ = fs::remove_dir_all(&temp_dir);
}

#[test]
fn v5_clears_agents_dir_misattribution_and_unsticks_reattribution() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let abs_path = "/Users/test/.agents/skills/demo/SKILL.md";

    // A v4 database with a `.agents/` asset wrongly attributed to Gemini —
    // exactly what shipped installs hold today (spec §3.1).
    {
        let store = PreferencesStore::new(&db_path).unwrap();
        let now = 1_700_000_000i64;
        let engine_id = store.upsert_engine("gemini", "Gemini / Antigravity", "", now).unwrap();
        let root_id = store.upsert_root("engine_global", "/Users/test/.agents", None, ".agents", now).unwrap();
        store.upsert_asset(
            root_id, Some(engine_id), "skill", "global", "demo", abs_path,
            None, None, "ok", None, now, now,
        ).unwrap();

        // Force the db back to v4, as a shipped install's database actually
        // is. Without this, PreferencesStore::new on a brand-new path
        // bootstraps straight to the latest version before the misattributed
        // row above even exists, and the migration never touches it.
        let conn = store.connect().unwrap();
        conn.execute_batch("PRAGMA user_version = 4;").unwrap();
    }

    // Reopening runs the migration.
    let store = PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();

    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 6, "user_version must be 6 after the agent-detection migration");

    let engine_id: Option<i64> = conn
        .query_row("SELECT engine_id FROM assets WHERE abs_path = ?1", [abs_path], |r| r.get(0))
        .unwrap();
    assert_eq!(
        engine_id, None,
        "a .agents/ asset is store-owned — its engine_id must be NULL, not Gemini"
    );
}

#[test]
fn reattribution_between_two_known_engines_takes_the_new_value() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let now = 1_700_000_000i64;

    let codex = store.upsert_engine("codex", "Codex", "", now).unwrap();
    let claude = store.upsert_engine("claude_code", "Claude Code", "", now).unwrap();
    let root_id = store.upsert_root("project", "/repo/proj", None, "proj", now).unwrap();

    let path = "/repo/proj/.claude/skills/demo/SKILL.md";
    store.upsert_asset(root_id, Some(codex), "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();
    // A rescan now computes a different, known engine.
    store.upsert_asset(root_id, Some(claude), "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();

    let conn = store.connect().unwrap();
    let engine_id: Option<i64> = conn
        .query_row("SELECT engine_id FROM assets WHERE abs_path = ?1", [path], |r| r.get(0))
        .unwrap();
    assert_eq!(
        engine_id, Some(claude),
        "two known engines disagreeing must take the new value, not NULL forever"
    );
}

#[test]
fn reattribution_from_known_to_unknown_still_yields_null() {
    // The genuine "walks disagree" case the original rule was written for.
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let now = 1_700_000_000i64;

    let codex = store.upsert_engine("codex", "Codex", "", now).unwrap();
    let root_id = store.upsert_root("project", "/repo/proj2", None, "proj2", now).unwrap();
    let path = "/repo/proj2/.codex/skills/demo/SKILL.md";

    store.upsert_asset(root_id, Some(codex), "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();
    store.upsert_asset(root_id, None, "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();

    let conn = store.connect().unwrap();
    let engine_id: Option<i64> = conn
        .query_row("SELECT engine_id FROM assets WHERE abs_path = ?1", [path], |r| r.get(0))
        .unwrap();
    assert_eq!(engine_id, None, "Some -> None must still clear the attribution");
}

#[test]
fn v6_adds_probe_results_table_keyed_by_launch_hash_without_data_loss() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let now = 1_700_000_000i64;

    // A v5 database with pre-existing data — exactly what a shipped install
    // holds before this migration ships.
    let root_id;
    {
        let store = PreferencesStore::new(&db_path).unwrap();
        let engine_id = store
            .upsert_engine("claude_code", "Claude Code", "~/.claude", now)
            .unwrap();
        root_id = store
            .upsert_root("project", "/Users/test/project-zeta", None, "project-zeta", now)
            .unwrap();
        store
            .upsert_asset(
                root_id,
                Some(engine_id),
                "skill",
                "project",
                "demo",
                "/Users/test/project-zeta/.claude/skills/demo/SKILL.md",
                None,
                None,
                "ok",
                None,
                now,
                now,
            )
            .unwrap();

        // Force the db back to v5, as a shipped install's database actually
        // is, so reopening replays exactly the v6 migration.
        let conn = store.connect().unwrap();
        conn.execute_batch("PRAGMA user_version = 5;").unwrap();
    }

    // Reopening runs the v6 migration.
    let store = PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();

    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 6, "user_version must be 6 after the persisted-verification migration");

    // 'probe_results' exists, keyed by launch_hash, with the columns a probe
    // result needs to reproduce what Flyout.tsx's session-lived mcpVerified
    // state held: server/protocol version, capabilities, tools, and error.
    let mut stmt = conn.prepare("PRAGMA table_info(probe_results)").unwrap();
    let cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert!(!cols.is_empty(), "Table 'probe_results' must exist");
    for col in &[
        "launch_hash",
        "server_version",
        "protocol_version",
        "capabilities",
        "tools",
        "error",
        "verified_at",
    ] {
        assert!(
            cols.contains(&col.to_string()),
            "Table 'probe_results' missing column {}",
            col
        );
    }

    // No data loss: the v5 root/asset survive the migration untouched.
    let asset_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1", [root_id], |r| r.get(0))
        .unwrap();
    assert_eq!(asset_count, 1, "pre-existing assets must survive the v6 migration");

    // The table is usable and keyed by launch_hash: a probe result can be
    // inserted and read back by that key.
    conn.execute(
        "INSERT INTO probe_results (launch_hash, server_version, protocol_version, capabilities, tools, error, verified_at)
         VALUES ('deadbeef', '1.0.0', '2024-11-05', '[]', '[]', NULL, ?1)",
        [now],
    )
    .unwrap();
    let probe_count: i64 = conn.query_row("SELECT COUNT(*) FROM probe_results", [], |r| r.get(0)).unwrap();
    assert_eq!(probe_count, 1, "an inserted probe result must be readable back");

    // launch_hash is the primary key: a second insert under the same hash
    // must not create a second row fighting over one server's identity.
    let dup = conn.execute(
        "INSERT INTO probe_results (launch_hash, server_version, protocol_version, capabilities, tools, error, verified_at)
         VALUES ('deadbeef', '1.0.1', '2024-11-05', '[]', '[]', NULL, ?1)",
        [now],
    );
    assert!(dup.is_err(), "launch_hash must be the primary key of probe_results");
}

#[test]
fn v7_adds_probe_results_freshness_columns_without_data_loss() {
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let now = 1_700_000_000i64;

    // A v6 database with an existing probe_results row — exactly what a
    // shipped install holds before this migration ships. Built by hand with
    // a raw connection, not via PreferencesStore::new, because that always
    // migrates a fresh path straight to the latest version: once the v7
    // columns exist, forcing user_version back down to 6 and reopening would
    // replay `ALTER TABLE ... ADD COLUMN` a second time and fail on the
    // column that is already there. Mirrors the hand-built v3 fixture in
    // links_writer_tests.rs for the same reason.
    {
        let conn = Connection::open(&db_path).unwrap();
        conn.execute_batch(
            "CREATE TABLE probe_results (
                launch_hash TEXT PRIMARY KEY,
                server_version TEXT,
                protocol_version TEXT,
                capabilities TEXT NOT NULL,
                tools TEXT NOT NULL,
                error TEXT,
                verified_at INTEGER NOT NULL
            );
            PRAGMA user_version = 6;",
        )
        .unwrap();
        conn.execute(
            "INSERT INTO probe_results (launch_hash, server_version, protocol_version, capabilities, tools, error, verified_at)
             VALUES ('deadbeef', '1.0.0', '2024-11-05', '[]', '[\"a\",\"b\"]', NULL, ?1)",
            [now],
        )
        .unwrap();
    }

    // Reopening runs the v7 migration.
    let store = PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();

    let version: i32 = conn.query_row("PRAGMA user_version", [], |r| r.get(0)).unwrap();
    assert_eq!(version, 7, "user_version must be 7 after the freshness-columns migration");

    // The three new columns exist, all additive, and launch_hash is still
    // present.
    let mut stmt = conn.prepare("PRAGMA table_info(probe_results)").unwrap();
    let cols: Vec<String> = stmt
        .query_map([], |row| row.get(1))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    for col in &["ttl_ms", "cache_scope", "launch_mtime"] {
        assert!(
            cols.contains(&col.to_string()),
            "Table 'probe_results' missing column {}",
            col
        );
    }
    assert!(cols.contains(&"launch_hash".to_string()));

    // No data loss: the v6 probe_results row survives with every value
    // intact, and the new columns are NULL for a row that predates them.
    let (server_version, protocol_version, capabilities, tools, error, verified_at, ttl_ms, cache_scope, launch_mtime): (
        String,
        String,
        String,
        String,
        Option<String>,
        i64,
        Option<i64>,
        Option<String>,
        Option<i64>,
    ) = conn
        .query_row(
            "SELECT server_version, protocol_version, capabilities, tools, error, verified_at, ttl_ms, cache_scope, launch_mtime
             FROM probe_results WHERE launch_hash = 'deadbeef'",
            [],
            |r| {
                Ok((
                    r.get(0)?,
                    r.get(1)?,
                    r.get(2)?,
                    r.get(3)?,
                    r.get(4)?,
                    r.get(5)?,
                    r.get(6)?,
                    r.get(7)?,
                    r.get(8)?,
                ))
            },
        )
        .unwrap();
    assert_eq!(server_version, "1.0.0", "server_version must survive the v7 migration");
    assert_eq!(protocol_version, "2024-11-05", "protocol_version must survive the v7 migration");
    assert_eq!(capabilities, "[]", "capabilities must survive the v7 migration");
    assert_eq!(tools, "[\"a\",\"b\"]", "tools must survive the v7 migration");
    assert_eq!(error, None, "error must survive the v7 migration");
    assert_eq!(verified_at, now, "verified_at must survive the v7 migration");
    assert_eq!(ttl_ms, None, "ttl_ms must be NULL for a pre-existing row");
    assert_eq!(cache_scope, None, "cache_scope must be NULL for a pre-existing row");
    assert_eq!(launch_mtime, None, "launch_mtime must be NULL for a pre-existing row");

    // launch_hash is still the primary key: a second insert under the same
    // hash must still fail after v7.
    let dup = conn.execute(
        "INSERT INTO probe_results (launch_hash, server_version, protocol_version, capabilities, tools, error, verified_at)
         VALUES ('deadbeef', '1.0.1', '2024-11-05', '[]', '[]', NULL, ?1)",
        [now],
    );
    assert!(dup.is_err(), "launch_hash must still be the primary key of probe_results after v7");
}

#[test]
fn reattribution_from_unknown_to_known_takes_the_new_value() {
    // No previous owner, now a known one: None -> Some must take the new
    // engine, not stay NULL forever.
    let dir = tempfile::tempdir().unwrap();
    let db_path = dir.path().join("prefs.db");
    let store = PreferencesStore::new(&db_path).unwrap();
    let now = 1_700_000_000i64;

    let claude = store.upsert_engine("claude_code", "Claude Code", "", now).unwrap();
    let root_id = store.upsert_root("project", "/repo/proj3", None, "proj3", now).unwrap();
    let path = "/repo/proj3/.claude/skills/demo/SKILL.md";

    store.upsert_asset(root_id, None, "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();
    // A rescan now resolves a known engine where none was known before.
    store.upsert_asset(root_id, Some(claude), "skill", "project", "demo", path, None, None, "ok", None, now, now).unwrap();

    let conn = store.connect().unwrap();
    let engine_id: Option<i64> = conn
        .query_row("SELECT engine_id FROM assets WHERE abs_path = ?1", [path], |r| r.get(0))
        .unwrap();
    assert_eq!(engine_id, Some(claude), "None -> Some must take the new value, not stay NULL");
}
