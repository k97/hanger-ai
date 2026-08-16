// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FavouriteHeart from "./FavouriteHeart";

describe("FavouriteHeart", () => {
  beforeEach(() => cleanup());

  it("is labelled to add when not favourited", () => {
    render(<FavouriteHeart favourited={false} name="Smithery" onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Add Smithery to favourites" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });

  it("is labelled to remove when favourited", () => {
    render(<FavouriteHeart favourited={true} name="Smithery" onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Remove Smithery from favourites" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
  });

  it("reports the toggle without letting the click reach a parent row", () => {
    const onToggle = vi.fn();
    const parentClick = vi.fn();
    render(
      <div onClick={parentClick}>
        <FavouriteHeart favourited={false} name="Smithery" onToggle={onToggle} />
      </div>
    );
    fireEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(parentClick).not.toHaveBeenCalled();
  });

  it("is a real, focusable button rather than a div wired for clicks", () => {
    render(<FavouriteHeart favourited={false} name="Smithery" onToggle={() => {}} />);
    expect(screen.getByRole("button").tagName).toBe("BUTTON");
  });
});
