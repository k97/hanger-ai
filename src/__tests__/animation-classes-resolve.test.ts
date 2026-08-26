import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * An `animate-*` class that resolves to nothing is motion that never runs.
 *
 * Fifteen elements across six files carried `animate-fade-in`, `animate-in`,
 * `zoom-in-95`, `fade-in` and `slide-in-from-bottom`. None of them existed:
 * `animate-fade-in` was never declared anywhere, and the other four belong to
 * the `tailwindcss-animate` plugin, which this project does not install and
 * never has (`package.json`, and no `@plugin` line in `index.css`). Compiling
 * the tree proved it — the four names appear zero times in the emitted CSS,
 * as substrings let alone as rules. Nothing was red. A dead class is
 * indistinguishable from a live one at the call site, and Tailwind emits no
 * warning for a name it does not recognise, so the defect is silent by
 * construction and can only be caught here.
 *
 * `animated_icons_family.test.ts` pins the same property for the `aim-*`
 * vocabulary — every `animation-name` it declares has a `@keyframes` block —
 * but stops at the stylesheet. This guard closes the other half: every
 * `animate-*` a component actually applies resolves to something real.
 *
 * The class-attribute extractor is lifted from that sibling deliberately, so
 * both guards see the same surface: a plain string, a template literal, or a
 * ternary inside braces. Scanning raw file text instead would trip over
 * `DesignSystemPane`, which prints utility names as JSX prose beside their
 * specimens.
 */

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...walk(fullPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Every place a class list can be written: a `className=` / `class=`
 * attribute, and a string assigned to a name.
 *
 * The second half is not optional. `EmptyState.tsx` keeps its classes in a
 * module const and applies it by reference, so an attribute-only scan — the
 * first version of this guard — reported fourteen of the fifteen dead classes
 * and silently cleared the fifteenth. Several components in this tree hoist
 * their class lists that way (`McpServerDetail`'s `SECTION`, `LinkPanel`'s
 * button base), so it is a shape the guard has to see.
 *
 * Both forms are anchored on syntax rather than on the raw file text, which
 * is what keeps prose out: `OverflowMenu`, `ViewControl`, `InfoPopover` and
 * `icons.tsx` all name `animate-tip` in doc comments, and `DesignSystemPane`
 * prints "animate-drop" and "animate-rise" as JSX text beside their live
 * specimens. Neither is a class being applied.
 */
function classAttrValues(src: string): string[] {
  const values: string[] = [];
  for (const [, dq, bt] of src.matchAll(/=\s*(?:"([^"]*)"|`([^`]*)`)\s*;/g)) {
    values.push(dq ?? bt);
  }
  const attrRegex = /\bclass(?:Name)?\s*=\s*/g;
  for (let match = attrRegex.exec(src); match !== null; match = attrRegex.exec(src)) {
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

const SRC_ROOT = path.resolve(__dirname, "..");
const INDEX_CSS_PATH = path.resolve(__dirname, "../styles/index.css");

/**
 * Tailwind ships these four itself, so they resolve without appearing in
 * `index.css`. Everything else has to be declared.
 */
const TAILWIND_BUILTINS = new Set(["animate-spin", "animate-pulse", "animate-bounce", "animate-ping", "animate-none"]);

/**
 * The `tailwindcss-animate` vocabulary. These are the names that do NOT start
 * with `animate-`, so the resolution test below cannot see them — they need
 * their own check or they come back the moment someone copies a snippet from
 * a shadcn component.
 */
const PLUGIN_ONLY = /\b(?:fade|zoom|spin|slide)-(?:in|out)(?:-from|-to)?\b/;

const FILES = walk(SRC_ROOT);

function declaredUtilities(): Set<string> {
  const css = fs.readFileSync(INDEX_CSS_PATH, "utf-8");
  return new Set([...css.matchAll(/@utility\s+(animate-[a-z0-9-]+)\s*\{/g)].map((m) => m[1]));
}

describe("animation classes resolve", () => {
  it("finds the files and the declarations it exists to compare", () => {
    // verification.md: a loop over an empty collection is a green test that
    // asserts nothing. Both sides of the comparison must be non-empty, or the
    // two tests below pass on vacuum.
    expect(FILES.length).toBeGreaterThan(20);
    expect(declaredUtilities().size).toBeGreaterThan(0);
  });

  it("every animate-* class a component applies is declared or built in", () => {
    const allowed = new Set([...declaredUtilities(), ...TAILWIND_BUILTINS]);
    const offenders: string[] = [];
    let seen = 0;

    for (const file of FILES) {
      for (const value of classAttrValues(fs.readFileSync(file, "utf-8"))) {
        for (const [cls] of value.matchAll(/\banimate-[a-z0-9-]+/g)) {
          seen++;
          if (!allowed.has(cls)) {
            offenders.push(`${path.relative(SRC_ROOT, file)}: ${cls}`);
          }
        }
      }
    }

    // Same reason as above, one level down: if the scan matched no classes at
    // all, an empty offender list proves nothing about the tree.
    expect(seen, "scanned no animate-* classes at all").toBeGreaterThan(5);
    expect(offenders).toEqual([]);
  });

  it("no tailwindcss-animate classes, since the plugin is not installed", () => {
    // `zoom-in-95`, `fade-in` and `slide-in-from-bottom` carry no `animate-`
    // prefix, so the test above is blind to them. They compile to nothing.
    const offenders: string[] = [];
    for (const file of FILES) {
      for (const value of classAttrValues(fs.readFileSync(file, "utf-8"))) {
        for (const word of value.split(/\s+/)) {
          // `animate-fade-in` contains `fade-in` but belongs to the test
          // above; reporting it twice would make one defect look like two.
          if (word.startsWith("animate-")) continue;
          if (PLUGIN_ONLY.test(word)) offenders.push(`${path.relative(SRC_ROOT, file)}: ${word}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
