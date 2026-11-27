# Round 26: approve the MessageScroller design

The short design is [`docs/superpowers/specs/2026-11-26-message-scroller-group-rail-design.md`](../superpowers/specs/2026-11-26-message-scroller-group-rail-design.md).

It uses shadcn's documented headless `@shadcn/react/message-scroller` for
scroll tracking and group jumps, and a shadcn `HoverCard` for the larger
group-title/count preview. The current Hanger rows, 24 × 2 ticks and list
layout stay in place. It applies to both Global and Repositories.

The scroller opens at the top, does not auto-follow, and is announced as a
static list rather than a chat log. It does not add a message composer,
scroll-to-latest button or streamed-chat behavior.

:::question id=q1
Approve this design so I can write the implementation plan?

- [ ] Approve and write the plan (Recommended)
- [ ] Not yet; I'll add changes in a note

Recommended: Approve and write the plan
:::

## Answer (Karthik's annotation, 2026-11-26)

The MessageScroller design is approved.
