// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import DiscoverySidebar from "../components/DiscoverySidebar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => null),
}));

// Class-contract guard. DiscoverySidebar is the smallest of the four and
// carries both the group label and the count; the other three share the
// same strings by import, which Task 8's guard then holds. happy-dom lays
// out nothing, so this asserts className membership only, never geometry.
describe("sidebar type roles", () => {
  it("group labels are sentence-case body in --ink-3; counts are caption size", () => {
    // use the props the existing DiscoverySidebar/DiscoveryPane tests render with
    render(
      <DiscoverySidebar
        width={216}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        kind="All"
        onSelectKind={() => {}}
      />
    );
    const group = screen.getByText("Categories");
    expect(group.className).toContain("text-base-app");
    expect(group.className).toContain("text-ink-3");
    expect(group.className).not.toContain("uppercase");
    expect(group.className).not.toContain("tracking-[.06em]");
    const count = screen.getAllByText(/^\d+$/)[0];
    expect(count.className).toContain("text-small");
    expect(count.className).not.toContain("text-micro");
  });
});
