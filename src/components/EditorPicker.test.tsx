// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EditorPicker from "./EditorPicker";

afterEach(cleanup);

const EDITORS = [
  { name: "Cursor", bundleId: "com.todesktop.230313mzl4w4u92", path: "/Applications/Cursor.app" },
  { name: "Zed", bundleId: "dev.zed.Zed", path: "/Applications/Zed.app" },
];

describe("EditorPicker", () => {
  it("lists every detected editor", () => {
    render(<EditorPicker assetName="ui-typography" editors={EDITORS} onPick={vi.fn()} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cursor" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zed" })).toBeTruthy();
  });

  it("names the asset it is about to open", () => {
    render(<EditorPicker assetName="ui-typography" editors={EDITORS} onPick={vi.fn()} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/ui-typography/)).toBeTruthy();
  });

  it("reports the pick with remember true when the box is ticked", () => {
    const onPick = vi.fn();
    render(<EditorPicker assetName="x" editors={EDITORS} onPick={onPick} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Always open assets here" }));
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onPick).toHaveBeenCalledWith("Cursor", true);
  });

  it("reports the pick with remember false when the box is clear", () => {
    const onPick = vi.fn();
    render(<EditorPicker assetName="x" editors={EDITORS} onPick={onPick} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Zed" }));
    expect(onPick).toHaveBeenCalledWith("Zed", false);
  });

  // Karthik's ruling 2026-08-29: the empty state offers the action and
  // asserts nothing about the machine. Our table can be stale as easily as
  // the Mac can be empty.
  it("offers only Choose an app… when nothing was detected, and claims no absence", () => {
    render(<EditorPicker assetName="x" editors={[]} onPick={vi.fn()} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Choose an app…" })).toBeTruthy();
    expect(screen.queryByText(/no editor/i)).toBeNull();
    expect(screen.queryByText(/didn't find/i)).toBeNull();
    expect(screen.queryByText(/none/i)).toBeNull();
  });
});
