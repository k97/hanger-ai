/** A layer row's switch: 26×16, the track in --plane-2 and the knob on the
 *  page; on, the track takes --fill and the knob --on-fill and slides 10px.
 *  Decorative — the row's aria-pressed carries the state. */
export default function LayerSwitch({ on }: { on: boolean }) {
  return (
    <svg data-testid="layer-switch" width="26" height="16" aria-hidden="true" className="shrink-0">
      <rect
        width="26"
        height="16"
        rx="8"
        className={`transition-[fill] duration-hover ease-spring ${on ? "fill-fill" : "fill-plane-2"}`}
      />
      <circle
        cx="8"
        cy="8"
        r="5.5"
        strokeWidth="1"
        className={`transition-transform duration-hover ease-spring ${
          on ? "fill-on-fill stroke-transparent translate-x-[10px]" : "fill-page stroke-line"
        }`}
      />
    </svg>
  );
}
