# Round 28: what comes next, and the format for model output

Two decisions. The research note behind both is
[the harness model-layer research](2026-11-27-harness-model-layer-research.md);
your eight rulings on it are appended there.

:::question
Which piece of work should start next?

Three things are ready. The repository-view parity plan is open in its own tab and waits on your Q1 there. Hanger's own MCP server is the first step your rulings set for the model layer, and it has no plan yet. T22 is a real gap: Antigravity's MCP servers don't appear in Hanger at all, and its fix is the "split Gemini and Antigravity" ruling.

- [ ] Repository-view parity first — its plan is written and gated; it needs only your answers in the other tab
- [ ] Plan Hanger's MCP server first — the start of the model layer; nothing else in that direction can begin before it
- [ ] Fix T22 first — small, and it makes the app correct on a machine that already has Antigravity installed

Recommended: Repository-view parity first
:::

:::question
When the model's output reaches the screen, what format should it use?

This is for cards the model fills in fixed places, such as an explanation or a suggested next step. It only matters once the in-app model run exists, which comes after Hanger's MCP server. The research recommends A2UI, a public format that lets the model use only components the app already trusts. Whether its React renderer works with React 19, which Hanger uses, is not yet checked.

- [ ] A2UI catalogue of Hanger's existing components — a stable public format with a ready renderer, and the design-system guard still applies
- [ ] Hanger's own typed JSON format — no new dependency, but Hanger owns the format and its checks
- [ ] Decide when the first card is built — check the React 19 question then, with nothing using it before

Recommended: Decide when the first card is built
:::
