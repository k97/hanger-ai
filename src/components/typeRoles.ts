/**
 * The inspector's type roles (audit 2026-08-27, docs/v7-todo-content-typography).
 * Body is 13; secondary is 12 and always --ink-3; mono is 12 for values
 * and 11 only for badges. Labels recede, values are what the user came
 * for. Hoisted strings, selected by ternary at call sites — never clsx.
 */
export const sectionHeadClass = "text-base-app font-medium text-ink-1";
/** Sidebar group labels: body size, sentence case, receding — Codex's "Projects". */
export const groupLabelClass = "text-base-app text-ink-3";
export const rowLabelClass = "text-base-app text-ink-3 leading-body";
/** font-sans is load-bearing: ListCardRow's value slot is mono, and a sans
 *  figure placed in it inherits the family unless it states its own
 *  (the Context card's "≈ 67 tokens" shipped mono this way, 2026-08-27). */
export const rowValueClass = "font-sans text-base-app text-ink-1 leading-body";
export const rowMonoClass = "font-mono text-small text-ink-1 tabular";
export const captionClass = "font-sans text-small text-ink-3 leading-caption";
/** A row's prose — a tool's description under its mono name: body size and
 *  leading, one ink down from the name it explains. A description is what
 *  the model reads, so it is prose, not a caption (Karthik, 2026-08-29). */
export const rowProseClass = "font-sans text-base-app text-ink-2 leading-body";
/** Pane-list column headers (AssetHeaderRow): caption-size, medium, --ink-3 —
 *  sentence case, no shouting. Its only callers are the header row's four
 *  cells; not hoisted further until a second caller exists. */
export const columnHeadClass = "text-small font-medium text-ink-3";
/** A path or key in a *label* position -- grey, one step down, no
 *  `tabular` (a path is not a figure). Distinct from `rowMonoClass`,
 *  which is for values the user reads as numbers. */
export const monoLabelClass = "font-mono text-small text-ink-3";
