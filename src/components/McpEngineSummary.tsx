import BrandIcon from "./BrandIcon";

/**
 * The Flyout's empty-selection body when the Tools filter is active AND the
 * pane is the global store — a sibling to `McpServerDetail`. That component
 * is one server, every registration of it; this one is every server,
 * grouped by host. Never rendered for a repository pane (`Flyout.tsx`'s own
 * `isRepoScope` gate): this summary is machine-wide, and a repo heading
 * over machine-wide data was fix round 1's item 5.
 *
 * Rows are every host that registers at least one server — NOT only
 * detected engines. Fix round 1 (2026-08-20) reversed the original
 * detected-engine restriction: an MCP-only host with no scanned directory
 * of its own gets a row the moment it registers something, same as the
 * reference prototype's own rows do. `engine_id`/`engine_name` are still
 * named for the component Karthik named, not a claim that every row is an
 * "engine" in `AGENT_CONFIGS`'s narrower sense — see
 * `mcp::engine_summary`'s own doc comment for which hosts that widens the
 * population to.
 *
 * Every figure here is a backend field (`get_mcp_engine_summary`,
 * `mcp::engine_summary::engine_summary`). Nothing on this screen is a
 * `.length` of anything, and nothing is a `+` of two backend fields either
 * — `total_server_count` arrives as its own field (fix round 1, item 6).
 *
 * Title: "What every request carries" is Karthik's working line, unsigned —
 * see `docs/TODO.md` T11. He named the component; the title is still his
 * call.
 */

export interface McpEngineSummaryRow {
  engine_id: string;
  engine_name: string;
  /** Distinct servers this engine registers. */
  server_count: number;
  /**
   * Sum of tool counts across this engine's PROBED launches only. `null`
   * means none of them have been asked yet — unknown, never a zero the
   * screen would have to explain away.
   */
  tools_known: number | null;
}

export interface McpEngineSummaryData {
  rows: McpEngineSummaryRow[];
  /**
   * `answered_server_count + unasked_server_count + unaskable_server_count`
   * — a backend field, not a sum this component performs. Fix round 1
   * (2026-08-20): the previous shape asked the frontend to add two backend
   * counts together for its own denominator, which technically passed
   * `no-frontend-counting`'s `.length` guard while still breaking the rule
   * it exists to serve.
   */
  total_server_count: number;
  /** (host, server name) pairs with at least one probed launch. */
  answered_server_count: number;
  /** (host, server name) pairs that could be asked and have not been. */
  unasked_server_count: number;
  /**
   * (host, server name) pairs nothing could ever ask — an account-level
   * connector, or any other declaration with no local process to start and
   * no endpoint to dial. Kept apart from `unasked_server_count`: there is
   * no Verify button that ever changes this one.
   */
  unaskable_server_count: number;
}

interface Props {
  summary: McpEngineSummaryData;
}

/**
 * The note beneath the rows: how much of the picture above is actually
 * known, and why registering a server is not free. Every number is a
 * backend field handed straight to the template — this only chooses words,
 * plurals, and which sentences apply, never adds anything up. Each clause
 * is written to stand on its own, so the three-bucket split (answered /
 * not yet asked / not askable) never implies an order or a shared
 * denominator that isn't `total`.
 */
function partialityNote(total: number, answered: number, unasked: number, unaskable: number): string {
  const serverNoun = total === 1 ? "server" : "servers";
  const parts: string[] = [`${answered} of ${total} ${serverNoun} answered so far.`];
  if (unasked > 0) {
    parts.push(`${unasked} ${unasked === 1 ? "hasn't" : "haven't"} been asked yet.`);
  }
  if (unaskable > 0) {
    parts.push(`${unaskable} can't be asked at all. No local process to start, nothing to dial.`);
  }
  parts.push(
    "Every tool a registered server can reach is described to the model on every request. That's the running cost of what's registered."
  );
  return parts.join(" ");
}

export default function McpEngineSummary({ summary }: Props) {
  // The whole store is empty, or nothing on the machine registers anything
  // at all — Appendix A.1/A.2 already say so in the pane this inspector
  // sits beside. Restating "no servers" here would be the same finding
  // twice.
  if (summary.rows.length === 0) return null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto font-sans">
      <section className="px-[18px] py-[18px]">
        <h3 className="text-small font-medium text-ink-1 mb-[10px]">What every request carries</h3>
        <div className="flex flex-col gap-px bg-line border border-line rounded-inner overflow-hidden">
          {summary.rows.map((row) => (
            <div
              key={row.engine_id}
              data-testid="engine-summary-row"
              className="bg-page px-[11px] py-[9px] flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2 min-w-0">
                <BrandIcon engineKey={row.engine_id} engineName={row.engine_name} size={14} />
                <div className="flex flex-col min-w-0">
                  <span className="text-small font-medium text-ink-1 truncate">{row.engine_name}</span>
                  <span className="text-micro text-ink-3">
                    {row.server_count === 1 ? "1 server registered" : `${row.server_count} servers registered`}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-small text-ink-1 tabular">
                  {row.tools_known === null ? "—" : row.tools_known}
                </div>
                <div className="text-micro text-ink-3">
                  {row.tools_known === null ? "not yet asked" : row.tools_known === 1 ? "tool" : "tools"}
                </div>
              </div>
            </div>
          ))}
        </div>
        <p data-testid="engine-summary-note" className="text-micro text-ink-3 leading-[1.45] mt-3">
          {partialityNote(
            summary.total_server_count,
            summary.answered_server_count,
            summary.unasked_server_count,
            summary.unaskable_server_count
          )}
        </p>
      </section>
    </div>
  );
}
