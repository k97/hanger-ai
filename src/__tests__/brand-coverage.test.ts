import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { resolveBrand } from "../data/brands";

/**
 * The shipped binary must draw a mark for every engine or host the Rust side
 * can name — not just the ones on this machine. This guard reads the Rust
 * registries as text (the same idiom as no-frontend-counting reading TSX) and
 * fails the moment an id is added there without a mark in src/data/brands.ts.
 * Spec: docs/superpowers/specs/2026-08-15-brand-icons-design.md §4, §11.
 */
const ROOT = path.resolve(__dirname, "../..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

function block(source: string, startMarker: string, endMarker: string, what: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${what}: marker "${startMarker}" not found — the guard's anchor moved`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${what}: end marker "${endMarker}" not found after "${startMarker}"`);
  return source.slice(start, end);
}

/** Every identifier the backend can hand the webview for an engine or host. */
export function backendEngineIds(): { id: string; from: string }[] {
  const out: { id: string; from: string }[] = [];

  const registry = read("src-tauri/src/mcp/registry.rs");
  const hosts = block(registry, "pub const HOSTS", "];", "registry.rs HOSTS");
  for (const m of hosts.matchAll(/McpHost \{ id: "([^"]+)"/g)) out.push({ id: m[1], from: "registry.rs HOSTS" });

  const scanner = read("src-tauri/src/scanner.rs");
  const agents = block(scanner, "pub const AGENT_CONFIGS", "];", "scanner.rs AGENT_CONFIGS");
  for (const m of agents.matchAll(/\bid: "([^"]+)"/g)) out.push({ id: m[1], from: "scanner.rs AGENT_CONFIGS" });

  const keyFn = block(scanner, "pub fn get_engine_key", "_ => None", "scanner.rs get_engine_key");
  for (const m of keyFn.matchAll(/=> Some\("([^"]+)"\)/g)) out.push({ id: m[1], from: "scanner.rs get_engine_key" });

  for (const m of scanner.matchAll(/upsert_engine\("([^"]+)"/g)) out.push({ id: m[1], from: "scanner.rs upsert_engine literal" });

  return out;
}

describe("brand coverage", () => {
  it("finds the registries it reads", () => {
    const ids = backendEngineIds();
    const distinct = new Set(ids.map((x) => x.id));
    // 9 hosts + 3 agents + 5 canonical keys + 2 literals, overlapping to ~11 distinct.
    expect(distinct.size).toBeGreaterThanOrEqual(10);
    expect(distinct.has("windsurf")).toBe(true);
    expect(distinct.has("copilot")).toBe(true);

    // Per-source floor, so a source that silently under-collects (e.g. a Rust
    // struct array reformatted enough to break one of the regexes above)
    // fails loudly here instead of hiding behind AGENT_CONFIGS' 3 ids being
    // string-duplicates of ids HOSTS already yields. Counted directly from
    // the Rust files, not guessed: registry.rs HOSTS has 9 McpHost entries,
    // scanner.rs AGENT_CONFIGS has 3, get_engine_key's match arms yield 5
    // Some(...) results, and there are 2 string-literal upsert_engine calls.
    const floors: Record<string, number> = {
      "registry.rs HOSTS": 9,
      "scanner.rs AGENT_CONFIGS": 3,
      "scanner.rs get_engine_key": 5,
      "scanner.rs upsert_engine literal": 2,
    };
    for (const [source, floor] of Object.entries(floors)) {
      const count = ids.filter((x) => x.from === source).length;
      expect(count, `${source} yielded only ${count} ids, expected at least ${floor}`).toBeGreaterThanOrEqual(floor);
    }
  });

  it("every engine or host id the backend can emit resolves to a brand mark", () => {
    const missing = backendEngineIds().filter(({ id }) => resolveBrand(id) === undefined);
    expect(
      missing,
      `add a mark to src/data/brands.ts (and its aliases) for: ${missing.map((m) => `${m.id} (${m.from})`).join(", ")}`,
    ).toEqual([]);
  });
});
