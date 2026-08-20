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
    total_server_count: 0,
    answered_server_count: 0,
    unasked_server_count: 0,
    unaskable_server_count: 0,
    ...overrides,
  };
}

describe("McpEngineSummary", () => {
  it("renders one row for one engine, with a known tool count", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 9 }],
          total_server_count: 2,
          answered_server_count: 2,
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

  it("renders several engines as separate rows, including non-engine MCP hosts", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [
            { engine_id: "claude-code", engine_name: "Claude Code", server_count: 3, tools_known: 42 },
            { engine_id: "codex", engine_name: "Codex", server_count: 1, tools_known: 5 },
            // Cursor has no directory of its own -- not one of the eleven
            // detected engines -- but fix round 1 puts it here anyway: the
            // population is every host that registers a server.
            { engine_id: "cursor", engine_name: "Cursor", server_count: 2, tools_known: 11 },
          ],
          total_server_count: 6,
          answered_server_count: 6,
        })}
      />
    );
    expect(screen.getAllByTestId("engine-summary-row")).toHaveLength(3);
    expect(screen.getByText("Claude Code")).toBeTruthy();
    expect(screen.getByText("Codex")).toBeTruthy();
    expect(screen.getByText("Cursor")).toBeTruthy();
  });

  it("an engine whose servers are all unprobed shows unknown, never a zero", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "codex", engine_name: "Codex", server_count: 3, tools_known: null }],
          total_server_count: 3,
          unasked_server_count: 3,
        })}
      />
    );
    // No literal "0" anywhere standing in for the unknown count.
    expect(screen.queryByText("0")).toBeNull();
    expect(screen.getByText("3 servers registered")).toBeTruthy();
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("not yet asked")).toBeTruthy();
  });

  /**
   * Fix round 1, item 3: a probed engine with genuinely zero tools must
   * render the literal figure `0`, not the em-dash `unknown` treatment.
   * The reviewer mutated the render ternaries to a falsy check
   * (`row.tools_known ? n : "—"`) and every one of the 688 tests at the
   * time stayed green, because none of them ever supplied `tools_known: 0`
   * -- `0` is falsy, so a falsy-gated ternary and a `=== null`-gated one
   * are indistinguishable without this exact fixture. Two rows, side by
   * side, so a regression that collapses either case toward the other is
   * caught by row-scoped assertions rather than a single ambiguous "0"
   * or "—" query against the whole document.
   */
  it("a genuinely zero tool count renders 0, distinct from an unprobed row's dash", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [
            { engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 0 },
            { engine_id: "codex", engine_name: "Codex", server_count: 1, tools_known: null },
          ],
          total_server_count: 2,
          answered_server_count: 1,
          unasked_server_count: 1,
        })}
      />
    );
    const zeroRow = screen.getByText("Claude Code").closest("[data-testid='engine-summary-row']") as HTMLElement;
    const unknownRow = screen.getByText("Codex").closest("[data-testid='engine-summary-row']") as HTMLElement;

    expect(within(zeroRow).getByText("0")).toBeTruthy();
    expect(within(zeroRow).getByText("tools")).toBeTruthy();
    expect(within(zeroRow).queryByText("—")).toBeNull();
    expect(within(zeroRow).queryByText("not yet asked")).toBeNull();

    expect(within(unknownRow).getByText("—")).toBeTruthy();
    expect(within(unknownRow).getByText("not yet asked")).toBeTruthy();
    expect(within(unknownRow).queryByText("0")).toBeNull();
  });

  it("a mix of answered and unasked servers states the count that is unaccounted for", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 9 }],
          total_server_count: 2,
          answered_server_count: 1,
          unasked_server_count: 1,
        })}
      />
    );
    // The row itself still reports its known half.
    expect(screen.getByText("9")).toBeTruthy();
    // The note states the backend's own figures, verbatim.
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("1 of 2");
    expect(note.textContent).toMatch(/1 hasn't been asked yet/);
  });

  /**
   * Fix round 1, item 2 forcing case: a Claude.ai connector's registrations
   * all share one `cache_key` and can never be probed at all. They must
   * read as a third thing, not as "unasked" -- which would promise a
   * Verify button that can never answer.
   */
  it("unaskable servers get their own clause, never folded into 'left unasked'", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-ai", engine_name: "Claude.ai", server_count: 2, tools_known: null }],
          total_server_count: 2,
          unaskable_server_count: 2,
        })}
      />
    );
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("0 of 2");
    expect(note.textContent).toMatch(/2 can't be asked at all/);
    expect(note.textContent).not.toMatch(/hasn't been asked yet/);
    expect(note.textContent).not.toMatch(/haven't been asked yet/);
  });

  it("states all three buckets together when a machine has every shape at once", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [
            { engine_id: "claude-code", engine_name: "Claude Code", server_count: 2, tools_known: 5 },
            { engine_id: "claude-ai", engine_name: "Claude.ai", server_count: 1, tools_known: null },
          ],
          total_server_count: 4,
          answered_server_count: 2,
          unasked_server_count: 1,
          unaskable_server_count: 1,
        })}
      />
    );
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("2 of 4");
    expect(note.textContent).toMatch(/1 hasn't been asked yet/);
    expect(note.textContent).toMatch(/1 can't be asked at all/);
  });

  /**
   * Fix round 1, item 6: `total_server_count` is a backend field the
   * component displays verbatim, never `answered + unasked + unaskable`
   * computed here. Deliberately inconsistent numbers (the three buckets
   * sum to 3, `total_server_count` says 9) prove the rendered figure comes
   * from the `total` field alone -- a component that added the buckets up
   * itself would render "2 of 3" here, not "2 of 9".
   */
  it("renders the backend's own total verbatim, never a sum of the three buckets", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
          total_server_count: 9,
          answered_server_count: 2,
          unasked_server_count: 1,
          unaskable_server_count: 0,
        })}
      />
    );
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("2 of 9");
    expect(note.textContent).not.toContain("2 of 3");
  });

  it("states the running-request point once probing is complete, without a leftover clause", () => {
    render(
      <McpEngineSummary
        summary={summary({
          rows: [{ engine_id: "claude-code", engine_name: "Claude Code", server_count: 1, tools_known: 4 }],
          total_server_count: 1,
          answered_server_count: 1,
        })}
      />
    );
    const note = screen.getByTestId("engine-summary-note");
    expect(note.textContent).toContain("1 of 1");
    expect(note.textContent).not.toMatch(/asked yet/);
    expect(note.textContent).not.toMatch(/can't be asked/);
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
          total_server_count: 1,
          answered_server_count: 1,
        })}
      />
    );
    expect(screen.queryByText(/MCP servers/i)).toBeNull();
    expect(screen.queryByText(/^Global$/)).toBeNull();
  });
});
