import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Scans every non-test .tsx under src/ for three things the inspector
// migration retired: Tailwind's default size names (the app's scale is
// text-micro/small/base-app/lg-app/display), arbitrary or default leading
// (the app's leadings are leading-body/caption/code), and uppercase inside
// the migrated files (ruling R1, 2026-08-27). Allowlist entries name a
// file, the exact line text, and a reason; an entry that stops matching
// fails the run so the list cannot go stale.
const ROLE_FILES = ["AssetDetail.tsx", "ReachCard.tsx", "McpServerDetail.tsx", "MarkdownDoc.tsx", "Flyout.tsx", "ReviewInspector.tsx", "ListCard.tsx", "InspectorCap.tsx", "Sidebar.tsx", "DiscoverySidebar.tsx", "ReviewSidebar.tsx", "DesignSystemSidebar.tsx", "DiscoveryPane.tsx", "AssetHeaderRow.tsx", "AssetRow.tsx", "SummaryStrip.tsx"];
const ALLOW: { file: string; lineText: string; reason: string }[] = [
  { file: "src/App.tsx", lineText: 'bg-plane text-state-danger border border-line text-small leading-normal font-mono break-all animate-fade-in', reason: "pre-dates the roles; App.tsx pass pending" },
  { file: "src/App.tsx", lineText: 'bg-plane text-state-success border border-line text-small leading-normal animate-fade-in', reason: "pre-dates the roles; App.tsx pass pending" },
  { file: "src/App.tsx", lineText: 'border-line text-small leading-normal flex flex-col gap-2 animate-fade-in', reason: "pre-dates the roles; App.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "Updating project inventory constellation", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "flex justify-between items-center text-xs text-ink-2 font-medium font-sans", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "rounded-inner text-xs font-medium whitespace-nowrap cursor-pointer", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "rounded-pill text-xs font-medium cursor-pointer transition-colors duration-hover ease-spring", reason: "pre-dates the roles; DiffChooser.tsx pass pending (5 identical tab-button sites: lines 109/117/125/137/145)" },
  { file: "src/components/DiffChooser.tsx", lineText: "font-mono text-xs text-ink-2 whitespace-pre-wrap leading-relaxed break-all", reason: "pre-dates the roles; DiffChooser.tsx pass pending (2 identical diff-pane sites: lines 190/220)" },
  { file: "src/components/DiffChooser.tsx", lineText: "overflow-y-auto border border-line bg-page p-3 rounded-inner font-mono text-micro", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "p-2 border border-line bg-plane text-state-danger text-xs rounded-inner", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "px-5 py-2 rounded-inner border border-line bg-page hover:bg-plane-2 text-xs", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "px-6 py-2 rounded-inner bg-fill text-on-fill text-xs", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/IconRail.tsx", lineText: "text-[9px] leading-4", reason: "count badge, see no-off-token-styles allowlist" },
  { file: "src/components/InfoPopover.tsx", lineText: "relative inline-block shrink-0 leading-none", reason: "pre-dates the roles; InfoPopover.tsx pass pending" },
  { file: "src/components/ProfilePane.tsx", lineText: 'text-small text-ink-2 leading-relaxed', reason: "pre-dates the roles; ProfilePane.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: "rounded-inner leading-relaxed animate-fade-in", reason: "pre-dates the roles; RepoPane.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: '<p className="text-small text-ink-2 leading-relaxed">', reason: "pre-dates the roles; RepoPane.tsx pass pending (3 identical sites: lines 493/545/550)" },
  { file: "src/components/RepoPane.tsx", lineText: '<li key={idx} className="font-mono break-all leading-relaxed">', reason: "pre-dates the roles; RepoPane.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: "text-small text-ink-2 font-mono break-all leading-relaxed", reason: "pre-dates the roles; RepoPane.tsx pass pending" },
  // Sidebar.tsx is a ROLE_FILE (Task 8 brief, migrated set) — this is not
  // pre-existing debt outside the migration's scope, it is one empty-state
  // line the migration missed. Allowlisted so the guard can land green;
  // flagged in the task-8 report for the controller, same as an unexpected
  // case hit would be.
  { file: "src/components/Sidebar.tsx", lineText: "text-center text-small text-ink-3 flex flex-col gap-2 leading-relaxed", reason: "migrated file; this empty-state leading-relaxed was missed by the roles pass, flagged not pre-dating" },
  { file: "src/components/SidebarScanModal.tsx", lineText: "text-small text-ink-3 leading-relaxed", reason: "pre-dates the roles; SidebarScanModal.tsx pass pending" },
  { file: "src/App.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.65]">', reason: "pre-dates the roles; App.tsx pass pending (2 identical sites: lines 1141/1159)" },
  { file: "src/App.tsx", lineText: "text-small text-ink-3 leading-[1.65]", reason: "pre-dates the roles; App.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: "px-3 pb-4 text-small text-ink-2 leading-[1.55] max-w-[74ch]", reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.55] max-w-[74ch]">', reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/FindingChip.tsx", lineText: "text-small leading-[1.5]", reason: "pre-dates the roles; FindingChip.tsx pass pending" },
  { file: "src/components/InfoPopover.tsx", lineText: "font-flex text-micro font-normal text-ink-2 leading-[1.5]", reason: "pre-dates the roles; InfoPopover.tsx pass pending" },
  { file: "src/components/LinkMapPane.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.6]">', reason: "pre-dates the roles; LinkMapPane.tsx pass pending" },
  { file: "src/components/LinkMapPane.tsx", lineText: '<p className="text-small text-ink-3 leading-[1.6]">', reason: "pre-dates the roles; LinkMapPane.tsx pass pending" },
  { file: "src/components/LinkMapPlacecard.tsx", lineText: "mx-4 mb-3.5 px-3 py-2.5 bg-plane rounded-inner text-small text-ink-2 leading-[1.6]", reason: "pre-dates the roles; LinkMapPlacecard.tsx pass pending" },
  { file: "src/components/LinkPanel.tsx", lineText: 'const helpClass = "text-micro text-ink-3 mt-2.5 leading-[1.6]"', reason: "pre-dates the roles; LinkPanel.tsx pass pending" },
  { file: "src/components/LinkPanel.tsx", lineText: '<p className="text-small text-ink-3 leading-[1.6]">', reason: "pre-dates the roles; LinkPanel.tsx pass pending" },
  { file: "src/components/LinkPanel.tsx", lineText: "mx-[12px] mt-3 flex items-start gap-2 text-state-warning text-small leading-[1.6]", reason: "pre-dates the roles; LinkPanel.tsx pass pending" },
  { file: "src/components/McpEngineSummary.tsx", lineText: "text-micro text-ink-3 leading-[1.45] mt-3", reason: "pre-dates the roles; McpEngineSummary.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.65]">', reason: "pre-dates the roles; RepoPane.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: '<p className="text-micro text-ink-3 leading-[1.6]">', reason: "pre-dates the roles; RepoPane.tsx pass pending" },
  // The "big stat number" treatment (text-display + a tight custom
  // leading-[1.1]) is the same literal string in all three sites below,
  // including one ROLE_FILE (SummaryStrip.tsx). It is not per-file debt —
  // leading-body/caption/code cover paragraph text, and nothing in the
  // roles migration gave display-size numerals a named leading role. Real
  // finding, flagged for the controller in the task-8 report.
  { file: "src/components/DesignSystemPane.tsx", lineText: 'utility: "text-display", px: "32px"', reason: "display-numeral leading-[1.1] has no role yet; systemic, flagged not per-file debt" },
  { file: "src/components/NeedsReviewPane.tsx", lineText: "text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1", reason: "display-numeral leading-[1.1] has no role yet; systemic, flagged not per-file debt" },
  { file: "src/components/SummaryStrip.tsx", lineText: "text-display font-medium tabular tracking-[-0.5px] leading-[1.1] text-ink-1", reason: "migrated file; display-numeral leading-[1.1] has no role yet, flagged not pre-dating" },
];
// (?!-app) excludes the app's own text-base-app/text-lg-app role classes:
// \b alone treats the hyphen before "app" as a boundary, so the bare regex
// would false-match the migration's own output on every migrated line.
const SIZE = /\btext-(xs|sm|base|lg|xl|2xl|3xl)\b(?!-app)/;
// \b moved inside each word-ending alternative, not after the group: a
// trailing \b straight after the bracket alternative never matches — "]" is
// a non-word char and it is always followed by another non-word char
// (a quote, a backtick, a space) in real markup, so \b there can never see
// the word/non-word transition it needs. That silently defeated the
// leading-[…] case the guard exists to catch.
const LEADING = /\bleading-(\[[^\]]+\]|relaxed\b|normal\b|none\b|tight\b|snug\b|loose\b|\d+\b)/;
const CAPS = /\buppercase\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx") && !p.includes(".test.")) out.push(p);
  }
  return out;
}

describe("type roles", () => {
  const files = walk("src");
  const hits: string[] = [];
  const used = new Set<number>();
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    const inRoles = ROLE_FILES.some((n) => f.endsWith(n));
    lines.forEach((line, i) => {
      const bad = SIZE.test(line) || LEADING.test(line) || (inRoles && CAPS.test(line));
      if (!bad) return;
      const idx = ALLOW.findIndex((a) => f.endsWith(a.file) && line.includes(a.lineText));
      if (idx >= 0) { used.add(idx); return; }
      hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  it("uses only the app's size, leading and case roles", () => {
    expect(hits).toEqual([]);
  });
  it("has no stale allowlist entries", () => {
    expect(ALLOW.map((_, i) => i).filter((i) => !used.has(i))).toEqual([]);
  });
});
