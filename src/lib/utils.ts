import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/* tailwind-merge knows only Tailwind's default scales. Hanger's names for
   size, leading and radius (`@theme` in src/styles/index.css) are not on
   them, and unregistered it reads `text-small` as a text colour and drops it
   when a real colour follows. Registering them puts each in its own group,
   so `cn("text-small", "text-ink-2")` keeps both and a later size replaces
   an earlier one. Pinned by src/lib/utils.test.ts. */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "small", "base-app", "lg-app", "display", "row", "ui", "title"],
      leading: ["body", "caption", "code", "display"],
      radius: ["plane", "inner", "soft", "pill", "control"],
      ease: ["spring"],
    },
  },
});

/** shadcn's class helper: clsx for conditions, tailwind-merge for conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
