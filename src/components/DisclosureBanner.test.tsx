// @vitest-environment happy-dom
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import DisclosureBanner from "./DisclosureBanner";

describe("DisclosureBanner", () => {
  it("renders collapsed by default with single-line summary row", () => {
    render(
      <DisclosureBanner variant="warning" summary="scan warning" count={1}>
        <div>Warning Detail Content</div>
      </DisclosureBanner>
    );

    const button = screen.getByRole("button", { name: /1 scan warning/i });
    expect(button).toBeDefined();
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Warning Detail Content")).toBeNull();
  });

  it("pluralises summary correctly when count > 1", () => {
    render(
      <DisclosureBanner variant="warning" summary="scan warning" count={3}>
        <div>Warning Detail Content</div>
      </DisclosureBanner>
    );

    const button = screen.getByRole("button", { name: /3 scan warnings/i });
    expect(button).toBeDefined();
  });

  it("expands content region on click with max-height 240px and internal overflow scroll", () => {
    render(
      <DisclosureBanner variant="warning" summary="scan warning" count={2}>
        <div data-testid="children-content">Warning 1, Warning 2</div>
      </DisclosureBanner>
    );

    const button = screen.getByRole("button", { name: /2 scan warnings/i });
    fireEvent.click(button);

    expect(button.getAttribute("aria-expanded")).toBe("true");
    const content = screen.getByTestId("children-content");
    expect(content).toBeDefined();
    const scrollContainer = content.parentElement;
    expect(scrollContainer?.getAttribute("style")).toContain("max-height: 240px");
  });

  it("supports defaultOpen prop", () => {
    render(
      <DisclosureBanner variant="error" summary="error notice" count={1} defaultOpen={true}>
        <div>Error Detail Content</div>
      </DisclosureBanner>
    );

    const button = screen.getByRole("button", { name: /1 error notice/i });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Error Detail Content")).toBeDefined();
  });
});
