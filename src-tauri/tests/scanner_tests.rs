use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri_app_lib::domain::Scope;
use tauri_app_lib::scanner::{DirectoryScanner, Grouping, Scanner};

static ENV_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

#[test]
fn test_scanner_fixtures() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    // Inject the fake home directory for this test execution
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let scanner = DirectoryScanner {
        db_path: Path::new("tests/fixtures/home/hanger.db").to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let res = scanner.scan(root_path);

    assert!(res.is_ok(), "Scan should complete successfully");
    let inventory = res.unwrap();

    // 1. Verify Skills
    assert_eq!(inventory.skills.iter().filter(|s| s.parse_status.as_deref() == Some("ok")).count(), 3, "Expected exactly 3 valid skills");
    assert_eq!(inventory.skills.len(), 4, "Expected 4 total skills (3 valid + 1 failed)");

    let skill_names: Vec<String> = inventory.skills.iter().map(|s| s.name.clone()).collect();
    assert!(skill_names.contains(&"git-commit".to_string()));
    assert!(skill_names.contains(&"codebase-seo".to_string()));
    assert!(skill_names.contains(&"custom-skill".to_string()));

    let git_commit_skill = inventory.skills.iter().find(|s| s.name == "git-commit").unwrap();
    assert_eq!(git_commit_skill.version, "1.0.0");
    assert_eq!(
        git_commit_skill.source_origin,
        Some("https://github.com/example/git-commit".to_string())
    );

    // 2. Verify Rules
    assert_eq!(inventory.rules.len(), 3, "Expected exactly 3 rules");

    let rule_names: Vec<String> = inventory.rules.iter().map(|r| r.name.clone()).collect();
    assert_eq!(
        rule_names.iter().filter(|&n| n == "AGENTS.md").count(),
        2,
        "Expected 2 AGENTS.md rules"
    );
    assert!(rule_names.contains(&".cursorrules".to_string()));

    // 3. Verify Engines (Containers, not assets)
    assert_eq!(inventory.agents.len(), 0, "Engines are containers and must not be emitted as assets");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&scanner.db_path).unwrap();
    let engines = store.get_engines().unwrap();
    assert_eq!(engines.len(), 4, "Expected 4 detected engines in engines table");
    let engine_keys: Vec<String> = engines.into_iter().map(|e| e.key).collect();
    assert!(engine_keys.contains(&"claude_code".to_string()));
    assert!(engine_keys.contains(&"codex".to_string()));
    assert!(engine_keys.contains(&"gemini".to_string()));
    assert!(engine_keys.contains(&"cursor".to_string()));

    // 4. Verify Tools & Scopes
    // Expected global tools:
    // - weather-global (Claude)
    // - git-reader, file-writer (Codex)
    // - gemini-global-tool (Gemini)
    // Expected project tools:
    // - project-local-tool (no owner: .agents is the shared, vendor-neutral
    //   convention directory — ownership is exclusive and belongs to no
    //   single agent, see agents.rs)
    // - claude-project-tool (owned by Claude Code: .claude is an agent-owned
    //   project root, see agents.rs)
    let global_tools: Vec<_> = inventory.tools.iter().filter(|t| matches!(t.scope, Scope::Global { .. })).collect();
    let project_tools: Vec<_> = inventory.tools.iter().filter(|t| matches!(t.scope, Scope::Project { .. })).collect();

    assert_eq!(global_tools.len(), 4, "Expected 4 global tools");
    assert_eq!(project_tools.iter().filter(|t| t.parse_status.as_deref() == Some("ok")).count(), 2, "Expected 2 valid project tools");
    assert_eq!(project_tools.len(), 3, "Expected 3 total project tools (2 valid + 1 failed)");

    let global_tool_names: Vec<String> = global_tools.iter().map(|t| t.name.clone()).collect();
    assert!(global_tool_names.contains(&"weather-global".to_string()));
    assert!(global_tool_names.contains(&"git-reader".to_string()));
    assert!(global_tool_names.contains(&"file-writer".to_string()));
    assert!(global_tool_names.contains(&"gemini-global-tool".to_string()));

    let project_tool_names: Vec<String> = project_tools.iter().map(|t| t.name.clone()).collect();
    assert!(project_tool_names.contains(&"project-local-tool".to_string()));
    assert!(project_tool_names.contains(&"claude-project-tool".to_string()));

    // Pin the owner, not just the name: project-local-tool lives under
    // .agents/, the shared vendor-neutral directory, so it must have no
    // owning agent. This is the regression this task exists to prevent —
    // .agents/ used to be filed under "Gemini / Antigravity" via
    // AgentConfig::footprint_dir.
    let project_local_tool = project_tools
        .iter()
        .find(|t| t.name == "project-local-tool")
        .expect("project-local-tool must be present");
    match &project_local_tool.scope {
        Scope::Project { agent, .. } => {
            assert_eq!(agent, "", "project-local-tool under .agents/ must have no owning agent, got {:?}", agent)
        }
        other => panic!("expected project-local-tool to have Scope::Project, got {:?}", other),
    }

    // The other half of that regression: a tool under an agent-owned project
    // root (.claude/mcp.json) must actually get its owner through the same
    // engine_for_path wiring, not just correctly withhold one for .agents/.
    // Without this, deleting the attribution assignment outright would go
    // unnoticed — every existing assertion here only pins the no-owner case.
    let claude_project_tool = project_tools
        .iter()
        .find(|t| t.name == "claude-project-tool")
        .expect("claude-project-tool must be present");
    match &claude_project_tool.scope {
        Scope::Project { agent, .. } => {
            assert_eq!(agent, "Claude Code", "claude-project-tool under .claude/ must be owned by Claude Code, got {:?}", agent)
        }
        other => panic!("expected claude-project-tool to have Scope::Project, got {:?}", other),
    }

    // Verify decoys are ignored: cargo.toml ( Rust crate decoy) and package.json must not be present
    let tool_ids: Vec<String> = inventory.tools.iter().map(|t| t.id.clone()).collect();
    for id in &tool_ids {
        assert!(!id.contains("Cargo.toml"), "Decoy Cargo.toml should not match");
        assert!(!id.contains("package.json"), "Decoy package.json should not match");
    }

    // 5. Verify Secret Hygiene
    // Planted secrets: "secret123" in ~/.claude/settings.json env, "key=123" in url
    // and "secret=abc" in ~/.codex/config.toml url.
    // Let's assert that the debug representation of the entire inventory never contains the raw secret.
    let debug_str = format!("{:?}", inventory);
    assert!(!debug_str.contains("secret123"), "Secret value should never leak in debug representation");
    assert!(!debug_str.contains("key=123"), "URL secret keys/values should be stripped");
    assert!(!debug_str.contains("secret=abc"), "URL query secrets should be stripped");
    assert!(!debug_str.contains("user:pass"), "Embedded URL credentials should be stripped");
    assert!(!debug_str.contains("my_token"), "Embedded token in URL credentials should be stripped");

    // Verify that the sanitised URLs are stored in transport field
    let weather_global_tool = inventory.tools.iter().find(|t| t.name == "weather-global").unwrap();
    assert_eq!(weather_global_tool.transport, "http://localhost:8080/mcp");

    let git_reader_tool = inventory.tools.iter().find(|t| t.name == "git-reader").unwrap();
    assert_eq!(git_reader_tool.transport, "http://localhost:9000/codex");

    // 6. Verify Subagents
    // - Global Research Agent, Global Coder Agent (Claude Code, global)
    // - Local Research Agent (Claude Code, project)
    // - Shared Reviewer (no owner: a bare .md directly under .agents/, the
    //   shared vendor-neutral convention directory -- same ownership rule as
    //   project-local-tool above, see agents.rs)
    assert_eq!(inventory.subagents.iter().filter(|sa| sa.parse_status.as_deref() == Some("ok")).count(), 4, "Expected exactly 4 valid subagents");
    assert_eq!(inventory.subagents.len(), 5, "Expected 5 total subagents (4 valid + 1 failed)");

    let subagent_names: Vec<String> = inventory.subagents.iter().map(|sa| sa.name.clone()).collect();
    assert!(subagent_names.contains(&"Global Research Agent".to_string()));
    assert!(subagent_names.contains(&"Global Coder Agent".to_string()));
    assert!(subagent_names.contains(&"Local Research Agent".to_string()));
    assert!(subagent_names.contains(&"Shared Reviewer".to_string()));

    // Verify declared tools
    let global_researcher = inventory.subagents.iter().find(|sa| sa.name == "Global Research Agent").unwrap();
    assert_eq!(global_researcher.declared_tools, vec!["read_file".to_string(), "grep_search".to_string()]);
    assert!(matches!(global_researcher.scope, Some(Scope::Global { .. })));

    let local_researcher = inventory.subagents.iter().find(|sa| sa.name == "Local Research Agent").unwrap();
    assert!(matches!(local_researcher.scope, Some(Scope::Project { .. })));

    // Both halves of the shared-subagent regression: it must be present (the
    // scan must not silently drop a bare .md under .agents/) AND ownerless
    // (it must not be misattributed to whichever engine's arm happens to run
    // last). Mirrors the claude-project-tool positive assertion above --
    // same wiring (crate::agents::subagent_owner_for_path via is_subagent in
    // scanner.rs), opposite expected owner.
    let shared_reviewer = inventory
        .subagents
        .iter()
        .find(|sa| sa.name == "Shared Reviewer")
        .expect("Shared Reviewer must be present: a bare .md directly under .agents/ is still a subagent");
    match &shared_reviewer.scope {
        Some(Scope::Project { agent, .. }) => {
            assert_eq!(agent, "", "Shared Reviewer under .agents/ must have no owning agent, got {:?}", agent)
        }
        other => panic!("expected Shared Reviewer to have Scope::Project, got {:?}", other),
    }

    // 7. Verify Project Scan Metadata & Warnings
    assert_eq!(inventory.project_scans.len(), 1);
    let project = &inventory.project_scans[0];

    assert!(project.layered, "Expected layered to be true due to multiple AGENTS.md");

    // Warnings should cover: broken-skill/SKILL.md, malformed mcp.json, and broken_subagent.md
    let malformed_warnings: Vec<_> = project.parse_warnings.iter().filter(|w| w.contains("mcp.json")).collect();
    assert_eq!(malformed_warnings.len(), 1, "Expected warning for malformed mcp.json tool");

    let subagent_broken_warnings: Vec<_> = project.parse_warnings.iter().filter(|w| w.contains("broken_subagent.md")).collect();
    assert_eq!(subagent_broken_warnings.len(), 1, "Expected warning for broken subagent frontmatter");

    let agents_chain = project.rule_chains.get("AGENTS.md");
    assert!(agents_chain.is_some());
    let chain = agents_chain.unwrap();
    assert_eq!(chain.len(), 2);
    assert!(chain[0].contains("tests/fixtures/project/AGENTS.md"));
    assert!(chain[1].contains("tests/fixtures/project/src/ai/AGENTS.md"));
}

#[test]
fn test_scan_resilience() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let root = temp_dir.path();

    // Create Library folder (should be excluded)
    let library_dir = root.join("Library");
    fs::create_dir_all(&library_dir).unwrap();
    fs::write(
        library_dir.join("SKILL.md"),
        b"---\nname: skipped-skill\ndescription: should be excluded\n---",
    )
    .unwrap();

    // Create a deep directory chain (depth 8)
    let mut deep_dir = root.to_path_buf();
    for i in 1..=8 {
        deep_dir = deep_dir.join(format!("level{}", i));
    }
    fs::create_dir_all(&deep_dir).unwrap();
    fs::write(
        deep_dir.join("SKILL.md"),
        b"---\nname: deep-skill\ndescription: level 8 skill\n---",
    )
    .unwrap();

    // Mock HOME to point to temp root so it counts as broad root
    std::env::set_var("HANGER_TEST_HOME", root.to_string_lossy().to_string());

    let scanner = DirectoryScanner {
        db_path: root.join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(root).unwrap();

    // Assert skipped due to Library exclusion
    assert!(
        !inventory.skills.iter().any(|s| s.name == "skipped-skill"),
        "Library folder should have been excluded"
    );

    // Assert skipped due to broad root depth limit (max 6)
    assert!(
        !inventory.skills.iter().any(|s| s.name == "deep-skill"),
        "Level 8 skill should have been skipped by depth cap"
    );

    // Assert warning present
    let scan_warnings = &inventory.project_scans[0].parse_warnings;
    assert!(
        scan_warnings.iter().any(|w| w.contains("Scan depth capped")),
        "Expected depth cap warning in scan results"
    );

    // Test CancellationToken
    let cancel_token = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
    let scanner_cancelled = DirectoryScanner {
        db_path: root.join("hanger.db"),
        cancellation_token: cancel_token.clone(),
    };
    cancel_token.store(true, std::sync::atomic::Ordering::SeqCst);
    let inventory_cancelled = scanner_cancelled.scan(root).unwrap();
    assert_eq!(inventory_cancelled.skills.len(), 0);
}

#[test]
fn test_rules_merge_and_memory() {
    // 1. Test markdown section parsing
    let plain_content = "This is a heading-free plain rules file.\nLine 2.";
    let plain_sections = tauri_app_lib::scanner::split_rule_sections(plain_content);
    assert_eq!(plain_sections.len(), 1);
    assert!(plain_sections[0].heading.is_none());
    assert_eq!(plain_sections[0].heading_level, 0);
    assert_eq!(plain_sections[0].content, plain_content);

    let structured_content = "Preamble lines here.\n# Heading 1\nContent of section 1.\n## Heading 2\nContent of section 2.";
    let structured_sections = tauri_app_lib::scanner::split_rule_sections(structured_content);
    assert_eq!(structured_sections.len(), 3);
    
    // Preamble
    assert!(structured_sections[0].heading.is_none());
    assert_eq!(structured_sections[0].heading_level, 0);
    assert_eq!(structured_sections[0].content, "Preamble lines here.");

    // Heading 1
    assert_eq!(structured_sections[1].heading.as_deref(), Some("Heading 1"));
    assert_eq!(structured_sections[1].heading_level, 1);
    assert_eq!(structured_sections[1].content, "# Heading 1\nContent of section 1.");

    // Heading 2
    assert_eq!(structured_sections[2].heading.as_deref(), Some("Heading 2"));
    assert_eq!(structured_sections[2].heading_level, 2);
    assert_eq!(structured_sections[2].content, "## Heading 2\nContent of section 2.");

    // 2. Test Rules Target Memory Store
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("preferences.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    // Verify empty state
    let target = store.get_rules_target_memory("proj_a", "rule_x").unwrap();
    assert!(target.is_none());

    // Set mapping
    store.set_rules_target_memory("proj_a", "rule_x", "target_file_y").unwrap();
    let target_set = store.get_rules_target_memory("proj_a", "rule_x").unwrap();
    assert_eq!(target_set.as_deref(), Some("target_file_y"));

    // 3. Test JSON Import/Export Portability
    let export_json_path = temp_dir.path().join("backup.json");

    // Add some test data
    store.set_asset_classification("path/to/asset", "Skills").unwrap();
    store.set_deploy_checksum("source_p", "dest_p", "hash123").unwrap();

    // Export to JSON
    store.export_store(&export_json_path).unwrap();
    assert!(export_json_path.exists());

    // Verify file content is valid JSON and contains values
    let json_text = std::fs::read_to_string(&export_json_path).unwrap();
    assert!(json_text.contains("\"version\": 1"));
    assert!(json_text.contains("path/to/asset"));
    assert!(json_text.contains("proj_a"));
    assert!(json_text.contains("hash123"));

    // Create a new fresh store and import the backup
    let db_path_new = temp_dir.path().join("preferences_new.db");
    let store_new = tauri_app_lib::preferences::PreferencesStore::new(&db_path_new).unwrap();

    // Verify empty initially
    assert!(store_new.get_asset_classification("path/to/asset").unwrap().is_none());

    // Import from JSON
    store_new.import_store(&export_json_path).unwrap();

    // Verify rows are restored
    assert_eq!(
        store_new.get_asset_classification("path/to/asset").unwrap().as_deref(),
        Some("Skills")
    );
    assert_eq!(
        store_new.get_rules_target_memory("proj_a", "rule_x").unwrap().as_deref(),
        Some("target_file_y")
    );
    assert_eq!(
        store_new.get_deploy_checksum("source_p", "dest_p").unwrap().as_deref(),
        Some("hash123")
    );

    // Clear mapping
    store.clear_rules_target_memory("proj_a", "rule_x").unwrap();
    let target_cleared = store.get_rules_target_memory("proj_a", "rule_x").unwrap();
    assert!(target_cleared.is_none());
}

#[test]
fn test_import_rollback_on_failure() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("preferences.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    // 1. Write initial valid state data
    store.set_asset_classification("path/one", "Skills").unwrap();

    // 2. Write a JSON payload that is structurally valid for ExportData,
    // but contains duplicate keys in classifications to trigger database unique constraints violation
    let malformed_data = serde_json::json!({
        "version": 1,
        "classifications": [
            { "file_path": "path/duplicate", "category": "Tools" },
            { "file_path": "path/duplicate", "category": "Agents" }
        ],
        "rules_target_memory": [],
        "deploy_checksums": []
    });

    let import_json_path = temp_dir.path().join("malformed.json");
    std::fs::write(&import_json_path, serde_json::to_string(&malformed_data).unwrap()).unwrap();

    // 3. Try import and verify it fails
    let res = store.import_store(&import_json_path);
    assert!(res.is_err());

    // 4. Assert that the pre-import state survives completely intact
    let category = store.get_asset_classification("path/one").unwrap();
    assert_eq!(category.as_deref(), Some("Skills"));

    let category_dup = store.get_asset_classification("path/duplicate").unwrap();
    assert!(category_dup.is_none());
}

#[test]
fn test_remove_deployed_asset_safety() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("preferences.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let repo_dir = temp_dir.path().join("my_repo");
    std::fs::create_dir_all(&repo_dir).unwrap();
    let linked_dirs = vec![repo_dir.to_string_lossy().to_string()];

    // 1. Create a native file (no provenance)
    let native_file_path = repo_dir.join("native.txt");
    std::fs::write(&native_file_path, "native content").unwrap();

    // Try deleting native file (no provenance, not symlink)
    let backups_dir = temp_dir.path().join("backups");
    let res = tauri_app_lib::remove_deployed_asset_internal(
        &store,
        &linked_dirs,
        &native_file_path.to_string_lossy(),
        &backups_dir,
    );

    assert!(res.is_err(), "Deletion should be refused for native file");
    assert!(native_file_path.exists(), "Native file must remain intact");

    // 2. Create a copy with matching provenance
    let copy_file_path = repo_dir.join("copy.txt");
    std::fs::write(&copy_file_path, "copy content").unwrap();
    let source_path = "~/global/copy.txt";
    let hash = blake3::hash(b"copy content").to_hex().to_string();
    
    // Canonicalize target destination path before inserting into DB
    let abs_copy_path = copy_file_path.canonicalize().unwrap().to_string_lossy().to_string();
    store.set_deploy_checksum(source_path, &abs_copy_path, &hash).unwrap();

    // Deleting copy (valid provenance)
    let res_copy = tauri_app_lib::remove_deployed_asset_internal(
        &store,
        &linked_dirs,
        &copy_file_path.to_string_lossy(),
        &backups_dir,
    );
    assert!(res_copy.is_ok(), "Deletion should succeed for provenance copy file");
    assert!(!copy_file_path.exists(), "Copy file must be deleted");

    // Verify backup was created
    assert!(backups_dir.exists(), "Backups folder must exist");
    let backup_entries: Vec<_> = std::fs::read_dir(&backups_dir).unwrap().collect();
    assert_eq!(backup_entries.len(), 1, "Exactly one backup file should be created");
}

#[test]
fn test_scanner_deduplication_logic() {
    use tauri_app_lib::domain::{Inventory, Skill};

    let mut combined_inventory = Inventory::default();
    combined_inventory.skills.push(Skill {
        id: "1".to_string(),
        name: "duplicate".to_string(),
        description: "desc".to_string(),
        version: "1.0.0".to_string(),
        path: "/path/to/skill".to_string(),
        source_origin: None,
        scope: None,
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
    });
    combined_inventory.skills.push(Skill {
        id: "2".to_string(),
        name: "duplicate".to_string(),
        description: "desc".to_string(),
        version: "1.0.0".to_string(),
        path: "/path/to/skill".to_string(),
        source_origin: None,
        scope: None,
        drifted: None,
        is_symlink: None,
        source_path: None,
        parse_status: Some("ok".to_string()),
        parse_error: None,
        link_state: None,
    });

    assert_eq!(combined_inventory.skills.len(), 2);

    let mut skill_paths = std::collections::HashSet::new();
    combined_inventory.skills.retain(|s| skill_paths.insert(s.path.clone()));

    assert_eq!(combined_inventory.skills.len(), 1, "Duplicate paths must be retained only once");
}

#[test]
fn test_dynamic_link_fixtures_generator() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let root = temp_dir.path();

    let fake_home = root.join("fake_home");
    fs::create_dir_all(&fake_home).unwrap();
    std::env::set_var("HANGER_TEST_HOME", &fake_home);
    let project_dir = root.join("project");
    let claude_skills_dir = project_dir.join(".claude/skills");
    fs::create_dir_all(&claude_skills_dir).unwrap();

    // 1. Static source skill directory & SKILL.md
    let source_dir = root.join("source_skill");
    fs::create_dir_all(&source_dir).unwrap();
    let source_asset = source_dir.join("SKILL.md");
    let source_content = "---\nname: source-skill\ndescription: Source skill for link tests\n---";
    fs::write(&source_asset, source_content.as_bytes()).unwrap();

    let canonical_source_dir = fs::canonicalize(&source_dir).unwrap_or_else(|_| source_dir.clone());

    // 2. Dynamic Drifted Tracked Copy skill directory
    let drifted_dir = claude_skills_dir.join("drifted_skill");
    fs::create_dir_all(&drifted_dir).unwrap();
    let drifted_asset = drifted_dir.join("SKILL.md");
    let drifted_content = "---\nname: source-skill\ndescription: Modified drifted content\n---";
    fs::write(&drifted_asset, drifted_content.as_bytes()).unwrap();

    let canonical_drifted_dir = fs::canonicalize(&drifted_dir).unwrap_or_else(|_| drifted_dir.clone());

    // 3. Initialize test preferences store and record deploy checksum for drift tracking
    let db_path = root.join("hanger.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let original_hash = blake3::hash(source_content.as_bytes()).to_hex().to_string();
    store.set_deploy_checksum(
        canonical_source_dir.to_str().unwrap(),
        canonical_drifted_dir.to_str().unwrap(),
        &original_hash,
    ).unwrap();

    // 4. Run DirectoryScanner over the generated dynamic fixture layout
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(&project_dir).unwrap();

    // 5. Assert dynamic drifted copy fixture is correctly resolved by scanner
    assert_eq!(inventory.skills.len(), 1, "Expected 1 skill in project scan");
    let drifted = inventory.skills.iter().find(|s| s.drifted == Some(true));
    assert!(drifted.is_some(), "Dynamic drifted copy fixture must be detected as drifted");
}

#[test]
fn test_engines_populate_engines_table_not_asset_stream() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let db_path = Path::new("tests/fixtures/home/hanger_3a_test.db");
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }

    let scanner = DirectoryScanner {
        db_path: db_path.to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let res = scanner.scan(root_path);

    assert!(res.is_ok(), "Scan should complete successfully");
    let inventory = res.unwrap();

    // 1. Engines must NOT be emitted in the asset inventory stream (category 'agent')
    assert_eq!(inventory.agents.len(), 0, "Engines must not be emitted as assets in inventory.agents stream");

    // 2. Engines table in Tier 5 store must be populated with detected engines (claude_code, codex, gemini)
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).expect("Store should open");
    let engines = store.get_engines().expect("Engines query should succeed");
    assert!(engines.len() >= 3, "Expected at least 3 detected engines in engines table");
    let keys: Vec<String> = engines.into_iter().map(|e| e.key).collect();
    assert!(keys.contains(&"claude_code".to_string()));
    assert!(keys.contains(&"codex".to_string()));
    assert!(keys.contains(&"gemini".to_string()));

    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
}

#[test]
fn test_engines_table_key_unique_idempotency() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("preferences.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let id1 = store.upsert_engine("claude_code", "Claude Code", "~/.claude", now).unwrap();
    let id2 = store.upsert_engine("claude_code", "Claude Code Updated", "~/.claude", now + 100).unwrap();

    assert_eq!(id1, id2, "Upserting same key must update row idempotently with same primary key");

    let engines = store.get_engines().unwrap();
    assert_eq!(engines.len(), 1, "engines table must contain exactly 1 row per unique key");
    assert_eq!(engines[0].display_name, "Claude Code Updated");
    assert_eq!(engines[0].detected_at, now + 100);
}

#[test]
fn test_scanner_emits_assets_table_rows() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let db_path = Path::new("tests/fixtures/home/hanger_3b_test.db");
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }

    let scanner = DirectoryScanner {
        db_path: db_path.to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let res = scanner.scan(root_path);
    assert!(res.is_ok(), "Scan should complete successfully");

    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let skill_count = store.count_assets_by_category("skill").unwrap();
    let rule_count = store.count_assets_by_category("rule").unwrap();
    let subagent_count = store.count_assets_by_category("subagent").unwrap();
    let tool_count = store.count_assets_by_category("tool").unwrap();
    let failed_count = store.count_assets_by_parse_status("failed").unwrap();
    let null_engine_count = store.count_assets_by_engine_null(true).unwrap();

    assert_eq!(skill_count, 4, "Expected 4 skill rows in assets table");
    assert_eq!(rule_count, 3, "Expected 3 rule rows in assets table");
    assert_eq!(subagent_count, 5, "Expected 5 subagent rows (4 ok + 1 failed) in assets table");
    assert_eq!(tool_count, 7, "Expected 7 tool rows (6 ok + 1 failed) in assets table");
    assert_eq!(failed_count, 3, "Expected 3 failed parse asset rows (broken-skill, broken_subagent.md, mcp.json)");
    // 10, not 8: claude-project-tool's config is literally named mcp.json, which
    // the store layer always treats as an engine-agnostic shared standard
    // (tool_filename == "mcp.json" branch) regardless of which agent's
    // directory it sits in -- same as project-local-tool and
    // gemini-global-tool above it. Its Scope::Project.agent is still "Claude
    // Code" (see test_scanner_fixtures): that ownership is a separate, correct
    // signal from the store's per-row engine_id. Shared Reviewer (a bare .md
    // directly under .agents/) adds the tenth: it is a real subagent with no
    // owning engine by design, same as project-local-tool.
    assert_eq!(null_engine_count, 10, "Expected 10 shared standard asset rows to have engine_id IS NULL");

    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
}

#[test]
fn test_dump_section_5_actual_counts() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let db_path = Path::new("tests/fixtures/home/hanger_sec5_actual.db");
    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }

    let scanner = DirectoryScanner {
        db_path: db_path.to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let _res = scanner.scan(root_path).unwrap();

    let conn = rusqlite::Connection::open(&db_path).unwrap();
    let mut stmt = conn.prepare("SELECT category, scope, parse_status, COUNT(*) FROM assets GROUP BY category, scope, parse_status ORDER BY category, scope, parse_status;").unwrap();
    let rows: Vec<String> = stmt.query_map([], |r| {
        let cat: String = r.get(0)?;
        let scope: String = r.get(1)?;
        let status: String = r.get(2)?;
        let cnt: i64 = r.get(3)?;
        Ok(format!("{} | {} | {} | {}", cat, scope, status, cnt))
    }).unwrap().filter_map(|r| r.ok()).collect();

    let mut tool_stmt = conn.prepare("SELECT name, abs_path, scope, engine_id, parse_status FROM assets WHERE category = 'tool' ORDER BY name;").unwrap();
    let tool_rows: Vec<String> = tool_stmt.query_map([], |r| {
        let name: String = r.get(0)?;
        let path: String = r.get(1)?;
        let scope: String = r.get(2)?;
        let eng_id: Option<i64> = r.get(3)?;
        let status: String = r.get(4)?;
        let eng_str = eng_id.map(|i| i.to_string()).unwrap_or_else(|| "NULL".to_string());
        Ok(format!("{} | {} | {} | {} | {}", name, path, scope, eng_str, status))
    }).unwrap().filter_map(|r| r.ok()).collect();

    let mut out = String::new();
    out.push_str("category | scope | parse_status | count\n");
    out.push_str("----------------------------------------\n");
    for row in rows {
        out.push_str(&format!("{}\n", row));
    }
    out.push_str("\nTool Asset Rows:\n");
    out.push_str("name | path | scope | engine_id | parse_status\n");
    out.push_str("----------------------------------------\n");
    for trow in tool_rows {
        out.push_str(&format!("{}\n", trow));
    }

    let out_dir = std::env::temp_dir().join("hanger_test_evidence");
    let _ = std::fs::create_dir_all(&out_dir);
    std::fs::write(out_dir.join("section-5-actual-counts.txt"), out).unwrap();

    if db_path.exists() {
        let _ = std::fs::remove_file(db_path);
    }
}

#[test]
fn test_active_scans_mutex_poison_recovery() {
    let manager = tauri_app_lib::ScanManager::default();
    let lock_clone = manager.active_scans.clone();

    // Spawn a thread that panics while holding the active_scans lock
    let handle = std::thread::spawn(move || {
        let _guard = lock_clone.lock().unwrap();
        panic!("Simulated scan thread panic while holding active_scans lock");
    });
    let _ = handle.join();

    // Verify lock is poisoned
    assert!(manager.active_scans.lock().is_err(), "Lock should be poisoned after thread panic");

    // Subsequent lock acquisition via lock_active_scans must succeed without panicking
    let mut scans = manager.lock_active_scans();
    scans.insert("scan-test".to_string(), std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)));
    assert!(scans.contains_key("scan-test"), "Should successfully insert key after poison recovery");

    // Subsequent cancel / access must also work
    if let Some(token) = scans.get("scan-test") {
        token.store(true, std::sync::atomic::Ordering::SeqCst);
    }
    assert!(scans.get("scan-test").unwrap().load(std::sync::atomic::Ordering::SeqCst));
}

pub struct LinkFixturePaths {
    pub db_path: std::path::PathBuf,
    pub project_dir: std::path::PathBuf,
    pub clean_symlink_id: i64,
    pub drifted_copy_id: i64,
    pub broken_symlink_id: i64,
    pub foreign_symlink_id: i64,
    pub source_dir: std::path::PathBuf,
}

fn setup_link_test_fixtures(root: &std::path::Path) -> LinkFixturePaths {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let db_path = root.join("hanger.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let project_dir = root.join("project");
    let source_dir = root.join("source_dir");
    let other_dir = root.join("other_dir");
    std::fs::create_dir_all(&project_dir).unwrap();
    std::fs::create_dir_all(&source_dir).unwrap();
    std::fs::create_dir_all(&other_dir).unwrap();

    // Source asset
    let source_asset = source_dir.join("source_skill.md");
    let source_content = "# Source Skill Content";
    std::fs::write(&source_asset, source_content).unwrap();
    let source_hash = blake3::hash(source_content.as_bytes()).to_hex().to_string();

    // Foreign target
    let foreign_target = other_dir.join("other.md");
    std::fs::write(&foreign_target, "# Other Content").unwrap();

    let source_root_id = store.upsert_root("engine_global", source_dir.to_str().unwrap(), None, "source", now).unwrap();
    let dest_root_id = store.upsert_root("project", project_dir.to_str().unwrap(), None, "project", now).unwrap();

    // Asset row in database (Pass 1 unhashed asset)
    let asset_id = store.upsert_asset(
        source_root_id,
        None,
        "skill",
        "global",
        "source_skill.md",
        source_asset.to_str().unwrap(),
        None,
        None, // Pass 1 content_hash is NULL until Pass 2
        "ok",
        None,
        now,
        now,
    ).unwrap();

    // 1. Clean Symlink (Linked)
    let clean_symlink_path = project_dir.join("clean_symlink.md");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&source_asset, &clean_symlink_path).unwrap();

    let clean_symlink_id = store.upsert_link(
        asset_id,
        dest_root_id,
        clean_symlink_path.to_str().unwrap(),
        "symlink",
        &source_hash,
        None,
        now,
        None,
    ).unwrap();

    // 2. Drifted Tracked Copy (Drifted: Source advances on disk after link creation)
    let drifted_source_asset = source_dir.join("drifted_source_skill.md");
    let drifted_source_v1 = "# Drifted Source Skill v1";
    std::fs::write(&drifted_source_asset, drifted_source_v1).unwrap();
    let drifted_source_v1_hash = blake3::hash(drifted_source_v1.as_bytes()).to_hex().to_string();

    let drifted_asset_id = store.upsert_asset(
        source_root_id,
        None,
        "skill",
        "global",
        "drifted_source_skill.md",
        drifted_source_asset.to_str().unwrap(),
        None,
        None,
        "ok",
        None,
        now,
        now,
    ).unwrap();

    let drifted_copy_path = project_dir.join("drifted_copy.md");
    std::fs::write(&drifted_copy_path, drifted_source_v1).unwrap();

    let drifted_copy_id = store.upsert_link(
        drifted_asset_id,
        dest_root_id,
        drifted_copy_path.to_str().unwrap(),
        "tracked_copy",
        &drifted_source_v1_hash,
        Some(&drifted_source_v1_hash),
        now,
        None,
    ).unwrap();

    // Source advances on disk after link creation:
    let drifted_source_v2 = "# Drifted Source Skill v2 (Source Advanced)";
    std::fs::write(&drifted_source_asset, drifted_source_v2).unwrap();

    // 3. Broken Symlink (Broken)
    let broken_symlink_path = project_dir.join("broken_symlink.md");
    let non_existent_target = root.join("non_existent_file.md");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&non_existent_target, &broken_symlink_path).unwrap();

    let broken_symlink_id = store.upsert_link(
        asset_id,
        dest_root_id,
        broken_symlink_path.to_str().unwrap(),
        "symlink",
        &source_hash,
        None,
        now,
        None,
    ).unwrap();

    // 4. Foreign Symlink (Foreign)
    let foreign_symlink_path = project_dir.join("foreign_symlink.md");
    #[cfg(unix)]
    std::os::unix::fs::symlink(&foreign_target, &foreign_symlink_path).unwrap();

    let foreign_symlink_id = store.upsert_link(
        asset_id,
        dest_root_id,
        foreign_symlink_path.to_str().unwrap(),
        "symlink",
        &source_hash,
        None,
        now,
        None,
    ).unwrap();

    LinkFixturePaths {
        db_path,
        project_dir,
        clean_symlink_id,
        drifted_copy_id,
        broken_symlink_id,
        foreign_symlink_id,
        source_dir,
    }
}

#[test]
fn test_pass_2_link_resolution_via_scan_path() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    let scanner = DirectoryScanner {
        db_path: fixtures.db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let _res = scanner.scan(&fixtures.project_dir).unwrap();

    let store = tauri_app_lib::preferences::PreferencesStore::new(&fixtures.db_path).unwrap();
    let links = store.get_hydrated_links().unwrap();

    let clean_link = links.iter().find(|l| l.id == fixtures.clean_symlink_id).unwrap();
    let drifted_link = links.iter().find(|l| l.id == fixtures.drifted_copy_id).unwrap();
    let broken_link = links.iter().find(|l| l.id == fixtures.broken_symlink_id).unwrap();
    let foreign_link = links.iter().find(|l| l.id == fixtures.foreign_symlink_id).unwrap();

    let clean_source_now = std::fs::read(&clean_link.source_path).ok()
        .map(|c| blake3::hash(&c).to_hex().to_string());
    let clean_state = tauri_app_lib::domain::resolve_state(
        clean_link,
        clean_source_now.as_deref(),
        clean_link.last_verified_at.is_some(),
        std::fs::read_link(&clean_link.dest_path).ok().as_deref(),
    );

    let drifted_source_now = std::fs::read(&drifted_link.source_path).ok()
        .map(|c| blake3::hash(&c).to_hex().to_string());
    let drifted_state = tauri_app_lib::domain::resolve_state(
        drifted_link,
        drifted_source_now.as_deref(),
        std::path::Path::new(&drifted_link.dest_path).exists(),
        std::fs::read_link(&drifted_link.dest_path).ok().as_deref(),
    );
    let broken_state = tauri_app_lib::domain::resolve_state(
        broken_link,
        Some(&broken_link.source_hash),
        std::path::Path::new(&broken_link.dest_path).exists(),
        std::fs::read_link(&broken_link.dest_path).ok().as_deref(),
    );
    let foreign_state = tauri_app_lib::domain::resolve_state(
        foreign_link,
        Some(&foreign_link.source_hash),
        std::path::Path::new(&foreign_link.dest_path).exists(),
        std::fs::read_link(&foreign_link.dest_path).ok().as_deref(),
    );

    assert_eq!(clean_state, tauri_app_lib::domain::LinkState::Linked, "Expected Linked state for clean symlink");
    assert_eq!(drifted_state, tauri_app_lib::domain::LinkState::Drifted, "Expected Drifted state for modified tracked copy");
    assert_eq!(broken_state, tauri_app_lib::domain::LinkState::Broken, "Expected Broken state for non-existent target symlink");
    assert_eq!(foreign_state, tauri_app_lib::domain::LinkState::Foreign, "Expected Foreign state for target path mismatch symlink");

    // Pass 2 must have written last_verified_at timestamp to database
    assert!(clean_link.last_verified_at.is_some(), "Pass 2 must set last_verified_at for resolved links");
}

#[test]
fn test_pass_2_cancellation_preserves_pass_1_rows() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    // Scanner with cancellation token set to true (cancelling before / during Pass 2)
    let scanner = DirectoryScanner {
        db_path: fixtures.db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(true)),
    };

    let _res = scanner.scan(&fixtures.project_dir);

    let store = tauri_app_lib::preferences::PreferencesStore::new(&fixtures.db_path).unwrap();

    // 1. Assert Pass 1 asset rows exist in assets table
    let skill_count = store.count_assets_by_category("skill").unwrap();
    assert!(skill_count > 0, "Pass 1 asset rows must remain intact in assets table after cancellation");

    // 2. Assert Pass 1 asset rows have content_hash = NULL
    let conn = store.connect().unwrap();
    let mut stmt = conn.prepare("SELECT content_hash FROM assets WHERE category = 'skill'").unwrap();
    let hashes: Vec<Option<String>> = stmt.query_map([], |r| r.get(0)).unwrap().filter_map(|r| r.ok()).collect();
    assert!(!hashes.is_empty(), "Pass 1 asset rows must be present in database");
    for h in &hashes {
        assert_eq!(*h, None, "Pass 1 asset content_hash must remain NULL after pass-2 cancellation");
    }
}

#[test]
fn test_watcher_registration_tracked_copy_only() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    let watcher = tauri_app_lib::watcher::TrackedCopyWatcher::new(fixtures.db_path.clone());
    let reg_count = watcher.refresh_registrations().unwrap();

    assert_eq!(reg_count, 1, "Only tracked_copy source paths must be registered");

    let clean_source = fixtures.source_dir.join("source_skill.md");
    let drifted_source = fixtures.source_dir.join("drifted_source_skill.md");

    assert!(watcher.is_path_registered(&drifted_source), "tracked_copy source path must be registered");

    assert!(!watcher.is_path_registered(&clean_source), "symlink-only source path must NOT be registered");
}

#[test]
fn test_watcher_source_modification_unit_logic() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    let watcher = tauri_app_lib::watcher::TrackedCopyWatcher::new(fixtures.db_path.clone());
    watcher.refresh_registrations().unwrap();

    let clean_source = fixtures.source_dir.join("source_skill.md");
    let drifted_source = fixtures.source_dir.join("drifted_source_skill.md");

    // Modifying tracked_copy source triggers state rederivation (Linked -> Drifted)
    let state_opt = watcher.handle_path_change(&drifted_source);
    assert_eq!(state_opt, Some(tauri_app_lib::domain::LinkState::Drifted), "Tracked copy source change must trigger state re-derivation");

    // Modifying symlink-only source produces NO event / no rederivation
    let symlink_event = watcher.handle_path_change(&clean_source);
    assert_eq!(symlink_event, None, "Symlink-only source change must produce NO watcher event");
}

#[test]
fn test_watcher_debounce_unit_logic() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    let watcher = tauri_app_lib::watcher::TrackedCopyWatcher::new(fixtures.db_path.clone());
    watcher.refresh_registrations().unwrap();

    let drifted_source = fixtures.source_dir.join("drifted_source_skill.md");

    // First event: processed
    let event1 = watcher.handle_path_change(&drifted_source);
    assert!(event1.is_some());

    // Second rapid event within WATCHER_DEBOUNCE_DURATION (500ms): debounced (ignored)
    let event2 = watcher.handle_path_change(&drifted_source);
    assert_eq!(event2, None, "Second event within WATCHER_DEBOUNCE_DURATION must be debounced");

    assert_eq!(watcher.rederivation_count(), 1, "Debounce must produce exactly 1 state re-derivation execution");
}

#[test]
fn test_watcher_notify_integration_real_file_events() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    let mut watcher = tauri_app_lib::watcher::TrackedCopyWatcher::new(fixtures.db_path.clone());
    watcher.start_active_watcher().expect("Failed to start active notify watcher");

    let drifted_source = fixtures.source_dir.join("drifted_source_skill.md");

    // Write real file edit to disk to fire real OS notify event
    std::fs::write(&drifted_source, "# Real Notify Event Source Content v3").unwrap();

    // Poll with timeout for real notify event dispatch and state re-derivation in database
    let start = std::time::Instant::now();
    let timeout = std::time::Duration::from_millis(2500);
    let mut updated = false;

    let store = tauri_app_lib::preferences::PreferencesStore::new(&fixtures.db_path).unwrap();

    while start.elapsed() < timeout {
        let links = store.get_hydrated_links().unwrap();
        if let Some(link) = links.iter().find(|l| l.id == fixtures.drifted_copy_id) {
            let source_now = std::fs::read(&link.source_path).ok().map(|c| blake3::hash(&c).to_hex().to_string());
            let state = tauri_app_lib::domain::resolve_state(
                link,
                source_now.as_deref(),
                std::path::Path::new(&link.dest_path).exists(),
                std::fs::read_link(&link.dest_path).ok().as_deref(),
            );
            if state == tauri_app_lib::domain::LinkState::Drifted {
                updated = true;
                break;
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    assert!(updated, "Real notify watcher file modification event must trigger state re-derivation within timeout");
}

#[test]
fn test_watcher_callback_panic_does_not_poison_scanner() {
    let temp_dir = tempfile::tempdir().unwrap();
    let fixtures = setup_link_test_fixtures(temp_dir.path());

    // TrackedCopyWatcher re-derivation is isolated by construction (operates on PreferencesStore directly).
    // This test verifies that even if an unhandled panic occurs in a callback thread,
    // ScanManager lock recovery allows subsequent scans to start cleanly.
    let handle = std::thread::spawn(|| {
        panic!("Simulated watcher callback panic");
    });
    let _ = handle.join();

    let scanner = tauri_app_lib::scanner::DirectoryScanner {
        db_path: fixtures.db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let res = scanner.scan(&fixtures.project_dir);
    assert!(res.is_ok(), "Scan must start and complete successfully after watcher callback panic");
}

#[test]
fn test_count_assets_ground_truth() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("sec5_count_test.db");

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let _res = scanner.scan(root_path).unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();

    assert_eq!(counts.skill, Some(tauri_app_lib::domain::CategoryCount { total: 4, global: 0, project: 4 }));
    assert_eq!(counts.rule, Some(tauri_app_lib::domain::CategoryCount { total: 3, global: 0, project: 3 }));
    // 2 global + 3 project (Local Research Agent under .claude/agents/, Shared
    // Reviewer under .agents/, and the failed broken_subagent.md decoy).
    assert_eq!(counts.subagent, Some(tauri_app_lib::domain::CategoryCount { total: 5, global: 2, project: 3 }));
    // 4 global + 3 project (project-local-tool under .agents/, claude-project-tool
    // under .claude/, and the failed src/ai/mcp.json decoy).
    assert_eq!(counts.tool, Some(tauri_app_lib::domain::CategoryCount { total: 7, global: 4, project: 3 }));

    assert_eq!(counts.total_assets, 19, "total_assets must equal arithmetic sum 19");
}

#[test]
fn test_count_assets_undetected_category_returns_none() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("sec5_none_test.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let root_id = store.upsert_root("project", temp_dir.path().to_str().unwrap(), None, "test", now).unwrap();
    let _ = store.upsert_asset(root_id, None, "rule", "project", "AGENTS.md", "path", None, None, "ok", None, now, now).unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();

    assert_eq!(counts.rule, Some(tauri_app_lib::domain::CategoryCount { total: 1, global: 0, project: 1 }));
    assert_eq!(counts.skill, None, "Undetected category 'skill' must return None");
    assert_eq!(counts.subagent, None, "Undetected category 'subagent' must return None");
    assert_eq!(counts.tool, None, "Undetected category 'tool' must return None");
    assert_eq!(counts.total_assets, 1);
}

#[test]
fn test_count_assets_failed_parse_rows_included() {
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("sec5_failed_test.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let root_id = store.upsert_root("project", temp_dir.path().to_str().unwrap(), None, "test", now).unwrap();
    let _ = store.upsert_asset(root_id, None, "skill", "project", "ok-skill", "p1", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, None, "skill", "project", "broken-skill", "p2", None, None, "failed", Some("Syntax error"), now, now).unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();

    assert_eq!(counts.skill, Some(tauri_app_lib::domain::CategoryCount { total: 2, global: 0, project: 2 }), "Failed parse asset rows MUST be included in category counts");
    assert_eq!(counts.total_assets, 2);
}

#[test]
fn grouped_counts_distinct_servers_and_per_registration_counts_rows() {
    // ~/.claude.json declaring the same server twice is one server, two
    // registrations. Counting rows under Grouped is the 23-vs-7 class.
    //
    // Registration identity is `config_path:server_name` (RegistrationKey,
    // domain.rs), which is what upsert_asset keys `abs_path` on. All three
    // rows share one scope so the fixture stays about the grouping question
    // alone; a server split across scopes is a real question the brief does
    // not pose a test for, and this test does not invent an answer to it.
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("grouping_test.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let root_id = store.upsert_root("project", temp_dir.path().to_str().unwrap(), None, "test", now).unwrap();
    let _ = store.upsert_asset(root_id, None, "tool", "project", "github", "/home/.claude.json:github", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, None, "tool", "project", "github", "/repo/.mcp.json:github", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, None, "tool", "project", "linear", "/home/.claude.json:linear", None, None, "ok", None, now, now).unwrap();

    let grouped = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::Grouped).unwrap();
    assert_eq!(grouped.tool.unwrap().total, 2, "two distinct server names");

    let per_reg = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();
    assert_eq!(per_reg.tool.unwrap().total, 3, "three rows in the assets table");
}

#[test]
fn grouped_counts_one_server_however_many_engines_register_it() {
    // `tauri` is registered in four engines on the development machine and
    // renders as ONE row. A count that says 4 disagrees with the list beneath
    // it, which is the 23-vs-7 defect at a smaller scale. GROUP BY includes
    // `engine_id`, so distinct-name counting done per bucket and then summed
    // across buckets double(here, triple-)counts a name that spans engines.
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("grouping_engines_test.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let root_id = store.upsert_root("project", temp_dir.path().to_str().unwrap(), None, "test", now).unwrap();
    let engine_a = store.upsert_engine("engine-a", "Engine A", "/engine-a", now).unwrap();
    let engine_b = store.upsert_engine("engine-b", "Engine B", "/engine-b", now).unwrap();
    let engine_c = store.upsert_engine("engine-c", "Engine C", "/engine-c", now).unwrap();
    let _ = store.upsert_asset(root_id, Some(engine_a), "tool", "project", "tauri", "/engine-a/config.json:tauri", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, Some(engine_b), "tool", "project", "tauri", "/engine-b/config.json:tauri", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, Some(engine_c), "tool", "project", "tauri", "/engine-c/config.json:tauri", None, None, "ok", None, now, now).unwrap();

    let grouped = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::Grouped).unwrap();
    assert_eq!(grouped.tool.unwrap().total, 1, "one server, however many engines");
}

#[test]
fn a_server_in_both_scopes_is_one_server_and_the_scopes_do_not_sum() {
    // A server registered globally AND in a project is ONE server. `total`
    // therefore does not equal global + project, and that is the point rather
    // than an arithmetic slip: spanning both places is the finding the list
    // exists to surface. A later reader "fixing" the sum reintroduces the
    // double-count this whole task removed. Pins the ruling recorded in
    // count_distinct_tools's doc comment, per verification.md: a ruling
    // recorded is not a ruling executed without a control that would fail
    // if the sum crept back in.
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("grouping_scopes_test.db");
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();

    let now = 1700000000;
    let root_id = store.upsert_root("project", temp_dir.path().to_str().unwrap(), None, "test", now).unwrap();
    let _ = store.upsert_asset(root_id, None, "tool", "global", "tauri", "/home/.claude.json:tauri", None, None, "ok", None, now, now).unwrap();
    let _ = store.upsert_asset(root_id, None, "tool", "project", "tauri", "/repo/.mcp.json:tauri", None, None, "ok", None, now, now).unwrap();

    let g = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::Grouped).unwrap().tool.unwrap();
    assert_eq!(g.total, 1, "one server, two scopes");
    assert_eq!(g.global, 1);
    assert_eq!(g.project, 1);
    assert_ne!(g.total, g.global + g.project, "deliberate: 1 != 2");
}

#[test]
fn test_count_assets_arithmetic_sum() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("sec5_sum_test.db");

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let _res = scanner.scan(root_path).unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();

    let sum = counts.skill.as_ref().map(|c| c.total).unwrap_or(0)
        + counts.rule.as_ref().map(|c| c.total).unwrap_or(0)
        + counts.subagent.as_ref().map(|c| c.total).unwrap_or(0)
        + counts.tool.as_ref().map(|c| c.total).unwrap_or(0);

    assert_eq!(counts.total_assets, sum, "total_assets MUST equal arithmetic sum of active category totals");
}

#[test]
fn test_count_assets_deduplicates_symlinked_root_folders() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let home_dir = temp_dir.path().join("home");
    let db_path = temp_dir.path().join("symlink_root_test.db");

    let agents_dir = home_dir.join(".agents");
    let skills_dir = agents_dir.join("skills").join("shared");
    std::fs::create_dir_all(&skills_dir).unwrap();

    let skill_file = skills_dir.join("SKILL.md");
    std::fs::write(&skill_file, "---\nname: shared-skill\ndescription: Test shared skill\n---\n# Shared Skill").unwrap();

    #[cfg(unix)]
    std::os::unix::fs::symlink(&agents_dir, home_dir.join(".claude")).unwrap();

    std::env::set_var("HANGER_TEST_HOME", home_dir.to_str().unwrap());

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let _res = scanner.scan(&home_dir).unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();

    assert_eq!(
        counts.skill.map(|c| c.total),
        Some(1),
        "Shared skill reachable via symlinked root .claude -> .agents MUST be counted ONCE"
    );
}

#[test]
fn test_count_assets_broken_symlink_fallback() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let home_dir = temp_dir.path().join("home");
    let db_path = temp_dir.path().join("broken_symlink_test.db");

    let agents_dir = home_dir.join(".agents");
    let skills_dir = agents_dir.join("skills");
    std::fs::create_dir_all(&skills_dir).unwrap();

    // Create broken symlink pointing to non-existent target
    let broken_symlink_path = skills_dir.join("broken-skill-dir");
    #[cfg(unix)]
    std::os::unix::fs::symlink(skills_dir.join("non-existent-target"), &broken_symlink_path).unwrap();

    std::env::set_var("HANGER_TEST_HOME", home_dir.to_str().unwrap());

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    // Scan must not crash or fail when encountering broken symlink
    let res = scanner.scan(&home_dir);
    assert!(res.is_ok(), "Scanner MUST handle broken symlinks gracefully without crashing");
}

#[test]
fn test_inventory_failed_assets_returned() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("inventory_failed_assets.db");

    let project_dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project");

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let inventory = scanner.scan(&project_dir).expect("Scan should succeed");

    // Query database directly to derive expected failed asset count from committed fixtures
    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let expected_failed_count = store.count_assets_by_parse_status("failed").unwrap();
    assert!(expected_failed_count > 0, "Fixtures must contain failed assets in DB");

    // Collect all failed items in returned inventory
    let failed_skills: Vec<_> = inventory.skills.iter().filter(|s| s.parse_status.as_deref() == Some("failed")).collect();
    let failed_tools: Vec<_> = inventory.tools.iter().filter(|t| t.parse_status.as_deref() == Some("failed")).collect();
    let failed_subagents: Vec<_> = inventory.subagents.iter().filter(|sa| sa.parse_status.as_deref() == Some("failed")).collect();
    let failed_rules: Vec<_> = inventory.rules.iter().filter(|r| r.parse_status.as_deref() == Some("failed")).collect();

    let total_returned_failed = failed_skills.len() + failed_tools.len() + failed_subagents.len() + failed_rules.len();

    // Verify each returned failed asset carries parse_status and parse_error
    for item in &failed_skills {
        assert_eq!(item.parse_status.as_deref(), Some("failed"));
        assert!(item.parse_error.is_some() && !item.parse_error.as_ref().unwrap().is_empty());
    }
    for item in &failed_tools {
        assert_eq!(item.parse_status.as_deref(), Some("failed"));
        assert!(item.parse_error.is_some() && !item.parse_error.as_ref().unwrap().is_empty());
    }
    for item in &failed_subagents {
        assert_eq!(item.parse_status.as_deref(), Some("failed"));
        assert!(item.parse_error.is_some() && !item.parse_error.as_ref().unwrap().is_empty());
    }

    assert_eq!(
        total_returned_failed, expected_failed_count as usize,
        "Returned inventory must include all failed assets recorded in database"
    );
}

#[test]
fn test_fixtures_directories_not_scanned() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let proj_root = temp_dir.path().join("my_proj");
    let db_path = temp_dir.path().join("fixtures_scan.db");

    // Valid skill in project
    let valid_skill_dir = proj_root.join(".agents/skills/valid-skill");
    std::fs::create_dir_all(&valid_skill_dir).unwrap();
    std::fs::write(
        valid_skill_dir.join("SKILL.md"),
        "---\nname: valid-skill\ndescription: Valid skill\n---\n",
    )
    .unwrap();

    // Fixture skill beneath project root (should NOT be scanned)
    let fixture_skill_dir = proj_root.join("fixtures/.agents/skills/fixture-skill");
    std::fs::create_dir_all(&fixture_skill_dir).unwrap();
    std::fs::write(
        fixture_skill_dir.join("SKILL.md"),
        "---\nname: fixture-skill\ndescription: Fixture skill\n---\n",
    )
    .unwrap();

    // Nested fixture skill beneath sub directory (should NOT be scanned)
    let nested_fixture_dir = proj_root.join("sub/fixtures/.agents/skills/nested-fixture-skill");
    std::fs::create_dir_all(&nested_fixture_dir).unwrap();
    std::fs::write(
        nested_fixture_dir.join("SKILL.md"),
        "---\nname: nested-fixture-skill\ndescription: Nested fixture skill\n---\n",
    )
    .unwrap();

    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    // Behavior (i): Scanning project root MUST NOT descend into fixtures/ subdirectories
    let proj_inv = scanner.scan(&proj_root).expect("Scan should succeed");
    let proj_skill_names: Vec<_> = proj_inv.skills.iter().map(|s| s.name.as_str()).collect();

    assert!(
        proj_skill_names.contains(&"valid-skill"),
        "Project scan must return valid-skill from project root"
    );
    assert!(
        !proj_skill_names.contains(&"fixture-skill"),
        "Project scan MUST NOT return fixture-skill from fixtures/ subdirectory"
    );
    assert!(
        !proj_skill_names.contains(&"nested-fixture-skill"),
        "Project scan MUST NOT return nested-fixture-skill from sub/fixtures/ subdirectory"
    );

    // Behavior (ii): Scanning a fixtures directory directly AS the target root MUST continue to work
    let direct_fixture_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project");
    let direct_inv = scanner.scan(&direct_fixture_root).expect("Direct fixture root scan should succeed");
    assert!(
        !direct_inv.skills.is_empty(),
        "Scanning a fixtures directory AS the root MUST return assets within it"
    );
}

#[test]
fn test_reap_stale_assets_after_scan() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_ENABLE_REAP", "1");
    let temp_dir = tempfile::tempdir().unwrap();
    let proj_root = temp_dir.path().join("reap_proj");
    let db_path = temp_dir.path().join("reap_test.db");

    // Create 2 valid skills
    let skill1_dir = proj_root.join(".agents/skills/skill-1");
    let skill2_dir = proj_root.join(".agents/skills/skill-2");
    std::fs::create_dir_all(&skill1_dir).unwrap();
    std::fs::create_dir_all(&skill2_dir).unwrap();
    std::fs::write(
        skill1_dir.join("SKILL.md"),
        "---\nname: skill-1\ndescription: Skill One\n---\n",
    )
    .unwrap();
    std::fs::write(
        skill2_dir.join("SKILL.md"),
        "---\nname: skill-2\ndescription: Skill Two\n---\n",
    )
    .unwrap();

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    // First scan: should discover 2 skills
    let inv1 = scanner.scan(&proj_root).expect("Scan 1 should succeed");
    assert_eq!(inv1.skills.len(), 2, "First scan must return 2 skills");

    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let counts_before = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();
    let initial_skills_count = counts_before.skill.as_ref().unwrap().total;
    assert_eq!(initial_skills_count, 2, "DB asset count for skills must be 2 after scan 1");

    // Remove skill-2 directory
    std::fs::remove_dir_all(&skill2_dir).unwrap();

    // Second scan: should discover only 1 skill, and reap the row for skill-2 from assets table
    let inv2 = scanner.scan(&proj_root).expect("Scan 2 should succeed");
    assert_eq!(inv2.skills.len(), 1, "Second scan must return 1 skill");

    let counts_after = tauri_app_lib::scanner::count_assets(&db_path, None, Grouping::PerRegistration).unwrap();
    let after_skills_count = counts_after.skill.as_ref().map(|c| c.total).unwrap_or(0);
    assert_eq!(
        after_skills_count,
        initial_skills_count - 1,
        "DB asset count for skills must fall by 1 after scan 2"
    );

    // Verify row for skill-2 is gone from `assets` table
    let conn = store.connect().unwrap();
    let stale_row_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM assets WHERE name = 'skill-2'",
            [],
            |r| r.get(0),
        )
        .unwrap();
    assert_eq!(stale_row_count, 0, "Stale asset row for skill-2 must be reaped from assets table");
}

#[test]
fn test_count_assets_engine_breakdown() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("engine_count_test.db");

    let fixture_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/project");
    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    scanner.scan(&fixture_root).expect("Scan of fixture root should succeed");

    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();

    let root_str = fixture_root.to_str().unwrap();
    let expected_null_count: usize = conn
        .query_row(
            "SELECT COUNT(*) FROM assets LEFT JOIN roots rts ON assets.root_id = rts.id WHERE category != 'agent' AND rts.abs_path = ?1 AND assets.engine_id IS NULL",
            [root_str],
            |r| r.get(0),
        )
        .unwrap();

    let counts = tauri_app_lib::scanner::count_assets(&db_path, Some(root_str), Grouping::PerRegistration)
        .expect("count_assets should succeed");

    let engines_map = counts
        .engines
        .expect("count_assets MUST return a per-engine breakdown");

    let null_bucket_count = engines_map
        .get("none")
        .copied()
        .expect("engines breakdown MUST include a 'none' bucket for engine_id IS NULL");

    assert_eq!(
        null_bucket_count, expected_null_count,
        "Engine breakdown 'none' bucket count MUST match SQL query count for engine_id IS NULL"
    );
}

#[test]
fn test_partial_walk_does_not_reap() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_ENABLE_REAP", "1");
    let temp_dir = tempfile::tempdir().unwrap();
    let db_path = temp_dir.path().join("partial_walk_test.db");
    let proj_root = temp_dir.path().join("project");

    let skill1_dir = proj_root.join(".agents/skills/skill-1");
    let skill2_dir = proj_root.join(".agents/skills/skill-2");
    std::fs::create_dir_all(&skill1_dir).unwrap();
    std::fs::create_dir_all(&skill2_dir).unwrap();
    std::fs::write(
        skill1_dir.join("SKILL.md"),
        "---\nname: skill-1\ndescription: Skill One\n---\n",
    )
    .unwrap();
    std::fs::write(
        skill2_dir.join("SKILL.md"),
        "---\nname: skill-2\ndescription: Skill Two\n---\n",
    )
    .unwrap();

    let scanner = DirectoryScanner {
        db_path: db_path.clone(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    // Scan 1: discovers both skills
    let inv1 = scanner.scan(&proj_root).expect("Scan 1 should succeed");
    assert_eq!(inv1.skills.len(), 2, "First scan must discover 2 skills");

    let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
    let conn = store.connect().unwrap();
    let initial_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets WHERE name = 'skill-2'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(initial_count, 1, "skill-2 must exist in DB after scan 1");

    // Make skill2_dir unreadable to simulate a partial walk skip due to permission error
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&skill2_dir, std::fs::Permissions::from_mode(0o000)).unwrap();
    }

    // Scan 2: partial walk encounters permission error on skill-2
    let _inv2 = scanner.scan(&proj_root);

    // Restore permissions so cleanup succeeds
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&skill2_dir, std::fs::Permissions::from_mode(0o755));
    }

    // Asset row for skill-2 MUST NOT be reaped because the walk was partial / contained skips
    let count_after: i64 = conn
        .query_row("SELECT COUNT(*) FROM assets WHERE name = 'skill-2'", [], |r| r.get(0))
        .unwrap();
    assert_eq!(
        count_after, 1,
        "A partial walk with skipped entries MUST NOT reap assets"
    );
}

#[test]
fn test_deepest_linked_root_owns_asset() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let outer_dir = std::fs::canonicalize(Path::new("tests/fixtures/project")).unwrap();
    let inner_dir = std::fs::canonicalize(Path::new("tests/fixtures/project/src/ai")).unwrap();

    let outer_str = outer_dir.to_string_lossy().to_string();
    let inner_str = inner_dir.to_string_lossy().to_string();

    // Run order 1: Scan Outer first, then Scan Inner
    {
        let db_dir = tempfile::tempdir().unwrap();
        let db_path = db_dir.path().join("hanger_order1.db");
        let scanner = DirectoryScanner {
            db_path: db_path.clone(),
            cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };

        scanner.scan(&outer_dir).unwrap();
        scanner.scan(&inner_dir).unwrap();

        let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
        let conn = store.connect().unwrap();

        let outer_root_id: i64 = conn
            .query_row("SELECT id FROM roots WHERE abs_path = ?1", [&outer_str], |r| r.get(0))
            .unwrap();
        let inner_root_id: i64 = conn
            .query_row("SELECT id FROM roots WHERE abs_path = ?1", [&inner_str], |r| r.get(0))
            .unwrap();

        let inner_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1 AND scope = 'project'", [inner_root_id], |r| r.get(0))
            .unwrap();
        let outer_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1 AND scope = 'project'", [outer_root_id], |r| r.get(0))
            .unwrap();

        assert_eq!(inner_count, 3, "Order 1: Inner root must own exactly 3 assets under src/ai");
        assert_eq!(outer_count, 10, "Order 1: Outer root must own exactly 10 assets outside src/ai");
    }

    // Run order 2: Scan Inner first, then Scan Outer
    {
        let db_dir = tempfile::tempdir().unwrap();
        let db_path = db_dir.path().join("hanger_order2.db");
        let scanner = DirectoryScanner {
            db_path: db_path.clone(),
            cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };

        scanner.scan(&inner_dir).unwrap();
        scanner.scan(&outer_dir).unwrap();

        let store = tauri_app_lib::preferences::PreferencesStore::new(&db_path).unwrap();
        let conn = store.connect().unwrap();

        let outer_root_id: i64 = conn
            .query_row("SELECT id FROM roots WHERE abs_path = ?1", [&outer_str], |r| r.get(0))
            .unwrap();
        let inner_root_id: i64 = conn
            .query_row("SELECT id FROM roots WHERE abs_path = ?1", [&inner_str], |r| r.get(0))
            .unwrap();

        let inner_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1 AND scope = 'project'", [inner_root_id], |r| r.get(0))
            .unwrap();
        let outer_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM assets WHERE root_id = ?1 AND scope = 'project'", [outer_root_id], |r| r.get(0))
            .unwrap();

        assert_eq!(inner_count, 3, "Order 2: Inner root must own exactly 3 assets under src/ai");
        assert_eq!(outer_count, 10, "Order 2: Outer root must own exactly 10 assets outside src/ai");
    }
}

#[test]
fn test_broad_root_reaches_nested_agent_directories() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let temp = tempfile::tempdir().unwrap();
    let broad_root = temp.path().join("broad_root");
    fs::create_dir_all(&broad_root).unwrap();

    for i in 0..51 {
        fs::create_dir_all(broad_root.join(format!("dummy_dir_{}", i))).unwrap();
    }

    let deep_skill_dir = broad_root.join("sub1/sub2/sub3/.agents/skills/deep-skill");
    fs::create_dir_all(&deep_skill_dir).unwrap();
    fs::write(
        deep_skill_dir.join("SKILL.md"),
        "---\nname: deep-skill\ndescription: Deep skill test\n---\n# Deep Skill\n",
    )
    .unwrap();

    let db_path = temp.path().join("test_broad.db");
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let inventory = scanner.scan(&broad_root).expect("Scan should complete");

    assert!(
        inventory.skills.iter().any(|s| s.name == "deep-skill"),
        "Broad root scan MUST discover skills located 7 components deep inside agent directories"
    );
}

/// `engine_for_path` only requires a root to appear *somewhere* in the path,
/// which is right for skills/rules/tools but was accidentally reused for
/// subagent ownership too: `.claude/plugins/foo/agents/bar.md` would resolve
/// as a Claude Code subagent even though the `agents` directory is nested
/// under a plugin, not a direct child of `.claude`. The old
/// `contains("/.claude/agents/")` chain required contiguity by construction;
/// `subagent_owner_for_path` (agent_attribution_tests.rs pins the function
/// directly) restores it. This is the same check exercised end to end
/// through a real scan, so a regression in the scanner's wiring -- not just
/// the function -- would still be caught.
#[test]
fn test_nested_plugin_agents_dir_is_not_attributed_as_a_subagent() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().join("project");
    fs::create_dir_all(&root).unwrap();

    // Direct: agents/ sits right under .claude/ -- a real user subagent.
    let direct_dir = root.join(".claude/agents");
    fs::create_dir_all(&direct_dir).unwrap();
    fs::write(
        direct_dir.join("direct-agent.md"),
        "---\nname: Direct Agent\ndescription: A real subagent directly under .claude/agents\n---\n",
    )
    .unwrap();

    // Nested: a plugin's own agents/ directory, several levels under .claude/.
    // Claude Code plugins legitimately ship an agents/ directory; it is not
    // the user's own subagent and must not be attributed to Claude Code.
    let nested_dir = root.join(".claude/plugins/some-plugin/agents");
    fs::create_dir_all(&nested_dir).unwrap();
    fs::write(
        nested_dir.join("nested-agent.md"),
        "---\nname: Nested Plugin Agent\ndescription: Ships inside a plugin, not a user subagent\n---\n",
    )
    .unwrap();

    let db_path = temp.path().join("test_nested_plugin.db");
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(&root).expect("Scan should complete");

    assert!(
        inventory.subagents.iter().any(|sa| sa.name == "Direct Agent"),
        "A subagent directly under .claude/agents/ must still be discovered"
    );
    assert!(
        !inventory.subagents.iter().any(|sa| sa.name == "Nested Plugin Agent"),
        "A plugin's own agents/ directory, nested under .claude/, must not be attributed as a Claude Code subagent"
    );
}

#[test]
fn test_skill_directory_contains_one_skill() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    fs::create_dir_all(&project).unwrap();

    let parent_skill_dir = project.join(".agents/skills/parent-skill");
    fs::create_dir_all(&parent_skill_dir).unwrap();
    fs::write(
        parent_skill_dir.join("SKILL.md"),
        "---\nname: parent-skill\ndescription: Parent skill\n---\n# Parent Skill\n",
    )
    .unwrap();

    let nested_example_dir = parent_skill_dir.join("examples/nested-example");
    fs::create_dir_all(&nested_example_dir).unwrap();
    fs::write(
        nested_example_dir.join("SKILL.md"),
        "---\nname: nested-example\ndescription: Nested example skill\n---\n# Nested Example\n",
    )
    .unwrap();

    let db_path = temp.path().join("test_nested.db");
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let inventory = scanner.scan(&project).expect("Scan should complete");

    assert_eq!(
        inventory.skills.len(),
        1,
        "A skill directory must contain only one skill; nested SKILL.md files below it are part of the parent skill"
    );
    assert_eq!(inventory.skills[0].name, "parent-skill");
}

#[test]
fn test_node_modules_is_not_scanned() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let temp = tempfile::tempdir().unwrap();
    let project = temp.path().join("project");
    fs::create_dir_all(&project).unwrap();

    let node_modules_skill = project.join("node_modules/my-pkg/skills/nm-skill");
    fs::create_dir_all(&node_modules_skill).unwrap();
    fs::write(
        node_modules_skill.join("SKILL.md"),
        "---\nname: nm-skill\ndescription: Node module skill\n---\n# NM Skill\n",
    )
    .unwrap();

    let valid_skill = project.join(".agents/skills/valid-skill");
    fs::create_dir_all(&valid_skill).unwrap();
    fs::write(
        valid_skill.join("SKILL.md"),
        "---\nname: valid-skill\ndescription: Valid skill\n---\n# Valid Skill\n",
    )
    .unwrap();

    let db_path = temp.path().join("test_nm.db");
    let scanner = DirectoryScanner {
        db_path,
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };

    let inventory = scanner.scan(&project).expect("Scan should complete");

    assert!(
        !inventory.skills.iter().any(|s| s.name == "nm-skill"),
        "node_modules MUST NOT be scanned for assets"
    );
    assert!(
        inventory.skills.iter().any(|s| s.name == "valid-skill"),
        "Valid skills outside node_modules MUST be discovered"
    );
}

#[test]
fn test_scans_of_a_root_do_not_run_concurrently() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    let temp_dir = tempfile::tempdir().unwrap();
    let proj_root = temp_dir.path().join("concurrent_proj");
    let db_path = temp_dir.path().join("concurrent_test.db");

    for i in 0..10 {
        let skill_dir = proj_root.join(format!(".agents/skills/skill-{}", i));
        std::fs::create_dir_all(&skill_dir).unwrap();
        std::fs::write(
            skill_dir.join("SKILL.md"),
            format!("---\nname: skill-{}\ndescription: Skill {}\n---\n", i, i),
        )
        .unwrap();
    }

    let active_concurrent = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let max_concurrent = std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0));

    let proj_root_clone = proj_root.clone();
    let db_path_clone1 = db_path.clone();
    let active1 = active_concurrent.clone();
    let max1 = max_concurrent.clone();

    let t1 = std::thread::spawn(move || {
        let scanner = DirectoryScanner {
            db_path: db_path_clone1,
            cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        let _ = scanner.scan_with_progress(&proj_root_clone, |_, _, _| {
            let current = active1.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let mut prev_max = max1.load(std::sync::atomic::Ordering::SeqCst);
            while current > prev_max {
                match max1.compare_exchange_weak(prev_max, current, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst) {
                    Ok(_) => break,
                    Err(actual) => prev_max = actual,
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
            active1.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        });
    });

    let proj_root_clone2 = proj_root.clone();
    let db_path_clone2 = db_path.clone();
    let active2 = active_concurrent.clone();
    let max2 = max_concurrent.clone();

    let t2 = std::thread::spawn(move || {
        let scanner = DirectoryScanner {
            db_path: db_path_clone2,
            cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        };
        let _ = scanner.scan_with_progress(&proj_root_clone2, |_, _, _| {
            let current = active2.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1;
            let mut prev_max = max2.load(std::sync::atomic::Ordering::SeqCst);
            while current > prev_max {
                match max2.compare_exchange_weak(prev_max, current, std::sync::atomic::Ordering::SeqCst, std::sync::atomic::Ordering::SeqCst) {
                    Ok(_) => break,
                    Err(actual) => prev_max = actual,
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(50));
            active2.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
        });
    });

    t1.join().unwrap();
    t2.join().unwrap();

    assert_eq!(
        max_concurrent.load(std::sync::atomic::Ordering::SeqCst),
        1,
        "Scans of the same root must not run concurrently; max_concurrent was {}",
        max_concurrent.load(std::sync::atomic::Ordering::SeqCst)
    );
}

#[test]
fn test_count_tree_assets_shape() {
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let db_path = Path::new("tests/fixtures/home/hanger.db");
    let scanner = DirectoryScanner {
        db_path: db_path.to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let root_path = Path::new("tests/fixtures/project");
    let _ = scanner.scan(root_path);

    let tree_counts = tauri_app_lib::scanner::count_tree_assets(db_path)
        .expect("count_tree_assets should succeed");

    assert!(tree_counts.total > 0, "Tree total count should be greater than zero");
    assert!(tree_counts.global.total > 0, "Global total count should be > 0");
    assert_eq!(tree_counts.total, tree_counts.global.total + tree_counts.repositories_total);
    for cat in &tree_counts.global.categories {
        assert!(cat.count > 0, "Category count must be non-zero");
    }
    for repo in &tree_counts.repositories {
        for cat in &repo.categories {
            assert!(cat.count > 0, "Repo category count must be non-zero");
        }
    }
}

#[test]
fn test_match_protected_root_guards_engine_roots() {
    use std::path::PathBuf;
    use tauri_app_lib::scanner::match_protected_root;

    let temp = std::env::temp_dir().join("hanger_guard_test");
    let _ = std::fs::remove_dir_all(&temp);
    let engine_root = temp.join(".claude");
    std::fs::create_dir_all(engine_root.join("plugins")).unwrap();
    let elsewhere = temp.join("work");
    std::fs::create_dir_all(&elsewhere).unwrap();

    let protected = vec![(engine_root.clone(), "Claude Code's global configuration".to_string())];

    // The root itself and any path inside it are rejected
    assert!(match_protected_root(&engine_root, &protected).is_some());
    assert!(match_protected_root(&engine_root.join("plugins"), &protected).is_some());
    // Unrelated paths pass
    assert!(match_protected_root(&elsewhere, &protected).is_none());
    // A non-existent path with a protected prefix is still rejected (raw fallback)
    assert!(match_protected_root(&engine_root.join("nope"), &protected).is_some());

    let _ = std::fs::remove_dir_all(&temp);

    let _unused: Option<PathBuf> = None;
}

#[test]
fn a_parse_failure_is_not_a_link_state() {
    // Root-cause fix, ruled 2026-08-15: the scanner stamped
    // LinkState::Broken onto parse-failed assets, so the review pane filed
    // them as "Broken links · Target missing" instead of "Won't parse".
    // A parse failure carries parse_status; it says nothing about links.
    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();
    std::env::set_var("HANGER_TEST_HOME", "tests/fixtures/home");

    let scanner = DirectoryScanner {
        db_path: Path::new("tests/fixtures/home/hanger.db").to_path_buf(),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let inventory = scanner.scan(Path::new("tests/fixtures/project")).unwrap();

    let failed = inventory
        .skills
        .iter()
        .find(|s| s.parse_status.as_deref() == Some("failed"))
        .expect("the fixture set carries one parse-failed skill");
    assert_eq!(
        failed.link_state, None,
        "a parse failure must not wear a link state; it files under parse, not broken links"
    );
}

#[test]
fn denied_subdir_yields_one_permission_warning_not_zero_not_many() {
    // Root bypasses mode bits, so chmod 000 would not deny anything and this
    // test would assert on a warning that can never appear.
    if unsafe { libc::geteuid() } == 0 {
        eprintln!("skipping denied_subdir_yields_one_permission_warning_not_zero_not_many: running as root, mode bits do not deny");
        return;
    }

    let _guard = ENV_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap();

    // chmod 0o000 on a subdirectory makes the walk's read of it fail with
    // EACCES. (EPERM/TCC cannot be produced in a test; tccd owns it. The
    // classifier's EPERM branch is unit-tested in scanner.rs.)
    //
    // Two separately-blocked subdirectories, not one: a single unreadable
    // directory can't be descended into, so the walker yields exactly one
    // Err for it and even the old per-entry push would already look
    // deduplicated by coincidence. Two blocked dirs force two Err events
    // under the same root, which is what actually distinguishes "one
    // warning per failed entry" (old code, both entries stringify to the
    // same root-based message) from "one warning per root" (new code).
    let temp_dir = tempfile::tempdir().unwrap();
    let root = temp_dir.path();
    let blocked_dirs = ["blocked_a", "blocked_b"];
    for name in blocked_dirs {
        let blocked = root.join(name);
        fs::create_dir_all(blocked.join("nested")).unwrap();
        let mut perms = fs::metadata(&blocked).unwrap().permissions();
        use std::os::unix::fs::PermissionsExt;
        perms.set_mode(0o000);
        fs::set_permissions(&blocked, perms).unwrap();
    }

    std::env::set_var("HANGER_TEST_HOME", root.to_string_lossy().to_string());

    let scanner = DirectoryScanner {
        db_path: root.join("hanger.db"),
        cancellation_token: std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
    };
    let result = scanner.scan(root);

    // Restore so tempdir can clean up, before any assertion can early-return.
    use std::os::unix::fs::PermissionsExt;
    for name in blocked_dirs {
        let blocked = root.join(name);
        let mut perms = fs::metadata(&blocked).unwrap().permissions();
        perms.set_mode(0o755);
        fs::set_permissions(&blocked, perms).unwrap();
    }

    let inventory = result.unwrap();
    let warnings = &inventory.project_scans[0].parse_warnings;
    let denied: Vec<_> = warnings.iter().filter(|w| w.contains("Permission denied")).collect();
    assert_eq!(denied.len(), 1, "one warning per denied root, deduplicated: {:?}", warnings);
}
