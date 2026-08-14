import React from "react";
import { invoke } from "@tauri-apps/api/core";

interface SourceListShellProps {
  /** Test hook for the concrete list rendered inside. */
  testId: string;
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  children: React.ReactNode;
}

/**
 * The second column's chrome: its width, its drag handle, and the Finder-style
 * snap shut when the drag crosses 160px.
 *
 * Whatever the column is listing — repositories on My machine, issue filters
 * under Needs review — the sizing behaviour and the two preferences that
 * persist it live here and nowhere else. Two lists that each remembered their
 * own width would drift apart the first time one of them changed.
 */
export default function SourceListShell({
  testId,
  width,
  setWidth,
  collapsed,
  setCollapsed,
  children,
}: SourceListShellProps) {
  if (collapsed) {
    return null;
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const collapse = () => {
      setCollapsed(true);
      invoke("set_preference", { key: "sidebar_collapsed", value: "true" }).catch(() => {});
    };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rawWidth = startWidth + (moveEvent.clientX - startX);
      if (rawWidth < 160) {
        collapse();
        return;
      }
      setWidth(Math.max(200, Math.min(320, rawWidth)));
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);

      const rawWidth = startWidth + (moveEvent.clientX - startX);
      if (rawWidth < 160) {
        collapse();
        return;
      }
      const finalWidth = Math.max(200, Math.min(320, rawWidth));
      setWidth(finalWidth);
      invoke("set_preference", { key: "sidebar_width", value: String(finalWidth) }).catch((err) => {
        console.error("Failed to save sidebar_width preference:", err);
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    <div
      data-testid={testId}
      style={{ width }}
      className="h-full flex flex-col bg-page border-r border-line relative select-none shrink-0 font-sans transition-[width] duration-240"
    >
      <div className="flex-1 overflow-y-auto px-2.5 pt-1 pb-3 min-h-0">{children}</div>

      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-line-2 select-none z-10 transition-colors duration-hover"
      />
    </div>
  );
}
