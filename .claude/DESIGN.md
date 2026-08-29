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
| `--sidebar` | `rgba(252,252,252,.65)` | `rgba(19,19,19,.75)` | the shell's material: the left column and, since 2026-08-28, every column's cap band — a tint over the window's vibrancy (`tokens.css:6`, `:173`); dark went from .55 to .75 that day because over a bright desktop the thinner tint read as a light grey strip against the black sheet (Karthik's ruling) |
| `--sidebar-sel` | `#e6e6e6` | `#3a3a3c` | selection on the sidebar, neutral (`tokens.css:9`) |
| `--sidebar-sel-ink` | `#1f1f1f` | `#ececec` | text on `--sidebar-sel` |
| `--sidebar-ink` | `#3e4144` | `#cfd1d3` | sidebar rows and icons, one shade up from `--ink-2` |
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
`#009a97` light, `#2fd8d4` dark (`tokens.css:25`, dark block) — paints the
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
--font-sans: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;   tokens.css:65
--font-flex: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;   tokens.css:66
--font-mono: ui-monospace, "SF Mono", Menlo, monospace;                  tokens.css:67
```

Two of those three names carry one stack: `--font-flex` is declared with
the same string as `--font-sans` (`tokens.css:65-66`), so it names a role —
the utility voice of eyebrows, stamps and chips — not a second face. No
webfont is loaded; on macOS the stack resolves to the system UI face, and
the page's Typography section (§9) shows all three stacks read from the
running theme rather than restating them.

The scale is closed at five steps — 11 / 12 / 13 / 16 / 32
(`tokens.css:68-72`, registered as `text-micro`, `text-small`, `text-base-app`,
`text-lg-app`, `text-display` at `index.css:97-102`). Two weights only:
`--fw-regular: 400`, `--fw-medium: 500` (`tokens.css:73-74`).

The five sizes carry roles, not free choice — the inspector, the pane list,
the sidebar family and Discovery were audited against the scale and each size
given one job (`docs/v7-todo-content-typography/typography-audit.md`;
rulings recorded in `src/__tests__/type-roles.test.ts:9`, 2026-08-27):

| Size | Role | Ink | Utility | Source |
|---|---|---|---|---|
| 13 | body — labels, values, prose, list names, tabs | `--ink-1` for values and prose, `--ink-3` for labels, `--ink-2` for a row's prose under its mono name | `text-base-app` | `rowLabelClass`, `rowValueClass`, `sectionHeadClass`, `groupLabelClass`, `rowProseClass` (`typeRoles.ts:7,9-10,14,20`) |
| 12 | secondary — captions, mono values, paths, chips, counts, foot and stamp lines | `--ink-1` for `rowMonoClass` values, `--ink-2` / `--ink-3` for captions and grey mono labels | `text-small` | `captionClass`, `rowMonoClass`, `monoLabelClass`, `columnHeadClass` (`typeRoles.ts:15-16,20,24`) |
| 11 | filled badges and chips | `--ink-3` | `text-micro` | e.g. the inspector list's scope pill (`Flyout.tsx:919`) |
| 16 | titles and top content headings | `--ink-1` | `text-lg-app` | the inspector's title `h2` (`Flyout.tsx:705`), a document's `#` and `##` (`MarkdownDoc.tsx:89`); `###` and deeper step down to `sectionHeadClass` (`:93`) |
| 32 | display — the big stat numeral | `--ink-1` | `text-display` | `SummaryStrip.tsx:98` |

Four leadings sit beside the scale as tokens, not arbitrary per-call values —
`--lh-body: 20px`, `--lh-caption: 16px`, `--lh-code: 18px`, `--lh-display: 35px`
(`tokens.css:80-83`), registered as `--leading-body`, `--leading-caption`,
`--leading-code`, `--leading-display` (`index.css:109-112`) and consumed as
the utilities `leading-body`, `leading-caption`, `leading-code`,
`leading-display` — the last for the 32px strip figure
(`SummaryStrip.tsx:98`, `NeedsReviewPane.tsx:102`, `DesignSystemPane.tsx:192`).
`src/__tests__/leading-tokens.test.ts` pins both the token values and their
`@theme` registration.

Section heads inside the inspector, Discovery's tiers, and the pane list's
column and group headers are sentence case, not the former 11px uppercase
eyebrow — `text-base-app font-medium text-ink-1` (`sectionHeadClass`,
`typeRoles.ts:7`; used at `DiscoveryPane.tsx:256` and `AssetHeaderRow.tsx:31`;
Karthik's ruling R1, 2026-08-27). `src/__tests__/type-roles.test.ts` enforces
this going forward: it bans Tailwind's default size names, arbitrary or
default leading utilities, and `uppercase` across the migrated files named in
its `ROLE_FILES` list.

Body text is set in `--font-sans` at the document root with
`-webkit-font-smoothing: antialiased` (`index.css:510`).

A `tabular` utility exists for figures that must not jitter as they change
(`index.css:157-159`) and is applied wherever counts render.

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
for controls (`:68`), and `--radius-control: 8px` (`:161`) — no longer
legacy. Karthik ruled 2026-08-23 that buttons take two radii chosen by
size, not by role: a normal button (30px) stays `rounded-pill`, unchanged;
a mini button (26px) takes `rounded-control`, so the mini tier reads as
its own control rather than a shrunken pill. The value was 6px until
2026-08-28, when Karthik raised it by two — rounder, the way Codex's
small buttons are, and still short of a pill; the finding chip moves with
it, since `FindingChip.tsx:83` builds the chip from `miniBtnClass`. All four are registered as
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
--spring: cubic-bezier(0.2, 0.85, 0.25, 1);   tokens.css:80
--dur-hover: 160ms;                            tokens.css:81
--dur-nav:   180ms;                            tokens.css:82
--dur-press: 200ms;                            tokens.css:83
```

Tailwind v4 durations are not themeable, so the three beats are declared as
first-class utilities instead — `duration-hover`, `duration-nav`,
`duration-press` (`index.css:138-146`) — alongside `ease-spring`
(`index.css:124`).

Four entrance animations exist, each with a stated physical rationale:
`animate-drop` for a sheet falling from the title bar and `animate-rise` for a
toast from the foot (`index.css:234-239`, keyframes `:272-281`, `:300-309`);
`animate-tip` for tooltips, which scales from `0.97` rather than `0` because
"nothing in the world appears from nothing" (`:285-297`); and `animate-fade-in`
(`:259-269`), the one with no geometry, for a scrim — which has no edge to
arrive from and no size to settle into, so opacity is the whole of its motion.
It runs on the press beat like the two sheets, so a scrim and the sheet it
backs land together, and on `ease-out` rather than the spring, since a curve
is invisible on a value that only travels 0 → 1.

`animate-fade-in` was named by eight elements for some time before it existed.
Tailwind emits nothing for a class it does not recognise and reports no error,
so those elements simply rendered with no animation and nothing went red;
`animate-in`, `zoom-in-95`, `fade-in` and `slide-in-from-bottom` sat on seven
more, all from the `tailwindcss-animate` plugin, which this project has never
installed. `src/__tests__/animation-classes-resolve.test.ts` is the control:
every `animate-*` a component applies resolves to a declared utility or a
Tailwind built-in, and the plugin's vocabulary appears nowhere.

**The one layout property that animates.** The rail column eases its width on
collapse (`App.tsx`, `transition-[width] duration-nav` on `[data-rail-column]`)
because its children have to reflow into the new size — a transform would scale
them. `sidebarWidth` has a second writer, though: the resize handle, which
writes it on every mousemove. Against a live transition each of those writes
restarts a fresh interpolation, so the column eases toward a target the cursor
has already left and trails it for the whole drag. `SourceListShell` marks the
drag on `document.body` and `index.css:226-228` turns the transition off while
the mark is set — a transition belongs to a state change, never to a value the
user has hold of. The source list inside carries no width transition at all: it
unmounts on collapse, so one there could only ever have animated the drag.
Pinned by `src/__tests__/sidebar_resize_motion.test.tsx`, whose class-contract
half is explicit that happy-dom cannot show the transition actually stopping.

All motion is removed under `prefers-reduced-motion: reduce`, transitions and
animations both, with `!important` (`index.css:504-510`).

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

One global focus ring: a 2px `--ink-1` outline at 2px offset
(`index.css:518-521`). It sets no radius of its own: an outline takes the
element's corners, so the ring is a pill around a pill field and a 16px
plane around a plane. Until 2026-08-29 the rule also forced
`border-radius: 4px` on the element, and being unlayered it beat every
`rounded-*` utility — the palette's pill field snapped to 4px corners the
moment it took focus; `SearchPalette.test.tsx` pins the rule's text. `touch-action: manipulation` is set on buttons and
`[role="button"]` to drop the 300ms double-tap delay without disabling pinch
zoom (`index.css:536-539`). The app's one stated exception is the search
palette's input: it already sits inside a framed, single-purpose dialog, so it
opts out of the global rule; the pill field's own focus treatment — a
`--line-2` border, a page ground (`focus:border-line-2 focus:bg-page`) — is what signals
focus instead of a second ring drawn inside the panel's frame. The opt-out is
an **unlayered** CSS rule, `[cmdk-input]:focus-visible { outline: none; }`
(`index.css:530-532`), not a Tailwind utility: the global ring above is itself
unlayered, Tailwind's utilities live in `@layer utilities`, and an unlayered
declaration always outranks a layered one regardless of specificity (CSS
Cascade 5) — a `focus-visible:outline-none` class on the input cannot win
against it (`SearchPalette.tsx:132-137`).

---

## 4. Icon system

Icons are not used raw. Every export in `src/components/icons.tsx` is wrapped
in `sized()` (`icons.tsx:122`), which does two things a plain import cannot.

**Stroke compensation.** Heroicons' outline set is drawn on a 24px grid at 1.5
stroke; at this shell's working sizes (12–16px in the shell, 20+ in empty
states) the smallest of them thins to ~0.75px and goes soft. `strokeFor()`
is one continuous rule, not size bands: `Math.max(1.5, 24 / box)` rounded to
two decimal places (`icons.tsx:104-106`). That lands the stroke at 1.0px for
a 16px box — the reference marks measure exactly 2 device px at 2×
(`docs/v7-todo-content-typography/icon-weight-review.md`) — and floors it at
the family's own 1.5 weight above 16px, where a mark's optical factor can
push its box past 16 and the stroke settles a little heavier: the rail's
1.12 marks land at 1.12px, measured 2.21 device px at 2×
(`docs/evidence/2026-08-28-icons/icon-stroke-measurements-after.txt`).

**Optical correction.** A per-mark `optical` ratio corrects for how much of the
24 grid each mark actually inks, because a 1:1 family swap inherits the
difference — most visibly in the icon rail, where four marks stack at one size
and any mismatch reads as a wobble (`icons.tsx:107-118`). The factors are stated
as measured ink-extent ratios, not estimates, and anything within 4% is left at
1. Examples: `ChevronDownIcon` 0.81 (`icons.tsx:146`), `Square2StackIcon` 1.2
(`:188`), `Cog6ToothIcon` 1.12 (`:152`).

The family is Heroicons 24/outline (`icons.tsx:30-79`), with seven static
marks on lucide because Heroicons has no equivalent: `FolderSymlink`,
`FolderTree`, `GitMerge`, `PanelLeft`, `PanelRight`, `Maximize2`, `Minimize2`
(`icons.tsx:81-89`, exported `:185-194`). Default size is 16 (`icons.tsx:95`).
The Design system page's Iconography section (§9) rosters every export of
this module by name and shows the stroke ladder by calling `strokeFor`,
which is exported for that one reader (`bc1c3c8`, 2026-08-28).

**Size and ink by role.** Three sizes cover the shell: 16 for shell marks —
the rail (`IconRail.tsx:73`), sidebar rows (`Sidebar.tsx:154`), the
inspector cap's kind icon (`InspectorCap.tsx:202`) and the titlebar panel
toggles (`InspectorCap.tsx:373`) — 14 for row marks (`AssetDetail.tsx:275`'s
identity rows, `MechanismGlyph.tsx:85`), and 12–13 for chevrons and inline
marks (`AssetHeaderRow.tsx:36-38`, `Flyout.tsx:734`; `InspectorCap.tsx:259`
carries a 13) (Karthik's ruling I2, 2026-08-28). A mark also takes the ink of
the text beside it rather than a fixed shade of its own: the cap's kind icon
sits in `--ink-3` (`InspectorCap.tsx:202,205`; ruling I3), and the row's
mechanism glyph does too in its unflagged states — symlink, copy, none
(`MechanismGlyph.tsx:21,22,25`) — while drift and broken keep their state
colour instead of following the ink ladder, `--state-warning` and
`--state-danger` (`:23-24`), ruling I4's stated exception.

Twenty more marks are animated, and every one of them is lucide too — not
because Heroicons lacks their geometry, but because it has no motion story,
and Ruling 3 (`docs/v5-animate-icons/00-state-inventory.md` §1) settled the
family question for all of them at once rather than per mark: looping marks
(`Disc3Icon`, `FolderSyncIcon`, `LoaderCircleIcon`, `RotateCcwIcon`,
`ServerRelayIcon`, `FrameIcon`, `FileTextIcon`, `Link2Icon`,
`icons.tsx:417-512`) spin or redraw only while `active`; entering marks
(`FolderClockIcon`, `PackageOpenIcon`, `FolderXIcon`, `SearchIcon`,
`InboxIcon`, `PlugZapIcon`, `ZapOffIcon`, `UnlinkIcon`, `MousePointerClickIcon`,
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
The inspector's Reach card groups by **route** rather than by engine
(`ReachCard.tsx`). `ROUTES` is the reading order — "Through a symlink",
"Read directly", "Not linked", "Another engine's format" —
each derived from fields `annotations.rs` already returns: reached with a
`via_root`, reached without one, a miss for any reason but `format`, a
`format` miss. A route nobody takes is dropped (`:64-66`), so the card never
heads an empty run, and four is the ceiling because the backend emits exactly
those shapes.

A route's reason is stated once, on its row, leaving the engines that take it
to carry identity alone. "Another engine's format" names a cause rather than a
failure: that reason fires when the asset belongs to a different engine, so
nothing is missing. The engines are 22px plates wrapping past `max-w-[236px]`
(`:123`), so nine sit on one line at a `gap-1` and the tenth wraps rather than
clipping — which leaves the label column 88px, where the longest label runs to
three lines. A reached plate is the mark on `bg-plane`; an unreached one is a
`border-line` ring at `opacity-40`, the same absence rule the Reach column's
tiles follow; the selected plate is `bg-tint`, and an unreached one comes up to
full strength with a `border-line-2` ring when selected so the tint reads
through the dimming (`plateClass`, `:42-47`). Hover never borrows the selected
colour, so pointing at a plate cannot impersonate pressing it.

One footer inside the card, on `bg-plane`, answers for the selected plate
(`reach-answer`, `:156-170`): the engine's own root folded to `~` by
`abbreviateHome` (`prose.ts`), "in place" for a store engine with no link, or
"not linked" / "cannot read this format" for a miss (`answerFor`). At rest
it answers for the first plate in reading order and that
plate is genuinely selected — never empty, never an instruction. Selection is
per asset: `AssetDetail` keys the card by `asset.path` (`:698`), which is the
only thing that resets it, since `Flyout` renders the panel unkeyed. The store
is still named once, in the cap (`AssetDetail.tsx:692`), safe by construction —
`via_store` is keyed off the asset's own root, so every reached engine reports
the same value.

The first three route labels are Karthik's ruling of 2026-08-28, re-taken
after he read them in the running app: "symlink" is the mechanism's true
name and the reader knows it, while "root" was Hanger's own noun asking to
be learned before a row could be read. The middle row is worded positively
— "No symlink involved" was accurate but states an absence, directly above
another absence that means failure, so the words would have fought the
plates. "Another engine's format" keeps its August wording and its length:
it names a cause rather than a fault, and "Wrong format" would make a
non-problem read like an error. The `root_not_linked` footer value moved
with its label, to "not linked", so a row and its own answer cannot
disagree.

The plates are one composite widget, not one control each: the card is a
`role="radiogroup"` (`:111`), each plate a `role="radio"` with `aria-checked`
and a roving `tabIndex` (`:133-140`), so Tab reaches the group once and lands
on the selected plate while arrows move and select, Home and End jumping to the
ends. That is the model `SegmentedTrack.tsx:82-101` already uses, with the role
changed because these plates are interleaved with the route labels that give
them meaning and a tablist should own only tabs. Deliberately not
`aria-pressed`, which is for a binary toggle — both of its uses in `src/` are
(`FavouriteHeart.tsx:39`, `AssetDetail.tsx`, the source-view switch) — and
which on thirteen exclusive plates would announce one "pressed" and twelve
"not pressed" without ever saying they are one choice.

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
32×32 `rounded-soft`, neutral `bg-sidebar-sel` when current (`IconRail.tsx:21-24`).
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

**`Sidebar`** (`Sidebar.tsx:13-30`) — `width`, `setWidth`, `collapsed`,
`setCollapsed`, `selectedItem`, `setSelectedItem`, `inventory`, `assetCounts`,
`detectedEngines`, `linkedRepos`, `loadLinkedRepos`, `onRefreshGlobalCounts?`,
`setError`, `onOpenSearch` — opens the search palette, wired to the sidebar's
own Search row above Scope.

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
`selectedCategory?`, `selectedAsset?`, `loading`, `stateFilter?`,
`onStateFilterChange?`, `scannedAt?`, `detectedEngines?`, `onRescan?`,
`sortField?`, `sortDirection?`, `onSortChange?`, `onSelectAsset`,
`onLinkAsset`, `onClearSelection?`.

**`RepoPane`** (`RepoPane.tsx:18-42`) — the same shape plus `repoPath`,
`onRefresh`, `onLinkFromProfile`, `linkedRepos?`, `onPromoteCandidates?`.

**`NeedsReviewPane`** (`NeedsReviewPane.tsx:11-29`) — `issues`, `counts`,
`kind`, `place`, `selectedId`, `onSelectKind`, `onSelectPlace`,
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

**`DiscoveryPane`** (`DiscoveryPane.tsx`) — `kind?`. Renders
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
(`sectionHeadClass`, `AssetDetail.tsx:435`; a plain `<h3>` on the MCP side,
`sectionHeadClass`, `McpServerDetail.tsx:891`) above a `ListCard`/`ListCardRow`
stack.

**The identity row moved out of the panel and into the cap; what survives
above the tabs is three pieces with nothing between them.** Selecting an
asset used to earn Flyout's eyebrow row a `kind · place` pair; `targetAsset`
now renders `null` there instead (`Flyout.tsx:740-748`), because that
identity lives in the cap and restating it a second time would be "the
'moved, never copied' rule's exact failure mode" (the panel's own comment,
`Flyout.tsx:669-675`). For a plain asset selection the eyebrow row now has
nothing left to say at all: `eyebrowShown` is `false` whenever nothing but a
bare `targetAsset` would have earned it (`Flyout.tsx:598-600`), so the row
simply does not render — and the step it would have opened up beneath the
title goes with it, because that step is the header column's own `gap-1`
(`:696`) rather than a margin either row carries and has to switch off. The
eyebrow still renders for what is not a plain asset selection — the link
flow's own "Back to ‹name›" nav (`:728-736`), a bubble scope with no asset
drilled into, or the empty-MCP category label — plus, independently, a
layered-rules flag that can sit beside any of them.

Below that, the header is exactly: the cap's identity row — kind glyph, a
sentence-case `kind · place` caption line, a finding chip
(`InspectorCap.tsx:169-212`; the caption itself is `captionClass`,
`typeRoles.ts:16`, rendered at `InspectorCap.tsx:220-228`; the cap itself,
Surfaces and controls below) — then Flyout's title block
(the `<h2>`, `Flyout.tsx:705`), then `AssetDetail`'s own `UnderlineTabs`
switch. Nothing else: `AssetDetail` used to open with a state line, a path
chip and a Link/Open action row, each behind its own `border-b border-line`,
all now gone — the render goes straight from the panel's outer div to a
comment recording the move and then the tab switch, with no hairline of its
own left in that gap (`AssetDetail.tsx:346-358`). One hairline still stands
in the assembled header: Flyout's own `border-b border-line`, beneath the
title and above the tabs (`Flyout.tsx:697`) — untouched by this phase, and it
falls between the title and the tabs, not between the cap and the title,
where nothing separates them at all.

**The inspector opens like every other screen, and its title sits on the
rhythm.** The header is `pt-[18px] pb-1.5` and the tab labels are `py-2`
(`Flyout.tsx:697`, `UnderlineTabs.tsx:62`): 18 from the sheet's rule to the
title block, the same 18 the block keeps from its sides, and 6 + 8 = 14 from
the title block to the tab labels — the gap every pane uses under its
opener. Ruled 2026-08-28 ("make it consistent") after a day at `py-2`, which
had put the title 8 under the rule while every pane had just moved to 18.
`ReviewInspector`'s title block opens at the same `pt-[18px]`
(`ReviewInspector.tsx:95`). The rest of that measurement stands as recorded —
measured on the running build at
1173×808 — and re-measured there unchanged after `bcc98a8` moved the
eyebrow below the title — that lands 28px of ink-to-ink air above the title
and 24px below: even enough to read as one rhythm, and closer below so the
title belongs to the tabs beneath it rather than floating between two
bands. It read `pt-2 pb-4` with the labels at `pt-2 pb-2.5` until 2026-08-28, when Karthik
called the stack inconsistent; the values are a rule now rather than four
independently chosen numbers. The body's own sections keep the same gutter
by a different route, and the raw class misreads: they carry `mx-[12px]`
(`AssetDetail.tsx:420` and its siblings), but they sit inside the scroller
that pairs `scroll-gutter-stable` with `scroll-thin`, which reserves the
custom scrollbar's 6px on each edge (`index.css`, both utilities' notes) —
12 plus 6 is the header's 18. Measured on the same window: the card's border
lands 19px from the panel's edge against the title's and the tab's ink at
20px, the 1px being the border sitting outside the ink. Anything that
changes the scrollbar width has to move that 12 with it.

**The cap sheds two things, in order, when it does not fit, and none of it
runs under test.** After every render, one effect compares the row's own
`scrollWidth` against its `clientWidth` and climbs one rung — sheds `Link
to…` first, the finding chip second — when the row overflows
(`InspectorCap.tsx:149-156`); at the second rung, where the chip has gone,
the kind glyph's state dot takes over as the only mark on the surface saying
a finding exists, and it draws at no other width (`:184`). A second,
separate effect holds a `ResizeObserver` on the same row purely to catch it
growing back, resetting
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
The markdown parser (`skillDocument.ts:410`, `toBlocks` `:514`) covers what a
census of the 384 skill, rule and subagent files in the store found in use
(2026-08-29): nested and task lists, pipe tables, blockquotes, rules, hard
breaks, and inline code, `*`/`_` emphasis, strikethrough, escapes and links —
still plain data into React elements, never an HTML string, and only http(s)
survives as a destination (`:190-216`). A table is a `<table>` on `--line`
row rules with a `--line-2` head rule (`MarkdownDoc.tsx:121-148`); a quote is a
2px `--line-2` left rule in `--ink-2` (`:154`); a rule is a `--line` hairline
(`:160`); a task item's box is 14px, `--radius 6px`, reporting state with
`role="checkbox"` and taking no input — the file is the truth (`:54-66`).
For a skill specifically, a `Context` section sits above the document and
states what the skill costs to have around: name and description always
loaded, the whole file's size when it is opened, and an estimated token
figure the row itself labels as one (`:364-385`). This differs from the MCP
side's `Context per request` (below) by design — a skill's cost is paid
once, on open; a server's is paid on every request, hence the different
eyebrows.

**`AssetDetail` (`AssetDetail.tsx`), Details tab.**
- **Identity** is conditional throughout: **every row except Path appears only
  when the fact it reports exists**, so the card never pads itself with a
  constant (Karthik's audit and rulings, 2026-08-28).
  - **Engine** only when an engine owns the asset (`scopeAgent`, `:288`).
    `scanner.rs` empties the scope's agent for anything in the shared store,
    which is what made this row read "Any agent" for every skill on a
    store-convention machine. It stays for the assets an engine does own —
    both global rules on a real machine name one — because ownership is
    exclusive and no other row states it. Reach answers who can *read* the
    asset, a different question (`docs/harness.md`).
  - **Scope** only for a repo scope, carrying `Project` or `Local` rather than
    the repo's name (`scopeKind`, `scopeAccess.ts`; row `:311`). `AssetDetail`
    is reachable only from the Global pane and a repo pane, both scope-filtered,
    so the old `placeOf` value was constant wherever it appeared — and it folded
    away the one distinction the data holds: committed and shared with the team
    versus declared in a machine-level file and private to this user
    (`domain.rs`). Derived from the scope, not the viewing context, so it stays
    true if a surface ever lists mixed scopes.
  - **Version** only when the file declares one (`:354`). `scanner.rs` used to
    fill an absent version with the literal `v0.0.0-draft`, putting a value on
    screen that no file had written — 304 of 350 skills on a real machine. It
    now emits an empty string, which this row and the Flyout list's chip both
    already treat as absent.
  - **Modified** from `modified_ms`, dropped outright when the platform
    reported no mtime rather than rendering a fabricated date (`number | null`
    on the frontend, `Option<i64>` on the backend, `lib.rs:1447`).
  - **License** is the only spec field the card shows (`:262`). `SPEC_FIELDS`
    holds six keys; name and description are the title block, allowed-tools is
    Capabilities, and compatibility and metadata were dropped 2026-08-27 — so
    the filter chain that used to stand here resolved to one conditional row.
  - **Path** is last and unconditional — every other row says something about
    the asset, this one says where it is: `documentPath ?? asset.path` in a
    `<bdi>`.
  - A Size row was removed 2026-08-27; Contents and the Context ledger already
    carry the bytes. `asset_detail.test.tsx`'s "Identity is one list card in
    the ruled order" pins the order against a fixture owned *and* repo-scoped,
    which is the only shape where every conditional row renders at once.
- **Contents** lists a skill's folder, one row per top-level entry — but only
  from the second entry onward (`:627`). A folder holding nothing but
  `SKILL.md` draws no card: that entry is the document the Content tab is
  already showing, and the Path row above has already said where it is. On a
  real machine that is 66 of 128 store skills; the other 62 carry
  `references/` or `scripts/`, where this card is the only place the structure
  is visible (Karthik's ruling, 2026-08-28).
  A directory states how many files sit beneath it; a file
  states its size; a symlink states neither — `LinkIcon` and an em dash —
  because `list_asset_dir` classifies every entry with `symlink_metadata` and
  never follows the link, so nothing on the far side of it was ever read
  (`lib.rs:1569`, doc comment `:1547-1555`).
- **Capabilities** lists the skill's declared `allowed-tools`, one row each;
  a tool beginning `Bash` carries the value `Shell access`, every other tool
  carries none (`:500-516`, the rule `:512`).
- **Reach** groups every engine the backend holds a verdict for by the route
  it takes: through a symlink, read directly, not linked, another engine's
  format (`ReachCard.tsx`, `ROUTES`; rendered from
  `AssetDetail.tsx:698`). One `→ store` figure sits beside the eyebrow, keyed
  off the asset's own root so it cannot disagree with the rows beneath it
  (`:690-694`), and a footer inside the card answers for the selected plate.

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
- **The tool list** — no header, no schema column, no per-tool figure:
  one `ListCard` row per tool holding its name in `rowMonoClass` at medium
  weight — the anchor above prose of the same size — and, when the server
  sent one, its description as prose beneath (`ProbedToolList`, `:387-422`). The description is `rowProseClass` — body size and leading
  in `--ink-2`, one ink down from the name it explains — and goes through
  the Content tab's parser (`toBlocks` → `Blocks`, `MarkdownDoc.tsx:81`), so a
  server's paragraphs, bullet lists and backticked parameter names render
  rather than collapsing into one run. Until 2026-08-29 it was the caption
  role in a single `span`, which set a 2.7 kB description as thirty grey
  lines at 12px; Karthik's ruling that day, from a three-option study on
  descriptions in the store. The section's accounting lives in the
  Context-per-request ledger above, not in the rows.

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

**`ReachCard`** (`ReachCard.tsx`) — the inspector's Reach section: route rows
of pressable engine plates over one footer that answers for the selected one.
A `radiogroup` of `radio` plates with a roving `tabIndex`, so the whole set is
a single tab stop. Owns the selected engine; keyed by asset path by its one
caller, `AssetDetail`.

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

**`SearchPalette`** (`SearchPalette.tsx:205-272`) — the ⌘K search palette: a
full-screen wash (`:253-259`) behind a top-aligned, 560px panel (`:119-123`)
built on `cmdk`'s `Command` with `shouldFilter={false}` (`:124`), so the row
order on screen is always the backend's own rank, never a client-side
refilter. The input's accessible name is "Search assets" (`:267`); queries
are debounced 80ms (`DEBOUNCE_MS`, `:76`) before they reach `search_assets`.
The palette now speaks Hanger's own source-list voice rather than the
borrowed command-menu idiom (Karthik's ruling, 2026-08-29): the head is a
tonal pill field shaped like the sidebar's own rows, and the list beneath it
stacks 46px `rounded-pill` rows that tint on selection exactly as an asset
row does (`Sidebar.tsx:230-235`'s `h-[46px] rounded-pill … duration-nav
ease-spring`; `AssetRow.tsx:170`'s `isSelected ? "bg-tint" : rowClass`).
The head dropped the borderless 52px command-menu row for a `p-3` wrapper
around a `relative h-[30px]` field (`:125-126`): the magnifier sits
absolutely at `left-2.5`, vertically centred, at `size={12}` (`:127-131`),
and `Command.Input` itself carries `rounded-pill border border-transparent
bg-plane pl-[30px] … focus:border-line-2 focus:bg-page` (`:139-145`) — the
same tonal field the shell's cap carried before 2026-08-28. The input opts
out of the app's one global focus ring, because the pill's own focus
treatment (a `--line-2` border, a page ground) is the affordance now, not a second
ring. The opt-out is an unlayered rule, `[cmdk-input]:focus-visible`
(`index.css:530-532`), not a Tailwind class — a `focus-visible:outline-none`
utility is layered under `@layer utilities` and cannot outrank the unlayered
global ring (CSS Cascade 5), so the input's `className` carries no focus
utility at all (`:144`); a comment at the input row explains why
(`:132-137`; see §3 "Focus" for the same exception).
It opens from the rail's Search button, placed beneath the mark and above the
places because the palette is an action over the whole machine rather than
one screen (Karthik's ruling, 2026-08-28, superseding the earlier placement
beneath Needs review) (`IconRail.tsx:66-74`) — the button takes
`railBtnClass` like every other rail control but never `aria-current`, since
it is an action, not a place (`:14`, `:71`) — or from ⌘K, the second branch
of the shell's keydown effect (`App.tsx:562-565`). The expanded sidebar
carries the same action as its own row, above the Scope group label: the
row idiom's 46px height and `rounded-pill`, but with no selected state — a
`role="button"` action never reads as current (`Sidebar.tsx:121-140`).
Rows sit under a heading per kind rather than leading with a glyph
(Karthik's ruling, 2026-08-28, superseding "glyph rows, no headings"):
`GROUP_ORDER` fixes both the five headings' text and their order — Skills,
MCP servers, Tools, Rules, Subagents — and each hit is placed into its
kind's group with the backend's rank order untouched within it, so a kind
with no hits contributes no group at all (`:38-44`, `:112-116`). Each group
is a `Command.Group`, given `aria-label` directly rather than cmdk's own
`heading` prop, so the heading is a plain `<div>` built from
`groupLabelClass` (`typeRoles.ts:9`) in the sidebar's own `grpClass` shape
(`Sidebar.tsx:111`) — `flex items-center px-3 pb-[5px]` plus the imported
`text-base-app text-ink-3`, `pt-1` for the first group and `pt-[11px]` for
the rest — sentence case and muted, and Tailwind tokens apply to it directly
instead of through cmdk's `aria-hidden` heading slot (`:164-169`). Each row
is now `h-[46px] px-3 rounded-pill flex flex-col justify-center gap-0.5
cursor-pointer hover:bg-plane data-[selected=true]:bg-tint …` in place of the
command-menu's `px-3.5 py-2.5 rounded-inner … data-[selected=true]:bg-plane`
(`:176`); a selected row wins over a hovered one not because of the order the
two classes are written in but because Tailwind's compiled output places the
`[data-selected=true]` rule after the `:hover` rule for these two utilities
(equal specificity otherwise) — confirmed by inspecting the built
`dist/assets/index-*.css`, where `.hover\:bg-plane:hover` precedes
`.data-\[selected\=true\]\:bg-tint[data-selected=true]`. The name and the
"· server" span stay `text-base-app`; the place chip and the snippet line
both moved onto `captionClass` (`typeRoles.ts:16`) in place of their own
`text-micro`/`text-small text-ink-2` pairs, and the place chip keeps its
`pl-4` so it never crowds a long name (`:178-187`). The list container
itself carries no `flex flex-col gap-px` of its own (inert there: cmdk
renders `<div cmdk-list>…</div>`, so a gap on `cmdk-list` separates nothing)
but reaches into each group's own items wrapper — cmdk renders a
`Command.Group`'s children inside a `[cmdk-group-items]` div, one per group,
so the gap that used to sit on the list's single sizer repeats itself once
per group instead, now `gap-px` to match the sidebar's own row stacking:
`[&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-px`
(`:148`).
A hit's snippet arrives with matched runs wrapped in private-use markers
(`search.rs:29-30`) that `renderSnippet` turns into `<mark>` (`SearchPalette.tsx:47-60`,
the tag at `:53`); the base stylesheet zeroes the browser's default yellow
highlight so only the palette's own styling shows through (`index.css:148`).
Ranking and counts are entirely backend-owned: `search::search` runs FTS5
with bm25 weighted 8/3/1 across name, description and body (`search.rs:241-250`)
and returns both the ranked `hits` and a separate `total` from a plain
`count(*)` (`:233-239`, `:275`), exposed as the `search_assets` command
(`lib.rs:1872-1875`) and kept current by two call sites: after a scan
completes (`lib.rs:1366`), and after an MCP probe answers, cached or fresh
(`:643-649`). Picking a hit calls `onPick`, wired to
`openSearchHit`, which switches screens and then calls
`handleSelectAsset(asset, screen)` with the target screen passed explicitly
rather than read from state, because a pick can change screens in the same
tick a stale read would miss (`App.tsx:1044-1052`, `:1122-1140`). A pick
always lands the inspector on the asset's primary tab — Content, or Tools
for an MCP server — and centres its row, overriding whatever tab the
inspector remembers and the plain `nearest` scroll a row click keeps
(Karthik's ruling, 2026-08-29): `openSearchHit` bumps a `landingNonce` before
calling `handleSelectAsset(asset, screen, "search")` (`App.tsx:1133, 1135,
1139`); `Flyout` owns the tab itself, as `inspectorTab` state passed to each
panel through a controlled `tab` prop that neither panel copies into local
state or reads only at mount, so an effect resetting `inspectorTab` to
"primary" whenever `landingNonce` changes is enough to move an
already-mounted panel, with no remount (`Flyout.tsx:143-157, 828, 839`); and
`AssetRow` reads the selection's origin
from `SelectionOriginContext` to choose `scrollIntoView`'s `block`, `"center"`
for `"search"` and `"nearest"` otherwise (`AssetRow.tsx:163, 172`). As
committed, the list carries three copy states: "Results show up here once
the first scan finishes." before the first scan, "Type to search names and
what's inside." for an empty query, and "Nothing matches “{q}”." for a query
that answered empty (`SearchPalette.tsx:150-156`). The shell's cap no
longer carries a search field: its trailing-controls block runs straight
from the breadcrumb to Rescan or the view control, with no input between
them (`App.tsx:1619-1621`). The dialog panel itself is `SearchPalettePanel`
(`SearchPalette.tsx:100-196`), a presentational split with no `invoke`,
timers or window listeners of its own: the app renders it inside the wash
with live state, and the Design system page renders the same component with
`SAMPLE_SEARCH_HITS` (`designSystemFixtures.ts:184`) and a fixed query,
never the app's own "Search"/"Search assets" names
(`DesignSystemPane.tsx:202-216`, `:963-965`).

**`InspectorCap`** (`InspectorCap.tsx`, props `:44-70`) — the inspector
column's 40px cap, and since this phase the selected asset's identity as
well as the two panel-level controls it used to hold alone: a kind glyph —
dotted only at the width where the finding chip has shed into the menu, so
the two never state the same finding at once (`:184`) — a sentence-case
`kind · place` eyebrow (`captionClass`, `InspectorCap.tsx:223`), a finding
chip, then `Link to…`, a ⋮ overflow (`OverflowMenu`,
above), and
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
(`MarkdownDoc.tsx:175`, takes `blocks: Block[]`), **`ScanStatusIndicator`**,
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

**The band and the sheet (2026-08-28).** The three caps sit on one
material, and it is painted exactly once under each: the rail column keeps
its `bg-sidebar` (`App.tsx:1456`), and `<main>` and the inspector `<aside>`
now carry `bg-sidebar` too — with a *sheet* on top of it,
`absolute inset-x-0 top-9 bottom-0 -z-10 bg-page border-t border-line`
(`sheetClass`, `App.tsx:1442-1443`; `data-testid` `content-sheet` at
`:1635`, `inspector-sheet` at `:1898`), so the page ground starts under the
36px cap rather than behind it, with the `--line` rule along its top. Each
column is `isolate`, so `-z-10` puts the sheet above the column's own tint and
below its content. Nothing paints the band across columns: a first version
had the shell root paint a full-width gradient under the columns, and the
rail column's own tint stacked on it — the cap over the sidebar came out a
step darker than the cap over the content, with a hard edge at the rail and
the corner sitting on the darker patch, worst in dark. One token, one paint
per column, no gradient (Karthik's rulings, 2026-08-28: flat, not option B).

Exactly one column after the icon rail draws the sheet's left edge and its
16px top-left corner (`border-l rounded-tl-plane`), the treatment
`SourceListShell` has always given the source list (`SourceListShell.tsx:107`):
the source list when it is open; otherwise `<main>` (`mainLeads`,
`App.tsx:1431` — collapsed, or the link map, which has no source list); and
when `<main>` is `hidden` behind an expanded inspector, the inspector
(`asideLeads`, `:1432`). The inspector's full-height `border-l` divider
exists only beside `<main>` — expanded, its left edge is the source list's
or the rail's, and a line there would run up through the band
(`App.tsx:1896`). `src/__tests__/window_chrome_sheet.test.tsx` pins the
class contract for all four states and that no column tints twice; that the
corner meets the rail is a screenshot claim, `happy-dom` lays nothing out.

**Every screen carries the corner.** My machine, the link map, Discovery,
Needs review and the Design system page all open on the same sheet, and the
corner is part of the shell, not of any pane: a pane must not paint its own
full-bleed `--page` ground, because that squares the curve off from inside
(`NeedsReviewPane`, `DiscoveryPane`, `LinkMapPane` and `DesignSystemPane`
did until 2026-08-28; the sheet is the ground now). The same holds for the
inspector column when it leads — expanded over a collapsed source list —
so `Flyout` and `ReviewInspector` paint no ground either (they did, and the
corner Karthik asked for was square there until the same day). Karthik's standing
instruction, 2026-08-28: **a new screen gets the corner by default, and it
comes off only when explicitly asked** — `window_chrome_sheet.test.tsx`
walks all five screens and fails a pane root that carries `bg-page`.

### Window chrome — one vertical baseline

Every cap — the sidebar cap (`App.tsx:1325`), the content header (`App.tsx:1440`),
the inspector cap (`App.tsx:1781`) — is `h-9 flex items-center`: a 36px band
with its contents optically centered on the same line, 18px from the cap's
top (40px and 20 until 2026-08-28, when Karthik read the band as "too
thick" and ruled 36 — the native compact-toolbar class). The native traffic lights are tuned to sit on that identical line:
`trafficLightPosition.y` in `tauri.conf.json:26` — 22 for the 40px band,
20.25 for the 36px one (measured 2026-08-28: disc centre 18.0pt, the band's
exact middle), the disc centre moving 1:1 with `y` (tao sizes the titlebar
container to `button height + y`) — was set by measuring the
rendered dot centre against the sidebar toggle button's centre in a live
screenshot (dot centre landed ~8.5pt above the toggle before the first fix) and is
not derived from any documented Apple/Tauri formula — the OS does not expose
one, so this value is empirical and window-height-dependent. If the cap
height (`h-9`) ever changes, `trafficLightPosition.y` must be re-measured
against it, not recomputed by formula.

**The inspector cap's content changed this phase; its height did not.** The
identity row, the finding chip and the overflow menu were added ahead of the
same Expand/Collapse and Toggle inspector pair the cap always carried
(`InspectorCap`, §5); the wrapping `<div data-tauri-drag-region
className="relative h-9 shrink-0">` around it kept the cap's height exactly as it was
before the cap grew a component of its own (`App.tsx:1781`, and the removed
cap it replaced carried the same height — Both inspectors open on their
breakdown, §5, above). Because the baseline this section states is keyed off
that class, not off what fills the row, `trafficLightPosition.y` needed no
re-measurement for this phase and none was done.

Any future cap, toolbar, or menubar row must keep this same `h-9
flex items-center` shape so its contents land on this baseline by
construction, rather than each screen re-deriving its own vertical rhythm.

**The dev window did not sit on that line, and the config was not why
(2026-08-28).** Measured at 2×: the dev build's discs centred 15.75pt from
the window's top — the OS default — against the toggle's 20.25, while the
installed release v0.5.0, built from the same `y: 22`, measured 19.75
against 20.1. The setup hook renames the window to `Hanger AI (dev)`
(`dev_icon::window_title`), and a title change makes AppKit re-lay out the
titlebar, dropping tao's inset back to the default (tauri-apps/tauri#13044;
tao re-applies it only from its view's `drawRect`, which nothing triggers
until a resize). The release build renames itself to the string the config
already set and is untouched. `lib.rs`'s setup now sets the title
synchronously through AppKit and marks tao's view dirty so the re-apply
follows the re-layout (`lib.rs:1961-1997`); a redraw requested after Tauri's
own `set_title` ran first, because that call dispatches asynchronously, and
re-applied nothing. After the fix the dev window measures 19.75 — the
release figure. **So `y: 22` stays, and a `y` retuned from a dev screenshot
is wrong for release:** 26.5 aligned nothing in dev and would have put the
release lights 4.5pt low. No automated test reaches any of this — it is a
window-server layout — so the number and the fix are pinned by the
measurements above and by nothing else.

One tooling fact behind the measurements: `tauri dev` relaunches the
*previous* binary on a file change and rebuilds without relaunching (four
times that day the process's start time preceded the binary's mtime by
4–30s). A dev process is evidence for a build only if `ps -o lstart=` is
younger than `stat -f %Sm target/debug/tauri-app`.

**The sheet's inset is uniform: 18px from its top rule, the same 18px the
content keeps from its left edge.** The cap is 36px around `h-[27px]`
controls, so 4.5px of the band is unpainted — but since 2026-08-28 the
band's lower edge is painted (the sheet's `border-t`), so the gap the eye
measures is rule → first painted edge, and it is read against the left
inset beside it. Needs review always opened at `mx-[18px] mt-[18px]`
(`NeedsReviewPane.tsx:95`) and read as consistent; Global at 14 top / 18
left and the map at ~8 / 18 did not (Karthik, 2026-08-28, annotated
frames). So every screen now opens at 18: `ProfilePane` and `RepoPane` at
`pt-[18px]` (`ProfilePane.tsx:882`, `RepoPane.tsx:415`), Discovery and the
Design system page's prose headers at `pt-[18px]` (were `pt-5`), and the
link map's canvas at `px-[18px] pt-[18px]` (was `pt-2.5`, `LinkMapPane.tsx:423`). `src/__tests__/shell_first_gap.test.tsx`
and the `trackBox.className` strings in both pane integration tests pin the
two panes.

This supersedes two earlier values the same class carried: 12.5
(`pt-1.5`, 2026-08-27, chosen to level the track pill with the rail mark
against a cap that sat on white) and 14 (`pt-3.5`, earlier on 2026-08-28,
the rhythm below, chosen before it was seen beside the left inset). The
mark keeps `mt-[6px]` (its own 12px rhythm, `IconRail.tsx:58`), so the two
columns do not open on one line: the pill's top sits at 36 + 18 = 54 and the
mark's at 36 + 6 = 42 — a follow-up ruling if it reads wrong, not an
oversight.

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
~9.5pt between each other, and the sidebar cap's spacer (`w-[76px]`) lands
the toggle icon's own ink ~11.5pt after the dot cluster ends.

**The breadcrumb lives in the band, after the toggle (2026-08-28).** It used
to render inside `<main>`'s header, so it started wherever `<main>` started
— beside the toggle only while the source list was collapsed (`pl-[51px]`),
18px in from the source list's edge otherwise, and it moved every time the
list opened. Karthik: "the menubar is a separate entity. I don't want it to
move." It now renders in the sidebar cap directly after the toggle
(`App.tsx`, the sidebar cap; `src/__tests__/crumb_in_band.test.tsx`), with no
inset of its own: the toggle's 32px box ends at 108 and the crumb's ink
starts at 109.5 (measured 2026-08-28 at 2×: x=219), ~9.5pt after the icon's
ink — within 2pt of the ~11.5 the icon gets after the lights and the ~10.5
the old collapsed inset gave, so the cluster still reads as one rhythm. Open or
closed, it does not move. While the inspector is expanded it is not
rendered at all: `<main>` is hidden and the inspector's cap carries the
selected asset's identity at that same spot (`leadingColumn`, `InspectorCap`).

The link map is the one view with no toggle (it hides the source list and
gates the toggle out), so the crumb must clear the dots itself: `pl-2`
after the 76px spacer puts its ink at 84 — ~11.5pt past the green dot,
exactly where `pl-[28px]` from `<main>`'s edge landed it before the move
(that fix dates from 2026-08-26, when `pl-[18px]` had left 1.5pt and read
as an overlap). `src/__tests__/linkmap_cap.test.tsx` pins the inset as a
class contract; it cannot see the gap. None of these values can be derived
from the others by formula (native traffic lights aren't in the DOM, and
glyph ink extent isn't box width), so every one was set by measuring a live
window pixel-by-pixel. If the spacer, the button padding, the icon size, or
`trafficLightPosition.x` ever change, re-measure the live window and retune
the spacer and the link-map inset together.

### Pane composition

The panes no longer share one vertical order — `ProfilePane` and `RepoPane`
gained a track above their strip (`2de751a`) that the other two never had.

**`ProfilePane` and `RepoPane`: track, strip, list plane, foot.** The
category track (`CategoryFilterCards`, above) opens the pane in
`px-[18px] pt-1.5 pb-3.5` (`ProfilePane.tsx:891`; `RepoPane.tsx:424`, where
it is nested one level deeper in a `min-w-0 flex-1` wrapper, so the
track can shrink beside a control that does not exist yet — the comment
above it says none is needed here). Then the `SummaryStrip` itself, in
`mx-[18px] mb-3.5` (`ProfilePane.tsx:899`, `RepoPane.tsx:416`). Then the
list plane, flat per §3 — no `bg-plane` — rounding only its top corners and
running off the bottom edge: `@container flex-1 min-h-0 overflow-y-auto
mx-[18px] border border-line rounded-tl-plane rounded-tr-plane pb-1.5`
(`ProfilePane.tsx:1101`, `RepoPane.tsx:645`) — identical in both panes now.
Then the
foot, `h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex
text-small text-ink-3` with the scan status pushed right by `ml-auto`
(`ProfilePane.tsx:1286`, `RepoPane.tsx:853`).

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

The uppercase eyebrow is gone from the migrated surfaces — `ProfilePane`'s
group headers now render `groupLabelClass`, sentence case, body size
(`typeRoles.ts:9`, imported at `ProfilePane.tsx:26`, used at `:1129`). It
survives only in panes still pending their pass, e.g. `font-flex text-micro
font-medium uppercase tracking-[.06em] text-ink-3` (`LinkPanel.tsx:34`);
`src/__tests__/type-roles.test.ts`'s `ROLE_FILES` list is the migrated set,
its case check now reaches every file rather than only those, and its
`ALLOW` entries are the authoritative to-do for all three checks it
enforces — size, leading and case, not case alone (the guard's own header
comment, `type-roles.test.ts:5-18`) — across the rest.

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

**Type roles.** `src/__tests__/type-roles.test.ts` scans every non-test
`.tsx` under `src/` for Tailwind's default size names, arbitrary or default
leading, and `uppercase` (`:5-18`); `ALLOW` is keyed by file and exact line
text with a reason, an entry that stops matching fails, and a hit inside a
`ROLE_FILES` file fails even when an entry matches it (§2).

**Icon stroke and box.** `src/__tests__/icon_weight.test.ts` pins
`strokeFor`'s values (12 → 2, 13 → 1.85, 14 → 1.71, ≥16 → 1.5; `:20`) and
the box of every shell mark changed on 2026-08-28 — each rail mark's width
as 16 × its optical factor, Sidebar's and InspectorCap's at 16 (`:42`). It
reads those sites only: a new call site at another size passes it (§4).

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

**A tool pick from the palette opens the server but not the tool.** `openSearchHit`
resolves an `mcp_tool` hit to its server and calls `handleSelectAsset` with
that server's identity (`App.tsx:1113-1116`); nothing in that path or in
`McpServerDetail.tsx` scrolls the Tools tab to, or highlights, the row the
query actually matched.

**The palette searches asset content and stops there.** `index_inventory`
writes only `skill`/`rule`/`subagent`/`server` rows (`search.rs:89-117`) and
`index_probe_tools` only `mcp_tool` rows (`:149-198`) into `asset_search`;
Needs review's issues and Discovery's directories have no writer into that
table and no `SearchKind` of their own, so neither surfaces in a palette
query.

**Matching is prefix and stem, not fuzzy.** `fts_query` quotes each term and
appends FTS5's prefix operator (`search.rs:200-215`) against a `porter
unicode61` tokenizer (`preferences.rs:664`); a misspelled term simply misses,
the way `"depl"*` finds "deploy" but a transposed "deploly" would not.

---

## 9. The Design system page (dev builds)

This document has a runtime counterpart: `DesignSystemPane`
(`src/components/DesignSystemPane.tsx`), reached from the rail's Swatch entry
beside Settings, crumb "Design system", with `DesignSystemSidebar` as its
table of contents. Karthik's rulings, 2026-08-16: name "Design system"
(industry consensus, matches this file), Heroicons `Swatch` (distinct from
the Settings cog; a palette would read as appearance, which Settings owns),
**dev builds only**, TOC in the source-list column.

**What it is.** The system, rendered by the app that uses it. Seven sections
cover §§1–5, layered in the TOC under three eyebrows (`DESIGN_GROUPS` and
the `group` field of `DESIGN_SECTIONS`, `designSystemFixtures.ts`;
`DesignSystemSidebar` draws one eyebrow per group on the machine sidebar's
`groupLabelClass`): **Foundations** — Colour, Geometry, Motion;
**Styles** — Typography, Iconography; **Components** — Controls,
Composites. The layering is Karthik's ruling of 2026-08-28 after reading
atomic design: Frost calls tokens subatomic and fonts, icons and buttons
the first atoms; Material's navigation says Foundations, Styles,
Components for the same three tiers, and those are the words chosen —
tokens the theme returns, then the first things you can see, then what is
built from them. The page's sections run in the same order, so the TOC and
the scroll agree. The last section is "Composites" rather than
"Components" because a group cannot name one of its own members; the
alternatives were Frost's "Organisms" (accurate, but a word nobody says
in this app) and "Patterns" (Polaris's word for UX solutions, which these
are not). Two more of the names are Karthik's ruling of the same day:
"Type" became "Typography",
the label every system uses (Apple HIG, Material, Carbon, Polaris, Primer)
and this file's own §2 title; the icon system gained a section, and
"Iconography" over "Icons" follows Carbon, Primer and Atlassian and
parallels "Typography" — HIG, Material and Polaris say "Icons", and either
would have done. Typography opens with a Families block: the three stacks
of `tokens.css:65-67`, each read from the running theme, a specimen line
in each, and a stated fact that `--font-sans` and `--font-flex` are one
stack today, so the two names mark two roles rather than two faces; the
scale rows carry the role §2's table gives each size. Iconography renders
`icons.tsx` from the module — every export ending in `Icon`, by name — so
a new mark appears without anyone listing it; shows the stroke ladder by
calling `strokeFor` (exported for this, `bc1c3c8`); lines up the rail's
marks to show the optical factors at work; and draws every `BrandId` from
the sprite, Codex's dark twin included. Every
component on the page is the real one, imported and rendered with sample
props from `src/data/designSystemFixtures.ts`: `GelMeter`, `MechanismGlyph`,
`EngineReachTiles`, `EngineLabel`/`BrandIcon`, `CategoryFilterCards`,
`DisclosureBanner`, `Tooltip`, `AssetHeaderRow`/`AssetRow`, `SummaryStrip`,
`ScanStatusIndicator`, `HangerMark`, `EmptyState`; and, since 2026-08-28,
the twelve that had landed after the page without a specimen —
`SegmentedTrack`, `UnderlineTabs`, `ViewControl`, `OverflowMenu`,
`InfoPopover`, `FindingChip` under Controls, with the mini button tier
(`miniButton.ts`: fill, tonal, outlined — the fill is the cap's `Link to…`)
beside them; `InspectorCap`, `ListCard`, `ReachCard`, `OriginValue`,
`ScanStamp`, `McpEngineSummary`, `SearchPalette` under Components. Nothing on it is a picture, so nothing on it can drift from the
app; after a pull, one page shows every component in the current theme.

**Every component is on the page, or says why not — enforced.** From
2026-08-16 to 2026-08-28 the inventory was a hand-picked list and the
sentence above was false: twelve components shipped without a specimen,
`InspectorCap`'s `Link to…` and `FindingChip`'s `1 flagged` among them, and
nothing went red. `design_system_pane.test.tsx` pins that the page renders
its own list, which cannot see a component the list never named.
`src/__tests__/design-system-coverage.test.ts` reads the other side: every
`src/components/*.tsx` must be imported by `DesignSystemPane.tsx` by its own
module, or sit on the test's allowlist with a reason — and an allowlisted
component the page now imports, or whose file is gone, fails too. Rendering
inside another specimen does not count (`ScanStamp` inside `SummaryStrip`,
`SegmentedTrack` inside `CategoryFilterCards`): the caption names the file,
so a reader looking for a file finds it under its name.

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

**Known gaps, recorded rather than fixed here.** The pill pair and the cap
button are hoisted class strings in `DiscoveryPane.tsx` and `App.tsx`, not
shared exports; the page repeats them with a caption saying so. The cap no
longer carries a search field — it moved to `SearchPalette`, which now has
its own specimen. Panes, modals, the map canvas and the inspector *panels*
(`AssetDetail`, `McpServerDetail`, `ReviewInspector`) are not on the page —
they need real inventory or graph data; the inspector *cap* is, because it
takes a category, a place string and callbacks and nothing else. `IconRail`
itself is not rendered as a specimen: it would put a second navigation
landmark, with duplicate control names, on the page. `FavouriteHeart` and
`MarkdownDoc` predate the page, take only props, and are still owed a
specimen; the coverage test's allowlist says so rather than hiding it. The
allowlist in that test is the full, reasoned list.
