/**
 * Sample data for the Design system page — and only for it.
 *
 * Nothing here is read from the machine. Every figure is a literal chosen to
 * make a component show its shape (a mixed strip, a full reach row, a broken
 * glyph), and the page marks each rendering "sample" so a 142 on that screen
 * is never mistaken for the store. Do not import from anywhere else.
 */
import type { AssetItem, AssetAnnotationView } from "../components/AssetRow";
import type { EngineReachInfo } from "../components/EngineReachTiles";
import type { StateCounts } from "../utils/linkStateCounts";
import type { ScanStatus } from "../hooks/useScanStatus";
import type { AssetFindings, ReviewIssue } from "../utils/reviewIssues";
import { originRow, type OriginRowView } from "../utils/assetProvenance";
import type { McpEngineSummaryData } from "../components/McpEngineSummary";
import type { TrackSegment } from "../components/SegmentedTrack";
import type { UnderlineTab } from "../components/UnderlineTabs";

/** The page's sections, in reading order — mirrors .claude/DESIGN.md. The
 *  sidebar lists these; the pane anchors each under `ds-<id>`. */
export const DESIGN_SECTIONS = [
  { id: "colour", label: "Colour" },
  { id: "type", label: "Typography" },
  { id: "geometry", label: "Geometry" },
  { id: "motion", label: "Motion" },
  { id: "iconography", label: "Iconography" },
  { id: "controls", label: "Controls" },
  { id: "components", label: "Components" },
] as const;

export type DesignSectionId = (typeof DESIGN_SECTIONS)[number]["id"];

export const SAMPLE_COUNTS: StateCounts = {
  linked: 105,
  drifted: 6,
  broken: 2,
  local: 29,
  total: 142,
};

export const SAMPLE_REVIEW = { broken: 2, drifted: 6, duplicate: 11, parse: 3 };

/** Engine keys the brand sprite knows; the tiles pick their marks by key. */
export const SAMPLE_REACH: EngineReachInfo[] = [
  { engine_id: 1, engine_key: "claude", engine_name: "Claude Code", reached: true, via_root: "~/.claude/skills", via_store: "~/.agents/skills" },
  { engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: true, via_root: "~/.codex/skills", via_store: "~/.agents/skills" },
  { engine_id: 3, engine_key: "gemini", engine_name: "Gemini CLI", reached: false, reason: "root_not_linked" },
  { engine_id: 4, engine_key: "claude_desktop", engine_name: "Claude Desktop", reached: false, reason: "format" },
  { engine_id: 5, engine_key: "vscode", engine_name: "VS Code", reached: false, reason: "root_not_linked" },
];

export const SAMPLE_ANNOTATION: AssetAnnotationView = {
  asset_path: "/sample/skills/writing-great-skills/SKILL.md",
  mechanism: "symlink",
  reach: SAMPLE_REACH,
  beyond: { kind: "projects", count: 2, places: ["metrics-board", "mei-recipes"] },
};

export const SAMPLE_ASSET: AssetItem = {
  id: "sample-1",
  name: "writing-great-skills",
  category: "Skills",
  path: "/sample/skills/writing-great-skills/SKILL.md",
  engine: "claude",
  version: "1.2.0",
  isSymlink: true,
  linkState: "linked",
};

export const SAMPLE_ASSET_DRIFTED: AssetItem = {
  id: "sample-2",
  name: "security-reviewer",
  category: "Subagents",
  path: "/sample/agents/security-reviewer.md",
  engine: "codex",
  drifted: true,
  linkState: "drifted",
};

export const SAMPLE_ASSET_BROKEN: AssetItem = {
  id: "sample-3",
  name: "AGENTS.md",
  category: "Rules",
  path: "/sample/AGENTS.md",
  engine: "gemini",
  parseStatus: "failed",
  parseError: "front matter invalid",
};

export const SAMPLE_SCAN_STATUS: ScanStatus = {
  phase: "scanning",
  activeRootLabel: "metrics-board",
  queued: 2,
};

/** Category chip counts — a mixed set so the empty-chip rule (zero hides) shows. */
export const SAMPLE_CATEGORY_COUNTS = {
  allCount: 142,
  skillsCount: 105,
  toolsCount: 23,
  rulesCount: 2,
  subagentsCount: 12,
};

/** One finding against the sample skill, so the inspector cap's chip reads
 *  `1 flagged`. Shaped the way `deriveReviewIssues` builds a fault issue. */
export const SAMPLE_REVIEW_ISSUE: ReviewIssue = {
  id: "Skills:drifted:/sample/skills/writing-great-skills/SKILL.md",
  name: "writing-great-skills",
  category: "Skills",
  kind: "drifted",
  problem: "Copy diverged",
  path: "/sample/skills/writing-great-skills/SKILL.md",
  sourcePath: "/sample/store/skills/writing-great-skills/SKILL.md",
  whereLabel: "Global",
  whereKeys: ["global"],
  crossRepo: false,
};

export const SAMPLE_FINDINGS: AssetFindings = {
  issues: [SAMPLE_REVIEW_ISSUE],
  count: 1,
  severity: "warning",
};

/** Two lines for the standalone chip, so its popover draws a divider. */
export const SAMPLE_FINDING_LINES = ["Copy diverged", "3 copies, no shared source"];

export const SAMPLE_SEGMENTS: TrackSegment[] = [
  { id: "all", label: "All", count: 142 },
  { id: "skills", label: "Skills", count: 105 },
  { id: "tools", label: "MCP servers", count: 23 },
];

export const SAMPLE_TABS: UnderlineTab[] = [
  { id: "document", label: "Document" },
  { id: "tools", label: "Tools", count: 7 },
  { id: "registrations", label: "Registrations" },
];

/** Built by the producer, not typed by hand, so the ruled tooltip strings
 *  live in one place. A sample host, so the link never opens anything real. */
export const SAMPLE_ORIGIN: OriginRowView = originRow(
  { kind: "checked_out", label: "example.com/sample-skills", url: "https://example.com/sample-skills" },
  false,
)!;

export const SAMPLE_ORIGIN_BLOCKED: OriginRowView = originRow(null, true)!;

/** A partial picture on purpose: one row not yet asked, and every bucket of
 *  the note beneath the rows non-zero so each sentence renders. */
export const SAMPLE_MCP_ENGINE_SUMMARY: McpEngineSummaryData = {
  rows: [
    { engine_id: "claude", engine_name: "Claude Code", server_count: 6, tools_known: 41 },
    { engine_id: "codex", engine_name: "Codex", server_count: 2, tools_known: 9 },
    { engine_id: "claude_desktop", engine_name: "Claude Desktop", server_count: 3, tools_known: null },
  ],
  total_server_count: 9,
  answered_server_count: 5,
  unasked_server_count: 3,
  unaskable_server_count: 1,
  conflicting_server_count: 1,
};
