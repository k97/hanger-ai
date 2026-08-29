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

  it("remembers by default", () => {
    const onPick = vi.fn();
    render(<EditorPicker assetName="x" editors={EDITORS} onPick={onPick} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onPick).toHaveBeenCalledWith("Cursor", true);
  });

  it("does not remember when the box is cleared", () => {
    const onPick = vi.fn();
    render(<EditorPicker assetName="x" editors={EDITORS} onPick={onPick} onChooseOther={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Always open assets here" }));
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

  // Karthik's ruling 2026-08-29: the checkbox's default is not a constant,
  // it follows the route. The Option route reaches the picker to override an
  // editor that is already remembered, so it starts unticked — ticking it
  // is an explicit choice to change the default, not the assumed outcome.
  it("does not remember by default when defaultRemember is false (the Option route)", () => {
    const onPick = vi.fn();
    render(
      <EditorPicker
        assetName="x"
        editors={EDITORS}
        onPick={onPick}
        onChooseOther={vi.fn()}
        onCancel={vi.fn()}
        defaultRemember={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onPick).toHaveBeenCalledWith("Cursor", false);
  });

  it("still remembers when the box is ticked after defaultRemember is false", () => {
    const onPick = vi.fn();
    render(
      <EditorPicker
        assetName="x"
        editors={EDITORS}
        onPick={onPick}
        onChooseOther={vi.fn()}
        onCancel={vi.fn()}
        defaultRemember={false}
      />
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Always open assets here" }));
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onPick).toHaveBeenCalledWith("Cursor", true);
  });
});
