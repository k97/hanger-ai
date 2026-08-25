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

## T2 — DESIGN.md's chrome citations need re-deriving — CLOSED

**Half resolved 2026-08-17.** Karthik ruled the orphaned hunks should land;
they did, as `40bc898`. `tauri.conf.json` now has `trafficLightPosition.y: 22`
and `App.tsx` the crumb's `pl-[51px]` plus `shrink-0` on the three `tbBtn*`
variants, so `DESIGN.md:606` and `:637` are true as written again.

**Closed 2026-08-25**, audited rather than assumed. Every citation in the
"Window chrome — one vertical baseline" section (`DESIGN.md:1054-1116`) now
points at what it claims, verified line by line:

    App.tsx:1325        <div data-tauri-drag-region … relative z-40 h-10 shrink-0 flex items-center>
    App.tsx:1440        <header data-tauri-drag-region … relative h-10 shrink-0 flex items-center>
    App.tsx:1781        <div data-tauri-drag-region className="relative h-10 shrink-0">
    App.tsx:1327        <div className="w-[76px] shrink-0" aria-hidden="true" />
    App.tsx:1148-1153   const tbBtnClass = "relative h-[27px] min-w-[27px] …"
    App.tsx:1320-1324   the z-40 comment
    App.tsx:1451-1453   the crumb's pl-[51px] / pl-[18px]
    tauri.conf.json:26  "y": 22
    InspectorCap.tsx:93-94  const tbBtnActiveClass

Three things the audit found that the entry did not predict:

1. **The entry's own success criterion had drifted.** `DESIGN.md:605-611` and
   `:633-645` hold Flyout props and the identity row today; the section moved
   to `:1054-1116` during v4. A done-when written as line numbers into a
   churning document decays exactly like the citations it polices.
2. **The `App.tsx` citations became correct by accident.** Before `bd26400`,
   `App.tsx:1325` pointed at a *comment*, five lines above the cap it names.
   Narrowing `InspectorCapAsset` deleted five lines higher up and slid the
   citation onto its target. Nobody re-derived it; arithmetic did.
3. **Editing a comment invalidated nine citations.** Lengthening
   `InspectorCap.tsx`'s header comment by nine lines (`08aceda`) shifted
   seven `DESIGN.md` citations and two of that file's own. All repointed
   here.

One claim was also incomplete rather than mis-cited: the crumb's `pl-[51px]`
applies when `sidebarCollapsed` **and** the view is not the link map, not on
`sidebarCollapsed` alone. Corrected.

**What this says for the citation problem generally.** Points 2 and 3 are the
argument: a line citation into a file under active edit is correct only until
the next unrelated change above it, and neither direction of drift produces a
signal. All 215 citations are in bounds, so a bounds guard is decoration; the
token-proximity check that found 16 stale ones covers only the ~25 citations
with an adjacent backticked token and false-positives on paraphrase. The
durable fix is a convention change — cite symbols, or ranges anchored to
symbols — not a guard over line numbers. Left as a proposal, not taken.


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

## T6 — One copy line never ruled on — CLOSED

The Global empty state, engines-present branch, ends with "Discovery lists
places to find some." It is accurate and points at a real pane, but it is
the empty state selling a feature, which may not be wanted. Raised twice on
2026-08-16 and 2026-08-17 without a ruling; keeping it is the current
default. `ProfilePane.tsx`, the `enginesDetected` branch.

**Closed 2026-08-25: Karthik ruled CUT.** The subline now ends at the
finding — "…hold no skills, rules, MCP servers or subagents yet." — with no
pitch after it, matching the sibling branch, which states its finding and
then names an action the user can actually take ("Run one of them once, then
rescan"). There is no such action here, so the sentence simply stops.

Pinned, because nothing held it: the test asserted a *prefix* regex that
stopped before the final full stop, so it could not see the trailing
sentence at all and would have passed just as happily with it restored. It
now matches the whole subline, and putting a sentence back fails it.

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

---

## T12 — The v4 hardening pass

**Karthik asked for this on 2026-08-23**, after Phase 1's reviews found five
tests that were live, green, and asserted nothing. It grew across all four
phases. Recorded here because the per-phase SDD ledgers it came from live in
`.superpowers/sdd/`, which is git-ignored and dies with the worktree.

Every item below was **found by a reviewer, and most were proven by mutation** —
the defect was planted, the suite stayed green, the defect was reverted. They
are not suspicions.

**Tests that assert nothing (proven: planting the defect left the suite green)**

**All five are closed** (2026-08-25). Each was re-proven against the current
tree before it was fixed — the defect planted, the suite watched to stay
green — then the new test was watched to go red on that same defect before
any green was counted. The red output travels in each commit body.

- ~~`SegmentedTrack` capsule position~~ — **closed**, `7be2554`. Split in two,
  because one test could not carry both halves. The wiring half is assertable
  and now pinned: shadowing `offsetTop`/`offsetLeft`/`offsetWidth` with three
  distinct values proves each reaches its own CSS property (planting the swap
  in the layout effect *and* in the JSX style binding each fails it). The
  geometry half is not assertable in `happy-dom` at all and was routed to a
  screenshot, per `verification.md`: `docs/evidence/t12-capsule-*.png`, from
  the running dev app, with the capsule on **MCP servers** — the third
  segment, where `offsetLeft` is ~178pt and `offsetTop` is still the 4px
  inset, so a swap would drive the capsule out of the track. On `All`, the
  first segment, both offsets are the same 4px inset and the shot proves
  nothing; that is why the third segment is the one captured.
- ~~`SegmentedTrack` arrow-key wraparound~~ — **closed**, `7be2554`. ArrowLeft
  from the first asserts a landing on the last and ArrowRight from the last on
  the first. Each half was planted separately and fails independently.
- ~~`OverflowMenu` `align`~~ — **closed**, `cea2a7c`. The count in the original
  entry was wrong: `OverflowMenu.test.tsx` holds 6 tests, not 13. The claim
  holds and is worse than recorded — hardcoding `right-0` passed **31** tests,
  every one that touches the component (OverflowMenu 6, InspectorCap 20,
  toolbar_avionics 5). Both edges now assert their own class *and* the absence
  of the other, so it is a choice and not a presence check.
- ~~`ProfilePane`'s `mcpReviewOnly` reset~~ — **closed**, `b675f98`. Deleting
  the reset passed 70, not 49 (ProfilePaneIntegration 49, ProfilePaneSelection
  6, mcp_card_row 15). The case asserts both halves — the pill unpressed and
  the list it gates unfiltered — and each fails on its own.
- ~~The track/strip ordering assertion~~ — **closed**, `f308e16`. Both blind
  spots re-proven against the current tree, each passing the **full 806**:
  `order-2`/`order-1` on the two wrappers, and the four spacing values
  reverted to their pre-`2de751a` form (`pt-3` `pb-2.5` `mt-[18px]`, no
  `mb`). Fixed with a class contract whose comment says that is what it is —
  each wrapper's exact class list, plus a sibling check, since siblings under
  one flex column is the only arrangement where `order` applies. Paint order
  itself stays a screenshot claim; happy-dom has none. Both panes carry it,
  and `DESIGN.md` → Pane composition cites the same two strings, so they move
  together now. A `not.toMatch(/order-/)` line was written and removed: the
  className assertion fails first, so nothing could have made it fire.

**Nine more from Phases 1 and 2a** — **all closed** (2026-08-25). Each was
re-proven blind against the current tree before it was fixed; the red output
travels in each commit body.

- ~~T3 icons~~ — `80f3a4b`. The assertions were `viewBox`/`width`/`stroke-width`,
  all supplied by the `sized` wrapper rather than the mark. Each export is now
  compared against the Heroicons mark it claims to wrap, which pins identity
  without hardcoding path data, plus a distinctness check a consistent pair
  swap would otherwise satisfy. The loop of twelve row marks had the same hole
  and was not named in the ledger; it is covered by the same table.
- ~~T4 `ListCard` divider~~ — `730de83`. Half is genuinely un-assertable and
  stays a screenshot claim: no Tailwind CSS under happy-dom. The other half
  was not — `>` matches DIRECT children, so one wrapper div breaks every
  divider while leaving all class strings correct.
- ~~T5 `miniButton`~~ — `d9c00e8`. Whole class strings, the way `miniSetClass`
  alone already did. A fill button carrying both `bg-fill` and `bg-page` passed
  before.
- ~~T6 `ScanStamp`~~ — `3bb79b3` (boundaries) and `3f51276` (the dead default,
  production). Correction: the ledger says the samples are "interiors"; two of
  the three already sat ON their boundary. What no sample reached was the
  59-side, and **four of six** single-unit threshold moves shipped green.
  The dead default became a required prop, so the compiler enforces it.
- ~~T9 re-flow~~ — `2774649`. Correction: not the alphabetical sort. The
  fixture's unlinked root is LAST in its column, so filtering before layout and
  hiding after it produce byte-identical output. A third root beneath it splits
  them, and positions reach the DOM as `<rect y>`.
- ~~T10 absence assertion~~ — `1e244b2`. The toolbar slot is gated on
  `linkmap`; ungating it so the stamp leaks into every view passed before.
- ~~T14 clamp~~ — `9217856`. Stubbed rects let the effect run. Note: stubbing
  is exactly what bypasses the zero-rect guard, so removing that guard stayed
  green until a deliberately unstubbed fourth case was added for it.
- ~~F6 empty directory~~ — `51e8cb7`. The case set `dirResult = []` and also
  switched category to Rules; the switch alone returns before `invoke`, so the
  empty branch was never reached. Split, and the new case asserts the command
  WAS called before asserting the absence.
- ~~M5 `toolCount`~~ — `5263832`. The backend now says 5 while the list holds
  3, and a `perTool` entry has no twin. That splits two choices at once: the
  tab's source, and the row set's.

**Guards that cannot see what they exist to check**

**All three are closed** (2026-08-25), and each corrected something the entry
had recorded wrongly.

- ~~`tokens_contrast.test.ts`~~ — **closed**, `38bbc0a`. The recorded mechanism
  was only half of it, and the proposed fix would not have worked. The scan
  pairs a `bg-*` with a `text-*` **in the same className**; the capsule's
  surface sits on an absolutely positioned `<i>` (`SegmentedTrack.tsx:89`)
  while the text it backs is on sibling buttons (`:108`, `:112`), composited
  by z-index. So resolving `@utility` backgrounds would still not have found
  the pair — and `capsule-raised` is in any case the only `@utility` carrying
  one. Pinned explicitly instead, resolved through the same `tokens.css` the
  scan reads. `capsule_tokens.test.ts` pins what the token IS; this pins
  whether the result is LEGIBLE, the half that moves when the surface is
  redesigned. Reproduced by planting `--capsule: #c8c8c8` in dark and moving
  the declaration guard with it, as a real edit would: a selected label at
  **1.67:1** passed all 806 tests. The count pair (`--ink-2`) is pinned
  alongside the label pair the entry named — a light-theme plant failed the
  count and legitimately passed the label.
- ~~`no-frontend-counting`~~ — **closed**, `704f1e2`. The exemption is a modulo
  that immediately consumes the sum, which no asset count has, and it
  suppresses only the sum signal — the reduce, inventory and `…Count` rules
  still apply to the same line. Six real violations were planted in production
  source and all still fail, including counting disguised as index math.
  `SegmentedTrack` keeps its ternary, so nothing in `src/` exercises the
  exemption; it has a direct table instead, which fails in both directions.
- ~~`issuesForAsset`~~ — **closed**, `a0e461a`. The Tools fixture is now a
  fault carrying a real registration key, queried by `registrationKeys` and
  nothing else. Correction: the entry says real duplicates "are reached by the
  `copies` branch, which has no test" — they cannot be, since `asCopy` requires
  `asset.path !== undefined` and `AssetIdentity`'s server arm types `path` as
  `never`. They are reached by `asServerDuplicate`, which is tested.
  **This one turned up a live defect** (`3420ee0`, production): the branch
  matched with `issue.id.endsWith(key)`, and config paths nest, so
  `"/b/a/.claude.json:x".endsWith("/a/.claude.json:x")` handed a healthy
  server another server's fault — the 2026-08-24 ruling's failure reopened
  through `id`, where its `never` arms could not see it. Now whole-id
  equality.

**Debt taken deliberately, with the reason** — **all four addressed**
(2026-08-25). Only the first carried a *Done when*; for the other three the
reasons were re-checked and found to still hold, so each got the control it
was missing rather than a rewrite. A decision recorded and left unguarded is
the failure `verification.md` calls "a ruling recorded is not a ruling
executed".

- ~~`InspectorCapAsset`~~ — **closed**, `bd26400`. Narrowed to `category`,
  the only field read. `capAsset` is an annotated object literal, so
  excess-property checking makes the compiler the control: narrowing alone,
  before touching callers, errors at `App.tsx:1216` and three fixtures. The
  fixture edit could not be split into its own commit — the wide interface
  REQUIRES `name` there and the narrow one forbids it, so no ordering leaves
  both halves typechecking; reported in the commit body instead.
- ~~`tbBtnClass`~~ — guarded, `223e7f3`. Both reasons still true, and the two
  copies are still byte-identical. But a duplicate taken on purpose still
  drifts, and nothing would have noticed. Now three plants fail it: drift, a
  third declaring file, and a rename (which throws rather than passing on
  nothing, per the text-guard warning).
- ~~`forceShed`~~ — guarded, `5baa71c`. Reason still true; happy-dom's
  `observe()` is still a no-op. The unguarded failure is a *production* call
  site passing it, which pins the shed and disables the measured path at
  `InspectorCap.tsx:141`, with nothing red because the suite passes this prop
  on purpose.
- ~~`ViewControl`'s `p-1`/`p-1.5`~~ — **fixed**, `6623d2d`. Padding moved to
  the call sites, so exactly one lands on the panel and nothing depends on
  Tailwind's emission order. Rendered output unchanged; DESIGN.md cites the
  panel's shadow, radius and animation, not its padding, so no citation went
  stale. Guarded against a second one creeping back.

~~**Stale `DESIGN.md` citations predating this work**~~ — **closed**,
`5c5ac3d`. Both named spots fixed, and both were worse than recorded. Every
one of the Shell subsection's eight citations was stale, and four of its
claims were wrong as well as mis-cited — the inspector is 384px not 396
(there is no `396` in `App.tsx` at all), the source list clamps 216–320 not
200–320, and it is the **link map** that renders no second column, not
Discovery, which has one. The inventory said 24 components against 46, under
a "all default-exported with an `interface <Name>Props`" rule that has seven
exceptions, now named.

Checking those turned up that the drift is systemic. All 215 `file:line`
citations in `DESIGN.md` are IN BOUNDS, so a bounds check proves nothing
here: `App.tsx:249` was in bounds and pointed at a comment about Appearance.
Checking whether the backticked token beside a citation appears near the
cited line found **16 of 25** such citations stale; all repointed, each
verified against the code.

**No guard shipped, deliberately.** The bounds rule cannot see this failure,
and the proximity rule false-positives on any paraphrased token — it flagged
`sized()` against `function sized(Icon: SvgIcon`, and
`display: inline }` against `display: inline;`. A guard authors must write
around is worse than none. **For T2:** the 190 citations with no adjacent
token are unchecked by any means, and the ~25 with one now pass proximity —
that is the state to start from.

**Not in scope:** re-litigating any ruling recorded in the phase ledgers or in
the commit bodies — the reasoning travels with the commits that made each call.
