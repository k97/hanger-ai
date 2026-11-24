//! Switching an MCP server off and on for one engine, in the file where it
//! is declared.
//!
//! `discover` reads engine configuration and never writes it. This module is
//! where the writing lives, kept apart so that everything able to change a
//! user's config file sits in one place. Five parts are in it. The first four
//! are called only by the fifth, `ops`, and `ops` only by four commands in
//! `lib.rs`. No screen calls those commands yet:
//!
//! - `edit`: pure functions that take a config file's text and return it
//!   with one server's flag set, plus the same pair for Gemini CLI's state
//!   file. It reads and writes no file.
//! - `apply`: the one place that puts text on disk. `safe_replace` refuses a
//!   file that changed since it was read, keeps a copy of what it replaces
//!   with a receipt beside it, writes through a temp file and a rename, and
//!   reads the result back; `undo` puts a receipt's copy back. It writes to
//!   the path it is given and to the backups folder it is given, and nothing
//!   here chooses either: no code in this module names a real config file.
//! - `vendor`: Claude Code, which has no flag to set. Off keeps the server's
//!   entry in a private file in the stash folder it is given and then runs
//!   `claude mcp remove`; on hands the kept entry back to `claude mcp
//!   add-json` on stdin. Before an off keeps or removes anything, it has
//!   `add-json` write the entry into a scratch config folder, and goes on
//!   only if the entry comes back unchanged: Claude Code drops keys it does
//!   not know. It reads `.claude.json`, at the path it is given, to
//!   find the entry and to see what the command did. It never writes that
//!   file, and does not go through `apply`: the only files it writes are its
//!   own, in the stash.
//! - `context`: what a switch is shown beside. A fold over what `discover`
//!   found for one engine: each server it declares, whether it is switched
//!   on, why Hanger offers no switch where it offers none, and what the
//!   switched-on servers cost by the probe cache's estimate, with how many of
//!   them that estimate covers. It opens no file itself: the registrations,
//!   the servers `vendor` is keeping, Gemini CLI's state file, a file reader
//!   and a probe-cache lookup are handed to it.
//! - `ops`: what the webview may ask for, and the only part that knows where
//!   anything is. It is handed the home, the system root, the backups folder
//!   and the stash; runs `discover`'s machine pass; and accepts a switch only
//!   for a server that pass has just found for the engine named, or one
//!   `vendor` is keeping. So the file `apply` writes is always one discovery
//!   produced, or Gemini CLI's state file, and never a path the webview
//!   sent. It also turns every error of the other four into a code with no
//!   payload. A project's own config file is not in the machine pass, so
//!   `ops` does not switch a project-scope server yet.
//!
//! The table that says which engines may be switched and how is
//! `registry::SWITCHES`, with the evidence for each row in
//! `docs/plans/2026-11-24-context-control-engine-matrix.md`. The plan this
//! module is built to is `docs/plans/2026-11-24-context-control.md`.
//!
//! A switch is meant to change one line and leave every other byte of the
//! file as its author wrote it, so Hanger does not re-serialise a config
//! file. Two crates were added for that, both read on docs.rs on 2026-11-24;
//! `edit` is their only caller, and its module doc records the limits
//! measured in each:
//!
//! - `jsonc-parser` 0.34.0, feature `cst`. Its `cst` module is a tree that
//!   "keeps every comment and every piece of whitespace, so a document can be
//!   edited and written back out with everything the author wrote still in
//!   place"; `CstRootNode::parse` is the entry point.
//!   <https://docs.rs/jsonc-parser/0.34.0/jsonc_parser/cst/index.html>, and
//!   the feature list at <https://docs.rs/crate/jsonc-parser/0.34.0/features>
//!   (`cst` is off by default).
//! - `toml_edit` 0.25 (0.25.20 in `Cargo.lock`). `DocumentMut` parses and
//!   modifies a document "while preserving comments, spaces and relative
//!   order of items". Its documented limits: it does not preserve the order
//!   of dotted keys, or the lack of a trailing newline.
//!   <https://docs.rs/toml_edit/0.25.20/toml_edit/>
//!
//! Portions of this module's behaviour derive from mcpick, Copyright (c) 2026
//! Scott Spence, MIT licence.

pub mod apply;
pub mod context;
pub mod edit;
pub mod ops;
pub mod vendor;
