import type { SwitchNoticeState } from "../hooks/useMcpSwitch";
import { XMarkIcon } from "./icons";

/**
 * The line after a switch: what happened, Undo while there is a receipt to
 * take back, and a way to put it away. It follows Discovery's toast (a black
 * pill that rises in) but does not time out, because it carries Undo; a new
 * switch replaces it.
 *
 * The words come from `useMcpSwitch`, which takes them from `switchCopy`.
 */

const pillClass =
  "pointer-events-auto max-w-xl inline-flex items-center gap-3 pl-4 pr-1 py-1 bg-fill text-on-fill font-flex text-small leading-caption rounded-pill animate-rise";

/** A text button on the pill: the fill's own ink, underlined on hover. Not
 *  `miniBtnClass`, which is a white button and would sit in the black pill. */
const undoClass =
  "shrink-0 font-medium text-on-fill underline-offset-2 hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-default disabled:no-underline";

const dismissClass =
  "w-6 h-6 shrink-0 rounded-pill grid place-items-center text-on-fill opacity-70 hover:opacity-100 transition-opacity duration-hover ease-spring cursor-pointer";

/**
 * The pill alone, with its two labels given. `SwitchNotice` passes the real
 * ones; the Design system page passes sample ones, so its specimen never
 * shares a name with the app's own Undo.
 */
export function SwitchNoticePill({
  notice,
  onUndo,
  onDismiss,
  undoLabel,
  dismissLabel,
}: {
  notice: SwitchNoticeState;
  onUndo: () => void;
  onDismiss: () => void;
  undoLabel: string;
  dismissLabel: string;
}) {
  const undoable = notice.kind === "done" && notice.undoable;
  return (
    <div data-testid="switch-notice" className={pillClass}>
      <span className="min-w-0 py-1">{notice.line}</span>
      {undoable && (
        <button type="button" onClick={onUndo} disabled={notice.pending} className={undoClass}>
          {undoLabel}
        </button>
      )}
      <button type="button" aria-label={dismissLabel} onClick={onDismiss} className={dismissClass}>
        <XMarkIcon size={14} aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The status region is always in the document, empty when there is nothing
 * to say, so a screen reader hears each new line. The band lets clicks
 * through to the pane; only the pill takes them.
 */
export default function SwitchNotice({
  notice,
  onUndo,
  onDismiss,
}: {
  notice: SwitchNoticeState | null;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-[22px] z-[110] flex justify-center px-4 pointer-events-none"
    >
      {notice && (
        <SwitchNoticePill
          notice={notice}
          onUndo={onUndo}
          onDismiss={onDismiss}
          undoLabel="Undo"
          dismissLabel="Dismiss"
        />
      )}
    </div>
  );
}
