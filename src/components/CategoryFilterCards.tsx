import { useEffect, useRef } from "react";
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from "./ui/tabs";
import { LoaderCircleIcon } from "./icons";

export type CategoryType = "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";

/** Each tab's label. Display only: the `id` stays "Tools" -- it is the
 *  discriminant wired through filterPredicate and the count commands, and
 *  assets.category stays the literal 'tool' in the database. Rename is
 *  display-layer. Global's strip names its budget segments with these too. */
export const TAB_LABELS: Record<Exclude<CategoryType, "Agents">, string> = {
  Skills: "Skills",
  Tools: "MCP servers",
  Rules: "Rules",
  Subagents: "Subagents",
};

interface CategoryFilterCardsProps {
  /** Backend-owned total for the All chip. */
  allCount?: number;
  skillsCount?: number;
  toolsCount?: number;
  rulesCount?: number;
  subagentsCount?: number;
  selectedCategory: CategoryType | null;
  onSelectCategory: (category: CategoryType | null) => void;
  loading: boolean;
}

/** The category decision line — M3 filter-chip behaviour on the mono palette.
 *
 *  Empty categories are not rendered. A chip reading `Subagents 0` spends the
 *  decision line on a choice that leads nowhere; absence says the same thing
 *  more quietly. This reverses the previous rule — "chips stay clickable at
 *  zero so filtering into an empty category shows its empty state rather than
 *  dead-ending the control" — which is owner-approved.
 *
 *  Exemption: Tools ("MCP servers") stays visible at zero. For a file-shaped
 *  category, zero means zero and the chip leads nowhere; for MCP, zero is a
 *  true and actionable reading — an engine installed with no server
 *  configured has no tool surface, and no other category can say that. MCP
 *  stage 3 spec §6.2 postdates the hide-at-zero rule above and rules the
 *  exemption for this one chip only; the rule stands unchanged for Skills,
 *  Rules and Subagents.
 *
 *  One piece of that reasoning survives: a chip the user has *selected* stays
 *  rendered even at zero, because otherwise the only control that can clear
 *  the filter disappears and the view is stranded.
 *
 *  There is no Engines tab: an engine is a lens on these tabs, chosen with the
 *  overview card's engines, not a kind beside them (Phase 1 of
 *  docs/plans/2026-11-25-ia-global-by-engine.md). */
export default function CategoryFilterCards({
  allCount,
  skillsCount,
  toolsCount,
  rulesCount,
  subagentsCount,
  selectedCategory,
  onSelectCategory,
  loading,
}: CategoryFilterCardsProps) {
  const chips: Array<{ id: CategoryType | null; label: string; count: number | undefined }> = [
    { id: null, label: "All", count: allCount },
    { id: "Skills", label: TAB_LABELS.Skills, count: skillsCount },
    { id: "Tools", label: TAB_LABELS.Tools, count: toolsCount },
    { id: "Rules", label: TAB_LABELS.Rules, count: rulesCount },
    { id: "Subagents", label: TAB_LABELS.Subagents, count: subagentsCount },
  ];

  const visibleChips = chips.filter((chip) => {
    // "All" is the way back to an unfiltered view; it never hides.
    if (chip.id === null) return true;
    // A selected chip stays, or clearing the filter becomes impossible.
    if (selectedCategory === chip.id) return true;
    // undefined means "not counted yet", not "empty" — keep it while loading
    // so chips do not pop in after every scan.
    if (chip.count === undefined) return true;
    // Exemption (see the comment above): zero MCP servers is a finding, not
    // an empty category, so the Tools chip stays even at zero.
    if (chip.id === "Tools") return true;
    return chip.count > 0;
  });

  /* A press on the selected tab clears the filter, as the chips always have.
     Base UI fires onValueChange only on a change, so the re-press is caught
     on the tab itself; every other press arrives through onValueChange. */
  const handleValueChange = (value: unknown) => {
    onSelectCategory(value === "all" ? null : (value as CategoryType));
  };
  const handleTabClick = (id: CategoryType | null) => {
    if (id !== null && selectedCategory === id) onSelectCategory(null);
  };

  /* When the track scrolls (a narrow pane), keep the selected tab in view,
     including a selection made from elsewhere. */
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active]")
      ?.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: "smooth" });
  }, [selectedCategory]);

  return (
    <Tabs
      value={selectedCategory ?? "all"}
      onValueChange={handleValueChange}
      render={<section />}
      className="@container font-sans select-none shrink-0"
    >
      <TabsList ref={listRef} aria-label="Filter by category">
        <TabsIndicator />
        {visibleChips.map((chip) => {
          const selected = chip.id === selectedCategory;
          return (
            <TabsTrigger
              key={chip.id ?? "all"}
              value={chip.id ?? "all"}
              onClick={() => handleTabClick(chip.id)}
              // Below 576px of its own width the track tightens, and below
              // 512px it drops the counts, before it falls back to scrolling.
              className="px-3 @[576px]:px-4"
            >
              <span>{chip.label}</span>
              <span className={`text-micro tabular hidden @[512px]:inline ${selected ? "text-ink-2" : "text-ink-3"}`}>
                {chip.count === undefined && loading ? <LoaderCircleIcon size={12} active /> : (chip.count ?? 0)}
              </span>
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
