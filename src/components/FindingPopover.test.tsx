// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import FindingPopover from "./FindingPopover";

afterEach(cleanup);

const lines = [
  { severity: "warning" as const, text: "Running with no config behind it.", detail: "pid 24149 · node dist/index.js" },
  { severity: "danger" as const, text: "context7: 2 different launch specs" },
];

function renderOpen(align: "left" | "right" = "left", onClose = vi.fn()) {
  const host = createRef<HTMLDivElement>();
  const anchor = createRef<HTMLDivElement>();
  render(
    <div ref={host}>
      <div ref={anchor}>
        <FindingPopover open onClose={onClose} lines={lines} align={align} elevated clampTo={host} anchorRef={anchor} ariaLabel="2 flagged" />
      </div>
    </div>
  );
  return onClose;
}

describe("FindingPopover", () => {
  it("renders one line per finding, its detail in mono beneath", () => {
    renderOpen();
    const items = screen.getAllByTestId("finding-popover-line");
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain("Running with no config behind it.");
    expect(items[0].querySelector(".font-mono")?.textContent).toBe("pid 24149 · node dist/index.js");
    expect(items[1].querySelector(".font-mono")).toBeNull();
  });

  it("leads each line with its severity dot", () => {
    renderOpen();
    const items = screen.getAllByTestId("finding-popover-line");
    expect(items[0].querySelector("i")?.className).toContain("bg-state-warning");
    expect(items[1].querySelector("i")?.className).toContain("bg-state-danger");
  });

  it("renders nothing when closed", () => {
    const host = createRef<HTMLDivElement>();
    render(<div ref={host}><FindingPopover open={false} onClose={vi.fn()} lines={lines} align="left" elevated clampTo={host} anchorRef={host} ariaLabel="x" /></div>);
    expect(screen.queryByTestId("finding-popover")).toBeNull();
  });

  it("closes on Escape and on a pointerdown outside the anchor", () => {
    const onClose = renderOpen();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("aligns right when asked — the panel hangs off the anchor's right edge", () => {
    renderOpen("right");
    const pop = screen.getByTestId("finding-popover");
    expect(pop.className).toContain("right-[-14px]");
    expect(pop.className).not.toContain("left-[");
  });

  it("hangs 30px below its anchor by default, and takes a caller's offset", () => {
    renderOpen();
    expect(screen.getByTestId("finding-popover").style.top).toBe("30px");
    cleanup();
    const host = createRef<HTMLDivElement>();
    render(<div ref={host}><FindingPopover open onClose={vi.fn()} lines={lines} align="right" top={34} elevated clampTo={host} anchorRef={host} ariaLabel="x" /></div>);
    expect(screen.getByTestId("finding-popover").style.top).toBe("34px");
  });
});
