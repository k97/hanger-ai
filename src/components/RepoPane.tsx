import { useState } from "react";
import { ArrowPathIcon, ExclamationTriangleIcon, InformationCircleIcon, SpinnerIcon } from "./icons";
import { invoke } from "@tauri-apps/api/core";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import AssetRow, { AssetItem } from "./AssetRow";
import EngineLabel from "./EngineLabel";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import { Inventory, CategoryCounts } from "../App";
import { filterRepoAssets } from "../utils/filterPredicate";
import DisclosureBanner from "./DisclosureBanner";
import { sortAssetItems } from "../utils/sortUtils";
import { registrationKey } from "../utils/mcpRegistration";
import { formatEngineLabel } from "../utils/engineUtils";
import SummaryStrip from "./SummaryStrip";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import { categoryNoun } from "../utils/prose";
import { linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";

interface RepoPaneProps {
  repoPath: string;
  inventory: Inventory | null;
  assetCounts?: CategoryCounts | null;
  selectedCategory?: CategoryType | null;
  /** Reports the facet chip's category to the caller, mirroring
   *  ProfilePane's own onCategoryChange. App.tsx uses it to decide whether
   *  the inspector's empty state may say "MCP servers". */
  onCategoryChange?: (category: CategoryType | null) => void;
  selectedAsset?: { path: string } | null;
  loading: boolean;
  /** Toolbar filter text — rows whose name does not contain it are hidden. */
  filterText?: string;
  /** Link-state filter from the rail badge or the strip legend. */
  stateFilter?: StateFilter;
  onStateFilterChange?: (filter: StateFilter) => void;
  /** When the last scan completed — feeds the strip's scan stamp. */
  scannedAt?: Date | null;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField) => void;
  onRefresh: () => void;
  onSelectAsset: (asset: { id?: string; name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => void;
  onLinkFromProfile: (repoPath: string) => void;
  onClearSelection?: () => void;
  /** Every linked root, used to subtract candidates that are already linked. */
  linkedRepos?: string[];
  onPromoteCandidates?: (candidates: string[]) => void;
}

export default function RepoPane({
  repoPath,
  inventory,
  assetCounts,
  selectedCategory: propSelectedCategory,
  onCategoryChange,
  selectedAsset,
  loading,
  filterText,
  stateFilter = null,
  onStateFilterChange,
  scannedAt = null,
  sortField: propSortField,
  sortDirection: propSortDirection,
  onSortChange,
  onRefresh,
  onSelectAsset,
  onLinkFromProfile,
  onClearSelection,
  linkedRepos = [],
  onPromoteCandidates,
}: RepoPaneProps) {
  const [internalCategory, setInternalCategory] = useState<CategoryType | null>(null);
  const [internalSortField, setInternalSortField] = useState<SortField>("name");
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>("asc");

  const selectedCategory = propSelectedCategory ?? internalCategory;
  const sortField = propSortField ?? internalSortField;
  const sortDirection = propSortDirection ?? internalSortDirection;

  const setSelectedCategory = (cat: CategoryType | null) => {
    setInternalCategory(cat);
    onCategoryChange?.(cat);
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

  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [assetToUnlink, setAssetToUnlink] = useState<{ name: string; path: string; category: string } | null>(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const triggerUnlink = (name: string, path: string, category: string) => {
    setAssetToUnlink({ name, path, category });
    setUnlinkError(null);
    setShowUnlinkConfirm(true);
  };

  const handleExecuteUnlink = async () => {
    if (!assetToUnlink) return;
    setUnlinkLoading(true);
    setUnlinkError(null);
    try {
      await invoke("remove_deployed_asset", { targetPath: assetToUnlink.path });
      onRefresh();
      setShowUnlinkConfirm(false);
      setAssetToUnlink(null);
    } catch (err: any) {
      setUnlinkError(String(err));
    } finally {
      setUnlinkLoading(false);
    }
  };

  const projectScan = inventory?.project_scans.find(
    (p) => p.path === repoPath
  );

  const rawWarnings = projectScan?.parse_warnings || [];
  const permissionDeniedWarnings = rawWarnings.filter(w => w.includes("Permission denied") || w.includes("permission denied"));
  const nonPermissionWarnings = rawWarnings.filter(w => !w.includes("Permission denied") && !w.includes("permission denied"));

  // Repositories sitting inside this root that are not linked in their own
  // right. Their assets currently roll up into this row, which is visible and
  // correct but hides per-repo granularity.
  const linkedSet = new Set(linkedRepos);
  const unlinkedCandidates = (projectScan?.nested_repo_candidates || []).filter(
    (candidate) => !linkedSet.has(candidate)
  );

  // On a broad root the walk stops at 6 levels, so the candidate list is a
  // floor rather than a total. Saying so keeps the count from reading as a
  // complete answer.
  const depthCapped = rawWarnings.some((w) => w.includes("Scan depth capped"));

  // Filter project assets using the predicate utility
  const {
    skills: scopedSkills,
    tools: scopedTools,
    rules: scopedRules,
    agents: filteredAgents,
    subagents: scopedSubagents,
  } = filterRepoAssets(inventory, repoPath, selectedCategory);

  // Toolbar filter narrows by name only; empty text passes everything.
  const filterQuery = (filterText ?? "").trim().toLowerCase();
  const nameMatches = (name: string) =>
    filterQuery === "" || name.toLowerCase().includes(filterQuery);
  // Whether anything is narrowing the rows — the category-empty copy says
  // "matches that filter" only when a filter is what emptied it.
  const filterActive = filterQuery !== "" || stateFilter !== null;

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
  const repoFolderName = repoPath.split("/").pop() || repoPath;
  const stripCounts = linkStateCounts(inventory, { kind: "repo", root: repoPath });
  const engineCount = Object.keys(assetCounts?.engines ?? {}).filter((k) => k !== "none").length;
  const stripSubtitle = `assets in ${repoFolderName} · ${engineCount} ${
    engineCount === 1 ? "engine" : "engines"
  }`;

  const showSkills = selectedCategory === null || selectedCategory === "Skills";
  const showTools = selectedCategory === null || selectedCategory === "Tools";
  const showRules = selectedCategory === null || selectedCategory === "Rules";
  const showSubagents = selectedCategory === null || selectedCategory === "Subagents";

  /** An asset row is selected by identity where it has one — many MCP servers
      share a config file, so path alone marks all of them. */
  const rowIsSelected = (item: AssetItem) =>
    item.id && (selectedAsset as { id?: string } | null)?.id
      ? (selectedAsset as { id?: string }).id === item.id
      : selectedAsset?.path === item.path;

  // Map and sort category items
  const sortedSkills: AssetItem[] = sortAssetItems(
    filteredSkills.map((s) => ({
      name: s.name,
      category: "Skills",
      path: s.path,
      engine: s.scope?.Project?.agent || s.scope?.Global?.agent || null,
      version: s.version,
      details: s.source_origin ? `Origin: ${s.source_origin}` : "",
      isSymlink: s.is_symlink,
      drifted: s.drifted,
      sourcePath: s.source_path,
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
      // `path` stays the config FILE — it is what the row shows and what the
      // inspector opens. Identity is separate: many servers share one file, so
      // comparing paths marked every server in ~/.claude.json at once.
      id: registrationKey(t),
      path: t.config_path,
      engine: t.scope?.Project?.agent || t.scope?.Global?.agent || t.owning_agent || null,
      details: `Command: ${t.command} (Transport: ${t.transport})`,
      // The card row's transport chip (§5.6) — a type, not a state, so it
      // rides beside the name rather than becoming its own column.
      transport: t.transport,
      isSymlink: t.is_symlink,
      drifted: t.drifted,
      sourcePath: t.source_path,
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
      engine: r.scope?.Project?.agent || r.scope?.Global?.agent || null,
      isSymlink: r.is_symlink,
      drifted: r.drifted,
      sourcePath: r.source_path,
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
      engine: sa.scope?.Project?.agent || sa.scope?.Global?.agent || null,
      details: `Declared Tools: ${sa.declared_tools.join(", ") || "None"}`,
      sourcePath: sa.source_path,
      parseStatus: sa.parse_status,
      parseError: sa.parse_error,
    })),
    sortField,
    sortDirection
  );

  // Check if the selected category itself is empty inside this repository
  const isCategoryEmpty =
    (selectedCategory === "Skills" && filteredSkills.length === 0) ||
    (selectedCategory === "Tools" && filteredTools.length === 0) ||
    (selectedCategory === "Rules" && filteredRules.length === 0) ||
    (selectedCategory === "Agents" && filteredAgents.length === 0) ||
    (selectedCategory === "Subagents" && filteredSubagents.length === 0);

  // The fallback (no backend count yet) must look at everything the repo
  // holds, not the rows left after the category and search filters — it once
  // read the filtered arrays, so a search that hid every row, or a category
  // with nothing in it, flipped the whole repository to "empty".
  const unscoped = filterRepoAssets(inventory, repoPath, null);
  const storeEmpty = assetCounts !== undefined && assetCounts !== null
    ? assetCounts.total === 0
    : (unscoped.skills.length === 0 && unscoped.tools.length === 0 && unscoped.rules.length === 0 && unscoped.agents.length === 0 && unscoped.subagents.length === 0);

  // Same gate as ProfilePane: "No AI assets found" is a finding, and a
  // finding needs a finished scan. Until `scannedAt` is set the slot reports
  // the scan rather than the absence — seen 2026-08-16 mid-scan with the
  // sidebar already counting 82 for this repository.
  const hasScanned = scannedAt !== null;
  const isRepoPending = storeEmpty && !hasScanned;
  const isRepoEmpty = storeEmpty && hasScanned;

  // Uppercase micro voice for section labels inside the list plane.
  const secClass =
    "px-3.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";
  const emptyPlaneClass =
    "flex-1 mx-[18px] mb-[18px] min-h-0 flex flex-col items-center justify-center text-center border border-dashed border-line rounded-plane animate-in fade-in duration-200";

  // Visible rows post-filter for the foot line — a display subset, never the
  // asset total (which stays backend-owned).
  const visibleCount = sortedSkills.length + sortedTools.length + sortedRules.length + sortedSubagents.length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-page animate-fade-in font-sans">
      {/* Inventory summary strip */}
      <div className="mx-[18px] mt-[18px]">
        <SummaryStrip
          total={assetCounts?.total ?? 0}
          subtitle={stripSubtitle}
          scannedAt={scannedAt}
          scanning={loading}
          counts={stripCounts}
          activeStateFilter={stateFilter}
          onFilterState={(f) => onStateFilterChange?.(f)}
          onRescan={onRefresh}
        />
      </div>

      {/* Facet chips. No View control here (§5.6's "Rows" choice lives on
          ProfilePane only): `get_mcp_servers` is machine-global
          (`discover_machine`, not `discover_repo`), so there is no
          repo-scoped grouping for a control here to drive — this pane's
          Tools rows stay per-registration regardless, and a control that
          cannot regroup its own rows would be inert chrome, not a fix. */}
      <div className="px-[18px] pt-3 pb-2.5 flex items-center gap-3">
        {/* No `?? 0` here. The chip distinguishes "not counted yet"
            (undefined) from "empty" (0) so it can keep a chip through a scan
            and hide it only on a known zero. Collapsing undefined to 0 erased
            that distinction and would blank the whole filter row whenever
            assetCounts is absent. ProfilePane already passes these through. */}
        <div className="min-w-0 flex-1">
          <CategoryFilterCards
            allCount={assetCounts?.total}
            skillsCount={assetCounts?.byCategory.skill?.total}
            toolsCount={assetCounts?.byCategory.tool?.total}
            rulesCount={assetCounts?.byCategory.rule?.total}
            subagentsCount={assetCounts?.byCategory.subagent?.total}
            selectedCategory={selectedCategory}
            onSelectCategory={setSelectedCategory}
            loading={loading}
          />
        </div>
      </div>

      {/* Engines line + anything needing attention, above the list plane */}
      <div className="px-[18px] flex flex-col gap-2.5 empty:hidden shrink-0 max-h-[45%] overflow-y-auto">
        {/* Engines Group */}
        {assetCounts?.engines && (
          <div className="flex items-baseline gap-2 font-flex text-micro text-ink-3">
            <h3 className="font-medium tracking-[.06em] uppercase">Engines</h3>
            <div className="flex flex-wrap items-center gap-1.5 text-small text-ink-2">
              {Object.entries(assetCounts.engines)
                .map(([key, count]) => ({
                  key,
                  label: formatEngineLabel(key),
                  count,
                }))
                .sort((a, b) => {
                  if (a.key === "none") return 1;
                  if (b.key === "none") return -1;
                  return b.count - a.count;
                })
                .map((entry, idx) => (
                  <span key={`engine-${entry.key}`} className="flex items-center gap-1.5">
                    {idx > 0 && <span className="text-ink-3 select-none">·</span>}
                    <EngineLabel engineKey={entry.key}>{entry.label} {entry.count}</EngineLabel>
                  </span>
                ))}
            </div>
          </div>
        )}

        {/* macOS Permission denied TCC Fix Panel */}
        {permissionDeniedWarnings.length > 0 && (
          <div className="flex flex-col gap-3 p-3.5 border border-line rounded-inner leading-relaxed animate-in fade-in duration-200">
            <div className="flex gap-2 text-state-danger">
              <ExclamationTriangleIcon className="shrink-0 mt-0.5" size={16} />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-small font-medium font-sans">macOS Folder Scan Access Denied</span>
                <span className="text-micro font-mono break-all text-ink-2">{repoPath}</span>
              </div>
            </div>
            <p className="text-small text-ink-2 leading-relaxed">
              To proceed, grant Hanger permission to access this folder. Open <strong className="font-medium">System Settings → Privacy & Security → Files & Folders</strong> (or Full Disk Access), check <strong className="font-medium">Hanger</strong>, and then retry the scan.
            </p>
            <button
              disabled={loading}
              onClick={onRefresh}
              className="self-start px-4 h-[30px] bg-fill text-on-fill font-medium text-small rounded-pill transition-transform duration-press ease-spring active:scale-[0.96] cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <ArrowPathIcon size={12} className={loading ? "animate-spin" : ""} />
              <span>Retry Scan</span>
            </button>
          </div>
        )}

        {/* Non-permission warnings section */}
        {nonPermissionWarnings.length > 0 && (
          <DisclosureBanner
            variant="warning"
            summary="scan warning"
            count={nonPermissionWarnings.length}
          >
            <ul className="list-disc list-inside space-y-1 text-small text-ink-2 font-mono">
              {nonPermissionWarnings.map((warning, idx) => (
                <li key={idx} className="font-mono break-all leading-relaxed">
                  {warning}
                </li>
              ))}
            </ul>
          </DisclosureBanner>
        )}

        {/* Nested repositories found inside this root. Info variant, collapsed,
            and placed below the warnings so anything needing attention outranks it. */}
        {unlinkedCandidates.length > 0 && (
          <DisclosureBanner
            variant="info"
            summary="nested repo"
            count={unlinkedCandidates.length}
          >
            <div className="flex flex-col gap-3">
              <p className="text-small text-ink-2 leading-relaxed">
                These folders are repositories in their own right. Their assets currently
                count towards this row. Promote them to track and deploy each separately.
              </p>
              {depthCapped && (
                <p className="text-small text-ink-2 leading-relaxed">
                  This is a broad folder, so the search stopped at 6 levels — repositories
                  deeper than that are not listed.
                </p>
              )}
              <ul className="flex flex-col gap-1">
                {unlinkedCandidates.map((candidate) => (
                  <li
                    key={candidate}
                    className="text-small text-ink-2 font-mono break-all leading-relaxed"
                  >
                    {candidate}
                  </li>
                ))}
              </ul>
              {onPromoteCandidates && (
                <button
                  onClick={() => onPromoteCandidates(unlinkedCandidates)}
                  className="self-start px-4 h-[30px] rounded-pill border border-line-2 hover:bg-plane-2 text-small font-medium text-ink-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
                >
                  Promote…
                </button>
              )}
            </div>
          </DisclosureBanner>
        )}
      </div>

      {isRepoPending ? (
        /* Pending: no claim either way. Root-by-root progress already lives
           in the foot line's ScanStatusIndicator; "once the scan finishes" is
           literal (inventory lands on scan://complete, not per root). */
        <div className={`${emptyPlaneClass} mt-2.5`} data-testid="scan-pending">
          <SpinnerIcon className={`text-ink-3 mb-2 ${loading ? "animate-spin" : ""}`} size={40} />
          <span className="text-base-app font-medium text-ink-1">
            {loading ? "Scanning your machine" : "Not scanned yet"}
          </span>
          <span className="text-small text-ink-3 max-w-sm mt-1">
            {loading
              ? `Assets in ${repoFolderName} show up here once the scan finishes.`
              : "Rescan when you're ready."}
          </span>
        </div>
      ) : isRepoEmpty ? (
        /* Empty, after a scan. The two ways out are both named: link from
           the global store, or add files here and rescan. */
        <div className={`${emptyPlaneClass} mt-2.5`}>
          <InformationCircleIcon className="text-ink-3 mb-2" size={40} />
          <span className="text-base-app font-medium text-ink-1">Nothing in {repoFolderName} yet</span>
          <span className="text-small text-ink-3 max-w-sm mt-1 mb-4">
            Hanger found no skills, rules, MCP servers or subagents in this repository. Link one from
            the global store, or add files here and rescan.
          </span>
          {/* "Global", not "Profile": the crumb and the sidebar call it Global
              (Karthik's ruling on the naming). */}
          <button
            onClick={() => onLinkFromProfile(repoPath)}
            className="px-4 h-[30px] bg-fill text-on-fill text-small font-medium rounded-pill cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]"
          >
            Link an asset from Global
          </button>
        </div>
      ) : isCategoryEmpty && selectedCategory ? (
        /* Category-specific empty state; a filter that hides every row is
           told apart from a category with nothing in it. */
        <div className={`${emptyPlaneClass} mt-2.5`}>
          <InformationCircleIcon className="text-ink-3 mb-2" size={40} />
          {filterActive ? (
            <span className="text-base-app font-medium text-ink-1">
              No {categoryNoun(selectedCategory, "one")} matches that filter
            </span>
          ) : (
            <>
              <span className="text-base-app font-medium text-ink-1">
                No {categoryNoun(selectedCategory)} in {repoFolderName}
              </span>
              <span className="text-small text-ink-3 max-w-sm mt-1">
                Nothing under this category here yet. Pick another, or All.
              </span>
            </>
          )}
        </div>
      ) : (
        <>
          {/* The list lives on its own plane */}
          {/* Table background dropped by Karthik's ruling (2026-08-15):
              flat on the page, edge drawn by the --line border alone. */}
          <div className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] mt-2.5 border border-line rounded-tl-plane rounded-tr-plane pb-1.5">
            {/* The MCP section carries its own column labels below
                (Registered in / Tools), so this header stays out of the way
                entirely when Tools is the only section on screen — the same
                treatment ProfilePane gets (§5.6). */}
            {selectedCategory !== "Tools" && (
              <AssetHeaderRow
                sortField={sortField}
                sortDirection={sortDirection}
                showKindColumn={!selectedCategory}
                onSort={handleSort}
              />
            )}

            {/* Skills Group */}
            {showSkills && sortedSkills.length > 0 && (
              <>
                <h3 className={secClass}>
                  Skills · {assetCounts ? (assetCounts.byCategory.skill?.total ?? 0) : sortedSkills.length}
                </h3>
                <div className="flex flex-col">
                  {sortedSkills.map((item, idx) => (
                    <AssetRow
                      key={`skill-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onUnlink={() => triggerUnlink(item.name, item.path, "Skills")}
                      onClick={() => onSelectAsset({ name: item.name, category: "Skills", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Tools Group — card rows, not table rows (§5.6), the same
                treatment ProfilePane's Tools section gets. */}
            {showTools && sortedTools.length > 0 && (
              <>
                <div
                  data-testid="section-header-tools"
                  className={`flex items-center gap-3 select-none ${secClass}`}
                >
                  <h3 className="flex-1 truncate">
                    MCP servers · {assetCounts ? (assetCounts.byCategory.tool?.total ?? 0) : sortedTools.length}
                  </h3>
                  <span className="hidden @[580px]:block w-[100px] shrink-0 text-left">
                    Registered in
                  </span>
                  <span className="w-[150px] shrink-0 text-left">
                    Tools
                  </span>
                </div>
                <div className="flex flex-col">
                  {sortedTools.map((item, idx) => (
                    <AssetRow
                      key={`tool-${item.path}-${idx}`}
                      variant="card"
                      isSelected={rowIsSelected(item)}
                      item={item}
                      onUnlink={() => triggerUnlink(item.name, item.path, "Tools")}
                      onClick={() => onSelectAsset({ id: item.id, name: item.name, category: "Tools", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Rules Group */}
            {showRules && sortedRules.length > 0 && (
              <>
                <h3 className={secClass}>
                  Rules · {assetCounts ? (assetCounts.byCategory.rule?.total ?? 0) : sortedRules.length}
                </h3>
                <div className="flex flex-col">
                  {sortedRules.map((item, idx) => (
                    <AssetRow
                      key={`rule-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onUnlink={() => triggerUnlink(item.name, item.path, "Rules")}
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
                  Subagents · {assetCounts ? (assetCounts.byCategory.subagent?.total ?? 0) : sortedSubagents.length}
                </h3>
                <div className="flex flex-col">
                  {sortedSubagents.map((item, idx) => (
                    <AssetRow
                      key={`subagent-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      onClick={() => onSelectAsset({ name: item.name, category: "Subagents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

        </>
      )}

      {showUnlinkConfirm && assetToUnlink && (
        <div className="fixed inset-0 bg-scrim flex items-center justify-center z-[100] animate-fade-in">
          <div className="w-full max-w-sm bg-page rounded-plane border border-line p-[18px] relative flex flex-col gap-4 font-sans animate-in zoom-in-95 duration-150">
            <div className="flex justify-between items-center pb-2 border-b border-line">
              <h3 className="text-base-app font-medium text-ink-1 flex items-center gap-1.5">
                <ExclamationTriangleIcon className="text-state-warning" size={16} />
                Unlink Asset
              </h3>
            </div>
            <p className="text-small text-ink-2 leading-[1.65]">
              Are you sure you want to unlink <span className="font-medium text-ink-1">{assetToUnlink.name}</span> from this repository?
            </p>
            <p className="text-micro text-ink-2 font-mono bg-plane p-2.5 rounded-inner break-all select-all">
              {assetToUnlink.path}
            </p>
            <p className="text-micro text-ink-3 leading-[1.6]">
              * Note: This deletes the file/symlink. If it is a hard copy, Hanger will backup the file to <span className="font-mono">.hanger/backups/</span> first.
            </p>

            {unlinkError && (
              <div className="p-2.5 border border-line bg-plane text-state-danger text-micro rounded-inner font-mono break-all">
                {unlinkError}
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-line">
              <button
                disabled={unlinkLoading}
                onClick={handleExecuteUnlink}
                className="px-4 h-[30px] rounded-pill bg-fill text-on-fill font-medium text-small cursor-pointer disabled:opacity-50 flex items-center gap-1.5 transition-transform duration-press ease-spring active:scale-[0.96]"
              >
                {unlinkLoading ? (
                  <>
                    <SpinnerIcon className="animate-spin" size={12} />
                    Unlinking...
                  </>
                ) : (
                  "Yes, Unlink"
                )}
              </button>
              <button
                disabled={unlinkLoading}
                onClick={() => {
                  setShowUnlinkConfirm(false);
                  setAssetToUnlink(null);
                }}
                className="px-4 h-[30px] rounded-pill border border-line-2 text-ink-2 hover:bg-plane-2 hover:text-ink-1 text-small font-medium cursor-pointer transition-colors duration-hover ease-spring"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Foot line. Unconditional: scan progress needs a home in the empty
          state too, which is precisely when a scan is running. */}
      <div className="h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex text-micro text-ink-3">
        {(assetCounts?.total ?? 0) > 0 && (
          <span>
            Showing {visibleCount} of {assetCounts?.total ?? visibleCount}
          </span>
        )}
        {unlinkedCandidates.length > 0 && (
          <span>
            {unlinkedCandidates.length} nested {unlinkedCandidates.length === 1 ? "repo" : "repos"} counted here
          </span>
        )}
        <span className="ml-auto">
          <ScanStatusIndicator />
        </span>
      </div>
    </div>
  );
}