// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import SwitchNotice from "./SwitchNotice";
import type { SwitchNoticeState } from "../hooks/useMcpSwitch";

/**
 * The line under the main column after a switch: what happened, Undo when
 * there is a receipt, and a way to put it away. The hook decides the words;
 * this decides what can be pressed.
 */

const DONE: SwitchNoticeState = {
  kind: "done",
  line: "alpha is off for Codex.",
  receiptEngineId: "codex",
  receiptId: "file:r1",
  undoable: true,
  pending: false,
};

function show(notice: SwitchNoticeState | null) {
  const onUndo = vi.fn();
  const onDismiss = vi.fn();
  render(<SwitchNotice notice={notice} onUndo={onUndo} onDismiss={onDismiss} />);
  return { onUndo, onDismiss };
}

describe("SwitchNotice", () => {
  afterEach(() => cleanup());

  it("keeps an empty status region while there is nothing to say, so the next line is announced", () => {
    show(null);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a switch with a receipt shows its line, Undo and Dismiss, each wired", () => {
    const { onUndo, onDismiss } = show(DONE);
    const status = screen.getByRole("status");
    expect(within(status).getByText("alpha is off for Codex.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("shows no Undo when the switch is not undoable", () => {
    show({ ...DONE, receiptId: null, undoable: false });
    expect(screen.getByText("alpha is off for Codex.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("a failure shows its line and no Undo", () => {
    show({ kind: "failed", line: "This can't be undone now. The file has changed since." });
    expect(screen.getByText("This can't be undone now. The file has changed since.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
  });

  it("Undo cannot be pressed again while it runs", () => {
    const { onUndo } = show({ ...DONE, pending: true });
    const undo = screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    expect(undo.disabled).toBe(true);
    fireEvent.click(undo);
    expect(onUndo).not.toHaveBeenCalled();
  });

  // A class contract, not geometry: happy-dom lays nothing out and has no
  // hit-testing, so whether Undo is clickable over the pane is a screenshot's
  // question. What this pins is the pair of classes that makes it possible.
  it("the band lets clicks through to the pane, and the pill takes them", () => {
    show(DONE);
    const status = screen.getByRole("status");
    expect(status.className.split(/\s+/)).toContain("pointer-events-none");
    const pill = screen.getByText("alpha is off for Codex.").closest("[data-testid='switch-notice']")!;
    expect(pill.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["pointer-events-auto", "bg-fill", "text-on-fill", "rounded-pill", "animate-rise"])
    );
  });
});
