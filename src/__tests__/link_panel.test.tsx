// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import LinkPanel from "../components/LinkPanel";
import type { Inventory } from "../App";
import { invoke } from "@tauri-apps/api/core";
import type { PreflightResult } from "../utils/linkPlan";

const SOURCE = "/home/me/.agents/skills/agent-browser/SKILL.md";

// Module-level so the prop identity is stable across renders, the way App's
// linked-directory state is.
const DESTINATIONS = ["/work/mei-recipes", "/work/metrics-board", "/work/rkarthik-zehn", "/work/skills"];

function preflight(over: Partial<PreflightResult> = {}): PreflightResult {
  return {
    target_exists: false,
    collision: false,
    has_permissions: true,
    warning: null,
    target_path: "",
    already_linked: false,
    ...over,
  };
}

let checks: Record<string, PreflightResult> = {};
// A destination whose check_deploy_target call rejects outright, the way
// resolve_target_path now does when no agent claims the asset's source.
let checkFails: Record<string, string> = {};
let deployFails: Record<string, string> = {};
let deployed: { source: string; target: string; type: string }[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args: any) => {
    if (cmd === "check_deploy_target") {
      if (checkFails[args.targetProjectPath]) throw checkFails[args.targetProjectPath];
      const found = checks[args.targetProjectPath];
      if (!found) throw "unknown destination";
      return found;
    }
    if (cmd === "execute_deploy") {
      if (deployFails[args.targetProjectPath]) throw deployFails[args.targetProjectPath];
      deployed.push({
        source: args.sourcePath,
        target: args.targetProjectPath,
        type: args.deployType,
      });
      return null;
    }
    return null;
  }),
}));

const inventory: Inventory = {
  agents: [],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
  skills: [],
};

const skill = { name: "agent-browser", category: "Skills", path: SOURCE };

function mount(over: Partial<React.ComponentProps<typeof LinkPanel>> = {}) {
  const props = {
    asset: skill,
    destinations: DESTINATIONS,
    inventory,
    onCancel: vi.fn(),
    onLinked: vi.fn(),
    onMergeRules: vi.fn(),
    ...over,
  };
  render(<LinkPanel {...props} />);
  return props;
}

function tick(name: string) {
  fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) }));
}

describe("Link panel — choosing where a file should also live", () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    deployed = [];
    deployFails = {};
    checkFails = {};
    checks = {
      "/work/mei-recipes": preflight({ target_path: "/work/mei-recipes/.claude/skills/agent-browser" }),
      "/work/metrics-board": preflight({ target_path: "/work/metrics-board/.claude/skills/agent-browser" }),
      "/work/rkarthik-zehn": preflight({ target_path: "/work/rkarthik-zehn/.claude/skills/agent-browser" }),
      "/work/skills": preflight({ target_path: "/work/skills/.claude/skills/agent-browser" }),
    };
  });

  it("checks every destination on arrival, not at the moment you press the button", async () => {
    mount();

    // Reading: the file-text mark scans (looping) while every destination's
    // check is in flight, before the checks' promises have resolved.
    const reading = screen.getByText("Checking each project…").closest("div")!;
    expect(reading.querySelector('path[d="M10 9H8"]')).toBeTruthy();
    expect(reading.querySelector("g.aim-loop")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("mei-recipes")).toBeTruthy();
    });
    for (const root of DESTINATIONS) {
      expect(invoke).toHaveBeenCalledWith("check_deploy_target", {
        sourcePath: SOURCE,
        targetProjectPath: root,
      });
    }
  });

  it("shows a destination it already reaches as settled, and will not let you re-link it", async () => {
    checks["/work/skills"] = preflight({
      target_exists: true,
      already_linked: true,
      target_path: "/work/skills/.claude/skills/agent-browser",
    });
    mount();

    const row = (await screen.findByText("skills")).closest("label")!;
    expect(within(row).getByText("Already linked")).toBeTruthy();
    expect(within(row).getByRole("checkbox")).toHaveProperty("disabled", true);
  });

  it("names the consequence for each chosen destination, with the shared prefix dropped", async () => {
    mount();
    await screen.findByText("mei-recipes");

    tick("mei-recipes");
    tick("metrics-board");

    const consequences = screen.getAllByTestId("link-consequence");
    expect(consequences).toHaveLength(2);
    expect(consequences[0].textContent).toContain("mei-recipes/.claude/skills/agent-browser");
    expect(consequences[0].textContent).toContain("New");
    expect(screen.getByText("What will happen")).toBeTruthy();
  });

  it("warns when a destination already holds something else", async () => {
    checks["/work/skills"] = preflight({
      target_exists: true,
      collision: true,
      target_path: "/work/skills/.claude/skills/agent-browser",
    });
    mount();
    await screen.findByText("skills");

    tick("skills");
    expect(screen.getByTestId("link-consequence").textContent).toContain("Replaces a copy");
  });

  it("counts the destinations in the foot before anything runs", async () => {
    mount();
    await screen.findByText("mei-recipes");

    expect(screen.getByTestId("link-foot").textContent).toBe("0 projects");
    tick("mei-recipes");
    expect(screen.getByTestId("link-foot").textContent).toBe("1 project");
    tick("metrics-board");
    expect(screen.getByTestId("link-foot").textContent).toBe("2 projects");
  });

  it("will not link when nothing is chosen", async () => {
    mount();
    await screen.findByText("mei-recipes");
    expect(screen.getByRole("button", { name: "Link" })).toHaveProperty("disabled", true);
  });

  it("deploys once per chosen destination, carrying the mechanism", async () => {
    const props = mount();
    await screen.findByText("mei-recipes");

    tick("mei-recipes");
    tick("metrics-board");
    fireEvent.click(screen.getByRole("button", { name: "Tracked copy" }));
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    // Linking: the connection draws itself (looping) while execute_deploy
    // calls are in flight, synchronously true before the first await lands.
    const linkingBtn = screen.getByText("Linking…").closest("button")!;
    expect(linkingBtn.querySelector('path[d="M15 7h2a5 5 0 1 1 0 10h-2"]')).toBeTruthy();
    expect(linkingBtn.querySelector("g.aim-loop")).toBeTruthy();

    await waitFor(() => expect(deployed).toHaveLength(2));
    expect(deployed.map((d) => d.target)).toEqual(["/work/mei-recipes", "/work/metrics-board"]);
    expect(deployed.every((d) => d.type === "copy")).toBe(true);
    await waitFor(() => expect(props.onLinked).toHaveBeenCalled());
  });

  it("does not hide a partial failure behind the successes", async () => {
    deployFails["/work/metrics-board"] = "Permission denied";
    mount();
    await screen.findByText("mei-recipes");

    tick("mei-recipes");
    tick("metrics-board");
    fireEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => {
      expect(screen.getByTestId("link-foot").textContent).toBe("1 linked · 1 failed");
    });
    // The row that failed says why, rather than the panel reporting one verdict.
    const rows = screen.getAllByTestId("link-consequence");
    expect(rows[0].textContent).toContain("Linked");
    expect(rows[1].textContent).toContain("Permission denied");
    expect(screen.getByText("What happened")).toBeTruthy();
  });

  it("holds a rule to one destination and says why", async () => {
    mount({ asset: { name: "CLAUDE.md", category: "Rules", path: "/home/me/.claude/CLAUDE.md" } });
    await screen.findByText("mei-recipes");

    expect(screen.getByText(/rules go one project at a time/)).toBeTruthy();

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]);
    expect(screen.getByTestId("link-foot").textContent).toBe("1 project");
    fireEvent.click(radios[1]);
    // Choosing a second destination replaces the first rather than adding.
    expect(screen.getByTestId("link-foot").textContent).toBe("1 project");
  });

  it("hands a colliding rule to the merge chooser instead of overwriting it", async () => {
    checks["/work/mei-recipes"] = preflight({
      target_exists: true,
      collision: true,
      target_path: "/work/mei-recipes/CLAUDE.md",
    });
    const props = mount({
      asset: { name: "CLAUDE.md", category: "Rules", path: "/home/me/.claude/CLAUDE.md" },
    });
    await screen.findByText("mei-recipes");

    fireEvent.click(screen.getAllByRole("radio")[0]);
    fireEvent.click(screen.getByRole("button", { name: "Compare & merge…" }));

    expect(props.onMergeRules).toHaveBeenCalledWith("/work/mei-recipes", "/work/mei-recipes/CLAUDE.md");
    expect(deployed).toHaveLength(0);
  });

  it("never offers to write where it cannot", async () => {
    checks["/work/skills"] = preflight({
      target_exists: true,
      collision: true,
      has_permissions: false,
      target_path: "/work/skills/.claude/skills/agent-browser",
    });
    mount();

    const row = (await screen.findByText("skills")).closest("label")!;
    expect(within(row).getByText("Not writable")).toBeTruthy();
    expect(within(row).getByRole("checkbox")).toHaveProperty("disabled", true);
  });

  it("says so plainly when there is nowhere to link to", async () => {
    checks = {};
    mount({ destinations: [] });
    const message = await screen.findByText(/No repositories are linked yet/);
    expect(message).toBeTruthy();

    // The break-mark: a snapped link, played once — one of its four short
    // lines pinned by geometry, inside the group carrying the once rule.
    const wrapper = message.closest("div")!;
    const burst = wrapper.querySelector("g.aim-once");
    expect(burst).toBeTruthy();
    expect(burst!.querySelector('line[x1="8"][y1="2"][x2="8"][y2="5"]')).toBeTruthy();
  });

  it("shows a destination whose preflight refused outright, and says why, instead of dropping the row", async () => {
    checkFails["/work/mei-recipes"] = "Cannot deploy: no agent claims this asset's source directory";
    mount();

    const row = (await screen.findByText("mei-recipes")).closest("label")!;
    expect(within(row).getByText("Not deployable")).toBeTruthy();
    expect(within(row).getByRole("checkbox")).toHaveProperty("disabled", true);
    expect(
      await screen.findByText("Cannot deploy: no agent claims this asset's source directory")
    ).toBeTruthy();
  });

  it("does not falsely claim nothing is linked when every destination's preflight refuses", async () => {
    // The concrete regression: an asset sourced from the shared .agents/
    // convention fails resolve_target_path for every destination, because
    // resolution depends on the source path, not the target. Before this
    // fix every row was silently dropped and the panel fell back to "No
    // repositories are linked yet", which is false when repos are linked.
    for (const root of DESTINATIONS) {
      checkFails[root] = "Cannot deploy: no agent claims this asset's source directory";
    }
    mount();

    await waitFor(() => {
      expect(
        screen.getByText("Cannot deploy: no agent claims this asset's source directory")
      ).toBeTruthy();
    });
    expect(screen.queryByText(/No repositories are linked yet/)).toBeNull();
    expect(screen.getByRole("button", { name: "Link" })).toHaveProperty("disabled", true);
  });
});
