import SourceListShell from "./SourceListShell";
import { DIRECTORIES } from "../data/directories";
import { kindCounts } from "../utils/directoryFacets";

interface DiscoverySidebarProps {
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  kind: string;
  onSelectKind: (kind: string) => void;
}

const grpClass =
  "flex items-center justify-between px-2.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

/**
 * Under Discovery the second column lists what the catalogue's directories
 * hold — the same facets that were once chips above the list, relocated by
 * Karthik's ruling (2026-08-15). "Categories" reuses the vocabulary the
 * asset panes already speak (CategoryFilterCards' "Filter by category");
 * the row set comes from kindCounts, the one sanctioned tally over the
 * static catalogue.
 */
export default function DiscoverySidebar({
  width,
  setWidth,
  collapsed,
  setCollapsed,
  kind,
  onSelectKind,
}: DiscoverySidebarProps) {
  const row = (active: boolean) =>
    `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
      active ? "bg-tint-plane text-tint-ink" : "text-ink-2 hover:bg-tint-plane"
    }`;

  const tally = (active: boolean) =>
    `text-micro tabular font-flex shrink-0 ${active ? "text-tint-ink opacity-70" : "text-ink-3"}`;

  return (
    <SourceListShell
      testId="discovery-sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
      <div className={grpClass}>Categories</div>
      {kindCounts(DIRECTORIES).map((facet) => {
        const active = kind === facet.kind;
        return (
          <div
            key={facet.kind}
            role="button"
            tabIndex={0}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelectKind(facet.kind)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectKind(facet.kind);
              }
            }}
            className={row(active)}
          >
            <span
              className={`flex-1 min-w-0 truncate text-base-app ${active ? "font-medium" : ""}`}
            >
              {facet.kind}
            </span>
            <span className={tally(active)}>{facet.count}</span>
          </div>
        );
      })}
    </SourceListShell>
  );
}
