import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon, SpinnerIcon, ExclamationTriangleIcon, CheckIcon, GlobeAltIcon, DocumentTextIcon } from "./icons";
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
      <div className="w-full max-w-lg bg-page rounded-plane border border-line p-[18px] relative flex flex-col max-h-[85vh] overflow-hidden font-sans">

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
            <div className="flex justify-between items-start border-b border-line pb-3.5 mb-4 shrink-0">
              <div>
                <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">
                  Link asset
                </span>
                <h3 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mt-1 truncate max-w-[320px]">
                  {asset.name}
                </h3>
              </div>
              <button
                onClick={onClose}
                className="w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
              >
                <XMarkIcon size={14} />
              </button>
            </div>

            {deploySuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 py-12 shrink-0 animate-in fade-in zoom-in-95 duration-200">
                <div className="w-12 h-12 rounded-pill bg-plane border border-line flex items-center justify-center text-state-success">
                  <CheckIcon size={24} />
                </div>
                <span className="text-base-app font-medium text-ink-1 mt-2">Asset linked successfully</span>
                <span className="text-small text-ink-3">Updating repositories…</span>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto pr-1 flex flex-col gap-5 min-h-0">
                {/* Repository dropdown */}
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">Destination</label>
                  <select
                    id="link-repo-select"
                    value={selectedDestProject}
                    disabled={!!preSelectedRepo}
                    onChange={(e) => setSelectedDestProject(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-inner border border-line-2 bg-page text-ink-1 text-small font-mono cursor-pointer focus:outline-none focus:border-ink-1 disabled:opacity-60"
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
                  <div className="flex flex-col gap-3 p-3.5 rounded-inner bg-plane border border-line shrink-0">
                    <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex flex items-center gap-1.5 select-none">
                      <DocumentTextIcon size={12} />
                      Rule destination target path
                    </span>

                    {rememberedTarget ? (
                      <div className="flex items-center justify-between bg-page border border-line rounded-inner p-2.5">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">Remembered target</span>
                          <span className="text-small font-mono text-ink-2 truncate max-w-[280px]">{rememberedTarget}</span>
                        </div>
                        <button
                          onClick={() => setRememberedTarget(null)}
                          className="px-2.5 h-[22px] rounded-pill text-micro font-medium font-flex text-ink-3 hover:text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer shrink-0"
                        >
                          Change
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <p className="text-small text-ink-3 leading-[1.6]">
                          Select the specific destination rule file path in the target project:
                        </p>
                        <select
                          value={selectedTargetRulePath}
                          onChange={(e) => setSelectedTargetRulePath(e.target.value)}
                          className="w-full px-2.5 py-2 rounded-inner border border-line-2 bg-page text-ink-1 text-small font-mono cursor-pointer focus:outline-none focus:border-ink-1"
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

                {/* Mechanism */}
                {(!preflight?.collision || asset.category !== "Rules") && (
                  <div className="flex flex-col gap-2 shrink-0">
                    <label className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex">Mechanism</label>
                    <div className="flex gap-1.5 w-full">
                      <button
                        type="button"
                        aria-pressed={deployType === "symlink"}
                        onClick={() => setDeployType("symlink")}
                        className={
                          deployType === "symlink"
                            ? "flex-1 h-[30px] rounded-pill border border-transparent bg-tint text-tint-ink font-medium text-small font-flex cursor-pointer transition-colors duration-nav ease-spring"
                            : "flex-1 h-[30px] rounded-pill border border-line-2 text-ink-2 text-small font-flex cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2"
                        }
                      >
                        Symlink
                      </button>
                      <button
                        type="button"
                        aria-pressed={deployType === "copy"}
                        onClick={() => setDeployType("copy")}
                        className={
                          deployType === "copy"
                            ? "flex-1 h-[30px] rounded-pill border border-transparent bg-tint text-tint-ink font-medium text-small font-flex cursor-pointer transition-colors duration-nav ease-spring"
                            : "flex-1 h-[30px] rounded-pill border border-line-2 text-ink-2 text-small font-flex cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2"
                        }
                      >
                        Tracked copy
                      </button>
                    </div>
                    <p className="text-micro text-ink-3 leading-[1.6]">
                      A symlink stays in step with the source file, so an edit there reaches every
                      project at once. A tracked copy can be edited per project and Hanger tells you
                      when it drifts.
                    </p>
                  </div>
                )}

                {/* Preflight Checks */}
                {selectedDestProject && (
                  <div className="flex flex-col gap-2 p-3.5 rounded-inner border border-line bg-plane shrink-0">
                    <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex flex items-center gap-1.5 select-none">
                      <GlobeAltIcon size={12} />
                      What will happen
                    </span>

                    {preflightLoading ? (
                      <div className="flex items-center gap-2 text-ink-3 text-small py-2">
                        <SpinnerIcon className="animate-spin" size={12} />
                        Running pre-flight checks...
                      </div>
                    ) : preflight ? (
                      <div className="flex flex-col gap-2 mt-1">
                        {preflight.collision ? (
                          asset.category === "Rules" ? (
                            <div className="flex items-start gap-2 text-state-warning text-small leading-[1.6]">
                              <ExclamationTriangleIcon size={14} className="shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium">Collision:</span> heading block conflict detected. Merging requires the section diff merge chooser. Overwrite is disabled.
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-start gap-2 text-state-danger text-small leading-[1.6]">
                              <ExclamationTriangleIcon size={14} className="shrink-0 mt-0.5" />
                              <div>
                                <span className="font-medium">Collision warning:</span> the destination path already exists. Confirming will overwrite the existing asset.
                              </div>
                            </div>
                          )
                        ) : (
                          <div className="flex items-start gap-1.5 text-state-success text-small font-medium py-1">
                            <CheckIcon size={14} />
                            Destination path clear. Safe to link.
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {/* Actions footer */}
                {deployError && (
                  <div className="p-2.5 border border-line bg-plane text-state-danger text-small rounded-inner font-mono break-all shrink-0">
                    {deployError}
                  </div>
                )}

                <div className="flex gap-2 justify-end mt-auto pt-4 border-t border-line shrink-0">
                  {preflight?.collision && asset.category === "Rules" ? (
                    <button
                      id="link-merge-button"
                      disabled={deployLoading || preflightLoading}
                      onClick={handleOpenMergeChooser}
                      className="flex-1 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium disabled:opacity-50 cursor-pointer text-center transition-transform duration-press ease-spring active:scale-[0.96]"
                    >
                      Compare & merge rules…
                    </button>
                  ) : (
                    <button
                      id="link-execute-button"
                      disabled={!selectedDestProject || deployLoading || preflightLoading}
                      onClick={handleExecuteDeploy}
                      className="flex-1 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium disabled:opacity-50 cursor-pointer text-center transition-transform duration-press ease-spring active:scale-[0.96]"
                    >
                      {deployLoading ? (
                        <span className="flex items-center justify-center gap-2">
                          <SpinnerIcon className="animate-spin" size={12} />
                          Linking...
                        </span>
                      ) : preflight?.collision ? (
                        "Overwrite & link"
                      ) : (
                        "Link"
                      )}
                    </button>
                  )}
                  <button
                    onClick={onClose}
                    className="px-4 h-[30px] rounded-pill border border-line-2 text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring text-small font-medium cursor-pointer"
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
