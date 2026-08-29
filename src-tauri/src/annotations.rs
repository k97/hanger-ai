//! Per-asset shell annotations: mechanism, engine reach, and the
//! "beyond the store" note (dispatch item 8, rulings 2026-08-15).
//!
//! Everything here is derived at read time — links from the links table
//! judged against the live filesystem through domain::resolve_state, reach
//! from the engine roots' own top-level symlinks exactly as the link map
//! derives it. Nothing is cached and no state column exists to invalidate
//! (CLAUDE.md, Invariants). The note's count is computed here because the
//! frontend renders counts and never computes them.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;

use crate::domain::{resolve_state, HydratedLink, LinkState, Mechanism};

#[derive(Debug, Clone, Serialize)]
pub struct EngineReach {
    pub engine_id: i64,
    pub engine_key: String,
    pub engine_name: String,
    pub reached: bool,
    /// The root-level symlink the engine reads through, when reached via one.
    pub via_root: Option<String>,
    /// Where that symlink resolves — the store carrying the asset.
    pub via_store: Option<String>,
    /// "root_not_linked" | "format" when not reached.
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct BeyondNote {
    /// "projects" | "copies" | "drifted" | "broken"
    pub kind: String,
    /// Backend-owned count of destinations behind the note.
    pub count: i64,
    /// Destination root labels, for the cell text and its tooltip.
    pub places: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AssetAnnotation {
    pub asset_path: String,
    /// "symlink" | "copy" | "drift" | "broken" | "none" — glyph precedence
    /// broken > drift > symlink > copy > none.
    pub mechanism: String,
    pub reach: Vec<EngineReach>,
    pub beyond: Option<BeyondNote>,
}

struct RootRow {
    id: i64,
    kind: String,
    engine_id: Option<i64>,
    label: String,
    path: String,
}

struct EngineRow {
    id: i64,
    key: String,
    name: String,
}

struct AssetRow {
    id: i64,
    root_id: i64,
    engine_id: Option<i64>,
    abs_path: String,
}

struct LinkRow {
    mechanism: Mechanism,
    state: LinkState,
    dest_label: String,
}

fn path_under(candidate: &str, root: &str) -> bool {
    Path::new(candidate).starts_with(root)
}

/// Whether this engine reads the vendor-neutral `.agents/` convention.
///
/// The reach half of spec §4.4, and the only consumer of the
/// `reads_agents_dir` flag: ownership is answered by `engine_for_path`, reach
/// is answered here, and they must not be confused. `engines.key` is the
/// stored form of an `AGENT_CONFIGS` id, so the flag is looked up through the
/// same mapping the scanner writes rows with rather than a second table of
/// ids kept in step by hand.
fn reads_shared_dir(engine_key: &str) -> bool {
    crate::agents::agents_reading_shared_dir()
        .iter()
        .any(|config| crate::scanner::get_engine_key(config.id) == Some(engine_key))
}

/// Annotate every asset under an engine_global root. Project-scoped assets
/// are not annotated here; the repo pane keeps its own columns by ruling.
pub fn asset_annotations(db_path: &Path) -> Result<Vec<AssetAnnotation>, String> {
    let conn = Connection::open(db_path).map_err(|e| e.to_string())?;

    let roots: Vec<RootRow> = {
        let mut stmt = conn
            .prepare("SELECT id, kind, engine_id, label, abs_path FROM roots ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows: Vec<RootRow> = stmt
            .query_map([], |r| {
                Ok(RootRow {
                    id: r.get(0)?,
                    kind: r.get(1)?,
                    engine_id: r.get(2)?,
                    label: r.get(3)?,
                    path: r.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        rows
    };

    let engines: Vec<EngineRow> = {
        let mut stmt = conn
            .prepare("SELECT id, key, display_name FROM engines ORDER BY id")
            .map_err(|e| e.to_string())?;
        let rows: Vec<EngineRow> = stmt
            .query_map([], |r| {
                Ok(EngineRow { id: r.get(0)?, key: r.get(1)?, name: r.get(2)? })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        rows
    };

    // Two ways an engine has a reach question worth asking. Either its global
    // root is a directory, so it can hold a root link — a registry entry with
    // no root, or a config-file root like ~/.claude.json, cannot (the same
    // boundary the link map draws when it skips file roots). Or it reads the
    // shared `.agents/` convention, which needs no link at all: it reads the
    // store where the store is.
    //
    // The second clause is Zed's only way in. It owns no directory by
    // design, so it is detected by ~/.config/zed/settings.json and has a
    // config-file root — and the directory test alone filtered it out of the
    // tiles entirely, leaving an engine the spec says appears throughout the
    // UI appearing nowhere in it (§4.4, §5).
    //
    // Everyone else is noise in the tiles, not an unlinked engine.
    let engines: Vec<EngineRow> = engines
        .into_iter()
        .filter(|e| {
            reads_shared_dir(&e.key)
                || roots.iter().any(|r| {
                    r.kind == "engine_global"
                        && r.engine_id == Some(e.id)
                        && Path::new(&r.path).is_dir()
                })
        })
        .collect();

    let store_roots: Vec<&RootRow> = roots
        .iter()
        .filter(|r| r.kind == "engine_global" && r.engine_id.is_none())
        .collect();

    // ---- Engine reachability, from the filesystem at read time — the same
    // walk the link map does: each engine root's top-level symlinks that
    // resolve under a store root. An engine may link several stores, so
    // every pair is kept. (engine id → [(link path, store root id)])
    let mut engine_links: BTreeMap<i64, Vec<(String, i64)>> = BTreeMap::new();
    for engine_root in roots
        .iter()
        .filter(|r| r.kind == "engine_global" && r.engine_id.is_some())
    {
        let Ok(entries) = fs::read_dir(&engine_root.path) else {
            continue; // a file root or unreadable dir has no top level
        };
        let mut entry_paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
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
            for store_root in &store_roots {
                if path_under(&resolved, &store_root.path) {
                    engine_links
                        .entry(engine_root.engine_id.unwrap())
                        .or_default()
                        .push((entry.to_string_lossy().to_string(), store_root.id));
                    break;
                }
            }
        }
    }

    let assets: Vec<AssetRow> = {
        let mut stmt = conn
            .prepare(
                "SELECT a.id, a.root_id, a.engine_id, a.abs_path
                 FROM assets a JOIN roots r ON r.id = a.root_id
                 WHERE r.kind = 'engine_global'
                 ORDER BY a.id",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<AssetRow> = stmt
            .query_map([], |r| {
                Ok(AssetRow {
                    id: r.get(0)?,
                    root_id: r.get(1)?,
                    engine_id: r.get(2)?,
                    abs_path: r.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?
            .flatten()
            .collect();
        rows
    };

    let root_by_id: BTreeMap<i64, &RootRow> = roots.iter().map(|r| (r.id, r)).collect();

    // ---- Project reachability through directory links, from the
    // filesystem at read time (ruled 2026-08-15). Real deployments mount
    // whole store directories — <repo>/.claude/skills → ~/.agents/skills —
    // so no per-asset link row exists or needs to. Each project's
    // conventional engine dirs are read for top-level symlinks resolving
    // under a store root; an asset beneath such a target is in that
    // project. (project label, resolved target dir) pairs.
    const PROJECT_MOUNT_DIRS: [&str; 4] = [".claude", ".agents", ".gemini", ".codex"];
    let mut project_mounts: Vec<(String, String)> = Vec::new();
    for project in roots.iter().filter(|r| r.kind == "project") {
        for mount_dir in PROJECT_MOUNT_DIRS {
            let dir = Path::new(&project.path).join(mount_dir);
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            let mut entry_paths: Vec<_> = entries.flatten().map(|e| e.path()).collect();
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
                if store_roots.iter().any(|s| path_under(&resolved, &s.path)) {
                    project_mounts.push((project.label.clone(), resolved));
                }
            }
        }
    }

    // Where the shared convention store is on this machine, in the same
    // canonical form the roots table holds. Read once: it is a filesystem
    // question, not a per-asset one.
    let shared_store = crate::scanner::shared_agents_dir()
        .to_string_lossy()
        .to_string();

    let mut out = Vec::with_capacity(assets.len());
    for asset in &assets {
        let links = asset_links(&conn, asset)?;
        let dir_places: Vec<String> = {
            let mut places: Vec<String> = project_mounts
                .iter()
                .filter(|(_, target)| path_under(&asset.abs_path, target))
                .map(|(label, _)| label.clone())
                .collect();
            places.sort();
            places.dedup();
            places
        };
        let mechanism = mechanism_word(&links, !dir_places.is_empty());
        let beyond = beyond_note(&links, &dir_places);
        let reach = engine_reach(asset, &engines, &engine_links, &root_by_id, &shared_store);
        out.push(AssetAnnotation {
            asset_path: asset.abs_path.clone(),
            mechanism: mechanism.to_string(),
            reach,
            beyond,
        });
    }
    Ok(out)
}

/// The asset's link rows, each judged against the live filesystem.
fn asset_links(conn: &Connection, asset: &AssetRow) -> Result<Vec<LinkRow>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT l.id, l.dest_root_id, l.dest_path, l.mechanism, l.source_hash,
                    l.dest_hash, l.created_at, l.last_verified_at, r.label
             FROM links l JOIN roots r ON r.id = l.dest_root_id
             WHERE l.asset_id = ?1
             ORDER BY l.id",
        )
        .map_err(|e| e.to_string())?;

    let raw: Vec<(HydratedLink, String)> = stmt
        .query_map([asset.id], |r| {
            let mechanism: String = r.get(3)?;
            Ok((mechanism, HydratedLink {
                id: r.get(0)?,
                asset_id: asset.id,
                dest_root_id: r.get(1)?,
                source_path: asset.abs_path.clone(),
                dest_path: r.get(2)?,
                mechanism: Mechanism::Symlink, // patched below from the string
                source_hash: r.get(4)?,
                dest_hash: r.get(5)?,
                created_at: r.get(6)?,
                last_verified_at: r.get(7)?,
            }, r.get::<_, String>(8)?))
        })
        .map_err(|e| e.to_string())?
        .flatten()
        .filter_map(|(mech_str, mut link, label)| {
            // A link row carrying an unknown mechanism is a warning
            // elsewhere, never a value here.
            link.mechanism = match mech_str.as_str() {
                "symlink" => Mechanism::Symlink,
                "copy" => Mechanism::Copy,
                "tracked_copy" => Mechanism::TrackedCopy,
                _ => return None,
            };
            Some((link, label))
        })
        .collect();

    // Hash the source lazily: only copy mechanisms compare hashes, and the
    // hash is of the file as it is right now — read time, not scan time.
    let mut source_hash_now: Option<Option<String>> = None;
    let mut out = Vec::with_capacity(raw.len());
    for (link, dest_label) in raw {
        let dest = Path::new(&link.dest_path);
        let dest_exists = dest.exists() || dest.is_symlink();
        let symlink_target = fs::read_link(dest).ok();
        let hash_now = if matches!(link.mechanism, Mechanism::Copy | Mechanism::TrackedCopy) {
            source_hash_now
                .get_or_insert_with(|| {
                    let src = Path::new(&link.source_path);
                    let file = if src.is_dir() { src.join("SKILL.md") } else { src.to_path_buf() };
                    fs::read(file).ok().map(|c| blake3::hash(&c).to_hex().to_string())
                })
                .clone()
        } else {
            None
        };
        let state = resolve_state(&link, hash_now.as_deref(), dest_exists, symlink_target.as_deref());
        out.push(LinkRow { mechanism: link.mechanism.clone(), state, dest_label });
    }
    Ok(out)
}

/// Glyph precedence: broken > drift > symlink > copy > none. Foreign — a
/// destination someone edited out from under the mechanism — renders as
/// drift, the same judgement the review pane already makes. A directory
/// link one level up counts as travelling by symlink.
fn mechanism_word(links: &[LinkRow], dir_linked: bool) -> &'static str {
    if links.is_empty() && !dir_linked {
        return "none";
    }
    if links.iter().any(|l| l.state == LinkState::Broken) {
        return "broken";
    }
    if links
        .iter()
        .any(|l| matches!(l.state, LinkState::Drifted | LinkState::Foreign))
    {
        return "drift";
    }
    if dir_linked || links.iter().any(|l| l.mechanism == Mechanism::Symlink) {
        return "symlink";
    }
    "copy"
}

/// How far an ancestor `.mcp.json` reaches, and where it is overridden.
///
/// Derived on every read, never stored: `docs/harness.md` — "Nothing about
/// reach is cached… a stored verdict would be wrong more often than right."
/// A repo cloned under the ancestor tomorrow joins the count with no rescan.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct AncestorReach {
    pub reached: i64,
    pub shadowed: i64,
}

/// Projects below `config_path`'s directory, and how many override it.
///
/// Shadowing is per SERVER NAME: a project whose own `.mcp.json` declares a
/// different server still inherits this one. Claude Code connects once using
/// the higher-precedence (repo) definition when the names collide.
pub fn ancestor_reach(
    config_path: &Path,
    server_name: &str,
    project_roots: &[PathBuf],
    home: &Path,
) -> AncestorReach {
    let Some(anchor) = config_path.parent() else {
        return AncestorReach { reached: 0, shadowed: 0 };
    };
    // Both the anchor and the project root must sit under home. Checking
    // only the root leaves an anchor above home (e.g. anchor = /Users,
    // home = /Users/alice) satisfying root.starts_with(anchor) for every
    // project under /Users, which the contract forbids.
    if !anchor.starts_with(home) {
        return AncestorReach { reached: 0, shadowed: 0 };
    }
    let mut reached = 0i64;
    let mut shadowed = 0i64;
    for root in project_roots {
        // Strict ancestor: a config does not reach the directory it sits in.
        if root == anchor || !root.starts_with(anchor) || !root.starts_with(home) {
            continue;
        }
        reached += 1;
        if declares(&root.join(".mcp.json"), server_name) {
            shadowed += 1;
        }
    }
    AncestorReach { reached, shadowed }
}

/// Whether a `.mcp.json` declares `server_name`.
///
/// Parsed through the same dialect the registry declares for `.mcp.json`
/// (`McpServers`) rather than by hand — a bespoke JSON walk here would drift
/// from the parser the scan uses.
fn declares(path: &Path, server_name: &str) -> bool {
    let Ok(body) = std::fs::read_to_string(path) else {
        return false;
    };
    crate::mcp::dialect::parse(
        &body,
        crate::mcp::registry::Dialect::McpServers,
        crate::mcp::registry::ScopeTier::Project,
    )
    .map(|servers| servers.iter().any(|s| s.name == server_name))
    .unwrap_or(false)
}

fn beyond_note(links: &[LinkRow], dir_places: &[String]) -> Option<BeyondNote> {
    if links.is_empty() && dir_places.is_empty() {
        return None;
    }
    let places_of = |pred: &dyn Fn(&LinkRow) -> bool| -> Vec<String> {
        let mut places: Vec<String> = links.iter().filter(|l| pred(l)).map(|l| l.dest_label.clone()).collect();
        places.sort();
        places.dedup();
        places
    };

    let broken = places_of(&|l: &LinkRow| l.state == LinkState::Broken);
    if !broken.is_empty() {
        return Some(BeyondNote { kind: "broken".into(), count: broken.len() as i64, places: broken });
    }
    let drifted = places_of(&|l: &LinkRow| matches!(l.state, LinkState::Drifted | LinkState::Foreign));
    if !drifted.is_empty() {
        return Some(BeyondNote { kind: "drifted".into(), count: drifted.len() as i64, places: drifted });
    }
    let mut all = places_of(&|_| true);
    all.extend(dir_places.iter().cloned());
    all.sort();
    all.dedup();
    let kind = if !dir_places.is_empty() || links.iter().any(|l| l.mechanism == Mechanism::Symlink) {
        "projects"
    } else {
        "copies"
    };
    Some(BeyondNote { kind: kind.into(), count: all.len() as i64, places: all })
}

fn engine_reach(
    asset: &AssetRow,
    engines: &[EngineRow],
    engine_links: &BTreeMap<i64, Vec<(String, i64)>>,
    root_by_id: &BTreeMap<i64, &RootRow>,
    shared_store: &str,
) -> Vec<EngineReach> {
    let asset_root = root_by_id.get(&asset.root_id);
    // Is this asset in the vendor-neutral store? Asked of the root the asset
    // was filed under, not of its filename: the root row is what the walk
    // decided, and on a machine where ~/.agents is a symlink into a synced
    // folder the asset's own canonical path has no `.agents` component left
    // in it to look for.
    let in_shared_store = asset_root
        .map(|r| r.engine_id.is_none() && (r.path == shared_store || path_under(&r.path, shared_store)))
        .unwrap_or(false);
    engines
        .iter()
        .map(|engine| {
            // An engine-specific format outranks the root question: an
            // engine that cannot read the file does not reach it however
            // many roots are linked.
            if let Some(owner) = asset.engine_id {
                if owner != engine.id {
                    return EngineReach {
                        engine_id: engine.id,
                        engine_key: engine.key.clone(),
                        engine_name: engine.name.clone(),
                        reached: false,
                        via_root: None,
                        via_store: None,
                        reason: Some("format".into()),
                    };
                }
            }

            // An asset living directly in an engine's own root: that engine
            // reads it in place; every other engine has no path to it.
            if let Some(root) = asset_root {
                if let Some(root_engine) = root.engine_id {
                    let reached = root_engine == engine.id;
                    return EngineReach {
                        engine_id: engine.id,
                        engine_key: engine.key.clone(),
                        engine_name: engine.name.clone(),
                        reached,
                        via_root: None,
                        via_store: None,
                        reason: if reached { None } else { Some("root_not_linked".into()) },
                    };
                }
            }

            // A store asset: reached when one of the engine's root symlinks
            // resolves into the store that carries it.
            let into_this_store = engine_links.get(&engine.id).and_then(|pairs| {
                pairs
                    .iter()
                    .find(|(_, store_root_id)| Some(*store_root_id) == asset_root.map(|r| r.id))
            });
            match into_this_store {
                Some((link_path, _)) => EngineReach {
                    engine_id: engine.id,
                    engine_key: engine.key.clone(),
                    engine_name: engine.name.clone(),
                    reached: true,
                    via_root: Some(link_path.clone()),
                    via_store: asset_root.map(|r| r.path.clone()),
                    reason: None,
                },
                // No link, and none needed: the shared `.agents/` store is
                // read where it lies by every agent that adopts the
                // convention. Amp's skills *are* ~/.agents/skills, and Zed
                // has no root to link with. Demanding a symlink here told
                // those users their agent could not read what it reads
                // (spec §4.4 — this is the reach half, and it is a different
                // question from ownership, which still says nobody owns it).
                // No `via_root`, deliberately: there is no link to name.
                None if in_shared_store && reads_shared_dir(&engine.key) => EngineReach {
                    engine_id: engine.id,
                    engine_key: engine.key.clone(),
                    engine_name: engine.name.clone(),
                    reached: true,
                    via_root: None,
                    via_store: asset_root.map(|r| r.path.clone()),
                    reason: None,
                },
                None => EngineReach {
                    engine_id: engine.id,
                    engine_key: engine.key.clone(),
                    engine_name: engine.name.clone(),
                    reached: false,
                    via_root: None,
                    via_store: None,
                    reason: Some("root_not_linked".into()),
                },
            }
        })
        .collect()
}
