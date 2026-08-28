import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Class-contract guard: happy-dom lays nothing out, so this asserts the
// tokens are declared and registered, not that any element uses them.
const tokens = readFileSync("src/styles/tokens.css", "utf8");
const theme = readFileSync("src/styles/index.css", "utf8");

describe("leading tokens", () => {
  it.each([
    ["--lh-body", "20px"],
    ["--lh-caption", "16px"],
    ["--lh-code", "18px"],
    ["--lh-display", "35px"],
  ])("declares %s as %s", (name, px) => {
    expect(tokens).toMatch(new RegExp(`${name}:\\s*${px};`));
  });

  it.each(["body", "caption", "code", "display"])("registers leading-%s in @theme", (role) => {
    expect(theme).toMatch(new RegExp(`--leading-${role}:\\s*var\\(--lh-${role}\\);`));
  });
});
