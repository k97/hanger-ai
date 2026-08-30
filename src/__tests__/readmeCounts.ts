import * as fs from "fs";
import * as path from "path";
import { ROOT, read, block } from "./rustTables";

/** Every generated region in README.md, by name. Each figure sits in the
 *  section that answers the question it belongs to: what Hanger recognises
 *  anywhere is coverage, how many IPC commands exist is architecture, and how
 *  many test files there are is testing. They were one table until
 *  2026-08-30, which read as a scan of somebody's laptop. */
export const BLOCK_NAMES = ["coverage", "ipc", "tests"] as const;
export type BlockName = (typeof BLOCK_NAMES)[number];

export const startMarker = (name: BlockName) => `<!-- hanger:${name}:start -->`;
export const endMarker = (name: BlockName) => `<!-- hanger:${name}:end -->`;

const countMatches = (s: string, re: RegExp) => [...s.matchAll(re)].length;

const collect = (s: string, re: RegExp) => [...s.matchAll(re)].map((m) => m[1]);

/** "a, b and c" — the README's roster reads as a sentence, not a list. */
const joined = (names: string[]) =>
  names.length < 2 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** Every file under `dir` matching `re`, recursively. */
const filesIn = (dir: string, re: RegExp): number => {
  let n = 0;
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) n += filesIn(path.join(dir, e.name), re);
    else if (re.test(e.name)) n += 1;
  }
  return n;
};

export function counts() {
  const engines = countMatches(
    block(read("src-tauri/src/agents.rs"), "pub const AGENT_CONFIGS", "];", "agents.rs AGENT_CONFIGS"),
    /^ {4}AgentConfig \{/gm,
  );
  const hosts = countMatches(
    block(read("src-tauri/src/mcp/registry.rs"), "pub const HOSTS", "];", "registry.rs HOSTS"),
    /McpHost \{ id: "/g,
  );
  // Every non-blank line inside the block must parse. Dropping one silently
  // would lower the count with nothing to notice: unlike engines and hosts,
  // no other guard cross-checks this number.
  const commandLines = block(read("src-tauri/src/lib.rs"), "tauri::generate_handler![", "])", "lib.rs generate_handler")
    .split("\n")
    .slice(1)
    .map((l) => l.trim().replace(/,$/, ""))
    .filter((l) => l.length > 0 && !l.startsWith("//") && !l.startsWith("#["));
  const unparsed = commandLines.filter((l) => !/^[a-z_0-9]+(::[a-z_0-9]+)?$/.test(l));
  if (unparsed.length > 0) {
    throw new Error(`lib.rs generate_handler: ${unparsed.length} line(s) did not parse as a command: ${unparsed.join(", ")}`);
  }
  const commands = commandLines.length;

  const engineNames = collect(
    block(read("src-tauri/src/agents.rs"), "pub const AGENT_CONFIGS", "];", "agents.rs AGENT_CONFIGS"),
    /^ {8}name: "([^"]+)"/gm,
  );
  const hostNames = collect(
    block(read("src-tauri/src/mcp/registry.rs"), "pub const HOSTS", "];", "registry.rs HOSTS"),
    /display_name: "([^"]+)"/g,
  );

  return {
    engines,
    hosts,
    commands,
    engineNames,
    hostNames,
    frontendTests: filesIn("src", /\.test\.tsx?$/),
    rustTests: filesIn("src-tauri/tests", /\.rs$/),
  };
}

export function renderBlock(name: BlockName): string {
  const c = counts();
  const body: Record<BlockName, string[]> = {
    // What Hanger recognises on any machine. Not a scan of one: these come
    // from the tables in the binary, so they are the same figures wherever it
    // runs. Karthik, 2026-08-30.
    coverage: [
      `**Engines with directories of their own (${c.engines}).** ${joined(c.engineNames)}.`,
      "",
      `**MCP hosts (${c.hosts}).** ${joined(c.hostNames)}.`,
    ],
    ipc: [`The webview reaches the Rust core through ${c.commands} Tauri commands and three events.`],
    tests: [
      `${c.frontendTests} frontend test files under \`src/\`, and ${c.rustTests} Rust integration test files under \`src-tauri/tests/\`.`,
    ],
  };
  return [startMarker(name), "", ...body[name], "", endMarker(name)].join("\n");
}

/** Rewrite every generated block in place. Returns true when the file changed. */
export function rewriteReadme(): boolean {
  const p = path.join(ROOT, "README.md");
  const src = fs.readFileSync(p, "utf-8");
  let next = src;
  for (const name of BLOCK_NAMES) {
    const a = next.indexOf(startMarker(name));
    const b = next.indexOf(endMarker(name));
    if (a < 0 || b < 0) throw new Error(`README.md has no ${name} block markers to rewrite`);
    next = next.slice(0, a) + renderBlock(name) + next.slice(b + endMarker(name).length);
  }
  if (next === src) return false;
  fs.writeFileSync(p, next);
  return true;
}

// Bun sets import.meta.main; under Vitest it is undefined, so this stays inert.
if ((import.meta as { main?: boolean }).main) {
  console.log(rewriteReadme() ? "README counts updated" : "README counts already current");
}
