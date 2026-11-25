import { describe, it, expect } from "vitest";
import {
  stateLabel,
  readOnlyLine,
  failureLine,
  isSwitchFailure,
  switchedLine,
  mechanismLine,
  paletteActionLabel,
  budgetHeadline,
  budgetCaption,
  costLabel,
  switchedOffLine,
  alsoDeclaredLine,
  SHOW_DECLARED,
} from "./switchCopy";

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

  it("drops the path, not the sentence, when no file is known", () => {
    expect(readOnlyLine("per_project_comes_next", noFile)).toBe(
      "Hanger can't switch servers declared in the file yet."
    );
    expect(readOnlyLine("file_unparseable", { ...noFile, file: "" })).toBe(
      "Hanger can't read the file, so it can't switch this server."
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

  it("drops the path, not the sentence, when no file is known", () => {
    expect(failureLine("changed_since_read", noFile)).toBe(
      "The file changed while Hanger was working. Nothing was written. Try again."
    );
    expect(failureLine("unparseable", { ...noFile, file: "" })).toBe(
      "Hanger can't read the file. Fix it in an editor and try again."
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
  it("groups the headline's figure", () => {
    expect(budgetHeadline(12400)).toBe("≈ 12,400 tokens of tool descriptions");
    expect(budgetHeadline(0)).toBe("≈ 0 tokens of tool descriptions");
  });

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
