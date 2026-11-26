import { describe, it, expect } from "vitest";
import {
  stateLabel,
  readOnlyLine,
  failureLine,
  isSwitchFailure,
  switchedLine,
  mechanismLine,
  paletteActionLabel,
  budgetCaption,
  costLabel,
  switchedOffLine,
  alsoDeclaredLine,
  SHOW_DECLARED,
  engineBandFigures,
  runsOnVendorServersOnly,
  VENDOR_SERVERS_LINE,
} from "./switchCopy";
import type { ContextItem, EngineContext } from "../types/engineContext";

// Every expected string below is copied from
// docs/plans/2026-11-24-context-control-naming-brief.md, or from the "New
// strings" table of docs/plans/2026-11-25-context-control-finish.md, with the
// placeholders filled from these names.
const n = { engine: "Engine X", server: "github", file: "~/.x/config.toml" };
const noFile = { engine: "Engine X", server: "github" };

describe("stateLabel", () => {
  it("names the two states", () => {
    expect(stateLabel("on")).toBe("On");
    expect(stateLabel("off")).toBe("Off");
  });
});

describe("readOnlyLine", () => {
  it("has the brief's line for every reason", () => {
    expect(readOnlyLine("engine_not_confirmed", n)).toBe(
      "Hanger can't switch Engine X servers yet. Nothing has confirmed how Engine X turns one off."
    );
    expect(readOnlyLine("per_project_comes_next", n)).toBe(
      "Hanger can't switch servers declared in ~/.x/config.toml yet."
    );
    expect(readOnlyLine("switches_by_name_everywhere", n)).toBe(
      "Declared in a project. Engine X's switch covers every project, so Hanger leaves this one alone."
    );
    expect(readOnlyLine("managed_by_plugin", n)).toBe(
      "Declared by a plugin. A change here would be undone when the plugin updates."
    );
    expect(readOnlyLine("managed_by_policy", n)).toBe(
      "Set by a managed configuration. Hanger doesn't change managed files."
    );
    expect(readOnlyLine("runs_on_vendor_servers", n)).toBe(
      "Runs on the vendor's servers. There's nothing on this machine to switch."
    );
    expect(readOnlyLine("file_unparseable", n)).toBe(
      "Hanger can't read ~/.x/config.toml, so it can't switch this server."
    );
  });

  it("names the engine's config in place of the path when no file is known", () => {
    // Q5 of docs/plans/2026-11-25-decisions-round-2.md: "{engine}'s config",
    // not "the file".
    expect(readOnlyLine("per_project_comes_next", noFile)).toBe(
      "Hanger can't switch servers declared in Engine X's config yet."
    );
    expect(readOnlyLine("file_unparseable", { ...noFile, file: "" })).toBe(
      "Hanger can't read Engine X's config, so it can't switch this server."
    );
  });
});

describe("failureLine", () => {
  it("has the brief's line for every failure code", () => {
    expect(failureLine("changed_since_read", n)).toBe(
      "~/.x/config.toml changed while Hanger was working. Nothing was written. Try again."
    );
    expect(failureLine("would_not_come_back", n)).toBe(
      "Engine X wouldn't give this server back unchanged, so Hanger left it on. Its own command drops settings it doesn't recognise."
    );
    expect(failureLine("cli_not_found", n)).toBe(
      "Hanger couldn't find the Engine X command on this machine."
    );
    expect(failureLine("cli_failed", n)).toBe(
      "Engine X's command didn't make the change. Nothing was lost."
    );
    expect(failureLine("not_verified", n)).toBe(
      "Hanger couldn't confirm the change, so it kept its copy. Check Engine X's own list."
    );
    expect(failureLine("already_there", n)).toBe(
      "github is already declared for Engine X. Hanger changed nothing and kept its copy."
    );
    expect(failureLine("not_undoable", n)).toBe(
      "This can't be undone now. The file has changed since."
    );
    expect(failureLine("unparseable", n)).toBe(
      "Hanger can't read ~/.x/config.toml. Fix it in an editor and try again."
    );
    expect(failureLine("write_failed", n)).toBe(
      "Hanger couldn't write the change. The list shows where things stand now."
    );
    expect(failureLine("read_only", n)).toBe("Hanger can't switch this server.");
    expect(failureLine("not_found", n)).toBe("Hanger can't find that server any more.");
    expect(failureLine("wrong_engine", n)).toBe("Hanger can't find that server for Engine X.");
    expect(failureLine("name_refused", n)).toBe(
      "Hanger won't pass this server's name to Engine X's command."
    );
  });

  it("names the engine's config in place of the path when no file is known", () => {
    expect(failureLine("changed_since_read", noFile)).toBe(
      "Engine X's config changed while Hanger was working. Nothing was written. Try again."
    );
    expect(failureLine("unparseable", { ...noFile, file: "" })).toBe(
      "Hanger can't read Engine X's config. Fix it in an editor and try again."
    );
  });

  it("falls back to a line that quotes nothing for a code it does not know", () => {
    expect(failureLine("something_new", n)).toBe(
      "Hanger couldn't make that change. Nothing was changed."
    );
    expect(failureLine("toString", n)).toBe(
      "Hanger couldn't make that change. Nothing was changed."
    );
  });
});

describe("isSwitchFailure", () => {
  it("accepts every backend code", () => {
    for (const code of [
      "not_found",
      "wrong_engine",
      "read_only",
      "unparseable",
      "changed_since_read",
      "write_failed",
      "not_verified",
      "would_not_come_back",
      "cli_not_found",
      "cli_failed",
      "already_there",
      "not_undoable",
      "name_refused",
    ]) {
      expect(isSwitchFailure(code)).toBe(true);
    }
  });

  it("refuses anything else, including an object's own keys", () => {
    expect(isSwitchFailure("something_new")).toBe(false);
    expect(isSwitchFailure("toString")).toBe(false);
    expect(isSwitchFailure("__proto__")).toBe(false);
    expect(isSwitchFailure(undefined)).toBe(false);
    expect(isSwitchFailure(null)).toBe(false);
    expect(isSwitchFailure(new Error("not_found"))).toBe(false);
  });
});

describe("switchedLine", () => {
  it("says what the reply shows", () => {
    expect(switchedLine("off", n)).toBe("github is off for Engine X.");
    expect(switchedLine("on", n)).toBe("github is on for Engine X.");
    expect(switchedLine("undo_on", n)).toBe("github is back on for Engine X.");
    expect(switchedLine("undo_off", n)).toBe("github is off for Engine X again.");
  });
});

describe("mechanismLine", () => {
  it("explains a kept server and a switch by name", () => {
    expect(mechanismLine("claude_kept", n)).toBe(
      "Removed from Engine X. Hanger keeps its configuration and puts it back when you switch it on."
    );
    expect(mechanismLine("gemini_by_name", n)).toBe(
      "Engine X switches by name, so this covers every server named github."
    );
  });
});

describe("paletteActionLabel", () => {
  it("names the state the action leads to", () => {
    expect(paletteActionLabel(true, n)).toBe("Switch github on for Engine X");
    expect(paletteActionLabel(false, n)).toBe("Switch github off for Engine X");
  });
});

describe("budget and cost", () => {
  it("adds the off figure to the caption only when some are off", () => {
    expect(budgetCaption(12, 15, 0)).toBe("12 of 15 servers measured");
    expect(budgetCaption(12, 15, 3)).toBe("12 of 15 servers measured · 3 off");
  });

  it("says a server is not measured rather than costing nothing", () => {
    expect(costLabel(null)).toBe("Not measured");
    expect(costLabel(0)).toBe("≈ 0 tokens");
    expect(costLabel(1200)).toBe("≈ 1,200 tokens");
  });
});

describe("switchedOffLine", () => {
  it("says when a kept server was switched off, in timeAgo's words", () => {
    // Approved 2026-11-25 (docs/plans/2026-11-25-decisions-round-2.md).
    expect(switchedOffLine("4 min ago")).toBe("Switched off 4 min ago");
    expect(switchedOffLine("moments ago")).toBe("Switched off moments ago");
  });
});

describe("alsoDeclaredLine", () => {
  it("names the server a config file still declares, and the link that shows it", () => {
    // Approved 2026-11-25 (docs/plans/2026-11-25-decisions-round-2.md).
    expect(alsoDeclaredLine(n)).toBe("A config file still declares a server named github.");
    expect(SHOW_DECLARED).toBe("Show it");
  });
});

describe("an engine whose servers all run on the vendor's servers", () => {
  // Approved 2026-11-25 (docs/plans/2026-11-25-decisions-round-2.md):
  // Claude.ai's, where "0 of N servers measured" implies a measure that
  // cannot happen. The backend gives `runs_on_vendor_servers` to claude-ai
  // alone (mcp/switch/context.rs).
  const vendorItem = (name: string): ContextItem =>
    ({
      key: `claude-ai:${name}`,
      name,
      tier: "global",
      config_path: "",
      state: "on",
      read_only: "runs_on_vendor_servers",
      estimated_tokens: null,
      tool_count: null,
    }) as ContextItem;
  const ctx = (items: ContextItem[]): EngineContext => ({
    engine_id: "claude-ai",
    engine_key: "claude_ai",
    engine_name: "Engine A",
    applies: null,
    switches_by_name: false,
    items,
    on_count: 2,
    off_count: 0,
    measured_on_count: 0,
    on_tokens_measured: 0,
  });

  it("is a yes over the items, and a no for none or for a mix", () => {
    expect(runsOnVendorServersOnly(ctx([vendorItem("a"), vendorItem("b")]))).toBe(true);
    expect(runsOnVendorServersOnly(ctx([vendorItem("a"), { ...vendorItem("b"), read_only: null }]))).toBe(false);
    expect(runsOnVendorServersOnly(ctx([]))).toBe(false);
    expect(runsOnVendorServersOnly(null)).toBe(false);
  });

  it("says why in place of the measured caption", () => {
    expect(VENDOR_SERVERS_LINE).toBe("Runs on Anthropic's servers. Hanger can't measure it from this machine.");
    expect(engineBandFigures(ctx([vendorItem("a"), vendorItem("b")]))).toEqual({
      value: null,
      word: "Not measured",
      secondary: VENDOR_SERVERS_LINE,
    });
    expect(engineBandFigures(ctx([vendorItem("a"), { ...vendorItem("b"), read_only: null }])).secondary).toBe(
      "0 of 2 servers measured"
    );
  });
});

// ---------------------------------------------------------------------------
// The skill switch. Every expected string is copied from the "Proposed
// strings" table of docs/plans/2026-11-26-skill-switch.md, approved by
// Karthik on 2026-11-26 as written, with `{skill}` filled as "figma".
// ---------------------------------------------------------------------------

import {
  skillSwitchedLine,
  skillFailureLine,
  skillReadOnlyLine,
  skillSwitchLabel,
  skillStateLabel,
  linksNotRestoredLine,
  isSkillSwitchFailure,
  KEPT_SKILL_OFF_LINE,
  KEPT_SKILL_MECHANISM,
  keptSkillsHead,
  backInStoreLine,
  INTERRUPTED_LINE,
} from "./switchCopy";
import type { SkillReadOnly, SkillSwitchFailure } from "../types/skillSwitch";

const SKILL_FAILURES: Record<SkillSwitchFailure, string> = {
  not_found: "Hanger can't find figma in the global store any more.",
  changed_since_read: "A link to figma changed while Hanger was working. Nothing was moved. Try again.",
  already_there: "There's a skill named figma in the global store again. Hanger changed nothing and kept its copy.",
  link_place_taken: "Something else is where a link to figma used to be. Hanger changed nothing and kept its copy.",
  changed_since_kept: "figma changed while Hanger kept it, so Hanger left it in its keep.",
  other_volume:
    "The global store is on another disk from Hanger's keep, so Hanger can't move this skill without copying it.",
  write_failed: "Hanger couldn't move figma. The list shows where things stand now.",
  not_verified: "Hanger couldn't confirm figma came back unchanged, so it kept its record.",
  not_undoable: "This can't be undone now. The skill has moved since.",
  read_only: "Hanger can't switch this skill.",
  name_refused: "Hanger won't move a skill with this name.",
};

const SKILL_READ_ONLY: Record<SkillReadOnly, string> = {
  inside_another_folder:
    "This skill is inside another folder in the global store. Hanger only switches the ones at the top.",
  other_volume:
    "The global store is on another disk from Hanger's keep, so Hanger can't move this skill without copying it.",
  has_tracked_copies:
    "Hanger copied this skill into a project and tracks that copy. Switching it off would lose track of it.",
};

describe("the skill switch's copy", () => {
  it("every_skill_failure_code_has_a_line", () => {
    for (const [code, line] of Object.entries(SKILL_FAILURES)) {
      expect(skillFailureLine(code, "figma"), code).toBe(line);
      expect(isSkillSwitchFailure(code), code).toBe(true);
    }
    expect(Object.keys(SKILL_FAILURES)).toHaveLength(11);
  });

  it("an_unknown_code_gets_the_fallback_line", () => {
    for (const code of ["", "toString", "cli_failed", "something_new"]) {
      expect(skillFailureLine(code, "figma"), code).toBe("Hanger couldn't make that change. Nothing was changed.");
      expect(isSkillSwitchFailure(code), code).toBe(false);
    }
  });

  it("has the table's line for every read-only reason", () => {
    for (const [reason, line] of Object.entries(SKILL_READ_ONLY)) {
      expect(skillReadOnlyLine(reason as SkillReadOnly)).toBe(line);
    }
    // "Failure: other_volume — Same as the read-only line".
    expect(skillFailureLine("other_volume", "figma")).toBe(skillReadOnlyLine("other_volume"));
  });

  it("says what a switch did, and the links it removed, singular and plural", () => {
    expect(skillSwitchedLine("off", "figma", 0)).toBe("figma is off for every engine.");
    expect(skillSwitchedLine("off", "figma", 3)).toBe(
      "figma is off for every engine. Hanger removed 3 links to it and will put them back."
    );
    expect(skillSwitchedLine("off", "figma", 1)).toBe(
      "figma is off for every engine. Hanger removed 1 link to the skill and will put it back."
    );
    // Back on: the links are back, so nothing more is said about them.
    expect(skillSwitchedLine("back_on", "figma", 3)).toBe("figma is back on for every engine.");
  });

  it("links_not_restored_adds_its_line", () => {
    expect(linksNotRestoredLine(["~/Work/gone/.claude/skills/figma"])).toBe(
      "Some links weren't put back because their folders are gone: ~/Work/gone/.claude/skills/figma."
    );
    expect(linksNotRestoredLine(["~/a/figma", "~/b/figma"])).toBe(
      "Some links weren't put back because their folders are gone: ~/a/figma and ~/b/figma."
    );
  });

  it("names the header switch by what a click does, and its state word", () => {
    expect(skillSwitchLabel("figma", true)).toBe("Switch figma off for every engine");
    expect(skillSwitchLabel("figma", false)).toBe("Switch figma on for every engine");
    expect(skillStateLabel(true)).toBe("On");
    expect(skillStateLabel(false)).toBe("Off");
  });

  it("has the kept group's and panel's lines", () => {
    expect(keptSkillsHead(2, true)).toBe("Switched off · 2");
    expect(keptSkillsHead(2, false)).toBe("Switched off");
    expect(KEPT_SKILL_OFF_LINE).toBe("Off for every engine");
    expect(KEPT_SKILL_MECHANISM).toBe(
      "Moved out of the global store. Hanger keeps it and puts it back, with its links, when you switch it on."
    );
    expect(backInStoreLine("figma")).toBe("There's a skill named figma in the global store again.");
    expect(INTERRUPTED_LINE).toBe("Hanger stopped partway through switching this off. Switch it on to put it back.");
  });
});
