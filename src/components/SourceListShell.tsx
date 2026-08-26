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

    // Marks the drag for CSS. The rail column in App.tsx sizes off the same
    // `sidebarWidth` this handle writes, and it carries a width transition so
    // its collapse eases rather than jumps; while the handle is held, that
    // transition has to be off. See the `[data-rail-column]` rule in
    // styles/index.css for why, and for why this column has no transition of
    // its own to suppress.
    document.body.dataset.resizingSidebar = "true";

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
      setWidth(Math.max(216, Math.min(320, rawWidth)));
    };

    const handleMouseUp = (moveEvent: MouseEvent) => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      // Before the early return below, not after it: a drag that ends past
      // the snap-shut threshold collapses and returns, and a flag left set
      // there would disable the collapse animation it exists to protect.
      delete document.body.dataset.resizingSidebar;

      const rawWidth = startWidth + (moveEvent.clientX - startX);
      if (rawWidth < 160) {
        collapse();
        return;
      }
      const finalWidth = Math.max(216, Math.min(320, rawWidth));
      setWidth(finalWidth);
      invoke("set_preference", { key: "sidebar_width", value: String(finalWidth) }).catch((err) => {
        console.error("Failed to save sidebar_width preference:", err);
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  return (
    // The source list is a card on the shared plane: --line borders on top
    // and left (the parent column's border-r closes the third side), a
    // 16px radius on the top-left corner only, bleeding off the bottom
    // edge — the same treatment as the strip and the table.
    //
    // No width transition on it, deliberately. This column unmounts when the
    // sidebar collapses (the `if (collapsed) return null` above), so a
    // transition on its width could never animate the collapse — the only
    // thing that changes `width` while it is mounted is the drag handle
    // below, and easing a value the user is dragging makes the column trail
    // the cursor by the transition's whole duration. It carried a 240ms width
    // transition until 2026-08-26.
    //
    // The class is named in prose here rather than spelled, on purpose:
    // Tailwind v4 scans raw file text, comments included, so writing the
    // utility out would have it emit a rule with no user — which is how the
    // retired 240ms duration survived its own removal for one build.
    <div
      data-testid={testId}
      style={{ width }}
      className="h-full flex flex-col border-t border-l border-line rounded-tl-plane relative select-none shrink-0 font-sans"
    >
      <div className="flex-1 overflow-y-auto px-2 pt-1.5 pb-3 min-h-0">{children}</div>

      <div
        onMouseDown={handleMouseDown}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-line-2 select-none z-10 transition-colors duration-hover"
      />
    </div>
  );
}
