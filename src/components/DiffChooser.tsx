import { ArrowRight, Check, FileText, GitMerge } from "lucide-react";

export interface AlignedSection {
  heading: string | null;
  sourceContent?: string;
  targetContent?: string;
}

interface DiffChooserProps {
  alignedSections: AlignedSection[];
  sectionChoices: Record<string, "source" | "target" | "skip" | "both">;
  setSectionChoices: (choices: Record<string, "source" | "target" | "skip" | "both">) => void;
  activeSectionIndex: number;
  setActiveSectionIndex: (index: number) => void;
  getMergedPreviewContent: () => string;
  onApplyMerge: () => void;
  onBack: () => void;
  deployError: string | null;
  deployLoading: boolean;
  deploySuccess: boolean;
}

export default function DiffChooser({
  alignedSections,
  sectionChoices,
  setSectionChoices,
  activeSectionIndex,
  setActiveSectionIndex,
  getMergedPreviewContent,
  onApplyMerge,
  onBack,
  deployError,
  deployLoading,
  deploySuccess
}: DiffChooserProps) {
  const currentSection = alignedSections[activeSectionIndex];

  return (
    <div className="absolute inset-0 bg-surface flex flex-col z-[60] p-6 border-t border-hairline animate-in fade-in slide-in-from-bottom duration-200">
      <div className="flex justify-between items-center border-b border-hairline pb-4 mb-4">
        <div className="flex items-center gap-2 text-accent font-bold">
          <GitMerge size={18} />
          <span className="text-title font-bold font-sans">Interactive Rules Diff Merge</span>
        </div>
      </div>

      {deploySuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-success-text">
          <div className="w-12 h-12 rounded-full bg-success-bg border border-success-border flex items-center justify-center animate-bounce">
            <Check size={24} />
          </div>
          <span className="text-sm font-bold font-sans mt-2">Deploying merged rule...</span>
          <span className="text-xs text-ink-mute">Updating project inventory constellation...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 gap-4">
          {/* Progress Header */}
          <div className="flex justify-between items-center text-xs text-ink-2 font-semibold font-sans">
            <span>
              Section {activeSectionIndex + 1} of {alignedSections.length}
            </span>
            <span className="font-mono text-ink-mute">
              {currentSection?.heading || "Preamble"}
            </span>
          </div>

          {/* Section tabs selection list */}
          <div className="flex gap-1 overflow-x-auto pb-2 border-b border-hairline min-h-[36px]">
            {alignedSections.map((sec, idx) => {
              const key = sec.heading || "__preamble";
              const choice = sectionChoices[key];
              let badgeColor = "bg-surface-elevated text-ink-3";
              if (sec.sourceContent === sec.targetContent) badgeColor = "bg-surface-elevated text-ink-mute";
              else if (choice === "source") badgeColor = "bg-accent/15 text-accent border border-accent/20";
              else if (choice === "target") badgeColor = "bg-info-bg text-info-text border border-info-border";
              else if (choice === "both") badgeColor = "bg-warning-bg text-warning-text border border-warning-border";
              else if (choice === "skip") badgeColor = "bg-error-bg text-error-text border border-error-border";

              return (
                <button
                  key={idx}
                  onClick={() => setActiveSectionIndex(idx)}
                  className={`px-3 py-1 rounded text-xs font-semibold whitespace-nowrap cursor-pointer transition-all ${
                    activeSectionIndex === idx
                      ? "ring-2 ring-accent scale-105"
                      : "opacity-80 hover:opacity-100"
                  } ${badgeColor}`}
                >
                  {sec.heading || "Preamble"}
                </button>
              );
            })}
          </div>

          {/* Decision Selector Bar */}
          {currentSection && (() => {
            const key = currentSection.heading || "__preamble";
            const choice = sectionChoices[key] || "target";
            const hasSource = !!currentSection.sourceContent;
            const hasTarget = !!currentSection.targetContent;

            return (
              <div className="flex items-center gap-2 p-2 bg-surface-elevated border border-hairline rounded-md">
                <span className="text-[10px] font-bold text-ink-3 uppercase mr-2 select-none">Decision:</span>
                {hasSource && hasTarget && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "target" })}
                      className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${
                        choice === "target" ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline"
                      }`}
                    >
                      Keep Destination
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "source" })}
                      className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${
                        choice === "source" ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline"
                      }`}
                    >
                      Overwrite with Source
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "both" })}
                      className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${
                        choice === "both" ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline"
                      }`}
                    >
                      Keep Both (Append)
                    </button>
                  </div>
                )}
                {hasSource && !hasTarget && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "source" })}
                      className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${
                        choice === "source" ? "bg-accent text-on-accent" : "bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline"
                      }`}
                    >
                      Include from Source
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "skip" })}
                      className={`px-3 py-1 rounded-xs text-xs font-semibold cursor-pointer transition-all ${
                        choice === "skip" ? "bg-error-bg text-error-text border border-error-border" : "bg-surface hover:bg-surface-elevated text-ink-2 border border-hairline"
                      }`}
                    >
                      Skip Section
                    </button>
                  </div>
                )}
                {hasTarget && !hasSource && (
                  <span className="text-[11px] font-semibold text-ink-mute italic pl-1">
                    Destination-only content (preserved automatically)
                  </span>
                )}
              </div>
            );
          })()}

          {/* Split visual section comparer */}
          <div className="flex-1 grid grid-rows-2 gap-4 min-h-0">
            <div className="grid grid-cols-2 gap-3 min-h-0">
              {/* Source version option pane */}
              <button
                onClick={() => {
                  if (currentSection?.sourceContent) {
                    const key = currentSection.heading || "__preamble";
                    setSectionChoices({ ...sectionChoices, [key]: "source" });
                  }
                }}
                className={`flex flex-col text-left border rounded-md p-3 overflow-y-auto cursor-pointer transition-all ${
                  sectionChoices[currentSection?.heading || "__preamble"] === "source"
                    ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                    : "border-hairline hover:border-accent bg-surface-elevated"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-accent flex items-center gap-1">
                    <ArrowRight size={10} />
                    Source (Incoming)
                  </span>
                  {!currentSection?.sourceContent && (
                    <span className="text-[9px] font-bold uppercase text-error-text bg-error-bg px-1 rounded">
                      Absent
                    </span>
                  )}
                </div>
                <pre className="font-mono text-xs text-ink-2 whitespace-pre-wrap leading-relaxed break-all">
                  {currentSection?.sourceContent || "(This section does not exist in incoming file)"}
                </pre>
              </button>

              {/* Destination version option pane */}
              <button
                onClick={() => {
                  if (currentSection?.targetContent) {
                    const key = currentSection.heading || "__preamble";
                    setSectionChoices({ ...sectionChoices, [key]: "target" });
                  }
                }}
                className={`flex flex-col text-left border rounded-md p-3 overflow-y-auto cursor-pointer transition-all ${
                  sectionChoices[currentSection?.heading || "__preamble"] === "target"
                    ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                    : "border-hairline hover:border-accent bg-surface-elevated"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-info-text flex items-center gap-1">
                    <Check size={10} />
                    Destination (Current)
                  </span>
                  {!currentSection?.targetContent && (
                    <span className="text-[9px] font-bold uppercase text-error-text bg-error-bg px-1 rounded">
                      Absent
                    </span>
                  )}
                </div>
                <pre className="font-mono text-xs text-ink-2 whitespace-pre-wrap leading-relaxed break-all">
                  {currentSection?.targetContent || "(This section does not exist in current destination)"}
                </pre>
              </button>
            </div>

            {/* Live Preview Panel */}
            <div className="border border-hairline bg-surface-elevated rounded-md p-3 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3 flex items-center gap-1 select-none">
                  <FileText size={10} />
                  Live Merged Preview
                </span>
              </div>
              <div className="flex-1 overflow-y-auto border border-hairline bg-surface p-3 rounded font-mono text-[11px] text-ink-2 whitespace-pre-wrap leading-relaxed break-all">
                {getMergedPreviewContent()}
              </div>
            </div>
          </div>

          {/* Actions */}
          {deployError && (
            <div className="p-2 border border-error-border bg-error-bg text-error-text text-xs rounded">
              {deployError}
            </div>
          )}

          <div className="flex justify-between gap-3 mt-2">
            <button
              onClick={onBack}
              className="px-5 py-2 rounded-md border border-hairline bg-surface hover:bg-surface-elevated text-xs font-semibold text-ink-2 cursor-pointer transition-colors"
            >
              Back
            </button>
            <button
              disabled={deployLoading}
              onClick={onApplyMerge}
              className="px-6 py-2 rounded-md bg-accent text-on-accent text-xs font-semibold cursor-pointer hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              Apply Merge & Deploy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
