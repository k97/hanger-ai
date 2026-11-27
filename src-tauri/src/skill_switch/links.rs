//! Where the one-by-one links to a store skill are, and which links those are.
//!
//! An engine that links the store as a whole (`~/.claude/skills ->
//! ~/.agents/skills`) needs nothing done: the skill leaves its view when it
//! leaves the store. A link to one skill (`~/.cursor/skills/figma ->
//! ~/.agents/skills/figma`) would dangle, so the switch removes it, records
//! its text, and puts it back on On.
//!
//! Hanger cannot search the whole disk on every switch. It looks one level
//! deep in a fixed list of folders (`link_places`, Q2 of the plan), plus every
//! link it has recorded in its `links` table. A link anywhere else is not
//! found, and dangles while the skill is off.
//!
//! Only `symlink_metadata` and `read_link` are used: no link is followed to
//! decide what it is.

use std::collections::HashSet;
use std::ffi::OsString;
use std::fs;
use std::path::{Component, Path, PathBuf};

use crate::agents::{engine_base, AGENT_CONFIGS};

/// Home-relative folders that hold one-by-one links to store skills on this
/// machine and that no `AGENT_CONFIGS` row named a skills folder for when
/// measured, 2026-11-26 (`docs/plans/2026-11-26-skill-switch.md`, "Real-machine
/// facts"). Since 2026-11-27 the `antigravity` row names `.gemini/config/skills`
/// at home, so step 1 of `link_places` yields it too and the duplicate is
/// listed once. It stays here for step 3: that row has no project root, and
/// this list is what searches a linked project's `.gemini/config/skills`.
pub const EXTRA_LINK_PLACES: &[&str] = &[
    ".cursor/skills",
    ".copilot/skills",
    ".config/opencode/skills",
    ".opencode/skills",
    ".gemini/config/skills",
];

/// A project's own skills folder, which can hold a link per skill, or be a
/// link to the whole store (this repository's shape). Searched in a linked
/// project beside each engine's project folder.
const PROJECT_SHARED_SKILLS: &str = ".agents/skills";

/// A link to the skill, as found.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FoundLink {
    /// Where the link is, spelled as its folder was given.
    pub path: PathBuf,
    /// Raw bytes of the link text, never converted.
    pub text: OsString,
}

/// Folders searched one level deep, in this order (Q2):
/// 1. each AGENT_CONFIGS global root's `skills` folder, through engine_base;
/// 2. EXTRA_LINK_PLACES under home (measured 2026-11-26, this plan's facts table):
///    ".cursor/skills", ".copilot/skills", ".config/opencode/skills",
///    ".opencode/skills", ".gemini/config/skills";
/// 3. for each linked project, the same relative folders and each config's project_roots/skills;
/// 4. every top-level folder of the store (links inside another skill, Q1).
///
/// A place whose canonical path is the store is dropped, and so is one that
/// is not a folder on disk. A place reached twice is listed once. A place
/// inside the skill being moved is dropped by `find_links`, which knows the
/// skill.
pub fn link_places(home: &Path, store: &Path, projects: &[PathBuf]) -> Vec<PathBuf> {
    let mut candidates: Vec<PathBuf> = Vec::new();

    // 1.
    for config in AGENT_CONFIGS {
        if let Some(skills) = config.skills {
            for root in config.global_roots {
                candidates.push(engine_base(home, root).join(skills));
            }
        }
    }
    // 2.
    candidates.extend(EXTRA_LINK_PLACES.iter().map(|rel| home.join(rel)));
    // 3.
    for project in projects {
        candidates.extend(EXTRA_LINK_PLACES.iter().map(|rel| project.join(rel)));
        for config in AGENT_CONFIGS {
            if let Some(skills) = config.skills {
                for root in config.project_roots {
                    candidates.push(project.join(root).join(skills));
                }
            }
        }
        candidates.push(project.join(PROJECT_SHARED_SKILLS));
    }
    // 4. Real folders only: a store entry that is a link is a skill kept
    // elsewhere, and is not entered.
    if let Ok(entries) = fs::read_dir(store) {
        let mut tops: Vec<PathBuf> = entries
            .flatten()
            .filter(|entry| fs::symlink_metadata(entry.path()).map(|m| m.is_dir()).unwrap_or(false))
            .map(|entry| entry.path())
            .collect();
        tops.sort();
        candidates.extend(tops);
    }

    let store_real = fs::canonicalize(store).ok();
    let mut seen = HashSet::new();
    let mut places = Vec::new();
    for place in candidates {
        let Ok(real) = fs::canonicalize(&place) else { continue };
        if !real.is_dir() || Some(&real) == store_real.as_ref() {
            continue;
        }
        if seen.insert(real) {
            places.push(place);
        }
    }
    places
}

/// Every symlink directly inside `places`, plus each path in `recorded`
/// (the links table's dest_paths for this skill), whose text, resolved
/// lexically against the link's folder, names `skill` as spelled under the
/// home or its canonical path (they differ where ~/.agents is itself a link).
/// Already-dangling links to other skills are not returned.
///
/// `skill` is `<store>/<name>` as spelled. Its canonical form is the store's
/// canonical path joined with the name, so a skill that is itself a link is
/// never resolved to its target. A relative text is resolved against the
/// folder's canonical path, as the system resolves it. A place inside the
/// skill is not searched.
pub fn find_links(skill: &Path, places: &[PathBuf], recorded: &[PathBuf]) -> Vec<FoundLink> {
    let canonical = match (skill.parent().and_then(|p| fs::canonicalize(p).ok()), skill.file_name()) {
        (Some(parent), Some(name)) => Some(parent.join(name)),
        _ => None,
    };
    let names_the_skill = |resolved: &Path| resolved == skill || Some(resolved) == canonical.as_deref();
    let inside_the_skill = |real: &Path| real.starts_with(skill) || canonical.as_deref().is_some_and(|c| real.starts_with(c));

    let mut seen: HashSet<PathBuf> = HashSet::new();
    let mut found = Vec::new();
    let mut consider = |path: PathBuf, folder_real: &Path| {
        let Ok(meta) = fs::symlink_metadata(&path) else { return };
        if !meta.file_type().is_symlink() {
            return;
        }
        let Ok(text) = fs::read_link(&path) else { return };
        let resolved = normalise(&folder_real.join(&text));
        // One link reached through a place and through the table, under two
        // spellings, is listed once.
        let Some(name) = path.file_name() else { return };
        if names_the_skill(&resolved) && seen.insert(folder_real.join(name)) {
            found.push(FoundLink { path, text: text.into_os_string() });
        }
    };

    for place in places {
        let Ok(real) = fs::canonicalize(place) else { continue };
        if inside_the_skill(&real) {
            continue;
        }
        let Ok(entries) = fs::read_dir(place) else { continue };
        let mut paths: Vec<PathBuf> = entries.flatten().map(|entry| entry.path()).collect();
        paths.sort();
        for path in paths {
            consider(path, &real);
        }
    }
    for path in recorded {
        let Some(folder) = path.parent() else { continue };
        let Ok(real) = fs::canonicalize(folder) else { continue };
        if inside_the_skill(&real) {
            continue;
        }
        consider(path.clone(), &real);
    }
    found
}

/// `.` and `..` taken out by the path's own text, with no lookup. `..` at the
/// root stays at the root.
fn normalise(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
}
