import { groupRowClass } from "./NotLoadedGroup";
import { groupLabelClass } from "./typeRoles";
import { KEPT_SKILL_OFF_LINE, keptSkillsHead } from "../utils/switchCopy";
import type { KeptSkills } from "../types/skillSwitch";

/**
 * The "Switched off" group under Skills (docs/plans/2026-11-26-skill-switch.md,
 * Task 9): the skills Hanger is keeping, from `get_kept_skills`. Shaped like
 * the MCP servers' "Switched off" group (`ProfilePane.tsx`): the other groups'
 * head, carrying the backend's `count` (no figure when an engine is picked),
 * then one row per kept skill, `groupRowClass` (NotLoadedGroup.tsx), its name
 * and "Off for every engine". A row opens the kept skill in the inspector,
 * where it can be switched back on.
 *
 * A kept skill is no longer in the store, so it is no row of the Skills group
 * and in no figure `get_asset_counts` returns; this group carries its own.
 */
export default function KeptSkillsGroup({
  kept,
  showFigure,
  selectedKey,
  onOpen,
  scrollMarginClass = "scroll-mt-8",
}: {
  kept: KeptSkills;
  /** False when an engine is picked: the head reads "Switched off". */
  showFigure: boolean;
  /** The kept skill the inspector shows, whose row reads as selected. */
  selectedKey: string | null;
  onOpen?: (key: string) => void;
  /** Clears the sticky header stuck over the group when its tick jumps to
   *  it (GroupTicks): ProfilePane's call, which knows what is above. */
  scrollMarginClass?: "scroll-mt-8" | "scroll-mt-11";
}) {
  return (
    <div data-testid="kept-skills-group">
      <h3 id="group-kept-skills" className={`${scrollMarginClass} px-3.5 pt-[11px] pb-[5px] ${groupLabelClass}`}>{keptSkillsHead(kept.count, showFigure)}</h3>
      <div className="flex flex-col">
        {kept.skills.map((skill) => {
          const selected = skill.key === selectedKey;
          return (
            <button
              key={skill.key}
              type="button"
              onClick={() => onOpen?.(skill.key)}
              data-selected={selected ? "true" : "false"}
              className={`${groupRowClass} ${selected ? "bg-tint" : "hover:bg-plane-2"}`}
            >
              <span className={`text-base-app truncate ${selected ? "text-tint-ink font-medium" : "text-ink-1"}`}>
                {skill.name}
              </span>
              <span className="text-small text-ink-3 truncate">{KEPT_SKILL_OFF_LINE}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
