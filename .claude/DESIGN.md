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
as a UI state. `--gel-aqua` (`tokens.css:32`, `:163`) is a brand-family
gradient that exists only inside `GelMeter`, and only as the linked share's
progress fill — never an all-quiet or empty state (Karthik's ruling,
2026-08-15). State colour (`tokens.css:21-24`):

- `--state-success` `#0f7a52` light / `#4ec08c` dark (`tokens.css:19`, `:135`)
- `--state-warning` `#8a5a00` light / `#d9a441` dark (`tokens.css:20`, `:136`)
- `--state-danger` `#b3261e` light / `#e8635b` dark (`tokens.css:21`, `:137`)

One overlay token: `--scrim`, `rgba(0,0,0,.55)` light, `rgba(0,0,0,.8)` dark
(`tokens.css:24`, `:139`).

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
`--fw-regular: 400`, `--fw-medium: 500` (`tokens.css:35-36`).

Body text is set in `--font-sans` at the document root with
`-webkit-font-smoothing: antialiased` (`index.css:190-191`).

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
`--step: 8px` (`tokens.css:42-43`). The 18px gutter is what appears throughout
the panes as `px-[18px]` / `mx-[18px]`.

### Radius

Three radii (`tokens.css:39-41`): `--radius-plane: 16px` for planes,
`--radius-inner: 12px` for inner surfaces, `--radius-pill: 9999px` for
controls. A fourth, `--radius-control: 6px`, is declared as legacy
(`tokens.css:112`) and marked in the theme block as "retired with its users"
(`index.css:105`).

Controls are pills — with one squared exception. `--radius-soft` (10px,
`tokens.css:45`) rounds the icon rail's 32×32 buttons (`IconRail.tsx:18-20`),
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

### Motion — one spring, three beats

```
--spring: cubic-bezier(0.2, 0.85, 0.25, 1);   tokens.css:46
--dur-hover: 160ms;                            tokens.css:47
--dur-nav:   180ms;                            tokens.css:48
--dur-press: 200ms;                            tokens.css:49
```

Tailwind v4 durations are not themeable, so the three beats are declared as
first-class utilities instead — `duration-hover`, `duration-nav`,
`duration-press` (`index.css:115-125`) — alongside `ease-spring`
(`index.css:112`).

Three entrance animations exist, each with a stated physical rationale:
`animate-drop` for a sheet falling from the title bar, `animate-rise` for a
toast from the foot (`index.css:130-139`, keyframes `:141-150`, `:169-178`),
and `animate-tip` for tooltips, which scales from `0.97` rather than `0` because
"nothing in the world appears from nothing" (`index.css:152-167`).

All motion is removed under `prefers-reduced-motion: reduce`, transitions and
animations both, with `!important` (`index.css:208-215`).

### Focus

One global focus ring: a 2px `--ink-1` outline at 2px offset with a 4px radius
(`index.css:195-199`). `touch-action: manipulation` is set on buttons and
`[role="button"]` to drop the 300ms double-tap delay without disabling pinch
zoom (`index.css:201-206`).

---

## 4. Icon system

Icons are not used raw. Every export in `src/components/icons.tsx` is wrapped
in `sized()` (`icons.tsx:82-94`), which does two things a plain import cannot.

**Stroke compensation.** Heroicons' outline set is drawn on a 24px grid at 1.5
stroke; at this shell's working sizes of 10–17px that thins to ~0.7px and goes
soft. `strokeFor()` scales the stroke back up per size band so it lands near
1px on screen (`icons.tsx:61-66`): ≤12px → 2.2, ≤16px → 1.9, ≤20px → 1.7,
above → 1.5.

**Optical correction.** A per-mark `optical` ratio corrects for how much of the
24 grid each mark actually inks, because a 1:1 family swap inherits the
difference — most visibly in the icon rail, where four marks stack at one size
and any mismatch reads as a wobble (`icons.tsx:70-81`). The factors are stated
as measured ink-extent ratios, not estimates, and anything within 4% is left at
1. Examples: `ChevronDownIcon` 0.81 (`icons.tsx:100`), `Square2StackIcon` 1.2
(`:119`), `Cog6ToothIcon` 1.12 (`:104`).

The family is Heroicons 24/outline (`icons.tsx:16-46`), with exactly four marks
on lucide because Heroicons has no equivalent: `FolderTree`, `GitMerge`,
`PanelLeft`, `PanelRight` (`icons.tsx:47-52`, exported `:133-136`). Default
size is 16 (`icons.tsx:58`).

`SpinnerIcon` is an alias of `ArrowPathIcon` so loading sites read as loading
rather than as a refresh affordance (`icons.tsx:126-131`).

The brand mark is separate: `HangerMark` renders the app icon's own SVG layers,
choosing the variant by the resolved appearance rather than by the source
file's name — mapping the names literally would paint the white glyph onto
`--page` and lose the mark (`src/components/HangerMark.tsx:1-11`, props
`:24-33`).

**Brand marks.** Engines and MCP hosts are drawn with the vendor's own mark
(`src/components/BrandIcon.tsx`), colour where the brand has colour, the
vendor's `currentColor` form where it is monochrome — `ink: true` for
Cursor, Windsurf, Zed, Copilot, OpenCode (`src/data/brands.ts:59-64`, the
field's doc comment at `:42`). Eleven marks — nine from
`@lobehub/icons-static-svg`, VS Code and Zed vendored in `src/assets/brand/`
(`brands.ts:9-20`) — plus one in-house generic `>_` fallback are joined into
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
monochrome `codex.svg` (`brands.ts:52`). The sprite then emits a second
symbol, `#brand-codex-dark` (`BrandSprite.tsx:6-14`), and `BrandIcon`
renders two `<use>` elements whenever a brand has one (`BrandIcon.tsx:37`,
`:52-53`). The swap is CSS, not state, so it rides the `.dark` toggle with
no re-render and no flash (`BrandIcon.tsx:49-51`): three rules —
`.brand-dark-only { display: none }`, `.dark .brand-light-only { display:
none }`, `.dark .brand-dark-only { display: inline }`
(`src/styles/index.css:125-127`) — because this project's dark mode is a
`.dark` class on `<html>` (§1, Theming mechanism) and declares no
`@custom-variant dark` (`index.css:120-122`), under which a Tailwind
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
`REACH_GROUPS` (`AssetDetail.tsx:78-82`) is the reading order — "Reaches it",
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

24 components, flat in `src/components/`, one per file, all default-exported
with an `interface <Name>Props` declared directly above. Views are suffixed
`Pane`.

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
a pending plane instead: `SpinnerIcon` at 40 (spinning while `loading`),
headline "Scanning your machine" with a subline that names the place and is
literal about timing ("Assets in the global store show up here once the scan
finishes." / "Assets in ‹repo› show up here once the scan finishes." — App
sets inventory on `scan://complete` and ignores `scan://progress`, so nothing
lands root by root), or "Not scanned yet / Rescan when you're ready." when
no scan is running; all under `data-testid="scan-pending"`
(`ProfilePane.tsx:136-149`, `:399-416`; `RepoPane.tsx:269-284`, `:442-456`;
`NeedsReviewPane.tsx:213-227`, where it is the list plane's centred `<p>`:
"Scanning your machine. Anything that needs a decision shows up here once the
scan finishes."). Only `empty && hasScanned` shows an empty state.

The empty copy itself, reviewed 2026-08-16 (Karthik: "review with
/humanizer") — plain copulas, the app's own nouns, no machine-speak:

- Global, engine folders present but nothing in them: "Nothing in the global
  store yet" / "‹Claude Code and Codex› are here, but their global folders
  hold no skills, rules, MCP servers or subagents yet. Discovery lists places
  to find some." — the names come from `detectedEngines` (the
  `get_detected_engines` filesystem probe), joined by `joinNames`
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

### Inspectors

Two inspectors exist with different payloads, mounted per view rather than one
generic panel: `AssetDetail` for assets (`AssetDetail.tsx:26-31`: `asset`,
`inventory`, `onLink?`, absent for kinds that cannot deploy) and
`ReviewInspector` for issues (`ReviewInspector.tsx:6-13`: `issue`, `position`,
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

**`SummaryStrip`** (`SummaryStrip.tsx:5-18`) — `total`, `subtitle`,
`scannedAt`, `scanning`, `counts`, `activeStateFilter`, `onFilterState`,
`onRescan?`. Two contracts are stated in the props themselves: `total` is
"Backend-owned asset total for the scope — never derived on the frontend"
(`:6-7`), and Rescan lives here rather than in the toolbar because it is the
control that changes the figure directly above it (`:14-16`).

**`GelMeter`** (`GelMeter.tsx`) — the design system's one meter: a glassy
retro-Aqua gel on a recessed track (`--gel-gloss`, `--gel-aqua`,
`--bar-track`, `tokens.css:31-33`, `:162-164`). Segments are
`{key, value, barClass?, aqua?}` — `value` is a backend-owned count that
sets the segment's flex share, zero-count segments are omitted, and `aqua`
may mark only the linked share. Both strips draw through it
(`SummaryStrip.tsx`, `NeedsReviewPane.tsx`); a proportional bar styled by
hand is a divergence, not a variant. The glass is painted with stacked
gradients, not cast — the system's one elevation (`--overlay-shadow`)
belongs to the map's overlays, not to bars.

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

**`CategoryFilterCards`** (`CategoryFilterCards.tsx:5-15`) — per-category
counts, `selectedCategory`, `onSelectCategory`, `loading`. `allCount` is
labelled "Backend-owned total for the All chip" (`:6`). Chip geometry is
`h-7 px-3.5 rounded-pill border border-line-2` unpressed, and pressed swaps to
`bg-tint text-tint-ink font-medium` with asymmetric padding for the check mark
(`:17-21`).

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

Three fixed columns and a content area: icon rail (56px, `IconRail.tsx:40`),
an optional source list (240px default, `App.tsx:220`, clamped 200–320),
the pane, and an inspector (396px default, `App.tsx:249`, persisted under
`inspector_width`, `App.tsx:512-514`). The body is
`flex-1 flex overflow-hidden` (`App.tsx:838`).

The second column is view-dependent: Discovery renders none, review renders
`ReviewSidebar`, everything else renders `Sidebar` (`App.tsx:865-886`).

Views are switched by a single string state, not a router — `App.tsx:217`
holds `selectedSidebarItem`, persisted under `selected_sidebar_item`
(`App.tsx:851` and each rail handler).

### Window chrome — one vertical baseline

Every cap — the sidebar cap (`App.tsx:961`), the content header (`App.tsx:1052`),
the inspector cap (`App.tsx:1317`) — is `h-10 flex items-center`: a 40px band
with its contents optically centered on the same line, 20px from the cap's
top. The native traffic lights are tuned to sit on that identical line:
`trafficLightPosition.y: 22` in `tauri.conf.json:26` was set by measuring the
rendered dot centre against the sidebar toggle button's centre in a live
screenshot (dot centre landed ~8.5pt above the toggle before the fix) and is
not derived from any documented Apple/Tauri formula — the OS does not expose
one, so this value is empirical and window-height-dependent. If the cap
height (`h-10`) ever changes, `trafficLightPosition.y` must be re-measured
against it, not recomputed by formula.

Any future cap, toolbar, or menubar row must keep this same `h-10
flex items-center` shape so its contents land on this baseline by
construction, rather than each screen re-deriving its own vertical rhythm.

**Toolbar buttons must carry `shrink-0`, or a squeezed cap silently shrinks
the icon inside them.** `tbBtnClass` / `tbBtnActiveClass` / `tbBtnPlaneClass`
(`App.tsx:859-867`) all declare it. This was found the hard way: the sidebar
cap leads with a spacer (`w-[76px] shrink-0`, `App.tsx:963`) so the toggle
button stays reachable when the source list is collapsed and the cap's
content overflows its 56px rail on purpose (`App.tsx:956-960`). Without
`shrink-0` on the button, that overflow's negative free space fell through to
the button — clamped there by `min-w-[27px]` — and then into the icon inside
it, rendering the same `size={15}` icon at ~10pt instead of ~13pt with no
change to its props at all; `react-dom/server` output for the two icons was
byte-identical, so the bug was purely this missing shrink guard, confirmed by
pixel-measuring the live window before and after. Any button meant to
overflow a shrinking container needs this same guard, or its icon silently
shrinks instead of the button just overflowing as intended.

**The leading gap after the traffic lights is tuned to match the gap between
the lights themselves — not derived, measured.** The three native dots keep
~9.5pt between each other. `App.tsx:963`'s spacer (`w-[76px]`) lands the
toggle icon's own ink ~11.5pt after the dot cluster ends, and the collapsed
crumb's `pl-[51px]` (`App.tsx:1064`, only when `sidebarCollapsed`; `pl-[18px]`
otherwise) lands the breadcrumb text ~10.5pt after the icon's ink — three
gaps within ~2pt of each other, read as one uniform rhythm rather than three
independently-guessed numbers. None of these three values can be derived from
the others by formula (native traffic lights aren't in the DOM, and glyph ink
extent isn't the same as box width), so every one of them was set by
measuring a live, running window pixel-by-pixel, not by eyeballing a
screenshot or computing from CSS box models alone. If the spacer, the button
padding, the icon size, or `trafficLightPosition.x` ever change, re-measure
the live window and retune both the spacer and the crumb's collapsed padding
together — they drifted out of sync once already from being changed one at a
time.

### Pane composition

Every pane follows the same vertical order: summary strip in
`mx-[18px] mt-[18px]`, a chip row, a list plane, a foot line. The list plane
rounds only its top corners and runs off the bottom edge —
`mx-[18px] bg-plane border border-line rounded-tl-plane rounded-tr-plane`
(`ProfilePane.tsx:288`, `NeedsReviewPane.tsx:199`, `DiscoveryPane.tsx:145`).

The chip row is `flex items-center gap-[7px] px-[18px] pt-3 pb-2.5 overflow-x-auto shrink-0`
with `role="group"` and an `aria-label` (`NeedsReviewPane.tsx:168-172`,
`DiscoveryPane.tsx:116-120`).

The foot is `h-[30px] shrink-0 px-[18px] font-flex text-micro text-ink-3` with
the scan status pushed right by `ml-auto` (`ProfilePane.tsx:404-413`).

Section eyebrows are `font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3`
(`ProfilePane.tsx:229-230`).

### Repeated variants are hoisted, not computed

The house idiom is a module-level `const` class string above the component,
selected by ternary — never `clsx`, never `cva`. `railBtnClass` /
`railBtnActiveClass` (`IconRail.tsx:18-21`), `tbBtnClass` / `tbBtnActiveClass`
(`App.tsx:739-742`), `chipBaseClass` / `chipPressedClass`
(`CategoryFilterCards.tsx:17-21`).

### Scroll caps

Two independent surfaces cap a scrolling body at exactly 240px —
`DisclosureBanner.tsx:83` and the MCP tool list (@b383a08). Modal bodies cap
differently: `max-h-[85vh]` for the shell and `max-h-[350px]` for its inner
list (`SidebarScanModal.tsx:94`, `:160`). The repo pane's banner stack caps at
`max-h-[45%]` (`RepoPane.tsx:302`).

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
(`:51-52`). They are all still exported into the Tailwind namespace
(`index.css:19-91`). The brand hues are revalued to `--ink-2`
(`tokens.css:61-63`), so the names survive while their meaning has gone.

**The dark neutral ramp is partial.** Light declares `--n-0` through `--n-950`,
thirteen stops (`tokens.css:77-89`); `.dark` redefines only four, `--n-0`
through `--n-100` (`tokens.css:165-168`). Any component using `--n-200` or
darker gets the light value in dark mode. How I know: direct comparison of the
two blocks.

**`--radius-control: 6px` outlived its retirement note.** Declared at
`tokens.css:112`, and the theme block registers it while calling it retired
(`index.css:105`, `:109`).

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
it, to the vendor's monochrome `codex.svg` (`brands.ts:52`); the other ten —
`claude_code`, `gemini`, `claude_desktop`, `claude_ai`, `vscode`, `cursor`,
`windsurf`, `zed`, `copilot`, `opencode` (`BRANDS`, `brands.ts:47-65`) —
have no per-theme variant, and none is needed.

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
