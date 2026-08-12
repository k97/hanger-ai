import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

export type AllowlistCategory = "radius" | "shadow" | "fontsize" | "fontweight" | "retiredtoken" | "unclassified";

export interface AllowlistEntry {
  file: string;
  linePattern: RegExp;
  category: AllowlistCategory;
  reason: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALLOWLIST_RAW = [
  { file: "src/App.tsx", lineText: "<div className=\"w-full max-w-md bg-n-50 border border-n-100 rounded-lg shadow-2xl p-8 flex flex-col gap-6 text-center animate-in zoom-in-95 duration-200\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<div className=\"w-14 h-14 rounded-full bg-accent flex items-center justify-center text-on-primary font-bold text-2xl mx-auto shadow-sm select-none\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/App.tsx", lineText: "<h2 className=\"text-2xl font-bold text-text-primary\">Welcome to Hanger</h2>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/App.tsx", lineText: "className=\"px-6 py-2.5 rounded-md bg-accent text-on-accent text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-opacity cursor-pointer text-center w-fit mx-auto mt-2\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/App.tsx", lineText: "<div className=\"w-full max-w-md bg-n-50 border border-n-100 rounded-lg shadow-2xl p-8 flex flex-col gap-5 animate-in zoom-in-95 duration-200\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<h3 className=\"text-sm font-bold text-text-primary flex items-center gap-2\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<h2 className=\"text-title font-bold text-text-primary\">Privacy & Telemetry Consent</h2>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },



  { file: "src/App.tsx", lineText: "<span className=\"font-semibold\">Enable Crash Reporting</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/App.tsx", lineText: "className=\"w-4 h-4 accent-accent rounded cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/App.tsx", lineText: "<label className=\"flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer bg-surface border border-n-100 p-3 rounded-md hover:border-accent/40 transition-colors\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<span className=\"font-semibold\">Enable Usage Analytics</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/App.tsx", lineText: "className=\"w-full py-2.5 px-4 rounded-md bg-surface hover:bg-n-50 border border-n-100 text-text-secondary hover:text-text-primary font-semibold text-xs text-center cursor-pointer transition-colors shadow-sm\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/App.tsx", lineText: "className=\"w-4 h-4 accent-accent rounded cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/App.tsx", lineText: "className=\"w-full py-2.5 rounded-md bg-accent text-on-accent text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-opacity cursor-pointer text-center mt-2 shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },

  { file: "src/App.tsx", lineText: "<div className=\"absolute top-4 left-4 right-4 z-40 p-4 rounded-md border border-error-border bg-error-bg text-error-text flex items-center justify-between text-sm shadow-md animate-fade-in\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow styling" },
  { file: "src/App.tsx", lineText: "<button onClick={() => setError(null)} className=\"text-ink-mute hover:text-ink-1\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },




  { file: "src/App.tsx", lineText: "className=\"p-1 rounded-full text-text-muted hover:text-text-primary hover:bg-n-50 transition-colors cursor-pointer\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<div className=\"p-2.5 rounded bg-error-bg text-error-text border border-error-border text-xs leading-normal font-mono break-all animate-fade-in\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/App.tsx", lineText: "className=\"w-full py-2.5 px-4 rounded-md bg-accent text-on-accent font-semibold text-xs text-center cursor-pointer transition-opacity hover:opacity-95 shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/App.tsx", lineText: "<label className=\"flex items-center justify-between text-xs text-text-secondary select-none cursor-pointer bg-surface border border-n-100 p-3 rounded-md hover:border-accent/40 transition-colors\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight/retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<div className=\"w-full max-w-md bg-surface border border-n-100 rounded-xl shadow-2xl p-6 flex flex-col gap-4\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/App.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-text-muted\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },


  { file: "src/App.tsx", lineText: "className=\"w-4 h-4 accent-accent rounded cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },

  { file: "src/App.tsx", lineText: "className=\"w-4 h-4 accent-accent rounded cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/Constellation.tsx", lineText: "<h2 className=\"text-sm font-bold text-ink-1\">Project Constellation</h2>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"flex items-center gap-3 bg-surface-elevated px-4 py-1.5 rounded-xs border border-hairline shadow-sm\">", category: "shadow" as AllowlistCategory, reason: "Legacy shadow/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"text-xs font-semibold text-ink-2\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "className=\"flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-error-text hover:bg-error-bg/10 px-2 py-0.5 rounded transition-all cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "<p className=\"text-xs text-ink-3\">Interactive nodes scaled by local assets count</p>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"w-full min-h-[300px] border border-hairline bg-surface-elevated rounded-md p-8 flex flex-wrap items-center justify-center gap-8 shadow-inner relative overflow-hidden\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"flex flex-col items-center gap-3 text-ink-mute py-12 w-full max-w-lg\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<h4 className=\"text-sm font-semibold text-ink-2\">Traversing linked directories...</h4>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"w-full bg-surface border border-hairline rounded-md p-3 text-left\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"text-[10px] font-bold uppercase text-ink-mute tracking-wider mb-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"font-mono text-xs text-ink-3 truncate leading-normal\" title={scanProgress.current}>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "className=\"mt-2 px-5 py-1.5 rounded-md border border-error-border bg-error-bg text-error-text text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"flex flex-col items-center gap-2 text-ink-mute\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<div className=\"flex flex-col items-center gap-3 text-ink-mute py-12\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "className={`rounded-full flex flex-col items-center justify-center text-center p-3 transition-all duration-300 relative cursor-pointer group outline-none aspect-square shadow-sm ${", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow styling" },
  { file: "src/components/Constellation.tsx", lineText: ": \"bg-surface border-2 border-hairline hover:border-accent text-ink-1 hover:scale-105\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"text-xs font-semibold truncate max-w-full\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "className={`text-2xl font-black mt-1 ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "isSelected ? \"text-on-accent\" : \"text-ink-2\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning-border text-warning-text text-[10px] font-bold flex items-center justify-center aspect-square ring-2 ring-surface-elevated\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-xs bg-error-border text-error-text text-[9px] font-bold flex items-center justify-center ring-2 ring-surface-elevated uppercase\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "className={`rounded-full flex flex-col items-center justify-center text-center p-3 transition-all duration-300 relative cursor-pointer group outline-none aspect-square shadow-sm ${", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow styling" },
  { file: "src/components/Constellation.tsx", lineText: ": \"bg-surface border-2 border-dashed border-hairline hover:border-accent text-ink-1 hover:scale-105\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"text-[10px] uppercase font-bold text-ink-mute group-hover:text-accent select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/Constellation.tsx", lineText: "<span className=\"text-xs font-semibold truncate max-w-full mt-0.5\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "className={`text-2xl font-black mt-0.5 ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Constellation.tsx", lineText: "isSelected ? \"text-on-accent\" : \"text-ink-2\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex flex-col gap-2 p-4 rounded border border-n-100 bg-n-50\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-accent\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<h3 className=\"text-title font-bold text-text-primary mt-1 truncate max-w-[280px]\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-sm font-bold font-sans mt-2\">Asset Deployed Successfully!</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<label className=\"text-xs font-bold text-text-muted uppercase\">Target Project</label>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "className=\"w-full px-3 py-2 rounded border border-n-100 bg-surface text-text-secondary text-xs focus:ring-1 focus:ring-accent outline-none font-mono cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },


  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex items-center justify-between bg-surface border border-n-100 rounded p-2.5\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-[10px] uppercase font-bold text-accent\">Remembered Target</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "className=\"p-1 rounded text-text-muted hover:text-error-text hover:bg-n-50 transition-all cursor-pointer text-[10px] font-bold uppercase\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight/retiredtoken styling" },


  { file: "src/components/DeployWizard.tsx", lineText: "className=\"w-full px-3 py-2 rounded border border-n-100 bg-surface text-text-secondary text-xs font-mono cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<label className=\"text-xs font-bold text-text-muted uppercase\">Deploy Type</label>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "className={`flex flex-col p-3 rounded-md border text-left cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">Symlink</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "className={`flex flex-col p-3 rounded-md border text-left cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">Hard Copy</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex flex-col gap-3 p-4 rounded bg-n-50 border border-n-100\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex items-start gap-2 p-2 border border-warning-border bg-warning-bg text-warning-text text-xs rounded leading-normal\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"font-bold\">Collision Detected:</span> Merging conflicting Markdown heading blocks requires the Interactive Rules Diff Chooser. *Standard overwrite is disabled.*", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex items-start gap-2 p-2 border border-error-border bg-error-bg text-error-text text-xs rounded leading-normal\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<span className=\"font-bold\">Collision Warning:</span> Destination path already exists. Confirming will overwrite the existing version using transactional file replacements.", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"flex items-start gap-1.5 text-success-text text-xs font-semibold py-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "<div className=\"p-2 border border-error-border bg-error-bg text-error-text text-xs rounded font-mono\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "className=\"flex-1 py-2.5 rounded-md bg-accent text-on-accent font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "className=\"flex-1 py-2.5 rounded-md bg-accent text-on-accent font-semibold text-sm hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/components/DeployWizard.tsx", lineText: "className=\"px-6 py-2.5 rounded-md border border-n-100 bg-n-50 text-text-secondary hover:text-text-primary transition-colors text-sm font-medium cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"absolute inset-0 bg-surface flex flex-col z-[60] p-6 border-t border-hairline animate-in fade-in slide-in-from-bottom duration-200\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex justify-between items-center border-b border-hairline pb-4 mb-4\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex items-center gap-2 text-accent font-bold\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-title font-bold font-sans\">Interactive Rules Diff Merge</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-sm font-bold font-sans mt-2\">Deploying merged rule...</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-xs text-ink-mute\">Updating project inventory constellation...</span>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex justify-between items-center text-xs text-ink-2 font-semibold font-sans\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"font-mono text-ink-mute\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex gap-1 overflow-x-auto pb-2 border-b border-hairline min-h-[36px]\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "let badgeColor = \"bg-surface-elevated text-ink-3\";", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "if (sec.sourceContent === sec.targetContent) badgeColor = \"bg-surface-elevated text-ink-mute\";", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex items-center gap-2 p-2 bg-surface-elevated border border-hairline rounded-md\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[10px] font-bold text-ink-3 uppercase mr-2 select-none\">Decision:</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "choice === \"target\" ? \"bg-accent text-on-accent\" : \"bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "choice === \"source\" ? \"bg-accent text-on-accent\" : \"bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "choice === \"both\" ? \"bg-accent text-on-accent\" : \"bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "choice === \"source\" ? \"bg-accent text-on-accent\" : \"bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "choice === \"skip\" ? \"bg-error-bg text-error-text border border-error-border\" : \"bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[11px] font-semibold text-ink-mute italic pl-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`flex flex-col text-left border rounded-md p-3 overflow-y-auto cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DiffChooser.tsx", lineText: ": \"border-hairline hover:border-accent bg-surface-elevated\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[9px] font-bold uppercase text-error-text bg-error-bg px-1 rounded\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<pre className=\"font-mono text-xs text-ink-2 whitespace-pre-wrap leading-relaxed break-all\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className={`flex flex-col text-left border rounded-md p-3 overflow-y-auto cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DiffChooser.tsx", lineText: ": \"border-hairline hover:border-accent bg-surface-elevated\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-info-text flex items-center gap-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[9px] font-bold uppercase text-error-text bg-error-bg px-1 rounded\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<pre className=\"font-mono text-xs text-ink-2 whitespace-pre-wrap leading-relaxed break-all\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"border border-hairline bg-surface-elevated rounded-md p-3 flex flex-col min-h-0\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-ink-3 flex items-center gap-1 select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"flex-1 overflow-y-auto border border-hairline bg-surface p-3 rounded font-mono text-[11px] text-ink-2 whitespace-pre-wrap leading-relaxed break-all\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "<div className=\"p-2 border border-error-border bg-error-bg text-error-text text-xs rounded\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className=\"px-5 py-2 rounded-md border border-hairline bg-surface hover:bg-surface-elevated text-xs font-semibold text-ink-2 cursor-pointer transition-colors\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight/retiredtoken styling" },
  { file: "src/components/DiffChooser.tsx", lineText: "className=\"px-6 py-2 rounded-md bg-accent text-on-accent text-xs font-semibold cursor-pointer hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center gap-2\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/DiscoveryPane.tsx", lineText: "<div className=\"p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "className=\"w-full pl-10 pr-4 py-2 bg-n-50 border border-n-100 rounded-md text-sm text-text-muted cursor-not-allowed focus:outline-none\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<div className=\"border border-n-100 rounded-xl bg-n-25 p-8 flex flex-col gap-4 max-w-2xl\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<h2 className=\"text-md font-bold text-text-primary\">Community Asset Indexing</h2>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },




  { file: "src/components/DiscoveryPane.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">System Hooks</span>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<div className=\"p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">MCP Tools</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<div className=\"p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/DiscoveryPane.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">Agent Skills</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-xs font-medium uppercase tracking-wider text-text-primary px-2 py-0.5 rounded-full bg-n-50 border border-n-100\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },

  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-error-text bg-error-bg border border-error-border px-2 py-0.5 rounded-xs flex items-center gap-1 font-sans\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Flyout.tsx", lineText: "<h2 className=\"text-sm font-bold mt-1 text-text-primary truncate max-w-[280px] font-sans\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/Flyout.tsx", lineText: "className=\"p-1.5 rounded-full border border-n-100 bg-surface hover:text-text-primary text-text-secondary cursor-pointer transition-colors\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/Flyout.tsx", lineText: "<div className=\"p-4 rounded-md border border-warning-border bg-warning-bg text-warning-text flex flex-col gap-2 shadow-sm\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow styling" },
  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 font-sans\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-sm font-semibold text-text-primary truncate block max-w-[200px]\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-[10px] font-mono font-bold text-text-muted px-1.5 py-0.2 border border-n-100 rounded bg-surface\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/radius styling" },



  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-[10px] font-semibold text-text-muted bg-surface px-2 py-0.5 rounded-xs border border-n-100 shadow-sm group-hover:hidden\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },

  { file: "src/components/Flyout.tsx", lineText: "<span className=\"text-[9px] font-bold uppercase tracking-wider text-warning-text bg-warning-bg border border-warning-border px-1.5 py-0.2 rounded flex items-center gap-0.5 shrink-0\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight styling" },
  { file: "src/components/Flyout.tsx", lineText: "<div className=\"text-xs font-bold text-text-muted uppercase tracking-wider py-2 border-b border-n-100 mt-3 first:mt-0 mb-1 font-sans\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/Flyout.tsx", lineText: "<div className=\"flex items-center justify-between py-2 px-3 hover:bg-n-25 rounded-md border border-transparent hover:border-n-100 transition-all group font-sans\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },

  { file: "src/components/Flyout.tsx", lineText: "className=\"opacity-0 group-hover:opacity-100 px-3 py-1 rounded-md bg-accent text-on-accent text-[10px] font-bold tracking-wide uppercase transition-all cursor-pointer shadow-sm hover:opacity-95\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"w-full max-w-lg bg-surface rounded-[21px] border border-n-100 shadow-2xl p-6 relative flex flex-col max-h-[85vh] overflow-hidden font-sans\">", category: "shadow" as AllowlistCategory, reason: "Legacy shadow styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-[10px] font-bold uppercase tracking-wider text-accent\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<h3 className=\"text-title font-bold text-text-primary mt-1 truncate max-w-[320px]\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"p-1 rounded-full hover:bg-n-25 text-text-muted hover:text-text-primary transition-colors cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-sm font-bold mt-2\">Asset Linked Successfully!</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<label className=\"text-xs font-bold text-text-muted uppercase\">Target Repository</label>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"w-full px-3 py-2 rounded-full border border-n-100 bg-surface text-text-secondary text-xs focus:ring-1 focus:ring-accent outline-none font-mono cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex flex-col gap-3 p-4 rounded-xl bg-surface border border-n-100 shrink-0\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex items-center justify-between bg-n-50 border border-n-100 rounded-xl p-2.5\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-[10px] uppercase font-bold text-accent\">Remembered Target</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"p-1 rounded text-text-muted hover:text-error-text hover:bg-n-25 transition-all cursor-pointer text-[10px] font-bold uppercase\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/fontweight/retiredtoken styling" },


  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"w-full px-3 py-2 rounded-full border border-n-100 bg-surface text-text-secondary text-xs font-mono cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<label className=\"text-xs font-bold text-text-muted uppercase\">Link Type</label>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "className={`flex flex-col p-4 rounded-xl border text-left cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">Symlink</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "className={`flex flex-col p-4 rounded-xl border text-left cursor-pointer transition-all ${", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-xs font-bold text-text-primary\">Hard Copy</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex flex-col gap-2 p-4 rounded-xl border border-n-100 bg-surface shrink-0\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-1.5 select-none\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex items-start gap-2 p-2 border border-warning-border bg-warning-bg text-warning-text text-xs rounded-xl leading-normal\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"font-bold\">Collision:</span> Heading block conflict detected. Merging requires section diff merge chooser. Overwrite is disabled.", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex items-start gap-2 p-2 border border-error-border bg-error-bg text-error-text text-xs rounded-xl leading-normal\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<span className=\"font-bold\">Collision Warning:</span> Destination path already exists. Confirming will overwrite the existing asset.", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"flex items-start gap-1.5 text-success-text text-xs font-semibold py-1\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "<div className=\"p-2.5 border border-error-border bg-error-bg text-error-text text-xs rounded-xl font-mono shrink-0\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"flex-1 py-2.5 rounded-full bg-accent text-on-accent font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"flex-1 py-2.5 rounded-full bg-accent text-on-accent font-semibold text-xs hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer text-center shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
  { file: "src/components/LinkAssetModal.tsx", lineText: "className=\"px-6 py-2.5 rounded-full border border-n-100 bg-n-50 text-text-secondary hover:text-text-primary transition-colors text-xs font-medium cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/ProfilePane.tsx", lineText: "<div className=\"flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },


  { file: "src/components/ProfilePane.tsx", lineText: "<span className=\"text-sm font-bold text-text-primary\">No developer agent folders detected</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/ProfilePane.tsx", lineText: "<div className=\"flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },


  { file: "src/components/ProfilePane.tsx", lineText: "<span className=\"text-sm font-bold text-text-primary\">No global {selectedCategory.toLowerCase()} found</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"flex flex-col gap-4 p-4 border border-error-border bg-error-bg rounded-lg leading-relaxed animate-in fade-in duration-200 shadow-sm\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<span className=\"text-xs font-bold font-sans\">macOS Folder Scan Access Denied</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/RepoPane.tsx", lineText: "className=\"self-start px-3 py-1.5 bg-accent text-on-accent font-semibold text-xs rounded-full hover:opacity-90 transition-opacity cursor-pointer shadow-sm flex items-center gap-1.5\"", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/shadow styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"flex-1 flex flex-col items-center justify-center py-16 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },




  { file: "src/components/RepoPane.tsx", lineText: "<span className=\"text-sm font-bold text-text-primary\">No project-level {selectedCategory.toLowerCase()} found in this repository</span>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },


  { file: "src/components/RepoPane.tsx", lineText: "<span className=\"text-sm font-bold text-text-primary\">No AI assets found in this repository</span>", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/components/RepoPane.tsx", lineText: "className=\"px-4 py-2 bg-accent text-on-accent text-xs font-semibold rounded-full hover:bg-opacity-95 cursor-pointer transition-colors shadow-sm\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },


  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"flex-1 flex flex-col items-center justify-center py-20 text-center border border-dashed border-n-100 rounded-xl bg-n-25 animate-in fade-in duration-200\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"w-full max-w-sm bg-surface-elevated rounded-[21px] border border-hairline shadow-2xl p-6 relative flex flex-col gap-4 font-sans animate-in zoom-in-95 duration-150\">", category: "shadow" as AllowlistCategory, reason: "Legacy shadow/retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"flex justify-between items-center pb-2 border-b border-hairline\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<h3 className=\"text-sm font-bold text-ink-1 flex items-center gap-1.5\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<p className=\"text-xs text-ink-2 leading-relaxed\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "Are you sure you want to unlink <span className=\"font-semibold\">{assetToUnlink.name}</span> from this repository?", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },

  { file: "src/components/RepoPane.tsx", lineText: "<p className=\"text-[10px] text-ink-3\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<p className=\"text-[10px] text-text-muted font-mono bg-surface p-2.5 rounded-xl border border-n-100 break-all select-all\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"p-2 border border-error-border bg-error-bg text-error-text text-[10px] rounded-xl font-mono break-all\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/RepoPane.tsx", lineText: "<div className=\"flex gap-3 justify-end pt-2 border-t border-hairline\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },
  { file: "src/components/RepoPane.tsx", lineText: "className=\"px-4 py-2 rounded-full bg-error-bg text-error-text border border-error-border hover:bg-opacity-90 font-semibold text-xs cursor-pointer shadow-xs disabled:opacity-50 flex items-center gap-1\"", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/RepoPane.tsx", lineText: "className=\"px-4 py-2 rounded-full border border-hairline bg-surface text-ink-2 text-xs font-medium cursor-pointer\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "<div className=\"w-full max-w-lg bg-surface border border-n-100 rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden\">", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/retiredtoken styling" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "<div className=\"p-3 bg-error-bg border border-error-border text-error-text rounded-md text-xs font-mono break-all\">", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },




  { file: "src/components/SidebarScanModal.tsx", lineText: "<span className=\"text-md font-bold text-text-primary\">Promote Repositories</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling, carried over from the scan modal this replaced" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "<span className=\"text-sm font-semibold\">Nothing left to promote</span>", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling, carried over from the scan modal this replaced" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"p-1 rounded-full hover:bg-n-50 text-text-muted hover:text-text-primary transition-colors\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },






  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"px-4 py-1.5 rounded-full border border-n-100 hover:bg-n-50 text-xs font-bold text-text-secondary transition-all\"", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },


  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"text-xs font-bold text-brand-violet hover:underline shrink-0 px-1\"", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight styling" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"w-full pl-8 pr-3 py-1 bg-n-50 border border-n-100 rounded-sm text-xs text-text-primary focus:outline-none focus:border-brand-violet font-sans\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/retiredtoken styling" },

  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"mt-0.5 accent-brand-violet rounded\"", category: "radius" as AllowlistCategory, reason: "Legacy radius styling" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "<span className=\"text-xs font-semibold text-text-primary block truncate\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },

  { file: "src/components/SidebarScanModal.tsx", lineText: "<div className=\"flex-1 overflow-y-auto border border-n-100 rounded-md bg-n-50 divide-y divide-n-100 min-h-[200px] max-h-[350px]\">", category: "retiredtoken" as AllowlistCategory, reason: "Legacy retiredtoken styling" },

  { file: "src/components/SidebarScanModal.tsx", lineText: "<span className=\"text-xs text-text-muted font-semibold\">", category: "fontweight" as AllowlistCategory, reason: "Legacy fontweight/retiredtoken styling" },


  { file: "src/components/SidebarScanModal.tsx", lineText: "className=\"px-4 py-1.5 rounded-full bg-accent text-on-accent text-xs font-bold tracking-wide uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-all\"", category: "radius" as AllowlistCategory, reason: "Legacy radius/shadow/fontweight styling" },
];

const ALLOWLIST: AllowlistEntry[] = ALLOWLIST_RAW.map((e) => ({
  file: e.file,
  linePattern: new RegExp(escapeRegExp(e.lineText)),
  category: e.category,
  reason: e.reason,
}));

function getAllSrcTsxFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") {
        files.push(...getAllSrcTsxFiles(fullPath));
      }
    } else if (
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const tokensCssPath = path.resolve(__dirname, "../styles/tokens.css");
const indexCssPath = path.resolve(__dirname, "../styles/index.css");

const tokensCss = fs.readFileSync(tokensCssPath, "utf-8");
const indexCss = fs.readFileSync(indexCssPath, "utf-8");

const cssVarMap: Record<string, string> = {};
const varRegex = /--([\w\-]+):\s*([^;]+);/g;
let cssMatch: RegExpExecArray | null;
while ((cssMatch = varRegex.exec(tokensCss + "\n" + indexCss)) !== null) {
  cssVarMap[cssMatch[1]] = cssMatch[2].trim();
}

function resolveCssVar(val: string): string {
  let resolved = val;
  let depth = 0;
  while (resolved.includes("var(") && depth < 5) {
    depth++;
    resolved = resolved.replace(/var\(--([\w\-]+)\)/g, (_, varName) => {
      return cssVarMap[varName] || _;
    });
  }
  return resolved;
}

const DEFAULT_TAILWIND_SIZES: Record<string, string> = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "30px",
};

function resolveFontSize(suffix: string): number | null {
  let valStr: string | undefined;
  if (cssVarMap[`text-${suffix}`]) {
    valStr = resolveCssVar(cssVarMap[`text-${suffix}`]);
  } else if (cssVarMap[suffix]) {
    valStr = resolveCssVar(cssVarMap[suffix]);
  } else if (cssVarMap[`fs-${suffix}`]) {
    valStr = resolveCssVar(cssVarMap[`fs-${suffix}`]);
  } else if (DEFAULT_TAILWIND_SIZES[suffix]) {
    valStr = DEFAULT_TAILWIND_SIZES[suffix];
  }

  if (valStr) {
    const pxMatch = /(\d+)\s*px/.exec(valStr);
    if (pxMatch) {
      return parseInt(pxMatch[1], 10);
    }
  }
  return null;
}

const RULED_FONT_SIZES = new Set([
  resolveFontSize("row") || 11,
  resolveFontSize("ui") || 12,
  resolveFontSize("title") || 13,
]);
const RULED_RADII = new Set(["0", "0px", "6px", "9999px", "9999", "100%", "full"]);

const NON_FONT_SIZE_TEXT_SUFFIXES = new Set([
  "center", "left", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
  "ink-1", "ink-2", "ink-3", "ink-mute", "surface-elevated", "hairline", "scrim", "accent", "on-accent", "on-primary",
  "brand-lime", "brand-pink", "brand-violet", "brand-violet-deep",
  "warning-bg", "warning-border", "warning-text", "warning-text-on-tint",
  "error-bg", "error-border", "error-text", "danger-text", "danger-text-on-tint",
  "success-bg", "success-border", "success-text", "success-text-on-tint",
  "info-text", "text-primary", "text-secondary", "text-muted", "white", "muted"
]);

const OFF_SPEC_PATTERNS = [
  /\brounded(-(sm|md|lg|xl|2xl|3xl|full)|(?=[\s"']|$))\b/,
  /\b(shadow|shadow-sm|shadow-md|shadow-lg|shadow-xl|shadow-2xl|shadow-inner|shadow-none|shadow-\[[^\]]+\]|drop-shadow(-[a-z0-9_\[\]]+)?)\b/,
  /\bfont-(semibold|bold|black|thin|extralight|light|extrabold|\[\d+\])\b/,
  /\b(ink-1|ink-2|ink-3|ink-mute|surface-elevated|hairline)\b/,
  /\b(bg|text|border|ring|divide|fill|stroke)-(red|blue|green|yellow|purple|amber|pink|indigo|gray|slate|zinc|neutral|stone|orange|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}(\/\d{1,3})?\b/,
];

function isOffTokenStyleLine(line: string): boolean {
  // Allow rounded-full on ScanStatusIndicator status dot (ruled pill radius)
  if (line.includes("w-1.5 h-1.5 rounded-full bg-accent")) {
    return false;
  }

  if (OFF_SPEC_PATTERNS.some((pattern) => pattern.test(line))) {
    return true;
  }

  const roundedArbRegex = /\brounded-\[([^\]]+)\]\b/g;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = roundedArbRegex.exec(line)) !== null) {
    const rVal = rMatch[1].trim();
    if (!RULED_RADII.has(rVal)) {
      return true;
    }
  }

  const textArbRegex = /\btext-\[([^\]]+)\]\b/g;
  let tArbMatch: RegExpExecArray | null;
  while ((tArbMatch = textArbRegex.exec(line)) !== null) {
    const arbVal = tArbMatch[1].trim();
    if (/^\d+(px|rem|em|pt)$/.test(arbVal) || /^\d+$/.test(arbVal)) {
      return true;
    }
  }

  const textUtilRegex = /\btext-([\w\-]+)\b/g;
  let tUtilMatch: RegExpExecArray | null;
  while ((tUtilMatch = textUtilRegex.exec(line)) !== null) {
    const suf = tUtilMatch[1];
    if (suf.startsWith("[") || NON_FONT_SIZE_TEXT_SUFFIXES.has(suf)) {
      continue;
    }
    const resolvedPx = resolveFontSize(suf);
    if (resolvedPx !== null && !RULED_FONT_SIZES.has(resolvedPx)) {
      return true;
    }
  }

  return false;
}


describe("No Off-Token Styling Enforcement", () => {
  it("verifies that all off-token styling in src/ matches the allowlist and no stale allowlist entries exist", () => {
    const srcDir = path.resolve(__dirname, "..");
    const files = getAllSrcTsxFiles(srcDir);
    const rootDir = path.resolve(__dirname, "../..");

    const actualMatches: Array<{ file: string; line: string; lineNumber: number }> = [];

    for (const file of files) {
      const relPath = path.relative(rootDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        if (isOffTokenStyleLine(line)) {
          actualMatches.push({
            file: relPath,
            line: line.trim(),
            lineNumber: idx + 1,
          });
        }
      });
    }

    console.log(`[ALLOWLIST RAW ENTRIES]: ${ALLOWLIST.length}`);
    console.log(`[DETECTOR MATCH SITES]: ${actualMatches.length}`);

    const matchedAllowlistIndices = new Set<number>();

    for (const match of actualMatches) {
      const allowlistIdx = ALLOWLIST.findIndex(
        (entry, idx) => !matchedAllowlistIndices.has(idx) && entry.file === match.file && entry.linePattern.test(match.line)
      );

      if (allowlistIdx === -1) {
        throw new Error(
          `Forbidden off-token styling detected at ${match.file}:${match.lineNumber}:\n  "${match.line}"\nThis violates Cockpit design system. Use standard design tokens from tokens.css.`
        );
      } else {
        matchedAllowlistIndices.add(allowlistIdx);
      }
    }

    expect(actualMatches.length).toBeGreaterThan(0);

    ALLOWLIST.forEach((entry, idx) => {
      if (!matchedAllowlistIndices.has(idx)) {
        throw new Error(
          `Stale allowlist entry found at index ${idx} for ${entry.file} (${entry.linePattern}). Remove this entry from the ALLOWLIST.`
        );
      }
    });
  });
});
