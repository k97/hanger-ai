import * as fs from "fs";
import * as path from "path";
import { ROOT, read, block } from "./rustTables";

export const START = "<!-- hanger:counts:start -->";
export const END = "<!-- hanger:counts:end -->";

const countMatches = (s: string, re: RegExp) => [...s.matchAll(re)].length;

const filesIn = (dir: string, re: RegExp) =>
  fs.readdirSync(path.join(ROOT, dir)).filter((f) => re.test(f)).length;

export function counts() {
  const engines = countMatches(
    block(read("src-tauri/src/agents.rs"), "pub const AGENT_CONFIGS", "];", "agents.rs AGENT_CONFIGS"),
    /^ {4}AgentConfig \{/gm,
  );
  const hosts = countMatches(
    block(read("src-tauri/src/mcp/registry.rs"), "pub const HOSTS", "];", "registry.rs HOSTS"),
    /McpHost \{ id: "/g,
  );
  const commands = block(read("src-tauri/src/lib.rs"), "tauri::generate_handler![", "])", "lib.rs generate_handler")
    .split("\n")
    .slice(1)
    .map((l) => l.trim().replace(/,$/, ""))
    .filter((l) => /^[a-z_0-9]+(::[a-z_0-9]+)?$/.test(l)).length;

  return {
    engines,
    hosts,
    commands,
    frontendTests: filesIn("src/__tests__", /\.test\.tsx?$/),
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
    `| Frontend test files | ${c.frontendTests} | \`src/__tests__/\` |`,
    `| Rust test files | ${c.rustTests} | \`src-tauri/tests/\` |`,
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
