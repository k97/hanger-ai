import { Loader2, Globe, StopCircle } from "lucide-react";

interface ProjectBubble {
  id: string;
  name: string;
  count: number;
  layered: boolean;
  warningsCount: number;
}

interface AgentBubble {
  id: string;
  name: string;
  count: number;
}

interface ConstellationProps {
  projectBubbles: ProjectBubble[];
  agentBubbles: AgentBubble[];
  selectedBubble: { type: "project" | "agent"; id: string; name: string } | null;
  setSelectedBubble: (val: { type: "project" | "agent"; id: string; name: string } | null) => void;
  loading: boolean;
  scanning?: boolean;
  scanProgress?: {
    scanId: string;
    dirs: number;
    files: number;
    current: string;
  } | null;
  onCancelScan?: () => void;
}

export default function Constellation({
  projectBubbles,
  agentBubbles,
  selectedBubble,
  setSelectedBubble,
  loading,
  scanning,
  scanProgress,
  onCancelScan
}: ConstellationProps) {
  const getBubbleSize = (assetsCount: number) => {
    const minSize = 80;
    const maxSize = 160;
    return Math.min(maxSize, minSize + assetsCount * 8);
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-bold text-ink-1">Project Constellation</h2>
        {scanning && scanProgress ? (
          <div className="flex items-center gap-3 bg-surface-elevated px-4 py-1.5 rounded-xs border border-hairline shadow-sm">
            <Loader2 className="animate-spin text-accent" size={14} />
            <span className="text-xs font-semibold text-ink-2">
              Scanning: {scanProgress.dirs} dirs, {scanProgress.files} files
            </span>
            <button
              onClick={onCancelScan}
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-error-text hover:bg-error-bg/10 px-2 py-0.5 rounded transition-all cursor-pointer"
              title="Abort current scan"
            >
              <StopCircle size={12} />
              Cancel
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-3">Interactive nodes scaled by local assets count</p>
        )}
      </div>

      <div className="w-full min-h-[300px] border border-hairline bg-surface-elevated rounded-md p-8 flex flex-wrap items-center justify-center gap-8 shadow-inner relative overflow-hidden">
        {scanning && scanProgress ? (
          <div className="flex flex-col items-center gap-3 text-ink-mute py-12 w-full max-w-lg">
            <Loader2 className="animate-spin text-accent" size={32} />
            <h4 className="text-sm font-semibold text-ink-2">Traversing linked directories...</h4>
            <div className="w-full bg-surface border border-hairline rounded-md p-3 text-left">
              <div className="text-[10px] font-bold uppercase text-ink-mute tracking-wider mb-1">
                Active scan trace
              </div>
              <div className="font-mono text-xs text-ink-3 truncate leading-normal" title={scanProgress.current}>
                {scanProgress.current}
              </div>
            </div>
            <button
              onClick={onCancelScan}
              className="mt-2 px-5 py-1.5 rounded-md border border-error-border bg-error-bg text-error-text text-xs font-bold uppercase tracking-wider hover:opacity-95 transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <StopCircle size={14} />
              Cancel Scanning
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center gap-2 text-ink-mute">
            <Loader2 className="animate-spin" size={32} />
            <span className="text-ui">Scanning directory assets...</span>
          </div>
        ) : projectBubbles.length === 0 && agentBubbles.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-ink-mute py-12">
            <Globe size={48} className="stroke-[1.5]" />
            <p className="text-ui text-center max-w-sm">
              No linked projects or active agent global configurations found. Link a directory above to start scanning.
            </p>
          </div>
        ) : (
          <>
            {projectBubbles.map((bubble) => {
              const size = getBubbleSize(bubble.count);
              const isSelected = selectedBubble?.id === bubble.id;
              return (
                <button
                  key={bubble.id}
                  onClick={() =>
                    setSelectedBubble(
                      isSelected
                        ? null
                        : { type: "project", id: bubble.id, name: bubble.name }
                    )
                  }
                  style={{ width: size, height: size }}
                  className={`rounded-full flex flex-col items-center justify-center text-center p-3 transition-all duration-300 relative cursor-pointer group outline-none aspect-square shadow-sm ${
                    isSelected
                      ? "bg-accent text-on-accent ring-4 ring-accent/30 scale-105"
                      : "bg-surface border-2 border-hairline hover:border-accent text-ink-1 hover:scale-105"
                  }`}
                >
                  <span className="text-xs font-semibold truncate max-w-full">
                    {bubble.name}
                  </span>
                  <span
                    className={`text-2xl font-black mt-1 ${
                      isSelected ? "text-on-accent" : "text-ink-2"
                    }`}
                  >
                    {bubble.count}
                  </span>

                  {bubble.warningsCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-warning-border text-warning-text text-[10px] font-bold flex items-center justify-center aspect-square ring-2 ring-surface-elevated">
                      {bubble.warningsCount}
                    </span>
                  )}

                  {bubble.layered && (
                    <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-xs bg-error-border text-error-text text-[9px] font-bold flex items-center justify-center ring-2 ring-surface-elevated uppercase">
                      layered
                    </span>
                  )}
                </button>
              );
            })}

            {agentBubbles.map((bubble) => {
              const size = getBubbleSize(bubble.count);
              const isSelected = selectedBubble?.id === bubble.id;
              return (
                <button
                  key={bubble.id}
                  onClick={() =>
                    setSelectedBubble(
                      isSelected
                        ? null
                        : { type: "agent", id: bubble.id, name: bubble.name }
                    )
                  }
                  style={{ width: size, height: size }}
                  className={`rounded-full flex flex-col items-center justify-center text-center p-3 transition-all duration-300 relative cursor-pointer group outline-none aspect-square shadow-sm ${
                    isSelected
                      ? "bg-accent text-on-accent ring-4 ring-accent/30 scale-105"
                      : "bg-surface border-2 border-dashed border-hairline hover:border-accent text-ink-1 hover:scale-105"
                  }`}
                >
                  <span className="text-[10px] uppercase font-bold text-ink-mute group-hover:text-accent select-none">
                    Agent Global
                  </span>
                  <span className="text-xs font-semibold truncate max-w-full mt-0.5">
                    {bubble.name}
                  </span>
                  <h3
                    className={`text-2xl font-black mt-0.5 ${
                      isSelected ? "text-on-accent" : "text-ink-2"
                    }`}
                  >
                    {bubble.count}
                  </h3>
                </button>
              );
            })}
          </>
        )}
      </div>
    </section>
  );
}
