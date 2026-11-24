//! Switching an MCP server off and on for one engine, in the file where it
//! is declared.
//!
//! `discover` reads engine configuration and never writes it. This module is
//! where the writing will live, kept apart so that everything able to change
//! a user's config file sits in one place. Nothing is in it yet. What exists
//! today is the table that says which engines may be switched and how:
//! `registry::SWITCHES`, with the evidence for each row in
//! `docs/plans/2026-11-24-context-control-engine-matrix.md`. The plan this
//! module is built to is `docs/plans/2026-11-24-context-control.md`.
//!
//! A switch is meant to change one line and leave every other byte of the
//! file as its author wrote it, so Hanger does not re-serialise a config
//! file. Two crates were added for that, both read on docs.rs on 2026-11-24
//! and neither called yet:
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
