import SourceListShell from "./SourceListShell";
import { DIRECTORIES } from "../data/directories";
import { kindCounts } from "../utils/directoryFacets";
import { groupLabelClass } from "./typeRoles";

interface DiscoverySidebarProps {
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  kind: string;
  onSelectKind: (kind: string) => void;
  /** Owned by App.tsx alongside the favourited marks themselves, so this
   *  count and DiscoveryPane's hearts never drift apart. */
  favouritesCount?: number;
}

const grpClass = `flex items-center justify-between px-2.5 pt-[11px] pb-[5px] ${groupLabelClass}`;

/**
 * Under Discovery the second column lists what the catalogue's directories
 * hold — the same facets that were once chips above the list, relocated by
 * Karthik's ruling (2026-08-15). "Categories" reuses the vocabulary the
 * asset panes already speak (CategoryFilterCards' "Filter by category");
 * the row set comes from kindCounts, the one sanctioned tally over the
 * static catalogue.
 *
 * Favourites is a second, separate group above Categories rather than one
 * more kind chip: it filters by what the user did, not what a listing is,
 * and it exists only while it has something in it (Karthik's ruling,
 * 2026-08-16) — no dead row for a feature nobody has used yet.
 */
export default function DiscoverySidebar({
  width,
  setWidth,
  collapsed,
  setCollapsed,
  kind,
  onSelectKind,
  favouritesCount = 0,
}: DiscoverySidebarProps) {
  const row = (active: boolean) =>
    `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
      active ? "bg-sidebar-sel text-sidebar-sel-ink" : "text-sidebar-ink hover:bg-sidebar-sel"
    }`;

  const tally = (active: boolean) =>
    `text-small tabular font-flex shrink-0 ${active ? "text-sidebar-sel-ink opacity-70" : "text-ink-3"}`;

  return (
    <SourceListShell
      testId="discovery-sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
      {favouritesCount > 0 && (
        <>
          <div className={grpClass}>Favourites</div>
          <div
            role="button"
            tabIndex={0}
            aria-current={kind === "Favourites" ? "true" : undefined}
            onClick={() => onSelectKind("Favourites")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectKind("Favourites");
              }
            }}
            className={row(kind === "Favourites")}
          >
            <span
              className={`flex-1 min-w-0 truncate text-base-app ${
                kind === "Favourites" ? "font-medium" : ""
              }`}
            >
              Favourites
            </span>
            <span className={tally(kind === "Favourites")}>{favouritesCount}</span>
          </div>
        </>
      )}

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
