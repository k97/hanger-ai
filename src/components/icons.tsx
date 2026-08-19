/**
 * Icon vocabulary — Heroicons 24/outline, sized and stroke-compensated.
 *
 * Heroicons' outline set is drawn on a 24px grid at a 1.5 stroke. Rendered at
 * this shell's working sizes (10–17px) that stroke thins to ~0.7px and the
 * marks go soft against the ink ladder. Every export below is wrapped in
 * `sized()`, which scales strokeWidth back up as the box shrinks so the stroke
 * lands on screen at roughly 1px whatever the size — the weight the mono-tight
 * prototype was drawn against.
 *
 * Six marks have no Heroicons equivalent and stay on lucide: the two titlebar
 * panel toggles, the nested-repo folder, the diff-merge header, and the
 * inspector's expand/collapse pair. They run through the same size/stroke
 * table so they sit at the same weight.
 *
 * One mark is hand-drawn rather than pulled from a set: the OS file-manager
 * glyph (`RevealInFileManagerIcon`), because it draws the current platform's
 * actual file manager rather than a generic folder.
 */
import type { ComponentType, SVGProps } from "react";
import {
  ArrowPathIcon as HeroArrowPath,
  ArrowRightIcon as HeroArrowRight,
  ArrowTopRightOnSquareIcon as HeroArrowTopRightOnSquare,
  ArrowsPointingOutIcon as HeroArrowsPointingOut,
  CheckIcon as HeroCheck,
  ChevronDownIcon as HeroChevronDown,
  ChevronLeftIcon as HeroChevronLeft,
  ChevronRightIcon as HeroChevronRight,
  ChevronUpIcon as HeroChevronUp,
  Cog6ToothIcon as HeroCog6Tooth,
  CommandLineIcon as HeroCommandLine,
  ComputerDesktopIcon as HeroComputerDesktop,
  DocumentTextIcon as HeroDocumentText,
  ExclamationCircleIcon as HeroExclamationCircle,
  ExclamationTriangleIcon as HeroExclamationTriangle,
  FolderIcon as HeroFolder,
  GlobeAltIcon as HeroGlobeAlt,
  HeartIcon as HeroHeart,
  InformationCircleIcon as HeroInformationCircle,
  LinkIcon as HeroLink,
  MagnifyingGlassIcon as HeroMagnifyingGlass,
  MapIcon as HeroMap,
  MinusIcon as HeroMinus,
  MoonIcon as HeroMoon,
  PlusIcon as HeroPlus,
  ServerIcon as HeroServer,
  ShieldCheckIcon as HeroShieldCheck,
  Square2StackIcon as HeroSquare2Stack,
  SunIcon as HeroSun,
  SwatchIcon as HeroSwatch,
  TrashIcon as HeroTrash,
  UserIcon as HeroUser,
  WrenchScrewdriverIcon as HeroWrenchScrewdriver,
  XMarkIcon as HeroXMark,
} from "@heroicons/react/24/outline";
import { HeartIcon as HeroHeartSolid } from "@heroicons/react/24/solid";
import {
  FolderSymlink as LucideFolderSymlink,
  FolderTree as LucideFolderTree,
  GitMerge as LucideGitMerge,
  Maximize2 as LucideMaximize2,
  Minimize2 as LucideMinimize2,
  PanelLeft as LucidePanelLeft,
  PanelRight as LucidePanelRight,
} from "lucide-react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number;
}

const DEFAULT_SIZE = 16;

/** Stroke weight per size band — keeps the rendered stroke near 1px. */
function strokeFor(size: number): number {
  if (size <= 12) return 2.2;
  if (size <= 16) return 1.9;
  if (size <= 20) return 1.7;
  return 1.5; // Heroicons' native weight, correct once the box is 24px+
}

type SvgIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * `optical` corrects for how much of the 24 grid a given mark actually inks.
 *
 * Families differ here, and a 1:1 swap on nominal size inherits the difference.
 * Measured against the lucide marks this shell's spacing was tuned to, these
 * Heroicons run from 21% under to 26% over. It shows most in the icon rail,
 * where four marks stack at one size and any mismatch reads as a wobble: lucide
 * drew all four at 91.7% coverage, Heroicons draws them at 82.1–89.2%.
 *
 * Factors are ink-extent ratios measured in the browser, not eyeballed.
 * Anything that landed within 4% is left alone at 1.
 */
function sized(Icon: SvgIcon, optical = 1) {
  return function SizedIcon({ size = DEFAULT_SIZE, ...props }: IconProps) {
    const box = Math.round(size * optical * 100) / 100;
    return (
      <Icon
        width={box}
        height={box}
        strokeWidth={strokeFor(box)}
        {...props}
      />
    );
  };
}

export const ArrowPathIcon = sized(HeroArrowPath);
export const ArrowRightIcon = sized(HeroArrowRight, 0.79);
export const ArrowTopRightOnSquareIcon = sized(HeroArrowTopRightOnSquare);
export const ArrowsPointingOutIcon = sized(HeroArrowsPointingOut);
export const CheckIcon = sized(HeroCheck, 1.07);
export const ChevronDownIcon = sized(HeroChevronDown, 0.81);
export const ChevronLeftIcon = sized(HeroChevronLeft, 0.8);
export const ChevronRightIcon = sized(HeroChevronRight, 0.8);
export const ChevronUpIcon = sized(HeroChevronUp, 0.81);
export const Cog6ToothIcon = sized(HeroCog6Tooth, 1.12);
export const CommandLineIcon = sized(HeroCommandLine, 0.9);
export const ComputerDesktopIcon = sized(HeroComputerDesktop, 1.12);
export const DocumentTextIcon = sized(HeroDocumentText);
export const ExclamationCircleIcon = sized(HeroExclamationCircle, 1.11);
export const ExclamationTriangleIcon = sized(HeroExclamationTriangle, 1.04);
export const FolderIcon = sized(HeroFolder);
export const GlobeAltIcon = sized(HeroGlobeAlt, 1.09);
export const HeartIcon = sized(HeroHeart);
export const HeartIconSolid = sized(HeroHeartSolid);
export const InformationCircleIcon = sized(HeroInformationCircle, 1.11);
export const LinkIcon = sized(HeroLink);
export const MagnifyingGlassIcon = sized(HeroMagnifyingGlass);
export const MapIcon = sized(HeroMap);
export const MinusIcon = sized(HeroMinus, 0.93);
export const MoonIcon = sized(HeroMoon, 0.96);
export const PlusIcon = sized(HeroPlus, 0.93);
export const ServerIcon = sized(HeroServer);
export const ShieldCheckIcon = sized(HeroShieldCheck, 1.09);
export const Square2StackIcon = sized(HeroSquare2Stack, 1.2);
export const SunIcon = sized(HeroSun, 1.11);
// Not measured against a lucide twin — the rail had no design-system entry
// before this mark, so its coverage stands unadjusted at 1 until it is.
export const SwatchIcon = sized(HeroSwatch);
export const TrashIcon = sized(HeroTrash);
export const UserIcon = sized(HeroUser, 0.93);
export const WrenchScrewdriverIcon = sized(HeroWrenchScrewdriver);
export const XMarkIcon = sized(HeroXMark);

/**
 * Heroicons has no dedicated spinner. `ArrowPathIcon` under `animate-spin` is
 * the family's stand-in; the alias keeps loading sites reading as loading
 * rather than as a refresh affordance.
 */
export const SpinnerIcon = ArrowPathIcon;

export const FolderSymlinkIcon = sized(LucideFolderSymlink as SvgIcon);
export const FolderTreeIcon = sized(LucideFolderTree as SvgIcon);
export const GitMergeIcon = sized(LucideGitMerge as SvgIcon);
export const PanelLeftIcon = sized(LucidePanelLeft as SvgIcon);
export const PanelRightIcon = sized(LucidePanelRight as SvgIcon);
/** The inspector's expand/collapse pair — Lucide's corner-arrow marks, not
 *  Heroicons' `ArrowsPointingOutIcon` above, which LinkMapPane already owns
 *  for an unrelated affordance. */
export const ExpandIcon = sized(LucideMaximize2 as SvgIcon);
export const CollapseIcon = sized(LucideMinimize2 as SvgIcon);

/**
 * macOS Finder's mark, traced at the same 24px grid as the Heroicons set.
 * `stroke` sits on the root and every path inherits it, so `currentColor`
 * and the shared stroke-width table apply exactly as they do above.
 */
function FinderMark({ width, height, strokeWidth, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={width}
      height={height}
      {...props}
    >
      <path d="M12.5 1.5c-0.833 2 -2.5 7.2 -2.5 12h3c0 2.537 0.2 6.6 1 9" />
      <path d="M6.5 7.5v2" />
      <path d="M16.5 7.5v2" />
      <path d="M5.5 15.5c0.667 1 2.9 3 6.5 3s5.667 -2 6.5 -3" />
      <path d="M1.5 18.5v-13a4 4 0 0 1 4 -4h13a4 4 0 0 1 4 4v13a4 4 0 0 1 -4 4h-13a4 4 0 0 1 -4 -4Z" />
    </svg>
  );
}

/**
 * Reveals a path in the OS's native file manager — Finder today. One
 * component, one place to redraw when Explorer or a Linux file manager
 * needs its own mark; call sites never change.
 */
export const RevealInFileManagerIcon = sized(FinderMark);
