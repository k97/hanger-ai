import SegmentedTrack from "./SegmentedTrack";

export type CategoryType = "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";

/** Global's tabs: the asset categories, and Engines. Engines is a lens on the
 *  same inventory, not a category of asset, so it is not a `CategoryType`:
 *  nothing that filters or counts assets can be handed it. */
export type GlobalTab = CategoryType | "Engines";

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
  /** Global's Engines tab, second after All (Karthik, 2026-11-25: All ·
   *  Engines · Skills · MCP servers · Rules · Subagents). Absent on a
   *  repository, which has no Engines tab. While it is selected,
   *  `selectedCategory` is null. */
  enginesTab?: { selected: boolean; onSelect: () => void };
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
 *  The Engines tab carries no figure, for the reason the Engines list never
 *  did: the summary's `server_count` counts distinct names and leaves out the
 *  servers Hanger is keeping, so any number here would contradict the rows
 *  under it (P7 of docs/plans/2026-11-25-context-control-finish.md). It never
 *  hides, since it has no zero to hide at. */
export default function CategoryFilterCards({
  allCount,
  skillsCount,
  toolsCount,
  rulesCount,
  subagentsCount,
  selectedCategory,
  onSelectCategory,
  loading,
  enginesTab,
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

  const segments: Array<{ id: string; label: string; count?: number | null }> = visibleChips.map((c) => ({
    id: c.id ?? "all",
    label: c.label,
    count: c.count,
  }));
  // Straight after All, which is always first.
  if (enginesTab) segments.splice(1, 0, { id: "Engines", label: "Engines", count: null });

  return (
    <section className="@container font-sans select-none shrink-0">
      <SegmentedTrack
        segments={segments}
        selectedId={enginesTab?.selected ? "Engines" : selectedCategory ?? "all"}
        onSelect={(id) => {
          if (id === "Engines") enginesTab?.onSelect();
          else handleChipClick(id === "all" ? null : (id as CategoryType));
        }}
        ariaLabel="Filter by category"
        loading={loading}
        fitToContainer
      />
    </section>
  );
}
