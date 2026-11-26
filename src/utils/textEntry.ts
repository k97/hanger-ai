/** Whether a key event's target is a place the user types: an input, a
 *  textarea, or contenteditable. A keystroke there is typing, not a
 *  shortcut, so ⌘E (ProfilePane) and Global's Esc (App) leave it alone
 *  (Review Focus 3 of docs/plans/2026-11-26-overview-card.md). One check,
 *  shared, so the two shortcuts cannot disagree about what typing is. */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const el = target as HTMLElement;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.isContentEditable === true ||
    el.closest("[contenteditable]:not([contenteditable='false'])") !== null
  );
}
