import { useState } from "react";
import { ExclamationCircleIcon } from "./icons";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import AssetRow, { AssetItem } from "./AssetRow";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import { Inventory, CategoryCounts } from "../App";
import { filterProfileAssets } from "../utils/filterPredicate";
import { sortAssetItems } from "../utils/sortUtils";
import { sumGlobalAssets } from "../utils/globalAssetCount";
import SummaryStrip from "./SummaryStrip";
import { linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";

interface ProfilePaneProps {
  inventory: Inventory | null;
  assetCounts?: CategoryCounts | null;
  selectedCategory?: CategoryType | null;
  selectedAsset?: { path: string } | null;
  loading: boolean;
  /** Toolbar filter text — rows whose name does not contain it are hidden. */
  filterText?: string;
  /** Link-state filter from the rail badge or the strip legend. */
  stateFilter?: StateFilter;
  onStateFilterChange?: (filter: StateFilter) => void;
  /** When the last scan completed — feeds the strip's scan stamp. */
  scannedAt?: Date | null;
  onRescan?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField) => void;
  onSelectAsset: (asset: { name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => void;
  onLinkAsset: (asset: any) => void;
  onClearSelection?: () => void;
}

export default function ProfilePane({
  inventory,
  assetCounts,
  selectedCategory: propSelectedCategory,
  selectedAsset,
  loading,
  filterText,
  stateFilter = null,
  onStateFilterChange,
  scannedAt = null,
  onRescan,
  sortField: propSortField,
  sortDirection: propSortDirection,
  onSortChange,
  onSelectAsset,
  onLinkAsset,
  onClearSelection,
}: ProfilePaneProps) {
  const [internalCategory, setInternalCategory] = useState<CategoryType | null>(null);
  const [internalSortField, setInternalSortField] = useState<SortField>("name");
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>("asc");

  const selectedCategory = propSelectedCategory ?? internalCategory;
  const sortField = propSortField ?? internalSortField;
  const sortDirection = propSortDirection ?? internalSortDirection;

  const setSelectedCategory = (cat: CategoryType | null) => {
    setInternalCategory(cat);
    if (onClearSelection) onClearSelection();
  };

  const handleSort = (field: SortField) => {
    if (onSortChange) {
      onSortChange(field);
    } else {
      if (field === internalSortField) {
        setInternalSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setInternalSortField(field);
        setInternalSortDirection("asc");
      }
    }
  };

  // Aggregate global assets grouped by agent configs (deduplicated)
  const rawAgents = inventory?.agents || [];
  const agents = rawAgents.filter((a, idx) => rawAgents.findIndex((other) => other.id === a.id) === idx);

  const rawSkills = inventory?.skills.filter((s) => s.scope?.Global) || [];
  const globalSkills = rawSkills.filter((s, idx) => rawSkills.findIndex((other) => other.path === s.path) === idx);

  const rawTools = inventory?.tools.filter((t) => t.scope?.Global) || [];
  const globalTools = rawTools.filter((t, idx) => rawTools.findIndex((other) => other.config_path === t.config_path) === idx);

  const rawRules = inventory?.rules.filter((r) => r.scope?.Global) || [];
  const globalRules = rawRules.filter((r, idx) => rawRules.findIndex((other) => other.path === r.path) === idx);

  const globalAssetsTotal = sumGlobalAssets(assetCounts);

  const emptyState =
    assetCounts !== null && assetCounts !== undefined
      ? globalAssetsTotal === 0
      : inventory === null || (globalSkills.length === 0 && globalTools.length === 0 && globalRules.length === 0);

  // Use the testable filter predicate utility
  const {
    skills: scopedSkills,
    tools: scopedTools,
    rules: scopedRules,
    agents: filteredAgents,
    subagents: scopedSubagents,
  } = filterProfileAssets(inventory, selectedCategory);

  // Toolbar filter narrows by name only; empty text passes everything.
  const filterQuery = (filterText ?? "").trim().toLowerCase();
  const nameMatches = (name: string) =>
    filterQuery === "" || name.toLowerCase().includes(filterQuery);

  const filteredSkills = scopedSkills.filter(
    (s) => nameMatches(s.name) && matchesStateFilter(s, stateFilter)
  );
  const filteredTools = scopedTools.filter(
    (t) => nameMatches(t.name) && matchesStateFilter(t, stateFilter)
  );
  const filteredRules = scopedRules.filter(
    (r) => nameMatches(r.name) && matchesStateFilter(r, stateFilter)
  );
  const filteredSubagents = scopedSubagents.filter(
    (sa) => nameMatches(sa.name) && matchesStateFilter(sa, stateFilter)
  );

  // Strip data: backend-owned total, frontend-derived state split.
  const stripCounts = linkStateCounts(inventory, { kind: "global" });
  const engineCount = Object.keys(assetCounts?.engines ?? {}).filter((k) => k !== "none").length;
  const stripSubtitle = `assets in your user profile · ${engineCount} ${
    engineCount === 1 ? "engine" : "engines"
  }`;

  // Check if the selected category itself is empty
  const isCategoryEmpty =
    (selectedCategory === "Skills" && filteredSkills.length === 0) ||
    (selectedCategory === "Tools" && filteredTools.length === 0) ||
    (selectedCategory === "Rules" && filteredRules.length === 0) ||
    (selectedCategory === "Agents" && agents.length === 0) ||
    (selectedCategory === "Subagents" && filteredSubagents.length === 0);

  const showSkills = selectedCategory === null || selectedCategory === "Skills";
  const showTools = selectedCategory === null || selectedCategory === "Tools";
  const showRules = selectedCategory === null || selectedCategory === "Rules";
  const showSubagents = selectedCategory === null || selectedCategory === "Subagents";

  // Map and sort category items
  const sortedSkills: AssetItem[] = sortAssetItems(
    filteredSkills.map((s) => ({
      name: s.name,
      category: "Skills",
      path: s.path,
      engine: s.scope?.Global?.agent || s.scope?.Project?.agent || null,
      version: s.version,
      details: s.source_origin ? `Origin: ${s.source_origin}` : "",
      isSymlink: s.is_symlink,
      parseStatus: s.parse_status,
      parseError: s.parse_error,
    })),
    sortField,
    sortDirection
  );

  const sortedTools: AssetItem[] = sortAssetItems(
    filteredTools.map((t) => ({
      name: t.name,
      category: "Tools",
      path: t.config_path,
      engine: t.scope?.Global?.agent || t.scope?.Project?.agent || t.owning_agent || null,
      details: `Command: ${t.command} (Transport: ${t.transport})`,
      isSymlink: t.is_symlink,
      drifted: t.drifted,
      parseStatus: t.parse_status,
      parseError: t.parse_error,
    })),
    sortField,
    sortDirection
  );

  const sortedRules: AssetItem[] = sortAssetItems(
    filteredRules.map((r) => ({
      name: r.name,
      category: "Rules",
      path: r.path,
      engine: r.scope?.Global?.agent || r.scope?.Project?.agent || null,
      isSymlink: r.is_symlink,
      drifted: r.drifted,
      parseStatus: r.parse_status,
      parseError: r.parse_error,
    })),
    sortField,
    sortDirection
  );

  const sortedSubagents: AssetItem[] = sortAssetItems(
    filteredSubagents.map((sa) => ({
      name: sa.name,
      category: "Subagents",
      path: sa.path,
      engine: sa.scope?.Global?.agent || sa.scope?.Project?.agent || null,
      details: `Declared Tools: ${sa.declared_tools.join(", ") || "None"}`,
      parseStatus: sa.parse_status,
      parseError: sa.parse_error,
    })),
    sortField,
    sortDirection
  );

  const sortedAgents: AssetItem[] = sortAssetItems(
    filteredAgents.map((agent) => {
      const sLen = filteredSkills.filter((s) => s.scope?.Global?.agent === agent.id).length;
      const tLen = filteredTools.filter((t) => t.scope?.Global?.agent === agent.id).length;
      const rLen = filteredRules.filter((r) => r.scope?.Global?.agent === agent.id).length;
      const aAssets = sLen + tLen + rLen;

      return {
        name: agent.name,
        category: "Agents",
        engine: agent.name,
        path: agent.global_config_path || "Default global workspace root",
        details: `${agent.project_footprints.length} project folders detected | Assets: ${aAssets}`,
      };
    }),
    sortField,
    sortDirection
  );

  // Uppercase micro voice for section labels inside the list plane.
  const secClass =
    "px-3.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";
  const emptyPlaneClass =
    "flex-1 mx-[18px] mb-[18px] min-h-0 flex flex-col items-center justify-center text-center border border-dashed border-line rounded-plane bg-plane animate-in fade-in duration-200";

  // Visible rows post-filter for the foot line — a display subset, never the
  // asset total (which stays backend-owned).
  const visibleCount = sortedSkills.length + sortedTools.length + sortedRules.length + sortedSubagents.length + (selectedCategory === "Agents" ? sortedAgents.length : 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
      {/* Inventory summary strip */}
      <div className="mx-[18px] mt-[18px]">
        <SummaryStrip
          total={sumGlobalAssets(assetCounts)}
          subtitle={stripSubtitle}
          scannedAt={scannedAt}
          scanning={loading}
          counts={stripCounts}
          activeStateFilter={stateFilter}
          onFilterState={(f) => onStateFilterChange?.(f)}
          onRescan={onRescan}
        />
      </div>

      {/* Facet chips */}
      <div className="px-[18px] pt-3 pb-2.5">
        <CategoryFilterCards
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          allCount={sumGlobalAssets(assetCounts)}
          skillsCount={assetCounts?.byCategory.skill?.global}
          toolsCount={assetCounts?.byCategory.tool?.global}
          rulesCount={assetCounts?.byCategory.rule?.global}
          subagentsCount={assetCounts?.byCategory.subagent?.global}
          loading={loading}
        />
      </div>

      {emptyState ? (
        <div className={emptyPlaneClass}>
          <ExclamationCircleIcon className="text-ink-3 mb-2" size={40} />
          <span className="text-base-app font-medium text-ink-1">No developer agent folders detected</span>
          <span className="text-small text-ink-3 max-w-sm mt-1">
            Hanger scans your home folder for standard agent configurations (e.g. ~/.claude, ~/.gemini).
          </span>
        </div>
      ) : isCategoryEmpty && selectedCategory ? (
        /* Category-specific Empty State */
        <div className={emptyPlaneClass}>
          <ExclamationCircleIcon className="text-ink-3 mb-2" size={40} />
          <span className="text-base-app font-medium text-ink-1">No global {selectedCategory.toLowerCase()} found</span>
          <span className="text-small text-ink-3 max-w-sm mt-1">
            Select another category filter or click "All" to view all available assets.
          </span>
        </div>
      ) : (
        <>
          {/* The list lives on its own plane */}
          <div className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] bg-plane border border-line rounded-tl-plane rounded-tr-plane pb-1.5">
            <AssetHeaderRow
              sortField={sortField}
              sortDirection={sortDirection}
              showKindColumn={!selectedCategory}
              onSort={handleSort}
            />

            {/* Agents Group */}
            {selectedCategory === "Agents" && (
              <>
                <h3 className={secClass}>Agents · {sortedAgents.length}</h3>
                <div className="flex flex-col">
                  {sortedAgents.map((item) => (
                    <AssetRow
                      key={`agent-${item.name}`}
                      isSelected={selectedAsset?.path === item.path}
                      showKindColumn={false}
                      item={item}
                      onClick={() => onSelectAsset({ name: item.name, category: "Agents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Skills Group */}
            {showSkills && sortedSkills.length > 0 && (
              <>
                <h3 className={secClass}>
                  Skills · {assetCounts ? (assetCounts.byCategory.skill?.global ?? 0) : sortedSkills.length}
                </h3>
                <div className="flex flex-col">
                  {sortedSkills.map((item, idx) => (
                    <AssetRow
                      key={`skill-${item.path}-${idx}`}
                      isSelected={selectedAsset?.path === item.path}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Skills", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Tools Group */}
            {showTools && sortedTools.length > 0 && (
              <>
                <h3 className={secClass}>
                  Tools · {assetCounts ? (assetCounts.byCategory.tool?.global ?? 0) : sortedTools.length}
                </h3>
                <div className="flex flex-col">
                  {sortedTools.map((item, idx) => (
                    <AssetRow
                      key={`tool-${item.path}-${idx}`}
                      isSelected={selectedAsset?.path === item.path}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Tools", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Rules Group */}
            {showRules && sortedRules.length > 0 && (
              <>
                <h3 className={secClass}>
                  Rules · {assetCounts ? (assetCounts.byCategory.rule?.global ?? 0) : sortedRules.length}
                </h3>
                <div className="flex flex-col">
                  {sortedRules.map((item, idx) => (
                    <AssetRow
                      key={`rule-${item.path}-${idx}`}
                      isSelected={selectedAsset?.path === item.path}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Rules", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Subagents Group */}
            {showSubagents && sortedSubagents.length > 0 && (
              <>
                <h3 className={secClass}>
                  Subagents · {assetCounts ? (assetCounts.byCategory.subagent?.global ?? 0) : sortedSubagents.length}
                </h3>
                <div className="flex flex-col">
                  {sortedSubagents.map((item, idx) => (
                    <AssetRow
                      key={`subagent-${item.path}-${idx}`}
                      isSelected={selectedAsset?.path === item.path}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Subagents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Foot line */}
          <div className="h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex text-micro text-ink-3">
            <span>
              Showing {visibleCount} of {sumGlobalAssets(assetCounts)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
