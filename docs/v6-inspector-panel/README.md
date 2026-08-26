# v6 — the inspector's context cards

Two cards in the inspector tell you what an asset costs a model:

- **Skills › Content › Context** — `src/components/AssetDetail.tsx:381-403`
- **MCP server › Tools › Context per request** — `src/components/McpServerDetail.tsx:699-720`

`kitchen-sink.html` redraws today's version and six alternatives at 384px, the
default `inspectorWidth` (`App.tsx:341`), in the real tokens from
`src/styles/tokens.css`. Open it in a browser; it toggles light/dark and widens
to 520px to check the layouts at a dragged-out panel.

## What the code actually knows

Read before judging any option — several of them exist only because of a gap here.

### Skills — `AssetBody`, `src-tauri/src/lib.rs:1433-1474`

| Field | What it is |
| --- | --- |
| `bytes` | The document's size on disk. |
| `estimated_tokens` | `bytes / 4`, integer division. A rule of thumb, not a tokeniser. |
| `lines` | `text.split('\n').count()`. |

Two facts the current card does not surface:

1. **`asset_body_of` reads one document.** A skill folder resolves to the
   SKILL.md inside it. Bundled reference files, scripts and assets are not in
   the 22.6 kB figure. The card gives no hint of that.
2. **There is no measurement of the always-on tier.** The card asserts "Name
   and description always loaded" and then prices only the part that *isn't*
   always loaded. `Skill` carries `name` and `description`
   (`src-tauri/src/domain.rs:15-32`), so the figure is computable — it just
   isn't computed. Every option below that shows an "always on" number needs a
   new field on `AssetBody`; **the frontend must not measure it itself**, per
   the backend-owns-counts invariant.

### MCP — `ToolCost`, `src-tauri/src/mcp/probe.rs:110-138`

| Field | What it is | On screen? |
| --- | --- | --- |
| `tool_count` | Tools the probe saw. | yes |
| `described_tool_count` | Tools whose description is `Some`. | yes |
| `description_bytes_total` | UTF-8 bytes of every description. | yes |
| `per_tool` | `[{ name, description_bytes }]`, every tool. | yes — the **Description** column of `ProbedToolList` (`McpServerDetail.tsx:331-355`), beside a **Schema** column that is permanently `—` |

Input schemas are dropped at store time, so they are not measured and cannot be.

## Research

Published measurement, gathered 2026-08-25:

- **Input schemas are 60–80% of a tool definition's tokens.**
  ([deploystack](https://deploystack.io/blog/how-mcp-servers-use-your-context-window))
  This is the single most load-bearing finding here: today's card leads with
  descriptions, which is the *minority* share, presented as the figure.
- **Per-tool cost runs 100–150 tokens, 300+ for complex ones**; 10 tools ≈ 1,500
  tokens, 100 tools ≈ 15,000. (same source)
- **Median server across 3,165 measured: ~1,900 tokens** of definitions;
  GitHub's official server alone is 17,600 tokens per request.
  ([StackOne](https://www.stackone.com/blog/mcp-token-optimization/),
  [DEV](https://dev.to/kenimo49/your-mcp-server-eats-55000-tokens-before-your-agent-says-a-word-i-measured-the-real-cost-19l8))
- **Schema overhead is an open spec issue**, not a settled matter.
  ([modelcontextprotocol#2808](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2808))
- **Skills load in three tiers**: name + description at startup (~30–100 tokens
  each), the SKILL.md body on activation (**guidance: keep it under ~5,000
  tokens**), reference files only when the body sends the agent to them.
  ([SwirlAI](https://www.newsletter.swirlai.com/p/agent-skills-progressive-disclosure),
  [Atlan](https://atlan.com/know/ai-agent/ai-agent-skills/skill-md-file-explained/))
- **The nearest prior art is Claude Code's `/context`**: a category breakdown
  where every line reports its own tokens and its own share, and free space is
  drawn as a category of its own.
  ([Claude Code docs](https://code.claude.com/docs/en/context-window))

Two conclusions the options are built on. First, **the axis that matters is
*when* the cost lands, not what the bytes are made of** — always-on versus
on-demand is the whole point of progressive disclosure, and it is the axis
neither card is organised around. Second, **`/context` sets the expectation that
an absence is drawn, not omitted**; the honest analogue here is a visible
"not measured", not a sentence in the footer.

## Where today's cards fail

1. **The value slot carries an absence.** "the remainder, not in the store" sits
   where every other row puts a figure. It parses as a quantity before it parses
   as a sentence.
2. **The minority share is the headline.** 2.8 kB is descriptions; the schemas
   are 60–80% of the real toll and go unmentioned above the fold.
3. **The tier that always costs you has no number** (skills).
4. **Two units for one concept.** Skills are priced in tokens, servers in bytes,
   in panels the same person opens minutes apart.
5. **One row, four facts** (skills): the always-loaded claim, 22.6 kB, "when
   opened", 5,786 tokens, "estimated", "not checked per engine" — all in a
   single two-line label.
6. **"not checked per engine" is undecodable.** It appears to mean *engines
   tokenise differently and Hanger runs none of their tokenisers*, which is worth
   saying, but not in three words at the end of a mono line.
7. **The prose is doing structural work.** Three lines of footer explaining what
   the two rows above meant is a sign the rows are wrong.

## The six

| | Name | Thesis | Cost |
| --- | --- | --- | --- |
| **A** | Two tiers, named | One row per loading tier, labelled by *when*. Absences in muted sans, never in the mono figure face. | Lowest. No new components. Two first-time labels need the naming brief. |
| **B** | Lead with the certain fact | One display-size figure, and it is one Hanger knows exactly — the body for a skill, the tool *count* for a server. | Changes what the MCP section claims. Uses the 32px step the inspector has never used. |
| **C** | Draw what is unknown | Measured vs unmeasured on one `GelMeter`-style track. Three marks, one meaning each: solid ink lands now, flat grey lands later, hatch is never measured. | Needs a hatch pattern that isn't in the token set. The MCP bar is drawn to someone else's ratio — see below. |
| **D** | Against a window | Every figure gets a denominator: share of a 200k window, and the ~5,000-token skill guidance. | **Reverses a recorded ruling.** |
| **E** | Where it actually goes | Heaviest descriptions, ranked with bars. **Premise did not survive** — kept in the study as the record of a failed argument. | Ranks tools on the one axis nobody chooses by. Superseded by A + E. |
| **F** | Sentence first | Promotes the footer paragraph to the headline, demotes the table to a figure strip. | Most words, least scanning. Reads well once, badly the fortieth time. |

### Two things to decide before implementation

**D contradicts a decision already in the tree.** `McpServerDetail.tsx:34-36`:
"The context-budget bar in that study is deliberately absent here: the ~40-tool
ceiling is third-party guidance, not measured, and spec §5.5 excludes it." D
reopens exactly that. It is drawn because you asked for iterations and because
there is far more published measurement now than there was, but it is a
reversal, not a refinement, and it is yours to take.

**C's MCP bar is the one drawing more confident than its data.** The 28/72 split
is the published 60–80% figure, not this server's schemas. Either hatch an
*undrawn* remainder (a bar that trails off the edge), or keep the meter for the
skill card — where both parts are genuinely measured — and give the server card
to A. `GelMeter`'s aqua stays off either way: the 2026-08-15 ruling is that aqua
may only mark a share that is actually true, and "unknown" is not one.

### If I had to pick

**A for the structure, E folded in beneath it** — drawn as the last section of
the kitchen sink. B's headline is tempting and its MCP half quietly changes the
subject. C is the best drawing and the weakest evidence. D is the most useful
card here and the one that needs a ruling.

## A + E — the ledger and its list

The fold turned out to be cheaper than either option looked on its own, because
**both lists are already on screen, directly beneath the card A rewrites**:

- MCP: `ProbedToolList` (`McpServerDetail.tsx:321-366`) draws a per-tool
  **Description** bytes column beside a **Schema** column that is always `—`.
- Skill: the **Contents** card (`AssetDetail.tsx:486-520`) lists the folder's
  top level with per-entry bytes, from `list_asset_dir`.

Neither list is connected to the figure above it. So the fold is not a new
section — and it turns out not to be an addition at all. **The ledger says the
things the list was faking, and the list gives them up.**

**MCP: the whole change is deletion.** Out of `ProbedToolList` come the header
row, the Schema column, and the per-tool byte figure. Nothing is added — no sort,
no totals row, no aside. The list keeps whatever order the server exposed, and a
`ProbedTool` is `{ name, description }` and nothing else
(`src-tauri/src/mcp/probe.rs:72-76`), so what is left on a row is exactly what
the tool is.

| Removed | Why it can go |
| --- | --- |
| The **header row** | The rows were never a grid — a name and a figure on one line, the description full-width beneath. "Description" sat above a *byte count* while the description itself ran underneath it, unheaded. |
| The **Schema column** | It has only ever contained `—`. "Input schemas · Not measured" says it properly, next to the figure it qualifies. |
| The **totals row** | The ledger already carries 2.8 kB; the tab and the ledger's caption already carry 29. A footer repeating both leaves the reader reconciling two printings of one fact. |
| The **per-tool byte figure** | Accounting sitting in a content list. See below. |

**Why no figure survives in the list.** A per-tool size has no decision attached
to it: you do not choose a tool by how wordy its description is, and you cannot
edit a third-party server's descriptions. The server-level total *does* have a
decision attached — whether to keep the server at all. So the ledger holds that
one figure and the list holds none. This is what killed option E, whose ranking
was true and useless at the same time.

**Two sections, two jobs, no overlap.** The ledger answers "what is this costing
me", one figure per tier. The list answers "what does this thing do", and reads
as prose rather than scanning as a table. Neither restates the other — which is
why four things could be deleted with nothing taking their place.

Ledger and list stay in agreement because they read the same probe answer,
`descriptionBytesTotal` and `perTool` — a guarantee to hold in the code, not to
draw on the screen.

**Skill: two edits.** Full ink on the Contents row the Context figure came from,
muted on the rest, and one footnote saying the rest is excluded.

**Units.** Tokens lead in the ledger — `--fs-base`, `--ink-1` — with the byte
figure under them at `--fs-micro`, `--ink-3`: tokens are what the reader spends,
bytes are what Hanger measured. The list stays in bytes throughout, totals row
included; there the question is which tool is heavier than which, and an exact
figure serves a ranking better than a divided-by-four one. The ledger's second
line is the tie — the same 2.8 kB appears in both places.

### Two gaps this does not close

- **A single-file skill has no Contents card**, so there is nothing to fold and
  the ledger stands alone. Fine, but it means the pattern is not universal.
- **A server with more than one launch spec draws one tools block per spec**
  (`specGroups`), while `cost` is read from `anyVerified` — one ledger over
  several tables, and the total would then be a total of something the reader
  cannot see the boundary of. That case needs its own answer before this ships.

## Not yet done

- No string here has had the `/humanizer` pass. All of them need it.
- "Always on", "When it opens", "Not measured" and "Heaviest descriptions" are
  first-time labels and need the researched naming brief under
  `.claude/rules/ui-copy.md`.
- Nothing has been built into `src/`, so nothing has been screenshotted from a
  running build. These are prototypes in a browser, which is not evidence about
  the app under `.claude/rules/verification.md`.
- The 228 B always-on figure is illustrative. It needs a backend field before
  any option that shows it can ship.

## Multi-spec MCP servers — research, 2026-08-26

The one case this work left open: the Context-per-request ledger reads
`anyVerified` (the first *succeeded* probe across all registrations,
`McpServerDetail.tsx:470-471`), while the Tools section renders one
`ProbedToolList` **per** `specGroup` (`:836`). Two launch specs, both probed →
one figure over two lists, and nothing says which list the figure describes.

### The case is real, not hypothetical

A server's tool surface is a function of how it is launched. GitHub's official
MCP server makes this explicit: `--toolsets` selects which groups of tools are
exposed, `--dynamic-toolsets` changes discovery entirely, and read-only mode
exposes only the read tools — with the `GITHUB_TOOLSETS` env var taking
precedence over the command-line flag.
([GitHub docs](https://docs.github.com/en/copilot/how-tos/provide-context/use-mcp/configure-toolsets),
[github/github-mcp-server](https://github.com/github/github-mcp-server),
[changelog](https://github.blog/changelog/2025-12-10-the-github-mcp-server-adds-support-for-tool-specific-configuration-and-more/))

So two registrations of one server name, launched differently, can legitimately
answer with different tool counts, different descriptions, and therefore
different byte and token totals. A single ledger over both is not a rounding
error; it can be the wrong number.

### But it does not occur on this machine today

Scanned every config path in `mcp/registry.rs` plus `~/.codex/config.toml`:
**0 server names carry more than one distinct launch spec.** Two names appear in
three host files each — `spades-audio` (`.claude.json`, `.claude/mcp.json`,
Claude Desktop) and `tauri` (`.claude.json`, `.codex/config.toml`,
`.gemini/settings.json`) — but with identical specs, so both collapse to a
single `specGroup`. Caveat: that scan found 7 names against the 19 the app
reports, because it does not read project-scoped `.mcp.json` or plugin
marketplace files. It is a sample, not a census.

### A distinction the current grouping cannot make

Hosts resolve same-name collisions by precedence — local overrides project
overrides user, in both Claude Code and Cursor
([Cursor/Claude Code scopes](https://agent-drop.com/claude-code-vs-cursor-mcp)).
So two specs **within one host** means one of them is shadowed and never runs;
two specs **across different hosts** means both genuinely run. `specKeyOf`
groups on `launchDisplay` alone (`:431`), regardless of host, so the panel
cannot presently tell "both live" from "one dead". Worth deciding separately
from the ledger question.

### Prior art is thin

The reference Inspector has an open issue for an interface diff tool that
compares two servers' tools, prompts, resources and schemas
([modelcontextprotocol/inspector#1034](https://github.com/modelcontextprotocol/inspector/issues/1034)) —
no maintainer response, and an open question about whether it belongs in
Inspector at all. MCPJam supports multi-*server* workspaces but not one server
in several configurations. Nobody has an answer to copy.

### Options

| | Shape | Cost | Trade |
| --- | --- | --- | --- |
| **A** | Gate the ledger on `specGroups.length === 1` | One line | Matches the file's existing honesty pattern — the tab count (`:663`) and Verify (`:750`) already do exactly this. Multi-spec users lose the card entirely. |
| **B** | One ledger per spec group, above that group's tools block | Small | `SpecGroup.result` already carries `cost` (`:105`, `:81`), so **no backend work**. Single-spec renders identically to today. Makes the deleted "the tool list below, totalled" sentence true again in every case. |
| **C** | Keep one ledger, label which launch it describes | Small | Honest but still answers a question nobody asked — the reader wants the cost of the tools they are looking at. |

**Recommended: B.** It is the only option that makes the figure correct rather
than merely honest about being possibly wrong, it costs nothing the code does
not already have, and it restores the ledger-to-list tie that had to be cut.
