# Animated icons — state inventory and constraints

Companion to `kitchen-sink.html`. The HTML is what you look at; this is what
survives into implementation. Every citation here was checked against the tree
on 2026-08-24; where a doc and the code disagree, the code is recorded as the
fact and the disagreement is noted.

## 0. How to use the kitchen sink

```bash
open docs/v5-animate-icons/kitchen-sink.html      # any browser; refresh after an edit
```

**Finding a state.** Every card carries its own citation in the header, so the
`file:line` in §3 below is the search key. To reach the global scanning plane,
search the HTML for `ProfilePane.tsx:812`.

**Swapping a mark.** Each card holds one `<svg class="aim">` inside
`<div class="plane">`. Replace that whole element and keep the motion class.
`mark.py` prints the replacement, with real geometry from the installed
`lucide-react`:

```bash
python3 docs/v5-animate-icons/mark.py --list folder   # what exists (1,751 marks)
python3 docs/v5-animate-icons/mark.py radar --motion draw --stagger
python3 docs/v5-animate-icons/mark.py disc-3 --motion spin --only 1,3
python3 docs/v5-animate-icons/mark.py inbox --motion draw --rest --size 40
```

`--rest` gives play-once-and-hold; the default loops. `--only` restricts motion
to specific element indices so the rest of the mark holds still. **If you
`--only` a rotate onto an off-centre group, pass `--origin X,Y`** — see §2.1.

**Changing the motion rather than the mark.** Edit the class on the `<g>`:
`aim-spin`/`aim-draw`/`aim-lift`/`aim-seek`/`aim-breathe`, plus `aim-loop` or
`aim-once`. Timings live in `_proto.css` under "The four motions" — change a
duration there and every state using it moves together, which is how it will
behave in the app.

---

## 1. The six decisions

Taken 2026-08-24 (Karthik), in dependency order. Each locks the ones after it.

| # | Decision | Ruling |
|---|---|---|
| 1 | **Source** | Re-implement. Lucide geometry (ISC), pqoqubbw/icons (MIT) as motion reference. |
| 2 | **Medium** | CSS keyframes. **No `motion` dependency.** |
| 3 | **Family** | Lucide for every animated mark; Heroicons untouched elsewhere. |
| 4 | **Trigger** | Active → loop. Resting → play once, hold. |
| 5 | **Prototype shape** | Static HTML, v4 convention. Geometry inline, motion vocabulary in `_proto.css`. |
| 6 | **Scope** | All 35 sites. Families 1–5 proposed; family 6 shown unchanged. |
| 7 | **Density** | A mark that animates inline wants ≤4 elements. `radar` dropped. (§4.2) |
| 8 | **Sizes** | Keep 12. Retire 11 — one animated site. (§4.0) |
| 9 | **MCP** | `server` (rack swap) for MCP probe and verify. (§4.3) |
| 10 | **Link map** | `git-graph`, not `waypoints` — it is columnar, as the map is. (§4.4) |
| 11 | **Nothing selected** | `cursor-click` (= lucide `mouse-pointer-click`), burst once. (§4.4) |
| 12 | **Not scanned yet** | `folder-clock`, hands sweep once. Replaces "same mark held still". (§4.4) |
| 13 | **Stroke** | Match the app — `strokeFor()` per size, emitted per svg. (§4.5) |
| 14 | **Rescan** | `rotate-ccw`, spinning counter-clockwise. (§4.6) |
| 15 | **Reading** | `file-text`, text lines pulse in sequence. (§4.6) |
| 16 | **No MCP servers** | `zap-off` on A.1 — the state that actually occurs. (§4.7) |
| 17 | **Server motion** | Alternating rack **opacity**, not translation. (§4.8) |
| 18 | **Five marks** | `unlink`, `folder-plus`, `monitor-check`, `frame`, `git-pull-request-closed`. (§4.9) |

### 1.1 Why not vendor animate-ui

`animate-ui.com` (the original reference) is **MIT + Commons Clause**:

> You may use this Software, including for any commercial purpose, **so long as
> you do not sell or redistribute the components themselves in their original
> form — whether alone or in a bundle.**
> — `imskyleen/animate-ui`, `LICENSE.md`

Hanger is a **public MIT repository** (`k97/hanger-ai`, `private: false`,
`license: MIT`, confirmed via the GitHub API). Committing those component files
verbatim would be redistribution in original form, and Hanger's own `LICENSE`
would be offering readers rights over code we do not hold.

`pqoqubbw/icons` (which serves `lucide-animated.com`) is **plain MIT** — "use,
copy, modify, merge, publish, distribute, sublicense, and/or sell" — with no
Commons Clause, so it is safe as a reference *and* safe to copy from. We still
re-implement rather than vendor, because of decision 2.

`lucide-react` is **ISC** and is already a dependency at `^0.470.0`. All 30
marks used by the prototype were extracted from the installed package, not
hand-drawn.

### 1.2 Why CSS and not `motion`

Three reasons, in order of weight:

1. **Reduced motion.** `index.css:208-215` removes all motion under
   `prefers-reduced-motion: reduce` with `animation: none !important` on `*`.
   That shorthand resets the longhands this vocabulary uses, so every motion is
   removed for free. A JS animation library writes **inline styles**, which that
   rule cannot reach — all 35 sites would each need a hand-wired
   `useReducedMotion()`, and the guarantee stated in `.claude/DESIGN.md` §3
   would quietly stop being true.
2. **No new dependency.** The app ships zero animation libraries. Every beat
   today is CSS: `--spring`, three durations, four `@utility` keyframes.
3. **The motions do not need it.** Rotate, path-draw, translate and stagger are
   all native CSS. `motion` earns its place for gesture-driven, interruptible
   physics; a spinning disc is not that.

### 1.3 Why Lucide and not Heroicons — structural, not stylistic

This was the load-bearing finding. **Heroicons 24/outline ship one compound
`<path>` per mark.** Measured against the installed package:

| Heroicon | Elements | Subpaths |
|---|---|---|
| `ExclamationCircleIcon` | 1 | 1 |
| `InformationCircleIcon` | 1 | 1 |
| `ArrowPathIcon` | 1 | **3, all inside one `d` string** |
| `GlobeAltIcon` | 1 | **4, all inside one `d` string** |
| `Cog6ToothIcon` | 2 | 2 |

CSS cannot select a subpath inside a `d` attribute — there is no DOM node to
target. So Heroicons support whole-mark rotate, fade and scale, and **nothing
else**. Lucide ships element arrays:

| Lucide | Elements |
|---|---|
| `activity` | 1 |
| `search`, `circle-check` | 2 |
| `layers` | 3 |
| `disc-3`, `refresh-cw` | 4 |
| `folder-sync` | 5 |
| `waypoints` | 7 |
| `radar` | 8 |
| `boxes` | 12 |

Per-element motion — `folder-sync`'s arrows turning while the folder holds
still, `waypoints`' seven-node cascade — requires those separate elements.
Hand-splitting Heroicons' `d` strings would fork them from upstream and break on
every package update.

**Consequence for the family rule.** Today's rule is "lucide where Heroicons has
no equivalent", a judgement call that has already drifted (see §5). It becomes
**"animated ⇒ Lucide"**, which a guard can check mechanically.

### 1.4 The two-rule system

| Class | Meaning | Behaviour |
|---|---|---|
| `.aim-loop` | **Active** — work is happening now | `animation-iteration-count: infinite` |
| `.aim-once` | **Resting** — a finding; nothing is running | `iteration-count: 1; fill-mode: forwards` |

The distinction carries information: a moving mark means *working*, a still mark
means *this is the answer*. Looping on an empty pane animates a conclusion.

This is not a new instinct in the app — it is the one behind `animate-tip`
scaling from `0.97` rather than `0`, "because nothing in the world appears from
nothing" (`.claude/DESIGN.md` §3), and `FavouriteHeart`'s pop already plays once
and holds.

---

## 2. The motion vocabulary

Six keyframes, in `_proto.css`. This is what ports to `index.css`.

| Class | Motion | Used by |
|---|---|---|
| `.aim-spin` | rotate 0→360, 1s linear | `disc-3`, `refresh-cw`, `folder-sync` |
| `.aim-draw` | `stroke-dashoffset` 1→0, 0.7s `--spring` | most resting marks |
| `.aim-stagger` | `animation-delay: calc(var(--i) * 110ms)` | `waypoints`, `radar`, `check-check` |
| `.aim-lift` | translateY ±1.5px, 1.6s | `layers` |
| `.aim-seek` | small 4-point wander, 2.2s | `search` |
| `.aim-relay` | opacity 1→.25→1, 1.2s, racks −0.6s out of phase | `server` (two racks) |
| `.aim-burst` | scale .5→1 + fade in, .5s, **.35s delay** | `cursor-click` sparks |
| `.aim-spin-ccw` | rotate 0→**−360**, 1s linear | `rotate-ccw` |
| `.aim-scan` | `stroke-dashoffset` 0→1→0, 1.4s | `file-text` lines |
| `.aim-breathe` | opacity 1→.45, 2.4s | waiting states |

Three mechanics worth keeping when this moves into the app:

- **Motion lives on a `<g>` inside the svg, never on the svg itself.** This is
  what lets a sub-group move while the rest of the mark holds still.
- **Rotation origin is explicit, via `--ox` / `--oy`, defaulting to 12px 12px.**
  See §4.1 — this one bit us, and it will bite the implementation too.
- **Path draw uses `pathLength="1"`**, an SVG-native attribute that normalises
  any path to a 0–1 scale. It is the standards equivalent of Motion's
  `pathLength`, and it means no per-mark measurement.

### 2.1 The rotation-origin trap

**Found and fixed during the prototype build; it will recur in the app.**

The obvious rule — "Lucide draws on a centred 24 grid, so rotate about
`12px 12px`" — is right for a whole-mark rotate and **wrong for any off-centre
sub-group**. `folder-sync`'s arrows span x 12–22, y 10–22, so their own centre
is **(17, 16)**. Rotated about (12, 12) they swing through a wide arc and leave
the folder entirely; rotated about (17, 16) they spin in place, which is the
intended motion.

Verified by rendering both at 90° side by side. At rest the arrows sit inside
the folder; with the wrong origin at 90° they hang off its lower-left corner.
The failure is invisible at 0° and at 360°, so it does **not** show up in a
static screenshot of a looping icon — only mid-rotation.

Motion sidesteps this by defaulting `transformOrigin` to each element's own
bounding box. We make it explicit instead, so the value is readable in the
markup rather than inferred at runtime:

```css
.aim g[class*="aim-"] {
  transform-box: view-box;
  transform-origin: var(--ox, 12px) var(--oy, 12px);
}
```

```html
<g class="aim-spin aim-loop" style="--ox:17px;--oy:16px">
```

**Any new sub-group motion needs its origin measured**, not assumed. Three marks
already need a non-default value, which is the strongest argument that this is
the rule and not the exception:

| Mark | Origin | Why |
|---|---|---|
| `folder-sync` | **17, 16** | sync arrows sit bottom-right |
| `folder-clock` | **16, 16** | hands pivot on the clock face, not the grid |
| `cursor-click` | **9.3, 9.3** | sparks radiate from the cursor tip |

`disc-3`'s arcs happen to be symmetric about (12, 12) and need no override —
exactly the coincidence that makes this bug easy to miss when adding the next
mark.

All declared as **longhand**, never the `animation` shorthand, so `.aim-loop`
and `.aim-once` can compose on top.

---

## 3. Site-by-site mapping

`•` = has no icon today; the mark is a proposal, not a swap.

### Family 1 — Whole-pane pending (5 sites, 8 states) · **loop / rest**

| Site | Today | Proposed | Rule |
|---|---|---|---|
| `ProfilePane.tsx:812-822` global, scanning | `SpinnerIcon` @40 | `disc-3` | loop |
| `ProfilePane.tsx:812-822` global, idle | `SpinnerIcon` @40 | **`folder-clock`** | once |
| `ProfilePane.tsx:869-877` category, scanning | `SpinnerIcon` @40 | `disc-3` | loop |
| `RepoPane.tsx:476-486` repo, scanning | `SpinnerIcon` @40 | `folder-sync` | loop |
| `RepoPane.tsx:476-486` repo, idle | `SpinnerIcon` @40 | **`folder-clock`** | once |
| `RepoPane.tsx:515-523` category, scanning | `SpinnerIcon` @40 | `folder-sync` | loop |
| `NeedsReviewPane.tsx:213-227` scanning • | — | `disc-3` | loop |
| `NeedsReviewPane.tsx:213-227` idle • | — | **`folder-clock`** | once |

**The idle variants take a different mark**, `folder-clock`, its hands sweeping
once and stopping. An earlier draft of this document argued for holding the
scanning mark still — "the record stops turning because nothing is turning."
Karthik overruled it on 2026-08-24, and correctly: a stopped spinner reads as a
rendering fault, not as a statement. A clock on a folder says *waiting* out loud.

`folder-sync` for repository scope and `disc-3` for global scope is a deliberate
split — the panes currently use the identical mark for two different scopes.

### Family 2 — Whole-pane empty (10 sites) · **rest**

| Site | Today | Proposed |
|---|---|---|
| `ProfilePane.tsx:823-843` engines present, nothing tracked | `ExclamationCircle` @40 | `package-open` |
| `ProfilePane.tsx:844-857` no engine folders | `ExclamationCircle` @40 | `folder-x` |
| `RepoPane.tsx:487-505` repo empty | `InformationCircle` @40 | **`folder-plus`** |
| both panes, filter hides every row | `Exclamation`/`Information` @40 | `search` |
| `ProfilePane.tsx:891-904` category genuinely empty | `ExclamationCircle` @40 | `inbox` |
| `RepoPane.tsx:524-538` category genuinely empty | `InformationCircle` @40 | `inbox` |
| `ProfilePane.tsx:129-185` MCP A.1, none configured | `ExclamationCircle` @40 | **`zap-off`** |
| `ProfilePane.tsx:231-262` MCP A.2, no engines | `ExclamationCircle` @40 | `plug-zap` |
| `NeedsReviewPane.tsx:222` clean • | — | **`monitor-check`** |
| `NeedsReviewPane.tsx:226` filtered • | — | `search` |
| `DiscoveryPane.tsx:233-234` no match • | — | `telescope` |
| `Sidebar.tsx:180` no repositories • | — | `folder-plus` |

`circle-check` draws only its tick; the ring is static. "Nothing needs a
decision" is the app's one genuinely good-news empty state and currently the
only one with no mark at all.

### Family 3 — Inspector empty (3 sites) · **rest**

| Site | Today | Proposed |
|---|---|---|
| `Flyout.tsx:883-890` nothing selected | `GlobeAltIcon` @36 `opacity-50` | **`cursor-click`**, burst once |
| `ReviewInspector.tsx:58-66` nothing selected • | — | **`cursor-click`**, burst once |
| `LinkPanel.tsx:257-259` no destinations • | — | **`unlink`** |

The two "Nothing selected" states deliberately share their wording so the
inspectors read as one surface (`Flyout.tsx:886-887`). Only one carries a mark
today; giving both the same one finishes that thought.

### Family 4 — Link map (2 sites + notices) · **loop / rest**

| Site | Today | Proposed | Rule |
|---|---|---|---|
| `LinkMapPane.tsx:282` reading • | text only | **`frame`** | loop |
| `LinkMapPane.tsx:282` no graph • | text only | **`git-pull-request-closed`** | once |
| `LinkMapPane.tsx:295-320` notices | Heroicons triangle / circle | `badge-alert` / `circle-help` | once |

**The two states take different marks** — the same pattern `folder-clock`
established in family 1, and now the house style: reading and empty are
different claims and get different marks, not one mark at two speeds.
`waypoints` and then `git-graph` were earlier picks for both; neither survives.
The unread dot (`w-2 h-2 bg-state-danger ring-2 ring-page`) is unchanged.

### Family 5 — Inline (10 sites) · **loop**

| Site | Today | Proposed |
|---|---|---|
| `CategoryFilterCards.tsx:110` counting | `SpinnerIcon` @11 | `loader-circle` |
| `SummaryStrip.tsx:134` rescan | `ArrowPathIcon` @13 | **`rotate-ccw`** |
| `NeedsReviewPane.tsx:153` rescan | `ArrowPathIcon` @13 | **`rotate-ccw`** |
| `RepoPane.tsx:407` refresh | `ArrowPathIcon` @12 | **`rotate-ccw`** |
| `App.tsx:1405` toolbar rescan | `ArrowPathIcon` | **`rotate-ccw`** |
| `McpServerDetail.tsx:275` verify | `ArrowPathIcon` @13 | **`server`** |
| `McpServerDetail.tsx:166` probe pending | `SpinnerIcon` @12 | **`server`** |
| `LinkPanel.tsx:254` checking projects | `SpinnerIcon` @12 | **`file-text`** |
| `LinkPanel.tsx:423` linking | `SpinnerIcon` @12 | `link-2` |
| `RepoPane.tsx:692` modal | `SpinnerIcon` @12 | `loader-circle` |
| `AssetDetail.tsx:391-392` reading file • | text only | **`file-text`** |
| `App.tsx:1000-1003` boot | `SpinnerIcon` @32 | `disc-3` |

**This family is constrained by size, not taste — see §4.**

### Family 6 — Existing motion · **unchanged, reference only**

`ScanStatusIndicator.tsx:29-35` (pulsing dot — the app's only current looping
motion), `FavouriteHeart.tsx:53-59`, `index.css:151-178` entrances,
`DiffChooser.tsx`, `DisclosureBanner.tsx`. Drawn in the prototype so the new
vocabulary can be checked against the existing one. No change proposed.

---

## 4. Size and density

### 4.0 The sizes actually in use

Counted from the tree at animated sites only (`SpinnerIcon` / `ArrowPathIcon`):

| Size | Animated sites | Where |
|---|---|---|
| **11** | **1** | `CategoryFilterCards.tsx:110` — **outlier, retire it** |
| **12** | **5** | inline status beside text |
| **13** | **4** | action buttons (Rescan, Verify) |
| **32** | 1 | app boot |
| **40** | 4 | the empty/pending planes |

**Ruled 2026-08-24 (Karthik): keep 12; retire 11.** One animated site at a
bespoke size is not a size, it is a typo that survived. Moving
`CategoryFilterCards.tsx:110` from 11 to 12 costs nothing and collapses the
small end to two values. The only other size-11 icon in the app,
`DiscoveryPane.tsx:109`, is a static hover glyph and is unaffected.

**12 vs 13 is not noise.** 13 is where action buttons sit (`SummaryStrip.tsx:134`,
`NeedsReviewPane.tsx:153`, `McpServerDetail.tsx:275`); 12 is inline status.
**One site breaks the pattern**: `RepoPane.tsx:407` is a button at 12. Either
fix that site and keep the split, or collapse both to one size — undecided.

### 4.1 One mark cannot serve both 40 and 12

`disc-3` is a rim, a 2-unit hub and two arcs on a 24 grid. Below about 16 the
arcs collapse into the rim and the hub closes up; what is left reads as a filled
circle, not a record. `loader-circle` is a single arc and holds all the way down.

The proposed pairing is therefore **`disc-3` on the planes, `loader-circle`
inline** — not one mark stretched across both. **Judge the ladder at 100% zoom**;
a scaled-up screenshot will not show the collapse.

### 4.2 Element count is its own limit

**Ruled 2026-08-24 (Karthik): "use disc loading and skip the radar loading, it's
too detailed to be animated."**

`radar` was removed from every candidate strip. At 8 elements it reads fine as a
static mark and turns to mush the moment it moves at 12–13 — density that is
legible at rest is not necessarily legible in motion, because motion needs the
eye to track individual elements.

Working rule: **a mark that animates at inline sizes wants 4 elements or fewer.**
`disc-3` is 4, `refresh-cw` is 4, `loader-circle` is 1. Denser marks either stay
static or stay on the 40 planes.

This constrains the whole vocabulary, not just loading: `boxes` (12 elements) and
`telescope` (7) are only ever proposed at 40, and `waypoints` (7) is proposed at
40 on the link map — see open question 6.

The proposed pairing:

- **`disc-3`** — the 40px planes and the 32px boot screen
- **`loader-circle`** — every 11–13px inline site
- **`refresh-cw`** — Rescan buttons specifically, so the *action* and the *state*
  stop sharing a mark

That last point resolves a tension the code already admits to. `SpinnerIcon` is
an alias of `ArrowPathIcon` so that "loading sites read as loading rather than as
a refresh affordance" (`.claude/DESIGN.md` §4, `icons.tsx:126-131`) — an
acknowledgement that the mark is wrong for the job, worked around by renaming it.
Separate marks fix it properly.

---

### 4.3 `server` for MCP probes

**Ruled 2026-08-24 (Karthik): "use `server` for MCP related probes or scanning."**

Applies to the two *active* MCP sites — `McpServerDetail.tsx:166` (probe pending,
"Asking the server…", @12) and `:275` (verify, @13). Both previously proposed
generic marks (`loader-circle`, `refresh-cw`); `server` names the thing being
talked to.

The MCP *empty* states keep `server-off` / `plug-zap`: those are statements about
absence, and a server that is not there should not be animated as though it were
answering.

**Motion — see §4.8.** The groups pair as `[0,2]` and `[1,3]`
(`[rect-top, rect-bottom, line-top, line-bottom]`). pqoqubbw's translation was
tried first and rejected on evidence; the shipped motion alternates opacity.

**It passes the density rule.** `server` is 4 elements, exactly at the §4.2 limit
— which is why it survives at 12 where `radar` (8) did not.

**Generator note:** this is the first mark needing *two* animated groups moving
independently. Any implementation must support more than one `<g>` per mark; a
single-group abstraction would not have fitted it.

### 4.9 Five marks ruled by name

Taken 2026-08-24 (Karthik). Each motion follows from the geometry rather than
being applied uniformly:

| State | Mark | El. | Motion |
|---|---|---|---|
| `LinkPanel.tsx:257-259` no destinations | `unlink` | 6 | the four **break marks** burst apart from centre; the two hooks hold — a link snapping |
| `RepoPane.tsx:487-505` repo empty | `folder-plus` | 3 | the **plus** draws in two strokes; the folder holds |
| `NeedsReviewPane.tsx:222` clean | `monitor-check` | 4 | the **tick** draws; the monitor holds |
| `LinkMapPane.tsx:282` reading | `frame` | 4 | four **grid lines** redraw in sequence, looped |
| `LinkMapPane.tsx:282` no graph | `git-pull-request-closed` | 6 | stagger-draw, once |

Two of these are better than what they replaced for reasons worth keeping:

- **`frame` echoes the surface being read.** The link map's own ground is a dot
  grid (`LinkMapPane.tsx:352-357`), so a grid redrawing itself is the map being
  read, not a generic spinner over it.
- **`git-pull-request-closed` states the right thing.** A connection that
  terminates rather than resolves is exactly what "no link graph" means —
  where `git-graph` (the previous pick) drew a graph that *does* exist.

**The pattern is now settled across the whole set**: a loop state and its
resting counterpart take **different marks**, not one mark at two speeds.
`disc-3`/`folder-clock` in family 1, `frame`/`git-pull-request-closed` here.
The two-rule system of §1.4 still governs *how* each moves; it no longer implies
they share geometry.

### 4.8 Why `server` uses opacity, not translation

pqoqubbw slide the two racks past each other — `y: [0, 12, 12, 0]`, negated for
the bottom. That was the first implementation here and it was **wrong for a
loop**. Two measurements killed it:

1. **The gap between racks is 4 units** (y=10 to y=14). A travel of 12 sends
   them clean through one another, and at the midpoint the mark **collapses into
   a single bar** — twice per cycle it stops being a server. Fine on hover,
   where the transit is seen once; wrong for a continuous probe.
2. **The largest travel that never overlaps is 1.5 units.** At size 12 that is
   **0.75px**. Rendered beside the rest position at 12 and 13 it is
   indistinguishable — the motion may as well not exist.

An intermediate value was proposed (±3) and does not exist: it overlaps by 2
units. There is no travel that is both visible at 12 and non-overlapping.

**Opacity has no such floor.** `.aim-relay` alternates the racks between full
and 0.25 opacity, 1.2s, with the second rack at `animation-delay: -.6s` so it
runs half a cycle out of phase. It reads as traffic moving between the racks,
and it renders identically at 12 and at 40. All three options were rendered at
12, 13 and 40 before choosing.

**Two general rules came out of this**, and both apply to every mark still to
be picked:

- **A motion authored for hover-once does not automatically survive being
  looped.** pqoqubbw's entire library is hover-triggered. Every motion borrowed
  from it needs checking against the loop rule — `disc-3` was safe because
  rotation is continuous by nature; `server` was not.
- **A translation small enough to be safe is often too small to be seen.**
  Prefer opacity or rotation for continuous states at inline sizes; save
  translation for marks with room to move.

### 4.7 `zap-off`, and a reachability finding

**Ruled 2026-08-24 (Karthik): option A.** `zap-off` goes on **A.1, "No MCP
servers registered"** (`ProfilePane.tsx:129-185`), replacing `server-off`.

It was originally asked for on *"No MCP servers in the global store"*. Two facts
made that impossible, and both are findings about the app rather than about the
prototype:

**1. That line is unreachable.** `ProfilePane.tsx:883` tests
`selectedCategory === "Tools"` *before* the generic per-category branch, and
routes it to A.1/A.2 instead. So an empty Tools category in the global pane says
"No MCP servers registered" or "No AI engines found" — never "No MCP servers in
the global store". `RepoPane` has **no equivalent branch**
(`RepoPane.tsx:524-538`), so the repo phrasing *is* reachable. **The two panes
disagree about whether Tools is a special case.** Not resolved here; it predates
this work.

**2. One mark serves four categories.** That branch renders a single icon for
Skills, Rules, Tools and Subagents — only the noun varies, through
`categoryNoun()`. A mark specific to any one category is wrong there by
construction: `zap-off` would have put a lightning bolt on "No skills in
hanger-ai". Fixing that presumes a `categoryMark()` beside `categoryNoun()`,
which is a real change and was not taken.

A.1 has neither problem: it is Tools-only and single-purpose.

### 4.6 Rescan and reading

**`rotate-ccw` for every Rescan / Refresh** (Karthik, 2026-08-24), replacing the
proposed `refresh-cw`. 2 elements against `refresh-cw`'s 4 — materially cleaner
at 12–13, where these all live.

It needed a new motion. `rotate-ccw`'s arrowhead points **counter-clockwise**;
spun clockwise it reads as an arrow travelling backwards along its own path. So
`.aim-spin-ccw` exists purely so the motion agrees with the geometry. **Generalise
this:** a mark that states a direction constrains the motion that may be applied
to it, and the mismatch is only visible once it moves.

**`file-text` for reading** — `LinkPanel.tsx:254` ("Checking each project…") and
`AssetDetail.tsx:391-392` ("Reading the file…"). 5 elements: a page, a folded
corner, and three text lines. Only the **three lines** animate, pulsing in
sequence via `.aim-scan`; the page holds still, because the document is not
going anywhere — the reading is. Same idea as pqoqubbw's `pathLength: [1, 0, 1]`.

**This refines the density rule of §4.2.** `file-text` is 5 elements, over the
stated limit of 4, yet works — because only 3 of them move. The limit belongs on
**animated** elements, not total: `disc-3` animates 2 of 4, `file-text` 3 of 5,
`radar` would have animated 8 of 8. Static detail costs nothing; moving detail
is what the eye cannot track at 12px.

**Not applied to "Linking…"** (`LinkPanel.tsx:423`), which shares that card.
Linking is a connection, not a read, so it keeps `link-2`. Say if you want both.

**At 12 the pulse is subtle.** Verified frame by frame: legible, but the motion
reads much more clearly at 16+. If it disappears in the real app, that site is a
candidate for `loader-circle` instead.

### 4.5 Stroke weight matches the app

**Ruled 2026-08-24 (Karthik): match the project's stroke weight.**

`strokeFor()` (`icons.tsx:76-81`) is ported verbatim into the generator and
emitted as a presentation attribute per `<svg>`:

| Size | `stroke-width` | Renders |
|---|---|---|
| ≤ 12 | 2.2 | ~1.0–1.1px |
| ≤ 16 | 1.9 | ~1.0–1.3px |
| ≤ 20 | 1.7 | ~1.4px |
| > 20 | 1.5 | 2.0–2.5px |

Lucide marks take `optical = 1`, so `box == size` — `icons.tsx:85-88` states the
shell's spacing "was tuned to" lucide, which is why the Heroicons carry
correction factors and lucide needs none.

**`.aim` no longer sets `stroke-width`.** A CSS declaration would beat the
attribute (presentation attributes sit below author CSS in the cascade) and
flatten every mark to one weight — exactly what the size table exists to prevent.

**What it changes.** Lucide is *drawn for* 2.0. Below 16 the table makes these
marks slightly heavier than native (2.2 vs 2.0), which helps them hold at 11–13.
Above 20 it makes them lighter (1.5 vs 2.0), which is visible at 40 — and
correct, because the planes today carry Heroicons at 1.5 and a 2.0 Lucide mark
would read bolder than everything around it.

**One thing to watch.** The `> 20 → 1.5` band is commented in the source as
"Heroicons' native weight, correct once the box is 24px+" — the table was tuned
when only Heroicons appeared at those sizes. Now that lucide marks land at 36
and 40, that band may deserve a second look. Not changed here: matching the app
is the ruling, and altering the shared stroke table would affect every Heroicon
in the product.

### 4.4 Marks ruled by name

Three picks taken directly by Karthik on 2026-08-24, each for a stated reason.

**`git-graph` for the link map** (not `waypoints`). Three nodes, three edges,
laid out in *columns* — the same arrangement `LinkMapPane` draws. Stagger order
is node, edge, node, edge, so it assembles rather than merely appearing.
6 elements.

**`cursor-click` for "Nothing selected"** — pqoqubbw's name for what Lucide
ships as `mouse-pointer-click`. 5 elements: four spark lines plus the cursor.
The cursor holds still; only the sparks move, scaling out from the tip at
**(9.3, 9.3)** after a 350ms delay so the mark settles before it fires. **Once,
never looped** — a cursor clicking forever is a cursor nobody is holding.

**`folder-clock` for "Not scanned yet"** — 3 elements. Lucide ships the hands as
a single path (`M16 14v2l1 1`), so they sweep together in one 360° pass about
the **clock** centre **(16, 16)**. pqoqubbw splits them into two lines to run
hour and minute at different rates; doing that here would mean hand-authoring
geometry Lucide does not ship, which is the same fork-upstream trap that ruled
Heroicons out in §1.3. One sweep, once, is honest and costs nothing.

**A pattern across all three: the delay and the trigger matter as much as the
mark.** `.aim-once` was changed from `fill-mode: forwards` to `both` for exactly
this — a delayed once-animation must hold its 0% frame *before* it starts, or
`cursor-click`'s sparks sit visible for 350ms and then blink out when the
animation begins.

---

## 5. Contradictions found against the tree

Reported, not fixed — none is in scope for this prototype.

1. **The lucide exception count is stale in two places.** `icons.tsx:11` says
   "Six marks have no Heroicons equivalent"; `.claude/DESIGN.md:234` says
   "exactly four marks on lucide". The code exports **seven**:
   `FolderSymlinkIcon`, `FolderTreeIcon`, `GitMergeIcon`, `PanelLeftIcon`,
   `PanelRightIcon`, `ExpandIcon` (Maximize2), `CollapseIcon` (Minimize2)
   — `icons.tsx:157-166`. Adopting "animated ⇒ Lucide" (§1.3) would make this
   countable by a guard instead of by prose that drifts.

2. **`.claude/DESIGN.md` §4 does not mention `FolderSymlinkIcon`** in the lucide
   list at all, which is how the count reached seven without either doc moving.

3. ~~These prototype SVGs hardcode `stroke-width: 2`.~~ **Resolved 2026-08-24**
   at Karthik's request — see §4.5.

---

## 6. What ports into the app

Not built yet. This is the shape, for the implementation brief.

1. **`src/styles/index.css`** — the six keyframes and the `.aim-*` classes as
   `@utility` rules, beside `animate-drop` / `-rise` / `-tip`. The existing
   `prefers-reduced-motion` block at `:208-215` already covers them; confirm
   with a planted test rather than assuming.
2. **`src/components/icons.tsx`** — one wrapper beside `sized()`:

   ```tsx
   // today
   export const ArrowPathIcon = sized(HeroArrowPath);
   // proposed — third argument is the motion class
   export const ScanDiscIcon = animated(LucideDisc3, 1, "aim-spin");
   ```

   Call sites keep reading `<Icon size={40} />` plus one boolean for
   loop-vs-rest. Marks still pass through the size/stroke/optical table.
3. **Guard** — `animated ⇒ lucide` is checkable. The existing
   `no-off-token-styles.test.ts` is the pattern to follow, and per
   `.claude/rules/verification.md` a guard is unverified until a planted
   violation is shown to fail it.

---

## 7. Open questions

Not decided; they need the prototype in front of you.

1. **Do the idle variants read as intended?** "Not scanned yet" holds the same
   mark still. It may read as a rendering bug rather than a statement.
2. **Is `folder-sync` vs `disc-3` for repo-vs-global scope worth the second
   mark**, or should one mark cover both?
3. **Should the six icon-less sites get icons at all?** Four of them are
   single-line centred `<p>` elements today; adding a 40px mark changes their
   vertical rhythm, not just their decoration.
4. **`mouse-pointer-click` for "Nothing selected"** — it describes the *remedy*
   rather than the *state*. `GlobeAlt` today describes neither. There may be a
   better third answer.
5. **Does family 6 still belong?** Once families 1–5 carry a stagger-and-draw
   vocabulary, the pulsing dot in `ScanStatusIndicator` may look like a leftover.
6. ~~Does `waypoints` survive its own rule?~~ **Resolved 2026-08-24** — replaced
   by `git-graph` (§4.4), which is 6 elements and columnar. `waypoints` no
   longer appears as a pick.
7. **Does the 12/13 split survive?** Keeping it means fixing `RepoPane.tsx:407`
   (a button at 12); collapsing it means one inline size and no rule to break.
