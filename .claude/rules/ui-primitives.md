# UI primitives and shadcn tooling

- **Use the repo's `cn`, not the CLI's.** The shadcn CLI can add `cn@0.5.x`
  and generate `import { cn } from "cn"`. Hanger already has `cn` in
  `src/lib/utils.ts`, used by every existing wrapper. Remove the CLI-added
  package and import the local helper.
- **MessageScroller owns its scroll node and appends one hidden spacer.**
  `@shadcn/react/message-scroller` adds a direct `Content` child marked
  `data-message-scroller-spacer`, `hidden`, `aria-hidden="true"`. Structural
  tests must allow that exact node, require every application-supplied direct
  child to be an `Item` (`role="listitem"`), and must not treat the spacer as
  a row. Give each item a stable id and drive ticks from
  `visibleMessageIds` + `scrollToMessage`; do not pass `scrollAnchor`.
