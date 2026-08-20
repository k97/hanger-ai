// @vitest-environment happy-dom
import { render, screen, cleanup, within } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import McpEngineSummary, { type McpEngineSummaryData } from "./McpEngineSummary";

// This repo configures no global cleanup, so rendered DOM accumulates
// within a file and role queries match across tests.
afterEach(cleanup);

function summary(overrides: Partial<McpEngineSummaryData>): McpEngineSummaryData {
  return {
    rows: [],
    probed_launch_count: 0,
    unprobed_launch_count: 0,
    ...overrides,
  };
}

describe("McpEngineSummary", () => {
  it("renders one row for one engine, with a known tool count", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 9 }],
          probed_launch_count: 2,
          unprobed_launch_count: 0,
        })}
      />
    );
    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByText("2 servers registered")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("tools")).toBeTruthy();
    // The mark resolves to Claude Code specifically, not the generic mark.
    const nameNode = screen.getByText("Claude Code");
    const row = nameNode.closest("[data-testid='engine-summary-row']") as HTMLElement;
    expect(within(row).getByText("Claude Code")).toBeTruthy();
    expect(row.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_code");
  });

  it("renders several engines as separate rows", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [
            { engine_id: "claude-code", engine_name: "Claude Code", server_count: 3, tools_known: 42 },
            { engine_id: "codex", engine_name: "Codex", server_count: 1, tools_known: 5 },
            { engine_id: "gemini", engine_name: "Gemini / Antigravity", server_count: 2, tools_known: 11 },
          ],
          probed_launch_count: 6,
          unprobed_launch_count: 0,
        })}
      />
    );
    expect(screen.getAllByTestId("engine-summary-row")).toHaveLength(3);
    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("Gemini / Antigravity")).toBeTruthy();
  });

  it("an engine whose servers are all unprobed shows unknown, never a zero", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "codex", engine_name: "Codex", server_count: 3, tools_known: null }],
          probed_launch_count: 0,
          unprobed_launch_count: 3,
        })}
      />
    );
    // No literal "0" anywhere standing in for the unknown count.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("3 servers registered")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("not yet asked")).toBeTruthy();
  });

  it("a mix of probed and unprobed servers states the count that is unaccounted for", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 9 }],
          probed_launch_count: 1,
          unprobed_launch_count: 1,
        })}
      />
    );
    // The row itself still reports its known half.
    expect(screen.getByText("9")).toBeTruthy();
    // The note states both figures from the backend, not a frontend-derived one.
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("1 of 2");
    expect(note.textContent).toMatch(/1 left unasked/);
  });

  it("states the running-request point once probing is complete, without a leftover count", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
          probed_launch_count: 1,
          unprobed_launch_count: 0,
        })}
      />
    );
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("1 of 1");
    expect(note.textContent).not.toMatch(/left unasked/);
    expect(note.textContent).toMatch(/described to the model on every request/);
  });

  it("renders nothing for an empty store — the A.2 empty state owns that case", () => {
    const { container } = render(<McpEngineSummary summary={summary({ rows: [] })} />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("engine-summary-note")).toBeNull();
  });

  it("never restates the category or scope the eyebrow chrome already carries", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
          probed_launch_count: 1,
          unprobed_launch_count: 0,
        })}
      />
    );
    expect(screen.queryByText(/MCP servers/i)).toBeNull();
    expect(screen.queryByText(/^Global$/)).toBeNull();
  });
});
