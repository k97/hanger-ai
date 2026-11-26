//! Switch a skill in the global store off, and back on exactly where it was.
//!
//! Plan: `docs/plans/2026-11-26-skill-switch.md`. Spec:
//! `docs/plans/2026-11-26-decisions-round-10.md`, whose governing rule is
//! Karthik's note on its first question: "when I turn on, it should be back
//! where it was before".
//!
//! # What moves, and where
//!
//! Only a skill whose folder is a direct child of the global store,
//! `~/.agents/skills`. Off moves that folder (or that link, when the store
//! entry is itself a link) into Hanger's keep, `<app data dir>/kept/skills/`,
//! with one rename on one volume, and removes the one-by-one links to it. On
//! renames it back to the same path and recreates each link from the text it
//! had. The folder keeps its inode, because it is renamed and never copied.
//!
//! # The rules, copied from `mcp::switch`
//!
//! - Keep before you remove: a receipt is written and synced before anything
//!   moves.
//! - Nothing is overwritten. A folder moves by `tree::rename_no_replace`, and
//!   a link is made by `symlink(2)`, which fails on an existing path.
//! - A link whose text changed between finding it and removing it is not
//!   removed. A different volume is refused, never copied.
//! - Folders are 0700 and receipts 0600. A keep path that is not absolute is
//!   refused before anything is written.
//!
//! The pieces:
//!
//! - `tree`: the folder's fingerprint, and the rename that never replaces.
//! - `links`: where one-by-one links to a skill are kept, and which they are.

pub mod links;
pub mod tree;
