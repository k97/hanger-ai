/**
 * The plain chip: a pill button in a row of filters, pressed by `bg-tint`.
 * Global's engine chips (`EngineChipRow`) and Needs review's place chips
 * (`NeedsReviewPane`) both draw it. Hoisted class strings, the house idiom
 * for variants — never clsx, never cva.
 *
 * Two pressed variants, by what leads the label: `chipPressedClass` keeps the
 * even `px-3.5` for a chip that leads with a mark whether pressed or not (an
 * engine's), and `chipPressedCheckClass` takes `pl-2.5` for a chip that gains
 * a check when pressed (Needs review's).
 */

export const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";

const pressedTail =
  "rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

/** Pressed, for a chip that leads with a mark. */
export const chipPressedClass = `h-7 px-3.5 ${pressedTail}`;

/** Pressed, for a chip that leads with a check. */
export const chipPressedCheckClass = `h-7 pl-2.5 pr-3.5 ${pressedTail}`;
