import HeaderSwitch from "./HeaderSwitch";
import { allEnginesStateLabel, allEnginesSwitchLabel } from "../utils/switchCopy";
import type { AllEnginesState } from "../utils/switchTargets";

/**
 * The switch in an MCP server's inspector header that covers every engine
 * (docs/plans/2026-11-25-decisions-round-5.md, -round-6.md), and its state
 * word beside it: "On", "Off" or "On in some".
 *
 * `HeaderSwitch` with the server's words: "On in some" is
 * `aria-pressed="mixed"` and draws the track on, because a click turns the
 * server off. Disabled while a group runs (`pending`).
 *
 * Draws what it is handed. Which items count, and what a click sends, are
 * `switchTargets`' (`serverSwitchTargets`, `allEnginesRequests`).
 */
export default function AllEnginesSwitch({
  server,
  state,
  pending,
  onToggle,
}: {
  server: string;
  state: AllEnginesState;
  pending: boolean;
  onToggle: () => void;
}) {
  return (
    <HeaderSwitch
      testId="all-engines-switch"
      label={allEnginesSwitchLabel(server, state)}
      pressed={state === "some" ? "mixed" : state === "on"}
      on={state !== "off"}
      stateWord={allEnginesStateLabel(state)}
      pending={pending}
      onToggle={onToggle}
    />
  );
}
