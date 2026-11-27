# Round 27: correct MessageScroller tracking

The original layout and preview design was approved in
[`round 26`](2026-11-26-decisions-round-26.md). I checked the selected behavior
against the official [headless Message Scroller API](https://ui.shadcn.com/docs/react/message-scroller#api-reference)
and found that the original “anchor” wording would make an inventory behave
like chat.

`scrollAnchor` positions newly appended chat turns. A scan can add or remove
groups, so group items must not use it. Instead, each group gets a stable
`MessageScroller.Item` id; `GroupTicks` reads `visibleMessageIds` (visible
items in document order) and uses `scrollToMessage` for jumps. The existing
list markup has no `role="list"` today, so the corrected structure will give
the content `role="list"` and `aria-live="off"`, with each group item as a
`listitem`, rather than expose MessageScroller's default chat-log role.

The Design system specimen also uses `GroupTicks`, so it will receive the
provider and item structure needed to keep that example working.

:::question id=q1
Approve this API and accessibility correction so I can write the implementation plan?

- [x] Approve the correction and write the plan (Recommended)
- [ ] Not yet; I'll add a note

Recommended: Approve the correction and write the plan
:::

## Outcome (Karthik's Plannotator annotation, 2026-11-26)

Approved the correction and asked that the choice be marked complete.
