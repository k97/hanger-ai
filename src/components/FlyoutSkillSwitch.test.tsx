// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import Flyout from "./Flyout";
import AllEnginesSwitch from "./AllEnginesSwitch";
import SwitchNotice from "./SwitchNotice";
import { Inventory } from "../App";
import { useMcpSwitch } from "../hooks/useMcpSwitch";
import { skillReadOnlyLine, skillSwitchLabel } from "../utils/switchCopy";
import type { SkillSwitchInfo, SkillSwitchReply } from "../types/skillSwitch";

/**
 * The On/Off switch in a store skill's inspector header
 * (docs/plans/2026-11-26-skill-switch.md, Task 8), and the MCP header's
 * switch it was extracted from, which must draw exactly what it drew before.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

/** `AllEnginesSwitch`'s markup for each state, rendered by the component as
 *  it was before `HeaderSwitch` was extracted from it (commit af746bb). */
const ALL_ENGINES_BEFORE: Record<string, string> = {
  "on-false": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"true\" aria-label=\"Switch cua off in every engine\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-fill\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-on-fill stroke-transparent translate-x-[10px]\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">On</span></span>",
  "on-true": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"true\" aria-label=\"Switch cua off in every engine\" aria-busy=\"true\" disabled=\"\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-fill\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-on-fill stroke-transparent translate-x-[10px]\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">On</span></span>",
  "off-false": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"false\" aria-label=\"Switch cua on in every engine\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-plane-2\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-page stroke-line\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">Off</span></span>",
  "off-true": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"false\" aria-label=\"Switch cua on in every engine\" aria-busy=\"true\" disabled=\"\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-plane-2\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-page stroke-line\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">Off</span></span>",
  "some-false": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"mixed\" aria-label=\"Switch cua off in every engine\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-fill\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-on-fill stroke-transparent translate-x-[10px]\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">On in some</span></span>",
  "some-true": "<span data-testid=\"all-engines-switch\" class=\"ml-auto shrink-0 flex items-center gap-2\"><span class=\"contents\"><button type=\"button\" aria-pressed=\"mixed\" aria-label=\"Switch cua off in every engine\" aria-busy=\"true\" disabled=\"\" class=\"shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50\"><svg data-testid=\"layer-switch\" width=\"26\" height=\"16\" aria-hidden=\"true\" class=\"shrink-0\"><rect width=\"26\" height=\"16\" rx=\"8\" class=\"transition-[fill] duration-hover ease-spring fill-fill\"></rect><circle cx=\"8\" cy=\"8\" r=\"5.5\" stroke-width=\"1\" class=\"transition-transform duration-hover ease-spring fill-on-fill stroke-transparent translate-x-[10px]\"></circle></svg></button></span><span class=\"whitespace-nowrap font-sans text-small text-ink-3 leading-caption\">On in some</span></span>"
};

describe("AllEnginesSwitch after the HeaderSwitch extraction", () => {
  afterEach(cleanup);
  it("draws byte for byte what it drew before, in every state", () => {
    expect(Object.keys(ALL_ENGINES_BEFORE)).toHaveLength(6);
    for (const state of ["on", "off", "some"] as const) {
      for (const pending of [false, true]) {
        const { container } = render(
          <AllEnginesSwitch server="cua" state={state} pending={pending} onToggle={() => {}} />
        );
        expect(container.innerHTML, `${state}, pending ${pending}`).toBe(ALL_ENGINES_BEFORE[`${state}-${pending}`]);
        cleanup();
      }
    }
  });
});

const STORE_PATH = "/Users/demo/.agents/skills/figma";
const inventory: Inventory = {
  agents: [],
  skills: [
    {
      id: "skill-figma",
      name: "figma",
      description: "",
      version: "",
      path: STORE_PATH,
      scope: "Global",
      drifted: false,
    } as never,
  ],
  tools: [],
  rules: [],
  subagents: [],
  project_scans: [],
};
const selected = { name: "figma", category: "Skills", path: STORE_PATH };

/** `docs/ipc.md` entry 21's shapes. */
const SWITCHABLE: SkillSwitchInfo = { key: "skill:figma", read_only: null };
const NESTED: SkillSwitchInfo = { key: "skill:figma", read_only: "inside_another_folder" };
const OFF_REPLY: SkillSwitchReply = {
  name: "figma",
  receipt_id: "kept:00000000-0000-4000-8000-000000000001",
  undoable: true,
  links_count: 0,
  links_not_restored: [],
  kept: { skills: [], count: 0 },
};

/** The backend: `get_skill_switch` answers `info` (a promise, so a test can
 *  hold it), a switch answers `reply`, everything else nothing. */
function backend(info: Promise<SkillSwitchInfo | null> | SkillSwitchInfo | null, reply: Promise<SkillSwitchReply> | SkillSwitchReply = OFF_REPLY) {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === "get_skill_switch") return Promise.resolve(info);
    if (cmd === "set_skill_enabled") return Promise.resolve(reply);
    return Promise.resolve(null);
  });
}

function Harness() {
  const switcher = useMcpSwitch({ onChanged: () => {} });
  return (
    <>
      <Flyout
        onOpenConfig={() => {}}
        inventory={inventory}
        selectedAsset={selected as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
        switcher={switcher}
        engineContexts={[]}
      />
      <SwitchNotice notice={switcher.notice} onUndo={() => void switcher.undo()} onDismiss={switcher.dismiss} />
    </>
  );
}

const header = () => screen.getByTestId("inspector-header");
const skillSwitch = () => within(header()).getByRole("button", { name: /^Switch figma (off|on) for every engine$/ });

describe("Flyout — the switch in a store skill's header", () => {
  beforeEach(() => invoke.mockReset());
  afterEach(cleanup);

  it("asks get_skill_switch for the selected skill's path", async () => {
    backend(SWITCHABLE);
    render(<Harness />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_skill_switch", { skillPath: STORE_PATH }));
  });

  it("a store skill shows the switch pressed, reading On, named for what a click does", async () => {
    backend(SWITCHABLE);
    render(<Harness />);
    const button = await waitFor(() => skillSwitch());
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.getAttribute("aria-label")).toBe(skillSwitchLabel("figma", true));
    expect(within(header()).getByTestId("skill-header-switch")).toBeTruthy();
    expect(within(header()).getByText("On")).toBeTruthy();
  });

  it("a click switches it off by its key, and the switch is disabled while that runs", async () => {
    let release!: (r: SkillSwitchReply) => void;
    backend(SWITCHABLE, new Promise<SkillSwitchReply>((r) => (release = r)));
    render(<Harness />);
    fireEvent.click(await waitFor(() => skillSwitch()));
    await waitFor(() => expect((skillSwitch() as HTMLButtonElement).disabled).toBe(true));
    expect(invoke).toHaveBeenCalledWith("set_skill_enabled", { key: "skill:figma", enabled: false });
    release(OFF_REPLY);
    await screen.findByText("figma is off for every engine.");
  });

  it("a skill outside the store shows no switch and no line", async () => {
    backend(null);
    render(<Harness />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_skill_switch", { skillPath: STORE_PATH }));
    await new Promise((r) => setTimeout(r, 0));
    expect(within(header()).queryByTestId("skill-header-switch")).toBeNull();
    expect(within(header()).queryByTestId("layer-switch")).toBeNull();
    expect(within(header()).queryByTestId("skill-read-only")).toBeNull();
  });

  it("a read-only skill shows why, and no switch", async () => {
    backend(NESTED);
    render(<Harness />);
    expect(await within(header()).findByText(skillReadOnlyLine("inside_another_folder"))).toBeTruthy();
    expect(within(header()).queryByTestId("skill-header-switch")).toBeNull();
    expect(within(header()).queryByRole("button", { name: /for every engine/ })).toBeNull();
  });

  it("nothing is drawn before the reply lands", async () => {
    let answer!: (i: SkillSwitchInfo) => void;
    backend(new Promise<SkillSwitchInfo>((r) => (answer = r)));
    render(<Harness />);
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("get_skill_switch", { skillPath: STORE_PATH }));
    expect(within(header()).queryByTestId("skill-header-switch")).toBeNull();
    expect(within(header()).queryByText(/^(On|Off)$/)).toBeNull();
    answer(SWITCHABLE);
    await waitFor(() => skillSwitch());
  });

  it("an MCP server never asks for a skill switch", async () => {
    backend(SWITCHABLE);
    render(
      <Flyout
        onOpenConfig={() => {}}
        inventory={inventory}
        selectedAsset={{ name: "cua", category: "Tools", path: "/x" } as never}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
        engineContexts={[]}
      />
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke.mock.calls.some(([c]) => c === "get_skill_switch")).toBe(false);
  });
});
