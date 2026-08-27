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

  Read that paragraph twice before you commit. On 2026-08-27 a session that
  had quoted this very rule to two peers an hour earlier then ran
  `git commit -m "…" -- <paths>` on its own carefully split index, swept a
  peer's entire uncommitted inspector-resize change into its commit, and
  broke the branch tip. Knowing the rule is not the same as following it at
  the moment you type the command.

- **`--recount` is only for a hunk whose body you edited.** The recipe above
  passes it unconditionally and that is wrong: on whole hunks kept intact,
  whose counts are already correct, `git apply --cached --recount` fails with
  "patch does not apply" while the same patch applies cleanly without it.
  Use `--recount` when you have deleted lines from inside a hunk, fix the
  `@@ -a,b +c,d @@` counts yourself and drop the flag when you have not, and
  never `--unidiff-zero` either way.

- **The `grep <their marker>` check is a denylist, and a denylist cannot see
  what you have not met.** It confirms the thing you were watching for and
  says nothing about the thing you were not. The 2026-08-27 split above was
  classified with a marker list written by hand — and the peer's work
  included an import the list had never heard of, so the hunk holding it was
  read as "mine" and kept whole. The grep came back empty and the commit was
  still wrong, in both directions: a marker list cannot see what a split
  dropped *or* what it kept.

  **Build the committed tree in isolation instead**, before you call it done:

  ```
  git worktree add --detach /tmp/verify-<sha> <sha>
  ln -s "$PWD/node_modules" /tmp/verify-<sha>/node_modules
  cd /tmp/verify-<sha> && npx vitest run
  ```

  Foreign content that references an untracked file fails to resolve there
  immediately — that is how the broken tip was caught, with fifteen test
  files unable to collect while the shared working tree stayed green,
  because the file exists here and not in the commit. Note the limit
  (hanger-ai-cf, same day): isolation catches an unresolvable import at once
  and semantic contamination only if a test covers it. It is strictly better
  than the grep and still not a guarantee.

  The same check catches the mirror-image mistake: committing a file that
  imports a new module of your own you forgot to `git add`.

- **`git diff` is "changes since the index", not "my changes" — and the index
  may not be yours.** A peer staged fifteen files mid-classification on
  2026-08-27. The hunk classifier then reported every hunk as mine and none
  as theirs, which looked exactly like a clean split and was an artefact:
  their work had already been subtracted from the comparison. Staging on that
  would have committed their entire change set under someone else's message.

  The property that makes this dangerous is that **it degrades toward false
  confidence as you make progress** — the more of anyone's work sits in the
  index, the cleaner the classifier looks. It is at its most reassuring when
  it is most wrong.

  Say `git diff HEAD -- <file>` when you mean everything uncommitted, and
  re-read `git diff --cached --name-only` *immediately* before classifying,
  not once ten minutes earlier: an empty index is not a state that stays
  true here. Note that the verification grep is unaffected —
  `git diff --cached | grep <marker>` compares the index against HEAD and
  means what it says. It was only the classifier's *input* that lied.

  What caught it was not a check firing. It was three facts that could not
  all be true at once: a peer's test present in the working tree, absent at
  `HEAD`, and absent from `git diff`. Reconciling the contradiction is what
  found the staged index — so when two readings of the tree disagree, chase
  it rather than picking the one that lets you continue.
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
- **A computed range silently absorbs a peer's commits.** Misreading the log is
  one hazard; the other is never reading it. A review package built from
  `BASE..HEAD`, a `git diff` across a span, a changelog generated from
  `git log` — each takes whatever landed inside the range, and nothing in the
  output marks it foreign. On 2026-08-26 a peer nearly sent this session's
  Cargo.toml and docs commits to a reviewer as its own plan's work, and this
  session generated a 284-entry changelog from a 542-commit range with no way
  to tell which entries were its own. Bound the range to your own commits, or
  say in the report that it may not be only yours.

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
