import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Ruling 3 made checkable: animated ⇒ Lucide, and motion belongs to the icon
// module. lucide-react enters through icons.tsx alone, and the aim-* motion
// classes appear in no component but icons.tsx — a second import point or a
// hand-animated svg elsewhere is how the vocabulary forks.
function walk(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") {
        files.push(...walk(fullPath));
      }
    } else if (
      (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) ||
      (entry.name.endsWith(".ts") && !entry.name.includes(".test."))
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

const SRC_ROOT = path.resolve(__dirname, "..");
const ICONS_FILE = path.resolve(__dirname, "../components/icons.tsx");
const INDEX_CSS_PATH = path.resolve(__dirname, "../styles/index.css");

const FILES = walk(SRC_ROOT);
const OTHER_FILES = FILES.filter((f) => f !== ICONS_FILE);

describe("the animated-icon family rule", () => {
  it("lucide-react is imported only by icons.tsx", () => {
    const offenders = OTHER_FILES.filter((f) =>
      /from\s+["']lucide-react["']/.test(fs.readFileSync(f, "utf-8"))
    );
    expect(offenders).toEqual([]);
  });

  it("aim-* motion classes appear only in icons.tsx and index.css", () => {
    // Scoped to className/class attribute VALUES, not to every occurrence of
    // the string "aim-" in a file: DesignSystemPane's motion specimen prints
    // the label "aim-spin aim-loop" as plain JSX text, next to a Disc3Icon
    // that gets its actual aim-spin class from icons.tsx, same as the
    // animate-drop/animate-rise specimens beside it print their own utility
    // names as text. That is documentation of the vocabulary, not a second
    // place applying it — the fork this test exists to catch is a hand-added
    // className carrying the class, e.g. a plain <svg> or <div> outside
    // icons.tsx spun up with className="aim-spin".
    //
    // A value is either a plain quoted string (className="...") or a
    // JSXExpressionContainer (className={...}) — this codebase composes
    // classes both ways (SegmentedTrack.tsx's template-literal className,
    // ternary classNames elsewhere), so both are extracted and scanned: a
    // bare string/backtick match for the first form, a brace-depth walk for
    // the second so a template literal or a conditional inside the braces —
    // `` className={`h-full aim-spin`} `` or
    // `className={cond ? "aim-spin" : ""}` — is still visible to the scan.
    function classAttrValues(src: string): string[] {
      const values: string[] = [];
      const attrRegex = /\bclass(?:Name)?\s*=\s*/g;
      for (
        let match = attrRegex.exec(src);
        match !== null;
        match = attrRegex.exec(src)
      ) {
        const start = match.index + match[0].length;
        const opener = src[start];
        if (opener === '"' || opener === "'" || opener === "`") {
          const end = src.indexOf(opener, start + 1);
          if (end === -1) continue;
          values.push(src.slice(start + 1, end));
          attrRegex.lastIndex = end + 1;
        } else if (opener === "{") {
          let depth = 0;
          let i = start;
          for (; i < src.length; i++) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") {
              depth--;
              if (depth === 0) {
                i++;
                break;
              }
            }
          }
          values.push(src.slice(start + 1, i - 1));
          attrRegex.lastIndex = i;
        }
      }
      return values;
    }
    const offenders = OTHER_FILES.filter((f) => {
      const src = fs.readFileSync(f, "utf-8");
      return classAttrValues(src).some((v) => /\baim-[a-z][a-z-]*/.test(v));
    });
    expect(offenders).toEqual([]);
  });

  it("every animation-name an aim-* utility declares has a matching @keyframes block", () => {
    const css = fs.readFileSync(INDEX_CSS_PATH, "utf-8");
    const utilityBlocks = css.match(/@utility aim-[\s\S]*?\n\}/g) ?? [];
    const names = new Set<string>();
    for (const block of utilityBlocks) {
      const m = block.match(/animation-name:\s*([\w-]+);/);
      if (m) names.add(m[1]);
    }
    // Guards against the loop itself iterating an empty collection and
    // passing on nothing (verification.md's "a live, green control can
    // still assert nothing").
    expect(names.size).toBeGreaterThan(0);
    for (const name of names) {
      expect(css, `@keyframes ${name} is referenced but never declared`).toMatch(
        new RegExp(`@keyframes ${name}\\s*\\{`)
      );
    }
  });
});
