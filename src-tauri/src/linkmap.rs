//! The link map's data source: one graph, computed here, rendered verbatim.
//!
//! The frontend computes nothing from this — no counts, no aggregation, no
//! state derivation. Node counts come from scanner::count_assets, the one
//! counting function (AGENTS.md); edge states are derived from the
//! filesystem at read time, because the links table stores no state column
//! by design (CLAUDE.md, Invariants); engine-root reachability derives from
//! the roots' own top-level symlinks, never from links — one filesystem
//! object must not become N rows.

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::preferences::PreferencesStore;
use crate::scanner::count_assets;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NodeKind {
    Store,
    EngineRoot,
    Project,
}

/// Exhaustive by contract: a stored mechanism this enum cannot name becomes
/// a warning on the graph, never a guessed value. `Copy` exists in the
/// domain (findings.md F27) but is unreachable in production; the graph
/// refuses it rather than absorbing it the way the domain decode does.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeMechanism {
    Symlink,
    TrackedCopy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EdgeState {
    Linked,
    Drifted,
    Dangling,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GraphNode {
    pub id: i64,
    pub kind: NodeKind,
    pub label: String,
    pub path: String,
    pub asset_count: usize,
    /// Engine roots only: whether anything at the root's top level actually
    /// resolves into a store root. None for stores and projects, for which
    /// the question has no meaning.
    pub linked: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GraphEdge {
    pub source: i64,
    pub dest: i64,
    pub mechanism: EdgeMechanism,
    pub state: EdgeState,
    /// How many links this edge aggregates: link rows for project edges,
    /// root-level symlinks for store→engine edges. Always 1 when focused.
    pub count: i64,
    /// The single destination, present only on focused (un-aggregated)
    /// edges; an aggregated edge names no one destination.
    pub dest_path: Option<String>,
}

/// Which designed empty state the map is in — a fact about the data, named
/// here so the renderer never derives it (no counts, no predicates over
/// edges in TypeScript).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GraphEmptyState {
    /// Nothing links anywhere: no engine-root symlinks, no recorded
    /// deployments. The view explains what will appear once something is
    /// deployed.
    NoLinksAtAll,
    /// Store→engine edges are real, but no per-asset project link has been
    /// recorded — links are written at deploy time and when a scan meets a
    /// qualifying symlink; neither has happened yet.
    NoProjectEdges,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LinkGraph {
    pub nodes: Vec<GraphNode>,
    pub edges: Vec<GraphEdge>,
    pub warnings: Vec<String>,
    pub empty_state: Option<GraphEmptyState>,
}

/// Path equality across macOS's /private aliasing, matching how the store
/// normalises on write (preferences.rs::path_variants).
fn paths_equivalent(a: &str, b: &str) -> bool {
    if a == b {
        return true;
    }
    let strip = |s: &str| s.strip_prefix("/private").map(str::to_string);
    strip(a).as_deref() == Some(b) || strip(b).as_deref() == Some(a)
}

fn path_under(path: &str, root: &str) -> bool {
    let candidates = [path.to_string(), format!("/private{}", path)];
    let roots = [root.to_string(), format!("/private{}", root)];
    candidates.iter().any(|p| {
        roots
            .iter()
            .any(|r| Path::new(p).starts_with(Path::new(r)))
    })
}

/// A symlink's state is its target: missing or unresolvable is dangling,
/// and so is resolving to something other than the asset — the recorded
/// link no longer exists, whatever now occupies its path.
fn derive_symlink_state(dest_path: &str, asset_path: &str) -> EdgeState {
    let dest = Path::new(dest_path);
    if dest.symlink_metadata().is_err() {
        return EdgeState::Dangling;
    }
    match fs::canonicalize(dest) {
        Err(_) => EdgeState::Dangling,
        Ok(resolved) => {
            if paths_equivalent(&resolved.to_string_lossy(), asset_path) {
                EdgeState::Linked
            } else {
                EdgeState::Dangling
            }
        }
    }
}

/// A tracked copy's state is its content: a missing destination is
/// dangling; a destination that no longer hashes like the source is
/// drifted — including when the source itself is gone, since nothing can
/// match a missing source.
fn derive_copy_state(dest_path: &str, asset_path: &str) -> EdgeState {
    let dest = Path::new(dest_path);
    let dest_file = if dest.is_dir() { dest.join("SKILL.md") } else { dest.to_path_buf() };
    let Ok(dest_content) = fs::read(&dest_file) else {
        return EdgeState::Dangling;
    };
    let source = Path::new(asset_path);
    let source_file = if source.is_dir() { source.join("SKILL.md") } else { source.to_path_buf() };
    let Ok(source_content) = fs::read(&source_file) else {
        return EdgeState::Drifted;
    };
    if blake3::hash(&dest_content) == blake3::hash(&source_content) {
        EdgeState::Linked
    } else {
        EdgeState::Drifted
    }
}

struct RootRow {
    id: i64,
    kind: NodeKind,
    label: String,
    path: String,
}

pub fn build_link_graph(db_path: &Path, focus_asset_id: Option<i64>) -> Result<LinkGraph, String> {
    let store = PreferencesStore::new(db_path).map_err(|e| e.to_string())?;
    let conn = store.connect().map_err(|e| e.to_string())?;

    let mut warnings: Vec<String> = Vec::new();

    // ---- Nodes: every root, classified. ------------------------------
    let raw_roots: Vec<(i64, String, Option<i64>, String, String)> = {
        let mut stmt = conn
            .prepare("SELECT id, kind, engine_id, label, abs_path FROM roots ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    let mut roots: Vec<RootRow> = Vec::new();
    for (id, kind, engine_id, label, path) in raw_roots {
        let node_kind = match (kind.as_str(), engine_id) {
            ("engine_global", None) => NodeKind::Store,
            ("engine_global", Some(_)) => NodeKind::EngineRoot,
            ("project", _) => NodeKind::Project,
            (other, _) => {
                warnings.push(format!(
                    "root {} has kind '{}', which the graph cannot place; omitted",
                    id, other
                ));
                continue;
            }
        };
        roots.push(RootRow { id, kind: node_kind, label, path });
    }

    // ---- Engine reachability, from the filesystem at read time. ------
    // For each engine root, its top-level entries that are symlinks
    // resolving under a store root. (root-level entries only: descending
    // would re-derive the scan.)
    let store_paths: Vec<String> = roots
        .iter()
        .filter(|r| r.kind == NodeKind::Store)
        .map(|r| r.path.clone())
        .collect();

    // (engine root id, store root id, symlink path) per root-level link.
    let mut engine_links: Vec<(i64, i64, String)> = Vec::new();
    for engine in roots.iter().filter(|r| r.kind == NodeKind::EngineRoot) {
        let Ok(entries) = fs::read_dir(&engine.path) else {
            // A file root (~/.claude.json) or an unreadable directory has no
            // top level to link through.
            continue;
        };
        let mut entry_paths: Vec<_> = entries
            .flatten()
            .map(|e| e.path())
            .collect();
        entry_paths.sort();
        for entry in entry_paths {
            let is_link = entry
                .symlink_metadata()
                .map(|m| m.file_type().is_symlink())
                .unwrap_or(false);
            if !is_link {
                continue;
            }
            let Ok(resolved) = fs::canonicalize(&entry) else {
                continue;
            };
            let resolved = resolved.to_string_lossy().to_string();
            for store_root in roots.iter().filter(|r| r.kind == NodeKind::Store) {
                if path_under(&resolved, &store_root.path) {
                    engine_links.push((engine.id, store_root.id, entry.to_string_lossy().to_string()));
                    break;
                }
            }
        }
    }

    let nodes: Vec<GraphNode> = roots
        .iter()
        .map(|r| {
            let asset_count = count_assets(db_path, Some(&r.path))
                .map(|c| c.total_assets)
                .unwrap_or(0);
            GraphNode {
                id: r.id,
                kind: r.kind,
                label: r.label.clone(),
                path: r.path.clone(),
                asset_count,
                linked: match r.kind {
                    NodeKind::EngineRoot => {
                        Some(engine_links.iter().any(|(e, _, _)| *e == r.id))
                    }
                    _ => None,
                },
            }
        })
        .collect();

    // ---- Edges from the links table, state derived per row. ----------
    let link_rows: Vec<(i64, i64, String, String, String)> = {
        let sql = "SELECT l.id, l.dest_root_id, l.dest_path, l.mechanism, a.abs_path
                   FROM links l JOIN assets a ON a.id = l.asset_id
                   WHERE ?1 IS NULL OR l.asset_id = ?1
                   ORDER BY l.id";
        let mut stmt = conn.prepare(sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([focus_asset_id], |r| {
                Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?))
            })
            .map_err(|e| e.to_string())?;
        rows.flatten().collect()
    };

    // A link whose asset row is gone would vanish from the join; say so
    // rather than under-draw silently.
    let orphans: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM links WHERE asset_id NOT IN (SELECT id FROM assets)",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if orphans > 0 {
        warnings.push(format!(
            "{} link row(s) reference assets that no longer exist; not drawn",
            orphans
        ));
    }

    // The asset's owning root is the edge's source.
    let source_of = |asset_path: &str| -> Option<i64> {
        roots
            .iter()
            .filter(|r| path_under(asset_path, &r.path))
            .max_by_key(|r| Path::new(&r.path).components().count())
            .map(|r| r.id)
    };

    let mut edges: Vec<GraphEdge> = Vec::new();

    if let Some(focus) = focus_asset_id {
        // Un-aggregated: one edge per link row, plus this asset's own
        // engine reachability.
        for (link_id, dest_root_id, dest_path, mechanism, asset_path) in &link_rows {
            let Some(mech) = parse_mechanism(mechanism) else {
                warnings.push(unrepresentable(*link_id, mechanism));
                continue;
            };
            let Some(source) = source_of(asset_path) else {
                warnings.push(format!(
                    "link {} has a source outside every root; not drawn",
                    link_id
                ));
                continue;
            };
            edges.push(GraphEdge {
                source,
                dest: *dest_root_id,
                mechanism: mech,
                state: derive_state(mech, dest_path, asset_path),
                count: 1,
                dest_path: Some(dest_path.clone()),
            });
        }
        let focus_path: Option<String> = conn
            .query_row(
                "SELECT abs_path FROM assets WHERE id = ?1",
                [focus],
                |r| r.get(0),
            )
            .ok();
        if let Some(asset_path) = focus_path {
            if let Some(source) = source_of(&asset_path) {
                for (engine_id, store_id, link_path) in &engine_links {
                    if *store_id != source {
                        continue;
                    }
                    let Ok(target) = fs::canonicalize(link_path) else { continue };
                    if path_under(&asset_path, &target.to_string_lossy()) {
                        edges.push(GraphEdge {
                            source: *store_id,
                            dest: *engine_id,
                            mechanism: EdgeMechanism::Symlink,
                            state: EdgeState::Linked,
                            count: 1,
                            dest_path: Some(link_path.clone()),
                        });
                    }
                }
            }
        }
    } else {
        // Aggregated: one edge per (source, dest, mechanism, state) tuple.
        use std::collections::BTreeMap;
        let mut buckets: BTreeMap<(i64, i64, EdgeMechanism, EdgeState), i64> = BTreeMap::new();
        for (link_id, dest_root_id, dest_path, mechanism, asset_path) in &link_rows {
            let Some(mech) = parse_mechanism(mechanism) else {
                warnings.push(unrepresentable(*link_id, mechanism));
                continue;
            };
            let Some(source) = source_of(asset_path) else {
                warnings.push(format!(
                    "link {} has a source outside every root; not drawn",
                    link_id
                ));
                continue;
            };
            let state = derive_state(mech, dest_path, asset_path);
            *buckets.entry((source, *dest_root_id, mech, state)).or_insert(0) += 1;
        }
        // Store→engine edges: one per (store, engine) pair, counting the
        // root-level symlinks that compose it. Always Linked — an entry
        // only lands in engine_links by resolving into the store.
        let mut engine_buckets: BTreeMap<(i64, i64), i64> = BTreeMap::new();
        for (engine_id, store_id, _) in &engine_links {
            *engine_buckets.entry((*store_id, *engine_id)).or_insert(0) += 1;
        }
        for ((source, dest), count) in engine_buckets {
            buckets.insert((source, dest, EdgeMechanism::Symlink, EdgeState::Linked), count);
        }
        for ((source, dest, mechanism, state), count) in buckets {
            edges.push(GraphEdge { source, dest, mechanism, state, count, dest_path: None });
        }
    }

    edges.sort_by(|a, b| {
        (a.source, a.dest, a.mechanism, a.state, &a.dest_path)
            .cmp(&(b.source, b.dest, b.mechanism, b.state, &b.dest_path))
    });

    let empty_state = if edges.is_empty() {
        Some(GraphEmptyState::NoLinksAtAll)
    } else {
        let project_ids: std::collections::HashSet<i64> = roots
            .iter()
            .filter(|r| r.kind == NodeKind::Project)
            .map(|r| r.id)
            .collect();
        if edges.iter().any(|e| project_ids.contains(&e.dest)) {
            None
        } else {
            Some(GraphEmptyState::NoProjectEdges)
        }
    };

    Ok(LinkGraph { nodes, edges, warnings, empty_state })
}

fn parse_mechanism(raw: &str) -> Option<EdgeMechanism> {
    match raw {
        "symlink" => Some(EdgeMechanism::Symlink),
        "tracked_copy" => Some(EdgeMechanism::TrackedCopy),
        _ => None,
    }
}

fn unrepresentable(link_id: i64, mechanism: &str) -> String {
    format!(
        "link {} carries mechanism '{}', which the graph cannot represent; not drawn",
        link_id, mechanism
    )
}

fn derive_state(mechanism: EdgeMechanism, dest_path: &str, asset_path: &str) -> EdgeState {
    match mechanism {
        EdgeMechanism::Symlink => derive_symlink_state(dest_path, asset_path),
        EdgeMechanism::TrackedCopy => derive_copy_state(dest_path, asset_path),
    }
}
