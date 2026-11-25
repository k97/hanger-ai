# Information architecture: moving Engines into Global

Status: **approved by Karthik (H1, 2026-11-25), with no annotations.** He took each recommended answer: Q1 yes to both renames, Q2 a click on a tile switches immediately, Q3 deferred.

Sources:
- the A9 captures in `docs/evidence/2026-11-25-engines-ui/`
- a cold read of `src/` by a subagent that did not use the project docs; its claims were spot-checked in the code
- `git diff origin/main..HEAD`: 36 commits, about 4.0k lines in `src`, 9.6k in `src-tauri` and 1.9k in `docs`

## Verdict

The switching backend is sound. It was placed in the wrong spot: a seventh top-level screen beside Global.

The same fact now appears in five places:
1. the "By host" band
2. the Engines pane
3. the inspector's "Registered in" rows
4. ⌘K
5. "Switched off"

They use two units (tools and tokens), two counting rules, and two words for one idea (host and engine). No route links one place back to another.

The list a user actually works in, Global › MCP servers, shows no on/off state at all. The fix is to fold Engines into Global. The best idea is already on screen: the "Registered in" engine tiles become the switches.

## Who Hanger competes with

Each engine now switches its own servers: Claude Code with `/mcp`, Codex with `enabled = false`. Switching inside one engine is not Hanger's job, because the engines already do it. Hanger's job is the **cross-engine** view: one server, every engine that loads it, what it costs in each, and switches with undo.

The UI should therefore lead with server × engine, not with one engine at a time. The separate Engines screen leads with one engine at a time, so it competes on the engines' own ground.

## Current map, MCP and engine parts only

```
Rail: [mark] Search  My machine  Link map  Discovery  Engines*  | Needs review   Design  Settings
My machine
└─ Global (ProfilePane): tabs All | Skills | MCP servers | Rules | Subagents
   └─ MCP servers tab
      ├─ strip "N tool descriptions across M hosts"
      ├─ band "By host": per host, servers and tools; rows can't be clicked
      ├─ rows: name · Registered in (engine tiles, no on/off) · Tools
      ├─ Switched off · N: each row jumps to the Engines screen
      └─ inspector › Details › Registered in: a switch per registration
Engines* (2nd column: engine list) → pane: ≈ tokens, Measure all, a switch per row
   rows don't open the inspector; the inspector doesn't render on this screen
⌘K: the Switch group sits below every asset result and appears only after typing
```

## Proposed map

```
Rail: [mark] Search  My machine  Link map  Discovery  | Needs review   Design  Settings
                                            (Engines removed from the rail)
My machine
└─ Global: tabs All | Engines | Skills | MCP servers | Rules | Subagents
   (Engines second, after All: Karthik, 2026-11-25)
   ├─ MCP servers tab: the cross-engine view
   │  ├─ strip "N tool descriptions across M engines"
   │  ├─ band "By engine" (renamed). Each row shows ≈ tokens · servers · J off.
   │  │  Clicking a row filters the list to that engine. Clicking it again clears the filter.
   │  │  The band carries "M of K measured · Measure all".
   │  ├─ rows: name · Registered in = SWITCHABLE ENGINE TILES · Tools
   │  │    tile filled = on · hollow = off · lock = read-only (tooltip: reason)
   │  │    clicking a tile switches that engine, and the notice offers Undo
   │  ├─ Switched off · N: rows open the server in the inspector (kept entry)
   │  └─ inspector: unchanged. "Registered in" host names link to Engines tab › engine.
   └─ Engines tab: one engine at a time, for everything it loads
      ├─ engine chips across the top (replace the 2nd-column list; selection persisted)
      ├─ budget card: ≈ tokens · measured · off · Measure all (moved from EnginesPane)
      ├─ MCP servers: today's Context rows. Clicking a row opens the inspector; the switch stays.
      └─ (later) Skills · Rules · Subagents this engine reaches, counts only
⌘K: the Switch group ranks first when the query matches a server name exactly;
     the placeholder adds "or switch a server"
```

## Decisions taken in this draft

Every decision below is reversible. Each line gives the decision, its reason, and how to revert it.

**D1. Engines leaves the rail and becomes a tab in Global, second after All (Karthik, 2026-11-25).**
- Reason: an engine is a lens on the same inventory, not a separate place. This is also your suggestion.
- The inspector then works on it for free, because Global renders one.
- Revert: put the rail entry back and route `engines` again.

**D2. The "Registered in" tiles on MCP server rows become switches.**
- Reason: this is the server × engine matrix. It is where the user already looks, and it is the one thing no engine offers.
- The data is already joined, because ⌘K's `actionsFor` does the same join.
- Revert: make the tiles display-only again.

**D3. "By host" becomes "By engine". Its rows filter the list, and its figures come from `get_engine_context`.**
- Reason: one word for one idea (the repo band already says "By engine"), and one counting rule, so the band and the Engines tab can't disagree.
- Revert: rename it back and use the summary counts again.

**D4. Engine figures are shown in tokens everywhere. Tool counts stay only on server rows and in the inspector.**
- Reason: tokens are what an engine pays for. A tool count is a property of a server.
- Revert: put the tool counts back in the band.

**D5. "Switched off" rows open the kept entry in the inspector instead of jumping screens.**
- Reason: no more dead end, and the user doesn't lose their place.
- Revert: restore the jump.

**D6. Engines tab rows open the inspector. Inspector host names link to Engines › engine.**
- Reason: closes both one-way trips.
- Revert: remove the handlers.

**D7. In ⌘K, the Switch group comes first on an exact server-name match, and the placeholder mentions switching.**
- Reason: today the actions are found only by scrolling.
- Revert: restore the old group order.

**Not changed:**
- the backend
- the inspector layout
- the switch rules (rulings 10–27)
- the switch notice
- the H2 per-write rule

## Your call: questions where I need your word

- **Q1. Names in the signed-off naming brief.**
  - D3 renames "By host" to "By engine" and "across M hosts" to "across M engines".
  - Should "Verify" and "Check again" in the inspector become "Measure" and "Measure again", matching "Measure all"? I recommend **yes to both**. One action shouldn't go by four labels.
- **Q2. Clicking a tile switches immediately, with Undo.** The alternative is a confirm step.
  - I recommend **immediately**: the write is reversible, the notice stays up, and the Engines tab works the same way today.
  - A matrix makes misclicks more likely, though. Your call.
- **Q3. Skills, rules and subagents on the Engines tab ("what it loads").** I recommend **deferring them to the next slice**. Context cost is only measured for MCP today, so counts without cost would be half a story.

## Sorted

**Strategy** (moves the mission): D1–D3. The matrix is the product.

**Hygiene** (correct and cheap, but not progress). Log these to `known-debt.md`, and fix them only where this slice touches them:
- `AssetRow` declares `onLink` and `onUnlink` but never renders them, so RepoPane's Unlink modal can't be reached.
- The Agents category can't be reached from the tabs.
- The MCP columns on a repo are always blank or "—".
- The internal id "Tools" leaks into ReviewInspector ("Broken link · Tools").
- "Link an asset from Global" drops the staged repo.
- Config-problem rows name a file but can't be clicked.
- In MCP mode, the strip's "Needs review" pill counts disagreeing servers, which are not Needs review issues.
- One `stateFilter` is shared between Global and repos.

**Ceremony** (noted, not acted on): Needs review offers three ways to filter by place and two by kind.

## Tasks, each one gated like Lane A

- **T1. Engines tab in Global.**
  - Move the `EnginesPane` body into a `ProfilePane` tab, with engine chips and a persisted `selected_engine`.
  - The tab sits second, straight after All: All · Engines · Skills · MCP servers · Rules · Subagents (Karthik, 2026-11-25, during T1).
  - Remove the rail entry and the `engines` route.
  - Old saved preferences pointing at `engines` migrate to `global:Engines`.
  - Rows open the inspector.
- **T2. Switchable tiles.**
  - `EngineReachTiles` gets a switch mode, used on the Global MCP servers rows. Read-only engines show a lock and the reason.
  - Tests: a click calls `switchServer` with the right key; a read-only tile is inert; the Undo notice appears.
- **T3. The band becomes "By engine".**
  - Figures from engine contexts, rows act as filters, Measure all moves into the band.
  - Strip wording: "across M engines".
- **T4. Links.**
  - "Switched off" rows open the inspector.
  - Inspector host names link to the Engines tab.
- **T5. ⌘K.** Group order and placeholder.
- **T6. Captures and gates.** New A9-style screenshots of the same views. The four pinned gates. README counts if a test file is added.

Afterwards the run continues as planned:
1. B6: merge `perf/scan`.
2. Measure the real-machine rescan time.
3. C1: test switching on your real setup. Every write needs your go-ahead.
4. C2: report with approximate figures.
5. C3: the T3 review.

## What this review knows and doesn't

- **Read deeply:** the A9 screenshots, the switch types and hooks, and the routing in `App.tsx`. I checked the cold read's claims that the band rows can't be clicked, that `AssetRow` drops its link handlers, and that the Agents tab can't be reached.
- **Known only from the cold read, not re-checked:** the claims about RepoPane, Link map, Discovery and Needs review.
- **Possibly self-serving:** this session built the Engines screen. Deciding to fold it into another screen is the opposite of a sunk-cost bias, so it is probably not that. The urge to keep the Engines tab as well may be.

**In one sentence:** the switches work, but they live on their own screen; fold that screen into Global and turn the engine tiles the user already reads into the switches.
