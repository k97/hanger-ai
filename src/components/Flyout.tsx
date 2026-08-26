import { useState, useRef, useEffect } from "react";
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
import McpServerDetail from "./McpServerDetail";
import McpEngineSummary, { type McpEngineSummaryData } from "./McpEngineSummary";
import BrandIcon from "./BrandIcon";
import { buildMcpServerView, type ProcessMatch } from "../utils/mcpServerView";
import { parseProbe, type ProbeView, type ProbeWire } from "../utils/probeView";
import LinkPanel from "./LinkPanel";
import DiffChooser, { AlignedSection } from "./DiffChooser";
import { categoryNoun } from "../utils/prose";
import { documentKindFor } from "../utils/skillDocument";

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
   *  profile's disclosure needs the same answer and the command rescans. */
  mcpProcesses?: ProcessMatch[] | null;
  linkedProjects: string[];
  onRefresh: () => void;
  /** The selected asset's backend annotation, passed straight through to
   *  AssetDetail so the panel can answer for every engine. The Reach column
   *  shows at most three marks. */
  annotation?: AssetAnnotationView | null;
  /** The category filter active in whichever pane is showing (App.tsx owns
   *  both the profile facet chip and the repo one). Only "Tools" changes
   *  anything here — the empty inspector otherwise stays silent, since a
   *  Skills-filtered view has no business naming MCP servers. */
  activeCategory?: string | null;
  /** The crumb's last segment for the active pane — "Global" or a
   *  repository's folder name. App.tsx already derives this for the
   *  breadcrumb; the empty state reuses it rather than recomputing or
   *  hardcoding "Global". Only read when activeCategory is "Tools". */
  paneScope?: string;
  /** Whether the pane showing this inspector is a repository, not the
   *  global store — App.tsx's own `selectedSidebarItem.startsWith("/") ||
   *  .startsWith("~")` check, the same one that already picks
   *  `repoCategory` vs `profileCategory` for `activeCategory`. Fix round 1,
   *  item 5: `McpEngineSummary` is a machine-wide read
   *  (`discover_machine`, not scoped to any one repo's `.mcp.json`), so it
   *  renders only when this is `false` — a repo pane keeps the prior empty
   *  body instead of a machine-wide table sitting under that repo's own
   *  heading. */
  isRepoScope?: boolean;
  /** The cap's Open in editor / Copy path / Reveal act on the document
   *  AssetDetail actually read, not the folder its asset names (a skill's
   *  own path is the folder holding it). App.tsx owns the cap, so this
   *  callback just carries AssetDetail's own `onDocumentPath` one level up. */
  onAssetDocumentPath?: (path: string) => void;
}

interface RuleSection {
  heading: string | null;
  heading_level: number;
  content: string;
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
  activeCategory,
  paneScope,
  isRepoScope,
  onAssetDocumentPath
}: FlyoutProps) {
  const [linking, setLinking] = useState<FlatAssetItem | null>(null);

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
            isSymlink: s.is_symlink || false
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
            isSymlink: s.is_symlink || false
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

  /* Nothing is selected, but the pane's own filter already says what kind of
     thing an empty result set would have held. Scoped to "Tools" only —
     Karthik's ruling, 2026-08-18: a Skills-filtered view must not claim
     "MCP servers" over its own empty list. */
  const showEmptyMcpEyebrow =
    !linking && !targetAsset && !selectedBubble && activeCategory === "Tools";

  /* Whether the eyebrow row has anything left to say. A selected asset's own
     kind · place moved to the cap, so `targetAsset` alone no longer earns
     the row; linking (the "Back to" nav), a bubble scope with no asset
     drilled into, the empty-MCP category label, and the layered-rules flag
     can all still occupy it — the last of those independently of
     `targetAsset`, since selecting an asset inside a layered project does
     not make the project stop being layered. */
  const eyebrowShown = Boolean(
    linking || (!targetAsset && (selectedBubble || showEmptyMcpEyebrow)) || selectedProjectScan?.layered
  );

  /* The chrome (eyebrow) is the same for a repo pane and the global one --
     it already names whichever scope it is via `paneScope`. The BODY is
     not: `McpEngineSummary` is a machine-wide read (`discover_machine`
     walks every host's config, not one repo's `.mcp.json`), so a repo pane
     showing it would sit a machine-wide table under that repo's own
     heading, naming servers the repo doesn't declare and omitting the ones
     it does. Fix round 1, item 5 -- the reviewer found this live. The repo
     case keeps the prior generic empty body instead; a repo-scoped
     equivalent is future work, not this round. */
  const showEngineSummary = showEmptyMcpEyebrow && !isRepoScope;

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

  /* McpEngineSummary's own data, fetched here rather than threaded down
     from App -- the same division of labour as `mcp_cached_probe` above:
     this panel's own local questions get their own local fetch. `null`
     until the answer arrives, which McpEngineSummary's caller (below) reads
     as "say nothing yet" rather than an empty table -- pending is not a
     finding (ui-copy.md). Re-asked every time the empty MCP state comes
     into view, the same "the panel opened" trigger `onAutoProbe` already
     uses, rather than once per mount: this state does not unmount between
     selections, so a fetch gated on mount alone would go stale the moment
     a scan or a probe changed what the backend would now answer. Gated on
     `showEngineSummary`, not just `showEmptyMcpEyebrow`: a repo pane never
     shows this body, so it has no reason to ask the backend for it either. */
  const [mcpEngineSummary, setMcpEngineSummary] = useState<McpEngineSummaryData | null>(null);
  useEffect(() => {
    if (!showEngineSummary) return;
    let cancelled = false;
    invoke<McpEngineSummaryData>("get_mcp_engine_summary")
      .then((r) => {
        if (!cancelled) setMcpEngineSummary(r);
      })
      .catch(() => {
        if (!cancelled) setMcpEngineSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [showEngineSummary]);

  return (
    // Column chrome (width, resize, the cap and its close) lives in App.tsx:
    // this component is only the inspector's body for the machine views.
    <div className="h-full bg-page flex flex-col relative overflow-hidden">
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
          opens with, and every pixel taken here comes off the content. */}
      {(linking || targetAsset || selectedBubble || showEmptyMcpEyebrow) && (
      <div
        data-testid="inspector-header"
        className={`px-[18px] pt-2 pb-4 shrink-0${tabsFollow ? "" : " border-b border-line"}`}
      >
        {eyebrowShown && (
        <div className="flex items-center gap-2 font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3">
          {linking ? (
            <button
              onClick={closeLinkFlow}
              aria-label={`Back to ${linking.name}`}
              className="flex items-center gap-1.5 tracking-[.06em] uppercase text-ink-3 hover:text-ink-1 cursor-pointer transition-colors duration-hover ease-spring min-w-0"
            >
              <ChevronLeftIcon size={12} aria-hidden="true" className="shrink-0" />
              <span className="truncate">{linking.name}</span>
            </button>
          ) : (
            <>
              <span>
                {targetAsset
                  ? null
                  : selectedBubble
                  ? `${selectedBubble.type} scope`
                  : showEmptyMcpEyebrow
                  ? categoryNoun("Tools", "many")
                  : "Inspector"}
              </span>
              {showEmptyMcpEyebrow && paneScope && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">{paneScope}</span>
                </>
              )}
            </>
          )}
          {selectedProjectScan?.layered && (
            <span className="flex items-center gap-1 text-state-danger normal-case tracking-normal">
              <ExclamationTriangleIcon size={10} />
              Layered rules
            </span>
          )}
        </div>
        )}
        {!showEmptyMcpEyebrow && (
        <div className={`flex items-center gap-2 min-w-0 ${eyebrowShown ? "mt-1" : ""}`}>
          {!linking && !targetAsset && selectedBubble?.type === "agent" && (
            <BrandIcon engineKey={selectedBubble.id} engineName={selectedBubble.name} size={16} />
          )}
          <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 truncate max-w-[280px] font-sans">
            {linking
              ? "Link to projects"
              : targetAsset
              ? targetAsset.name
              : selectedBubble
              ? selectedBubble.name
              : "Asset Inspector"}
          </h2>
          {/* Transport rides the heading rather than owning a row of its own —
              one short token does not earn 18px of vertical padding. */}
          {!linking && mcpView && (
            <span className="shrink-0 text-micro font-mono px-2 py-px rounded-pill bg-tint text-ink-1 whitespace-nowrap">
              {mcpView.transport}
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
        />
      ) : targetAsset ? (
        // Link to… lives in the cap now (App.tsx), not this panel's own
        // action row — AssetDetail no longer takes an onLink prop.
        <AssetDetail
          asset={targetAsset as any}
          inventory={inventory}
          annotation={annotation}
          onDocumentPath={onAssetDocumentPath}
        />
      ) : selectedBubble ? (
        /* Regular flyout content list for bubble scope */
        <div className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-4 font-sans" ref={parentRef}>
          {/* Display project-wide warnings/drift logs */}
          {selectedProjectScan && selectedProjectScan.parse_warnings.length > 0 && (
            <div className="p-3.5 rounded-inner border border-line bg-plane flex flex-col gap-2">
              <span className="text-micro font-medium uppercase tracking-[.06em] text-state-warning flex items-center gap-1.5 font-flex">
                <ExclamationTriangleIcon size={12} />
                Warnings Captured during Scan ({selectedProjectScan.parse_warnings.length})
              </span>
              <ul className="text-small text-ink-2 list-disc pl-4 flex flex-col gap-1">
                {selectedProjectScan.parse_warnings.map((warning, idx) => (
                  <li key={idx} className="font-mono break-all leading-relaxed">
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
                      <div className="text-micro font-medium text-ink-3 uppercase tracking-[.06em] py-2 mt-3 first:mt-0 mb-1 font-flex">
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
                              <span className="text-micro font-mono text-ink-3 px-1.5 py-0.5 rounded-pill bg-plane-2">
                                {item.version}
                              </span>
                            )}
                            {item.drifted && (
                              <span className="text-micro font-medium text-state-warning flex items-center gap-0.5 shrink-0 font-flex">
                                <ExclamationTriangleIcon size={10} />
                                drifted
                              </span>
                            )}
                          </div>
                          <span className="text-micro text-ink-3 block truncate max-w-[300px] font-mono mt-0.5">
                            {item.path}
                          </span>
                          {item.details && (
                            <span className="text-micro text-ink-3 block truncate mt-0.5">
                              {item.details}
                            </span>
                          )}
                        </div>

                        {/* Action buttons on hover */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.category !== "Agents" && item.category !== "Subagents" && (
                            <button
                              onClick={() => setLinking(item)}
                              className="opacity-0 group-hover:opacity-100 px-3 h-[22px] rounded-pill bg-fill text-on-fill text-micro font-medium transition-opacity duration-hover cursor-pointer"
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
      ) : showEngineSummary ? (
        /* The Tools filter is active, nothing is selected, and this is the
           global pane -- a repo pane falls through to the generic empty
           body below instead (item 5). `null` while the fetch is in flight
           (or found genuinely nothing to group) -- McpEngineSummary itself
           is the only thing that decides whether it has something to show;
           a table this component built around a still-loading answer would
           be the pending-as-finding mistake ui-copy.md rules out. */
        mcpEngineSummary && <McpEngineSummary summary={mcpEngineSummary} />
      ) : (
        /* Empty Inspector State when no asset or bubble is selected */
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-ink-3 font-sans">
          <MousePointerClickIcon size={36} className="mb-2" />
          {/* Same words as ReviewInspector's empty state, so the two
              inspectors read as one. */}
          <span className="text-small font-medium text-ink-1 font-sans">Nothing selected</span>
          <span className="text-small text-ink-3 mt-1">Pick an asset or a repository to see its details.</span>
        </div>
      )}
    </div>
  );
}
