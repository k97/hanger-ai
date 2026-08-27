// @vitest-environment happy-dom
//
// happy-dom lays nothing out — these tests pin the state contract
// (collapsed/expanded, presence/absence, wiring to `openUrl`); indentation,
// the plane fill and hover motion are geometry, unassertable here, and go to
// Task 12's screenshot (`verification.md`, happy-dom).
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";

const openUrl = vi.fn(async (..._args: unknown[]) => {});
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...a: unknown[]) => openUrl(...a),
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn().mockResolvedValue(null) }));

import AssetDetail from "./AssetDetail";

const delivered = {
  category: "Skills",
  name: "delivered-skill",
  path: "/home/.claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/delivered-skill",
  origin: {
    label: "owner/market-repo",
    url: "https://github.com/owner/market-repo",
    kind: "delivered" as const,
    commit: "b0b9f02b0581696da41e20d6c536ec639b44080f",
    delivered_by: "tool-x",
    installed_at_ms: 1784500208089,
  },
};

// The Identity section — and the Origin row inside it — only renders on the
// Details tab (AssetDetail opens on Content). Drive the real tab control
// rather than an injected starting state, which would couple these tests to
// unlanded work elsewhere in this same file.
const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));

describe("the Origin row", () => {
  beforeEach(() => {
    cleanup();
    openUrl.mockClear();
  });

  it("links the label and opens externally on click", () => {
    render(<AssetDetail asset={delivered} inventory={null} />);
    openDetails();
    const link = screen.getByTestId("origin-open-link");
    expect(link.textContent).toContain("owner/market-repo");
    fireEvent.click(link);
    expect(openUrl).toHaveBeenCalledWith("https://github.com/owner/market-repo");
  });

  it("discloses the delivery facts on demand, collapsed first", () => {
    render(<AssetDetail asset={delivered} inventory={null} />);
    openDetails();
    expect(screen.queryAllByTestId("origin-sub-row")).toHaveLength(0);
    const chevron = screen.getByTestId("origin-disclosure");
    expect(chevron.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chevron);
    expect(chevron.getAttribute("aria-expanded")).toBe("true");
    const rows = screen.getAllByTestId("origin-sub-row");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("b0b9f02"),
      expect.stringContaining("tool-x"),
      expect.stringContaining("2026"),
    ]);
  });

  it("renders no chevron and no link when nothing was found", () => {
    render(<AssetDetail asset={{ category: "Skills", name: "plain", path: "/x" }} inventory={null} />);
    openDetails();
    expect(screen.queryByTestId("origin-disclosure")).toBeNull();
    expect(screen.queryByTestId("origin-open-link")).toBeNull();
    expect(screen.getByTestId("identity-row-origin").textContent).toContain("Written here");
  });

  it("words a blocked check differently from an empty one", () => {
    render(
      <AssetDetail
        asset={{ category: "Skills", name: "p", path: "/x", origin_blocked: true }}
        inventory={null}
      />
    );
    openDetails();
    expect(screen.getByTestId("identity-row-origin").textContent).toContain("Not determined");
  });

  // The mirror of the disclosure test above: everything belonging to the
  // asset itself — including whether its Origin disclosure is open — resets
  // when the inspector moves to a different asset. Written before the reset
  // line landed, so it was seen red first.
  it("closes the Origin disclosure when the inspector moves to another asset", () => {
    const { rerender } = render(<AssetDetail asset={delivered} inventory={null} />);
    openDetails();
    const chevron = screen.getByTestId("origin-disclosure");
    fireEvent.click(chevron);
    expect(screen.getAllByTestId("origin-sub-row").length).toBeGreaterThan(0);

    const other = {
      ...delivered,
      name: "other-delivered-skill",
      path: "/home/.claude/plugins/cache/mkt-a/tool-x/1.0.0/skills/other-delivered-skill",
    };
    rerender(<AssetDetail asset={other} inventory={null} />);
    // Whatever the Details tab's own persistence does across a rerender is a
    // fact about the peer's work, not this test's business — click it again
    // so this assertion depends only on the Origin row's own reset.
    openDetails();

    expect(screen.queryAllByTestId("origin-sub-row")).toHaveLength(0);
    expect(screen.getByTestId("origin-disclosure").getAttribute("aria-expanded")).toBe("false");
  });
});
