import { ComputerDesktopIcon, GlobeAltIcon, ExclamationTriangleIcon, Cog6ToothIcon, FolderSymlinkIcon } from "./icons";
import HangerMark from "./HangerMark";
import Tooltip from "./Tooltip";

interface IconRailProps {
  active: "machine" | "linkmap" | "discovery" | "review";
  needsReviewCount: number;
  onSelectMachine: () => void;
  onSelectLinkMap: () => void;
  onSelectDiscovery: () => void;
  onSelectReview: () => void;
  onOpenSettings: () => void;
}

// 32×32, radius 10 (--radius-soft), tonal --tint-plane fill on current: the
// rail sits on the plane, where --tint would disappear.
const railBtnClass =
  "relative w-8 h-8 rounded-soft grid place-items-center text-ink-2 hover:bg-tint-plane hover:text-ink-1 transition-colors duration-nav ease-spring cursor-pointer";
const railBtnActiveClass =
  "relative w-8 h-8 rounded-soft grid place-items-center bg-tint-plane text-tint-ink transition-colors duration-nav ease-spring cursor-pointer";

/** Leftmost shell column: the three sections, plus settings.
 *
 *  Needs review sits below a rule because it is a different kind of place —
 *  My machine and Discovery are where things are, Needs review is what is
 *  wrong with them. Its badge is the count of unresolved decisions. */
export default function IconRail({
  active,
  needsReviewCount,
  onSelectMachine,
  onSelectLinkMap,
  onSelectDiscovery,
  onSelectReview,
  onOpenSettings,
}: IconRailProps) {
  return (
    <nav
      aria-label="Sections"
      data-testid="icon-rail"
      className="w-14 shrink-0 flex flex-col items-center pb-2.5 gap-[3px]"
    >
      {/* The mark is the home button (Karthik's ruling, 2026-08-15): from
          any inner screen it lands on My machine › Global, same as the
          machine button below it. Visually it stays the bare brand mark. */}
      <Tooltip label="My machine › Global">
        <button
          aria-label="Hanger"
          onClick={onSelectMachine}
          className="mt-0.5 cursor-pointer transition-opacity duration-hover ease-spring hover:opacity-75"
        >
          <HangerMark size={22} />
        </button>
      </Tooltip>

      <div className="w-6 h-px bg-line-2 opacity-45 my-[9px]" />

      <Tooltip label="My machine">
        <button
          aria-label="My machine"
          aria-current={active === "machine" ? "true" : undefined}
          onClick={onSelectMachine}
          className={active === "machine" ? railBtnActiveClass : railBtnClass}
        >
          <ComputerDesktopIcon size={17} aria-hidden="true" />
        </button>
      </Tooltip>

      <Tooltip label="Link map">
        <button
          aria-label="Link map"
          aria-current={active === "linkmap" ? "true" : undefined}
          onClick={onSelectLinkMap}
          className={active === "linkmap" ? railBtnActiveClass : railBtnClass}
        >
          <FolderSymlinkIcon size={17} aria-hidden="true" />
        </button>
      </Tooltip>

      <Tooltip label="Discovery">
        <button
          aria-label="Discovery"
          aria-current={active === "discovery" ? "true" : undefined}
          onClick={onSelectDiscovery}
          className={active === "discovery" ? railBtnActiveClass : railBtnClass}
        >
          <GlobeAltIcon size={17} aria-hidden="true" />
        </button>
      </Tooltip>

      <div className="w-6 h-px bg-line-2 opacity-45 my-[9px]" />

      <Tooltip label={`Needs review — ${needsReviewCount} flagged`}>
        <button
          aria-label={`Needs review — ${needsReviewCount} flagged`}
          aria-current={active === "review" ? "true" : undefined}
          onClick={onSelectReview}
          className={active === "review" ? railBtnActiveClass : railBtnClass}
        >
          {needsReviewCount > 0 && (
            <span aria-hidden="true" className="absolute -top-[3px] -right-1 min-w-4 h-4 px-1 rounded-pill bg-fill text-on-fill text-[9px] leading-4 font-flex tabular ring-2 ring-plane">
              {needsReviewCount}
            </span>
          )}
          <ExclamationTriangleIcon size={17} aria-hidden="true" />
        </button>
      </Tooltip>

      <div className="flex-1" />

      <Tooltip label="Settings">
        <button aria-label="Settings" onClick={onOpenSettings} className={railBtnClass}>
          <Cog6ToothIcon size={17} aria-hidden="true" />
        </button>
      </Tooltip>
    </nav>
  );
}
