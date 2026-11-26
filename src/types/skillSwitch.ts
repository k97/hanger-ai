/**
 * What the skill switch commands hand back: `get_skill_switch`,
 * `set_skill_enabled`, `undo_skill_switch` and `get_kept_skills`
 * (docs/ipc.md entries 21-24).
 *
 * A hand-written mirror of `skill_switch::ops` in the Rust core, narrowed to
 * what that module emits, as `engineContext.ts` is: a reply with no receipt
 * is never undoable, so a fixture cannot be built in a shape the backend
 * never sends.
 */

/**
 * What `set_skill_enabled` and `undo_skill_switch` reject with: one of these
 * strings and nothing else.
 */
export type SkillSwitchFailure =
  | "not_found"
  | "read_only"
  | "name_refused"
  | "changed_since_read"
  | "already_there"
  | "link_place_taken"
  | "changed_since_kept"
  | "other_volume"
  | "write_failed"
  | "not_verified"
  | "not_undoable";

/** Why a skill in the global store shows no switch. */
export type SkillReadOnly = "inside_another_folder" | "other_volume" | "has_tracked_copies";

/** `get_skill_switch`'s answer for a skill in the global store. */
export interface SkillSwitchInfo {
  /** What `set_skill_enabled` takes: `skill:<name>`. Opaque. */
  key: `skill:${string}`;
  /** `null`: Hanger can switch it. */
  read_only: SkillReadOnly | null;
}

/** A skill Hanger is keeping while it is switched off. */
export interface KeptSkill {
  /** What `set_skill_enabled` takes, with `enabled: true`. */
  key: `kept-skill:${string}`;
  name: string;
  at_ms: number;
  /** The links Hanger removed and will put back. */
  links_count: number;
  /** Hanger stopped partway through switching it off or on. */
  interrupted: boolean;
  /** A skill of that name is in the global store again. */
  back_in_store: boolean;
}

/** Every kept skill, newest first, with the figure counted by the backend. */
export interface KeptSkills {
  skills: KeptSkill[];
  /** The number of kept skills: the "Switched off" figure. */
  count: number;
}

/**
 * The reply to a skill switch or its Undo. One that found the skill already
 * as asked changed nothing, and has no receipt.
 */
export type SkillSwitchReply = {
  name: string;
  links_count: number;
  /** Links On could not put back, the home shown as `~`. */
  links_not_restored: string[];
  kept: KeptSkills;
} & (
  | { receipt_id: `kept:${string}` | `restored:${string}`; undoable: true }
  | { receipt_id: null; undoable: false }
);
