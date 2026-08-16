import SourceListShell from "./SourceListShell";
import { DESIGN_SECTIONS, type DesignSectionId } from "../data/designSystemFixtures";

interface DesignSystemSidebarProps {
  width: number;
  setWidth: (w: number) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  section: DesignSectionId;
  onSelectSection: (id: DesignSectionId) => void;
}

const grpClass =
  "flex items-center justify-between px-2.5 pt-[11px] pb-[5px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

/**
 * Under Design system the second column is a table of contents: one row per
 * section of the page, in reading order. Choosing a row scrolls the one page
 * to that section rather than swapping views — the page stays whole.
 */
export default function DesignSystemSidebar({
  width,
  setWidth,
  collapsed,
  setCollapsed,
  section,
  onSelectSection,
}: DesignSystemSidebarProps) {
  const row = (active: boolean) =>
    `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
      active ? "bg-tint-plane text-tint-ink" : "text-ink-2 hover:bg-tint-plane"
    }`;

  return (
    <SourceListShell
      testId="design-sidebar"
      width={width}
      setWidth={setWidth}
      collapsed={collapsed}
      setCollapsed={setCollapsed}
    >
      <div className={grpClass}>Sections</div>
      {DESIGN_SECTIONS.map((entry) => {
        const active = section === entry.id;
        return (
          <div
            key={entry.id}
            role="button"
            tabIndex={0}
            aria-current={active ? "true" : undefined}
            onClick={() => onSelectSection(entry.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectSection(entry.id);
              }
            }}
            className={row(active)}
          >
            <span className={`flex-1 min-w-0 truncate text-base-app ${active ? "font-medium" : ""}`}>
              {entry.label}
            </span>
          </div>
        );
      })}
    </SourceListShell>
  );
}
