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
 * Four marks have no Heroicons equivalent and stay on lucide: the two titlebar
 * panel toggles, the nested-repo folder, and the diff-merge header. They run
 * through the same size/stroke table so they sit at the same weight.
 */
import type { ComponentType, SVGProps } from "react";
import {
  ArrowPathIcon as HeroArrowPath,
  ArrowRightIcon as HeroArrowRight,
  ArrowTopRightOnSquareIcon as HeroArrowTopRightOnSquare,
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
  InformationCircleIcon as HeroInformationCircle,
  LinkIcon as HeroLink,
  MagnifyingGlassIcon as HeroMagnifyingGlass,
  MoonIcon as HeroMoon,
  PlusIcon as HeroPlus,
  ServerIcon as HeroServer,
  ShieldCheckIcon as HeroShieldCheck,
  Square2StackIcon as HeroSquare2Stack,
  SunIcon as HeroSun,
  TrashIcon as HeroTrash,
  UserIcon as HeroUser,
  WrenchScrewdriverIcon as HeroWrenchScrewdriver,
  XMarkIcon as HeroXMark,
} from "@heroicons/react/24/outline";
import {
  FolderSymlink as LucideFolderSymlink,
  FolderTree as LucideFolderTree,
  GitMerge as LucideGitMerge,
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
export const InformationCircleIcon = sized(HeroInformationCircle, 1.11);
export const LinkIcon = sized(HeroLink);
export const MagnifyingGlassIcon = sized(HeroMagnifyingGlass);
export const MoonIcon = sized(HeroMoon, 0.96);
export const PlusIcon = sized(HeroPlus, 0.93);
export const ServerIcon = sized(HeroServer);
export const ShieldCheckIcon = sized(HeroShieldCheck, 1.09);
export const Square2StackIcon = sized(HeroSquare2Stack, 1.2);
export const SunIcon = sized(HeroSun, 1.11);
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
