import React from "react";
import { GlobeAltIcon, FolderIcon, FolderTreeIcon, PlusIcon, TrashIcon } from "./icons";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Inventory, CategoryCounts } from "../App";
import { sumGlobalAssets } from "../utils/globalAssetCount";
import { containerSubtitle, linkedDescendants, hasLinkedAncestor } from "../utils/containerRoots";
import SourceListShell from "./SourceListShell";
import Tooltip from "./Tooltip";

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
  onRefreshGlobalCounts,
  setError,
}: SidebarProps) {
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

  // Source-list row voice: 30px tonal pills, tint when current, micro counts.
  const grpClass =
    "flex items-center justify-between px-2.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

  return (
    <SourceListShell
      testId="sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
        {/* Scope group */}
        <div className={grpClass}>Scope</div>
        <div
          onClick={() => {
            setSelectedItem("profile");
            invoke("set_preference", { key: "selected_sidebar_item", value: "profile" }).catch(() => {});
          }}
          tabIndex={0}
          className={`flex items-center gap-2 h-[46px] px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
            selectedItem === "profile" ? "bg-tint-plane text-tint-ink" : "text-ink-2 hover:bg-tint-plane"
          }`}
        >
          <GlobeAltIcon
            size={15}
            className={`shrink-0 ${selectedItem === "profile" ? "text-tint-ink" : "text-ink-3"}`}
          />
          <div className="flex-1 min-w-0">
            <span
              className={`text-base-app truncate block ${
                selectedItem === "profile" ? "font-medium" : ""
              }`}
            >
              Global
            </span>
            <span
              className={`text-micro truncate block ${
                selectedItem === "profile" ? "text-tint-ink opacity-70" : "text-ink-3"
              }`}
            >
              {agentsSubtitle}
            </span>
          </div>
          <span
            className={`text-micro tabular font-flex shrink-0 ${
              selectedItem === "profile" ? "text-tint-ink opacity-70" : "text-ink-3"
            }`}
          >
            {globalAssetsTotal}
          </span>
        </div>

        {/* Repositories group */}
        <div className={grpClass}>
          <span>Repositories</span>
          <Tooltip label="Add a repository" placement="bottom">
            <button
              onClick={handleAddRepo}
              aria-label="Add a repository"
              className="w-[22px] h-[22px] rounded-pill grid place-items-center text-ink-2 hover:bg-tint-plane hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer"
            >
              <PlusIcon size={14} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>

        {linkedRepos.length === 0 ? (
          <div className="px-2 py-4 text-center text-small text-ink-3 flex flex-col gap-2 leading-relaxed">
            <span>No repositories linked. Link a project folder to manage and deploy assets.</span>
            <button
              onClick={handleAddRepo}
              className="text-small font-medium text-ink-1 hover:underline flex items-center gap-1 justify-center cursor-pointer"
            >
              <PlusIcon size={12} /> Add Repo
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-px">
            {linkedRepos.map((repoPath) => {
              const isActive = selectedItem === repoPath;
              const folderName = repoPath.split("/").pop() || repoPath;
              const count = repoCounts[repoPath] || 0;
              const childCount = linkedDescendants(repoPath, linkedRepos).length;
              const container = childCount > 0;
              const child = hasLinkedAncestor(repoPath, linkedRepos);
              return (
                <div
                  key={repoPath}
                  onClick={() => {
                    setSelectedItem(repoPath);
                    invoke("set_preference", { key: "selected_sidebar_item", value: repoPath }).catch(() => {});
                  }}
                  tabIndex={0}
                  className={`group flex items-center gap-2 ${container ? "h-[46px]" : "h-8"} rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
                    // A repository inside a watched folder does not indent one
                    // level deeper — the folder's subtitle states its reach.
                    // Iconless rows align to the icon column, not the padding
                    // edge: 12px pad + 15px icon + 9px gap = 36px.
                    child ? "pl-9 pr-3" : "px-3"
                  } ${isActive ? "bg-tint-plane text-tint-ink" : "text-ink-2 hover:bg-tint-plane"}`}
                >
                  {!child &&
                    (container ? (
                      <FolderTreeIcon
                        size={15}
                        className={`shrink-0 ${isActive ? "text-tint-ink" : "text-ink-3"}`}
                      />
                    ) : (
                      <FolderIcon
                        size={15}
                        className={`shrink-0 ${isActive ? "text-tint-ink" : "text-ink-3"}`}
                      />
                    ))}
                  <div className="flex-1 min-w-0">
                    <span
                      className={`text-base-app truncate block ${isActive ? "font-medium" : ""}`}
                      title={repoPath}
                    >
                      {folderName}
                    </span>
                    {container && (
                      <span
                        className={`text-micro truncate block ${
                          isActive ? "text-tint-ink opacity-70" : "text-ink-3"
                        }`}
                      >
                        {containerSubtitle(childCount)}
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-micro tabular font-flex shrink-0 ${
                      isActive ? "text-tint-ink opacity-70" : "text-ink-3"
                    }`}
                  >
                    {count}
                  </span>
                  <Tooltip label="Unlink repository" placement="bottom">
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
                    className="p-1 rounded-pill hover:bg-tint-plane text-ink-3 hover:text-ink-1 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity duration-hover cursor-pointer shrink-0"
                    aria-label="Unlink repository"
                  >
                    <TrashIcon size={12} aria-hidden="true" />
                  </button>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        )}
    </SourceListShell>
  );
}
