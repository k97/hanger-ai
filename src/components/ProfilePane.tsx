import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import {
  ExclamationCircleIcon,
  Disc3Icon,
  GaugeIcon,
  FolderClockIcon,
  PackageOpenIcon,
  FolderXIcon,
  SearchIcon,
  InboxIcon,
  ZapOffIcon,
  PlugZapIcon,
} from "./icons";
import CategoryFilterCards, { CategoryType, TAB_LABELS } from "./CategoryFilterCards";
import AssetRow, { AssetItem, AssetAnnotationView, cardChipClass, getSingularType } from "./AssetRow";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import ViewControl, { ServerGrouping, ServerSort } from "./ViewControl";
import { Inventory, CategoryCounts } from "../App";
import { filterProfileAssets } from "../utils/filterPredicate";
import { dedupeRegistrations } from "../utils/mcpRegistration";
import { sortAssetItems } from "../utils/sortUtils";
import { registrationKey } from "../utils/mcpRegistration";
import { groupProcesses, type ProcessMatch } from "../utils/mcpServerView";
import { ancestorReachNote, cardSecondLine, mergeReach, sortServerRows, transportChipLabel, type McpServerRow } from "../utils/serverRows";
import { sumGlobalAssets, categoryCountKey } from "../utils/globalAssetCount";
import { groupLabelClass } from "./typeRoles";
import SummaryStrip, { type EngineStripFigures, type StripReview } from "./SummaryStrip";
import EngineChipRow from "./EngineChipRow";
import OverviewCard from "./OverviewCard";
import OverviewPopover from "./OverviewPopover";
import Tooltip from "./Tooltip";
import { overviewButtonLabel } from "../utils/overviewCopy";
import { isTextEntryTarget } from "../utils/textEntry";
import NotLoadedGroup, { groupRowClass, notLoadedHead, type NotLoadedRow } from "./NotLoadedGroup";
import GroupTicks, { groupHead, type TickGroup } from "./GroupTicks";
import KeptSkillsGroup from "./KeptSkillsGroup";
import type { KeptSkills } from "../types/skillSwitch";
import { missTitle } from "./ReachCard";
import ReviewPillActions from "./ReviewPillActions";
import type { FindingLine } from "./FindingPopover";
import { miniBtnClass, miniSetClass } from "./miniButton";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import EmptyState from "./EmptyState";
import { annotationStateCounts, linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";
import { categoryNoun, joinNames, joinNamesTruncated } from "../utils/prose";
import type { EngineContext, EngineListEntry, KeptOff } from "../types/engineContext";
import type { EngineReachInfo, TileSwitch } from "./EngineReachTiles";
import { busyKeyOf, type McpSwitch } from "../hooks/useMcpSwitch";
import { switchRequestFor, tileTarget, type SwitchTarget } from "../utils/switchTargets";
import {
  costLabel,
  engineBandFigures,
  engineStripHeadline,
  MEASURE_ALL_CAPTION,
  runsOnVendorServersOnly,
  NOT_MEASURED_FIGURE,
  readOnlyLine,
} from "../utils/switchCopy";
import { issueSeverity, type ReviewIssue } from "../utils/reviewIssues";

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
  /** The tab, when App's route names one (`global:<tab>`). */
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
  /** The engines the chip row offers (App's `engineRows`, every engine
   *  `get_engine_contexts` lists): `null` until that reply lands. */
  engines?: EngineListEntry[] | null;
  /** The engine Global is seen by, an MCP host id (`EngineContext.engine_id`);
   *  `null` is All engines. App's `selected_engine` (Phase 1 of
   *  docs/plans/2026-11-25-ia-global-by-engine.md). */
  selectedEngine?: string | null;
  onSelectEngine?: (engineId: string | null) => void;
  /** MCP servers running with no config behind them, from `get_mcp_processes`.
   *  They have no registration, so they cannot be rows — a row implies
   *  something to open, and there is nothing. */
  unaccountedProcesses?: ProcessMatch[] | null;
  /** The grouped server list from `get_mcp_servers` — machine-global, fetched
   *  once in App.tsx. `null` before the first fetch resolves; the Tools
   *  section falls back to per-registration rows until it does, so a scan
   *  never flashes an empty list waiting on a second IPC round trip. */
  mcpServers?: McpServerRow[] | null;
  /** The global store's own review issues — what the Needs review pill lists
   *  on every tab but MCP servers. Already narrowed to the selected category
   *  by App, so the pill's count follows the tab. */
  issues?: ReviewIssue[];
  onReview?: (issue: ReviewIssue | null) => void;
  serverGrouping?: ServerGrouping;
  serverSort?: ServerSort;
  onServerGroupingChange?: (grouping: ServerGrouping) => void;
  onServerSortChange?: (sort: ServerSort) => void;
  /** The servers Hanger is keeping while they are switched off for an engine
   *  that switches by removing them (`get_kept_off_servers`, docs/ipc.md
   *  entry 19). No config file declares them, so they are no row of the list
   *  above and in none of `get_asset_counts`' figures; they show as their
   *  own group beside it. */
  keptOff?: KeptOff | null;
  /** A kept server's row opens it in the inspector, by its `stash:` key (T4
   *  of docs/plans/2026-11-25-ia-engines-into-global.md). */
  onOpenKeptOff?: (key: string) => void;
  /** The kept server the inspector is showing, whose row reads as selected. */
  selectedKeptKey?: string | null;
  /** The skills Hanger is keeping while they are switched off
   *  (`get_kept_skills`, docs/ipc.md entry 24). Out of the store, they are
   *  no row of the Skills group and in none of `get_asset_counts`' figures;
   *  they show as their own group after it, with the backend's `count`. */
  keptSkills?: KeptSkills | null;
  /** A kept skill's row opens it in the inspector, by its `kept-skill:` key. */
  onOpenKeptSkill?: (key: string) => void;
  /** The kept skill the inspector is showing, whose row reads as selected. */
  selectedKeptSkillKey?: string | null;
  /** Each listed engine's context, from App's one copy
   *  (`get_engine_contexts`, read once per scan). With
   *  `switcher`, it makes the MCP servers rows' engine tiles switches (T2 of
   *  docs/plans/2026-11-25-ia-engines-into-global.md). `null` before the
   *  replies land: every tile stays display only. The picked engine's is
   *  what its MCP rows are filtered by. */
  engineContexts?: EngineContext[] | null;
  /** App's one switch state (`useMcpSwitch`). */
  switcher?: McpSwitch;
  /** A tile switch's reply context, for App to take in place of its copy. */
  onEngineContext?: (ctx: EngineContext) => void;
  /** Where App lets this pane draw the overview card (the amendment to
   *  docs/plans/2026-11-26-overview-card.md: portals, not a lifted hook).
   *  `cap` is an empty slot in the content cap's trailing group, on Global
   *  only: the card's button goes there and its popover hangs from it.
   *  `inspector` is the inspector's empty state while the card is pinned
   *  (Flyout's `emptyState`): pinned, the card is drawn there. With no
   *  slots, as standalone, the card is drawn nowhere and the strip below is
   *  the only summary. */
  overviewSlots?: { cap: HTMLElement | null; inspector: HTMLElement | null };
  /** The content cap's button class, App's `tbBtnClass`, passed in rather
   *  than copied: `tbbtn-duplicate.test.ts` allows two declarations, not
   *  three. */
  overviewButtonClass?: string;
  /** Whether the card is pinned into the inspector (App's `overview_pinned`).
   *  Pinned, the cap carries no button. */
  overviewPinned?: boolean;
  onToggleOverviewPin?: () => void;
}

/** A kept server's row: the card row's first line, then which engine it is
 *  off for (`groupRowClass`, NotLoadedGroup.tsx, shared with that group). */
const keptRowClass = groupRowClass;

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
  issues = [],
  onReview,
  serverGrouping: propServerGrouping,
  serverSort: propServerSort,
  onServerGroupingChange,
  onServerSortChange,
  keptOff = null,
  onOpenKeptOff,
  selectedKeptKey = null,
  keptSkills = null,
  onOpenKeptSkill,
  selectedKeptSkillKey = null,
  engines = null,
  selectedEngine = null,
  onSelectEngine,
  engineContexts = null,
  switcher,
  onEngineContext,
  overviewSlots,
  overviewButtonClass = "",
  overviewPinned = false,
  onToggleOverviewPin,
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
  const listRef = useRef<HTMLDivElement>(null);
  // The engine Measure all is running for, if any.
  const [measuringFor, setMeasuringFor] = useState<string | null>(null);
  // The overview card's popover, from the content cap's button or ⌘E. It
  // exists only while App gives this pane a cap slot and the card is not
  // pinned, so leaving Global (which unmounts this pane) closes it.
  const [overviewOpen, setOverviewOpen] = useState(false);
  const overviewButtonRef = useRef<HTMLButtonElement>(null);
  const capSlot = overviewSlots?.cap ?? null;
  const inspectorSlot = overviewSlots?.inspector ?? null;
  const overviewAvailable = capSlot !== null && !overviewPinned;
  // ⌘E toggles the card. A keystroke into a text field (search, rename) is
  // typing, not a shortcut (Review Focus 3).
  useEffect(() => {
    if (!overviewAvailable) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "e") return;
      if (isTextEntryTarget(e.target)) return;
      e.preventDefault();
      setOverviewOpen((v) => !v);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [overviewAvailable]);

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

  const selectedCategory: CategoryType | null = propSelectedCategory ?? internalCategory;
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
  // Servers Hanger is keeping while they are switched off are something to
  // draw too: the "Switched off" group below the MCP servers. A boolean from
  // the backend's own figure, never a count taken here.
  const keptAny = keptOff !== null && keptOff.count > 0;
  // So are kept skills: the Skills "Switched off" group. The same boolean.
  const keptSkillsAny = keptSkills !== null && keptSkills.count > 0;
  const nothingToShow =
    !keptAny &&
    !keptSkillsAny &&
    globalSkills.length === 0 &&
    globalTools.length === 0 &&
    globalRules.length === 0 &&
    globalSubagents.length === 0 &&
    (mcpServers == null || mcpServers.length === 0) &&
    configProblemRows.length === 0;
  const pendingState = nothingToShow && (loading || !hasScanned);
  // `storeEmpty` stays the backend's figure: kept servers are in no count, so
  // with only kept servers it reads empty. The plane must not say so while
  // the group has rows to show.
  const emptyState = storeEmpty && !keptAny && !keptSkillsAny && hasScanned && !loading;

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

  /* The engine lens (Phase 1 of docs/plans/2026-11-25-ia-global-by-engine.md).
     With an engine picked, the list keeps what that engine reaches. An MCP
     server by its registrations, as the T3 band's filter did: every server
     row with a registration among the engine context's item keys, and every
     kept server whose `stash:` key is one. Until that context lands, no
     server is shown under its name. Every other asset by the backend's own
     verdict, its `get_asset_annotations` reach for the engine (`reachFor`),
     matched exactly on the context's `engine_key`, so until that context
     lands no other asset is shown under the engine's name either. */
  const engine = selectedEngine !== null ? engines?.find((e) => e.engine_id === selectedEngine) ?? null : null;
  const contextFor = (engineId: string): EngineContext | null =>
    engineContexts?.find((c) => c.engine_id === engineId) ?? null;
  const filterContext = engine ? contextFor(engine.engine_id) : null;
  const filterKeys = engine ? new Set((filterContext?.items ?? []).map((i) => i.key)) : null;
  const inEngineFilter = (keys: readonly string[]) => filterKeys === null || keys.some((k) => filterKeys.has(k));
  const engineKey = filterContext?.engine_key ?? null;
  const reachFor = (annotation: AssetAnnotationView | null) =>
    engineKey !== null && annotation ? annotation.reach.find((r) => r.engine_key === engineKey) ?? null : null;

  // Whether anything is narrowing the rows — the category-empty copy says
  // "matches that filter" only when a filter is what emptied it. Text search
  // lives in the palette now (⌘K), not in the pane. A picked engine narrows
  // them too (`narrowed`), and an emptied tab says so rather than calling
  // the store empty.
  const filterActive = stateFilter !== null;
  const narrowed = filterActive || engine !== null;
  // The kept group, on MCP servers and All. A link-state filter hides it:
  // a kept server is in no file, so it has no link state to match. With an
  // engine picked it holds that engine's kept servers only. `.length > 0`
  // is a boolean, never a figure.
  const keptRows = (keptOff?.servers ?? []).filter((server) => inEngineFilter([server.key]));
  const keptShown = keptAny && !filterActive && keptRows.length > 0;
  // The Skills "Switched off" group, on Skills and All. A link-state filter
  // hides it, as it hides the servers' group: a kept skill has no link state.
  // A kept skill is off for every engine, so a picked engine keeps every row
  // and drops only the figure.
  const keptSkillsShown = keptSkillsAny && !filterActive;

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

  /* MCP mode, what is left of it: on MCP servers the review pill lists
     disagreeing servers instead of this store's issues. Its subtitle ("N
     tool descriptions across M engines") and caption went with the engine
     lens (docs/plans/2026-11-25-ia-global-by-engine.md): with All engines
     the strip is the link-state strip every tab has, and with one engine its
     engine mode, below.

     Gated on a grouped row existing to point the Review pill's filter at —
     a per-registration view has no `agreement` verdict to filter on — and on
     the engine list having landed, as it was on the retired engine summary. */
  const mcpMode = selectedCategory === "Tools" && engines !== null && useGroupedTools;

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
  const storeSubtitle =
    selectedCategory === null
      ? `assets in the global store · ${engineCount} ${engineCount === 1 ? "engine" : "engines"}`
      : `${categoryNoun(selectedCategory)} in the global store · ${engineCount} ${
          engineCount === 1 ? "engine" : "engines"
        }`;

  /* The strip's engine mode, on every tab while an engine is picked: that
     engine's budget, "≈ N tokens every session", split by kind. Phase 1
     measures MCP only, so the headline is the MCP figure and the other three
     say "Not measured", which the strip folds into one quiet line; nothing
     is added up here. Each segment opens
     its kind's tab and keeps the engine. Measure all asks this engine alone,
     through the command the band used (docs/ipc.md entry 18, which does not
     fail), and hands the reply to App. */
  const engineHeadline = engine ? engineStripHeadline(filterContext, engine.engine_name) : null;
  const measureEngine = async (engineId: string) => {
    setMeasuringFor(engineId);
    try {
      const reply = await invoke<EngineContext>("measure_engine_context", { engineId });
      if (reply) onEngineContext?.(reply);
    } catch {
      // The figures stay as they were.
    } finally {
      setMeasuringFor((prev) => (prev === engineId ? null : prev));
    }
  };
  const mcpSegment = engineBandFigures(filterContext);
  const engineFigures: EngineStripFigures | undefined = engine
    ? {
        segments: (["Tools", "Skills", "Rules", "Subagents"] as const).map((kind) =>
          kind === "Tools"
            ? {
                key: kind,
                label: TAB_LABELS[kind],
                value: mcpSegment.value ?? mcpSegment.word,
                measured: mcpSegment.value !== null,
                caption: mcpSegment.secondary,
                pressed: selectedCategory === kind,
                onSelect: () => setSelectedCategory(kind),
              }
            : {
                key: kind,
                label: TAB_LABELS[kind],
                value: NOT_MEASURED_FIGURE,
                measured: false,
                pressed: selectedCategory === kind,
                onSelect: () => setSelectedCategory(kind),
              }
        ),
        measuring: measuringFor === engine.engine_id,
        // Nothing to measure when every server runs on the vendor's own
        // (`runsOnVendorServersOnly`): the MCP segment says so, and Measure
        // all is not drawn.
        onMeasure: runsOnVendorServersOnly(filterContext)
          ? undefined
          : () => void measureEngine(engine.engine_id),
        measureCaption: MEASURE_ALL_CAPTION,
      }
    : undefined;

  /* The processes nothing on disk accounts for. They belong to every Global
     tab, not just MCP servers: the banner they replace was gated on
     `unaccounted.length > 0` alone, while `mcpMode` is four conditions — a
     null engine list would have hidden them on the correct tab. Built
     once and appended to whichever pill is showing (coordinator review,
     2026-08-28, finding 5).

     The popover IS their disclosure — there is no registration to open, so
     there is nothing to route to (the banner said the same, 2026-08-20). */
  const processLines: FindingLine[] = unaccountedGroups.map((g) => ({
    severity: "warning" as const,
    text: "Running with no config behind it.",
    detail: `${g.pids.length > 1 ? `${g.pids.length} processes · e.g. pid ${g.pids[0]}` : `pid ${g.pids[0]}`} · ${g.commandLine}${g.spawningHost ? ` · started by ${g.spawningHost}` : ""}`,
  }));

  /* The severity rule is `issueSeverity`'s, not a second one: a won't-parse
     asset is a danger in the inspector cap's chip, so it is a danger dot
     here too. Two surfaces reading the same issue must not paint it two
     colours (coordinator review, 2026-08-28, finding 2), and the rule is
     read rather than restated (final review, 2026-08-28, Important 1). */
  const issueLine = (i: ReviewIssue): FindingLine => ({
    severity: issueSeverity(i),
    text: i.problem,
    detail: i.name,
  });

  // The pill's lines on MCP servers: disagreeing servers first, then those
  // processes.
  const conflictingRows = mcpMode && mcpServers ? mcpServers.filter((row) => row.agreement === "Conflicting") : [];
  const reviewLines: FindingLine[] = [
    /* `?? ""` for the template, not for the case: `cardSecondLine` is
       `string | undefined`, and interpolating the undefined prints the word.
       It cannot arrive here — Conflicting means `distinct_specs > 1`
       (`agreement.rs:133`), which means two or more registrations, which is
       what `agreementLine` requires to return a sentence
       (`serverRows.ts:43`) — so this is the template hole closed, not a
       state being handled. */
    ...conflictingRows.map((row) => ({ severity: "danger" as const, text: `${row.name}: ${cardSecondLine(row) ?? ""}` })),
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
  const assetReview: StripReview | undefined = !mcpMode
    ? {
        count: assetReviewLineCount,
        lines: assetReviewLines,
        actions: (
          <ReviewPillActions
            issues={issues}
            stateFilter={stateFilter}
            onStateFilterChange={onStateFilterChange}
            onReview={onReview}
          />
        ),
      }
    : undefined;

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

  // With an engine picked, a skill, rule or subagent row shows when the
  // backend says the engine reaches it, and goes to "Not loaded by" when it
  // says it does not. One with no verdict for the engine is in neither.
  const reachesEngine = (item: AssetItem) => engine === null || reachFor(annotationFor(item))?.reached === true;
  const missedByEngine = (item: AssetItem) => engine !== null && reachFor(annotationFor(item))?.reached === false;

  // Map and sort category items
  const allSkillRows: AssetItem[] = sortAssetItems(
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
  const sortedSkills = allSkillRows.filter(reachesEngine);

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
      // A single registration has no `McpServerRow` to build an agreement
      // sentence or an override note from, so this row's second line — if
      // it has one at all — is purely the ancestor-reach clause, read
      // straight off this registration's own backend annotation (Task 1,
      // 2026-08-29). `annotationByAssetPath` is keyed by the same
      // `registrationKey(t)` this row's `id` above already uses.
      agreementLine: ancestorReachNote(annotationByAssetPath.get(registrationKey(t))?.beyond),
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
  // Every registration a grouped row stands for, by the row's id: what its
  // engine tiles look an engine's item up by.
  const groupedRegistrationsById = new Map<string, string[]>();
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
        groupedRegistrationsById.set(id, row.registrations);
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
          // project-override note (when one applies) and the ancestor-reach
          // note (Task 1, 2026-08-29) both ride on the same line as the
          // agreement sentence, per `cardSecondLine`'s own doc comment. The
          // `beyond` passed here is `groupedAnnotationById`'s own entry, set
          // two lines up — always `null` today, because the grouped view's
          // merged annotation is built with `beyond: null` (this section's
          // rows come from `get_mcp_servers`/`discover_machine`, which does
          // not yet carry `SourceLocation::RepoAncestors`). Wiring it through
          // regardless means a grouped row starts showing the note the day
          // that gap closes, with no second edit here — known gap, not
          // fixed by this task.
          agreementLine: cardSecondLine(row, groupedAnnotationById.get(id)?.beyond),
          // Backend-owned, cache-only (`McpServerRow.tool_count`) — passed
          // straight through, never recomputed. `?? null` only normalises
          // `undefined` (a fixture built before this field existed) to the
          // same "nothing to show" the card already treats `null` as.
          toolCount: row.tool_count ?? null,
        };
      })
    : [];

  const allToolRows: AssetItem[] = useGroupedTools ? groupedTools : perRegistrationTools;

  // The Tools section's own annotation lookup: the merged view above for a
  // grouped row, the ordinary per-registration lookup otherwise. Every other
  // section keeps calling `annotationFor` directly.
  const toolAnnotationFor = (item: AssetItem): AssetAnnotationView | null =>
    useGroupedTools ? groupedAnnotationById.get(item.id ?? "") ?? null : annotationFor(item);

  /* The engine tiles as switches. A tile switches when its engine's context
     holds an item whose key is one of the row's registrations: every one a
     grouped row stands for, or a per-registration row's own. The request is
     the one every switch sends, and the reply's context goes back to App at
     once, so the tile redraws before the rescan the hook asks for. */
  const switchTile = async (target: SwitchTarget) => {
    if (!switcher) return;
    const next = await switcher.switchServer(switchRequestFor(target));
    if (next) onEngineContext?.(next);
  };
  const registrationKeysOf = (item: AssetItem): string[] =>
    useGroupedTools ? groupedRegistrationsById.get(item.id ?? "") ?? [] : item.id ? [item.id] : [];
  // The rows the picked engine's context registers (T3's filter); with All
  // engines, every row.
  /* With an engine picked, each row it keeps carries that engine's item: its
     cost in the Tools column (`costLabel`), and, for one Hanger cannot
     switch, the read-only reason as its second line. */
  const engineItemFor = (item: AssetItem) => {
    if (!filterContext) return null;
    const keys = new Set(registrationKeysOf(item));
    return filterContext.items.find((i) => keys.has(i.key)) ?? null;
  };
  const sortedTools = allToolRows
    .filter((item) => inEngineFilter(registrationKeysOf(item)))
    .map((item) => {
      const ctxItem = engine ? engineItemFor(item) : null;
      if (!ctxItem || !filterContext) return item;
      return {
        ...item,
        engineFigure: costLabel(ctxItem.estimated_tokens),
        agreementLine:
          ctxItem.read_only !== null
            ? readOnlyLine(ctxItem.read_only, {
                engine: filterContext.engine_name,
                server: ctxItem.name,
                file: ctxItem.config_path,
              })
            : item.agreementLine,
      };
    });
  const tileSwitchFor = (item: AssetItem): ((r: EngineReachInfo) => TileSwitch | null) | undefined => {
    if (!engineContexts || !switcher) return undefined;
    const keys = registrationKeysOf(item);
    return (r) => {
      const target = tileTarget(engineContexts, r.engine_key, keys);
      if (!target) return null;
      return {
        engineName: target.ctx.engine_name,
        serverName: target.item.name,
        file: target.item.config_path,
        state: target.item.state,
        readOnly: target.item.read_only,
        busy: switcher.busyKeys.has(busyKeyOf(target.ctx.engine_id, target.item.key)),
        onToggle: () => void switchTile(target),
      };
    };
  };

  const allRuleRows: AssetItem[] = sortAssetItems(
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
  const sortedRules = allRuleRows.filter(reachesEngine);

  const allSubagentRows: AssetItem[] = sortAssetItems(
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
  const sortedSubagents = allSubagentRows.filter(reachesEngine);

  /* "Not loaded by ‹engine›": every row the backend says the picked engine
     does not reach, in the list's own order and on the tab's own kinds, with
     the reason it gave. An MCP server is in it when the engine's context
     does not register it and its reach for the engine is a miss. Once, at
     the end of the list (NotLoadedGroup). */
  const notLoadedRow = (item: AssetItem, annotation: AssetAnnotationView | null, chip: string): NotLoadedRow[] => {
    const miss = reachFor(annotation);
    if (!miss || miss.reached) return [];
    const category = item.category as "Skills" | "Tools" | "Rules" | "Subagents";
    return [
      {
        key: `${category}:${item.id ?? item.path}`,
        name: item.name,
        chip,
        reason: missTitle(miss),
        selected: rowIsSelected(item),
        onOpen: () => onSelectAsset({ ...(item.id ? { id: item.id } : {}), name: item.name, category, path: item.path }),
      },
    ];
  };
  const kindChip = (item: AssetItem) => getSingularType(item.category);
  const notLoadedRows: NotLoadedRow[] = engine
    ? [
        ...(showSkills ? allSkillRows.filter(missedByEngine) : []).flatMap((i) => notLoadedRow(i, annotationFor(i), kindChip(i))),
        ...(showTools ? allToolRows.filter((i) => !inEngineFilter(registrationKeysOf(i))) : []).flatMap((i) =>
          notLoadedRow(i, toolAnnotationFor(i), i.transport ? transportChipLabel(i.transport) : kindChip(i))
        ),
        ...(showRules ? allRuleRows.filter(missedByEngine) : []).flatMap((i) => notLoadedRow(i, annotationFor(i), kindChip(i))),
        ...(showSubagents ? allSubagentRows.filter(missedByEngine) : []).flatMap((i) =>
          notLoadedRow(i, annotationFor(i), kindChip(i))
        ),
      ]
    : [];

  // configProblemRows (Appendix A.3/A.4's rows) is computed earlier, near
  // `nothingToShow`, which needs it before this point — see that comment.

  // Check if the selected category itself is empty. Tools is not empty just
  // because it has zero servers if it has a problem to report instead — "a
  // row, not an empty state" (A.3/A.4) means these rows must be reachable
  // even on a machine whose only MCP-relevant fact is a config Hanger could
  // not read or parse, with no working server anywhere to fall back on.
  //
  // With an engine picked, a row counts as shown when it reaches that engine
  // or sits in "Not loaded by" (`notLoadedAny`). Booleans throughout.
  const skillsAny = sortedSkills.length > 0;
  const toolsAny = engine ? sortedTools.length > 0 : filteredTools.length > 0;
  const rulesAny = sortedRules.length > 0;
  const subagentsAny = sortedSubagents.length > 0;
  const notLoadedAny = notLoadedRows.length > 0;
  const isCategoryEmpty =
    (selectedCategory === "Skills" && !skillsAny && !keptSkillsShown && !notLoadedAny) ||
    (selectedCategory === "Tools" && !toolsAny && configProblemRows.length === 0 && !keptShown && !notLoadedAny) ||
    (selectedCategory === "Rules" && !rulesAny && !notLoadedAny) ||
    (selectedCategory === "Agents" && agents.length === 0) ||
    (selectedCategory === "Subagents" && !subagentsAny && !notLoadedAny);

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
    !skillsAny &&
    !toolsAny &&
    configProblemRows.length === 0 &&
    !keptShown &&
    !keptSkillsShown &&
    !rulesAny &&
    !subagentsAny &&
    !notLoadedAny;

  // categoryPending's own shape, scoped to the All tab instead of one
  // category: a scan in flight is not yet an answer, so it must win over the
  // "no assets match" reading below even when the filtered rows are
  // currently zero.
  const allPending = isAllEmpty && loading;

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
  // The Skills "Switched off" group, drawn once in one of two places: after
  // the Skills rows, or, with an engine picked and no Skills rows on screen,
  // just before "Not loaded by". Booleans, never a figure.
  const keptSkillsLast = engine !== null && !skillsAny;
  // The Tools group has something to show whenever there is a server row OR
  // a problem row — a machine with one unreadable config and zero working
  // servers still has a Tools section worth rendering (A.3/A.4). So does one
  // whose only servers are switched off and kept: its header says the real
  // figure, and the "Switched off" group follows it.
  const hasToolsContent = sortedTools.length > 0 || configProblemRows.length > 0 || keptShown;
  // A tick's jump lands its header below whatever sticky header is stuck
  // over it. Above the MCP servers header that is AssetHeaderRow, `h-8`.
  // Below it, once drawn, it is the MCP servers header itself, which stays
  // stuck to the end of the list: `pt-[11px]`, the View trigger (`p-1`
  // round a 14px icon, 22px, taller than the 19.5px head line), `pb-[7px]`
  // and the 1px rule, 41px, so 44.
  const toolsHeaderDrawn = showTools && hasToolsContent;
  const afterToolsScrollMargin = toolsHeaderDrawn ? "scroll-mt-11" : "scroll-mt-8";
  const keptSkillsGroup =
    showSkills && keptSkillsShown && keptSkills ? (
      <KeptSkillsGroup
        kept={keptSkills}
        showFigure={!engine}
        selectedKey={selectedKeptSkillKey}
        onOpen={onOpenKeptSkill}
        scrollMarginClass={keptSkillsLast ? afterToolsScrollMargin : "scroll-mt-8"}
      />
    ) : null;
  const toolsOnlyView = showTools && hasToolsContent && !nonToolsSectionVisible;

  // Each group header's figure, read once so the header and its tick print
  // the same words: the backend's figure, none with an engine picked (the
  // headers' long-standing rule). Nothing here counts anything new.
  const skillsHeadFigure = engine ? null : assetCounts ? (assetCounts.byCategory.skill?.global ?? 0) : sortedSkills.length;
  const toolsHeadFigure = engine ? null : assetCounts ? (assetCounts.byCategory.tool?.global ?? 0) : sortedTools.length;
  const rulesHeadFigure = engine ? null : assetCounts ? (assetCounts.byCategory.rule?.global ?? 0) : sortedRules.length;
  const subagentsHeadFigure = engine ? null : assetCounts ? (assetCounts.byCategory.subagent?.global ?? 0) : sortedSubagents.length;
  // The groups the list draws, in the order it draws them, for GroupTicks.
  // Each condition is the one its group renders under below.
  const tickGroups: TickGroup[] = [];
  if (showSkills && sortedSkills.length > 0) tickGroups.push({ id: "group-skills", label: "Skills", count: skillsHeadFigure });
  const keptSkillsTick: TickGroup | null =
    keptSkillsGroup && keptSkills ? { id: "group-kept-skills", label: "Switched off", count: engine ? null : keptSkills.count } : null;
  if (!keptSkillsLast && keptSkillsTick) tickGroups.push(keptSkillsTick);
  if (showTools && hasToolsContent) tickGroups.push({ id: "group-tools", label: "MCP servers", count: toolsHeadFigure });
  if (showTools && keptShown && keptOff)
    tickGroups.push({ id: "group-kept-tools", label: "Switched off", count: engine ? null : keptOff.count });
  if (showRules && sortedRules.length > 0) tickGroups.push({ id: "group-rules", label: "Rules", count: rulesHeadFigure });
  if (showSubagents && sortedSubagents.length > 0)
    tickGroups.push({ id: "group-subagents", label: "Subagents", count: subagentsHeadFigure });
  if (keptSkillsLast && keptSkillsTick) tickGroups.push(keptSkillsTick);
  if (engine && notLoadedAny) tickGroups.push({ id: "group-not-loaded", label: notLoadedHead(engine.engine_name), count: null });

  // The overview card, drawn from the same figures as the strip above it
  // until Task 7: in the window bar's popover, or pinned in the inspector.
  const overviewCard = (
    <OverviewCard
      engines={engineContexts ?? []}
      selectedEngineId={engine?.engine_id ?? null}
      onSelectEngine={(id) => onSelectEngine?.(id)}
      storeTotal={globalAssetsTotal}
      linkLegend={{ counts: stripCounts, active: stateFilter, onFilter: (f) => onStateFilterChange?.(f) }}
      engineFigures={engineFigures ?? null}
      review={(mcpMode ? mcpReview : assetReview) ?? null}
      scan={{ scannedAt: scannedAt ? scannedAt.getTime() : null, scanning: loading, onRescan: () => onRescan?.() }}
      pinned={overviewPinned}
      // Pinning or unpinning closes the popover, so unpinning returns the
      // card to its button rather than reopening it.
      onTogglePin={() => {
        setOverviewOpen(false);
        onToggleOverviewPin?.();
      }}
    />
  );

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
        {/* The engine selector, on every tab (Q1 of the IA), straight under
            the kind tabs and above the strip: it decides whose figures the
            strip shows, so it is read first (Q2 of
            docs/plans/2026-11-25-decisions-round-2.md). Pending is not empty:
            before the first scan, and before the replies the list is built
            from, it draws nothing. */}
        {scannedAt !== null && engines && engines.length > 0 && (
          <EngineChipRow engines={engines} selected={engine?.engine_id ?? null} onSelect={(id) => onSelectEngine?.(id)} />
        )}
      </div>

      {/* Inventory summary strip */}
      <div className="mx-[18px] mb-3.5">
        <SummaryStrip
          total={engineHeadline ? engineHeadline.figure : stripTotal}
          subtitle={engineHeadline ? engineHeadline.subtitle : storeSubtitle}
          scannedAt={scannedAt}
          scanning={loading}
          counts={stripCounts}
          activeStateFilter={stateFilter}
          onFilterState={(f) => onStateFilterChange?.(f)}
          onRescan={onRescan}
          engine={engineFigures}
          review={mcpMode ? mcpReview : assetReview}
        />
      </div>

      {/* The overview card from the window bar (Task 5 of
          docs/plans/2026-11-26-overview-card.md, as amended). The button is
          portalled into App's cap slot and the popover onto document.body;
          the card reads the same figures the strip above does, until Task 7
          removes the strip. */}
      {overviewAvailable &&
        createPortal(
          <Tooltip label={overviewButtonLabel(overviewOpen)} placement="bottom">
            <button
              ref={overviewButtonRef}
              type="button"
              aria-label={overviewButtonLabel(overviewOpen)}
              aria-haspopup="dialog"
              aria-expanded={overviewOpen}
              onClick={() => setOverviewOpen((v) => !v)}
              className={overviewButtonClass}
            >
              <GaugeIcon size={16} aria-hidden="true" />
            </button>
          </Tooltip>,
          capSlot
        )}
      <OverviewPopover
        open={overviewAvailable && overviewOpen}
        onClose={() => setOverviewOpen(false)}
        anchorRef={overviewButtonRef}
      >
        {overviewCard}
      </OverviewPopover>
      {overviewPinned && inspectorSlot && createPortal(overviewCard, inspectorSlot)}

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
              narrowed ? (
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
              narrowed
                ? `No ${categoryNoun(selectedCategory, "one")} matches that filter`
                : selectedCategory === "Tools"
                  ? ""
                  : `No ${categoryNoun(selectedCategory)} in the global store`
            }
            sub={narrowed || selectedCategory === "Tools" ? undefined : "The scan finished without finding any."}
          >
            {selectedCategory === "Tools" && !narrowed ? (
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
      ) : selectedCategory === null && isAllEmpty && narrowed ? (
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
          {/* The ticks sit in the list's left inset, beside it, so the
              wrapper holds them and the list keeps its own classes. */}
          <div className="relative flex-1 min-h-0 flex flex-col">
          <GroupTicks groups={tickGroups} scrollRoot={listRef} />
          <div
            ref={listRef}
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
                      leadEngine={engineKey}
                      onClick={() => onSelectAsset({ name: item.name, category: "Agents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Skills Group */}
            {showSkills && sortedSkills.length > 0 && (
              <>
                <h3 id="group-skills" className={`scroll-mt-8 px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
                  {groupHead("Skills", skillsHeadFigure)}
                </h3>
                <div className="flex flex-col">
                  {sortedSkills.map((item, idx) => (
                    <AssetRow
                      key={`skill-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
                      leadEngine={engineKey}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Skills", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Switched off — skills Hanger is keeping while they are off for
                every engine. Out of the store, they are no row above and in
                no figure from get_asset_counts, so the Skills header keeps its
                own figure and this group carries the backend's `count`. A row
                opens the skill in the inspector, where it can be switched
                back on. With an engine picked that loads no skill there are
                no Skills rows to follow, so it moves down to sit just before
                "Not loaded by" (round 13 q4, 2026-11-26). */}
            {!keptSkillsLast && keptSkillsGroup}

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
                {/* The tick's target, not the header: a stuck sticky header
                    is already "in view", so scrolling it into view would
                    not move the list. This sits where the header would. */}
                <span id="group-tools" aria-hidden="true" className="block scroll-mt-8" />
                <div
                  data-testid="section-header-tools"
                  className={`sticky top-0 z-[2] bg-page flex items-center gap-3 select-none px-3.5 pt-[11px] pb-[7px] border-b border-line ${groupLabelClass}`}
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
                  <h3 className="flex-1 truncate">{groupHead("MCP servers", toolsHeadFigure)}</h3>
                  <span className="w-[100px] shrink-0 text-left">
                    Registered in
                  </span>
                  <span className="hidden @[580px]:block w-[150px] shrink-0 text-left">
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
                      tileSwitchFor={tileSwitchFor(item)}
                      leadEngine={engineKey}
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

            {/* Switched off — servers Hanger is keeping while they are off
                for an engine that switches by removing them. They are no row
                above and in no figure from get_asset_counts, so the MCP
                servers header keeps its own figure and this group carries
                the backend's `count`. A row opens the server in the
                inspector, where it can be switched back on. */}
            {showTools && keptShown && keptOff && (
              <>
                <h3 id="group-kept-tools" className={`scroll-mt-11 px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
                  {groupHead("Switched off", engine ? null : keptOff.count)}
                </h3>
                <div className="flex flex-col">
                  {keptRows.map((server) => {
                    const selected = server.key === selectedKeptKey;
                    return (
                    <button
                      key={server.key}
                      type="button"
                      onClick={() => onOpenKeptOff?.(server.key)}
                      data-selected={selected ? "true" : "false"}
                      className={`${keptRowClass} ${selected ? "bg-tint" : "hover:bg-plane-2"}`}
                    >
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className={`text-base-app truncate ${selected ? "text-tint-ink font-medium" : "text-ink-1"}`}>
                          {server.name}
                        </span>
                        <span className={cardChipClass}>{transportChipLabel(server.transport)}</span>
                      </span>
                      <span className="text-small text-ink-3 truncate">Off for {server.engine_name}</span>
                    </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Rules Group */}
            {showRules && sortedRules.length > 0 && (
              <>
                <h3 id="group-rules" className={`${afterToolsScrollMargin} px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
                  {groupHead("Rules", rulesHeadFigure)}
                </h3>
                <div className="flex flex-col">
                  {sortedRules.map((item, idx) => (
                    <AssetRow
                      key={`rule-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
                      leadEngine={engineKey}
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
                <h3 id="group-subagents" className={`${afterToolsScrollMargin} px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
                  {groupHead("Subagents", subagentsHeadFigure)}
                </h3>
                <div className="flex flex-col">
                  {sortedSubagents.map((item, idx) => (
                    <AssetRow
                      key={`subagent-${item.path}-${idx}`}
                      isSelected={rowIsSelected(item)}
                      showKindColumn={!selectedCategory}
                      item={item}
                      annotation={annotationFor(item)}
                      leadEngine={engineKey}
                      onLink={() => onLinkAsset(item)}
                      onClick={() => onSelectAsset({ name: item.name, category: "Subagents", path: item.path })}
                    />
                  ))}
                </div>
              </>
            )}

            {keptSkillsLast && keptSkillsGroup}

            {engine && notLoadedAny && <NotLoadedGroup engineName={engine.engine_name} rows={notLoadedRows} scrollMarginClass={afterToolsScrollMargin} />}
          </div>
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
          <ScanStatusIndicator scannedAt={scannedAt} />
        </span>
      </div>
    </div>
  );
}
