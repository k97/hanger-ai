import { describe, it, expect } from "vitest";
import {
  allEnginesRequests,
  allEnginesState,
  serverSwitchTargets,
  stillOnEngines,
  switchRequestFor,
} from "./switchTargets";
import {
  allEnginesStateLabel,
  allEnginesSwitchLabel,
  groupSwitchedLine,
  stillOnLine,
} from "./switchCopy";
import type { ContextItem, EngineContext } from "../types/engineContext";

/**
 * The switch in an MCP server's inspector header that covers every engine
 * (docs/plans/2026-11-25-decisions-round-5.md and -round-6.md): which items it
 * counts, the word beside it, what one click asks for, and its lines.
 */

const item = (over: Partial<ContextItem> & Pick<ContextItem, "key">): ContextItem =>
  ({
    name: "cua",
    tier: "user",
    config_path: "~/x",
    state: "on",
    read_only: null,
    estimated_tokens: null,
    tool_count: null,
    ...over,
  }) as ContextItem;

const ctx = (engine_id: string, engine_name: string, items: ContextItem[], switches_by_name = false): EngineContext => ({
  engine_id,
  engine_key: engine_id.replace(/-/g, "_"),
  engine_name,
  applies: null,
  switches_by_name,
  items,
  on_count: 0,
  off_count: 0,
  measured_on_count: 0,
  on_tokens_measured: 0,
});

const codex = ctx("codex", "Codex", [
  item({ key: "codex:cua" }),
  item({ key: "codex:other", name: "other" }),
]);
const claude = ctx("claude-code", "Claude Code", [
  item({ key: "claude:cua", state: "off" }),
  item({ key: "stash:1", name: "cua", state: "off", config_path: "" }),
  item({ key: "claude:proj", tier: "project", read_only: "per_project_comes_next" }),
]);
const gemini = ctx(
  "gemini",
  "Gemini",
  [item({ key: "gemini:a" }), item({ key: "gemini:b" })],
  true
);
const cursor = ctx("cursor", "Cursor", [item({ key: "cursor:cua", read_only: "engine_not_confirmed" })]);
const vscode = ctx("vscode", "VS Code", [item({ key: "vscode:cua", read_only: "engine_not_confirmed" })]);
const zedOff = ctx("zed", "Zed", [item({ key: "zed:cua", state: "off", read_only: "engine_not_confirmed" })]);

const keys = (ts: { item: ContextItem }[]) => ts.map((t) => t.item.key);

describe("serverSwitchTargets", () => {
  it("counts only items of that name Hanger can switch, kept ones included, in context order", () => {
    expect(keys(serverSwitchTargets([codex, claude, cursor], "cua"))).toEqual(["codex:cua", "claude:cua", "stash:1"]);
  });

  it("takes one item from an engine that switches by name: one switch covers them all", () => {
    expect(keys(serverSwitchTargets([gemini], "cua"))).toEqual(["gemini:a"]);
  });

  it("is empty when nothing of that name can be switched", () => {
    expect(serverSwitchTargets([cursor, vscode], "cua")).toEqual([]);
    expect(serverSwitchTargets([codex], "absent")).toEqual([]);
  });
});

describe("allEnginesState", () => {
  it("is on when every switchable item is on, off when all are off, some otherwise", () => {
    expect(allEnginesState(serverSwitchTargets([codex, gemini], "cua"))).toBe("on");
    expect(allEnginesState(serverSwitchTargets([claude], "cua"))).toBe("off");
    expect(allEnginesState(serverSwitchTargets([codex, claude], "cua"))).toBe("some");
  });

  it("is null with nothing to switch", () => {
    expect(allEnginesState([])).toBeNull();
  });
});

describe("allEnginesRequests", () => {
  it("switches off only the items that are on while any is on", () => {
    const targets = serverSwitchTargets([codex, claude, gemini], "cua");
    expect(allEnginesRequests(targets)).toEqual([
      switchRequestFor({ ctx: codex, item: codex.items[0] }),
      switchRequestFor({ ctx: gemini, item: gemini.items[0] }),
    ]);
    expect(allEnginesRequests(targets).every((r) => r.enabled === false)).toBe(true);
  });

  it("switches every item back on when all are off", () => {
    const requests = allEnginesRequests(serverSwitchTargets([claude], "cua"));
    expect(requests.map((r) => [r.key, r.enabled])).toEqual([
      ["claude:cua", true],
      ["stash:1", true],
    ]);
  });
});

describe("stillOnEngines", () => {
  it("names engines that carry the server on and that Hanger can switch none of", () => {
    // Claude Code has a read-only project item, but Hanger switches its
    // other items, so it is not "still on" in this sense; Zed's is off.
    expect(stillOnEngines([codex, claude, cursor, vscode, zedOff], "cua")).toEqual(["Cursor", "VS Code"]);
  });
});

describe("the header switch's words", () => {
  it("labels its three states", () => {
    expect(allEnginesStateLabel("on")).toBe("On");
    expect(allEnginesStateLabel("off")).toBe("Off");
    expect(allEnginesStateLabel("some")).toBe("On in some");
  });

  it("names the switch", () => {
    expect(allEnginesSwitchLabel("cua")).toBe("Switch cua off in every engine");
  });

  it("says which engines were switched, joined with commas and and", () => {
    expect(groupSwitchedLine("off", "cua", ["Codex", "Claude Code", "Gemini"])).toBe(
      "cua is off for Codex, Claude Code and Gemini."
    );
    expect(groupSwitchedLine("back_on", "cua", ["Codex", "Claude Code", "Gemini"])).toBe(
      "cua is back on for Codex, Claude Code and Gemini."
    );
    expect(groupSwitchedLine("off_again", "cua", ["Codex", "Gemini"])).toBe("cua is off for Codex and Gemini again.");
    expect(groupSwitchedLine("off", "cua", ["Codex"])).toBe("cua is off for Codex.");
  });

  it("says which engines it left on", () => {
    expect(stillOnLine(["Cursor", "VS Code"])).toBe("Still on for Cursor and VS Code. Hanger can't switch those yet.");
  });
});
