import { ComputerDesktopIcon, GlobeAltIcon, ExclamationTriangleIcon, Cog6ToothIcon, FolderSymlinkIcon } from "./icons";
import HangerMark from "./HangerMark";
import Tooltip from "./Tooltip";

interface IconRailProps {
  active: "machine" | "linkmap" | "discovery" | "review";
  needsReviewCount: number;
  /** The resolved appearance, so the brand mark can pick the variant that
   *  stays legible on the rail. Passed rather than read from a media query
   *  because the theme can be pinned against the OS. */
  darkMode: boolean;
  onSelectMachine: () => void;
  onSelectLinkMap: () => void;
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
  darkMode,
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
      className="w-14 shrink-0 border-r border-line bg-page flex flex-col items-center py-2 gap-[3px]"
    >
      <HangerMark onDark={darkMode} size={23} className="pt-2" />

      <div className="w-6 h-px bg-line my-2" />

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

      <div className="w-6 h-px bg-line my-2" />

      <Tooltip label={`Needs review — ${needsReviewCount} flagged`}>
        <button
          aria-label={`Needs review — ${needsReviewCount} flagged`}
          aria-current={active === "review" ? "true" : undefined}
          onClick={onSelectReview}
          className={active === "review" ? railBtnActiveClass : railBtnClass}
        >
          {needsReviewCount > 0 && (
            <span aria-hidden="true" className="absolute top-px right-0.5 min-w-[15px] h-[15px] px-1 rounded-pill bg-fill text-on-fill text-[9px] leading-[15px] font-flex tabular">
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
