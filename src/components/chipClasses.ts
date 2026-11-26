/**
 * The plain chip: a pill button in a row of filters, pressed by `bg-tint`.
 * Needs review's place chips (`NeedsReviewPane`) draw it; Global's engine
 * chips did until the overview card replaced them. Hoisted class strings,
 * the house idiom for variants — never clsx, never cva.
 *
 * Pressed, the chip gains a check and takes `pl-2.5`
 * (`chipPressedCheckClass`).
 */

export const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";

const pressedTail =
  "rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

/** Pressed, for a chip that leads with a check. */
export const chipPressedCheckClass = `h-7 pl-2.5 pr-3.5 ${pressedTail}`;
