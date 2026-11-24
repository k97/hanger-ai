//! Finding and running an engine's own command-line program.
//!
//! An engine's CLI is the program its vendor ships for a terminal: `claude`
//! for Claude Code, `codex` for Codex, `gemini` for Gemini CLI. Two things
//! are here, and no more:
//!
//! - `resolve` answers "which file would the user's terminal run for this
//!   name?" (`resolve::search_path`, `resolve::resolve_in`).
//! - `run` runs that file once and hands back what it printed
//!   (`run::run_capture`).
//!
//! Nothing calls this module yet. It is written for two plans to share:
//! Task 5 of `docs/plans/2026-11-24-context-control.md`, whose Task 6 is meant
//! to switch a Claude Code server through `claude mcp`, and
//! `docs/plans/2026-11-24-tool-manager-phase-a.md`, of which this is the
//! resolver from Task 2 and the runner from Task 3. The engine table, install
//! methods, update commands and version parsing belong to that second plan
//! and are not built.

pub mod resolve;
pub mod run;
