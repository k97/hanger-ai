import type { ReactNode } from "react";

/**
 * The section format (Karthik, 2026-08-22): an eyebrow above ONE bordered
 * card whose rows are icon · label · right-aligned value. The divider lives
 * on "row after row" — a one-row card carries none and the last row never
 * draws one beneath itself. The card is flat on the page: the --line border
 * and the inner radius draw its edge, nothing else.
 *
 * First callers: the link map's placecards. The inspector's sections take
 * the same card in the next phase, which is what earns it a component.
 */

export interface ListCardProps {
  children: ReactNode;
  className?: string;
  "data-testid"?: string;
}

const cardClass =
  "border border-line rounded-inner bg-page overflow-hidden [&>*+*]:border-t [&>*+*]:border-line";

export default function ListCard({ children, className, ...rest }: ListCardProps) {
  return (
    <div data-testid={rest["data-testid"]} className={`${cardClass} ${className ?? ""}`}>
      {children}
    </div>
  );
}

export interface ListCardRowProps {
  /** A 14px mark in --ink-3; decorative, the label carries the meaning. */
  icon?: ReactNode;
  label: ReactNode;
  /** A figure or a path: mono, --fs-micro, --ink-3, pushed to the right edge. */
  value?: ReactNode;
  /** A word or short phrase: sans, --fs-small, --ink-2, pushed to the right edge. */
  wide?: ReactNode;
  /** A trailing control after the value — an icon button. */
  trailing?: ReactNode;
  "data-testid"?: string;
}

const rowClass = "flex items-center gap-2.5 px-3 py-[9px] min-h-9 text-small text-ink-1";

export function ListCardRow({ icon, label, value, wide, trailing, ...rest }: ListCardRowProps) {
  return (
    <div data-testid={rest["data-testid"]} className={rowClass}>
      {icon !== undefined && (
        <span className="w-3.5 h-3.5 shrink-0 text-ink-3 grid place-items-center" aria-hidden="true">
          {icon}
        </span>
      )}
      {/* The label box grows and may wrap (the inspector's two-line cost
          row needs that); a caller that wants an ellipsis puts `truncate
          min-w-0` on its own label element. */}
      <span className="min-w-0 flex-1 flex items-center gap-2">{label}</span>
      {value !== undefined && (
        <span className="ml-auto font-mono text-micro text-ink-3 tabular shrink-0">{value}</span>
      )}
      {wide !== undefined && (
        <span className="ml-auto text-small text-ink-2 shrink-0">{wide}</span>
      )}
      {trailing}
    </div>
  );
}
