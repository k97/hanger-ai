# Shared checkout

More than one Claude Code session can be working in this directory at the same
time, and they commit to the same branch. `ListAgents` shows the others.

- **A gate result is valid only for the tree at the moment it ran.** If files
  changed underneath you — including a file another session is mid-edit —
  rerun or say the result is stale. Reporting a green from a tree that has
  since moved is fabricated evidence under `verification.md`. A red gate in a file
  you did not touch: check its mtime and `git status` before blaming your
  change; a peer's half-edit is the usual cause and clears on rerun.
- **Check before you assume authorship.** `git log` and `git status` show
  commits and modifications that are not yours. Do not revert, stash, or
  "clean up" changes you did not make; confirm whose they are first.
- **Stage by hunk in shared files.** `git commit -- <file>` scopes by file,
  not hunk — it once swept a peer's `DESIGN.md` edits into another session's
  commit. For a file both of you have touched (`src/App.tsx` is the usual
  one): `git diff <file> > p.patch`, drop the hunks that are not yours, then
  `git apply --cached --recount p.patch` (full context, never
  `--unidiff-zero`), and grep the cached diff for the peer's markers before
  committing.
- Say so before touching a file a peer is mid-edit on (`SendMessage`).
