import { ChevronUpIcon, ChevronDownIcon } from "./icons";

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
        className={`flex items-center gap-1 cursor-pointer select-none font-medium tracking-[.06em] uppercase text-ink-3 hover:text-ink-1 transition-colors duration-hover focus:outline-none ${widthClass}`}
      >
        <span>{label}</span>
        {isActive && (
          sortDirection === "asc" ? (
            <ChevronUpIcon size={12} className="shrink-0" data-testid="sort-chevron-asc" />
          ) : (
            <ChevronDownIcon size={12} className="shrink-0" data-testid="sort-chevron-desc" />
          )
        )}
      </button>
    );
  };

  return (
    <div
      data-testid="asset-header-row"
      className="sticky top-0 z-[2] bg-plane flex items-center gap-3 h-8 px-3.5 border-b border-line font-flex text-micro"
    >
      {renderHeader("name", "Name", "flex-1 min-w-[180px] text-left")}
      {showKindColumn && renderHeader("kind", "Kind", "hidden @[460px]:flex w-[90px] shrink-0 text-left")}
      {renderHeader("engine", "Engine", "hidden @[580px]:flex w-[110px] shrink-0 text-left")}
      {renderHeader("state", "State", "w-[110px] shrink-0 text-left")}
    </div>
  );
}
