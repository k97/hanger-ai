import React from "react";
import { User, Folder, FolderTree, Globe, Settings, Plus, Search, Trash2 } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Inventory, CategoryCounts } from "../App";
import { sumGlobalAssets } from "../utils/globalAssetCount";
import { containerSubtitle, linkedDescendants } from "../utils/containerRoots";

interface SidebarProps {
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  selectedItem: string;
  setSelectedItem: (item: string) => void;
  inventory: Inventory | null;
  assetCounts: CategoryCounts | null;
  detectedEngines: { id: string; name: string }[];
  linkedRepos: string[];
  loadLinkedRepos: () => Promise<void>;
  onOpenSettings: () => void;
  onTriggerScan: (root: string) => void;
  onRefreshGlobalCounts?: () => Promise<void>;
  setError: (err: string) => void;
}

export default function Sidebar({
  width,
  setWidth,
  collapsed,
  setCollapsed,
  selectedItem,
  setSelectedItem,
  inventory,
  assetCounts,
  detectedEngines,
  linkedRepos,
  loadLinkedRepos,
  onOpenSettings,
  onTriggerScan,
  onRefreshGlobalCounts,
  setError,
}: SidebarProps) {
  if (collapsed) {
    return null;
  }

  // Drag Resizing Logic with Finder snap-closed behavior
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rawWidth = startWidth + (moveEvent.clientX - startX);
      if (rawWidth < 160) {
        setCollapsed(true);
        invoke("set_preference", { key: "sidebar_collapsed", value: "true" }).catch(() => {});
        return;
      }
      const newWidth = Math.max(200, Math.min(320, rawWidth));
      setWidth(newWidth);
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      
      const rawWidth = startWidth + (moveEvent.clientX - startX);
      if (rawWidth < 160) {
        setCollapsed(true);
        invoke("set_preference", { key: "sidebar_collapsed", value: "true" }).catch(() => {});
      } else {
        const finalWidth = Math.max(200, Math.min(320, rawWidth));
        setWidth(finalWidth);
        invoke("set_preference", { key: "sidebar_width", value: String(finalWidth) }).catch((err) => {
          console.error("Failed to save sidebar_width preference:", err);
        });
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  // Profile row: detected engines as the subtitle, global asset total as the
  // badge — same count path as the profile pane (sumGlobalAssets), so the two
  // figures cannot diverge. inventory.agents is empty by design (engines are
  // containers, not assets) and must not be read for either.
  const agentsSubtitle =
    detectedEngines.length > 0 ? detectedEngines.map((e) => e.name).join(", ") : "No agents detected";
  const globalAssetsTotal = sumGlobalAssets(assetCounts);

  // State for per-repository asset counts from backend IPC
  const [repoCounts, setRepoCounts] = React.useState<Record<string, number>>({});

  React.useEffect(() => {
    let cancelled = false;
    async function fetchRepoCounts() {
      const countsMap: Record<string, number> = {};
      for (const repoPath of linkedRepos) {
        try {
          const res = await invoke<{ total_assets: number }>("get_asset_counts", { root: repoPath });
          countsMap[repoPath] = res?.total_assets || 0;
        } catch {
          countsMap[repoPath] = 0;
        }
      }
      if (!cancelled) {
        setRepoCounts(countsMap);
      }
    }
    if (linkedRepos.length > 0) {
      fetchRepoCounts();
    } else {
      setRepoCounts({});
    }
    return () => {
      cancelled = true;
    };
  }, [linkedRepos, inventory]);

  // Add repository manual trigger
  const handleAddRepo = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        // Broad roots are allowed through: the scanner caps traversal at 6
        // levels and surfaces the cap as a warning. No gate here.
        //
        // link_directory canonicalises before storing, so select the path it
        // returns — selecting the picked path would highlight a row that does
        // not exist when the pick came through a symlink.
        const linked = await invoke<string>("link_directory", { path: selected });
        await loadLinkedRepos();
        setSelectedItem(linked);
      }
    } catch (err: any) {
      setError(String(err));
    }
  };

  // Scan repositories trigger
  const handleScanRepos = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected && typeof selected === "string") {
        onTriggerScan(selected);
      }
    } catch (err: any) {
      setError(String(err));
    }
  };

  return (
    <div
      data-testid="sidebar"
      style={{ width }}
      className="h-full flex flex-col bg-surface border-r border-n-100 relative select-none shrink-0 font-sans transition-[width] duration-240"
    >
      {/* Sidebar Header: Profile selector */}
      <div className="p-3 border-b border-n-100">
        <div
          onClick={() => {
            setSelectedItem("profile");
            invoke("set_preference", { key: "selected_sidebar_item", value: "profile" }).catch(() => {});
          }}
          className={`flex items-center justify-between p-2 rounded-control cursor-pointer transition-colors ${
            selectedItem === "profile"
              ? "bg-n-50 font-medium text-text-primary"
              : "hover:bg-n-50/50 text-text-secondary"
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <User size={16} className="text-text-secondary shrink-0" />
            <div className="truncate">
              <span className="text-xs font-medium block">User Profile</span>
              <span className="text-[10px] text-text-muted truncate block">
                {agentsSubtitle}
              </span>
            </div>
          </div>
          <span className="text-xs text-text-muted font-normal shrink-0">
            {globalAssetsTotal}
          </span>
        </div>
      </div>

      {/* Sidebar Body: Repositories List */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-0">
        <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-text-muted">
          <span>Repositories</span>
          <span className="text-xs font-normal">({linkedRepos.length})</span>
        </div>

        {linkedRepos.length === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-text-muted flex flex-col gap-2 leading-relaxed">
            <span>No repositories linked. Link a project folder to manage and deploy assets.</span>
            <button
              onClick={handleAddRepo}
              className="text-xs font-medium text-accent hover:underline flex items-center gap-1 justify-center cursor-pointer"
            >
              <Plus size={12} /> Add Repo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {linkedRepos.map((repoPath) => {
              const isActive = selectedItem === repoPath;
              const folderName = repoPath.split("/").pop() || repoPath;
              const count = repoCounts[repoPath] || 0;
              const childCount = linkedDescendants(repoPath, linkedRepos).length;
              const container = childCount > 0;
              return (
                <div
                  key={repoPath}
                  onClick={() => {
                    setSelectedItem(repoPath);
                    invoke("set_preference", { key: "selected_sidebar_item", value: repoPath }).catch(() => {});
                  }}
                  className={`group flex items-center justify-between p-2 rounded-control cursor-pointer transition-colors text-xs ${
                    isActive
                      ? "bg-n-50 font-medium text-text-primary"
                      : "hover:bg-n-50/50 text-text-secondary"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {container ? (
                      <FolderTree size={14} className="text-text-muted shrink-0" />
                    ) : (
                      <Folder size={14} className="text-text-muted shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="truncate block" title={repoPath}>
                        {folderName}
                      </span>
                      {container && (
                        <span className="text-[10px] text-text-muted truncate block">
                          {containerSubtitle(childCount)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-text-muted font-normal">
                      {count}
                    </span>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          await invoke("unlink_directory", { path: repoPath });
                          await loadLinkedRepos();
                          if (onRefreshGlobalCounts) {
                            await onRefreshGlobalCounts();
                          }
                        } catch (err: any) {
                          setError(String(err));
                        }
                      }}
                      className="p-1 rounded-control hover:bg-surface text-text-muted hover:text-text-primary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
                      title="Unlink repository"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pinned Bottom Actions */}
      <div className="p-3 border-t border-n-100 flex flex-col gap-1.5">
        <button
          onClick={handleAddRepo}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-control hover:bg-n-50 text-xs font-medium text-text-secondary transition-colors cursor-pointer"
        >
          <Plus size={14} className="shrink-0" />
          <span className="whitespace-nowrap">Add repository…</span>
        </button>
        <button
          onClick={handleScanRepos}
          className="w-full flex items-center gap-2 px-3 py-1.5 rounded-control hover:bg-n-50 text-xs font-medium text-text-secondary transition-colors cursor-pointer"
        >
          <Search size={14} className="shrink-0" />
          <span className="whitespace-nowrap">Scan for repositories…</span>
        </button>
      </div>

      {/* Bottom Pinned Controls (Discovery & Settings) */}
      <div className="p-3 border-t border-n-100 bg-n-50 flex items-center justify-between">
        <div
          onClick={() => {
            setSelectedItem("discovery");
            invoke("set_preference", { key: "selected_sidebar_item", value: "discovery" }).catch(() => {});
          }}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-control cursor-pointer transition-colors text-xs font-medium ${
            selectedItem === "discovery"
              ? "bg-surface text-text-primary border border-n-100"
              : "hover:bg-surface/50 text-text-secondary"
          }`}
        >
          <Globe size={14} className="text-brand-lime" />
          <span>Discovery</span>
        </div>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-control hover:bg-surface/50 text-text-muted hover:text-text-primary transition-colors cursor-pointer"
          title="Settings"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* Drag Resize Handle */}
      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-accent/40 select-none z-10 transition-colors"
      />
    </div>
  );
}
