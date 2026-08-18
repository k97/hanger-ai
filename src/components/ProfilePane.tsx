import { useState } from "react";
import { ExclamationCircleIcon, SpinnerIcon } from "./icons";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import AssetRow, { AssetItem, AssetAnnotationView } from "./AssetRow";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import ViewControl, { ServerGrouping, ServerSort } from "./ViewControl";
import { Inventory, CategoryCounts } from "../App";
import { filterProfileAssets } from "../utils/filterPredicate";
import { dedupeRegistrations } from "../utils/mcpRegistration";
import { sortAssetItems } from "../utils/sortUtils";
import { registrationKey } from "../utils/mcpRegistration";
import { groupProcesses, type ProcessMatch } from "../utils/mcpServerView";
import { agreementLine, mergeReach, sortServerRows, type McpServerRow } from "../utils/serverRows";
import DisclosureBanner from "./DisclosureBanner";
import { sumGlobalAssets } from "../utils/globalAssetCount";
import SummaryStrip from "./SummaryStrip";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import { annotationStateCounts, linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";
import { categoryNoun, joinNames } from "../utils/prose";

interface ProfilePaneProps {
  inventory: Inventory | null;
  /** Backend-derived per-asset annotations (mechanism, reach, beyond) for
   *  the glyph and the Reach / Beyond the store columns. Rendered verbatim. */
  annotations?: AssetAnnotationView[] | null;
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
  /** Engines whose home folder exists on disk (`get_detected_engines`, a
   *  filesystem probe). This, not the store, decides whether an empty store
   *  means "no engine folders" or "engine folders with nothing in them" —
   *  `assetCounts.engines` is derived from asset rows and is empty whenever
   *  the store is, so it cannot tell the two apart. */
  detectedEngines?: { id: string; name: string }[];
  /** Every engine Hanger looks for, installed or not (`get_known_engines`).
   *  The no-folders empty state names them. It named three in a string
   *  literal and went stale the day the backend's table grew to eight. */
  knownEngines?: { id: string; name: string }[];
  onRescan?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField) => void;
  onSelectAsset: (asset: { id?: string; name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => void;
  onLinkAsset: (asset: any) => void;
  onClearSelection?: () => void;
  /** The facet chip owns category selection internally, so the owner is told
   *  when it changes. Without this the shell cannot know the user is looking
   *  at Tools, and anything it fetches lazily for that view never fires. */
  onCategoryChange?: (category: CategoryType | null) => void;
  /** MCP servers running with no config behind them, from `get_mcp_processes`.
   *  They have no registration, so they cannot be rows — a row implies
   *  something to open, and there is nothing. */
  unaccountedProcesses?: ProcessMatch[] | null;
  /** The grouped server list from `get_mcp_servers` — machine-global, fetched
   *  once in App.tsx. `null` before the first fetch resolves; the Tools
   *  section falls back to per-registration rows until it does, so a scan
   *  never flashes an empty list waiting on a second IPC round trip. */
  mcpServers?: McpServerRow[] | null;
  serverGrouping?: ServerGrouping;
  serverSort?: ServerSort;
  onServerGroupingChange?: (grouping: ServerGrouping) => void;
  onServerSortChange?: (sort: ServerSort) => void;
}

export default function ProfilePane({
  inventory,
  annotations,
  assetCounts,
  selectedCategory: propSelectedCategory,
  selectedAsset,
  loading,
  filterText,
  stateFilter = null,
  onStateFilterChange,
  scannedAt = null,
  detectedEngines,
  knownEngines,
  onRescan,
  sortField: propSortField,
  sortDirection: propSortDirection,
  onSortChange,
  onSelectAsset,
  onLinkAsset,
  onClearSelection,
  onCategoryChange,
  unaccountedProcesses,
  mcpServers,
  serverGrouping: propServerGrouping,
  serverSort: propServerSort,
  onServerGroupingChange,
  onServerSortChange,
}: ProfilePaneProps) {
  const [internalCategory, setInternalCategory] = useState<CategoryType | null>(null);
  const [internalSortField, setInternalSortField] = useState<SortField>("name");
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>("asc");
  // Same prop-or-internal-state shape as sortField/sortDirection above:
  // controlled when App.tsx passes a value, self-contained otherwise (every
  // fixture in mcp_card_row.test.tsx renders ProfilePane standalone).
  const [internalServerGrouping, setInternalServerGrouping] = useState<ServerGrouping>("server");
  const [internalServerSort, setInternalServerSort] = useState<ServerSort>("attention");

  // Lookup only — keyed by the backend's own asset_path. A row without an
  // entry renders empty annotation cells rather than a guessed state.
  const annotationByAssetPath = new Map<string, AssetAnnotationView>(
    (annotations ?? []).map((a) => [a.asset_path, a])
  );
  // `id` before `path`, the same order `rowIsSelected` uses below. Only the
  // Tools mapping sets an id, and it sets `registrationKey(t)`: the backend
  // keys an MCP annotation on the registration — `{config path}:{server
  // name}` — while `path` is the config FILE, which many servers share, so
  // looking up by it matched nothing and Reach rendered blank on every MCP
  // row. Every other category has no id and `path` is the key the backend
  // used.
  const annotationFor = (item: AssetItem): AssetAnnotationView | null =>
    annotationByAssetPath.get(item.id ?? item.path) ?? null;

  /* Already filtered to the unaccounted by the caller; grouped here so one
     leaked launch reads as one row with a multiplier rather than as eighty. */
  const unaccounted = unaccountedProcesses ?? [];
  const unaccountedGroups = groupProcesses(unaccounted);

  const selectedCategory = propSelectedCategory ?? internalCategory;
  const sortField = propSortField ?? internalSortField;
  const sortDirection = propSortDirection ?? internalSortDirection;
  const serverGrouping = propServerGrouping ?? internalServerGrouping;
  const serverSort = propServerSort ?? internalServerSort;

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

  const handleServerGroupingChange = (grouping: ServerGrouping) => {
    if (onServerGroupingChange) onServerGroupingChange(grouping);
    else setInternalServerGrouping(grouping);
  };

  const handleServerSortChange = (sort: ServerSort) => {
    if (onServerSortChange) onServerSortChange(sort);
    else setInternalServerSort(sort);
  };

  // Aggregate global assets grouped by agent configs (deduplicated)
  const rawAgents = inventory?.agents || [];
  const agents = rawAgents.filter((a, idx) => rawAgents.findIndex((other) => other.id === a.id) === idx);

  const rawSkills = inventory?.skills.filter((s) => s.scope?.Global) || [];
  const globalSkills = rawSkills.filter((s, idx) => rawSkills.findIndex((other) => other.path === s.path) === idx);

  const globalTools = dedupeRegistrations(
    inventory?.tools.filter((t) => t.scope?.Global) || []
  );

  const rawRules = inventory?.rules.filter((r) => r.scope?.Global) || [];
  const globalRules = rawRules.filter((r, idx) => rawRules.findIndex((other) => other.path === r.path) === idx);

  const globalAssetsTotal = sumGlobalAssets(assetCounts);

  const storeEmpty =
    assetCounts !== null && assetCounts !== undefined
      ? globalAssetsTotal === 0
      : inventory === null || (globalSkills.length === 0 && globalTools.length === 0 && globalRules.length === 0);

  // A negative claim needs a completed scan behind it. `scannedAt` is set
  // only when a scan finishes (App.tsx, scan://complete), so before then an
  // empty store means "not looked yet", not "nothing there" — the slot
  // reports the scan instead of asserting an absence. Seen 2026-08-16: the
  // first scan on a fresh store rendered "No developer agent folders
  // detected" while the sidebar was already showing engine marks.
  //
  // `loading` matters just as much as `hasScanned`: `inventory` and
  // `assetCounts` only change on scan://complete, so a RE-scan of a store
  // that was already empty leaves `storeEmpty` and `hasScanned` both true
  // for the whole rescan — without checking `loading` too, the plane kept
  // asserting "nothing here" while a fresh answer was on its way. Ruled
  // 2026-08-18.
  const hasScanned = scannedAt !== null;
  const pendingState = storeEmpty && (loading || !hasScanned);
  const emptyState = storeEmpty && hasScanned && !loading;

  // Two different absences share the empty plane. "No developer agent
  // folders detected" was the only headline, and it was false whenever the
  // engines were there but their global folders held nothing — the sidebar
  // showed the engine marks while the plane denied the folders existed.
  // Boolean only: whether any engine home folder exists, never a count.
  const engineNames = (detectedEngines ?? []).map((e) => e.name);
  const enginesDetected = engineNames.length > 0;
  // Named in the no-folders line. If the backend has not answered yet the
  // sentence drops the list rather than naming a stale roster or an empty one.
  const knownEngineNames = (knownEngines ?? []).map((e) => e.name);

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

  // Strip data: backend-owned total; the state split prefers the backend's
  // annotations (which see directory-level links) and falls back to the
  // inventory classification while they load.
  const stripCounts = annotations
    ? annotationStateCounts(annotations)
    : linkStateCounts(inventory, { kind: "global" });
  const engineCount = Object.keys(assetCounts?.engines ?? {}).filter((k) => k !== "none").length;
  const stripSubtitle = `assets in the global store · ${engineCount} ${
    engineCount === 1 ? "engine" : "engines"
  }`;

  // Check if the selected category itself is empty
  const isCategoryEmpty =
    (selectedCategory === "Skills" && filteredSkills.length === 0) ||
    (selectedCategory === "Tools" && filteredTools.length === 0) ||
    (selectedCategory === "Rules" && filteredRules.length === 0) ||
    (selectedCategory === "Agents" && agents.length === 0) ||
    (selectedCategory === "Subagents" && filteredSubagents.length === 0);

  // Same "a scan in flight is not an absence" rule as pendingState above,
  // scoped to one category. Filtering to MCP servers on a machine with
  // skills elsewhere never makes `storeEmpty` true, so the whole-store
  // pendingState above never fires for it — this is the category branch's
  // own pending state, needed for exactly that case.
  const categoryPending = isCategoryEmpty && !!selectedCategory && loading;

  const showSkills = selectedCategory === null || selectedCategory === "Skills";
  const showTools = selectedCategory === null || selectedCategory === "Tools";
  const showRules = selectedCategory === null || selectedCategory === "Rules";
  const showSubagents = selectedCategory === null || selectedCategory === "Subagents";

  /**
   * An asset row is selected by identity where it has one — many MCP servers
   * share a config file, so path alone marks all of them.
   *
   * A row that carries an id is compared on the id and nothing else. The
   * fallback previously also applied when the SELECTION lacked an id, which
   * silently converted a dropped field upstream into "every server declared in
   * this file is selected" — six rows lit for one click. Failing closed makes
   * that same mistake show up as a row that does not light: visibly wrong
   * rather than plausibly wrong.
   */
  const rowIsSelected = (item: AssetItem) => {
    const selected = selectedAsset as { id?: string; path?: string } | null;
    if (!selected) return false;
    if (item.id) return selected.id === item.id;
    return selected.path === item.path;
  };

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

  // Per-registration rows — today's shape, unchanged. Still built
  // unconditionally: it is what renders whenever grouping is
  // "registration", and the fallback while `mcpServers` (a second,
  // machine-global IPC call) has not resolved yet, so a scan never flashes
  // an empty Tools section waiting on it.
  const perRegistrationTools: AssetItem[] = sortAssetItems(
    filteredTools.map((t) => ({
      name: t.name,
      category: "Tools",
      // `path` stays the config FILE — it is what the row shows and what the
      // inspector opens. Identity is separate: many servers share one file, so
      // comparing paths marked every server in ~/.claude.json at once.
      id: registrationKey(t),
      path: t.config_path,
      engine: t.scope?.Global?.agent || t.scope?.Project?.agent || t.owning_agent || null,
      details: `Command: ${t.command} (Transport: ${t.transport})`,
      // The card row's transport chip (§5.6) — a type, not a state, so it
      // rides beside the name rather than becoming its own column.
      transport: t.transport,
      isSymlink: t.is_symlink,
      drifted: t.drifted,
      parseStatus: t.parse_status,
      parseError: t.parse_error,
    })),
    sortField,
    sortDirection
  );

  // One row per server (the View control's default) — built from
  // `get_mcp_servers`, never from `inventory.tools`: `registration_count`
  // and `distinct_spec_count` are backend-owned, and this is the one place
  // that renders them rather than recomputing anything from `registrations`.
  const useGroupedTools = serverGrouping === "server" && mcpServers != null;
  // Reach is keyed by REGISTRATION in `annotations`, but one grouped row
  // stands for every registration of a server name at once — looked up
  // alongside the row so `toolAnnotationFor` below can hand `AssetRow` the
  // union rather than whichever single registration happened first.
  const groupedAnnotationById = new Map<string, AssetAnnotationView | null>();
  const groupedTools: AssetItem[] = useGroupedTools
    ? sortServerRows(
        mcpServers!.filter((row) => nameMatches(row.name)),
        serverSort
      ).map((row) => {
        const id = row.registrations[0] ?? row.name;
        const reach = mergeReach(row.registrations, annotationByAssetPath);
        groupedAnnotationById.set(
          id,
          reach ? { asset_path: row.name, mechanism: "none", reach, beyond: null } : null
        );
        return {
          name: row.name,
          category: "Tools",
          id,
          path: id,
          transport: row.transport,
          plugin: row.plugin ?? undefined,
          agreementLine: agreementLine(row),
        };
      })
    : [];

  const sortedTools: AssetItem[] = useGroupedTools ? groupedTools : perRegistrationTools;

  // The Tools section's own annotation lookup: the merged view above for a
  // grouped row, the ordinary per-registration lookup otherwise. Every other
  // section keeps calling `annotationFor` directly.
  const toolAnnotationFor = (item: AssetItem): AssetAnnotationView | null =>
    useGroupedTools ? groupedAnnotationById.get(item.id ?? "") ?? null : annotationFor(item);

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

  // Whether Tools is the ONLY section about to render. The shared
  // `AssetHeaderRow` below is `sticky` over the whole scrollable list, not
  // scoped to whichever section sits beneath it, so suppressing it had to
  // key on what will actually be on screen — never on `selectedCategory`
  // alone. `selectedCategory !== "Tools"` only caught the case where Tools
  // was the exclusive FILTER; the default All view (`selectedCategory`
  // null) with servers but nothing else let the header through anyway,
  // Reach and Beyond the store pinned over card rows those columns do not
  // describe. A mix of Tools with another category still needs the shared
  // header for THAT category's rows (asset_table_avionics.test.tsx pins
  // Skills+Tools together needing it), so suppression is scoped to the
  // Tools-only case, not to Tools being present at all.
  const nonToolsSectionVisible =
    (selectedCategory === "Agents" && sortedAgents.length > 0) ||
    (showSkills && sortedSkills.length > 0) ||
    (showRules && sortedRules.length > 0) ||
    (showSubagents && sortedSubagents.length > 0);
  const toolsOnlyView = showTools && sortedTools.length > 0 && !nonToolsSectionVisible;

  // Uppercase micro voice for section labels inside the list plane.
  const secClass =
    "px-3.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";
  const emptyPlaneClass =
    "flex-1 mx-[18px] mb-[18px] min-h-0 flex flex-col items-center justify-center text-center border border-dashed border-line rounded-plane animate-in fade-in duration-200";

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

      {/* Facet chips, plus the View control beside them (§5.6: "sits beside
          the facet chips and owns grouping and sort, so the chip row stays a
          filter line and nothing else"). */}
      <div className="px-[18px] pt-3 pb-2.5 flex items-center gap-3">
        {/* min-w-0 lets this shrink inside the row so CategoryFilterCards'
            own overflow-x-auto engages on a narrow pane, instead of the
            chips (shrink-0 in that component) pushing View off-screen. */}
        <div className="min-w-0 flex-1">
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
        <ViewControl
          grouping={serverGrouping}
          sort={serverSort}
          onGroupingChange={handleServerGroupingChange}
          onSortChange={handleServerSortChange}
        />
      </div>

      {/* A server running with no config behind it is disclosed rather than
          listed: it has no registration, so a row would imply something to
          open that does not exist. DESIGN.md fixes DisclosureBanner for
          exactly this — non-blocking diagnostics, never a modal.

          This is the cross-host view no single host can produce. Claude Code
          knows its own children and nothing else's, and none of them know
          about the servers that outlived whatever started them. */}
      {unaccounted.length > 0 && (
        <div className="px-[18px] pb-2.5">
          {/* `summary` is a bare singular noun: the banner prepends the count
              and pluralises by appending "s", as with "scan warning" and
              "nested repo". A sentence here renders as "…accounts fors". */}
          <DisclosureBanner
            variant="warning"
            summary="undeclared MCP server"
            count={unaccounted.length}
          >
            <div className="flex flex-col gap-1.5">
              <p className="text-small text-ink-2 leading-relaxed">
                Running now, with no entry in any config Hanger reads. Every host sees
                only the servers it started itself, so nothing else on this machine
                accounts for these.
              </p>
              {unaccountedGroups.map((g) => (
                <div key={g.commandLine} className="flex flex-col gap-px">
                  <span className="text-micro font-mono text-ink-1">
                    {/* The count once appeared twice — "79 processes · pid
                        24149 ×79". One number, then a pid you can actually
                        look up. */}
                    {g.pids.length > 1
                      ? `${g.pids.length} processes · e.g. pid ${g.pids[0]}`
                      : `pid ${g.pids[0]}`}
                    {g.spawningHost ? ` · ${g.spawningHost}` : ""}
                  </span>
                  <span className="text-micro font-mono text-ink-3 truncate">{g.commandLine}</span>
                </div>
              ))}
            </div>
          </DisclosureBanner>
        </div>
      )}

      {pendingState ? (
        /* Pending: no claim either way. Live root-by-root progress already
           lives in the foot line's ScanStatusIndicator, so this plane only
           says what the store's silence means right now. "Once the scan
           finishes" is literal: App sets inventory on scan://complete and
           ignores scan://progress, so nothing lands here root by root. */
        <div className={emptyPlaneClass} data-testid="scan-pending">
          <SpinnerIcon className={`text-ink-3 mb-2 ${loading ? "animate-spin" : ""}`} size={40} />
          <span className="text-base-app font-medium text-ink-1">
            {loading ? "Scanning your machine" : "Not scanned yet"}
          </span>
          <span className="text-small text-ink-3 max-w-sm mt-1">
            {loading
              ? "Assets in the global store show up here once the scan finishes."
              : "Rescan when you're ready."}
          </span>
        </div>
      ) : emptyState ? (
        <div className={emptyPlaneClass}>
          <ExclamationCircleIcon className="text-ink-3 mb-2" size={40} />
          {enginesDetected ? (
            /* The engines are here; their global folders are not empty of
               files, just of anything Hanger tracks. Name them: the sidebar
               already shows their marks, and the line should agree with it. */
            <>
              <span className="text-base-app font-medium text-ink-1">Nothing in the global store yet</span>
              <span className="text-small text-ink-3 max-w-sm mt-1">
                {joinNames(engineNames)} {engineNames.length === 1 ? "is" : "are"} here, but{" "}
                {engineNames.length === 1 ? "its global folder holds" : "their global folders hold"} no
                skills, rules, MCP servers or subagents yet. Discovery lists places to find some.
              </span>
            </>
          ) : (
            /* No engine has a folder in the home directory
               (scanner::get_global_agents found none). The roster comes from
               the backend, so adding an engine updates this sentence. */
            <>
              <span className="text-base-app font-medium text-ink-1">No engine folders on this machine yet</span>
              <span className="text-small text-ink-3 max-w-sm mt-1">
                {knownEngineNames.length > 0
                  ? `Hanger looks in your home directory for the folders ${joinNames(knownEngineNames)} keep there, and found none. Run one of them once, then rescan.`
                  : "Hanger looks in your home directory for the folders coding agents keep there, and found none. Run one once, then rescan."}
              </span>
            </>
          )}
        </div>
      ) : isCategoryEmpty && selectedCategory ? (
        /* Category-specific empty state. Three reasons share it, told apart
           by the copy: a scan running right now is not yet an answer (this
           category's own pending state — the whole-store one above never
           fires here, since another category can easily keep `storeEmpty`
           false); a filter that hides every row is not the same as a
           category with nothing in it; and a category genuinely empty
           after a finished scan is a real finding. */
        categoryPending ? (
          <div className={emptyPlaneClass} data-testid="scan-pending">
            <SpinnerIcon className="text-ink-3 mb-2 animate-spin" size={40} />
            <span className="text-base-app font-medium text-ink-1">Scanning your machine</span>
            <span className="text-small text-ink-3 max-w-sm mt-1">
              {categoryNoun(selectedCategory, "many")} show up here once the scan finishes.
            </span>
          </div>
        ) : (
          <div className={emptyPlaneClass}>
            <ExclamationCircleIcon className="text-ink-3 mb-2" size={40} />
            {filterActive ? (
              <span className="text-base-app font-medium text-ink-1">
                No {categoryNoun(selectedCategory, "one")} matches that filter
              </span>
            ) : (
              <>
                <span className="text-base-app font-medium text-ink-1">
                  No {categoryNoun(selectedCategory)} in the global store
                </span>
                <span className="text-small text-ink-3 max-w-sm mt-1">
                  The scan finished without finding any.
                </span>
              </>
            )}
          </div>
        )
      ) : (
        <>
          {/* The list lives on its own plane */}
          {/* Table background dropped by Karthik's ruling (2026-08-15):
              flat on the page, edge drawn by the --line border alone. */}
          <div className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] border border-line rounded-tl-plane rounded-tr-plane pb-1.5">
            {/* The MCP section carries its own column labels below (Registered
                in / Tools) — Reach and Beyond the store describe Skills,
                Rules, Agents and Subagents, never a server, so this header
                stays out of the way entirely when Tools is the only section
                on screen (§5.6, "a column that cannot apply must not
                render"). Suppressed on `toolsOnlyView`, not on
                `selectedCategory !== "Tools"`: this header is `sticky` over
                the WHOLE list, so a default All view with servers but
                nothing else let it through too — see `toolsOnlyView`'s own
                comment above. */}
            {!toolsOnlyView && (
              <AssetHeaderRow
                sortField={sortField}
                sortDirection={sortDirection}
                showKindColumn={!selectedCategory}
                showReachColumns
                onSort={handleSort}
              />
            )}

            {/* Agents Group */}
            {selectedCategory === "Agents" && (
              <>
                <h3 className={secClass}>Agents · {sortedAgents.length}</h3>
                <div className="flex flex-col">
                  {sortedAgents.map((item) => (
                    <AssetRow
                      key={`agent-${item.name}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={false}
                      item={item}
                      annotation={annotationFor(item)}
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
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Skills", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Tools Group — card rows, not table rows (§5.6). This section
                owns its own column labels rather than sharing the header
                above: "Reach" is meaningless for a server (it does not have
                a symlink or a tracked copy), so it reads "Registered in"
                instead. In a Tools-only view the shared header above is
                suppressed entirely (`toolsOnlyView`); in a mixed view the
                shared header still renders for the OTHER sections, and this
                inline header is what actually sits above these rows. */}
            {showTools && sortedTools.length > 0 && (
              <>
                <div
                  data-testid="section-header-tools"
                  className={`flex items-center gap-3 select-none ${secClass}`}
                >
                  <h3 className="flex-1 truncate">
                    MCP servers · {assetCounts ? (assetCounts.byCategory.tool?.global ?? 0) : sortedTools.length}
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
                      annotation={toolAnnotationFor(item)}
                      onLink={() => onLinkAsset(item)}
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
                  Rules · {assetCounts ? (assetCounts.byCategory.rule?.global ?? 0) : sortedRules.length}
                </h3>
                <div className="flex flex-col">
                  {sortedRules.map((item, idx) => (
                    <AssetRow
                      key={`rule-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
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
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Subagents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}
          </div>

        </>
      )}

      {/* Foot line. Unconditional: scan progress needs a home in the empty
          state too, which is precisely when a scan is running. */}
      <div className="h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex text-micro text-ink-3">
        {sumGlobalAssets(assetCounts) > 0 && (
          <span>
            Showing {visibleCount} of {sumGlobalAssets(assetCounts)}
          </span>
        )}
        <span className="ml-auto">
          <ScanStatusIndicator />
        </span>
      </div>
    </div>
  );
}
