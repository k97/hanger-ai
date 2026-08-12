// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

// The problem this detector solves (2026-08-12): six webview dialogs —
// window.confirm/alert and one bare plugin confirm — shipped unseen because
// the old detector scanned one function in one file and only matched
// window.-prefixed calls. Webview-global dialogs are unstyled WKWebView
// panels the app cannot design; they are banned across src/.
//
// Native @tauri-apps/plugin-dialog surfaces (confirm/ask/message) are NOT
// banned — whether a native dialog is the right surface is a per-use product
// decision (ruled 2026-08-13). To keep call sites distinguishable from the
// banned globals, import them under an aliased name (e.g.
// `import { confirm as confirmDialog }`): a bare `confirm(` call is always
// treated as the webview global and flagged.

const SRC_ROOT = path.resolve(__dirname, "..");

// Matches window.confirm( / bare confirm( etc., but not foo.confirm( —
// the optional `window.` group consumes its own dot, and the lookbehind
// rejects any other property access or identifier prefix.
const DIALOG_CALL = /(?<![.\w$])(?:window\s*\.\s*)?(confirm|alert|prompt)\s*\(/;

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

  it("plugin-dialog confirm/ask/message imports are aliased away from the global names", () => {
    // Native dialogs are permitted; this only ensures their call sites cannot
    // be mistaken for (or masked by) the banned webview globals.
    const PLUGIN_DIALOG_IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*["']@tauri-apps\/plugin-dialog["']/g;
    const GLOBAL_NAMES = new Set(["confirm", "alert", "prompt"]);
    const violations: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      const content = fs.readFileSync(file, "utf-8");
      for (const match of content.matchAll(PLUGIN_DIALOG_IMPORT)) {
        for (const spec of match[1].split(",").map((s) => s.trim()).filter(Boolean)) {
          const [source, alias] = spec.split(/\s+as\s+/).map((s) => s.trim());
          const localName = alias ?? source;
          if (GLOBAL_NAMES.has(localName)) {
            violations.push(
              `${rel}: plugin-dialog \`${spec}\` binds the global name \`${localName}\` — alias it (e.g. \`${source} as ${source}Dialog\`)`
            );
          }
        }
      }
    }
    expect(violations, `Unaliased plugin-dialog imports found:\n${violations.join("\n")}`).toEqual([]);
  });
});
