/**
 * The mini button tier (Karthik's ruling, 2026-08-23): two button sizes, and
 * the radius follows the size, not the role. A 30px button stays a full
 * pill; a 26px button takes --radius-control (6px) so the two tiers never
 * read as one control at two scales. Hoisted class strings, the house idiom
 * for variants — never clsx, never cva.
 *
 * Tone is the inspector header's business (Phase 2b): one filled, one tonal.
 * A set inside a section is the equal outlined tier, and nothing else.
 */

const base =
  "h-[26px] px-2.5 inline-flex items-center gap-1.5 whitespace-nowrap text-small cursor-pointer transition-colors duration-hover ease-spring";

/** Outlined: the in-section set. */
export const miniBtnClass = `${base} text-ink-1 border border-line-2 rounded-control bg-page hover:bg-plane-2`;

/** The one strong action, at mini size, in the header only. */
export const miniBtnFillClass = `${base} text-on-fill border border-transparent rounded-control bg-fill`;

/** Tonal: the header's second action. */
export const miniBtnTonalClass = `${base} text-ink-1 border border-transparent rounded-control bg-plane-2 hover:bg-tint`;

/** A row of minis. */
export const miniSetClass = "flex flex-wrap gap-1.5";
