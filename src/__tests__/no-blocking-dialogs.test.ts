// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// The no-modal rule, enforced mechanically and totally:
//  1. No blocking dialog calls anywhere in src/: window.confirm/alert/prompt,
//     or the bare globals confirm(/alert(/prompt( — including aliased plugin imports.
//  2. The only @tauri-apps/plugin-dialog APIs permitted are the file pickers
//     `open` and `save`. confirm/ask/message are banned at the import site, so
//     renamed imports cannot smuggle a modal past the call-site scan.
// Scope is every .ts/.tsx under src/ except __tests__ — a detector scoped to one
// function in one file is how five modals shipped unseen.

const SRC_ROOT = path.resolve(__dirname, "..");
const ALLOWED_DIALOG_IMPORTS = new Set(["open", "save"]);

// Matches window.confirm( / bare confirm( etc., but not foo.confirm( —
// the optional `window.` group consumes its own dot, and the lookbehind
// rejects any other property access or identifier prefix.
const DIALOG_CALL = /(?<![.\w$])(?:window\s*\.\s*)?(confirm|alert|prompt)\s*\(/;

const PLUGIN_DIALOG_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@tauri-apps\/plugin-dialog["']/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("No blocking dialogs anywhere in src/", () => {
  const files = sourceFiles(SRC_ROOT);

  it("scans a non-trivial file set", () => {
    // Guard against the detector silently scanning nothing.
    expect(files.length).toBeGreaterThan(5);
  });

  it("contains no window.* or bare confirm/alert/prompt calls", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      fs.readFileSync(file, "utf-8")
        .split("\n")
        .forEach((line, i) => {
          if (DIALOG_CALL.test(line)) {
            violations.push(`${rel}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(violations, `Blocking dialog calls found:\n${violations.join("\n")}`).toEqual([]);
  });

  it("imports nothing from @tauri-apps/plugin-dialog except open/save", () => {
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      const content = fs.readFileSync(file, "utf-8");
      for (const match of content.matchAll(PLUGIN_DIALOG_IMPORT)) {
        const specifiers = match[1]
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          // `confirm as ask` is banned by its source name, whatever the alias
          .map((s) => s.split(/\s+as\s+/)[0].trim());
        const banned = specifiers.filter((s) => !ALLOWED_DIALOG_IMPORTS.has(s));
        if (banned.length > 0) {
          violations.push(`${rel}: imports {${banned.join(", ")}} from @tauri-apps/plugin-dialog`);
        }
      }
    }
    expect(violations, `Banned plugin-dialog imports found:\n${violations.join("\n")}`).toEqual([]);
  });
});
