import LayerSwitch from "./LayerSwitch";
import Tooltip from "./Tooltip";
import { captionClass } from "./typeRoles";

/**
 * The switch at the end of an inspector header's title row, and its state
 * word beside it. Two callers: an MCP server's switch for every engine
 * (`AllEnginesSwitch`: On, Off, On in some) and a store skill's On/Off
 * (`Flyout`, docs/plans/2026-11-26-skill-switch.md).
 *
 * The Registered in rows' switch, verbatim (`McpServerDetail`'s
 * `switchBtnClass`, DESIGN.md §7): a button holding the shared `LayerSwitch`,
 * pressed by its state, named and tooltipped for what a click does, and
 * disabled while its request runs (`pending`). `pressed` may be "mixed", the
 * toggle button's own third state; the track draws `on`.
 *
 * Draws what it is handed: every word comes from the caller, from
 * `switchCopy`.
 */

const switchBtnClass =
  "shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50";

export default function HeaderSwitch({
  label,
  pressed,
  on,
  stateWord,
  pending,
  onToggle,
  testId,
}: {
  label: string;
  pressed: boolean | "mixed";
  on: boolean;
  stateWord: string;
  pending: boolean;
  onToggle: () => void;
  testId: string;
}) {
  return (
    <span data-testid={testId} className="ml-auto shrink-0 flex items-center gap-2">
      <Tooltip label={label} placement="bottom">
        <button
          type="button"
          aria-pressed={pressed}
          aria-label={label}
          aria-busy={pending || undefined}
          disabled={pending}
          onClick={onToggle}
          className={switchBtnClass}
        >
          <LayerSwitch on={on} />
        </button>
      </Tooltip>
      <span className={`whitespace-nowrap ${captionClass}`}>{stateWord}</span>
    </span>
  );
}
