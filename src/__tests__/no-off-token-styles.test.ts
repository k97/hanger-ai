import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

export type AllowlistCategory = "radius" | "shadow" | "fontsize" | "fontweight" | "retiredtoken" | "unclassified";

export interface AllowlistEntry {
  file: string;
  linePattern: RegExp;
  category: AllowlistCategory;
  reason: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const ALLOWLIST_RAW = [
  // Deliberate sub-scale exception: the rail's count badge is 16px tall at
  // the icon corner with a 2px plane ring, and uses the prototype's 9px
  // numeral (docs/v3/hanger-mono-tight.html .ir-count).
  { file: "src/components/IconRail.tsx", lineText: "<span aria-hidden=\"true\" className=\"absolute -top-[3px] -right-1 min-w-4 h-4 px-1 rounded-pill bg-fill text-on-fill text-[9px] leading-4 font-flex tabular ring-2 ring-plane\">", category: "fontsize" as AllowlistCategory, reason: "Icon-rail count badge, prototype 9px numeral inside a 16px pill" },


























































































































  // Surfaced when the arbitrary-value rules above were repaired. These
  // lines predate the repair and were never detectable; they are recorded
  // as legacy so the rules start catching NEW off-token values.
];

const ALLOWLIST: AllowlistEntry[] = ALLOWLIST_RAW.map((e) => ({
  file: e.file,
  linePattern: new RegExp(escapeRegExp(e.lineText)),
  category: e.category,
  reason: e.reason,
}));

function getAllSrcTsxFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") {
        files.push(...getAllSrcTsxFiles(fullPath));
      }
    } else if (
      entry.name.endsWith(".tsx") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const tokensCssPath = path.resolve(__dirname, "../styles/tokens.css");
const indexCssPath = path.resolve(__dirname, "../styles/index.css");

const tokensCss = fs.readFileSync(tokensCssPath, "utf-8");
const indexCss = fs.readFileSync(indexCssPath, "utf-8");

const cssVarMap: Record<string, string> = {};
const varRegex = /--([\w\-]+):\s*([^;]+);/g;
let cssMatch: RegExpExecArray | null;
while ((cssMatch = varRegex.exec(tokensCss + "\n" + indexCss)) !== null) {
  cssVarMap[cssMatch[1]] = cssMatch[2].trim();
}

function resolveCssVar(val: string): string {
  let resolved = val;
  let depth = 0;
  while (resolved.includes("var(") && depth < 5) {
    depth++;
    resolved = resolved.replace(/var\(--([\w\-]+)\)/g, (_, varName) => {
      return cssVarMap[varName] || _;
    });
  }
  return resolved;
}

const DEFAULT_TAILWIND_SIZES: Record<string, string> = {
  xs: "12px",
  sm: "14px",
  base: "16px",
  lg: "18px",
  xl: "20px",
  "2xl": "24px",
  "3xl": "30px",
};

function resolveFontSize(suffix: string): number | null {
  let valStr: string | undefined;
  if (cssVarMap[`text-${suffix}`]) {
    valStr = resolveCssVar(cssVarMap[`text-${suffix}`]);
  } else if (cssVarMap[suffix]) {
    valStr = resolveCssVar(cssVarMap[suffix]);
  } else if (cssVarMap[`fs-${suffix}`]) {
    valStr = resolveCssVar(cssVarMap[`fs-${suffix}`]);
  } else if (DEFAULT_TAILWIND_SIZES[suffix]) {
    valStr = DEFAULT_TAILWIND_SIZES[suffix];
  }

  if (valStr) {
    const pxMatch = /(\d+)\s*px/.exec(valStr);
    if (pxMatch) {
      return parseInt(pxMatch[1], 10);
    }
  }
  return null;
}

const RULED_FONT_SIZES = new Set([
  resolveFontSize("micro") || 11,
  resolveFontSize("small") || 12,
  resolveFontSize("base-app") || 13,
  resolveFontSize("lg-app") || 16,
  resolveFontSize("display") || 32,
]);
const RULED_RADII = new Set(["0", "0px", "6px", "12px", "16px", "9999px", "9999", "100%", "full"]);

const NON_FONT_SIZE_TEXT_SUFFIXES = new Set([
  "center", "left", "right", "justify", "start", "end", "wrap", "nowrap", "balance", "pretty", "ellipsis", "clip",
  "ink-1", "ink-2", "ink-3", "ink-mute", "surface-elevated", "hairline", "scrim", "accent", "on-accent", "on-primary",
  "brand-lime", "brand-pink", "brand-violet", "brand-violet-deep",
  "warning-bg", "warning-border", "warning-text", "warning-text-on-tint",
  "error-bg", "error-border", "error-text", "danger-text", "danger-text-on-tint",
  "success-bg", "success-border", "success-text", "success-text-on-tint",
  "info-text", "text-primary", "text-secondary", "text-muted", "white", "muted",
  "tint-ink", "state-success", "state-warning", "state-danger", "on-fill", "fill"
]);

const OFF_SPEC_PATTERNS = [
  /\brounded(-(sm|md|lg|xl|2xl|3xl|full)|(?=[\s"']|$))\b/,
  /\b(shadow|shadow-sm|shadow-md|shadow-lg|shadow-xl|shadow-2xl|shadow-inner|shadow-none|shadow-\[[^\]]+\]|drop-shadow(-[a-z0-9_\[\]]+)?)\b/,
  /\bfont-(semibold|bold|black|thin|extralight|light|extrabold|\[\d+\])\b/,
  /* The mono redesign made the ink ladder canonical; only truly dead
     Cockpit-era names stay retired. */
  /\b(ink-mute|surface-elevated|surface-press|hairline)\b/,
  /\b(bg|text|border|ring|divide|fill|stroke)-(red|blue|green|yellow|purple|amber|pink|indigo|gray|slate|zinc|neutral|stone|orange|lime|emerald|teal|cyan|sky|violet|fuchsia|rose)-\d{2,3}(\/\d{1,3})?\b/,
];

function isOffTokenStyleLine(line: string): boolean {
  if (OFF_SPEC_PATTERNS.some((pattern) => pattern.test(line))) {
    return true;
  }

  const roundedArbRegex = /\brounded-\[([^\]]+)\]/g;
  let rMatch: RegExpExecArray | null;
  while ((rMatch = roundedArbRegex.exec(line)) !== null) {
    const rVal = rMatch[1].trim();
    if (!RULED_RADII.has(rVal)) {
      return true;
    }
  }

  const textArbRegex = /\btext-\[([^\]]+)\]/g;
  let tArbMatch: RegExpExecArray | null;
  while ((tArbMatch = textArbRegex.exec(line)) !== null) {
    const arbVal = tArbMatch[1].trim();
    if (/^\d+(px|rem|em|pt)$/.test(arbVal) || /^\d+$/.test(arbVal)) {
      return true;
    }
  }

  const textUtilRegex = /\btext-([\w\-]+)\b/g;
  let tUtilMatch: RegExpExecArray | null;
  while ((tUtilMatch = textUtilRegex.exec(line)) !== null) {
    const suf = tUtilMatch[1];
    if (suf.startsWith("[") || NON_FONT_SIZE_TEXT_SUFFIXES.has(suf)) {
      continue;
    }
    const resolvedPx = resolveFontSize(suf);
    if (resolvedPx !== null && !RULED_FONT_SIZES.has(resolvedPx)) {
      return true;
    }
  }

  return false;
}


describe("No Off-Token Styling Enforcement", () => {
  it("verifies that all off-token styling in src/ matches the allowlist and no stale allowlist entries exist", () => {
    const srcDir = path.resolve(__dirname, "..");
    const files = getAllSrcTsxFiles(srcDir);
    const rootDir = path.resolve(__dirname, "../..");

    const actualMatches: Array<{ file: string; line: string; lineNumber: number }> = [];

    for (const file of files) {
      const relPath = path.relative(rootDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        if (isOffTokenStyleLine(line)) {
          actualMatches.push({
            file: relPath,
            line: line.trim(),
            lineNumber: idx + 1,
          });
        }
      });
    }

    console.log(`[ALLOWLIST RAW ENTRIES]: ${ALLOWLIST.length}`);
    console.log(`[DETECTOR MATCH SITES]: ${actualMatches.length}`);

    const matchedAllowlistIndices = new Set<number>();

    for (const match of actualMatches) {
      const allowlistIdx = ALLOWLIST.findIndex(
        (entry, idx) => !matchedAllowlistIndices.has(idx) && entry.file === match.file && entry.linePattern.test(match.line)
      );

      if (allowlistIdx === -1) {
        throw new Error(
          `Forbidden off-token styling detected at ${match.file}:${match.lineNumber}:\n  "${match.line}"\nThis violates Cockpit design system. Use standard design tokens from tokens.css.`
        );
      } else {
        matchedAllowlistIndices.add(allowlistIdx);
      }
    }

    expect(actualMatches.length).toBeGreaterThan(0);

    ALLOWLIST.forEach((entry, idx) => {
      if (!matchedAllowlistIndices.has(idx)) {
        throw new Error(
          `Stale allowlist entry found at index ${idx} for ${entry.file} (${entry.linePattern}). Remove this entry from the ALLOWLIST.`
        );
      }
    });
  });
});
