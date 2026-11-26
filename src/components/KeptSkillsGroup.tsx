import CollapsibleGroup from "./CollapsibleGroup";
import ListRow from "./ListRow";
import { KEPT_SKILL_OFF_LINE } from "../utils/switchCopy";
import type { KeptSkills } from "../types/skillSwitch";

/**
 * The "Switched off" group under Skills (docs/plans/2026-11-26-skill-switch.md,
 * Task 9): the skills Hanger is keeping, from `get_kept_skills`. Shaped like
 * the MCP servers' "Switched off" group (`ProfilePane.tsx`): a folding head
 * (`CollapsibleGroup`, open by default) carrying the backend's `count` (no
 * figure when an engine is picked), then one `ListRow` per kept skill, its
 * name and, as the row's detail, "Off for every engine" (Task 3 of
 * docs/plans/2026-11-26-global-list.md). A row opens the kept skill in the
 * inspector, where it can be switched back on.
 *
 * A kept skill is no longer in the store, so it is no row of the Skills group
 * and in no figure `get_asset_counts` returns; this group carries its own.
 */
export default function KeptSkillsGroup({
  kept,
  showFigure,
  selectedKey,
  onOpen,
}: {
  kept: KeptSkills;
  /** False when an engine is picked: the head reads "Switched off". */
  showFigure: boolean;
  /** The kept skill the inspector shows, whose row reads as selected. */
  selectedKey: string | null;
  onOpen?: (key: string) => void;
}) {
  return (
    <CollapsibleGroup id="group-kept-skills" testId="kept-skills-group" label="Switched off" figure={showFigure ? kept.count : null}>
      {kept.skills.map((skill) => (
        <ListRow
          key={skill.key}
          kind="skill"
          name={skill.name}
          detail={KEPT_SKILL_OFF_LINE}
          reach={null}
          selected={skill.key === selectedKey}
          onSelect={() => onOpen?.(skill.key)}
        />
      ))}
    </CollapsibleGroup>
  );
}
