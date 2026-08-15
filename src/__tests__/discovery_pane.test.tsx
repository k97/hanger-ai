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
    render(<DiscoveryPane filterText="" />);
    await screen.findByText("skills.sh");

    for (const dir of DIRECTORIES) {
      expect(screen.getByText(dir.name), `${dir.name} row`).toBeTruthy();
    }
    expect(screen.getByText("Standard")).toBeTruthy();
    expect(screen.getByText("Official")).toBeTruthy();
    expect(screen.getByText("Community")).toBeTruthy();
  });

  it("counts the catalogue in the foot without inventing a number", async () => {
    render(<DiscoveryPane filterText="" />);
    expect(await screen.findByText(`${DIRECTORIES.length} directories`)).toBeTruthy();
  });

  it("narrows to one kind through the sidebar's facet", async () => {
    // The facet rows live in DiscoverySidebar since the chips moved into
    // the second column; the pane is a controlled consumer of `kind`.
    const { rerender } = render(<DiscoveryPane filterText="" />);
    await screen.findByText("skills.sh");

    rerender(<DiscoveryPane filterText="" kind="Rules" />);

    await waitFor(() => {
      expect(screen.queryByText("Smithery")).toBeNull();
    });
    expect(screen.getByText("cursor.directory")).toBeTruthy();
  });

  it("narrows through the toolbar filter text", async () => {
    const { rerender } = render(<DiscoveryPane filterText="" />);
    await screen.findByText("Smithery");

    rerender(<DiscoveryPane filterText="cursor" />);

    await waitFor(() => {
      expect(screen.queryByText("Smithery")).toBeNull();
    });
    expect(screen.getByText("cursor.directory")).toBeTruthy();
    expect(screen.getByText(/^\d+ of \d+ directories$/)).toBeTruthy();
  });

  it("says so plainly when nothing matches", async () => {
    render(<DiscoveryPane filterText="zzzzz-no-such-directory" />);
    expect(await screen.findByText("No directory matches that filter.")).toBeTruthy();
  });

  it("asks before leaving the app, and opens only on confirmation", async () => {
    render(<DiscoveryPane filterText="" />);
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
    render(<DiscoveryPane filterText="" />);
    fireEvent.click(await screen.findByText("Smithery"));
    await screen.findByText(/Open Smithery in your browser\?/);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      expect(screen.queryByText(/in your browser\?/)).toBeNull();
    });
    expect(openUrl).not.toHaveBeenCalled();
  });

  it("remembers 'don't ask me again' as a preference", async () => {
    render(<DiscoveryPane filterText="" />);
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
    render(<DiscoveryPane filterText="" />);
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
    render(<DiscoveryPane filterText="" />);
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
    render(<DiscoveryPane filterText="" />);
    expect(await screen.findByText(/doesn't fetch from them/)).toBeTruthy();
  });
});
