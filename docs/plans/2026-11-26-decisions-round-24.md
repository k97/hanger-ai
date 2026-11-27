# Round 24: MessageScroller in Hanger's group rail

Karthik said to use the shadcn MessageScroller equivalent:
[shadcn MessageScroller](https://ui.shadcn.com/docs/components/base/message-scroller#tracking-the-readers-position).

Hanger has two grouped lists (Global and Repositories). Each has one native
scroll viewport and a `GroupTicks` rail. Today the rail tracks headings with
its own `IntersectionObserver`, jumps with `scrollIntoView`, and wraps each
tick in a small `Tooltip`.

The shadcn component provides a provider, scroll root, viewport, content,
stable row items, `scrollAnchor`, `useMessageScrollerVisibility` and
`scrollToMessage`. Its default is chat-oriented (open at the end, content as
a live log, optional follow-output); for Hanger I would set `defaultScrollPosition="start"`,
leave `autoScroll` off, and set the content role to `list`, so scanning does
not announce the whole inventory as a stream.

It does **not** include a navigation rail or a hover-preview card. The beUI
page you linked adds those separately.

![Hanger's current Global list and group rail](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/try-now-current.png)

:::question-multi id=q1
Which parts of the MessageScroller-style navigation should Hanger use?

- [x] Use MessageScroller for scroll tracking and jumps; keep Hanger's existing 24×2 ticks
- [x] Replace the small Tooltip with a larger preview card showing the group title and count
- [ ] Other (add a note)

Recommended: Both selected parts
:::

## Outcome (Karthik's annotations, 2026-11-26)

The two completed annotations together mean: use MessageScroller's tracking
and jump behavior, retain the 24 × 2 tick marks, and replace the Tooltip with
a larger group-title/count preview.
