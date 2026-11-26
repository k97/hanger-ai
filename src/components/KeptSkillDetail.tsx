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
 * one switch that puts it back; this panel holds no switch of its own
 * (Karthik, 2026-11-26: two switches doing one thing). It draws one row —
 * "Off for every engine", then when it was switched off ("Switched off 4 min
 * ago", from `at_ms`, read at render), what Hanger did with it, and, when
 * they hold, that a skill of its name is in the store again (`back_in_store`)
 * or that the switch-off did not finish (`interrupted`). Every word is the
 * plan's approved table (`switchCopy.ts`).
 */
export default function KeptSkillDetail({ skill }: { skill: KeptSkill }) {
  return (
    <div
      data-testid="kept-skill-detail"
      className="flex-1 min-h-0 overflow-y-auto scroll-thin font-sans text-base-app text-ink-1"
    >
      {/* McpServerDetail's SECTION: the panes' block gap. */}
      <section className="mx-[12px] my-3.5">
        <ListCard>
          <div className="flex flex-col gap-[3px] px-3 py-[9px] text-small">
            <span className="text-ink-2">{KEPT_SKILL_OFF_LINE}</span>
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
