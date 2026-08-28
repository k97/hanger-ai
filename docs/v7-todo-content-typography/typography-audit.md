# Typography audit — Hanger against the Codex references

2026-08-27. Scope: the inspector (title block, identity and context cards,
Content tab) and the type scale that feeds it. The font family is not in
question — both apps set the system stack (SF Pro), so every difference below
is size, weight, colour, case, or leading.

References: the six Codex frames in `ref/` (2808×1850, 2× Retina, so 2 image
px = 1 CSS px). Hanger: the classes in `src/components/*.tsx` at the tree of
this date, plus two captures of the running dev app (dark theme).

## How the numbers were taken

Ink-run heights alone cannot separate 13px from 14px at 2×, so each Codex
string was measured by **ink width** and fitted against CoreText widths of the
same string in the system font at every size from 10 to 34px in 0.25px steps,
for four weights. The tool was calibrated on Hanger frames whose sizes are
known from code: it reads 0.25–0.75px *under* the true size (13px → 12.75,
12px → 11.5, 16px → 15.75), so a Codex fit of "13.75 regular" is 14px. Full
output: `measurements.txt` beside this file. Line and row pitch came from
ink-row projection.

## Codex, measured

| Role | Size | Weight | Colour (light) | Leading / pitch |
|---|---|---|---|---|
| Page title (Settings "General") | 24 | regular | `#191c1f` | — |
| Page title (Plugins) | 28 | regular | `#191c1f` | — |
| Inspector title (PR name) | 24 | semibold | `#191c1f` | 29px (1.2), wraps |
| Markdown h2 in content | 20 | semibold | `#191c1f` | — |
| Section head ("Description", "Installed") | 16 | medium | `#191c1f` | — |
| Section head, settings ("Permissions") | 14 | medium | `#191c1f` | — |
| **Body** — prose, row labels, row values, sidebar rows, tabs | **14** | regular | prose & values `#191c1f`; labels `#8e8f90` | prose 22px (1.57); meta rows 32px tall; sidebar rows 31px |
| Row title (settings) / plugin name | 13–14 | medium | `#191c1f` | — |
| Secondary line (row description, plugin description) | 12–13 | regular | `#6a6b6d` | 16px |
| List meta (`+28,844 -23,389`, "2d") | 12 | regular | `#8e8f90` | — |
| Sidebar group label ("Projects", "Personal") | 14 | regular | `#a3a4a5` | sentence case, no tracking |
| Inline code | ~13 | mono | ink on `#f0f0f0` chip | — |

What makes it read as one system, in order of weight:

1. **One dominant size.** Roughly four of every five strings are 14px. Labels,
   values, prose, navigation and tabs are the same size; nothing in the
   working surface is set below 12px, and 12 is only ever grey meta.
2. **Grey is the only secondary signal.** A key–value row is *label grey,
   value ink*, both 14px. Hierarchy inside a row is colour, never size.
3. **No uppercase anywhere.** Section heads are sentence case, one step up
   (16 medium at body 14, or 14 medium in the denser settings surface).
   Sidebar group labels are sentence case at body size in a lighter grey.
4. **Headings jump.** 14 → 16 → 20 → 24: every step above body is ≥ 1.14×,
   and titles switch to semibold. Below body, one step (12–13) in grey.
5. **Two leadings.** Prose 22px; captions 16px. Nothing else.

A caution before copying the greys: `#8e8f90` on white is 3.3:1, below WCAG
AA for 14px text. Hanger's `--ink-3` (`#636363`, 5.9:1) is the better value;
what to take from Codex is the *role assignment*, not the hex.

## Hanger, as built

Scale (`tokens.css:64-70`, `index.css:82-92`): 11 / 12 / 13 / 16 / 32, two
weights. Use counts across `src/**/*.tsx` (non-test):

| Utility | Uses | Ratio to the step below |
|---|---|---|
| `text-micro` 11px | 171 | — |
| `text-small` 12px | 156 | 1.09 |
| `text-base-app` 13px | 41 | 1.08 |
| `text-lg-app` 16px | 11 | 1.23 |
| `text-display` 32px | 6 | 2.0 |
| `uppercase` | 44 | — |
| `tracking-[.06em]` | 39 (+1 `.09em`) | — |
| negative tracking `-0.2/-0.3/-0.5px` | 5 / 4 / 4 | — |
| `leading-[1.45]` / `[1.5]` / `[1.55]` / `[1.6]` / `[1.65]` / `relaxed` / `normal` / `none` / `4` | 7 / 17 / 5 / 13 / 4 / 13 / 3 / 1 / 1 | — |
| Off-scale: `text-xs` (Tailwind 12) / `text-base` (Tailwind **16**) / `text-[9px]` | 13 / 1 / 1 | — |

The mass of the app is set at 11–12px — 327 sites against 41 at 13px — and
the three bottom steps are one pixel apart. A 1.08× step is below the
threshold at which the eye reads two sizes as two levels (the usual floor is
1.2×), so 11 / 12 / 13 do the work of one size while *looking* like three
slightly different ones. That is the "all over the place" impression: not
too many sizes, but three sizes doing one job, with weight, uppercase,
tracking and mono stacked on top to manufacture the hierarchy the sizes
cannot.

Set beside Codex at the same font: Hanger's body is two steps smaller
(12 vs 14), its labels are three steps smaller (11 vs 14), and its section
heads are four steps smaller *and* uppercase (11 vs 16).

## The inspector, row by row

Cited lines are the tree of 2026-08-27.

**Title block** — `Flyout.tsx:680-737`. Eyebrow `text-micro font-medium
tracking-[.06em] uppercase text-ink-3` ("Inspector" / "{scope} scope"), then
`h2 text-lg-app font-medium tracking-[-0.3px]`, then a transport chip
`text-micro font-mono`. Three sizes (11/16/11), three treatments (caps,
sentence, mono) in 40px. Codex: title 24 semibold, then one 14px grey meta
line. The Hanger title is the same weight as a row label (500) and the
uppercase eyebrow above it is visually heavier than the title's own
sentence-case descender line.

**Identity card rows** — `ListCard.tsx:44-62` (`ListCardRow`). Row default
`text-small text-ink-1`; `value` `font-mono text-micro text-ink-3`; `wide`
`text-small text-ink-2`. So the label is dark 12px and the value is light
11px mono — the inverse of Codex, where the label recedes and the value is
what you came for. Three inks and two sizes in one row; three inks and three
sizes across a card once a `wide` row sits beside a `value` row.

**Origin sub-rows** — `AssetDetail.tsx:612-628`. Label `text-small
text-ink-3`; value mono `text-micro text-ink-3` or sans `text-small
text-ink-2`. The label here is `--ink-3`; the label two rows up
(`ListCardRow`) is `--ink-1`. Same card, two label colours — this is the
exact irregularity the request names.

**Context card** — `AssetDetail.tsx:445-476`, `McpServerDetail.tsx:373-401`.
Per row: label `text-small` (12, inherits ink-1) + description `text-micro
text-ink-3` (11) on the left; figure `text-base-app text-ink-1` (13) + bytes
in the row's `font-mono text-micro text-ink-3` (11) on the right. Four type
styles per row; the only 13px in the whole card is a number.

**Content tab, Skills body** — `AssetDetail.tsx:511-535`. `pre` at
`font-mono text-micro text-ink-2 leading-[1.6]`: 11px mono in `--ink-2` for
the document a user opened the panel to read. Notes at `text-small
text-ink-3`. Codex sets the same content at 14px primary ink, 22px leading.

**Content tab, Markdown** — `MarkdownDoc.tsx`. Body `text-small text-ink-2
leading-[1.55]` (:62); headings `text-base-app font-medium` (:70) — a 1.08×
heading; inline code `text-micro` (:20); code blocks `text-micro
leading-[1.6]` (:102). Body is grey-on-grey (`--ink-2` on `--page`) where
Codex prose is primary ink; headings are one pixel larger than body where
Codex's are 20/14 = 1.43×.

**MCP panel root** — `McpServerDetail.tsx:742` sets `text-base` — Tailwind's
16px, not the app's `text-base-app` — as the inherited size for the whole
panel. Anything inside without an explicit size renders at 16px. The
off-token guard (`no-off-token-styles.test.ts:282-292`) catches `text-[Npx]`
and unknown `text-*` tokens but treats Tailwind's own `xs/sm/base/lg` as
known, so this and `text-xs` ×13 in `DiffChooser.tsx` pass.

**Section eyebrows** — `AssetDetail.tsx:118`, `McpServerDetail.tsx:209`,
`ReviewInspector.tsx:94,144,154`, `Flyout.tsx:847`, `InspectorCap.tsx:194`.
`text-micro font-medium tracking-[.06em] uppercase text-ink-3` — 11px caps
in the lightest ink as the heading of a 12px card. Codex has no uppercase in
any of the six frames.

**Seen in the running dev build** (`docs/evidence/2026-08-27-typography/`,
dark theme, window `tauri-app` pid 79759 — note the owner name is
`tauri-app`, not "Hanger AI"; the installed `/Applications/Hanger AI.app`
was also running and is the one that answers to "Hanger AI"):
`inspector-content-tab.png` shows the Context figure "≈ 67 tokens" in
**mono** — `ListCardRow`'s value slot sets `font-mono` and the inner
`text-base-app text-ink-1` span overrides size and ink but not family. Nothing
in the code asked for a mono figure; it is inherited. `inspector-details-tab.png`
shows three value styles down one card (sans 12 `--ink-2` for Engine, Scope,
Origin; mono 11 `--ink-3` for Version, Size, Modified, Path) under 11px caps
eyebrows.

## The sidebar

`sidebar-expanded.png`; classes in `Sidebar.tsx`, `DiscoverySidebar.tsx`,
`ReviewSidebar.tsx`, `DesignSystemSidebar.tsx`.

| Element | Hanger | Codex |
|---|---|---|
| Group label ("Scope", "Repositories", "Favourites", "Categories") | 11 medium caps `.06em` `--ink-3` (`Sidebar.tsx:107`, `DiscoverySidebar.tsx:18`) | 14 regular sentence case `#a3a4a5` ("Projects", "Recents", "Personal") |
| Row | 13 regular `--sidebar-ink`, medium when selected (`Sidebar.tsx:135`, `:227`; `DiscoverySidebar.tsx:75`, `:105`) | 14 regular; selected row gets the tint, not a weight change |
| Sub-line ("Watched · 4 repos", engine marks) | 11 `--ink-3` (`Sidebar.tsx:142`, `:234`) | 12–13 grey |
| Count | 11 tabular `--ink-3` (`Sidebar.tsx:156`, `:243`; `DiscoverySidebar.tsx:48`) | — (Codex shows none; its list meta is 12 grey) |

The rows are already close (13 vs 14, one step). What is not: every label
*around* the rows is 11px — group labels, sub-lines, counts — so the sidebar
has a 13px spine with 11px everywhere else, a 1.18× gap that reads as two
unrelated systems rather than one with a secondary level. Codex keeps
secondary text at or one step below body and lets colour carry it.

## Discovery

`discovery.png`; `DiscoveryPane.tsx`.

| Element | Hanger | Nearest Codex equivalent |
|---|---|---|
| Page title | 16 medium `-0.2px` (`:216`) | Plugins title 28 regular; Settings 24 |
| "Checked August 2026" | 11 `--ink-3` (`:219`) | — |
| Intro paragraph | 12 `--ink-2` 1.55, `max-w-[74ch]` (`:223`) | Plugins subtitle 16 `#6a6b6d` |
| Section ("STANDARD ——— read these first…") | 11 medium caps `--ink-3` + note 12 `--ink-3` at 75% opacity (`:255-258`) | "Installed" / "Featured" 16 medium sentence case, rule beneath |
| Entry name + host | 13 medium `--ink-1` + mono 11 `--ink-3` (`:79`, `:84`) | Plugin name 14 medium |
| Entry description | 12 `--ink-2` 1.5, `max-w-[78ch]` (`:87`) | Plugin description 13 `#6a6b6d`, one line |
| Chips | 11 `--ink-2` on `--plane-2` (`:94`); install command mono 11 (`:105`) | — |
| Foot ("34 directories", "Confirms before opening links") | 11 `--ink-3` (`:279-292`) | — |

Discovery is the page that most resembles a Codex surface — a titled page of
described entries — and it is set one to two steps below its counterpart at
every level: 16 vs 24–28 title, 12 vs 16 intro, 11 caps vs 16 sentence-case
sections, 12 vs 13 descriptions. The descriptions are real prose (two to
three lines each) at 12px `--ink-2`, which is the Content-tab problem again on
a page whose whole job is reading.

## The pane list and the summary strip

Karthik's question, 2026-08-28: the circled list in the Global pane. It was
scoped out of the first draft and is now in. `global-empty-inspector.png`;
`AssetHeaderRow.tsx`, `AssetRow.tsx`, `ProfilePane.tsx`, `RepoPane.tsx`,
`SummaryStrip.tsx`.

| Element | Hanger | Codex |
|---|---|---|
| Column header ("NAME ⌃", "KIND", "BEYOND THE STORE") | 11 medium caps `.06em` `--ink-3` (`AssetHeaderRow.tsx:30`, `:49`, `:55`, `:58`) | no column headers; the list is title + grey sub-line + grey meta |
| Group header ("SKILLS · 136", "Agents · 6") | 11 medium caps `.06em` `--ink-3` — `secClass`, declared twice with identical text (`ProfilePane.tsx:881-882`, `RepoPane.tsx:409-410`) | "Authored ⌄" 14 regular grey, sentence case |
| Row name | 13 `--ink-1`; selected `--tint-ink` medium (`AssetRow.tsx:160-163`, `:183`, `:250`) | 14 regular `--ink` |
| Kind / engine columns | 12 `--ink-3` (`:257`, `:277`) | sub-line 12–13 grey |
| Beyond / state columns | 12 `--ink-2`, state words medium in state colours; the empty "—" at `--ink-3` **and** `opacity-45` (`:98`, `:213`) | meta 12 grey |
| Foot ("Showing 171 of 171") | 11 `--ink-3` (`ProfilePane.tsx:1290`, `RepoPane.tsx:857`) | — |
| Strip figure / subtitle / stamp | 32 medium `-0.5px` / 16 `--ink-2` / 11 `--ink-3` (`SummaryStrip.tsx:97-101`) | Plugins: 28 regular / 16 grey |
| Strip legend ("148 linked") | 12 `--ink-2` (`:122-133`) | — |

The list's spine is right — 13px names in primary ink, one step of grey for
the columns — and it is the one surface where Hanger's 13 is closest to
Codex's 14. What is wrong is, again, everything around it: the column header
and the group header are the same 11px caps string as the inspector's
eyebrows, so the reader meets three tiers of caps in one column (header,
group, then the inspector's eyebrows to the right), and the foot line is a
fourth 11px voice. An "—" at `--ink-3` *and* 45% opacity is a fourth grey
that no token names — in light theme it lands at roughly `#c9c9c9`, 1.7:1
against `--page`. `secClass` being declared twice, verbatim, in two panes is
how the eyebrow drifted: there is no single place that owns it.

## Critique, by dimension

### Scale usage — major issue

*Observation.* Five steps declared; three of them (11/12/13) within 1.09× of
each other and carrying 93% of all sized text. Two Tailwind default sizes
and one arbitrary 9px leak past the guard.

*Problem.* Levels that are 1px apart cannot be told apart in situ, so the
same role is set at 11 in one file and 12 in the next without anyone seeing
the difference in review; and the roles that *should* differ (label vs value,
heading vs body) get their difference from case, weight and mono instead.

*Fix.* Keep the five values — they are the right values for a dense macOS
tool — and assign them **roles** with a rule for each: 13 is body and the
default (labels, values, prose, list names, tabs); 12 is secondary and is
always `--ink-3` or `--ink-2`; 11 is mono and badges only, never a sans
label; 16 is heading/title; 32 is the strip figure. Retire the two Tailwind
sizes. Enforce with a guard (see plan, Task 8).

### Readability — major issue in the Content tab, minor elsewhere

*Observation.* SKILL.md renders at 11px mono `--ink-2`, 1.6 leading, in a
416px panel; Markdown at 12px `--ink-2`, 1.55. Row labels 12px; descriptions
11px. Measure is fine (≈60–65 characters at 12px in 380px).

*Problem.* The panel's primary reading surface is its smallest and greyest
text. 11px mono at `--ink-2` on `--page` is 8.4:1 in light and legible, but
it is a caption size asked to be a document. Eight different leadings across
the inspector mean identical paragraphs sit differently in adjacent cards.

*Fix.* Prose at body size (13) in `--ink-1`, 20px leading; mono documents at
12, 18px leading; descriptions at 12, 16px leading. Three leadings, as
tokens, and nothing arbitrary.

### Consistency — major issue

*Observation.* Labels are `--ink-1` in `ListCardRow` and `--ink-3` in the
origin sub-rows and `ReviewInspector`'s `dl`; values are mono-11-ink-3,
sans-12-ink-2, or sans-13-ink-1 depending on which prop the caller chose;
headings are 11px caps in cards and 13px medium in Markdown; negative
tracking is −0.2, −0.3 or −0.5 depending on the file.

*Problem.* Semantically identical elements — every key–value row in the
inspector — do not share a style, so the card reads as assembled from parts.

*Fix.* One row contract in `ListCardRow`: label `--ink-3`, value `--ink-1`,
both body size; mono values one step down. One section-head class. One
title class. Tracking only where the face needs it (the 32px figure).

### Token compliance — minor issue

*Observation.* Sizes are tokens except `text-xs` ×13, `text-base` ×1,
`text-[9px]` ×1 (allowlisted). Leading is never a token: 55 arbitrary
`leading-[…]` values plus four Tailwind defaults. Tracking is arbitrary at
every site.

*Fix.* Add `--lh-body`, `--lh-caption`, `--lh-code` to `tokens.css` and
register them so `leading-body` / `leading-caption` / `leading-code` exist;
migrate the inspector; extend the guard to flag `leading-[` and the Tailwind
size names. The `.06em` eyebrow tracking goes with the eyebrows if ruling R1
retires them; otherwise it becomes `--tracking-caps`.

## What the plan proposes (summary; rulings in the plan)

Roles, not new sizes: body 13 / secondary 12 / mono 11 / heading 16, with
`--ink-3` reserved for labels and secondary lines and `--ink-1` for what the
user reads. Section heads become sentence-case 13px medium in `--ink-1` (the
Codex settings pattern — the one that suits a 416px panel), the title keeps
16px. Four leading tokens, `--lh-display: 35px` among them for the 32px
stat numeral. A guard that makes the roles stick. The
alternative — Codex parity at 14/13/12 with 20px semibold titles — is
rendered beside it in the options page so the choice is made by eye.

The same roles flow into the sidebar family and Discovery (Karthik,
2026-08-27: "whatever type scale we are proposing will flow into discovery
page as well"): sidebar group labels and Discovery section heads take the
same ruling as the inspector's eyebrows (R1); sub-lines, counts, chips and
foot lines move from 11 to 12 as the secondary role; Discovery descriptions
and the intro move to body. The pane list follows (2026-08-28): column and
group headers take R1, the foot and stamp lines move to 12, the opacity
fourth-grey goes. Still out of scope: `LinkMapPane`'s own text,
`DiffChooser`, `App.tsx`'s settings sheet — same defects, same roles, next
pass; the guard in the plan lists every one of their sites as the to-do.
Also out of scope, and not ruled on here: the negative tracking on headings
(`tracking-[-0.2px]` / `-0.3px` / `-0.5px`, 13 sites) is the next pass.
