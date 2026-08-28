// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import NeedsReviewPane from "../components/NeedsReviewPane";
import ReviewInspector from "../components/ReviewInspector";
import { deriveReviewIssues } from "../utils/reviewIssues";
import type { Inventory } from "../App";

vi.mock("@tauri-apps/plugin-opener", () => ({
  revealItemInDir: vi.fn(async () => {}),
}));

const SHARED_SOURCE = "/home/me/.agents/skills/chrome-cdp";

const inventory: Inventory = {
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    // A broken link whose source also feeds a link in another repository.
    {
      id: "1", name: "chrome-cdp", description: "", version: "1",
      path: "/metrics-board/.claude/skills/chrome-cdp",
      scope: { Project: { agent: "claude", root: "/metrics-board" } },
      link_state: "broken", is_symlink: true, source_path: SHARED_SOURCE,
    },
    {
      id: "2", name: "chrome-cdp", description: "", version: "1",
      path: "/skills/.claude/skills/chrome-cdp",
      scope: { Project: { agent: "claude", root: "/skills" } },
      link_state: "linked", is_symlink: true, source_path: SHARED_SOURCE,
    },
    // A plain repo-level drift, owned by one place.
    {
      id: "3", name: "brand-voice", description: "", version: "1",
      path: "/metrics-board/.claude/skills/brand-voice",
      scope: { Project: { agent: "claude", root: "/metrics-board" } },
      link_state: "drifted", source_path: "/home/me/.agents/skills/brand-voice",
    },
    // A name that exists in two repositories and nowhere else — cross-repo.
    {
      id: "4", name: "agent-browser", description: "", version: "1",
      path: "/one/.claude/skills/agent-browser",
      scope: { Project: { agent: "claude", root: "/one" } },
    },
    {
      id: "5", name: "agent-browser", description: "", version: "1",
      path: "/two/.claude/skills/agent-browser",
      scope: { Project: { agent: "claude", root: "/two" } },
    },
  ] as Inventory["skills"],
};

const { issues, counts } = deriveReviewIssues(inventory);

function renderPane(over: Partial<React.ComponentProps<typeof NeedsReviewPane>> = {}) {
  const props = {
    issues,
    counts,
    kind: null,
    place: null,
    filterText: "",
    selectedId: null,
    onSelectKind: vi.fn(),
    onSelectPlace: vi.fn(),
    onSelectIssue: vi.fn(),
    ...over,
  };
  render(<NeedsReviewPane {...props} />);
  return props;
}

describe("Needs review — repo-level and cross-repo in one list", () => {
  beforeEach(cleanup);

  it("keeps repo-level issues and names the repository that owns them", () => {
    renderPane();
    expect(screen.getByText("brand-voice")).toBeTruthy();
    expect(screen.getByText("Copy diverged")).toBeTruthy();
    expect(screen.getAllByText("metrics-board").length).toBeGreaterThan(0);
  });

  it("shows an issue that spans repositories, counted once and labelled as such", () => {
    renderPane();
    expect(screen.getByText("agent-browser")).toBeTruthy();
    expect(screen.getByText("2 copies, no shared source")).toBeTruthy();
    // chrome-cdp spans two repositories too, so the label is not unique.
    expect(screen.getAllByText("2 repos").length).toBeGreaterThan(0);
  });

  it("makes the symlink visible in its own column", () => {
    renderPane();
    // A linked asset points somewhere; the row says where.
    expect(screen.getAllByText("→ chrome-cdp").length).toBeGreaterThan(0);
    expect(screen.getByText("→ brand-voice")).toBeTruthy();
    // A plain copy points nowhere, and says so rather than looking broken.
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("leads with the count of decisions and how many reach past one repository", () => {
    renderPane();
    expect(screen.getByTestId("review-total").textContent).toBe(String(counts.total));
    expect(screen.getByText("things need a decision from you")).toBeTruthy();
    expect(screen.getByText(/span more than one repository/)).toBeTruthy();
  });

  it("offers the cross-repo subset as a single action", () => {
    const props = renderPane();
    fireEvent.click(screen.getByRole("button", { name: /Show \d+ cross-repo/ }));
    expect(props.onSelectPlace).toHaveBeenCalledWith("cross");
  });

  it("narrows to cross-repo issues when that place is chosen", () => {
    renderPane({ place: "cross" });
    expect(screen.getByText("agent-browser")).toBeTruthy();
    expect(screen.queryByText("brand-voice")).toBeNull();
  });

  it("narrows to repo-level issues when that place is chosen", () => {
    renderPane({ place: "repo" });
    expect(screen.getByText("brand-voice")).toBeTruthy();
    expect(screen.queryByText("agent-browser")).toBeNull();
  });

  it("filters through the toolbar field", () => {
    renderPane({ filterText: "brand" });
    expect(screen.getByText("brand-voice")).toBeTruthy();
    expect(screen.queryByText("agent-browser")).toBeNull();
  });

  const clean = { broken: 0, drifted: 0, duplicate: 0, parse: 0, crossRepo: 0, total: 0 };

  it("says plainly when the machine is clean — after a scan has actually looked", () => {
    renderPane({ issues: [], counts: clean, scannedAt: new Date() });
    expect(
      screen.getByText("Nothing needs a decision. Every link resolves and every file parses.")
    ).toBeTruthy();
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    // v5 mark: the monitor's check tick, played once on mount.
    const body = screen
      .getByText("Nothing needs a decision. Every link resolves and every file parses.")
      .closest("div")!;
    expect(body.querySelector('path[d="m9 10 2 2 4-4"]')).toBeTruthy();
    expect(body.querySelector("g.aim-once")).toBeTruthy();
  });

  it("makes no claim before the first scan completes", () => {
    // Zero issues from a null inventory is not a clean machine, it is an
    // unscanned one. Seen 2026-08-16 during the first scan on a fresh store.
    renderPane({ issues: [], counts: clean, scanning: true, scannedAt: null });
    expect(screen.getByTestId("scan-pending")).toBeTruthy();
    expect(screen.getByText("Scanning your machine. Anything that needs a decision shows up here once the scan finishes.")).toBeTruthy();
    expect(screen.queryByText(/Nothing needs a decision/)).toBeNull();
    // v5 mark: the disc turns while the scan runs.
    const body = screen.getByTestId("scan-pending");
    expect(body.querySelector('path[d="M6 12c0-1.7.7-3.2 1.8-4.2"]')).toBeTruthy();
    expect(body.querySelector("g.aim-loop")).toBeTruthy();
  });

  it("with no scan running and none finished, says so rather than 'clean'", () => {
    renderPane({ issues: [], counts: clean, scanning: false, scannedAt: null });
    expect(screen.getByText("Not scanned yet. Rescan when you're ready.")).toBeTruthy();
    expect(screen.queryByText(/Nothing needs a decision/)).toBeNull();
    // v5 mark: the clock's hands sweep once and stop — the rest state before a scan.
    const body = screen.getByTestId("scan-pending");
    expect(body.querySelector('path[d="M16 14v2l1 1"]')).toBeTruthy();
    expect(body.querySelector("g.aim-once")).toBeTruthy();
  });

  it("a filter that matches nothing is still 'no match', scanned or not", () => {
    renderPane({ filterText: "zzz-no-such-asset", scannedAt: null });
    expect(screen.getByText("No issue matches that filter.")).toBeTruthy();
    expect(screen.queryByTestId("scan-pending")).toBeNull();
    // Deferred by ruling: a filtered-empty list stays text-only, no mark.
    const body = screen.getByText("No issue matches that filter.").closest("div")!;
    expect(body.querySelector("svg")).toBeNull();
  });

  it("hands the whole issue to the inspector when a row is tapped", () => {
    const props = renderPane();
    fireEvent.click(screen.getByText("brand-voice"));
    expect(props.onSelectIssue).toHaveBeenCalledWith(
      expect.objectContaining({ name: "brand-voice", kind: "drifted" })
    );
  });
});

describe("Review inspector — provenance", () => {
  beforeEach(cleanup);

  const broken = issues.find((i) => i.kind === "broken")!;
  const duplicate = issues.find((i) => i.kind === "duplicate")!;

  it("explains a broken link as a relationship, not a status word", () => {
    render(
      <ReviewInspector issue={broken} position={1} outOf={4} onSkip={vi.fn()} />
    );

    expect(screen.getByText("Broken link")).toBeTruthy();
    expect(screen.getByText("Symlink points at a file that no longer exists")).toBeTruthy();
    expect(screen.getByText("Link lives at")).toBeTruthy();
    expect(screen.getByText("Points at")).toBeTruthy();
    expect(screen.getByText(SHARED_SOURCE)).toBeTruthy();
  });

  it("names the other links the same broken source feeds", () => {
    render(
      <ReviewInspector issue={broken} position={1} outOf={4} onSkip={vi.fn()} />
    );

    expect(screen.getByText("The same source also feeds")).toBeTruthy();
    expect(screen.getByText("/skills/.claude/skills/chrome-cdp")).toBeTruthy();
    expect(screen.getByText(/Repointing the source fixes all of them at once/)).toBeTruthy();
    expect(screen.getByText("More than one repository")).toBeTruthy();
  });

  it("lists every copy of a duplicate rather than nominating a winner", () => {
    render(
      <ReviewInspector issue={duplicate} position={2} outOf={4} onSkip={vi.fn()} />
    );

    expect(screen.getAllByText("Copy")).toHaveLength(2);
    // The first copy also names the row, so it appears in the pathline too.
    expect(screen.getAllByText("/one/.claude/skills/agent-browser").length).toBe(2);
    expect(screen.getByText("/two/.claude/skills/agent-browser")).toBeTruthy();
    expect(screen.getByText("Depends on what you choose")).toBeTruthy();
  });

  it("says where it is in the list it is stepping through", () => {
    render(
      <ReviewInspector issue={broken} position={1} outOf={4} onSkip={vi.fn()} />
    );
    expect(screen.getByText("1 of 4")).toBeTruthy();
  });

  it("asks for a selection rather than showing an empty shell", () => {
    render(
      <ReviewInspector issue={null} position={0} outOf={0} onSkip={vi.fn()} />
    );
    expect(screen.getByText("Nothing selected")).toBeTruthy();
  });

  // Class-contract only (Task 7, docs/v7-todo-content-typography): asserts
  // Tailwind classes on rendered nodes, not layout or geometry — happy-dom
  // lays nothing out (see verification.md).
  it("Where/Reaches dt-dd pairs use the row roles; no shouting headers; kind line follows the title", () => {
    const { container } = render(
      <ReviewInspector issue={broken} position={1} outOf={4} onSkip={vi.fn()} />
    );

    const dl = container.querySelector("dl")!;
    const dts = container.querySelectorAll("dt");
    const dds = container.querySelectorAll("dd");
    expect(dts.length).toBe(3);
    expect(dds.length).toBe(3);
    // The dl's own size moved off text-small onto text-base-app — asserted
    // directly, since the dt/dd checks below pin their own classes, not
    // the container's.
    expect(dl.className).toContain("text-base-app");
    expect(dl.className).not.toContain("text-small");
    dts.forEach((dt) => {
      expect(dt.className).toContain("text-base-app");
      expect(dt.className).toContain("text-ink-3");
    });
    dds.forEach((dd) => {
      // text-ink-1 alone survives a revert (it was the pre-migration class
      // verbatim); text-base-app is what actually moved.
      expect(dd.className).toContain("text-base-app");
      expect(dd.className).toContain("text-ink-1");
      expect(dd.className).toContain("leading-body");
    });

    // No heading in the rendered inspector is still shouted in caps — R1/R2.
    container.querySelectorAll("*").forEach((el) => {
      const cls = el.getAttribute("class") ?? "";
      expect(cls).not.toMatch(/\buppercase\b/);
    });

    // R2: the kind line ("Broken link · …") reads below the h2 title, not
    // above it.
    const h2 = container.querySelector("h2")!;
    const kindLine = screen.getByText("Broken link").closest("div")!;
    expect(
      h2.compareDocumentPosition(kindLine) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
