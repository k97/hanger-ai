// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import ReachCard from "./ReachCard";
import type { EngineReachInfo } from "./EngineReachTiles";

afterEach(cleanup);

/* Every route at once. Claude Code and Codex reach the store through their
   own link; Zed reads it where it lies (no via_root — the case that would
   read as a blank cell if the footer only ever printed a path); Claude
   Desktop and OpenCode have no link; VS Code cannot read the format. The
   backend never orders this list, so it arrives deliberately shuffled. */
const reach: EngineReachInfo[] = [
  { engine_id: 2, engine_key: "claude_desktop", engine_name: "Claude Desktop", reached: false, reason: "root_not_linked" },
  { engine_id: 1, engine_key: "claude_code", engine_name: "Claude Code", reached: true,
    via_root: "/Users/test/.claude/skills", via_store: "/Users/test/.agents" },
  { engine_id: 4, engine_key: "vscode", engine_name: "VS Code", reached: false, reason: "format" },
  { engine_id: 6, engine_key: "zed", engine_name: "Zed", reached: true, via_store: "/Users/test/.agents" },
  { engine_id: 3, engine_key: "codex", engine_name: "Codex", reached: true,
    via_root: "/Users/test/.codex/skills", via_store: "/Users/test/.agents" },
  { engine_id: 5, engine_key: "opencode", engine_name: "OpenCode", reached: false, reason: "root_not_linked" },
];

const routeKeys = (): string[] =>
  Array.from(document.querySelectorAll('[data-testid^="reach-route-"]'))
    .filter((el) => !(el.getAttribute("data-testid") ?? "").startsWith("reach-route-label-"))
    .map((el) => (el.getAttribute("data-testid") ?? "").replace("reach-route-", ""));

const plate = (key: string) => screen.getByTestId(`reach-plate-${key}`);
const answer = () => screen.getByTestId("reach-answer");

describe("ReachCard", () => {
  it("is one row per route, in reading order, whatever order the backend sent", () => {
    render(<ReachCard reach={reach} />);
    expect(routeKeys()).toEqual(["linked", "inplace", "unlinked", "format"]);
    expect(screen.getByTestId("reach-route-label-linked").textContent).toBe("Through their own link");
    expect(screen.getByTestId("reach-route-label-inplace").textContent).toBe("Where it lies");
    expect(screen.getByTestId("reach-route-label-unlinked").textContent).toBe("Root not linked");
    expect(screen.getByTestId("reach-route-label-format").textContent).toBe("Another engine's format");
  });

  it("drops a route nobody takes", () => {
    render(<ReachCard reach={reach.filter((r) => r.reached)} />);
    expect(routeKeys()).toEqual(["linked", "inplace"]);
  });

  it("puts every engine on the row for its route", () => {
    render(<ReachCard reach={reach} />);
    const under = (key: string) => screen.getByTestId(`reach-route-${key}`);
    expect(under("linked").contains(plate("claude_code"))).toBe(true);
    expect(under("linked").contains(plate("codex"))).toBe(true);
    expect(under("inplace").contains(plate("zed"))).toBe(true);
    expect(under("unlinked").contains(plate("claude_desktop"))).toBe(true);
    expect(under("unlinked").contains(plate("opencode"))).toBe(true);
    expect(under("format").contains(plate("vscode"))).toBe(true);
  });

  it("names each plate for assistive tech, with its answer", () => {
    render(<ReachCard reach={reach} />);
    expect(plate("claude_code").getAttribute("aria-label")).toBe("Claude Code — ~/.claude/skills");
    expect(plate("zed").getAttribute("aria-label")).toBe("Zed — in place");
    expect(plate("opencode").getAttribute("aria-label")).toBe("OpenCode — root not linked");
    expect(plate("vscode").getAttribute("aria-label")).toBe("VS Code — cannot read this format");
  });

  it("at rest, answers for the first plate in reading order", () => {
    render(<ReachCard reach={reach} />);
    expect(answer().textContent).toContain("Claude Code");
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("~/.claude/skills");
    expect(plate("claude_code").getAttribute("aria-checked")).toBe("true");
    expect(plate("codex").getAttribute("aria-checked")).toBe("false");
  });

  it("moves the answer to whichever plate is pressed", () => {
    render(<ReachCard reach={reach} />);
    fireEvent.click(plate("zed"));
    expect(answer().textContent).toContain("Zed");
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("in place");
    expect(plate("zed").getAttribute("aria-checked")).toBe("true");
    expect(plate("claude_code").getAttribute("aria-checked")).toBe("false");

    fireEvent.click(plate("opencode"));
    expect(answer().textContent).toContain("OpenCode");
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("root not linked");

    fireEvent.click(plate("vscode"));
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("cannot read this format");
  });

  /* One composite widget, not thirteen controls: a radiogroup whose radios
     carry a roving tabIndex, the same model SegmentedTrack.tsx uses. Tab
     reaches the group once and lands on the selected plate. */
  it("is one radiogroup of radios with a single tab stop", () => {
    render(<ReachCard reach={reach} />);
    expect(screen.getByTestId("reach-card").getAttribute("role")).toBe("radiogroup");
    expect(screen.getByTestId("reach-card").getAttribute("aria-label")).toBeTruthy();
    for (const key of ["claude_code", "codex", "zed", "claude_desktop", "opencode", "vscode"]) {
      expect(plate(key).getAttribute("role")).toBe("radio");
    }
    const stops = Array.from(document.querySelectorAll('[data-testid^="reach-plate-"]')).filter(
      (el) => el.getAttribute("tabindex") === "0",
    );
    expect(stops).toHaveLength(1);
    expect(stops[0]).toBe(plate("claude_code"));
    expect(plate("codex").getAttribute("tabindex")).toBe("-1");
  });

  it("arrow keys step through every plate in reading order and select as they go", () => {
    render(<ReachCard reach={reach} />);
    // linked → linked → inplace: Claude Code, Codex, Zed.
    fireEvent.keyDown(plate("claude_code"), { key: "ArrowRight" });
    expect(plate("codex").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("~/.codex/skills");
    fireEvent.keyDown(plate("codex"), { key: "ArrowDown" });
    expect(plate("zed").getAttribute("aria-checked")).toBe("true");
    // Backwards off the first plate wraps to the last, which is the format row.
    fireEvent.keyDown(plate("zed"), { key: "ArrowUp" });
    fireEvent.keyDown(plate("codex"), { key: "ArrowLeft" });
    fireEvent.keyDown(plate("claude_code"), { key: "ArrowLeft" });
    expect(plate("vscode").getAttribute("aria-checked")).toBe("true");
  });

  it("Home and End jump to the first and last plate", () => {
    render(<ReachCard reach={reach} />);
    fireEvent.keyDown(plate("claude_code"), { key: "End" });
    expect(plate("vscode").getAttribute("aria-checked")).toBe("true");
    fireEvent.keyDown(plate("vscode"), { key: "Home" });
    expect(plate("claude_code").getAttribute("aria-checked")).toBe("true");
  });

  /* aria-pressed is for a binary toggle — the two in src/ are FavouriteHeart
     and the source-view switch. Thirteen mutually exclusive plates would
     announce one "pressed" and twelve "not pressed" and never say they are
     one choice. */
  it("never claims to be a toggle", () => {
    render(<ReachCard reach={reach} />);
    expect(document.querySelector("[aria-pressed]")).toBeNull();
  });

  it("states a route's reason once, on its label, never on a plate", () => {
    render(<ReachCard reach={reach} />);
    expect(plate("claude_desktop").textContent).toBe("");
    expect(document.body.textContent?.match(/Root not linked/g)).toHaveLength(1);
  });

  it("folds every root to a tilde; no absolute home survives", () => {
    render(<ReachCard reach={reach} />);
    fireEvent.click(plate("codex"));
    expect(screen.getByTestId("reach-answer-value").textContent).toBe("~/.codex/skills");
    expect(document.body.textContent).not.toContain("/Users/test");
    for (const key of ["claude_code", "codex"]) {
      expect(plate(key).getAttribute("aria-label")).not.toContain("/Users/test");
    }
  });

  /* A class contract, not a geometry claim: happy-dom lays nothing out, so
     what a plate looks like is a screenshot's question. This pins the
     classes that make lit, unlit and selected differ, so a refactor cannot
     silently render all three the same. */
  it("lit plates sit on a plane, unlit plates are a dimmed ring, the selected one is tinted", () => {
    render(<ReachCard reach={reach} />);
    const lit = plate("codex").className;
    expect(lit).toContain("bg-plane");
    expect(lit).not.toContain("opacity-40");
    expect(lit).not.toContain("border-line");

    const unlit = plate("opencode").className;
    expect(unlit).toContain("border-line");
    expect(unlit).toContain("opacity-40");
    expect(unlit).not.toContain("bg-plane");

    const selected = plate("claude_code").className;
    expect(selected).toContain("bg-tint");
    expect(selected).not.toContain("bg-plane");
  });

  it("a selected unlit plate is shown at full strength so the selection reads through the dimming", () => {
    render(<ReachCard reach={reach} />);
    fireEvent.click(plate("opencode"));
    const cls = plate("opencode").className;
    expect(cls).toContain("bg-tint");
    expect(cls).not.toContain("opacity-40");
  });

  it("is one bordered card on the page with the answer inside it, and no list markup", () => {
    render(<ReachCard reach={reach} />);
    const card = screen.getByTestId("reach-card");
    expect(card.className).toContain("border-line");
    expect(card.className).toContain("rounded-inner");
    expect(card.contains(answer())).toBe(true);
    expect(answer().className).toContain("bg-plane");
    expect(card.querySelector("ul")).toBeNull();
  });

  it("renders nothing for an empty list rather than an empty card", () => {
    const { container } = render(<ReachCard reach={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
