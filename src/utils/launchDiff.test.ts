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
});
