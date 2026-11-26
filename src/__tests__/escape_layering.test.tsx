// @vitest-environment happy-dom
/** Who gets an Esc (Task 6 of docs/plans/2026-11-26-overview-card.md,
 *  Review Focus 4). Every component that closes something on Escape marks
 *  the event handled with `preventDefault`, so the app-level Esc (which
 *  clears Global's selection) and the overview popover around them leave it
 *  alone. They listen in the capture phase on `window`, so they run before
 *  every bubble-phase listener whatever order they were added in. A Tooltip
 *  marks it only while a tip is up, because only then does it close
 *  anything. */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { useRef, useState } from "react";
import FindingPopover from "../components/FindingPopover";
import OverflowMenu from "../components/OverflowMenu";
import InfoPopover from "../components/InfoPopover";
import Tooltip from "../components/Tooltip";
import SearchPalette from "../components/SearchPalette";
import OverviewPopover from "../components/OverviewPopover";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => []) }));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/** Dispatches an Esc at `target`, the way a keyboard does, and reports
 *  whether anything marked it handled. */
function escAt(target: Element): boolean {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    target.dispatchEvent(e);
  });
  return e.defaultPrevented;
}

function FindingHarness() {
  const [open, setOpen] = useState(true);
  const host = useRef<HTMLDivElement>(null);
  return (
    <div ref={host}>
      <FindingPopover
        open={open}
        onClose={() => setOpen(false)}
        lines={[{ severity: "warning", text: "Sample line" }]}
        align="left"
        elevated
        clampTo={host}
        anchorRef={host}
        ariaLabel="Sample findings"
      />
    </div>
  );
}

describe("each Esc owner marks the Esc it uses", () => {
  it("FindingPopover", () => {
    render(<FindingHarness />);
    expect(escAt(document.body)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Sample findings" })).toBeNull();
  });

  it("OverflowMenu", () => {
    render(
      <OverflowMenu trigger={(p) => <button type="button" aria-label="Sample menu" {...p} />} ariaLabel="Sample menu" align="left">
        {() => <button type="button" role="menuitem">Item</button>}
      </OverflowMenu>
    );
    fireEvent.click(screen.getByRole("button", { name: "Sample menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(escAt(document.body)).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("InfoPopover", () => {
    render(<InfoPopover label="Sample note">Body</InfoPopover>);
    fireEvent.click(screen.getByRole("button", { name: "Sample note" }));
    expect(screen.getByText("Body")).toBeTruthy();
    expect(escAt(document.body)).toBe(true);
    expect(screen.queryByText("Body")).toBeNull();
  });

  it("SearchPalette", () => {
    const onClose = vi.fn();
    render(<SearchPalette open scannedAt={null} onClose={onClose} onPick={() => {}} />);
    expect(escAt(document.body)).toBe(true);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Tooltip, only while a tip is up", () => {
    vi.useFakeTimers();
    render(
      <Tooltip label="Sample tip" placement="bottom">
        <button type="button" aria-label="Sample tip" />
      </Tooltip>
    );
    const button = screen.getByRole("button", { name: "Sample tip" });
    expect(escAt(document.body)).toBe(false);
    fireEvent.pointerEnter(button);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("tooltip")).toBeTruthy();
    expect(escAt(document.body)).toBe(true);
    expect(screen.queryByTestId("tooltip")).toBeNull();
  });
});

function Nested() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const host = useRef<HTMLDivElement>(null);
  return (
    <>
      <button ref={anchor} type="button">
        Anchor
      </button>
      <OverviewPopover open={outer} onClose={() => setOuter(false)} anchorRef={anchor}>
        <div ref={host}>
          <button type="button" onClick={() => setInner(true)}>
            Open inner
          </button>
          <FindingPopover
            open={inner}
            onClose={() => setInner(false)}
            lines={[{ severity: "warning", text: "Inner line" }]}
            align="left"
            elevated
            clampTo={host}
            anchorRef={host}
            ariaLabel="Inner findings"
          />
        </div>
      </OverviewPopover>
    </>
  );
}

describe("the overview popover and what opens inside it", () => {
  it("an Esc with a popover open inside closes only that one, though the outer listener was added first", () => {
    render(<Nested />);
    fireEvent.click(screen.getByText("Open inner"));
    expect(screen.getByRole("dialog", { name: "Inner findings" })).toBeTruthy();
    expect(escAt(screen.getByText("Open inner"))).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Inner findings" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "Overview" })).toBeTruthy();
    // Nothing inside is open now: the next Esc is the overview's, and it is
    // marked handled too, so the app-level Esc leaves the selection alone.
    expect(escAt(document.body)).toBe(true);
    expect(screen.queryByRole("dialog", { name: "Overview" })).toBeNull();
  });

  it("skips an Esc something else already handled", () => {
    render(<Nested />);
    const stop = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener("keydown", stop, true);
    try {
      escAt(document.body);
    } finally {
      window.removeEventListener("keydown", stop, true);
    }
    expect(screen.getByRole("dialog", { name: "Overview" })).toBeTruthy();
  });
});
