import { AlertTriangle, Check, Loader2, Globe, FileText } from "lucide-react";

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
    <div className="flex-1 p-6 flex flex-col gap-6 bg-surface overflow-y-auto relative font-sans">
      <div className="flex justify-between items-center border-b border-n-100 pb-4">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
            Deploy Flow
          </span>
          <h3 className="text-title font-bold text-text-primary mt-1 truncate max-w-[280px]">
            {deployingAsset.name}
          </h3>
        </div>
      </div>

      {deploySuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-success-text">
          <div className="w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce">
            <Check size={24} />
          </div>
          <span className="text-sm font-bold font-sans mt-2">Asset Deployed Successfully!</span>
          <span className="text-xs text-text-muted">Updating project inventory constellation...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col gap-6">
          {/* Target Project Selection */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-bold text-text-muted uppercase">Target Project</label>
            <select
              value={selectedDestProject}
              onChange={(e) => setSelectedDestProject(e.target.value)}
              className="w-full px-3 py-2 rounded border border-n-100 bg-surface text-text-secondary text-xs focus:ring-1 focus:ring-accent outline-none font-mono cursor-pointer"
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
            <div className="flex flex-col gap-3 p-4 rounded bg-n-50 border border-n-100">
              <span className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none">
                <FileText size={12} />
                Rule Destination Target Path
              </span>
              
              {rememberedTarget ? (
                <div className="flex items-center justify-between bg-surface border border-n-100 rounded p-2.5">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase font-bold text-accent">Remembered Target</span>
                    <span className="text-xs font-mono text-text-secondary truncate max-w-[280px]">{rememberedTarget}</span>
                  </div>
                  <button
                    onClick={onResetTargetMemory}
                    className="p-1 rounded text-text-muted hover:text-error-text hover:bg-n-50 transition-all cursor-pointer text-[10px] font-bold uppercase"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-xs text-text-muted">
                    Select the specific destination rule file path in the target project. Subdirectories are listed root-to-deepest:
                  </p>
                  <select
                    value={selectedTargetRulePath}
                    onChange={(e) => setSelectedTargetRulePath(e.target.value)}
                    className="w-full px-3 py-2 rounded border border-n-100 bg-surface text-text-secondary text-xs font-mono cursor-pointer"
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

          {/* Deploy Type Selector (hidden/disabled for Rules merge collisions) */}
          {(!preflight?.collision || deployingAsset.category !== "Rules") && (
            <div className="flex flex-col gap-2">
              <label className="text-xs font-bold text-text-muted uppercase">Deploy Type</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setDeployType("symlink")}
                  className={`flex flex-col p-3 rounded-md border text-left cursor-pointer transition-all ${
                    deployType === "symlink"
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-n-100 hover:border-accent bg-n-50"
                  }`}
                >
                  <span className="text-xs font-bold text-text-primary">Symlink</span>
                  <span className="text-[10px] text-text-muted mt-1 leading-normal">
                    Creates a local symbolic link. Best for unified team rule updates with zero drift.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setDeployType("copy")}
                  className={`flex flex-col p-3 rounded-md border text-left cursor-pointer transition-all ${
                    deployType === "copy"
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-n-100 hover:border-accent bg-n-50"
                  }`}
                >
                  <span className="text-xs font-bold text-text-primary">Hard Copy</span>
                  <span className="text-[10px] text-text-muted mt-1 leading-normal">
                    Copies the physical file. Allows project-level customizations but tracks version drift.
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Preflight Check Info Panel */}
          {selectedDestProject && (
            <div className="flex flex-col gap-2 p-4 rounded border border-n-100 bg-n-50">
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
                    deployingAsset.category === "Rules" ? (
                      <div className="flex items-start gap-2 p-2 border border-warning-border bg-warning-bg text-warning-text text-xs rounded leading-normal">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Collision Detected:</span> Merging conflicting Markdown heading blocks requires the Interactive Rules Diff Chooser. *Standard overwrite is disabled.*
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 p-2 border border-error-border bg-error-bg text-error-text text-xs rounded leading-normal">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Collision Warning:</span> Destination path already exists. Confirming will overwrite the existing version using transactional file replacements.
                        </div>
                      </div>
                    )
                  ) : (
                    <div className="flex items-start gap-1.5 text-success-text text-xs font-semibold py-1">
                      <Check size={14} />
                      Destination path clear. Safe to deploy.
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Actions */}
          {deployError && (
            <div className="p-2 border border-error-border bg-error-bg text-error-text text-xs rounded font-mono">
              {deployError}
            </div>
          )}

          <div className="flex gap-3 justify-end mt-auto pt-6 border-t border-n-100">
            {preflight?.collision && deployingAsset.category === "Rules" ? (
              <button
                disabled={deployLoading || preflightLoading}
                onClick={onOpenMergeChooser}
                className="flex-1 py-2.5 rounded-md bg-accent text-on-accent font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm"
              >
                Compare & Merge Rules...
              </button>
            ) : (
              <button
                disabled={!selectedDestProject || deployLoading || preflightLoading}
                onClick={onExecuteDeploy}
                className="flex-1 py-2.5 rounded-md bg-accent text-on-accent font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm"
              >
                {deployLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={14} />
                    Deploying...
                  </span>
                ) : preflight?.collision ? (
                  "Overwrite & Deploy"
                ) : (
                  "Deploy Asset"
                )}
              </button>
            )}
            <button
              onClick={onCancel}
              className="px-6 py-2.5 rounded-md border border-n-100 bg-n-50 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
