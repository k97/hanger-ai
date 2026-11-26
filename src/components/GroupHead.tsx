import type { ReactNode } from "react";
import { groupHead } from "./GroupTicks";
import { Separator } from "./ui/separator";

/** A group's head on Global's list and a repository's, as T3 heads a shelf:
 *  the label, a 1px rule (`ui/separator`), then the backend's figure (none
 *  with an engine picked), and an optional control at the end. Not a column
 *  header: nothing under it is a column. The heading is named in the words
 *  its tick uses (`groupHead`), and the control sits outside it so it is no
 *  part of that name. Not sticky (Task 3 of
 *  docs/plans/2026-11-26-global-list.md): a group's head scrolls away with
 *  its rows, as T3's do, so no head is left over another group's rows, and a
 *  tick's jump lands it at the top with no scroll margin. The folding groups
 *  use `CollapsibleGroup`, the same head made a button. Shared by both panes
 *  since Task 4. */
export default function GroupHead({
  id,
  label,
  figure,
  className = "",
  trailing,
  testId,
}: {
  id?: string;
  label: string;
  figure: number | null;
  className?: string;
  trailing?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      id={id}
      data-testid={testId}
      className={`${className} flex items-center gap-2 h-8 px-2.5 text-small font-medium text-ink-3 select-none`}
    >
      <h3 aria-label={groupHead(label, figure)} className="flex-1 min-w-0 flex items-center gap-2">
        <span className="shrink-0">{label}</span>
        <Separator data-testid="group-head-rule" aria-hidden="true" className="flex-1" />
        {figure !== null && <span className="shrink-0 font-normal tabular">{figure}</span>}
      </h3>
      {trailing}
    </div>
  );
}
