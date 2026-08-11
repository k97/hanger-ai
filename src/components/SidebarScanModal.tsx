import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { X, Search, Folder, AlertTriangle, Loader2 } from "lucide-react";

interface SidebarScanModalProps {
  isOpen: boolean;
  scanRoot: string;
  onClose: () => void;
  onLinked: () => void;
}

interface RepoProgressPayload {
  scan_id: string;
  dirs_visited: number;
  files_visited: number;
  current_path: string;
}

interface RepoCompletePayload {
  scan_id: string;
  candidates: string[];
  warnings: string[];
}

export default function SidebarScanModal({
  isOpen,
  scanRoot,
  onClose,
  onLinked,
}: SidebarScanModalProps) {
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);
  const [progress, setProgress] = useState<RepoProgressPayload | null>(null);
  const [candidates, setCandidates] = useState<string[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<Record<string, boolean>>({});
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  useEffect(() => {
    if (!isOpen || !scanRoot) return;

    let unlistenProgress: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;

    const setupScan = async () => {
      try {
        setError(null);
        setScanning(true);
        setIsCancelling(false);
        setCandidates([]);
        setWarnings([]);

        // Listen for progress updates
        unlistenProgress = await listen<RepoProgressPayload>(
          "reposcan://progress",
          (event) => {
            setProgress(event.payload);
          }
        );

        // Listen for scan completion
        unlistenComplete = await listen<RepoCompletePayload>(
          "reposcan://complete",
          (event) => {
            setScanning(false);
            const list = event.payload.candidates;
            setCandidates(list);
            setWarnings(event.payload.warnings);

            // Select all by default
            const initialSelection: Record<string, boolean> = {};
            list.forEach((path) => {
              initialSelection[path] = true;
            });
            setSelectedCandidates(initialSelection);
          }
        );

        // Listen for errors
        unlistenError = await listen<{ scan_id: string; error: string }>(
          "reposcan://error",
          (event) => {
            setScanning(false);
            setError(event.payload.error);
          }
        );

        // Start scanning
        const id = await invoke<string>("start_repo_scan", { path: scanRoot });
        setScanId(id);
      } catch (err: any) {
        setScanning(false);
        setError(String(err));
      }
    };

    setupScan();

    return () => {
      if (unlistenProgress) unlistenProgress();
      if (unlistenComplete) unlistenComplete();
      if (unlistenError) unlistenError();
    };
  }, [isOpen, scanRoot]);

  const handleCancel = async () => {
    if (!scanId || isCancelling) return;
    try {
      setIsCancelling(true);
      await invoke("cancel_scan", { scanId });
      onClose();
    } catch (err: any) {
      setError(String(err));
      setIsCancelling(false);
    }
  };

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

    try {
      for (const path of toLink) {
        await invoke("link_directory", { path });
      }
      onLinked();
      onClose();
    } catch (err: any) {
      setError(String(err));
    }
  };

  const filteredCandidates = candidates.filter((c) =>
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedCount = Object.values(selectedCandidates).filter(Boolean).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-scrim animate-fade-in font-sans">
      <div className="w-full max-w-lg bg-surface border border-n-100 rounded-xl shadow-xl flex flex-col max-h-[85vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 border-b border-n-100 bg-surface">
          <div className="flex flex-col">
            <span className="text-md font-bold text-text-primary">Scan for Repositories</span>
            <span className="text-xs text-text-muted truncate max-w-[320px] font-mono">
              Root: {scanRoot}
            </span>
          </div>
          <button
            onClick={scanning ? handleCancel : onClose}
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

          {scanning ? (
            /* Scanning Active UI */
            <div className="flex flex-col items-center justify-center py-12 gap-4 text-center">
              <Loader2 className="animate-spin text-brand-lime" size={32} />
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold text-text-primary">
                  Scanning Directory Tree...
                </span>
                <span className="text-xs text-text-muted">
                  Directories: {progress?.dirs_visited || 0} | Files: {progress?.files_visited || 0}
                </span>
              </div>
              {progress?.current_path && (
                <div className="max-w-xs w-full">
                  <span className="text-[10px] text-text-muted font-mono block truncate">
                    {progress.current_path}
                  </span>
                </div>
              )}
              <button
                onClick={handleCancel}
                disabled={isCancelling}
                className="mt-4 px-4 py-1.5 rounded-full border border-n-100 hover:bg-n-50 text-xs font-bold text-text-secondary transition-all"
              >
                {isCancelling ? "Cancelling..." : "Cancel Scan"}
              </button>
            </div>
          ) : (
            /* Scanning Completed Checklist UI */
            <div className="flex flex-col gap-3 flex-1 min-h-0">
              {warnings.length > 0 && (
                <div className="p-3 rounded-md border border-warning-border bg-warning-bg text-warning-text flex flex-col gap-1">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle size={12} />
                    Scan Warning
                  </span>
                  <ul className="text-xs list-disc pl-4 flex flex-col gap-0.5">
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {candidates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-text-muted">
                  <Folder size={36} className="mb-2 stroke-[1.5]" />
                  <span className="text-sm font-semibold">No repositories found</span>
                  <span className="text-xs max-w-xs mt-1">
                    No directories with .git, agent configurations, or Rules files were detected.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-3 flex-1 min-h-0">
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
          )}
        </div>

        {/* Modal Footer */}
        {!scanning && candidates.length > 0 && (
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
                disabled={selectedCount === 0}
                className="px-4 py-1.5 rounded-full bg-accent text-on-accent text-xs font-bold tracking-wide uppercase shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 transition-all"
              >
                Link Repositories
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
