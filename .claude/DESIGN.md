# Hanger — design reference, derived from code

Every statement here cites the source that makes it true. Nothing in this file
was taken from a specification, a prototype, or an earlier design document.
Where the code and an older document disagree, the code is what is recorded.

Derived 2026-08-14 against commit `b383a08` on `redesign/mono-tight`.

**Citation convention.** Most facts cite `file:line`. Six files were being
edited by a concurrent session in the same checkout while this was written, so
facts drawn from them are cited **by content at `b383a08`** rather than by line
— a line number in a file under active edit is wrong within the hour. Those
files are `src-tauri/src/mcp/dialect.rs`, `src-tauri/src/domain.rs`,
`src-tauri/src/scanner.rs`, `src/components/Flyout.tsx`,
`src/utils/mcpServerView.ts`, `src/components/McpServerDetail.tsx`. Each such
citation is marked `@b383a08`.

---

## 1. Colour and theming

### The palette is ink and paper

Every neutral is a value step, never a hue (`src/styles/tokens.css:2-4`). The
light palette declares eleven neutral roles (`tokens.css:5-16`):

| Token | Light | Dark | Role |
|---|---|---|---|
| `--page` | `#ffffff` | `#000000` | window ground |
| `--plane` | `#f7f7f7` | `#0e0e0e` | list and card surface |
| `--plane-2` | `#efefef` | `#171717` | hover / press step |
| `--tint` | `#e8e8e8` | `#232323` | tonal container for selection |
| `--tint-plane` | `#e0e0e0` | `#262626` | tonal container on the plane (`tokens.css:9`); `--tint` disappears there |
| `--tint-ink` | `#000000` | `#ffffff` | text on `--tint` |
| `--line` | `rgba(0,0,0,.09)` | `rgba(255,255,255,.12)` | hairline |
| `--line-2` | `rgba(0,0,0,.20)` | `rgba(255,255,255,.22)` | stronger border |
| `--ink-1` | `#000000` | `#ffffff` | primary text |
| `--ink-2` | `#4d4d4d` | `#b0b0b0` | secondary text |
| `--ink-3` | `#636363` | `#8c8c8c` | muted text |
| `--fill` / `--on-fill` | `#000000` / `#ffffff` | `#ffffff` / `#000000` | the single strong action |

Light values are at `tokens.css:5-16`; dark at `tokens.css:122-133`.

`--ink-2` and `--ink-3` are solid hex rather than alpha, and the comments state
why: they are the prototype's 66% and 44% inks quantised, with `--ink-3`
deliberately darkened to clear 4.5:1 on `--tint-plane`, the darkest tonal
surface it sits on (`tokens.css:15-16`).

### Saturated colour appears in exactly three places

System state, the brand mark, and the meter's aqua gel. `--brand` —
`#00c3bf` light, `#2fd8d4` dark (`tokens.css:19`, dark block) — paints the
hanger mark in the rail and nothing else; the token's own comment forbids it
as a UI state. `--gel-aqua` (`tokens.css:38`, `:179`) is a brand-family
gradient painted by `GelMeter` and by the legend dots beside it that mirror
its segments, and marks only a share that is actually true: the linked
share in the asset strip's meter, and — since the strip's MCP mode
(`SummaryStrip.tsx:104-154`) — the answered share too (`:110` sets the
meter segment `aqua`, `:124-126` the matching legend dot), never an
all-quiet or empty state (Karthik's ruling, 2026-08-15, extended to the MCP
mode by `a066c9e`). State colour (`tokens.css:21-24`):

- `--state-success` `#0f7a52` light / `#4ec08c` dark (`tokens.css:22`, `:171`)
- `--state-warning` `#8a5a00` light / `#d9a441` dark (`tokens.css:23`, `:172`)
- `--state-danger` `#b3261e` light / `#e8635b` dark (`tokens.css:24`, `:173`)

One overlay token: `--scrim`, `rgba(0,0,0,.55)` light, `rgba(0,0,0,.8)` dark
(`tokens.css:42`, `:182`).

### Theming mechanism

Dark is a class on the document element, not a media query
(`src/App.tsx:645`):

```
document.documentElement.classList.toggle("dark", darkMode);
```

`.dark` redefines only the tokens that change (`tokens.css:121-186`); every
component consumes semantic names and therefore inverts for free.

Appearance is a three-way preference — pin light, pin dark, or follow the OS —
with Auto the default so a fresh install matches the desktop
(`App.tsx:200-203`):

```
const [themePref, setThemePref] = useState<ThemePref>("auto");
const [systemDark, setSystemDark] = useState<boolean>(prefersDark);
const darkMode = themePref === "auto" ? systemDark : themePref === "dark";
```

`prefersDark()` guards both `window` and `matchMedia` before calling, so a
non-browser environment cannot crash startup (`App.tsx:187-190`). The OS
preference is subscribed live (`App.tsx:411`), the choice persists under the
`theme` key (`App.tsx:239`), and a stored legacy boolean `dark_mode` is
superseded by it (`App.tsx:494-499`).

Because the theme can be pinned against the OS, any component needing the
resolved appearance takes it as a prop rather than re-reading a media query —
`IconRail` documents exactly this (`src/components/IconRail.tsx:8-10`).

### Tailwind binding

Tokens reach utilities through a Tailwind v4 `@theme` block
(`src/styles/index.css:4-113`), which maps each CSS variable into a utility
namespace — `--color-page`, `--color-plane`, `--color-state-danger` and so on
(`index.css:6-17`). Utilities are therefore semantic: `bg-plane`,
`text-ink-3`, `border-line`, `text-state-warning`.

---

## 2. Typography

One system stack, five sizes, two weights.

```
--font-sans: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;   tokens.css:27
--font-flex: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;   tokens.css:28
--font-mono: ui-monospace, "SF Mono", Menlo, monospace;                  tokens.css:29
```

The scale is closed at five steps — 11 / 12 / 13 / 16 / 32
(`tokens.css:30-34`, registered as `text-micro`, `text-small`, `text-base-app`,
`text-lg-app`, `text-display` at `index.css:82-87`). Two weights only:
`--fw-regular: 400`, `--fw-medium: 500` (`tokens.css:67-68`).

Body text is set in `--font-sans` at the document root with
`-webkit-font-smoothing: antialiased` (`index.css:376`).

A `tabular` utility exists for figures that must not jitter as they change
(`index.css:126-128`) and is applied wherever counts render.

---

## 3. Spacing, geometry, motion

### Spacing is deliberately not themed

The `@theme` block registers no spacing scale, and the comment explains that
this is a correction rather than an omission (`index.css:96-103`): registering
names under `--spacing-<n>` silently redefines every numeric Tailwind utility
from 5 upward, which once rendered 28px chips at 48px. So numeric utilities
mean exactly N × 4px, and any off-grid value is stated at its call site as an
arbitrary value — `h-[30px]`, `px-[18px]`.

This is enforced, not merely documented: `src/__tests__/spacing-scale.test.ts:22-29`
fails if any `--spacing-<n>` is declared, and `:31-36` pins the base step to
`0.25rem` if one is set at all.

Two spacing constants are declared as tokens: `--gutter: 18px` and
`--step: 8px` (`tokens.css:76-77`). The 18px gutter is what appears throughout
the panes as `px-[18px]` / `mx-[18px]`.

### Radius

Four radii: `--radius-plane: 16px` for planes (`tokens.css:65`),
`--radius-inner: 12px` for inner surfaces (`:66`), `--radius-pill: 9999px`
for controls (`:68`), and `--radius-control: 6px` (`:139`) — no longer
legacy. Karthik ruled 2026-08-23 that buttons take two radii chosen by
size, not by role: a normal button (30px) stays `rounded-pill`, unchanged;
a mini button (26px) takes `rounded-control`, so the mini tier reads as
its own control rather than a shrunken pill. All four are registered as
utilities in the same `@theme` block (`index.css:113-117`). The mini tier
is `src/components/miniButton.ts`'s three exported class strings, each
`rounded-control` on the shared 26px `base` (`:12-13`): `miniBtnClass`
(`:16`), `miniBtnFillClass` (`:19`), `miniBtnTonalClass` (`:22`) — plus
`miniSetClass` (`:25`) for a row of them. The first caller is
`LinkMapPlacecard.tsx`'s engine-root and project actions, `Show its
assets` (`:399`) and `Open project` (`:407`): each a `miniBtnClass` button
inside a `miniSetClass` row (`:398`, `:406`) — there is no bespoke
`actionBtnClass`.

Controls are pills — with one squared exception. `--radius-soft` (10px,
`tokens.css:67`) rounds the icon rail's 32×32 buttons (`IconRail.tsx:19`),
per the prototype's `--r-soft`. Every other button class uses `rounded-pill` —
the toolbar buttons, the filter chips (`CategoryFilterCards.tsx:17`).

### Flat cards on the page

Card surfaces on content panes — the summary strip, list/table containers,
empty-state placeholders, the link map canvas — carry no fill: the `--line`
border and radius draw the edge alone (Karthik's ruling, 2026-08-15; e.g.
`SummaryStrip.tsx`, `ProfilePane.tsx`, `NeedsReviewPane.tsx`,
`DiscoveryPane.tsx`, `LinkMapPane.tsx`). Sticky table headers are `bg-page`
so rows scrolling beneath stay hidden. `--plane` remains the fill of the
shell's left column (rail + source list), of control chrome (the filter
field), and of inline code and pathline chips — those are not page cards.

One exception to flatness (Karthik's ruling, 2026-08-15): surfaces that
appear **on request above the map canvas** — the detail card, the layers
panel — carry `--overlay-shadow` (`tokens.css`, Overlay block; registered
as the `shadow-overlay` utility, the only shadow the off-token guard
permits). The value is Apple's floating-surface recipe: a tight contact
shadow under a large soft ambient, ~3× heavier in dark where shadow is the
only depth cue. In-canvas SVG content and every static card stay flat.

**A second, smaller elevation exists for the segmented track's capsule.**
`--capsule` and `--capsule-shadow` sit beside `--overlay-shadow` in the same
Overlay block of `tokens.css` (`:51-56` light, `:187-190` dark; Karthik,
2026-08-22) — "no border, a tight contact elevation — a second, smaller one
beside the map's" (`:51-53`). The capsule's surface is its own token because
dark cannot cast a shadow that reads on black: light keeps the segmented
track's plane and lifts the capsule to `--page` under a light contact shadow
(`--capsule: var(--page)`, `:55`); dark instead lightens the capsule to
`--tint` and drops to a plain `0 1px 2px` shadow, the way iOS's selected-
segment capsule does (`:187-190`). Surface and elevation are bundled into
one `@utility capsule-raised` (`index.css:151-156`) rather than applied as
two classes, because the off-token guard permits only the `shadow-overlay`
utility in a `.tsx` file (§7) — a caller reaches for `capsule-raised` and
never spells `shadow` at all. `--color-capsule` separately registers
`bg-capsule` for the bare surface (`index.css:38-41`), but nothing in `src/`
uses it: `capsule-raised` already carries the surface, so no `.tsx` line has
reason to. `SegmentedTrack`'s selected pill is the only caller (§5).

**The capsule's colour pair sits outside the contrast guard's reach, by
construction, not by oversight.** `tokens_contrast.test.ts` finds every pair
it checks by scanning `.tsx` files for a `bg-*` class name
(`:99-114` walks `src/` for them, `:119` the pattern); no `.tsx` line in `src/`
spells `bg-capsule`, because `capsule-raised` already carries the surface
(above), so the guard never sees this pair and structurally cannot while the
capsule stays a bundled utility. Measured by hand against the same WCAG
formula the guard runs: `--ink-1` on `--capsule` is 21:1 in light (black on
white, `tokens.css:14`, `:5`/`:55`) and ~15.7:1 in dark (white on `#232323`,
`:164`, `:159`/`:189`) — comfortably above 4.5:1 today, but that margin is
asserted here, not enforced anywhere.

### Motion — one spring, three beats

```
--spring: cubic-bezier(0.2, 0.85, 0.25, 1);   tokens.css:46
--dur-hover: 160ms;                            tokens.css:47
--dur-nav:   180ms;                            tokens.css:48
--dur-press: 200ms;                            tokens.css:49
```

Tailwind v4 durations are not themeable, so the three beats are declared as
first-class utilities instead — `duration-hover`, `duration-nav`,
`duration-press` (`index.css:144-146`) — alongside `ease-spring`
(`index.css:124`).

Three entrance animations exist, each with a stated physical rationale:
`animate-drop` for a sheet falling from the title bar, `animate-rise` for a
toast from the foot (`index.css:130-139`, keyframes `:141-150`, `:169-178`),
and `animate-tip` for tooltips, which scales from `0.97` rather than `0` because
"nothing in the world appears from nothing" (`index.css:152-167`).

All motion is removed under `prefers-reduced-motion: reduce`, transitions and
animations both, with `!important` (`index.css:397-398`).

**Icon motion.** A second vocabulary, `aim-*`, drives the animated marks in
`icons.tsx` (§4) and lives entirely in `index.css:262-363`: `aim-part` sets
the rotation origin a moving `<g>` reads (`--ox`/`--oy`, defaulting to the
24-grid centre, `:262-265`); `aim-spin`, `aim-spin-ccw`, `aim-draw`,
`aim-scan`, `aim-seek`, `aim-burst` and `aim-relay` are the seven motions
(`:266-317`), each its own `animation-name` and its own `@keyframes` block
(`:333-363`) rather than the shorthand, so the two composing rules below can
still set iteration count and fill mode on top; `aim-stagger` stitches a
per-element `--i` into a cascading delay, sitting directly on the animating
element since `animation-name` is not inherited (`:323-325`). Two rules carry
the meaning (ruling 4, `docs/v5-animate-icons/00-state-inventory.md` §1):
`aim-loop` plays while the work it names is running, infinite (`:326-328`);
`aim-once` plays on mount and holds, both ends (`:329-332`) — a finding stated
once, not a state sustained. `src/__tests__/icon_motion_vocabulary.test.ts` pins the
utilities and the two rules; `src/__tests__/animated_icons_family.test.ts`
pins that every `animation-name` these utilities declare has a matching
`@keyframes` block, and that `lucide-react` and the `aim-*` classes stay out
of every other file (§4's family rule).

### Focus

One global focus ring: a 2px `--ink-1` outline at 2px offset with a 4px radius
(`index.css:195-199`). `touch-action: manipulation` is set on buttons and
`[role="button"]` to drop the 300ms double-tap delay without disabling pinch
zoom (`index.css:201-206`).

---

## 4. Icon system

Icons are not used raw. Every export in `src/components/icons.tsx` is wrapped
in `sized()` (`icons.tsx:119`), which does two things a plain import cannot.

**Stroke compensation.** Heroicons' outline set is drawn on a 24px grid at 1.5
stroke; at this shell's working sizes of 10–17px that thins to ~0.7px and goes
soft. `strokeFor()` scales the stroke back up per size band so it lands near
1px on screen (`icons.tsx:98-103`): ≤12px → 2.2, ≤16px → 1.9, ≤20px → 1.7,
above → 1.5.

**Optical correction.** A per-mark `optical` ratio corrects for how much of the
24 grid each mark actually inks, because a 1:1 family swap inherits the
difference — most visibly in the icon rail, where four marks stack at one size
and any mismatch reads as a wobble (`icons.tsx:107-118`). The factors are stated
as measured ink-extent ratios, not estimates, and anything within 4% is left at
1. Examples: `ChevronDownIcon` 0.81 (`icons.tsx:143`), `Square2StackIcon` 1.2
(`:174`), `Cog6ToothIcon` 1.12 (`:149`).

The family is Heroicons 24/outline (`icons.tsx:30-79`), with seven static
marks on lucide because Heroicons has no equivalent: `FolderSymlink`,
`FolderTree`, `GitMerge`, `PanelLeft`, `PanelRight`, `Maximize2`, `Minimize2`
(`icons.tsx:81-89`, exported `:185-194`). Default size is 16 (`icons.tsx:95`).

Twenty more marks are animated, and every one of them is lucide too — not
because Heroicons lacks their geometry, but because it has no motion story,
and Ruling 3 (`docs/v5-animate-icons/00-state-inventory.md` §1) settled the
family question for all of them at once rather than per mark: looping marks
(`Disc3Icon`, `FolderSyncIcon`, `LoaderCircleIcon`, `RotateCcwIcon`,
`ServerRelayIcon`, `FrameIcon`, `FileTextIcon`, `Link2Icon`,
`icons.tsx:417-512`) spin or redraw only while `active`; entering marks
(`FolderClockIcon`, `PackageOpenIcon`, `FolderXIcon`, `SearchIcon`,
`InboxIcon`, `PlugZapIcon`, `ZapOffIcon`, `UnlinkIcon`, `CursorClickIcon`,
`MonitorCheckIcon`, `FolderPlusIcon`, `GitPullRequestClosedIcon`,
`icons.tsx:518-724`) play once on mount and hold. Geometry is Lucide (ISC),
hand-transcribed rather than imported, because per-element motion needs a
`<g>` around the moving subset and lucide-react's components render flat
(`icons.tsx:287-292`); `animated_icons.test.tsx` pins every transcription
against the installed package. `src/__tests__/animated_icons_family.test.ts`
makes the rule checkable going forward — `lucide-react` imported nowhere but
`icons.tsx`, and no `aim-*` class applied outside it or `index.css` — which is
what replaced picking a family mark by mark and produced `SpinnerIcon`, below.

Heroicons has no dedicated spinner, so the earliest loading sites reused
`ArrowPathIcon` under `animate-spin`, aliased as `SpinnerIcon` so they at
least read as loading rather than as a refresh affordance — a mark literally
borrowed for a job its geometry didn't fit. The alias has been retired:
`Disc3Icon`, `FolderSyncIcon` and `LoaderCircleIcon` are marks drawn to loop,
not a refresh glyph pressed into service, and every site that held
`SpinnerIcon` now holds one of them (§5, Panes).

The brand mark is separate: `HangerMark` renders the app icon's own SVG layers,
choosing the variant by the resolved appearance rather than by the source
file's name — mapping the names literally would paint the white glyph onto
`--page` and lose the mark (`src/components/HangerMark.tsx:1-11`, props
`:24-33`).

**Brand marks.** Engines and MCP hosts are drawn with the vendor's own mark
(`src/components/BrandIcon.tsx`), colour where the brand has colour, the
vendor's `currentColor` form where it is monochrome — `ink: true` for
Cursor, Windsurf, Zed, Copilot, OpenCode (the `BrandId` union,
`src/data/brands.ts:30-48`; the `source` field's doc comment at `:59`). Eleven marks — nine from
`@lobehub/icons-static-svg`, VS Code and Zed vendored in `src/assets/brand/`
(`brands.ts:26-27`, alongside the generic fallback at `:28`) — plus one in-house generic `>_` fallback are joined into
a sprite at module load (`BrandSprite.tsx:6-14`), mounted once in
`main.tsx:19` (import `:7`), and referenced everywhere by `<use
href="#brand-…">` (`BrandIcon.tsx:52-53`), so a mark's geometry exists once
in the document however many rows show it. `src/data/brands.ts` resolves
every identifier the UI holds — engine keys, host ids, scope agent ids,
display names — through one alias table (`brands.ts:80-100`, `resolveBrand`
`:103-108`). `src/__tests__/brand-coverage.test.ts` parses the Rust
registries the backend draws engine and host ids from — `registry.rs`
HOSTS, `scanner.rs` AGENT_CONFIGS and `get_engine_key` — and fails when one
resolves to no mark (`brand-coverage.test.ts:72-79`), with a floor per
extraction source so a reformat of those Rust arrays cannot make the guard
silently under-collect (`:60-69`). An unmapped id draws the generic mark
(`BrandIcon.tsx:36`) and is reported once per session
(`engine_icon_unmapped`, via `reportUnmappedEngine`,
`src/utils/reportUnmappedEngine.ts:15-22`).

One brand ships a second mark for the dark page: Codex's colour file paints
a white plate that glares on `--page` dark, so `BrandMark` carries an
optional `darkSvg` — "absent means the one mark serves both themes"
(`brands.ts:38-41`) — and only `codex` sets it, to the vendor's own
monochrome `codex.svg` (`brands.ts:12`, wired at `:67`). The sprite then emits a second
symbol, `#brand-codex-dark` (`BrandSprite.tsx:5`, emitted at `:10`), and `BrandIcon`
renders two `<use>` elements whenever a brand has one (`BrandIcon.tsx:37`,
`:52-53`). The swap is CSS, not state, so it rides the `.dark` toggle with
no re-render and no flash (`BrandIcon.tsx:49-51`): three rules —
`.brand-dark-only { display: none }`, `.dark .brand-light-only { display:
none }`, `.dark .brand-dark-only { display: inline }`
(`src/styles/index.css:132-134`) — because this project's dark mode is a
`.dark` class on `<html>` (§1, Theming mechanism) and declares no
`@custom-variant dark` (the absence is recorded at `index.css:127-131`), under which a Tailwind
`dark:` utility would silently do nothing.

Reach tiles hold the same mark at 12px in a 16px slot
(`EngineReachTiles.tsx`). A reached engine is the mark alone — no ring, no
fill, no dimming, because a vendor logo carries itself and a ring around it
only competes; an unreached one is an empty slot, a `border-line` ring plus
`opacity-40`, so absence reads as absence rather than a fainter presence
(`EngineReachTiles.tsx:46-57` states the reasoning, `:77-81` the
conditional, `:83` the 12px mark). `--line` (`.09` light / `.12` dark,
`tokens.css:12`, `:149`) rather than `--line-2` (`.20`/`.22`, `tokens.css:13`,
`:150`) is the design system's subtle-outline weight for this slot.

The column draws at most four marks, and above four it draws three plus one
ellipsis chip (`EngineReachTiles.tsx:37-38`), ordered reached-first
(`:64`). The cell is `w-[100px]` and clips nothing (`AssetRow.tsx:183`), so
the count is arithmetic, not taste: a slot is 16px on a `gap-1`, making N
marks `20N − 4`. Four measure 76px; three plus the chip measure 84px; seven
measured 133px in the running window and painted 21px over the Beyond the
store column, hiding the project count there. The chip sits behind a
`border-line` ring — the unreached slot's ring, not dimmed, because it signals
"more" rather than absence — and has no click handler: the row's own click
already opens the inspector, which answers for every engine
(`AssetDetail.tsx`, the `reach-detail` section). Its three dots are drawn as
`w-0.5` spans (`EngineReachTiles.tsx:108-114`), not the `…` character: that
glyph sits on the baseline and renders low in a 16px slot however its line box
is centred, and correcting it would mean an offset tuned to one font's
metrics.
The inspector's Reach card groups by verdict rather than listing sentences.
`REACH_GROUPS` (`AssetDetail.tsx:108-112`) is the reading order — "Reaches it",
then "Root not linked", then "Another engine's format" — and a group with no
members is dropped (`:154-157`), so the card never heads an empty list.
`annotations.rs` emits only those two reasons, so three groups is the ceiling.

The point of grouping is that a reason is stated once, on its heading, leaving
the rows to carry identity and a root. "Another engine's format" names a cause
rather than a failure: that reason fires when the asset belongs to a different
engine, so nothing is missing. The store is named once in the cap
(`:284`) and is safe by construction — `via_store` is keyed off the asset's
own root, so every reached engine reports the same value. Roots are folded to
`~` by `abbreviateHome` (`prose.ts`), because an absolute home is 29
characters against roughly 24 the column holds at 11px mono. An engine that
reaches the store with no link reads "in place"; a miss carries a dash, since
its heading has already said why. Labels signed off 2026-08-17.

A reached engine can sit behind the chip when more than three reach one asset;
`docs/findings.md` F50 records that and F49 the two marks that do not read as
logos at this size.

Design record (local-only, not tracked in this repo):
`docs/superpowers/specs/2026-08-15-brand-icons-design.md`.

---

## 5. Component inventory

46 non-test `.tsx` files, flat in `src/components/` — no subdirectory — one
component per file. Views are suffixed `Pane`.

The "all default-exported, with an `interface <Name>Props` declared directly
above" rule holds for most and has named exceptions, listed here so the rule
is not read as universal: `icons.tsx` is a mark library of 82 named exports
rather than a component, and `ScanStatusIndicator.tsx` exports a named
`React.FC` instead of a default. Five more carry no `interface <Name>Props`
— `BrandSprite`, `EngineReachTiles`, `MarkdownDoc`, `McpEngineSummary`,
`McpServerDetail` — taking their props inline or from a shared type.

### Shell

**`IconRail`** (`IconRail.tsx:5-17`) — `active: "machine" | "linkmap" |
"discovery" | "review" | "design"`, `needsReviewCount: number`,
`onSelectMachine`, `onSelectLinkMap`, `onSelectDiscovery`, `onSelectReview`,
`onSelectDesign?`, `onOpenSettings`. Fixed 56px column (`w-14`). Buttons are
32×32 `rounded-soft`, tonal `bg-tint-plane` when current (`IconRail.tsx:21-24`).
The hanger mark at the top is the home button — it fires `onSelectMachine`,
same as the machine button (ruled 2026-08-15). `onSelectDesign` is optional
because the entry it renders — the Design system page, below the spacer
beside Settings — exists in dev builds only; the shell passes it under
`import.meta.env.DEV` (ruled 2026-08-16, see §9).

**`SourceListShell`** (`SourceListShell.tsx:4-11`) — `testId`, `width`,
`setWidth`, `collapsed`, `setCollapsed`, `children`. Owns the second column's
width, drag handle, and Finder-style snap-shut below 160px
(`SourceListShell.tsx:12-21`). Width is clamped 200–320px
(`SourceListShell.tsx:51`, `:63`). One shell so two different lists cannot
drift apart on sizing (`:18-21`).

**`Sidebar`** (`Sidebar.tsx:11-25`) — `width`, `setWidth`, `collapsed`,
`setCollapsed`, `selectedItem`, `setSelectedItem`, `inventory`, `assetCounts`,
`detectedEngines`, `linkedRepos`, `loadLinkedRepos`, `onRefreshGlobalCounts?`,
`setError`.

**`ReviewSidebar`** (`ReviewSidebar.tsx:4`) — the review view's second column.

**`DiscoverySidebar`** (`DiscoverySidebar.tsx`) — Discovery's second column:
one row per catalogue kind from `kindCounts`, under a "Categories" eyebrow.
The pane is a controlled consumer of `kind` (ruled 2026-08-15, reversing the
earlier no-second-column decision).

**`DesignSystemSidebar`** (`DesignSystemSidebar.tsx`) — the Design system
page's table of contents: one row per `DESIGN_SECTIONS` entry
(`src/data/designSystemFixtures.ts`); choosing a row scrolls the one page
rather than swapping views.

### Panes

**`ProfilePane`** (`ProfilePane.tsx:18-55`) — `inventory`, `assetCounts?`,
`selectedCategory?`, `selectedAsset?`, `loading`, `filterText?`, `stateFilter?`,
`onStateFilterChange?`, `scannedAt?`, `detectedEngines?`, `onRescan?`,
`sortField?`, `sortDirection?`, `onSortChange?`, `onSelectAsset`,
`onLinkAsset`, `onClearSelection?`.

**`RepoPane`** (`RepoPane.tsx:18-42`) — the same shape plus `repoPath`,
`onRefresh`, `onLinkFromProfile`, `linkedRepos?`, `onPromoteCandidates?`.

**`NeedsReviewPane`** (`NeedsReviewPane.tsx:11-29`) — `issues`, `counts`,
`kind`, `place`, `filterText`, `selectedId`, `onSelectKind`, `onSelectPlace`,
`onSelectIssue`, `onRescan?`, `scanning?`, `scannedAt?`.

**Empty is a finding, pending is not.** All three panes gate their negative
copy on `scannedAt !== null` — App's `lastScanAt`, set only on
`scan://complete` — so an empty store before the first scan finishes renders
a pending plane instead: `Disc3Icon` at 40, spinning while `loading`
(`FolderSyncIcon` in `RepoPane`, the repo-scoped looping mark for the same
state — `icons.tsx:429-443`), or `FolderClockIcon` at 40 — the entering() mark
whose clock hands sweep once and hold — once no scan is running
(`icons.tsx:518-531`). Headline "Scanning your machine" with a subline that
names the place and is literal about timing ("Assets in the global store show
up here once the scan finishes." / "Assets in ‹repo› show up here once the
scan finishes." — App sets inventory on `scan://complete` and ignores
`scan://progress`, so nothing lands root by root), or "Not scanned yet /
Rescan when you're ready." when no scan is running; all under
`data-testid="scan-pending"` (`ProfilePane.tsx:893-914`, `:965-971`;
`RepoPane.tsx:492-514`, `:544-550`; `NeedsReviewPane.tsx:220-244`, where it is
the list plane's centred `<span>`: "Scanning your machine. Anything that
needs a decision shows up here once the scan finishes."). Only `empty &&
hasScanned` shows an empty state.

The empty copy itself, reviewed 2026-08-16 (Karthik: "review with
/humanizer") — plain copulas, the app's own nouns, no machine-speak:

- Global, engine folders present but nothing in them: "Nothing in the global
  store yet" / "‹Claude Code and Codex› are here, but their global folders
  hold no skills, rules, MCP servers or subagents yet." — the names come from
  `detectedEngines` (the `get_detected_engines` filesystem probe), joined by
  `joinNames`
  (`src/utils/prose.ts`), singular when there is one. Not
  `assetCounts.engines`, which is built from asset rows and is empty whenever
  the store is (`scanner.rs:34-46,76`) (`ProfilePane.tsx:150-157`, `:419-430`).
- Global, no engine folders: "No engine folders on this machine yet" /
  "Hanger looks in your home directory for the folders Claude Code, Codex and
  Gemini keep there, and found none. Run one of them once, then rescan."
  (`ProfilePane.tsx:431-441`). "Engine" throughout — the Engine column, the
  Engines eyebrow and the strip subtitle already say it; the sidebar's
  no-engines subtitle is "No engines yet" (`Sidebar.tsx`).
- Repository: "Nothing in ‹repo› yet" / "Hanger found no skills, rules, MCP
  servers or subagents in this repository. Link one from the global store, or
  add files here and rescan.", CTA "Link an asset from Global" — Global, not
  Profile, per the naming ruling (`RepoPane.tsx:457-475`).
- Category-empty, both panes: a filter that hides every row is told apart
  from a category with nothing in it — "No skill matches that filter" versus
  "No skills in the global store" / "No MCP servers in ‹repo›" with "Nothing
  under this category yet. Pick another, or All." The noun comes from
  `categoryNoun` (`prose.ts`) so an empty Tools view says "MCP servers", as
  the chip does (`ProfilePane.tsx:444-464`, `RepoPane.tsx:476-495`).
- Needs review: "Nothing needs a decision. Every link resolves and every file
  parses." and "No issue matches that filter." — unchanged, already plain.
- Both inspectors, nothing selected: "Nothing selected" / "Pick an issue to
  see where it lives and what else it affects." (`ReviewInspector.tsx`) and
  "Pick an asset or a repository to see its details." (`Flyout.tsx`).

Pinned by `ProfilePaneIntegration.test.tsx`, `RepoPaneIntegration.test.tsx`,
`needs_review_pane.test.tsx`, `inspector_avionics.test.tsx`, `prose.test.ts`.

**`DiscoveryPane`** (`DiscoveryPane.tsx`) — `filterText?`, `kind?`. Renders
from static data in `src/data/directories.ts`; the kind facet is owned by
`DiscoverySidebar`.

**`DesignSystemPane`** (`DesignSystemPane.tsx`) — `section` only. The page
described in §9.

**`LinkMapPane`** (`LinkMapPane.tsx`, props at `interface LinkMapPaneProps`)
— `graph`, `loading`, `showProjects`, `onToggleProjects`, `onOpenProject`.
Selection is the pane's own state, not a prop. The map: SVG columns at a
fixed logical width of 880, viewed through an Apple-Maps camera — drag
pans, pinch and ⌘/ctrl-wheel zoom at the cursor, two-finger scroll pans,
`+`/`−`/Fit controls in the corner. Camera arithmetic is a pure module
(`src/utils/linkMapCamera.ts`): anchored zoom keeps the world point under
the cursor stationary; clamping allows half-a-window of overscroll; scale
is bounded `MIN_SCALE`–`MAX_SCALE`. Stroke carries mechanism (solid
symlink, dashed tracked copy), colour carries state (`text-ink-2`,
`text-state-warning`, `text-state-danger`). The legend maps the same
exhaustive enum lists the renderer matches on (`linkMapLayout.ts`,
`EDGE_MECHANISMS`/`EDGE_STATES`), so it cannot describe a style that is
never drawn. Projects are a layer, toggled inside a Maps-style layers
control in the canvas's top-right corner (default off, persisted as
`linkmap_show_projects`); hiding them takes their edges and re-spreads the
columns (`layoutLinkGraph` `kinds` option). Node text truncates in the
middle toward the tail (`middleTruncate`) so paths stay inside their boxes;
the detail card carries the full path. Clicking a box or an edge label
docks `LinkMapPlacecard` (below).

**The map states its own diagnostics in one place.** Directly under the
layers control sits an alert control that appears only when the map has
something to say — a warning triangle in `text-state-warning` when a
recorded link could not be drawn, an info circle otherwise. It opens the
same docked placecard, with the notices as its body.

Unread notices carry a **macOS-style dot** at the control's corner:
`w-2 h-2 rounded-pill bg-state-danger ring-2 ring-page`, the icon rail's
count-badge anatomy (`IconRail.tsx:105`) one size down and without a
numeral — how many notices there are is not the point, that you have not
read them is. It is red in both variants, badge convention over severity
semantics, so `--state-danger` here means unread rather than dangerous. The
control's `aria-label` gains ", unread" so the dot is not colour-only.
"Read" is the exact notice set — ids plus warning strings — recorded as a
signature and persisted by App under `linkmap_notices_seen`, mirroring
`linkmap_show_projects`. So opening the placecard clears the dot for good,
revisiting the view does not raise it, and a rescan that turns up a warning
nobody has read does. The map view carries **no
`DisclosureBanner` strip**: it is the one view whose whole content is a
canvas, and a permanently expanded notice above it costs the height the
canvas exists for. Both the control and the card body render from a single
`MapNotice[]` built where the graph is read, so no copy is stated twice.
This is a stated exception to the rule (`.claude/rules/known-debt.md`) that
non-blocking diagnostics use `DisclosureBanner`, not a new banner component. Geometry is
a pure function: stable sort on (label, id)
within columns, bézier paths from endpoint coordinates only. The graph
itself — nodes, counts, edge states, even which empty state the view is in
— arrives computed from the backend `link_graph` command
(`src-tauri/src/linkmap.rs`); the pane derives nothing.

**Hover focus.** Hovering a node sets `hoveredId` (`LinkMapPane.tsx:202`);
the focus set is that node, its edges, and their other endpoints —
`focusedEdge` / `focusedNode` (`:390-394`), set and cleared by each node
group's `onMouseEnter` / `onMouseLeave` (`:497-498`). Everything outside
the focus set dims to `opacity-35` under `duration-hover` (`dimClass`,
`:395-396`), applied to every edge group (`:456`) and every node group
(`:499`).

**The state dot.** A node that is the destination of a drifted or
dangling edge carries an 8px dot (`r={4}`), inset 10px from its top-right
corner and ringed in `--page` (`stroke-page`; `data-testid="map-state-dot"`,
`:549-565`). `worstStateInto` (`:400-405`) reads only edges into that
node and checks dangling before drifted, so the worse of the two wins
when a node has both; the store is every edge's source and never carries
the dot.

**The layers panel.** Three switch rows under "Show on map" (`:628-630`):
Projects (`:631-639`), whose state (`showProjects`) is a prop persisted by
App as `linkmap_show_projects`, default off, as above; Unlinked roots
(`:640-648`, `showUnlinked`, pane-local, default on, `:204`); and Only
drifted and dangling (`:649-657`, `onlyFaults`, pane-local, default off,
`:205`).

**`LinkMapPlacecard`'s node body.** A section-format `ListCard` with one
row per kind of count — Assets always, then Skills, Rules, Subagents and
MCP servers only when that count is above zero (`LinkMapPlacecard.tsx:332-370`).
A store node's card also carries a `Linked from` row, worded to how many
engine roots reach it (`:371-378`). A project node with rule assets gets
a second card headed "Rules here", one row per rule name (`:380-396`).
Exactly one mini action per node kind — `Show its assets` on an engine
root (`:397-404`), `Open project` on a project (`:405-412`) — each a
`miniBtnClass` button inside a `miniSetClass` row. A node with a finding
carries `FindingChip` in its head, beside the title (`:300-311`).

**Store→engine edges are always linked symlinks.** `build_link_graph`
inserts a store→engine edge only as `(EdgeMechanism::Symlink,
EdgeState::Linked)` — an entry reaches `engine_links` by having already
resolved into the store, so there is no other state to derive
(`linkmap.rs:434-436` states this, `:442` does it). The only edges that
can carry `drifted` or `dangling` are project edges from the `links`
table. So the state dot and the finding chip — both keyed to a node's
worst incoming state — can appear only on project nodes; an engine root's
incoming edge is always linked, and the store is never a destination at
all.

### Inspectors

Two inspectors exist with different payloads, mounted per view rather than one
generic panel: `AssetDetail` for assets (`AssetDetail.tsx:76-89`: `asset`,
`inventory`, `onDocumentPath?`, `annotation?` — `onLink` moved out this phase,
replaced by `onDocumentPath`, since the panel no longer opens the link flow
itself; see below) and `ReviewInspector` for issues (`ReviewInspector.tsx:6-13`:
`issue`, `position`,
`outOf`, `onClose`, `onSkip`). `ReviewInspector` documents that `position` and
`outOf` are not totals of anything, because the list is already filtered
(`:8-9`). `McpServerDetail` is a third, for MCP servers — props `server`,
`verified`, `onVerify`, `onAutoProbe`, `declined`, `verifying`
(`McpServerDetail.tsx`, Props). It asks for a tool list when it opens rather
than behind a button: `onVerify` is the user's own re-check and always reaches
the server, `onAutoProbe` is the panel's question on open and may be answered
from the store without starting anything. It asks about **one launch at a
time** — two launches probed at once start two third-party processes at once.
`declined` carries the launches the backend refused to spawn because they are
already running; it comes from the answer, never from the panel's own
`reg.running`, which can be minutes old. `verifying` is a list, not one key,
so the panel can see that a request of either kind is outstanding.

**Both inspectors open on their breakdown, not their identity.** `AssetDetail`
switches Content/Details, defaulting to Content (`AssetDetail.tsx:133`, tabs
`:351-358`); `McpServerDetail` switches Tools/Details, defaulting to Tools and
resetting to it on every new server so a stale Environment tab never survives
a selection change (`McpServerDetail.tsx:403-406`, tabs `:666-688`). Both
switches are the same `UnderlineTabs` (Surfaces and controls, below). Every
section beneath either tab strip takes the section format: an eyebrow label
(`eyebrowClass`, `AssetDetail.tsx:91`; a plain `<h3>` on the MCP side,
`HEADING`, `McpServerDetail.tsx:198`) above a `ListCard`/`ListCardRow` stack.

**The identity row moved out of the panel and into the cap; what survives
above the tabs is three pieces with nothing between them.** Selecting an
asset used to earn Flyout's eyebrow row a `kind · place` pair; `targetAsset`
now renders `null` there instead (`Flyout.tsx:690-696`), because that
identity lives in the cap and restating it a second time would be "the
'moved, never copied' rule's exact failure mode" (the panel's own comment,
`Flyout.tsx:662-668`). For a plain asset selection the eyebrow row now has
nothing left to say at all: `eyebrowShown` is `false` whenever nothing but a
bare `targetAsset` would have earned it (`Flyout.tsx:607-609`), so the row
does not render and the title block below drops the top margin it used when
resting on a row that is actually there (`:716`). The eyebrow still renders
for what is not a plain asset selection — the link flow's own "Back to
‹name›" nav (`:679-687`), a bubble scope with no asset drilled into, or the
empty-MCP category label — plus, independently, a layered-rules flag that can
sit beside any of them.

Below that, the header is exactly: the cap's identity row — kind glyph with a
state dot, a `KIND · PLACE` eyebrow, a finding chip (`InspectorCap.tsx:169-212`;
the cap itself, Surfaces and controls below) — then Flyout's title block
(the `<h2>`, `Flyout.tsx:720`), then `AssetDetail`'s own `UnderlineTabs`
switch. Nothing else: `AssetDetail` used to open with a state line, a path
chip and a Link/Open action row, each behind its own `border-b border-line`,
all now gone — the render goes straight from the panel's outer div to a
comment recording the move and then the tab switch, with no hairline of its
own left in that gap (`AssetDetail.tsx:346-358`). One hairline still stands
in the assembled header: Flyout's own `border-b border-line`, beneath the
title and above the tabs (`Flyout.tsx:676`) — untouched by this phase, and it
falls between the title and the tabs, not between the cap and the title,
where nothing separates them at all.

**The cap sheds two things, in order, when it does not fit, and none of it
runs under test.** After every render, one effect compares the row's own
`scrollWidth` against its `clientWidth` and climbs one rung — sheds `Link
to…` first, the finding chip second — when the row overflows
(`InspectorCap.tsx:149-156`); a second, separate effect holds a
`ResizeObserver` on the same row purely to catch it growing back, resetting
the climb to `0` the same width it left (`:115-134`). Both are inert under
`happy-dom`, the environment every component test runs in, for two different
reasons: the render-time comparison never overflows because `scrollWidth`
and `clientWidth` both read `0` there — the same limitation `SegmentedTrack`'s
and `UnderlineTabs`' own geometry already carry (Surfaces and controls,
below) — while the `ResizeObserver` effect's own guard, `typeof
ResizeObserver === "undefined"` (`:122`), does not even trip: `happy-dom`
does define a `ResizeObserver` class, so `typeof` reads `"function"` and the
code proceeds to call `observe()` — which is a documented no-op there that
never invokes its callback
(`node_modules/happy-dom/lib/resize-observer/ResizeObserver.js:12-14`). A
test-only `forceShed` prop drives the collapsed states directly instead
(`InspectorCap.tsx:74-78`; every case in `InspectorCap.test.tsx`), so a
broken threshold, a flipped comparison, or a disconnected ref in either
effect would still pass every test in the suite.

**An MCP server's cap never sheds and never draws a ⋮**, derived from the
absence of its callbacks rather than a category check: `canShed` is
`Boolean(onLink || onCopyPath || onReveal || onOpenInEditor)`
(`InspectorCap.tsx:121`), and a server has none of the four — no path to
copy, nowhere to reveal, nothing to open, nothing to link — so `canShed` is
`false` and the effective shed is pinned to `0` regardless of `forceShed` or
the measured `autoShed` (`:113`). Its finding chip therefore stays on the
surface at every width, and `menuHasContent` never turns true for it, so no
⋮ renders at all (`:151-157`; `InspectorCap.test.tsx`'s two "never sheds an
MCP server's cap" cases, at `forceShed=1` and `forceShed=2`). Karthik's
ruling, 2026-08-24.

**A server's findings are matched by identity, never by the config file it
shares.** `~/.claude.json` typically declares ten servers in one file, and a
server's own `path` is that file — matching it the way a skill, rule or
subagent is matched (there the path IS the asset) would hand one healthy
server every neighbour's findings from the same registration file. The cap's
`findings` prop is computed by `issuesForAsset`, called with a server's
registration key and name rather than its path
(`App.tsx:1198-1205`). `AssetIdentity` makes the mixed shape a compile error
rather than a convention a caller has to remember: `{ path }` and `{
registrationKeys, serverName }` each satisfy exactly one arm, and the two
together satisfy neither (`reviewIssues.ts:405-407`). `issuesForAsset` itself
matches on the asset's own path or a duplicate's `copies` for everything
else, and on a registration key or (for a server's own duplicate issue) its
name for a Tool (`:409-434`). Karthik's ruling, 2026-08-24.

**The path itself moved with the rest.** `AssetDetail`'s Details tab Identity
card gained a `Path` row, last in the ruled order, holding `documentPath ??
asset.path` (`shownPath`) inside a `<bdi>` so a home-relative segment cannot
skew a trailing filename (`AssetDetail.tsx:329-343`; pinned by
`asset_detail.test.tsx`'s "Identity is one list card in the ruled order"
case, which asserts `identity-row-path` last).

**`AssetDetail` (`AssetDetail.tsx`), Content tab.** The document sits behind
the same card shape as everything else: a filename row with a `View source`
toggle when there is a formatted view to fall back from, then the rendered
body — `MarkdownDoc` for a skill's markdown, formatted JSON for a config that
parses, or the raw source either way (`:388-429`, the toggle's gate `:222`).
For a skill specifically, a `Context` section sits above the document and
states what the skill costs to have around: name and description always
loaded, the whole file's size when it is opened, and an estimated token
figure the row itself labels as one (`:364-385`). This differs from the MCP
side's `Context per request` (below) by design — a skill's cost is paid
once, on open; a server's is paid on every request, hence the different
eyebrows.

**`AssetDetail` (`AssetDetail.tsx`), Details tab.**
- **Identity** carries Size and Modified once the body has loaded, both read
  from `AssetBody` and never re-derived: Size is `formatBytes(bytes) · N
  lines` (`:301-308`); Modified is a formatted date from `modified_ms`, and
  the row is dropped outright when `modified_ms` is `null` rather than
  rendering a fabricated date — the platform reported no mtime (`:309-325`;
  the field is `number | null` on the frontend, `:61`, and `Option<i64>` on
  the backend, `lib.rs:1447`). Last in the row order (since this phase) is
  Path: `documentPath ?? asset.path`, wrapped in a `<bdi>` (`:329-343`, above).
  Rows built `:246-344`, rendered `:447-463`.
- **Contents** lists a skill's folder, one row per top-level entry
  (`:465-497`). A directory states how many files sit beneath it; a file
  states its size; a symlink states neither — `LinkIcon` and an em dash —
  because `list_asset_dir` classifies every entry with `symlink_metadata` and
  never follows the link, so nothing on the far side of it was ever read
  (`lib.rs:1569`, doc comment `:1547-1555`).
- **Capabilities** lists the skill's declared `allowed-tools`, one row each;
  a tool beginning `Bash` carries the value `Shell access`, every other tool
  carries none (`:500-516`, the rule `:512`).
- **Reach** groups every engine the backend holds a verdict for by why:
  reaches it, root not linked, another engine's format (`REACH_GROUPS`,
  `:108-112`; rendered `:526-585`). One `→ store` figure sits beside the
  eyebrow, keyed off the asset's own root so it cannot disagree with the rows
  beneath it (`:534-538`).

**`McpServerDetail` (`McpServerDetail.tsx`), Tools tab.**
- **Context per request** appears only once a probe has
  answered with a `cost` (`:700-720`). One heading, not two: the card
  carried a second `Composition` eyebrow directly beneath the section's own
  until 2026-08-24, which is why every other section here has exactly one
  `h3` and this one had a pair. A `Descriptions` row states the bytes
  the store can account for (`formatBytes(descriptionBytesTotal) · M of N
  tools`) beside an `Input schemas` row whose value is the constant string
  "the remainder, not in the store" — schema bytes are never captured
  (`ToolCost`, `probe.rs:112-121`, no schema field at all). The eyebrow reads
  `Context per request`, not the skill's plain `Context`, because this cost
  recurs on every request rather than once on open.
- **The tool table** — `Tool` / `Description` / `Schema` header row
  (`:341-345`), then one row per tool: its name, a description-bytes figure
  or an em dash when `cost` did not travel with this probe, a `Schema` column
  that is always an em dash because schema bytes are never measured, and the
  description text itself beneath when the server sent one (`ProbedToolList`,
  `:322-368`).

**`McpServerDetail` (`McpServerDetail.tsx`), Details tab.**
- **Identity & capabilities** is a `ListCard` of up to six rows: Server and
  Protocol only when the handshake returned them, Transport always,
  Tools/Resources/Prompts each `offered` or `not offered` from the server's
  advertised capability list (`:906-947`, heading `:891`).
- **The verdict card** appears only once there are two or more registrations
  to compare (`:961-1003`). Its headline states how many times the server is
  declared, and whether the same engine declares it twice (`:573`). Its
  detail sentence — "All N launches agree — the same command from …" — is
  drawn only when every launch agrees; a divergent launch is explained once,
  beside the aligned diff in Registered in, rather than being said in both
  places (`:587-589`, rendered `:977-979`). `Compare`, shown only when
  launches or endpoints diverge, scrolls to that diff; `Open config` always
  opens the first registration's file (`:982-1001`).
- **Registered in** lists one row per registration: host and tier, the config
  path with a reveal button, the launch itself only when hosts disagree about
  it, this registration's own probe result once one exists, and a running
  line only while a matching process is up (`:1005-1072`). Below the rows, a
  warning sentence per kind of disagreement — endpoints, launches — and the
  aligned launch diff for the latter (`:1073-1118`).

`Flyout` is the asset inspector's coordinator and owns its own `<aside>`
(@b383a08).

The link map is the exception: it has **no inspector column**. Selection
docks **`LinkMapPlacecard`** inside the canvas instead
(`LinkMapPlacecard.tsx`: `selection: LinkMapSelection`, `nodes`,
`notices`, `onClose`, `onOpenProject`). The name is Apple's own: the panel
Maps opens beside its sidebar for a selected place is a **place card**
(Apple Business Connect, "Configure a place card"; the Maps user guides use
it throughout). It fits what this surface is — every node on the link map
is a place on the machine. It keeps
`ReviewInspector`'s anatomy at card scale: eyebrow, title, state dot and
line, path chip with copy, facts grid. One dock, one shape (`cardClass`),
three bodies: an edge, a node, or the map's own notices
(`linkMapLayout.ts`, `LinkMapSelection`, whose `notices` variant carries no
payload — the list is built where the graph is read). Node bodies state
kind, asset count and — for engines — whether the root actually reaches the
store, and project nodes carry an Open project action into the repository
view. The notices body leads with the worst variant present: a warning dot
and "Not everything could be drawn", or a success dot and "Nothing is
wrong — context for what you see". It
deliberately carries no provenance on either body: nothing records who
created a link or when, and inventing that was a defect in the prototype.
Its edge count row is labelled by what actually travels the edge — assets
to a project, root-level symlinks to an engine. With the column gone, the
map view's toolbar slot holds Rescan instead of the inspector toggle
(`App.tsx`, toolbar).

### Surfaces and controls

**`SummaryStrip`** (`SummaryStrip.tsx:24-39`) — `total`, `subtitle`,
`scannedAt`, `scanning`, `counts`, `activeStateFilter`, `onFilterState`,
`onRescan?`, and `mcp?: McpStripFigures` — the MCP mode, which "replaces the
entire link-state branch — meter, legend and the Needs review pill — with
these figures; `total`/`subtitle` still render as passed by the caller"
(`:7-10`, interface `:11-22`). Two contracts are stated in the link-state
props themselves: `total` is "Backend-owned asset total for the scope —
never derived on the frontend" (`:25`), and Rescan lives here rather than in
the toolbar because it is the control that changes the figure directly
above it (`:33-35`).

**`GelMeter`** (`GelMeter.tsx`) — the design system's one meter: a glassy
retro-Aqua gel on a recessed track (`--gel-gloss`, `--gel-aqua`,
`--bar-track`, `tokens.css:37-39`, `:178-180`). Segments are
`{key, value, barClass?, aqua?}` — `value` is a backend-owned count that
sets the segment's flex share, zero-count segments are omitted, and `aqua`
may mark only a share that is actually true — linked, or, since the strip's
MCP mode, answered (`GelMeter.tsx:10-14`; Karthik's ruling, 2026-08-15,
extended to MCP by `a066c9e`). Both strips draw through it
(`SummaryStrip.tsx`, `NeedsReviewPane.tsx`); a proportional bar styled by
hand is a divergence, not a variant. The glass is painted with stacked
gradients, not cast — `--overlay-shadow` belongs to the map's overlays and
`--capsule-shadow` (§3) to the segmented track's capsule; neither elevation
belongs to a bar.

**`MechanismGlyph`** (`MechanismGlyph.tsx`) — the per-row attachment glyph:
one of five backend words (`symlink | copy | drift | broken | none`), drawn
as a 14px stroke icon with a signed one-line tooltip. The component renders
the word verbatim; deriving a mechanism from paths or link state in
TypeScript is forbidden (dispatch item 8).

**`EngineReachTiles`** (`EngineReachTiles.tsx`) — the Reach column: a 16px
tile per engine from the backend's reach list, filled when the engine reads
the asset through its linked root. Each tile carries the engine's own mark
(`BrandIcon`), the generic mark for one the map cannot draw. Capped at four,
or three plus an ellipsis chip above that, reached-first; every engine is
answered for in the inspector's `reach-detail` section (`AssetDetail.tsx`).

**`BrandSprite`** (`BrandSprite.tsx:25-35`) — the hidden `<svg>` of
`<symbol>`s, mounted once in `main.tsx:19` (import `:7`); `SPRITE` is built
at module load from `src/data/brands.ts` via `toSymbol`
(`src/utils/svgSymbol.ts:22-42`, `BrandSprite.tsx:6-14`).

**`BrandIcon`** (`BrandIcon.tsx:6-18` props, `:26-56` component) —
`engineKey`, `engineName?`, `size = 12`, `className?`, `x?`/`y?` (inside an
SVG canvas). Renders `<use href="#brand-…">`; nothing for any-agent;
`#brand-generic` for an unmapped id (`:36`). Decorative (`aria-hidden`,
`:44`).

**`EngineLabel`** (`EngineLabel.tsx:4-22`) — `BrandIcon` + children in an
`inline-flex items-center gap-1.5` (`:17`); the one icon-plus-name compound.

**`SegmentedTrack`** (`SegmentedTrack.tsx`) — the category row's tablist:
`segments: TrackSegment[]` (`{id, label, count?}`, `:4-9`);
`SegmentedTrackProps` adds `selectedId`, `onSelect`, `ariaLabel`, `loading?`
(`:10-16`). `role="tablist"` on the outer element, one `role="tab"` per
segment (`:82`, `:98`); roving focus — the selected tab is `tabIndex={0}`,
every other `-1`, Left/Right/Home/End move focus without selecting,
Enter/Space selects (`:46-78`, `:100-101`). A segment's own count sits
beside its label; `count === undefined` under `loading` draws a spinner in
its place rather than a stale zero (`:112-118`). The track scrolls rather
than wraps at narrow widths — `overflow-x-auto [scrollbar-width:none]` on
the outer element (`:84`) — and selecting a segment calls its own button's
`scrollIntoView` so an off-screen selection brings itself on screen
(`:40`). The selected segment carries a floating pill, `<i
data-testid="track-capsule">`, styled `capsule-raised` (§3) and
repositioned by measuring the selected button's own box in a
`useLayoutEffect` (`:32-44`, `:86-91`) — a second idiom from
`UnderlineTabs`' own sliding rule (below), at capsule geometry rather than
an underline. No automated test asserts the capsule's resulting position:
under `happy-dom`, `offsetTop`/`offsetLeft`/`offsetWidth` all read 0, the
same limitation `UnderlineTabs`' indicator already carries — only a
screenshot from a running build confirms the capsule actually slides
(`.claude/rules/verifying-ui.md`; `SegmentedTrack.test.tsx` asserts the
capsule's classes, `:20-22`, never its geometry). `CategoryFilterCards` is
the first caller (below).

**`CategoryFilterCards`** (`CategoryFilterCards.tsx:5-15`) — per-category
counts, `selectedCategory`, `onSelectCategory`, `loading`. `allCount` is
labelled "Backend-owned total for the All chip" (`:6`). It no longer draws
its own chips: it builds five `TrackSegment`s (`:46-55`), filters out empty
ones by the hide-at-zero rule stated in its own doc comment — with one
exemption for a zero-count Tools chip (`:57-69`) — and hands the result to
one `SegmentedTrack` (`:81-87`, above). The class strings that used to draw
pressed/unpressed chips by hand, `chipBaseClass` / `chipPressedClass`, are
gone with them; `NeedsReviewPane.tsx` declares its own identically-named
pair for an unrelated, non-tablist chip row (§6, Pane composition) — the
two are not the same constants.

**`AssetRow`** (`AssetRow.tsx:22-28`) — `item`, `isSelected?`,
`showKindColumn?`, `onClick?`, `onLink?`, `onUnlink?`. **`AssetHeaderRow`**
(`AssetHeaderRow.tsx:6-11`) — `sortField`, `sortDirection`, `showKindColumn?`,
`onSort`.

**`Tooltip`** (`Tooltip.tsx:15-20`) — `label`, `placement?`, `children`. The
child carries the same string as its `aria-label`, so the tip is hidden from
assistive tech rather than repeating it (`:16-17`). It exists because native
`title` arrives after ~1s in the OS's own type; this one arrives in 80ms in the
app's type, positioned `fixed` so the shell's overflow-hidden columns cannot
clip it (`Tooltip.tsx:30-36`).

**`ListCard` / `ListCardRow`** (`ListCard.tsx`) — the section format
(Karthik, 2026-08-22): an eyebrow above one bordered card whose rows are
icon · label · right-aligned value, the divider drawn on "row after row"
rather than under a single-row card or its own last row (`:3-12`).
`ListCard` (props `:14-18`, component `:23-29`) is flat on the page:
`cardClass` (`:20-21`) is a `--line` border and `rounded-inner`, no fill.
`ListCardRow` (props `:31-42`, `rowClass` `:44`, component `:46-67`) takes
an optional 14px `icon`, a `label`, and either a mono `value` or a sans
`wide` figure pushed to the right edge, plus a trailing control. First
callers: the link map's placecards (`LinkMapPlacecard.tsx:15` import,
`:239`, `:332`, `:385`); the doc comment states the inspector's sections
are meant to take the same card next (`ListCard.tsx:10-11`).

**`UnderlineTabs`** (`UnderlineTabs.tsx`, Karthik, 2026-08-22) — the
inspector's view switch: labels in `--ink-2` on a `--line` baseline, the
active one `--ink-1` at medium weight with a 2px rule beneath, sliding on the
nav beat (`:4-9`). Deliberately a second idiom from the pane's category
selector, which is a segmented track that filters a list — this switches
views inside one surface instead (`:6-8`). A tab is `{id, label, count?}`
(`:12-16`); props are `tabs`, `active`, `onChange`, `ariaLabel` (`:18-23`).
The rule is positioned from the active tab's own box in a `useLayoutEffect`;
a zero-width box, as under a test runner, draws no rule at all (`:31-38`,
the `<i data-testid="tab-indicator">` it moves, `:67-72`). First callers:
`AssetDetail`'s Content/Details switch (`AssetDetail.tsx:351-358`) and
`McpServerDetail`'s Tools/Details switch, where Tools alone carries an
optional count (`McpServerDetail.tsx:666-688`).

**`FindingChip`** (`FindingChip.tsx`) — a chip plus an edge-clamped
popover (Karthik, 2026-08-23): the chip names the state — how many findings
are behind it; opening it says what they are and names its own destination,
once (`:4-16`). Props `severity`, `lines`, `onReview`, `elevated`, `clampTo`
(`:18-24`) — `count?` was dropped when the chip stopped taking an externally
supplied count and started stating its own (`5cf0c70`). The chip itself
reads `{n} flagged` and the popover's `aria-label` carries the same string,
not "Needs a decision" (`:86`, `:92`). The dot's colour is `severity` —
`bg-state-danger` or `bg-state-warning` (`:70`). The popover measures its
own box against `clampTo.current` in a `useLayoutEffect` and, only if it
would run past the caller's surface, shifts back inside and moves the arrow
the same amount so it still points at the chip (`:55-68`) — `Tooltip.tsx`'s
window correction, here against the caller's own container. `elevated`
decides whether the popover carries `shadow-overlay` (`:95-97`). Its lines
are not new copy: `LinkMapPlacecard` passes the popover the same strings the
map already draws on the edge labels themselves, built by `edgeSummary`
(`LinkMapPane.tsx:407-408`, drawn on the map `:477`). `Needs review →`
(`:106-110`) fires `onReview`, which each caller wires to switch to the
Needs review pane: `LinkMapPlacecard`'s at `App.tsx:1661-1663`, and — since
this phase — the inspector cap's own chip (`InspectorCap`, below) at
`App.tsx:1252-1256`, which also selects the issue so the pane opens on it.

**`ScanStamp`** (`ScanStamp.tsx`) — how old the figure beside it is;
stays an age during a scan rather than restating that one is running
(`:9-14`). Two callers: `SummaryStrip.tsx` (`:67`) and the map cap, beside
Rescan, since the map view's toolbar slot holds Rescan in place of an
inspector toggle (`App.tsx:1517`). Re-renders on a 30s interval so the
age keeps pace with no scan event (`:17-20`); the wording — "moments ago"
under a minute, then minutes, hours, days — is `timeAgo.ts` (`:2-11`).

**`OverflowMenu`** (`OverflowMenu.tsx:39-87`, props `:17-30`) — the popover
behind two different triggers: `ViewControl`'s "View" control and the
inspector cap's ⋮. `trigger` is a render prop the caller uses to draw its own
button, wired with the `aria-haspopup`/`aria-expanded`/`onClick` triple it
must spread (`:19`); `ariaLabel` names the resulting `role="menu"`; `align`
picks which edge the panel hangs from — `ViewControl` opens from its left
edge, the cap's ⋮ from its right, inward, because the aside clips (`:22-23`);
`children` is a render prop taking a `close` callback each item calls after
acting (`:26`). The panel itself — `shadow-overlay`, `rounded-inner`,
`animate-tip` — opens on click and closes on Escape or an outside
pointerdown (`:50-66`). Extracted from `ViewControl`, which used to own this
mechanism directly and is now its first caller (`b48b8c3`); `ViewControl`
keeps `menuItemClass`/`menuLabelClass` as its own row styles (`:3-7`), the
cap's menu items use `menuActionClass` instead (`:9-10`), and `MenuSeparator`
(`:13-15`) is shared by both.

**`InspectorCap`** (`InspectorCap.tsx`, props `:44-70`) — the inspector
column's 40px cap, and since this phase the selected asset's identity as
well as the two panel-level controls it used to hold alone: a kind glyph
with a state dot when the asset has findings, a `KIND · PLACE` eyebrow, a
finding chip, then `Link to…`, a ⋮ overflow (`OverflowMenu`, above), and
Expand/Collapse plus Toggle inspector (`:159-335`; the shed order, its
measurement, and the MCP exception are under Inspectors, above). Renders
only the two trailing controls when nothing is selected (`asset: null`,
pinned by `InspectorCap.test.tsx`'s "renders only Expand and Hide" case).
`asset.scope` travels with the rest of `InspectorCapAsset` (`:37-42`) since
`50fe6b8`: a clicked asset used to reach the cap without its own `scope`,
so the eyebrow read `SKILL · GLOBAL` for a project-scoped asset too, and the
kind glyph's tooltip — which only renders when `place !== "Global"`
(`:163-169`) — silently never showed. `tbBtnClass`/`tbBtnActiveClass`
declare its own two trailing buttons, copied verbatim from `App.tsx` rather
than imported from a shared module (`:79-85`; the duplication itself, and
why, is recorded under Repeated variants are hoisted, not computed, §6,
below).

**`DisclosureBanner`** (`DisclosureBanner.tsx:4-10`) — `variant: "warning" | "error" | "info"`,
`summary`, `count`, `children`, `defaultOpen?`. Every variant sits on the same
neutral plane; only the text colour changes, because "the state carries the
colour, not the ground" (`:21-32`). It pluralises its own summary from `count`
(`:46-60`) and caps its open body at 240px of scroll (`:83`).

**`LinkPanel`** (`LinkPanel.tsx:18-29`), **`DiffChooser`** (`DiffChooser.tsx:9`),
**`SidebarScanModal`** (`SidebarScanModal.tsx:5`), **`MarkdownDoc`**
(`MarkdownDoc.tsx:52`, takes `blocks: Block[]`), **`ScanStatusIndicator`**,
**`AssetDetail`**, **`HangerMark`**.

---

## 6. Layout patterns

### Shell

Three fixed columns and a content area: icon rail (`w-14`, so 56px,
`IconRail.tsx:45`), an optional source list (216px default, `App.tsx:310`,
clamped 216–320, `App.tsx:777`), the pane, and an inspector (384px default,
`App.tsx:341`, persisted under `inspector_width` — read `App.tsx:802`,
written `App.tsx:1177`). The body is `flex-1 flex min-h-0` (`App.tsx:1336`).

The second column is view-dependent, and the branch order is the map first:
the **link map** renders none, `design` renders `DesignSystemSidebar` behind
a `Suspense`, Discovery renders `DiscoverySidebar`, review renders
`ReviewSidebar`, and everything else renders `Sidebar`
(`App.tsx:1374-1432`).

Views are switched by a single string state, not a router — `App.tsx:307`
holds `selectedSidebarItem`, defaulting to `"profile"`, persisted under
`selected_sidebar_item` (read at `App.tsx:758`, written at `:1040`, `:1126`
and each rail handler).

### Window chrome — one vertical baseline

Every cap — the sidebar cap (`App.tsx:1325`), the content header (`App.tsx:1440`),
the inspector cap (`App.tsx:1781`) — is `h-10 flex items-center`: a 40px band
with its contents optically centered on the same line, 20px from the cap's
top. The native traffic lights are tuned to sit on that identical line:
`trafficLightPosition.y: 22` in `tauri.conf.json:26` was set by measuring the
rendered dot centre against the sidebar toggle button's centre in a live
screenshot (dot centre landed ~8.5pt above the toggle before the fix) and is
not derived from any documented Apple/Tauri formula — the OS does not expose
one, so this value is empirical and window-height-dependent. If the cap
height (`h-10`) ever changes, `trafficLightPosition.y` must be re-measured
against it, not recomputed by formula.

**The inspector cap's content changed this phase; its height did not.** The
identity row, the finding chip and the overflow menu were added ahead of the
same Expand/Collapse and Toggle inspector pair the cap always carried
(`InspectorCap`, §5); the wrapping `<div data-tauri-drag-region
className="relative h-10 shrink-0">` around it kept `h-10` exactly as it was
before the cap grew a component of its own (`App.tsx:1781`, and the removed
cap it replaced carried the same `h-10` — Both inspectors open on their
breakdown, §5, above). Because the baseline this section states is keyed off
that class, not off what fills the row, `trafficLightPosition.y` needed no
re-measurement for this phase and none was done.

Any future cap, toolbar, or menubar row must keep this same `h-10
flex items-center` shape so its contents land on this baseline by
construction, rather than each screen re-deriving its own vertical rhythm.

**Toolbar buttons must carry `shrink-0`, or a squeezed cap silently shrinks
the icon inside them.** `tbBtnClass` / `tbBtnPlaneClass` (`App.tsx:1148-1153`)
both declare it, and so does `tbBtnActiveClass` — which, since this phase,
lives only in `InspectorCap.tsx:93-94` (Repeated variants are hoisted, not
computed, below). This was found the hard way: the sidebar cap leads with a
spacer (`w-[76px] shrink-0`, `App.tsx:1327`) so the toggle button stays
reachable when the source list is collapsed and the cap's content overflows
its 56px rail on purpose (`App.tsx:1320-1324`). Without `shrink-0` on the
button, that overflow's negative free space fell through to the button —
clamped there by `min-w-[27px]` — and then into the icon inside it,
rendering the same `size={15}` icon at ~10pt instead of ~13pt with no change
to its props at all; `react-dom/server` output for the two icons was
byte-identical, so the bug was purely this missing shrink guard, confirmed by
pixel-measuring the live window before and after. Any button meant to
overflow a shrinking container needs this same guard, or its icon silently
shrinks instead of the button just overflowing as intended.

**The leading gap after the traffic lights is tuned to match the gap between
the lights themselves — not derived, measured.** The three native dots keep
~9.5pt between each other. `App.tsx:1327`'s spacer (`w-[76px]`) lands the
toggle icon's own ink ~11.5pt after the dot cluster ends, and the collapsed
crumb's `pl-[51px]` (`App.tsx:1451-1453`, when `sidebarCollapsed` AND the
view is not the link map; `pl-[18px]` otherwise) lands the breadcrumb text ~10.5pt after the icon's ink
— three gaps within ~2pt of each other, read as one uniform rhythm rather
than three independently-guessed numbers. None of these three values can be
derived from the others by formula (native traffic lights aren't in the DOM,
and glyph ink extent isn't the same as box width), so every one of them was
set by measuring a live, running window pixel-by-pixel, not by eyeballing a
screenshot or computing from CSS box models alone. If the spacer, the button
padding, the icon size, or `trafficLightPosition.x` ever change, re-measure
the live window and retune both the spacer and the crumb's collapsed padding
together — they drifted out of sync once already from being changed one at a
time.

### Pane composition

The panes no longer share one vertical order — `ProfilePane` and `RepoPane`
gained a track above their strip (`2de751a`) that the other two never had.

**`ProfilePane` and `RepoPane`: track, strip, list plane, foot.** The
category track (`CategoryFilterCards`, above) opens the pane in
`px-[18px] pt-3.5 pb-1.5` (`ProfilePane.tsx:813`; `RepoPane.tsx:339`, where
it is nested one level deeper in a `min-w-0 flex-1` wrapper, `:345`, so the
track can shrink beside a control that does not exist yet — the comment at
`:333-338` says none is needed here). Then the `SummaryStrip` itself, now in
`mx-[18px] mt-2.5 mb-2.5` rather than owning the top margin
(`ProfilePane.tsx:827`, `RepoPane.tsx:360`). Then the list plane, flat per
§3 — no `bg-plane` — rounding only its top corners and running off the
bottom edge: `@container flex-1 min-h-0 overflow-y-auto mx-[18px] border
border-line rounded-tl-plane rounded-tr-plane pb-1.5`
(`ProfilePane.tsx:990-992`), the same shape plus `mt-2.5` since the strip
above no longer supplies that gap on its own (`RepoPane.tsx:558`). Then the
foot, `h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex
text-micro text-ink-3` with the scan status pushed right by `ml-auto`
(`ProfilePane.tsx:1174`, `RepoPane.tsx:728`).

**`NeedsReviewPane` keeps the pre-track order: strip, chip row, list plane,
foot.** It was not touched by the reorder — it has no category to put on a
track. Its own inline strip, `mx-[18px] mt-[18px] px-4 py-3.5 border
border-line rounded-plane shrink-0`, sits first (`:90`); then a chip row,
`flex items-center gap-[7px] px-[18px] pt-3 pb-2.5 overflow-x-auto
shrink-0` with `role="group"` and an `aria-label` (`:171-175`); then the
list plane (`:202`); then the foot (`:289`). The chip row is a plain button
group, not a tablist — it filters by place (All / Repo-level / Cross-repo),
not by asset category — styled by its own `chipBaseClass` /
`chipPressedClass` (`:46-48`), a same-named but unrelated pair to the class
strings `CategoryFilterCards` dropped (above); `SegmentedTrack` was never a
candidate for this row.

**`DiscoveryPane` has neither a strip nor a chip row.** Its category facet
moved into `DiscoverySidebar`'s second column before this phase (Karthik's
ruling, 2026-08-15, §5, Shell), so there is nothing here for a track to
replace. It opens with a plain `<header>` (`:213-225`) straight into the
list plane, `flex-1 min-h-0 overflow-y-auto mx-[18px] mt-3.5 p-1.5 border
border-line rounded-tl-plane rounded-tr-plane` (`:229`), then a foot at
`:279` — `h-8` (32px), not the other three panes' `h-[30px]`, an
unremarked 2px difference from the pattern above.

Section eyebrows are `font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3`
(`ProfilePane.tsx:801-802`).

### Repeated variants are hoisted, not computed

The house idiom is a module-level `const` class string above the component,
selected by ternary — never `clsx`, never `cva`. `railBtnClass` /
`railBtnActiveClass` (`IconRail.tsx:21-24`), `tbBtnClass` /
`tbBtnPlaneClass` (`App.tsx:1148-1153`). `CategoryFilterCards` no longer
belongs on this list — its `chipBaseClass` / `chipPressedClass` were deleted
when it moved onto `SegmentedTrack` (§5); `NeedsReviewPane.tsx:46-48`
declares an unrelated pair under the same two names, for its own
non-tablist chip row (Pane composition, above).

**`tbBtnClass` is a real, deliberate exception to "declared once": it exists
verbatim in two files.** `App.tsx:1148-1149` still declares it for the
toolbar's own buttons; `InspectorCap.tsx:91-92` declares the identical
string again (checked byte-for-byte) for the cap's Expand/Collapse button,
with a comment recording the ruling: `App`'s copy is local to the component
body and not exported, and `App` keeps needing its own regardless, so
extracting a shared module would have staled the citations already written
against both files' bodies rather than removed a duplicate
(`InspectorCap.tsx:88-90`). `tbBtnActiveClass` is not the same story: it used
to live in `App.tsx` too, painting the same "Toggle inspector" button this
cap now paints, but when that button moved into `InspectorCap` (`af1c305`)
`App`'s own copy was deleted rather than left unused — so today
`tbBtnActiveClass` exists in exactly one file, `InspectorCap.tsx:93-94`, and
only `tbBtnClass` is the actual two-file duplicate.

### Scroll caps

Two independent surfaces cap a scrolling body at exactly 240px —
`DisclosureBanner.tsx:83` and the MCP tool list (@b383a08). Modal bodies cap
differently: `max-h-[85vh]` for the shell and `max-h-[350px]` for its inner
list (`SidebarScanModal.tsx:94`, `:160`). The repo pane's banner stack caps at
`max-h-[45%]` (`RepoPane.tsx:374`).

---

## 7. Rules the code enforces

These are not conventions — each is a test that fails the build.

**No frontend counting.** `src/__tests__/no-frontend-counting.test.ts` scans for
counting implementations and fails on any match not on an explicit allowlist;
an allowlist entry that no longer matches also fails (`:14-16`). Counts come
from the backend and are rendered as received.

**No off-token styles.** `src/__tests__/no-off-token-styles.test.ts` holds an
allowlist keyed by file and exact line text, each entry carrying a stated
reason (`:18-21`). Raw hex or a non-semantic colour utility fails.

**No unregistered spacing.** `src/__tests__/spacing-scale.test.ts:22-29`, above.

**No blocking dialogs.** `src/__tests__/no-blocking-dialogs.test.ts` bans
`window.confirm/alert/prompt` and bare `confirm(` across all of `src/`
(`:24`, `:48-61`). The rationale is recorded: six webview dialogs shipped
unseen because the previous detector scanned one function in one file and only
matched `window.`-prefixed calls (`:6-10`). Native
`@tauri-apps/plugin-dialog` surfaces are permitted but must be imported under
an alias, so a bare `confirm(` is always unambiguous (`:12-17`, enforced
`:63-85`). The detector also asserts it scanned a non-trivial file set, so it
cannot silently pass by scanning nothing (`:43-46`).

**Contrast.** `src/__tests__/tokens_contrast.test.ts` parses `tokens.css`
directly and computes WCAG 2.1 relative luminance and contrast ratios
(`:6-25`), resolving each token separately in the light and dark sections
(`:38-40`, `:47-60`).

**Accessibility conventions**, consistent enough to be rules: every
interactive control has an `aria-label`; toggles use `aria-pressed`; nav items
use `aria-current="true"`; decorative icons take `aria-hidden="true"`
(`IconRail.tsx:43-48` is representative).

---

## 8. Not implemented

Findings, not specification. Each is something the code implies is intended
but does not do.

**The two type voices are one.** `--font-sans` and `--font-flex` are declared
as separate roles but hold byte-identical stacks (`tokens.css:27-28`). The
`font-flex` utility is registered (`index.css:94`) and used widely, so the
distinction exists in the markup and resolves to nothing on screen. How I know:
string comparison of the two declarations.

**A large legacy token layer is still live.** `tokens.css:51-118` declares
about sixty aliases — `--brand-lime`, `--brand-pink`, `--brand-violet`,
`--n-0…--n-950`, `--warning-bg`, `--fs-row`, `--duration-rail`, `--hairline` —
under a comment saying they are "revalued onto the mono palette so unmigrated
components render coherently mid-migration; retired as tasks land"
(`:85-86`). They are all still exported into the Tailwind namespace
(`index.css:19-91`). The brand hues are revalued to `--ink-2`
(`tokens.css:95-97`), so the names survive while their meaning has gone.

**The dark neutral ramp is partial.** Light declares `--n-0` through `--n-950`,
thirteen stops (`tokens.css:111-123`); `.dark` redefines only four, `--n-0`
through `--n-100` (`tokens.css:216-219`). Any component using `--n-200` or
darker gets the light value in dark mode. How I know: direct comparison of the
two blocks.

**"Semantic colour in exactly one place" is not literally true.** The palette
comment claims state is the only saturated colour (`tokens.css:3-4`), but the
legacy layer declares tinted grounds — `--warning-bg`, `--error-bg`,
`--success-bg` and their borders and texts (`tokens.css:66-74`, dark
`:155-163`) — plus `--success-tint` / `--warning-tint` / `--danger-tint`
(`:96-103`). `DisclosureBanner` follows the stated rule and uses a neutral
plane in every variant (`DisclosureBanner.tsx:21-32`); the tint tokens remain
available to anything that does not.

**The DisclosureBanner rule has no detector.** `.claude/rules/known-debt.md`
(carried from the archived `AGENTS.md`) requires that non-blocking
diagnostics use `DisclosureBanner` and that no new banner, alert
or modal be built for warnings, parse errors or status notices. No test
enforces it: `no-blocking-dialogs.test.ts` bans only `confirm`/`alert`/`prompt`
(`:24`), and the files referencing `DisclosureBanner` under test are its own
unit test plus four feature tests, none of which asserts exclusivity. How I
know: `rg -ln "DisclosureBanner" src/__tests__/ src/components/*.test.tsx`
returns `TccRelocation.test.tsx`, `DisclosureBanner.test.tsx`,
`no-frontend-counting.test.ts`, `a6_r2_defects.test.tsx`,
`nested_repo_banner.test.tsx`. The rule is real and honoured, but by
convention only. One view states an exception rather than a violation: the
link map has no banner strip and puts the same notices behind an alert
control in the canvas, docked in `LinkMapPlacecard` (see `LinkMapPane`
above). Nothing detects that either.

**There is no panel-height rule to point at.** `McpServerDetail` carries a
comment saying two-line rows mean 17–20 tools exceed a panel and that
"DESIGN.md fixes" it (@b383a08). No such rule exists in any design source: the
component caps its own list at `max-h-[240px]` locally, `DisclosureBanner`
independently caps at 240px (`:83`), and the modal and repo pane cap at other
values entirely (`SidebarScanModal.tsx:94`, `:160`, `RepoPane.tsx:302`). The
240px agreement between two files is emergent, not specified. That comment is
a forward reference to a document that did not define it.

**The vertical rhythm is not tokenised.** `--gutter: 18px` and `--step: 8px`
exist (`tokens.css:42-43`) but are not registered in the `@theme` block, so
every use is an arbitrary value at the call site (`px-[18px]`, `mx-[18px]`).
The token and the literal have to be kept in agreement by hand.

**The `--step: 8px` token has no consumer.** Declared at `tokens.css:43`, not
registered as a utility, and the spacing comment states the system is
deliberately on Tailwind's 4px grid (`index.css:96-103`). An 8px step token
sits alongside a 4px grid with nothing reading it.

**Per-theme brand-mark files, for ten of the eleven brands.** `BrandMark`'s
`darkSvg` field is optional and, by its own doc comment, "absent means the
one mark serves both themes" (`src/data/brands.ts:38-41`). Only `codex` sets
it, to the vendor's monochrome `codex.svg` (`brands.ts:12`, wired at `:67`); the other ten —
`claude_code`, `gemini`, `claude_desktop`, `claude_ai`, `vscode`, `cursor`,
`windsurf`, `zed`, `copilot`, `opencode` (`BRANDS`, `brands.ts:47-65`) —
have no per-theme variant, and none is needed.

**The MCP Context section states no request-wide total.** `Context per
request` shows only what the store can account for — a `Descriptions` row
with a real bytes figure, and an `Input schemas` row whose value is the fixed
string "the remainder, not in the store" (`McpServerDetail.tsx:707-713`).
There is no combined headline beside the section's own `<h3>` (`:702-704`)
the way the skill's `Context` section states one (`AssetDetail.tsx:411-433`),
because the backend's `ToolCost` carries no schema-bytes field to add in —
the schema half of a tool definition is dropped before it ever reaches the
store (`probe.rs:100-121`; the panel's own comment says the same,
`:326-331`). The section understates the true per-request cost until schema
bytes are kept somewhere.

**`Runs from` — an Identity row naming a server's install path — is not
built.** Its value would be the launch target, and only `args` carries that;
`args` is deliberately never serialised across IPC — `Tool.args` is marked
`#[serde(skip_serializing, default)]`, with a doc comment explaining why: a
config can put a bearer token in `--header` or `--api-key`, and only
`launch_display`, the backend's own redacted rendering, is meant to reach
the frontend (`domain.rs:44-62`, the attribute `:61`). No row of that shape
exists in `McpServerDetail.tsx`'s Identity & capabilities card (`:906-947`)
or anywhere else in the panel.

---

## 9. The Design system page (dev builds)

This document has a runtime counterpart: `DesignSystemPane`
(`src/components/DesignSystemPane.tsx`), reached from the rail's Swatch entry
beside Settings, crumb "Design system", with `DesignSystemSidebar` as its
table of contents. Karthik's rulings, 2026-08-16: name "Design system"
(industry consensus, matches this file), Heroicons `Swatch` (distinct from
the Settings cog; a palette would read as appearance, which Settings owns),
**dev builds only**, TOC in the source-list column.

**What it is.** The system, rendered by the app that uses it. Six sections
mirror §§1–5 — Colour, Type, Geometry, Motion, Controls, Components. Every
component on the page is the real one, imported and rendered with sample
props from `src/data/designSystemFixtures.ts`: `GelMeter`, `MechanismGlyph`,
`EngineReachTiles`, `EngineLabel`/`BrandIcon`, `CategoryFilterCards`,
`DisclosureBanner`, `Tooltip`, `AssetHeaderRow`/`AssetRow`, `SummaryStrip`,
`ScanStatusIndicator`, `HangerMark`. Nothing on it is a picture, so nothing
on it can drift from the app; after a pull, one page shows every component
in the current theme.

**Values are read, not written.** Token swatches read the running theme via
`getComputedStyle` on the root, re-read through a `MutationObserver` on the
root's `dark` class — the page carries no hex in source, and a swatch shows
what the app is actually painting.

**Sample, visibly.** Every fixture-fed specimen wears a "sample" mark and the
foot says so; a 142 on that page is never the store. Sample controls never
borrow a real control's accessible name (`design_system_pane.test.tsx`).

**Gating.** `App.tsx` passes `IconRail`'s `onSelectDesign` only under
`import.meta.env.DEV`; a persisted `selected_sidebar_item` of `design` in a
release build falls back to `profile` on load (`icon_rail.test.tsx`). The
page, its sidebar and its fixtures are dynamic imports behind the same
build-time constant, so a production `vite build` emits no chunk for them —
verified 2026-08-16: zero occurrences of the page's strings in the built
bundle. Only `IconRail`'s own label string survives, because the rail
cannot know at build time whether it will be handed the handler; it never
is.

**Known gaps, recorded rather than fixed here.** The pill pair, the cap
button and the cap field are hoisted class strings in `DiscoveryPane.tsx`
and `App.tsx`, not shared exports; the page repeats them with a caption
saying so. Panes, modals, the map canvas and the inspectors are not on the
page — they need real inventory or graph data. `IconRail` itself is not
rendered as a specimen: it would put a second navigation landmark, with
duplicate control names, on the page.
