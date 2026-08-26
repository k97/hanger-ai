import type { ReactNode } from "react";

/** The empty-plane markup shared by every "nothing to show yet" state in the
 *  app (pending scans, empty stores, empty categories). Extracted from
 *  `ProfilePane.tsx` and `RepoPane.tsx`, which each defined an identical
 *  `emptyPlaneClass` — see `docs/TODO.md` T5. Pure layout: this component
 *  carries no copy and no icon choice of its own, so nothing it renders can
 *  drift from what the eight original call sites said. */
export interface EmptyStateProps {
  /** already-sized mark; the component adds no size of its own */
  icon?: ReactNode;
  headline: string;
  /** plain-text subline; rich bodies (MCP A.1/A.2) come as children instead */
  sub?: ReactNode;
  /** button slot, rendered after the subline */
  action?: ReactNode;
  /** extra classes on the plane (RepoPane passes "mt-2.5") */
  className?: string;
  /** "scan-pending" on pending planes — the integration tests query it */
  testId?: string;
  children?: ReactNode;
}

const PLANE_CLASS =
  "flex-1 mx-[18px] mb-[18px] min-h-0 flex flex-col items-center justify-center text-center border border-dashed border-line rounded-plane animate-fade-in";

export default function EmptyState({
  icon,
  headline,
  sub,
  action,
  className,
  testId,
  children,
}: EmptyStateProps) {
  return (
    <div className={className ? `${PLANE_CLASS} ${className}` : PLANE_CLASS} data-testid={testId}>
      {icon}
      {/* Empty string, not undefined, is how a caller opts out of the
          headline/sub pair entirely — the two MCP bodies (A.1/A.2) render
          their own headline internally and pass everything through
          `children`, so this must not leave a bare span behind. */}
      {headline && <span className="text-base-app font-medium text-ink-1">{headline}</span>}
      {sub && <span className="text-small text-ink-3 max-w-sm mt-1">{sub}</span>}
      {action}
      {children}
    </div>
  );
}
