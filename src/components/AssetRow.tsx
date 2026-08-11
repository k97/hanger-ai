import { formatEngineLabel } from "../utils/engineUtils";

export interface AssetItem {
  id?: string;
  name: string;
  category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents" | "Skill" | "Tool" | "Rule" | "Agent" | "Subagent";
  path: string;
  engine?: string | null;
  version?: string;
  details?: string;
  drifted?: boolean;
  isSymlink?: boolean;
  scopeBadge?: string;
  sourcePath?: string;
  declaredTools?: string[];
  parseStatus?: string;
  parseError?: string;
  linkState?: "linked" | "drifted" | "foreign" | "broken" | null;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
}

interface AssetRowProps {
  item: AssetItem;
  isSelected?: boolean;
  showKindColumn?: boolean;
  onClick?: () => void;
  onLink?: () => void;
  onUnlink?: () => void;
}

export function getSingularType(category: string): string {
  if (category.endsWith("s")) {
    return category.slice(0, -1);
  }
  return category;
}

export function getRowState(item: AssetItem) {
  const state = item.linkState ?? item.link_state ?? (
    item.parseStatus === "failed" ? "broken" :
    item.drifted ? "drifted" :
    (item.isSymlink || item.sourcePath) ? "linked" :
    null
  );

  switch (state) {
    case "broken":
      return {
        dotClass: "w-2 h-2 bg-danger-fill shrink-0",
        word: item.parseStatus === "failed" ? "Won't parse" : "Target missing",
        wordClass: "text-danger-text-on-tint font-medium",
        rowClass: "bg-danger-tint text-danger-text-on-tint border-danger-tint",
      };
    case "drifted":
      return {
        dotClass: "w-2 h-2 bg-warning-fill shrink-0",
        word: "Drifted · review",
        wordClass: "text-warning-text-on-tint font-medium",
        rowClass: "bg-warning-tint text-warning-text-on-tint border-warning-tint",
      };
    case "foreign":
      return {
        dotClass: "w-2 h-2 bg-warning-fill shrink-0",
        word: "Foreign",
        wordClass: "text-warning-text-on-tint font-medium",
        rowClass: "bg-warning-tint text-warning-text-on-tint border-warning-tint",
      };
    case "linked":
      return {
        dotClass: "w-2 h-2 bg-success-fill shrink-0",
        word: item.isSymlink ? "Symlinked" : (item.sourcePath ? "Tracked copy" : "Linked"),
        wordClass: "text-text-secondary font-normal",
        rowClass: "hover:bg-n-25 text-text-primary border-transparent hover:border-n-100",
      };
    default:
      return {
        dotClass: "w-2 h-2 border border-text-muted shrink-0",
        word: "Local only",
        wordClass: "text-text-muted font-normal",
        rowClass: "hover:bg-n-25 text-text-muted border-transparent hover:border-n-100",
      };
  }
}

export default function AssetRow({ item, isSelected, showKindColumn = true, onClick }: AssetRowProps) {
  const { dotClass, word, wordClass, rowClass } = getRowState(item);
  const activeClass = isSelected ? "bg-n-50 border-n-100" : rowClass;
  const nameColor = item.parseStatus === "failed" ? "text-text-muted" : "text-text-primary";
  const engineLabel = formatEngineLabel(item.engine);

  return (
    <div
      onClick={onClick}
      tabIndex={0}
      data-selected={isSelected ? "true" : "false"}
      className={`flex items-center gap-3 h-[22px] px-3 rounded-control border transition-colors duration-fast cursor-pointer text-ui font-sans focus:outline-none focus:ring-2 focus:ring-accent ${activeClass}`}
    >
      {/* 0: State Dot + Name Column (flex-1 min-w-[180px]) */}
      <div className="flex items-center gap-2 flex-1 min-w-[180px] overflow-hidden">
        <div
          data-testid="state-dot"
          className={dotClass}
          style={{ borderRadius: "9999px" }}
          title={item.parseError || word}
        />
        <span className={`text-row font-medium ${nameColor} truncate`}>
          {item.name}
        </span>
      </div>

      {/* 1: Kind Column (90px) */}
      {showKindColumn && (
        <span className="text-row font-normal text-text-muted shrink-0 w-[90px] text-left truncate hidden @[460px]:block">
          {getSingularType(item.category)}
        </span>
      )}

      {/* 2: Engine Column (110px) */}
      <span className="text-row font-normal text-text-muted shrink-0 w-[110px] text-left truncate hidden @[580px]:block">
        {engineLabel}
      </span>

      {/* 3: State Column (110px) */}
      <span className={`text-row shrink-0 w-[110px] text-left ${wordClass} truncate`}>
        {word}
      </span>
    </div>
  );
}
