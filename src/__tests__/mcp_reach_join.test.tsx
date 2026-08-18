// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import ProfilePane from "../components/ProfilePane";

afterEach(cleanup);

/**
 * Reach rendered blank for every MCP row on real installs.
 *
 * The backend keys an annotation on `assets.abs_path`, which for a
 * registration is `{config path}:{server name}` (`scanner.rs:1280`,
 * `annotations.rs:293`). `ProfilePane` built each MCP row with
 * `path: t.config_path` — the config FILE, no server name — and looked the
 * annotation up by that. A file path equals no registration key, so every
 * lookup missed and every MCP row rendered empty annotation cells.
 *
 * Skills, rules and subagents are unaffected: for them the row's `path` IS
 * the asset path the backend keyed on, which is why this went unnoticed.
 */

const KEY = "/home/.claude.json:github";

const inventory = {
  skills: [], agents: [], rules: [], subagents: [], project_scans: [],
  tools: [
    {
      id: KEY,
      name: "github",
      command: "npx",
      args: [],
      transport: "stdio",
      config_path: "/home/.claude.json",
      scope: { Global: { agent: "claude-code" } },
      owning_agent: "claude-code",
    },
  ],
} as any;

const annotations = [
  {
    asset_path: KEY,
    mechanism: "none",
    reach: [
      { engine_id: 1, engine_key: "claude-code", engine_name: "Claude Code", reached: true },
      { engine_id: 2, engine_key: "codex", engine_name: "Codex", reached: false },
    ],
    beyond: null,
  },
] as any;

const base = { loading: false, onSelectAsset: vi.fn(), onLinkAsset: vi.fn() };

describe("an MCP row's Reach", () => {
  it("renders the annotation the backend keyed on the registration", () => {
    render(<ProfilePane {...base} inventory={inventory} annotations={annotations} />);

    const reached = screen.getByTestId("reach-tile-claude-code");
    expect(reached.getAttribute("data-reached")).toBe("true");
    expect(screen.getByTestId("reach-tile-codex").getAttribute("data-reached")).toBe("false");
  });

  it("does not fall back to the config file, which many servers share", () => {
    // An annotation keyed on the bare config path belongs to no registration.
    // Matching it would give every server in ~/.claude.json the first one's
    // reach — the same one-file-one-asset error, wearing the other hat.
    const byFile = [{ ...annotations[0], asset_path: "/home/.claude.json" }] as any;
    render(<ProfilePane {...base} inventory={inventory} annotations={byFile} />);
    expect(screen.queryByTestId("reach-tile-claude-code")).toBeNull();
  });

});
