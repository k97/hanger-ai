// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import Flyout from "./Flyout";
import SwitchNotice from "./SwitchNotice";
import { Inventory } from "../App";
import { useMcpSwitch } from "../hooks/useMcpSwitch";
import type { KeptSkill, SkillSwitchReply } from "../types/skillSwitch";

/**
 * A kept skill's panel in the inspector (docs/plans/2026-11-26-skill-switch.md,
 * Task 9): its name and an Off switch in the header, the row that says it is
 * off for every engine, when, what happened to it, and why switching it on
 * may not work.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: vi.fn(), revealItemInDir: vi.fn() }));

const nothing: Inventory = { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };

const FIGMA: KeptSkill = {
  key: "kept-skill:00000000-0000-4000-8000-000000000001",
  name: "figma",
  at_ms: Date.now() - 4 * 60_000 - 5_000,
  links_count: 2,
  interrupted: false,
  back_in_store: false,
};
const ON_REPLY: SkillSwitchReply = {
  name: "figma",
  receipt_id: "restored:figma",
  undoable: true,
  links_count: 2,
  links_not_restored: [],
  kept: { skills: [], count: 0 },
};

function Harness({ skill }: { skill: KeptSkill }) {
  const switcher = useMcpSwitch({ onChanged: () => {} });
  return (
    <>
      <Flyout
        onOpenConfig={() => {}}
        inventory={nothing}
        mcpProcesses={[]}
        linkedProjects={[]}
        onRefresh={() => {}}
        switcher={switcher}
        engineContexts={[]}
        keptSkill={skill}
      />
      <SwitchNotice notice={switcher.notice} onUndo={() => void switcher.undo()} onDismiss={switcher.dismiss} />
    </>
  );
}

const header = () => screen.getByTestId("inspector-header");
const panel = () => screen.getByTestId("kept-skill-detail");

beforeEach(() => {
  invoke.mockReset();
  invoke.mockImplementation((cmd: string) =>
    cmd === "set_skill_enabled" ? Promise.resolve(ON_REPLY) : Promise.resolve(null)
  );
});
afterEach(cleanup);

describe("Flyout — a kept skill", () => {
  it("heads the panel with the skill's name and an Off switch named for turning it on", () => {
    render(<Harness skill={FIGMA} />);
    expect(within(header()).getByRole("heading", { level: 2, name: "figma" })).toBeTruthy();
    const button = within(header()).getByRole("button", { name: "Switch figma on for every engine" });
    expect(button.getAttribute("aria-pressed")).toBe("false");
    expect(within(header()).getByText("Off")).toBeTruthy();
  });

  it("says it is off for every engine, when, and what Hanger did with it", () => {
    render(<Harness skill={FIGMA} />);
    expect(within(panel()).getByText("Off for every engine")).toBeTruthy();
    expect(within(panel()).getByText("Switched off 4 min ago")).toBeTruthy();
    expect(
      within(panel()).getByText(
        "Moved out of the global store. Hanger keeps it and puts it back, with its links, when you switch it on."
      )
    ).toBeTruthy();
    expect(within(panel()).queryByText(/global store again/)).toBeNull();
    expect(within(panel()).queryByText(/stopped partway/)).toBeNull();
  });

  it("the panel's body holds no switch: the header's is the one control (Karthik, 2026-11-26)", () => {
    render(<Harness skill={FIGMA} />);
    expect(panel().querySelectorAll("[aria-pressed]").length).toBe(0);
    expect(within(panel()).queryByRole("button")).toBeNull();
    expect(within(panel()).getByText("Off for every engine")).toBeTruthy();
  });

  it("the header's switch turns it on by its kept-skill key", async () => {
    render(<Harness skill={FIGMA} />);
    fireEvent.click(within(header()).getByRole("button", { name: "Switch figma on for every engine" }));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("set_skill_enabled", { key: FIGMA.key, enabled: true }));
    await screen.findByText("figma is back on for every engine.");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("undo_skill_switch", { receiptId: ON_REPLY.receipt_id })
    );
  });

  it("back in the store: says so, and the switch still sends, so the backend's refusal is what the notice says", async () => {
    invoke.mockImplementation((cmd: string) =>
      cmd === "set_skill_enabled" ? Promise.reject("already_there") : Promise.resolve(null)
    );
    render(<Harness skill={{ ...FIGMA, back_in_store: true }} />);
    expect(within(panel()).getByText("There's a skill named figma in the global store again.")).toBeTruthy();
    const button = within(header()).getByRole("button", { name: "Switch figma on for every engine" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    await screen.findByText(
      "There's a skill named figma in the global store again. Hanger changed nothing and kept its copy."
    );
    expect(invoke).toHaveBeenCalledWith("set_skill_enabled", { key: FIGMA.key, enabled: true });
  });

  it("interrupted: says Hanger stopped partway, and that switching it on puts it back", () => {
    render(<Harness skill={{ ...FIGMA, interrupted: true }} />);
    expect(
      within(panel()).getByText("Hanger stopped partway through switching this off. Switch it on to put it back.")
    ).toBeTruthy();
  });

  it("asks no skill switch of the backend for a kept skill's path: it has none", async () => {
    render(<Harness skill={FIGMA} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke.mock.calls.some(([c]) => c === "get_skill_switch")).toBe(false);
  });
});
