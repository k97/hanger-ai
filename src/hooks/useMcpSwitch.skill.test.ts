// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMcpSwitch, busyKeyOf } from "./useMcpSwitch";
import type { KeptSkills, SkillSwitchReply } from "../types/skillSwitch";

/**
 * The skill switch goes through the one switch state too
 * (docs/plans/2026-11-26-skill-switch.md, Task 7): one notice, one Undo, and
 * the one rescan after every change, which is what rebuilds ⌘K's index so a
 * skill that is off stops turning up in search.
 */

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args?: unknown) => invoke(cmd, args) }));

const NONE: KeptSkills = { skills: [], count: 0 };
const ONE: KeptSkills = {
  skills: [
    {
      key: "kept-skill:00000000-0000-4000-8000-000000000001",
      name: "figma",
      at_ms: 1795566217263,
      links_count: 2,
      interrupted: false,
      back_in_store: false,
    },
  ],
  count: 1,
};

/** `docs/ipc.md` entry 22's reply after `figma` was switched off. */
const offReply = (links = 2): SkillSwitchReply => ({
  name: "figma",
  receipt_id: "kept:00000000-0000-4000-8000-000000000001",
  undoable: true,
  links_count: links,
  links_not_restored: [],
  kept: ONE,
});
const onReply = (notRestored: string[] = []): SkillSwitchReply => ({
  name: "figma",
  receipt_id: "restored:figma",
  undoable: true,
  links_count: 2,
  links_not_restored: notRestored,
  kept: NONE,
});
const unchanged: SkillSwitchReply = {
  name: "figma",
  receipt_id: null,
  undoable: false,
  links_count: 0,
  links_not_restored: [],
  kept: NONE,
};

const OFF = { key: "skill:figma", skillName: "figma", enabled: false };
const ON = { key: "kept-skill:00000000-0000-4000-8000-000000000001", skillName: "figma", enabled: true };

function setup() {
  const onChanged = vi.fn();
  const hook = renderHook(() => useMcpSwitch({ onChanged }));
  return { onChanged, result: hook.result };
}

const line = (r: { current: ReturnType<typeof useMcpSwitch> }) =>
  r.current.notice && r.current.notice.kind !== undefined ? r.current.notice.line : null;

describe("useMcpSwitch — skills", () => {
  beforeEach(() => invoke.mockReset());

  it("switchSkill_sends_key_and_enabled_and_shows_the_off_line", async () => {
    invoke.mockResolvedValueOnce(offReply());
    const { result, onChanged } = setup();
    let reply: SkillSwitchReply | null = null;
    await act(async () => {
      reply = await result.current.switchSkill(OFF);
    });
    expect(invoke).toHaveBeenCalledWith("set_skill_enabled", { key: "skill:figma", enabled: false });
    expect(reply).toEqual(offReply());
    expect(line(result)).toBe("figma is off for every engine. Hanger removed 2 links to it and will put them back.");
    expect(result.current.notice).toMatchObject({ kind: "done", undoable: true, pending: false });
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("every successful skill switch asks for the rescan that rebuilds search: Off, On and Undo", async () => {
    const { result, onChanged } = setup();
    invoke.mockResolvedValueOnce(offReply());
    await act(async () => void (await result.current.switchSkill(OFF)));
    expect(onChanged).toHaveBeenCalledTimes(1);
    invoke.mockResolvedValueOnce(onReply());
    await act(async () => void (await result.current.undo()));
    expect(onChanged).toHaveBeenCalledTimes(2);
    invoke.mockResolvedValueOnce(onReply());
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(onChanged).toHaveBeenCalledTimes(3);
    // A refusal changed nothing, so there is nothing to rescan.
    invoke.mockRejectedValueOnce("already_there");
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(onChanged).toHaveBeenCalledTimes(3);
  });

  it("a_no_change_reply_shows_nothing_and_does_not_rescan", async () => {
    invoke.mockResolvedValueOnce(unchanged);
    const { result, onChanged } = setup();
    await act(async () => void (await result.current.switchSkill({ ...OFF, enabled: true })));
    expect(result.current.notice).toBeNull();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("switching a kept skill on says it is back on, with no word about the links", async () => {
    invoke.mockResolvedValueOnce(onReply());
    const { result } = setup();
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(invoke).toHaveBeenCalledWith("set_skill_enabled", { key: ON.key, enabled: true });
    expect(line(result)).toBe("figma is back on for every engine.");
  });

  it("links_not_restored_adds_its_line", async () => {
    invoke.mockResolvedValueOnce(onReply(["~/Work/gone/.claude/skills/figma"]));
    const { result } = setup();
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(line(result)).toBe(
      "figma is back on for every engine. Some links weren't put back because their folders are gone: ~/Work/gone/.claude/skills/figma."
    );
  });

  it("undo_of_a_skill_calls_undo_skill_switch_with_the_receipt", async () => {
    const { result } = setup();
    invoke.mockResolvedValueOnce(offReply());
    await act(async () => void (await result.current.switchSkill(OFF)));
    invoke.mockResolvedValueOnce(onReply());
    await act(async () => void (await result.current.undo()));
    expect(invoke).toHaveBeenLastCalledWith("undo_skill_switch", {
      receiptId: "kept:00000000-0000-4000-8000-000000000001",
    });
    expect(invoke.mock.calls.some(([c]) => c === "undo_mcp_switch")).toBe(false);
    expect(line(result)).toBe("figma is back on for every engine.");
    // And the Undo of that Undo switches it off again, with no "again".
    invoke.mockResolvedValueOnce(offReply(0));
    await act(async () => void (await result.current.undo()));
    expect(invoke).toHaveBeenLastCalledWith("undo_skill_switch", { receiptId: "restored:figma" });
    expect(line(result)).toBe("figma is off for every engine.");
  });

  it("undo_survives_the_rescan_a_switch_triggers", async () => {
    // The rescan App runs in `onChanged` re-renders everything; the hook
    // keeps the receipt across it, and the backend needs nothing more.
    const onChanged = vi.fn();
    const hook = renderHook(({ tick }) => (void tick, useMcpSwitch({ onChanged })), { initialProps: { tick: 0 } });
    invoke.mockResolvedValueOnce(offReply());
    await act(async () => void (await hook.result.current.switchSkill(OFF)));
    expect(onChanged).toHaveBeenCalledTimes(1);
    hook.rerender({ tick: 1 });
    expect(hook.result.current.notice).toMatchObject({ kind: "done", undoable: true });
    invoke.mockResolvedValueOnce(onReply());
    await act(async () => void (await hook.result.current.undo()));
    expect(invoke).toHaveBeenLastCalledWith("undo_skill_switch", {
      receiptId: "kept:00000000-0000-4000-8000-000000000001",
    });
  });

  it("a refusal shows the code's line, and an unknown code gets the fallback", async () => {
    const { result } = setup();
    invoke.mockRejectedValueOnce("already_there");
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(result.current.notice).toEqual({
      kind: "failed",
      line: "There's a skill named figma in the global store again. Hanger changed nothing and kept its copy.",
    });
    invoke.mockRejectedValueOnce(new Error("/Users/someone/.agents/skills/figma"));
    await act(async () => void (await result.current.switchSkill(ON)));
    expect(line(result)).toBe("Hanger couldn't make that change. Nothing was changed.");
  });

  it("holds the skill's busy key while its request is in flight, and ignores a second click", async () => {
    let release!: (r: SkillSwitchReply) => void;
    invoke.mockImplementationOnce(() => new Promise((r) => (release = r)));
    const { result } = setup();
    let first!: Promise<unknown>;
    act(() => {
      first = result.current.switchSkill(OFF);
    });
    expect(result.current.busyKeys.has(busyKeyOf("skills", "skill:figma"))).toBe(true);
    await act(async () => {
      expect(await result.current.switchSkill(OFF)).toBeNull();
    });
    expect(invoke).toHaveBeenCalledTimes(1);
    await act(async () => {
      release(offReply());
      await first;
    });
    expect(result.current.busyKeys.size).toBe(0);
  });
});
