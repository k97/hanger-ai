import CollapsibleGroup from "./CollapsibleGroup";
import ListRow, { type ListRowKind } from "./ListRow";

export interface NotLoadedRow {
  key: string;
  /** The row's kind, which its icon shows (ListRow). */
  kind: Exclude<ListRowKind, "problem">;
  name: string;
  /** An MCP server's transport chip; nothing for the other kinds, whose
   *  icon names them. */
  chip?: string;
  /** Why the engine does not reach it, in ReachCard's words (`missTitle`). */
  reason: string;
  selected: boolean;
  onOpen: () => void;
}

/** The group's head, which its tick beside the list repeats (GroupTicks). */
export function notLoadedHead(engineName: string): string {
  return `Not loaded by ${engineName}`;
}

interface NotLoadedGroupProps {
  engineName: string;
  rows: NotLoadedRow[];
  /** Folded until asked (Q4). Given, the fold is the caller's. */
  defaultOpen?: boolean;
}

/**
 * "Not loaded by ‹engine›" (Phase 1 of
 * docs/plans/2026-11-25-ia-global-by-engine.md, Q4): the assets in the global
 * store the backend says this engine does not reach (`reached: false` in
 * `get_asset_annotations`), each with its reason. Folded by default, once at
 * the end of Global's list.
 *
 * The head is `CollapsibleGroup`'s (Task 3 of
 * docs/plans/2026-11-26-global-list.md): T3's quiet shelf head over shadcn's
 * Collapsible. It has **no figure**: no backend command counts these, and a
 * number made here would be a frontend count (`no-frontend-counting.test.ts`).
 * Each row is a `ListRow` with the reason as its detail; it opens its asset
 * in the inspector, where the cap's Link to… is the way to act.
 */
export default function NotLoadedGroup({ engineName, rows, defaultOpen = false }: NotLoadedGroupProps) {
  return (
    <CollapsibleGroup
      id="group-not-loaded"
      testId="not-loaded-group"
      label={notLoadedHead(engineName)}
      figure={null}
      defaultOpen={defaultOpen}
    >
      {rows.map((row) => (
        <ListRow
          key={row.key}
          testId="not-loaded-row"
          kind={row.kind}
          name={row.name}
          chip={row.chip}
          detail={row.reason}
          reach={null}
          selected={row.selected}
          onSelect={row.onOpen}
        />
      ))}
    </CollapsibleGroup>
  );
}
