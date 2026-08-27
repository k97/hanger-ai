// @vitest-environment happy-dom
//
// happy-dom lays nothing out -- these tests pin the state contract (which
// registration shows an origin, its link wiring, its wording); indentation,
// truncation and hover motion are geometry, unassertable here.
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const openUrl = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

import McpServerDetail, { McpServerView } from "./McpServerDetail";

const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));

const base: McpServerView = {
  name: "context7",
  command: "npx",
  transport: "stdio",
  registrations: [
    {
      key: "cc-global",
      host: "Claude Code",
      tier: "global",
      configPath: "~/.claude/mcp.json",
      command: "npx",
      launchDisplay: "npx context7",
      origin: {
        label: "owner/market-repo",
        url: "https://github.com/owner/market-repo",
        kind: "delivered" as const,
        commit: "b0b9f02b0581696da41e20d6c536ec639b44080f",
        delivered_by: "tool-x",
      },
    },
    {
      key: "codex-global",
      host: "Codex",
      tier: "global",
      configPath: "~/.codex/config.toml",
      command: "npx",
      launchDisplay: "npx context7",
    },
  ],
  envKeys: [],
};

describe("the per-registration Origin line in McpServerDetail", () => {
  beforeEach(() => {
    cleanup();
    openUrl.mockClear();
  });
  afterEach(cleanup);

  it("links the delivered registration's origin and opens it externally on click", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    const link = screen.getByTestId("registration-origin-link");
    expect(link.textContent).toContain("owner/market-repo");
    expect(link.getAttribute("aria-label")).toContain(
      "Hanger read this from the plugin that installed it"
    );
    fireEvent.click(link);
    expect(openUrl).toHaveBeenCalledWith("https://github.com/owner/market-repo");
  });

  it("shows the pinned commit and delivering plugin on the delivered registration, not the install date", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    const detail = screen.getByTestId("registration-origin-detail");
    expect(detail.textContent).toContain("b0b9f02");
    expect(detail.textContent).toContain("tool-x");
    expect(detail.textContent).not.toContain("Installed");
  });

  it("renders no origin line at all for a registration with neither an origin nor a blocked check", () => {
    // The brief's rule: "Written here" is the ordinary, noisy case and must
    // not be restated on every row. If the origin line were rendered
    // unconditionally, this row -- which carries no `origin` and no
    // `originBlocked` -- would show it.
    render(<McpServerDetail server={base} />);
    openDetails();
    const rows = screen.getAllByTestId("registration-row");
    const codexRow = rows.find((r) => r.textContent?.includes("~/.codex/config.toml"))!;
    expect(codexRow.querySelector('[data-testid="registration-origin"]')).toBeNull();
    expect(codexRow.textContent).not.toContain("Written here");
  });

  it("words a blocked registration's origin differently from an absent one", () => {
    const withBlocked: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: undefined, originBlocked: true },
        base.registrations[1],
      ],
    };
    render(<McpServerDetail server={withBlocked} />);
    openDetails();
    const rows = screen.getAllByTestId("registration-row");
    const blockedRow = rows.find((r) => r.textContent?.includes("~/.claude/mcp.json"))!;
    expect(blockedRow.querySelector('[data-testid="registration-origin"]')?.textContent).toContain(
      "Not determined"
    );
  });

  it("keeps origin per registration -- a sibling with no origin does not inherit the delivered one", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    const links = screen.getAllByTestId("registration-origin-link");
    expect(links).toHaveLength(1);
  });
});

/**
 * `AssetDetail` puts an asset's origin in its Identity card; this panel used
 * to put it inside every "Registered in" block instead, which buried a
 * single-registration server's origin under one collapsed level while every
 * other asset showed it at the top -- `context7` on Karthik's machine has one
 * registration and its origin was invisible until Registered in was opened.
 *
 * When every registration agrees on their origin, it now renders once in
 * Identity & capabilities and the per-registration line above (the block
 * `describe` above pins) is dropped. Divergence keeps exactly that
 * per-registration rendering -- covered by the block above, whose fixture
 * (one delivered origin, one registration with none) is already the
 * divergent case and needed no changes for this task.
 */
describe("the collapsed Origin row in Identity & capabilities when registrations agree", () => {
  beforeEach(() => {
    cleanup();
    openUrl.mockClear();
  });
  afterEach(cleanup);

  const delivered = {
    label: "owner/market-repo",
    url: "https://github.com/owner/market-repo",
    kind: "delivered" as const,
    commit: "b0b9f02b0581696da41e20d6c536ec639b44080f",
    delivered_by: "tool-x",
    installed_at_ms: Date.UTC(2026, 0, 15),
  };

  it("a single registration's origin shows once, in Identity & capabilities, not on its own registration line", () => {
    // A single registration trivially agrees with itself -- this is the
    // context7 case the brief names.
    const solo: McpServerView = {
      ...base,
      registrations: [{ ...base.registrations[0], origin: delivered }],
    };
    render(<McpServerDetail server={solo} />);
    openDetails();
    const identityLink = screen.getByTestId("origin-open-link");
    expect(identityLink.textContent).toContain("owner/market-repo");
    expect(screen.queryByTestId("registration-origin")).toBeNull();
    expect(screen.queryByTestId("registration-origin-link")).toBeNull();
    expect(screen.queryByTestId("registration-origin-detail")).toBeNull();
  });

  it("shows the pinned commit, delivering plugin and install date behind the Identity Origin row's own disclosure", () => {
    // The delivery facts belong to the origin, so they move with it -- into
    // the same disclosure shape AssetDetail's own Identity Origin row
    // already uses, "Installed" included (the per-registration line used to
    // drop it deliberately; that reason no longer applies once this is the
    // Identity card's own row).
    const solo: McpServerView = {
      ...base,
      registrations: [{ ...base.registrations[0], origin: delivered }],
    };
    render(<McpServerDetail server={solo} />);
    openDetails();
    fireEvent.click(screen.getByTestId("origin-disclosure"));
    const subRows = screen.getAllByTestId("origin-sub-row").map((r) => r.textContent);
    expect(subRows.some((t) => t?.includes("b0b9f02"))).toBe(true);
    expect(subRows.some((t) => t?.includes("tool-x"))).toBe(true);
    expect(subRows.some((t) => t?.includes("Installed"))).toBe(true);
  });

  it("collapses two registrations that agree on the same origin url", () => {
    const agreeing: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: delivered },
        { ...base.registrations[1], origin: delivered },
      ],
    };
    render(<McpServerDetail server={agreeing} />);
    openDetails();
    expect(screen.getByTestId("origin-open-link").textContent).toContain("owner/market-repo");
    expect(screen.queryAllByTestId("registration-origin")).toHaveLength(0);
  });

  it("agrees on the label alone when neither registration's origin carries a url", () => {
    // "Compare on the origin's identity ... url where present, otherwise
    // label" -- two registrations with no url still need to be told apart
    // from a divergence.
    const noUrlOrigin = { label: "npx context7", kind: "launched" as const };
    const agreeing: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: noUrlOrigin },
        { ...base.registrations[1], origin: noUrlOrigin },
      ],
    };
    render(<McpServerDetail server={agreeing} />);
    openDetails();
    expect(screen.getByTestId("identity-row-origin").textContent).toContain("npx context7");
    expect(screen.queryAllByTestId("registration-origin")).toHaveLength(0);
  });

  it("diverges on kind even when url and label agree -- the tooltip states a mechanism, and collapsing would assert the first registration's mechanism for both", () => {
    // Same url, same label, different kind: one delivered by a plugin, one
    // read from the launch command. Their tooltips ("Hanger read this from
    // the plugin that installed it" vs. "Hanger read this from the launch
    // command") are not interchangeable, so agreeing on url/label alone is
    // not enough -- collapsing here would show one registration's mechanism
    // for both.
    const sameUrlDifferentKind: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: delivered },
        {
          ...base.registrations[1],
          origin: { label: delivered.label, url: delivered.url, kind: "launched" as const },
        },
      ],
    };
    render(<McpServerDetail server={sameUrlDifferentKind} />);
    openDetails();
    expect(screen.queryByTestId("identity-row-origin")).toBeNull();
    expect(screen.getAllByTestId("registration-origin-link")).toHaveLength(2);
  });

  it("keeps the per-registration rendering, with no Identity Origin row, when one registration has an origin and its sibling has none", () => {
    // `base` (top of file) is already this divergent shape: one delivered
    // origin, one registration with neither an origin nor a blocked check.
    render(<McpServerDetail server={base} />);
    openDetails();
    expect(screen.queryByTestId("identity-row-origin")).toBeNull();
    expect(screen.getByTestId("registration-origin-link")).toBeTruthy();
  });

  it("renders no Origin row anywhere when every registration found nothing -- the ordinary case", () => {
    const neither: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: undefined },
        base.registrations[1],
      ],
    };
    render(<McpServerDetail server={neither} />);
    openDetails();
    expect(screen.queryByTestId("identity-row-origin")).toBeNull();
    expect(screen.queryAllByTestId("registration-origin")).toHaveLength(0);
  });

  it("treats a blocked check as its own state -- a blocked registration diverges from a sibling with a real origin, same as it does from a sibling with none", () => {
    const blockedVsOrigin: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: undefined, originBlocked: true },
        { ...base.registrations[1], origin: delivered },
      ],
    };
    render(<McpServerDetail server={blockedVsOrigin} />);
    openDetails();
    expect(screen.queryByTestId("identity-row-origin")).toBeNull();
    const rows = screen.getAllByTestId("registration-row");
    const blockedRow = rows.find((r) => r.textContent?.includes("~/.claude/mcp.json"))!;
    expect(blockedRow.querySelector('[data-testid="registration-origin"]')?.textContent).toContain(
      "Not determined"
    );
  });

  it("collapses two registrations blocked the same way, wording the single row 'Not determined'", () => {
    const bothBlocked: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], origin: undefined, originBlocked: true },
        { ...base.registrations[1], origin: undefined, originBlocked: true },
      ],
    };
    render(<McpServerDetail server={bothBlocked} />);
    openDetails();
    expect(screen.getByTestId("identity-row-origin").textContent).toContain("Not determined");
    expect(screen.queryAllByTestId("registration-origin")).toHaveLength(0);
  });
});
