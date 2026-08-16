/**
 * The brand-mark map: every identifier the UI can hold for an engine or MCP
 * host, resolved to one of eleven marks. Design record:
 * docs/superpowers/specs/2026-08-15-brand-icons-design.md §4–§5.
 *
 * Marks are build-time strings (Vite `?raw`), bundled into the binary; nothing
 * is fetched at runtime. Labels are NOT here — they stay backend-owned.
 */
import claudeCodeSvg from "@lobehub/icons-static-svg/icons/claudecode-color.svg?raw";
import codexSvg from "@lobehub/icons-static-svg/icons/codex-color.svg?raw";
import codexMonoSvg from "@lobehub/icons-static-svg/icons/codex.svg?raw";
import geminiSvg from "@lobehub/icons-static-svg/icons/gemini-color.svg?raw";
import claudeSvg from "@lobehub/icons-static-svg/icons/claude-color.svg?raw";
import cursorSvg from "@lobehub/icons-static-svg/icons/cursor.svg?raw";
import windsurfSvg from "@lobehub/icons-static-svg/icons/windsurf.svg?raw";
import copilotSvg from "@lobehub/icons-static-svg/icons/githubcopilot.svg?raw";
import opencodeSvg from "@lobehub/icons-static-svg/icons/opencode.svg?raw";
import vscodeSvg from "../assets/brand/vscode.svg?raw";
import zedSvg from "../assets/brand/zed.svg?raw";
import genericSvg from "../assets/brand/generic.svg?raw";

export type BrandId =
  | "claude_code"
  | "codex"
  | "gemini"
  | "claude_desktop"
  | "claude_ai"
  | "vscode"
  | "cursor"
  | "windsurf"
  | "zed"
  | "copilot"
  | "opencode";

export interface BrandMark {
  /** Raw file contents. */
  svg: string;
  /** The mark to use on a dark page, when the light one does not survive it.
   *  Only Codex needs this: its colour file paints a white plate that glares
   *  on --page dark. Absent means the one mark serves both themes. */
  darkSvg?: string;
  /** true = the vendor's currentColor form (follows --ink); false = fixed brand colour. */
  ink: boolean;
  source: "lobe" | "vendored";
}

export const BRANDS: Record<BrandId, BrandMark> = {
  claude_code: { svg: claudeCodeSvg, ink: false, source: "lobe" },
  // The colour file paints a white 24x24 plate behind the blob. Invisible on
  // --page light, a glaring square on --page dark, so the dark page gets the
  // vendor's own monochrome mark (ruling 2026-08-16).
  codex: { svg: codexSvg, darkSvg: codexMonoSvg, ink: false, source: "lobe" },
  // The sparkle, not the CLI tile: the tile is illegible at 12px and the
  // label already says "Gemini / Antigravity" (ruling 2026-08-15).
  gemini: { svg: geminiSvg, ink: false, source: "lobe" },
  claude_desktop: { svg: claudeSvg, ink: false, source: "lobe" },
  claude_ai: { svg: claudeSvg, ink: false, source: "lobe" },
  vscode: { svg: vscodeSvg, ink: false, source: "vendored" },
  cursor: { svg: cursorSvg, ink: true, source: "lobe" },
  windsurf: { svg: windsurfSvg, ink: true, source: "lobe" },
  // currentColor sits on this file's <path>, not its <svg> — still ink.
  zed: { svg: zedSvg, ink: true, source: "vendored" },
  copilot: { svg: copilotSvg, ink: true, source: "lobe" },
  opencode: { svg: opencodeSvg, ink: true, source: "lobe" },
};

export const BRAND_IDS = Object.keys(BRANDS) as readonly BrandId[];

/** Anything unmapped draws this. Not a brand; never in BRANDS. */
export const GENERIC_MARK: BrandMark = { svg: genericSvg, ink: true, source: "vendored" };

/** Lowercase, letters and digits only: "Gemini / Antigravity" -> "geminiantigravity". */
export function normaliseBrandKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* Keyed by normalised form. Engine keys and host ids are canonical; the
   display-name entries exist because assetCounts.engines and detectedEngines
   carry names, not keys (spec §5). Each entry is pinned by brands.test.ts. */
const ALIASES: Record<string, BrandId> = {
  claudecode: "claude_code",
  claude: "claude_code",
  codex: "codex",
  openaicodex: "codex",
  gemini: "gemini",
  geminicli: "gemini",
  geminiantigravity: "gemini",
  antigravity: "gemini",
  claudedesktop: "claude_desktop",
  claudeai: "claude_ai",
  vscode: "vscode",
  visualstudiocode: "vscode",
  cursor: "cursor",
  windsurf: "windsurf",
  zed: "zed",
  zededitor: "zed",
  copilot: "copilot",
  githubcopilot: "copilot",
  opencode: "opencode",
};

/** The brand for any identifier the UI holds, or undefined (unmapped or any-agent). */
export function resolveBrand(key: string | null | undefined): BrandId | undefined {
  if (key === null || key === undefined) return undefined;
  const normalised = normaliseBrandKey(key);
  if (normalised === "") return undefined;
  return ALIASES[normalised];
}
