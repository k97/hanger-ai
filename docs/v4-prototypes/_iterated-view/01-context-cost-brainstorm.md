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
>
> Seven surfaces are already proposed in that file, with the two framings
> that make them honest (a ranking is tokenizer-independent; measure the
> declared surface, not the cost). Start by pressure-testing those rather
> than from scratch — and start with the load-profile table, because it is
> the insight the rest hangs off.

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

### The four kinds load four different ways

This is the part nothing but Hanger can assemble, and it is the most
useful thing on this page.

| Kind | What loads | When |
|---|---|---|
| **Rule** | the whole file | every conversation |
| **MCP server** | every tool definition | every request, called or not |
| **Skill** | name + description | every conversation; the body only when used |
| **Subagent** | name + description | every conversation |

Two consequences fall straight out of it.

**Rules are the most expensive thing per byte, and nobody thinks of them
that way** — there are only a handful of them. A skill costs ~20 tokens
until it is invoked; a rule costs its entire body, always. Rules are also
the one kind with **no estimation problem at all**: no discovery tier, no
"when invoked", no host-dependent loading to hedge. The file's size *is*
the cost. `Layered rules` (already detected — `selectedProjectScan.layered`
in `Flyout.tsx`) is exactly where this compounds.

**A large skill is cheap and a small rule is not**, which is
counterintuitive and impossible to work out from any single engine's own
UI. That inversion is the thing worth teaching.

### Reading behind this

- Anthropic — [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic — [Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)
- [MCP spec issue #2808 — tool schema token overhead](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/2808)
- [MCP Context Window Explained](https://deploystack.io/blog/how-mcp-servers-use-your-context-window)
- [MCP Token Optimization: 4 approaches compared](https://www.stackone.com/blog/mcp-token-optimization/)
- [Is Progressive Disclosure All You Need for Long-Context Agents?](https://arxiv.org/html/2607.17598v1)

---

## What makes this shippable

Two framings get past the honesty problem that has blocked every absolute
figure so far.

**A ranking is tokenizer-independent.** We cannot state a token count we
can stand behind — wrong BPE, eleven engines, unverified behaviour. But
none of that touches *ordering*. Whatever tokenizer is used, a 10 kB tool
surface outweighs a 1 kB one. So Hanger can be confidently **comparative**
while staying honestly vague about absolutes. Bars, shares and rankings
survive every objection that kills a number.

**Measure the declared surface, not the cost.** Hanger sees what a config
declares to a host. What the host does with it — eager load, tool search,
deferral — is the host's business and differs between them. "This is what
is declared here" is literally true of the code and the config; "this
costs you X" is not.

## Proposed surfaces

Seven, cheapest first. None needs a figure Hanger cannot stand behind.

1. **A weight bar on the MCP list.** Each server's share of the total
   declared surface, drawn as a bar with no number, sortable. Answers
   "which three matter" at a glance. Uses only what `ProbedTool` already
   stores — no migration.
2. **The outlier line, per server.** "17 tools · one is a third of this
   server's surface." Concentration *inside* a server is as actionable as
   concentration across them, and it names the specific tool.
3. **Declared in more than one host — paid in each.** The strongest
   deferral signal Hanger can compute honestly, and the machinery exists:
   `agreement` and `distinct_spec_count` already detect duplicate
   registrations. A server declared in two hosts is loaded in both.
4. **The unlink delta.** "Removing this from Claude Code drops its
   declared surface by about a third." Hanger knows the links and can
   compute the difference. This is the actual planning tool — it answers
   *what would I get back*, which is the question behind deferring
   anything.
5. **Rules, by size, with layering shown.** See the load-profile table
   above. The cheapest surface to build and possibly the most surprising
   to read.
6. **Subagents get the same treatment as skills.** The fourth kind with a
   discovery cost. `declared_tools` is already parsed
   (`scanner.rs:456-459`); today it renders as a joined string.
7. **Group by origin, so decisions are bulk.** One plugin can install
   hundreds of assets. Nobody prunes hundreds one at a time — the decision
   is about the plugin. `source-origin` is already in `SkillFrontmatter`.

### The shape to design for

Both the MCP surface and the skill surface are **power-law, not spread**.
In one real harness inspected on 2026-08-23, three of nineteen servers
accounted for roughly 63% of the declared surface, and a single tool cost
more than an entire other server; among ~250 skills, almost all sat at the
floor while a handful of verbose descriptions carried the weight. Those
figures are **illustration, not data** — they were read from a harness's
own accounting, not computed by Hanger, and no number from that source may
ship. The shape is the point: there are only ever three or four things
worth touching, which is what makes a UI for this tractable.

## Out of bounds

**Runtime telemetry.** Session counts, request volume, "how much of your
usage was above 150k context", frequency of use. Hanger does not tap live
sessions and should not start. This is recorded because it is the obvious
next idea and the seductive one — and its cheap proxy is already dead:
`atime` records nothing on this machine, and Hanger's own scan would
overwrite the signal it was meant to read (§1.5 of the gap analysis).

Which means Hanger can answer **"what is declared, and what would
removing it get back"** and cannot answer **"what do you actually use"**.
Design inside that line.

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
| Subagent name + description | **Parsed** | `SubagentFrontmatter`, `scanner.rs:456-459` |
| **Rule file size** | Readable at annotation time, like link state — no column needed | rules are scanned as assets; read-time derivation is the invariant |
| Layered rules | **Already detected** | `selectedProjectScan.layered`, `Flyout.tsx` |
| Asset `source-origin` | **Parsed** for skills | `scanner.rs:434-440` |

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
5. **Whether rules load in full on every engine.** The load-profile table
   above says they do, and that claim carries more weight than any other
   on this page — it is what makes rules the most expensive kind per byte
   and drives surface 5. It was observed in ONE engine's own context
   accounting, not read from eleven engines' documentation. If some engine
   loads rules lazily, or only those matching a glob, the table is wrong
   for it. Check this first: it is the cheapest claim to verify and the
   most load-bearing.
6. **What "the whole file" means for a rule that references others.** A
   root rule file that links sibling files may pull them in, or may not.
   That decides whether a rule's cost is its own size or its transitive
   closure — and `Layered rules` already tells us the multi-file case is
   real here.

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
