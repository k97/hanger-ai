import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Appendix A.5 (docs/superpowers/specs/2026-08-16-mcp-identity-design.md):
// "Any hardcoded engine name, path or count in a string literal in the view
// layer" is copy that must never appear. This is the enforcement grep §6.5
// promises. Mirrors `no-off-token-styles.test.ts`'s allowlist shape: any
// match not on the allowlist fails, and any allowlist entry that no longer
// matches ALSO fails (a name or a line moving must be caught, not silently
// stop being checked).

export interface AllowlistEntry {
  file: string;
  linePattern: RegExp;
  reason: string;
}

const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/DesignSystemPane.tsx",
    linePattern: /<EngineLabel engineKey="claude" engineName="Claude Code">Claude Code<\/EngineLabel>/,
    reason:
      "Design-system showcase swatch, not rendered detection data — demonstrates the EngineLabel compound with a literal example, the same way the page's other Specimens use literal sample text.",
  },
  {
    file: "src/components/DesignSystemPane.tsx",
    linePattern: /<EngineLabel engineKey="codex" engineName="Codex">Codex<\/EngineLabel>/,
    reason: "Same showcase Specimen as the Claude Code row above.",
  },
  {
    file: "src/components/McpServerDetail.tsx",
    linePattern: /Nothing to spawn: a Claude\.ai connector lives on Anthropic's servers, a/,
    reason: "Code comment explaining the Claude.ai connector's no-process shape, not rendered copy.",
  },
  {
    file: "src/components/McpServerDetail.tsx",
    linePattern: /Claude\.ai connector has nothing Hanger can reach at all\./,
    reason: "Code comment, same Claude.ai connector explanation as above.",
  },
  {
    file: "src/components/McpServerDetail.tsx",
    linePattern: /Nothing here can be asked anything: a Claude\.ai connector runs on/,
    reason: "Code comment, same Claude.ai connector explanation as above.",
  },
  {
    file: "src/components/McpServerDetail.tsx",
    linePattern: /the first row would miss the case where it is Claude Desktop's copy that/,
    reason: "Code comment explaining a specific host's config-sharing quirk, not rendered copy.",
  },
  {
    file: "src/components/McpServerDetail.tsx",
    linePattern: /Absent for a Claude\.ai connector -- there is nothing local/,
    reason: "Code comment, same Claude.ai connector explanation as above.",
  },
];

/** Read the `name`/`display_name` string literals out of Hanger's own
 *  registries, rather than hand-typing a needle list that would go stale the
 *  day either table grows — the exact failure mode Appendix A.2's own exit
 *  criterion exists to catch (§6.5: "add a registry row... the string
 *  changes with no copy edit"). A needle list built this way changes with
 *  the registry it reads, with no edit to this file. */
function blockBetween(text: string, startMarker: string, endMarker: string): string {
  const start = text.indexOf(startMarker);
  if (start === -1) {
    throw new Error(`no-hardcoded-engine-copy: marker "${startMarker}" not found — the registry moved or was renamed`);
  }
  const end = text.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`no-hardcoded-engine-copy: end marker "${endMarker}" not found after "${startMarker}"`);
  }
  return text.slice(start, end);
}

function extractQuoted(block: string, keyPattern: string): string[] {
  const re = new RegExp(`\\b${keyPattern}:\\s*"([^"]+)"`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    out.push(m[1]);
  }
  return out;
}

/** `AGENT_CONFIGS`'s own `name:` values (11 today) — split from
 *  `hostDisplayNames()` below so each extraction has its own sanity floor.
 *  Every one of these 11 names also happens to be a `HOSTS` `display_name`
 *  today, so a combined floor on the union alone would stay green even if
 *  THIS extraction broke and returned nothing. */
function agentDisplayNames(): string[] {
  const rootDir = path.resolve(__dirname, "../..");
  const agentsRs = fs.readFileSync(path.join(rootDir, "src-tauri/src/agents.rs"), "utf-8");
  const agentBlock = blockBetween(agentsRs, "pub const AGENT_CONFIGS", "\n];");
  return extractQuoted(agentBlock, "name");
}

/** `registry::HOSTS`'s own `display_name:` values (16 today). */
function hostDisplayNames(): string[] {
  const rootDir = path.resolve(__dirname, "../..");
  const registryRs = fs.readFileSync(path.join(rootDir, "src-tauri/src/mcp/registry.rs"), "utf-8");
  const hostBlock = blockBetween(registryRs, "pub const HOSTS", "\n];");
  return extractQuoted(hostBlock, "display_name");
}

function knownEngineNames(): string[] {
  const names = new Set<string>([...agentDisplayNames(), ...hostDisplayNames()]);
  return Array.from(names);
}

function getComponentFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") files.push(...getComponentFiles(fullPath));
    } else if (entry.name.endsWith(".tsx") && !entry.name.endsWith(".test.tsx")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("No Hardcoded Engine Copy Enforcement", () => {
  it("the registry extraction actually found names to guard with", () => {
    // If the marker regex ever stops matching (a rename, a reformat), the
    // needle list below silently becomes empty and the whole guard goes
    // quiet without a single red test — this is the check that would catch
    // that, per verification.md's "what would make this fail?" standard.
    const names = knownEngineNames();
    expect(names.length).toBeGreaterThanOrEqual(16);
    expect(names).toContain("Claude Code");
  });

  it("the agent-side and host-side extractions each clear their own floor", () => {
    // Split from the combined check above: today every one of AGENT_
    // CONFIGS's 11 names is ALSO a HOSTS display_name, so a break that zeroed
    // out agentDisplayNames() alone would still leave knownEngineNames()'s
    // union at 16 and the combined test above green. Each side needs its
    // own floor so that specific break cannot hide.
    expect(agentDisplayNames().length).toBeGreaterThanOrEqual(11);
    expect(hostDisplayNames().length).toBeGreaterThanOrEqual(16);
  });

  it("verifies no engine/host display name is hardcoded in src/components/**, and no stale allowlist entry exists", () => {
    // Scoped to src/components/** only (F2 ruling): engine names live
    // legitimately in src/data/ and brands.ts (BrandId, icon marks — no
    // display names at all, per that file's own header comment) and in
    // src/utils/ (e.g. mcpServerView.ts, assetProvenance.ts), neither of
    // which this walk visits.
    const componentsDir = path.resolve(__dirname, "../components");
    const rootDir = path.resolve(__dirname, "../..");
    const needles = knownEngineNames();
    const files = getComponentFiles(componentsDir);

    const actualMatches: Array<{ file: string; line: string; lineNumber: number; needle: string }> = [];

    for (const file of files) {
      const relPath = path.relative(rootDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        for (const needle of needles) {
          if (line.includes(needle)) {
            actualMatches.push({ file: relPath, line: line.trim(), lineNumber: idx + 1, needle });
            break;
          }
        }
      });
    }

    const matchedAllowlistIndices = new Set<number>();

    for (const match of actualMatches) {
      const allowlistIdx = ALLOWLIST.findIndex(
        (entry, idx) =>
          !matchedAllowlistIndices.has(idx) && entry.file === match.file && entry.linePattern.test(match.line)
      );

      if (allowlistIdx === -1) {
        throw new Error(
          `Hardcoded engine/host name "${match.needle}" detected at ${match.file}:${match.lineNumber}:\n  "${match.line}"\nAppendix A.5: no engine name is a string literal in the view layer. Substitute the name from a prop or a backend field instead.`
        );
      } else {
        matchedAllowlistIndices.add(allowlistIdx);
      }
    }

    expect(actualMatches.length).toBeGreaterThan(0);

    ALLOWLIST.forEach((entry, idx) => {
      if (!matchedAllowlistIndices.has(idx)) {
        throw new Error(
          `Stale allowlist entry found at index ${idx} for ${entry.file} (${entry.linePattern}). Remove this entry from the ALLOWLIST.`
        );
      }
    });
  });
});
