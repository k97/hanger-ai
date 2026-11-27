//! What the webview may ask of `mcp::switch`: one engine's context, every
//! engine's, a switch, an Undo, a measurement, and the servers Hanger is
//! keeping off.
//!
//! Six commands in `lib.rs` call this module and nothing else in
//! `mcp::switch`: `get_engine_context`, `get_engine_contexts`,
//! `set_mcp_server_enabled`, `undo_mcp_switch`, `measure_engine_context` and
//! `get_kept_off_servers`.
//! Each is a thin wrapper.
//! Every folder is a parameter here (`SwitchPlaces`), so the tests in
//! `tests/mcp_switch_tests.rs` and `tests/ipc_boundary_tests.rs` run against
//! a temp folder and never the real home.
//!
//! This module logs nothing.
//!
//! # A key is not a path
//!
//! The webview sends a key and never a path, and the key is not trusted. It
//! is accepted only when it is, byte for byte, the key of an item in this
//! engine's context as Hanger has just built it: a server the machine pass
//! (`discover::discover_machine_at`) found for this engine a moment ago, or a
//! server `vendor` is keeping. The file that is then read and written is the
//! one that registration names, in discovery's own spelling. Nothing is
//! parsed out of the key, and `discover::resolve_registration` is never
//! called with it: that function falls back to reading any path as a config
//! file, which a command that writes must not be able to reach.
//!
//! | The key | Answer |
//! |---|---|
//! | is no item of this engine's context, and is one of another engine's | `WrongEngine` |
//! | is no item of any engine's | `NotFound` |
//! | is an item Hanger shows with a reason and no switch | `ReadOnly` |
//! | is a kept server (`stash:<id>`), asked to be off | `ReadOnly` |
//!
//! A server pinned to one project (Claude Code's local scope) is no item, so
//! no key reaches it. Neither does a project's own config file: a project
//! registration is not in the machine pass, and switching one is not built
//! here.
//!
//! # What a switch does
//!
//! By the engine's row in `registry::SWITCHES`:
//!
//! - a flag in the file (Codex): `edit::set_enabled` on the file's text, a
//!   second check that nothing but that flag changed
//!   (`only_the_flag_differs`), then `apply::safe_replace`.
//! - Gemini CLI: `edit::gemini_set_enabled` on its state file, then
//!   `apply::safe_replace`. The file is made if it is not there.
//! - Claude Code: `vendor::claude_off`, or `vendor::claude_on` for a kept
//!   server. A declared server asked to be on is on already.
//!
//! A switch that would change nothing writes nothing and has no receipt.
//!
//! # Receipt ids
//!
//! What a switch hands back for its Undo, and what `undo_for` takes:
//!
//! - `file:<uuid>`: an `apply::Receipt`. Undo is `apply::undo`, allowed only
//!   for a file this engine's own switch writes: a config file it declares a
//!   flag-switched server in, or Gemini CLI's state file. The Undo has a
//!   receipt of its own.
//! - `kept:<uuid>`: a server `vendor` is keeping. Undo switches it back on.
//! - `restored:<name>`: a kept server that was switched back on. Undo
//!   switches the user-scope server of that name off again, by the same path
//!   and the same checks as any other switch-off.
//!
//! Anything else is `NotUndoable`.
//!
//! # What a reply holds
//!
//! `SwitchReply` is the engine's context, rebuilt after the switch, and a
//! receipt id. `SwitchFailure` is a closed set of codes with no payload: the
//! sentences `edit`, `apply` and `vendor` attach to their errors stop here,
//! and so does everything a config file holds and everything a command
//! prints. The webview turns a code into words.
//!
//! # Known limits
//!
//! - Discovery reads a file once and the switch reads it again. A file that
//!   stops declaring the server in between is `NotFound`, and one that can no
//!   longer be read is `Unparseable`; both are found before anything is
//!   written.
//! - `only_the_flag_differs` compares the two texts as parsed data, so a
//!   change to a comment or to spacing passes it. `edit`'s own tests cover
//!   those. A TOML file holding a `nan` never passes: `nan` is not equal to
//!   itself.
//! - With no `claude` on the search path, a `kept:` Undo is `CliNotFound`
//!   whether or not its id is a kept server's.
//! - `measure_for` asks one server at a time and waits for each, so an engine
//!   with many servers that do not answer takes that many probe timeouts.

use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::agents::engine_base;
use crate::domain::RegistrationKey;
use crate::mcp::dialect::strip_jsonc;
use crate::mcp::discover::{discover_machine_at, engine_display_name, DiscoveryResult, Registration};
use crate::mcp::registry::{host_by_id, switch_for, Dialect, ScopeTier, SwitchKind, SWITCHES};
use crate::mcp::switch::apply::{self, ApplyError, Format};
use crate::mcp::switch::context::{self, is_askable, ContextItem, EngineContext, ItemState, Measured};
use crate::mcp::switch::edit::{self, EditError};
use crate::mcp::switch::vendor::{self, StashedServer, SwitchError};

/// The folders a switch reads and writes.
#[derive(Debug, Clone)]
pub struct SwitchPlaces {
    /// `scanner::get_home_dir()` in production.
    pub home: PathBuf,
    /// The filesystem root that system-wide config is read under: `/` in
    /// production. `discover_machine_at`'s second argument.
    pub system: PathBuf,
    /// `<app data dir>/switch/backups`: `apply`'s copies and receipts.
    pub backups: PathBuf,
    /// `<app data dir>/switch/stash`: the servers `vendor` is keeping.
    pub stash: PathBuf,
}

/// Claude Code's own command, as the user's terminal would find it.
#[derive(Debug, Clone)]
pub struct ClaudeCli {
    /// `None`: no `claude` is on the search path.
    pub program: Option<PathBuf>,
    /// The `PATH` the command is run with.
    pub path_env: String,
}

/// What a switch or an Undo hands back.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SwitchReply {
    /// The engine's context, built after the switch.
    pub context: EngineContext,
    /// What `undo_for` takes to undo this. `None`: nothing was changed.
    pub receipt_id: Option<String>,
    /// Whether there is anything to undo. `true` exactly when `receipt_id`
    /// is there.
    pub undoable: bool,
}

/// A server Hanger is keeping while it is switched off for Claude Code.
///
/// Declared in no config file, so it is not a registration: it is in no row
/// of the MCP servers list and in none of the list's counts. It is reported
/// beside the list instead (`kept_off_for`).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeptOffServer {
    /// `"stash:<id>"`: what `set_mcp_server_enabled` takes to switch it back
    /// on.
    pub key: String,
    pub name: String,
    /// The host whose `registry::SWITCHES` row is `SwitchKind::ClaudeCli`.
    pub engine_id: String,
    /// The registry's display name for that host.
    pub engine_name: String,
    /// `StashedServer::transport`, already sanitised.
    pub transport: String,
    /// When it was switched off.
    pub at_ms: i64,
    /// Whether a config file on this machine still declares a server of this
    /// name for any engine, so the MCP servers list already has a row for
    /// it. Worked out here so the webview never filters the list to find out.
    pub also_declared: bool,
}

/// Every server Hanger is keeping switched off, with its figures.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct KeptOff {
    /// Newest first, as `vendor::claude_stashed` lists them.
    pub servers: Vec<KeptOffServer>,
    /// `servers.len()`.
    pub count: usize,
    /// How many have `also_declared == false`: the names the MCP servers
    /// list has no row for at all.
    pub only_kept_count: usize,
}

/// Why a switch, or an Undo, did not happen.
///
/// A code and nothing else. No variant carries a path, text from a file, a
/// parser's message or anything a command printed, so none of those can
/// reach the webview through a refusal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SwitchFailure {
    /// The key names no server Hanger found, or the server is gone from its
    /// file.
    NotFound,
    /// The key is another engine's.
    WrongEngine,
    /// Hanger shows this server and does not switch it.
    ReadOnly,
    /// The file that would be changed cannot be read or does not parse.
    Unparseable,
    /// The file is not as Hanger read it. Nothing was written.
    ChangedSinceRead,
    /// The change, or the copy kept before it, could not be written.
    WriteFailed,
    /// What was read back does not confirm the change. It may or may not
    /// have been made.
    NotVerified,
    /// Claude Code would not hand this server back unchanged, so it was not
    /// removed.
    WouldNotComeBack,
    /// No `claude` is on the search path.
    CliNotFound,
    /// Claude Code's command did not make the change.
    CliFailed,
    /// A server of that name is declared again. Nothing was run.
    AlreadyThere,
    /// The receipt is not one of this engine's, or what it records can no
    /// longer be taken back.
    NotUndoable,
    /// The server's name cannot be handed to a command.
    NameRefused,
}

impl SwitchFailure {
    /// The code as the webview receives it: the variant in snake_case, which
    /// is also how it serialises.
    pub fn code(self) -> &'static str {
        match self {
            SwitchFailure::NotFound => "not_found",
            SwitchFailure::WrongEngine => "wrong_engine",
            SwitchFailure::ReadOnly => "read_only",
            SwitchFailure::Unparseable => "unparseable",
            SwitchFailure::ChangedSinceRead => "changed_since_read",
            SwitchFailure::WriteFailed => "write_failed",
            SwitchFailure::NotVerified => "not_verified",
            SwitchFailure::WouldNotComeBack => "would_not_come_back",
            SwitchFailure::CliNotFound => "cli_not_found",
            SwitchFailure::CliFailed => "cli_failed",
            SwitchFailure::AlreadyThere => "already_there",
            SwitchFailure::NotUndoable => "not_undoable",
            SwitchFailure::NameRefused => "name_refused",
        }
    }
}

// Each of the three is matched in full, with no catch-all arm: a variant
// added to `edit`, `apply` or `vendor` does not compile here until it has
// been given a code.

impl From<EditError> for SwitchFailure {
    fn from(error: EditError) -> Self {
        match error {
            EditError::NotFound => SwitchFailure::NotFound,
            EditError::Unparseable(_) => SwitchFailure::Unparseable,
            // Declared where no flag was confirmed: shown, and not switched.
            EditError::UnsupportedDialect => SwitchFailure::ReadOnly,
        }
    }
}

impl From<ApplyError> for SwitchFailure {
    fn from(error: ApplyError) -> Self {
        match error {
            ApplyError::ChangedSinceRead => SwitchFailure::ChangedSinceRead,
            ApplyError::Backup(_) | ApplyError::Write(_) => SwitchFailure::WriteFailed,
            // The file may or may not hold the new text: `apply` puts the
            // original back where it can, and says so only in its sentence.
            ApplyError::Verify(_) => SwitchFailure::NotVerified,
            ApplyError::NotUndoable(_) => SwitchFailure::NotUndoable,
        }
    }
}

impl From<SwitchError> for SwitchFailure {
    fn from(error: SwitchError) -> Self {
        match error {
            SwitchError::NotFound => SwitchFailure::NotFound,
            SwitchError::NameRefused => SwitchFailure::NameRefused,
            SwitchError::CliFailed => SwitchFailure::CliFailed,
            SwitchError::NotVerified => SwitchFailure::NotVerified,
            SwitchError::StashFailed(_) => SwitchFailure::WriteFailed,
            SwitchError::AlreadyThere => SwitchFailure::AlreadyThere,
            SwitchError::WouldNotComeBack => SwitchFailure::WouldNotComeBack,
        }
    }
}

/// The one thing a test replaces: what happens between Hanger working out a
/// file's new text and writing it. `set_enabled_for` passes a hook that does
/// nothing.
#[doc(hidden)]
#[derive(Clone, Copy)]
pub struct Seams<'a> {
    pub before_write: &'a (dyn Fn() + Sync),
}

const FILE: &str = "file:";
const KEPT: &str = "kept:";
const RESTORED: &str = "restored:";

/// Gemini CLI's folder under the home, and its state file inside it.
const GEMINI_FOLDER: &str = ".gemini";
const GEMINI_STATE_FILE: &str = "mcp-server-enablement.json";
/// The file Claude Code keeps its user-scope servers in.
const CLAUDE_CONFIG: &str = ".claude.json";

/// One engine's context: its servers, which are on, and what the probe cache
/// says the switched-on ones cost.
///
/// `probe_of` is `context::engine_context`'s: a launch's cache key to what
/// the probe cache holds for it. `cached_measure` is the one production
/// passes. Nothing is started.
pub fn context_for<P>(places: &SwitchPlaces, engine_id: &str, probe_of: P) -> EngineContext
where
    P: FnMut(&str) -> Option<Measured>,
{
    context_of(&look(places), engine_id, probe_of)
}

/// Every engine's context, from one discovery pass: what one `context_for`
/// per engine would give, for each engine that has an item.
///
/// The engines are every host the machine pass finds a registration of for,
/// local-scope ones aside, in the order discovery first saw each; then, if
/// it is not listed already, the engine switched through `claude` when
/// Hanger is keeping a server for it. Any other host's context has no items,
/// and is left out. `probe_of` is asked as `context_for` asks it.
pub fn contexts_for<P>(places: &SwitchPlaces, mut probe_of: P) -> Vec<EngineContext>
where
    P: FnMut(&str) -> Option<Measured>,
{
    let seen = look(places);
    let mut engines: Vec<&str> = Vec::new();
    for reg in &seen.discovered.registrations {
        if reg.tier != ScopeTier::Local && host_by_id(reg.host_id).is_some() && !engines.contains(&reg.host_id) {
            engines.push(reg.host_id);
        }
    }
    if !seen.stashed.is_empty() {
        let keeper = SWITCHES.iter().find(|row| row.kind == SwitchKind::ClaudeCli).map(|row| row.host_id);
        if let Some(keeper) = keeper.filter(|id| !engines.contains(id)) {
            engines.push(keeper);
        }
    }
    engines.into_iter().map(|engine_id| context_of(&seen, engine_id, &mut probe_of)).collect()
}

/// What the probe cache holds for one launch, as a context wants it. `None`:
/// nobody has asked that server yet.
pub fn cached_measure(db_path: &Path, launch_key: &str) -> Option<Measured> {
    measured(crate::preferences::get_probe_result(db_path, launch_key).ok().flatten()?)
}

/// `cached_measure` on a connection the caller holds.
pub fn cached_measure_on(conn: &rusqlite::Connection, launch_key: &str) -> Option<Measured> {
    measured(crate::preferences::get_probe_result_on(conn, launch_key).ok().flatten()?)
}

fn measured(cached: crate::preferences::CachedProbe) -> Option<Measured> {
    let cost = crate::mcp::probe::tool_cost(&cached.result);
    Some(Measured { estimated_tokens: cost.estimated_tokens, tool_count: cost.tool_count })
}

/// Whether the engine is switched through `claude`, so that a caller can
/// leave the search path alone for every engine that is not.
pub fn uses_claude_cli(engine_id: &str) -> bool {
    context::is_switched_by(engine_id, SwitchKind::ClaudeCli)
}

/// Every server Hanger is keeping switched off, for the MCP servers list to
/// show beside its rows.
///
/// A kept server is declared in no file, so it is no registration: it is not
/// in `servers::group_servers`'s rows or in any count `scanner::count_assets`
/// makes, and this adds it to neither. `also_declared` is worked out over the
/// population that list is built from, the machine pass without
/// `ScopeTier::Local` (`lib.rs::machine_wide`), matching names trimmed and
/// nothing else, as `group_servers` groups them.
///
/// Reads the stash and the machine pass's config files. Writes nothing and
/// starts nothing. With no engine switched by `SwitchKind::ClaudeCli` in
/// `registry::SWITCHES`, nothing is reported.
pub fn kept_off_for(places: &SwitchPlaces) -> KeptOff {
    let Some(engine_id) = SWITCHES.iter().find(|row| row.kind == SwitchKind::ClaudeCli).map(|row| row.host_id) else {
        return KeptOff { servers: Vec::new(), count: 0, only_kept_count: 0 };
    };
    let discovered = discover_machine_at(&places.home, &places.system);
    let listed: HashSet<&str> = discovered
        .registrations
        .iter()
        .filter(|reg| reg.tier != ScopeTier::Local)
        .map(|reg| reg.server.name.trim())
        .collect();
    let engine_name = engine_display_name(engine_id);
    let servers: Vec<KeptOffServer> = vendor::claude_stashed(&places.stash)
        .into_iter()
        .map(|kept| KeptOffServer {
            key: format!("{}{}", context::STASH_KEY, kept.id),
            also_declared: listed.contains(kept.name.trim()),
            name: kept.name,
            engine_id: engine_id.to_string(),
            engine_name: engine_name.clone(),
            transport: kept.transport,
            at_ms: kept.at_ms,
        })
        .collect();
    let only_kept_count = servers.iter().filter(|kept| !kept.also_declared).count();
    KeptOff { count: servers.len(), only_kept_count, servers }
}

/// Switch one server off or on for one engine.
///
/// `key` is a `ContextItem::key` from this engine's context. See "A key is
/// not a path" in the module doc for what is refused.
pub async fn set_enabled_for<P>(
    places: &SwitchPlaces,
    cli: &ClaudeCli,
    engine_id: &str,
    key: &str,
    enabled: bool,
    probe_of: P,
) -> Result<SwitchReply, SwitchFailure>
where
    P: FnMut(&str) -> Option<Measured>,
{
    set_enabled_with(places, cli, engine_id, key, enabled, probe_of, Seams { before_write: &|| {} }).await
}

/// `set_enabled_for`, with the moment before the write supplied.
#[doc(hidden)]
pub async fn set_enabled_with<P>(
    places: &SwitchPlaces,
    cli: &ClaudeCli,
    engine_id: &str,
    key: &str,
    enabled: bool,
    probe_of: P,
    seams: Seams<'_>,
) -> Result<SwitchReply, SwitchFailure>
where
    P: FnMut(&str) -> Option<Measured>,
{
    let receipt_id = switch(places, cli, engine_id, key, enabled, seams).await?;
    Ok(SwitchReply {
        context: context_for(places, engine_id, probe_of),
        undoable: receipt_id.is_some(),
        receipt_id,
    })
}

/// Take back one switch, by the receipt id its reply carried.
///
/// The reply's own receipt id undoes the Undo.
pub async fn undo_for<P>(
    places: &SwitchPlaces,
    cli: &ClaudeCli,
    engine_id: &str,
    receipt_id: &str,
    probe_of: P,
) -> Result<SwitchReply, SwitchFailure>
where
    P: FnMut(&str) -> Option<Measured>,
{
    // An id that is not this engine's, or names nothing, is one answer
    // whatever the function underneath calls it.
    let not_found_is_not_undoable = |failure: SwitchFailure| match failure {
        SwitchFailure::NotFound => SwitchFailure::NotUndoable,
        other => other,
    };

    let next = if let Some(id) = receipt_id.strip_prefix(FILE) {
        undo_file(places, engine_id, id)?
    } else if let Some(stash_id) = receipt_id.strip_prefix(KEPT) {
        if !uses_claude_cli(engine_id) {
            return Err(SwitchFailure::NotUndoable);
        }
        let program = cli.program.as_deref().ok_or(SwitchFailure::CliNotFound)?;
        let config = engine_base(&places.home, CLAUDE_CONFIG);
        let kept = vendor::claude_on(&config, stash_id, &places.stash, program, &cli.path_env)
            .await
            .map_err(|error| not_found_is_not_undoable(error.into()))?;
        format!("{RESTORED}{}", kept.name)
    } else if let Some(name) = receipt_id.strip_prefix(RESTORED) {
        // Off again, for the server of that name this engine declares where
        // its command reaches. From there on it is a switch like any other.
        let key = {
            let seen = look(places);
            let found = declared(&seen, engine_id)
                .find(|reg| reg.server.name == name && kind_of(reg) == Some(SwitchKind::ClaudeCli))
                .map(key_of);
            found.ok_or(SwitchFailure::NotUndoable)?
        };
        switch(places, cli, engine_id, &key, false, Seams { before_write: &|| {} })
            .await
            .map_err(not_found_is_not_undoable)?
            .ok_or(SwitchFailure::NotUndoable)?
    } else {
        return Err(SwitchFailure::NotUndoable);
    };

    Ok(SwitchReply {
        context: context_for(places, engine_id, probe_of),
        receipt_id: Some(next),
        undoable: true,
    })
}

/// Ask each of the engine's switched-on servers what it provides, one at a
/// time, and hand back the context those answers make.
///
/// A server is asked only if it is on, declared in a file (a kept server is
/// off), and can be asked anything at all (`context::is_askable`). A
/// server that is off is never started. Each is asked through
/// `crate::probe_and_index`, which is `cached_probe` and its two rules: a
/// server with a fresh answer in the store is not started again, and a
/// server that is already running is not started a second time.
pub async fn measure_for(places: &SwitchPlaces, engine_id: &str, db_path: &Path, now_ms: i64) -> EngineContext {
    let seen = look(places);
    let context = context_of(&seen, engine_id, |_| None);
    let on: HashSet<&str> = context
        .items
        .iter()
        .filter(|item| item.state == ItemState::On)
        .map(|item| item.key.as_str())
        .collect();
    for reg in declared(&seen, engine_id) {
        let key = key_of(reg);
        if on.contains(key.as_str()) && is_askable(reg) {
            // `running: false` is the caller's guess, and `cached_probe`
            // checks the process table itself before it believes it.
            crate::probe_and_index(db_path, &key, reg, false, false, now_ms).await;
        }
    }
    context_for(places, engine_id, |launch| cached_measure(db_path, launch))
}

/// Whether `after` is `before` with nothing changed but one server's
/// `enabled` and `disabled` keys.
///
/// The check made between `edit::set_enabled` and the write. Both texts are
/// parsed as data, with serde_json or the `toml` crate and not with the
/// editors' own parsers; the two keys are taken out of that one server's
/// entry in each; and what is left has to be equal. A text that does not
/// parse, a server that is in neither, and a dialect that is not switched by
/// a flag all fail it.
#[doc(hidden)]
pub fn only_the_flag_differs(before: &str, after: &str, dialect: Dialect, name: &str) -> bool {
    let Some((format, servers)) = layout(dialect) else { return false };
    match format {
        Format::Toml => {
            let rest = |text: &str| -> Option<toml::Table> {
                let mut file: toml::Table = toml::from_str(text).ok()?;
                let entry = file.get_mut(servers)?.as_table_mut()?.get_mut(name)?.as_table_mut()?;
                entry.remove("enabled");
                entry.remove("disabled");
                Some(file)
            };
            matches!((rest(before), rest(after)), (Some(before), Some(after)) if before == after)
        }
        Format::Jsonc | Format::StrictJson => {
            let rest = |text: &str| -> Option<serde_json::Value> {
                let mut file: serde_json::Value = serde_json::from_str(&strip_jsonc(text)).ok()?;
                let entry = file.get_mut(servers)?.get_mut(name)?.as_object_mut()?;
                entry.remove("enabled");
                entry.remove("disabled");
                Some(file)
            };
            matches!((rest(before), rest(after)), (Some(before), Some(after)) if before == after)
        }
    }
}

/// What a flag-switched dialect's file has to parse as, and the key its
/// servers live under.
///
/// `edit` has a table of its own for the same dialects. This one is kept
/// apart from it on purpose: `only_the_flag_differs` checks the editor's
/// work, and would check nothing if it looked where the editor told it to.
fn layout(dialect: Dialect) -> Option<(Format, &'static str)> {
    match dialect {
        Dialect::CodexToml => Some((Format::Toml, "mcp_servers")),
        Dialect::McpServers => Some((Format::Jsonc, "mcpServers")),
        Dialect::VsCodeServers => Some((Format::Jsonc, "servers")),
        Dialect::OpenCodeMcp => Some((Format::Jsonc, "mcp")),
        Dialect::ZedContextServers => Some((Format::Jsonc, "context_servers")),
        Dialect::AmpSettingsKey => Some((Format::Jsonc, "amp.mcpServers")),
        Dialect::ClaudeJson | Dialect::ClaudeAiConnectors | Dialect::Unsupported => None,
    }
}

/// Everything `context::engine_context` is handed, read once.
struct Seen {
    discovered: DiscoveryResult,
    stashed: Vec<StashedServer>,
    gemini_state: StateFile,
}

/// Gemini CLI's state file, as it was found.
enum StateFile {
    /// Not there, which Gemini reads as every server on.
    Absent,
    Text(String),
    /// There, and not readable as text.
    Unreadable,
}

impl StateFile {
    fn read(path: &Path) -> StateFile {
        match fs::read_to_string(path) {
            Ok(text) => StateFile::Text(text),
            Err(error) if error.kind() == io::ErrorKind::NotFound => StateFile::Absent,
            Err(_) => StateFile::Unreadable,
        }
    }

    /// What the fold is handed. It has two ways to hear about the file: no
    /// text, which it reads as every server on, and a text. A file that is
    /// there and cannot be read is handed over as the empty text, which is
    /// not JSON, so its servers lose their switch (`FileUnparseable`) and
    /// are not shown as on by a file nobody could read.
    fn for_the_fold(&self) -> Option<&str> {
        match self {
            StateFile::Absent => None,
            StateFile::Text(text) => Some(text),
            StateFile::Unreadable => Some(""),
        }
    }
}

fn look(places: &SwitchPlaces) -> Seen {
    Seen {
        discovered: discover_machine_at(&places.home, &places.system),
        stashed: vendor::claude_stashed(&places.stash),
        gemini_state: StateFile::read(&gemini_state_file(&places.home)),
    }
}

fn context_of<P>(seen: &Seen, engine_id: &str, probe_of: P) -> EngineContext
where
    P: FnMut(&str) -> Option<Measured>,
{
    context::engine_context(
        engine_id,
        &seen.discovered,
        &seen.stashed,
        seen.gemini_state.for_the_fold(),
        |path| fs::read_to_string(path).ok(),
        probe_of,
    )
}

/// Gemini CLI's state file. Its folder is resolved the way discovery
/// resolves the folder of `.gemini/settings.json`: `discover::home_base_for`
/// hands a source's first segment to `agents::engine_base`. No variable in
/// `agents::CONFIG_DIR_ENVS` relocates `.gemini` today, so this is the home's
/// own `.gemini`.
fn gemini_state_file(home: &Path) -> PathBuf {
    engine_base(home, GEMINI_FOLDER).join(GEMINI_STATE_FILE)
}

/// The engine's registrations that are items of its context: every one but
/// the local-scope ones, as `context::engine_context` takes them.
fn declared<'a>(seen: &'a Seen, engine_id: &'a str) -> impl Iterator<Item = &'a Registration> {
    seen.discovered
        .registrations
        .iter()
        .filter(move |reg| reg.host_id == engine_id && reg.tier != ScopeTier::Local)
}

/// A registration's key, as `context::engine_context` gives its item.
fn key_of(reg: &Registration) -> String {
    RegistrationKey::new(&reg.config_path, &reg.server.name).to_string()
}

fn kind_of(reg: &Registration) -> Option<SwitchKind> {
    switch_for(reg.host_id, reg.tier).map(|row| row.kind)
}

/// Whether a key that is none of this engine's is one of another's: a server
/// another host declares, or a kept server asked for under an engine that
/// keeps none.
fn is_another_engines(seen: &Seen, engine_id: &str, key: &str) -> bool {
    let declared_elsewhere = seen
        .discovered
        .registrations
        .iter()
        .any(|reg| reg.host_id != engine_id && reg.tier != ScopeTier::Local && key_of(reg) == key);
    let kept_for_another = !uses_claude_cli(engine_id)
        && key
            .strip_prefix(context::STASH_KEY)
            .is_some_and(|id| seen.stashed.iter().any(|kept| kept.id == id));
    declared_elsewhere || kept_for_another
}

/// The switch itself. `Some` is the receipt id of what was changed; `None`
/// means the server was already as asked, and nothing was written or run.
async fn switch(
    places: &SwitchPlaces,
    cli: &ClaudeCli,
    engine_id: &str,
    key: &str,
    enabled: bool,
    seams: Seams<'_>,
) -> Result<Option<String>, SwitchFailure> {
    // The trust boundary: the key has to be one this engine's context holds.
    let seen = look(places);
    let context = context_of(&seen, engine_id, |_| None);
    let items: Vec<&ContextItem> = context.items.iter().filter(|item| item.key == key).collect();
    if items.is_empty() {
        return Err(if is_another_engines(&seen, engine_id, key) {
            SwitchFailure::WrongEngine
        } else {
            SwitchFailure::NotFound
        });
    }
    if items.iter().any(|item| item.read_only.is_some()) {
        return Err(SwitchFailure::ReadOnly);
    }

    if let Some(stash_id) = key.strip_prefix(context::STASH_KEY) {
        // A kept server is off, and declared in no file: there is nothing to
        // remove, and its kept copy is the only one there is.
        if !enabled {
            return Err(SwitchFailure::ReadOnly);
        }
        let program = cli.program.as_deref().ok_or(SwitchFailure::CliNotFound)?;
        let config = engine_base(&places.home, CLAUDE_CONFIG);
        let kept = vendor::claude_on(&config, stash_id, &places.stash, program, &cli.path_env).await?;
        return Ok(Some(format!("{RESTORED}{}", kept.name)));
    }

    // The registration behind the item. Its path is discovery's own.
    let reg = declared(&seen, engine_id).find(|reg| key_of(reg) == key).ok_or(SwitchFailure::NotFound)?;
    let kind = kind_of(reg).ok_or(SwitchFailure::ReadOnly)?;
    let name = reg.server.name.as_str();
    // For the receipt: ids, never anything from the file.
    let what = format!("{engine_id} · {name} · {}", if enabled { "on" } else { "off" });

    match kind {
        SwitchKind::EnabledKey | SwitchKind::DisabledKey => {
            let dialect = context::dialect_of(reg.host_id, reg.tier).ok_or(SwitchFailure::ReadOnly)?;
            let (format, _) = layout(dialect).ok_or(SwitchFailure::ReadOnly)?;
            let path = Path::new(&reg.config_path);
            let body = fs::read_to_string(path).map_err(|_| SwitchFailure::Unparseable)?;
            let next = edit::set_enabled(&body, dialect, kind, name, enabled)?;
            if next == body {
                return Ok(None);
            }
            if !only_the_flag_differs(&body, &next, dialect, name) {
                return Err(SwitchFailure::WriteFailed);
            }
            (seams.before_write)();
            let receipt = apply::safe_replace(path, Some(&body), &next, format, &places.backups, &what)?;
            Ok(Some(format!("{FILE}{}", receipt.id)))
        }
        SwitchKind::GeminiEnablementFile => {
            let path = gemini_state_file(&places.home);
            let body = match StateFile::read(&path) {
                StateFile::Absent => None,
                StateFile::Text(text) => Some(text),
                StateFile::Unreadable => return Err(SwitchFailure::Unparseable),
            };
            let next = edit::gemini_set_enabled(body.as_deref(), name, enabled)?;
            // With no file every server is on, so an on has nothing to
            // write: the `{}` the editor hands back is not put on disk.
            let unchanged = match &body {
                Some(text) => *text == next,
                None => enabled,
            };
            if unchanged {
                return Ok(None);
            }
            (seams.before_write)();
            let receipt =
                apply::safe_replace(&path, body.as_deref(), &next, Format::StrictJson, &places.backups, &what)?;
            Ok(Some(format!("{FILE}{}", receipt.id)))
        }
        SwitchKind::ClaudeCli => {
            // Claude Code is switched off by removal, so a server it still
            // declares is on.
            if enabled {
                return Ok(None);
            }
            let program = cli.program.as_deref().ok_or(SwitchFailure::CliNotFound)?;
            let config = Path::new(&reg.config_path);
            let kept = vendor::claude_off(config, name, &places.stash, program, &cli.path_env).await?;
            Ok(Some(format!("{KEPT}{}", kept.id)))
        }
    }
}

/// Undo one `apply` receipt, if the file it names is one this engine's
/// switch writes.
fn undo_file(places: &SwitchPlaces, engine_id: &str, id: &str) -> Result<String, SwitchFailure> {
    let receipt = apply::latest_receipts(&places.backups)
        .into_iter()
        .find(|receipt| receipt.id == id)
        .ok_or(SwitchFailure::NotUndoable)?;
    let seen = look(places);
    if !written_for(places, &seen, engine_id).contains(&PathBuf::from(&receipt.path)) {
        return Err(SwitchFailure::NotUndoable);
    }
    let undone = apply::undo(id, &places.backups)?;
    Ok(format!("{FILE}{}", undone.id))
}

/// The files a switch of this engine's writes, with links resolved as a
/// receipt records them: each config file it declares a flag-switched server
/// in, and Gemini CLI's state file for the engine switched through it.
/// `.claude.json` is never one of them.
fn written_for(places: &SwitchPlaces, seen: &Seen, engine_id: &str) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = declared(seen, engine_id)
        .filter(|reg| matches!(kind_of(reg), Some(SwitchKind::EnabledKey | SwitchKind::DisabledKey)))
        .map(|reg| real_path(Path::new(&reg.config_path)))
        .collect();
    if context::is_switched_by(engine_id, SwitchKind::GeminiEnablementFile) {
        files.push(real_path(&gemini_state_file(&places.home)));
    }
    files
}

/// A path with its links resolved. A file that is not there (a state file an
/// Undo removed) is resolved through its folder, as `apply` resolves a file
/// it is about to create.
fn real_path(path: &Path) -> PathBuf {
    if let Ok(real) = fs::canonicalize(path) {
        return real;
    }
    match (path.parent().and_then(|folder| fs::canonicalize(folder).ok()), path.file_name()) {
        (Some(folder), Some(name)) => folder.join(name),
        _ => path.to_path_buf(),
    }
}
