# The README

`README.md` is the front door. It orients and links out; it does not restate
what `docs/` already says. Established 2026-08-30; design in
`docs/plans/2026-08-30-readme-structure-design.md`, execution in
`docs/plans/2026-08-30-readme-structure-plan.md`.

- **The section set is fixed** and pinned by
  `src/__tests__/readme-sync.test.ts`. Adding or renaming a section means
  changing `SECTIONS` in the same commit, and saying why in the message.
- **Figures are generated, never typed.** They live between
  `<!-- hanger:counts:start -->` and `<!-- hanger:counts:end -->` and come from
  `src/__tests__/readmeCounts.ts`. Regenerate with
  `~/.bun/bin/bun run src/__tests__/readmeCounts.ts`. A number typed into the
  prose beside the block is the defect the block exists to prevent —
  `agents.rs:48-57` records that mistake being fixed once already, in the
  Global empty-state copy, which "listed three engines by hand and went stale
  the moment `AGENT_CONFIGS` grew past them".
- **Entries are counted between an array literal's bounds, never by grepping a
  token.** `AgentConfig {` matches 12 times in an 11-entry table and
  `McpHost {` 18 times in a 16-entry one — the struct definitions, and in the
  second case an `impl`. A token grep does not fail; it reports a wrong number
  confidently, which is worse than no guard at all.
- **Nothing goes in the README that a `docs/` file already carries.** Grep
  before adding. The four blocks deleted on 2026-08-30 had each been duplicated
  for months with nothing going red, and one of them — a hand-typed roster of
  eleven engine names — was the highest-drift content in the file.
- **Cite a section by name, not a line range.** `invariants.md` cited
  `README.md:27-30` for the reaping rule; those lines were the platform-support
  table and the rule was at line 72. The link guard checks that a cited line
  range exists, and cannot check that it still says what you think.
- **A change that invalidates a diagram moves it in the same commit.** This
  clause is **not enforced**. No guard can read a mermaid graph and judge
  whether it still describes the code, and nothing here rasterises one — the
  diagrams' rendering is unverified until the file is seen on GitHub. It is
  prose, and recorded as prose on purpose: `verification.md` holds that a
  clause nothing can fail is decoration, and naming it beats pretending.
