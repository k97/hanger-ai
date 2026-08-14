import { CheckIcon, SpinnerIcon } from "./icons";

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

const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const chipPressedClass =
  "h-7 pl-2.5 pr-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

/** The category decision line — M3 filter-chip behaviour on the mono palette.
 *  Chips stay clickable at zero: filtering into an empty category shows its
 *  empty state rather than dead-ending the control. */
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

  const handleChipClick = (id: CategoryType | null) => {
    if (id !== null && selectedCategory === id) {
      onSelectCategory(null);
    } else {
      onSelectCategory(id);
    }
  };

  return (
    <section
      className="font-sans select-none shrink-0"
      role="group"
      aria-label="Filter by category"
    >
      <div className="flex items-center gap-[7px] overflow-x-auto">
        {chips.map((chip) => {
          const isPressed =
            chip.id === null ? selectedCategory === null : selectedCategory === chip.id;
          return (
            <button
              key={chip.label}
              tabIndex={0}
              aria-pressed={isPressed}
              onClick={() => handleChipClick(chip.id)}
              className={isPressed ? chipPressedClass : chipBaseClass}
            >
              {isPressed && <CheckIcon size={14} className="shrink-0" />}
              <span>{chip.label}</span>
              <span
                className={`text-micro tabular ${
                  isPressed ? "text-tint-ink opacity-70" : "text-ink-3"
                }`}
              >
                {chip.count === undefined && loading ? (
                  <SpinnerIcon className="animate-spin" size={11} />
                ) : (
                  chip.count ?? 0
                )}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
