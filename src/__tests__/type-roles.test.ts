import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";

// Scans every non-test .tsx under src/ for three things the inspector
// migration retired: Tailwind's default size names (the app's scale is
// text-micro/small/base-app/lg-app/display), arbitrary or default leading
// (the app's leadings are leading-body/caption/code), and uppercase, checked
// everywhere now rather than only inside ROLE_FILES (ruling R1, 2026-08-27:
// a revert of a migrated file's group label to the pre-migration
// `text-micro font-medium text-ink-3`, dropping only `uppercase`, still
// contains `text-ink-3`/`font-medium` and so passed a ROLE_FILES-gated
// case check undetected). ALLOW is now the complete to-do for all three --
// size, leading and case -- across every file the migration has not yet
// reached; ROLE_FILES still names the files this migration claims as done,
// and a hit inside one of them that nonetheless matches an ALLOW entry
// fails its own check below rather than being silently forgiven. Allowlist
// entries name a file, the exact line text, and a reason; an entry that
// stops matching fails the run so the list cannot go stale.
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
  { file: "src/components/SidebarScanModal.tsx", lineText: "text-small text-ink-3 leading-relaxed", reason: "pre-dates the roles; SidebarScanModal.tsx pass pending" },
  { file: "src/App.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.65]">', reason: "pre-dates the roles; App.tsx pass pending (2 identical sites: lines 1141/1159)" },
  { file: "src/App.tsx", lineText: "text-small text-ink-3 leading-[1.65]", reason: "pre-dates the roles; App.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: "px-3 pb-4 text-small text-ink-2 leading-[1.55] max-w-[74ch]", reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: '<p className="text-small text-ink-2 leading-[1.55] max-w-[74ch]">', reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/FindingPopover.tsx", lineText: "text-small leading-[1.5]", reason: "pre-dates the roles; moved out of FindingChip.tsx by the Task 3 popover-extraction refactor (2026-08-28), pass still pending" },
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
  // The 22 surviving `uppercase` sites the case check now reaches outside
  // ROLE_FILES, once the ROLE_FILES gate on CAPS was dropped (commit
  // "the guard's case check reaches every file", 2026-08-28).
  { file: "src/App.tsx", lineText: "text-micro font-medium uppercase tracking-[.06em] text-ink-3 font-flex", reason: "pre-dates the roles; App.tsx pass pending (2 identical sites: lines 2107/2132)" },
  { file: "src/components/DesignSystemPane.tsx", lineText: "font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3", reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: '<span className="ml-auto uppercase tracking-[.06em]">sample</span>', reason: "pre-dates the roles; DesignSystemPane.tsx pass pending" },
  { file: "src/components/DesignSystemPane.tsx", lineText: "the utility voice is font-flex, micro, uppercase and tracked.", reason: "pre-dates the roles; DesignSystemPane.tsx pass pending -- prose describing the utility voice, not a class, but the guard reads every line" },
  { file: "src/components/DiffChooser.tsx", lineText: '<span className="text-micro font-medium text-ink-3 uppercase mr-2 select-none">Decision:</span>', reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "text-micro font-medium uppercase tracking-[.06em] text-ink-1 flex items-center gap-1", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "text-micro font-medium uppercase text-state-danger bg-plane px-1 rounded-inner", reason: "pre-dates the roles; DiffChooser.tsx pass pending (2 identical sites: lines 185/215)" },
  { file: "src/components/DiffChooser.tsx", lineText: "text-micro font-medium uppercase tracking-[.06em] text-ink-2 flex items-center gap-1", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/DiffChooser.tsx", lineText: "text-micro font-medium uppercase tracking-[.06em] text-ink-3 flex items-center gap-1 select-none", reason: "pre-dates the roles; DiffChooser.tsx pass pending" },
  { file: "src/components/LinkMapPane.tsx", lineText: "font-flex text-micro tracking-[.09em] uppercase fill-ink-3 select-none", reason: "pre-dates the roles; LinkMapPane.tsx pass pending" },
  { file: "src/components/LinkMapPane.tsx", lineText: "font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-0.5 pb-1.5", reason: "pre-dates the roles; LinkMapPane.tsx pass pending" },
  { file: "src/components/LinkMapPlacecard.tsx", lineText: "flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5", reason: "pre-dates the roles; LinkMapPlacecard.tsx pass pending (3 identical sites: lines 138/202/284)" },
  { file: "src/components/LinkMapPlacecard.tsx", lineText: "mx-4 mb-1.5 font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3", reason: "pre-dates the roles; LinkMapPlacecard.tsx pass pending" },
  { file: "src/components/LinkPanel.tsx", lineText: "block font-flex text-micro font-medium uppercase tracking-[.06em] text-ink-3 mb-[7px] select-none", reason: "pre-dates the roles; LinkPanel.tsx pass pending" },
  { file: "src/components/LinkPanel.tsx", lineText: "py-2.5 font-flex text-micro uppercase tracking-[.06em] text-ink-3", reason: "pre-dates the roles; LinkPanel.tsx pass pending" },
  { file: "src/components/NeedsReviewPane.tsx", lineText: "font-flex text-micro tracking-[.06em] uppercase text-ink-3", reason: "pre-dates the roles; NeedsReviewPane.tsx pass pending" },
  { file: "src/components/OverflowMenu.tsx", lineText: "font-flex text-micro tracking-[.06em] uppercase text-ink-3 px-1.5 pt-1 pb-1", reason: "pre-dates the roles; OverflowMenu.tsx pass pending" },
  { file: "src/components/RepoPane.tsx", lineText: '<h3 className="font-medium tracking-[.06em] uppercase">Engines</h3>', reason: "pre-dates the roles; RepoPane.tsx pass pending — the one eyebrow left in a file whose group headers migrated" },
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
  // A hit inside a ROLE_FILE that still matches an ALLOW entry would be a
  // migrated file's regression masquerading as pre-existing debt -- the
  // allowlist exists for files whose pass has not happened yet, not for
  // files this migration already claims to own. Matched by exact basename:
  // `f.endsWith(n)` would let e.g. a hypothetical "NotAssetRow.tsx" match
  // ROLE_FILES' "AssetRow.tsx" entry, the same suffix-match bug the ALLOW
  // lookup below still has for its own (full relative path) strings.
  const roleFileAllowHits: string[] = [];
  const used = new Set<number>();
  for (const f of files) {
    const lines = readFileSync(f, "utf8").split("\n");
    const inRoles = ROLE_FILES.includes(basename(f));
    lines.forEach((line, i) => {
      const bad = SIZE.test(line) || LEADING.test(line) || CAPS.test(line);
      if (!bad) return;
      const idx = ALLOW.findIndex((a) => f.endsWith(a.file) && line.includes(a.lineText));
      if (idx >= 0) {
        used.add(idx);
        if (inRoles) roleFileAllowHits.push(`${f}:${i + 1}: ${line.trim()}`);
        return;
      }
      hits.push(`${f}:${i + 1}: ${line.trim()}`);
    });
  }
  it("uses only the app's size, leading and case roles", () => {
    expect(hits).toEqual([]);
  });
  it("has no stale allowlist entries", () => {
    expect(ALLOW.map((_, i) => i).filter((i) => !used.has(i))).toEqual([]);
  });
  it("never allowlists a hit inside a migrated role file -- that would mask a regression", () => {
    expect(roleFileAllowHits).toEqual([]);
  });
});
