# Documentation

Where things live under `docs/`, and which of it you can trust. Moved out of
`CLAUDE.md` on 2026-08-30 by the release hygiene gate, unchanged.

- **`docs/` is tracked except for four local-only subdirectories** named in
  `.gitignore`: `to-be-reviewed/`, `superpowers/`, `evidence/` and
  `references/`. A decision recorded only in one of those dies with the
  worktree and can be resolved by nobody — `verification.md` has the case
  where six code comments cited a ruling that existed nowhere in the tree.
- **`docs/to-be-reviewed/` is a holding pen, not a specification.** Several
  files there assert behaviour the code does not implement. Check the code
  first; the code is the fact and the disagreement is the report.
- **The load-bearing documents.** `docs/harness.md` is the conceptual model —
  read it before changing `agents.rs`, `annotations.rs`, or anything drawing
  the Reach column. `docs/findings.md` records defects deliberately left
  unfixed, with evidence. `docs/roadmap.md` holds deferred work and the open
  questions nobody has ruled on.
- **`docs/design-ref-prototypes/` holds design-reference HTML** — canvas
  artboards (`*.dc.html` and their `canvas.json`) and published canvas pages.
  A canvas drafted by the design skill lands at the repo root; move it here
  before it is committed.
- **Plans and specs go somewhere tracked.** `docs/plans/` is tracked;
  `docs/superpowers/plans/` and `docs/superpowers/specs/` are not, whatever a
  skill's default says.
