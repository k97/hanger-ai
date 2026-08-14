/** The Hanger brand mark — the arch, drawn as a gradient fill.
 *
 *  The two sources in docs/icons/v9 are Apple app-icon layers, named for the
 *  system appearance they belong to rather than for the colour they draw:
 *  icon-light is the light-appearance icon, a *white* glyph on a teal plate;
 *  icon-dark is the dark-appearance icon, a *teal* glyph on a near-black plate.
 *
 *  The rail has no plate behind it, so each glyph is used against the surface
 *  it stays legible on — teal on the light rail, white on the dark one. That
 *  inverts the file names on purpose. Mapping them literally paints the white
 *  glyph onto --page #ffffff and the mark disappears.
 *
 *  Which one shows is decided by the caller from the app's resolved theme, not
 *  by a prefers-color-scheme query: the theme can be pinned to Light while the
 *  OS is dark, and a media query would pick the invisible variant.
 */

// Identical in both source files; only the gradient differs. The viewBox is
// cropped to these bounds (120..903 on both axes) so `size` is the size of the
// mark rather than of the app icon's padding.
const MARK_PATH =
  "M511.5 120C407.668 120 308.088 161.247 234.668 234.668C161.247 308.088 120 407.668 120 511.5L120 903H903V511.5C903 407.668 861.753 308.088 788.332 234.668C714.912 161.247 615.332 120 511.5 120ZM315.75 707.25V511.5C315.75 459.584 336.374 409.794 373.084 373.084C409.794 336.374 459.584 315.75 511.5 315.75C563.416 315.75 613.206 336.374 649.916 373.084C686.626 409.794 707.25 459.584 707.25 511.5V707.25H315.75Z";

interface HangerMarkProps {
  /** True when the mark sits on the dark rail — not when the source file is
   *  the one named "dark". See the note above. */
  onDark?: boolean;
  size?: number;
  /** Layout only. `size` owns the mark's dimensions, so anything passed here
   *  should position it rather than scale it. */
  className?: string;
}

export default function HangerMark({ onDark = false, size = 24, className }: HangerMarkProps) {
  const gradientId = onDark ? "hangerMarkOnDark" : "hangerMarkOnLight";
  return (
    <svg
      width={size}
      height={size}
      viewBox="120 120 783 783"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      // Decorative: the rail it sits in is already labelled, and the mark
      // names the app rather than any destination inside it.
      aria-hidden="true"
      focusable="false"
      data-testid="hanger-mark"
      data-variant={onDark ? "on-dark" : "on-light"}
    >
      <path d={MARK_PATH} fill={`url(#${gradientId})`} />
      <defs>
        {onDark ? (
          <linearGradient
            id="hangerMarkOnDark"
            x1="511.5"
            y1="165.083"
            x2="511.5"
            y2="903"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.3593" stopColor="#ffffff" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0.5" />
          </linearGradient>
        ) : (
          <linearGradient
            id="hangerMarkOnLight"
            x1="468"
            y1="314"
            x2="672.5"
            y2="760"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0.5126" stopColor="#0EC7C6" />
            <stop offset="1" stopColor="#169B9C" />
          </linearGradient>
        )}
      </defs>
    </svg>
  );
}
