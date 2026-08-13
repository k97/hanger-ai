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

  // Rows stay neutral; the state carries all the colour (dot + word only).
  switch (state) {
    case "broken":
      return {
        dotClass: "w-2 h-2 bg-state-danger shrink-0",
        word: item.parseStatus === "failed" ? "Won't parse" : "Target missing",
        wordClass: "text-state-danger font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "drifted":
      return {
        dotClass: "w-2 h-2 bg-state-warning shrink-0",
        word: "Drifted · review",
        wordClass: "text-state-warning font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "foreign":
      return {
        dotClass: "w-2 h-2 bg-state-warning shrink-0",
        word: "Foreign",
        wordClass: "text-state-warning font-medium",
        rowClass: "hover:bg-plane-2",
      };
    case "linked":
      return {
        dotClass: "w-2 h-2 bg-state-success shrink-0",
        word: item.isSymlink ? "Symlinked" : (item.sourcePath ? "Tracked copy" : "Linked"),
        wordClass: "text-ink-2 font-normal",
        rowClass: "hover:bg-plane-2",
      };
    default:
      return {
        dotClass: "w-2 h-2 border-2 border-line-2 shrink-0",
        word: "Local only",
        wordClass: "text-ink-3 font-normal",
        rowClass: "hover:bg-plane-2",
      };
  }
}

export default function AssetRow({ item, isSelected, showKindColumn = true, onClick }: AssetRowProps) {
  const { dotClass, word, wordClass, rowClass } = getRowState(item);
  const activeClass = isSelected ? "bg-tint" : rowClass;
  const nameColor = item.parseStatus === "failed"
    ? "text-ink-3"
    : isSelected
    ? "text-tint-ink font-medium"
    : "text-ink-1";
  const engineLabel = formatEngineLabel(item.engine);

  return (
    <div
      onClick={onClick}
      tabIndex={0}
      data-selected={isSelected ? "true" : "false"}
      className={`flex items-center gap-3 h-8 mx-1.5 px-2.5 rounded-pill transition-colors duration-hover ease-spring cursor-pointer text-small font-sans focus:outline-none ${activeClass}`}
    >
      {/* 0: State Dot + Name Column (flex-1 min-w-[180px]) */}
      <div className="flex items-center gap-2.5 flex-1 min-w-[180px] overflow-hidden">
        <div
          data-testid="state-dot"
          className={dotClass}
          style={{ borderRadius: "9999px" }}
          title={item.parseError || word}
        />
        <span className={`text-base-app ${nameColor} truncate`}>
          {item.name}
        </span>
      </div>

      {/* 1: Kind Column (90px) */}
      {showKindColumn && (
        <span className="text-small font-normal text-ink-3 font-flex shrink-0 w-[90px] text-left truncate hidden @[460px]:block">
          {getSingularType(item.category)}
        </span>
      )}

      {/* 2: Engine Column (110px) */}
      <span className="text-small font-normal text-ink-3 font-flex shrink-0 w-[110px] text-left truncate hidden @[580px]:block">
        {engineLabel}
      </span>

      {/* 3: State Column (110px) */}
      <span className={`text-small font-flex shrink-0 w-[110px] text-left ${wordClass} truncate`}>
        {word}
      </span>
    </div>
  );
}
