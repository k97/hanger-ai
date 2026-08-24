import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// WCAG 2.1 Relative Luminance calculation
function getLuminance(hex: string): number {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const calChannel = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);

  return 0.2126 * calChannel(r) + 0.7152 * calChannel(g) + 0.0722 * calChannel(b);
}

// WCAG 2.1 Contrast Ratio calculation
function getContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = getLuminance(fgHex);
  const l2 = getLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Cockpit Derived Token Contrast Check", () => {
  const tokensPath = path.resolve(__dirname, "../styles/tokens.css");
  const tokensCss = fs.readFileSync(tokensPath, "utf-8");

  // Extract neutral stops
  const neutralRamp: Record<string, string> = {};
  const rampMatches = tokensCss.matchAll(/--(n-\d+):\s*(#[0-9a-fA-F]{6})/g);
  for (const m of rampMatches) {
    neutralRamp[m[1]] = m[2];
  }

  const parts = tokensCss.split(".dark");
  const lightSection = parts[0];
  const darkSection = parts[1] || "";

  const staticColors: Record<string, string> = {
    white: "#ffffff",
    black: "#000000",
  };

  const resolveTokenToHex = (
    token: string,
    isDark: boolean
  ): { hex: string | null; isExplicitDark: boolean } => {
    if (!token) return { hex: null, isExplicitDark: false };
    if (staticColors[token]) return { hex: staticColors[token], isExplicitDark: isDark };

    const section = isDark ? darkSection : lightSection;
    const escaped = token.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const propRegex = new RegExp(`--${escaped}:\\s*([^;]+);`);
    let m = section.match(propRegex);
    let isExplicitDark = isDark && !!m;

    if (!m && isDark) {
      m = lightSection.match(propRegex);
    }

    if (m) {
      const val = m[1].trim();
      const varMatch = val.match(/var\(--([^)]+)\)/);
      if (varMatch) {
        const refVar = varMatch[1];
        if (neutralRamp[refVar]) {
          const hasDarkRedef = isDark && darkSection.includes(`--${refVar}:`);
          return { hex: neutralRamp[refVar], isExplicitDark: isExplicitDark || hasDarkRedef };
        }
        const res = resolveTokenToHex(refVar, isDark);
        return { hex: res.hex, isExplicitDark: isExplicitDark || res.isExplicitDark };
      }
      if (val.startsWith("#")) {
        return { hex: val, isExplicitDark };
      }
    }

    if (neutralRamp[token]) {
      const hasDarkRedef = isDark && darkSection.includes(`--${token}:`);
      return { hex: neutralRamp[token], isExplicitDark: hasDarkRedef };
    }

    return { hex: null, isExplicitDark: false };
  };

  it("extracts all background/foreground pairs from components and verifies WCAG 4.5:1 contrast", () => {
    const srcDir = path.resolve(__dirname, "../");
    const nonColorTextClasses = new Set([
      "xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl", "5xl",
      "left", "center", "right", "justify", "uppercase", "lowercase",
      "capitalize", "wrap", "nowrap", "truncate", "clip", "ellipsis",
      "micro", "fs-micro",
      "small", "base-app", "lg-app", "display", "row", "ui", "title"
    ]);

    const findTsxFiles = (dir: string): string[] => {
      let results: string[] = [];
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          if (file !== "__tests__" && file !== "node_modules") {
            results = results.concat(findTsxFiles(fullPath));
          }
        } else if (file.endsWith(".tsx") && !file.endsWith(".test.tsx")) {
          results.push(fullPath);
        }
      }
      return results;
    };

    const files = findTsxFiles(srcDir);
    const failures: string[] = [];

    const bgClassPattern = /\b(dark:)?bg-([a-zA-Z0-9_\-\[\]#]+)\b/g;
    const textClassPattern = /\b(dark:)?text-([a-zA-Z0-9_\-\[\]#]+)\b/g;

    for (const filePath of files) {
      const relPath = path.relative(srcDir, filePath);
      const content = fs.readFileSync(filePath, "utf-8");

      const classnameMatches = content.matchAll(/className=(?:{`([^`]+)`}|"([^"]+)"|{([^{}]+)})/g);

      for (const cm of classnameMatches) {
        const expr = cm[1] || cm[2] || cm[3] || "";
        const branches = expr.includes("?") && expr.includes(":") ? expr.split(/\?|\:/) : [expr];

        for (const branch of branches) {
          const bgMatches = Array.from(branch.matchAll(bgClassPattern)).filter(
            (b) => !b[2].startsWith("opacity-") && !b[2].includes("/")
          );
          const textMatches = Array.from(branch.matchAll(textClassPattern));

          const filteredTextMatches = textMatches.filter(
            (t) => !nonColorTextClasses.has(t[2]) && !t[2].startsWith("[")
          );

          if (bgMatches.length > 0 && filteredTextMatches.length > 0) {
            for (const bgm of bgMatches) {
              const bgPrefix = bgm[1] || "";
              const bgVal = bgm[2];

              for (const tm of filteredTextMatches) {
                const textPrefix = tm[1] || "";
                const textVal = tm[2];

                // Light Mode Resolution
                const lightBgRes = resolveTokenToHex(bgVal, false);
                const lightFgRes = resolveTokenToHex(textVal, false);

                if (!lightBgRes.hex || !lightFgRes.hex) {
                  failures.push(
                    `[UNRESOLVED LIGHT] ${relPath}: bg-${bgVal} (${lightBgRes.hex}) / text-${textVal} (${lightFgRes.hex})`
                  );
                  continue;
                }

                const ratioLight = getContrastRatio(lightFgRes.hex, lightBgRes.hex);
                if (ratioLight < 4.5) {
                  failures.push(
                    `[LIGHT MODE FAIL] ${relPath}: text-${textVal} (${lightFgRes.hex}) on bg-${bgVal} (${lightBgRes.hex}) -> ratio = ${ratioLight.toFixed(
                      2
                    )}:1 (< 4.5:1)`
                  );
                }

                // Dark Mode Resolution
                const darkBgToken = bgPrefix === "dark:" ? bgVal : bgVal;
                const darkFgToken = textPrefix === "dark:" ? textVal : textVal;

                const darkBgRes = resolveTokenToHex(darkBgToken, true);
                const darkFgRes = resolveTokenToHex(darkFgToken, true);

                if (!darkBgRes.hex || !darkFgRes.hex) {
                  failures.push(
                    `[UNRESOLVED DARK] ${relPath}: bg-${darkBgToken} (${darkBgRes.hex}) / text-${darkFgToken} (${darkFgRes.hex})`
                  );
                  continue;
                }

                // Step 1 d: Flag invariant background tokens in dark theme (no dark: variant & no .dark redefinition)
                if (bgPrefix !== "dark:" && !darkBgRes.isExplicitDark && darkBgRes.hex === lightBgRes.hex) {
                  failures.push(
                    `[DARK MODE INVARIANT SURFACE FAIL] ${relPath}: bg-${bgVal} surface has no dark-theme value (resolves to ${darkBgRes.hex} in both themes). Rendered text-${darkFgToken} (${darkFgRes.hex}) on bg-${bgVal} (${darkBgRes.hex}) -> ratio = ${getContrastRatio(
                      darkFgRes.hex,
                      darkBgRes.hex
                    ).toFixed(2)}:1`
                  );
                  continue;
                }

                const ratioDark = getContrastRatio(darkFgRes.hex, darkBgRes.hex);
                if (ratioDark < 4.5) {
                  failures.push(
                    `[DARK MODE FAIL] ${relPath}: text-${darkFgToken} (${darkFgRes.hex}) on bg-${darkBgToken} (${darkBgRes.hex}) -> ratio = ${ratioDark.toFixed(
                      2
                    )}:1 (< 4.5:1)`
                  );
                }
              }
            }
          }
        }
      }
    }

    expect(failures, `Contrast enforcement failures:\n${failures.join("\n")}`).toEqual([]);
  });

  /**
   * Pairs the scan above structurally cannot reach, named by hand.
   *
   * That scan pairs a `bg-*` with a `text-*` found in the SAME className
   * expression. The selected capsule breaks that model twice over. Its surface
   * comes from the `capsule-raised` @utility, and no `.tsx` may ever spell
   * `bg-capsule` — that is why the utility exists (`index.css:151-156`). And,
   * decisively, the surface sits on an absolutely positioned `<i>`
   * (`SegmentedTrack.tsx:89`) while the text it backs is on sibling buttons
   * (`:108`, `:112`); they are composited by z-index and never co-located in
   * one className. So teaching the scan to resolve @utility backgrounds — the
   * fix T12 proposed — would still not have found this pair. It has to be
   * named, which is what this does.
   *
   * `capsule_tokens.test.ts` pins what the token IS. This pins whether the
   * result is LEGIBLE, which is the half that moves when the surface is
   * legitimately redesigned. Planted as `#c8c8c8` in dark, a plausible
   * overshoot of the lightening at `tokens.css:188`, the label fell to 1.67:1
   * and all 806 tests passed.
   *
   * Resolved through the same tokens.css the scan uses, never hardcoded hexes,
   * so a token change moves these numbers rather than going stale behind them.
   */
  const UNREACHABLE_PAIRS = [
    { fg: "ink-1", bg: "capsule", what: "the selected segment's label" },
    { fg: "ink-2", bg: "capsule", what: "the selected segment's count" },
  ];

  it("verifies the pairs the class scan cannot see, capsule included", () => {
    const failures: string[] = [];

    for (const { fg, bg, what } of UNREACHABLE_PAIRS) {
      for (const isDark of [false, true]) {
        const theme = isDark ? "DARK" : "LIGHT";
        const fgRes = resolveTokenToHex(fg, isDark);
        const bgRes = resolveTokenToHex(bg, isDark);

        if (!fgRes.hex || !bgRes.hex) {
          failures.push(
            `[UNRESOLVED ${theme}] ${what}: --${fg} (${fgRes.hex}) on --${bg} (${bgRes.hex})`
          );
          continue;
        }

        const ratio = getContrastRatio(fgRes.hex, bgRes.hex);
        if (ratio < 4.5) {
          failures.push(
            `[${theme} FAIL] ${what}: --${fg} (${fgRes.hex}) on --${bg} (${bgRes.hex}) ` +
              `-> ratio = ${ratio.toFixed(2)}:1 (< 4.5:1)`
          );
        }
      }
    }

    expect(failures, `Capsule contrast failures:\n${failures.join("\n")}`).toEqual([]);
  });
});
