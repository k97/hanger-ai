import { useState, useRef, useEffect, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  ChevronLeftIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  GlobeAltIcon,
  MousePointerClickIcon,
} from "./icons";
import { Inventory } from "../App";
import AssetDetail from "./AssetDetail";
import type { AssetAnnotationView } from "./AssetRow";
import McpServerDetail, { type RegistrationSwitch } from "./McpServerDetail";
import LayerSwitch from "./LayerSwitch";
import AllEnginesSwitch from "./AllEnginesSwitch";
import HeaderSwitch from "./HeaderSwitch";
import KeptSkillDetail from "./KeptSkillDetail";
import Tooltip from "./Tooltip";
import EngineLabel from "./EngineLabel";
import ListCard from "./ListCard";
import { busyKeyOf, type McpSwitch } from "../hooks/useMcpSwitch";
import type { EngineContext, KeptOffServer } from "../types/engineContext";
import {
  alsoDeclaredLine,
  mechanismLine,
  SHOW_DECLARED,
  skillReadOnlyLine,
  skillStateLabel,
  skillSwitchLabel,
  switchedOffLine,
} from "../utils/switchCopy";
import type { KeptSkill, SkillSwitchInfo } from "../types/skillSwitch";
import { allEnginesRequests, allEnginesState, serverSwitchTargets, stillOnEngines } from "../utils/switchTargets";
import { timeAgo } from "../utils/timeAgo";
import BrandIcon from "./BrandIcon";
import { buildMcpServerView, type ProcessMatch } from "../utils/mcpServerView";
import { parseProbe, type ProbeView, type ProbeWire } from "../utils/probeView";
import LinkPanel from "./LinkPanel";
import DiffChooser, { AlignedSection } from "./DiffChooser";
import { documentKindFor } from "../utils/skillDocument";
import type { OriginWire } from "../utils/assetProvenance";
import { sectionHeadClass, captionClass, monoLabelClass } from "./typeRoles";

export interface FlatAssetItem {
  type: "header" | "asset";
  category: string;
  name: string;
  path: string;
  scopeBadge: string;
  isSymlink: boolean;
  drifted: boolean;
  version?: string;
  details?: string;
  origin?: OriginWire;
  origin_blocked?: boolean;
}

/** The merge chooser's working state, alive only while a rule is being merged. */
interface RuleMerge {
  destination: string;
  targetPath: string;
  sections: AlignedSection[];
}

interface FlyoutProps {
  selectedBubble?: { type: "project" | "agent"; id: string; name: string } | null;
  selectedAsset?: FlatAssetItem | { name: string; category: string; path: string; source_path?: string; is_symlink?: boolean; details?: string; scopeBadge?: string; version?: string } | null;
  initialDeployingAsset?: FlatAssetItem | null;
  /** A repository to arrive with already ticked, when the link was started
   *  from that repository's own empty state. */
  linkPreSelectedRepo?: string;
  /** The link flow was left. The owner clears what it staged for it. */
  onExitLinkFlow?: () => void;
  inventory: Inventory;
  /** Running MCP processes, from `get_mcp_processes`. Owned by App because the
   *  profile's disclosure needs the same answer, and one request serves both. */
  mcpProcesses?: ProcessMatch[] | null;
  linkedProjects: string[];
  onRefresh: () => void;
  /** The selected asset's backend annotation, passed straight through to
   *  AssetDetail so the panel can answer for every engine. The Reach column
   *  shows at most three marks. */
  annotation?: AssetAnnotationView | null;
  /** The cap's Open in editor / Copy path / Reveal act on the document
   *  AssetDetail actually read, not the folder its asset names (a skill's
   *  own path is the folder holding it). App.tsx owns the cap, so this
   *  callback just carries AssetDetail's own `onDocumentPath` one level up. */
  onAssetDocumentPath?: (path: string) => void;
  /** McpServerDetail's Open config, carried up to the owner of the
   *  `editor_app` preference the same way `onAssetDocumentPath` is. The panel
   *  cannot resolve an editor itself without keeping a second copy of that
   *  preference, and the copy is what shipped two editors for one machine. */
  onOpenConfig: (path: string) => void;
  /** The screen this inspector belongs to — App.tsx's `selectedSidebarItem`,
   *  the one string every view switches on (CLAUDE.md). Read for one thing:
   *  the inspector's tab is remembered between assets and forgotten between
   *  screens (Karthik, 2026-08-27). Absent means one screen for as long as
   *  this is mounted, which is what a test that never navigates is. */
  screen?: string;
  /** Ticks on every search-palette pick (App.tsx `openSearchHit`). A pick
   *  lands on the asset's primary tab even on the same screen, overriding
   *  whatever tab this remembers — a plain click never touches this prop, so
   *  it keeps the memory (Karthik's ruling, 2026-08-29). */
  landingNonce?: number;
  /** App's one switch state (`useMcpSwitch`). Without it the MCP server
   *  panel draws no switch. */
  switcher?: McpSwitch;
  /** App's one copy of every engine's context (`get_engine_contexts`, read
   *  once per scan and replaced by every switch's reply): what the MCP
   *  server panel's switches read. */
  engineContexts?: readonly EngineContext[];
  /** The MCP server panel's engine-name links, carried to it unchanged
   *  (`McpServerDetail`'s `linkedEngines` / `onOpenEngine`). */
  linkedEngines?: readonly string[];
  onOpenEngine?: (engineId: string) => void;
  /** A server Hanger is keeping while it is switched off, selected from the
   *  "Switched off" group (T4 of
   *  docs/plans/2026-11-25-ia-engines-into-global.md). It has no inventory
   *  asset, so App passes it in place of `selectedAsset`, never with one. */
  keptServer?: KeptOffServer | null;
  /** A switch's reply context, for App's one copy to take. */
  onEngineContext?: (ctx: EngineContext) => void;
  /** "Show it" on a kept server some config file still declares: opens that
   *  declared server's own inspector. Absent when App found no such server
   *  in the inventory; the line then stands alone. */
  onShowDeclared?: () => void;
  /** A store skill switched off from its header: the kept skill's
   *  `kept-skill:` key, for App to open its panel in place of the skill,
   *  which is no longer in the store. */
  onSkillKept?: (key: string) => void;
  /** A skill Hanger is keeping while it is switched off, selected from the
   *  Skills "Switched off" group. Out of the store, it has no inventory
   *  asset, so App passes it in place of `selectedAsset`, never with one. */
  keptSkill?: KeptSkill | null;
  /** Drawn in place of "Nothing selected" when nothing is selected. App
   *  passes it on Global while the overview card is pinned: the slot
   *  ProfilePane portals the card into (Task 6 of
   *  docs/plans/2026-11-26-overview-card.md). Absent, the empty state is
   *  "Nothing selected". */
  emptyState?: ReactNode;
}

interface RuleSection {
  heading: string | null;
  heading_level: number;
  content: string;
}

interface KeptServerDetailProps {
  server: KeptOffServer;
  /** App's one switch state (`useMcpSwitch`). */
  switcher: McpSwitch;
  /** A switch's reply context, for App to take in place of its copy. */
  onContext?: (ctx: EngineContext) => void;
  /** The engine ids Global's engine chips list; the engine's name links to
   *  Global only for one of them, as in `McpServerDetail`'s "Registered in". */
  linkedEngines?: readonly string[];
  onOpenEngine?: (engineId: string) => void;
  /** Opens the server a config file still declares under this name. */
  onShowDeclared?: () => void;
}

/** `McpServerDetail`'s switch button and engine link, verbatim: a button
 *  pressed by its state, holding the track (DESIGN.md §7), and a text button
 *  underlined on hover on the name inside the `EngineLabel`. */
const switchBtnClass =
  "shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50";
const engineLinkClass = "group min-w-0 flex cursor-pointer text-left";

/**
 * The inspector's view of a server Hanger is keeping while it is switched off
 * (T4, D5 of docs/plans/2026-11-25-ia-engines-into-global.md). A kept server
 * is in no file, so it has no inventory asset, no tool list and nothing to
 * open or reveal: what is shown is what `get_kept_off_servers` says of it.
 * The Flyout's header carries its name and transport, as it does for every
 * server; this panel draws one row — "Off for {engine}", the engine a link
 * that shows Global seen by it, and the switch that puts it back — then when it
 * was switched off ("Switched off 4 min ago", from `at_ms`, read at render)
 * and the kept line. Every word is the naming brief's (`switchCopy.ts`).
 */
function KeptServerDetail({
  server,
  switcher,
  onContext,
  linkedEngines,
  onOpenEngine,
  onShowDeclared,
}: KeptServerDetailProps) {
  const busy = switcher.busyKeys.has(busyKeyOf(server.engine_id, server.key));
  const linked = onOpenEngine !== undefined && (linkedEngines?.includes(server.engine_id) ?? false);
  const names = { engine: server.engine_name, server: server.name };

  // The request every switch sends for the same kept item
  // (`switchRequestFor`): a kept item's `config_path` is empty.
  const switchOn = async () => {
    const next = await switcher.switchServer({
      engineId: server.engine_id,
      engineName: server.engine_name,
      key: server.key,
      serverName: server.name,
      file: "",
      enabled: true,
    });
    if (next) onContext?.(next);
  };

  const engine = (
    <EngineLabel engineKey={server.engine_id} engineName={server.engine_name} className="text-small font-medium">
      <span className={linked ? "underline-offset-2 group-hover:underline" : ""}>{server.engine_name}</span>
    </EngineLabel>
  );

  return (
    <div data-testid="kept-detail" className="flex-1 min-h-0 overflow-y-auto scroll-thin font-sans text-base-app text-ink-1">
      {/* McpServerDetail's SECTION: the panes' block gap. */}
      <section className="mx-[12px] my-3.5">
        <ListCard>
          <div className="flex flex-col gap-[3px] px-3 py-[9px] text-small">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-ink-2">Off for</span>
              {linked ? (
                <button type="button" onClick={() => onOpenEngine?.(server.engine_id)} className={engineLinkClass}>
                  {engine}
                </button>
              ) : (
                engine
              )}
              <button
                type="button"
                aria-pressed={false}
                aria-label={server.name}
                disabled={busy}
                onClick={() => void switchOn()}
                className={`ml-auto ${switchBtnClass}`}
              >
                <LayerSwitch on={false} />
              </button>
            </span>
            <span className={captionClass}>{switchedOffLine(timeAgo(new Date(server.at_ms), new Date()))}</span>
            <span className={captionClass}>{mechanismLine("claude_kept", names)}</span>
            {/* Some config file still declares a server of this name, so the
                MCP servers list has a row for it; "Show it" opens that one. */}
            {server.also_declared && (
              <span className={captionClass}>
                {alsoDeclaredLine(names)}
                {onShowDeclared && (
                  <>
                    {" "}
                    <button
                      type="button"
                      onClick={onShowDeclared}
                      className="font-medium text-ink-1 underline-offset-2 hover:underline cursor-pointer"
                    >
                      {SHOW_DECLARED}
                    </button>
                  </>
                )}
              </span>
            )}
          </div>
        </ListCard>
      </section>
    </div>
  );
}

export default function Flyout({
  selectedBubble,
  selectedAsset,
  initialDeployingAsset,
  linkPreSelectedRepo,
  onExitLinkFlow,
  inventory,
  mcpProcesses,
  linkedProjects,
  onRefresh,
  annotation,
  onAssetDocumentPath,
  onOpenConfig,
  screen,
  landingNonce,
  switcher,
  engineContexts,
  linkedEngines,
  onOpenEngine,
  keptServer = null,
  onEngineContext,
  onShowDeclared,
  onSkillKept,
  keptSkill = null,
  emptyState,
}: FlyoutProps) {
  const [linking, setLinking] = useState<FlatAssetItem | null>(null);

  /* Which tab the inspector is showing. Owned entirely here, as a controlled
     prop each panel only renders — neither panel keeps a local copy or reads
     this once at mount, precisely so that changing it here is enough to move
     an already-mounted panel's tab, with no remount required; this exists
     because they are two components, not one -- an MCP server renders
     `McpServerDetail` and everything else `AssetDetail`, so moving between
     them unmounts whichever was showing and a tab kept inside it dies there.
     "primary" is whichever tab a panel names first (Content, Tools);
     "details" is the one they share, and the only one worth carrying.

     Cleared on a screen change, and only there. App clears `selectedAsset`
     at the same moment (App.tsx, `handleSelectSidebarItem`), so the panel
     unmounts and the next one seeds from a memory this has already reset. */
  const [inspectorTab, setInspectorTab] = useState<"primary" | "details">("primary");
  useEffect(() => {
    setInspectorTab("primary");
  }, [screen]);

  // A palette pick lands on the primary tab even on the same screen,
  // overriding whatever tab this remembers (Karthik's ruling, 2026-08-29);
  // clicks keep the memory, since only a pick advances `landingNonce`. This
  // works from a plain effect — one render after the pick lands — because
  // the panels below read `inspectorTab` as a live prop on every render, not
  // once at mount: no remount is needed to make an already-mounted panel
  // move.
  useEffect(() => {
    if (landingNonce) setInspectorTab("primary");
  }, [landingNonce]);

  useEffect(() => {
    setLinking(initialDeployingAsset ?? null);
  }, [initialDeployingAsset]);

  const [merge, setMerge] = useState<RuleMerge | null>(null);
  const [sectionChoices, setSectionChoices] = useState<Record<string, "source" | "target" | "skip" | "both">>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeRunning, setMergeRunning] = useState(false);
  const [mergeDone, setMergeDone] = useState(false);

  /* Verify results, keyed by REGISTRATION key. Keyed by server name until
     2026-08-16, which was a single slot that could not hold two answers when
     two hosts launch the same server differently. */
  const [mcpVerified, setMcpVerified] = useState<Record<string, ProbeView>>({});
  /* A list, not one slot. The panel caps itself at one request at a time, but
     "one at a time" is a property of the queue, not of the slot — a single
     slot could not represent an explicit Verify overlapping the automatic ask
     it interrupts, and the panel reads this list to know it is busy. */
  const [mcpVerifying, setMcpVerifying] = useState<string[]>([]);
  /* Registration keys the backend declined to probe because the launch is
     already running. Its answer, not our snapshot: the process list can be
     minutes old, so a launch reading as stopped here can still be up on the
     machine, and only the backend looks. */
  const [mcpDeclined, setMcpDeclined] = useState<string[]>([]);
  /* Keys with a request already in flight, as of this instant rather than as
     of the last render. See `requestMcpProbe` below for why the state list
     above cannot serve. */
  const mcpInFlight = useRef<Set<string>>(new Set());

  /**
   * Ask one registration what it provides.
   *
   * `mcp_cached_probe` answers from the store where it can and spawns only
   * where spawning is safe — see `cached_probe` in lib.rs for the two rules.
   * `force` is the user's own re-check and overrides both; `running` is the
   * fact the panel is already rendering, and the backend needs it to decide.
   *
   * `verifiedAt` comes back from the store, not from `Date.now()`. Stamping
   * it here would date a row learned three days ago as "verified 0s ago" the
   * moment it was read back.
   */
  const requestMcpProbe = async (registrationKey: string, force: boolean, running: boolean) => {
    /* One request per key, decided before the invoke. `mcpVerifying` cannot
       answer this: a state update is not visible to a second call in the
       same tick, so a double click on Check again passed its `includes`
       check twice and invoked twice. The rendered controls disable
       themselves once state catches up; a ref is what closes the window
       before it does. It matters here more than anywhere because `force`
       overrides the rule that refuses to start a server already running --
       two simultaneous spawns of a singleton server, and the loser's
       EADDRINUSE cached as that launch's answer for seven days. */
    if (mcpInFlight.current.has(registrationKey)) return;
    mcpInFlight.current.add(registrationKey);
    setMcpVerifying((prev) => (prev.includes(registrationKey) ? prev : [...prev, registrationKey]));
    try {
      const r = await invoke<ProbeWire>("mcp_cached_probe", { registrationKey, force, running });
      /* Read the answer apart BEFORE handing anything to a setter. A state
         updater is a closure React invokes during a later render, outside
         this try — so a field read inside one escapes the catch below and
         takes the whole inspector down with it rather than being recorded as
         a failed probe. Found by `inspector_avionics.test.tsx`, whose mock
         answers a command it does not model with null. */
      const declinedNow = r?.declined === true;
      const learnedAt = r?.verifiedAt ?? null;

      setMcpDeclined((prev) => {
        const held = prev.includes(registrationKey);
        if (declinedNow === held) return prev;
        return declinedNow ? [...prev, registrationKey] : prev.filter((key) => key !== registrationKey);
      });
      /* No result at all means the backend declined and had nothing cached to
         offer instead. Not an error, and not an empty tool list: recording
         either would put a wrong answer on screen where the panel's own
         explanation belongs. `parseProbe` narrows the wire's `result`/`cost`
         into the union at this one IPC boundary. */
      const view = parseProbe(r, learnedAt ?? Date.now());
      if (!view) return;
      setMcpVerified((prev) => ({
        ...prev,
        [registrationKey]: view,
      }));
    } catch (e) {
      setMcpVerified((prev) => ({
        ...prev,
        [registrationKey]: { kind: "failed", verifiedAt: Date.now(), error: String(e) },
      }));
    } finally {
      mcpInFlight.current.delete(registrationKey);
      setMcpVerifying((prev) => prev.filter((key) => key !== registrationKey));
    }
  };

  /* The user asked. `running: true` is not consulted under `force` — it is
     passed as the conservative value so that if `force` ever stopped
     overriding the rules, this call would decline rather than start a second
     copy of a running server. */
  const runMcpVerify = (registrationKey: string) => requestMcpProbe(registrationKey, true, true);

  /* The panel opened and this launch has no answer yet. */
  const runMcpAutoProbe = (registrationKey: string, running: boolean) =>
    requestMcpProbe(registrationKey, false, running);

  // Compile flat asset rows for Virtualizer
  const getSelectedBubbleAssets = () => {
    if (!selectedBubble) return [];

    const list: FlatAssetItem[] = [];

    if (selectedBubble.type === "project") {
      const path = selectedBubble.id;

      const filteredSkills = inventory.skills.filter(
        (s) => s.scope?.Project?.root === path || s.path.startsWith(path)
      );
      const filteredAgents = inventory.agents.filter(
        (a) => a.project_footprints.includes(path)
      );
      const filteredTools = inventory.tools.filter(
        (t) => t.scope?.Project?.root === path || t.config_path.startsWith(path)
      );
      const filteredRules = inventory.rules.filter(
        (r) => r.scope?.Project?.root === path || r.path.startsWith(path)
      );
      const filteredSubagents = inventory.subagents.filter(
        (sa) => sa.scope?.Project?.root === path || sa.path.startsWith(path)
      );

      if (filteredSkills.length > 0) {
        list.push({ type: "header", category: `Skills (${filteredSkills.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredSkills.forEach((s) =>
          list.push({
            type: "asset",
            category: "Skills",
            name: s.name,
            version: s.version,
            path: s.path,
            scopeBadge: "Project",
            details: s.source_origin ? `Origin: ${s.source_origin}` : "",
            drifted: s.drifted || false,
            isSymlink: s.is_symlink || false,
            origin: s.origin,
            origin_blocked: s.origin_blocked
          })
        );
      }

      if (filteredAgents.length > 0) {
        list.push({ type: "header", category: `Agents (${filteredAgents.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredAgents.forEach((a) =>
          list.push({
            type: "asset",
            category: "Agents",
            name: a.name,
            path: a.global_config_path || "Project Scanned",
            scopeBadge: "Global",
            details: `${a.project_footprints.length} project folders detected`,
            isSymlink: false,
            drifted: false
          })
        );
      }

      if (filteredTools.length > 0) {
        list.push({ type: "header", category: `Tools (${filteredTools.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredTools.forEach((t) =>
          list.push({
            type: "asset",
            category: "Tools",
            name: t.name,
            path: t.config_path,
            scopeBadge: t.scope?.Global ? "Global" : "Project",
            details: `Command: ${t.command} (Transport: ${t.transport})`,
            drifted: t.drifted || false,
            isSymlink: t.is_symlink || false
          })
        );
      }

      if (filteredRules.length > 0) {
        list.push({ type: "header", category: `Rules (${filteredRules.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredRules.forEach((r) =>
          list.push({
            type: "asset",
            category: "Rules",
            name: r.name,
            path: r.path,
            scopeBadge: r.scope?.Global ? "Global" : "Project",
            details: `Size: ${r.content.length} characters`,
            drifted: r.drifted || false,
            isSymlink: r.is_symlink || false
          })
        );
      }

      if (filteredSubagents.length > 0) {
        list.push({ type: "header", category: `Subagents (${filteredSubagents.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredSubagents.forEach((sa) =>
          list.push({
            type: "asset",
            category: "Subagents",
            name: sa.name,
            path: sa.path,
            scopeBadge: "Project",
            details: `Declared Tools: ${sa.declared_tools.join(", ") || "None"}`,
            isSymlink: false,
            drifted: false
          })
        );
      }
    } else {
      // Agent drill-down
      const agentId = selectedBubble.id;
      const filteredSkills = inventory.skills.filter((s) => s.scope?.Global?.agent === agentId);
      const filteredTools = inventory.tools.filter((t) => t.scope?.Global?.agent === agentId);
      const filteredRules = inventory.rules.filter((r) => r.scope?.Global?.agent === agentId);
      const filteredSubagents = inventory.subagents.filter((sa) => sa.scope?.Global?.agent === agentId);

      if (filteredSkills.length > 0) {
        list.push({ type: "header", category: `Global Skills (${filteredSkills.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredSkills.forEach((s) =>
          list.push({
            type: "asset",
            category: "Skills",
            name: s.name,
            version: s.version,
            path: s.path,
            scopeBadge: "Global",
            details: s.source_origin ? `Origin: ${s.source_origin}` : "",
            drifted: s.drifted || false,
            isSymlink: s.is_symlink || false,
            origin: s.origin,
            origin_blocked: s.origin_blocked
          })
        );
      }

      if (filteredTools.length > 0) {
        list.push({ type: "header", category: `Global Tools (${filteredTools.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredTools.forEach((t) =>
          list.push({
            type: "asset",
            category: "Tools",
            name: t.name,
            path: t.config_path,
            scopeBadge: "Global",
            details: `Command: ${t.command} (Transport: ${t.transport})`,
            drifted: t.drifted || false,
            isSymlink: t.is_symlink || false
          })
        );
      }

      if (filteredRules.length > 0) {
        list.push({ type: "header", category: `Global Rules (${filteredRules.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredRules.forEach((r) =>
          list.push({
            type: "asset",
            category: "Rules",
            name: r.name,
            path: r.path,
            scopeBadge: "Global",
            details: `Size: ${r.content.length} characters`,
            drifted: r.drifted || false,
            isSymlink: r.is_symlink || false
          })
        );
      }

      if (filteredSubagents.length > 0) {
        list.push({ type: "header", category: `Global Subagents (${filteredSubagents.length})`, name: "", path: "", scopeBadge: "", isSymlink: false, drifted: false });
        filteredSubagents.forEach((sa) =>
          list.push({
            type: "asset",
            category: "Subagents",
            name: sa.name,
            path: sa.path,
            scopeBadge: "Global",
            details: `Declared Tools: ${sa.declared_tools.join(", ") || "None"}`,
            isSymlink: false,
            drifted: false
          })
        );
      }
    }

    return list;
  };

  const filteredAssets = getSelectedBubbleAssets();

  // Virtualization setup
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredAssets.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 58,
    overscan: 5
  });

  const selectedProjectScan =
    selectedBubble?.type === "project"
      ? inventory.project_scans.find((s) => s.path === selectedBubble.id)
      : null;

  /**
   * Merging a rule is the one thing the link panel cannot finish on its own.
   * Every other kind is a file that either lands or does not; a rule has to be
   * reconciled section by section against whatever is already there, so the
   * panel hands the destination over and the chooser takes the conversation.
   */
  const openMergeChooser = async (destination: string, targetPath: string) => {
    if (!linking) return;
    setMergeError(null);
    try {
      const data = await invoke<any>("get_rule_sections", {
        sourcePath: linking.path,
        targetPath
      });

      const sourceSecs: RuleSection[] = data.source_sections;
      const targetSecs: RuleSection[] = data.target_sections;

      const list: AlignedSection[] = [];

      const sourcePreamble = sourceSecs.find((s) => !s.heading || s.heading_level === 0);
      const targetPreamble = targetSecs.find((s) => !s.heading || s.heading_level === 0);
      if (sourcePreamble || targetPreamble) {
        list.push({
          heading: null,
          sourceContent: sourcePreamble?.content,
          targetContent: targetPreamble?.content
        });
      }

      const seenHeadings = new Set<string>();

      sourceSecs.forEach((s) => {
        if (s.heading && s.heading_level > 0) {
          seenHeadings.add(s.heading);
          const tgt = targetSecs.find((t) => t.heading === s.heading);
          list.push({
            heading: s.heading,
            sourceContent: s.content,
            targetContent: tgt?.content
          });
        }
      });

      targetSecs.forEach((t) => {
        if (t.heading && t.heading_level > 0 && !seenHeadings.has(t.heading)) {
          list.push({
            heading: t.heading,
            sourceContent: undefined,
            targetContent: t.content
          });
        }
      });

      const initialChoices: Record<string, "source" | "target" | "skip" | "both"> = {};
      list.forEach((sec) => {
        // Keeping what is already there is the safe default; only a section
        // the destination does not have yet arrives from the source.
        initialChoices[sec.heading || "__preamble"] =
          sec.sourceContent && !sec.targetContent ? "source" : "target";
      });

      setSectionChoices(initialChoices);
      setActiveSectionIndex(0);
      setMerge({ destination, targetPath, sections: list });
    } catch (err: any) {
      setMergeError(String(err));
    }
  };

  const getMergedPreviewContent = () => {
    return (merge?.sections ?? [])
      .map((sec) => {
        const key = sec.heading || "__preamble";
        const choice = sectionChoices[key] || "target";
        if (choice === "skip") return "";
        if (choice === "source") return sec.sourceContent || "";
        if (choice === "both") {
          return (sec.targetContent || "") + "\n\n" + (sec.sourceContent || "");
        }
        return sec.targetContent || "";
      })
      .filter(Boolean)
      .join("\n\n");
  };

  const handleApplyMergeDeploy = async () => {
    if (!merge || !linking) return;
    setMergeRunning(true);
    setMergeError(null);
    try {
      await invoke("execute_deploy_merged_rule", {
        targetPath: merge.targetPath,
        mergedContent: getMergedPreviewContent()
      });

      // Remember which file in that project this rule belongs to, so the next
      // merge does not ask again.
      await invoke("set_rules_target_memory", {
        projectPath: merge.destination,
        rulePath: linking.name,
        targetFile: merge.targetPath
      });

      setMergeDone(true);
      onRefresh();

      setTimeout(() => {
        setMerge(null);
        setLinking(null);
        setMergeDone(false);
      }, 1200);
    } catch (err: any) {
      setMergeError(String(err));
    } finally {
      setMergeRunning(false);
    }
  };

  const closeLinkFlow = () => {
    setLinking(null);
    setMerge(null);
    setMergeError(null);
    // The owner staged this flow, so it is the owner that unstages it —
    // otherwise a pre-ticked repository would follow every later link.
    if (onExitLinkFlow) onExitLinkFlow();
  };

  const targetAsset = selectedAsset || (initialDeployingAsset ? initialDeployingAsset : null);


  /* Built once: the heading row needs the transport chip and the panel needs
     the whole view. Three calls to buildMcpServerView per render was wasteful
     and let the two drift apart. */
  const mcpView =
    targetAsset && targetAsset.category === "Tools"
      ? buildMcpServerView(inventory?.tools, targetAsset.name, mcpProcesses ?? [])
      : null;

  /* A registration's item, matched on the key both sides mint from
     `RegistrationKey` -- never on tier: the panel calls `~/.claude.json`
     "global" where its engine says "user", and two files of one engine can
     share a tier. */
  const registrationSwitches: Record<string, RegistrationSwitch> = {};
  if (mcpView && switcher) {
    for (const reg of mcpView.registrations) {
      const ctx = reg.engineId ? engineContexts?.find((c) => c.engine_id === reg.engineId) : undefined;
      const item = ctx?.items.find((i) => i.key === reg.key);
      if (!ctx || !item) continue;
      registrationSwitches[reg.key] = {
        engineId: ctx.engine_id,
        engineName: ctx.engine_name,
        item,
        busy: switcher.busyKeys.has(busyKeyOf(ctx.engine_id, item.key)),
      };
    }
  }

  /* The same request every switch sends for the item. Its reply's
     context replaces that engine's in App's copy at once; App's rescan
     follows from the hook and brings the next read. Until an engine's
     context is there, its rows claim nothing. */
  const switchRegistration = async (registrationKey: string) => {
    const sw = registrationSwitches[registrationKey];
    if (!sw || !switcher) return;
    const next = await switcher.switchServer({
      engineId: sw.engineId,
      engineName: sw.engineName,
      key: sw.item.key,
      serverName: sw.item.name,
      file: sw.item.config_path,
      enabled: sw.item.state !== "on",
    });
    if (next) onEngineContext?.(next);
  };


  /* The switch in the header that covers every engine
     (docs/plans/2026-11-25-decisions-round-5.md): every item of the server's
     name Hanger can switch, kept ones included, from App's one copy of the
     contexts. No item, no switch. A click sends the group one request at a
     time through the one switch state, which hands each reply's context to
     App's copy, so the Registered in rows and the tiles follow. */
  const headerServer = linking ? null : mcpView ? targetAsset!.name : keptServer ? keptServer.name : null;
  const headerTargets = headerServer && switcher ? serverSwitchTargets(engineContexts ?? [], headerServer) : [];
  const headerState = allEnginesState(headerTargets);
  const headerPending = headerTargets.some((t) => switcher?.busyKeys.has(busyKeyOf(t.ctx.engine_id, t.item.key)));
  const switchEveryEngine = () => {
    if (!headerServer || !switcher) return;
    void switcher.switchAll({
      serverName: headerServer,
      requests: allEnginesRequests(headerTargets),
      stillOn: stillOnEngines(engineContexts ?? [], headerServer),
    });
  };

  /* A store skill's On/Off switch (docs/plans/2026-11-26-skill-switch.md,
     Task 8). `get_skill_switch` says whether the selected skill is in the
     global store and why it has no switch if not; it is read for the path
     on selection and again after every switch or Undo (the notice changes
     with each), so a skill switched off loses its switch and one put back
     gets it again. Nothing is drawn for a path until its own answer lands.
     The label names the skill by its folder, from the backend's key. */
  const skillPath =
    !linking && switcher && targetAsset && targetAsset.category === "Skills" ? targetAsset.path : null;
  const [skillAnswer, setSkillAnswer] = useState<{ path: string; info: SkillSwitchInfo | null } | null>(null);
  const switchNotice = switcher?.notice ?? null;
  useEffect(() => {
    if (skillPath === null) return;
    let cancelled = false;
    invoke<SkillSwitchInfo | null>("get_skill_switch", { skillPath })
      .then((info) => {
        if (!cancelled) setSkillAnswer({ path: skillPath, info: info ?? null });
      })
      .catch(() => {
        if (!cancelled) setSkillAnswer({ path: skillPath, info: null });
      });
    return () => {
      cancelled = true;
    };
  }, [skillPath, switchNotice]);
  const skillInfo = skillPath !== null && skillAnswer?.path === skillPath ? skillAnswer.info : null;
  const skillFolder = skillInfo ? skillInfo.key.slice("skill:".length) : "";
  const skillPending = skillInfo ? switcher?.busyKeys.has(busyKeyOf("skills", skillInfo.key)) ?? false : false;
  const switchSkillOff = () => {
    if (!skillInfo || !switcher) return;
    void switcher.switchSkill({ key: skillInfo.key, skillName: skillFolder, enabled: false }).then((reply) => {
      if (!reply || reply.receipt_id === null || !reply.receipt_id.startsWith("kept:")) return;
      const kept = reply.kept.skills.find((k) => k.key === `kept-skill:${reply.receipt_id!.slice("kept:".length)}`);
      if (kept) onSkillKept?.(kept.key);
    });
  };

  /* A kept skill's header switch, its one switch, puts it back on by its
     `kept-skill:` key, through the one switch state. */
  const shownKeptSkill = !linking && !targetAsset ? keptSkill : null;
  const keptSkillBusy = shownKeptSkill
    ? switcher?.busyKeys.has(busyKeyOf("skills", shownKeptSkill.key)) ?? false
    : false;
  const switchKeptSkillOn = () => {
    if (!shownKeptSkill || !switcher) return;
    void switcher.switchSkill({ key: shownKeptSkill.key, skillName: shownKeptSkill.name, enabled: true });
  };

  /* Whether the eyebrow row has anything left to say. A selected asset's own
     kind · place moved to the cap, so `targetAsset` alone no longer earns
     the row; linking (the "Back to" nav), a bubble scope with no asset
     drilled into, the empty-MCP category label, and the layered-rules flag
     can all still occupy it — the last of those independently of
     `targetAsset`, since selecting an asset inside a layered project does
     not make the project stop being layered. */
  const eyebrowShown = Boolean(
    linking || (!targetAsset && !keptServer && !keptSkill && selectedBubble) || selectedProjectScan?.layered
  );

  /* Whether a tab row (`UnderlineTabs`, via `AssetDetail` or
     `McpServerDetail`) renders beneath the header wrapper below. The
     wrapper's own bottom --line border exists only to separate the header
     from a body that draws no line of its own — when a tab row follows, its
     own bottom border already does that job, and the wrapper's would double
     it. `documentKindFor` is the same test `AssetDetail` uses to decide
     whether it renders `UnderlineTabs` at all ("none" only for Agents,
     which has no document to preview); Tools resolves to "json" here
     exactly as it does there, matching `McpServerDetail`'s own
     unconditional tab row. The link flow never reaches a tab row
     regardless of what `targetAsset` holds, because `linking` takes the
     body over first (LinkPanel or DiffChooser, neither of which renders
     one). */
  const tabsFollow =
    !linking && !!targetAsset && documentKindFor(targetAsset.category) !== "none";

  return (
    // Column chrome (width, resize, the cap and its close) lives in App.tsx:
    // this component is only the inspector's body for the machine views.
    // No ground of its own: the inspector column's sheet is the ground, and a full-bleed bg-page here squares off the sheet's corner from inside when the column leads (every screen carries the corner — Karthik, 2026-08-28).
    <div className="h-full flex flex-col relative overflow-hidden">
      {/* Header — the eyebrow says where you are, the title says what you are
          looking at. In the link flow the eyebrow becomes the way back, so the
          panel never grows a second header for its second screen. With nothing
          selected the empty state stands alone — except when the pane's own
          filter is MCP, where the eyebrow states the category the empty
          result set belongs to and skips the title, since there is no name
          to give one.

          A selected asset's own kind · place no longer repeats here — that
          identity moved up into the inspector cap (App.tsx), which is always
          on screen above this panel, so restating it a second time would be
          the "moved, never copied" rule's exact failure mode. `eyebrowShown`
          is false for a bare targetAsset with nothing else this row can
          say, and the title block below drops the top margin it used when
          resting on a row that is actually there.

          Sits tight under the cap. The cap used to carry the word "Inspector",
          so this header needed its own top padding to read as a separate
          block; with the cap now bearing only the close control, that padding
          was a gap between two empty things. The heading is what the panel
          opens with, and every pixel taken here comes off the content.

          The spacing is a rule, not four numbers (Karthik, 2026-08-28, twice:
          the steps "feel inconsistent", then "make it consistent"). The
          inspector opens like every other screen — `pt-[18px]` under the
          sheet's rule, the same 18 as its sides — and the title sits 14
          above the tabs, the rhythm every pane uses under its opener: this
          block's `pb-1.5` (6) plus the tab row's own `py-2` (8,
          `UnderlineTabs.tsx`). The eyebrow-to-title step is this column's
          own `gap-1` rather than a margin the title row switches on and
          off. */}
      {(linking || targetAsset || keptServer || keptSkill || selectedBubble) && (
      <div
        data-testid="inspector-header"
        className={`px-[18px] pt-[18px] pb-1.5 flex flex-col gap-1 shrink-0${
          tabsFollow ? "" : " border-b border-line"
        }`}
      >
        {(
        <div className="flex items-center gap-2 min-w-0">
          {!linking && !targetAsset && !keptServer && !keptSkill && selectedBubble?.type === "agent" && (
            <BrandIcon engineKey={selectedBubble.id} engineName={selectedBubble.name} size={16} />
          )}
          <h2 className="min-w-0 text-lg-app font-medium tracking-[-0.3px] text-ink-1 truncate max-w-[280px] font-sans">
            {linking
              ? "Link to projects"
              : targetAsset
              ? targetAsset.name
              : keptServer
              ? keptServer.name
              : keptSkill
              ? keptSkill.name
              : selectedBubble
              ? selectedBubble.name
              : "Asset Inspector"}
          </h2>
          {headerServer && headerState && (
            <AllEnginesSwitch
              server={headerServer}
              state={headerState}
              pending={headerPending}
              onToggle={switchEveryEngine}
            />
          )}
          {skillInfo && skillInfo.read_only === null && (
            <HeaderSwitch
              testId="skill-header-switch"
              label={skillSwitchLabel(skillFolder, true)}
              pressed
              on
              stateWord={skillStateLabel(true)}
              pending={skillPending}
              onToggle={switchSkillOff}
            />
          )}
          {shownKeptSkill && switcher && (
            <HeaderSwitch
              testId="skill-header-switch"
              label={skillSwitchLabel(shownKeptSkill.name, false)}
              pressed={false}
              on={false}
              stateWord={skillStateLabel(false)}
              pending={keptSkillBusy}
              onToggle={switchKeptSkillOn}
            />
          )}
        </div>
        )}
        {/* A store skill Hanger shows and doesn't switch says why, under its
            name, where the switch would be. */}
        {skillInfo && skillInfo.read_only !== null && (
          <p data-testid="skill-read-only" className={captionClass}>
            {skillReadOnlyLine(skillInfo.read_only)}
          </p>
        )}
        {/* The transport has its own row under the name (Karthik, 2026-11-26).
            In the title row a remote server's full URL could not shrink: it
            squeezed the name to nothing and pushed the switch out of the
            header. Here it is cut short with an ellipsis, and the whole
            transport shows on hover. */}
        {!linking && (mcpView || (!targetAsset && keptServer)) && (
          <div className="flex min-w-0">
            <Tooltip label={(mcpView ? mcpView.transport : keptServer?.transport) ?? ""} placement="bottom">
              <span
                data-testid="inspector-transport"
                className="min-w-0 max-w-full truncate text-small font-mono px-2 py-px rounded-pill bg-tint text-ink-1 whitespace-nowrap"
              >
                {mcpView ? mcpView.transport : keptServer?.transport}
              </span>
            </Tooltip>
          </div>
        )}
        {/* R2 (Karthik, 2026-08-28): the scope line reads below the title it
            describes, not above it in caps — the column's own `gap-1`
            supplies the step, so this carries no margin of its own. */}
        {eyebrowShown && (
        <div className={`flex items-center gap-2 ${captionClass}`}>
          {linking ? (
            <button
              onClick={closeLinkFlow}
              aria-label={`Back to ${linking.name}`}
              className="flex items-center gap-1.5 text-ink-3 hover:text-ink-1 cursor-pointer transition-colors duration-hover ease-spring min-w-0"
            >
              <ChevronLeftIcon size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{linking.name}</span>
            </button>
          ) : (
            <>
              {/* The class repeats the parent's on purpose: getByText resolves this leaf, and a classless leaf pins nothing. */}
              <span className={captionClass}>
                {targetAsset ? null : selectedBubble ? `${selectedBubble.type} scope` : "Inspector"}
              </span>
            </>
          )}
          {selectedProjectScan?.layered && (
            <span className="flex items-center gap-1 text-state-danger">
              <ExclamationTriangleIcon size={10} />
              Layered rules
            </span>
          )}
        </div>
        )}
      </div>
      )}

      {/* Conditional Sub-components Coordinator */}
      {linking ? (
        <>
          {merge ? (
            <DiffChooser
              alignedSections={merge.sections}
              sectionChoices={sectionChoices}
              setSectionChoices={setSectionChoices}
              activeSectionIndex={activeSectionIndex}
              setActiveSectionIndex={setActiveSectionIndex}
              getMergedPreviewContent={getMergedPreviewContent}
              onApplyMerge={handleApplyMergeDeploy}
              onBack={() => setMerge(null)}
              deployError={mergeError}
              deployLoading={mergeRunning}
              deploySuccess={mergeDone}
            />
          ) : (
            <LinkPanel
              asset={linking}
              destinations={linkedProjects}
              inventory={inventory}
              preSelected={linkPreSelectedRepo}
              onCancel={closeLinkFlow}
              onLinked={onRefresh}
              onMergeRules={openMergeChooser}
            />
          )}
        </>
      ) : mcpView ? (
        /* An MCP server has N config paths, no version until a handshake, and
           17-20 tools. AssetDetail's flat one-name-one-path shape cannot hold
           it, so this category gets its own panel rather than widening that
           component into a dumping ground. */
        <McpServerDetail
          server={mcpView}
          verified={mcpVerified}
          verifying={mcpVerifying}
          onVerify={runMcpVerify}
          onAutoProbe={runMcpAutoProbe}
          declined={mcpDeclined}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
          onOpenConfig={onOpenConfig}
          switches={registrationSwitches}
          onSwitch={(key) => void switchRegistration(key)}
          linkedEngines={linkedEngines}
          onOpenEngine={onOpenEngine}
        />
      ) : !targetAsset && keptServer && switcher ? (
        <KeptServerDetail
          server={keptServer}
          switcher={switcher}
          onContext={onEngineContext}
          linkedEngines={linkedEngines}
          onOpenEngine={onOpenEngine}
          onShowDeclared={onShowDeclared}
        />
      ) : shownKeptSkill && switcher ? (
        <KeptSkillDetail skill={shownKeptSkill} />
      ) : targetAsset ? (
        // Link to… lives in the cap now (App.tsx), not this panel's own
        // action row — AssetDetail no longer takes an onLink prop.
        <AssetDetail
          asset={targetAsset as any}
          inventory={inventory}
          annotation={annotation}
          onDocumentPath={onAssetDocumentPath}
          tab={inspectorTab}
          onTabChange={setInspectorTab}
        />
      ) : selectedBubble ? (
        /* Regular flyout content list for bubble scope */
        <div className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-4 font-sans" ref={parentRef}>
          {/* Display project-wide warnings/drift logs */}
          {selectedProjectScan && selectedProjectScan.parse_warnings.length > 0 && (
            <div className="p-3.5 rounded-inner border border-line bg-plane flex flex-col gap-2">
              <span className="text-small font-medium text-state-warning flex items-center gap-1.5">
                <ExclamationTriangleIcon size={12} />
                Warnings Captured during Scan ({selectedProjectScan.parse_warnings.length})
              </span>
              <ul className="text-small text-ink-2 list-disc pl-4 flex flex-col gap-1">
                {selectedProjectScan.parse_warnings.map((warning, idx) => (
                  <li key={idx} className="font-mono break-all leading-caption">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-ink-3">
              <GlobeAltIcon className="mb-2" size={40} />
              <span className="text-small font-sans">No assets resolved in this scope.</span>
            </div>
          ) : (
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: "100%",
                position: "relative"
              }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const item = filteredAssets[virtualRow.index];
                return (
                  <div
                    key={virtualRow.index}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualRow.size}px`,
                      transform: `translateY(${virtualRow.start}px)`
                    }}
                    className="flex flex-col justify-center border-b border-transparent"
                  >
                    {item.type === "header" ? (
                      <div className={`${sectionHeadClass} py-2 mt-3 first:mt-0 mb-1`}>
                        {item.category}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-2 px-3 hover:bg-plane-2 rounded-inner transition-colors duration-hover ease-spring group font-sans">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            {item.isSymlink && (
                              <span title="Symlinked reference">
                                <LinkIcon size={12} className="text-state-success shrink-0" />
                              </span>
                            )}
                            <span className="text-base-app font-medium text-ink-1 truncate block max-w-[200px]">
                              {item.name}
                            </span>
                            {item.version && (
                              <span className={`${monoLabelClass} px-1.5 py-0.5 rounded-pill bg-plane-2`}>
                                {item.version}
                              </span>
                            )}
                            {item.drifted && (
                              <span className="text-small font-medium text-state-warning flex items-center gap-0.5 shrink-0 font-flex">
                                <ExclamationTriangleIcon size={10} />
                                drifted
                              </span>
                            )}
                          </div>
                          <span className="text-small text-ink-3 block truncate max-w-[300px] font-mono mt-0.5">
                            {item.path}
                          </span>
                          {item.details && (
                            <span className="text-small text-ink-3 block truncate mt-0.5">
                              {item.details}
                            </span>
                          )}
                        </div>

                        {/* Action buttons on hover */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.category !== "Agents" && item.category !== "Subagents" && (
                            <button
                              onClick={() => setLinking(item)}
                              className="opacity-0 group-hover:opacity-100 px-3 h-[22px] rounded-pill bg-fill text-on-fill text-small font-medium transition-opacity duration-hover cursor-pointer"
                            >
                              Link
                            </button>
                          )}
                          <span className="text-micro font-medium text-ink-3 bg-plane-2 px-2 py-0.5 rounded-pill font-flex group-hover:hidden">
                            {item.scopeBadge}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : emptyState ? (
        emptyState
      ) : (
        /* Empty Inspector State when no asset or bubble is selected */
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-ink-3 font-sans">
          <MousePointerClickIcon size={36} className="mb-2" />
          {/* Same words as ReviewInspector's empty state, so the two
              inspectors read as one. */}
          <span className="text-base-app font-medium text-ink-1 font-sans">Nothing selected</span>
          <span className={`${captionClass} mt-1`}>Pick an asset or a repository to see its details.</span>
        </div>
      )}
    </div>
  );
}
