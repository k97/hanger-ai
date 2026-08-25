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
import { createElement } from "react";
import type { ComponentType, CSSProperties, SVGProps } from "react";
import {
  AdjustmentsHorizontalIcon as HeroAdjustmentsHorizontal,
  ArchiveBoxIcon as HeroArchiveBox,
  ArrowDownTrayIcon as HeroArrowDownTray,
  ArrowPathIcon as HeroArrowPath,
  ArrowPathRoundedSquareIcon as HeroArrowPathRoundedSquare,
  ArrowRightIcon as HeroArrowRight,
  ArrowTopRightOnSquareIcon as HeroArrowTopRightOnSquare,
  ArrowsPointingOutIcon as HeroArrowsPointingOut,
  ArrowsRightLeftIcon as HeroArrowsRightLeft,
  ChatBubbleOvalLeftIcon as HeroChatBubbleOvalLeft,
  CheckIcon as HeroCheck,
  ChevronDownIcon as HeroChevronDown,
  ChevronLeftIcon as HeroChevronLeft,
  ChevronRightIcon as HeroChevronRight,
  ChevronUpIcon as HeroChevronUp,
  ClockIcon as HeroClock,
  CodeBracketIcon as HeroCodeBracket,
  Cog6ToothIcon as HeroCog6Tooth,
  CommandLineIcon as HeroCommandLine,
  ComputerDesktopIcon as HeroComputerDesktop,
  CpuChipIcon as HeroCpuChip,
  DocumentIcon as HeroDocument,
  DocumentTextIcon as HeroDocumentText,
  EllipsisVerticalIcon as HeroEllipsisVertical,
  ExclamationCircleIcon as HeroExclamationCircle,
  ExclamationTriangleIcon as HeroExclamationTriangle,
  FolderIcon as HeroFolder,
  GlobeAltIcon as HeroGlobeAlt,
  HeartIcon as HeroHeart,
  InformationCircleIcon as HeroInformationCircle,
  KeyIcon as HeroKey,
  LinkIcon as HeroLink,
  MagnifyingGlassIcon as HeroMagnifyingGlass,
  MapIcon as HeroMap,
  MinusIcon as HeroMinus,
  MoonIcon as HeroMoon,
  PencilSquareIcon as HeroPencilSquare,
  PlusIcon as HeroPlus,
  ServerIcon as HeroServer,
  ShieldCheckIcon as HeroShieldCheck,
  SignalIcon as HeroSignal,
  Square2StackIcon as HeroSquare2Stack,
  SunIcon as HeroSun,
  SwatchIcon as HeroSwatch,
  TagIcon as HeroTag,
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

export const AdjustmentsHorizontalIcon = sized(HeroAdjustmentsHorizontal);
export const ArchiveBoxIcon = sized(HeroArchiveBox);
export const ArrowDownTrayIcon = sized(HeroArrowDownTray);
export const ArrowPathIcon = sized(HeroArrowPath);
export const ArrowPathRoundedSquareIcon = sized(HeroArrowPathRoundedSquare);
export const ArrowRightIcon = sized(HeroArrowRight, 0.79);
export const ArrowTopRightOnSquareIcon = sized(HeroArrowTopRightOnSquare);
export const ArrowsPointingOutIcon = sized(HeroArrowsPointingOut);
export const ArrowsRightLeftIcon = sized(HeroArrowsRightLeft);
export const ChatBubbleOvalLeftIcon = sized(HeroChatBubbleOvalLeft);
export const CheckIcon = sized(HeroCheck, 1.07);
export const ChevronDownIcon = sized(HeroChevronDown, 0.81);
export const ChevronLeftIcon = sized(HeroChevronLeft, 0.8);
export const ChevronRightIcon = sized(HeroChevronRight, 0.8);
export const ChevronUpIcon = sized(HeroChevronUp, 0.81);
export const ClockIcon = sized(HeroClock);
export const CodeBracketIcon = sized(HeroCodeBracket);
export const Cog6ToothIcon = sized(HeroCog6Tooth, 1.12);
export const CommandLineIcon = sized(HeroCommandLine, 0.9);
export const ComputerDesktopIcon = sized(HeroComputerDesktop, 1.12);
export const CpuChipIcon = sized(HeroCpuChip);
export const DocumentIcon = sized(HeroDocument);
export const DocumentTextIcon = sized(HeroDocumentText);
export const EllipsisVerticalIcon = sized(HeroEllipsisVertical);
export const ExclamationCircleIcon = sized(HeroExclamationCircle, 1.11);
export const ExclamationTriangleIcon = sized(HeroExclamationTriangle, 1.04);
export const FolderIcon = sized(HeroFolder);
export const GlobeAltIcon = sized(HeroGlobeAlt, 1.09);
export const HeartIcon = sized(HeroHeart);
export const HeartIconSolid = sized(HeroHeartSolid);
export const InformationCircleIcon = sized(HeroInformationCircle, 1.11);
export const KeyIcon = sized(HeroKey);
export const LinkIcon = sized(HeroLink);
export const MagnifyingGlassIcon = sized(HeroMagnifyingGlass);
export const MapIcon = sized(HeroMap);
export const MinusIcon = sized(HeroMinus, 0.93);
export const MoonIcon = sized(HeroMoon, 0.96);
export const PencilSquareIcon = sized(HeroPencilSquare);
export const PlusIcon = sized(HeroPlus, 0.93);
export const ServerIcon = sized(HeroServer);
export const ShieldCheckIcon = sized(HeroShieldCheck, 1.09);
export const SignalIcon = sized(HeroSignal);
export const Square2StackIcon = sized(HeroSquare2Stack, 1.2);
export const SunIcon = sized(HeroSun, 1.11);
// Not measured against a lucide twin — the rail had no design-system entry
// before this mark, so its coverage stands unadjusted at 1 until it is.
export const SwatchIcon = sized(HeroSwatch);
export const TagIcon = sized(HeroTag);
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

/**
 * The skill mark: the document a skill is, with the sparkle that says it
 * confers a capability. Drawn on the Heroicons 24 grid with round caps so it
 * sits at the same weight as every mark above; no icon set has it.
 */
function SkillMark({ width, height, strokeWidth, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M14.5 4.25H7A2.25 2.25 0 004.75 6.5v12.25A2.25 2.25 0 007 21h9.5a2.25 2.25 0 002.25-2.25V11.5" />
      <path d="M8.5 12.5h6.5M8.5 16.25h4" />
      <path d="M18.25 2.75c.45 1.85 1.15 2.55 3 3-1.85.45-2.55 1.15-3 3-.45-1.85-1.15-2.55-3-3 1.85-.45 2.55-1.15 3-3z" />
    </svg>
  );
}

/** The kind mark for a skill — the placecard's Skills row and, later, the inspector's header. */
export const SkillIcon = sized(SkillMark);

/**
 * What something costs to load: a dial arc and a needle, the fewest strokes
 * that still read as a gauge at 14px. No icon set has it. It draws no
 * reading — the needle is the glyph's pose, as a clock mark tells no time.
 */
function GaugeMark({ width, height, strokeWidth, ...props }: SVGProps<SVGSVGElement>) {
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
      <path d="M4.9 17.2a7.5 7.5 0 1 1 14.2 0" />
      <path d="M12 14.8l4.2-4.2" />
    </svg>
  );
}

/** The Context section's row mark. */
export const GaugeIcon = sized(GaugeMark);

/* ── Animated marks — v5 (docs/v5-animate-icons/00-state-inventory.md).
 *
 * Geometry is Lucide (ISC), hand-transcribed: lucide-react's components
 * render their elements flat, and per-element motion needs a <g> around the
 * moving subset, so each mark's elements are declared here and the moving
 * indices named. Transcription is pinned by animated_icons.test.tsx, which
 * compares every geometry attribute against the installed lucide-react — a
 * wrong or stale transcription cannot pass.
 *
 * Two shapes (ruling 4): looping() marks take `active` and spin only while
 * the work they name is running; entering() marks play once on mount and
 * hold — a finding, stated and then still.
 *
 * Origins: aim-part rotates about the 24-grid centre unless the group
 * overrides --ox/--oy. A moving sub-group that is off-centre MUST override —
 * measured, not assumed (inventory §2.1): folder-sync (17,16), folder-clock
 * (16,16), cursor-click (9.3,9.3). The failure is invisible at 0deg and 360deg.
 */
type AimElement = readonly [
  tag: "path" | "circle" | "line" | "rect" | "polyline",
  attrs: Record<string, string | number>,
];

interface AimGroup {
  /** indices into elements that move together */
  readonly indices: readonly number[];
  /** grid-unit origin override for off-centre groups */
  readonly origin?: readonly [number, number];
  /** phase offset, e.g. "-0.6s" for the relay's second rack */
  readonly delay?: string;
}

interface AimSpec {
  readonly elements: readonly AimElement[];
  /** motion classes, e.g. "aim-draw aim-stagger" */
  readonly motion: string;
  readonly groups: readonly AimGroup[];
  /** pathLength="1" + --i per moving element (draw/scan motions) */
  readonly drawn?: boolean;
}

export interface AnimatedIconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  size?: number;
}
export interface LoopingIconProps extends AnimatedIconProps {
  active?: boolean;
}

/**
 * `AimElement`'s attrs are a loose `Record<string, string | number>` because
 * the tag varies per element (`circle` takes `cx`/`cy`/`r`, `path` takes `d`,
 * and so on) and the spec table is declarative data, not per-tag-typed
 * markup. `createElement` accepts that looseness directly — a JSX spread
 * onto a literal tag name does not, since JSX narrows the attrs type to
 * whichever tag the literal names. This keeps `AimSpec` exactly as
 * documented while staying honestly typed.
 */
function el([tag, attrs]: AimElement, key: number, extra?: Record<string, unknown>) {
  return createElement(tag, { key, ...attrs, ...extra });
}

function AimSvg({
  spec,
  size = DEFAULT_SIZE,
  rule,
  ...props
}: AnimatedIconProps & { spec: AimSpec; rule: "aim-loop" | "aim-once" | null }) {
  const grouped = new Set(spec.groups.flatMap((g) => g.indices));
  const drawExtra = (seq?: number): Record<string, unknown> | undefined =>
    spec.drawn && rule !== null && seq !== undefined
      ? { pathLength: 1, style: { "--i": seq } as CSSProperties }
      : undefined;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeFor(size)}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {spec.elements.map((e, i) => (grouped.has(i) ? null : el(e, i)))}
      {spec.groups.map((g, gi) => (
        <g
          key={`g${gi}`}
          className={rule ? `aim-part ${spec.motion} ${rule}` : undefined}
          style={
            {
              ...(g.origin && { "--ox": `${g.origin[0]}px`, "--oy": `${g.origin[1]}px` }),
              ...(rule && g.delay && { animationDelay: g.delay }),
            } as CSSProperties
          }
        >
          {g.indices.map((i, seq) => el(spec.elements[i], i, drawExtra(seq)))}
        </g>
      ))}
    </svg>
  );
}

function looping(spec: AimSpec) {
  return function LoopingIcon({ active = false, ...props }: LoopingIconProps) {
    return <AimSvg spec={spec} rule={active ? "aim-loop" : null} {...props} />;
  };
}

// Exported, not module-private as first drafted: this task adds no
// entering()-based mark, and an unreferenced top-level function fails
// `noUnusedLocals` (tsconfig.json) — a real project gate, not a style
// preference. The later tasks that call this live in this same file, so the
// export changes nothing about how they consume it; see task-2-report.md.
export function entering(spec: AimSpec) {
  return function EnteringIcon(props: AnimatedIconProps) {
    return <AimSvg spec={spec} rule="aim-once" {...props} />;
  };
}

/** Scanning — the record turns while the scan runs. Arcs spin; rim and hub hold. */
export const Disc3Icon = looping({
  elements: [
    ["circle", { cx: 12, cy: 12, r: 10 }],
    ["path", { d: "M6 12c0-1.7.7-3.2 1.8-4.2" }],
    ["circle", { cx: 12, cy: 12, r: 2 }],
    ["path", { d: "M18 12c0 1.7-.7 3.2-1.8 4.2" }],
  ],
  motion: "aim-spin",
  groups: [{ indices: [1, 3] }],
});

/** Repository scanning — the folder holds; the sync arrows turn while it runs. */
export const FolderSyncIcon = looping({
  elements: [
    [
      "path",
      {
        d: "M9 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v.5",
      },
    ],
    ["path", { d: "M12 10v4h4" }],
    ["path", { d: "m12 14 1.535-1.605a5 5 0 0 1 8 1.5" }],
    ["path", { d: "M22 22v-4h-4" }],
    ["path", { d: "m22 18-1.535 1.605a5 5 0 0 1-8-1.5" }],
  ],
  motion: "aim-spin",
  groups: [{ indices: [1, 2, 3, 4], origin: [17, 16] }],
});

/** Counting — the smallest spinner; a single arc where four elements would blur. */
export const LoaderCircleIcon = looping({
  elements: [["path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }]],
  motion: "aim-spin",
  groups: [{ indices: [0] }],
});

/** Rescanning — the whole glyph turns while the rescan it names is running. */
export const RotateCcwIcon = looping({
  elements: [
    ["path", { d: "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" }],
    ["path", { d: "M3 3v5h5" }],
  ],
  motion: "aim-spin-ccw",
  groups: [{ indices: [0, 1] }],
});

/** MCP probe — the racks trade emphasis: traffic relaying. */
export const ServerRelayIcon = looping({
  elements: [
    ["rect", { width: 20, height: 8, x: 2, y: 2, rx: 2, ry: 2 }],
    ["rect", { width: 20, height: 8, x: 2, y: 14, rx: 2, ry: 2 }],
    ["line", { x1: 6, x2: "6.01", y1: 6, y2: 6 }],
    ["line", { x1: 6, x2: "6.01", y1: 18, y2: 18 }],
  ],
  motion: "aim-relay",
  groups: [{ indices: [0, 2] }, { indices: [1, 3], delay: "-0.6s" }],
});

/** Reading the link graph — the grid that grounds the map redraws itself. */
export const FrameIcon = looping({
  elements: [
    ["line", { x1: 22, x2: 2, y1: 6, y2: 6 }],
    ["line", { x1: 22, x2: 2, y1: 18, y2: 18 }],
    ["line", { x1: 6, x2: 6, y1: 2, y2: 22 }],
    ["line", { x1: 18, x2: 18, y1: 2, y2: 22 }],
  ],
  motion: "aim-scan aim-stagger",
  groups: [{ indices: [0, 1, 2, 3] }],
  drawn: true,
});

/** Reading a file — the page holds; its text lines redraw as they're checked. */
export const FileTextIcon = looping({
  elements: [
    ["path", { d: "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" }],
    ["path", { d: "M14 2v4a2 2 0 0 0 2 2h4" }],
    ["path", { d: "M10 9H8" }],
    ["path", { d: "M16 13H8" }],
    ["path", { d: "M16 17H8" }],
  ],
  motion: "aim-scan aim-stagger",
  groups: [{ indices: [2, 3, 4] }],
  drawn: true,
});

/** Linking — the connection draws itself while the link is being made. */
export const Link2Icon = looping({
  elements: [
    ["path", { d: "M9 17H7A5 5 0 0 1 7 7h2" }],
    ["path", { d: "M15 7h2a5 5 0 1 1 0 10h-2" }],
    ["line", { x1: 8, x2: 16, y1: 12, y2: 12 }],
  ],
  motion: "aim-draw aim-stagger",
  groups: [{ indices: [0, 1, 2] }],
  drawn: true,
});
