import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  X,
  AlertTriangle,
  Link as LinkIcon,
  Globe,
} from "lucide-react";
import { Inventory } from "../App";
import DeployWizard, { FlatAssetItem, PreflightResult } from "./DeployWizard";
import DiffChooser, { AlignedSection } from "./DiffChooser";

interface FlyoutProps {
  width?: number;
  setWidth?: (w: number) => void;
  onClose?: () => void;
  selectedBubble?: { type: "project" | "agent"; id: string; name: string } | null;
  setSelectedBubble?: (val: null) => void;
  selectedAsset?: FlatAssetItem | { name: string; category: string; path: string; source_path?: string; is_symlink?: boolean; details?: string; scopeBadge?: string; version?: string } | null;
  initialDeployingAsset?: FlatAssetItem | null;
  inventory: Inventory;
  linkedProjects: string[];
  onRefresh: () => void;
}

interface RuleSection {
  heading: string | null;
  heading_level: number;
  content: string;
}

export default function Flyout({
  width = 280,
  setWidth,
  onClose,
  selectedBubble,
  setSelectedBubble,
  selectedAsset,
  initialDeployingAsset,
  inventory,
  linkedProjects,
  onRefresh
}: FlyoutProps) {
  const [deployingAsset, setDeployingAsset] = useState<FlatAssetItem | null>(null);

  useEffect(() => {
    if (initialDeployingAsset) {
      setDeployingAsset(initialDeployingAsset);
    } else {
      setDeployingAsset(null);
    }
  }, [initialDeployingAsset]);

  const [selectedDestProject, setSelectedDestProject] = useState<string>("");
  const [deployType, setDeployType] = useState<"symlink" | "copy">("symlink");
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflight, setPreflight] = useState<PreflightResult | null>(null);
  const [deployLoading, setDeployLoading] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  // Rules target memory state
  const [rememberedTarget, setRememberedTarget] = useState<string | null>(null);
  const [selectedTargetRulePath, setSelectedTargetRulePath] = useState<string>("");
  
  const [showMergeChooser, setShowMergeChooser] = useState(false);
  const [alignedSections, setAlignedSections] = useState<AlignedSection[]>([]);
  const [sectionChoices, setSectionChoices] = useState<Record<string, "source" | "target" | "skip" | "both">>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);

  // Drag Resizing Logic for docked right inspector
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rawWidth = startWidth - (moveEvent.clientX - startX);
      const newWidth = Math.max(220, Math.min(480, rawWidth));
      if (setWidth) setWidth(newWidth);
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      
      const rawWidth = startWidth - (moveEvent.clientX - startX);
      const finalWidth = Math.max(220, Math.min(480, rawWidth));
      if (setWidth) setWidth(finalWidth);
      invoke("set_preference", { key: "inspector_width", value: String(finalWidth) }).catch((err) => {
        console.error("Failed to save inspector_width preference:", err);
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

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

  // Resolve matching rules at destination
  const getDestRules = () => {
    if (!deployingAsset || !selectedDestProject) return [];
    return inventory.rules
      .filter(
        (r) => r.scope?.Project?.root === selectedDestProject && r.name === deployingAsset.name
      )
      .sort((a, b) => {
        return a.path.split("/").length - b.path.split("/").length;
      });
  };

  const destRules = getDestRules();

  // Load target memory when dest project changes
  useEffect(() => {
    if (deployingAsset?.category === "Rules" && selectedDestProject) {
      invoke<string | null>("get_rules_target_memory", {
        projectPath: selectedDestProject,
        rulePath: deployingAsset.name
      }).then((res) => {
        setRememberedTarget(res);
        if (res && destRules.some((r) => r.path === res)) {
          setSelectedTargetRulePath(res);
        } else if (destRules.length > 0) {
          setSelectedTargetRulePath(destRules[0].path);
        } else {
          setSelectedTargetRulePath("");
        }
      });
    } else {
      setRememberedTarget(null);
      setSelectedTargetRulePath("");
    }
  }, [selectedDestProject, deployingAsset]);

  // Run pre-flight check when destination changes
  useEffect(() => {
    if (!deployingAsset || !selectedDestProject) {
      setPreflight(null);
      return;
    }
    const runPreflight = async () => {
      setPreflightLoading(true);
      setDeployError(null);
      try {
        const res = await invoke<PreflightResult>("check_deploy_target", {
          sourcePath: deployingAsset.path,
          targetProjectPath: selectedDestProject
        });
        setPreflight(res);
      } catch (err: any) {
        setDeployError(String(err));
      } finally {
        setPreflightLoading(false);
      }
    };
    runPreflight();
  }, [selectedDestProject, deployingAsset]);

  const handleExecuteDeploy = async () => {
    if (!deployingAsset || !selectedDestProject) return;
    setDeployLoading(true);
    setDeployError(null);
    setDeploySuccess(false);
    try {
      await invoke("execute_deploy", {
        sourcePath: deployingAsset.path,
        targetProjectPath: selectedDestProject,
        deployType
      });
      setDeploySuccess(true);
      onRefresh();
      setTimeout(() => {
        setDeployingAsset(null);
        setDeploySuccess(false);
        setPreflight(null);
        setSelectedDestProject("");
      }, 1500);
    } catch (err: any) {
      setDeployError(String(err));
    } finally {
      setDeployLoading(false);
    }
  };

  const handleResetTargetMemory = async () => {
    if (!deployingAsset || !selectedDestProject) return;
    try {
      await invoke("clear_rules_target_memory", {
        projectPath: selectedDestProject,
        rulePath: deployingAsset.name
      });
      setRememberedTarget(null);
      if (destRules.length > 0) {
        setSelectedTargetRulePath(destRules[0].path);
      }
    } catch (err: any) {
      setDeployError(String(err));
    }
  };

  // Open rules merge diff view
  const handleOpenMergeChooser = async () => {
    if (!deployingAsset || !selectedTargetRulePath) return;
    setDeployError(null);
    try {
      const data = await invoke<any>("get_rule_sections", {
        sourcePath: deployingAsset.path,
        targetPath: selectedTargetRulePath
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

      setAlignedSections(list);

      const initialChoices: Record<string, "source" | "target" | "skip" | "both"> = {};
      list.forEach((sec) => {
        const key = sec.heading || "__preamble";
        if (sec.sourceContent === sec.targetContent) {
          initialChoices[key] = "target";
        } else if (sec.sourceContent && !sec.targetContent) {
          initialChoices[key] = "source";
        } else if (sec.targetContent && !sec.sourceContent) {
          initialChoices[key] = "target";
        } else {
          initialChoices[key] = "target";
        }
      });

      setSectionChoices(initialChoices);
      setActiveSectionIndex(0);
      setShowMergeChooser(true);
    } catch (err: any) {
      setDeployError(String(err));
    }
  };

  const getMergedPreviewContent = () => {
    return alignedSections
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
    if (!selectedTargetRulePath || !deployingAsset || !selectedDestProject) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const mergedText = getMergedPreviewContent();

      await invoke("execute_deploy_merged_rule", {
        targetPath: selectedTargetRulePath,
        mergedContent: mergedText
      });

      await invoke("set_rules_target_memory", {
        projectPath: selectedDestProject,
        rulePath: deployingAsset.name,
        targetFile: selectedTargetRulePath
      });

      setDeploySuccess(true);
      onRefresh();
      
      setTimeout(() => {
        setShowMergeChooser(false);
        setDeployingAsset(null);
        setDeploySuccess(false);
        setPreflight(null);
        setSelectedDestProject("");
      }, 1200);
    } catch (err: any) {
      setDeployError(String(err));
    } finally {
      setDeployLoading(false);
    }
  };

  const targetAsset = selectedAsset || (initialDeployingAsset ? initialDeployingAsset : null);

  return (
    <aside
      style={{ width: `${width}px` }}
      className="h-full bg-surface border-l border-n-100 flex flex-col relative shrink-0 overflow-hidden"
    >
      {/* Drag Resize Handle on Left Edge */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-col-resize hover:bg-accent/40 active:bg-accent z-10 transition-colors"
      />

      {/* Header */}
      <div className="p-4 border-b border-n-100 flex justify-between items-center bg-surface shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-text-primary px-2 py-0.5 rounded-full bg-n-50 border border-n-100">
              {targetAsset ? targetAsset.category : selectedBubble ? `${selectedBubble.type} scope` : "Inspector"}
            </span>
            {selectedProjectScan?.layered && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-error-text bg-error-bg border border-error-border px-2 py-0.5 rounded-xs flex items-center gap-1 font-sans">
                <AlertTriangle size={10} />
                Layered Rules
              </span>
            )}
          </div>
          <h2 className="text-sm font-bold mt-1 text-text-primary truncate max-w-[280px] font-sans">
            {targetAsset ? targetAsset.name : selectedBubble ? selectedBubble.name : "Asset Inspector"}
          </h2>
        </div>
        <button
          onClick={() => {
            if (onClose) onClose();
            if (setSelectedBubble) setSelectedBubble(null);
          }}
          className="p-1.5 rounded-full border border-n-100 bg-surface hover:text-text-primary text-text-secondary cursor-pointer transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Conditional Sub-components Coordinator */}
      {deployingAsset ? (
        <>
          {showMergeChooser ? (
            <DiffChooser
              alignedSections={alignedSections}
              sectionChoices={sectionChoices}
              setSectionChoices={setSectionChoices}
              activeSectionIndex={activeSectionIndex}
              setActiveSectionIndex={setActiveSectionIndex}
              getMergedPreviewContent={getMergedPreviewContent}
              onApplyMerge={handleApplyMergeDeploy}
              onBack={() => setShowMergeChooser(false)}
              deployError={deployError}
              deployLoading={deployLoading}
              deploySuccess={deploySuccess}
            />
          ) : (
            <DeployWizard
              deployingAsset={deployingAsset}
              linkedProjects={linkedProjects}
              selectedDestProject={selectedDestProject}
              setSelectedDestProject={setSelectedDestProject}
              destRules={destRules}
              rememberedTarget={rememberedTarget}
              selectedTargetRulePath={selectedTargetRulePath}
              setSelectedTargetRulePath={setSelectedTargetRulePath}
              deployType={deployType}
              setDeployType={setDeployType}
              preflightLoading={preflightLoading}
              preflight={preflight}
              deployLoading={deployLoading}
              deploySuccess={deploySuccess}
              deployError={deployError}
              onExecuteDeploy={handleExecuteDeploy}
              onOpenMergeChooser={handleOpenMergeChooser}
              onResetTargetMemory={handleResetTargetMemory}
              onCancel={() => {
                setDeployingAsset(null);
                setPreflight(null);
                setSelectedDestProject("");
              }}
            />
          )}
        </>
      ) : targetAsset ? (
        /* Selected Asset Detail View: Render full path in SF Mono without truncation */
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 font-sans">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary bg-surface px-2 py-0.5 rounded-control border border-n-100 font-sans">
              {targetAsset.scopeBadge || "Project"}
            </span>
            {targetAsset.version && (
              <span className="text-[10px] font-mono font-medium text-text-muted px-1.5 py-0.2 border border-n-100 rounded-control bg-surface">
                {targetAsset.version}
              </span>
            )}
          </div>

          {/* Full Path Rendering in SF Mono (font-mono), no truncation, break-all */}
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted font-sans">
              Path
            </span>
            <div className="text-xs font-mono text-text-primary bg-surface border border-n-100 p-2.5 rounded-control break-all leading-relaxed select-all">
              {targetAsset.path}
            </div>
          </div>

          {/* Resolved Target Path (if symlink or has source_path/source_origin) */}
          {((targetAsset as any).source_path || (targetAsset as any).source_origin || (((targetAsset as any).isSymlink || (targetAsset as any).is_symlink) && targetAsset.details?.includes("Origin:"))) && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted font-sans">
                Target Path
              </span>
              <div className="text-xs font-mono text-text-primary bg-surface border border-n-100 p-2.5 rounded-control break-all leading-relaxed select-all">
                {(targetAsset as any).source_path || (targetAsset as any).source_origin || targetAsset.details?.replace("Origin: ", "")}
              </div>
            </div>
          )}

          {targetAsset.details && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-text-muted font-sans">
                Details
              </span>
              <p className="text-xs text-text-secondary font-sans">
                {targetAsset.details}
              </p>
            </div>
          )}

          {targetAsset.category !== "Agents" && targetAsset.category !== "Subagents" && (
            <button
              onClick={() => setDeployingAsset(targetAsset as FlatAssetItem)}
              className="mt-2 py-2 px-4 rounded-control bg-accent text-on-accent text-xs font-medium tracking-wide uppercase transition-all cursor-pointer hover:opacity-95 text-center font-sans"
            >
              Deploy Asset
            </button>
          )}
        </div>
      ) : selectedBubble ? (
        /* Regular flyout content list for bubble scope */
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 font-sans" ref={parentRef}>
          {/* Display project-wide warnings/drift logs */}
          {selectedProjectScan && selectedProjectScan.parse_warnings.length > 0 && (
            <div className="p-4 rounded-md border border-warning-border bg-warning-bg text-warning-text flex flex-col gap-2 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-sans">
                <AlertTriangle size={12} />
                Warnings Captured during Scan ({selectedProjectScan.parse_warnings.length})
              </span>
              <ul className="text-xs list-disc pl-4 flex flex-col gap-1">
                {selectedProjectScan.parse_warnings.map((warning, idx) => (
                  <li key={idx} className="font-mono break-all leading-relaxed">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-text-muted">
              <Globe className="stroke-[1.5] mb-2" size={40} />
              <span className="text-ui font-sans">No assets resolved in this scope.</span>
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
                      <div className="text-xs font-bold text-text-muted uppercase tracking-wider py-2 border-b border-n-100 mt-3 first:mt-0 mb-1 font-sans">
                        {item.category}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-2 px-3 hover:bg-n-25 rounded-md border border-transparent hover:border-n-100 transition-all group font-sans">
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-2">
                            {item.isSymlink && (
                              <span title="Symlinked reference">
                                <LinkIcon size={12} className="text-accent shrink-0" />
                              </span>
                            )}
                            <span className="text-sm font-semibold text-text-primary truncate block max-w-[200px]">
                              {item.name}
                            </span>
                            {item.version && (
                              <span className="text-[10px] font-mono font-bold text-text-muted px-1.5 py-0.2 border border-n-100 rounded bg-surface">
                                {item.version}
                              </span>
                            )}
                            {item.drifted && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-warning-text bg-warning-bg border border-warning-border px-1.5 py-0.2 rounded flex items-center gap-0.5 shrink-0">
                                <AlertTriangle size={10} />
                                drifted
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-text-muted block truncate max-w-[300px] font-mono mt-0.5">
                            {item.path}
                          </span>
                          {item.details && (
                            <span className="text-[10px] text-text-muted block truncate mt-0.5">
                              {item.details}
                            </span>
                          )}
                        </div>

                        {/* Action buttons on hover */}
                        <div className="flex items-center gap-2 shrink-0">
                          {item.category !== "Agents" && item.category !== "Subagents" && (
                            <button
                              onClick={() => setDeployingAsset(item)}
                              className="opacity-0 group-hover:opacity-100 px-3 py-1 rounded-md bg-accent text-on-accent text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer shadow-sm hover:opacity-95"
                            >
                              Deploy
                            </button>
                          )}
                          <span className="text-[10px] font-semibold text-text-muted bg-surface px-2 py-0.5 rounded-xs border border-n-100 shadow-sm group-hover:hidden">
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
      ) : (
        /* Empty Inspector State when no asset or bubble is selected */
        <div className="flex-1 p-6 flex flex-col items-center justify-center text-center text-text-muted font-sans">
          <Globe className="stroke-[1.5] mb-2 opacity-50" size={36} />
          <span className="text-xs text-text-primary font-sans">No Item Selected</span>
          <span className="text-xs text-text-muted mt-1">Select an asset or repository to inspect details.</span>
        </div>
      )}
    </aside>
  );
}
