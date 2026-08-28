// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import DiscoveryPane from "../components/DiscoveryPane";
import { DIRECTORIES } from "../data/directories";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

const mockPreferences: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: vi.fn(async () => {}),
}));

const writeText = vi.fn(async () => {});

describe("Discovery — the row is the interaction", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    for (const key of Object.keys(mockPreferences)) delete mockPreferences[key];
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  });

  it("renders every catalogue entry under a tier heading", async () => {
    render(<DiscoveryPane />);
    await screen.findByText("skills.sh");

    for (const dir of DIRECTORIES) {
      expect(screen.getByText(dir.name), `${dir.name} row`).toBeTruthy();
    }
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("Official")).toBeTruthy();
    expect(screen.getByText("Community")).toBeTruthy();
  });

  it("counts the catalogue in the foot without inventing a number", async () => {
    render(<DiscoveryPane />);
    expect(await screen.findByText(`${DIRECTORIES.length} directories`)).toBeTruthy();
  });

  it("narrows to one kind through the sidebar's facet", async () => {
    // The facet rows live in DiscoverySidebar since the chips moved into
    // the second column; the pane is a controlled consumer of `kind`.
    const { rerender } = render(<DiscoveryPane />);
    await screen.findByText("skills.sh");

    rerender(<DiscoveryPane kind="Rules" />);

    await waitFor(() => {
      expect(screen.queryByText("Smithery")).toBeNull();
    });
    expect(screen.getByText("cursor.directory")).toBeTruthy();
  });

  it("asks before leaving the app, and opens only on confirmation", async () => {
    render(<DiscoveryPane />);
    const row = await screen.findByText("Smithery");

    fireEvent.click(row);

    await screen.findByText(/Open Smithery in your browser\?/);
    expect(openUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://smithery.ai");
    });
  });

  it("cancelling the sheet leaves the app where it was", async () => {
    render(<DiscoveryPane />);
    fireEvent.click(await screen.findByText("Smithery"));
    await screen.findByText(/Open Smithery in your browser\?/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText(/in your browser\?/)).toBeNull();
    });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("remembers 'don't ask me again' as a preference", async () => {
    render(<DiscoveryPane />);
    fireEvent.click(await screen.findByText("Smithery"));
    await screen.findByText(/Open Smithery in your browser\?/);

    fireEvent.click(screen.getByLabelText("Don't ask me again"));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "discovery_confirm_open",
        value: "false",
      });
    });
  });

  it("skips the sheet entirely once the user has turned confirmation off", async () => {
    mockPreferences.discovery_confirm_open = "false";
    render(<DiscoveryPane />);
    const row = await screen.findByText("Smithery");

    await waitFor(() => {
      expect(screen.getByText(/Opens links without asking/)).toBeTruthy();
    });

    fireEvent.click(row);

    await waitFor(() => {
      expect(openUrl).toHaveBeenCalledWith("https://smithery.ai");
    });
    expect(screen.queryByText(/in your browser\?/)).toBeNull();
  });

  it("copies the fetch command instead of navigating", async () => {
    render(<DiscoveryPane />);
    await screen.findByText("Smithery");

    fireEvent.click(screen.getByText("npx @smithery/cli install <server>"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("npx @smithery/cli install <server>");
    });
    expect(screen.queryByText(/in your browser\?/)).toBeNull();
    expect(openUrl).not.toHaveBeenCalled();
    expect(await screen.findByText("Command copied")).toBeTruthy();
  });

  it("is honest that Hanger does not fetch from these directories", async () => {
    render(<DiscoveryPane />);
    expect(await screen.findByText(/doesn't fetch from them/)).toBeTruthy();
  });

  it("shows a heart on every row, filled only for favourited marks", async () => {
    render(<DiscoveryPane favourites={["sy"]} />);
    await screen.findByText("Smithery");

    expect(
      screen.getByRole("button", { name: "Remove Smithery from favourites" }).getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      screen.getByRole("button", { name: "Add Glama to favourites" }).getAttribute("aria-pressed")
    ).toBe("false");
  });

  it("toggling the heart reports the mark without navigating", async () => {
    const onToggleFavourite = vi.fn();
    render(<DiscoveryPane onToggleFavourite={onToggleFavourite} />);
    await screen.findByText("Smithery");

    fireEvent.click(screen.getByRole("button", { name: "Add Smithery to favourites" }));

    expect(onToggleFavourite).toHaveBeenCalledWith("sy");
    expect(openUrl).not.toHaveBeenCalled();
    expect(screen.queryByText(/in your browser\?/)).toBeNull();
  });

  it("the Favourites facet shows only favourited listings, newest first, without tier headings", async () => {
    render(<DiscoveryPane kind="Favourites" favourites={["gl", "sy"]} />);

    const names = (
      await screen.findAllByRole("button", { name: /^Remove .+ from favourites$/ })
    ).map((el) => el.getAttribute("aria-label"));
    expect(names).toEqual(["Remove Glama from favourites", "Remove Smithery from favourites"]);
    expect(screen.queryByText("Standard")).toBeNull();
    expect(screen.queryByText("Official")).toBeNull();
    expect(screen.queryByText("Community")).toBeNull();
  });

  it("the footer counts favourites honestly, not against the whole catalogue", async () => {
    render(<DiscoveryPane kind="Favourites" favourites={["sy", "gl"]} />);
    expect(await screen.findByText("2 favourites")).toBeTruthy();
  });

  // Class-contract guard (typography migration, Task 7c). happy-dom lays
  // out nothing, so this asserts className membership only, never geometry.
  it("section heads sentence-case body medium; descriptions at body in --ink-2; hosts mono caption", async () => {
    render(<DiscoveryPane filterText="" />);
    await screen.findByText("skills.sh");

    // "Standard" renders as a leaf <span> with no classes of its own; the
    // section-head role lives on the wrapping row div.
    const head = screen.getByText("Standard");
    const headRow = head.closest("div");
    expect(headRow?.className).toContain("text-base-app");
    expect(headRow?.className).toContain("font-medium");
    expect(headRow?.className).not.toContain("uppercase");

    const desc = screen.getByText(/Not a listing/);
    expect(desc.className).toContain("text-base-app");
    expect(desc.className).toContain("leading-body");
    expect(desc.className).not.toContain("leading-[1.5]");

    const host = screen.getByText("agentskills.io");
    expect(host.className).toContain("font-mono");
    expect(host.className).toContain("text-small");
  });
});
