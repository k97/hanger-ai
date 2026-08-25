import { useEffect, useState, type ReactNode } from "react";
import GelMeter from "./GelMeter";
import MechanismGlyph, { type MechanismWord } from "./MechanismGlyph";
import EngineReachTiles from "./EngineReachTiles";
import EngineLabel from "./EngineLabel";
import BrandIcon from "./BrandIcon";
import CategoryFilterCards, { type CategoryType } from "./CategoryFilterCards";
import DisclosureBanner from "./DisclosureBanner";
import Tooltip from "./Tooltip";
import AssetHeaderRow, { type SortField, type SortDirection } from "./AssetHeaderRow";
import AssetRow from "./AssetRow";
import SummaryStrip from "./SummaryStrip";
import { ScanStatusIndicator } from "./ScanStatusIndicator";
import HangerMark from "./HangerMark";
import {
  Disc3Icon,
  FolderClockIcon,
  MagnifyingGlassIcon,
  PanelRightIcon,
  RotateCcwIcon,
  SearchIcon,
} from "./icons";
import EmptyState from "./EmptyState";
import type { StateFilter } from "../utils/linkStateCounts";
import {
  type DesignSectionId,
  SAMPLE_ANNOTATION,
  SAMPLE_ASSET,
  SAMPLE_ASSET_BROKEN,
  SAMPLE_ASSET_DRIFTED,
  SAMPLE_CATEGORY_COUNTS,
  SAMPLE_COUNTS,
  SAMPLE_REACH,
  SAMPLE_REVIEW,
  SAMPLE_SCAN_STATUS,
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
 *  renderings so a figure on this page is never read as the machine. */
function Specimen({
  name,
  file,
  note,
  sample = true,
  children,
}: {
  name: string;
  file: string;
  note?: string;
  sample?: boolean;
  children: ReactNode;
}) {
  return (
    <figure>
      <div className="border border-line rounded-plane p-4 overflow-x-auto">{children}</div>
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

/* ── The page ───────────────────────────────────────────────────────────── */

const MECHANISMS: MechanismWord[] = ["symlink", "copy", "drift", "broken", "none"];

const TYPE_ROWS: { utility: string; px: string; sample: ReactNode }[] = [
  { utility: "text-display", px: "32px", sample: <span className="text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1">142</span> },
  { utility: "text-lg-app", px: "16px", sample: <span className="text-lg-app text-ink-2">assets in the global store · 6 engines</span> },
  { utility: "text-base-app", px: "13px", sample: <span className="text-base-app font-medium text-ink-1">writing-great-skills</span> },
  { utility: "text-small", px: "12px", sample: <span className="text-small text-ink-2">Symlink — edits to the source reach every destination</span> },
  { utility: "text-micro · font-flex", px: "11px", sample: <span className={eyebrowClass}>Scanned 4 min ago</span> },
  { utility: "font-mono text-micro", px: "11px", sample: <span className="font-mono text-micro text-ink-3">~/.agents/skills/writing-great-skills/SKILL.md</span> },
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
  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [replay, setReplay] = useState(0);
  const [selectedRow, setSelectedRow] = useState<string | null>(SAMPLE_ASSET.id ?? null);

  const handleSort = (field: SortField) => {
    if (field === sortField) setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const scannedAt = new Date(Date.now() - 4 * 60_000);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-page font-sans">
      <header className="px-[18px] pt-5 pb-1 shrink-0">
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
          id="type"
          label="Type"
          lede="One system stack, five sizes, two weights. Figures that change wear the tabular utility so they never jitter; the utility voice is font-flex, micro, uppercase and tracked."
        >
          <div className="border border-line rounded-plane px-4">
            {TYPE_ROWS.map((row) => (
              <div
                key={row.utility}
                className="grid grid-cols-[190px_1fr] items-baseline gap-4 py-3 border-b border-line last:border-b-0"
              >
                <span className="font-mono text-micro text-ink-3">
                  {row.utility} <span className="font-sans">· {row.px}</span>
                </span>
                <span className="min-w-0 truncate">{row.sample}</span>
              </div>
            ))}
            <div className="grid grid-cols-[190px_1fr] items-baseline gap-4 py-3">
              <span className="font-mono text-micro text-ink-3">
                font-medium <span className="font-sans">· the only other weight</span>
              </span>
              <span className="text-base-app text-ink-1">
                Regular 400 beside <b className="font-medium">medium 500</b> — nothing heavier exists.
              </span>
            </div>
          </div>
        </Section>

        <Section
          id="geometry"
          label="Geometry"
          lede="Three radii for surfaces, one soft radius for the rail's buttons, pills for every control. Spacing rides Tailwind's 4px grid; anything off it is stated at the call site as an arbitrary value, and the 18px gutter is a token."
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

          <Specimen name="Cap button and field" file="App.tsx" note="the content cap's toolbar controls">
            <div className="flex items-center gap-2.5">
              <div className="relative w-[214px] h-[27px]">
                <MagnifyingGlassIcon
                  size={12}
                  className="absolute left-2.5 top-2 text-ink-3 pointer-events-none"
                />
                <input
                  aria-label="Sample search field"
                  placeholder="Search 142 assets"
                  className="w-full h-full rounded-pill border border-transparent bg-plane pl-[30px] pr-3.5 text-small text-ink-1 placeholder:text-ink-3 focus:outline-none focus:border-ink-1 focus:bg-page transition-colors duration-hover ease-spring"
                />
              </div>
              {/* Sample controls never borrow a real control's accessible
                  name — a reader would hear a toggle that toggles nothing. */}
              <Tooltip label="Sample cap button" placement="bottom">
                <button aria-label="Sample cap button" className={capButtonClass}>
                  <PanelRightIcon size={15} aria-hidden="true" />
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
        </Section>

        <Section
          id="components"
          label="Components"
          lede="Imported, not imitated. Each specimen is the component the panes render, fed sample props; captions name the file."
        >
          <Specimen name="SummaryStrip" file="SummaryStrip.tsx" note="the strip with its GelMeter; legend toggles filter">
            <SummaryStrip
              total={SAMPLE_COUNTS.total}
              subtitle="assets in the global store · 6 engines"
              scannedAt={scannedAt}
              scanning={false}
              counts={SAMPLE_COUNTS}
              activeStateFilter={stateFilter}
              onFilterState={setStateFilter}
              onRescan={() => {}}
            />
          </Specimen>

          <Specimen name="GelMeter" file="GelMeter.tsx" note="aqua marks the linked share only; the review split stays glass">
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

          <Specimen name="AssetHeaderRow · AssetRow" file="AssetHeaderRow.tsx · AssetRow.tsx" note="legacy columns; sort the header, select a row">
            <div className="flex flex-col">
              <AssetHeaderRow
                sortField={sortField}
                sortDirection={sortDirection}
                showKindColumn
                onSort={handleSort}
              />
              {[SAMPLE_ASSET, SAMPLE_ASSET_DRIFTED, SAMPLE_ASSET_BROKEN].map((item) => (
                <AssetRow
                  key={item.id}
                  item={item}
                  showKindColumn
                  isSelected={selectedRow === item.id}
                  onClick={() => setSelectedRow(item.id ?? null)}
                />
              ))}
            </div>
          </Specimen>

          <Specimen name="AssetRow with annotation" file="AssetRow.tsx" note="the Global pane's Reach and Beyond the store columns">
            <div className="flex flex-col">
              <AssetHeaderRow
                sortField={sortField}
                sortDirection={sortDirection}
                showKindColumn
                showReachColumns
                onSort={handleSort}
              />
              <AssetRow item={SAMPLE_ASSET} showKindColumn annotation={SAMPLE_ANNOTATION} />
              <AssetRow item={SAMPLE_ASSET_DRIFTED} showKindColumn annotation={null} />
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
        </Section>
      </div>

      <div className="h-8 shrink-0 flex items-center px-[18px] gap-3.5 font-flex text-micro text-ink-3">
        <span>Dev builds only · every figure on this page is sample data</span>
      </div>
    </div>
  );
}
