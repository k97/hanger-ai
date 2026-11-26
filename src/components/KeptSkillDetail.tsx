import LayerSwitch from "./LayerSwitch";
import ListCard from "./ListCard";
import { captionClass } from "./typeRoles";
import {
  backInStoreLine,
  INTERRUPTED_LINE,
  KEPT_SKILL_MECHANISM,
  KEPT_SKILL_OFF_LINE,
  switchedOffLine,
} from "../utils/switchCopy";
import { timeAgo } from "../utils/timeAgo";
import type { KeptSkill } from "../types/skillSwitch";

/**
 * The inspector's view of a skill Hanger is keeping while it is switched off
 * (docs/plans/2026-11-26-skill-switch.md, Task 9), `KeptServerDetail`'s
 * sibling with the same row shape. A kept skill is out of the store, so it
 * has no inventory asset and nothing to open or reveal: what is shown is what
 * `get_kept_skills` says of it. The Flyout's header carries its name and the
 * header switch; this panel draws one row — "Off for every engine" and the
 * switch that puts it back — then when it was switched off ("Switched off 4
 * min ago", from `at_ms`, read at render), what Hanger did with it, and, when
 * they hold, that a skill of its name is in the store again
 * (`back_in_store`) or that the switch-off did not finish (`interrupted`).
 * Every word is the plan's approved table (`switchCopy.ts`).
 *
 * The switch is never disabled for `back_in_store`: it still sends, and the
 * backend's refusal (`already_there`) is what the notice says. Disabled only
 * while its request runs (`busy`).
 */

/** `McpServerDetail`'s switch button, verbatim: a button pressed by its
 *  state, holding the track (DESIGN.md §7). */
const switchBtnClass =
  "shrink-0 grid place-items-center rounded-pill cursor-pointer disabled:cursor-default disabled:opacity-50";

export default function KeptSkillDetail({
  skill,
  busy,
  onSwitchOn,
}: {
  skill: KeptSkill;
  /** Its request is in flight (`useMcpSwitch`'s `busyKeys`). */
  busy: boolean;
  onSwitchOn: () => void;
}) {
  return (
    <div
      data-testid="kept-skill-detail"
      className="flex-1 min-h-0 overflow-y-auto scroll-thin font-sans text-base-app text-ink-1"
    >
      {/* McpServerDetail's SECTION: the panes' block gap. */}
      <section className="mx-[12px] my-3.5">
        <ListCard>
          <div className="flex flex-col gap-[3px] px-3 py-[9px] text-small">
            <span className="flex items-center gap-1.5 min-w-0">
              <span className="shrink-0 text-ink-2">{KEPT_SKILL_OFF_LINE}</span>
              <button
                type="button"
                aria-pressed={false}
                aria-label={skill.name}
                disabled={busy}
                onClick={onSwitchOn}
                className={`ml-auto ${switchBtnClass}`}
              >
                <LayerSwitch on={false} />
              </button>
            </span>
            <span className={captionClass}>{switchedOffLine(timeAgo(new Date(skill.at_ms), new Date()))}</span>
            <span className={captionClass}>{KEPT_SKILL_MECHANISM}</span>
            {skill.back_in_store && <span className={captionClass}>{backInStoreLine(skill.name)}</span>}
            {skill.interrupted && <span className={captionClass}>{INTERRUPTED_LINE}</span>}
          </div>
        </ListCard>
      </section>
    </div>
  );
}
