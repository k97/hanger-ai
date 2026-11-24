//! Switch a Claude Code server off and on through Claude Code's own command,
//! with the server's entry kept by Hanger while it is off.
//!
//! Nothing calls this yet. Claude Code ignores an on/off flag written into
//! `.claude.json` and has no machine-wide one of its own (the engine matrix,
//! `docs/plans/2026-11-24-context-control-engine-matrix.md`, "Claude Code"),
//! so off is a removal and on is a restore (decision 10 in
//! `docs/plans/2026-11-24-context-control.md`):
//!
//! - off: `claude mcp remove <name> --scope user`, after a trial run of the
//!   on command has shown the entry would come back (the pre-flight, below)
//! - on: `claude mcp add-json <name> - --scope user`, the entry on stdin
//!
//! These are the commands mcpick runs (`src/utils/claude-cli.ts` →
//! `build_remove_args`, `mcp_add_json_via_cli`; Copyright (c) 2026 Scott
//! Spence, MIT licence), with one difference: mcpick passes the JSON as an
//! argument, where any user of the machine can read it in the process table.
//! An entry's `env` can hold a credential, so here it goes on stdin.
//!
//! **Hanger never writes `.claude.json`.** This module reads that file, to
//! find the entry and to see what a command did to it; only the `claude` CLI
//! changes it. User scope only: the root `mcpServers` map, never a project's.
//!
//! # The kept entry is the only copy
//!
//! While a server is off it is declared in no file of Claude Code's. What
//! Hanger kept is all there is of it, any credential in its `env` included.
//! A copy of the whole of `.claude.json` is not made instead, and is not made
//! as well: that file also holds session history, Claude Code rewrites it
//! while sessions run, and putting an old copy back would discard whatever
//! Claude Code wrote after the copy was taken.
//!
//! So the order is fixed, and a kept file is deleted only on proof:
//!
//! - off: nothing is removed that the pre-flight has not shown would come
//!   back. Then the entry is written to the stash and synced **before** the
//!   remove runs. If Hanger stops between the two, the server is in both
//!   places and never in neither.
//! - on: the kept file is deleted only after `.claude.json` has been read
//!   again and holds the same entry.
//!
//! # The pre-flight
//!
//! `add-json` does not write back everything it is handed. Measured with
//! claude 2.1.331 on 2026-11-24, in a throwaway `CLAUDE_CONFIG_DIR`: it
//! drops every key it does not know, `description` included, exits 0 and
//! reports the server added; and it refuses an entry that has a `url` and no
//! `type`, writing nothing. An entry with a `command` and no `type`, and an
//! `http` entry with `url` and `headers`, came back as they went in. So a
//! removal alone could take away a server that on would give back changed,
//! or not at all.
//!
//! Hanger does not keep a list of the keys Claude Code knows. Off asks
//! Claude Code instead, before anything is kept or removed: it makes a
//! scratch folder, `<stash>/claude-code/.preflight-<uuid>/` (0700), and runs
//! the on command with `CLAUDE_CONFIG_DIR` set to it, so the entry is written
//! to a `.claude.json` in that folder and not to the one Claude Code really
//! reads. The scratch folder is inside the stash and not in the system's
//! temp folder because what Claude Code writes there is the entry,
//! credentials included. It is removed when the pre-flight ends, whichever
//! way it ends.
//!
//! | After the trial, the scratch file's entry is | Result |
//! |---|---|
//! | there, equal to the entry Hanger read | the switch goes on to keep and remove |
//! | anything else, and the command ran to an end | `WouldNotComeBack` |
//! | anything else, and the command could not be started or was still running at the timeout | `CliFailed` |
//!
//! In the last two nothing is kept, the remove is not run, and the real
//! `.claude.json` is not touched. A command that gave no answer is
//! `CliFailed` and not `WouldNotComeBack` because it has shown nothing about
//! the entry: the fault to report is the command's. The pre-flight costs one
//! more run of the CLI for every switch-off, so an off can take two timeouts.
//!
//! # The file decides, never the command
//!
//! After each command the file it should have changed is read again, and
//! what that says is the result. The exit status and stdout are not looked
//! at, and a command that was still running at the timeout is treated like
//! any other where its file shows the work done: `gemini mcp disable` fails
//! and exits 0 (the engine matrix, "Gemini CLI"), and a command that is
//! killed late may already have done its work.
//!
//! | After off, the entry is | Result | Kept file |
//! |---|---|---|
//! | gone | the server is off | stays |
//! | as it was | `CliFailed` | deleted: the server is still declared |
//! | there, and different | `NotVerified` | stays |
//!
//! | After on, the entry is | Result | Kept file |
//! |---|---|---|
//! | there, equal to what was kept | the server is on | deleted |
//! | not there | `CliFailed` | stays |
//! | there, and different | `NotVerified` | stays |
//!
//! "Equal" is equality as parsed JSON. A file that cannot be read or parsed
//! at one of these points cannot say, so the result is `NotVerified` and the
//! kept file stays. On is not attempted at all while the name is declared
//! (`AlreadyThere`): the user added a server of that name themselves, and
//! theirs is not written over.
//!
//! # The stash
//!
//! `<stash>/claude-code/<uuid>.json`, in a folder made 0700 if it is missing,
//! each file 0600 and never written over:
//!
//! ```json
//! { "id": "<uuid>", "name": "<name>", "scope": "user", "at_ms": 0, "entry": { } }
//! ```
//!
//! `entry` is the entry's own text from `.claude.json`, so its keys are in
//! the order they were written in; only comments and trailing commas are
//! taken out (`dialect::strip_jsonc`), because Claude Code is handed JSON.
//! `stash` is a parameter, and a path that is not absolute is refused before
//! anything is written. A file is listed, and can be switched on, only when
//! it is named for the id inside it, so a scratch folder is never listed.
//!
//! No value from an entry leaves this module except onto the child's stdin
//! and into a stash file; Claude Code itself writes one more copy, into the
//! scratch folder, for as long as a pre-flight runs. `Entry` and `Kept` hold
//! one, and neither can be
//! serialised or printed. `StashedServer` is what Hanger says about a kept
//! server; its transport and env key names come from `dialect::parse`, the
//! code that drops env values everywhere else. No error here carries text
//! from a file or from the command.
//!
//! # Which file the command changes
//!
//! `config` is the file the caller read the server from, and the command is
//! not told which file to change: it decides for itself. Today `discover`
//! finds the file through `agents::engine_base(home, ".claude.json")`, which
//! is `$CLAUDE_CONFIG_DIR/.claude.json` when that variable is set and not
//! empty in Hanger's own environment, and `home.join(".claude.json")`
//! otherwise, where `home` is `scanner::get_home_dir()` (`HANGER_TEST_HOME`,
//! then `HOME`). The child gets Hanger's environment with `PATH` replaced, so
//! it sees the same `CLAUDE_CONFIG_DIR` and the same `HOME`. With the
//! variable set, Claude Code was measured to read `.claude.json` from that
//! folder and to stop reading the one under home (2026-08-28, recorded at
//! `agents::CONFIG_DIR_ENVS`), which is the file `engine_base` names.
//!
//! They can still name different files: where `CLAUDE_CONFIG_DIR` is set and
//! empty (Hanger reads that as unset; what Claude Code does is not measured),
//! where `HANGER_TEST_HOME` is set (Hanger's home is then not the child's),
//! or where the `claude` on the search path is a wrapper that sets a config
//! folder of its own. Then the command changes a file Hanger is not reading,
//! the file Hanger read is as it was, and the answer is `CliFailed`: off
//! deletes its kept file, on keeps it. What is not seen is the other file. An
//! off may have removed a server of that name from it, which Hanger kept no
//! copy of; an on has added the server to it.
//!
//! A wrapper of that kind also defeats the pre-flight's `CLAUDE_CONFIG_DIR`.
//! The trial `add-json` is then aimed at whatever file the wrapper names,
//! the scratch folder stays empty, and the answer is `WouldNotComeBack` with
//! nothing kept or removed. What `add-json` does to a name that file already
//! declares has not been measured.
//!
//! A variable exported only in a shell startup file reaches neither Hanger
//! nor the child when the app is opened from Finder (`docs/roadmap.md`,
//! "Config-directory env vars"). Both then use the un-relocated file, and
//! agree with each other.
//!
//! # Known limits
//!
//! - Nothing serialises two switches of one server, and there is no lock
//!   against Claude Code changing the file between a read and a command.
//! - The stash folder is not synced after a kept file is made, so a power
//!   cut during an off can lose the file's name while the remove survives.
//! - The pre-flight shows what `add-json` writes into an empty folder at the
//!   moment of the off. On runs later, against the real file, perhaps with a
//!   newer CLI. If the entry then comes back different, on answers
//!   `NotVerified` with the server in fact declared, and its kept file stays
//!   listed; a later on of it is `AlreadyThere`.
//! - "Equal" tells `30.0` from `30`. An entry Claude Code writes back with a
//!   number spelled another way is refused as `WouldNotComeBack`.
//! - A scratch folder is removed when its pre-flight ends. If Hanger is
//!   killed before that, or the stash folder stops accepting changes
//!   meanwhile, a `.preflight-<uuid>` folder stays in the stash, holding
//!   whatever Claude Code had written into it by then: the entry, with any
//!   credential in it, if the command got that far. Nothing here looks for
//!   old ones or removes them.
//! - A kept file whose deletion fails after a successful on is reported as
//!   `StashFailed`, and likewise stays listed.
//! - The command's exit status is not used for anything, including to say
//!   why a switch did not happen.

use std::fs::{self, DirBuilder, OpenOptions};
use std::io::{self, Write};
use std::os::unix::fs::{DirBuilderExt, OpenOptionsExt};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use jsonc_parser::cst::{CstObject, CstObjectProp, CstRootNode};
use jsonc_parser::ParseOptions;
use serde::Serialize;

use crate::engine_status::run::run_capture;
use crate::mcp::dialect::{self, strip_jsonc};
use crate::mcp::registry::{Dialect, ScopeTier};

/// Why a switch did not happen, or could not be confirmed.
///
/// No variant carries text from a file or from the command.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SwitchError {
    /// Off: the file could not be read, or declares no user-scope server of
    /// that name as an object. On: no kept server has that id.
    NotFound,
    /// The name is empty, starts with `-`, or holds a control character. It
    /// would be an argument to the command, so the command is not run.
    NameRefused,
    /// The command did not make the change: the file is as it was. Or, in
    /// off's pre-flight, it could not be started or never came to an end.
    CliFailed,
    /// The file does not confirm the change: it cannot be read, or the entry
    /// in it is not the one Hanger kept. The kept file stays.
    NotVerified,
    /// The kept file could not be written or could not be deleted, or the
    /// pre-flight's scratch folder could not be made. The string is one of
    /// this module's own sentences, followed at most by the name of an
    /// `io::ErrorKind`.
    StashFailed(String),
    /// On: a server of that name is declared again. Nothing was run.
    AlreadyThere,
    /// Off: handed this entry, Claude Code's own command does not write the
    /// same entry back, so a removal could not be taken back. Nothing was
    /// kept and nothing was removed.
    WouldNotComeBack,
}

/// What Hanger says about a kept server. It has no field that can hold a
/// value from the entry: no command, no arguments, no env values, no headers,
/// and no address beyond the sanitised `transport`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct StashedServer {
    /// A uuid. The kept file is `<stash>/claude-code/<id>.json`.
    pub id: String,
    pub name: String,
    /// `"user"`, the only scope switched.
    pub scope: String,
    /// As `dialect::McpServer::transport`: `"stdio"`, `"unknown"`, or an
    /// address with its userinfo and query string cut.
    pub transport: String,
    /// Environment variable names. Never their values.
    pub env_keys: Vec<String>,
    /// When the server was switched off.
    pub at_ms: i64,
}

/// How long either command is waited for (the plan's global constraints).
const CLI_TIMEOUT: Duration = Duration::from_secs(10);
/// The stash's subfolder for this engine: its `registry::HOSTS` id.
const HOST_FOLDER: &str = "claude-code";
/// How a pre-flight's scratch folder is named, before its uuid.
const SCRATCH_PREFIX: &str = ".preflight-";
const SCOPE: &str = "user";
const PRIVATE_FILE: u32 = 0o600;
const PRIVATE_FOLDER: u32 = 0o700;

const STASH_NOT_ABSOLUTE: &str = "the stash folder's path is not absolute";
const STASH_NOT_UTF8: &str = "the stash folder's path is not valid UTF-8";
const NO_STASH_FOLDER: &str = "the stash folder could not be made";
const NO_SCRATCH_FOLDER: &str = "the scratch folder for the trial run could not be made";
const NOT_KEPT: &str = "the server's entry could not be kept, so it was not removed";
const NOT_DELETED: &str = "the server is declared again, and its kept copy could not be deleted";

/// What `dialect::strip_jsonc` lets through to serde_json, and no more:
/// comments and trailing commas. The same options as `edit`'s, so this reads
/// the files `dialect` reads.
const JSONC: ParseOptions = ParseOptions {
    allow_comments: true,
    allow_loose_object_property_names: false,
    allow_trailing_commas: true,
    allow_missing_commas: false,
    allow_single_quoted_strings: false,
    allow_hexadecimal_numbers: false,
    allow_unary_plus_numbers: false,
    allow_bare_decimal_point_numbers: false,
    allow_non_finite_numbers: false,
    allow_extended_string_escapes: false,
};

/// Off: check the entry would come back, keep it, then remove it with Claude
/// Code's own command.
///
/// `config` is the `.claude.json` the server was read from; it is only read.
/// `stash` is the folder for kept servers, under the app's data directory.
/// `cli` is the absolute path of `claude`, and `path_env` is the `PATH` it is
/// given: `claude` may be a `#!/usr/bin/env node` script.
pub async fn claude_off(
    config: &Path,
    name: &str,
    stash: &Path,
    cli: &Path,
    path_env: &str,
) -> Result<StashedServer, SwitchError> {
    claude_off_within(config, name, stash, cli, path_env, CLI_TIMEOUT).await
}

/// `claude_off`, with the time the command is waited for supplied.
#[doc(hidden)]
pub async fn claude_off_within(
    config: &Path,
    name: &str,
    stash: &Path,
    cli: &Path,
    path_env: &str,
    timeout: Duration,
) -> Result<StashedServer, SwitchError> {
    if is_refused(name) {
        return Err(SwitchError::NameRefused);
    }
    let entry = match read_entry(config, name) {
        Read::Found(entry) if entry.value.is_object() => entry,
        _ => return Err(SwitchError::NotFound),
    };
    let folder = stash_folder(stash)?;
    // Before anything is kept or removed: what cannot be given back is left
    // where it is.
    comes_back(&folder, name, &entry, cli, path_env, timeout).await?;
    let kept = Kept {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        at_ms: now_ms(),
        entry,
    };
    // Before the command: from here on the entry is in the stash, whatever
    // happens to the one in the file.
    let kept_file = keep(&folder, &kept)?;

    let args = ["mcp", "remove", name, "--scope", SCOPE];
    // What the command reports is not used. The file is read instead.
    let _ = run_capture(cli, &args, None, &[("PATH", path_env)], timeout).await;

    match read_entry(config, name) {
        Read::Absent => Ok(kept.listed()),
        Read::Found(now) if now.value == kept.entry.value => {
            // Still declared, so a kept copy would list it as switched off.
            let _ = fs::remove_file(&kept_file);
            Err(SwitchError::CliFailed)
        }
        Read::Found(_) | Read::Unreadable => Err(SwitchError::NotVerified),
    }
}

/// On: give the kept entry back through Claude Code's own command.
///
/// `stash_id` is a `StashedServer::id`. The other parameters are
/// `claude_off`'s.
pub async fn claude_on(
    config: &Path,
    stash_id: &str,
    stash: &Path,
    cli: &Path,
    path_env: &str,
) -> Result<StashedServer, SwitchError> {
    claude_on_within(config, stash_id, stash, cli, path_env, CLI_TIMEOUT).await
}

/// `claude_on`, with the time the command is waited for supplied.
#[doc(hidden)]
pub async fn claude_on_within(
    config: &Path,
    stash_id: &str,
    stash: &Path,
    cli: &Path,
    path_env: &str,
    timeout: Duration,
) -> Result<StashedServer, SwitchError> {
    let folder = stash.join(HOST_FOLDER);
    let kept = load(&folder, stash_id).ok_or(SwitchError::NotFound)?;
    if is_refused(&kept.name) {
        return Err(SwitchError::NameRefused);
    }
    match read_entry(config, &kept.name) {
        Read::Absent => {}
        Read::Found(_) => return Err(SwitchError::AlreadyThere),
        Read::Unreadable => return Err(SwitchError::NotVerified),
    }

    let args = add_json(&kept.name);
    let entry = kept.entry.text.as_bytes();
    let _ = run_capture(cli, &args, Some(entry), &[("PATH", path_env)], timeout).await;

    match read_entry(config, &kept.name) {
        Read::Found(now) if now.value == kept.entry.value => {
            // Only now: the file holds the entry again.
            fs::remove_file(folder.join(file_name(&kept.id)))
                .map_err(|error| SwitchError::StashFailed(note(NOT_DELETED, &error)))?;
            Ok(kept.listed())
        }
        Read::Absent => Err(SwitchError::CliFailed),
        Read::Found(_) | Read::Unreadable => Err(SwitchError::NotVerified),
    }
}

/// Every kept server, newest first.
///
/// A stash folder that is not there has none. A file that cannot be read,
/// does not parse, or is not named for the id inside it is skipped.
pub fn claude_stashed(stash: &Path) -> Vec<StashedServer> {
    let folder = stash.join(HOST_FOLDER);
    let Ok(entries) = fs::read_dir(&folder) else { return Vec::new() };
    let mut found: Vec<StashedServer> = entries
        .flatten()
        .filter_map(|file| {
            let name = file.file_name();
            let id = name.to_str()?.strip_suffix(".json")?;
            Some(load(&folder, id)?.listed())
        })
        .collect();
    // Two servers kept in one millisecond tie; the id settles it the same
    // way every time.
    found.sort_by(|a, b| b.at_ms.cmp(&a.at_ms).then_with(|| b.id.cmp(&a.id)));
    found
}

/// One server's entry: its text, and that text parsed.
///
/// Deliberately without `Debug`, `Display` or `Serialize`. Its `env` can hold
/// a credential.
struct Entry {
    /// Plain JSON, with the keys in the order the file had them.
    text: String,
    value: serde_json::Value,
}

/// A server Hanger holds while it is off. Not printable, for `Entry`'s reason.
struct Kept {
    id: String,
    name: String,
    at_ms: i64,
    entry: Entry,
}

impl Kept {
    /// The stash file. Put together as text because `entry` goes in as it
    /// was written: serde_json's map would sort its keys.
    fn file_text(&self) -> String {
        let quoted = |text: &str| serde_json::Value::from(text).to_string();
        format!(
            "{{\n  \"id\": {},\n  \"name\": {},\n  \"scope\": {},\n  \"at_ms\": {},\n  \"entry\": {}\n}}\n",
            quoted(&self.id),
            quoted(&self.name),
            quoted(SCOPE),
            self.at_ms,
            self.entry.text,
        )
    }

    /// A stash file's text as a kept server, or `None` if it is not one.
    fn parse(text: &str) -> Option<Kept> {
        let file: serde_json::Value = serde_json::from_str(text).ok()?;
        if file.get("scope")?.as_str()? != SCOPE {
            return None;
        }
        let value = file.get("entry").filter(|entry| entry.is_object())?.clone();
        // The entry a second time, for its text: the value above has lost
        // the order of its keys.
        let root = CstRootNode::parse(text, &JSONC).ok()?;
        let written = last_prop(&root.object_value()?, "entry")?.value()?.to_string();
        Some(Kept {
            id: file.get("id")?.as_str()?.to_string(),
            name: file.get("name")?.as_str()?.to_string(),
            at_ms: file.get("at_ms")?.as_i64()?,
            entry: Entry { text: written, value },
        })
    }

    /// What may be said about this server. The entry goes through
    /// `dialect::parse` as a one-server file, so its env values are dropped
    /// by the code that drops them for every other server Hanger shows.
    fn listed(&self) -> StashedServer {
        let mut servers = serde_json::Map::new();
        servers.insert(self.name.clone(), self.entry.value.clone());
        let file = serde_json::json!({ "mcpServers": servers }).to_string();
        let (transport, env_keys) = dialect::parse(&file, Dialect::McpServers, ScopeTier::User)
            .ok()
            .and_then(|mut read| read.pop())
            .map(|server| (server.transport, server.env_keys))
            .unwrap_or_default();
        StashedServer {
            id: self.id.clone(),
            name: self.name.clone(),
            scope: SCOPE.to_string(),
            transport,
            env_keys,
            at_ms: self.at_ms,
        }
    }
}

/// What `.claude.json` says about one user-scope server.
enum Read {
    Found(Entry),
    /// The file was read, and declares no such server at user scope.
    Absent,
    /// The file could not be read, or is not a JSON object.
    Unreadable,
}

/// The entry under the root `mcpServers`, never one under `projects`.
fn read_entry(config: &Path, name: &str) -> Read {
    let Ok(body) = fs::read_to_string(config) else { return Read::Unreadable };
    let Ok(root) = CstRootNode::parse(&body, &JSONC) else { return Read::Unreadable };
    let Some(file) = root.object_value() else { return Read::Unreadable };
    let Some(node) = last_prop(&file, "mcpServers")
        .and_then(|servers| servers.object_value())
        .and_then(|servers| last_prop(&servers, name))
        .and_then(|entry| entry.value())
    else {
        return Read::Absent;
    };
    // The node's own text, so the keys stay in the order they were written.
    let text = strip_jsonc(&node.to_string());
    match serde_json::from_str(&text) {
        Ok(value) => Read::Found(Entry { text, value }),
        Err(_) => Read::Unreadable,
    }
}

/// The last property of that name: a key written twice is read as its last
/// value by serde_json, which is how `dialect` reads this file.
fn last_prop(object: &CstObject, name: &str) -> Option<CstObjectProp> {
    object
        .properties()
        .into_iter()
        .filter(|prop| prop.decoded_name().as_deref() == Some(name))
        .last()
}

/// A name that must not become an argument. One that starts with `-` would
/// be read as an option.
fn is_refused(name: &str) -> bool {
    name.is_empty() || name.starts_with('-') || name.chars().any(char::is_control)
}

fn file_name(id: &str) -> String {
    format!("{id}.json")
}

/// The arguments of the on command. `-` has it read the entry from stdin:
/// the entry is never an argument.
fn add_json(name: &str) -> [&str; 6] {
    ["mcp", "add-json", name, "-", "--scope", SCOPE]
}

/// The stash's folder for this engine, made private if it is missing.
fn stash_folder(stash: &Path) -> Result<PathBuf, SwitchError> {
    if !stash.is_absolute() {
        return Err(SwitchError::StashFailed(STASH_NOT_ABSOLUTE.to_string()));
    }
    let folder = stash.join(HOST_FOLDER);
    DirBuilder::new()
        .recursive(true)
        .mode(PRIVATE_FOLDER)
        .create(&folder)
        .map_err(|error| SwitchError::StashFailed(note(NO_STASH_FOLDER, &error)))?;
    Ok(folder)
}

/// A pre-flight's scratch folder. Removed, with what Claude Code wrote into
/// it, when this is dropped: on a pass, on a refusal, on an error, and when
/// the switch is abandoned part-way.
struct Scratch(PathBuf);

impl Drop for Scratch {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// The pre-flight: `Ok` only if Claude Code's own on command, handed this
/// entry, writes the same entry back.
///
/// The command is run with `CLAUDE_CONFIG_DIR` naming a scratch folder in
/// `folder`, so it never changes the `.claude.json` the server is declared
/// in. See "The pre-flight" in the module doc.
async fn comes_back(
    folder: &Path,
    name: &str,
    entry: &Entry,
    cli: &Path,
    path_env: &str,
    timeout: Duration,
) -> Result<(), SwitchError> {
    let path = folder.join(format!("{SCRATCH_PREFIX}{}", uuid::Uuid::new_v4()));
    DirBuilder::new()
        .mode(PRIVATE_FOLDER)
        .create(&path)
        .map_err(|error| SwitchError::StashFailed(note(NO_SCRATCH_FOLDER, &error)))?;
    let scratch = Scratch(path);
    let Some(config_dir) = scratch.0.to_str() else {
        return Err(SwitchError::StashFailed(STASH_NOT_UTF8.to_string()));
    };

    let envs = [("PATH", path_env), ("CLAUDE_CONFIG_DIR", config_dir)];
    let ran = run_capture(cli, &add_json(name), Some(entry.text.as_bytes()), &envs, timeout).await;

    match read_entry(&scratch.0.join(".claude.json"), name) {
        Read::Found(back) if back.value == entry.value => Ok(()),
        // No answer from the command says nothing about the entry.
        _ if ran.is_none() => Err(SwitchError::CliFailed),
        _ => Err(SwitchError::WouldNotComeBack),
    }
}

/// Write a kept server to the stash folder and sync it. Returns the file.
fn keep(folder: &Path, kept: &Kept) -> Result<PathBuf, SwitchError> {
    let path = folder.join(file_name(&kept.id));
    // `create_new`: a file of that name is another kept server, and is never
    // written over.
    let mut file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(PRIVATE_FILE)
        .open(&path)
        .map_err(|error| SwitchError::StashFailed(note(NOT_KEPT, &error)))?;
    let written = file.write_all(kept.file_text().as_bytes()).and_then(|()| file.sync_all());
    if let Err(error) = written {
        drop(file);
        let _ = fs::remove_file(&path);
        return Err(SwitchError::StashFailed(note(NOT_KEPT, &error)));
    }
    Ok(path)
}

/// The kept server with that id. The id has to be a uuid in the one spelling
/// Hanger writes, so it cannot name a file outside the folder, and the file
/// has to hold that id.
fn load(folder: &Path, id: &str) -> Option<Kept> {
    if uuid::Uuid::parse_str(id).ok()?.to_string() != id {
        return None;
    }
    let text = fs::read_to_string(folder.join(file_name(id))).ok()?;
    Kept::parse(&text).filter(|kept| kept.id == id)
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as i64)
        .unwrap_or_default()
}

/// One of this module's sentences and the kind of I/O error behind it. The
/// kind is a name such as `PermissionDenied`: no path, and nothing from a file.
fn note(sentence: &str, error: &io::Error) -> String {
    format!("{sentence} ({:?})", error.kind())
}
