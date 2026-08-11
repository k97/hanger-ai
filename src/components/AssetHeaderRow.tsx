import { ChevronUp, ChevronDown } from "lucide-react";

export type SortField = "name" | "kind" | "engine" | "state";
export type SortDirection = "asc" | "desc";

interface AssetHeaderRowProps {
  sortField: SortField;
  sortDirection: SortDirection;
  showKindColumn?: boolean;
  onSort: (field: SortField) => void;
}

export default function AssetHeaderRow({
  sortField,
  sortDirection,
  showKindColumn = true,
  onSort,
}: AssetHeaderRowProps) {
  const renderHeader = (field: SortField, label: string, widthClass: string) => {
    const isActive = sortField === field;
    return (
      <button
        type="button"
        onClick={() => onSort(field)}
        className={`flex items-center gap-1 cursor-pointer select-none text-row font-medium text-text-muted hover:text-text-primary transition-colors focus:outline-none ${widthClass}`}
      >
        <span>{label}</span>
        {isActive && (
          sortDirection === "asc" ? (
            <ChevronUp size={12} className="shrink-0 text-text-muted" data-testid="sort-chevron-asc" />
          ) : (
            <ChevronDown size={12} className="shrink-0 text-text-muted" data-testid="sort-chevron-desc" />
          )
        )}
      </button>
    );
  };

  return (
    <div
      data-testid="asset-header-row"
      className="sticky top-0 z-10 bg-surface flex items-center gap-3 h-[22px] px-3 border-b border-n-100 font-sans"
    >
      {renderHeader("name", "Name", "flex-1 min-w-[180px] text-left")}
      {showKindColumn && renderHeader("kind", "Kind", "hidden @[460px]:flex w-[90px] shrink-0 text-left")}
      {renderHeader("engine", "Engine", "hidden @[580px]:flex w-[110px] shrink-0 text-left")}
      {renderHeader("state", "State", "w-[110px] shrink-0 text-left")}
    </div>
  );
}
