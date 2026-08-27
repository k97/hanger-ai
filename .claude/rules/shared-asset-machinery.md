# Shared asset machinery

Hanger tracks four asset kinds — skill, rule, subagent, tool
(`src-tauri/src/domain.rs:373-378`). They are **not four independent
pipelines**. They share directories, dedup sets, roots and counting, so a
change scoped to one kind routinely lands on the other three without any test
going red.

**Before debugging, planning or implementing a change to one kind's
machinery, establish what the other three do with the same code.** Name them
in the plan or the report. "I only touched MCP" is a claim about intent, not
about blast radius.

## What is actually shared

Each of these has already produced, or nearly produced, a cross-kind defect.

- **An engine's config directory owns several kinds at once.**
  `AGENT_CONFIGS` gives `~/.claude` `skills`, `rules` AND `subagents`
  (`agents.rs:111-116`); `~/.codex` owns `skills` and `subagents`
  (`agents.rs:122-127`). A path change that looks like "where MCP servers
  live" is usually also "where skills live". Agent roots resolve as
  `home.join(rel_path)` (`scanner.rs:510`) — one join, every kind.
- **One dedup set spans every registration path.** `seen_registrations`
  (`scanner.rs:959`) is a single `HashSet<(config_path, server_name)>` used by
  the agent sweep, the machine pass and the project pass. Widening its key for
  one caller changes deduplication for the other two.
- **Roots are shared between kinds.** A registration attaches to the engine's
  existing agent root when one exists (`agent_root_ids`, `scanner.rs:1464`),
  so tool rows and skill rows sit under the same `roots` entry. `count_assets`
  aggregates per root, per category (`scanner.rs`, `Grouping`), and a tool row
  is a *registration* while a skill row is a file — the same table, two
  different arithmetics.
- **Guard floors count tables, not features.** `brand-coverage.test.ts` holds
  per-source floors over `registry.rs HOSTS`, `agents.rs AGENT_CONFIGS`,
  `scanner.rs get_engine_key` and `RULE_FILE_OWNERS`. Growing one of those
  tables means raising its floor in the same commit; the file says so and it
  has gone stale before (`verification.md`, "A floor set below the real
  number").

## The failure shape to watch for

**A partial fix that makes the data inconsistent is worse than a uniform
miss.** Found 2026-08-27 while planning MCP env-var support: honouring
`CODEX_HOME` for MCP sources alone would have read tools from the relocated
directory while still looking for skills in `~/.codex/skills`. Hanger would
then report an engine with servers and zero skills — and under
`ui-copy.md`'s "empty is a finding", that renders an absence as a fact about
the user's machine when it is really Hanger looking in the wrong place. A
uniform miss is at least honest. If a fix cannot cover every kind that shares
the machinery, say so and split it out rather than shipping the half.

## Proving it, not asserting it

Reasoning that the other kinds are untouched is not evidence
(`verification.md`). Capture the per-kind counts before the first commit and
after the last, from the real store:

```
sqlite3 "$HOME/Library/Application Support/com.rkarthik.hanger/hanger.db" \
  "select category, scope, count(*) from assets group by category, scope order by category, scope;"
```

Every category the change does not claim to touch must come back identical. A
move in one of them is a blocker to report, not a number to reconcile away.
Re-capture the baseline immediately before starting — a peer's scan moves
these (`shared-checkout.md`).
