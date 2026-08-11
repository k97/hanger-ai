import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Loader2, AlertTriangle, Check, Globe, FileText } from "lucide-react";
import { AssetItem } from "./AssetRow";
import DiffChooser, { AlignedSection } from "./DiffChooser";
import { Inventory } from "../App";

interface PreflightResult {
  collision: boolean;
  target_exists: boolean;
  has_permissions: boolean;
  warning: string | null;
}

interface RuleSection {
  heading: string | null;
  heading_level: number;
  content: string;
}

interface LinkAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: AssetItem | null;
  linkedProjects: string[];
  inventory: Inventory | null;
  onLinkComplete: () => void;
  preSelectedRepo?: string; // Scoped target repo
}

export default function LinkAssetModal({
  isOpen,
  onClose,
  asset,
  linkedProjects,
  inventory,
  onLinkComplete,
  preSelectedRepo,
}: LinkAssetModalProps) {
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

  // Pre-fill target if pre-selected repo is passed
  useEffect(() => {
    if (isOpen) {
      if (preSelectedRepo) {
        setSelectedDestProject(preSelectedRepo);
      } else {
        setSelectedDestProject("");
      }
      setDeployType("symlink");
      setPreflight(null);
      setDeployError(null);
      setDeploySuccess(false);
      setShowMergeChooser(false);
    }
  }, [isOpen, preSelectedRepo]);

  // Find candidate rules in selected destination project
  const getDestRules = () => {
    if (!asset || asset.category !== "Rules" || !selectedDestProject || !inventory) return [];
    return (inventory.rules || [])
      .filter(
        (r) => r.scope?.Project?.root === selectedDestProject && r.name === asset.name
      )
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  };

  const destRules = getDestRules();

  // Load target memory when dest project changes
  useEffect(() => {
    if (asset?.category === "Rules" && selectedDestProject) {
      invoke<string | null>("get_rules_target_memory", {
        projectPath: selectedDestProject,
        rulePath: asset.name,
      })
        .then((res) => {
          setRememberedTarget(res);
          if (res && destRules.some((r) => r.path === res)) {
            setSelectedTargetRulePath(res);
          } else if (destRules.length > 0) {
            setSelectedTargetRulePath(destRules[0].path);
          } else {
            setSelectedTargetRulePath(`${selectedDestProject}/${asset.name}`);
          }
        })
        .catch(() => {
          setRememberedTarget(null);
          setSelectedTargetRulePath(`${selectedDestProject}/${asset.name}`);
        });
    } else {
      setRememberedTarget(null);
      setSelectedTargetRulePath("");
    }
  }, [selectedDestProject, asset]);

  // Run pre-flight check when destination changes
  useEffect(() => {
    if (!asset || !selectedDestProject) {
      setPreflight(null);
      return;
    }
    const runPreflight = async () => {
      setPreflightLoading(true);
      setDeployError(null);
      try {
        const res = await invoke<PreflightResult>("check_deploy_target", {
          sourcePath: asset.path,
          targetProjectPath: selectedDestProject,
        });
        setPreflight(res);
      } catch (err: any) {
        setDeployError(String(err));
      } finally {
        setPreflightLoading(false);
      }
    };
    runPreflight();
  }, [selectedDestProject, asset]);

  const handleExecuteDeploy = async () => {
    if (!asset || !selectedDestProject) return;
    setDeployLoading(true);
    setDeployError(null);
    setDeploySuccess(false);
    try {
      await invoke("execute_deploy", {
        sourcePath: asset.path,
        targetProjectPath: selectedDestProject,
        deployType,
      });
      setDeploySuccess(true);
      onLinkComplete();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err: any) {
      setDeployError(String(err));
    } finally {
      setDeployLoading(false);
    }
  };

  const handleOpenMergeChooser = async () => {
    if (!asset || !selectedTargetRulePath) return;
    setDeployError(null);
    try {
      const data = await invoke<any>("get_rule_sections", {
        sourcePath: asset.path,
        targetPath: selectedTargetRulePath,
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
          targetContent: targetPreamble?.content,
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
            targetContent: tgt?.content,
          });
        }
      });

      targetSecs.forEach((t) => {
        if (t.heading && t.heading_level > 0 && !seenHeadings.has(t.heading)) {
          list.push({
            heading: t.heading,
            sourceContent: undefined,
            targetContent: t.content,
          });
        }
      });

      setAlignedSections(list);

      const initialChoices: Record<string, "source" | "target" | "skip" | "both"> = {};
      list.forEach((sec) => {
        const key = sec.heading || "__preamble";
        if (sec.sourceContent && sec.targetContent) {
          initialChoices[key] = "target";
        } else if (sec.sourceContent) {
          initialChoices[key] = "source";
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
    if (!selectedTargetRulePath || !asset || !selectedDestProject) return;
    setDeployLoading(true);
    setDeployError(null);
    try {
      const mergedText = getMergedPreviewContent();

      await invoke("execute_deploy_merged_rule", {
        targetPath: selectedTargetRulePath,
        mergedContent: mergedText,
      });

      await invoke("set_rules_target_memory", {
        projectPath: selectedDestProject,
        rulePath: asset.name,
        targetFile: selectedTargetRulePath,
      });

      setDeploySuccess(true);
      onLinkComplete();
      setTimeout(() => {
        setShowMergeChooser(false);
        onClose();
      }, 1500);
    } catch (err: any) {
      setDeployError(String(err));
    } finally {
      setDeployLoading(false);
    }
  };

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 bg-scrim flex items-center justify-center z-50 animate-fade-in">
      <div className="w-full max-w-lg bg-surface rounded-[21px] border border-n-100 shadow-2xl p-6 relative flex flex-col max-h-[85vh] overflow-hidden font-sans">
        
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
          <>
            <div className="flex justify-between items-center border-b border-n-100 pb-4 mb-4 shrink-0">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                  Link Asset
                </span>
                <h3 className="text-title font-bold text-text-primary mt-1 truncate max-w-[320px]">
                  {asset.name}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-full hover:bg-n-25 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {deploySuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 text-success-text py-12 shrink-0">
                <div className="w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce">
                  <Check size={24} />
                </div>
                <span className="text-sm font-bold mt-2">Asset Linked Successfully!</span>
                <span className="text-xs text-text-muted">Updating repositories...</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-5 min-h-0">
                {/* Repository dropdown */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-xs font-bold text-text-muted uppercase">Target Repository</label>
                  <select
                    id="link-repo-select"
                    value={selectedDestProject}
                    disabled={!!preSelectedRepo}
                    onChange={(e) => setSelectedDestProject(e.target.value)}
                    className="w-full px-3 py-2 rounded-full border border-n-100 bg-surface text-text-secondary text-xs focus:ring-1 focus:ring-accent outline-none font-mono cursor-pointer"
                  >
                    <option value="">-- Choose destination root --</option>
                    {linkedProjects.map((proj) => (
                      <option key={proj} value={proj}>
                        {proj}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Rule Chooser */}
                {asset.category === "Rules" && selectedDestProject && (
                  <div className="flex flex-col gap-3 p-4 rounded-xl bg-surface border border-n-100 shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none">
                      <FileText size={12} />
                      Rule Destination Target Path
                    </span>

                    {rememberedTarget ? (
                      <div className="flex items-center justify-between bg-n-50 border border-n-100 rounded-xl p-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] uppercase font-bold text-accent">Remembered Target</span>
                          <span className="text-xs font-mono text-text-secondary truncate max-w-[280px]">{rememberedTarget}</span>
                        </div>
                        <button
                          onClick={() => setRememberedTarget(null)}
                          className="p-1 rounded text-text-muted hover:text-error-text hover:bg-n-25 transition-all cursor-pointer text-[10px] font-bold uppercase"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-xs text-text-muted">
                          Select the specific destination rule file path in the target project:
                        </p>
                        <select
                          value={selectedTargetRulePath}
                          onChange={(e) => setSelectedTargetRulePath(e.target.value)}
                          className="w-full px-3 py-2 rounded-full border border-n-100 bg-surface text-text-secondary text-xs font-mono cursor-pointer"
                        >
                          {destRules.map((r) => (
                            <option key={r.path} value={r.path}>
                              {r.path}
                            </option>
                          ))}
                          <option value={`${selectedDestProject}/${asset.name}`}>
                            [Create New] {selectedDestProject}/{asset.name}
                          </option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Symlink vs Copy Selector */}
                {(!preflight?.collision || asset.category !== "Rules") && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <label className="text-xs font-bold text-text-muted uppercase">Link Type</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setDeployType("symlink")}
                        className={`flex flex-col p-4 rounded-xl border text-left cursor-pointer transition-all ${
                          deployType === "symlink"
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "border-n-100 hover:border-accent bg-surface"
                        }`}
                      >
                        <span className="text-xs font-bold text-text-primary">Symlink</span>
                        <span className="text-[10px] text-text-muted mt-1 leading-normal">
                          Unified team rule updates with zero drift.
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeployType("copy")}
                        className={`flex flex-col p-4 rounded-xl border text-left cursor-pointer transition-all ${
                          deployType === "copy"
                            ? "border-accent bg-accent/5 ring-1 ring-accent"
                            : "border-n-100 hover:border-accent bg-surface"
                        }`}
                      >
                        <span className="text-xs font-bold text-text-primary">Hard Copy</span>
                        <span className="text-[10px] text-text-muted mt-1 leading-normal">
                          Independent copy. Drift is tracked.
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Preflight Checks */}
                {selectedDestProject && (
                  <div className="flex flex-col gap-2 p-4 rounded-xl border border-n-100 bg-surface shrink-0">
                    <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none">
                      <Globe size={12} />
                      Pre-flight Verification
                    </span>

                    {preflightLoading ? (
                      <div className="flex items-center gap-2 text-text-muted text-xs py-2">
                        <Loader2 className="animate-spin" size={12} />
                        Running pre-flight checks...
                      </div>
                    ) : preflight ? (
                      <div className="flex flex-col gap-2 mt-1">
                        {preflight.collision ? (
                          asset.category === "Rules" ? (
                            <div className="flex items-start gap-2 p-2 border border-warning-border bg-warning-bg text-warning-text text-xs rounded-xl leading-normal">
                              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Collision:</span> Heading block conflict detected. Merging requires section diff merge chooser. Overwrite is disabled.
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 p-2 border border-error-border bg-error-bg text-error-text text-xs rounded-xl leading-normal">
                              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Collision Warning:</span> Destination path already exists. Confirming will overwrite the existing asset.
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="flex items-start gap-1.5 text-success-text text-xs font-semibold py-1">
                            <Check size={14} />
                            Destination path clear. Safe to link.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Actions footer */}
                {deployError && (
                  <div className="p-2.5 border border-error-border bg-error-bg text-error-text text-xs rounded-xl font-mono shrink-0">
                    {deployError}
                  </div>
                )}

                <div className="flex gap-3 justify-end mt-auto pt-4 border-t border-n-100 shrink-0">
                  {preflight?.collision && asset.category === "Rules" ? (
                    <button
                      id="link-merge-button"
                      disabled={deployLoading || preflightLoading}
                      onClick={handleOpenMergeChooser}
                      className="flex-1 py-2.5 rounded-full bg-accent text-on-accent font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm"
                    >
                      Compare & Merge Rules...
                    </button>
                  ) : (
                    <button
                      id="link-execute-button"
                      disabled={!selectedDestProject || deployLoading || preflightLoading}
                      onClick={handleExecuteDeploy}
                      className="flex-1 py-2.5 rounded-full bg-accent text-on-accent font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm"
                    >
                      {deployLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <Loader2 className="animate-spin" size={12} />
                          Linking...
                        </span>
                      ) : preflight?.collision ? (
                        "Overwrite & Link"
                      ) : (
                        "Link Asset"
                      )}
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-6 py-2.5 rounded-full border border-n-100 bg-n-50 text-text-secondary hover:text-text-primary transition-colors text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
