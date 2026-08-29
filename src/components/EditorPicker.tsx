import { useState } from "react";
import { captionClass, rowValueClass, sectionHeadClass } from "./typeRoles";

export interface DetectedEditor {
  name: string;
  bundleId: string;
  path: string;
}

export interface EditorPickerProps {
  assetName: string;
  editors: DetectedEditor[];
  onPick: (name: string, remember: boolean) => void;
  onChooseOther: () => void;
  onCancel: () => void;
}

const rowClass =
  "w-full h-9 px-2.5 rounded-soft flex items-center gap-2.5 text-left text-base-app text-ink-1 hover:bg-plane-2 transition-colors duration-hover cursor-pointer";

export default function EditorPicker({
  assetName,
  editors,
  onPick,
  onChooseOther,
  onCancel,
}: EditorPickerProps) {
  const [remember, setRemember] = useState(true);
  const hasEditors = editors.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim p-4 animate-fade-in font-sans">
      <div className="w-full max-w-[380px] bg-page border border-line rounded-plane p-[18px] flex flex-col gap-3.5 animate-drop">
        <div className="flex flex-col gap-1">
          <h3 className={sectionHeadClass}>Open {assetName} in</h3>
        </div>

        {hasEditors ? (
          <>
            <div className="flex flex-col gap-0.5">
              {editors.map((editor) => (
                <button
                  key={editor.bundleId}
                  type="button"
                  onClick={() => onPick(editor.name, remember)}
                  className={rowClass}
                >
                  <span className={rowValueClass}>{editor.name}</span>
                </button>
              ))}
            </div>

            <label className="flex items-center gap-2.5 border-t border-line pt-3 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              <span className={captionClass}>Always open assets here</span>
            </label>
          </>
        ) : (
          <button
            type="button"
            onClick={onChooseOther}
            className="w-full h-[30px] px-4 rounded-pill border border-line-2 hover:bg-plane-2 text-ink-2 hover:text-ink-1 font-medium text-small text-center cursor-pointer transition-colors duration-hover ease-spring"
          >
            Choose an app…
          </button>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-[30px] px-4 rounded-pill border border-line-2 hover:bg-plane-2 text-ink-2 hover:text-ink-1 font-medium text-small cursor-pointer transition-colors duration-hover ease-spring"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
