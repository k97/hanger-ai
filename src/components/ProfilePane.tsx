import { useState } from "react";
import { AlertCircle } from "lucide-react";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import AssetRow, { AssetItem } from "./AssetRow";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import { Inventory, CategoryCounts } from "../App";
import { filterProfileAssets } from "../utils/filterPredicate";
import { sortAssetItems } from "../utils/sortUtils";
import { sumGlobalAssets } from "../utils/globalAssetCount";

interface ProfilePaneProps {
  inventory: Inventory | null;
  assetCounts?: CategoryCounts | null;
  selectedCategory?: CategoryType | null;
  selectedAsset?: { path: string } | null;
  loading: boolean;
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
    skills: filteredSkills,
    tools: filteredTools,
    rules: filteredRules,
    agents: filteredAgents,
    subagents: filteredSubagents,
  } = filterProfileAssets(inventory, selectedCategory);

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

  return (
    <div className="@container flex-1 overflow-y-auto p-6 flex flex-col gap-6">
      {/* Category Filter Cards */}
      <div className="mb-6">
        <CategoryFilterCards
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          skillsCount={assetCounts?.byCategory.skill?.global}
          toolsCount={assetCounts?.byCategory.tool?.global}
          rulesCount={assetCounts?.byCategory.rule?.global}
          subagentsCount={assetCounts?.byCategory.subagent?.global}
          loading={loading}
        />
      </div>

      {/* Main Asset List Container */}
      <div className="flex-1 flex flex-col min-w-0">
        {emptyState ? (
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200">
            <AlertCircle className="text-text-muted mb-2" size={40} />
            <span className="text-sm font-bold text-text-primary">No developer agent folders detected</span>
            <span className="text-xs text-text-muted max-w-sm mt-1">
              Hanger scans your home folder for standard agent configurations (e.g. ~/.claude, ~/.gemini).
            </span>
          </div>
        ) : isCategoryEmpty && selectedCategory ? (
          /* Category-specific Empty State */
          <div className="flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200">
            <AlertCircle className="text-text-muted mb-2" size={40} />
            <span className="text-sm font-bold text-text-primary">No global {selectedCategory.toLowerCase()} found</span>
            <span className="text-xs text-text-muted max-w-sm mt-1">
              Select another category filter or click "All" to view all available assets.
            </span>
          </div>
        ) : (
          /* Table Layout with Sticky Header Row */
          <div className="flex flex-col flex-1 min-w-0">
            <AssetHeaderRow
              sortField={sortField}
              sortDirection={sortDirection}
              showKindColumn={!selectedCategory}
              onSort={handleSort}
            />

            <div className="flex flex-col gap-6 pt-2">
              {/* Agents Group */}
              {selectedCategory === "Agents" && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-text-muted py-1 border-b border-n-100 font-sans">
                    Agents ({sortedAgents.length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
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
                </div>
              )}

              {/* Skills Group */}
              {showSkills && sortedSkills.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-text-muted py-1 border-b border-n-100 font-sans">
                    Skills ({assetCounts ? (assetCounts.byCategory.skill?.global ?? 0) : sortedSkills.length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
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
                </div>
              )}

              {/* Tools Group */}
              {showTools && sortedTools.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-text-muted py-1 border-b border-n-100 font-sans">
                    Tools ({assetCounts ? (assetCounts.byCategory.tool?.global ?? 0) : sortedTools.length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
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
                </div>
              )}

              {/* Rules Group */}
              {showRules && sortedRules.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-text-muted py-1 border-b border-n-100 font-sans">
                    Rules ({assetCounts ? (assetCounts.byCategory.rule?.global ?? 0) : sortedRules.length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
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
                </div>
              )}

              {/* Subagents Group */}
              {showSubagents && sortedSubagents.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium text-text-muted py-1 border-b border-n-100 font-sans">
                    Subagents ({assetCounts ? (assetCounts.byCategory.subagent?.global ?? 0) : sortedSubagents.length})
                  </h3>
                  <div className="flex flex-col gap-1.5">
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
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
