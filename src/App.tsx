import { useState, useEffect } from "react";
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
  Sun,
  Moon,
  AlertTriangle,
  X,
  Globe,
  Search,
  Shield,
  Loader2,
  PanelLeft,
  PanelRight,
  RefreshCw
} from "lucide-react";
import IconRail from "./components/IconRail";
import Sidebar from "./components/Sidebar";
import ProfilePane from "./components/ProfilePane";
import RepoPane from "./components/RepoPane";
import DiscoveryPane from "./components/DiscoveryPane";
import SidebarScanModal from "./components/SidebarScanModal";
import Flyout from "./components/Flyout";
import LinkAssetModal from "./components/LinkAssetModal";
import { ScanStatusIndicator } from "./components/ScanStatusIndicator";
import { SortField, SortDirection } from "./components/AssetHeaderRow";
import { needsReviewCount, StateFilter } from "./utils/linkStateCounts";

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

export default function App() {
  const [darkMode, setDarkMode] = useState(false);
  const [linkedDirectories, setLinkedDirectories] = useState<string[]>([]);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [assetCounts, setAssetCounts] = useState<CategoryCounts | null>(null);
  const [detectedEngines, setDetectedEngines] = useState<{ id: string; name: string }[]>([]);
  const [repoAssetCountsMap, setRepoAssetCountsMap] = useState<Record<string, CategoryCounts>>({});
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Updates are owned entirely by the Rust side (src-tauri/src/updates.rs):
  // silent launch check, "Check for Updates…" menu item, periodic re-check.

  // Sidebar and Panel Navigation State
  const [selectedSidebarItem, setSelectedSidebarItem] = useState<string>("profile");
  const [sidebarWidth, setSidebarWidth] = useState<number>(260);
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

  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [inspectorWidth, setInspectorWidth] = useState<number>(280);
  // Toolbar filter — narrows the visible rows of the active pane by name.
  const [filterText, setFilterText] = useState<string>("");
  // Machine-wide state filter driven by the icon rail's Needs review button
  // and the summary strip's legend.
  const [stateFilter, setStateFilter] = useState<StateFilter>(null);
  // When the last completed scan landed — feeds the strip's scan stamp.
  const [lastScanAt, setLastScanAt] = useState<Date | null>(null);
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

  const toggleInspector = () => {
    setInspectorOpen((prev) => {
      const next = !prev;
      invoke("set_preference", { key: "inspector_open", value: String(next) }).catch(() => {});
      return next;
    });
  };

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

  // Link Asset Modal State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);

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
      const counts = await invoke<any>("get_asset_counts");
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
  };  const [linkingAsset, setLinkingAsset] = useState<any | null>(null);
  const [linkPreSelectedRepo, setLinkPreSelectedRepo] = useState<string | undefined>(undefined);

  const handleLinkAsset = (asset: any, preSelectedRepo?: string) => {
    setLinkingAsset(asset);
    if (preSelectedRepo) {
      setLinkPreSelectedRepo(preSelectedRepo);
    }
    setIsLinkModalOpen(true);
  };

  const handleLinkFromProfile = (repoPath: string) => {
    setLinkPreSelectedRepo(repoPath);
    setSelectedSidebarItem("profile");
  };

  const handleCloseLinkModal = () => {
    setIsLinkModalOpen(false);
    setLinkingAsset(null);
    setLinkPreSelectedRepo(undefined);
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
  const [flyoutInitialAsset, setFlyoutInitialAsset] = useState<any | null>(null);

  // Setup theme toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);



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
      const onboarding = await invoke<string | null>("get_preference", { key: "onboarding_complete" });
      const crash = await invoke<string | null>("get_preference", { key: "consent_crash" });
      const usage = await invoke<string | null>("get_preference", { key: "consent_usage" });

      setConsentCrash(crash === "true");
      setConsentUsage(usage === "true");
      setOnboardingComplete(onboarding === "true");

      // Load persistent layout state (selection & width)
      const activeItem = await invoke<string | null>("get_preference", { key: "selected_sidebar_item" });
      if (activeItem) {
        setSelectedSidebarItem(activeItem);
      }
      const widthPref = await invoke<string | null>("get_preference", { key: "sidebar_width" });
      if (widthPref) {
        setSidebarWidth(parseInt(widthPref, 10));
      }
      const collapsedPref = await invoke<string | null>("get_preference", { key: "sidebar_collapsed" });
      if (collapsedPref === "true") {
        setSidebarCollapsed(true);
      }
      const inspectorPref = await invoke<string | null>("get_preference", { key: "inspector_open" });
      if (inspectorPref === "true") {
        setInspectorOpen(true);
      }
      const inspectorWidthPref = await invoke<string | null>("get_preference", { key: "inspector_width" });
      if (inspectorWidthPref) {
        const w = parseInt(inspectorWidthPref, 10);
        if (!isNaN(w) && w >= 220 && w <= 480) {
          setInspectorWidth(w);
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

  // Maps individual asset row clicks to detail Flyout opening
  const handleSelectAsset = (asset: { name: string; category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents"; path: string }) => {
    let fullAsset: any = null;
    if (asset.category === "Skills") {
      fullAsset = inventory?.skills.find((s) => s.path === asset.path);
    } else if (asset.category === "Tools") {
      fullAsset = inventory?.tools.find((t) => t.config_path === asset.path);
    } else if (asset.category === "Rules") {
      fullAsset = inventory?.rules.find((r) => r.path === asset.path);
    } else if (asset.category === "Subagents") {
      fullAsset = inventory?.subagents.find((sa) => sa.path === asset.path);
    }

    if (fullAsset) {
      const selectedItem = {
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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", darkMode);
  }, [darkMode]);

  if (onboardingComplete === null) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center font-sans">
        <Loader2 className="animate-spin text-accent" size={32} />
      </div>
    );
  }

  if (onboardingComplete === false) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center font-sans p-4 relative overflow-hidden transition-colors duration-200">
        {/* Step 1: Welcome Screen */}
        {onboardingStep === 1 && (
          <div className="w-full max-w-md bg-n-50 border border-n-100 rounded-lg shadow-2xl p-8 flex flex-col gap-6 text-center animate-in zoom-in-95 duration-200">
            <div className="flex flex-col items-center gap-2">
              <div className="w-14 h-14 rounded-full bg-accent flex items-center justify-center text-on-primary font-bold text-2xl mx-auto shadow-sm select-none">
                <Shield size={24} />
              </div>
              <h2 className="text-2xl font-bold text-text-primary">Welcome to Hanger</h2>
              <p className="text-xs text-text-muted leading-relaxed">
                Local-first developer asset manager. Scans, links, and manages agent capabilities across your machine.
              </p>
            </div>
            <button
              onClick={() => setOnboardingStep(2)}
              className="px-6 py-2.5 rounded-md bg-accent text-on-accent text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-opacity cursor-pointer text-center w-fit mx-auto mt-2"
            >
              Get Started
            </button>
          </div>
        )}

        {/* Step 2: Privacy & Telemetry Consent */}
        {onboardingStep === 2 && (
          <div className="w-full max-w-md bg-n-50 border border-n-100 rounded-lg shadow-2xl p-8 flex flex-col gap-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-2 border-b border-n-100 pb-3">
              <h2 className="text-title font-bold text-text-primary">Privacy & Telemetry Consent</h2>
              <p className="text-xs text-text-muted leading-relaxed">
                Hanger is local-first. Scanned AI asset code, parameters, and prompt files stay exclusively on your local machine.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              <label className="flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer bg-surface border border-n-100 p-3 rounded-md hover:border-accent/40 transition-colors">
                <div className="flex flex-col">
                  <span className="font-semibold">Enable Crash Reporting</span>
                  <span className="text-[10px] text-text-muted">Send anonymised error traces.</span>
                </div>
                <input
                  type="checkbox"
                  checked={consentCrash}
                  onChange={(e) => setConsentCrash(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded cursor-pointer"
                />
              </label>

              <label className="flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer bg-surface border border-n-100 p-3 rounded-md hover:border-accent/40 transition-colors">
                <div className="flex flex-col">
                  <span className="font-semibold">Enable Usage Analytics</span>
                  <span className="text-[10px] text-text-muted">Share anonymised feature usage events.</span>
                </div>
                <input
                  type="checkbox"
                  checked={consentUsage}
                  onChange={(e) => setConsentUsage(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded cursor-pointer"
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
              className="w-full py-2.5 rounded-md bg-accent text-on-accent text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-opacity cursor-pointer text-center mt-2 shadow-sm"
            >
              Continue
            </button>
          </div>
        )}
      </div>
    );
  }

  // Toolbar control voice: quiet 27px pills, tonal tint when pressed.
  const tbBtnClass =
    "h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";
  const tbBtnActiveClass =
    "h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center bg-tint text-tint-ink transition-colors duration-hover ease-spring cursor-pointer";

  // Crumb never shows a filesystem path — folder names only.
  const crumbSegments: string[] =
    selectedSidebarItem === "profile"
      ? ["My machine", "User profile"]
      : selectedSidebarItem === "global"
      ? ["My machine", "Global"]
      : selectedSidebarItem.startsWith("global:")
      ? ["My machine", "Global", selectedSidebarItem.split(":")[1]]
      : selectedSidebarItem === "discovery"
      ? ["Discovery"]
      : selectedSidebarItem.includes(":")
      ? [
          "My machine",
          selectedSidebarItem.split(":")[0].split("/").pop() || selectedSidebarItem.split(":")[0],
          selectedSidebarItem.split(":")[1],
        ]
      : ["My machine", selectedSidebarItem.split("/").pop() || selectedSidebarItem];

  const activeTotal =
    selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")
      ? repoAssetCountsMap[selectedSidebarItem.split(":")[0]]?.total ?? 0
      : assetCounts?.total ?? 0;

  return (
    <div className="h-screen w-screen bg-surface text-text-primary flex flex-col font-sans transition-colors duration-200 overflow-hidden">
      {/* Unified toolbar — thin top line, quiet pill controls, one filter */}
      <header className="h-10 min-h-10 max-h-10 border-b border-line bg-page px-3 flex items-center gap-2.5 select-none z-30 shrink-0 font-flex">
        <button
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
          title="Toggle sidebar (⌘⌥S)"
          className={tbBtnClass}
        >
          <PanelLeft size={15} />
        </button>

        <div className="flex items-center gap-[7px] text-small text-ink-3">
          {crumbSegments.map((segment, idx) =>
            idx === crumbSegments.length - 1 ? (
              <b key={segment} className="font-medium text-ink-1">
                {segment}
              </b>
            ) : (
              <span key={segment} className="flex items-center gap-[7px]">
                <span>{segment}</span>
                <span>›</span>
              </span>
            )
          )}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative w-[196px] h-[27px] mr-2">
            <Search
              size={12}
              className="absolute left-2.5 top-2 text-ink-3 pointer-events-none"
            />
            <input
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              aria-label="Filter assets"
              placeholder={`Filter ${activeTotal} assets`}
              className="w-full h-full rounded-pill border border-transparent bg-plane pl-[30px] pr-3.5 text-small text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ink-1 focus:bg-page transition-colors duration-hover ease-spring"
            />
          </div>

          <button
            onClick={triggerScan}
            disabled={loading || scanning}
            aria-label="Refresh scan"
            title="Refresh scan"
            className={`${tbBtnClass} disabled:opacity-50`}
          >
            <RefreshCw size={15} className={loading || scanning ? "animate-spin" : ""} />
          </button>

          <ScanStatusIndicator />

          <button
            onClick={() => setDarkMode(!darkMode)}
            className={tbBtnClass}
            title="Toggle theme colour"
            aria-label="Toggle theme colour"
          >
            {darkMode ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <button
            onClick={toggleInspector}
            aria-label="Toggle inspector"
            title="Toggle inspector"
            className={inspectorOpen ? tbBtnActiveClass : tbBtnClass}
          >
            <PanelRight size={15} />
          </button>
        </div>
      </header>

      {/* Main Split Layout Body */}
      <div className="flex-1 flex overflow-hidden">
        <IconRail
          active={selectedSidebarItem === "discovery" ? "discovery" : "machine"}
          needsReviewCount={needsReviewCount(inventory)}
          needsReviewActive={stateFilter === "needs-review"}
          onSelectMachine={() => {
            handleSelectSidebarItem("profile");
            invoke("set_preference", { key: "selected_sidebar_item", value: "profile" }).catch(() => {});
          }}
          onSelectDiscovery={() => {
            handleSelectSidebarItem("discovery");
            invoke("set_preference", { key: "selected_sidebar_item", value: "discovery" }).catch(() => {});
          }}
          onToggleNeedsReview={() =>
            setStateFilter((prev) => (prev === "needs-review" ? null : "needs-review"))
          }
          onOpenSettings={() => setShowSettingsModal(true)}
        />

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

        <main className="flex-1 flex flex-col min-w-0 h-full relative overflow-hidden">
          {error && (
            <div className="absolute top-4 left-4 right-4 z-40 p-4 rounded-md border border-error-border bg-error-bg text-error-text flex items-center justify-between text-sm shadow-md animate-fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
              <button onClick={() => setError(null)} className="text-ink-mute hover:text-ink-1">
                <X size={16} />
              </button>
            </div>
          )}

          {/* Render Active Main Pane */}
          {(selectedSidebarItem === "profile" || selectedSidebarItem.startsWith("global")) && (
            <ProfilePane
              inventory={inventory}
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
              sortField={sortField}
              sortDirection={sortDirection}
              onSortChange={handleSortChange}
              onSelectAsset={handleSelectAsset}
              onLinkAsset={handleLinkAsset}
              onClearSelection={() => {
                setSelectedAsset(null);
                setSelectedBubble(null);
              }}
            />
          )}

          {selectedSidebarItem === "discovery" && (
            <DiscoveryPane />
          )}

          {(selectedSidebarItem.startsWith("/") || selectedSidebarItem.startsWith("~")) && (
            <RepoPane
              repoPath={selectedSidebarItem.split(":")[0]}
              selectedCategory={
                selectedSidebarItem.includes(":")
                  ? (selectedSidebarItem.split(":")[1] as any)
                  : null
              }
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

        {/* Docked Inspector / Flyout Panel */}
        {inspectorOpen && inventory && (
          <Flyout
            width={inspectorWidth}
            setWidth={setInspectorWidth}
            onClose={() => {
              setInspectorOpen(false);
              invoke("set_preference", { key: "inspector_open", value: "false" }).catch(() => {});
            }}
            selectedBubble={selectedBubble}
            setSelectedBubble={(val) => {
              setSelectedBubble(val);
              setFlyoutInitialAsset(null);
            }}
            selectedAsset={selectedAsset}
            initialDeployingAsset={flyoutInitialAsset}
            inventory={inventory}
            linkedProjects={linkedDirectories}
            onRefresh={triggerScan}
          />
        )}
      </div>

      {/* Settings Modal Overlay */}
      {showSettingsModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in font-sans">
          <div className="w-full max-w-md bg-surface border border-n-100 rounded-xl shadow-2xl p-6 flex flex-col gap-4">
            <div className="flex justify-between items-center border-b border-n-100 pb-3">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Globe size={16} className="text-brand-violet" />
                Hanger Settings & Maintenance
              </h3>
              <button
                onClick={() => {
                  setShowSettingsModal(false);
                  setSettingsError(null);
                  setSettingsNotice(null);
                  setPendingImportPath(null);
                }}
                className="p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-n-50 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>
            
            <p className="text-xs text-text-muted leading-relaxed">
              Export Hanger's local configurations, classifications, target-memory links, and drift checksums to a portable JSON backup file, or restore them atomically.
            </p>

            {settingsError && (
              <div className="p-2.5 rounded bg-error-bg text-error-text border border-error-border text-xs leading-normal font-mono break-all animate-fade-in">
                {settingsError}
              </div>
            )}

            {settingsNotice && (
              <div className="p-2.5 rounded-control bg-success-bg text-success-text border border-success-border text-xs leading-normal animate-fade-in">
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
                className="w-full py-2.5 px-4 rounded-md bg-accent text-on-accent font-semibold text-xs text-center cursor-pointer transition-opacity hover:opacity-95 shadow-sm"
              >
                Export Settings to JSON...
              </button>

              {pendingImportPath && (
                <div
                  data-testid="import-confirm"
                  className="p-2.5 rounded-control bg-error-bg border border-error-border text-xs leading-normal flex flex-col gap-2 animate-fade-in"
                >
                  <span className="text-error-text">
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
                      className="py-1.5 px-3 rounded-control bg-error-text text-on-accent font-medium text-xs cursor-pointer transition-opacity hover:opacity-90"
                    >
                      Confirm Import
                    </button>
                    <button
                      onClick={() => setPendingImportPath(null)}
                      className="py-1.5 px-3 rounded-control bg-surface border border-n-100 text-text-secondary hover:text-text-primary font-medium text-xs cursor-pointer transition-colors"
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
                className="w-full py-2.5 px-4 rounded-md bg-surface hover:bg-n-50 border border-n-100 text-text-secondary hover:text-text-primary font-semibold text-xs text-center cursor-pointer transition-colors shadow-sm"
              >
                Import Settings from JSON...
              </button>

              <div className="border-t border-n-100 pt-4 mt-2 flex flex-col gap-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Telemetry & Analytics Consent
                </span>
                <div className="flex flex-col gap-2.5">
                  <label className="flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer">
                    <span>Enable Crash Reporting</span>
                    <input
                      type="checkbox"
                      checked={consentCrash}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setConsentCrash(val);
                        await invoke("set_preference", { key: "consent_crash", value: val ? "true" : "false" });
                      }}
                      className="w-4 h-4 accent-accent rounded cursor-pointer"
                    />
                  </label>
                  <label className="flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer">
                    <span>Enable Usage Analytics</span>
                    <input
                      type="checkbox"
                      checked={consentUsage}
                      onChange={async (e) => {
                        const val = e.target.checked;
                        setConsentUsage(val);
                        await invoke("set_preference", { key: "consent_usage", value: val ? "true" : "false" });
                      }}
                      className="w-4 h-4 accent-accent rounded cursor-pointer"
                    />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Link Asset Modal Overlay */}
      <LinkAssetModal
        isOpen={isLinkModalOpen}
        onClose={handleCloseLinkModal}
        asset={linkingAsset}
        linkedProjects={linkedDirectories}
        inventory={inventory}
        onLinkComplete={triggerScan}
        preSelectedRepo={linkPreSelectedRepo}
      />
    </div>
  );
}
