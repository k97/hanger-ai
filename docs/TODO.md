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
