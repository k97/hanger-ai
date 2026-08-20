# TODO

Work that is queued rather than open-ended. Each entry says what is wrong,
what blocks it, and what "done" looks like, so it can be picked up without
re-deriving anything.

This is not `docs/findings.md` (defects recorded with evidence and
deliberately left unfixed) and not `.claude/rules/known-debt.md` (standing
constraints an agent should know before touching an area). Things here are
meant to be finished and deleted.

---

## T1 — `docs/findings.md` cites `AGENTS.md`, which is now a stub

**Karthik's instruction, 2026-08-16: pick this up first thing once the
current sessions are finished.**

`AGENTS.md` was captured into `.claude/rules/` and archived on 2026-08-16
(commit `a8418c7`). Four citations in `docs/findings.md` still point at it:

- `:24` — "AGENTS.md already pinned the invocation" → the gates now live in
  `CLAUDE.md` → Verification.
- `:52` — F6, "AGENTS.md mandates" the DisclosureBanner rule →
  `.claude/rules/known-debt.md`.
- `:281` — "`AGENTS.md:88` currently *mandates* DisclosureBanner" → same
  file; the line number is dead and should become a section reference, not
  another line number.
- `:293` — "amend AGENTS.md and DESIGN.md" → names the file to amend in a
  proposed sequence of work.

**Blocked on:** `docs/findings.md` was modified by a concurrent session
throughout 2026-08-16 and was left alone deliberately. Editing it while that
session holds it risks sweeping their work (see
`.claude/rules/shared-checkout.md`). Confirm the file is nobody's before
touching it.

**Done when:** the four citations resolve to a file that exists, and
`git grep -n "AGENTS\.md" -- docs/findings.md` returns nothing.

**Not in scope:** every other `AGENTS.md` in the tree is the product concept
— the rules file Hanger scans for — not a citation of the governance
document. `docs/scanning.md`, `docs/ipc.md`, `SECURITY.md`, `scanner.rs`,
`agents.rs`, and the test fixtures are all correct as they stand. Do not
"fix" them.

---

## T2 — DESIGN.md's chrome citations need re-deriving

**Half resolved 2026-08-17.** Karthik ruled the orphaned hunks should land;
they did, as `40bc898`. `tauri.conf.json` now has `trafficLightPosition.y: 22`
and `App.tsx` the crumb's `pl-[51px]` plus `shrink-0` on the three `tbBtn*`
variants, so `DESIGN.md:606` and `:637` are true as written again.

**What is left:** those two paragraphs cite lines that have since moved.
`:637` cites `App.tsx:1064` for the crumb padding; line 1064 has not been the
crumb for some time. Re-derive both citations against the current file, and
check `:606`'s `tauri.conf.json:26` while you are there.

**Done when:** every `file:line` in `DESIGN.md:605-611` and `:633-645` points
at the code it claims to.


---

## T3 — Needs review still asserts a negative during the first scan

The empty-state work (`1d33d39`) gated the *list body* on `scannedAt`, and
stopped there. The two figures around it were missed and still make the same
claim the fix existed to remove:

- The summary reads **"0 things need a decision from you"** while the first
  scan is running (`NeedsReviewPane.tsx`, the `review-total` span and the
  sentence beside it).
- The foot reads **"0 issues across 0 locations"** at the same moment.

Figures rather than prose, so it reads as a measurement rather than a
sentence — which arguably makes it worse, not better. `hasScanned` already
exists in that file (`:78`) and reaches only the empty-list branch.

Left alone at the time because the approved scope was the list body and the
copy; extending to the summary would have been scope creep on a brief
Karthik had already ruled on.

**Done when:** neither figure asserts a total before `scannedAt` is set, and
a test pins it the way `needs_review_pane.test.tsx` pins the list body.

---

## T4 — "Showing 0 of 3"

When the backend count for a repository is already known but the inventory
has not arrived, the foot line pairs a real total with an empty table:
`RepoPane.tsx` (`Showing {visibleCount} of {assetCounts?.total ?? visibleCount}`)
and the equivalent in `ProfilePane.tsx`.

Not false — both halves are accurate — but it is a third state nobody
designed, and it reads as a bug to anyone who sees it. Decide what it should
say, rather than patching the arithmetic.

**Done when:** the foot line has a deliberate answer for "count known,
rows not yet loaded".

---

## T5 — `EmptyState` was never extracted

Four empty-plane blocks in `ProfilePane.tsx` and four in `RepoPane.tsx`, all
the same markup (`emptyPlaneClass` + icon + headline + subline, sometimes a
button). Held back deliberately during the copy work: a shared component
earns its place with a second real caller, and the copy was still moving at
the time. The copy has since settled, so the argument for holding is weaker
than it was.

Would also become a Design system page specimen (`DesignSystemPane.tsx`),
which is the second caller that justifies it.

**Done when:** one component, both panes using it, and a specimen on the
design system page — or a decision that eight near-duplicates are fine.

---

## T6 — One copy line never ruled on

The Global empty state, engines-present branch, ends with "Discovery lists
places to find some." It is accurate and points at a real pane, but it is
the empty state selling a feature, which may not be wanted. Raised twice on
2026-08-16 and 2026-08-17 without a ruling; keeping it is the current
default. `ProfilePane.tsx`, the `enginesDetected` branch.

**Done when:** Karthik says keep or cut. One-line change either way.

---

## T7 — Discovery's icon-vs-monogram branch has no test

`DiscoveryPane.tsx` now renders `<img src={DISCOVERY_ICONS[dir.mark]} />`
when a bundled icon exists for a mark and the plain monogram span when it
doesn't (landed `9e65645`). `discovery_pane.test.tsx` passed unchanged
through that commit — nothing in the suite renders a `Directory` on each
side of that branch and asserts which element appears. A regression (a
deleted asset file, a broken glob pattern in `discoveryIcons.ts`) would not
fail any gate. Recorded as `docs/findings.md` F41.

**Done when:** a test asserts an entry present in `DISCOVERY_ICONS` renders
an `<img>`, and an entry absent from it renders the monogram span.

---

## T8 — Five Discovery entries have no usable icon

`io` (agentskills.io), `am` (agents.md) and `mm` (mcpmarket.com) have real
favicons that are pure black linework with no backdrop of their own —
invisible against `--page: #000000` in dark mode, confirmed by rendering
both themes. `sd` (skillsdirectory.com) is a near-white pattern, weak in
both themes. `re` (registry.modelcontextprotocol.io) has no favicon at all.
All five currently fall back to the plain monogram, which is correct
behaviour, not a bug — but it's a worse outcome than the other 29 entries
get. Recorded as `docs/findings.md` F38.

**Done when:** hand-authored monochrome-safe marks exist for these five
(the same role `src/assets/brand/generic.svg` plays in the brands system) —
or Karthik rules the monogram is the permanent, intended treatment for
sites with no usable identity asset, closing this the way F40/F44–F48 are
closed (decided, not a defect).

---

## T9 — No refresh path for Discovery's bundled icons

The 29 favicon/avatar PNGs under `src/assets/discovery/` were fetched once
by hand on 2026-08-16 (curl against Google's favicon service, GitHub's
avatar endpoint, and a few sites' own icon routes) and bundled at build
time, matching `brands.ts`'s "nothing fetched at runtime" rule. Unlike
`brands.ts`'s small, slow-changing set of coding-agent logos, Discovery's
29 icons belong to unaffiliated community sites that can change their
favicon at any time — and there's no script, no re-fetch command, and no
"icons checked as of" marker analogous to `CATALOGUE_CHECKED`
(`directories.ts:15`) to say when the bundled images might be stale.
Recorded as `docs/findings.md` F36/F37.

**Done when:** Karthik decides staleness is worth guarding against (and a
small fetch script gets committed, mirroring how the catalogue itself gets
hand-rechecked) — or rules a one-time snapshot is fine, same keep-or-cut
shape as T6.

---

## T10 — The MCP redesign stopped after stage 1

**Status, 2026-08-19: stage 2 MERGED at `15da8c2`; stage 3 is in flight**
(`docs/superpowers/plans/2026-08-19-mcp-stage-3.md`). Everything below
describes the gap as it stood on 2026-08-17 and is kept for the record of why
it stalled. Check the plan before trusting any "outstanding" claim here.

The dispatch was staged: **§4 the detector, §5 the list, §6 the panel**
(`docs/superpowers/specs/2026-08-16-mcp-identity-design.md`). Stage 1 shipped
and is in `main`. Stage 2 and stage 3 were never started.

The one stage-2 item that did land is §5.3, the annotation-key leak — Reach
was blank on every MCP row, so it was fixed as a defect rather than as part of
the stage. Everything else in §5 and §6 is outstanding:

- **§5.6 the list** — one row per server rather than one per registration; the
  `Display` control beside the category tabs (grouping: one per server / one
  per registration, plus sort); section headers carrying their own column
  labels so the All view can hold sections of different shape.
- **§5.2 agreement** — consistent / conflicting / duplicate / aliased as the
  row's second line, in prose. Karthik's ruling: the comparison key is
  `(transport, launch)`, and an unwrapped `mcp-remote` bridge normalises to
  `(http, url)` before comparison or every bridged server reads as permanently
  conflicting.
- **§5.5 persisted verification** — done. v6 added `probe_results` during
  stage 2; v7 added its freshness columns (`ttl_ms`, `cache_scope`,
  `launch_mtime`) during stage 3.
- **§6.1 the panel** — the inspector eyebrow (`MCP servers · user profile` with
  nothing selected, `MCP server · user profile` with a row selected), the
  verdict card, the launch-spec diff aligned on the token that differs, and the
  Reconcile / Compare / Open config actions. What `McpServerDetail` renders
  today — Registered in / Identity / Tools — is stage 1's panel, built to carry
  the detector's output honestly. It is not this.
- **§6.3** — the nine states that must render.

**Why it stalled:** the `mcp-identity` branch was created for stage 2 and was
then consumed, in order, by the annotation-key leak, the `RegistrationKey` type
that leak turned out to need, and two `reviewIssues` defects that surfaced from
there. Each was real and each was authorised as it came up; none of them was
the list or the panel. The drift was never reported, and nothing tracked
recorded the gap — which is what this entry exists to stop.

**Before any of it:** the spec's §5.6 and §6.1 describe a prototype
(`docs/v3-prototype-references/hanger-mcp-identity.html`). Karthik was explicit
at the outset that the UI has evolved and the prototype is **reference, not
spec** — take the MCP elements and the filter beside the tabs, not the layout.
Reconcile against the code first; the code is the fact and the disagreement is
the report.

**`Display` is a first-time label** and needs a researched naming brief and
Karthik's sign-off before it lands (`.claude/rules/ui-copy.md`).

**Done when:** §5.8 and §6.5 — the stages' own exit criteria — have evidence
attached, in one report, including a screenshot from a running build.

---

## T11 — Seven MCP strings shipped without a naming brief

`.claude/rules/ui-copy.md` wants a researched naming brief and Karthik's
sign-off before a first-time label lands, and a `/humanizer` pass on every
user-facing string. Karthik ruled on 2026-08-19 that the brief-and-sign-off
round is **deferred until after stage 3** rather than blocking it. The strings
still get written in the app's voice and still get the `/humanizer` pass as
they land; what is owed is the deliberate review of the set.

In the queue:

- The three `agreementLine` forms — `{n} registrations · agree`,
  `· {k} different launch specs`, `· declared twice by the same engine`.
- `Check again`, the reload control's accessible name and tooltip
  (`McpServerDetail.tsx`, `CheckAgainButton`).
- The probe loading indicator, shipped in Task 6 (3131d77) as
  **"Asking the server…"**, on a 250ms delay so a fast server does not make
  it strobe.
- The already-running-so-not-probed state, shipped in Task 6 (3131d77) as
  **"This server is already running. Asking for its tool list means starting a
  second copy, and some servers only allow one at a time, so Hanger left it
  alone."** This one carries a real explanation, not just a label: it has to
  say why Hanger declined to ask without reading as a failure, which is why it
  renders in `text-ink-3` like the resting copy rather than in a warning
  colour.
- Whatever distinguishes a cached tool list from a freshly probed one.
  Task 6 deliberately added no string for this: `mcp_cached_probe` returns the
  row's own `verified_at`, so the Identity section's existing
  `verified {n}d ago` now states the real age of a cached answer instead of
  `Date.now()`. Confirm that is enough, or decide what else the panel owes.
- Task 11's two Tools empty states (`ProfilePane.tsx`,
  `McpZeroServersEmptyState` / `McpNoEnginesEmptyState`). Appendix A's own
  templates, substituted, never rephrased — but the fill-in words and the
  disclosure controls are this task's own copy:
  - A.1 headline: **"No MCP servers registered"**. Body: **"{engine list}
    is/are installed here, but {none has|neither has|no engine has} a server
    configured."** — the three-way fork (`no engine has` for one detected
    engine, `neither has` for exactly two, `none has` for three or more) is
    this task's own grammar choice, not spec text.
  - A.1's count line: **"Checked {n} config file/files across {m}
    engine/engines"**, backend-counted (`get_mcp_coverage`), rendered only
    once the count has actually arrived (fix round 1: a pending or failed
    fetch shows no count line at all rather than a false zero).
  - A.2 headline: **"No AI engines found"**. Body: **"Hanger looks for
    {engine names} in their standard locations."**, with a no-roster fallback
    (fix round 1, item 3, mirroring the whole-store empty state's own
    pattern): **"Hanger looks for the engines it knows about in their
    standard locations."**
  - The count line **"Checked {n} location/locations"**
    (`get_known_engine_locations`), shared by A.2 and, since fix round 1, by A.1's
    own fallback for the true-zero-files case (an engine detected with none
    of its MCP config files ever created) — a hybrid Karthik should rule on:
    is a locations count the right thing for A.1 to fall back to, or should
    that state read some other way entirely?
  - The four disclosure toggles: **"Show files" / "Hide files"** (A.1),
    **"Show locations" / "Hide locations"** (A.2 and A.1's fallback).
    Appendix A's own text is bracketed, `[Show files]`; rendered here as
    plain button text without the brackets, on the reading that the spec's
    brackets mark "this is a control" rather than literal copy — no other
    button in the app uses brackets either way, so there was no precedent to
    confirm against.
- Task 15's `McpEngineSummary` (`McpEngineSummary.tsx`), the empty inspector
  for the global pane when the Tools filter is active and nothing is
  selected. Karthik named the component; none of its strings below have his
  sign-off.
  - The title, **"What every request carries"** — explicitly UNSIGNED per
    the task brief itself, not merely un-reviewed like the rest of this
    list. Rendered as the panel's own heading; do not treat its presence on
    screen as a ruling.
  - The row line **"{n} server/servers registered"** and the tool figure's
    own subtext, **"tool"/"tools"** when a count is known or **"not yet
    asked"** (paired with an em-dash figure) when it is not.
  - The note's three-bucket template, fix round 1: **"{answered} of {total}
    server/servers answered so far."**, **"{unasked} hasn't/haven't been
    asked yet."**, **"{unaskable} can't be asked at all. No local process to
    start, nothing to dial."**, and the closing **"Every tool a registered
    server can reach is described to the model on every request. That's the
    running cost of what's registered."** — reuses the reference
    prototype's one correct point (the per-request cost of a registration)
    in different words, per the task brief's own instruction not to copy
    its wording.

- The final fix wave (2026-08-20) — one new string and two surfaces whose
  content changed. All **UNSIGNED**; a `/humanizer` pass ran on the new
  string as it landed and found nothing to change (no significance
  inflation, no `-ing` analysis, no em dash, no hedging; it is deliberately
  parallel to the launch sentence it sits beside).
  - New, `McpServerDetail.tsx`: **"These hosts reach {name} at different
    endpoints. Whichever you are using decides which server answers."** —
    the M1 fix's second divergence line, for a server two hosts point at two
    different endpoints. Written to mirror the existing **"These hosts
    launch {name} differently. Whichever you are using decides which version
    you get."**, since the two render in the same place and answer the same
    question; whether they should instead be one sentence with a swapped
    verb is a question for the pass.
  - No new string, but visible for the first time: the project-override
    note, **"also declared for {path} — the version used there"**
    (`serverRows.ts`, `projectOverrideNote`). It shipped in an earlier task
    and could never render, because the list filtered Local-tier
    registrations out before the backend computed the note. It renders live
    from this tree on, so it has never actually been read on screen.
  - No new string, but new content: the multi-launch Tools block's label
    (`McpServerDetail.tsx`) now shows a direct remote group's sanitised
    endpoint where it previously showed an empty string. That is a URL
    standing where a launch command normally stands — check it reads as a
    label rather than as something to run.

**Done when:** the set has had one deliberate pass together, Karthik has ruled
on each, and any renames have landed.

**Not in scope:** re-reviewing copy he has already signed off — the empty and
pending states from stage 2, the eyebrow forms, "Needs review", "Design
system".
