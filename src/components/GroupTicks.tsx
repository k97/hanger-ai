import { useEffect, useState, type RefObject } from "react";
import Tooltip from "./Tooltip";

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
 * own words, in the app's Tooltip, and a click scrolls that header to the
 * top. With fewer than two groups there is nowhere to jump, so it draws
 * nothing.
 *
 * The group in view is the last header that has passed into the top third of
 * `scrollRoot`, or the first group before any has. One IntersectionObserver,
 * rooted on the list and narrowed to that top third, says when to look again.
 */
export default function GroupTicks({
  groups,
  scrollRoot,
}: {
  groups: TickGroup[];
  scrollRoot: RefObject<HTMLElement | null>;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const idsKey = groups.map((g) => g.id).join(" ");

  useEffect(() => {
    const root = scrollRoot.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const ids = idsKey.split(" ");
    const headers = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    const pick = () => {
      const r = root.getBoundingClientRect();
      const line = r.top + r.height / 3;
      let current: string | null = null;
      for (const el of headers) {
        if (el.getBoundingClientRect().top <= line) current = el.id;
      }
      setActiveId(current);
    };
    const observer = new IntersectionObserver(pick, { root, rootMargin: "0px 0px -66% 0px" });
    headers.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [idsKey, scrollRoot]);

  if (groups.length < 2) return null;
  const current = groups.some((g) => g.id === activeId) ? activeId : groups[0].id;

  return (
    <nav aria-label="Jump to a group" className="absolute left-3 top-1/2 -translate-y-1/2 z-[3] flex flex-col">
      {groups.map((g) => {
        const name = groupHead(g.label, g.count);
        const on = g.id === current;
        return (
          <Tooltip key={g.id} label={name}>
            <button
              type="button"
              aria-label={name}
              aria-current={on ? "true" : undefined}
              onClick={() => document.getElementById(g.id)?.scrollIntoView({ block: "start" })}
              className="group flex items-center w-6 h-2 cursor-pointer"
            >
              <span
                className={`block w-6 h-0.5 rounded-pill transition-colors duration-hover ease-spring ${
                  on ? "bg-ink-2" : "bg-line-2 group-hover:bg-ink-3"
                }`}
              />
            </button>
          </Tooltip>
        );
      })}
    </nav>
  );
}
