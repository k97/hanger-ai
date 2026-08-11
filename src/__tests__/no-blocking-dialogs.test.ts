// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("No blocking window dialogs in handleAddRepo", () => {
  it("should not contain window.confirm, window.alert, or window.prompt in handleAddRepo", () => {
    const sidebarPath = path.resolve(__dirname, "../components/Sidebar.tsx");
    const content = fs.readFileSync(sidebarPath, "utf-8");

    // Extract handleAddRepo function block
    const handleAddRepoMatch = content.match(/const handleAddRepo = async \(\) => \{([\s\S]*?)\n  \};/);
    const handleAddRepoCode = handleAddRepoMatch ? handleAddRepoMatch[1] : content;

    const violations: string[] = [];
    const lines = handleAddRepoCode.split("\n");
    const patterns = [/window\.confirm\s*\(/, /window\.alert\s*\(/, /window\.prompt\s*\(/];

    lines.forEach((line) => {
      for (const pattern of patterns) {
        if (pattern.test(line)) {
          violations.push(`Sidebar.tsx:handleAddRepo: ${line.trim()}`);
        }
      }
    });

    expect(violations, `Found forbidden window dialog calls in handleAddRepo:\n${violations.join("\n")}`).toEqual([]);
  });
});
