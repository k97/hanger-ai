//! The link_graph command's contract (dispatch: item 4).
//!
//! Everything on the graph is computed here in Rust: node identity from the
//! roots table, node counts from count_assets (the one counting function),
//! edge states derived from the filesystem at read time, engine-root
//! reachability from the roots' own top-level symlinks — never from links.
//! Mechanism and state are exhaustive: a link row carrying anything else is
//! a warning, not a graph value.

use std::fs;
use std::os::unix::fs as unix_fs;
use std::path::PathBuf;
use tauri_app_lib::linkmap::{build_link_graph, EdgeMechanism, EdgeState, NodeKind};
use tauri_app_lib::preferences::PreferencesStore;

fn now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn fresh_dir(name: &str) -> PathBuf {
    let dir = std::env::temp_dir().join(name);
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    dir
}

struct Fixture {
    db_path: PathBuf,
    store: PreferencesStore,
    store_root_id: i64,
    project_root_id: i64,
    store_abs: PathBuf,
    project_abs: PathBuf,
}

/// A store root with two rule assets and a project root, no links yet.
fn fixture(name: &str) -> Fixture {
    let base = fresh_dir(name);
    let db_path = base.join("store.db");
    let store = PreferencesStore::new(&db_path).unwrap();

    let store_dir = base.join("agents-store");
    let project_dir = base.join("project");
    fs::create_dir_all(store_dir.join("rules")).unwrap();
    fs::create_dir_all(&project_dir).unwrap();
    fs::write(store_dir.join("rules").join("alpha.md"), "# alpha").unwrap();
    fs::write(store_dir.join("rules").join("beta.md"), "# beta").unwrap();

    let store_abs = fs::canonicalize(&store_dir).unwrap();
    let project_abs = fs::canonicalize(&project_dir).unwrap();

    let t = now();
    let store_root_id = store
        .upsert_root("engine_global", store_abs.to_str().unwrap(), None, ".agents", t)
        .unwrap();
    let project_root_id = store
        .upsert_root("project", project_abs.to_str().unwrap(), None, "project", t)
        .unwrap();

    for name in ["alpha.md", "beta.md"] {
        let canon = fs::canonicalize(store_abs.join("rules").join(name)).unwrap();
        store
            .upsert_asset(
                store_root_id, None, "rule", "global", name,
                canon.to_str().unwrap(), None, None, "ok", None, t, t,
            )
            .unwrap();
    }

    Fixture { db_path, store, store_root_id, project_root_id, store_abs, project_abs }
}

fn asset_id(store: &PreferencesStore, name: &str) -> i64 {
    store
        .connect()
        .unwrap()
        .query_row(
            "SELECT id FROM assets WHERE name = ?1",
            [name],
            |r| r.get(0),
        )
        .unwrap()
}

/// Deploy `name` into the project as a real symlink plus its link row,
/// returning the destination path.
fn symlink_deploy(f: &Fixture, name: &str, dest_name: &str) -> String {
    let src = f.store_abs.join("rules").join(name);
    let dest = f.project_abs.join(dest_name);
    unix_fs::symlink(&src, &dest).unwrap();
    let outcome = f
        .store
        .record_walk_symlink(
            f.project_root_id,
            dest.to_str().unwrap(),
            fs::canonicalize(&src).unwrap().to_str().unwrap(),
            now(),
        )
        .unwrap();
    assert!(
        matches!(outcome, tauri_app_lib::preferences::WalkSymlinkOutcome::Recorded(_)),
        "fixture deploy must record"
    );
    dest.to_string_lossy().to_string()
}

#[test]
fn test_aggregation_collapses_duplicate_tuples() {
    let f = fixture("hanger_test_lg_aggregate");
    symlink_deploy(&f, "alpha.md", "alpha.md");
    symlink_deploy(&f, "beta.md", "beta.md");

    let graph = build_link_graph(&f.db_path, None).unwrap();

    // Two links, one (source, dest, mechanism, state) tuple, one edge.
    let project_edges: Vec<_> = graph
        .edges
        .iter()
        .filter(|e| e.dest == f.project_root_id)
        .collect();
    assert_eq!(project_edges.len(), 1, "duplicate tuples must collapse: {:?}", graph.edges);
    let edge = project_edges[0];
    assert_eq!(edge.source, f.store_root_id);
    assert_eq!(edge.mechanism, EdgeMechanism::Symlink);
    assert_eq!(edge.state, EdgeState::Linked);
    assert_eq!(edge.count, 2, "the edge carries how many links it aggregates");
    assert_eq!(edge.dest_path, None, "aggregated edges name no single destination");

    // Node counts come from count_assets, not from anything the graph added.
    let store_node = graph.nodes.iter().find(|n| n.id == f.store_root_id).unwrap();
    assert_eq!(store_node.kind, NodeKind::Store);
    assert_eq!(store_node.asset_count, 2);
    let project_node = graph.nodes.iter().find(|n| n.id == f.project_root_id).unwrap();
    assert_eq!(project_node.kind, NodeKind::Project);
    assert_eq!(project_node.asset_count, 0, "symlinks are links, not project assets");
}

#[test]
fn test_focused_asset_returns_unaggregated_edges() {
    let f = fixture("hanger_test_lg_focus");
    // alpha deployed twice into the same project — an aggregated view shows
    // one edge; the focused view must show both destinations.
    let d1 = symlink_deploy(&f, "alpha.md", "alpha.md");
    let d2 = symlink_deploy(&f, "alpha.md", "alpha-again.md");
    symlink_deploy(&f, "beta.md", "beta.md");

    let alpha = asset_id(&f.store, "alpha.md");
    let graph = build_link_graph(&f.db_path, Some(alpha)).unwrap();

    let mut dests: Vec<String> = graph
        .edges
        .iter()
        .filter(|e| e.dest == f.project_root_id)
        .map(|e| {
            assert_eq!(e.count, 1, "focused edges are un-aggregated");
            e.dest_path.clone().expect("focused edges carry their destination")
        })
        .collect();
    dests.sort();
    let mut expected = vec![d1, d2];
    expected.sort();
    assert_eq!(dests, expected, "both of alpha's deployments, nothing of beta's");
}

#[test]
fn test_dangling_symlink_yields_dangling_state() {
    let f = fixture("hanger_test_lg_dangling");
    let dest = symlink_deploy(&f, "alpha.md", "alpha.md");
    // The deployment is then deleted out from under the record.
    fs::remove_file(&dest).unwrap();

    let graph = build_link_graph(&f.db_path, None).unwrap();
    let edge = graph
        .edges
        .iter()
        .find(|e| e.dest == f.project_root_id)
        .expect("the recorded link still draws, as dangling");
    assert_eq!(edge.state, EdgeState::Dangling);
}

#[test]
fn test_unlinked_engine_root_has_no_edge_and_linked_false() {
    let f = fixture("hanger_test_lg_unlinked_engine");
    let engine_dir = f.store_abs.parent().unwrap().join("dot-codex");
    fs::create_dir_all(&engine_dir).unwrap();
    let t = now();
    let engine_id = f.store.upsert_engine("codex", "Codex", engine_dir.to_str().unwrap(), t).unwrap();
    let engine_root_id = f
        .store
        .upsert_root(
            "engine_global",
            fs::canonicalize(&engine_dir).unwrap().to_str().unwrap(),
            Some(engine_id),
            "Codex",
            t,
        )
        .unwrap();

    let graph = build_link_graph(&f.db_path, None).unwrap();
    let node = graph.nodes.iter().find(|n| n.id == engine_root_id).unwrap();
    assert_eq!(node.kind, NodeKind::EngineRoot);
    assert_eq!(node.linked, Some(false));
    assert!(
        !graph.edges.iter().any(|e| e.dest == engine_root_id),
        "an unlinked engine root has no edge"
    );
}

#[test]
fn test_linked_engine_root_edge_derives_from_roots_not_links() {
    let f = fixture("hanger_test_lg_linked_engine");
    let engine_dir = f.store_abs.parent().unwrap().join("dot-claude");
    fs::create_dir_all(&engine_dir).unwrap();
    // The root-level symlink: <engine>/rules -> <store>/rules. Deliberately
    // NOT in the links table — reachability must come from the filesystem.
    unix_fs::symlink(f.store_abs.join("rules"), engine_dir.join("rules")).unwrap();

    let t = now();
    let engine_id = f.store.upsert_engine("claude_code", "Claude Code", engine_dir.to_str().unwrap(), t).unwrap();
    let engine_root_id = f
        .store
        .upsert_root(
            "engine_global",
            fs::canonicalize(&engine_dir).unwrap().to_str().unwrap(),
            Some(engine_id),
            "Claude Code",
            t,
        )
        .unwrap();

    let graph = build_link_graph(&f.db_path, None).unwrap();

    let links_rows: i64 = f
        .store
        .connect()
        .unwrap()
        .query_row("SELECT COUNT(*) FROM links", [], |r| r.get(0))
        .unwrap();
    assert_eq!(links_rows, 0, "precondition: the links table is empty");

    let node = graph.nodes.iter().find(|n| n.id == engine_root_id).unwrap();
    assert_eq!(node.linked, Some(true));
    let edge = graph
        .edges
        .iter()
        .find(|e| e.source == f.store_root_id && e.dest == engine_root_id)
        .expect("store→engine edge exists with links empty");
    assert_eq!(edge.mechanism, EdgeMechanism::Symlink);
    assert_eq!(edge.state, EdgeState::Linked);
    assert_eq!(edge.count, 1, "one root-level symlink composes this edge");
}

#[test]
fn test_unrepresentable_mechanism_is_a_warning_not_a_graph_value() {
    let f = fixture("hanger_test_lg_bad_mechanism");
    let dest = symlink_deploy(&f, "alpha.md", "alpha.md");

    // A row carrying a mechanism the graph's exhaustive enum cannot name.
    // 'copy' exists in the domain (findings.md F27, unreachable in
    // production); the graph must refuse to guess rather than absorb it.
    let conn = f.store.connect().unwrap();
    conn.execute(
        "UPDATE links SET mechanism = 'copy' WHERE dest_path = ?1",
        [dest.as_str()],
    )
    .unwrap();

    let graph = build_link_graph(&f.db_path, None).unwrap();
    assert!(
        !graph.edges.iter().any(|e| e.dest == f.project_root_id),
        "the unrepresentable row must not become an edge"
    );
    assert_eq!(graph.warnings.len(), 1, "…and must be said out loud: {:?}", graph.warnings);
    assert!(
        graph.warnings[0].contains("copy"),
        "the warning names the mechanism it refused: {}",
        graph.warnings[0]
    );
}

/// Real-machine shape, run by hand against a COPY of the live store:
///
/// ```sh
/// HANGER_LINK_GRAPH_DB=/path/to/copy.db \
///   cargo test --test link_graph_tests -- --ignored --nocapture
/// ```
#[test]
#[ignore]
fn real_store_graph_shape() {
    let Ok(db) = std::env::var("HANGER_LINK_GRAPH_DB") else {
        eprintln!("HANGER_LINK_GRAPH_DB not set; skipping");
        return;
    };
    let graph = build_link_graph(std::path::Path::new(&db), None).unwrap();
    for n in &graph.nodes {
        println!(
            "node {:>6}  {:<12} {:>5} assets  linked={:<8} {}",
            n.id,
            format!("{:?}", n.kind),
            n.asset_count,
            format!("{:?}", n.linked),
            n.label
        );
    }
    for e in &graph.edges {
        println!(
            "edge {} -> {}  {:?} {:?} x{}",
            e.source, e.dest, e.mechanism, e.state, e.count
        );
    }
    for w in &graph.warnings {
        println!("warning: {}", w);
    }
}

#[test]
fn test_same_graph_twice_is_identical() {
    let f = fixture("hanger_test_lg_deterministic");
    symlink_deploy(&f, "alpha.md", "alpha.md");
    symlink_deploy(&f, "beta.md", "beta.md");

    let a = build_link_graph(&f.db_path, None).unwrap();
    let b = build_link_graph(&f.db_path, None).unwrap();
    assert_eq!(a, b, "two reads of the same world draw the same graph");
}
