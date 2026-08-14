import { ExclamationTriangleIcon, CheckIcon, SpinnerIcon, GlobeAltIcon, DocumentTextIcon } from "./icons";

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

export interface PreflightResult {
  collision: boolean;
  dest_exists: boolean;
  layered: boolean;
}

interface DeployWizardProps {
  deployingAsset: FlatAssetItem;
  linkedProjects: string[];
  selectedDestProject: string;
  setSelectedDestProject: (project: string) => void;
  destRules: any[];
  rememberedTarget: string | null;
  selectedTargetRulePath: string;
  setSelectedTargetRulePath: (path: string) => void;
  deployType: "symlink" | "copy";
  setDeployType: (type: "symlink" | "copy") => void;
  preflightLoading: boolean;
  preflight: PreflightResult | null;
  deployLoading: boolean;
  deploySuccess: boolean;
  deployError: string | null;
  onExecuteDeploy: () => void;
  onOpenMergeChooser: () => void;
  onResetTargetMemory: () => void;
  onCancel: () => void;
}

const labelClass =
  "text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex select-none";
const selectClass =
  "w-full px-2.5 py-2 rounded-inner border border-line-2 bg-page text-ink-1 text-small font-mono cursor-pointer focus:outline-none focus:border-ink-1";
const mechBtnClass =
  "flex-1 h-[30px] rounded-pill border border-line-2 text-ink-2 text-small font-flex cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const mechBtnPressedClass =
  "flex-1 h-[30px] rounded-pill border border-transparent bg-tint text-tint-ink font-medium text-small font-flex cursor-pointer transition-colors duration-nav ease-spring";

/** Screen 2 of the inspector: the link flow, same panel, with a way back. */
export default function DeployWizard({
  deployingAsset,
  linkedProjects,
  selectedDestProject,
  setSelectedDestProject,
  destRules,
  rememberedTarget,
  selectedTargetRulePath,
  setSelectedTargetRulePath,
  deployType,
  setDeployType,
  preflightLoading,
  preflight,
  deployLoading,
  deploySuccess,
  deployError,
  onExecuteDeploy,
  onOpenMergeChooser,
  onResetTargetMemory,
  onCancel
}: DeployWizardProps) {
  return (
    <div className="flex-1 p-[18px] flex flex-col gap-5 bg-page overflow-y-auto relative font-sans">
      <div className="border-b border-line pb-3.5">
        <span className={labelClass}>Link flow</span>
        <h3 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mt-1 truncate max-w-[280px]">
          {deployingAsset.name}
        </h3>
      </div>

      {deploySuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-12 h-12 rounded-pill bg-plane border border-line flex items-center justify-center text-state-success">
            <CheckIcon size={24} />
          </div>
          <span className="text-base-app font-medium text-ink-1 mt-2">Asset linked successfully</span>
          <span className="text-small text-ink-3">Updating the project inventory…</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-5">
          {/* Target Project Selection */}
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Destination</label>
            <select
              value={selectedDestProject}
              onChange={(e) => setSelectedDestProject(e.target.value)}
              className={selectClass}
            >
              <option value="">-- Choose destination root --</option>
              {linkedProjects.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
            </select>
          </div>

          {/* Conditional Target Rule Chooser (if category is Rules and destination is chosen) */}
          {deployingAsset.category === "Rules" && selectedDestProject && (
            <div className="flex flex-col gap-3 p-3.5 rounded-inner bg-plane border border-line">
              <span className={`${labelClass} flex items-center gap-1.5`}>
                <DocumentTextIcon size={12} />
                Rule destination target path
              </span>

              {rememberedTarget ? (
                <div className="flex items-center justify-between bg-page border border-line rounded-inner p-2.5">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={labelClass}>Remembered target</span>
                    <span className="text-small font-mono text-ink-2 truncate max-w-[280px]">{rememberedTarget}</span>
                  </div>
                  <button
                    onClick={onResetTargetMemory}
                    className="px-2.5 h-[22px] rounded-pill text-micro font-medium font-flex text-ink-3 hover:text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer shrink-0"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-small text-ink-3 leading-[1.6]">
                    Select the specific destination rule file path in the target project. Subdirectories are listed root-to-deepest:
                  </p>
                  <select
                    value={selectedTargetRulePath}
                    onChange={(e) => setSelectedTargetRulePath(e.target.value)}
                    className={selectClass}
                  >
                    {destRules.map((r) => (
                      <option key={r.path} value={r.path}>
                        {r.path}
                      </option>
                    ))}
                    <option value={`${selectedDestProject}/${deployingAsset.name}`}>
                      [Create New] {selectedDestProject}/{deployingAsset.name}
                    </option>
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Mechanism (hidden for Rules merge collisions) */}
          {(!preflight?.collision || deployingAsset.category !== "Rules") && (
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Mechanism</label>
              <div className="flex gap-1.5 w-full">
                <button
                  type="button"
                  aria-pressed={deployType === "symlink"}
                  onClick={() => setDeployType("symlink")}
                  className={deployType === "symlink" ? mechBtnPressedClass : mechBtnClass}
                >
                  Symlink
                </button>
                <button
                  type="button"
                  aria-pressed={deployType === "copy"}
                  onClick={() => setDeployType("copy")}
                  className={deployType === "copy" ? mechBtnPressedClass : mechBtnClass}
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

          {/* Preflight Check Info Panel */}
          {selectedDestProject && (
            <div className="flex flex-col gap-2 p-3.5 rounded-inner border border-line bg-plane">
              <span className={`${labelClass} flex items-center gap-1.5`}>
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
                    deployingAsset.category === "Rules" ? (
                      <div className="flex items-start gap-2 text-state-warning text-small leading-[1.6]">
                        <ExclamationTriangleIcon size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">Collision detected:</span> merging conflicting Markdown heading blocks requires the interactive rules diff chooser. Standard overwrite is disabled.
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-state-danger text-small leading-[1.6]">
                        <ExclamationTriangleIcon size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="font-medium">Collision warning:</span> the destination path already exists. Confirming will overwrite the existing version using transactional file replacements.
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

          {/* Actions */}
          {deployError && (
            <div className="p-2.5 rounded-inner border border-line bg-plane text-state-danger text-small font-mono break-all">
              {deployError}
            </div>
          )}

          <div className="flex gap-2 justify-end mt-auto pt-4 border-t border-line">
            {preflight?.collision && deployingAsset.category === "Rules" ? (
              <button
                disabled={deployLoading || preflightLoading}
                onClick={onOpenMergeChooser}
                className="flex-1 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium disabled:opacity-50 cursor-pointer text-center transition-transform duration-press ease-spring active:scale-[0.96]"
              >
                Compare & merge rules…
              </button>
            ) : (
              <button
                disabled={!selectedDestProject || deployLoading || preflightLoading}
                onClick={onExecuteDeploy}
                className="flex-1 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium disabled:opacity-50 cursor-pointer text-center transition-transform duration-press ease-spring active:scale-[0.96]"
              >
                {deployLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <SpinnerIcon className="animate-spin" size={14} />
                    Linking…
                  </span>
                ) : preflight?.collision ? (
                  "Overwrite & link"
                ) : (
                  "Link"
                )}
              </button>
            )}
            <button
              onClick={onCancel}
              className="px-4 h-[30px] rounded-pill border border-line-2 text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring text-small font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
