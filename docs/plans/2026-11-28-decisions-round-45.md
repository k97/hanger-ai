# Round 45: wave 1 starts, and one question for P5

The eight plans are reconciled, and a fresh re-review checked them as a set
(`docs/reviews/2026-11-28-plan-2026-11-28-reconciled-eight-plans.md`):

- Every blocking question from the first reviews is answered.
- Every shared interface is spelled the same everywhere.
- Each wave 1 track can start from `main`.

Its one blocker was mine to fix: who runs the naming round. The answer is one
file, `docs/plans/2026-11-28-naming-round.md`. Each track adds its strings
when it reaches its naming task and stops for your sign-off on that section.

Wave 1 is starting, as you answered in round 44 Q9. That's six worktrees:

- MCP phase 2
- per-project overrides (where the shared switch-code chain starts)
- engine status
- `gh skill` and the skill budget
- Recent changes and profiles
- P3's Registry client and detectors

Each track runs task by task with a fresh review after each one, and stops at
your gates.

:::question
Q1. The Skills figure caps at 1% of Claude's context window (round 44 Q7), but Hanger can't read the window size, and it differs by model. How should Hanger get it?

A single built-in constant would make the card's "descriptions are being dropped" note false on a machine whose model has a different window.

- [ ] Look it up per model from a small table in Hanger (Opus, Sonnet, Haiku, their 1M variants), keyed by the model the engine is set to use. When the model is unknown, show the uncapped sum, labelled "at most".
- [ ] One constant, measured on this machine, with a note that it may differ
- [ ] Always show the plain sum, labelled "at most" (undoes the round 44 Q7 cap)

Recommended: Look it up per model, falling back to "at most"
:::

This is needed before P5's Task 12, which is late in that track, so wave 1
doesn't wait on it.

## Answer (Karthik, 2026-11-28)

**Look it up per model, falling back to "at most".** He also gave a standing order: "do not stop, make informed decisions from our original vision and keep working through until all the phases are done". Usage was at 96%, with the reset about 3 hours away, so wave 1 starts after the reset. From here, gate calls are made from the vision and recorded as rulings. Push and release still wait for his word.
