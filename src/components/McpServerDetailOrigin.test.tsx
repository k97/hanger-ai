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
