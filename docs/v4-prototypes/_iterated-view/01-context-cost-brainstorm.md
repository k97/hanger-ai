# Brainstorm brief — what your harness costs every conversation

**Status:** not started. Written 2026-08-23 to be picked up in a fresh
session. Everything below is either cited to code or explicitly marked
unverified; nothing here has been designed yet.

---

## The prompt

> I want to brainstorm a new surface for Hanger: showing what my installed
> harness assets cost me in context, per conversation, per engine.
>
> Read `docs/v4-prototypes/_iterated-view/01-context-cost-brainstorm.md`
> first — it has the finding, what the backend can and cannot answer today,
> and the open questions. Then read `docs/harness.md` for the reach model
> and `.claude/rules/ui-copy.md` before proposing any label.
>
> Act as a principal technical lead and product designer. Do not write
> implementation code. Work through the open questions with me one at a
> time, propose two or three shapes with trade-offs, and only then draw.

---

## The finding

An engine's context window carries a fixed toll before the user types
anything, and the toll is set by what is *installed and reachable*, not by
what is used.

**MCP servers.** When a server is registered with a host, the host calls
`tools/list` at connect and the resulting definitions — name, description,
full input schema, enum values — enter the model's tool block on every
turn, invoked or not. Field-reported figures: 500–1,400 tokens per tool
schema; GitHub's official MCP server ~17,600 tokens per request on its
own; multiple servers routinely past 30,000 tokens of metadata before any
work happens. MCP-shaped definitions run 5–15× larger than a minimal
schema for the same tool.

Prompt caching does not solve this. Caching amortises the *billing*; the
tokens still occupy the window, and the window is the space the model has
to reason in.

**Skills** are the opposite case — they are already progressively
disclosed, in three tiers:

| Tier | When paid | Reported size |
|---|---|---|
| Always | every conversation, per skill installed | ~80 tokens median (name + description) |
| On invoke | when the model judges it relevant | 275–8,000 tokens (the body) |
| Maybe | only during execution | references and scripts |

**The part that is Hanger's alone.** The always-paid tier scales with how
many assets are installed, and it is paid **per engine, determined by
reach**. A skill three engines reach is paid in three engines'
conversations. A skill whose root is not linked costs nothing. Hanger is
the only thing that knows all the assets exist *and* which engines reach
each one, so it is the only thing that can compute the total.

On the machine this was written from: 110 skills in the store. If the
~80-token figure holds, that is a five-figure token cost sitting in every
conversation, per reaching engine, and nothing surfaces it today.

### Reading behind this

- Anthropic — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic — [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [MCP spec issue #2808 — tool schema token overhead](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2808)
- [MCP Context Window Explained](https://deploystack.io/blog/how-mcp-servers-use-your-context-window)
- [MCP Token Optimization: 4 approaches compared](https://www.stackone.com/blog/mcp-token-optimization/)
- [Is Progressive Disclosure All You Need for Long-Context Agents?](https://arxiv.org/html/2607.17598v1)

---

## What the backend can answer today

Verified 2026-08-23 against the tree.

| Datum | State | Citation |
|---|---|---|
| MCP tool **names and descriptions** | **Stored.** Size derivable now, no migration | `mcp/probe.rs:72-76` — `ProbedTool { name, description }` |
| MCP tool **input schemas** | **Discarded at probe time.** The larger half of the toll, and it is not in the store | `mcp/probe.rs` keeps only name + description |
| Skill **name + description** (tier 1) | **Parsed.** Size derivable now | `scanner.rs:434-440` — `SkillFrontmatter` |
| Skill **body** (tier 2) | Readable; file size derivable | `read_asset_body` |
| Skill **references / scripts** (tier 3) | Not enumerated | needs `list_asset_dir` — already a proposed small addition |
| **Which engines reach an asset** | **Derived at read time**, three verdicts | `annotations.rs:173-205`, `:502`, `:518` |
| Subagent `tools` | **Parsed and stored** | `scanner.rs:456-459` → `declared_tools` |

So the schema half needs a `PRAGMA user_version` migration
(`preferences.rs::init_db`, pinned by `store_migration_tests.rs`), and
everything else is available or nearly free. Given schemas are the bigger
half of the toll, that migration is worth more than it was first priced.

---

## What is NOT verified, and must be before a number ships

**This is the main risk in the whole idea.**

1. **The per-engine disclosure behaviour.** "~80 tokens always, body on
   invoke" is Claude's Agent Skills behaviour. Hanger models **eleven**
   engines. Whether each one discloses skills the same way — or at all —
   has not been checked against any engine's own documentation. A number
   drawn for the wrong engine is exactly the class of defect this project
   has spent its time removing.
2. **Whether all reachable skills are disclosed, or only some.** If a host
   filters, the total is wrong.
3. **The tokenizer.** Ruled 2026-08-23: not `tiktoken` — it buys precision
   against a BPE these engines may not use, and costs several MB of vocab
   in the bundle. Bytes are the fact; an approximate token figure is
   allowed only if labelled as an estimate.
4. **Whether hosts recently changed.** Claude Code's tool search now
   discovers MCP tools on demand (~85% less overhead reported), which if
   enabled changes the MCP half of the answer materially.

---

## Open questions to work through

1. **Posture.** Is Hanger willing to say "this costs you X"? Everything it
   says today is "this is what you have" and "this is what reaches it."
   Costing is a different, more opinionated stance, and it invites the
   next question — "so what should I remove?" — which is advice. Decide
   how far along that line the product goes before drawing anything.
2. **Where it lives.** The summary strip already answers "what do I have";
   this makes it answer "what does having it cost". Or it is its own pane.
   Or it is a column in Global. The strip is the cheapest and the loudest.
3. **The unit.** Bytes are exact and meaningless to a reader; tokens are
   meaningful and approximate; percent-of-window is meaningful and needs a
   window size that varies by model. Possibly two of the three.
4. **Per engine, or a total?** The honest figure is per engine, because
   reach differs. A single total would be a number no engine actually
   pays.
5. **Does this change the Reach column's meaning?** If reach is also a
   cost, the column stops being neutral wiring and starts being a budget.
   That may be right, and it is a large change to what the app is for.
6. **What a finding looks like here.** "This server costs 17k tokens in
   every Claude Code conversation" is a fact. Is it a *Needs review*
   issue? `reviewIssues.ts:24` types four kinds — `broken`, `drifted`,
   `duplicate`, `parse` — and cost is none of them. Adding a fifth is a
   ruling.
7. **Naming.** Every label here is first-time and needs a researched brief
   and Karthik's sign-off (`.claude/rules/ui-copy.md`). "Context cost",
   "always loaded", "per conversation", "toll", "footprint" — none are
   chosen.

---

## Constraints that already apply

- Counts come from the backend, never the frontend
  (`.claude/rules/invariants.md`). A byte or token sum is a count.
- Link state and reach are derived at read time, never cached. A cost that
  depends on reach inherits that.
- Tokens-only styling; the four radii plus `--radius-control` for mini
  buttons (ruled 2026-08-23).
- A fault is explained once and routed (`docs/findings.md` F34).
- Empty is a finding; pending is not — no pane asserts an absence before
  `scannedAt` is set.
- Copy must be literally true of the code.

## Where the current design stands

`00-gap-analysis-and-constraints.md` is the analysis and the ruling
record. The three prototype pages — `inspector-iterated.html`,
`banner-iterated.html`, `map-iterated.html` — are each one design with
their rulings in their legends. The MCP panel's Context section and the
skill panel's size line were corrected on 2026-08-23 to the three-tier
and per-request framings; this brainstorm is the surface *above* those,
which does not exist yet.
