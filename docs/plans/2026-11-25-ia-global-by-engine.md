# Information architecture: Global, seen by engine

Status: **approved by Karthik, 2026-11-25, with no annotations.** He took each recommended answer, Q1–Q6, and the three new labels below ("All engines", "≈ N tokens every session", "Not loaded by {engine}"). The visual companion is `2026-11-25-ia-global-by-engine.html`.

It follows `docs/plans/2026-11-25-ia-engines-into-global.md`, which is built and on local `main`. It replaces that plan's D1 and T1, the Engines tab.

## Why

Karthik, 2026-11-25:
- "I don't understand the purpose of this page. If the purpose is to manage MCP tools, we probably don't need a separate MCP server tab."
- "Shouldn't the All tab be the context for the Engines details?"

The Engines tab is the MCP servers tab again, filtered to one engine. Since T2 and T3, that tab already filters by engine and switches from the rows.

The question an engine page should answer is different: **what does this engine load every session, across every kind of asset, and what does it cost?** No tab answers that, because no tab crosses kinds. All is the only view that already does. So the engine becomes a lens on All, not a tab beside it.

## The model in one line

Global is one grid: **asset × engine**. Two independent filters slice it:
- **Kind**, the tabs: All · Skills · MCP servers · Rules · Subagents.
- **Engine**, a selector: All engines, or one engine.

**All + one engine is the engine's page.** Kind tabs + one engine are its parts.

### What the code already has
- Every asset kind carries per-engine reach from `get_asset_annotations` (`annotations.rs`, `EngineReach { reached, via_root, via_store, reason }`). The grid exists today; it's drawn as the Reach tiles.
- MCP servers carry per-engine on/off and ≈ tokens (`get_engine_context`).
- A skill's "Always on" cost (frontmatter tokens) exists, but only one skill at a time, on open (`read_asset_body`).
- **Missing:** a per-engine total for skills, rules and subagents. Counts come from the backend (`no-frontend-counting`), so that total is a new backend command (Phase 2).

## Site map

There are no URLs (Tauri). View state is the `selected_sidebar_item` preference plus the engine preference.

```
Rail
├─ Search (⌘K)
├─ My machine
│  ├─ Global                         profile
│  │  ├─ Engine: All engines | Claude Code | Codex | …    selected_engine (null = all)
│  │  └─ Kind:   All | Skills | MCP servers | Rules | Subagents
│  │     └─ Inspector: asset / MCP server / switched-off server
│  └─ ‹repo›                         /path    (engine selector: Phase 3)
├─ Link map
├─ Discovery
├─ Needs review
└─ Settings (modal), Design system (dev)

Removed: the Engines tab (global:Engines → profile, the engine stays selected)
```

## Navigation model

- **Primary (rail):** unchanged since T1. Engines is not a destination.
- **Secondary (in Global):**
  1. **Kind tabs**, top row, unchanged. Their counts stay store totals in Phase 1.
  2. **Engine selector**, one row inside the summary strip on **every** Global tab. It replaces the "By engine" band.
     - It is a row of chips: All engines, then one chip per engine with its mark and, from Phase 2, its ≈ startup tokens. The row wraps; it never grows into a grid.
     - The selection holds when you switch tabs.
- **Breadcrumb:** "My machine › Global" for All engines, "My machine › Global › Claude Code" for one engine. Clicking "Global" in the crumb goes back to All engines.
- **Cross-links into the selector:**
  - inspector host names
  - a "Switched off" row's engine
  - ⌘K
  - each sets the engine, not a tab

## Content hierarchy

### Global, All engines: the store view (today's job)
1. Kind tabs. Where the user goes next.
2. Strip: total assets, link-health legend (linked / drifted / broken / local only), Rescan, Needs review. The store's health, which is this view's question.
3. Engine selector. The way into the engine view, always visible.
4. The list, with Reach tiles per row. On MCP servers the tiles are switches (T2).
5. Switched off, config problems, foot.

### Global, one engine: the engine view (new)
1. Kind tabs. They also act as the parts of the budget below.
2. **Strip, engine mode:** "Claude Code · ≈ N tokens every session", then one segment per kind:
   - MCP tool descriptions ≈ 13,598 (11 of 17 measured) · Skill descriptions ≈ … · Rules ≈ … · Subagent descriptions ≈ …
   - Each segment is a button that opens that kind's tab.
   - Measure all sits here.
   - The link-health legend leaves; it answers the store question, not this one.
3. **The list, filtered to what this engine reaches.**
   - Each row's figure is its cost for this engine.
   - MCP rows keep that engine's switch.
   - Skills, rules and subagents are read-only.
4. **"Not loaded by Claude Code · N"**, folded. It lists assets in the store this engine doesn't reach, each with the reach reason ("Not linked", "Another engine's format"), plus Link to….
   - This is where the store job and the engine job meet.
5. Switched off for this engine.

**Phase 1 honesty rule:** until the backend gives per-kind totals, those strip segments read "Not measured". The tab counts stay store totals and are labelled that way. No number is added up in the frontend.

## User flows

**1. Trim what an engine loads (the new job)**
1. Global. Pick Claude Code in the selector.
2. The strip shows its budget by kind. Pick the largest segment, e.g. MCP.
3. The MCP tab opens, filtered to Claude Code, each row with ≈ tokens and a switch.
4. Switch a server off. The notice offers Undo, and the strip total drops.
   - If the server is read-only for that engine, the row says why and has no switch.

**2. Turn one server off somewhere**
1. ⌘K, type its name. Enter opens it (the F2 fix).
2. Either use the row's engine tile, or use Details › Registered in and that engine's switch.

**3. Check the store (the existing job)**
1. Global with All engines. Use the legend filters, or go to Needs review.

**4. Why doesn't Codex see this skill?**
1. Pick Codex in the selector, open "Not loaded by Codex".
2. Find the skill there with its reason. Then use Link to….

**5. Bring a server back**
1. On the server's engine, open Switched off. The row opens in the inspector.
2. Switch it on. The notice offers Undo.

## Naming

| Concept | Label | Notes |
|---|---|---|
| a coding tool | engine | Never "host" (Q1, approved) |
| no engine filter | All engines | **New, needs sign-off** |
| per-engine total | ≈ N tokens every session | **New, needs sign-off.** Today's "≈ N tokens of tool descriptions" stays as the MCP segment's label |
| assets an engine doesn't reach | Not loaded by {engine} | **New, needs sign-off** |
| start servers and read their tools | Measure / Measure all | approved |
| a kept server | Switched off | approved |

The three strings left over from the last round still need your word:
- "Switched off {timeAgo}"
- the also-declared line
- the Claude.ai can't-be-measured line

## Component reuse

| Component | Change |
|---|---|
| `SummaryStrip` | Gains an engine mode (budget by kind). It drops today's "MCP mode", which this replaces. |
| `HeroBand` "By engine" | Becomes the engine selector row on Global. The repo's "By engine" band is unchanged. |
| `EnginesPane` | Retired. Its budget card moves into the strip; its per-row figure and read-only reason move onto list rows when an engine is selected. |
| `EnginesSidebar` + test | Deleted (unused since T1) |
| `EngineReachTiles` | Unchanged. With an engine selected, the row's other tiles dim and the selected engine's tile leads. |
| `useMcpSwitch`, `SwitchNotice`, inspector | Unchanged |

## Phases

| Phase | Scope | Backend |
|---|---|---|
| **1** | <ul><li>Remove the Engines tab, migrating its preference.</li><li>Put the engine selector on every Global tab.</li><li>Filter the list by `reached`.</li><li>Strip engine mode with MCP tokens; other kinds "Not measured".</li><li>The "Not loaded by" group.</li><li>Per-row MCP figures and reasons.</li></ul> | none |
| **2** | A per-engine budget: reached count and ≈ always-on tokens for each kind. Then the strip segments, tab counts and selector chips show real figures. | new command, e.g. `get_engine_budget` |
| **3** | The engine selector on repo screens | probably none |

**Unknown, and Phase 2 depends on it:** what each engine actually loads at startup for skills, rules and subagents. "Reached" means the engine can see the asset, not that it loads it every session. The engine matrix has measured this for MCP only. Phase 2 starts with a short measurement pass, engine by engine, the way the MCP matrix was built. An engine that hasn't been measured shows "Not measured", never a guessed figure.

For Claude Code, that pass must first check whether `disable-model-invocation: true` in a skill's frontmatter, and the `skillOverrides` setting, keep a skill out of the startup list (Karthik, 2026-11-25, Q17 of `2026-11-25-t3-code-review.md`). 24 of his skill files set the first, and today's per-skill "Always on" figure counts every skill.

## Questions where I need your word

Each has my recommendation.

- **Q1. Where does the engine selector sit?**
  - **Recommended:** a chip row inside the strip, on every Global tab, under the kind tabs. Kind tabs stay on top, because their counts are store totals.
  - Alternative: engines as children of "Global" in the sidebar. You usually keep the sidebar collapsed, so it would be hidden.
- **Q2. What does Global open on?** **Recommended:** the last engine you picked, or All engines on first run. It persists like today's `selected_engine`.
- **Q3. Ship Phase 1 before the backend budget exists?** **Recommended: yes.**
  - The Engines tab is the confusing part, and Phase 1 removes it with no Rust.
  - The cost: three "Not measured" segments in engine mode until Phase 2.
- **Q4. Show "Not loaded by {engine}"?** **Recommended: yes, folded.** It joins the store job to the engine job, and it's built from existing reach data.
- **Q5. Can skills, rules and subagents be switched per engine?** **Recommended: no, not in this slice.** They're read-only with a reason. Switching them is a new write path with its own rulings.
- **Q6. The repo screen?** **Recommended: Phase 3.** Repos keep their "By engine" counts band until then.

## What this doesn't change

- the backend
- the switch rules (rulings 10–27)
- the inspector
- ⌘K behaviour after the F2 fix
- the H2 rule: any real write needs your go-ahead first
- the H4 rule: no push without your word

**In one sentence:** Global becomes one asset-by-engine grid; picking an engine on All shows everything that engine loads and what it costs, so the Engines tab goes, and Phase 2 adds the backend totals that make the figure true for every kind.
