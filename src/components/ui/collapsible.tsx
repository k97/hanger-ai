import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible";
import { cn } from "../../lib/utils";

/* shadcn's Collapsible on Base UI, added with `shadcn add collapsible`
   (style base-mira) for the folding groups at the end of Global's list,
   "Switched off" and "Not loaded by" (Task 3 of
   docs/plans/2026-11-26-global-list.md). Base UI owns the behaviour: the
   trigger is a native <button> with `aria-expanded` and `data-panel-open`
   while open, and a closed panel leaves the page.

   Changed from the CLI's file:
   - The trigger takes `cursor-pointer`, as T3 Code's does
     (components/ui/collapsible.tsx), and both take a `className` through
     `cn` from src/lib/utils. The CLI's file passed classes straight on.
   - No height animation: Hanger's groups open and close with nothing
     moving, as its popovers do. */

function Collapsible({ ...props }: CollapsiblePrimitive.Root.Props) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />;
}

function CollapsibleTrigger({ className, ...props }: CollapsiblePrimitive.Trigger.Props) {
  return (
    <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" className={cn("cursor-pointer", className)} {...props} />
  );
}

function CollapsibleContent({ className, ...props }: CollapsiblePrimitive.Panel.Props) {
  return <CollapsiblePrimitive.Panel data-slot="collapsible-content" className={cn(className)} {...props} />;
}

export { Collapsible, CollapsibleContent, CollapsibleTrigger };
