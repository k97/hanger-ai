import { Award, Wrench, Scroll, Loader2, Workflow } from "lucide-react";

export type CategoryType = "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";

interface CategoryFilterCardsProps {
  skillsCount?: number;
  toolsCount?: number;
  rulesCount?: number;
  subagentsCount?: number;
  selectedCategory: CategoryType | null;
  onSelectCategory: (category: CategoryType | null) => void;
  loading: boolean;
}

export default function CategoryFilterCards({
  skillsCount,
  toolsCount,
  rulesCount,
  subagentsCount,
  selectedCategory,
  onSelectCategory,
  loading,
}: CategoryFilterCardsProps) {
  const cards = [
    {
      id: "Skills" as CategoryType,
      label: "Skills",
      count: skillsCount,
      icon: Award,
    },
    {
      id: "Tools" as CategoryType,
      label: "Tools",
      count: toolsCount,
      icon: Wrench,
    },
    {
      id: "Rules" as CategoryType,
      label: "Rules",
      count: rulesCount,
      icon: Scroll,
    },
    {
      id: "Subagents" as CategoryType,
      label: "Subagents",
      count: subagentsCount,
      icon: Workflow,
    },
  ];

  const handleCardClick = (id: CategoryType) => {
    if (selectedCategory === id) {
      onSelectCategory(null);
    } else {
      onSelectCategory(id);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, id: CategoryType) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleCardClick(id);
    }
  };

  return (
    <section className="@container font-sans select-none shrink-0">
      <div className="grid grid-cols-2 @[520px]:grid-cols-4 gap-3 @[520px]:gap-4">
        {cards.map((card) => {
          const isSelected = selectedCategory === card.id;
          const Icon = card.icon;

          return (
            <div
              key={card.id}
              tabIndex={0}
              onClick={() => handleCardClick(card.id)}
              onKeyDown={(e) => handleKeyDown(e, card.id)}
              className={`p-3 @[520px]:p-4 rounded-control border flex items-center justify-between cursor-pointer transition-colors duration-fast outline-none group ${
                isSelected
                  ? "bg-n-0 border-accent-fill text-text-primary"
                  : "bg-n-25 border-n-100 hover:bg-n-0 hover:border-n-200 text-text-muted"
              }`}
            >
              <div className="min-w-0 flex-1 pr-1 @[520px]:pr-2">
                <span className={`text-xs font-medium block transition-colors truncate ${
                  isSelected ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary"
                }`}>
                  {card.label}
                </span>
                <h2 className="text-title font-medium mt-1 text-text-primary truncate">
                  {loading ? (
                    <Loader2 className="animate-spin text-text-muted" size={20} />
                  ) : (
                    card.count ?? 0
                  )}
                </h2>
              </div>
              <Icon
                className={`transition-colors shrink-0 hidden @[640px]:block ${
                  isSelected ? "text-text-primary" : "text-text-muted group-hover:text-text-secondary"
                }`}
                size={24}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}
