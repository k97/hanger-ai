//! What one engine loads: each MCP server it declares, whether that server is
//! switched on, whether Hanger can switch it, and what the switched-on ones
//! cost in context.
//!
//! Nothing calls this yet; the commands that will are Task 8 of
//! `docs/plans/2026-11-24-context-control.md`.
//!
//! A fold. It opens no file, no database and no process, and it logs
//! nothing: the registrations, the kept servers, Gemini CLI's state file, a
//! file reader and a probe-cache lookup are all handed in. The one thing it
//! reads for itself is the environment's home folder (`HOME`, then
//! `USERPROFILE`), inside `preferences::sanitise_path`.
//!
//! # What an item may hold
//!
//! A server's name, its tier, its file's sanitised path, and the key that
//! identifies it (the file's path and the name, as `RegistrationKey` joins
//! them). No command, no argument, no address and no env variable: an item
//! has no field for one. A file's text is read here to find one flag, and
//! none of it is kept.
//!
//! # Which servers are items
//!
//! The engine's registrations in the order discovery found them, without
//! `ScopeTier::Local`: a local-scope server is keyed to one repository, and
//! `lib.rs::machine_wide` leaves it out of every machine-wide surface for
//! that reason. After them, for an engine switched by `SwitchKind::ClaudeCli`,
//! each server Hanger is keeping while it is off, in the order given.
//!
//! # Why an item has no switch
//!
//! The first of these that holds:
//!
//! 1. the host is `claude-ai` → `RunsOnVendorServers`
//! 2. the file is under `.claude/plugins/marketplaces/` → `ManagedByPlugin`
//! 3. the file is a system-wide source → `ManagedByPolicy`
//! 4. `registry::switch_for` has no row for the host at this tier: with no
//!    row for the host at all → `EngineNotConfirmed`; otherwise
//!    `SwitchesByNameEverywhere` for an engine switched by name, and
//!    `PerProjectComesNext` for any other
//! 5. the engine's own mechanism could not be read: the file or the state
//!    file is unreadable or does not parse → `FileUnparseable`; the server is
//!    declared somewhere a flag was never confirmed for → `EngineNotConfirmed`
//!
//! Whether the item is on is worked out apart from that, from the mechanism
//! alone (`told`), so an item with no switch still says what the engine was
//! told.
//!
//! # Finding a registration's row in `SOURCES`
//!
//! A `Registration` carries a host, a tier and a path, and not the row it was
//! read through. Two things are needed from that row:
//!
//! - its dialect, to read a flag. Every row for one host at one tier names
//!   the same dialect today, so the host and tier settle it (`dialect_of`).
//!   Where they ever do not, the item is `EngineNotConfirmed`, not a guess.
//! - whether it is system-wide. The path is compared with the end of each
//!   `SystemAbsolute` row for that host and tier (`is_system_wide`): such a
//!   row is joined to a system root whole, so its path is always the end of
//!   the file's.
//!
//! Both rest on the registry staying as it is, and
//! `tests/mcp_switch_tests.rs` pins each
//! (`every_flag_switched_tier_is_declared_in_one_dialect`,
//! `no_system_wide_source_is_a_glob`).
//!
//! # Known limits
//!
//! - With `CLAUDE_CONFIG_DIR` set, the plugin folder is
//!   `$CLAUDE_CONFIG_DIR/plugins/marketplaces/`, which rule 2 does not
//!   recognise. Such a server is still read-only, as `PerProjectComesNext`.
//! - A server kept by Hanger and declared again by hand under the same name
//!   is two items: one on, one off.
//! - Two servers one engine declares with the same launch are two items,
//!   each showing the cost, and one cost in the budget. If one of the two is
//!   off, the budget still counts the launch once, for the one that is on.

use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde::Serialize;

use crate::domain::RegistrationKey;
use crate::mcp::discover::{engine_display_name, DiscoveryResult, Registration};
use crate::mcp::engine_summary::{is_askable, launch_key};
use crate::mcp::registry::{
    host_by_id, switch_for, Dialect, ScopeTier, SourceLocation, SwitchKind, SOURCES, SWITCHES,
};
use crate::mcp::switch::edit::{self, EditError};
use crate::mcp::switch::vendor::StashedServer;
use crate::preferences::sanitise_path;

/// Whether the engine will load a server.
///
/// `On` means "declared, and not switched off by a mechanism Hanger has
/// confirmed". A host with no confirmed switch has no way to be told a server
/// is off, so its declared servers are `On`, whatever keys their entries
/// carry.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ItemState {
    On,
    Off,
}

/// Why Hanger shows a server's state and offers no switch for it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ReadOnlyReason {
    /// Nothing has confirmed a way to switch this engine's servers, or this
    /// server is declared where the confirmed way does not reach.
    EngineNotConfirmed,
    /// The engine has a switch, and not at this server's tier.
    PerProjectComesNext,
    /// The engine is switched by server name alone, so a switch here would
    /// reach every server of that name (ruling 18 in the plan).
    SwitchesByNameEverywhere,
    ManagedByPlugin,
    ManagedByPolicy,
    /// A Claude.ai connector: nothing on this machine starts it.
    RunsOnVendorServers,
    /// The file that says whether the server is on cannot be read, does not
    /// parse, or no longer declares the server.
    FileUnparseable,
}

/// One server, as one engine has it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ContextItem {
    /// `RegistrationKey::new(config_path, name)` as a string, or
    /// `"stash:<id>"` for a Claude Code server Hanger is keeping.
    pub key: String,
    pub name: String,
    /// `ScopeTier` in snake_case: `"global"`, `"user"` or `"project"`.
    /// `"local"` is spelled too and never arrives: a local-scope server is
    /// not an item.
    pub tier: String,
    /// Through `preferences::sanitise_path`. Empty for a kept server, which
    /// is declared in no file.
    pub config_path: String,
    pub state: ItemState,
    /// `None`: Hanger can switch it.
    pub read_only: Option<ReadOnlyReason>,
    /// `None`: not measured.
    pub estimated_tokens: Option<u64>,
    /// `None`: not measured.
    pub tool_count: Option<usize>,
}

/// One engine's servers and the budget they add up to. Every figure is
/// counted here: the webview renders them and derives none (`invariants.md`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EngineContext {
    pub engine_id: String,
    /// The registry's display name, or the id where the registry has none.
    pub engine_name: String,
    /// When a switch takes effect. `None` for every engine: nothing has been
    /// observed yet (ruling 19 in the plan).
    pub applies: Option<String>,
    pub items: Vec<ContextItem>,
    /// Items that are on. `on_count + off_count` is `items.len()`.
    pub on_count: usize,
    pub off_count: usize,
    /// Items that are on and measured: the "12 of 15 measured" pair, with
    /// `on_count`.
    pub measured_on_count: usize,
    /// The estimates of the items that are on and measured, summed, with a
    /// launch the engine declares in two files counted once: the engine
    /// describes it to the model once (`engine_summary.rs`, `own_launches`).
    /// MCP servers only.
    pub on_tokens_measured: u64,
}

/// What a cached probe says about one launch. The caller builds it from
/// `preferences::get_probe_result` and `probe::tool_cost`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Measured {
    pub estimated_tokens: u64,
    pub tool_count: usize,
}

/// The `registry::HOSTS` id of Claude.ai, whose connectors run on Anthropic's
/// servers.
const CLAUDE_AI: &str = "claude-ai";
/// Where Claude Code keeps the servers its plugins bring, as the `SOURCES`
/// row spells it.
const PLUGIN_FOLDER: &str = "/.claude/plugins/marketplaces/";
/// How a kept server's key starts. What follows is `StashedServer::id`.
const STASH_KEY: &str = "stash:";

/// One engine's context.
///
/// - `discovered`: machine-level discovery. Registrations of other hosts are
///   passed over.
/// - `stashed`: `vendor::claude_stashed`'s list. Used only for an engine
///   switched by `SwitchKind::ClaudeCli`.
/// - `gemini_state`: the text of `~/.gemini/mcp-server-enablement.json`,
///   `None` where that file does not exist. Used only for an engine switched
///   by `SwitchKind::GeminiEnablementFile`.
/// - `read_file`: a registration's `config_path` to that file's text, `None`
///   if it cannot be read. Asked only for a server switched by a key in its
///   own file.
/// - `probe_of`: a launch's `probe::cache_key` to what the probe cache holds
///   for it. Asked once for each launch, and never for a server that could
///   not be asked anything (`engine_summary::is_askable`): every Claude.ai
///   connector on a machine shares one key, and whatever sits under it is no
///   connector's answer.
///
/// An id that is not in `registry::HOSTS` gives an empty context named for
/// the id.
pub fn engine_context<R, P>(
    host_id: &str,
    discovered: &DiscoveryResult,
    stashed: &[StashedServer],
    gemini_state: Option<&str>,
    read_file: R,
    mut probe_of: P,
) -> EngineContext
where
    R: Fn(&str) -> Option<String>,
    P: FnMut(&str) -> Option<Measured>,
{
    let mut items: Vec<ContextItem> = Vec::new();
    let mut answers: HashMap<String, Option<Measured>> = HashMap::new();
    let mut summed: HashSet<String> = HashSet::new();
    let mut on_tokens_measured = 0u64;

    if host_by_id(host_id).is_some() {
        let declared = discovered
            .registrations
            .iter()
            .filter(|reg| reg.host_id == host_id && reg.tier != ScopeTier::Local);
        for reg in declared {
            let (state, fault) = told(reg, gemini_state, &read_file);
            let launch = is_askable(reg).then(|| launch_key(reg));
            let measured = launch
                .as_ref()
                .and_then(|key| *answers.entry(key.clone()).or_insert_with(|| probe_of(key)));
            if let (ItemState::On, Some(measured), Some(key)) = (state, measured, launch) {
                if summed.insert(key) {
                    on_tokens_measured += measured.estimated_tokens;
                }
            }
            items.push(ContextItem {
                key: RegistrationKey::new(&reg.config_path, &reg.server.name).to_string(),
                name: reg.server.name.clone(),
                tier: tier_name(reg.tier).to_string(),
                config_path: sanitise_path(&reg.config_path),
                state,
                read_only: standing_reason(reg).or(fault),
                estimated_tokens: measured.map(|m| m.estimated_tokens),
                tool_count: measured.map(|m| m.tool_count),
            });
        }

        if is_switched_by(host_id, SwitchKind::ClaudeCli) {
            // A kept server is off, and Hanger's to switch back on. It has no
            // cost: `StashedServer` carries no launch to look one up by.
            items.extend(stashed.iter().map(|kept| ContextItem {
                key: format!("{STASH_KEY}{}", kept.id),
                name: kept.name.clone(),
                tier: tier_name(ScopeTier::User).to_string(),
                config_path: String::new(),
                state: ItemState::Off,
                read_only: None,
                estimated_tokens: None,
                tool_count: None,
            }));
        }
    }

    let on = || items.iter().filter(|item| item.state == ItemState::On);
    let on_count = on().count();
    let measured_on_count = on().filter(|item| item.estimated_tokens.is_some()).count();
    EngineContext {
        engine_id: host_id.to_string(),
        engine_name: engine_display_name(host_id),
        applies: None,
        on_count,
        off_count: items.len() - on_count,
        measured_on_count,
        on_tokens_measured,
        items,
    }
}

/// Rules 1 to 4 of the module doc: a reason that holds whatever the engine's
/// mechanism says.
fn standing_reason(reg: &Registration) -> Option<ReadOnlyReason> {
    if reg.host_id == CLAUDE_AI {
        return Some(ReadOnlyReason::RunsOnVendorServers);
    }
    if reg.config_path.contains(PLUGIN_FOLDER) {
        return Some(ReadOnlyReason::ManagedByPlugin);
    }
    if is_system_wide(reg) {
        return Some(ReadOnlyReason::ManagedByPolicy);
    }
    if switch_for(reg.host_id, reg.tier).is_some() {
        return None;
    }
    if !SWITCHES.iter().any(|row| row.host_id == reg.host_id) {
        return Some(ReadOnlyReason::EngineNotConfirmed);
    }
    if is_switched_by(reg.host_id, SwitchKind::GeminiEnablementFile) {
        return Some(ReadOnlyReason::SwitchesByNameEverywhere);
    }
    Some(ReadOnlyReason::PerProjectComesNext)
}

/// What the engine has been told about one server, by the mechanism Hanger
/// has confirmed for it: its state, and rule 5's reason where that mechanism
/// could not be read.
fn told<R>(
    reg: &Registration,
    gemini_state: Option<&str>,
    read_file: &R,
) -> (ItemState, Option<ReadOnlyReason>)
where
    R: Fn(&str) -> Option<String>,
{
    // An engine switched by name is switched at every tier at once, so its
    // state file speaks for a server whose own tier has no row.
    let kind = if is_switched_by(reg.host_id, SwitchKind::GeminiEnablementFile) {
        Some(SwitchKind::GeminiEnablementFile)
    } else {
        switch_for(reg.host_id, reg.tier).map(|row| row.kind)
    };
    match kind {
        Some(SwitchKind::GeminiEnablementFile) => {
            match edit::gemini_is_enabled(gemini_state, &reg.server.name) {
                Ok(true) => (ItemState::On, None),
                Ok(false) => (ItemState::Off, None),
                Err(_) => (ItemState::On, Some(ReadOnlyReason::FileUnparseable)),
            }
        }
        Some(kind @ (SwitchKind::EnabledKey | SwitchKind::DisabledKey)) => {
            flag(reg, kind, read_file)
        }
        // Claude Code is switched off by removal: a server it still declares
        // is on. And an engine with nothing confirmed at this tier cannot
        // have been told a server is off.
        Some(SwitchKind::ClaudeCli) | None => (ItemState::On, None),
    }
}

/// The state of a server switched by a key in its own declaration.
fn flag<R>(reg: &Registration, kind: SwitchKind, read_file: &R) -> (ItemState, Option<ReadOnlyReason>)
where
    R: Fn(&str) -> Option<String>,
{
    let Some(body) = read_file(&reg.config_path) else {
        return (ItemState::On, Some(ReadOnlyReason::FileUnparseable));
    };
    let Some(dialect) = dialect_of(reg.host_id, reg.tier) else {
        return (ItemState::On, Some(ReadOnlyReason::EngineNotConfirmed));
    };
    match edit::read_flag(&body, dialect, kind, &reg.server.name) {
        Ok(Some(false)) => (ItemState::Off, None),
        // No key is on, for every engine switched by a flag.
        Ok(Some(true) | None) => (ItemState::On, None),
        // Declared where the flag was never confirmed: a Codex server under
        // the legacy `tools` table.
        Err(EditError::UnsupportedDialect) => (ItemState::On, Some(ReadOnlyReason::EngineNotConfirmed)),
        // `NotFound`: discovery saw the server, and the editor reading the
        // file now cannot find it. The file is not the one discovery read, so
        // it is treated like one that does not parse.
        Err(EditError::Unparseable(_) | EditError::NotFound) => {
            (ItemState::On, Some(ReadOnlyReason::FileUnparseable))
        }
    }
}

/// Whether any of the engine's `SWITCHES` rows is of that kind.
fn is_switched_by(host_id: &str, kind: SwitchKind) -> bool {
    SWITCHES.iter().any(|row| row.host_id == host_id && row.kind == kind)
}

/// The dialect `host_id` declares servers in at `tier`, where every `SOURCES`
/// row for the pair agrees on one. See "Finding a registration's row" in the
/// module doc.
fn dialect_of(host_id: &str, tier: ScopeTier) -> Option<Dialect> {
    let mut rows = SOURCES.iter().filter(|source| source.host_id == host_id && source.tier == tier);
    let first = rows.next()?.dialect;
    rows.all(|source| source.dialect == first).then_some(first)
}

/// Whether the registration was read from a system-wide file: a managed
/// `managed-mcp.json`, or Gemini CLI's system settings.
fn is_system_wide(reg: &Registration) -> bool {
    let path = Path::new(&reg.config_path);
    SOURCES.iter().any(|source| {
        source.location == SourceLocation::SystemAbsolute
            && source.host_id == reg.host_id
            && source.tier == reg.tier
            && path.ends_with(source.path)
    })
}

fn tier_name(tier: ScopeTier) -> &'static str {
    match tier {
        ScopeTier::Global => "global",
        ScopeTier::User => "user",
        ScopeTier::Local => "local",
        ScopeTier::Project => "project",
    }
}
