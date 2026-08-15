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

### Saturated colour appears in exactly two places

System state, and the brand mark. `--brand` — `#00c3bf` light, `#2fd8d4` dark
(`tokens.css:19`, dark block) — paints the hanger mark in the rail and
nothing else; the token's own comment forbids it as a UI state. State colour
(`tokens.css:21-24`):

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

---

## 5. Component inventory

24 components, flat in `src/components/`, one per file, all default-exported
with an `interface <Name>Props` declared directly above. Views are suffixed
`Pane`.

### Shell

**`IconRail`** (`IconRail.tsx:5-18`) — `active: "machine" | "linkmap" | "discovery" | "review"`,
`needsReviewCount: number`, `darkMode: boolean`, `onSelectMachine`,
`onSelectDiscovery`, `onSelectReview`, `onOpenSettings`. Fixed 56px column
(`w-14`, `IconRail.tsx:40`). Buttons are `w-[38px] h-8 rounded-pill`
(`IconRail.tsx:19`), tonal `bg-tint` when current (`:20-21`).

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

### Panes

**`ProfilePane`** (`ProfilePane.tsx:14-34`) — `inventory`, `assetCounts?`,
`selectedCategory?`, `selectedAsset?`, `loading`, `filterText?`, `stateFilter?`,
`onStateFilterChange?`, `scannedAt?`, `onRescan?`, `sortField?`,
`sortDirection?`, `onSortChange?`, `onSelectAsset`, `onLinkAsset`,
`onClearSelection?`.

**`RepoPane`** (`RepoPane.tsx:16-40`) — the same shape plus `repoPath`,
`onRefresh`, `onLinkFromProfile`, `linkedRepos?`, `onPromoteCandidates?`.

**`NeedsReviewPane`** (`NeedsReviewPane.tsx:10-20`) — `issues`, `counts`,
`kind`, `place`, `filterText`, `selectedId`, `onSelectKind`, `onSelectPlace`,
`onSelectIssue`.

**`DiscoveryPane`** (`DiscoveryPane.tsx:13-15`) — `filterText?` only. Renders
from static data in `src/data/directories.ts`.

**`LinkMapPane`** (`LinkMapPane.tsx`, props at `interface LinkMapPaneProps`)
— `graph`, `loading`, `selection`, `onSelect`, `showProjects`,
`onToggleProjects`, `onOpenProject`, `onRescan`. The map: SVG columns at a
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
never drawn. Projects are a filter chip (CategoryFilterCards' chip anatomy,
default off, persisted as `linkmap_show_projects`); hiding them takes their
edges and re-spreads the columns (`layoutLinkGraph` `kinds` option). Node
text truncates in the middle toward the tail (`middleTruncate`) so paths
stay inside their boxes; the popover and inspector carry the full path.
Clicking a box or an edge label pins a popover (bg-page, border, no
shadow) anchored in world coordinates so it tracks the camera; its Details
action hands a `LinkMapSelection` to the inspector, and project popovers
add Open project. Geometry is a pure function: stable sort on (label, id)
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
`onVerify`, `verifying` (@b383a08).

`Flyout` is the asset inspector's coordinator and owns its own `<aside>`
(@b383a08).

The link map is the exception: it has **no inspector column**. Selection
docks **`LinkMapDetailCard`** inside the canvas instead
(`LinkMapDetailCard.tsx`: `selection: LinkMapSelection`, `nodes`,
`onClose`, `onOpenProject`) — the Apple Maps pattern, keeping
`ReviewInspector`'s anatomy at card scale: eyebrow, title, state dot and
line, path chip with copy, facts grid. The selection is an edge or a node
(`linkMapLayout.ts`, `LinkMapSelection`); node bodies state kind, asset
count and — for engines — whether the root actually reaches the store, and
project nodes carry an Open project action into the repository view. It
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

**`MechanismGlyph`** (`MechanismGlyph.tsx`) — the per-row attachment glyph:
one of five backend words (`symlink | copy | drift | broken | none`), drawn
as a 14px stroke icon with a signed one-line tooltip. The component renders
the word verbatim; deriving a mechanism from paths or link state in
TypeScript is forbidden (dispatch item 8).

**`EngineReachTiles`** (`EngineReachTiles.tsx`) — the Reach column: one 16px
tile per engine from the backend's reach list, filled when the engine reads
the asset through its linked root. Monograms are a fallback keyed by the
engines table's own keys (first letters collide); a vendor SVG drops into
the same slot without a layout change once trademark use is cleared.

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

**The DisclosureBanner rule has no detector.** AGENTS.md requires that
non-blocking diagnostics use `DisclosureBanner` and that no new banner, alert
or modal be built for warnings, parse errors or status notices. No test
enforces it: `no-blocking-dialogs.test.ts` bans only `confirm`/`alert`/`prompt`
(`:24`), and the files referencing `DisclosureBanner` under test are its own
unit test plus four feature tests, none of which asserts exclusivity. How I
know: `rg -ln "DisclosureBanner" src/__tests__/ src/components/*.test.tsx`
returns `TccRelocation.test.tsx`, `DisclosureBanner.test.tsx`,
`no-frontend-counting.test.ts`, `a6_r2_defects.test.tsx`,
`nested_repo_banner.test.tsx`. The rule is real and honoured, but by
convention only.

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
