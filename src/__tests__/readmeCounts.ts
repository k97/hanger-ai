import * as fs from "fs";
import * as path from "path";
import { ROOT, read, block } from "./rustTables";

export const START = "<!-- hanger:counts:start -->";
export const END = "<!-- hanger:counts:end -->";

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

export function renderCountsBlock(): string {
  const c = counts();
  return [
    START,
    "",
    "| What | Count | Where it is written down |",
    "|---|---:|---|",
    `| Engines with directories of their own | ${c.engines} | \`src-tauri/src/agents.rs\` → \`AGENT_CONFIGS\` |`,
    `| MCP hosts | ${c.hosts} | \`src-tauri/src/mcp/registry.rs\` → \`HOSTS\` |`,
    `| Tauri commands | ${c.commands} | \`src-tauri/src/lib.rs\` → \`generate_handler!\` |`,
    `| Frontend test files | ${c.frontendTests} | \`src/**/*.test.ts(x)\` |`,
    `| Rust integration test files | ${c.rustTests} | \`src-tauri/tests/\` |`,
    "",
    `**Engines with directories of their own.** ${joined(c.engineNames)}.`,
    "",
    `**MCP hosts.** ${joined(c.hostNames)}.`,
    "",
    END,
  ].join("\n");
}

/** Rewrite the block in place. Returns true when the file changed. */
export function rewriteReadme(): boolean {
  const p = path.join(ROOT, "README.md");
  const src = fs.readFileSync(p, "utf-8");
  const s = src.indexOf(START);
  const e = src.indexOf(END);
  if (s < 0 || e < 0) throw new Error("README.md has no counts block markers to rewrite");
  const next = src.slice(0, s) + renderCountsBlock() + src.slice(e + END.length);
  if (next === src) return false;
  fs.writeFileSync(p, next);
  return true;
}

// Bun sets import.meta.main; under Vitest it is undefined, so this stays inert.
if ((import.meta as { main?: boolean }).main) {
  console.log(rewriteReadme() ? "README counts updated" : "README counts already current");
}
