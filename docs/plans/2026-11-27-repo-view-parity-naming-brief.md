# Repository overview card: naming brief

Gate G2 of [the repository-view parity plan](2026-11-27-repo-view-parity.md), Task 4. Nothing here is in the app yet. `ui-copy.md` asks for a researched brief and Karthik's sign-off before a first-time label lands, and a `/humanizer` pass on every string. Every candidate below has had that pass: plain verbs, no dashes, sentence case, and nothing the code doesn't do. The questions are in [round 29](2026-11-27-decisions-round-29.md); the layouts they sit in are in [the options page](../design-ref-prototypes/2026-11-27-repo-overview-options.html).

The card replaces the repository's summary strip and its "By engine" band (round 28, q1). Its first section is the repository's asset counts per engine, not clickable (q2). It has no fold (q6). So the strings that need words are the ones the strip and the band used to carry, in their new places.

## Words already on screen

Read on 2026-11-27 from the tree.

| Where | Words | Code |
|---|---|---|
| Global's card, first section | "Engines", caption "tokens every session" | `ENGINES_HEAD`, `ENGINES_CAPTION` in `src/utils/overviewCopy.ts` |
| Global's card, store section | "The global store", caption "{n} assets" | `STORE_HEAD`, `storeAssetsLabel` |
| A repository's band | "By engine", rows "{n} assets" / "{n} asset" | `HeroBand` `label`, `engineRows` in `RepoPane.tsx` (`word: count === 1 ? "asset" : "assets"`) |
| A repository's strip | "{n}" then "assets in {folder}" or "{kind} in {folder}" | `stripTotal`, `stripSubtitle` in `RepoPane.tsx` |
| A repository's band foot | "1 nested repo counts towards this row" / "{n} nested repos count towards this row" | `nestedFoot` in `RepoPane.tsx` |
| An asset with no engine | "Any agent" | `formatEngineLabel` in `src/utils/engineUtils.ts` |
| A kind as a noun | "skills", "MCP servers", "rules", "subagents", and their singulars | `categoryNoun` in `src/utils/prose.ts` |

Kept as they are, so not asked: "By engine", "Any agent", "Needs review", "Rescan", "Scanning", "Promote…", the depth-cap line, the macOS access panel's strings, and "Show overview  ⌘E" / "Hide overview  ⌘E".

## The strings

`{folder}` is `repoFolderName`, the last segment of the repository's path. `{n}` is a backend figure.

### 1. The engine section's head and its figures

- **Candidate:** head "By engine", no caption; each row's figure reads "96 assets", or "1 asset".
- **Where:** the card's first section on a repository, All tab only. Not drawn on a kind tab, and not drawn when the repository has no engine counts.
- **True because:** each figure is `assetCounts.engines[key]` from `count_assets`, a count of assets per engine across every kind (`engineRows`). That is why the rows go on a kind tab (ruling in `e0bc07d`).
- **Alternatives:** a caption "assets" with bare figures ("96"), which is how Global's card puts its unit in the caption and leaves the rows bare. Or "Engines" as the head, to match Global's word for the same slot.
- **Why the candidate:** "By engine" is already approved for this content. Global's caption names a unit its rows share ("tokens every session"), but "1 asset" against "96 assets" reads better with the noun on the row, and the band already prints it that way.

### 2. The store section's head

- **Candidate:** the folder's name, "storefront". No label of its own.
- **Where:** the card's second section (first in option C), on every tab, over the link-state legend.
- **True because:** the figures under it are this repository's: `stripTotal` and `linkStateCounts(inventory, { kind: "repo", root })`.
- **Alternatives:** "This repository"; "In {folder}".
- **Why the candidate:** Global's head names its scope ("The global store"); the folder's name does the same here in one word. "Store" stays Global's word: `ui-copy.md` gives "the global store" as an app noun, and a repository is not one.

### 3. The store section's caption

- **Candidate:** "212 assets" on the All tab; on a kind tab, the kind's own noun: "48 skills", "9 MCP servers", "1 rule".
- **Where:** right of the store section's head.
- **True because:** `stripTotal` already narrows to the tab (`assetCounts.byCategory[kindKey].total`), and the strip's subtitle already says "skills in {folder}" there. `categoryNoun(kind, "one" | "many")` has both forms.
- **Alternative:** "48 assets" on every tab, always `storeAssetsLabel`. True, but it hides that the figure changed with the tab.
- **Note:** Global's caption does not narrow by tab today (`globalAssetsTotal`), so this is a repository-only behaviour. Task 5's `storeTotal` prop takes a number; the candidate needs a caption string or a kind passed with it.

### 4. The nested-repository line

- **Candidate:** "3 nested repos are counted in storefront"; one: "1 nested repo is counted in storefront".
- **Where:** option A and C, the card's own section above the actions, with the paths under it and Promote… at its foot. Option B, a row-shaped notice at the top of the lane.
- **True because:** `unlinkedCandidates` are repositories inside this root that are not linked in their own right, and the root's walk counts their assets ("Their assets currently roll up into this row", `RepoPane.tsx`). It stays on every tab: it is about the folder.
- **Alternatives:** "Includes 3 nested repos" (shorter, but does not say what is included); "3 nested repos count towards storefront" (closest to today's words).
- **Why the candidate:** "towards this row" pointed at the band directly above it. In the card there is no row, and in option B the line is not next to any figure at all, so it names the folder instead. "Are counted in" says what happens without suggesting it is wrong.

### 5. "1 asset"

- **Candidate:** `storeAssetsLabel(1)` returns "1 asset". Every other figure keeps "assets".
- **Where:** every place `storeAssetsLabel` prints: the engine rows (string 1), the store caption on the All tab (string 3), and on Global, the All engines row and the store caption.
- **True because:** it is the same figure; only the noun's number changes. Today it prints "1 assets", the shape `known-debt.md` saw on a repository.
- **Alternative:** leave it.

### 6. Before the first answer (no string)

While a repository's scan is still running and no counts have arrived, the store caption and every engine row print no figure: no "0 assets" before the answer is in (Review Focus 5, Task 5's `pending`). The heads stay. Nothing new to name.

## Humanizer pass

Run on every candidate and alternative above. What it changed: "Counted in this repository: 3 nested repos" was dropped (a colon header is the inline-header pattern, and the order is backwards when read aloud); "repo" and "repository" were not mixed inside one string; no candidate uses a dash.
