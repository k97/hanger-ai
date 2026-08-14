// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import AssetDetail from "../components/AssetDetail";
import type { Inventory } from "../App";
import { invoke } from "@tauri-apps/api/core";
import { openPath } from "@tauri-apps/plugin-opener";

const SOURCE = "/home/me/.agents/skills/agent-browser/SKILL.md";

const DOC = [
  "---",
  "name: agent-browser",
  "description: Drives a Chromium instance over CDP.",
  "license: MIT",
  "allowed-tools: [Read, Bash]",
  "---",
  "",
  "# agent-browser",
  "",
  "Drives a Chromium instance over CDP so an agent can read rendered pages.",
  "",
  "## When to use",
  "",
  "- A page needs JavaScript before its content exists.",
  "- You need the rendered DOM, not the HTML source.",
  "",
  "## Requires",
  "",
  "`bun` >= 1.1 and a local Chrome.",
].join("\n");

let bodyResult: { ok: true; text: string } | { ok: false; error: string } = { ok: true, text: DOC };

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string) => {
    if (cmd === "read_asset_body") {
      if (bodyResult.ok) return bodyResult.text;
      throw bodyResult.error;
    }
    return null;
  }),
}));

vi.mock("@tauri-apps/plugin-opener", () => ({
  openPath: vi.fn(async () => {}),
  openUrl: vi.fn(async () => {}),
  revealItemInDir: vi.fn(async () => {}),
}));

const asset = {
  category: "Skills",
  name: "agent-browser",
  path: SOURCE,
  scopeBadge: "Global",
  version: "1.2.0",
};

const inventory: Inventory = {
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [
    { id: "1", name: "agent-browser", description: "", version: "1", path: SOURCE, scope: { Global: { agent: "claude" } } },
    { id: "2", name: "agent-browser", description: "", version: "1", path: "/mei-recipes/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/mei-recipes" } }, is_symlink: true, source_path: SOURCE },
    { id: "3", name: "agent-browser", description: "", version: "1", path: "/metrics-board/.claude/skills/agent-browser", scope: { Project: { agent: "claude", root: "/metrics-board" } }, is_symlink: true, source_path: SOURCE },
  ] as Inventory["skills"],
};

describe("Asset detail — the inspector's document screen", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    bodyResult = { ok: true, text: DOC };
  });

  it("states the file's relationships in one line", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    expect(await screen.findByText("The source for 2 copies")).toBeTruthy();
  });

  it("reads the file through the backend, by path", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("read_asset_body", { path: SOURCE });
    });
  });

  it("renders the document, not the raw markup", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);

    expect(await screen.findByText("When to use")).toBeTruthy();
    expect(screen.getByText("A page needs JavaScript before its content exists.")).toBeTruthy();
    // The heading arrived as a heading, with its hashes consumed.
    expect(screen.queryByText("## When to use")).toBeNull();
    // Inline code kept its own element rather than its backticks.
    expect(screen.getByText("bun").tagName).toBe("CODE");
  });

  it("shows the raw file when asked for Source", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    fireEvent.click(await screen.findByRole("button", { name: "Source" }));

    const raw = await screen.findByTestId("asset-source");
    expect(raw.textContent).toBe(DOC);
    expect(screen.queryByText("When to use")).toBeNull();
  });

  it("surfaces the fields the Agent Skills standard defines", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    expect(await screen.findByText("License")).toBeTruthy();
    // The meta row and the Source tab must not share a word.
    expect(screen.getByText("Origin")).toBeTruthy();
    expect(screen.getByText("MIT")).toBeTruthy();
    expect(screen.getByText("Allowed tools")).toBeTruthy();
    expect(screen.getByText("Read, Bash")).toBeTruthy();
  });

  it("names the projects the source reaches, and measures the file it actually read", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    expect(await screen.findByText("Linked into")).toBeTruthy();
    expect(screen.getByText("mei-recipes, metrics-board")).toBeTruthy();
    expect(screen.getByText(/\d+ B · \d+ lines/)).toBeTruthy();
  });

  it("opens the file in its editor", async () => {
    render(<AssetDetail asset={asset} inventory={inventory} />);
    fireEvent.click(await screen.findByText("Open in editor"));
    await waitFor(() => {
      expect(openPath).toHaveBeenCalledWith(SOURCE);
    });
  });

  it("offers the link flow only when one is given", async () => {
    const onLink = vi.fn();
    const { unmount } = render(<AssetDetail asset={asset} inventory={inventory} onLink={onLink} />);
    fireEvent.click(await screen.findByText("Link to…"));
    expect(onLink).toHaveBeenCalled();
    unmount();

    render(<AssetDetail asset={asset} inventory={inventory} />);
    await screen.findByText("Open in editor");
    expect(screen.queryByText("Link to…")).toBeNull();
  });

  it("says why when the file cannot be read, and still shows what it knows", async () => {
    bodyResult = { ok: false, error: "Refusing to read a file outside the folders Hanger scans" };
    render(<AssetDetail asset={asset} inventory={inventory} />);

    expect(await screen.findByText(/Refusing to read a file outside/)).toBeTruthy();
    // The relationships do not depend on the file's contents.
    expect(screen.getByText("The source for 2 copies")).toBeTruthy();
    expect(screen.getByText("Linked into")).toBeTruthy();
    // With no document there is nothing to switch between.
    expect(screen.queryByText("Preview")).toBeNull();
  });
});
