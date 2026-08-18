import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

/**
 * The separator is stated once, in the type — not at each call site.
 *
 * `Tool::registration_key` joined with a hyphen while the store keyed
 * `assets.abs_path` on a colon, so the id the frontend joined annotations with
 * could never equal the stored key and Reach rendered blank for every MCP row.
 * Both halves were correct in isolation; they disagreed about the glue.
 *
 * `no-config-path-identity.test.ts` cannot see this. It catches identity built
 * from ONE half — a Set, a retain, a dedupeBy keyed on `config_path` — and
 * every site here pairs both halves correctly. Different assertion, own file,
 * by ruling 2026-08-18.
 *
 * Identity belongs to `RegistrationKey` (`src-tauri/src/domain.rs`) in Rust and
 * to the branded key the backend mints in TypeScript. Nothing else composes one.
 */

const SOURCE_ROOTS = ["src", "src-tauri/src"];

/** `format!("{}:{}", …)` / `format!("{}-{}", …)` — a two-part composite. */
const RUST_COMPOSITE = /format!\("\{\}[:-]\{\}"/;

/**
 * A template literal gluing a config-path-ish binding to a server-name-ish one.
 *
 * Deliberately narrower than the Rust rule: `${reg.configPath}-${i}` is a React
 * list key, not an identity, and two of those exist. Requiring a *name* on the
 * far side separates "builds a key" from "builds a key prop".
 */
const TS_COMPOSITE = /`\$\{[^}]*(config_?path|configPath)[^}]*\}[:-]\$\{[^}]*name[^}]*\}`/i;

interface Allowed {
  file: string;
  pattern: RegExp;
  reason: string;
}

const ALLOWLIST: Allowed[] = [
  {
    file: "src-tauri/src/domain.rs",
    pattern: /Self\(format!\("\{\}:\{\}", config_path, server_name\)\)/,
    reason: "RegistrationKey::new — the one place the separator is decided.",
  },
  {
    file: "src-tauri/src/preferences.rs",
    pattern: /format!\("\{\}:\{\}", canon_file, suffix\)/,
    reason:
      "upsert_asset re-joining the split it made two lines earlier. The store " +
      "is the other party to this contract, not a second author of it.",
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

describe("registration keys are composed in one place", () => {
  it("no module invents its own separator", () => {
    const offences: string[] = [];
    const hit = new Set<string>();

    for (const root of SOURCE_ROOTS) {
      for (const file of walk(root)) {
        const rule = file.endsWith(".rs") ? RUST_COMPOSITE : TS_COMPOSITE;
        fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
          if (!rule.test(line)) return;
          const excuse = ALLOWLIST.find((a) => file.endsWith(a.file) && a.pattern.test(line));
          if (excuse) {
            hit.add(excuse.file + excuse.pattern.source);
            return;
          }
          offences.push(`${file}:${i + 1}\n    ${line.trim()}`);
        });
      }
    }

    expect(
      offences,
      `A registration key composed outside RegistrationKey. The separator is a ` +
        `colon and it is decided in src-tauri/src/domain.rs — a second spelling ` +
        `is how Reach went blank on every MCP row.\n\n${offences.join("\n")}`
    ).toEqual([]);

    // An allowlist entry that no longer matches is a guard quietly shrinking:
    // the code moved, the excuse stayed, and the rule now covers less than it
    // reads as covering.
    const stale = ALLOWLIST.filter((a) => !hit.has(a.file + a.pattern.source));
    expect(
      stale.map((a) => `${a.file} — ${a.reason}`),
      "Allowlisted sites that no longer match. Remove the entry or repoint it."
    ).toEqual([]);
  });
});
