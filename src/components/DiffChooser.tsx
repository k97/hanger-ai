import { ArrowRightIcon, CheckIcon, DocumentTextIcon, GitMergeIcon } from "./icons";

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
    <div className="absolute inset-0 bg-page flex flex-col z-[60] p-6 border-t border-line animate-in fade-in slide-in-from-bottom duration-200">
      <div className="flex justify-between items-center border-b border-line pb-4 mb-4">
        <div className="flex items-center gap-2 text-ink-1 font-medium">
          <GitMergeIcon size={18} />
          <span className="text-lg-app font-medium font-sans">Interactive Rules Diff Merge</span>
        </div>
      </div>

      {deploySuccess ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 text-state-success">
          <div className="w-12 h-12 rounded-pill bg-plane border border-line flex items-center justify-center animate-in fade-in zoom-in-95 duration-200">
            <CheckIcon size={24} />
          </div>
          <span className="text-base-app font-medium font-sans mt-2">Deploying merged rule...</span>
          <span className="text-xs text-ink-3">Updating project inventory constellation...</span>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 gap-4">
          {/* Progress Header */}
          <div className="flex justify-between items-center text-xs text-ink-2 font-medium font-sans">
            <span>
              Section {activeSectionIndex + 1} of {alignedSections.length}
            </span>
            <span className="font-mono text-ink-3">
              {currentSection?.heading || "Preamble"}
            </span>
          </div>

          {/* Section tabs selection list */}
          <div className="flex gap-1 overflow-x-auto pb-2 border-b border-line min-h-[36px]">
            {alignedSections.map((sec, idx) => {
              const key = sec.heading || "__preamble";
              const choice = sectionChoices[key];
              let badgeColor = "bg-plane text-ink-3";
              if (sec.sourceContent === sec.targetContent) badgeColor = "bg-plane text-ink-3";
              else if (choice === "source") badgeColor = "bg-tint text-tint-ink";
              else if (choice === "target") badgeColor = "bg-info-bg text-ink-2 border border-info-border";
              else if (choice === "both") badgeColor = "bg-plane text-state-warning border border-line";
              else if (choice === "skip") badgeColor = "bg-plane text-state-danger border border-line";

              return (
                <button
                  key={idx}
                  onClick={() => setActiveSectionIndex(idx)}
                  className={`px-3 py-1 rounded-inner text-xs font-medium whitespace-nowrap cursor-pointer transition-colors duration-hover ease-spring ${
                    activeSectionIndex === idx
                      ? "ring-2 ring-ink-1 scale-105"
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
              <div className="flex items-center gap-2 p-2 bg-plane border border-line rounded-inner">
                <span className="text-micro font-medium text-ink-3 uppercase mr-2 select-none">Decision:</span>
                {hasSource && hasTarget && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "target" })}
                      className={`px-3 py-1 rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring ${
                        choice === "target" ? "bg-fill text-on-fill" : "bg-page hover:bg-plane-2 text-ink-2 border border-line"
                      }`}
                    >
                      Keep Destination
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "source" })}
                      className={`px-3 py-1 rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring ${
                        choice === "source" ? "bg-fill text-on-fill" : "bg-page hover:bg-plane-2 text-ink-2 border border-line"
                      }`}
                    >
                      Overwrite with Source
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "both" })}
                      className={`px-3 py-1 rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring ${
                        choice === "both" ? "bg-fill text-on-fill" : "bg-page hover:bg-plane-2 text-ink-2 border border-line"
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
                      className={`px-3 py-1 rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring ${
                        choice === "source" ? "bg-fill text-on-fill" : "bg-page hover:bg-plane-2 text-ink-2 border border-line"
                      }`}
                    >
                      Include from Source
                    </button>
                    <button
                      onClick={() => setSectionChoices({ ...sectionChoices, [key]: "skip" })}
                      className={`px-3 py-1 rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring ${
                        choice === "skip" ? "bg-plane text-state-danger border border-line" : "bg-page hover:bg-plane-2 text-ink-2 border border-line"
                      }`}
                    >
                      Skip Section
                    </button>
                  </div>
                )}
                {hasTarget && !hasSource && (
                  <span className="text-micro font-medium text-ink-3 italic pl-1">
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
                className={`flex flex-col text-left border rounded-inner p-3 overflow-y-auto cursor-pointer transition-colors duration-hover ease-spring ${
                  sectionChoices[currentSection?.heading || "__preamble"] === "source"
                    ? "border-ink-1 bg-tint"
                    : "border-line hover:border-line-2 bg-plane"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-1 flex items-center gap-1">
                    <ArrowRightIcon size={10} />
                    Source (Incoming)
                  </span>
                  {!currentSection?.sourceContent && (
                    <span className="text-micro font-medium uppercase text-state-danger bg-plane px-1 rounded-inner">
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
                className={`flex flex-col text-left border rounded-inner p-3 overflow-y-auto cursor-pointer transition-colors duration-hover ease-spring ${
                  sectionChoices[currentSection?.heading || "__preamble"] === "target"
                    ? "border-ink-1 bg-tint"
                    : "border-line hover:border-line-2 bg-plane"
                }`}
              >
                <div className="flex justify-between items-center mb-2">
                  <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-2 flex items-center gap-1">
                    <CheckIcon size={10} />
                    Destination (Current)
                  </span>
                  {!currentSection?.targetContent && (
                    <span className="text-micro font-medium uppercase text-state-danger bg-plane px-1 rounded-inner">
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
            <div className="border border-line bg-plane rounded-inner p-3 flex flex-col min-h-0">
              <div className="flex justify-between items-center mb-2">
                <span className="text-micro font-medium uppercase tracking-[.06em] text-ink-3 flex items-center gap-1 select-none">
                  <DocumentTextIcon size={10} />
                  Live Merged Preview
                </span>
              </div>
              <div className="flex-1 overflow-y-auto border border-line bg-page p-3 rounded-inner font-mono text-micro text-ink-2 whitespace-pre-wrap leading-relaxed break-all">
                {getMergedPreviewContent()}
              </div>
            </div>
          </div>

          {/* Actions */}
          {deployError && (
            <div className="p-2 border border-line bg-plane text-state-danger text-xs rounded-inner">
              {deployError}
            </div>
          )}

          <div className="flex justify-between gap-3 mt-2">
            <button
              onClick={onBack}
              className="px-5 py-2 rounded-inner border border-line bg-page hover:bg-plane-2 text-xs font-medium text-ink-2 cursor-pointer transition-colors"
            >
              Back
            </button>
            <button
              disabled={deployLoading}
              onClick={onApplyMerge}
              className="px-6 py-2 rounded-inner bg-fill text-on-fill text-xs font-medium cursor-pointer hover:opacity-95 disabled:opacity-50 transition-opacity flex items-center gap-2"
            >
              Apply Merge & Deploy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
