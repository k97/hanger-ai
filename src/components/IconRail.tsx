import { ComputerDesktopIcon, GlobeAltIcon, ExclamationTriangleIcon, Cog6ToothIcon } from "./icons";

interface IconRailProps {
  active: "machine" | "discovery" | "review";
  needsReviewCount: number;
  onSelectMachine: () => void;
  onSelectDiscovery: () => void;
  onSelectReview: () => void;
  onOpenSettings: () => void;
}

const railBtnClass =
  "relative w-[38px] h-8 rounded-pill grid place-items-center text-ink-2 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-nav ease-spring cursor-pointer";
const railBtnActiveClass =
  "relative w-[38px] h-8 rounded-pill grid place-items-center bg-tint text-tint-ink transition-colors duration-nav ease-spring cursor-pointer";

/** Leftmost shell column: the three sections, plus settings.
 *
 *  Needs review sits below a rule because it is a different kind of place —
 *  My machine and Discovery are where things are, Needs review is what is
 *  wrong with them. Its badge is the count of unresolved decisions. */
export default function IconRail({
  active,
  needsReviewCount,
  onSelectMachine,
  onSelectDiscovery,
  onSelectReview,
  onOpenSettings,
}: IconRailProps) {
  return (
    <nav
      aria-label="Sections"
      data-testid="icon-rail"
      className="w-14 shrink-0 border-r border-line bg-page flex flex-col items-center py-2 gap-[3px]"
    >
      <button
        title="My machine"
        aria-current={active === "machine" ? "true" : undefined}
        onClick={onSelectMachine}
        className={active === "machine" ? railBtnActiveClass : railBtnClass}
      >
        <ComputerDesktopIcon size={17} />
      </button>

      <button
        title="Discovery"
        aria-current={active === "discovery" ? "true" : undefined}
        onClick={onSelectDiscovery}
        className={active === "discovery" ? railBtnActiveClass : railBtnClass}
      >
        <GlobeAltIcon size={17} />
      </button>

      <div className="w-6 h-px bg-line my-2" />

      <button
        title={`Needs review — ${needsReviewCount} flagged`}
        aria-current={active === "review" ? "true" : undefined}
        onClick={onSelectReview}
        className={active === "review" ? railBtnActiveClass : railBtnClass}
      >
        {needsReviewCount > 0 && (
          <span className="absolute top-px right-0.5 min-w-[15px] h-[15px] px-1 rounded-pill bg-fill text-on-fill text-[9px] leading-[15px] font-flex tabular">
            {needsReviewCount}
          </span>
        )}
        <ExclamationTriangleIcon size={17} />
      </button>

      <div className="flex-1" />

      <button title="Settings" onClick={onOpenSettings} className={railBtnClass}>
        <Cog6ToothIcon size={17} />
      </button>
    </nav>
  );
}
