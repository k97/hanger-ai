import { useState, useEffect, useLayoutEffect, useCallback, useRef, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { save, open } from "@tauri-apps/plugin-dialog";
import { info, warn, error } from "@tauri-apps/plugin-log";

function forwardConsole() {
  if (typeof window === "undefined") return;
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (...args) => {
    info(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" "));
    originalLog.apply(console, args);
  };

  console.warn = (...args) => {
    try {
      warn(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")).catch(() => {});
    } catch {}
    originalWarn.apply(console, args);
  };

  console.error = (...args) => {
    try {
      error(args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ")).catch(() => {});
    } catch {}
    originalError.apply(console, args);
  };
}

forwardConsole();

import {
  SunIcon,
  MoonIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
  GlobeAltIcon,
  ShieldCheckIcon,
  Disc3Icon,
  RotateCcwIcon,
  PanelLeftIcon,
  PanelRightIcon
} from "./components/icons";
import IconRail from "./components/IconRail";
import SearchPalette, { type SearchHit } from "./components/SearchPalette";
import Tooltip from "./components/Tooltip";
import Sidebar from "./components/Sidebar";
import ProfilePane, { ConfigProblemRow } from "./components/ProfilePane";
import RepoPane from "./components/RepoPane";
import DiscoveryPane from "./components/DiscoveryPane";
import DiscoverySidebar from "./components/DiscoverySidebar";
import { useFavourites } from "./hooks/useFavourites";
import type { DesignSectionId } from "./data/designSystemFixtures";

// The design-system page ships in dev builds only (Karthik's ruling,
// 2026-08-16) — and "ships" means the code, not just the rail entry. Behind
// a build-time constant these dynamic imports are dead in production, so
// Vite emits no chunk for the page, its sidebar, or its fixtures.
const DesignSystemPane = import.meta.env.DEV
  ? lazy(() => import("./components/DesignSystemPane"))
  : null;
const DesignSystemSidebar = import.meta.env.DEV
  ? lazy(() => import("./components/DesignSystemSidebar"))
  : null;
import NeedsReviewPane from "./components/NeedsReviewPane";
import ReviewSidebar from "./components/ReviewSidebar";
import ReviewInspector from "./components/ReviewInspector";
import LinkMapPane from "./components/LinkMapPane";
import ScanStamp from "./components/ScanStamp";
import type { LinkGraph } from "./utils/linkMapLayout";
import SidebarScanModal from "./components/SidebarScanModal";
import Flyout from "./components/Flyout";
import InspectorCap, { type InspectorCapAsset } from "./components/InspectorCap";
import type { AssetAnnotationView } from "./components/AssetRow";
import { SelectionOriginContext, type SelectionOrigin } from "./components/selectionOrigin";
import { SortField, SortDirection } from "./components/AssetHeaderRow";
import type { ServerGrouping, ServerSort } from "./components/ViewControl";
import { StateFilter } from "./utils/linkStateCounts";
import { registrationKey } from "./utils/mcpRegistration";
import { provenanceOf, type OriginWire } from "./utils/assetProvenance";
import { buildDetailAsset } from "./utils/detailAsset";
import {
  INSPECTOR_MIN_WIDTH,
  MAIN_MIN_WIDTH,
  resolveInspectorDrag,
  refitInspectorWidth,
} from "./utils/inspectorLayout";
import { unaccountedProcesses, type ProcessMatch } from "./utils/mcpServerView";
import type { McpServerRow } from "./utils/serverRows";
import type { McpEngineSummaryData } from "./types/mcpEngineSummary";
import { assetOpenTarget } from "./openTarget";
import { openInEditor } from "./openInEditor";
import EditorPicker, { type DetectedEditor } from "./components/EditorPicker";
import EditorSetting from "./components/EditorSetting";
import DisclosureBanner from "./components/DisclosureBanner";
import { captionClass } from "./components/typeRoles";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  deriveReviewIssues,
  issuesForAsset,
  matchesIssueFilter,
  type IssueKind,
  type ReviewIssue,
} from "./utils/reviewIssues";

// --- Types ---
export interface Scope {
  Global?: { agent: string };
  Project?: { agent: string; root: string };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  version: string;
  path: string;
  source_origin?: string;
  origin?: OriginWire;
  origin_blocked?: boolean;
  scope?: Scope;
  drifted?: boolean;
  is_symlink?: boolean;
  source_path?: string;
  parse_status?: string;
  parse_error?: string;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
}

export interface Agent {
  id: string;
  name: string;
  global_config_path?: string;
  project_footprints: string[];
}

export interface Tool {
  id: string;
  name: string;
  command: string;
  transport: string;
  config_path: string;
  scope: Scope;
  owning_agent: string;
  drifted?: boolean;
  is_symlink?: boolean;
  source_path?: string;
  parse_status?: string;
  parse_error?: string;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
}

export interface Rule {
  id: string;
  name: string;
  path: string;
  content: string;
  scope?: Scope;
  drifted?: boolean;
  is_symlink?: boolean;
  source_path?: string;
  parse_status?: string;
  parse_error?: string;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
}

export interface ProjectScan {
  path: string;
  layered: boolean;
  rule_chains: Record<string, string[]>;
  parse_warnings: string[];
  /** Directories inside this root that are repositories in their own right.
   *  Includes ones already linked — the consumer subtracts the linked set. */
  nested_repo_candidates?: string[];
}

export interface Subagent {
  id: string;
  name: string;
  description: string;
  path: string;
  declared_tools: string[];
  scope?: Scope;
  source_path?: string;
  parse_status?: string;
  parse_error?: string;
  link_state?: "linked" | "drifted" | "foreign" | "broken" | null;
}

export interface Inventory {
  skills: Skill[];
  agents: Agent[];
  tools: Tool[];
  rules: Rule[];
  subagents: Subagent[];
  project_scans: ProjectScan[];
}

export interface ScanProgress {
  scanId: string;
  dirs: number;
  files: number;
  current: string;
}

export interface CategoryCount {
  total: number;
  global: number;
  project: number;
}

export interface CategoryCounts {
  total: number;
  byCategory: {
    skill?: CategoryCount;
    rule?: CategoryCount;
    subagent?: CategoryCount;
    tool?: CategoryCount;
  };
  engines?: Record<string, number>;
}

type ThemePref = "light" | "dark" | "auto";

// A webview without media query support is treated as light rather than as a
// reason to crash on startup.
const prefersDark = (): boolean =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : false;

const THEME_OPTIONS: { value: ThemePref; label: string; Icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
  { value: "auto", label: "Auto", Icon: ComputerDesktopIcon },
];

/**
 * Discovery's "Favourites" facet only exists in the sidebar while there is
 * at least one favourite (symmetric appear/disappear rule). If the last
 * favourite is removed while that facet is still the active `discoveryKind`,
 * the sidebar row vanishes but nothing else moves the view off it — the
 * pane keeps rendering its empty Favourites state, blaming a filter the
 * user never set. This reports the facet `discoveryKind` should fall back
 * to; it stays a plain function (not a hook) so it can be unit-tested
 * without rendering App, which pulls in the full Tauri invoke/listen
 * surface (whole-branch review finding #1, 2026-08-16).
 */
export function reconciledDiscoveryKind(kind: string, favouritesCount: number): string {
  return kind === "Favourites" && favouritesCount === 0 ? "All" : kind;
}

/** The folder holding a file — what "Reveal in Finder" reveals. Moved here
 *  from AssetDetail.tsx, which no longer needs it: the cap owns Reveal now. */
function parentDirOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : path;
}

export default function App() {
  // Appearance is a three-way choice: pin light, pin dark, or follow the OS.
  // Auto is the default, so a fresh install matches the rest of the desktop.
  const [themePref, setThemePref] = useState<ThemePref>("auto");
  const [systemDark, setSystemDark] = useState<boolean>(prefersDark);
  const darkMode = themePref === "auto" ? systemDark : themePref === "dark";
  const [linkedDirectories, setLinkedDirectories] = useState<string[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [assetCounts, setAssetCounts] = useState<CategoryCounts | null>(null);
  const [detectedEngines, setDetectedEngines] = useState<{ id: string; name: string }[]>([]);
  // The engines Hanger looks FOR, unfiltered by what is installed. Only the
  // Global empty state uses it, to name them without restating the backend's
  // table in a string literal.
  const [knownEngines, setKnownEngines] = useState<{ id: string; name: string }[]>([]);
  // Appendix A.2's "Checked {n} locations" figure and its disclosure —
  // pure registry data (`get_known_engine_locations`), fetched once
  // alongside `knownEngines` rather than on every scan.
  const [knownEngineLocations, setKnownEngineLocations] = useState<{
    location_count: number;
    locations: string[];
  } | null>(null);
  // Appendix A.1's two counts and its file disclosure — a live filesystem
  // probe (`get_mcp_coverage`), so it refreshes alongside `mcpServers` on
  // every scan rather than once at mount.
  const [mcpCoverage, setMcpCoverage] = useState<{
    checked_file_count: number;
    checked_engine_count: number;
    checked_files: string[];
    /** Appendix A.3/A.4's rows (§6.3 states 5-7) — ProfilePane's Tools
     *  section renders these as content rows next to the server list. */
    problems: ConfigProblemRow[];
  } | null>(null);
  const [repoAssetCountsMap, setRepoAssetCountsMap] = useState<Record<string, CategoryCounts>>({});
  // The MCP server list: one row per server name, grouped and counted in
  // Rust (`get_mcp_servers`). Machine-global only — `discover_machine`, not
  // `discover_repo` — so RepoPane cannot regroup its own rows from this: its
  // Tools section stays per-registration regardless of `serverGrouping`,
  // and (since it never could) no longer takes this value as a prop at all
  // — removed along with its inert View control.
  const [mcpServers, setMcpServers] = useState<McpServerRow[] | null>(null);
  // `get_mcp_engine_summary`'s answer, refetched alongside `mcpServers` and
  // `mcpCoverage` on every scan (same reason as both: a fresh answer per
  // scan, not a cached one). ProfilePane's strip reads this for MCP mode —
  // Flyout.tsx fetches its own copy locally rather than reading this one,
  // the same division of labour `mcpCoverage`'s doc comment describes.
  const [mcpEngineSummary, setMcpEngineSummary] = useState<McpEngineSummaryData | null>(null);
  // The View control's own state — grouping and sort for the MCP section,
  // shared between both panes the way sortField/sortDirection already are.
  // "server" and "attention" are the signed-off defaults (2026-08-18).
  const [serverGrouping, setServerGrouping] = useState<ServerGrouping>("server");
  const [serverSort, setServerSort] = useState<ServerSort>("attention");
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Updates are owned entirely by the Rust side (src-tauri/src/updates.rs):
  // silent launch check, "Check for Updates…" menu item, periodic re-check.

  // Sidebar and Panel Navigation State
  const [selectedSidebarItem, setSelectedSidebarItem] = useState<string>("profile");
  // Which kind of action made the current selection — a plain row click, or
  // a search-palette pick — so AssetRow can land the two differently
  // (Karthik's ruling, 2026-08-29). landingNonce ticks on every palette pick,
  // including a re-pick of the same asset, so Flyout's tab-reset effect
  // fires even when selectionOrigin itself does not change value.
  const [selectionOrigin, setSelectionOrigin] = useState<SelectionOrigin>("click");
  const [landingNonce, setLandingNonce] = useState(0);
  // 216px is the prototype's --rail-src. A persisted preference still wins;
  // this is only what a machine that has never been resized starts at.
  const [sidebarWidth, setSidebarWidth] = useState<number>(216);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  // Candidates handed to the promote modal. Already discovered by the scan,
  // so opening it starts no walk.
  const [promoteCandidates, setPromoteCandidates] = useState<string[] | null>(null);

  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      invoke("set_preference", { key: "sidebar_collapsed", value: String(next) }).catch(() => {});
      return next;
    });
  };

  // Theme lives in the settings panel and persists like every other layout choice.
  // "auto" is written out rather than left absent, so choosing it after an
  // explicit Light or Dark still survives a restart.
  const applyTheme = (pref: ThemePref) => {
    setThemePref(pref);
    invoke("set_preference", { key: "theme", value: pref }).catch(() => {});
  };

  // Needs review is its own section: which kind of problem, which place,
  // and which issue the inspector is explaining.
  const [reviewKind, setReviewKind] = useState<IssueKind | null>(null);
  const [reviewPlace, setReviewPlace] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<ReviewIssue | null>(null);

  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  // The hero bands, one per pane. Folded by default: the hero's job is the
  // headline, and the per-host / per-engine breakdown is the second question.
  const [hostsBandOpen, setHostsBandOpen] = useState(false);
  const [enginesBandOpen, setEnginesBandOpen] = useState(false);
  // The floor, and the starting width. INSPECTOR_MIN_WIDTH in
  // utils/inspectorLayout.ts says why it is where it is.
  const [inspectorWidth, setInspectorWidth] = useState<number>(INSPECTOR_MIN_WIDTH);
  // A per-session "zoom", not a saved layout choice — deliberately not
  // persisted to preferences, and always reset when the inspector closes.
  const [inspectorExpanded, setInspectorExpanded] = useState<boolean>(false);
  // The screens the inspector column has a subject on. Named because it is
  // read twice: the <aside> renders behind it, and expanded state is released
  // when it goes false — the column owns the only Collapse control there is.
  const inspectorRenders =
    inspectorOpen &&
    selectedSidebarItem !== "discovery" &&
    selectedSidebarItem !== "linkmap" &&
    selectedSidebarItem !== "design" &&
    (selectedSidebarItem === "review" || inventory !== null);
  // Expanded puts <main> at display:none, and the Collapse control lives in
  // the inspector's own cap. Navigating to a screen the column does not
  // render would therefore leave the window blank but for the rail, with no
  // way back. Pre-existing — the Expand button could reach it too — but a
  // drag that snaps past the ceiling now finds it by accident, so the state
  // is released here instead. useLayoutEffect, not useEffect: after paint
  // would show the blank frame this exists to prevent.
  useLayoutEffect(() => {
    if (!inspectorRenders) setInspectorExpanded(false);
  }, [inspectorRenders]);
  // The inspector column itself — the cap's finding chip clamps its popover
  // against this so it never spills past the column's own edge.
  const asideRef = useRef<HTMLElement>(null);
  // The content column, measured for `room` below.
  const mainRef = useRef<HTMLElement>(null);
  // `room` is how wide the inspector may grow while main-content still keeps
  // its floor: the window, less the main column's left edge, less
  // MAIN_MIN_WIDTH. Both terms move — with the window, and with the rail
  // column, which swings 216px when the source list opens or Link map takes
  // it away — so it is measured rather than derived, and the effect below
  // owns it from the first commit. inspectorLayout.ts owns what it means.
  const [room, setRoom] = useState<number>(0);
  // <main> is display:none while the inspector is expanded, so its rect reads
  // all zeros there; the aside starts at exactly the main column's left edge
  // in that state, so it is the measurable one.
  const measureRoom = useCallback(() => {
    const column = inspectorExpanded ? asideRef.current : mainRef.current;
    const left = column?.getBoundingClientRect().left ?? 0;
    return window.innerWidth - left - MAIN_MIN_WIDTH;
  }, [inspectorExpanded]);
  // A ResizeObserver rather than a window `resize` listener: the column's own
  // box is what `room` is a function of, and it moves for reasons the window
  // never hears about — the rail's width transition when the source list is
  // toggled or Link map is entered, and anything ever inserted between the
  // rail and this column. Observing the box catches all of them, including
  // mid-transition, where a state-dep effect would read the pre-transition
  // width. happy-dom's `observe()` is a no-op that never fires, so nothing
  // here is testable in this repo; it is screenshot territory.
  //
  // `useLayoutEffect`, not `useEffect`: `room` starts at 0, and
  // `refitInspectorWidth` floors a room of 0 at INSPECTOR_MIN_WIDTH — so a
  // measure that runs after paint shows a 384px panel for one frame before
  // snapping to the user's remembered width, on every open and again on every
  // expand toggle. Measuring before paint is the whole point of the hook.
  useLayoutEffect(() => {
    const column = inspectorExpanded ? asideRef.current : mainRef.current;
    const remeasure = () => setRoom(measureRoom());
    remeasure();
    if (!column) return;
    const observer = new ResizeObserver(remeasure);
    observer.observe(column);
    return () => observer.disconnect();
  }, [inspectorExpanded, measureRoom]);
  const [searchOpen, setSearchOpen] = useState(false);
  // Discovery's category facet — owned here because DiscoverySidebar sets it
  // and DiscoveryPane filters by it (the chips moved into the second column).
  const [discoveryKind, setDiscoveryKind] = useState<string>("All");
  // Favourited Discovery listings — lifted here (not owned by DiscoveryPane
  // or DiscoverySidebar individually) so the sidebar's count and the pane's
  // hearts read the same state.
  const favourites = useFavourites();
  // If the last favourite is removed while "Favourites" is the active
  // facet, the sidebar section disappears (favouritesCount > 0 gate) but
  // discoveryKind would otherwise stay pointed at it, stranding the pane on
  // an empty view with no selected sidebar row (whole-branch review
  // finding #1, 2026-08-16).
  useEffect(() => {
    setDiscoveryKind((current) => reconciledDiscoveryKind(current, favourites.favourites.length));
  }, [favourites.favourites.length]);
  // The design-system page exists in dev builds only (Karthik's ruling,
  // 2026-08-16): the rail entry is not rendered otherwise, and a persisted
  // selection pointing at it falls back to Global on load.
  const designSystemAvailable = import.meta.env.DEV;
  const [designSection, setDesignSection] = useState<DesignSectionId>("colour");
  // Machine-wide state filter driven by the icon rail's Needs review button
  // and the summary strip's legend.
  const [stateFilter, setStateFilter] = useState<StateFilter>(null);
  // When the last completed scan landed — feeds the strip's scan stamp.
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);

  // Per-asset annotations (mechanism, reach, beyond-the-store) arrive
  // computed from the backend and are rendered verbatim (dispatch item 8).
  const [annotations, setAnnotations] = useState<AssetAnnotationView[] | null>(null);
  const refreshAnnotations = async () => {
    try {
      setAnnotations(await invoke<AssetAnnotationView[]>("get_asset_annotations"));
    } catch {
      setAnnotations(null);
    }
  };

  /* Which MCP servers are running, and which are running with no config
     behind them. Owned here because two surfaces need the same answer — the
     profile's disclosure and the inspector's per-registration state — and
     `get_mcp_processes` rescans to derive its registration keys, so fetching
     it in both would walk the filesystem twice.

     Deliberately lazy: nothing outside the Tools view uses it, and paying for
     a scan at startup for a panel most sessions never open is the wrong
     trade. Fetched once, on the first look at Tools. */
  const [mcpProcesses, setMcpProcesses] = useState<ProcessMatch[] | null>(null);
  /** One scan at a time. A panel open refreshes this, and clicking through
   *  sixteen servers must not stack sixteen rescans. */
  const mcpProcessesInFlight = useRef(false);
  /** The facet chip's category, which ProfilePane owns and reports back. */
  const [profileCategory, setProfileCategory] = useState<string | null>(null);
  /** The same, for RepoPane's own facet chip. Kept separate because the two
   *  panes are never shown together, but a repo view opened after a profile
   *  one must not inherit a stale "Tools" from the pane it replaced. */
  const [repoCategory, setRepoCategory] = useState<string | null>(null);

  // Link map: the graph arrives computed from the backend and is rendered
  // verbatim; the projects toggle is the only map state the shell owns —
  // selection lives inside the pane, whose detail card is the view's only
  // detail surface (the map has no inspector column).
  const [linkGraph, setLinkGraph] = useState<LinkGraph | null>(null);
  const [linkMapShowProjects, setLinkMapShowProjects] = useState<boolean>(false);
  // Signature of the link map's notice set as last read. Persisted so the
  // unread dot does not return every time the view is revisited.
  const [linkMapNoticesSeen, setLinkMapNoticesSeen] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    invoke<string>("get_preference", { key: "sort_field" })
      .then((val) => {
        if (val && ["name", "kind", "engine", "state"].includes(val)) {
          setSortField(val as SortField);
        }
      })
      .catch(() => {});

    invoke<string>("get_preference", { key: "sort_direction" })
      .then((val) => {
        if (val && ["asc", "desc"].includes(val)) {
          setSortDirection(val as SortDirection);
        }
      })
      .catch(() => {});

    invoke<string>("get_preference", { key: "mcp_server_grouping" })
      .then((val) => {
        if (val === "server" || val === "registration") {
          setServerGrouping(val);
        }
      })
      .catch(() => {});

    invoke<string>("get_preference", { key: "mcp_server_sort" })
      .then((val) => {
        if (val === "attention" || val === "name") {
          setServerSort(val);
        }
      })
      .catch(() => {});
  }, []);

  const handleSortChange = (field: SortField) => {
    let newDir: SortDirection = "asc";
    if (field === sortField) {
      newDir = sortDirection === "asc" ? "desc" : "asc";
    }
    setSortField(field);
    setSortDirection(newDir);
    invoke("set_preference", { key: "sort_field", value: field }).catch(() => {});
    invoke("set_preference", { key: "sort_direction", value: newDir }).catch(() => {});
  };

  const handleServerGroupingChange = (grouping: ServerGrouping) => {
    setServerGrouping(grouping);
    invoke("set_preference", { key: "mcp_server_grouping", value: grouping }).catch(() => {});
  };

  const handleServerSortChange = (sort: ServerSort) => {
    setServerSort(sort);
    invoke("set_preference", { key: "mcp_server_sort", value: sort }).catch(() => {});
  };

  const toggleInspector = () => {
    setInspectorOpen((prev) => {
      const next = !prev;
      invoke("set_preference", { key: "inspector_open", value: String(next) }).catch(() => {});
      if (!next) {
        setSelectedBubble(null);
        setInspectorExpanded(false);
      }
      return next;
    });
  };

  const toggleInspectorExpanded = () => setInspectorExpanded((prev) => !prev);

  const toggleHostsBand = () =>
    setHostsBandOpen((prev) => {
      const next = !prev;
      invoke("set_preference", { key: "hosts_band_open", value: String(next) }).catch(() => {});
      return next;
    });
  const toggleEnginesBand = () =>
    setEnginesBandOpen((prev) => {
      const next = !prev;
      invoke("set_preference", { key: "engines_band_open", value: String(next) }).catch(() => {});
      return next;
    });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Settings & maintenance Modal State
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  // Two-step destructive confirm for settings import: picker first, then an
  // inline confirm state — never a blocking dialog.
  const [pendingImportPath, setPendingImportPath] = useState<string | null>(null);

  // The asset the inspector should arrive on its link screen for. Distinct
  // from selectedAsset, which only says what is being inspected.
  const [linkingAsset, setLinkingAsset] = useState<any | null>(null);

  // "grouped" / "per_registration" are the Rust `Grouping` enum's
  // `#[serde(rename_all = "snake_case")]` names. Only `refreshGlobalCounts`
  // uses this — `fetchRepoCounts` deliberately does not; see the comment
  // there for why passing it at repo scope would be a bug, not a fix.
  const groupingParam = (): "grouped" | "per_registration" =>
    serverGrouping === "server" ? "grouped" : "per_registration";

  // Deliberately NOT grouping-aware. `get_mcp_servers` is machine-global
  // only (`discover_machine`, not `discover_repo` — see the `mcpServers`
  // state comment above), so there is no repo-scoped equivalent to build
  // RepoPane's Tools rows from —
  // they stay per-registration regardless of `serverGrouping`. Passing
  // `grouping` here would make this pane's header show a grouped total over
  // rows that never regroup: a header disagreeing with its own rows, the
  // exact defect this stage exists to close. Repo counts stay
  // PerRegistration on purpose. Do not "fix" this by threading
  // `groupingParam()` through until a repo-scoped `get_mcp_servers`
  // equivalent exists — tracked in docs/roadmap.md, "Repo-scoped MCP
  // grouping", not this task.
  const fetchRepoCounts = async (repoPath: string) => {
    try {
      const counts = await invoke<any>("get_asset_counts", { root: repoPath });
      const countsWithByCategory: CategoryCounts = {
        total: counts.total_assets || 0,
        byCategory: {
          skill: counts.skill,
          rule: counts.rule,
          subagent: counts.subagent,
          tool: counts.tool,
        },
        engines: counts.engines,
      };
      setRepoAssetCountsMap((prev) => ({ ...prev, [repoPath]: countsWithByCategory }));
    } catch {
      // Silent fallback
    }
  };

  useEffect(() => {
    if (selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")) {
      fetchRepoCounts(selectedSidebarItem);
    }
  }, [selectedSidebarItem, inventory]);

  const refreshGlobalCounts = async () => {
    try {
      const counts = await invoke<any>("get_asset_counts", { grouping: groupingParam() });
      const countsWithByCategory: CategoryCounts = {
        total: counts.total_assets || 0,
        byCategory: {
          skill: counts.skill,
          rule: counts.rule,
          subagent: counts.subagent,
          tool: counts.tool,
        },
        engines: counts.engines,
      };
      setAssetCounts(countsWithByCategory);
      if (selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")) {
        fetchRepoCounts(selectedSidebarItem);
      }
    } catch {
      // Silent fallback on error
    }
  };

  // The MCP server list, machine-global (see the state comment above). Fetched
  // alongside the annotations refresh — both are backend-computed views over
  // the same scan, neither is part of `Inventory` itself.
  const refreshMcpServers = async () => {
    try {
      setMcpServers(await invoke<McpServerRow[]>("get_mcp_servers"));
    } catch {
      setMcpServers(null);
    }
  };

  // Appendix A.1's counts, same re-derive-from-disk pattern as
  // `refreshMcpServers` above (and the same reason: a fresh answer per scan,
  // not a cached one).
  const refreshMcpCoverage = async () => {
    try {
      setMcpCoverage(
        await invoke<{
          checked_file_count: number;
          checked_engine_count: number;
          checked_files: string[];
          problems: ConfigProblemRow[];
        }>("get_mcp_coverage")
      );
    } catch {
      setMcpCoverage(null);
    }
  };

  // Same re-derive-from-disk pattern as `refreshMcpCoverage` above — the
  // strip's MCP mode reads this for probe coverage and the conflicting-server
  // figure the Review pill filters on.
  const refreshMcpEngineSummary = async () => {
    try {
      setMcpEngineSummary(await invoke<McpEngineSummaryData>("get_mcp_engine_summary"));
    } catch {
      setMcpEngineSummary(null);
    }
  };

  // Re-fetch counts when the grouping choice changes so the chip agrees with
  // the rows immediately, not just after the next scan. Skips the mount
  // render — `refreshGlobalCounts` already runs once scan://complete fires,
  // and firing it again here before onboarding even resolves would race
  // `initializeApp`'s own first fetch.
  const serverGroupingMounted = useRef(false);
  useEffect(() => {
    if (!serverGroupingMounted.current) {
      serverGroupingMounted.current = true;
      return;
    }
    refreshGlobalCounts();
  }, [serverGrouping]);

  const [linkPreSelectedRepo, setLinkPreSelectedRepo] = useState<string | undefined>(undefined);

  /**
   * Linking happens in the inspector, not over the top of it.
   *
   * A row's Link action and the inspector's "Link to…" button asked the same
   * question through two different surfaces, which meant two implementations
   * of one flow kept in step by hand. Both now open the same panel on the
   * same asset.
   */
  const handleLinkAsset = (asset: any, preSelectedRepo?: string) => {
    // Written unconditionally: a repo staged for an earlier link must not
    // stay ticked for every link after it.
    setLinkPreSelectedRepo(preSelectedRepo);
    setSelectedAsset(asset);
    // A link selection is a click-class selection: this bypasses
    // handleSelectAsset, so without this a row linked right after a
    // search-palette pick would still carry "search" and centre.
    setSelectionOrigin("click");
    setLinkingAsset(asset);
    if (!inspectorOpen) {
      setInspectorOpen(true);
      invoke("set_preference", { key: "inspector_open", value: "true" }).catch(() => {});
    }
  };

  const handleLinkFromProfile = (repoPath: string) => {
    setLinkPreSelectedRepo(repoPath);
    setSelectedSidebarItem("profile");
  };

  // Onboarding & Consent states
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<number>(1);
  const [consentCrash, setConsentCrash] = useState<boolean>(false);
  // Usage analytics default to on; crash reporting does not. The onboarding
  // consent step renders this pre-ticked so the choice is still shown and
  // refusable before anything is sent. Backend twin:
  // `usage_consent_from_stored` in src-tauri/src/lib.rs.
  const [consentUsage, setConsentUsage] = useState<boolean>(true);

  // Selected scope for drill-down flyout (agent or project)
  const [selectedBubble, setSelectedBubble] = useState<{
    type: "project" | "agent";
    id: string;
    name: string;
  } | null>(null);

  // Track the OS appearance for as long as the app runs, not just at startup, so
  // flipping macOS between light and dark repaints Auto without a relaunch.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    query.addEventListener("change", onChange);
    setSystemDark(query.matches);
    return () => query.removeEventListener("change", onChange);
  }, []);



  // Load directories and setup listeners on mount
  useEffect(() => {
    initializeApp();

    // A listener that outlives its component keeps receiving emits addressed
    // to a callback id the page no longer holds — Tauri never clears its JS
    // listener registry on a reload. Cleanup can also beat listen()'s promise,
    // which StrictMode does on every mount in development, so a handle that
    // arrives late unregisters itself rather than leaking.
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    const track = async (event: string, handler: (e: any) => void) => {
      const unlisten = await listen<any>(event, handler);
      if (cancelled) unlisten();
      else unlisteners.push(unlisten);
    };

    const setupListeners = async () => {
      await track("scan://complete", async (event) => {
        const payload = event.payload;
        setInventory(payload.inventory);
        setScanning(false);
        setLoading(false);
        setLastScanAt(new Date());

        await refreshGlobalCounts();
        await refreshAnnotations();
        await refreshMcpServers();
        await refreshMcpCoverage();
        await refreshMcpEngineSummary();

        // If onboarding was incomplete, mark it complete now!
        setOnboardingComplete((prev) => {
          if (prev === false) {
            invoke("set_preference", { key: "onboarding_complete", value: "true" });
            return true;
          }
          return prev;
        });
      });

      await track("scan://error", (event) => {
        const payload = event.payload;
        setError(payload.error);
        setScanning(false);
        setLoading(false);
      });
    };

    setupListeners();

    return () => {
      cancelled = true;
      unlisteners.forEach((unlisten) => unlisten());
      unlisteners.length = 0;
    };
  }, []);

  const initializeApp = async () => {
    setLoading(true);
    try {
      invoke<{ id: string; name: string }[]>("get_detected_engines")
        .then((engines) => setDetectedEngines(Array.isArray(engines) ? engines : []))
        .catch(() => {});
      invoke<{ id: string; name: string }[]>("get_known_engines")
        .then((engines) => setKnownEngines(Array.isArray(engines) ? engines : []))
        .catch(() => {});
      // Pure registry data (Appendix A.2) — fetched once here, same as
      // `get_known_engines` just above, not re-derived per scan.
      invoke<{ location_count: number; locations: string[] }>("get_known_engine_locations")
        .then(setKnownEngineLocations)
        .catch(() => setKnownEngineLocations(null));
      const onboarding = await invoke<string | null>("get_preference", { key: "onboarding_complete" });
      const crash = await invoke<string | null>("get_preference", { key: "consent_crash" });
      const usage = await invoke<string | null>("get_preference", { key: "consent_usage" });

      setConsentCrash(crash === "true");
      // `null` means the preference row has never been written, which is the
      // default-on case. An explicit stored value always wins, so a user who
      // declined stays declined.
      setConsentUsage(usage === null ? true : usage === "true");
      setOnboardingComplete(onboarding === "true");

      // Load persistent layout state (selection & width)
      const activeItem = await invoke<string | null>("get_preference", { key: "selected_sidebar_item" });
      if (activeItem === "design" && !designSystemAvailable) {
        setSelectedSidebarItem("profile");
      } else if (activeItem) {
        setSelectedSidebarItem(activeItem);
      }
      const showProjectsPref = await invoke<string | null>("get_preference", { key: "linkmap_show_projects" });
      if (showProjectsPref === "true") {
        setLinkMapShowProjects(true);
      }
      const noticesSeenPref = await invoke<string | null>("get_preference", { key: "linkmap_notices_seen" });
      if (noticesSeenPref) {
        setLinkMapNoticesSeen(noticesSeenPref);
      }
      const widthPref = await invoke<string | null>("get_preference", { key: "sidebar_width" });
      if (widthPref) {
        const w = parseInt(widthPref, 10);
        // Persisted widths from before the 216 floor are clamped up, not honoured.
        if (!isNaN(w)) {
          setSidebarWidth(Math.max(216, Math.min(320, w)));
        }
      }
      const collapsedPref = await invoke<string | null>("get_preference", { key: "sidebar_collapsed" });
      if (collapsedPref === "true") {
        setSidebarCollapsed(true);
      }
      // `theme` supersedes the old boolean `dark_mode` key. A stored dark_mode is
      // only ever written by the old switcher's two buttons, so it records a
      // deliberate choice and outranks the new Auto default.
      const themeStored = await invoke<string | null>("get_preference", { key: "theme" });
      if (themeStored === "light" || themeStored === "dark" || themeStored === "auto") {
        setThemePref(themeStored);
      } else {
        const darkPref = await invoke<string | null>("get_preference", { key: "dark_mode" });
        if (darkPref === "true") {
          setThemePref("dark");
        } else if (darkPref === "false") {
          setThemePref("light");
        }
      }
      const inspectorPref = await invoke<string | null>("get_preference", { key: "inspector_open" });
      if (inspectorPref === "true") {
        setInspectorOpen(true);
      }
      const hostsPref = await invoke<string | null>("get_preference", { key: "hosts_band_open" });
      if (hostsPref === "true") setHostsBandOpen(true);
      const enginesPref = await invoke<string | null>("get_preference", { key: "engines_band_open" });
      if (enginesPref === "true") setEnginesBandOpen(true);
      const inspectorWidthPref = await invoke<string | null>("get_preference", { key: "inspector_width" });
      if (inspectorWidthPref) {
        const w = parseInt(inspectorWidthPref, 10);
        // The floor is enforced on the way in — persisted widths from before
        // it are clamped up, not honoured. There is no ceiling here any more:
        // a stored width is the user's intent, which may be wider than this
        // window can currently hold, and refitInspectorWidth decides at
        // render time what fits. Clipping it here would lose the intent for
        // good the first time the app opened on a narrow window.
        if (!isNaN(w)) {
          setInspectorWidth(Math.max(INSPECTOR_MIN_WIDTH, w));
        }
      }

      const dirs = await invoke<string[]>("get_linked_directories");
      setLinkedDirectories(dirs);

      // Trigger scan on startup (even if dirs are empty, global agent paths will be scanned)
      if (onboarding === "true") {
        triggerScan();
      } else {
        setInventory(null);
        setLoading(false);
      }
    } catch (err: any) {
      setError(String(err));
      setLoading(false);
    }
  };

  const loadLinkedDirectories = async () => {
    setLoading(true);
    try {
      const dirs = await invoke<string[]>("get_linked_directories");
      setLinkedDirectories(dirs);
      triggerScan();
    } catch (err: any) {
      setError(String(err));
      setLoading(false);
    }
  };

  // The link graph is re-read on entering the view and after every scan —
  // link rows and edge states both move when the scanner runs.
  useEffect(() => {
    if (selectedSidebarItem !== "linkmap") return;
    let cancelled = false;
    invoke<LinkGraph>("link_graph", { focusAssetId: null })
      .then((g) => {
        if (!cancelled) setLinkGraph(g);
      })
      .catch((e) => {
        if (!cancelled) setError(`Could not read the link graph: ${e}`);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSidebarItem, lastScanAt]);

  const triggerScan = async () => {
    setScanning(true);
    setError(null);
    try {
      await invoke<string>("start_scan");
    } catch (err: any) {
      setError(String(err));
      setScanning(false);
      setLoading(false);
    }
  };

  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  // What AssetDetail actually read, reported back once its body loads — a
  // skill's own path is the folder holding it, so the cap's Open in
  // editor / Copy path / Reveal act on this when it is known, and on the
  // asset's own path otherwise (before the body has loaded, or for a kind
  // AssetDetail never fetches a body for).
  const [inspectorDocumentPath, setInspectorDocumentPath] = useState<string | null>(null);
  // AssetDetail's own body-load effect keys on `asset.path`; this mirrors
  // that so a stale document path from the PREVIOUS asset never shows
  // through while the new one's body is still loading (or never loads —
  // an Agent has no file, and `onDocumentPath` is never called for one).
  useEffect(() => {
    setInspectorDocumentPath(null);
  }, [selectedAsset?.path]);

  // `editor_app` absence is what triggers the first-use picker; no second
  // "have we asked" flag is needed — that is one fewer thing to keep
  // consistent with the preference itself.
  const [chosenEditor, setChosenEditor] = useState<string | null>(null);
  const [detectedEditors, setDetectedEditors] = useState<DetectedEditor[]>([]);
  const [pickerFor, setPickerFor] = useState<{ name: string; path: string } | null>(null);
  const [editorNotice, setEditorNotice] = useState<string | null>(null);
  // Every editor the capability permits, installed or not. `detect_editors`
  // returns only the installed ones, so this second command is what makes
  // "Choose an app…" able to accept an editor the user installed after
  // launch, without duplicating the backend's table in TypeScript.
  const [knownEditorNames, setKnownEditorNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    invoke<string | null>("get_preference", { key: "editor_app" })
      .then((v) => setChosenEditor(v ?? null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    invoke<string[]>("known_editor_names")
      .then((names) => setKnownEditorNames(new Set(names)))
      .catch(() => {});
  }, []);

  // Settings' own Editor row needs the detected list too, refreshed on open
  // so it reflects an app installed since launch. `?? []` guards a command
  // that resolves rather than rejects with nothing (a test double, or a
  // backend hiccup) from handing EditorSetting a null `editors.length`.
  useEffect(() => {
    if (!showSettingsModal) return;
    invoke<DetectedEditor[]>("detect_editors")
      .then((found) => setDetectedEditors(found ?? []))
      .catch(() => {});
  }, [showSettingsModal]);

  // Shared by the steady-state open (the cap's plain click, every open after
  // the first) and applyEditorChoice's first-use/Option-picker open — a
  // whole-branch review found three duplicated lines of this between them
  // (Tasks 5 and 7), and the steady-state copy had also dropped the
  // `.then` entirely, discarding a genuine `{ok:false}` on the most common
  // path through this code. Clears any stale notice at the start of every
  // attempt: a fresh attempt is "the user acting again", one of the two
  // points a notice stops being true (the other is `onCancel`/dismissal on
  // the toast itself, and success below).
  const attemptOpen = async (target: string, name: string) => {
    setEditorNotice(null);
    const result = await openInEditor(target, name);
    if (!result.ok) {
      setEditorNotice(
        result.reason === "missing"
          ? `Hanger couldn't find ${target}.`
          : `Hanger couldn't open ${target} in ${name}.`
      );
    }
  };

  const applyEditorChoice = (name: string, remember: boolean, target: string) => {
    setPickerFor(null);
    if (remember) {
      setChosenEditor(name);
      invoke("set_preference", { key: "editor_app", value: name }).catch(() => {});
    }
    // Settings has no asset in hand -- choosing there sets the default and
    // opens nothing. Only the picker, which is opened against a specific
    // asset, has a target to launch.
    if (!target) return;
    attemptOpen(target, name);
  };

  const chooseOtherApp = async () => {
    const target = pickerFor?.path ?? "";
    // Mirrors the checkbox default just below (`defaultRemember={!chosenEditor}`
    // on the EditorPicker): when this fires from the picker's editors-empty
    // branch, where no checkbox is even rendered to ask, it still has to obey
    // the same first-use-remembers / Option-route-doesn't split — hard-coding
    // true here silently overrode a deliberately unticked Option route. Settings'
    // own "Choose an app…" (pickerFor null, no target) has no route to follow;
    // it is always setting the default, so it always remembers.
    const remember = pickerFor ? !chosenEditor : true;
    const picked = await open({
      title: "Choose an app",
      directory: false,
      filters: [{ name: "Applications", extensions: ["app"] }],
    });
    if (typeof picked !== "string") return;
    const name = picked.split("/").pop()?.replace(/\.app$/, "") ?? "";
    if (!knownEditorNames.has(name)) {
      setPickerFor(null);
      setEditorNotice(`Hanger can't open assets in ${name} yet.`);
      return;
    }
    applyEditorChoice(name, remember, target);
  };

  /* Ask what is running the first time the user looks at Tools, and never
     before. Failure is silent on purpose: running state enriches the view,
     and a profile that refused to render because the process table could not
     be read would be a worse outcome than one without pids. */
  /* Three ways in, because the category has two owners. The sidebar encodes it
     in selectedSidebarItem; the facet chip keeps it inside ProfilePane and
     reports it through onCategoryChange. Watching only the first two meant
     clicking "MCP servers" fetched nothing and the banner stayed invisible
     until an individual server was opened — seen in the running app, not in
     any test, because a test hands the pane its props directly. */
  const lookingAtTools =
    selectedSidebarItem.endsWith(":Tools") ||
    selectedAsset?.category === "Tools" ||
    profileCategory === "Tools";
  const refreshMcpProcesses = () => {
    if (mcpProcessesInFlight.current) return;
    mcpProcessesInFlight.current = true;
    invoke<ProcessMatch[]>("get_mcp_processes")
      .then(setMcpProcesses)
      /* `null`, not `[]`. An empty array is an assertion — nothing on this
         machine is running — and a failed scan has not earned it. Recording
         one closed the question for the rest of the session: the app believed
         it had an answer, never asked again, and every panel thereafter
         reported a running server as idle. A failure leaves the question
         open. */
      .catch(() => setMcpProcesses(null))
      .finally(() => {
        mcpProcessesInFlight.current = false;
      });
  };

  /* Ask while the question is open. `mcpProcesses !== null` is a real answer,
     including an empty one, and re-asking for it would pay for a rescan to
     learn what is already known. */
  const needMcpProcesses = lookingAtTools && mcpProcesses === null;
  useEffect(() => {
    if (needMcpProcesses) refreshMcpProcesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needMcpProcesses]);

  /* And take a fresh reading whenever a server's panel is opened, however
     recent the last one was. The snapshot used to be fetched once for the life
     of the process, so a server a host started at 4pm read as stopped all
     afternoon — and opening its panel was the exact moment Hanger would decide
     starting a second copy was safe. `cached_probe` now confirms against the
     live process table before spawning, so this is no longer the only thing
     standing between a stale reading and a killed session, but the panel still
     states what is running and should not be stating this morning's answer. */
  const openMcpAssetKey =
    selectedAsset?.category === "Tools" ? (selectedAsset.id ?? selectedAsset.path ?? "") : null;
  useEffect(() => {
    if (openMcpAssetKey === null) return;
    refreshMcpProcesses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMcpAssetKey]);

  // Maps individual asset row clicks to detail Flyout opening
  const handleSelectAsset = (
    asset: { id?: string; name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string },
    // The screen the selection belongs to. A pick from the search palette
    // switches screens in the same tick, so the state read here would still
    // be the old one; the palette passes the target explicitly.
    screen: string = selectedSidebarItem,
    // "click" for a row tap, "search" for a palette pick — read by AssetRow
    // (via SelectionOriginContext) to decide how the picked row lands.
    origin: SelectionOrigin = "click"
  ) => {
    setSelectionOrigin(origin);
    // Tapping a row means "inspect this" — open the panel straight away
    // rather than requiring the toolbar toggle first.
    if (!inspectorOpen) {
      setInspectorOpen(true);
      invoke("set_preference", { key: "inspector_open", value: "true" }).catch(() => {});
    }
    let fullAsset: any = null;
    if (asset.category === "Skills") {
      fullAsset = inventory?.skills.find((s) => s.path === asset.path);
    } else if (asset.category === "Tools") {
      // Resolve the exact registration. Matching on config_path returned the
      // FIRST server in the file, so nine of the ten in ~/.claude.json opened
      // the wrong server's detail.
      fullAsset = asset.id
        ? inventory?.tools.find((t) => registrationKey(t) === asset.id)
        : inventory?.tools.find((t) => t.config_path === asset.path);
    } else if (asset.category === "Rules") {
      fullAsset = inventory?.rules.find((r) => r.path === asset.path);
    } else if (asset.category === "Subagents") {
      fullAsset = inventory?.subagents.find((sa) => sa.path === asset.path);
    }

    if (fullAsset) {
      setSelectedAsset(buildDetailAsset(asset, fullAsset));
    } else {
      setSelectedAsset(asset);
    }

    if (screen.startsWith("/")) {
      setSelectedBubble({
        type: "project",
        id: screen,
        name: screen.split("/").pop() || screen,
      });
    } else if (screen === "profile") {
      const agentId = fullAsset?.scope?.Global?.agent || fullAsset?.scope?.Project?.agent || (fullAsset as any)?.owning_agent;
      
      if (asset.category === "Agents") {
        const agent = inventory?.agents.find((a) => a.global_config_path === asset.path || a.name === asset.name);
        const actualAgentId = agent?.id || asset.path;
        const actualAgentName = agent?.name || asset.name;
        setSelectedBubble({
          type: "agent",
          id: actualAgentId,
          name: actualAgentName,
        });
      } else if (agentId) {
        const agentName = inventory?.agents.find((a) => a.id === agentId)?.name || agentId;
        setSelectedBubble({
          type: "agent",
          id: agentId,
          name: agentName,
        });
      }
    }
  };

  const handleSelectSidebarItem = (item: string) => {
    if (item !== selectedSidebarItem) {
      setSelectedAsset(null);
      setSelectedBubble(null);
    }
    setSelectedSidebarItem(item);
  };

  /** A palette hit: go where it lives, then open it, exactly as a row
   *  click would. A tool hit opens its server; the detail lists the tools. */
  const openSearchHit = (hit: SearchHit) => {
    setSearchOpen(false);
    const target = hit.place === "global" ? "profile" : hit.place;
    if (target !== selectedSidebarItem) {
      handleSelectSidebarItem(target);
      invoke("set_preference", { key: "selected_sidebar_item", value: target }).catch(() => {});
    }
    // A palette pick always lands on the asset's primary tab, even when the
    // inspector already remembers a "details" tab from an earlier asset on
    // this same screen — the nonce ticks ahead of the selection so Flyout's
    // reset effect fires whether or not the picked asset itself changes.
    setLandingNonce((n) => n + 1);
    if (hit.kind === "server" || hit.kind === "mcp_tool") {
      handleSelectAsset({ id: hit.id, name: hit.server ?? hit.name, category: "Tools", path: hit.path }, target, "search");
      return;
    }
    const category = hit.kind === "skill" ? "Skills" : hit.kind === "rule" ? "Rules" : "Subagents";
    handleSelectAsset({ name: hit.name, category, path: hit.path }, target, "search");
  };

  /** Home, by ruling (Karthik, 2026-08-15): the hanger mark, the rail's
   *  machine button and the crumb's "My machine" all land on
   *  My machine › Global, from any inner screen or repository. */
  const goToGlobal = () => {
    handleSelectSidebarItem("profile");
    invoke("set_preference", { key: "selected_sidebar_item", value: "profile" }).catch(() => {});
  };

  // The one place the resolved appearance reaches the DOM, whether it came from
  // an explicit pick or from the OS by way of Auto.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
    // index.html's 1px window edge line reads this attribute once the app has
    // resolved its theme; before mount it falls back to the system guess.
    document.documentElement.dataset.appearance = darkMode ? "dark" : "light";
    // The window's vibrancy material reads the NSWindow appearance, not the CSS
    // class, so the same pick has to reach both. Absent Tauri internals (tests,
    // a plain browser) there is no window to theme.
    if ("__TAURI_INTERNALS__" in window) {
      getCurrentWindow()
        .setTheme(darkMode ? "dark" : "light")
        .catch(() => {});
    }
  }, [darkMode]);

  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center font-sans">
        <Disc3Icon size={32} active className="text-ink-2" />
      </div>
    );
  }

  if (onboardingComplete === false) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center font-sans p-4 relative overflow-hidden transition-colors duration-press">
        {/* Step 1: Welcome Screen */}
        {onboardingStep === 1 && (
          <div className="w-full max-w-md bg-plane border border-line rounded-plane p-8 flex flex-col gap-6 text-center animate-drop">
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-pill bg-fill flex items-center justify-center text-on-fill mx-auto select-none">
                <ShieldCheckIcon size={24} />
              </div>
              <h2 className="text-display font-medium tracking-[-0.5px] text-ink-1 text-balance">Welcome to Hanger</h2>
              <p className="text-small text-ink-2 leading-[1.65]">
                Local-first developer asset manager. Scans, links, and manages agent capabilities across your machine.
              </p>
            </div>
            <button
              onClick={() => setOnboardingStep(2)}
              className="px-6 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium transition-transform duration-press ease-spring active:scale-[0.96] cursor-pointer text-center w-fit mx-auto mt-2"
            >
              Get started
            </button>
          </div>
        )}

        {/* Step 2: Privacy & Telemetry Consent */}
        {onboardingStep === 2 && (
          <div className="w-full max-w-md bg-plane border border-line rounded-plane p-8 flex flex-col gap-5 animate-drop">
            <div className="flex flex-col gap-1.5 border-b border-line pb-3.5">
              <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1">Privacy & telemetry consent</h2>
              <p className="text-small text-ink-2 leading-[1.65]">
                Hanger is local-first. Scanned AI asset code, parameters, and prompt files stay exclusively on your local machine.
              </p>
            </div>

            <div className="flex flex-col gap-3">
              <label className="flex items-center justify-between text-small text-ink-2 select-none cursor-pointer bg-page border border-line p-3 rounded-inner hover:border-line-2 transition-colors duration-hover">
                <div className="flex flex-col">
                  <span className="font-medium text-ink-1">Enable crash reporting</span>
                  <span className="text-micro text-ink-3">Send anonymised error traces.</span>
                </div>
                <input
                  type="checkbox"
                  checked={consentCrash}
                  onChange={(e) => setConsentCrash(e.target.checked)}
                  className="w-4 h-4 accent-[var(--fill)] cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-small text-ink-2 select-none cursor-pointer bg-page border border-line p-3 rounded-inner hover:border-line-2 transition-colors duration-hover">
                <div className="flex flex-col">
                  <span className="font-medium text-ink-1">Enable usage analytics</span>
                  <span className="text-micro text-ink-3">Share anonymised feature usage events.</span>
                </div>
                <input
                  type="checkbox"
                  checked={consentUsage}
                  onChange={(e) => setConsentUsage(e.target.checked)}
                  className="w-4 h-4 accent-[var(--fill)] cursor-pointer"
                />
              </label>
            </div>

            <button
              onClick={async () => {
                await invoke("set_preference", { key: "consent_crash", value: consentCrash ? "true" : "false" });
                await invoke("set_preference", { key: "consent_usage", value: consentUsage ? "true" : "false" });
                await invoke("set_preference", { key: "onboarding_complete", value: "true" });
                setOnboardingComplete(true);
                setSelectedSidebarItem("profile");
                await invoke("set_preference", { key: "selected_sidebar_item", value: "profile" });
                triggerScan();
              }}
              className="w-full h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium transition-transform duration-press ease-spring active:scale-[0.96] cursor-pointer text-center mt-2"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    );
  }

  // Toolbar control voice: quiet 27px pills, tonal tint when pressed.
  // `relative` lifts each control above its cap's drag overlay: Tauri only
  // starts a window drag when the pointer's exact target carries
  // data-tauri-drag-region, so the caps lay an overlay under everything
  // inert and the controls must sit above it to stay clickable.
  // shrink-0 on every variant: the sidebar cap deliberately overflows its
  // 56px rail when collapsed (below), and without it the flex squeeze that
  // overflow depends on falls through to the icon and shrinks the glyph
  // itself rather than just letting the button overflow.
  const tbBtnClass =
    "relative h-[27px] w-[27px] rounded-pill inline-flex items-center justify-center shrink-0 text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";
  // On the plane the toggle is a plain glyph — the plane already reads as a
  // chrome zone, so hover tints with --tint-plane and pressed adds nothing.
  const tbBtnPlaneClass =
    "relative h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center shrink-0 text-ink-2 hover:bg-tint-plane hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";

  // Every cap shares this: an inert layer that owns window dragging, so the
  // pointer can land anywhere in the 40px strip that is not a control.
  const capDragOverlay = (
    <div data-tauri-drag-region className="absolute inset-0" aria-hidden="true" />
  );

  // The inspector column resizes as one surface regardless of which body it
  // is showing. There is no ceiling: the drag resists at main-content's own
  // floor and snaps past it into the expanded state, and back out again.
  // inspectorLayout.ts owns every rule; this only wires the pointer to it.
  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    // The room a drag has is fixed for its duration — the window is not being
    // resized while the mouse is down — so it is measured once, here, rather
    // than read from state that the drag itself is about to invalidate.
    // The pointer leaves this 6px strip almost at once, so the fact that a
    // drag is running has to live somewhere the whole document can see: the
    // cursor must stay `col-resize` and text must stop selecting until the
    // mouse comes up. Same mechanism the source list already uses
    // (the source list did the same until its width transition went, 2026-08-29).
    document.body.setAttribute("data-resizing-inspector", "");
    const dragRoom = measureRoom();
    // The width the pointer is asking for is its distance from the window's
    // right edge: the aside is the last flow child of a `w-screen` row, so
    // the panel's right edge IS the window's. `inspectorWidth` is now an
    // intent that may exceed what is rendered, and while expanded it is not
    // the rendered width at all, so a delta from it would start the drag
    // from the wrong place.
    const askedFor = (ev: MouseEvent) => window.innerWidth - ev.clientX;
    // A click on the handle that never moved is not a resize, and must not
    // be treated as one: `inspectorWidth` is an intent that may be wider
    // than what currently fits, so recomputing from the pointer would
    // overwrite it with the resist width and persist that — the remembered
    // width would never come back when the window widened again.
    let moved = false;
    const onMove = (ev: MouseEvent) => {
      moved = true;
      const fit = resolveInspectorDrag(askedFor(ev), dragRoom);
      setInspectorWidth(fit.width);
      setInspectorExpanded(fit.expanded);
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      // Before the early return, not after: a press that never moved still
      // ends a drag, and leaving the mark set would strand the whole document
      // in resize-cursor mode with selection disabled.
      document.body.removeAttribute("data-resizing-inspector");
      if (!moved) return;
      const fit = resolveInspectorDrag(askedFor(ev), dragRoom);
      setInspectorWidth(fit.width);
      setInspectorExpanded(fit.expanded);
      // The width only. The expanded state is a per-session zoom and stays
      // unpersisted, exactly as the cap's Expand button leaves it.
      invoke("set_preference", { key: "inspector_width", value: String(fit.width) }).catch(() => {});
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // One derivation feeds the rail badge, the review filter list and the pane,
  // so the three can never disagree about what needs a decision.
  const review = deriveReviewIssues(inventory);
  /* The category ProfilePane is actually showing. It comes from the sidebar
     item when the rail carries one and from the facet chip otherwise — the
     same either/or `lookingAtTools` above already reconciles — so the review
     pill's lines follow the tab the way its old count did. */
  const profileActiveCategory = selectedSidebarItem.includes(":")
    ? selectedSidebarItem.split(":")[1]
    : profileCategory;
  /* The repository RepoPane is showing, bound once: it keys both the pane's
     own root and the issues filtered to it (`placeKey`, reviewIssues.ts). */
  const repoPaneRoot = selectedSidebarItem.split(":")[0];
  const reviewShown = review.issues.filter((issue) =>
    matchesIssueFilter(issue, reviewKind, reviewPlace)
  );

  /* The selected asset's own findings, for the cap's chip. A server's `path`
   * is its config file, and a typical `~/.claude.json` declares ten servers
   * — matching a Tool by path the way every other category matches (there
   * the path IS the asset) would hand it every neighbour's findings.
   * Karthik's ruling, 2026-08-24: a Tool matches by registration identity
   * and by its own name (for a duplicate-registration issue), never by the
   * file it shares with other servers.
   */
  const assetFindings = selectedAsset
    ? issuesForAsset(
        review,
        selectedAsset.category === "Tools"
          ? { registrationKeys: selectedAsset.id ? [selectedAsset.id] : [], serverName: selectedAsset.name }
          : { path: selectedAsset.path }
      )
    : null;

  /* The cap's own identity slice of `selectedAsset` — `null` when nothing is
   * selected, or when the selection is an Agent: `IssueCategory` (and so
   * the cap) has no representation for one, since an Agent is a folder
   * layout the scan inferred, not a harness asset with a link state or
   * findings.
   */
  const capAsset: InspectorCapAsset | null =
    selectedAsset && selectedAsset.category !== "Agents"
      ? { category: selectedAsset.category }
      : null;
  const capPlace = selectedAsset ? provenanceOf(selectedAsset, inventory).place : "";

  // The document AssetDetail actually read, once known — a skill's own path
  // is the folder holding it. Falls back to the asset's own path before the
  // body has loaded, and for a Tool, whose detail view is McpServerDetail,
  // not AssetDetail, and never reports a document path back up.
  const inspectorShownPath = inspectorDocumentPath ?? selectedAsset?.path ?? "";

  // Moved, not copied: the same category exclusion Flyout.tsx's own link
  // button already applies (neither an Agent nor a Subagent has anywhere to
  // be linked) — mirrored here because the control itself moved to the cap.
  const onLinkForCap =
    selectedAsset && selectedAsset.category !== "Agents" && selectedAsset.category !== "Subagents"
      ? () => handleLinkAsset(selectedAsset)
      : undefined;
  // The asset's own path, not the document the inspector happens to be
  // showing: for a skill those differ (folder vs SKILL.md), and for a tool
  // the stored path is a registration key, not a path at all.
  const openTargetForCap = selectedAsset ? assetOpenTarget(selectedAsset) : "";
  const onOpenInEditorForCap = selectedAsset
    ? async () => {
        if (chosenEditor) {
          await attemptOpen(openTargetForCap, chosenEditor);
          return;
        }
        const found = await invoke<DetectedEditor[]>("detect_editors").catch(() => []);
        setDetectedEditors(found ?? []);
        setPickerFor({ name: selectedAsset.name, path: openTargetForCap });
      }
    : undefined;
  const onCopyPathForCap = selectedAsset
    ? () => {
        navigator.clipboard?.writeText(inspectorShownPath).catch(() => {});
      }
    : undefined;
  const onRevealForCap = selectedAsset
    ? () => {
        revealItemInDir(parentDirOf(inspectorShownPath)).catch(() => {});
      }
    : undefined;
  /* The route to Needs review, from the inspector cap's chip and from either
     pane's review pill. Nullable because a pill can open on findings that are
     not issues at all — a scan warning has no row to select. */
  const routeToReview = (issue: ReviewIssue | null) => {
    handleSelectSidebarItem("review");
    invoke("set_preference", { key: "selected_sidebar_item", value: "review" }).catch(() => {});
    // Decision 7: the route clears any standing kind/place filter, not just
    // selects the issue — otherwise a filter left over from a previous visit
    // can filter the routed-to issue straight back out of the list.
    setReviewKind(null);
    setReviewPlace(null);
    if (issue) setSelectedIssue(issue);
  };

  // Crumb never shows a filesystem path — folder names only.
  const crumbSegments: string[] =
    selectedSidebarItem === "review"
      ? ["My machine", "Needs review"]
      : selectedSidebarItem === "profile"
      ? ["My machine", "Global"]
      : selectedSidebarItem === "global"
      ? ["My machine", "Global"]
      : selectedSidebarItem.startsWith("global:")
      ? ["My machine", "Global", selectedSidebarItem.split(":")[1]]
      : selectedSidebarItem === "discovery"
      ? ["Discovery"]
      : selectedSidebarItem === "linkmap"
      ? ["My machine", "Link map"]
      : selectedSidebarItem === "design"
      ? ["Design system"]
      : selectedSidebarItem.includes(":")
      ? [
          "My machine",
          selectedSidebarItem.split(":")[0].split("/").pop() || selectedSidebarItem.split(":")[0],
          selectedSidebarItem.split(":")[1],
        ]
      : ["My machine", selectedSidebarItem.split("/").pop() || selectedSidebarItem];

  /* The inspector's empty state, when the pane's own filter is MCP, names
     the same scope word the crumb already ends on — never a recomputed or
     hardcoded one. Whichever pane is on screen owns the live category:
     ProfilePane and RepoPane are never shown together, so there is no case
     where the wrong one's stale state could leak through. */
  const inspectorScope = crumbSegments[crumbSegments.length - 1];
  /* Whether the pane showing the inspector is a repository, not the global
     store — picks `repoCategory` vs `profileCategory` for the inspector's
     own active-category filter below. */
  const inspectorIsRepoScope = selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~");
  const inspectorActiveCategory = inspectorIsRepoScope ? repoCategory : profileCategory;

  /* Which column comes first after the icon rail. The source list already
     draws the sheet's top-left corner and left edge when it is open
     (SourceListShell); when it is not — collapsed, or the link map, which
     has none — <main> leads and draws them, and when <main> is `hidden`
     behind an expanded inspector, the inspector does. One column, never
     two, and never none. */
  const mainLeads = selectedSidebarItem === "linkmap" || sidebarCollapsed;
  const asideLeads = inspectorExpanded && sidebarCollapsed;
  /* Which column ends the window — the lead, mirrored: the inspector
     whenever it renders (beside <main> or expanded over it), otherwise
     <main>. Never the source list; a content column always follows it. */
  const mainTrails = !inspectorRenders;
  /* The sheet: a column's --page ground, starting under the 36px cap (every
     cap's h-9) rather than behind it, with the --line border along its top.
     The column itself paints --sidebar, once; the sheet sits above that
     tint and below the column's content (-z-10 inside the column's own
     `isolate`), so the cap keeps the sidebar's material and nothing paints
     it twice — a full-width band under the columns did, and the double
     tint read as a seam at the rail (2026-08-28). The leading column adds
     the left edge and the 16px corner — the same treatment SourceListShell
     gives the source list — and the trailing column adds the right edge
     and its corner the same way (Karthik, 2026-08-29: "follow the same
     aspect of how we did it before"). That right edge sits on the window's
     last pixel column, where index.html's #win-border already paints the
     1px window line, so along the straight run the two coincide. */
  const sheetClass = (leads: boolean, trails: boolean) =>
    `absolute inset-x-0 top-9 bottom-0 -z-10 bg-page border-t border-line ${leads ? "border-l rounded-tl-plane" : ""} ${trails ? "border-r rounded-tr-plane" : ""}`;

  return (
    // Provides the origin of the current selection — a row click vs. a
    // search-palette pick — down to AssetRow, which lands the two
    // differently (Karthik's ruling, 2026-08-29). Wraps the whole shell:
    // Provider adds no DOM node of its own, so this touches no layout class.
    <SelectionOriginContext.Provider value={selectionOrigin}>
    <div className="h-screen w-screen text-ink-1 flex font-sans transition-colors duration-press overflow-hidden">
      {/* ══ Left column: rail + source list share one plane and carry their
          own 40px cap, so the column edge runs uninterrupted top to bottom.
          The native traffic lights overlay the first ~66px of the cap
          (trafficLightPosition in tauri.conf.json); the cap leads with a
          spacer rather than drawing lights of its own. The cap's contents
          keep their position when the source list collapses, overflowing the
          56px rail on purpose — the toggle must stay reachable to reopen. */}
      <div
        data-rail-column
        /* No width transition. It animated the collapse over 240ms while the
           sheet's corner changed owner at t=0, so the corner popped off the
           rail, travelled with <main>'s edge and popped back — and every frame
           re-laid out the content column (~230ms of renderer CPU per toggle,
           measured 2026-08-29). Instant: one state change, one layout, the
           corner never leaves the rail. Karthik's ruling, 2026-08-29. */
        className="shrink-0 h-full bg-sidebar flex flex-col min-h-0"
        style={{
          width:
            56 +
            (selectedSidebarItem !== "linkmap" && !sidebarCollapsed
              ? sidebarWidth
              : 0),
        }}
      >
        {/* z-40: collapsed, the toggle overflows over the content column's
            cap (z-30); without winning the stack, clicks on it would start a
            window drag instead of reopening the sidebar. The cap stretches to
            the column so the whole 40px band drags; its contents overflow the
            56px rail when collapsed. */}
        <div data-tauri-drag-region className="relative z-40 h-9 shrink-0 flex items-center select-none">
          {capDragOverlay}
          <div className="w-[76px] shrink-0" aria-hidden="true" />
          {selectedSidebarItem !== "linkmap" && (
            <Tooltip label="Toggle sidebar  ⌘⌥S" placement="bottom">
              <button onClick={toggleSidebar} aria-label="Toggle sidebar" className={tbBtnPlaneClass}>
                <PanelLeftIcon size={16} aria-hidden="true" />
              </button>
            </Tooltip>
          )}
          {/* The breadcrumb lives here, in the band, after the toggle — not in
              <main>'s header — so it has one position whether the source
              list is open or closed (Karthik, 2026-08-28: "the menubar is a
              separate entity"; crumb_in_band.test.tsx). Two gaps, both
              measured on a live window rather than derived (native traffic
              lights are not in the DOM):

              Every view but the link map: nothing between the toggle and the
              crumb — the toggle's 32px box ends at 108 and the crumb's ink
              starts at 109.5 (measured at 2x: x=219), ~9.5pt after the
              icon's ink, within 2pt of the clearance the icon gets after
              the lights.

              Link map: the toggle is gated out, so the crumb clears the
              lights itself. 8px after the 76px spacer puts its ink at 84 —
              ~11.5pt past the green dot, exactly where `pl-[28px]` from
              <main>'s edge landed it before the move.

              Not rendered while the inspector is expanded: <main> is hidden
              and the inspector's cap carries the selected asset's identity
              at this same spot (`leadingColumn`, InspectorCap). */}
          {!inspectorExpanded && (
            <div
              className={`flex items-center gap-[7px] font-flex text-small text-ink-3 whitespace-nowrap shrink-0 ${
                selectedSidebarItem === "linkmap" ? "pl-2" : ""
              }`}
            >
              {crumbSegments.map((segment, idx) =>
                idx === crumbSegments.length - 1 ? (
                  <b key={segment} className="font-medium text-ink-1">
                    {segment}
                  </b>
                ) : (
                  <span key={segment} className="flex items-center gap-[7px]">
                    {segment === "My machine" ? (
                      /* relative: lifts the button above the cap's drag
                         overlay; the rest of the crumb stays draggable. */
                      <button
                        onClick={goToGlobal}
                        className="relative cursor-pointer hover:text-ink-1 transition-colors duration-hover ease-spring"
                      >
                        {segment}
                      </button>
                    ) : (
                      <span>{segment}</span>
                    )}
                    <span>›</span>
                  </span>
                )
              )}
            </div>
          )}
        </div>
        <div className="flex-1 flex min-h-0">
        <IconRail
          active={
            selectedSidebarItem === "discovery"
              ? "discovery"
              : selectedSidebarItem === "review"
              ? "review"
              : selectedSidebarItem === "linkmap"
              ? "linkmap"
              : selectedSidebarItem === "design"
              ? "design"
              : "machine"
          }
          needsReviewCount={review.counts.total}
          onSelectMachine={goToGlobal}
          onSelectLinkMap={() => {
            handleSelectSidebarItem("linkmap");
            invoke("set_preference", { key: "selected_sidebar_item", value: "linkmap" }).catch(() => {});
          }}
          onSelectDiscovery={() => {
            handleSelectSidebarItem("discovery");
            invoke("set_preference", { key: "selected_sidebar_item", value: "discovery" }).catch(() => {});
          }}
          onSelectReview={() => {
            handleSelectSidebarItem("review");
            invoke("set_preference", { key: "selected_sidebar_item", value: "review" }).catch(() => {});
          }}
          onOpenSearch={() => setSearchOpen(true)}
          onSelectDesign={
            designSystemAvailable
              ? () => {
                  handleSelectSidebarItem("design");
                  invoke("set_preference", { key: "selected_sidebar_item", value: "design" }).catch(() => {});
                }
              : undefined
          }
          onOpenSettings={() => setShowSettingsModal(true)}
        />

        {selectedSidebarItem === "linkmap" ? null : selectedSidebarItem === "design" ? (
          DesignSystemSidebar && (
            <Suspense fallback={null}>
              <DesignSystemSidebar
                width={sidebarWidth}
                setWidth={setSidebarWidth}
                collapsed={sidebarCollapsed}
                setCollapsed={setSidebarCollapsed}
                section={designSection}
                onSelectSection={setDesignSection}
              />
            </Suspense>
          )
        ) : selectedSidebarItem === "discovery" ? (
          <DiscoverySidebar
            width={sidebarWidth}
            setWidth={setSidebarWidth}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            kind={discoveryKind}
            onSelectKind={setDiscoveryKind}
            favouritesCount={favourites.favourites.length}
          />
        ) : selectedSidebarItem === "review" ? (
          <ReviewSidebar
            width={sidebarWidth}
            setWidth={setSidebarWidth}
            collapsed={sidebarCollapsed}
            setCollapsed={setSidebarCollapsed}
            counts={review.counts}
            places={review.places}
            kind={reviewKind}
            place={reviewPlace}
            onSelectKind={(kind) => {
              setReviewKind(kind);
              setSelectedIssue(null);
            }}
            onSelectPlace={(place) => {
              setReviewPlace(place);
              setSelectedIssue(null);
            }}
          />
        ) : (
        <Sidebar
          width={sidebarWidth}
          setWidth={setSidebarWidth}
          collapsed={sidebarCollapsed}
          setCollapsed={setSidebarCollapsed}
          selectedItem={selectedSidebarItem}
          setSelectedItem={handleSelectSidebarItem}
          inventory={inventory}
          assetCounts={assetCounts}
          detectedEngines={detectedEngines}
          linkedRepos={linkedDirectories}
          loadLinkedRepos={loadLinkedDirectories}
          onRefreshGlobalCounts={refreshGlobalCounts}
          setError={setError}
          onOpenSearch={() => setSearchOpen(true)}
        />
        )}
        </div>
      </div>

      <main ref={mainRef} className={`${inspectorExpanded ? "hidden" : "flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-sidebar isolate"}`}>
        <div data-testid="content-sheet" aria-hidden="true" className={sheetClass(mainLeads, mainTrails)} />
        {/* Content cap: the trailing controls only — the breadcrumb sits in
            the sidebar cap since 2026-08-28, so it does not move with this
            column. A <header> on purpose — it is the content column's banner,
            and the toolbar guards assert against that landmark. */}
        <header data-tauri-drag-region className="relative h-9 shrink-0 flex items-center gap-2.5 select-none z-30 font-flex">
          {capDragOverlay}
          <div className="ml-auto flex items-center gap-1 pr-3">
            {/* The map view has no inspector column — its detail card lives
                on the canvas — so its toolbar slot holds Rescan instead. */}
            {selectedSidebarItem === "linkmap" ? (
              <>
                {/* How old the graph is, beside the control that refreshes
                    it — the same stamp the strip carries on the panes. */}
                <ScanStamp scannedAt={lastScanAt} className="font-flex text-micro text-ink-3 mr-1.5 select-none" />
                <Tooltip label="Rescan" placement="bottom">
                  <button
                    onClick={triggerScan}
                    disabled={loading || scanning}
                    aria-label="Rescan"
                    className={tbBtnClass}
                  >
                    <RotateCcwIcon
                      size={16}
                      active={loading || scanning}
                      aria-hidden="true"
                    />
                  </button>
                </Tooltip>
              </>
            ) : selectedSidebarItem !== "discovery" && selectedSidebarItem !== "design" && !inspectorOpen && (
              // Open, this same control moves into the inspector column's own
              // cap — one toggle, always at the window's trailing edge,
              // rather than a second button appearing beside it.
              <Tooltip label="Toggle inspector" placement="bottom">
                <button
                  onClick={toggleInspector}
                  aria-label="Toggle inspector"
                  className={tbBtnClass}
                >
                  <PanelRightIcon size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
        </header>

          {error && (
            <div className="absolute top-4 left-4 right-4 z-40 p-3.5 rounded-inner border border-line bg-plane text-state-danger flex items-center justify-between text-small animate-drop">
              <div className="flex items-center gap-2 min-w-0">
                <ExclamationTriangleIcon size={16} className="shrink-0" />
                <span className="break-all">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer shrink-0"
              >
                <XMarkIcon size={14} />
              </button>
            </div>
          )}

          {/* main-content stops shrinking at MAIN_MIN_WIDTH and scrolls
              sideways instead. Only the panes go inside it: the header above
              stays pinned and keeps the window drag region, and the error
              banner keeps its absolute positioning against <main>. The inner
              column carries the floor as an inline width so the constant in
              inspectorLayout.ts stays the only copy of it. */}
          <div className="flex-1 min-h-0 overflow-x-auto">
            <div className="h-full flex flex-col min-h-0" style={{ minWidth: MAIN_MIN_WIDTH }}>
          {/* Render Active Main Pane */}
          {(selectedSidebarItem === "profile" || selectedSidebarItem.startsWith("global")) && (
            <ProfilePane
              inventory={inventory}
              annotations={annotations}
              assetCounts={assetCounts}
              selectedCategory={
                selectedSidebarItem.includes(":")
                  ? (selectedSidebarItem.split(":")[1] as any)
                  : null
              }
              selectedAsset={selectedAsset}
              loading={loading || scanning}
              stateFilter={stateFilter}
              onStateFilterChange={setStateFilter}
              scannedAt={lastScanAt}
              detectedEngines={detectedEngines}
              knownEngines={knownEngines}
              mcpCoverage={mcpCoverage}
              knownEngineLocations={knownEngineLocations}
              onRescan={triggerScan}
              sortField={sortField}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              onSelectAsset={handleSelectAsset}
              onLinkAsset={handleLinkAsset}
              onCategoryChange={(c) => setProfileCategory(c)}
              hostsBandOpen={hostsBandOpen}
              onToggleHostsBand={toggleHostsBand}
              issues={review.issues.filter(
                (i) => i.whereKeys.includes("global") && (profileActiveCategory === null || i.category === profileActiveCategory)
              )}
              onReview={routeToReview}
              unaccountedProcesses={unaccountedProcesses(mcpProcesses ?? undefined)}
              mcpServers={mcpServers}
              mcpEngineSummary={mcpEngineSummary}
              serverGrouping={serverGrouping}
              serverSort={serverSort}
              onServerGroupingChange={handleServerGroupingChange}
              onServerSortChange={handleServerSortChange}
            />
          )}

          {selectedSidebarItem === "discovery" && (
            <DiscoveryPane
              kind={discoveryKind}
              favourites={favourites.favourites}
              onToggleFavourite={favourites.toggleFavourite}
            />
          )}

          {selectedSidebarItem === "design" && DesignSystemPane && (
            <Suspense fallback={null}>
              <DesignSystemPane section={designSection} />
            </Suspense>
          )}

          {selectedSidebarItem === "linkmap" && (
            <LinkMapPane
              graph={linkGraph}
              loading={loading || scanning}
              showProjects={linkMapShowProjects}
              onToggleProjects={() => {
                setLinkMapShowProjects((v) => {
                  invoke("set_preference", {
                    key: "linkmap_show_projects",
                    value: String(!v),
                  }).catch(() => {});
                  return !v;
                });
              }}
              noticesSeen={linkMapNoticesSeen}
              onNoticesSeen={(signature) => {
                setLinkMapNoticesSeen(signature);
                invoke("set_preference", {
                  key: "linkmap_notices_seen",
                  value: signature,
                }).catch(() => {});
              }}
              onOpenProject={(path) => {
                handleSelectSidebarItem(path);
                invoke("set_preference", { key: "selected_sidebar_item", value: path }).catch(() => {});
              }}
              onShowEngineAssets={(name) => {
                // The engine's scope id, by display name — the precedent at
                // handleSelectAsset's Agents branch. Set AFTER the view
                // switch, which clears the bubble.
                const agent = inventory?.agents.find((a) => a.name === name);
                handleSelectSidebarItem("profile");
                invoke("set_preference", { key: "selected_sidebar_item", value: "profile" }).catch(() => {});
                setSelectedBubble({ type: "agent", id: agent?.id ?? name, name });
                if (!inspectorOpen) {
                  setInspectorOpen(true);
                  invoke("set_preference", { key: "inspector_open", value: "true" }).catch(() => {});
                }
              }}
              onReview={() => {
                handleSelectSidebarItem("review");
                invoke("set_preference", { key: "selected_sidebar_item", value: "review" }).catch(() => {});
              }}
            />
          )}

          {selectedSidebarItem === "review" && (
            <NeedsReviewPane
              issues={review.issues}
              counts={review.counts}
              kind={reviewKind}
              place={reviewPlace}
              selectedId={selectedIssue?.id ?? null}
              onRescan={triggerScan}
              scanning={loading || scanning}
              scannedAt={lastScanAt}
              onSelectKind={(kind) => {
                setReviewKind(kind);
                setSelectedIssue(null);
              }}
              onSelectPlace={(place) => {
                setReviewPlace(place);
                setSelectedIssue(null);
              }}
              onSelectIssue={(issue) => {
                setSelectedIssue(issue);
                if (!inspectorOpen) {
                  setInspectorOpen(true);
                  invoke("set_preference", { key: "inspector_open", value: "true" }).catch(() => {});
                }
              }}
            />
          )}

          {(selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")) && (
            <RepoPane
              repoPath={repoPaneRoot}
              selectedCategory={
                selectedSidebarItem.includes(":")
                  ? (selectedSidebarItem.split(":")[1] as any)
                  : null
              }
              onCategoryChange={(c) => setRepoCategory(c)}
              selectedAsset={selectedAsset}
              inventory={inventory}
              assetCounts={repoAssetCountsMap[selectedSidebarItem.split(":")[0]] || null}
              loading={loading || scanning}
              stateFilter={stateFilter}
              onStateFilterChange={setStateFilter}
              scannedAt={lastScanAt}
              sortField={sortField}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              onRefresh={triggerScan}
              onSelectAsset={handleSelectAsset}
              onLinkFromProfile={handleLinkFromProfile}
              linkedRepos={linkedDirectories}
              onPromoteCandidates={(candidates) => setPromoteCandidates(candidates)}
              enginesBandOpen={enginesBandOpen}
              onToggleEnginesBand={toggleEnginesBand}
              issues={review.issues.filter((i) => i.whereKeys.includes(repoPaneRoot))}
              onReview={routeToReview}
            />
          )}
            </div>
          </div>

          {/* Scan for Repositories Checklist Modal Overlay */}
          {promoteCandidates && (
            <SidebarScanModal
              isOpen={!!promoteCandidates}
              candidates={promoteCandidates}
              depthCapped={
                inventory?.project_scans
                  .find((p) => p.path === selectedSidebarItem.split(":")[0])
                  ?.parse_warnings.some((w) => w.includes("Scan depth capped")) ?? false
              }
              onClose={() => setPromoteCandidates(null)}
              onLinked={async () => {
                await loadLinkedDirectories();
                // Select newly linked directory if a new one was added
                const dirs = await invoke<string[]>("get_linked_directories");
                if (dirs.length > 0) {
                  const newest = dirs[dirs.length - 1];
                  setSelectedSidebarItem(newest);
                  await invoke("set_preference", { key: "selected_sidebar_item", value: newest });
                }
              }}
            />
          )}
        </main>

      {/* ══ Inspector column: one surface with its own cap regardless of
          which body it is showing. The resize handle spans the whole column
          so every variant sizes the same way. ══ */}
      {inspectorRenders && (
        <aside
          ref={asideRef}
          style={
            inspectorExpanded ? undefined : { width: refitInspectorWidth(inspectorWidth, room) }
          }
          /* The full-height divider belongs beside <main> only: expanded, the
             column's left edge is the source list's or the rail's, and a line
             there would run up through the cap band. */
          className={`shrink-0 h-full min-h-0 bg-sidebar isolate flex flex-col relative ${inspectorExpanded ? "flex-1" : "border-l border-line"}`}
        >
          <div data-testid="inspector-sheet" aria-hidden="true" className={sheetClass(asideLeads, /* the inspector always ends the window */ true)} />
          {/* Rendered in both states on purpose: expanded, the panel already
              starts at the main column's left edge, so the handle sits where
              it always did and is the way back out of the expanded state. */}
          <div
            data-testid="inspector-resize-handle"
            onMouseDown={handleInspectorResizeStart}
            className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-line-2 active:bg-ink-3 z-10 transition-colors duration-hover"
          />
          {/* The window drag region for this column, and its height keeps
              the panel aligned with the toolbar beside it — kept exactly as
              it was. What used to sit in it (only the two panel-level
              controls) now carries the selected asset's identity too: a
              kind glyph, an eyebrow, a finding chip, then
              Link to… and the overflow menu, ahead of the same Expand/Hide
              pair. `capDragOverlay` stays first so the row is still
              draggable everywhere the cap itself has nothing painted. */}
          <div data-tauri-drag-region className="relative h-9 shrink-0">
            {capDragOverlay}
            <InspectorCap
              asset={capAsset}
              place={capPlace}
              findings={assetFindings ?? { issues: [], count: 0, severity: "warning" }}
              inspectorExpanded={inspectorExpanded}
              /* Expanded, <main> is `hidden` and this column occupies
                 exactly the space <main> had — so with the source list
                 collapsed, the cap inherits the problem <main>'s header
                 solves above, and the same measured 51px answers it. */
              leadingColumn={inspectorExpanded && sidebarCollapsed}
              clampTo={asideRef}
              onLink={onLinkForCap}
              onOpenInEditor={onOpenInEditorForCap}
              chosenEditor={chosenEditor}
              onPickEditor={
                selectedAsset
                  ? async () => {
                      const found = await invoke<DetectedEditor[]>("detect_editors").catch(() => []);
                      setDetectedEditors(found ?? []);
                      setPickerFor({ name: selectedAsset.name, path: openTargetForCap });
                    }
                  : undefined
              }
              onCopyPath={onCopyPathForCap}
              onReveal={onRevealForCap}
              onReview={routeToReview}
              onToggleExpanded={toggleInspectorExpanded}
              onToggleInspector={toggleInspector}
            />
          </div>
          <div className="flex-1 min-h-0 flex flex-col">
            {selectedSidebarItem === "review" ? (
              <ReviewInspector
                issue={selectedIssue}
                position={selectedIssue ? reviewShown.indexOf(selectedIssue) + 1 : 0}
                outOf={reviewShown.length}
                onSkip={() => {
                  const next = reviewShown[reviewShown.indexOf(selectedIssue as ReviewIssue) + 1];
                  setSelectedIssue(next ?? null);
                }}
              />
            ) : (
              <Flyout
                selectedBubble={selectedBubble}
                selectedAsset={selectedAsset}
                /* The Reach column caps its marks at three to stay inside a
                   100px cell, so the panel is the only place the rest are
                   answerable. A miss resolves to null and the section is
                   omitted — a tool's `path` is its config file, not an asset
                   path, so it will not match and should not. */
                annotation={
                  annotations?.find((a) => a.asset_path === selectedAsset?.path) ?? null
                }
                mcpProcesses={mcpProcesses}
                initialDeployingAsset={linkingAsset}
                linkPreSelectedRepo={linkPreSelectedRepo}
                onExitLinkFlow={() => {
                  setLinkingAsset(null);
                  setLinkPreSelectedRepo(undefined);
                }}
                inventory={inventory as Inventory}
                linkedProjects={linkedDirectories}
                onRefresh={triggerScan}
                activeCategory={inspectorActiveCategory}
                paneScope={inspectorScope}
                onAssetDocumentPath={setInspectorDocumentPath}
                /* The inspector's tab is remembered between assets and
                   forgotten between screens; this is the screen. */
                screen={selectedSidebarItem}
                landingNonce={landingNonce}
              />
            )}
          </div>
        </aside>
      )}

      <SearchPalette
        open={searchOpen}
        scannedAt={lastScanAt}
        onClose={() => setSearchOpen(false)}
        onPick={openSearchHit}
      />

      {pickerFor && (
        <EditorPicker
          assetName={pickerFor.name}
          editors={detectedEditors}
          onPick={(name, remember) => applyEditorChoice(name, remember, pickerFor.path)}
          onChooseOther={chooseOtherApp}
          onCancel={() => setPickerFor(null)}
          /* First use (no editor chosen yet): ticked, remembering is the
             expected outcome. The Option route (an editor already chosen,
             opened for a one-off elsewhere): unticked, so ticking it is an
             explicit choice to change the default rather than the assumed
             one. Karthik's ruling, 2026-08-29. */
          defaultRemember={!chosenEditor}
        />
      )}

      {/* A launch failure can originate from the cap on any screen, with
          Settings closed -- the common case, since the plain click is the
          steady-state open. The plan had this banner rendered only inside
          the Settings modal's own conditional, so a failure there was never
          seen at all outside Settings. A fixed toast, z above the modal's
          z-[100], is reachable from wherever the app is and stays visible if
          Settings is opened afterward too. */}
      {editorNotice && (
        <div className="fixed inset-x-0 bottom-4 z-[110] flex justify-center px-4 pointer-events-none font-sans">
          <div className="w-full max-w-md flex items-start gap-2 pointer-events-auto animate-rise">
            <div className="flex-1 min-w-0">
              <DisclosureBanner variant="info" summary={editorNotice}>
                <span className={captionClass}>
                  Choose a different editor in Settings, or reveal it in Finder instead.
                </span>
              </DisclosureBanner>
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setEditorNotice(null)}
              className="w-[27px] h-[27px] shrink-0 rounded-pill grid place-items-center text-ink-3 hover:text-ink-1 hover:bg-plane-2 transition-colors duration-hover ease-spring cursor-pointer"
            >
              <XMarkIcon size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in font-sans">
          <div className="w-full max-w-md bg-page border border-line rounded-plane p-[18px] flex flex-col gap-4 animate-drop">
            <div className="flex justify-between items-center border-b border-line pb-3">
              <h3 className="text-base-app font-medium text-ink-1 flex items-center gap-2">
                <GlobeAltIcon size={16} className="text-ink-2" />
                Hanger Settings & Maintenance
              </h3>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setSettingsError(null);
                  setSettingsNotice(null);
                  setPendingImportPath(null);
                }}
                className="w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-3 hover:text-ink-1 hover:bg-plane-2 transition-colors duration-hover ease-spring cursor-pointer"
              >
                <XMarkIcon size={14} />
              </button>
            </div>

            <p className="text-small text-ink-3 leading-[1.65]">
              Export Hanger's local configurations, classifications, target-memory links, and drift checksums to a portable JSON backup file, or restore them atomically.
            </p>

            {settingsError && (
              <div className="p-2.5 rounded-inner bg-plane text-state-danger border border-line text-small leading-normal font-mono break-all animate-fade-in">
                {settingsError}
              </div>
            )}

            {settingsNotice && (
              <div className="p-2.5 rounded-inner bg-plane text-state-success border border-line text-small leading-normal animate-fade-in">
                {settingsNotice}
              </div>
            )}

            <div className="flex flex-col gap-3 mt-2">
              <button
                onClick={async () => {
                  setSettingsError(null);
                  setSettingsNotice(null);
                  try {
                    const exportPath = await save({
                      title: "Export Hanger Settings",
                      filters: [{ name: "JSON Backup", extensions: ["json"] }]
                    });
                    if (exportPath) {
                      await invoke("export_preferences", { targetPath: exportPath });
                      setSettingsNotice(`Settings exported to ${exportPath}`);
                    }
                  } catch (err: any) {
                    setSettingsError(`Export failed: ${err}`);
                  }
                }}
                className="w-full h-[30px] px-4 rounded-pill bg-fill text-on-fill font-medium text-small text-center cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]"
              >
                Export Settings to JSON...
              </button>

              {pendingImportPath && (
                <div
                  data-testid="import-confirm"
                  className="p-2.5 rounded-inner bg-plane border border-line text-small leading-normal flex flex-col gap-2 animate-fade-in"
                >
                  <span className="text-state-danger">
                    Importing {pendingImportPath.split("/").pop()} overwrites classifications, target mappings, and checksums. The import is local and atomic.
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        setSettingsError(null);
                        try {
                          await invoke("import_preferences", { sourcePath: pendingImportPath });
                          setPendingImportPath(null);
                          setSettingsNotice("Settings imported — rescanning.");
                          triggerScan();
                        } catch (err: any) {
                          setPendingImportPath(null);
                          setSettingsError(`Import failed: ${err}`);
                        }
                      }}
                      className="h-[27px] px-3 rounded-pill bg-fill text-on-fill font-medium text-small cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]"
                    >
                      Confirm Import
                    </button>
                    <button
                      onClick={() => setPendingImportPath(null)}
                      className="h-[27px] px-3 rounded-pill border border-line-2 text-ink-2 hover:text-ink-1 hover:bg-plane-2 font-medium text-small cursor-pointer transition-colors duration-hover ease-spring"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={async () => {
                  setSettingsError(null);
                  setSettingsNotice(null);
                  try {
                    const importPath = await open({
                      title: "Import Hanger Settings",
                      multiple: false,
                      filters: [{ name: "JSON Backup", extensions: ["json"] }]
                    });
                    if (importPath && typeof importPath === "string") {
                      setPendingImportPath(importPath);
                    }
                  } catch (err: any) {
                    setSettingsError(`Import failed: ${err}`);
                  }
                }}
                className="w-full h-[30px] px-4 rounded-pill border border-line-2 hover:bg-plane-2 text-ink-2 hover:text-ink-1 font-medium text-small text-center cursor-pointer transition-colors duration-hover ease-spring"
              >
                Import Settings from JSON...
              </button>

              <div className="border-t border-line pt-4 mt-2 flex flex-col gap-3">
                <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">
                  Appearance
                </span>
                <div className="flex gap-1.5 w-full" role="group" aria-label="Theme colour">
                  {THEME_OPTIONS.map(({ value, label, Icon }) => (
                    <button
                      key={value}
                      // Reflects the preference, not the painted result, so Auto
                      // reads as chosen even while it is resolving to dark.
                      aria-pressed={themePref === value}
                      onClick={() => applyTheme(value)}
                      className={
                        themePref === value
                          ? "flex-1 h-[30px] rounded-pill border border-transparent bg-tint text-tint-ink font-medium text-small font-flex cursor-pointer transition-colors duration-nav ease-spring inline-flex items-center justify-center gap-1.5"
                          : "flex-1 h-[30px] rounded-pill border border-line-2 text-ink-2 text-small font-flex cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 inline-flex items-center justify-center gap-1.5"
                      }
                    >
                      <Icon size={13} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <EditorSetting
                editors={detectedEditors}
                chosen={chosenEditor}
                onChoose={(name) => {
                  setChosenEditor(name);
                  invoke("set_preference", { key: "editor_app", value: name }).catch(() => {});
                }}
                onChooseOther={chooseOtherApp}
              />

              <div className="border-t border-line pt-4 mt-2 flex flex-col gap-3">
                <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">
                  Telemetry & Analytics Consent
                </span>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center justify-between text-small text-ink-2 select-none cursor-pointer">
                    <span>Enable Crash Reporting</span>
                    <input
                      type="checkbox"
                      checked={consentCrash}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setConsentCrash(val);
                        await invoke("set_preference", { key: "consent_crash", value: val ? "true" : "false" });
                      }}
                      className="w-4 h-4 accent-[var(--fill)] cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between text-small text-ink-2 select-none cursor-pointer">
                    <span>Enable Usage Analytics</span>
                    <input
                      type="checkbox"
                      checked={consentUsage}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setConsentUsage(val);
                        await invoke("set_preference", { key: "consent_usage", value: val ? "true" : "false" });
                      }}
                      className="w-4 h-4 accent-[var(--fill)] cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </SelectionOriginContext.Provider>
  );
}
