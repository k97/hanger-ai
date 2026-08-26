import { describe, it, expect } from "vitest";
import { parseProbe } from "./probeView";

const ZERO_COST = { toolCount: 0, describedToolCount: 0, descriptionBytesTotal: 0,
                    estimatedTokens: 0, perTool: [] };

describe("parseProbe", () => {
  it("reads a failed probe as failed, discarding the zeroed cost the backend still sends", () => {
    // The backend builds `cost` unconditionally from `result.tools`, and a failed
    // probe's tools are `[]` — so a failure arrives carrying a TRUTHY all-zero cost
    // beside its error. Mirroring that here is the whole point of this test: a
    // fixture that omits `cost` on an error cannot exercise the bug this narrows away.
    const v = parseProbe(
      { result: { capabilities: [], tools: [], error: "Timed out after 20s" }, cost: ZERO_COST },
      1_700_000_000_000
    );
    expect(v).not.toBeNull();
    expect(v!.kind).toBe("failed");
    expect(v!).not.toHaveProperty("cost");
    if (v!.kind === "failed") expect(v!.error).toBe("Timed out after 20s");
  });

  it("reads an answered probe as answered, carrying its cost", () => {
    const v = parseProbe(
      { result: { capabilities: ["tools"], tools: [{ name: "click" }] },
        cost: { ...ZERO_COST, toolCount: 1, estimatedTokens: 42, descriptionBytesTotal: 109 } },
      1_700_000_000_000
    );
    expect(v!.kind).toBe("answered");
    if (v!.kind === "answered") {
      expect(v!.cost?.estimatedTokens).toBe(42);
      expect(v!.tools).toHaveLength(1);
    }
  });

  it("reads an answered probe with no cost as answered without one", () => {
    const v = parseProbe({ result: { capabilities: [], tools: [] } }, 1_700_000_000_000);
    expect(v!.kind).toBe("answered");
    if (v!.kind === "answered") expect(v!.cost).toBeUndefined();
  });

  it("answers null when the backend declined with nothing cached", () => {
    // `result: null` is not an error and not an empty tool list. The panel's own
    // explanation belongs there, so the parse must not manufacture either.
    expect(parseProbe({ result: null }, 1_700_000_000_000)).toBeNull();
  });

  it("treats an empty error string as answered, not failed", () => {
    // Guards the discriminant against truthiness drift: `error: ""` must not
    // become a failure with no message to show.
    const v = parseProbe({ result: { capabilities: [], tools: [], error: "" } }, 1_700_000_000_000);
    expect(v!.kind).toBe("answered");
  });
});
