/**
 * The one gap between stacked things, shared by the two rhythm guards.
 *
 * Not a test file — no `.test.` in the name, so vitest's
 * `src/**` + `*.{test,spec}.*` glob does not collect it, the same way
 * `probeFixtures.ts` sits here without being run.
 *
 * Karthik's ruling, 2026-08-26: the inspector's section gap and the pane's
 * block gap are the same gap, so they get one value. The inspector had been
 * walked up to 28 with a stepped 18 above its first section; that is
 * discarded in favour of the 14 the panes settled on. Two constants that are
 * "deliberately equal" drift the moment one of them is edited — which is the
 * failure this whole cycle kept turning up, in three separate pairs of files
 * (padding vs margin, `mb-[10px]` vs `mb-3.5`, a list card owning `mt-2.5`
 * in one pane and nothing in the other). One constant cannot diverge from
 * itself.
 *
 * Tailwind's scale, so `3.5` is 14px. Both guards spell their own class
 * around it — `my-` for the inspector's sections, `pb-`/`mb-` for the panes'
 * blocks — because the axis and the owner differ even where the number does
 * not.
 */
export const BLOCK_GAP = "3.5";

/**
 * The gap from a section's heading to the card beneath it, inspector only.
 *
 * Deliberately NOT the block gap, and the only figure in either guard with a
 * citation behind it: Apple's Aqua-era HIG, "8 pixels: between section labels
 * and first control". It is what binds a heading to its own content while the
 * gap above it belongs to the boundary between sections. The panes have no
 * analogue — their blocks carry no heading of their own.
 */
export const HEADING_GAP = "mb-2";
