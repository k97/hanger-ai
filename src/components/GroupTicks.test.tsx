// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import GroupTicks, { type TickGroup } from "./GroupTicks";

const scroller = vi.hoisted(() => ({
  visibleMessageIds: [] as string[],
  scrollToMessage: vi.fn(),
}));

vi.mock("@shadcn/react/message-scroller", () => ({
  useMessageScroller: () => ({
    scrollToEnd: vi.fn(),
    scrollToMessage: scroller.scrollToMessage,
    scrollToStart: vi.fn(),
  }),
  useMessageScrollerVisibility: () => ({
    currentAnchorId: null,
    visibleMessageIds: scroller.visibleMessageIds,
  }),
}));

const GROUPS: TickGroup[] = [
  { id: "group-skills", label: "Skills", count: 554 },
  { id: "group-tools", label: "MCP servers", count: 33 },
  { id: "group-rules", label: "Rules", count: 3 },
];

function Harness({ groups = GROUPS }: { groups?: TickGroup[] }) {
  return <GroupTicks groups={groups} />;
}

const popup = () => document.querySelector('[data-slot="hover-card-content"]');

describe("GroupTicks", () => {
  beforeEach(() => {
    scroller.visibleMessageIds = [];
    scroller.scrollToMessage.mockReset().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("is a nav named 'Jump to a group'", () => {
    render(<Harness />);
    expect(screen.getByRole("navigation", { name: "Jump to a group" })).toBeTruthy();
  });

  it("names each tick with its header's own label and count", () => {
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Skills · 554" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "MCP servers · 33" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Rules · 3" })).toBeTruthy();
  });

  it("names a tick with only the label when its header has no count", () => {
    render(
      <Harness
        groups={[
          { id: "group-skills", label: "Skills", count: null },
          { id: "group-not-loaded", label: "Not loaded by Codex", count: null },
        ]}
      />
    );
    expect(screen.getByRole("button", { name: "Skills" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Not loaded by Codex" })).toBeTruthy();
  });

  it("marks the first visible ticked item current in document order", () => {
    scroller.visibleMessageIds = ["group-agents", "group-tools", "group-rules"];
    render(<Harness />);

    expect(screen.getByRole("button", { name: "MCP servers · 33" }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByRole("button", { name: "Rules · 3" }).getAttribute("aria-current")).toBeNull();
    expect(screen.getByRole("button", { name: "Skills · 554" }).getAttribute("aria-current")).toBeNull();
  });

  it("falls back to the first ticked group when none are visible", () => {
    scroller.visibleMessageIds = ["group-agents", "not-a-ticked-group"];
    render(<Harness />);

    expect(screen.getByRole("button", { name: "Skills · 554" }).getAttribute("aria-current")).toBe("true");
  });

  it("jumps to the selected group item with start alignment", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "MCP servers · 33" }));

    expect(scroller.scrollToMessage).toHaveBeenCalledWith("group-tools", { align: "start" });
  });

  it("opens the title/count preview on keyboard focus", async () => {
    render(<Harness />);
    fireEvent.focus(screen.getByRole("button", { name: "Rules · 3" }));

    await waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()!.textContent).toBe("Rules · 3");
    expect(within(popup() as HTMLElement).queryByText("atlas")).toBeNull();
  });

  it("opens the title/count preview on pointer hover", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Rules · 3" });
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.mouseEnter(trigger);

    await waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()!.textContent).toBe("Rules · 3");
  });

  it("shows only the label in the preview when the group count is null", async () => {
    render(
      <Harness
        groups={[
          { id: "group-skills", label: "Skills", count: null },
          { id: "group-not-loaded", label: "Not loaded by Codex", count: null },
        ]}
      />
    );
    fireEvent.focus(screen.getByRole("button", { name: "Not loaded by Codex" }));

    await waitFor(() => expect(popup()).not.toBeNull());
    expect(popup()!.textContent).toBe("Not loaded by Codex");
  });

  it("draws nothing for a single group, which has nowhere to jump", () => {
    render(<Harness groups={[GROUPS[0]]} />);
    expect(screen.queryByRole("navigation", { name: "Jump to a group" })).toBeNull();
  });
});
