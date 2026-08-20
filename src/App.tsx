import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  SpinnerIcon,
  ArrowPathIcon,
  CollapseIcon,
  ExpandIcon,
  PanelLeftIcon,
  PanelRightIcon
} from "./components/icons";
import IconRail from "./components/IconRail";
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
import type { LinkGraph } from "./utils/linkMapLayout";
import SidebarScanModal from "./components/SidebarScanModal";
import Flyout from "./components/Flyout";
import type { AssetAnnotationView } from "./components/AssetRow";
import { SortField, SortDirection } from "./components/AssetHeaderRow";
import type { ServerGrouping, ServerSort } from "./components/ViewControl";
import { StateFilter } from "./utils/linkStateCounts";
import { registrationKey } from "./utils/mcpRegistration";
import { unaccountedProcesses, type ProcessMatch } from "./utils/mcpServerView";
import type { McpServerRow } from "./utils/serverRows";
import {
  deriveReviewIssues,
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
  // 384 is the prototype's --inspector and the floor: narrower truncates the
  // link-flow preview paths, the one thing that panel exists to show.
  const [inspectorWidth, setInspectorWidth] = useState<number>(384);
  // A per-session "zoom", not a saved layout choice — deliberately not
  // persisted to preferences, and always reset when the inspector closes.
  const [inspectorExpanded, setInspectorExpanded] = useState<boolean>(false);
  // Toolbar filter — narrows the visible rows of the active pane by name.
  const [filterText, setFilterText] = useState<string>("");
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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        toggleSidebar();
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
  const [consentUsage, setConsentUsage] = useState<boolean>(false);

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

    let unlistenProgress: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenProgress = await listen<any>("scan://progress", () => {});

      unlistenComplete = await listen<any>("scan://complete", async (event) => {
        const payload = event.payload;
        setInventory(payload.inventory);
        setScanning(false);
        setLoading(false);
        setLastScanAt(new Date());

        await refreshGlobalCounts();
        await refreshAnnotations();
        await refreshMcpServers();
        await refreshMcpCoverage();

        // If onboarding was incomplete, mark it complete now!
        setOnboardingComplete((prev) => {
          if (prev === false) {
            invoke("set_preference", { key: "onboarding_complete", value: "true" });
            return true;
          }
          return prev;
        });
      });

      unlistenError = await listen<any>("scan://error", (event) => {
        const payload = event.payload;
        setError(payload.error);
        setScanning(false);
        setLoading(false);
      });
    };

    setupListeners();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
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
      setConsentUsage(usage === "true");
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
      const inspectorWidthPref = await invoke<string | null>("get_preference", { key: "inspector_width" });
      if (inspectorWidthPref) {
        const w = parseInt(inspectorWidthPref, 10);
        // Persisted widths from before the 384 floor are clamped up, not honoured.
        if (!isNaN(w)) {
          setInspectorWidth(Math.max(384, Math.min(480, w)));
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
  const handleSelectAsset = (asset: { id?: string; name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => {
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
      const selectedItem = {
        // Carried through, not dropped. Resolving by registrationKey above and
        // then storing only `path` put the file back in charge of identity:
        // ProfilePane compares what it is given, and for a tool `path` is the
        // config FILE, so clicking one server in ~/.claude.json marked every
        // server declared in it.
        id: asset.id,
        name: fullAsset.name,
        category: asset.category,
        path: asset.path,
        source_path: fullAsset.source_path || fullAsset.source_origin,
        source_origin: fullAsset.source_origin,
        isSymlink: !!fullAsset.is_symlink,
        is_symlink: !!fullAsset.is_symlink,
        scopeBadge: fullAsset.scope?.Global ? "Global" : "Project",
        version: fullAsset.version,
        details: asset.category === "Skills" 
          ? (fullAsset.source_origin ? `Origin: ${fullAsset.source_origin}` : undefined)
          : asset.category === "Tools"
            ? `Command: ${fullAsset.command} (Transport: ${fullAsset.transport})`
            : asset.category === "Subagents"
              ? (fullAsset.declared_tools?.length ? `Declared Tools: ${fullAsset.declared_tools.join(", ")}` : undefined)
              : undefined,
      };
      setSelectedAsset(selectedItem);
    } else {
      setSelectedAsset(asset);
    }

    if (selectedSidebarItem.startsWith("/")) {
      setSelectedBubble({
        type: "project",
        id: selectedSidebarItem,
        name: selectedSidebarItem.split("/").pop() || selectedSidebarItem,
      });
    } else if (selectedSidebarItem === "profile") {
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
  }, [darkMode]);

  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center font-sans">
        <SpinnerIcon className="animate-spin text-ink-2" size={32} />
      </div>
    );
  }

  if (onboardingComplete === false) {
    return (
      <div className="min-h-screen bg-page flex items-center justify-center font-sans p-4 relative overflow-hidden transition-colors duration-200">
        {/* Step 1: Welcome Screen */}
        {onboardingStep === 1 && (
          <div className="w-full max-w-md bg-plane border border-line rounded-plane p-8 flex flex-col gap-6 text-center animate-in zoom-in-95 duration-200">
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
          <div className="w-full max-w-md bg-plane border border-line rounded-plane p-8 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
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
    "relative h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center shrink-0 text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";
  const tbBtnActiveClass =
    "relative h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center shrink-0 bg-tint text-tint-ink transition-colors duration-hover ease-spring cursor-pointer";
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
  // is showing. 384 is the floor: below it the link-flow preview paths — the
  // one thing the panel exists to show — truncate.
  const handleInspectorResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = inspectorWidth;
    const clamp = (w: number) => Math.max(384, Math.min(480, w));
    const onMove = (ev: MouseEvent) => {
      setInspectorWidth(clamp(startWidth - (ev.clientX - startX)));
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const finalWidth = clamp(startWidth - (ev.clientX - startX));
      setInspectorWidth(finalWidth);
      invoke("set_preference", { key: "inspector_width", value: String(finalWidth) }).catch(() => {});
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // One derivation feeds the rail badge, the review filter list and the pane,
  // so the three can never disagree about what needs a decision.
  const review = deriveReviewIssues(inventory);
  const reviewShown = review.issues.filter((issue) =>
    matchesIssueFilter(issue, reviewKind, reviewPlace, filterText)
  );

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
  /* The same test that already picks `repoCategory` vs `profileCategory`
     below, named and reused rather than inlined a third time: Flyout's
     McpEngineSummary is a machine-wide read (fix round 1, item 5) and must
     not render under a repository's own heading, so it needs to know which
     pane it is in on top of the category filter it already gets. */
  const inspectorIsRepoScope = selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~");
  const inspectorActiveCategory = inspectorIsRepoScope ? repoCategory : profileCategory;

  const activeTotal =
    selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")
      ? repoAssetCountsMap[selectedSidebarItem.split(":")[0]]?.total ?? 0
      : assetCounts?.total ?? 0;

  return (
    <div className="h-screen w-screen bg-page text-ink-1 flex font-sans transition-colors duration-200 overflow-hidden">
      {/* ══ Left column: rail + source list share one plane and carry their
          own 40px cap, so the column edge runs uninterrupted top to bottom.
          The native traffic lights overlay the first ~66px of the cap
          (trafficLightPosition in tauri.conf.json); the cap leads with a
          spacer rather than drawing lights of its own. The cap's contents
          keep their position when the source list collapses, overflowing the
          56px rail on purpose — the toggle must stay reachable to reopen. */}
      <div
        className="shrink-0 h-full bg-plane border-r border-line flex flex-col min-h-0 transition-[width] duration-240"
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
        <div data-tauri-drag-region className="relative z-40 h-10 shrink-0 flex items-center select-none">
          {capDragOverlay}
          <div className="w-[76px] shrink-0" aria-hidden="true" />
          {selectedSidebarItem !== "linkmap" && (
            <Tooltip label="Toggle sidebar  ⌘⌥S" placement="bottom">
              <button onClick={toggleSidebar} aria-label="Toggle sidebar" className={tbBtnPlaneClass}>
                <PanelLeftIcon size={15} aria-hidden="true" />
              </button>
            </Tooltip>
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
        />
        )}
        </div>
      </div>

      <main className={`${inspectorExpanded ? "hidden" : "flex-1 flex flex-col min-w-0 h-full relative overflow-hidden bg-page"}`}>
        {/* Content cap: breadcrumb left; filter and inspector toggle right.
            A <header> on purpose — it is the content column's banner, and the
            toolbar guards assert against that landmark. */}
        <header data-tauri-drag-region className="relative h-10 shrink-0 flex items-center gap-2.5 select-none z-30 font-flex">
          {capDragOverlay}
          {/* When the source list is collapsed the sidebar toggle overflows
              the 56px rail into this cap; the crumb steps aside for it.
              51px, not the 56px rail width — measured against a live window
              so the gap after the icon's ink roughly matches the ~10px gap
              the traffic lights keep between themselves (App.tsx:963's
              spacer + button set that icon's position). Re-measure this if
              the spacer, button padding, or icon size changes. */}
          <div
            className={`flex items-center gap-[7px] text-small text-ink-3 whitespace-nowrap shrink-0 ${
              selectedSidebarItem !== "linkmap" && sidebarCollapsed
                ? "pl-[51px]"
                : "pl-[18px]"
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

          <div className="ml-auto flex items-center gap-1 pr-3">
            {/* The map has no text filter yet, and the design-system page
                none at all; an inert input would lie. */}
            {selectedSidebarItem !== "linkmap" && selectedSidebarItem !== "design" && (
            <div className="relative w-[214px] min-w-[120px] shrink h-[27px] mr-1.5">
              <MagnifyingGlassIcon
                size={12}
                className="absolute left-2.5 top-2 text-ink-3 pointer-events-none"
              />
              {/* "Search", not "Filter": the field sits in the shell's cap,
                  not inside any one screen, and a cap-mounted field is a
                  search field by macOS convention (Finder, Mail, System
                  Settings). The object keeps the placeholder honest about
                  what the field actually reaches. Karthik's call, 2026-08-15. */}
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                aria-label="Search"
                placeholder={
                  selectedSidebarItem === "discovery"
                    ? "Search directories"
                    : selectedSidebarItem === "review"
                    ? `Search ${review.counts.total} issues`
                    : `Search ${activeTotal} assets`
                }
                className="w-full h-full rounded-pill border border-transparent bg-plane pl-[30px] pr-3.5 text-small text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ink-1 focus:bg-page transition-colors duration-hover ease-spring"
              />
            </div>
            )}

            {/* The map view has no inspector column — its detail card lives
                on the canvas — so its toolbar slot holds Rescan instead. */}
            {selectedSidebarItem === "linkmap" ? (
              <Tooltip label="Rescan" placement="bottom">
                <button
                  onClick={triggerScan}
                  disabled={loading || scanning}
                  aria-label="Rescan"
                  className={tbBtnClass}
                >
                  <ArrowPathIcon
                    size={15}
                    aria-hidden="true"
                    className={loading || scanning ? "animate-spin" : ""}
                  />
                </button>
              </Tooltip>
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
                  <PanelRightIcon size={15} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </div>
        </header>

          {error && (
            <div className="absolute top-4 left-4 right-4 z-40 p-3.5 rounded-inner border border-line bg-plane text-state-danger flex items-center justify-between text-small animate-fade-in">
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
              filterText={filterText}
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
              unaccountedProcesses={unaccountedProcesses(mcpProcesses ?? undefined)}
              mcpServers={mcpServers}
              serverGrouping={serverGrouping}
              serverSort={serverSort}
              onServerGroupingChange={handleServerGroupingChange}
              onServerSortChange={handleServerSortChange}
              onClearSelection={() => {
                setSelectedAsset(null);
                setSelectedBubble(null);
              }}
            />
          )}

          {selectedSidebarItem === "discovery" && (
            <DiscoveryPane
              filterText={filterText}
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
            />
          )}

          {selectedSidebarItem === "review" && (
            <NeedsReviewPane
              issues={review.issues}
              counts={review.counts}
              kind={reviewKind}
              place={reviewPlace}
              filterText={filterText}
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
              repoPath={selectedSidebarItem.split(":")[0]}
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
              filterText={filterText}
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
              onClearSelection={() => {
                setSelectedAsset(null);
                setSelectedBubble(null);
              }}
            />
          )}

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
      {inspectorOpen &&
        selectedSidebarItem !== "discovery" &&
        selectedSidebarItem !== "linkmap" &&
        selectedSidebarItem !== "design" &&
        (selectedSidebarItem === "review" || inventory) && (
        <aside
          style={inspectorExpanded ? undefined : { width: inspectorWidth }}
          className={`shrink-0 h-full min-h-0 border-l border-line bg-page flex flex-col relative ${inspectorExpanded ? "flex-1" : ""}`}
        >
          {!inspectorExpanded && (
            <div
              onMouseDown={handleInspectorResizeStart}
              className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-line-2 active:bg-line-2 z-10 transition-colors duration-hover"
            />
          )}
          <div
            data-tauri-drag-region
            className="relative h-10 shrink-0 flex items-center pl-[18px] pr-3 select-none font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3"
          >
            {/* No label. "Inspector" named the furniture, not the contents,
                and the panel's own eyebrow already says what is being
                inspected — so the word cost a row and told you nothing. The
                row itself stays: it is the window drag region for this
                column, and its height keeps the panel aligned with the
                toolbar beside it. */}
            {capDragOverlay}
            {/* The same toggle that lives in the toolbar when this column is
                closed. Docking it here while open, rather than leaving it in
                the toolbar and adding a second close control, keeps one
                control at the window's trailing edge instead of two doing
                the same job from different places. */}
            <Tooltip label={inspectorExpanded ? "Collapse inspector" : "Expand inspector"} placement="bottom">
              <button
                onClick={toggleInspectorExpanded}
                aria-label={inspectorExpanded ? "Collapse inspector" : "Expand inspector"}
                className={`ml-auto ${tbBtnClass}`}
              >
                {inspectorExpanded ? (
                  <CollapseIcon size={15} aria-hidden="true" />
                ) : (
                  <ExpandIcon size={15} aria-hidden="true" />
                )}
              </button>
            </Tooltip>
            <Tooltip label="Toggle inspector" placement="bottom">
              <button
                onClick={toggleInspector}
                aria-label="Toggle inspector"
                className={tbBtnActiveClass}
              >
                <PanelRightIcon size={15} aria-hidden="true" />
              </button>
            </Tooltip>
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
                isRepoScope={inspectorIsRepoScope}
              />
            )}
          </div>
        </aside>
      )}

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in font-sans">
          <div className="w-full max-w-md bg-page border border-line rounded-plane p-[18px] flex flex-col gap-4">
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
  );
}
