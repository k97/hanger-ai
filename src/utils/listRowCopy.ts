import type { AssetAnnotationView, AssetItem } from "../components/AssetRow";
import { ancestorReachNote } from "./serverRows";

/** Line 2's right-hand figure, and the colour a state carries in it. */
export interface ListRowFigure {
  text: string;
  tone?: "danger" | "warning";
}

/**
 * A Global row's line 2, left side (Task 1 of
 * docs/plans/2026-11-26-global-list.md): a server's status sentence, or a
 * skill's or subagent's own description from its file. Nothing when there is
 * nothing to say, never a "—" (Review Focus 5).
 */
export function listRowDetail(item: AssetItem): string | undefined {
  const text = item.category === "Tools" || item.category === "Tool" ? item.agreementLine : item.description;
  const trimmed = text?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * A Global row's line 2, right side.
 *
 * A server's is the picked engine's token figure, or its tool count with All
 * engines (round 18 q1): both backend-owned, passed through, never counted
 * here. No figure when the backend has none.
 *
 * Every other row's is the beyond-the-store words the table's column printed,
 * moved here unchanged, except that an asset used in no project now says
 * "Global only" (round 18 q2) where the column printed "—". The count is the
 * backend note's own; pluralisation is the only thing decided here.
 */
export function listRowFigure(item: AssetItem, annotation: AssetAnnotationView | null): ListRowFigure | undefined {
  if (item.category === "Tools" || item.category === "Tool") {
    if (item.engineFigure !== undefined) return { text: item.engineFigure };
    if (item.toolCount == null) return undefined;
    return { text: item.toolCount === 1 ? "1 tool" : `${item.toolCount} tools` };
  }
  if (!annotation) return undefined;
  const note = annotation.beyond;
  if (note) {
    switch (note.kind) {
      case "broken":
        return { text: "Target missing", tone: "danger" };
      case "drifted":
        return { text: `Drifted in ${note.places.join(", ")}`, tone: "warning" };
      case "copies":
        return { text: `Tracked copy in ${note.count === 1 ? "1 project" : `${note.count} projects`}` };
      case "ancestor_reach": {
        const text = ancestorReachNote(note);
        return text ? { text } : undefined;
      }
      default:
        return { text: note.count === 1 ? "In 1 project" : `In ${note.count} projects` };
    }
  }
  if (annotation.reach.some((r) => r.reason === "format")) {
    const readers = annotation.reach.filter((r) => r.reached).map((r) => r.engine_name);
    if (readers[0]) return { text: `${readers.join(", ")} only` };
  }
  return { text: "Global only" };
}
