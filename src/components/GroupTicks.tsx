import { useMessageScroller, useMessageScrollerVisibility } from "@shadcn/react/message-scroller";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";

export interface TickGroup {
  /** The group header's element id, `group-<key>`. */
  id: string;
  /** The header's own words. */
  label: string;
  /** The figure the header shows, or null where it shows none (an engine is
   *  picked, or the group has no backend count, as "Not loaded by" has not). */
  count: number | null;
}

/** A group header's words, as the header and its tick both print them. */
export function groupHead(label: string, count: number | null): string {
  return count === null ? label : `${label} · ${count}`;
}

/**
 * Tick marks beside Global's list, one per group on screen, at T3 Code's
 * size and place (its TimelineMinimap; Task 1 of
 * docs/plans/2026-11-26-global-list.md): 24 × 2 bars, 12px in from the list
 * area's left edge and centred down it, the group in view in `ink-2`, the
 * rest in `line-2`. ProfilePane draws them only while the lane's left
 * margin is wide enough to hold them (48px). A tick's name is the header's
 * own words, in a HoverCard, and a click jumps to the group's MessageScroller
 * item. With fewer than two groups there is nowhere to jump, so it draws
 * nothing. The first visible ticked item in MessageScroller's document-ordered
 * visibility list is current; before any ticked item is visible, the first
 * rendered group is current.
 */
export default function GroupTicks({ groups }: { groups: TickGroup[] }) {
  const { visibleMessageIds } = useMessageScrollerVisibility();
  const { scrollToMessage } = useMessageScroller();

  if (groups.length < 2) return null;
  const current =
    visibleMessageIds.find((id) => groups.some((group) => group.id === id)) ?? groups[0].id;

  return (
    <nav aria-label="Jump to a group" className="absolute left-3 top-1/2 -translate-y-1/2 z-[3] flex flex-col">
      {groups.map((g) => {
        const name = groupHead(g.label, g.count);
        const on = g.id === current;
        return (
          <HoverCard key={g.id}>
            <HoverCardTrigger
              delay={100}
              render={
                <button
                  type="button"
                  aria-label={name}
                  aria-current={on ? "true" : undefined}
                  onClick={() => {
                    scrollToMessage(g.id, { align: "start" });
                  }}
                  className="group flex items-center w-6 h-2 cursor-pointer"
                />
              }
            >
              <span
                className={`block w-6 h-0.5 rounded-pill transition-colors duration-hover ease-spring ${
                  on ? "bg-ink-2" : "bg-line-2 group-hover:bg-ink-3"
                }`}
              />
            </HoverCardTrigger>
            <HoverCardContent
              side="right"
              align="center"
              sideOffset={8}
              className="whitespace-nowrap px-3 py-2 text-small font-medium text-ink-3"
            >
              {name}
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </nav>
  );
}
