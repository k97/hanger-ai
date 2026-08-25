// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import EmptyState from "./EmptyState";

// This repo configures no global cleanup, so rendered DOM accumulates within a
// file and queries match across tests.
afterEach(cleanup);

// The plane class as it exists at all eight call sites today
// (ProfilePane.tsx / RepoPane.tsx `emptyPlaneClass`), character-identical.
const PLANE_CLASS =
  "flex-1 mx-[18px] mb-[18px] min-h-0 flex flex-col items-center justify-center text-center border border-dashed border-line rounded-plane animate-in fade-in duration-200";

describe("EmptyState", () => {
  it("renders the icon slot, headline, sub, action and children", () => {
    render(
      <EmptyState
        icon={<span data-testid="sample-icon">icon</span>}
        headline="Nothing here yet"
        sub="A subline explaining why."
        action={<button>Do something</button>}
      >
        <span data-testid="sample-child">extra body content</span>
      </EmptyState>,
    );

    expect(screen.getByTestId("sample-icon")).toBeTruthy();
    expect(screen.getByText("Nothing here yet")).toBeTruthy();
    expect(screen.getByText("A subline explaining why.")).toBeTruthy();
    expect(screen.getByText("Do something")).toBeTruthy();
    expect(screen.getByTestId("sample-child")).toBeTruthy();
  });

  it("applies the plane class exactly once, plus any extra className given", () => {
    const { container } = render(<EmptyState headline="Nothing here yet" className="mt-2.5" />);
    // Counting substring occurrences catches the class being duplicated or
    // fragmented across more than one element, not just its presence.
    const occurrences = container.innerHTML.split(PLANE_CLASS).length - 1;
    expect(occurrences).toBe(1);
    expect(container.querySelector(".mt-2\\.5")).toBeTruthy();
  });

  it("gives the headline text-base-app font-medium text-ink-1, verbatim classes from the eight sites", () => {
    render(<EmptyState headline="Nothing here yet" />);
    const headline = screen.getByText("Nothing here yet");
    expect(headline.className).toBe("text-base-app font-medium text-ink-1");
  });

  it("sets data-testid on the plane only when testId is given", () => {
    const { container: withId } = render(<EmptyState headline="A" testId="scan-pending" />);
    expect(withId.querySelector('[data-testid="scan-pending"]')).toBeTruthy();

    const { container: withoutId } = render(<EmptyState headline="A" />);
    expect(withoutId.querySelector("[data-testid]")).toBeNull();
  });

  it("renders no headline span at all when headline is an empty string", () => {
    // A.1/A.2's rich MCP bodies come through children instead of a
    // headline/sub pair; EmptyState must not inject an empty span for them.
    render(
      <EmptyState headline="" testId="mcp-body">
        <span data-testid="mcp-child">rich body</span>
      </EmptyState>,
    );
    expect(screen.getByTestId("mcp-child")).toBeTruthy();
    const plane = screen.getByTestId("mcp-body");
    expect(plane.querySelector("span.text-base-app")).toBeNull();
  });
});
