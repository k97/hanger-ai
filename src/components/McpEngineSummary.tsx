import BrandIcon from "./BrandIcon";

/**
 * The Flyout's empty-selection body when the Tools filter is active — a
 * sibling to `McpServerDetail`. That component is one server, every
 * registration of it; this one is every server, grouped by engine.
 *
 * Every figure here is a backend field (`get_mcp_engine_summary`,
 * `mcp::engine_summary::engine_summary`). Nothing on this screen is a
 * `.length` of anything — see `no-frontend-counting.test.ts`.
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
  /** Distinct launches, across every row, the probe cache has answered. */
  probed_launch_count: number;
  /** Distinct launches with no cached answer at all. */
  unprobed_launch_count: number;
}

interface Props {
  summary: McpEngineSummaryData;
}

/**
 * The note beneath the rows: how much of the picture above is actually
 * known, and why registering a server is not free. `probed`/`unprobed` are
 * backend counts, handed straight to the template — this only chooses
 * words and plurals, never adds anything up.
 */
function partialityNote(probed: number, unprobed: number): string {
  const total = probed + unprobed;
  const noun = total === 1 ? "server" : "servers";
  const tally =
    unprobed === 0
      ? `${probed} of ${total} ${noun} answered so far.`
      : `${probed} of ${total} ${noun} answered so far. ${unprobed} left unasked.`;
  return `${tally} Every tool a registered server can reach is described to the model on every request. That's the running cost of what's registered.`;
}

export default function McpEngineSummary({ summary }: Props) {
  // The whole store is empty, or nothing detected here registers anything —
  // Appendix A.1/A.2 already say so in the pane this inspector sits beside.
  // Restating "no servers" here would be the same finding twice.
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
          {partialityNote(summary.probed_launch_count, summary.unprobed_launch_count)}
        </p>
      </section>
    </div>
  );
}
