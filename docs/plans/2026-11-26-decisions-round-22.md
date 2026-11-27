# Round 22: which MessageScroller layout is wrong?

HYPOTHESIS: You want a layout bug fixed in an app that uses beUI's `MessageScroller`. Confidence: ~40% — Hanger and T3 Code have no `MessageScroller` usage, so I don't know which app and screen to reproduce.

I checked the live [beUI MessageScroller page](https://beui.dev/components/agents/message-scroller). Its preview uses a message-navigation rail; clicking a marker moved to that message and showed a preview card over the transcript. The docs describe that as part of the rail.

:::question
Which layout is not working as expected?

I haven't changed any code. Hanger has no MessageScroller component or usage, and T3 Code has no matching component name. My guess is you mean another app's chat layout; tell me the repo or URL and what you expected versus what happened.

- [ ] The beUI page's own preview — the rail's message preview card is the part that looks wrong
- [ ] T3 Code's chat layout — tell me which screen or state is wrong
- [ ] Another app or layout — give me its repo/page and the mismatch

Recommended: Another app or layout — Hanger and T3 Code don't use this component, so I need the actual target to reproduce.
:::
