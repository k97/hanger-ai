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
      <div className="w-full max-w-lg bg-surface border border-n-100 rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-n-100 bg-surface">
          <div className="flex flex-col">
            <span className="text-md font-bold text-text-primary">Promote Repositories</span>
            <span className="text-xs text-text-muted">
              Each one becomes its own row, with its own assets and deploys.
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-n-50 text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
          {error && (
            <div className="p-3 bg-error-bg border border-error-border text-error-text rounded-md text-xs font-mono break-all">
              {error}
            </div>
          )}

          {candidates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted">
              <Folder size={36} className="mb-2 stroke-[1.5]" />
              <span className="text-sm font-semibold">Nothing left to promote</span>
              <span className="text-xs max-w-xs mt-1">
                Every repository found inside this folder is already linked.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {depthCapped && (
                <p className="text-xs text-text-muted leading-relaxed">
                  This is a broad folder, so the search stopped at 6 levels — repositories
                  deeper than that are not listed.
                </p>
              )}

              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1">
                  <Search
                    size={14}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
                  />
                  <input
                    type="text"
                    placeholder="Filter candidates..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 bg-n-50 border border-n-100 rounded-sm text-xs text-text-primary focus:outline-none focus:border-brand-violet font-sans"
                  />
                </div>
                <button
                  onClick={handleToggleSelectAll}
                  className="text-xs font-bold text-brand-violet hover:underline shrink-0 px-1"
                >
                  {filteredCandidates.every((c) => selectedCandidates[c])
                    ? "Deselect All"
                    : "Select All"}
                </button>
              </div>

              <div className="flex-1 overflow-y-auto border border-n-100 rounded-md bg-n-50 divide-y divide-n-100 min-h-[200px] max-h-[350px]">
                {filteredCandidates.map((path) => {
                  const isChecked = !!selectedCandidates[path];
                  const folderName = path.split("/").pop() || path;
                  return (
                    <div
                      key={path}
                      onClick={() => handleToggleCandidate(path)}
                      className="flex items-start gap-3 p-2.5 hover:bg-surface transition-colors cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {}}
                        className="mt-0.5 accent-brand-violet rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-semibold text-text-primary block truncate">
                          {folderName}
                        </span>
                        <span className="text-[10px] text-text-muted font-mono block truncate">
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
          <div className="p-4 border-t border-n-100 bg-surface flex justify-between items-center shrink-0">
            <span className="text-xs text-text-muted font-semibold">
              Selected: {selectedCount} / {candidates.length}
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-full border border-n-100 hover:bg-n-50 text-xs font-bold text-text-secondary transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSelected}
                disabled={selectedCount === 0 || linking}
                className="px-4 py-1.5 rounded-full bg-accent text-on-accent text-xs font-bold tracking-wide uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-all"
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
