/**
 * Every string the MCP server switch shows, keyed by the backend's codes.
 *
 * The lines are the naming brief's
 * (`docs/plans/2026-11-24-context-control-naming-brief.md`), verbatim, plus
 * the fallback and the ⌘K label from the "New strings" table of
 * `docs/plans/2026-11-25-context-control-finish.md`. `{engine}`, `{server}`
 * and `{file}` come from the backend; no engine name is written here. One
 * vendor is: `VENDOR_SERVERS_LINE` names Anthropic, because only claude-ai's
 * servers are ever `runs_on_vendor_servers` (`mcp/switch/context.rs`).
 *
 * The failure and reason lines are exhaustive `Record`s over the backend's
 * unions in `../types/engineContext`, so a code added there fails `tsc` until
 * it has a line here.
 */

import type { SwitchFailure, ReadOnlyReason, ItemState, EngineContext } from "../types/engineContext";

type Names = { engine: string; server: string; file?: string };

/**
 * The path, or "the file" when none is known. A kept server is in no file, so
 * its `config_path` is empty; the line keeps its wording without the path.
 */
function file(n: Names): string {
  return n.file ? n.file : "the file";
}

/** As `file`, at the start of a sentence. */
function fileAtStart(n: Names): string {
  return n.file ? n.file : "The file";
}

const STATE_LABELS: Record<ItemState, string> = {
  on: "On",
  off: "Off",
};

export function stateLabel(s: ItemState): string {
  return STATE_LABELS[s];
}

const READ_ONLY_LINES: Record<ReadOnlyReason, (n: Names) => string> = {
  engine_not_confirmed: (n) =>
    `Hanger can't switch ${n.engine} servers yet. Nothing has confirmed how ${n.engine} turns one off.`,
  per_project_comes_next: (n) => `Hanger can't switch servers declared in ${file(n)} yet.`,
  switches_by_name_everywhere: (n) =>
    `Declared in a project. ${n.engine}'s switch covers every project, so Hanger leaves this one alone.`,
  managed_by_plugin: () =>
    "Declared by a plugin. A change here would be undone when the plugin updates.",
  managed_by_policy: () => "Set by a managed configuration. Hanger doesn't change managed files.",
  runs_on_vendor_servers: () =>
    "Runs on the vendor's servers. There's nothing on this machine to switch.",
  file_unparseable: (n) => `Hanger can't read ${file(n)}, so it can't switch this server.`,
};

/** Why a server shows its state and no switch. */
export function readOnlyLine(r: ReadOnlyReason, n: Names): string {
  return READ_ONLY_LINES[r](n);
}

const FAILURE_LINES: Record<SwitchFailure, (n: Names) => string> = {
  changed_since_read: (n) =>
    `${fileAtStart(n)} changed while Hanger was working. Nothing was written. Try again.`,
  would_not_come_back: (n) =>
    `${n.engine} wouldn't give this server back unchanged, so Hanger left it on. Its own command drops settings it doesn't recognise.`,
  cli_not_found: (n) => `Hanger couldn't find the ${n.engine} command on this machine.`,
  cli_failed: (n) => `${n.engine}'s command didn't make the change. Nothing was lost.`,
  not_verified: (n) =>
    `Hanger couldn't confirm the change, so it kept its copy. Check ${n.engine}'s own list.`,
  already_there: (n) =>
    `${n.server} is already declared for ${n.engine}. Hanger changed nothing and kept its copy.`,
  not_undoable: () => "This can't be undone now. The file has changed since.",
  unparseable: (n) => `Hanger can't read ${file(n)}. Fix it in an editor and try again.`,
  write_failed: () => "Hanger couldn't write the change. The list shows where things stand now.",
  read_only: () => "Hanger can't switch this server.",
  not_found: () => "Hanger can't find that server any more.",
  wrong_engine: (n) => `Hanger can't find that server for ${n.engine}.`,
  name_refused: (n) => `Hanger won't pass this server's name to ${n.engine}'s command.`,
};

/**
 * Whether a rejection is one of the backend's failure codes. An own-key check,
 * so `"toString"` is not a code.
 */
export function isSwitchFailure(x: unknown): x is SwitchFailure {
  return typeof x === "string" && Object.prototype.hasOwnProperty.call(FAILURE_LINES, x);
}

/**
 * The line for a switch or Undo that did not happen. A code the webview does
 * not know gets a line that quotes nothing, not the code.
 */
export function failureLine(code: string, n: Names): string {
  return isSwitchFailure(code)
    ? FAILURE_LINES[code](n)
    : "Hanger couldn't make that change. Nothing was changed.";
}

const SWITCHED_LINES: Record<"off" | "on" | "undo_on" | "undo_off", (n: Names) => string> = {
  off: (n) => `${n.server} is off for ${n.engine}.`,
  on: (n) => `${n.server} is on for ${n.engine}.`,
  undo_on: (n) => `${n.server} is back on for ${n.engine}.`,
  undo_off: (n) => `${n.server} is off for ${n.engine} again.`,
};

/** The notice after a switch or an Undo. */
export function switchedLine(kind: "off" | "on" | "undo_on" | "undo_off", n: Names): string {
  return SWITCHED_LINES[kind](n);
}

const MECHANISM_LINES: Record<"claude_kept" | "gemini_by_name", (n: Names) => string> = {
  claude_kept: (n) =>
    `Removed from ${n.engine}. Hanger keeps its configuration and puts it back when you switch it on.`,
  gemini_by_name: (n) =>
    `${n.engine} switches by name, so this covers every server named ${n.server}.`,
};

/** The line beside a server that explains how its engine switches it. */
export function mechanismLine(kind: "claude_kept" | "gemini_by_name", n: Names): string {
  return MECHANISM_LINES[kind](n);
}

/** When a kept server was switched off: `ago` is `timeAgo`'s words for its
 *  `at_ms` ("4 min ago"). Approved 2026-11-25
 *  (docs/plans/2026-11-25-decisions-round-2.md). */
export function switchedOffLine(ago: string): string {
  return `Switched off ${ago}`;
}

/** A kept server whose name some config file still declares
 *  (`also_declared`), and the link after it that opens that server. Approved
 *  2026-11-25 (docs/plans/2026-11-25-decisions-round-2.md). */
export function alsoDeclaredLine(n: Names): string {
  return `A config file still declares a server named ${n.server}.`;
}
export const SHOW_DECLARED = "Show it";

/** A ⌘K action, named by the state it leads to. */
export function paletteActionLabel(turnOn: boolean, n: Names): string {
  return `Switch ${n.server} ${turnOn ? "on" : "off"} for ${n.engine}`;
}

/** A token estimate as every figure prints it: "≈ 12,400". */
export function tokenFigure(tokens: number): string {
  return `≈ ${tokens.toLocaleString("en-US")}`;
}

/** `on_tokens_measured`, as the budget's headline. */
export function budgetHeadline(tokens: number): string {
  return `${tokenFigure(tokens)} tokens of tool descriptions`;
}

/**
 * `measured_on_count`, `on_count` and `off_count`, as the backend counted
 * them; the off figure only when some are off.
 */
export function budgetCaption(measured: number, on: number, off: number): string {
  const base = `${measured} of ${on} servers measured`;
  return off > 0 ? `${base} · ${off} off` : base;
}

/** One server's `estimated_tokens`; `null` is a server nobody has measured. */
export function costLabel(tokens: number | null): string {
  return tokens === null ? NOT_MEASURED : `${tokenFigure(tokens)} tokens`;
}

const NOT_MEASURED = "Not measured";

/** Under Measure all, and its tooltip where there is no room for the line. */
export const MEASURE_ALL_CAPTION =
  "Starts each server that's on and has no recent answer, and reads its tool list.";

/**
 * `on_tokens_measured`, or `null` when it is no figure at all: no context
 * yet, or servers on and none of them measured. A sum over nothing measured
 * is 0, and "≈ 0" would claim a cost Hanger never read. With nothing on, the
 * 0 is true: nothing on is nothing loaded.
 */
function measuredBudget(ctx: EngineContext | null): number | null {
  if (ctx === null) return null;
  if (ctx.measured_on_count === 0 && ctx.on_count > 0) return null;
  return ctx.on_tokens_measured;
}

/**
 * Global's strip with an engine picked (docs/plans/2026-11-25-ia-global-by-engine.md):
 * the headline, "≈ {n} tokens every session · {engine}", from the same
 * `measuredBudget` as the MCP segment below it, or "Not measured · {engine}"
 * with no figure. Phase 1 measures MCP only, so `n` is the engine's MCP
 * figure; the other kinds' segments say "Not measured".
 */
export function engineStripHeadline(ctx: EngineContext | null, engineName: string): {
  figure: string | null;
  subtitle: string;
} {
  const tokens = measuredBudget(ctx);
  return tokens === null
    ? { figure: null, subtitle: `${NOT_MEASURED} · ${engineName}` }
    : { figure: tokenFigure(tokens), subtitle: `tokens every session · ${engineName}` };
}

/** A strip segment for a kind Phase 1 does not measure. */
export const NOT_MEASURED_FIGURE = NOT_MEASURED;

/**
 * Whether every MCP server of an engine runs on the vendor's own servers —
 * Claude.ai's, the only engine whose items the backend marks
 * `runs_on_vendor_servers` (`mcp/switch/context.rs`). Then nothing on this
 * machine can be measured: a yes or a no over the items, never a count.
 */
export function runsOnVendorServersOnly(ctx: EngineContext | null): boolean {
  return ctx !== null && ctx.items.length > 0 && ctx.items.every((i) => i.read_only === "runs_on_vendor_servers");
}

/** The MCP segment's caption for such an engine, in place of "0 of N servers
 *  measured", which implies a measure that cannot happen. Approved
 *  2026-11-25 (docs/plans/2026-11-25-decisions-round-2.md). */
export const VENDOR_SERVERS_LINE = "Runs on Anthropic's servers. Hanger can't measure it from this machine.";

/**
 * The MCP segment of Global's strip with an engine picked: the figure
 * (`measuredBudget`) and `budgetCaption` for its context. No figure is "Not
 * measured", never a zero; the caption stays when there is a context to
 * count, or says why there is none to make (`runsOnVendorServersOnly`). It
 * was the "By engine" band's row until the engine lens replaced the band.
 */
export function engineBandFigures(ctx: EngineContext | null): {
  value: string | null;
  word: string;
  secondary?: string;
} {
  if (ctx === null) return { value: null, word: NOT_MEASURED };
  const secondary = runsOnVendorServersOnly(ctx)
    ? VENDOR_SERVERS_LINE
    : budgetCaption(ctx.measured_on_count, ctx.on_count, ctx.off_count);
  const tokens = measuredBudget(ctx);
  if (tokens === null) return { value: null, word: NOT_MEASURED, secondary };
  return { value: tokenFigure(tokens), word: "tokens", secondary };
}
