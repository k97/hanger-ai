import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

export type AllowlistCategory = "asset" | "ui" | "unclassified";

export interface AllowlistEntry {
  file: string;
  linePattern: RegExp;
  category: AllowlistCategory;
  reason: string;
}

// Allowlist derived from count-paths diagnostic
// Any match NOT on the allowlist fails the test.
// Any allowlist entry that no longer matches ALSO fails.
const ALLOWLIST: AllowlistEntry[] = [
  {
    file: "src/components/Sidebar.tsx",
    linePattern: /inventory\?\.\s*agents\.\s*length/,
    category: "asset",
    reason: "Counts detected agent roots in inventory",
  },
  {
    file: "src/components/Sidebar.tsx",
    linePattern: /linkedRepos\.\s*length/,
    category: "ui",
    reason: "Counts linked project roots for sidebar selection",
  },
  {
    file: "src/components/RepoPane.tsx",
    linePattern: /count=\{nonPermissionWarnings\.length\}/,
    category: "ui",
    reason: "Counts non-permission scan warning messages for DisclosureBanner",
  },
  {
    file: "src/components/Flyout.tsx",
    linePattern: /count:\s*filteredAssets\.length/,
    category: "asset",
    reason: "Counts filtered assets for flyout detail summary",
  },
  {
    file: "src/components/SidebarScanModal.tsx",
    linePattern: /const\s+selectedCount\s*=\s*Object\.values\(selectedCandidates\)/,
    category: "ui",
    reason: "Counts checked candidates in scan modal UI",
  },
];

function getAllSrcFiles(dir: string): string[] {
  const files: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") {
        files.push(...getAllSrcFiles(fullPath));
      }
    } else if (
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      files.push(fullPath);
    }
  }
  return files;
}

function isCountComputationLine(line: string): boolean {
  // Pattern 1: .length in a numeric sum (+ operator directly with .length) or assigned to identifier matching /count|total/i
  const hasLengthInSum = /\.length\s*\+|\+\s*[a-zA-Z0-9_$.?]*\.length|agentSkillsCount\s*\+/.test(line);
  const hasLengthCountAssignment = /([a-zA-Z0-9_$]*(count|total)[a-zA-Z0-9_$]*\s*[:=].*\.length|const\s+totalGlobalAssets\s*=)/i.test(line);
  const hasInventoryLengthAccess = /(inventory\?\.[a-zA-Z0-9_$]+\.length|linkedRepos\.length(?!\s*(>|===|==|!=|!==)\s*0)|\bcount:\s*[a-zA-Z0-9_$]+\.length)/.test(line);

  // Pattern 2: .reduce( over array
  const hasReduce = /\.reduce\s*\(/.test(line);

  return hasLengthInSum || hasLengthCountAssignment || hasInventoryLengthAccess || hasReduce;
}

describe("No Frontend Counting Enforcement", () => {
  it("verifies that all count computations in src/ match the allowlist and no stale allowlist entries exist", () => {
    const srcDir = path.resolve(__dirname, "..");
    const files = getAllSrcFiles(srcDir);
    const rootDir = path.resolve(__dirname, "../..");

    const actualMatches: Array<{ file: string; line: string; lineNumber: number }> = [];

    for (const file of files) {
      const relPath = path.relative(rootDir, file);
      const content = fs.readFileSync(file, "utf-8");
      const lines = content.split("\n");

      lines.forEach((line, idx) => {
        if (isCountComputationLine(line)) {
          actualMatches.push({
            file: relPath,
            line: line.trim(),
            lineNumber: idx + 1,
          });
        }
      });
    }

    const matchedAllowlistIndices = new Set<number>();

    // Check each actual match against allowlist
    for (const match of actualMatches) {
      const allowlistIdx = ALLOWLIST.findIndex(
        (entry) => entry.file === match.file && entry.linePattern.test(match.line)
      );

      if (allowlistIdx === -1) {
        throw new Error(
          `Forbidden frontend count computation detected at ${match.file}:${match.lineNumber}:\n  "${match.line}"\nThis violates the count contract. Frontend must render counts from get_asset_counts.`
        );
      } else {
        matchedAllowlistIndices.add(allowlistIdx);
      }
    }

    expect(actualMatches.length).toBeGreaterThan(0);

    // Check for stale allowlist entries
    ALLOWLIST.forEach((entry, idx) => {
      if (!matchedAllowlistIndices.has(idx)) {
        throw new Error(
          `Stale allowlist entry found at index ${idx} for ${entry.file} (${entry.linePattern}). Remove this entry from the ALLOWLIST.`
        );
      }
    });
  });
});
