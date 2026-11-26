import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import GelMeter from "./GelMeter";
import MechanismGlyph, { type MechanismWord } from "./MechanismGlyph";
import EngineReachTiles from "./EngineReachTiles";
import EngineLabel from "./EngineLabel";
import BrandIcon from "./BrandIcon";
import CategoryFilterCards, { type CategoryType } from "./CategoryFilterCards";
import DisclosureBanner from "./DisclosureBanner";
import Tooltip from "./Tooltip";
import GroupHead from "./GroupHead";
import { repoRowDetail, repoRowFigure } from "../utils/listRowCopy";
import ListRow from "./ListRow";
import SummaryStrip from "./SummaryStrip";
import OverviewCard, { type OverviewCardProps } from "./OverviewCard";
import OverviewPopover from "./OverviewPopover";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import HangerMark from "./HangerMark";
import { Tabs, TabsIndicator, TabsList, TabsTrigger } from "./ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/hover-card";
import { Toggle } from "./ui/toggle";
import { Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "./ui/tooltip";
import UnderlineTabs from "./UnderlineTabs";
import ViewControl, { type ServerGrouping, type ServerSort } from "./ViewControl";
import OverflowMenu from "./OverflowMenu";
import { DropdownMenuItem, DropdownMenuSeparator } from "./ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Separator } from "./ui/separator";
import CollapsibleGroup from "./CollapsibleGroup";
import InfoPopover from "./InfoPopover";
import FindingChip from "./FindingChip";
import FindingPopover from "./FindingPopover";
import InspectorCap from "./InspectorCap";
import ListCard, { ListCardRow } from "./ListCard";
import ReachCard from "./ReachCard";
import ReviewPillActions from "./ReviewPillActions";
import OriginValue from "./OriginValue";
import ScanStamp from "./ScanStamp";
import HeroBand from "./HeroBand";
import NotLoadedGroup from "./NotLoadedGroup";
import KeptSkillsGroup from "./KeptSkillsGroup";
import GroupTicks, { groupHead, type TickGroup } from "./GroupTicks";
import KeptSkillDetail from "./KeptSkillDetail";
import { SearchPalettePanel } from "./SearchPalette";
import { SwitchNoticePill } from "./SwitchNotice";
import FavouriteHeart from "./FavouriteHeart";
import LayerSwitch from "./LayerSwitch";
import AllEnginesSwitch from "./AllEnginesSwitch";
import HeaderSwitch from "./HeaderSwitch";
import MarkdownDoc from "./MarkdownDoc";
import type { Block } from "../utils/skillDocument";
import { captionClass, groupLabelClass, rowValueClass, sectionHeadClass } from "./typeRoles";
import { miniBtnClass, miniBtnFillClass, miniBtnTonalClass, miniSetClass } from "./miniButton";
import * as Icons from "./icons";
import {
  CodeBracketIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  CpuChipIcon,
  Disc3Icon,
  DocumentIcon,
  EllipsisVerticalIcon,
  ExclamationTriangleIcon,
  FolderClockIcon,
  FolderIcon,
  FolderSymlinkIcon,
  GaugeIcon,
  GlobeAltIcon,
  LinkIcon,
  PanelRightIcon,
  RotateCcwIcon,
  SearchIcon,
  Square2StackIcon,
  SwatchIcon,
  strokeFor,
} from "./icons";
import { BRAND_IDS } from "../data/brands";
import EmptyState from "./EmptyState";
import EditorPicker from "./EditorPicker";
import EditorSetting from "./EditorSetting";
import type { StateFilter } from "../utils/linkStateCounts";
import { skillStateLabel, skillSwitchLabel } from "../utils/switchCopy";
import {
  type DesignSectionId,
  SAMPLE_ASSET,
  SAMPLE_ASSET_BROKEN,
  SAMPLE_ASSET_DRIFTED,
  SAMPLE_CATEGORY_COUNTS,
  SAMPLE_COUNTS,
  SAMPLE_EDITORS,
  SAMPLE_FINDINGS,
  SAMPLE_FINDING_LINES,
  SAMPLE_ENGINE_BAND_ROWS,
  SAMPLE_ENGINES,
  SAMPLE_ENGINE_STRIP,
  SAMPLE_OVERVIEW_ENGINES,
  SAMPLE_NOT_LOADED,
  SAMPLE_ORIGIN,
  SAMPLE_ORIGIN_BLOCKED,
  SAMPLE_REACH,
  sampleTileSwitch,
  SAMPLE_REVIEW,
  SAMPLE_REVIEW_ISSUE,
  SAMPLE_SCAN_STATUS,
  SAMPLE_SEARCH_HITS,
  SAMPLE_SEGMENTS,
  SAMPLE_SWITCH_NOTICES,
  SAMPLE_ALL_ENGINES_HEADERS,
  SAMPLE_SKILL_HEADERS,
  SAMPLE_KEPT_SKILLS,
  SAMPLE_KEPT_SKILLS_SELECTED,
  SAMPLE_KEPT_SKILL_DETAILS,
  SAMPLE_TABS,
} from "../data/designSystemFixtures";

interface DesignSystemPaneProps {
  /** The section the sidebar chose; the page scrolls to it. */
  section: DesignSectionId;
}

/* ── Runtime token reading ────────────────────────────────────────────────
   Values come from the running theme, never from source: the page has no
   hex to fall out of date, and a swatch reads whatever the app is actually
   painting. The observer follows the `dark` class on the root, so a theme
   flip in Settings re-reads without a prop. */
function useTokenValue(name: string): string {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (typeof window === "undefined" || typeof getComputedStyle !== "function") return;
    const read = () =>
      setValue(getComputedStyle(document.documentElement).getPropertyValue(name).trim());
    read();
    if (typeof MutationObserver === "undefined") return;
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [name]);
  return value;
}

function Swatch({ token, note, gradient }: { token: string; note?: string; gradient?: boolean }) {
  const value = useTokenValue(token);
  return (
    <div className="flex items-center gap-3 min-w-0">
      <span
        aria-hidden="true"
        className="w-9 h-9 shrink-0 rounded-inner border border-line"
        style={gradient ? { backgroundImage: `var(${token})` } : { background: `var(${token})` }}
      />
      <span className="min-w-0">
        <span className="block font-mono text-small text-ink-1 truncate">{token}</span>
        <span className="block font-mono text-micro text-ink-3 truncate" title={value}>
          {value || "—"}
          {note ? <span className="font-sans"> · {note}</span> : null}
        </span>
      </span>
    </div>
  );
}

function TokenValue({ token }: { token: string }) {
  const value = useTokenValue(token);
  return <span className="font-mono text-micro text-ink-3">{value || "—"}</span>;
}

/* ── Page furniture ─────────────────────────────────────────────────────── */
const eyebrowClass =
  "font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

function Section({
  id,
  label,
  lede,
  children,
}: {
  id: DesignSectionId;
  label: string;
  lede: string;
  children: ReactNode;
}) {
  return (
    <section id={`ds-${id}`} aria-labelledby={`ds-${id}-heading`} className="pt-7 first:pt-2">
      <div className={`flex items-center gap-2.5 px-3 pb-2 ${eyebrowClass}`}>
        <h2 id={`ds-${id}-heading`}>{label}</h2>
        <i className="flex-1 h-px bg-line" />
      </div>
      <p className="px-3 pb-4 text-small text-ink-2 leading-[1.55] max-w-[74ch]">{lede}</p>
      <div className="px-3 flex flex-col gap-5">{children}</div>
    </section>
  );
}

/** One rendered thing with its provenance. `sample` marks fixture-fed
 *  renderings so a figure on this page is never read as the machine.
 *  `unclipped` is for a specimen whose menu or popover opens below its
 *  trigger: the box's scroll container would otherwise swallow it. */
function Specimen({
  name,
  file,
  note,
  sample = true,
  unclipped = false,
  children,
}: {
  name: string;
  file: string;
  note?: string;
  sample?: boolean;
  unclipped?: boolean;
  children: ReactNode;
}) {
  return (
    <figure>
      <div className={`border border-line rounded-plane p-4 ${unclipped ? "" : "overflow-x-auto"}`}>
        {children}
      </div>
      <figcaption className="flex items-baseline gap-2 flex-wrap px-1 pt-1.5 font-flex text-micro text-ink-3">
        <span className="font-medium text-ink-2">{name}</span>
        <span className="font-mono">{file}</span>
        {note && <span>· {note}</span>}
        {sample && <span className="ml-auto uppercase tracking-[.06em]">sample</span>}
      </figcaption>
    </figure>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className={`${eyebrowClass} pb-2`}>{label}</div>
      {children}
    </div>
  );
}

const swatchGridClass = "grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-x-6 gap-y-3";

/** Holds the palette panel's own query state so typing in the specimen never
 *  touches the page's. Fixture hits never filter — the backend already
 *  ranked them — so the panel's row order and marks stay fixed regardless
 *  of what's typed. */
/** FavouriteHeart owns no state of its own; the page holds it so the pop and
 *  ring animations can be seen firing on the way in and not on the way out. */
function FavouriteHeartSpecimen() {
  const [favourited, setFavourited] = useState(false);
  return (
    <FavouriteHeart
      favourited={favourited}
      name="Sample skill"
      onToggle={() => setFavourited((v) => !v)}
    />
  );
}

/** Four sample groups, each with a few rows, in a short scrolling box so the
 *  ticks have somewhere to jump. The ids are the specimen's own: the page
 *  also draws KeptSkillsGroup and NotLoadedGroup, which carry Global's. */
const SAMPLE_TICK_GROUPS: (TickGroup & { rows: string[] })[] = [
  { id: "ds-ticks-skills", label: "Skills", count: 554, rows: ["zoom-out", "xlsx", "web-perf", "webgl-laser", "vercel-react-best-practices"] },
  { id: "ds-ticks-tools", label: "MCP servers", count: 33, rows: ["figma", "linear", "playwright"] },
  { id: "ds-ticks-rules", label: "Rules", count: 3, rows: ["house-style", "commit-messages", "review"] },
  { id: "ds-ticks-subagents", label: "Subagents", count: 302, rows: ["code-reviewer", "planner", "researcher", "tester"] },
];

function GroupTicksSpecimen() {
  const list = useRef<HTMLDivElement>(null);
  return (
    <div className="relative max-w-md h-48 flex flex-col">
      <GroupTicks groups={SAMPLE_TICK_GROUPS} scrollRoot={list} />
      <div ref={list} className="flex-1 min-h-0 overflow-y-auto ml-12 border border-line rounded-plane pb-1.5">
        {SAMPLE_TICK_GROUPS.map((g) => (
          <section key={g.id}>
            <h3 id={g.id} className={`px-3.5 pt-2.5 pb-1 ${groupLabelClass}`}>
              {groupHead(g.label, g.count)}
            </h3>
            {g.rows.map((r) => (
              <div key={r} className={`px-3.5 py-1.5 ${rowValueClass}`}>
                {r}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

/** The switch pattern: a button named for its subject carries aria-pressed,
 *  and the LayerSwitch inside it only draws the state. The row class is the
 *  link map's layers-panel row, repeated here as the pill pair is. */
const sampleSwitchRowClass =
  "w-full h-7 px-1.5 rounded-soft flex items-center justify-between font-flex text-small text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer";

function LayerSwitchSpecimen() {
  const [on, setOn] = useState(false);
  return (
    <div className="w-[190px]">
      <button type="button" aria-pressed={on} onClick={() => setOn((v) => !v)} className={sampleSwitchRowClass}>
        Sample switch
        <LayerSwitch on={on} />
      </button>
    </div>
  );
}

/** The MCP server inspector's header row with its switch for every engine,
 *  in each of the three states. The title and transport chip classes are
 *  `Flyout.tsx`'s header, repeated here as the pill pair is; each row names a
 *  different sample server, so no two switches share a name. */
const sampleHeaderTitleClass = "text-lg-app font-medium tracking-[-0.3px] text-ink-1 truncate max-w-[280px] font-sans";
const sampleHeaderChipClass =
  "shrink-0 text-small font-mono px-2 py-px rounded-pill bg-tint text-ink-1 whitespace-nowrap";

function AllEnginesSwitchSpecimen() {
  return (
    <div className="w-[384px] flex flex-col gap-3">
      {SAMPLE_ALL_ENGINES_HEADERS.map(({ server, transport, state }) => (
        <div key={server} className="flex items-center gap-2 min-w-0">
          <span className={sampleHeaderTitleClass}>{server}</span>
          <span className={sampleHeaderChipClass}>{transport}</span>
          <AllEnginesSwitch server={server} state={state} pending={false} onToggle={() => {}} />
        </div>
      ))}
    </div>
  );
}

/** A store skill's inspector header with its On/Off switch: On, Off, and
 *  pending while its request runs. The words are `switchCopy`'s, as the
 *  inspector's are; the title class is `Flyout.tsx`'s header, as above. */
function HeaderSwitchSpecimen() {
  return (
    <div className="w-[384px] flex flex-col gap-3">
      {SAMPLE_SKILL_HEADERS.map(({ skill, on, pending }) => (
        <div key={skill} className="flex items-center gap-2 min-w-0">
          <span className={sampleHeaderTitleClass}>{skill}</span>
          <HeaderSwitch
            testId="sample-header-switch"
            label={skillSwitchLabel(skill, on)}
            pressed={on}
            on={on}
            stateWord={skillStateLabel(on)}
            pending={pending}
            onToggle={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

/** A body small enough to read at a glance and wide enough to show the block
 *  kinds MarkdownDoc actually renders differently. */
const SAMPLE_DOC_BLOCKS: Block[] = [
  { kind: "heading", level: 2, spans: [{ text: "Reading a skill" }] },
  {
    kind: "paragraph",
    spans: [
      { text: "A skill's body is rendered as a document, not as " },
      { text: "pre", code: true },
      { text: " text." },
    ],
  },
  {
    kind: "list",
    ordered: false,
    items: [
      { spans: [{ text: "Lists keep the body role" }] },
      { spans: [{ text: "Code keeps its own leading" }] },
    ],
  },
  { kind: "code", language: "bash", text: "bun run tauri dev" },
];


function SearchPaletteSpecimen() {
  const [query, setQuery] = useState("screenshot");
  return (
    <SearchPalettePanel
      query={query}
      onQueryChange={setQuery}
      hits={SAMPLE_SEARCH_HITS}
      hasScanned
      onPick={() => {}}
      dialogLabel="Sample search palette"
      inputLabel="Sample search field"
      autoFocus={false}
    />
  );
}

/* ── The page ───────────────────────────────────────────────────────────── */

const MECHANISMS: MechanismWord[] = ["symlink", "copy", "drift", "broken", "none"];

/** The three stacks, in the order the root and the utilities meet them. The
 *  stack string is read from the theme by TokenValue, never typed here. */
const FAMILIES: { token: string; family: string; role: string }[] = [
  { token: "--font-sans", family: "font-sans", role: "body — the document root" },
  { token: "--font-flex", family: "font-flex", role: "the utility voice — eyebrows, stamps, chips" },
  { token: "--font-mono", family: "font-mono", role: "paths, values, code" },
];

/** `role` mirrors the Role column of DESIGN.md §2's table. */
const TYPE_ROWS: { utility: string; px: string; role: string; sample: ReactNode }[] = [
  { utility: "text-display", px: "32px", role: "display", sample: <span className="text-display font-medium tabular tracking-[-0.5px] leading-display text-ink-1">142</span> },
  { utility: "text-lg-app", px: "16px", role: "titles", sample: <span className="text-lg-app text-ink-2">assets in the global store · 6 engines</span> },
  { utility: "text-base-app", px: "13px", role: "body", sample: <span className="text-base-app font-medium text-ink-1">writing-great-skills</span> },
  { utility: "text-small", px: "12px", role: "secondary", sample: <span className="text-small text-ink-2">Symlink — edits to the source reach every destination</span> },
  { utility: "text-micro · badges and chips only", px: "11px", role: "badges and chips", sample: <span className="text-micro font-medium text-ink-3 bg-plane-2 px-2 py-0.5 rounded-pill font-flex">Global</span> },
  { utility: "font-mono text-micro", px: "11px", role: "paths and values", sample: <span className="font-mono text-micro text-ink-3">~/.agents/skills/writing-great-skills/SKILL.md</span> },
  { utility: "leading-body", px: "20px", role: "leading", sample: <span className="block whitespace-normal max-w-[230px] text-base-app text-ink-1 leading-body">Scans the directories those engines read from and shows whether it still matches its source.</span> },
  { utility: "leading-caption", px: "16px", role: "leading", sample: <span className="block whitespace-normal max-w-[230px] text-small text-ink-3 leading-caption">Installed 2026-08-14 · tracked by a harness convention, not an interface of its own.</span> },
  { utility: "leading-code", px: "18px", role: "leading", sample: <span className="block whitespace-normal max-w-[230px] font-mono text-small text-ink-1 leading-code">~/.claude/skills/writing-great-skills/SKILL.md — twenty-two lines.</span> },
];

const RADII: { utility: string; token: string }[] = [
  { utility: "rounded-plane", token: "--radius-plane" },
  { utility: "rounded-inner", token: "--radius-inner" },
  { utility: "rounded-soft", token: "--radius-soft" },
  { utility: "rounded-pill", token: "--radius-pill" },
];

const BEATS: { utility: string; token: string; where: string }[] = [
  { utility: "duration-hover", token: "--dur-hover", where: "hover and colour" },
  { utility: "duration-nav", token: "--dur-nav", where: "selection and navigation" },
  { utility: "duration-press", token: "--dur-press", where: "press, enter and exit" },
];

/** The stroke ladder, read live from `strokeFor` rather than listed here, so
 *  the specimen cannot drift from icons.tsx's own answer. */
const ICON_SIZE_BANDS = [12, 13, 14, 16, 20, 24];

/** The rail's marks in the rail's order (IconRail.tsx), where four stack at
 *  one size and any optical mismatch reads as a wobble. */
const RAIL_MARKS: { name: string; Icon: ComponentType<{ size?: number }> }[] = [
  { name: "ComputerDesktopIcon", Icon: ComputerDesktopIcon },
  { name: "FolderSymlinkIcon", Icon: FolderSymlinkIcon },
  { name: "GlobeAltIcon", Icon: GlobeAltIcon },
  { name: "CpuChipIcon", Icon: CpuChipIcon },
  { name: "ExclamationTriangleIcon", Icon: ExclamationTriangleIcon },
  { name: "SwatchIcon", Icon: SwatchIcon },
  { name: "Cog6ToothIcon", Icon: Cog6ToothIcon },
];

/** Every mark icons.tsx exports, read off the module rather than listed, so
 *  a new export appears here without anyone remembering to add it. */
const ICON_ROSTER = Object.entries(Icons)
  .filter(([name, value]) => name.endsWith("Icon") && typeof value === "function")
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([name, value]) => ({ name, Icon: value as ComponentType<{ size?: number }> }));

// The pill pair as hoisted in DiscoveryPane.tsx; the cap button and field as
// hoisted in App.tsx. Repeated here rather than exported — one place should
// own them, and that place does not exist yet (recorded in DESIGN.md).
const primaryPillClass =
  "h-[30px] px-4 rounded-pill border border-transparent bg-fill text-on-fill text-small font-medium cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]";
const secondaryPillClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 disabled:opacity-50 disabled:cursor-default";
const capButtonClass =
  "relative w-[27px] h-[27px] rounded-pill inline-flex items-center justify-center text-ink-2 hover:bg-tint-plane hover:text-ink-1 transition-colors duration-hover ease-spring cursor-pointer";
const listRowClass = (active: boolean) =>
  `flex items-center gap-2 h-8 px-3 rounded-pill cursor-pointer transition-colors duration-nav ease-spring ${
    active ? "bg-tint-plane text-tint-ink" : "text-ink-2 hover:bg-tint-plane"
  }`;

/**
 * Design system — the system, rendered by the app that uses it.
 *
 * Every component on this page is the real one, imported and rendered with
 * sample props; tokens are read from the running theme. Nothing here is a
 * picture, so nothing here can drift from the app. Dev builds only
 * (Karthik's ruling, 2026-08-16); the written counterpart is
 * .claude/DESIGN.md.
 */
export default function DesignSystemPane({ section }: DesignSystemPaneProps) {
  useEffect(() => {
    const target = document.getElementById(`ds-${section}`);
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [section]);

  // Local state so interactive specimens actually interact.
  const [stateFilter, setStateFilter] = useState<StateFilter>(null);
  const [category, setCategory] = useState<CategoryType | null>(null);
  const [replay, setReplay] = useState(0);
  const [selectedRow, setSelectedRow] = useState<string | null>(SAMPLE_ASSET.id ?? null);
  const [segment, setSegment] = useState(SAMPLE_SEGMENTS[0].id);
  const [tab, setTab] = useState(SAMPLE_TABS[0].id);
  const [grouping, setGrouping] = useState<ServerGrouping>("server");
  const [sort, setSort] = useState<ServerSort>("attention");
  const [heroOpen, setHeroOpen] = useState(true);
  // The overview popover's specimen: its own sample trigger and open state.
  const [overviewOpen, setOverviewOpen] = useState(false);
  // The Toggle specimen's pressed state.
  const [togglePressed, setTogglePressed] = useState(true);
  const overviewAnchorRef = useRef<HTMLButtonElement>(null);
  // The surfaces a finding popover clamps against, standing in for the
  // inspector column and a placecard.
  const capHostRef = useRef<HTMLDivElement>(null);
  const chipHostRef = useRef<HTMLDivElement>(null);
  const popoverHostRef = useRef<HTMLDivElement>(null);


  const scannedAt = new Date(Date.now() - 4 * 60_000);
  // The overview card's specimens share one sample: the props ProfilePane
  // hands the card, with handlers that do nothing but the legend's.
  const overview: OverviewCardProps = {
    engines: SAMPLE_OVERVIEW_ENGINES,
    selectedEngineId: null,
    onSelectEngine: () => {},
    storeTotal: SAMPLE_COUNTS.total,
    linkLegend: { counts: SAMPLE_COUNTS, active: stateFilter, onFilter: setStateFilter },
    engineFigures: null,
    review: {
      count: 2,
      lines: [
        { severity: "warning", text: SAMPLE_REVIEW_ISSUE.problem, detail: SAMPLE_REVIEW_ISSUE.name },
        { severity: "danger", text: SAMPLE_FINDING_LINES[1] },
      ],
    },
    scan: { scannedAt: scannedAt.getTime(), scanning: false, onRescan: () => {} },
  };

  return (
    // The pane paints no ground of its own: <main>'s sheet is the ground, and a full-bleed bg-page here would square off the sheet's corner from inside (every screen carries the corner — Karthik, 2026-08-28).
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden font-sans">
      <header className="px-[18px] pt-[18px] pb-1 shrink-0">
        <div className="flex items-baseline gap-3.5 mb-[7px]">
          <h1 className="text-lg-app font-medium tracking-[-0.2px] text-ink-1">
            The system, rendered by the app that uses it
          </h1>
          <span className="ml-auto font-flex text-micro text-ink-3 shrink-0">Dev builds only</span>
        </div>
        <p className="text-small text-ink-2 leading-[1.55] max-w-[74ch]">
          Every component below is the real one, imported and rendered with sample data; every
          token value is read from the running theme. Nothing here is a picture, so nothing here
          can drift from the app. The written counterpart is .claude/DESIGN.md.
        </p>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto mx-[18px] mt-3.5 pb-8 border border-line rounded-tl-plane rounded-tr-plane">
        <Section
          id="colour"
          label="Colour"
          lede="Ink and paper. Every neutral is a value step, never a hue. Saturated colour appears in exactly three places — system state, the brand mark, and the meter's aqua gel. Flip Appearance in Settings and every value below follows."
        >
          <Group label="Ground and ink">
            <div className={swatchGridClass}>
              <Swatch token="--page" note="window ground" />
              <Swatch token="--sidebar" note="the shell's material: the rail column and every cap. A tint over the window's vibrancy, so the swatch is the tint, not what you see on screen — that moves with whatever sits behind the window" />
              <Swatch token="--plane" note="list and card surface" />
              <Swatch token="--plane-2" note="hover / press step" />
              <Swatch token="--tint" note="selection on the page" />
              <Swatch token="--tint-plane" note="selection on the plane" />
              <Swatch token="--tint-ink" note="text on tint" />
              <Swatch token="--line" note="border" />
              <Swatch token="--line-2" note="stronger border" />
              <Swatch token="--ink-1" note="primary text" />
              <Swatch token="--ink-2" note="secondary text" />
              <Swatch token="--ink-3" note="muted text" />
            </div>
          </Group>
          <Group label="The one strong action">
            <div className={swatchGridClass}>
              <Swatch token="--fill" />
              <Swatch token="--on-fill" />
            </div>
          </Group>
          <Group label="Saturated — three places, no more">
            <div className={swatchGridClass}>
              <Swatch token="--brand" note="the hanger mark only" />
              <Swatch token="--state-success" note="linked" />
              <Swatch token="--state-warning" note="drifted" />
              <Swatch token="--state-danger" note="broken" />
              <Swatch token="--gel-aqua" gradient note="the linked share, in GelMeter only" />
            </div>
          </Group>
          <Group label="Overlays">
            <div className={swatchGridClass}>
              <Swatch token="--scrim" note="modal wash" />
              <Swatch token="--bar-track" note="the meter's recessed track" />
              <Swatch token="--gel-gloss" gradient note="glass over every meter segment" />
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div className="w-36 h-16 rounded-plane bg-page shadow-overlay border border-line" aria-hidden="true" />
              <span className="text-small text-ink-2 max-w-[48ch]">
                The system's one elevation, tokened, for surfaces that appear on request above the
                map canvas. Everything else stays flat.
              </span>
            </div>
          </Group>
        </Section>

        <Section
          id="geometry"
          label="Geometry"
          lede="Three radii for surfaces, one soft radius for the rail's buttons, pills for every control. Spacing rides Tailwind's 4px grid; anything off it is stated at the call site as an arbitrary value, and the 18px gutter is a token. The shell's cap is 36px; the content sheet under it opens 18px in from its top rule, the same as from its sides, and the first column after the rail rounds its top-left corner on every screen."
        >
          <div className="flex items-end gap-6 flex-wrap">
            {RADII.map((r) => (
              <div key={r.utility} className="flex flex-col items-center gap-2">
                <div className={`w-20 h-12 border border-line-2 ${r.utility}`} aria-hidden="true" />
                <span className="font-mono text-micro text-ink-2">{r.utility}</span>
                <TokenValue token={r.token} />
              </div>
            ))}
            <div className="flex flex-col items-center gap-2">
              <div className="h-12 flex items-end gap-3">
                <div className="w-[18px] h-12 bg-tint-plane" aria-hidden="true" />
                <div className="w-2 h-12 bg-tint-plane" aria-hidden="true" />
              </div>
              <span className="font-mono text-micro text-ink-2">--gutter · --step</span>
              <span className="font-mono text-micro text-ink-3">
                <TokenValue token="--gutter" /> · <TokenValue token="--step" />
              </span>
            </div>
          </div>
        </Section>

        <Section
          id="motion"
          label="Motion"
          lede="One spring, three beats. Hover, navigation and press each have a duration; enter and exit ride the press beat. Hover the pills, then replay the entrances."
        >
          <div className="flex items-center gap-3 flex-wrap">
            {BEATS.map((b) => (
              <span
                key={b.utility}
                className={`h-[30px] px-4 rounded-pill border border-line-2 text-small text-ink-1 inline-flex items-center gap-2 cursor-default transition-colors ease-spring hover:bg-tint-plane ${b.utility}`}
              >
                {b.utility}
                <TokenValue token={b.token} />
              </span>
            ))}
            <span className="font-mono text-micro text-ink-3">
              --spring <TokenValue token="--spring" />
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setReplay((n) => n + 1)} className={secondaryPillClass}>
              Replay entrances
            </button>
            <div key={replay} className="flex items-center gap-3">
              <div className="w-28 h-10 rounded-inner border border-line bg-page animate-drop grid place-items-center text-micro text-ink-3">
                animate-drop
              </div>
              <div className="h-8 px-4 rounded-pill bg-fill text-on-fill text-small inline-flex items-center animate-rise">
                animate-rise
              </div>
              <div className="w-28 h-10 rounded-inner border border-line bg-page flex flex-col items-center justify-center gap-1 text-micro text-ink-3">
                <Disc3Icon size={16} active />
                aim-spin aim-loop
              </div>
              <div className="w-28 h-10 rounded-inner border border-line bg-page flex flex-col items-center justify-center gap-1 text-micro text-ink-3">
                <FolderClockIcon size={16} />
                aim-once
              </div>
            </div>
          </div>
        </Section>

        <Section
          id="type"
          label="Typography"
          lede="Three font tokens, one system stack, five sizes, two weights. Each size carries one role rather than a free choice. Figures that change wear the tabular utility so they never jitter; the utility voice is font-flex, micro, uppercase and tracked."
        >
          <Group label="Families">
            <div className="border border-line rounded-plane px-4">
              {FAMILIES.map((f) => (
                <div
                  key={f.token}
                  className="grid grid-cols-[190px_1fr] items-baseline gap-4 py-3 border-b border-line last:border-b-0"
                >
                  <span className="min-w-0">
                    <span className="block font-mono text-micro text-ink-3">{f.token}</span>
                    <span className="block font-flex text-micro text-ink-3">{f.role}</span>
                  </span>
                  <span className={`min-w-0 flex flex-col gap-1 ${f.family}`}>
                    <span className="text-base-app text-ink-1 truncate">Sphinx of black quartz, judge my vow.</span>
                    <span className="text-small text-ink-2 tabular">142 · 1.2.0 · 2026-08-28</span>
                    <span className="truncate">
                      <TokenValue token={f.token} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="pt-2 text-small text-ink-2 leading-caption max-w-[74ch]">
              --font-sans and --font-flex are declared with the same stack today (tokens.css:65-66): the two
              names mark two roles, not two faces. On macOS the stack resolves to the system UI face — it
              begins -apple-system — and the page shows what the theme returns rather than naming one.
            </p>
          </Group>
          <Group label="Scale">
            <div className="border border-line rounded-plane px-4">
              {TYPE_ROWS.map((row) => (
                <div
                  key={row.utility}
                  className="grid grid-cols-[190px_110px_1fr] items-baseline gap-4 py-3 border-b border-line last:border-b-0"
                >
                  <span className="font-mono text-micro text-ink-3">
                    {row.utility} <span className="font-sans">· {row.px}</span>
                  </span>
                  <span className="font-flex text-micro text-ink-3 truncate">{row.role}</span>
                  <span className="min-w-0 truncate">{row.sample}</span>
                </div>
              ))}
              <div className="grid grid-cols-[190px_110px_1fr] items-baseline gap-4 py-3">
                <span className="font-mono text-micro text-ink-3">
                  font-medium <span className="font-sans">· the only other weight</span>
                </span>
                <span className="font-flex text-micro text-ink-3">weight</span>
                <span className="text-base-app text-ink-1">
                  Regular 400 beside <b className="font-medium">medium 500</b> — nothing heavier exists.
                </span>
              </div>
            </div>
          </Group>
        </Section>

        <Section
          id="iconography"
          label="Iconography"
          lede="Heroicons outline, never used raw: sized() applies two corrections — the stroke is 24 over the box, landing at 1.0px on screen at 16px and floored at the family's 1.5 above it, and a per-mark optical factor evens out how much of the grid each mark inks. Brand marks come from one sprite, referenced by id."
        >
          <Specimen name="Stroke ladder" file="icons.tsx" note="the stroke is 24 over the box, so it lands at 1.0px at 16 and floors at the family's 1.5 above it, where 20 and 24 keep their drawn weight — a mark's own optical factor can push its box past 16 the same way, so the rail's 1.12 marks settle at 1.12px">
            <div className="flex items-end gap-8">
              {ICON_SIZE_BANDS.map((size) => (
                <div key={size} className="flex flex-col items-center gap-2 text-ink-1">
                  <FolderIcon size={size} />
                  <span className="font-mono text-micro text-ink-3 tabular">
                    {size} · {String(strokeFor(size))}
                  </span>
                </div>
              ))}
            </div>
          </Specimen>

          <Specimen name="Optical alignment" file="icons.tsx" note="the rail's marks at 16; per-mark optical factors are measured ink-extent ratios, and anything within 4% is left at 1">
            <div className="flex items-center gap-5 text-ink-2">
              {RAIL_MARKS.map(({ name, Icon }) => (
                <Icon key={name} size={16} />
              ))}
            </div>
          </Specimen>

          <Specimen name="Roster" file="icons.tsx" note="Heroicons outline, seven static lucide, twenty animated lucide, three hand-drawn — DESIGN.md §4">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-x-4 gap-y-4">
              {ICON_ROSTER.map(({ name, Icon }) => (
                <div key={name} className="flex flex-col items-center gap-1.5 min-w-0 text-ink-1">
                  <Icon size={16} />
                  <span className="font-mono text-micro text-ink-3 whitespace-nowrap">{name}</span>
                </div>
              ))}
            </div>
          </Specimen>

          <Specimen name="Brand marks" file="BrandIcon.tsx · brands.ts" note="colour where the brand has colour, currentColor where monochrome; a brand that ships a dark twin swaps marks with the theme. The generic fallback draws for any unmapped id and reports the id once per session, so it is not drawn here">
            <div className="flex items-end gap-5 flex-wrap text-ink-1">
              {BRAND_IDS.map((id) => (
                <div key={id} className="flex flex-col items-center gap-1.5">
                  <BrandIcon engineKey={id} size={16} />
                  <span className="font-mono text-micro text-ink-3">{id}</span>
                </div>
              ))}
            </div>
          </Specimen>
        </Section>

        <Section
          id="controls"
          label="Controls"
          lede="Pills everywhere. The single strong action per region is fill; everything else outlines. Chips press into tint, list rows press into tint on the plane."
        >
          <Specimen name="Pill pair" file="DiscoveryPane.tsx" note="hoisted class strings, not yet a shared export">
            <div className="flex items-center gap-2 flex-wrap">
              <button className={primaryPillClass}>Open</button>
              <button className={secondaryPillClass}>Cancel</button>
              <button className={secondaryPillClass} disabled>
                Disabled
              </button>
              <button className="h-[30px] min-w-[108px] px-3.5 inline-flex items-center justify-center gap-2 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-hover ease-spring hover:bg-plane-2 active:scale-[0.96]">
                <RotateCcwIcon size={13} />
                Rescan
              </button>
            </div>
          </Specimen>

          <Specimen name="Cap button" file="App.tsx" note="the content cap's toolbar control; the search field moved to the palette">
            <div className="flex items-center gap-2.5">
              {/* Sample controls never borrow a real control's accessible
                  name — a reader would hear a toggle that toggles nothing. */}
              <Tooltip label="Sample cap button" placement="bottom">
                <button aria-label="Sample cap button" className={capButtonClass}>
                  <PanelRightIcon size={16} aria-hidden="true" />
                </button>
              </Tooltip>
            </div>
          </Specimen>

          <Specimen name="CategoryFilterCards" file="CategoryFilterCards.tsx" note="press one; empty categories hide">
            <CategoryFilterCards
              {...SAMPLE_CATEGORY_COUNTS}
              selectedCategory={category}
              onSelectCategory={setCategory}
              loading={false}
            />
          </Specimen>

          <Specimen name="EmptyState" file="EmptyState.tsx" note="eight near-identical planes, now one component (T5)">
            <EmptyState
              icon={<SearchIcon size={40} className="text-ink-3 mb-2" />}
              headline="No results"
              sub="Try a different search term."
            />
          </Specimen>

          <Specimen name="Source-list rows" file="SourceListShell.tsx" note="the second column's row idiom">
            <div className="w-56 flex flex-col">
              <div className={`${eyebrowClass} px-2.5 pt-1 pb-[5px]`}>Scope</div>
              <div role="button" tabIndex={0} aria-current="true" className={listRowClass(true)}>
                <span className="flex-1 min-w-0 truncate text-base-app font-medium">Global</span>
                <span className="text-micro tabular font-flex shrink-0 text-tint-ink opacity-70">142</span>
              </div>
              <div role="button" tabIndex={0} className={listRowClass(false)}>
                <span className="flex-1 min-w-0 truncate text-base-app">metrics-board</span>
                <span className="text-micro tabular font-flex shrink-0 text-ink-3">82</span>
              </div>
            </div>
          </Specimen>

          <Specimen name="Tooltip" file="Tooltip.tsx" note="hover the button">
            <Tooltip label="Sample tooltip">
              <button aria-label="Sample tooltip" className={capButtonClass}>
                <HangerMark size={15} />
              </button>
            </Tooltip>
          </Specimen>

          <Specimen name="HoverCard" file="ui/hover-card.tsx" note="focus or hover the trigger">
            <HoverCard>
              <HoverCardTrigger
                render={<button type="button" aria-label="Skills · 7" className={miniBtnClass} />}
                delay={100}
              >
                Skills · 7
              </HoverCardTrigger>
              <HoverCardContent
                side="right"
                align="center"
                sideOffset={8}
                className="whitespace-nowrap px-3 py-2 text-small font-medium text-ink-3"
              >
                <span data-testid="ds-hover-card-content">Skills · 7</span>
              </HoverCardContent>
            </HoverCard>
          </Specimen>

          <Specimen name="FavouriteHeart" file="FavouriteHeart.tsx" note="click it; the pop and ring fire on the way in only, and never on the way back out">
            <FavouriteHeartSpecimen />
          </Specimen>

          <Specimen name="MarkdownDoc" file="MarkdownDoc.tsx" note="a skill body rendered as a document — heading, prose, list and code, each on its own leading">
            <div className="w-full max-w-[520px]">
              <MarkdownDoc blocks={SAMPLE_DOC_BLOCKS} />
            </div>
          </Specimen>

          <Specimen name="Toggle · Tooltip" file="ui/toggle.tsx" note="shadcn's Toggle and Tooltip on Base UI, in Hanger's tokens: the overview card's window-bar button, 28px with the 8px control radius, --plane-2 on hover and --tint while pressed; the tip is Tooltip.tsx's look, after 80ms">
            <UiTooltip>
              <TooltipTrigger render={<span className="flex shrink-0" />}>
                <Toggle pressed={togglePressed} onPressedChange={setTogglePressed} aria-label="Sample toggle">
                  <GaugeIcon size={16} aria-hidden="true" />
                </Toggle>
              </TooltipTrigger>
              <TooltipContent side="bottom">Sample toggle</TooltipContent>
            </UiTooltip>
          </Specimen>

          <Specimen name="Popover" file="ui/popover.tsx" note="shadcn's Popover on Base UI, in Hanger's tokens: the page, the plane radius and the overlay elevation, with no padding of its own; Esc or a click outside closes it" unclipped>
            <Popover>
              <PopoverTrigger className={miniBtnClass}>Sample popover</PopoverTrigger>
              <PopoverContent side="bottom" align="start" className="p-3 text-small text-ink-2">
                Whatever the popover holds draws its own layout.
              </PopoverContent>
            </Popover>
          </Specimen>

          <Specimen name="Collapsible · Separator" file="ui/collapsible.tsx" note="shadcn's Collapsible and Separator on Base UI, in Hanger's tokens: a trigger that folds its panel, with nothing moving; the 1px rule is --line">
            <Collapsible defaultOpen className="w-[320px]">
              <CollapsibleTrigger className="flex items-center gap-2 w-full h-8 text-small text-ink-3 hover:text-ink-1">
                <span className="shrink-0">Sample fold</span>
                <Separator className="flex-1" />
              </CollapsibleTrigger>
              <CollapsibleContent className="text-small text-ink-2">Whatever the panel holds draws its own layout.</CollapsibleContent>
            </Collapsible>
          </Specimen>

          <Specimen name="Tabs" file="ui/tabs.tsx" note="shadcn's Tabs on Base UI, in Hanger's tokens: the track under CategoryFilterCards; the capsule slides on the nav beat">
            <Tabs value={segment} onValueChange={(value) => setSegment(String(value))}>
              <TabsList aria-label="Sample segments">
                <TabsIndicator />
                {SAMPLE_SEGMENTS.map((s) => (
                  <TabsTrigger key={s.id} value={s.id}>
                    <span>{s.label}</span>
                    <span className={`text-micro tabular ${s.id === segment ? "text-ink-2" : "text-ink-3"}`}>{s.count}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </Specimen>

          <Specimen name="UnderlineTabs" file="UnderlineTabs.tsx" note="switches views inside one surface; weight and the rule are all that change">
            <UnderlineTabs tabs={SAMPLE_TABS} active={tab} onChange={setTab} ariaLabel="Sample tabs" />
          </Specimen>

          <Specimen name="ViewControl" file="ViewControl.tsx" note="press it; grouping and sort are kept, so the check mark moves" unclipped>
            <ViewControl
              grouping={grouping}
              sort={sort}
              onGroupingChange={setGrouping}
              onSortChange={setSort}
            />
          </Specimen>

          <Specimen name="OverflowMenu" file="OverflowMenu.tsx" note="drawn with ui/dropdown-menu.tsx, shadcn's DropdownMenu on Base UI in Hanger's tokens: the trigger is the caller's; ↑/↓ move the --tint highlight, and picking an item closes the menu" unclipped>
            <OverflowMenu
              trigger={(triggerProps) => (
                <button type="button" aria-label="Sample overflow menu" className={capButtonClass} {...triggerProps}>
                  <EllipsisVerticalIcon size={16} aria-hidden="true" />
                </button>
              )}
              ariaLabel="Sample overflow menu"
              align="left"
              className="min-w-[184px] p-1"
            >
              {() => (
                <>
                  <DropdownMenuItem>Sample item one</DropdownMenuItem>
                  <DropdownMenuItem>Sample item two</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>Sample item three</DropdownMenuItem>
                </>
              )}
            </OverflowMenu>
          </Specimen>

          <Specimen name="InfoPopover" file="InfoPopover.tsx" note="a footnote that opens on click and stays put; not a Tooltip" unclipped>
            <div className="flex items-center justify-between w-[320px]">
              <span className={sectionHeadClass}>Context</span>
              <InfoPopover label="About the sample figures">
                Every figure on this page is a literal chosen to show a component's shape. None of
                it was read from this machine.
              </InfoPopover>
            </div>
          </Specimen>

          <Specimen name="Mini button" file="miniButton.ts" note="the 26px tier; fill is the cap's Link to…, tonal is the header's second action, outlined is the in-section set">
            <div className={miniSetClass}>
              <button type="button" className={miniBtnFillClass}>
                <LinkIcon size={13} aria-hidden="true" />
                Link to…
              </button>
              <button type="button" className={miniBtnTonalClass}>
                Sample tonal
              </button>
              <button type="button" className={miniBtnClass}>
                Sample outlined
              </button>
            </div>
          </Specimen>

          <Specimen name="LayerSwitch" file="LayerSwitch.tsx" note="press it; the button is named for its subject and carries aria-pressed, the track only draws the state">
            <LayerSwitchSpecimen />
          </Specimen>

          <Specimen name="FindingChip" file="FindingChip.tsx" note="the count is the line count, one per finding; the popover clamps inside the 300px box around it" unclipped>
            <div ref={chipHostRef} className="relative w-[300px] flex items-center gap-2">
              <FindingChip
                severity="warning"
                lines={[{ severity: "warning", text: SAMPLE_REVIEW_ISSUE.problem }]}
                onReview={() => {}}
                elevated
                clampTo={chipHostRef}
              />
              <FindingChip
                severity="danger"
                lines={SAMPLE_FINDING_LINES.map((text) => ({ severity: "danger" as const, text }))}
                onReview={() => {}}
                elevated
                clampTo={chipHostRef}
              />
            </div>
          </Specimen>

          <Specimen name="FindingPopover" file="FindingPopover.tsx" note="the panel FindingChip and the strip's review pill both open; a warning line with a detail, a danger line without" unclipped>
            <div ref={popoverHostRef} className="relative w-[300px] h-[190px]">
              <FindingPopover
                open
                onClose={() => {}}
                lines={[
                  { severity: "warning", text: SAMPLE_REVIEW_ISSUE.problem, detail: SAMPLE_REVIEW_ISSUE.name },
                  { severity: "danger", text: SAMPLE_FINDING_LINES[1] },
                ]}
                align="left"
                elevated
                clampTo={popoverHostRef}
                anchorRef={popoverHostRef}
                ariaLabel="Sample findings"
                actions={
                  <div className={miniSetClass}>
                    <button type="button" onClick={() => {}} className={miniBtnClass}>
                      Needs review →
                    </button>
                  </div>
                }
              />
            </div>
          </Specimen>

          <Specimen
            name="EditorPicker"
            file="EditorPicker.tsx"
            note="the first-use picker (Open in editor, no editor remembered yet); props in, callbacks out, no IPC — both states shown live. The real component is a fixed, viewport-covering overlay, so each frame below traps it with `contain-paint`, which makes the overlay's own inset-0 relative to the frame instead of the page"
            unclipped
          >
            <div className="flex flex-wrap gap-4">
              <div className="relative w-[420px] h-[360px] contain-paint border border-line rounded-inner">
                <EditorPicker
                  assetName="ui-typography"
                  editors={SAMPLE_EDITORS}
                  onPick={() => {}}
                  onChooseOther={() => {}}
                  onCancel={() => {}}
                />
              </div>
              <div className="relative w-[420px] h-[220px] contain-paint border border-line rounded-inner">
                <EditorPicker
                  assetName="ui-typography"
                  editors={[]}
                  onPick={() => {}}
                  onChooseOther={() => {}}
                  onCancel={() => {}}
                />
              </div>
            </div>
          </Specimen>

          <Specimen
            name="EditorSetting"
            file="EditorSetting.tsx"
            note="the Settings row that changes the remembered editor after the first pick; an ordinary root, so no contain-paint trap is needed — both states shown live"
          >
            <div className="flex flex-col gap-4 max-w-[420px]">
              <EditorSetting editors={SAMPLE_EDITORS} chosen={SAMPLE_EDITORS[2].name} onChoose={() => {}} onChooseOther={() => {}} />
              <EditorSetting editors={[]} chosen={null} onChoose={() => {}} onChooseOther={() => {}} />
            </div>
          </Specimen>
        </Section>

        <Section
          id="components"
          label="Composites"
          lede="Imported, not imitated. Each specimen is the component the panes render, fed sample props; captions name the file."
        >
          <Specimen name="SummaryStrip" file="SummaryStrip.tsx" note="a repository's summary: the total, the strip's GelMeter and link-state legend, whose toggles filter the list; Needs review opens the popover. Global's is the overview card since Task 7">
            <SummaryStrip
              total={SAMPLE_COUNTS.total}
              subtitle="assets in sample-repo · 6 engines"
              scannedAt={scannedAt}
              scanning={false}
              counts={SAMPLE_COUNTS}
              activeStateFilter={stateFilter}
              onFilterState={setStateFilter}
              onRescan={() => {}}
              review={{
                count: 2,
                lines: [
                  { severity: "warning", text: SAMPLE_REVIEW_ISSUE.problem, detail: SAMPLE_REVIEW_ISSUE.name },
                  { severity: "danger", text: SAMPLE_FINDING_LINES[1] },
                ],
                actions: (
                  <ReviewPillActions
                    issues={[SAMPLE_REVIEW_ISSUE]}
                    stateFilter={stateFilter}
                    onStateFilterChange={setStateFilter}
                    onReview={() => {}}
                  />
                ),
              }}
            />
          </Specimen>

          <Specimen name="OverviewCard · an engine picked" file="OverviewCard.tsx" note="Global's overview, at T3's size: 280px, frosted, a --line border, docked at the list's top right when there is room or in the window bar's popover. Every engine as a 32px row, ranked by its tokens every session, Not measured last; the picked engine by kind on 24px meter rows, a 3px line-tone GelMeter with an end tick, only MCP measured in Phase 1; then Needs review and Rescan">
            <div>
              <OverviewCard {...overview} selectedEngineId={SAMPLE_OVERVIEW_ENGINES[2].engine_id} engineFigures={SAMPLE_ENGINE_STRIP} />
            </div>
          </Specimen>

          <Specimen name="OverviewCard · All engines" file="OverviewCard.tsx" note="no engine picked: the second section is the global store with its total and the link-state meter and legend, whose toggles filter the list (round 14 q2)">
            <div>
              <OverviewCard {...overview} />
            </div>
          </Specimen>

          <Specimen name="OverviewCard · before the first scan" file="OverviewCard.tsx" note="no engines listed yet: no Engines head over nothing; nothing scanned and nothing to review">
            <div>
              <OverviewCard
                {...overview}
                engines={[]}
                storeTotal={0}
                linkLegend={{ counts: { linked: 0, drifted: 0, broken: 0, local: 0, total: 0 }, active: null, onFilter: () => {} }}
                review={null}
                scan={{ scannedAt: null, scanning: false, onRescan: () => {} }}
              />
            </div>
          </Specimen>

          <Specimen name="OverviewPopover" file="OverviewPopover.tsx" note="the card from the window bar when there is no room to dock it: press the sample toggle. shadcn's Popover on Base UI, right-aligned under its anchor, with the overlay elevation around the card's frost; Esc or a click outside closes it, and nothing animates" unclipped>
            <div className="flex items-center gap-2.5">
              <UiTooltip>
                <TooltipTrigger render={<span className="flex shrink-0" />}>
                  <Toggle
                    ref={overviewAnchorRef}
                    pressed={overviewOpen}
                    onPressedChange={() => setOverviewOpen((v) => !v)}
                    aria-label="Sample overview"
                    aria-haspopup="dialog"
                    aria-expanded={overviewOpen}
                  >
                    <GaugeIcon size={16} aria-hidden="true" />
                  </Toggle>
                </TooltipTrigger>
                <TooltipContent side="bottom">Sample overview</TooltipContent>
              </UiTooltip>
              <OverviewPopover open={overviewOpen} onClose={() => setOverviewOpen(false)} anchorRef={overviewAnchorRef}>
                <OverviewCard {...overview} />
              </OverviewPopover>
            </div>
          </Specimen>

          <Specimen name="ReviewPillActions" file="ReviewPillActions.tsx" note="the review pill's action row; a duplicate among the issues withholds Show in list, and no issue at all renders nothing">
            <ReviewPillActions
              issues={[SAMPLE_REVIEW_ISSUE, { ...SAMPLE_REVIEW_ISSUE, id: "Skills:duplicate:/sample", kind: "duplicate" }]}
              onStateFilterChange={() => {}}
              onReview={() => {}}
            />
          </Specimen>

          <Specimen name="GelMeter" file="GelMeter.tsx" note="aqua marks the linked share only; the review split stays glass; the line tone, the overview card's kind rows, is a 3px ink bar against a max with an end tick, never aqua, and an empty segments list is the bare track">
            <div className="flex flex-col gap-4">
              <GelMeter
                label={`${SAMPLE_COUNTS.linked} linked, ${SAMPLE_COUNTS.drifted} drifted, ${SAMPLE_COUNTS.broken} broken, ${SAMPLE_COUNTS.local} local only`}
                segments={[
                  { key: "linked", value: SAMPLE_COUNTS.linked, aqua: true },
                  { key: "drifted", value: SAMPLE_COUNTS.drifted, barClass: "bg-state-warning" },
                  { key: "broken", value: SAMPLE_COUNTS.broken, barClass: "bg-state-danger" },
                  { key: "local", value: SAMPLE_COUNTS.local },
                ]}
              />
              <GelMeter
                label={`${SAMPLE_REVIEW.broken} broken, ${SAMPLE_REVIEW.drifted} drifted, ${SAMPLE_REVIEW.duplicate} duplicated, ${SAMPLE_REVIEW.parse} won't parse`}
                segments={[
                  { key: "broken", value: SAMPLE_REVIEW.broken, barClass: "bg-state-danger" },
                  { key: "drifted", value: SAMPLE_REVIEW.drifted, barClass: "bg-state-warning" },
                  { key: "duplicate", value: SAMPLE_REVIEW.duplicate, barClass: "bg-line-2" },
                  { key: "parse", value: SAMPLE_REVIEW.parse, barClass: "bg-line" },
                ]}
              />
              <GelMeter tone="line" max={12400} label="Line: 9,951 of 12,400" segments={[{ key: "line", value: 9951 }]} />
              <GelMeter tone="line" label="Line: not measured" segments={[]} />
            </div>
          </Specimen>

          <Specimen name="MechanismGlyph" file="MechanismGlyph.tsx" note="five backend words; hover for the signed tooltip">
            <div className="flex items-center gap-6 flex-wrap">
              {MECHANISMS.map((m) => (
                <span key={m} className="inline-flex items-center gap-2 text-small text-ink-2">
                  <MechanismGlyph mechanism={m} places={m === "symlink" ? ["metrics-board", "mei-recipes"] : undefined} />
                  <span className="font-mono text-micro">{m}</span>
                </span>
              ))}
            </div>
          </Specimen>

          <Specimen name="EngineReachTiles" file="EngineReachTiles.tsx" note="reached engines wear their mark; unreached are empty slots">
            <EngineReachTiles reach={SAMPLE_REACH} />
          </Specimen>

          <Specimen name="EngineReachTiles · switches" file="EngineReachTiles.tsx" note="on Global's MCP servers rows a tile is that engine's switch, here the second one; off is an outline ring, another engine's tile while one is picked fades to 40%, a read-only one fades to 60% with its reason as the tip">
            <div className="flex items-start gap-6 flex-wrap">
              <div className="flex flex-col gap-1.5">
                <EngineReachTiles reach={SAMPLE_REACH.slice(0, 3)} switchFor={sampleTileSwitch("off")} />
                <span className={captionClass}>Off</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <EngineReachTiles reach={SAMPLE_REACH.slice(0, 3)} switchFor={sampleTileSwitch("on")} leadEngine="claude" />
                <span className={captionClass}>Another engine picked</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <EngineReachTiles
                  reach={SAMPLE_REACH.slice(0, 3)}
                  switchFor={sampleTileSwitch("on", "managed_by_plugin")}
                />
                <span className={captionClass}>Read-only</span>
              </div>
            </div>
          </Specimen>

          <Specimen name="EngineLabel · BrandIcon" file="EngineLabel.tsx · BrandIcon.tsx" note="the one icon-plus-name compound">
            <div className="flex items-center gap-6 flex-wrap text-small text-ink-1">
              <EngineLabel engineKey="claude" engineName="Claude Code">Claude Code</EngineLabel>
              <EngineLabel engineKey="codex" engineName="Codex">Codex</EngineLabel>
              <EngineLabel engineKey="gemini" engineName="Gemini CLI">Gemini CLI</EngineLabel>
              <span className="inline-flex items-center gap-2">
                <BrandIcon engineKey="claude" size={16} />
                <BrandIcon engineKey="codex" size={16} />
                <BrandIcon engineKey="gemini" size={16} />
                <BrandIcon engineKey="claude_desktop" size={16} />
                <BrandIcon engineKey="vscode" size={16} />
              </span>
            </div>
          </Specimen>

          <Specimen name="DisclosureBanner" file="DisclosureBanner.tsx" note="three variants; the count prefixes the summary">
            <div className="flex flex-col gap-2">
              <DisclosureBanner variant="warning" summary="scan warnings" count={2}>
                <p className="text-small text-ink-2">Two roots could not be read. Sample text.</p>
              </DisclosureBanner>
              <DisclosureBanner variant="info" summary="nested repos" count={4}>
                <p className="text-small text-ink-2">Four directories are repositories in their own right. Sample text.</p>
              </DisclosureBanner>
              <DisclosureBanner variant="error" summary="Per-asset project links have not been recorded yet">
                <p className="text-small text-ink-2">A notice that is a sentence, not a tally. Sample text.</p>
              </DisclosureBanner>
            </div>
          </Specimen>

          <Specimen name="GroupHead · a repository's rows" file="GroupHead.tsx" note="a group's head on Global's list and a repository's, after T3's shelf head: the label, a 1px rule, the backend's figure. Under it, ListRows as a repository draws them: the Engine word on the left of line 2, the State word on the right, coloured for a drift or a file that won't parse. Select a row">
            <div className="max-w-[640px] flex flex-col">
              <GroupHead label="Sample group" figure={3} />
              <div className="flex flex-col gap-px">
                {[SAMPLE_ASSET, SAMPLE_ASSET_DRIFTED, SAMPLE_ASSET_BROKEN].map((item) => {
                  const figure = repoRowFigure(item);
                  return (
                    <ListRow
                      key={item.id}
                      kind={item.category === "Rules" ? "rule" : item.category === "Subagents" ? "subagent" : "skill"}
                      name={item.name}
                      detail={repoRowDetail(item)}
                      figure={figure.text}
                      figureTone={figure.tone}
                      reach={null}
                      muted={item.parseStatus === "failed"}
                      selected={selectedRow === item.id}
                      onSelect={() => setSelectedRow(item.id ?? null)}
                    />
                  );
                })}
              </div>
            </div>
          </Specimen>

          <Specimen name="ListRow" file="ListRow.tsx" note="Global's two-line row, after T3 Code: name, then a server's transport and the engine marks; the description or status sentence below, and one figure on the right. Line 2 draws only what exists. Hover a row; the second is selected; the third won't parse">
            <div className="max-w-[640px] flex flex-col gap-px">
              <ListRow
                kind="skill"
                name="writing-great-skills"
                detail="Write a skill an agent can follow"
                figure="In 2 projects"
                reach={SAMPLE_REACH.slice(0, 3)}
                selected={false}
                onSelect={() => {}}
              />
              <ListRow
                kind="server"
                name="chrome-devtools"
                chip="stdio"
                detail="Registered in 2 engines"
                figure="12 tools"
                reach={SAMPLE_REACH.slice(0, 2)}
                switchFor={sampleTileSwitch("on")}
                selected
                onSelect={() => {}}
              />
              <ListRow kind="rule" name="AGENTS.md" figure="Global only" reach={SAMPLE_REACH.slice(0, 1)} muted selected={false} onSelect={() => {}} />
            </div>
          </Specimen>

          <Specimen name="ScanStatusIndicator" file="ScanStatusIndicator.tsx" note="the foot line's live progress">
            <ScanStatusIndicator status={SAMPLE_SCAN_STATUS} />
          </Specimen>

          <Specimen name="HangerMark" file="HangerMark.tsx" note="--brand, currentColor, three sizes" sample={false}>
            <div className="flex items-end gap-6">
              <HangerMark size={22} />
              <HangerMark size={32} />
              <HangerMark size={48} />
            </div>
          </Specimen>

          <Specimen name="InspectorCap" file="InspectorCap.tsx" note="the inspector column's cap; when the row overflows, Link to… sheds into ⋮ first, then the chip" unclipped>
            {/* Wider than the inspector's 384px floor so nothing sheds here
                and both Link to… and the chip are on the surface. */}
            <div ref={capHostRef} className="relative w-[448px] border border-line rounded-inner bg-page">
              <InspectorCap
                asset={{ category: "Skills" }}
                place="Global"
                findings={SAMPLE_FINDINGS}
                inspectorExpanded={false}
                clampTo={capHostRef}
                onLink={() => {}}
                onOpenInEditor={() => {}}
                onCopyPath={() => {}}
                onReveal={() => {}}
                onReview={() => {}}
                onToggleExpanded={() => {}}
                onToggleInspector={() => {}}
              />
            </div>
          </Specimen>

          <Specimen name="ListCard · ListCardRow" file="ListCard.tsx" note="icon · label · right-aligned value; the divider lives on row after row">
            <div className="max-w-[384px]">
              <ListCard>
                {/* A long value is capped by the caller, the way the Identity
                    card's Path row does it: the row lets the value shrink
                    and ellipsize, but the label's box grows from zero, so
                    an uncapped path starves the label first. */}
                <ListCardRow
                  icon={<DocumentIcon size={14} aria-hidden="true" />}
                  label={<span className="font-mono">SKILL.md</span>}
                  value={
                    <span className="block max-w-55 truncate" title="~/.agents/skills/writing-great-skills">
                      ~/.agents/skills/writing-great-skills
                    </span>
                  }
                />
                <ListCardRow icon={<LinkIcon size={14} aria-hidden="true" />} label="Mechanism" wide="Symlink" />
                <ListCardRow
                  icon={<Square2StackIcon size={14} aria-hidden="true" />}
                  label="Copies"
                  value="3"
                  trailing={
                    <Tooltip label="Sample row action" placement="bottom">
                      <button
                        type="button"
                        aria-label="Sample row action"
                        className="ml-auto w-[21px] h-[21px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
                      >
                        <CodeBracketIcon size={13} aria-hidden="true" />
                      </button>
                    </Tooltip>
                  }
                />
              </ListCard>
            </div>
          </Specimen>

          <Specimen name="ReachCard" file="ReachCard.tsx" note="the inspector's Reach section; press a plate, or arrow across them">
            <div className="max-w-[384px]">
              <ReachCard reach={SAMPLE_REACH} />
            </div>
          </Specimen>

          <Specimen name="OriginValue" file="OriginValue.tsx" note="in a row's wide slot, as the Identity card feeds it; a link out when the origin carries a URL, muted when Hanger could not check">
            {/* The muted form carries no size of its own; the row's slot
                sets it, so the value is shown where it lives. */}
            <div className="max-w-[384px]">
              <ListCard>
                <ListCardRow label="Origin" wide={<OriginValue origin={SAMPLE_ORIGIN} variant="identity" />} />
                <ListCardRow label="Origin" wide={<OriginValue origin={SAMPLE_ORIGIN_BLOCKED} variant="identity" />} />
              </ListCard>
            </div>
          </Specimen>

          <Specimen name="ScanStamp" file="ScanStamp.tsx" note="an age that re-reads every 30 s; null reads as not scanned">
            <div className="flex items-center gap-6">
              <ScanStamp scannedAt={scannedAt} className="font-flex text-micro text-ink-3" />
              <ScanStamp scannedAt={null} className="font-flex text-micro text-ink-3" />
            </div>
          </Specimen>

          <Specimen name="CollapsibleGroup" file="CollapsibleGroup.tsx" note="a folding group on Global's list, after T3's shelf head: the label, a 1px rule, the figure where there is one, and a chevron that points down while open; the whole head is the button. Sample rows">
            <div className="max-w-[534px]">
              <CollapsibleGroup id="sample-collapsible-group" label="Sample group" figure={2}>
                <ListRow kind="skill" name="sample-one" detail="Sample detail" reach={null} selected={false} onSelect={() => {}} />
                <ListRow kind="rule" name="sample-two" detail="Sample detail" reach={null} selected={false} onSelect={() => {}} />
              </CollapsibleGroup>
            </div>
          </Specimen>

          <Specimen name="NotLoadedGroup" file="NotLoadedGroup.tsx" note="Not loaded by ‹engine›, at the end of Global's list: folded until asked, no figure, each row with ReachCard's reason; a row opens the inspector">
            <div className="max-w-[534px] border border-line rounded-plane pb-1.5">
              <NotLoadedGroup engineName={SAMPLE_ENGINES[1].engine_name} rows={SAMPLE_NOT_LOADED} defaultOpen />
            </div>
          </Specimen>

          <Specimen name="KeptSkillsGroup" file="KeptSkillsGroup.tsx" note="Switched off, after the Skills group on Global, or just before Not loaded by when a picked engine shows no Skills rows: the backend's count in the head, no figure when an engine is picked, each row the skill's name and that it is off for every engine; a row opens the kept skill in the inspector. Sample skills; the rows do nothing">
            <div className="max-w-[534px] border border-line rounded-plane pb-1.5">
              <KeptSkillsGroup kept={SAMPLE_KEPT_SKILLS} showFigure selectedKey={SAMPLE_KEPT_SKILLS_SELECTED} />
            </div>
          </Specimen>

          <Specimen name="GroupTicks" file="GroupTicks.tsx" note="in the left margin of Global's lane, 24 × 2 at T3's size, one tick per group on screen and none for a single group: the darker tick is the group in view; hover one for the header's own words, click it to bring that header to the top. Sample groups">
            <GroupTicksSpecimen />
          </Specimen>

          <Specimen name="KeptSkillDetail" file="KeptSkillDetail.tsx" note="a kept skill's inspector body, under the header that holds its one switch: off for every engine, when it was switched off and what Hanger did with it; the second also says a skill of its name is back in the store and that the switch-off did not finish">
            <div className="max-w-[384px] flex flex-col gap-3">
              {SAMPLE_KEPT_SKILL_DETAILS.map((skill) => (
                <div key={skill.key} className="border border-line rounded-plane flex">
                  <KeptSkillDetail skill={skill} />
                </div>
              ))}
            </div>
          </Specimen>

          <Specimen name="HeroBand" file="HeroBand.tsx" note="the hero's foldable band, by engine on a project pane, in assets; press the row to fold it">
            <div className="max-w-[384px] p-3 border border-line rounded-inner">
              <HeroBand
                label="By engine"
                open={heroOpen}
                onToggle={() => setHeroOpen((v) => !v)}
                rows={SAMPLE_ENGINE_BAND_ROWS}
              />
            </div>
          </Specimen>

          <Specimen name="SearchPalette" file="SearchPalette.tsx" note="⌘K's panel without its wash; the rows are fixtures in the backend's order and the mark is the matched run — type, and nothing filters, because the backend ranks" unclipped>
            <SearchPaletteSpecimen />
          </Specimen>

          <Specimen name="AllEnginesSwitch" file="AllEnginesSwitch.tsx" note="the MCP server inspector's header with its switch for every engine: On, On in some, Off. The button is named for what it does, carries aria-pressed (mixed for On in some) and is disabled while its group runs; the switches here are samples and do nothing">
            <AllEnginesSwitchSpecimen />
          </Specimen>

          <Specimen name="HeaderSwitch" file="HeaderSwitch.tsx" note="the switch at the end of an inspector header, here a store skill's: On, Off, and pending while its request runs. AllEnginesSwitch above is the same switch with an MCP server's words. The button is named for what a click does and carries aria-pressed; the switches here are samples and do nothing">
            <HeaderSwitchSpecimen />
          </Specimen>

          <Specimen name="SwitchNotice" file="SwitchNotice.tsx" note="the pill without its fixed band and status region; a switch with its Undo, and a failure. It stays until dismissed or replaced, because it carries Undo — the buttons here are samples and do nothing">
            <div className="flex flex-col items-start gap-3">
              {SAMPLE_SWITCH_NOTICES.map((notice) => (
                <SwitchNoticePill
                  key={notice.line}
                  notice={notice}
                  onUndo={() => {}}
                  onDismiss={() => {}}
                  undoLabel="Sample undo"
                  dismissLabel="Sample dismiss"
                />
              ))}
            </div>
          </Specimen>
        </Section>
      </div>

      <div className="h-8 shrink-0 flex items-center px-[18px] gap-3.5 font-flex text-micro text-ink-3">
        <span>Dev builds only · every figure on this page is sample data</span>
      </div>
    </div>
  );
}
