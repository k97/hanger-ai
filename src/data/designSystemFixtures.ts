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

/** The page's sections, in reading order — mirrors .claude/DESIGN.md. The
 *  sidebar lists these; the pane anchors each under `ds-<id>`. */
export const DESIGN_SECTIONS = [
  { id: "colour", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "geometry", label: "Geometry" },
  { id: "motion", label: "Motion" },
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
