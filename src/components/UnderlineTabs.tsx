import { useLayoutEffect, useRef, useState } from "react";

/**
 * Underline tabs (Karthik, 2026-08-22): labels in --ink-2 on a --line
 * baseline, the active one in --ink-1 at medium weight with a 2px --ink-1
 * rule beneath, the rule sliding on the nav beat. Two idioms on purpose: the
 * pane's category selector is a segmented track (it filters a list); these
 * switch views inside one surface. Weight and the rule are the only things
 * that change between tabs.
 *
 * The labels pad symmetrically (`py-2`), the same step the inspector
 * header above them uses — one value per band, so the stack's rhythm is
 * stated once rather than tuned per gap (Karthik, 2026-08-28).
 */

export interface UnderlineTab {
  id: string;
  label: string;
  count?: number;
}

export interface UnderlineTabsProps {
  tabs: UnderlineTab[];
  active: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}

export default function UnderlineTabs({ tabs, active, onChange, ariaLabel }: UnderlineTabsProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [rule, setRule] = useState<{ left: number; width: number } | null>(null);

  // The rule is placed from the active tab's own box, so it follows whatever
  // the label measures; a zero-width box (no layout) draws no rule.
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`#tab-${CSS.escape(active)}`);
    if (!el || el.offsetWidth === 0) {
      setRule(null);
      return;
    }
    setRule({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className="relative flex gap-6 px-[18px] border-b border-line shrink-0"
    >
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            onClick={() => onChange(tab.id)}
            className={`py-2 text-base-app cursor-pointer transition-colors duration-nav ease-spring ${
              selected ? "text-ink-1 font-medium" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && <span className="ml-1.5 tabular text-ink-3">{tab.count}</span>}
          </button>
        );
      })}
      <i
        data-testid="tab-indicator"
        aria-hidden="true"
        className="absolute -bottom-px h-0.5 bg-ink-1 transition-[left,width] duration-nav ease-spring"
        style={rule ? { left: rule.left, width: rule.width } : { left: 0, width: 0 }}
      />
    </div>
  );
}
