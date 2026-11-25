//! The scan benchmark. `#[ignore]`d: it measures, it asserts nothing about
//! speed, and it takes seconds in debug. Run it on its own:
//!
//! ```text
//! cargo test --test scan_bench_tests -- --ignored --nocapture --test-threads=1
//! cargo test --release --test scan_bench_tests -- --ignored --nocapture --test-threads=1
//! ```
//!
//! Its own test binary because it sets `HANGER_TEST_HOME` (and clears the
//! config-directory variables), which are process-global; cargo gives each
//! test binary its own process.
//!
//! It times what a Rescan does: `scanner::scan_targets` over `""` plus each
//! linked directory, then `search::index_inventory`. "Cold" is the first
//! scan into a fresh database; "warm" is the rescan that follows on the same
//! database. Each run gets its own database, so the five cold figures are
//! five first scans. The filesystem is warm for all of them after the first.
//! CPU is this process's user + system time from `getrusage(RUSAGE_SELF)`.
//!
//! Sizes default to 300 skills, 100 subagents, 2 MCP configs and 6 linked
//! projects, and are set by `HANGER_BENCH_SKILLS`, `HANGER_BENCH_SUBAGENTS`,
//! `HANGER_BENCH_MCP_CONFIGS` and `HANGER_BENCH_PROJECTS`.
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri_app_lib::preferences::PreferencesStore;
use tauri_app_lib::scanner::{scan_targets, DirectoryScanner};

const RUNS: usize = 5;

/// Per linked project. Fixed rather than configurable: the real store had
/// 243 project assets over 10 linked directories on 2026-11-25, about 24
/// each, and this is in that range.
const PROJECT_SKILLS: usize = 20;
const PROJECT_SERVERS: usize = 2;
const PROJECT_PLAIN_FILES: usize = 30;

/// Servers per machine-level MCP config.
const SERVERS_PER_CONFIG: usize = 5;

fn knob(name: &str, default: usize) -> usize {
    match std::env::var(name) {
        Ok(v) => v.parse().unwrap_or_else(|_| panic!("{name}={v:?} is not a count")),
        Err(_) => default,
    }
}

/// Machine-level MCP config files, in the order `HANGER_BENCH_MCP_CONFIGS`
/// takes them. Each is a location the registry reads for that host.
fn write_mcp_config(home: &Path, index: usize) {
    let names: Vec<String> = (0..SERVERS_PER_CONFIG).map(|s| format!("bench-{index}-{s}")).collect();
    let json = |names: &[String]| {
        let entries: Vec<String> = names
            .iter()
            .map(|n| format!(r#""{n}":{{"command":"node","args":["server.js"]}}"#))
            .collect();
        format!(r#"{{"mcpServers":{{{}}}}}"#, entries.join(","))
    };
    match index {
        0 => fs::write(home.join(".claude.json"), json(&names)).unwrap(),
        1 => {
            fs::create_dir_all(home.join(".codex")).unwrap();
            let toml: String = names
                .iter()
                .map(|n| format!("[mcp_servers.{n}]\ncommand = \"node\"\nargs = [\"server.js\"]\n\n"))
                .collect();
            fs::write(home.join(".codex/config.toml"), toml).unwrap();
        }
        2 => {
            fs::create_dir_all(home.join(".gemini")).unwrap();
            fs::write(home.join(".gemini/settings.json"), json(&names)).unwrap();
        }
        3 => {
            fs::create_dir_all(home.join(".cursor")).unwrap();
            fs::write(home.join(".cursor/mcp.json"), json(&names)).unwrap();
        }
        _ => panic!("HANGER_BENCH_MCP_CONFIGS: at most 4 config files are defined"),
    }
}

fn skill(dir: &Path, name: &str) {
    let d = dir.join(name);
    fs::create_dir_all(&d).unwrap();
    fs::write(
        d.join("SKILL.md"),
        format!("---\nname: {name}\ndescription: Benchmark skill {name}.\n---\n\n# {name}\n\nBody text for the index.\n"),
    )
    .unwrap();
}

struct Fixture {
    _home: tempfile::TempDir,
    _projects: tempfile::TempDir,
    project_paths: Vec<PathBuf>,
    summary: String,
}

fn build_fixture() -> Fixture {
    let n_skills = knob("HANGER_BENCH_SKILLS", 300);
    let n_subagents = knob("HANGER_BENCH_SUBAGENTS", 100);
    let n_configs = knob("HANGER_BENCH_MCP_CONFIGS", 2);
    let n_projects = knob("HANGER_BENCH_PROJECTS", 6);

    let home = tempfile::tempdir().unwrap();
    let h = home.path();
    // Split across two engines' skill directories, as a real machine is.
    for i in 0..n_skills {
        let base = if i % 2 == 0 { ".claude/skills" } else { ".codex/skills" };
        skill(&h.join(base), &format!("skill-{i:04}"));
    }
    fs::create_dir_all(h.join(".claude/agents")).unwrap();
    for i in 0..n_subagents {
        fs::write(
            h.join(".claude/agents").join(format!("agent-{i:04}.md")),
            format!("---\nname: agent-{i:04}\ndescription: Benchmark subagent.\ntools: [read_file]\n---\n"),
        )
        .unwrap();
    }
    fs::write(h.join(".claude/CLAUDE.md"), "# Global rules\n").unwrap();
    for c in 0..n_configs {
        write_mcp_config(h, c);
    }

    let projects = tempfile::tempdir().unwrap();
    let mut project_paths = Vec::new();
    for p in 0..n_projects {
        let root = projects.path().join(format!("project-{p}"));
        for s in 0..PROJECT_SKILLS {
            skill(&root.join(".claude/skills"), &format!("p{p}-skill-{s:02}"));
        }
        fs::write(root.join("AGENTS.md"), "# Project rules\n").unwrap();
        let servers: Vec<String> = (0..PROJECT_SERVERS)
            .map(|s| format!(r#""p{p}-server-{s}":{{"command":"node"}}"#))
            .collect();
        fs::write(root.join(".mcp.json"), format!(r#"{{"mcpServers":{{{}}}}}"#, servers.join(","))).unwrap();
        fs::create_dir_all(root.join("src")).unwrap();
        for f in 0..PROJECT_PLAIN_FILES {
            fs::write(root.join("src").join(format!("file_{f}.ts")), "export {};\n").unwrap();
        }
        project_paths.push(root);
    }

    let summary = format!(
        "{n_skills} global skills, {n_subagents} subagents, {n_configs} MCP configs x {SERVERS_PER_CONFIG} servers, \
         {n_projects} linked projects x ({PROJECT_SKILLS} skills, {PROJECT_SERVERS} servers, 1 rule, {PROJECT_PLAIN_FILES} plain files)"
    );
    Fixture { _home: home, _projects: projects, project_paths, summary }
}

fn cpu_now() -> Duration {
    let mut usage: libc::rusage = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::getrusage(libc::RUSAGE_SELF, &mut usage) };
    assert_eq!(rc, 0, "getrusage failed");
    let tv = |t: libc::timeval| Duration::from_secs(t.tv_sec as u64) + Duration::from_micros(t.tv_usec as u64);
    tv(usage.ru_utime) + tv(usage.ru_stime)
}

struct Sample {
    wall: Duration,
    cpu: Duration,
    index_wall: Duration,
}

/// One Rescan: what `start_scan` runs, minus the events.
fn rescan(scanner: &DirectoryScanner, targets: &[PathBuf]) -> (Sample, usize) {
    let cpu0 = cpu_now();
    let t0 = Instant::now();
    let inventory = scan_targets(scanner, targets, |_, _, _| {}).expect("scan_targets");
    let t1 = Instant::now();
    tauri_app_lib::search::index_inventory(&scanner.db_path, &inventory).expect("index_inventory");
    let wall = t0.elapsed();
    let cpu = cpu_now() - cpu0;
    let assets = inventory.skills.len() + inventory.tools.len() + inventory.rules.len() + inventory.subagents.len();
    (Sample { wall, cpu, index_wall: t1.elapsed() }, assets)
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn report(label: &str, samples: &[Sample]) {
    let stats = |f: &dyn Fn(&Sample) -> Duration| {
        let mut v: Vec<f64> = samples.iter().map(|s| ms(f(s))).collect();
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        (v[0], v[v.len() / 2], v[v.len() - 1])
    };
    let (wmin, wmed, wmax) = stats(&|s| s.wall);
    let (cmin, cmed, cmax) = stats(&|s| s.cpu);
    let (imin, imed, imax) = stats(&|s| s.index_wall);
    let each: Vec<String> = samples.iter().map(|s| format!("{:.0}", ms(s.wall))).collect();
    println!(
        "{label:<5} wall ms min/median/max {wmin:.0} / {wmed:.0} / {wmax:.0}   \
         cpu ms {cmin:.0} / {cmed:.0} / {cmax:.0}   \
         (index wall {imin:.0} / {imed:.0} / {imax:.0})   runs [{}]",
        each.join(", ")
    );
}

#[test]
#[ignore = "benchmark: run with --ignored --nocapture --test-threads=1"]
fn scan_bench() {
    // Keep every engine root inside the temp home.
    for var in ["CLAUDE_CONFIG_DIR", "CODEX_HOME", "COPILOT_HOME"] {
        std::env::remove_var(var);
    }
    let fixture = build_fixture();
    std::env::set_var("HANGER_TEST_HOME", fixture._home.path());

    let mut targets = vec![PathBuf::from("")];
    targets.extend(fixture.project_paths.iter().cloned());

    let dbs = tempfile::tempdir().unwrap();
    let mut cold = Vec::new();
    let mut warm = Vec::new();
    let mut asset_count = 0;
    for run in 0..RUNS {
        let db_path = dbs.path().join(format!("bench-{run}.db"));
        let store = PreferencesStore::new(&db_path).expect("fresh store");
        for p in &fixture.project_paths {
            store.link_directory(&p.to_string_lossy()).expect("link_directory");
        }
        let scanner = DirectoryScanner {
            db_path,
            cancellation_token: Arc::new(AtomicBool::new(false)),
        };
        let (c, n) = rescan(&scanner, &targets);
        let (w, n_warm) = rescan(&scanner, &targets);
        assert_eq!(n, n_warm, "a rescan of an unchanged tree returns the same inventory size");
        asset_count = n;
        cold.push(c);
        warm.push(w);
    }

    let profile = if cfg!(debug_assertions) { "debug" } else { "release" };
    println!("scan_bench [{profile}] fixture: {}", fixture.summary);
    println!(
        "scan_bench [{profile}] {} targets (\"\" + {} projects), {asset_count} assets in the inventory, {RUNS} runs each",
        targets.len(),
        fixture.project_paths.len()
    );
    report("cold", &cold);
    report("warm", &warm);
    std::env::remove_var("HANGER_TEST_HOME");
}
