import { useState } from "react";
import {
  ExclamationCircleIcon,
  Disc3Icon,
  FolderClockIcon,
  PackageOpenIcon,
  FolderXIcon,
  SearchIcon,
  InboxIcon,
  ZapOffIcon,
  PlugZapIcon,
} from "./icons";
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
import { cardSecondLine, mergeReach, sortServerRows, type McpServerRow } from "../utils/serverRows";
import { sumGlobalAssets, categoryCountKey } from "../utils/globalAssetCount";
import { groupLabelClass } from "./typeRoles";
import SummaryStrip, { type StripReview } from "./SummaryStrip";
import HeroBand from "./HeroBand";
import type { FindingLine } from "./FindingPopover";
import { miniBtnClass, miniSetClass } from "./miniButton";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import EmptyState from "./EmptyState";
import { annotationStateCounts, linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";
import { categoryNoun, joinNames, joinNamesTruncated } from "../utils/prose";
import type { McpEngineSummaryData } from "../types/mcpEngineSummary";
import type { ReviewIssue } from "../utils/reviewIssues";

/** The frontend's mirror of Rust's `ConfigProblem`
 *  (`src-tauri/src/mcp/discover.rs`), carried on `mcpCoverage.problems`.
 *  Appendix A.3/A.4's rows are rendered from this verbatim — `engine` is
 *  already the registry's display name, resolved backend-side, so the view
 *  never looks up a host id itself (`no-hardcoded-engine-copy.test.ts`
 *  covers `src/components/**`, not this data shape, but the same rule is
 *  the reason the field exists as a name rather than an id). `line` is
 *  `null`, never a placeholder, when the parser gave no location. */
export interface ConfigProblemRow {
  kind: "Unreadable" | "Unparseable" | "FormatUnread" | "DeclaredNothing";
  path: string;
  detail: string;
  line: number | null;
  engine: string;
}

interface ProfilePaneProps {
  inventory: Inventory | null;
  /** Backend-derived per-asset annotations (mechanism, reach, beyond) for
   *  the glyph and the Reach / Beyond the store columns. Rendered verbatim. */
  annotations?: AssetAnnotationView[] | null;
  assetCounts?: CategoryCounts | null;
  selectedCategory?: CategoryType | null;
  selectedAsset?: { path: string } | null;
  loading: boolean;
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
  /** What MCP discovery actually checked on this machine (`get_mcp_coverage`),
   *  backing Appendix A.1's "Checked {n} config files across {m} engines" and
   *  its file disclosure. Both counts are backend fields, never a `.length`
   *  taken here — `no-frontend-counting.test.ts` forbids deriving one. */
  mcpCoverage?: {
    checked_file_count: number;
    checked_engine_count: number;
    checked_files: string[];
    /** Appendix A.3/A.4's rows. Optional so every existing coverage fixture
     *  in this file's own tests keeps typechecking without an edit — absent
     *  reads as no problems, same as an empty array. */
    problems?: ConfigProblemRow[];
  } | null;
  /** Every standard location Hanger checks for a known engine
   *  (`get_known_engine_locations`), registry-derived — Appendix A.2's
   *  "Checked {n} locations" line and its disclosure. */
  knownEngineLocations?: { location_count: number; locations: string[] } | null;
  onRescan?: () => void;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSortChange?: (field: SortField) => void;
  onSelectAsset: (asset: { id?: string; name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => void;
  onLinkAsset: (asset: any) => void;
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
  /** `get_mcp_engine_summary`'s answer, fetched once in App.tsx and refreshed
   *  alongside `mcpCoverage` on every scan. Present and grouped rows in view
   *  together switch the strip to MCP mode — probe coverage instead of link
   *  state, with a Review pill that filters to conflicting servers. */
  mcpEngineSummary?: McpEngineSummaryData | null;
  /** The band under the hero, folded or open, and the toggle that persists
   *  it. Owned by App so the choice survives a rebuild of this pane. */
  hostsBandOpen?: boolean;
  onToggleHostsBand?: () => void;
  /** The global store's own review issues — what the Needs review pill lists
   *  on every tab but MCP servers. Already narrowed to the selected category
   *  by App, so the pill's count follows the tab. */
  issues?: ReviewIssue[];
  onReview?: (issue: ReviewIssue | null) => void;
  serverGrouping?: ServerGrouping;
  serverSort?: ServerSort;
  onServerGroupingChange?: (grouping: ServerGrouping) => void;
  onServerSortChange?: (sort: ServerSort) => void;
}

type McpCoverageProp = { checked_file_count: number; checked_engine_count: number; checked_files: string[] } | null;
type EngineLocationsProp = { location_count: number; locations: string[] } | null;

/** Appendix A.1, normative: engines are here, none has an MCP server
 *  configured. `engineNames` is the DETECTED roster (a filesystem probe);
 *  `coverage` is the backend's own tally of what discovery checked — both
 *  counts in "Checked {n} config files across {m} engines" are its fields,
 *  never computed here.
 *
 *  The count line and its disclosure render only once `coverage` has
 *  actually arrived (fix round 1, binding ruling): while the fetch is
 *  pending, or if it failed (`App.tsx` catches into the same `null`, so
 *  this component cannot and need not tell the two apart), a false
 *  "Checked 0 config files across 0 engines" is worse than naming nothing —
 *  the headline and body still make the real claim (engines detected, none
 *  configured), just without a figure attached. When `coverage` HAS
 *  arrived and genuinely found nothing to check (`checked_file_count ===
 *  0` — an engine can be detected with none of its MCP config files ever
 *  created), the count line falls back to Appendix A.2's own vocabulary
 *  ("Checked {n} locations"), backed by `locations`
 *  (`get_known_engine_locations`, the same backend count A.2 uses) rather
 *  than asserting a file figure that would always read zero. This hybrid is
 *  a ruling, not spec text — flagged for the T11 naming-brief pass. */
function McpZeroServersEmptyState({
  engineNames,
  coverage,
  locations,
}: {
  engineNames: string[];
  coverage: McpCoverageProp;
  locations: EngineLocationsProp;
}) {
  const [showFiles, setShowFiles] = useState(false);
  const [showLocations, setShowLocations] = useState(false);
  // "no engine has" reads naturally for one; "neither" is exactly-two
  // grammar; "none" is the three-or-more form. All three describe the same
  // detected roster, never a fixed pick.
  const noneHas =
    engineNames.length === 1 ? "no engine has" : engineNames.length === 2 ? "neither has" : "none has";

  const files = coverage?.checked_files ?? [];
  const paths = locations?.locations ?? [];
  // Three shapes for the count line, never a guess: no answer yet (or ever);
  // a real answer of zero files, which reads as locations instead; a real
  // answer with files to name.
  const filesChecked = coverage !== null && coverage.checked_file_count > 0;
  const fallsBackToLocations = coverage !== null && coverage.checked_file_count === 0 && locations !== null;

  return (
    <>
      <span className="text-base-app font-medium text-ink-1">No MCP servers registered</span>
      <span className="text-small text-ink-3 max-w-sm mt-1">
        {joinNamesTruncated(engineNames)} {engineNames.length === 1 ? "is" : "are"} installed here, but{" "}
        {noneHas} a server configured.
      </span>
      {filesChecked && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-micro text-ink-3">
            Checked {coverage!.checked_file_count} config {coverage!.checked_file_count === 1 ? "file" : "files"}{" "}
            across {coverage!.checked_engine_count} {coverage!.checked_engine_count === 1 ? "engine" : "engines"}
          </span>
          {files.length > 0 && (
            <>
              <span aria-hidden="true" className="text-micro text-ink-3">
                ·
              </span>
              <button
                type="button"
                onClick={() => setShowFiles((v) => !v)}
                className="text-micro text-ink-3 underline hover:text-ink-1 transition-colors duration-hover cursor-pointer"
              >
                {showFiles ? "Hide files" : "Show files"}
              </button>
            </>
          )}
        </div>
      )}
      {showFiles && files.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 max-w-sm">
          {files.map((f) => (
            <span key={f} className="text-micro font-mono text-ink-3 truncate">
              {f}
            </span>
          ))}
        </div>
      )}
      {fallsBackToLocations && (
        <div className="flex items-center gap-1.5 mt-2">
          <span className="text-micro text-ink-3">
            Checked {locations!.location_count} {locations!.location_count === 1 ? "location" : "locations"}
          </span>
          {paths.length > 0 && (
            <>
              <span aria-hidden="true" className="text-micro text-ink-3">
                ·
              </span>
              <button
                type="button"
                onClick={() => setShowLocations((v) => !v)}
                className="text-micro text-ink-3 underline hover:text-ink-1 transition-colors duration-hover cursor-pointer"
              >
                {showLocations ? "Hide locations" : "Show locations"}
              </button>
            </>
          )}
        </div>
      )}
      {fallsBackToLocations && showLocations && paths.length > 0 && (
        <div className="mt-2 flex flex-col gap-0.5 max-w-sm">
          {paths.map((p) => (
            <span key={p} className="text-micro font-mono text-ink-3 truncate">
              {p}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Appendix A.2, normative: no engine was found at all — a different message
 *  from A.1 because the reason is upstream of MCP. `registryEngineNames`
 *  comes from `known_engines()` (the same source the whole-store no-folders
 *  line already uses); `locations` is the backend's own count of the
 *  standard places it looked. */
function McpNoEnginesEmptyState({
  registryEngineNames,
  locations,
}: {
  registryEngineNames: string[];
  locations: EngineLocationsProp;
}) {
  const [showLocations, setShowLocations] = useState(false);
  const n = locations?.location_count ?? 0;
  const paths = locations?.locations ?? [];

  return (
    <>
      <span className="text-base-app font-medium text-ink-1">No AI engines found</span>
      <span className="text-small text-ink-3 max-w-sm mt-1">
        {registryEngineNames.length > 0
          ? `Hanger looks for ${joinNamesTruncated(registryEngineNames)} in their standard locations.`
          : "Hanger looks for the engines it knows about in their standard locations."}
      </span>
      <div className="flex items-center gap-1.5 mt-2">
        <span className="text-micro text-ink-3">
          Checked {n} {n === 1 ? "location" : "locations"}
        </span>
        {paths.length > 0 && (
          <>
            <span aria-hidden="true" className="text-micro text-ink-3">
              ·
            </span>
            <button
              type="button"
              onClick={() => setShowLocations((v) => !v)}
              className="text-micro text-ink-3 underline hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              {showLocations ? "Hide locations" : "Show locations"}
            </button>
          </>
        )}
      </div>
      {showLocations && (
        <div className="mt-2 flex flex-col gap-0.5 max-w-sm">
          {paths.map((p) => (
            <span key={p} className="text-micro font-mono text-ink-3 truncate">
              {p}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** Appendix A.3/A.4, normative — the line one `ConfigProblemRow` renders.
 *  Every substitution is a data field (`engine`, `path`, `detail`, `line`),
 *  never a literal, per A.5. `Unreadable` and `Unparseable` share a path
 *  shape but read differently on purpose: "read" is a permissions fix,
 *  "parsed" is an editor fix, and collapsing them back to one sentence is
 *  exactly the defect Appendix A exists to undo. A `Unparseable` problem
 *  with no line omits the parenthetical outright — never an invented
 *  number, never an empty `()` or `(line )`. */
function configProblemLine(problem: ConfigProblemRow): string {
  switch (problem.kind) {
    case "FormatUnread":
      return `${problem.engine} · config format not yet supported`;
    case "Unreadable":
      return `${problem.path} — couldn't be read (${problem.detail})`;
    case "Unparseable":
      return problem.line != null
        ? `${problem.path} — couldn't be parsed (line ${problem.line})`
        : `${problem.path} — couldn't be parsed`;
    default:
      // `DeclaredNothing` has no Appendix A row copy here — callers filter
      // it out before this ever runs (see `configProblemRows` below); this
      // branch exists only so the switch is exhaustive over data from IPC,
      // which a future backend variant could still send.
      return "";
  }
}

/** One row for Appendix A.3 or A.4 — content next to the server list, never
 *  a `DisclosureBanner`: a config problem is a finding about the scan that
 *  just ran, not a diagnostic about Hanger itself (`known-debt.md`'s
 *  DisclosureBanner rule is about the other kind). Not clickable — there is
 *  no asset behind it to open, only a file Hanger could not read or parse. */
function McpConfigProblemRow({ problem }: { problem: ConfigProblemRow }) {
  return (
    <div
      data-testid="mcp-config-problem-row"
      data-problem-kind={problem.kind}
      className="flex items-center gap-2 px-3.5 py-2 border-t border-line"
    >
      <ExclamationCircleIcon className="text-ink-3 shrink-0" size={14} />
      <span className="text-micro text-ink-3 truncate">{configProblemLine(problem)}</span>
    </div>
  );
}

export default function ProfilePane({
  inventory,
  annotations,
  assetCounts,
  selectedCategory: propSelectedCategory,
  selectedAsset,
  loading,
  stateFilter = null,
  onStateFilterChange,
  scannedAt = null,
  detectedEngines,
  knownEngines,
  mcpCoverage = null,
  knownEngineLocations = null,
  onRescan,
  sortField: propSortField,
  sortDirection: propSortDirection,
  onSortChange,
  onSelectAsset,
  onLinkAsset,
  onCategoryChange,
  unaccountedProcesses,
  mcpServers,
  mcpEngineSummary = null,
  hostsBandOpen = false,
  onToggleHostsBand,
  issues = [],
  onReview,
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
  // The strip's MCP-mode Review pill, own state — reset on every category
  // change so switching away from Tools and back never carries a stale
  // filter over from a different session's look at the list.
  const [mcpReviewOnly, setMcpReviewOnly] = useState(false);

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
  const unaccountedGroups = groupProcesses(unaccountedProcesses ?? []);

  const selectedCategory = propSelectedCategory ?? internalCategory;
  const sortField = propSortField ?? internalSortField;
  const sortDirection = propSortDirection ?? internalSortDirection;
  const serverGrouping = propServerGrouping ?? internalServerGrouping;
  const serverSort = propServerSort ?? internalServerSort;

  /* Filtering the table is not choosing a new subject. This used to clear
     the selection through `onClearSelection`, so moving from Skills to MCP
     servers emptied the inspector of the skill the user was reading -- the
     panel went blank on a click that was about the list, not about it. The
     inspector now holds what it has until another row is chosen (Karthik,
     2026-08-27). The prop is gone rather than left uncalled: it existed for
     this one call and nothing else. */
  const setSelectedCategory = (cat: CategoryType | null) => {
    setInternalCategory(cat);
    setMcpReviewOnly(false);
    onCategoryChange?.(cat);
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

  // Appendix A.3/A.4's rows (§6.3 states 5-7) — every problem discovery hit
  // while checking, restricted to the three kinds Appendix A gives copy to
  // here. `DeclaredNothing` carries no row text (`configProblemLine`'s
  // exhaustive switch would return ""), so it is filtered out before it
  // could ever render an empty row. Computed here, ahead of its other call
  // sites below, because `nothingToShow` (T4, just below) needs it: these
  // rows come from `mcpCoverage`, not `inventory`, so they can already be on
  // screen before a scan's `inventory` ever lands.
  const configProblemRows: ConfigProblemRow[] = (mcpCoverage?.problems ?? []).filter(
    (p) => p.kind === "Unreadable" || p.kind === "Unparseable" || p.kind === "FormatUnread"
  );

  // Subagents is one of the four asset kinds (CLAUDE.md), same as skills,
  // tools and rules above, at the same global scope. `storeEmpty` above
  // never checked it — that formula is frozen (see the ruling below) — so
  // this exists only for `nothingToShow`.
  const globalSubagents = inventory?.subagents.filter((sa) => sa.scope?.Global) || [];

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

  // T4, 2026-08-25 (Karthik hit this live, twice). `storeEmpty` reads
  // `assetCounts` first, and the backend serves counts from SQLite instantly
  // on start, well before `inventory` arrives on scan://complete — so a
  // global store with counts persisted from an earlier scan was never
  // "empty" by that measure, `pendingState` below never fired, and the table
  // branch rendered `AssetHeaderRow` over an `inventory` still `null`: a real
  // headline ("144 assets"), a real "Showing 0 of 144", and zero rows.
  // `nothingToShow` asks the question `storeEmpty` skipped — is there
  // anything to actually draw — over every source a row can come from, not
  // just the scope-filtered asset arrays: `mcpServers` (the grouped MCP
  // server rows) is a second, machine-global fetch (App.tsx) that can
  // resolve before a scan's `inventory` does, and `configProblemRows` comes
  // from `mcpCoverage`, same story — both can carry real, already-arrived
  // rows while `inventory` is still `null`. Checking only the
  // inventory-derived arrays would have traded one way of covering real
  // content for another. `storeEmpty` itself is untouched: `emptyState`
  // below still keys on it exactly as ruled 2026-08-16/08-18 — a negative
  // claim still needs a finished scan and real counts behind it.
  const nothingToShow =
    globalSkills.length === 0 &&
    globalTools.length === 0 &&
    globalRules.length === 0 &&
    globalSubagents.length === 0 &&
    (mcpServers == null || mcpServers.length === 0) &&
    configProblemRows.length === 0;
  const pendingState = nothingToShow && (loading || !hasScanned);
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

  // Whether anything is narrowing the rows — the category-empty copy says
  // "matches that filter" only when a filter is what emptied it. Text search
  // lives in the palette now (⌘K), not in the pane.
  const filterActive = stateFilter !== null;

  const filteredSkills = scopedSkills.filter(
    (s) => matchesStateFilter(s, stateFilter)
  );
  const filteredTools = scopedTools.filter(
    (t) => matchesStateFilter(t, stateFilter)
  );
  const filteredRules = scopedRules.filter(
    (r) => matchesStateFilter(r, stateFilter)
  );
  const filteredSubagents = scopedSubagents.filter(
    (sa) => matchesStateFilter(sa, stateFilter)
  );

  // One row per server (the View control's default) — moved up from its
  // original point of use below (still true there; see that comment for
  // what it drives in the Tools section itself) because the strip's MCP
  // mode needs it before `stripSubtitle` is composed.
  const useGroupedTools = serverGrouping === "server" && mcpServers != null;

  // Strip data: backend-owned total; the state split prefers the backend's
  // annotations (which see directory-level links) and falls back to the
  // inventory classification while they load. A selected category narrows
  // both the total and the split to that category's own figures rather than
  // the whole store's — `categoryCountKey` is the same category-to-field map
  // both panes share.
  const kindKey = selectedCategory ? categoryCountKey(selectedCategory) : null;
  const stripTotal =
    selectedCategory === null || kindKey === null
      ? sumGlobalAssets(assetCounts)
      : assetCounts?.byCategory[kindKey]?.global ?? 0;

  // MCP mode: probe coverage instead of link state. Gated on a grouped row
  // existing to point the Review pill's filter at — a per-registration view
  // has no `agreement` verdict to filter on.
  const mcpMode = selectedCategory === "Tools" && mcpEngineSummary !== null && useGroupedTools;

  // Identity set for the selected category's own rows — the same keys
  // `annotationFor` uses (path for everything but Tools, `registrationKey`
  // for Tools) — so the annotations-sourced split can be narrowed to just
  // this category without re-deriving link state itself.
  const categoryPaths = new Set<string>([
    ...scopedSkills.map((s) => s.path),
    ...scopedRules.map((r) => r.path),
    ...scopedSubagents.map((sa) => sa.path),
    ...scopedTools.map((t) => registrationKey(t)),
  ]);

  const stripCounts =
    selectedCategory === null
      ? annotations
        ? annotationStateCounts(annotations)
        : linkStateCounts(inventory, { kind: "global" })
      : annotations
        ? annotationStateCounts(annotations.filter((a) => categoryPaths.has(a.asset_path)))
        : linkStateCounts(inventory, { kind: "global" }, selectedCategory);

  const engineCount = Object.keys(assetCounts?.engines ?? {}).filter((k) => k !== "none").length;
  const stripSubtitle =
    selectedCategory === null
      ? `assets in the global store · ${engineCount} ${engineCount === 1 ? "engine" : "engines"}`
      : mcpMode && mcpEngineSummary
        ? mcpEngineSummary.tools_known_total === null
          ? `MCP servers across ${mcpEngineSummary.host_count} ${mcpEngineSummary.host_count === 1 ? "host" : "hosts"}`
          : `MCP servers · ${mcpEngineSummary.tools_known_total} tool ${
              mcpEngineSummary.tools_known_total === 1 ? "description" : "descriptions"
            } across ${mcpEngineSummary.host_count} ${mcpEngineSummary.host_count === 1 ? "host" : "hosts"}`
        : `${categoryNoun(selectedCategory)} in the global store · ${engineCount} ${
            engineCount === 1 ? "engine" : "engines"
          }`;

  // The strip's MCP-mode caption, or undefined to keep it in the ordinary
  // link-state mode — `mcpEngineSummary &&` (not just `mcpMode`, which TS
  // cannot narrow through) is what lets this read `mcpEngineSummary`'s
  // fields without a non-null assertion.
  //
  // The probe-coverage meter that used to live here is gone (Karthik's
  // ruling, 2026-08-28): it measured whether Hanger had asked, not whether
  // anything was up, and converged to a constant.
  const MCP_CAPTION = "Described to the model on every request, used or not.";
  const mcpFigures = mcpMode && mcpEngineSummary ? { caption: MCP_CAPTION } : undefined;

  /* The processes nothing on disk accounts for. They belong to every Global
     tab, not just MCP servers: the banner they replace was gated on
     `unaccounted.length > 0` alone, while `mcpMode` is four conditions — a
     null `mcpEngineSummary` would have hidden them on the correct tab. Built
     once and appended to whichever pill is showing (coordinator review,
     2026-08-28, finding 5).

     The popover IS their disclosure — there is no registration to open, so
     there is nothing to route to (the banner said the same, 2026-08-20). */
  const processLines: FindingLine[] = unaccountedGroups.map((g) => ({
    severity: "warning" as const,
    text: "Running with no config behind it.",
    detail: `${g.pids.length > 1 ? `${g.pids.length} processes · e.g. pid ${g.pids[0]}` : `pid ${g.pids[0]}`} · ${g.commandLine}${g.spawningHost ? ` · started by ${g.spawningHost}` : ""}`,
  }));

  /* The severity rule is `reviewIssues.ts:440`'s, not a second one: a
     won't-parse asset is a danger in the inspector cap's chip, so it is a
     danger dot here too. Two surfaces reading the same issue must not paint
     it two colours (coordinator review, 2026-08-28, finding 2). */
  const issueLine = (i: ReviewIssue): FindingLine => ({
    severity: i.kind === "broken" || i.kind === "parse" ? ("danger" as const) : ("warning" as const),
    text: i.problem,
    detail: i.name,
  });

  // The pill's lines on MCP servers: disagreeing servers first, then those
  // processes.
  const conflictingRows = mcpMode && mcpServers ? mcpServers.filter((row) => row.agreement === "Conflicting") : [];
  const reviewLines: FindingLine[] = [
    ...conflictingRows.map((row) => ({ severity: "danger" as const, text: `${row.name}: ${cardSecondLine(row)}` })),
    ...processLines,
  ];
  const reviewLineCount = reviewLines.length; // allowlisted: the lines this popover itself renders
  const mcpReview: StripReview | undefined = mcpMode
    ? {
        count: reviewLineCount,
        lines: reviewLines,
        actions:
          conflictingRows.length > 0 ? (
            <div className={miniSetClass}>
              <button
                type="button"
                aria-pressed={mcpReviewOnly}
                onClick={() => setMcpReviewOnly((v) => !v)}
                className={miniBtnClass}
              >
                Show disagreeing servers
              </button>
            </div>
          ) : undefined,
      }
    : undefined;

  // Every other tab: this store's own review issues, then the same processes.
  // The pill's figure used to be `counts.drifted + counts.broken` computed
  // inside the strip; it is now the lines it actually shows.
  const assetReviewLines: FindingLine[] = [...issues.map(issueLine), ...processLines];
  const assetReviewLineCount = assetReviewLines.length; // allowlisted: the lines this popover itself renders
  /* `Show in list` applies `stateFilter = "needs-review"`, and `needsReview`
     (`linkStateCounts.ts:45-48`) is broken-or-drifted only. A duplicate is a
     relationship between assets, not a state one asset is in, so the filter
     cannot reach it — the button would offer to show a line it then filters
     out. It is withheld rather than the filter widened: `linkStateCounts.ts`
     states the position that `reviewIssues.ts` is the sole authority for how
     many need review, and two functions answering that would diverge
     (coordinator review, 2026-08-28, finding 1). `Needs review →` always
     renders, and always works. */
  const everyIssueFilterable = issues.length > 0 && !issues.some((i) => i.kind === "duplicate");
  const assetReview: StripReview | undefined = !mcpMode
    ? {
        count: assetReviewLineCount,
        lines: assetReviewLines,
        actions: (
          <div className={miniSetClass}>
            {everyIssueFilterable && (
              <button
                type="button"
                aria-pressed={stateFilter === "needs-review"}
                onClick={() => onStateFilterChange?.(stateFilter === "needs-review" ? null : "needs-review")}
                className={miniBtnClass}
              >
                Show in list
              </button>
            )}
            <button type="button" onClick={() => onReview?.(issues[0] ?? null)} className={miniBtnClass}>
              Needs review →
            </button>
          </div>
        ),
      }
    : undefined;

  // configProblemRows (Appendix A.3/A.4's rows) is computed earlier, near
  // `nothingToShow`, which needs it before this point — see that comment.

  // Check if the selected category itself is empty. Tools is not empty just
  // because it has zero servers if it has a problem to report instead — "a
  // row, not an empty state" (A.3/A.4) means these rows must be reachable
  // even on a machine whose only MCP-relevant fact is a config Hanger could
  // not read or parse, with no working server anywhere to fall back on.
  const isCategoryEmpty =
    (selectedCategory === "Skills" && filteredSkills.length === 0) ||
    (selectedCategory === "Tools" && filteredTools.length === 0 && configProblemRows.length === 0) ||
    (selectedCategory === "Rules" && filteredRules.length === 0) ||
    (selectedCategory === "Agents" && agents.length === 0) ||
    (selectedCategory === "Subagents" && filteredSubagents.length === 0);

  // Same "a scan in flight is not an absence" rule as pendingState above,
  // scoped to one category. Filtering to MCP servers on a machine with
  // skills elsewhere never makes `storeEmpty` true, so the whole-store
  // pendingState above never fires for it — this is the category branch's
  // own pending state, needed for exactly that case.
  const categoryPending = isCategoryEmpty && !!selectedCategory && loading;

  // The All tab's own reading of the same bug class isCategoryEmpty exists
  // to prevent, one level up: `isCategoryEmpty` is a disjunction over
  // `selectedCategory === "<literal>"`, so on All (`selectedCategory ===
  // null`) every arm is false and a non-matching filter fell through to the
  // table, rendering `AssetHeaderRow`'s column labels over zero rows. Same
  // four collections `isCategoryEmpty` checks per-category, checked together
  // — Agents is not one of them because the Agents section only renders
  // when `selectedCategory === "Agents"` (never on All), so it contributes
  // no rows here to be empty or not. Gated on `filterActive` at the call
  // site below, not here, to mirror `isCategoryEmpty` itself staying a pure
  // "what's on screen" predicate.
  const isAllEmpty =
    selectedCategory === null &&
    filteredSkills.length === 0 &&
    filteredTools.length === 0 &&
    configProblemRows.length === 0 &&
    filteredRules.length === 0 &&
    filteredSubagents.length === 0;

  // categoryPending's own shape, scoped to the All tab instead of one
  // category: a scan in flight is not yet an answer, so it must win over the
  // "no assets match" reading below even when the filtered rows are
  // currently zero.
  const allPending = isAllEmpty && loading;

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
      origin: s.origin,
      origin_blocked: s.origin_blocked,
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
  // (`useGroupedTools` itself is declared above, near `stripCounts` — the
  // strip's MCP mode needs it before this point.)
  // Reach is keyed by REGISTRATION in `annotations`, but one grouped row
  // stands for every registration of a server name at once — looked up
  // alongside the row so `toolAnnotationFor` below can hand `AssetRow` the
  // union rather than whichever single registration happened first.
  const groupedAnnotationById = new Map<string, AssetAnnotationView | null>();
  const groupedTools: AssetItem[] = useGroupedTools
    ? sortServerRows(
        // The strip's Review pill filters this same list to disagreeing
        // servers when active — one gate, so the card rows and the strip's
        // own "tauri"/"spades" count never disagree on what "filtered" means.
        mcpServers!.filter(
          (row) => !mcpReviewOnly || row.agreement === "Conflicting"
        ),
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
          // The whole second line, not just the verdict — §6.3 state 9's
          // project-override note (when one applies) rides on the same line
          // as the agreement sentence, per `cardSecondLine`'s own doc
          // comment.
          agreementLine: cardSecondLine(row),
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
  // The Tools group has something to show whenever there is a server row OR
  // a problem row — a machine with one unreadable config and zero working
  // servers still has a Tools section worth rendering (A.3/A.4).
  const hasToolsContent = sortedTools.length > 0 || configProblemRows.length > 0;
  const toolsOnlyView = showTools && hasToolsContent && !nonToolsSectionVisible;

  // Visible rows post-filter for the foot line — a display subset, never the
  // asset total (which stays backend-owned).
  const visibleCount = sortedSkills.length + sortedTools.length + sortedRules.length + sortedSubagents.length + (selectedCategory === "Agents" ? sortedAgents.length : 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
      {/* Facet chips */}
      <div className="px-[18px] pt-[18px] pb-3.5">
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

      {/* Inventory summary strip */}
      <div className="mx-[18px] mb-3.5">
        <SummaryStrip
          total={stripTotal}
          subtitle={stripSubtitle}
          scannedAt={scannedAt}
          scanning={loading}
          counts={stripCounts}
          activeStateFilter={stateFilter}
          onFilterState={(f) => onStateFilterChange?.(f)}
          onRescan={onRescan}
          mcp={mcpFigures}
          review={mcpMode ? mcpReview : assetReview}
        >
          {mcpMode && mcpEngineSummary && (
            <HeroBand
              label="By host"
              open={hostsBandOpen}
              onToggle={() => onToggleHostsBand?.()}
              note="A tool counts once per host that carries it."
              rows={mcpEngineSummary.rows.map((r) => ({
                key: r.engine_id,
                engineKey: r.engine_id,
                engineName: r.engine_name,
                secondary: r.server_count === 1 ? "1 server" : `${r.server_count} servers`,
                value: r.tools_known,
                word: r.tools_known === null ? "can't be asked" : r.tools_known === 1 ? "tool" : "tools",
              }))}
            />
          )}
        </SummaryStrip>
      </div>

      {pendingState ? (
        /* Pending: no claim either way. Live root-by-root progress already
           lives in the foot line's ScanStatusIndicator, so this plane only
           says what the store's silence means right now. "Once the scan
           finishes" is literal: App sets inventory on scan://complete and
           ignores scan://progress, so nothing lands here root by root. */
        <EmptyState
          testId="scan-pending"
          icon={
            loading ? (
              <Disc3Icon active size={40} className="text-ink-3 mb-2" />
            ) : (
              <FolderClockIcon size={40} className="text-ink-3 mb-2" />
            )
          }
          headline={loading ? "Scanning your machine" : "Not scanned yet"}
          sub={
            loading
              ? "Assets in the global store show up here once the scan finishes."
              : "Rescan when you're ready."
          }
        />
      ) : emptyState && selectedCategory !== "Tools" ? (
        /* Tools is excluded here even though a fully empty store makes this
           condition true too: A.1 and A.2 below are Tools' own, more precise
           readings of exactly this state (engines with nothing configured;
           no engines at all), and both need to fire regardless of whether
           some OTHER category also happens to be empty. Left unexcluded,
           selecting the Tools chip on a totally fresh store would show this
           generic line first and A.1/A.2 would only ever be reachable in the
           narrower case where Tools alone is empty. */
        <EmptyState
          icon={
            enginesDetected ? (
              <PackageOpenIcon size={40} className="text-ink-3 mb-2" />
            ) : (
              <FolderXIcon size={40} className="text-ink-3 mb-2" />
            )
          }
          headline={enginesDetected ? "Nothing in the global store yet" : "No engine folders on this machine yet"}
          sub={
            enginesDetected ? (
              /* The engines are here; their global folders are not empty of
                 files, just of anything Hanger tracks. Name them: the
                 sidebar already shows their marks, and the line should
                 agree with it. */
              <>
                {joinNames(engineNames)} {engineNames.length === 1 ? "is" : "are"} here, but{" "}
                {engineNames.length === 1 ? "its global folder holds" : "their global folders hold"} no
                skills, rules, MCP servers or subagents yet.
              </>
            ) : (
              /* No engine has a folder in the home directory
                 (scanner::get_global_agents found none). The roster comes
                 from the backend, so adding an engine updates this
                 sentence. */
              <>
                {knownEngineNames.length > 0
                  ? `Hanger looks in your home directory for the folders ${joinNames(knownEngineNames)} keep there, and found none. Run one of them once, then rescan.`
                  : "Hanger looks in your home directory for the folders coding agents keep there, and found none. Run one once, then rescan."}
              </>
            )
          }
        />
      ) : isCategoryEmpty && selectedCategory ? (
        /* Category-specific empty state. Three reasons share it, told apart
           by the copy: a scan running right now is not yet an answer (this
           category's own pending state — the whole-store one above never
           fires here, since another category can easily keep `storeEmpty`
           false); a filter that hides every row is not the same as a
           category with nothing in it; and a category genuinely empty
           after a finished scan is a real finding. */
        categoryPending ? (
          <EmptyState
            testId="scan-pending"
            icon={<Disc3Icon active size={40} className="text-ink-3 mb-2" />}
            headline="Scanning your machine"
            sub={`${categoryNoun(selectedCategory, "many")} show up here once the scan finishes.`}
          />
        ) : (
          <EmptyState
            icon={
              filterActive ? (
                <SearchIcon size={40} className="text-ink-3 mb-2" />
              ) : selectedCategory === "Tools" ? (
                enginesDetected ? (
                  <ZapOffIcon size={40} className="text-ink-3 mb-2" />
                ) : (
                  <PlugZapIcon size={40} className="text-ink-3 mb-2" />
                )
              ) : (
                <InboxIcon size={40} className="text-ink-3 mb-2" />
              )
            }
            headline={
              filterActive
                ? `No ${categoryNoun(selectedCategory, "one")} matches that filter`
                : selectedCategory === "Tools"
                  ? ""
                  : `No ${categoryNoun(selectedCategory)} in the global store`
            }
            sub={filterActive || selectedCategory === "Tools" ? undefined : "The scan finished without finding any."}
          >
            {selectedCategory === "Tools" && !filterActive ? (
              /* Appendix A.1/A.2 (§6.3 states 1 and 2), normative. Both are
                 Tools' own reading of "nothing configured" — A.1 when the
                 engines Hanger found are real but declared no server, A.2
                 when there is no engine to have declared one. Neither is the
                 generic per-category line above: both name what was checked
                 (§A.0), never assert on a count computed here. */
              enginesDetected ? (
                <McpZeroServersEmptyState engineNames={engineNames} coverage={mcpCoverage} locations={knownEngineLocations} />
              ) : (
                <McpNoEnginesEmptyState registryEngineNames={knownEngineNames} locations={knownEngineLocations} />
              )
            ) : null}
          </EmptyState>
        )
      ) : selectedCategory === null && isAllEmpty && filterActive ? (
        /* The All tab's own filter-empty state. Reached only past every
           whole-store branch above, so a fresh or mid-scan store never lands
           here — this fires strictly for "a query that matched nothing",
           never for "nothing scanned yet" (Karthik's ruling: search-results
           copy must never assert during an initial or pending state). A scan
           in flight still outranks it, same as categoryPending above. */
        allPending ? (
          <EmptyState
            testId="scan-pending"
            icon={<Disc3Icon active size={40} className="text-ink-3 mb-2" />}
            headline="Scanning your machine"
            sub="Assets in the global store show up here once the scan finishes."
          />
        ) : (
          <EmptyState
            icon={<SearchIcon size={40} className="text-ink-3 mb-2" />}
            headline="No assets match that filter"
          />
        )
      ) : (
        <>
          {/* The list lives on its own plane */}
          {/* Table background dropped by Karthik's ruling (2026-08-15):
              flat on the page, edge drawn by the --line border alone. */}
          <div
            data-testid="asset-list-scroll"
            className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] border border-line rounded-tl-plane rounded-tr-plane pb-1.5"
          >
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>Agents · {sortedAgents.length}</h3>
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
                inline header is what actually sits above these rows.

                Sticky for the same reason `AssetHeaderRow` above is (§6.3
                state 8, 50+ servers): with more rows than fit one screen,
                nothing else on screen still names "Registered in" / "Tools"
                once this header scrolls out of view. `top-0` + `z-[2]` +
                `bg-page` mirrors `AssetHeaderRow`'s own sticky treatment
                exactly — in a mixed view where both are present, a later
                sticky element at the same offset naturally displaces the
                earlier one as its own scroll position reaches the top, the
                standard stacked-sticky-header behaviour, so this never
                collides with `AssetHeaderRow` above it. */}
            {showTools && hasToolsContent && (
              <>
                <div
                  data-testid="section-header-tools"
                  className={`sticky top-0 z-[2] bg-page flex items-center gap-3 select-none px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}
                >
                  {/* The Display control (§5.6) lives here, not in the facet
                      row above: grouping and sort only ever affect these
                      rows, so it's inert everywhere else that row appears. */}
                  <ViewControl
                    grouping={serverGrouping}
                    sort={serverSort}
                    onGroupingChange={handleServerGroupingChange}
                    onSortChange={handleServerSortChange}
                  />
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
                  {/* Appendix A.3/A.4 (§6.3 states 5-7) — content rows next to
                      the server list, never a DisclosureBanner. Rendered from
                      whatever `mcpCoverage.problems` last carried, with no
                      gate on `loading`: the same "never clear mid-rescan, only
                      replace on scan://complete" rule the server rows above
                      already follow. */}
                  {configProblemRows.map((p, idx) => (
                    <McpConfigProblemRow key={`config-problem-${p.kind}-${p.path}-${p.line ?? idx}`} problem={p} />
                  ))}
                </div>
              </>
            )}

            {/* Rules Group */}
            {showRules && sortedRules.length > 0 && (
              <>
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
      <div className="h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex text-small text-ink-3">
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
