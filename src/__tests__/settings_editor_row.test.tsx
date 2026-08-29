// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EditorSetting from "../components/EditorSetting";

afterEach(cleanup);

const EDITORS = [
  { name: "Cursor", bundleId: "a", path: "/Applications/Cursor.app" },
  { name: "Zed", bundleId: "b", path: "/Applications/Zed.app" },
];

describe("EditorSetting", () => {
  it("marks the chosen editor as pressed and the others as not", () => {
    render(<EditorSetting editors={EDITORS} chosen="Zed" onChoose={vi.fn()} onChooseOther={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Zed" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Cursor" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("reports a change", () => {
    const onChoose = vi.fn();
    render(<EditorSetting editors={EDITORS} chosen="Zed" onChoose={onChoose} onChooseOther={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Cursor" }));
    expect(onChoose).toHaveBeenCalledWith("Cursor");
  });

  it("asserts no absence when nothing was detected", () => {
    render(<EditorSetting editors={[]} chosen={null} onChoose={vi.fn()} onChooseOther={vi.fn()} />);
    expect(screen.queryByText(/no editor/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Choose an app…" })).toBeTruthy();
  });

  it("routes the empty state's Choose an app… to onChooseOther", () => {
    const onChooseOther = vi.fn();
    render(<EditorSetting editors={[]} chosen={null} onChoose={vi.fn()} onChooseOther={onChooseOther} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose an app…" }));
    expect(onChooseOther).toHaveBeenCalledTimes(1);
  });
});
