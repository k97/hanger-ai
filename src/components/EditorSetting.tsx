import type { DetectedEditor } from "./EditorPicker";

export interface EditorSettingProps {
  editors: DetectedEditor[];
  chosen: string | null;
  onChoose: (name: string) => void;
}

const chosenClass =
  "h-[30px] px-3 rounded-pill border border-transparent bg-tint text-tint-ink font-medium text-small font-flex cursor-pointer transition-colors duration-nav ease-spring inline-flex items-center justify-center gap-1.5";
const unchosenClass =
  "h-[30px] px-3 rounded-pill border border-line-2 text-ink-2 text-small font-flex cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2 inline-flex items-center justify-center gap-1.5";

export default function EditorSetting({ editors, chosen, onChoose }: EditorSettingProps) {
  return (
    <div className="border-t border-line pt-4 mt-2 flex flex-col gap-3">
      {/* No caps transform here: type-roles.test.ts's ALLOW list is scoped
          by exact file path and is documented as the migration's to-do, not
          an exemption pool -- a new file cannot be added to it, so this
          label stays sentence case even though its Appearance/Telemetry
          siblings in App.tsx (both pre-existing, both already allowlisted)
          still shout theirs. */}
      <span className="text-micro font-medium tracking-[.06em] text-ink-3 font-flex">
        Editor
      </span>
      {editors.length > 0 ? (
        <div className="flex gap-1.5 flex-wrap" role="group" aria-label="Editor">
          {editors.map((editor) => (
            <button
              key={editor.bundleId}
              type="button"
              aria-pressed={chosen === editor.name}
              onClick={() => onChoose(editor.name)}
              className={chosen === editor.name ? chosenClass : unchosenClass}
            >
              {editor.name}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className={unchosenClass}>
          Choose an app…
        </button>
      )}
    </div>
  );
}
