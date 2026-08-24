import { useEffect, useRef, useState, type ComponentType, type RefObject } from "react";
import Tooltip from "./Tooltip";
import FindingChip from "./FindingChip";
import OverflowMenu, { menuActionClass, MenuSeparator } from "./OverflowMenu";
import { miniBtnFillClass } from "./miniButton";
import { kindLabel } from "../utils/assetProvenance";
import type { AssetFindings, IssueCategory, ReviewIssue } from "../utils/reviewIssues";
import {
  CollapseIcon,
  DocumentTextIcon,
  EllipsisVerticalIcon,
  ExpandIcon,
  LinkIcon,
  PanelRightIcon,
  PencilSquareIcon,
  RevealInFileManagerIcon,
  ServerIcon,
  SkillIcon,
  Square2StackIcon,
  UserIcon,
  type IconProps,
} from "./icons";

/**
 * The inspector column's 40px cap: the selected asset's identity — a kind
 * glyph with a state dot, an eyebrow (`SKILL · GLOBAL`), a finding chip —
 * then `Link to…`, a ⋮ overflow menu, and the two panel-level controls that
 * used to be the cap's only occupants.
 *
 * Standalone and prop-driven: every value it shows and every side effect it
 * triggers arrives as a prop. A later task wires it into `App.tsx`, which
 * today owns the two trailing buttons' markup directly
 * (`tbBtnClass`/`tbBtnActiveClass`, copied verbatim below because those
 * consts live in App's component body and are not exported).
 */

/** Only what the cap reads. It draws a kind label and a kind icon, both from
 *  `category` (`:149-150`); it has never read a name, a path or a scope, and
 *  declaring them invited callers to believe otherwise. */
export interface InspectorCapAsset {
  category: IssueCategory;
}

export interface InspectorCapProps {
  /** `null` when nothing is selected — the cap then shows only the two
   *  trailing controls (Decision 14). */
  asset: InspectorCapAsset | null;
  /** Where the asset lives, already formatted by `provenanceOf` — a
   *  repository's basename, or `"Global"`. */
  place: string;
  findings: AssetFindings;
  inspectorExpanded: boolean;
  /** The surface `FindingChip`'s popover clamps its position against. */
  clampTo: RefObject<HTMLElement | null>;
  /** Absent for an asset with nowhere to be linked (an MCP server, an
   *  asset with no destination) — the surface control and its menu entry
   *  both disappear, the same way `Flyout.tsx` decides today. */
  onLink?: () => void;
  onOpenInEditor?: () => void;
  onCopyPath?: () => void;
  onReveal?: () => void;
  onReview: (issue: ReviewIssue) => void;
  onToggleExpanded: () => void;
  onToggleInspector: () => void;
  /** Test-only. The real shed is measured off `scrollWidth`/`clientWidth`,
   *  which `happy-dom` never lays out (every measurement is 0), so this lets
   *  a test drive the collapsed states directly. Not read past mount in a
   *  real window — the `ResizeObserver` below takes over from there. */
  forceShed?: 0 | 1 | 2;
}

const KIND_ICON: Record<IssueCategory, ComponentType<IconProps>> = {
  Skills: SkillIcon,
  Tools: ServerIcon,
  Rules: DocumentTextIcon,
  Subagents: UserIcon,
};

// Toolbar control voice, copied verbatim from `App.tsx:1118-1121` per the
// ledger's ruling: those consts are local to App's component body and not
// exported, and extracting them is out of this task's scope.
const tbBtnClass =
  "relative h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center shrink-0 text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";
const tbBtnActiveClass =
  "relative h-[27px] min-w-[27px] px-2 rounded-pill inline-flex items-center justify-center shrink-0 bg-tint text-tint-ink transition-colors duration-hover ease-spring cursor-pointer";

function severityDot(severity: "warning" | "danger"): string {
  return severity === "danger" ? "bg-state-danger" : "bg-state-warning";
}

export default function InspectorCap({
  asset,
  place,
  findings,
  inspectorExpanded,
  clampTo,
  onLink,
  onOpenInEditor,
  onCopyPath,
  onReveal,
  onReview,
  onToggleExpanded,
  onToggleInspector,
  forceShed,
}: InspectorCapProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [autoShed, setAutoShed] = useState<0 | 1 | 2>(0);
  // An asset with no overflow destination cannot shed (Decision 4): a server
  // has no path to copy, nowhere to reveal, nothing to open, nothing to
  // link, so pinning it to 0 overrides both the measured and forced shed
  // regardless of how many findings it carries.
  const canShed = Boolean(onLink || onCopyPath || onReveal || onOpenInEditor);
  const shed = canShed ? forceShed ?? autoShed : 0;

  // Watches the row's own width to catch it growing back — the only signal
  // that can tell us a previously shed control might fit again, since a row
  // that no longer overflows never fires "it might have more room now" on
  // its own. Resetting to 0 and letting the effect below re-measure is the
  // prototype's "it goes back to the surface at the same width it left".
  useEffect(() => {
    const el = rowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastWidth: number | null = null;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width === undefined) return;
      if (lastWidth !== null && width > lastWidth) {
        setAutoShed(0);
      }
      lastWidth = width;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // After every render, check the surface set at the current shed level and
  // climb one rung if it overflows. `happy-dom` never lays anything out, so
  // `scrollWidth`/`clientWidth` are both 0 here and this never fires under
  // test — `forceShed` is what drives shed states in that environment.
  useEffect(() => {
    if (forceShed !== undefined) return;
    const el = rowRef.current;
    if (!el) return;
    if (el.scrollWidth > el.clientWidth) {
      setAutoShed((s) => (s < 2 ? ((s + 1) as 0 | 1 | 2) : s));
    }
  }, [forceShed, autoShed, asset, place, findings]);

  const kind = asset ? kindLabel(asset.category) : "";
  const Icon = asset ? KIND_ICON[asset.category] : null;
  const showLinkOnSurface = Boolean(asset && onLink && shed === 0);
  const showLinkInMenu = Boolean(asset && onLink && shed >= 1);
  const showReviewInMenu = Boolean(asset && findings.count > 0 && shed >= 2);
  const showChip = Boolean(asset && findings.count > 0 && shed < 2);
  const menuHasContent = Boolean(
    asset && (onCopyPath || onReveal || onOpenInEditor || showLinkInMenu || showReviewInMenu)
  );

  return (
    <div ref={rowRef} className="h-10 flex items-center gap-2 pl-[18px] pr-3 select-none">
      {asset && Icon && (
        <div className="shrink-0 relative inline-flex">
          {place === "Global" ? (
            <Icon size={16} className="text-ink-2" aria-hidden="true" />
          ) : (
            <Tooltip label={`${kind} · ${place}`} placement="bottom">
              <Icon size={16} className="text-ink-2" role="img" aria-label={`${kind} · ${place}`} />
            </Tooltip>
          )}
          {findings.count > 0 && (
            <i
              aria-hidden="true"
              data-testid="inspector-cap-glyph-dot"
              className={`absolute -right-0.5 -bottom-0.5 w-1.5 h-1.5 rounded-pill ring-[1.5px] ring-page not-italic ${severityDot(
                findings.severity
              )}`}
            />
          )}
        </div>
      )}

      {asset && (
        <span
          data-testid="inspector-cap-eyebrow"
          className="shrink-0 relative font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3 truncate min-w-0"
        >
          {kind}
          <span aria-hidden="true"> · </span>
          {place}
        </span>
      )}

      {showChip && (
        <div className="shrink-0 relative">
          <FindingChip
            severity={findings.severity}
            lines={findings.issues.map((issue) => issue.problem)}
            onReview={() => onReview(findings.issues[0])}
            elevated
            clampTo={clampTo}
          />
        </div>
      )}

      <div
        data-testid="inspector-cap-trailing"
        className="shrink-0 relative ml-auto flex items-center gap-0.5"
      >
        {showLinkOnSurface && onLink && (
          <button type="button" onClick={onLink} className={miniBtnFillClass}>
            <LinkIcon size={13} aria-hidden="true" className="mr-1" />
            Link to…
          </button>
        )}

        {menuHasContent && (
          <div className="mr-2">
            <OverflowMenu
              trigger={(triggerProps) => (
                <button
                  type="button"
                  aria-label="More actions"
                  className="w-[21px] h-[21px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1"
                  {...triggerProps}
                >
                  <EllipsisVerticalIcon size={13} aria-hidden="true" />
                </button>
              )}
              ariaLabel="More actions"
              align="right"
              className="min-w-[184px] p-1"
            >
              {(close) => (
                <>
                  {showLinkInMenu && onLink && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onLink();
                        close();
                      }}
                      className={menuActionClass}
                    >
                      <LinkIcon size={14} aria-hidden="true" className="text-ink-3" />
                      <span>Link to…</span>
                    </button>
                  )}
                  {showReviewInMenu && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onReview(findings.issues[0]);
                        close();
                      }}
                      className={menuActionClass}
                    >
                      <span className="w-3.5 grid place-items-center">
                        <i
                          aria-hidden="true"
                          className={`w-2 h-2 rounded-pill not-italic ${severityDot(findings.severity)}`}
                        />
                      </span>
                      <span>Needs review · {findings.count}</span>
                    </button>
                  )}
                  {(showLinkInMenu || showReviewInMenu) && <MenuSeparator />}
                  {onCopyPath && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onCopyPath();
                        close();
                      }}
                      className={menuActionClass}
                    >
                      <Square2StackIcon size={14} aria-hidden="true" className="text-ink-3" />
                      <span>Copy path</span>
                    </button>
                  )}
                  {onReveal && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onReveal();
                        close();
                      }}
                      className={menuActionClass}
                    >
                      <RevealInFileManagerIcon size={14} aria-hidden="true" className="text-ink-3" />
                      <span>Reveal in Finder</span>
                    </button>
                  )}
                  {onOpenInEditor && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpenInEditor();
                        close();
                      }}
                      className={menuActionClass}
                    >
                      <PencilSquareIcon size={14} aria-hidden="true" className="text-ink-3" />
                      <span>Open in editor</span>
                    </button>
                  )}
                </>
              )}
            </OverflowMenu>
          </div>
        )}

        <Tooltip label={inspectorExpanded ? "Collapse inspector" : "Expand inspector"} placement="bottom">
          <button
            onClick={onToggleExpanded}
            aria-label={inspectorExpanded ? "Collapse inspector" : "Expand inspector"}
            className={tbBtnClass}
          >
            {inspectorExpanded ? (
              <CollapseIcon size={15} aria-hidden="true" />
            ) : (
              <ExpandIcon size={15} aria-hidden="true" />
            )}
          </button>
        </Tooltip>
        <Tooltip label="Toggle inspector" placement="bottom">
          <button onClick={onToggleInspector} aria-label="Toggle inspector" className={tbBtnActiveClass}>
            <PanelRightIcon size={15} aria-hidden="true" />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
