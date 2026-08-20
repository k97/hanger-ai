import { describe, it, expect } from "vitest";
import { diffLaunch } from "./launchDiff";

describe("diffLaunch", () => {
  it("aligns two specs that differ in exactly one argument, on that token", () => {
    const result = diffLaunch("npx -y @tauri/mcp@latest", "npx -y @tauri/mcp@2.9.1");
    expect(result.a.map((t) => t.text)).toEqual(["npx", "-y", "@tauri/mcp@latest"]);
    expect(result.b.map((t) => t.text)).toEqual(["npx", "-y", "@tauri/mcp@2.9.1"]);
    expect(result.a.map((t) => t.differs)).toEqual([false, false, true]);
    expect(result.b.map((t) => t.differs)).toEqual([false, false, true]);
  });

  it("aligns two specs that differ only in the command, on the command", () => {
    const result = diffLaunch("python3 server.py", "python server.py");
    expect(result.a[0]).toEqual({ text: "python3", differs: true });
    expect(result.b[0]).toEqual({ text: "python", differs: true });
    expect(result.a[1]).toEqual({ text: "server.py", differs: false });
    expect(result.b[1]).toEqual({ text: "server.py", differs: false });
  });

  it("treats identical specs as agreeing at every token", () => {
    const result = diffLaunch("node server.js --port 4242", "node server.js --port 4242");
    expect(result.a.every((t) => !t.differs)).toBe(true);
    expect(result.b.every((t) => !t.differs)).toBe(true);
  });

  it("marks a token present on only one side as differing, without inventing the missing one", () => {
    const result = diffLaunch("node server.js", "node server.js --verbose");
    expect(result.a).toHaveLength(3);
    expect(result.b).toHaveLength(3);
    expect(result.a[2]).toEqual({ text: "", differs: true });
    expect(result.b[2]).toEqual({ text: "--verbose", differs: true });
  });

  it("collapses a differing environment assignment to 'env differs', never naming either value", () => {
    // REDACT_ME_1 is the planted value the security constraint exists to
    // catch: "Redact in the launch-spec diff: show that env differs, never
    // what it differs to." If this ever regresses to showing the raw token,
    // this assertion fails loudly rather than silently passing.
    const result = diffLaunch(
      "node server.js API_KEY=REDACT_ME_1",
      "node server.js API_KEY=REDACT_ME_2"
    );
    expect(result.a[2]).toEqual({ text: "env differs", differs: true });
    expect(result.b[2]).toEqual({ text: "env differs", differs: true });
    const serialised = JSON.stringify(result);
    expect(serialised).not.toMatch(/REDACT_ME_1/);
    expect(serialised).not.toMatch(/REDACT_ME_2/);
  });

  it("collapses an env assignment differing only in its key name, never naming either key", () => {
    // Both sides already carry the backend's <redacted> placeholder — this
    // proves the guard does not rely on the value being unredacted to fire.
    // It must not invent or reconstruct what a differing already-redacted
    // token might have been either.
    const result = diffLaunch(
      "node server.js AUTH_TOKEN=<redacted>",
      "node server.js SESSION_TOKEN=<redacted>"
    );
    expect(result.a[2]).toEqual({ text: "env differs", differs: true });
    expect(result.b[2]).toEqual({ text: "env differs", differs: true });
  });

  it("does not treat a real flag as an environment assignment", () => {
    // `--client-type=persistent` starts with `-`, so it is a flag, not an
    // env assignment, mirroring `mcp::observe::is_env_assignment`'s own
    // distinction. A differing flag=value pair is shown, not hidden.
    const result = diffLaunch(
      "node server.js --client-type=persistent",
      "node server.js --client-type=ephemeral"
    );
    expect(result.a[2]).toEqual({ text: "--client-type=persistent", differs: true });
    expect(result.b[2]).toEqual({ text: "--client-type=ephemeral", differs: true });
  });

  // Fix round 1: a purely positional compare mis-marks every token AFTER an
  // insertion or deletion as differing, because it never re-syncs the two
  // sequences -- one added flag reads as "everything changed", which is
  // worse than the prose warning it sits beneath. Token-level LCS alignment
  // fixes this: matched tokens re-sync regardless of where they fall.

  it("does not let an inserted flag shift every later token into 'differs' (reviewer's exact probe)", () => {
    const result = diffLaunch(
      "npx -y @tauri/mcp@1.0.0 --port 4242",
      "npx -y --verbose @tauri/mcp@1.0.0 --port 4242"
    );
    // Only --verbose differs -- present on b, absent on a.
    const differing = (side: typeof result.a) => side.filter((t) => t.differs).map((t) => t.text);
    expect(differing(result.a)).toEqual([""]);
    expect(differing(result.b)).toEqual(["--verbose"]);
    // Everything the old positional compare mis-flagged now reads as same,
    // wherever it lands in the (now longer) aligned array.
    for (const text of ["npx", "-y", "@tauri/mcp@1.0.0", "--port", "4242"]) {
      expect(result.a.find((t) => t.text === text)).toEqual({ text, differs: false });
      expect(result.b.find((t) => t.text === text)).toEqual({ text, differs: false });
    }
  });

  it("does not let a removed flag shift every later token into 'differs' (the mirror case)", () => {
    const result = diffLaunch(
      "npx -y --verbose @tauri/mcp@1.0.0 --port 4242",
      "npx -y @tauri/mcp@1.0.0 --port 4242"
    );
    const differing = (side: typeof result.a) => side.filter((t) => t.differs).map((t) => t.text);
    expect(differing(result.a)).toEqual(["--verbose"]);
    expect(differing(result.b)).toEqual([""]);
    for (const text of ["npx", "-y", "@tauri/mcp@1.0.0", "--port", "4242"]) {
      expect(result.a.find((t) => t.text === text)).toEqual({ text, differs: false });
      expect(result.b.find((t) => t.text === text)).toEqual({ text, differs: false });
    }
  });

  it("flags a genuine change even alongside an unrelated inserted flag, without flagging the shifted tail", () => {
    // Two edits in one pair of specs: --verbose is purely inserted early on,
    // and the version genuinely changed later. The insertion must not smear
    // into the version comparison, and neither may shift --port/4242 after
    // it into a false "differs".
    const result = diffLaunch(
      "npx -y @tauri/mcp@1.0.0 --port 4242",
      "npx --verbose -y @tauri/mcp@2.0.0 --port 4242"
    );
    // The genuine change: version 1.0.0 vs 2.0.0, still flagged.
    expect(result.a.find((t) => t.text === "@tauri/mcp@1.0.0")).toEqual({
      text: "@tauri/mcp@1.0.0",
      differs: true,
    });
    expect(result.b.find((t) => t.text === "@tauri/mcp@2.0.0")).toEqual({
      text: "@tauri/mcp@2.0.0",
      differs: true,
    });
    // The insertion: --verbose present only on b.
    expect(result.b.find((t) => t.text === "--verbose")).toEqual({
      text: "--verbose",
      differs: true,
    });
    // The shifted tail: -y, --port and 4242 all still read as same, on both
    // sides, despite the insertion ahead of -y and the change ahead of them.
    for (const text of ["npx", "-y", "--port", "4242"]) {
      expect(result.a.find((t) => t.text === text)).toEqual({ text, differs: false });
      expect(result.b.find((t) => t.text === text)).toEqual({ text, differs: false });
    }
  });

  it("marks every token as differing when the two launches share nothing (the worst case)", () => {
    // No common subsequence at all -- LCS correctly degrades to "everything
    // differs" here, which is the honest answer, not a bug to route around.
    const result = diffLaunch("node server.js --debug", "python app.py");
    expect(result.a.every((t) => t.differs)).toBe(true);
    expect(result.b.every((t) => t.differs)).toBe(true);
    expect(result.a.map((t) => t.text)).toEqual(["node", "server.js", "--debug"]);
    expect(result.b.map((t) => t.text)).toEqual(["python", "app.py", ""]);
  });
});
