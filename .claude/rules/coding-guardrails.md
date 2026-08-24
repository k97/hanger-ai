# Coding guardrails

Always on. This is the preventive half of the stage-gate reviews;
`verification.md` owns what counts as proof once the work is done.

1. **Think before coding.** State the assumptions the task rests on. If two
   readings of the request lead to materially different work, surface them
   before building. Briefs and specs describe intent — reconcile them against
   the code first; the code is the fact and the disagreement is the report.
   When a task names an external reference (a design spec, an API doc, a
   standard), fetch it and cite it in the plan before implementing; building
   from memory of a named reference is a verification-integrity violation.
   **A brief extracted from a plan is not the plan.** Extraction drops the
   decisions a task depends on: twice in one cycle a worker called a
   plan-mandated value "my interpretation" or made "a reasoned choice" for a
   decision whose literal text sat in the same worktree. Before treating
   anything as unspecified, grep the plan for it.
2. **Simplest thing that works.** No speculative abstractions, no
   configurability nobody asked for. A shared component earns its existence
   with a second real caller, not a hunch that one is coming.
3. **Surgical changes.** Touch only what the request needs, in the file's
   existing patterns. Never edit a test, detector, or allowlist to reach
   green — report the failure and let Karthik decide (`verification.md`,
   Scope). "While I'm here" edits are separate commits or not at all.
4. **Goal-driven execution.** Every change pairs with a runnable check; write
   the failing test first wherever one can exist. Deliver the whole ask —
   scaling it down is Karthik's call, not yours — and say plainly what was
   left out and why.
