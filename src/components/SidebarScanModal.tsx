import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { X, Search, Folder } from "lucide-react";

interface SidebarScanModalProps {
  isOpen: boolean;
  /** Already-discovered repositories, minus anything already linked. */
  candidates: string[];
  /** True when the walk that found them stopped at the broad-root depth cap. */
  depthCapped?: boolean;
  onClose: () => void;
  onLinked: () => void;
}

// Candidates arrive already discovered: every linked root is probed during the
// scan it already performs, so this no longer starts a walk of its own. What
// survives from the old scan modal is the part worth keeping — filter,
// select-all over the filtered subset, and the checklist.
export default function SidebarScanModal({
  isOpen,
  candidates,
  depthCapped = false,
  onClose,
  onLinked,
}: SidebarScanModalProps) {
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const initialSelection: Record<string, boolean> = {};
    candidates.forEach((path) => {
      initialSelection[path] = true;
    });
    setSelectedCandidates(initialSelection);
    setSearchTerm("");
    setError(null);
  }, [isOpen, candidates]);

  const filteredCandidates = candidates.filter((c) =>
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleToggleSelectAll = () => {
    const allSelected = filteredCandidates.every((c) => selectedCandidates[c]);
    const nextSelection = { ...selectedCandidates };
    filteredCandidates.forEach((c) => {
      nextSelection[c] = !allSelected;
    });
    setSelectedCandidates(nextSelection);
  };

  const handleToggleCandidate = (path: string) => {
    setSelectedCandidates((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  const handleLinkSelected = async () => {
    const toLink = Object.entries(selectedCandidates)
      .filter(([_, isChecked]) => isChecked)
      .map(([path]) => path);

    if (toLink.length === 0) return;

    setLinking(true);
    const linked: string[] = [];
    try {
      for (const path of toLink) {
        await invoke("link_directory", { path });
        linked.push(path);
      }
      onLinked();
      onClose();
    } catch (err: any) {
      // A failure part-way leaves earlier links in place. Say which ones
      // landed rather than implying the whole batch failed.
      const done = linked.length > 0 ? ` Linked before failing: ${linked.join(", ")}.` : "";
      setError(`${String(err)}${done}`);
    } finally {
      setLinking(false);
    }
  };

  const selectedCount = Object.values(selectedCandidates).filter(Boolean).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim animate-fade-in font-sans">
      <div className="w-full max-w-lg bg-page border border-line rounded-plane flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-[18px] pb-3.5 border-b border-line">
          <div className="flex flex-col">
            <span className="text-lg-app font-medium tracking-[-0.3px] text-ink-1">Promote Repositories</span>
            <span className="text-small text-ink-3 mt-0.5">
              Each one becomes its own row, with its own assets and deploys.
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-[27px] h-[27px] rounded-pill grid place-items-center text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-plane border border-line text-state-danger rounded-inner text-small font-mono break-all">
              {error}
            </div>
          )}

          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-ink-3">
              <Folder size={36} className="mb-2 stroke-[1.5]" />
              <span className="text-base-app font-medium text-ink-1">Nothing left to promote</span>
              <span className="text-small max-w-xs mt-1">
                Every repository found inside this folder is already linked.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {depthCapped && (
                <p className="text-small text-ink-3 leading-relaxed">
                  This is a broad folder, so the search stopped at 6 levels — repositories
                  deeper than that are not listed.
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1 h-[27px]">
                  <Search
                    size={12}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
                  />
                  <input
                    type="text"
                    placeholder="Filter candidates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-full pl-[30px] pr-3.5 rounded-pill border border-transparent bg-plane text-small text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ink-1 focus:bg-page transition-colors duration-hover font-sans"
                  />
                </div>
                <button
                  onClick={handleToggleSelectAll}
                  className="text-small font-medium text-ink-2 hover:text-ink-1 hover:underline shrink-0 px-1 cursor-pointer"
                >
                  {filteredCandidates.every((c) => selectedCandidates[c])
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-line rounded-inner bg-plane min-h-[200px] max-h-[350px] p-1.5 flex flex-col gap-px">
                {filteredCandidates.map((path) => {
                  const isChecked = !!selectedCandidates[path];
                  const folderName = path.split("/").pop() || path;
                  return (
                    <div
                      key={path}
                      onClick={() => handleToggleCandidate(path)}
                      className="flex items-start gap-3 px-2.5 py-2 rounded-pill hover:bg-plane-2 transition-colors duration-hover ease-spring cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 accent-[var(--fill)]"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-base-app font-medium text-ink-1 block truncate">
                          {folderName}
                        </span>
                        <span className="text-micro text-ink-3 font-mono block truncate">
                          {path}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        {candidates.length > 0 && (
          <div className="p-[18px] pt-3.5 border-t border-line flex justify-between items-center shrink-0">
            <span className="text-micro text-ink-3 font-flex tabular">
              Selected: {selectedCount} / {candidates.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 h-[30px] rounded-pill border border-line-2 hover:bg-plane-2 text-small font-medium text-ink-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSelected}
                disabled={selectedCount === 0 || linking}
                className="px-4 h-[30px] rounded-pill bg-fill text-on-fill text-small font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-transform duration-press ease-spring active:scale-[0.96] cursor-pointer"
              >
                {linking ? "Linking…" : "Link Repositories"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
