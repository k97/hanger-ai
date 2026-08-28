import { useState } from "react";
import {
  ExclamationTriangleIcon,
  FolderSyncIcon,
  FolderClockIcon,
  FolderPlusIcon,
  SearchIcon,
  InboxIcon,
  RotateCcwIcon,
  LoaderCircleIcon,
  InformationCircleIcon,
} from "./icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import CategoryFilterCards, { CategoryType } from "./CategoryFilterCards";
import AssetRow, { AssetItem } from "./AssetRow";
import AssetHeaderRow, { SortField, SortDirection } from "./AssetHeaderRow";
import { Inventory, CategoryCounts } from "../App";
import { filterRepoAssets } from "../utils/filterPredicate";
import { sortAssetItems } from "../utils/sortUtils";
import { registrationKey } from "../utils/mcpRegistration";
import { formatEngineLabel } from "../utils/engineUtils";
import { groupLabelClass } from "./typeRoles";
import SummaryStrip, { type StripReview } from "./SummaryStrip";
import HeroBand, { type HeroBandRow } from "./HeroBand";
import type { FindingLine } from "./FindingPopover";
import { miniBtnClass, miniSetClass } from "./miniButton";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import EmptyState from "./EmptyState";
import { categoryNoun } from "../utils/prose";
import { linkStateCounts, matchesStateFilter, StateFilter } from "../utils/linkStateCounts";
import { categoryCountKey } from "../utils/globalAssetCount";
import { captionClass } from "./typeRoles";
import type { ReviewIssue } from "../utils/reviewIssues";

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
  /** The band under the hero, folded or open, and the toggle that persists
   *  it. Owned by App so the choice survives a rebuild of this pane. */
  enginesBandOpen?: boolean;
  onToggleEnginesBand?: () => void;
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
  onSortChange,
  onRefresh,
  onSelectAsset,
  onLinkFromProfile,
  linkedRepos = [],
  onPromoteCandidates,
  issues = [],
  onReview,
  enginesBandOpen = false,
  onToggleEnginesBand,
}: RepoPaneProps) {
  const [internalCategory, setInternalCategory] = useState<CategoryType | null>(null);
  const [internalSortField, setInternalSortField] = useState<SortField>("name");
  const [internalSortDirection, setInternalSortDirection] = useState<SortDirection>("asc");

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

  // Strip data: backend-owned total, frontend-derived state split. A
  // selected category narrows both to that category's own figures rather
  // than the repo's whole total — `categoryCountKey` is the same
  // category-to-field map ProfilePane's strip uses.
  const repoFolderName = repoPath.split("/").pop() || repoPath;
  const kindKey = selectedCategory ? categoryCountKey(selectedCategory) : null;
  const stripTotal =
    selectedCategory === null || kindKey === null
      ? assetCounts?.total ?? 0
      : assetCounts?.byCategory[kindKey]?.total ?? 0;
  const stripCounts = linkStateCounts(inventory, { kind: "repo", root: repoPath }, selectedCategory);
  // No engine tail: the per-engine breakdown is the hero's band now, and a
  // count of engine kinds beside a count of assets read as one figure.
  const stripSubtitle =
    selectedCategory === null
      ? `assets in ${repoFolderName}`
      : `${categoryNoun(selectedCategory)} in ${repoFolderName}`;

  // The band's rows — the sort the Engines line used: `none` last, then
  // count descending.
  const engineRows: HeroBandRow[] = Object.entries(assetCounts?.engines ?? {})
    .sort(([ak, ac], [bk, bc]) => (ak === "none" ? 1 : bk === "none" ? -1 : bc - ac))
    .map(([key, count]) => ({
      key,
      engineKey: key,
      engineName: formatEngineLabel(key),
      value: count,
      word: count === 1 ? "asset" : "assets",
    }));

  // The pill's lines: this repository's issues, then the warnings the scan
  // itself raised. Neither is an asset, and the popover is the disclosure
  // the two banners used to be.
  /* The severity rule is `reviewIssues.ts:440`'s, not a second one: a
     won't-parse asset is a danger in the inspector cap's chip, so it is a
     danger dot here too. Two surfaces reading the same issue must not paint
     it two colours (coordinator review, 2026-08-28, finding 2). */
  const reviewLines: FindingLine[] = [
    ...issues.map((i) => ({
      severity: i.kind === "broken" || i.kind === "parse" ? ("danger" as const) : ("warning" as const),
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
  /* `Show in list` applies `stateFilter = "needs-review"`, and `needsReview`
     (`linkStateCounts.ts:45-48`) is broken-or-drifted only — it cannot reach
     a duplicate, which is a relationship between assets rather than a state
     one asset is in. Withheld rather than widening the filter, because
     `linkStateCounts.ts:56-59` holds that `reviewIssues.ts` is the sole
     authority for how many need review (coordinator review, 2026-08-28,
     finding 1). `Needs review →` always renders, and always works. */
  const everyIssueFilterable = issues.length > 0 && !issues.some((i) => i.kind === "duplicate");
  const review: StripReview = {
    count: reviewLineCount,
    lines: reviewLines,
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
  };

  // Nested repositories are the band's last row rather than a banner: the
  // thing they qualify is the per-engine tally directly above them.
  // Hoisted rather than inlined so the figure that reaches the screen stays
  // visible to `no-frontend-counting`'s detector, which reads a line for a
  // count-named assignment: as a bare `unlinkedCandidates.length` inside the
  // plural fork it matched nothing, and an allowlist entry for it would have
  // gone stale on the spot.
  const nestedCount = unlinkedCandidates.length; // allowlisted: nested repository paths, not assets
  const nestedFoot = nestedCount > 0 && (
    <>
      <InformationCircleIcon size={14} className="shrink-0 text-ink-3" />
      <span className="flex flex-col min-w-0">
        <span className="text-small text-ink-2">
          {nestedCount === 1
            ? "1 nested repo counts towards this row"
            : `${nestedCount} nested repos count towards this row`}
        </span>
        <span className="text-micro font-mono text-ink-3 truncate">{unlinkedCandidates.join(" · ")}</span>
        {depthCapped && (
          <span className={captionClass}>
            This is a broad folder, so the search stopped at 6 levels — repositories deeper than
            that are not listed.
          </span>
        )}
      </span>
      {onPromoteCandidates && (
        <button
          type="button"
          onClick={() => onPromoteCandidates(unlinkedCandidates)}
          className={`${miniBtnClass} ml-auto`}
        >
          Promote…
        </button>
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

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-page font-sans">
      {/* Facet chips. No View control here (§5.6's "Rows" choice lives on
          ProfilePane only): `get_mcp_servers` is machine-global
          (`discover_machine`, not `discover_repo`), so there is no
          repo-scoped grouping for a control here to drive — this pane's
          Tools rows stay per-registration regardless, and a control that
          cannot regroup its own rows would be inert chrome, not a fix. */}
      <div className="px-[18px] pt-1.5 pb-3.5 flex items-center gap-3">
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
          onRescan={onRefresh}
          review={review}
        >
          {/* `|| nestedFoot`: on a root whose assets carry no engine at all
              the rows are empty, and the nested-repo notice would otherwise
              have nowhere left to render. */}
          {(engineRows.length > 0 || nestedFoot) && (
            <HeroBand
              label="By engine"
              open={enginesBandOpen}
              onToggle={() => onToggleEnginesBand?.()}
              rows={engineRows}
              foot={nestedFoot || undefined}
            />
          )}
        </SummaryStrip>
      </div>

      {/* Anything needing attention, above the list plane. The Engines line,
          the scan warnings and the nested repositories have all moved into
          the hero — the band's rows, the review pill's popover, and the
          band's foot row. */}
      <div className="px-[18px] pb-3.5 flex flex-col gap-2.5 empty:hidden shrink-0 max-h-[45%] overflow-y-auto">
        {/* macOS Permission denied TCC Fix Panel */}
        {tccWarnings.length > 0 && (
          <div className="flex flex-col gap-3 p-3.5 border border-line rounded-inner leading-relaxed animate-fade-in">
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
          {/* The list lives on its own plane */}
          {/* Table background dropped by Karthik's ruling (2026-08-15):
              flat on the page, edge drawn by the --line border alone. */}
          <div className="@container flex-1 min-h-0 overflow-y-auto mx-[18px] border border-line rounded-tl-plane rounded-tr-plane pb-1.5">
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
                  className={`flex items-center gap-3 select-none px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
                <h3 className={`px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>
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
          <div className="w-full max-w-sm bg-page rounded-plane border border-line p-[18px] relative flex flex-col gap-4 font-sans animate-drop">
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
                    <LoaderCircleIcon size={12} active />
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
          <ScanStatusIndicator />
        </span>
      </div>
    </div>
  );
}