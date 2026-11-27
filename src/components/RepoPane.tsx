import { useState } from "react";
import { MessageScroller } from "@shadcn/react/message-scroller";
import {
  ExclamationTriangleIcon,
  FolderSyncIcon,
  FolderClockIcon,
  FolderPlusIcon,
  SearchIcon,
  InboxIcon,
  RotateCcwIcon,
  InformationCircleIcon,
} from "./icons";
import { open } from "@tauri-apps/plugin-dialog";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import ListRow, { type ListRowKind } from "./ListRow";
import GroupHead from "./GroupHead";
import GroupTicks, { type TickGroup } from "./GroupTicks";
import { repoRowDetail, repoRowFigure, type AssetItem } from "../utils/listRowCopy";
import { LIST_INSET, laneClass, laneIsWide } from "../utils/listLane";
import { usePaneWidth } from "../hooks/usePaneWidth";
import { Inventory, CategoryCounts } from "../App";
import { filterRepoAssets } from "../utils/filterPredicate";
import { sortAssetItems, type SortField, type SortDirection } from "../utils/sortUtils";
import { registrationKey } from "../utils/mcpRegistration";
import { formatEngineLabel } from "../utils/engineUtils";
import { transportChipLabel } from "../utils/serverRows";
import { type StripReview } from "./SummaryStrip";
import OverviewCard, { type EngineCountRow } from "./OverviewCard";
import OverviewHost from "./OverviewHost";
import { DOCKED_LANE_CLEARANCE, laneBoxClass, shouldDockOverview } from "../utils/overviewLayout";
import ReviewPillActions from "./ReviewPillActions";
import type { FindingLine } from "./FindingPopover";
import { miniBtnClass } from "./miniButton";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import EmptyState from "./EmptyState";
import { categoryNoun } from "../utils/prose";
import { linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";
import { categoryCountKey } from "../utils/globalAssetCount";
import { captionClass } from "./typeRoles";
import { issueSeverity, type ReviewIssue } from "../utils/reviewIssues";

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
  /** Every linked root, used to subtract candidates that are already linked. */
  linkedRepos?: string[];
  onPromoteCandidates?: (candidates: string[]) => void;
  /** This repository's own review issues — the Needs review pill's lines,
   *  alongside the scan warnings that used to have a banner of their own. */
  issues?: ReviewIssue[];
  onReview?: (issue: ReviewIssue | null) => void;
  /** Where App lets this pane put the overview card's button: an empty
   *  slot in the content cap, as on Global. With no slot, as standalone,
   *  the card is drawn nowhere. */
  overviewSlots?: { cap: HTMLElement | null };
  /** Whether the inspector column is open. The card never docks beside it
   *  (`shouldDockOverview`). */
  inspectorOpen?: boolean;
  /** App's `overview_hidden`, the one preference Global's card reads too. */
  overviewHidden?: boolean;
  onToggleOverviewHidden?: () => void;
  /** Test-only. The lane's padding is measured off the pane's width, which
   *  `happy-dom` never lays out, so this lets a test draw the narrow lane,
   *  as ProfilePane's own does. No production call site passes it. */
  forceLane?: "wide" | "narrow";
  /** Test-only, for the same reason: whether the overview card docks. No
   *  production call site passes it. */
  forceDock?: boolean;
}

export default function RepoPane({
  repoPath,
  inventory,
  assetCounts,
  selectedCategory: propSelectedCategory,
  onCategoryChange,
  selectedAsset,
  loading,
  stateFilter = null,
  onStateFilterChange,
  scannedAt = null,
  sortField: propSortField,
  sortDirection: propSortDirection,
  onRefresh,
  onSelectAsset,
  onLinkFromProfile,
  linkedRepos = [],
  onPromoteCandidates,
  issues = [],
  onReview,
  overviewSlots,
  inspectorOpen = false,
  overviewHidden = false,
  onToggleOverviewHidden,
  forceLane,
  forceDock,
}: RepoPaneProps) {
  const [internalCategory, setInternalCategory] = useState<CategoryType | null>(null);
  // Header-click sorting went with the column headers (Task 4 of
  // docs/plans/2026-11-26-global-list.md), as it did on Global in Task 1:
  // the rows keep App's sort, or name order standalone.
  const [internalSortField] = useState<SortField>("name");
  const [internalSortDirection] = useState<SortDirection>("asc");
  // The lane's padding, and whether the ticks show, from the pane's width
  // (one ResizeObserver, `usePaneWidth`), as on Global.
  const [paneEl, setPaneEl] = useState<HTMLDivElement | null>(null);
  const paneWidth = usePaneWidth(paneEl);
  // The overview card docks or opens from the cap, exactly as on Global
  // (ProfilePane), and the lane keeps 32px clear of a docked card.
  const capSlot = overviewSlots?.cap ?? null;
  const overviewDocked = forceDock ?? shouldDockOverview(paneWidth, inspectorOpen);
  const dockedCardShown = capSlot !== null && overviewDocked && !overviewHidden;
  const laneArea = dockedCardShown ? paneWidth - DOCKED_LANE_CLEARANCE : paneWidth - 2 * LIST_INSET;
  const measuredWide = laneIsWide(paneWidth, laneArea);
  const laneWide = forceLane ? forceLane === "wide" : measuredWide;
  const selectedCategory = propSelectedCategory ?? internalCategory;
  const sortField = propSortField ?? internalSortField;
  const sortDirection = propSortDirection ?? internalSortDirection;

  /* Same as ProfilePane: the category chip filters the table and says
     nothing about what is being inspected, so it no longer clears the
     selection. See the comment there. */
  const setSelectedCategory = (cat: CategoryType | null) => {
    setInternalCategory(cat);
    onCategoryChange?.(cat);
  };

  // The only remedy that works for a TCC-blocked folder: macOS infers
  // consent from an open-panel selection and writes com.apple.macl, which
  // the kernel (Sandbox.kext) honours independently of TCC.db — System
  // Settings cannot grant this, because Hanger never triggers the prompt
  // that would list it there. A cancelled picker resolves to null, so only
  // a genuine pick triggers the rescan.
  const handleChooseFolderAgain = async () => {
    try {
      const selected = await open({ directory: true, defaultPath: repoPath });
      if (selected && typeof selected === "string") {
        onRefresh();
      }
    } catch {
      // RepoPane has no error-surfacing prop for this flow; a rejected
      // picker just leaves the panel in place for the user to try again.
    }
  };

  const projectScan = inventory?.project_scans.find(
    (p) => p.path === repoPath
  );

  const rawWarnings = projectScan?.parse_warnings || [];
  // Contract with scanner.rs::denial_warning: "macOS blocked access to …"
  // is EPERM — the TCC panel applies. A Unix
  // "Permission denied" (EACCES) is a chmod problem and stays in the plain
  // warnings list, where its own text is the advice. `startsWith`, not
  // `includes`: a machine-scope denial deliberately leads with an engine
  // name (e.g. "<engine> may be installed — macOS blocked access to …")
  // precisely so it cannot hijack a panel that renders this repo's own
  // project path.
  const tccWarnings = rawWarnings.filter((w) => w.startsWith("macOS blocked access to"));
  const nonTccWarnings = rawWarnings.filter((w) => !w.startsWith("macOS blocked access to"));

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

  // The card's store section: backend-owned total, frontend-derived state
  // split. A selected category narrows both to that category's own figures
  // rather than the repo's whole total — `categoryCountKey` is the same
  // category-to-field map ProfilePane uses.
  const repoFolderName = repoPath.split("/").pop() || repoPath;
  const kindKey = selectedCategory ? categoryCountKey(selectedCategory) : null;
  const stripTotal =
    selectedCategory === null || kindKey === null
      ? assetCounts?.total ?? 0
      : assetCounts?.byCategory[kindKey]?.total ?? 0;
  const stripCounts = linkStateCounts(inventory, { kind: "repo", root: repoPath }, selectedCategory);
  // On a kind tab the caption names the kind, "48 skills" (round 29 q4); on
  // All the card prints its own "N assets".
  const storeCaption =
    selectedCategory === null
      ? undefined
      : `${stripTotal.toLocaleString("en-US")} ${categoryNoun(selectedCategory, stripTotal === 1 ? "one" : "many")}`;

  /* The card's engine rows — the sort the Engines line used: `none` last,
     then count descending.

     Empty on a category tab (Karthik's reviewer's ruling, final review
     2026-08-28; Review Focus 2 of docs/plans/2026-11-27-repo-view-parity.md). `assetCounts.engines` is flattened across every category:
     `count_assets` groups by (category, scope, engine) and then accumulates
     the engine map with no category key (`scanner.rs:63-64`), and there is
     no per-category engine figure to ask for. Left in place, the Skills tab
     read "12 skills in proj" directly over a band crediting one engine with
     every asset in the root — two populations, a few pixels apart, and
     proximity is what made it a claim. The subtitle's `· N engines` tail
     came off for the same reason.

     The nested-repo section stays, since it is about the root and true on
     every tab. Narrowing the rows properly needs a new backend field;
     hiding them is the honest, reversible half. */
  const engineRows: EngineCountRow[] =
    selectedCategory !== null
      ? []
      : Object.entries(assetCounts?.engines ?? {})
          .sort(([ak, ac], [bk, bc]) => (ak === "none" ? 1 : bk === "none" ? -1 : bc - ac))
          .map(([key, count]) => ({
            key,
            engineKey: key,
            engineName: formatEngineLabel(key),
            value: count,
          }));

  // The pill's lines: this repository's issues, then the warnings the scan
  // itself raised. Neither is an asset, and the popover is the disclosure
  // the two banners used to be.
  /* The severity rule is `issueSeverity`'s, not a second one: a won't-parse
     asset is a danger in the inspector cap's chip, so it is a danger dot
     here too. Two surfaces reading the same issue must not paint it two
     colours (coordinator review, 2026-08-28, finding 2), and the rule is
     read rather than restated (final review, 2026-08-28, Important 1). */
  // The tab on screen narrows the issues, as on Global; warnings are about
  // the root and stay on every tab.
  const tabIssues = issues.filter(
    (i) => selectedCategory === null || i.category === selectedCategory,
  );
  const reviewLines: FindingLine[] = [
    ...tabIssues.map((i) => ({
      severity: issueSeverity(i),
      text: i.problem,
      detail: i.name,
    })),
    ...nonTccWarnings.map((w) => ({
      severity: "warning" as const,
      text: "The scan skipped something it could not read.",
      detail: w,
    })),
  ];
  const reviewLineCount = reviewLines.length; // allowlisted: the lines this popover itself renders
  const review: StripReview = {
    count: reviewLineCount,
    lines: reviewLines,
    actions: (
      <ReviewPillActions
        issues={tabIssues}
        stateFilter={stateFilter}
        onStateFilterChange={onStateFilterChange}
        onReview={onReview}
      />
    ),
  };

  // Nested repositories are the card's own section above its actions
  // (round 29, layout A), rather than a banner.
  // Hoisted rather than inlined so the figure that reaches the screen stays
  // visible to `no-frontend-counting`'s detector, which reads a line for a
  // count-named assignment: as a bare `unlinkedCandidates.length` inside the
  // plural fork it matched nothing, and an allowlist entry for it would have
  // gone stale on the spot.
  const nestedCount = unlinkedCandidates.length; // allowlisted: nested repository paths, not assets
  // Laid out as G1's option A drew it: the line and its paths beside the
  // icon, the paths scrolling inside the card past 120px (no fold, round 28
  // q6), and Promote… on a foot of its own.
  const nestedFoot = nestedCount > 0 && (
    <>
      <div className="flex gap-2.5 px-2.5 pt-1">
        <InformationCircleIcon size={14} className="shrink-0 text-ink-3" />
        <span className="flex flex-col gap-px min-w-0">
          <span className="text-small text-ink-2">
            {nestedCount === 1
              ? `1 nested repo is counted in ${repoFolderName}`
              : `${nestedCount} nested repos are counted in ${repoFolderName}`}
          </span>
          {/* One line per path, as the banner had them. Joined into a single
              `truncate` span, every path after the first was clipped off the
              end of one line on any root with more than one nested repository
              (final review, 2026-08-28, Minor 8). `break-all` because a path
              has no spaces to wrap at. */}
          <span className="flex flex-col max-h-[120px] overflow-y-auto">
            {unlinkedCandidates.map((path) => (
              <span key={path} className="text-micro font-mono text-ink-3 break-all">
                {path}
              </span>
            ))}
          </span>
          {depthCapped && (
            <span className={`${captionClass} mt-1`}>
              This is a broad folder, so the search stopped at 6 levels — repositories deeper than
              that are not listed.
            </span>
          )}
        </span>
      </div>
      {onPromoteCandidates && (
        <div className="flex justify-end px-2.5 pt-2">
          <button type="button" onClick={() => onPromoteCandidates(unlinkedCandidates)} className={miniBtnClass}>
            Promote…
          </button>
        </div>
      )}
    </>
  );

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
      origin: s.origin,
      origin_blocked: s.origin_blocked,
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
  //
  // `loading` matters just as much as `hasScanned`: the repo's own state
  // (inventory, assetCounts) only changes on scan://complete, so a RE-scan
  // of a repository that was already empty leaves `storeEmpty` and
  // `hasScanned` both true for the whole rescan — without checking
  // `loading` too, the plane kept asserting "nothing here" while a fresh
  // answer was on its way. Ruled 2026-08-18.
  const hasScanned = scannedAt !== null;

  // T4, 2026-08-25 (Karthik hit this live, twice, in ProfilePane and here).
  // `storeEmpty` reads `assetCounts` first, and the backend serves counts
  // instantly from SQLite while `inventory` still waits on scan://complete —
  // so a repository row with counts persisted from an earlier scan was
  // never "empty" by that measure, `isRepoPending` never fired, and the
  // table branch rendered `AssetHeaderRow` over an `inventory` still `null`.
  // `nothingToShow` is the question `storeEmpty` skipped: is there anything
  // to actually draw, over the same four unscoped arrays `storeEmpty`'s own
  // fallback already reads (`unscoped`, above). This pane has no
  // `mcpServers`-style second fetch and no config-problem rows the way
  // ProfilePane does — Tools here stays per-registration, sourced from
  // `inventory` alone (see the Tools section's own comment below) — so
  // those four are everything a row in this pane's list can come from.
  // `unscoped.agents` is deliberately left out: RepoPane renders no Agents
  // section at all (no fifth collection — see `isAllEmpty`'s own comment
  // below), so an agents-only repository has no row here for the plane to
  // cover. `storeEmpty` itself is untouched: `isRepoEmpty` below still keys
  // on it exactly as ruled 2026-08-16/08-18 — a negative claim still needs a
  // finished scan and real counts behind it.
  const nothingToShow =
    unscoped.skills.length === 0 &&
    unscoped.tools.length === 0 &&
    unscoped.rules.length === 0 &&
    unscoped.subagents.length === 0;
  const isRepoPending = nothingToShow && (loading || !hasScanned);
  const isRepoEmpty = storeEmpty && hasScanned && !loading;

  // Same "a scan in flight is not an absence" rule, scoped to one category.
  // Filtering to MCP servers in a repo that has skills elsewhere never
  // makes `storeEmpty` true, so `isRepoPending` above never fires for it —
  // this is the category branch's own pending state, needed for exactly
  // that case.
  const isCategoryPending = isCategoryEmpty && !!selectedCategory && loading;

  // The All tab's own reading of the same bug class isCategoryEmpty exists
  // to prevent, one level up: `isCategoryEmpty` is a disjunction over
  // `selectedCategory === "<literal>"`, so on All (`selectedCategory ===
  // null`) every arm is false and a non-matching filter fell through to the
  // table, rendering `AssetHeaderRow`'s column labels over zero rows. Same
  // four collections `isCategoryEmpty` checks per-category, checked
  // together — RepoPane never renders an Agents section at all, so there is
  // no fifth collection to add here. Gated on `filterActive` at the call
  // site below, not here, to mirror `isCategoryEmpty` itself staying a pure
  // "what's on screen" predicate.
  const isAllEmpty =
    selectedCategory === null &&
    filteredSkills.length === 0 &&
    filteredTools.length === 0 &&
    filteredRules.length === 0 &&
    filteredSubagents.length === 0;

  // isCategoryPending's own shape, scoped to the All tab instead of one
  // category: a scan in flight is not yet an answer, so it must win over the
  // "no assets match" reading below even when the filtered rows are
  // currently zero.
  const isAllPending = isAllEmpty && loading;

  // Visible rows post-filter for the foot line — a display subset, never the
  // asset total (which stays backend-owned).
  const visibleCount = sortedSkills.length + sortedTools.length + sortedRules.length + sortedSubagents.length;

  // Each group head's figure, read once so the head and its tick print the
  // same words: the backend's figure, or the rows on screen before it
  // answers, as these heads always read (known-debt.md: Global's group
  // heads share the fallback).
  const skillsHeadFigure = assetCounts ? (assetCounts.byCategory.skill?.total ?? 0) : sortedSkills.length;
  const toolsHeadFigure = assetCounts ? (assetCounts.byCategory.tool?.total ?? 0) : sortedTools.length;
  const rulesHeadFigure = assetCounts ? (assetCounts.byCategory.rule?.total ?? 0) : sortedRules.length;
  const subagentsHeadFigure = assetCounts ? (assetCounts.byCategory.subagent?.total ?? 0) : sortedSubagents.length;
  // The groups the list draws, in the order it draws them, for GroupTicks.
  // Each condition is the one its group renders under below.
  const tickGroups: TickGroup[] = [];
  if (showSkills && sortedSkills.length > 0) tickGroups.push({ id: "group-skills", label: "Skills", count: skillsHeadFigure });
  if (showTools && sortedTools.length > 0) tickGroups.push({ id: "group-tools", label: "MCP servers", count: toolsHeadFigure });
  if (showRules && sortedRules.length > 0) tickGroups.push({ id: "group-rules", label: "Rules", count: rulesHeadFigure });
  if (showSubagents && sortedSubagents.length > 0)
    tickGroups.push({ id: "group-subagents", label: "Subagents", count: subagentsHeadFigure });

  // One row of the list, drawn by Global's ListRow. A repository has no
  // backend annotation, so there are no engine marks; line 2 is the Engine
  // and State columns' words (`repoRowDetail`, `repoRowFigure`).
  const listRow = (item: AssetItem, kind: ListRowKind, key: string, onSelect: () => void) => {
    const figure = repoRowFigure(item);
    return (
      <ListRow
        key={key}
        kind={kind}
        name={item.name}
        chip={item.transport ? transportChipLabel(item.transport) : undefined}
        detail={repoRowDetail(item)}
        figure={figure.text}
        figureTone={figure.tone}
        reach={null}
        muted={item.parseStatus === "failed"}
        selected={Boolean(rowIsSelected(item))}
        onSelect={onSelect}
      />
    );
  };

  // The overview card, the repository's summary since Task 6 of
  // docs/plans/2026-11-27-repo-view-parity.md: its engines' asset counts,
  // the folder's own link state, the nested repositories, then Needs review
  // and Rescan. No engine to pick, so never an engine's budget. A figure
  // the backend has given is shown; only a zero before a finished scan is
  // withheld.
  const overviewCard = (
    <OverviewCard
      engines={[]}
      selectedEngineId={null}
      storeHead={repoFolderName}
      storeTotal={stripTotal}
      storeCaption={storeCaption}
      pending={!assetCounts || (stripTotal === 0 && (loading || !hasScanned))}
      engineCounts={engineRows}
      linkLegend={{ counts: stripCounts, active: stateFilter, onFilter: (f) => onStateFilterChange?.(f) }}
      engineFigures={null}
      review={review}
      scan={{ scannedAt: scannedAt ? scannedAt.getTime() : null, scanning: loading, onRescan: onRefresh }}
      notice={nestedFoot || undefined}
    />
  );

  return (
    <div ref={setPaneEl} className="relative flex-1 flex flex-col min-h-0 overflow-hidden font-sans">
      {/* Facet chips. No View control here (§5.6's "Rows" choice lives on
          ProfilePane only): `get_mcp_servers` is machine-global
          (`discover_machine`, not `discover_repo`), so there is no
          repo-scoped grouping for a control here to drive — this pane's
          Tools rows stay per-registration regardless, and a control that
          cannot regroup its own rows would be inert chrome, not a fix. In
          the list's lane box, as on Global, so a docked card keeps clear. */}
      <div className={laneBoxClass(dockedCardShown)}>
      <div className="px-[18px] pt-[18px] pb-3.5">
        {/* No `?? 0` here. The chip distinguishes "not counted yet"
            (undefined) from "empty" (0) so it can keep a chip through a scan
            and hide it only on a known zero. Collapsing undefined to 0 erased
            that distinction and would blank the whole filter row whenever
            assetCounts is absent. ProfilePane already passes these through. */}
        <div className={laneClass(laneWide)}>
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
      </div>

      <OverviewHost
        card={overviewCard}
        capSlot={capSlot}
        docked={overviewDocked}
        hidden={overviewHidden}
        onToggleHidden={onToggleOverviewHidden}
      />

      {/* Anything needing attention, above the list plane. The Engines line,
          the scan warnings and the nested repositories have all moved into
          the overview card: its engine rows, its Needs review row, and its
          nested-repository section. The panel takes the lane box's margin
          itself: a wrapper would void this block's 45% height cap. */}
      <div className="px-[18px] pb-3.5 flex flex-col gap-2.5 empty:hidden shrink-0 max-h-[45%] overflow-y-auto">
        {/* macOS Permission denied TCC Fix Panel */}
        {tccWarnings.length > 0 && (
          <div className={`flex flex-col gap-3 p-3.5 border border-line rounded-inner leading-relaxed animate-fade-in ${laneBoxClass(dockedCardShown)}`}>
            <div className="flex gap-2 text-state-danger">
              <ExclamationTriangleIcon className="shrink-0 mt-0.5" size={16} />
              <div className="flex flex-col gap-1 min-w-0">
                <span className="text-small font-medium font-sans">macOS Folder Scan Access Denied</span>
                <span className="text-micro font-mono break-all text-ink-2">{repoPath}</span>
              </div>
            </div>
            <p className="text-small text-ink-2 leading-relaxed">
              macOS is blocking Hanger from reading this folder. Choose it again to restore access: macOS counts picking a folder as permission to read it.
            </p>
            <div className="flex items-center gap-2">
              {/* Primary: picking the folder again is the remedy that actually
                  works — System Settings has no "+" to add Hanger manually. */}
              <button
                disabled={loading}
                onClick={handleChooseFolderAgain}
                className="self-start px-4 h-[30px] bg-fill text-on-fill font-medium text-small rounded-pill transition-transform duration-press ease-spring active:scale-[0.96] cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <span>Choose Folder Again</span>
              </button>
              {/* Secondary: still useful if access was restored another way. */}
              <button
                disabled={loading}
                onClick={onRefresh}
                className="self-start px-4 h-[30px] rounded-pill border border-line-2 hover:bg-plane-2 text-small font-medium text-ink-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <RotateCcwIcon size={13} active={loading} />
                <span>Retry Scan</span>
              </button>
            </div>
          </div>
        )}

      </div>

      {isRepoPending ? (
        /* Pending: no claim either way. Root-by-root progress already lives
           in the foot line's ScanStatusIndicator; "once the scan finishes" is
           literal (inventory lands on scan://complete, not per root). */
        <EmptyState
          className="mt-2.5"
          testId="scan-pending"
          icon={
            loading ? (
              <FolderSyncIcon active size={40} className="text-ink-3 mb-2" />
            ) : (
              <FolderClockIcon size={40} className="text-ink-3 mb-2" />
            )
          }
          headline={loading ? "Scanning your machine" : "Not scanned yet"}
          sub={
            loading
              ? `Assets in ${repoFolderName} show up here once the scan finishes.`
              : "Rescan when you're ready."
          }
        />
      ) : isRepoEmpty ? (
        /* Empty, after a scan. The two ways out are both named: link from
           the global store, or add files here and rescan. */
        <EmptyState
          className="mt-2.5"
          icon={<FolderPlusIcon size={40} className="text-ink-3 mb-2" />}
          headline={`Nothing in ${repoFolderName} yet`}
          sub="Hanger found no skills, rules, MCP servers or subagents in this repository. Link one from the global store, or add files here and rescan."
          action={
            // "Global", not "Profile": the crumb and the sidebar call it
            // Global (Karthik's ruling on the naming). `mt-4` here (rather
            // than `mb-4` on the sub, as before extraction) reproduces the
            // same 16px gap: EmptyState's sub is the fixed classes shared by
            // all eight sites, with no per-site override, so the space above
            // the button moves onto the button instead of the line above it.
            <button
              onClick={() => onLinkFromProfile(repoPath)}
              className="mt-4 px-4 h-[30px] bg-fill text-on-fill text-small font-medium rounded-pill cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]"
            >
              Link an asset from Global
            </button>
          }
        />
      ) : isCategoryEmpty && selectedCategory ? (
        /* Category-specific empty state. Three reasons share it, told apart
           by the copy: a scan running right now is not yet an answer (this
           category's own pending state — `isRepoPending` above never fires
           here, since another category can easily keep `storeEmpty`
           false); a filter that hides every row is not the same as a
           category with nothing in it; and a category genuinely empty
           after a finished scan is a real finding. */
        isCategoryPending ? (
          <EmptyState
            className="mt-2.5"
            testId="scan-pending"
            icon={<FolderSyncIcon active size={40} className="text-ink-3 mb-2" />}
            headline="Scanning this repository"
            sub={`${categoryNoun(selectedCategory, "many")} show up here once the scan finishes.`}
          />
        ) : (
          <EmptyState
            className="mt-2.5"
            icon={
              filterActive ? (
                <SearchIcon size={40} className="text-ink-3 mb-2" />
              ) : (
                <InboxIcon size={40} className="text-ink-3 mb-2" />
              )
            }
            headline={
              filterActive
                ? `No ${categoryNoun(selectedCategory, "one")} matches that filter`
                : `No ${categoryNoun(selectedCategory)} in ${repoFolderName}`
            }
            sub={filterActive ? undefined : "The scan finished without finding any."}
          />
        )
      ) : selectedCategory === null && isAllEmpty && filterActive ? (
        /* The All tab's own filter-empty state. Reached only past every
           whole-store branch above, so a fresh or mid-scan store never lands
           here — this fires strictly for "a query that matched nothing",
           never for "nothing scanned yet" (Karthik's ruling: search-results
           copy must never assert during an initial or pending state). A scan
           in flight still outranks it, same as isCategoryPending above. */
        isAllPending ? (
          <EmptyState
            className="mt-2.5"
            testId="scan-pending"
            icon={<FolderSyncIcon active size={40} className="text-ink-3 mb-2" />}
            headline="Scanning this repository"
            sub={`Assets in ${repoFolderName} show up here once the scan finishes.`}
          />
        ) : (
          <EmptyState
            className="mt-2.5"
            icon={<SearchIcon size={40} className="text-ink-3 mb-2" />}
            headline="No assets match that filter"
          />
        )
      ) : (
        <>
          {/* The list, as Global draws it (Task 4 of
              docs/plans/2026-11-26-global-list.md; round 18 q4): flat on the
              page, in a centred lane, two-line rows under quiet group heads,
              and no column headers. Line 2 is the repository's own: the
              Engine and State columns' words. The ticks sit in the lane's
              left margin, so they go when the lane narrows. The lane box
              ends 32px short of a docked overview card, as on Global. */}
          <MessageScroller.Provider defaultScrollPosition="start" autoScroll={false}>
          <MessageScroller.Root className="relative flex-1 min-h-0 flex flex-col">
          {laneWide && <GroupTicks groups={tickGroups} />}
          <MessageScroller.Viewport
            role="region"
            aria-label={repoFolderName}
            data-testid="asset-list-scroll"
            className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] pb-1.5"
          >
           <div className={laneBoxClass(dockedCardShown)}>
           <MessageScroller.Content role="list" aria-live="off" data-testid="list-lane" className={laneClass(laneWide)}>
            {/* Skills Group */}
            {showSkills && sortedSkills.length > 0 && (
              <MessageScroller.Item
                key="group-skills"
                messageId="group-skills"
                role="listitem"
                className="mt-2.5 first:mt-0"
              >
              <>
                <GroupHead id="group-skills" label="Skills" figure={skillsHeadFigure} className="mt-2.5 first:mt-0" />
                <div className="flex flex-col gap-px">
                  {sortedSkills.map((item, idx) =>
                    listRow(item, "skill", `skill-${item.path}-${idx}`, () =>
                      onSelectAsset({ name: item.name, category: "Skills", path: item.path })
                    )
                  )}
                </div>
              </>
              </MessageScroller.Item>
            )}

            {/* MCP servers. A quiet head like the others: its column labels
                went with the table. */}
            {showTools && sortedTools.length > 0 && (
              <MessageScroller.Item
                key="group-tools"
                messageId="group-tools"
                role="listitem"
                className="mt-2.5 first:mt-0"
              >
              <>
                <GroupHead
                  id="group-tools"
                  testId="section-header-tools"
                  label="MCP servers"
                  figure={toolsHeadFigure}
                  className="mt-2.5 first:mt-0"
                />
                <div className="flex flex-col gap-px">
                  {sortedTools.map((item, idx) =>
                    listRow(item, "server", `tool-${item.path}-${idx}`, () =>
                      onSelectAsset({ id: item.id, name: item.name, category: "Tools", path: item.path })
                    )
                  )}
                </div>
              </>
              </MessageScroller.Item>
            )}

            {/* Rules Group */}
            {showRules && sortedRules.length > 0 && (
              <MessageScroller.Item
                key="group-rules"
                messageId="group-rules"
                role="listitem"
                className="mt-2.5 first:mt-0"
              >
              <>
                <GroupHead id="group-rules" label="Rules" figure={rulesHeadFigure} className="mt-2.5 first:mt-0" />
                <div className="flex flex-col gap-px">
                  {sortedRules.map((item, idx) =>
                    listRow(item, "rule", `rule-${item.path}-${idx}`, () =>
                      onSelectAsset({ name: item.name, category: "Rules", path: item.path })
                    )
                  )}
                </div>
              </>
              </MessageScroller.Item>
            )}

            {/* Subagents Group */}
            {showSubagents && sortedSubagents.length > 0 && (
              <MessageScroller.Item
                key="group-subagents"
                messageId="group-subagents"
                role="listitem"
                className="mt-2.5 first:mt-0"
              >
              <>
                <GroupHead
                  id="group-subagents"
                  label="Subagents"
                  figure={subagentsHeadFigure}
                  className="mt-2.5 first:mt-0"
                />
                <div className="flex flex-col gap-px">
                  {sortedSubagents.map((item, idx) =>
                    listRow(item, "subagent", `subagent-${item.path}-${idx}`, () =>
                      onSelectAsset({ name: item.name, category: "Subagents", path: item.path })
                    )
                  )}
                </div>
              </>
              </MessageScroller.Item>
            )}
           </MessageScroller.Content>
           </div>
          </MessageScroller.Viewport>
          </MessageScroller.Root>
          </MessageScroller.Provider>

        </>
      )}

      {/* Foot line. Unconditional: scan progress needs a home in the empty
          state too, which is precisely when a scan is running. */}
      <div className="h-[30px] shrink-0 px-[18px] flex items-center gap-4 font-flex text-small text-ink-3">
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
          <ScanStatusIndicator scannedAt={scannedAt} />
        </span>
      </div>
    </div>
  );
}
