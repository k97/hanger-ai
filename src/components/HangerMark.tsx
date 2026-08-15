/** The Hanger brand mark — the arch, drawn flat in the brand colour.
 *
 *  `--brand` is the only place the brand teal exists (#00c3bf light, #2fd8d4
 *  dark; tokens.css) and the mark is its only user — never a UI state. The
 *  token carries the theme, so the component no longer needs to know which
 *  appearance it sits on.
 */

// Sourced from the app-icon glyph in docs/icons/v9. The viewBox is cropped to
// these bounds (120..903 on both axes) so `size` is the size of the mark
// rather than of the app icon's padding.
const MARK_PATH =
  "M511.5 120C407.668 120 308.088 161.247 234.668 234.668C161.247 308.088 120 407.668 120 511.5L120 903H903V511.5C903 407.668 861.753 308.088 788.332 234.668C714.912 161.247 615.332 120 511.5 120ZM315.75 707.25V511.5C315.75 459.584 336.374 409.794 373.084 373.084C409.794 336.374 459.584 315.75 511.5 315.75C563.416 315.75 613.206 336.374 649.916 373.084C686.626 409.794 707.25 459.584 707.25 511.5V707.25H315.75Z";

interface HangerMarkProps {
  size?: number;
  /** Layout only. `size` owns the mark's dimensions, so anything passed here
   *  should position it rather than scale it. */
  className?: string;
}

export default function HangerMark({ size = 24, className }: HangerMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="120 120 783 783"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`text-brand ${className ?? ""}`}
      // Decorative: the rail it sits in is already labelled, and the mark
      // names the app rather than any destination inside it.
      aria-hidden="true"
      focusable="false"
      data-testid="hanger-mark"
    >
      <path d={MARK_PATH} fill="currentColor" />
    </svg>
  );
}
