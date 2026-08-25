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
  "clean up" changes you did not make; confirm whose they are first. **The
  log cannot tell you who wrote a commit**: every commit here authors as
  Karthik, so there is no session identity in it at all. Adjacency in the log
  is not evidence — a session inferred a neighbouring commit was a peer's,
  thanked the wrong party, and cancelled a planned task on that basis. If you
  need to know who wrote something, ask on `SendMessage`.
- **Stage by hunk in shared files, then commit with no paths at all.**
  `git commit -- <file>` scopes by file, not hunk, and commits the *working
  tree* version — it once swept a peer's `DESIGN.md` edits into another
  session's commit. For a file both of you have touched (`src/App.tsx` is the
  usual one):

  ```
  git diff <file> > p.patch
  # delete the hunks that are not yours
  git apply --cached --recount p.patch   # full context, never --unidiff-zero
  git diff --cached | grep <their marker>  # must return nothing
  git commit                              # no paths, no -a
  ```

  The last line is the part that is easy to get backwards. "Always commit
  with explicit paths" is right for a file only you have touched, and exactly
  wrong here: passing the path re-adds the whole working-tree file and throws
  away the hunks you just staged. Once you have staged deliberately, a bare
  `git commit` is what preserves that. `-a` is never right in this repo.
- Say so before touching a file a peer is mid-edit on (`SendMessage`).

- **Concurrent subagents share one git index, and that inverts the rule
  above.** Two agents working in the same worktree on *disjoint* files must
  commit with explicit paths — a bare `git commit` commits the whole index,
  including whatever the sibling had just `git add`ed. The no-paths rule is for
  a peer holding hunks in the *same file*; it is the wrong instruction for
  disjoint concurrent work. Say which hazard applies when dispatching, not just
  which command to run.
- **`git commit -- <path>` cannot commit an untracked file** (`pathspec … did
  not match any file(s) known to git`). New files need `git add` first; then
  check `git diff --cached --name-only` lists only yours before committing.
- Agents read unexpected commits as a peer's. If you commit while a subagent
  runs, expect its report to attribute your work to a stranger.

- **Never copy whole files out of a worktree.** A worktree pinned at an older
  commit holds pre-change versions of files you have since committed, so
  `cp <worktree>/<file> <file>` silently reverts committed work — it looks
  like a normal write and nothing goes red. This reverted a just-committed
  interface narrowing on 2026-08-25; it was caught only by reading
  `git diff` before staging. Apply the same targeted edit to both trees
  instead, or `git -C <worktree> diff -- <file> | git apply`. Either way,
  read the diff before you stage: the working tree is the only thing that
  tells you what you actually changed.
