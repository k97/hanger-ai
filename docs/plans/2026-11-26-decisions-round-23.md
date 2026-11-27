# Round 23 (re-asked): what should the group markers do?

In Hanger, the button labelled `Switched off · 2` is a tick in the group rail beside Global's list. Today, its `Tooltip` shows the group name and count; clicking it scrolls that group to the top.

The beUI `MessageScroller` is a chat transcript wrapper. Its rail is backed by `Message` rows and opens a preview of the message. Hanger's groups are not messages, so that component cannot be dropped in unchanged.

![Hanger's current Global list and group rail](/Users/karthik/Work/Labs/hanger-ai/docs/evidence/2026-11-26-global-list/try-now-current.png)

The first review was approved but returned no answer to the question. Re-asking with concrete choices.

:::question id=q1
How should a group marker behave?

Today, hovering shows the group name and count in a tooltip; clicking jumps to that group. The beUI rail previews the selected message. Hanger's groups need a different preview.

- [ ] Hover or focus opens a compact preview with the group title, count and a few row names; clicking still jumps (Recommended)
- [ ] Clicking opens the preview; clicking again jumps
- [ ] Keep the tooltip, but change something else (add a note)

Recommended: Hover or focus opens a compact preview with the group title, count and a few row names
:::

## Clarification from Karthik (2026-11-26)

Karthik clarified in chat: use the shadcn equivalent, `MessageScroller`:
https://ui.shadcn.com/docs/components/base/message-scroller#tracking-the-readers-position

The next round asks how its scroll-tracking behavior should meet Hanger's
existing group-tick rail. The shadcn component includes scroll anchors,
visibility tracking and jump methods, but no navigation rail or hover-preview
card.
