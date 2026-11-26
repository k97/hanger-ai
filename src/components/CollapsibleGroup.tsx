import type { ReactNode } from "react";
import { ChevronRightIcon } from "./icons";
import { groupHead } from "./GroupTicks";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible";
import { Separator } from "./ui/separator";

/**
 * A group on Global's list that folds: "Switched off" (kept skills, kept
 * servers) and "Not loaded by ‹engine›" (Task 3 of
 * docs/plans/2026-11-26-global-list.md). shadcn's Collapsible on Base UI
 * (`ui/collapsible`) under T3 Code's quiet shelf head
 * (`collapsible-section-header.tsx`): the label, a 1px rule
 * (`ui/separator`), the backend's figure when there is one, then a chevron
 * that points down while open. The whole head is the one button.
 *
 * It is the static group head's shape (`GroupHead`, ProfilePane) made a
 * fold, so the two read as one family. The `<h3>` carries `id`, which its
 * tick jumps to (GroupTicks), and is named in the tick's own words. Nothing
 * here is sticky, so a jump lands the head at the top with no margin.
 */
export default function CollapsibleGroup({
  id,
  label,
  figure,
  defaultOpen = true,
  testId,
  children,
}: {
  id: string;
  label: string;
  /** The backend's figure, or null where the head shows none. */
  figure: number | null;
  /** Switched off opens open; Not loaded is folded until asked. */
  defaultOpen?: boolean;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <Collapsible defaultOpen={defaultOpen} data-testid={testId} className="mt-2.5 first:mt-0">
      <h3 id={id} aria-label={groupHead(label, figure)}>
        <CollapsibleTrigger className="group flex items-center gap-2 w-full h-8 px-2.5 text-left font-sans text-small font-medium text-ink-3 select-none hover:text-ink-1 transition-colors duration-hover ease-spring">
          <span className="shrink-0">{label}</span>
          <Separator data-testid="group-head-rule" aria-hidden="true" className="flex-1" />
          {figure !== null && <span className="shrink-0 font-normal tabular">{figure}</span>}
          <ChevronRightIcon
            size={12}
            aria-hidden="true"
            className="shrink-0 transition-transform duration-hover ease-spring group-data-[panel-open]:rotate-90"
          />
        </CollapsibleTrigger>
      </h3>
      <CollapsibleContent className="flex flex-col gap-px">{children}</CollapsibleContent>
    </Collapsible>
  );
}
