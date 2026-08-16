// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import FavouriteHeart from "./FavouriteHeart";

describe("FavouriteHeart", () => {
  beforeEach(() => {
    cleanup();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it("stays visible on keyboard focus, not just on hover, when not favourited", () => {
    // Hover-reveal alone (`group-hover:opacity-100`) leaves a keyboard user
    // tabbed onto an invisible control — the focus ring composites with the
    // element's own opacity, so it disappears too. `focus-visible:opacity-100`
    // is the same fix already used for Sidebar.tsx's unlink button.
    render(<FavouriteHeart favourited={false} name="Smithery" onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Add Smithery to favourites" });
    expect(button.className).toContain("focus-visible:opacity-100");
  });

  it("clears the pulse ring on a timer, not only on animationend, so reduced-motion doesn't strand it", () => {
    // jsdom/happy-dom never fires real CSS animation events, which stands in
    // for prefers-reduced-motion here too: index.css's reduced-motion rule
    // sets `animation: none !important`, so `animationend` never fires
    // either way. The timer fallback is what actually clears the ring in
    // both cases — this test never fires animationend, only advances time.
    const { container } = render(
      <FavouriteHeart favourited={false} name="Smithery" onToggle={() => {}} />
    );
    const button = screen.getByRole("button", { name: "Add Smithery to favourites" });

    fireEvent.click(button);
    expect(container.querySelector(".animate-heart-ring")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(container.querySelector(".animate-heart-ring")).toBeNull();
  });
});
