import SegmentedTrack from "./SegmentedTrack";

export type CategoryType = "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";

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
 *  the filter disappears and the view is stranded. */
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
    { id: "Skills", label: "Skills", count: skillsCount },
    // Display label only. The `id` stays "Tools" -- it is the discriminant
    // wired through filterPredicate and the count commands, and assets.category
    // stays the literal 'tool' in the database. Rename is display-layer.
    { id: "Tools", label: "MCP servers", count: toolsCount },
    { id: "Rules", label: "Rules", count: rulesCount },
    { id: "Subagents", label: "Subagents", count: subagentsCount },
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

  const handleChipClick = (id: CategoryType | null) => {
    if (id !== null && selectedCategory === id) {
      onSelectCategory(null);
    } else {
      onSelectCategory(id);
    }
  };

  return (
    <section className="font-sans select-none shrink-0">
      <SegmentedTrack
        segments={visibleChips.map((c) => ({ id: c.id ?? "all", label: c.label, count: c.count }))}
        selectedId={selectedCategory ?? "all"}
        onSelect={(id) => handleChipClick(id === "all" ? null : (id as CategoryType))}
        ariaLabel="Filter by category"
        loading={loading}
      />
    </section>
  );
}
