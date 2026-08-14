import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * A config FILE is not an MCP server. `~/.claude.json` declares ten of them,
 * `~/.codex/config.toml` three.
 *
 * Treating `config_path` as an identity keeps the first server in each file and
 * silently discards the rest. That bug shipped four separate times — in
 * `filterPredicate`, `run_scan`, `start_scan` and `linkStateCounts` — because
 * each site answered "what makes a tool unique?" for itself, and there was
 * nothing to say they had answered it wrong. The symptom was 23 servers in the
 * database and 7 rows on screen, under a heading that read 23.
 *
 * Identity belongs to the domain: `Tool::registration_key` in Rust,
 * `registrationKey` in TypeScript. This detector fails if a new site starts
 * deriving its own.
 */

const SOURCE_ROOTS = ["src", "src-tauri/src"];

/** Deduplication shapes: a Set/Map key, a `retain`, a `dedupeBy`, an index scan. */
const IDENTITY_SHAPES = [
  // `[^)]*` was wrong here: it stops at the first `)`, so a nested call like
  // `dedupeBy(tools.filter(inScope), (t) => t.config_path)` slipped past
  // entirely. A planted reintroduction of the original bug went undetected.
  // Same-line `.*` is the right scope for a per-line scan.
  /\.(has|add|insert|delete)\(.*config_path/,
  /retain\(.*config_path/,
  /dedupeBy\(.*config_path/,
  /findIndex\(.*config_path/,
  /new (Set|Map)\(.*config_path/,
];

interface Allowed {
  file: string;
  pattern: RegExp;
  reason: string;
}

/**
 * Legitimate uses of config_path as a lookup key — finding the file a
 * registration came from, not deciding whether two registrations are the same.
 */
const ALLOWLIST: Allowed[] = [
  {
    file: "src-tauri/src/scanner.rs",
    pattern: /seen_registrations\.insert\(\(reg\.config_path\.clone\(\), reg\.server\.name\.clone\(\)\)\)/,
    reason:
      "Keys on the PAIR (config_path, server name), which is the registration " +
      "identity itself. Predates the Tool struct — this runs on discovery " +
      "results, before a Tool exists to ask.",
  },
];

const walk = (dir: string, out: string[] = []): string[] => {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "target", "dist", "__tests__", "fixtures"].includes(entry.name)) continue;
      walk(full, out);
      continue;
    }
    if (/\.(ts|tsx|rs)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
};

describe("config_path is never an identity", () => {
  it("no module decides tool uniqueness by config file", () => {
    const offences: string[] = [];

    for (const root of SOURCE_ROOTS) {
      for (const file of walk(root)) {
        const lines = fs.readFileSync(file, "utf8").split("\n");
        lines.forEach((line, i) => {
          if (!IDENTITY_SHAPES.some((re) => re.test(line))) return;
          const excused = ALLOWLIST.some(
            (a) => file.endsWith(a.file) && a.pattern.test(line)
          );
          if (excused) return;
          offences.push(`${file}:${i + 1}\n    ${line.trim()}`);
        });
      }
    }

    expect(
      offences,
      `config_path used as an identity key. A config file declares MANY servers, so ` +
        `this keeps the first and drops the rest.\n\nUse registrationKey() ` +
        `(src/utils/mcpRegistration.ts) or Tool::registration_key (src-tauri/src/domain.rs).\n\n` +
        offences.join("\n")
    ).toEqual([]);
  });
});
