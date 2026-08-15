import Tooltip from "./Tooltip";

/** The five ways an asset can be attached, as the backend words them.
 *  Rendered verbatim: the frontend never derives a mechanism from paths or
 *  link state (dispatch item 8). */
export type MechanismWord = "symlink" | "copy" | "drift" | "broken" | "none";

/* Copy signed off 2026-08-15 (naming brief): relationship phrasing, one line
   per mechanism, matching Finder's "original item can't be found" model for
   broken links. */
const MECH_TIP: Record<MechanismWord, string> = {
  symlink: "Symlink — edits to the source reach every destination",
  copy: "Tracked copy — each destination can be edited, and can drift",
  drift: "Tracked copy, drifted — this copy no longer matches its source",
  broken: "Broken symlink — the file it points at is gone",
  none: "Not deployed to any project",
};

const MECH_CLASS: Record<MechanismWord, string> = {
  symlink: "text-ink-1",
  copy: "text-ink-2",
  drift: "text-state-warning",
  broken: "text-state-danger",
  none: "text-ink-3 opacity-[0.28]",
};

function glyphPath(mechanism: MechanismWord) {
  switch (mechanism) {
    case "symlink":
      return (
        <>
          <path d="M10 13a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.7 1.7" />
          <path d="M14 11a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.7-1.7" />
        </>
      );
    case "copy":
      return (
        <>
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H17" />
        </>
      );
    case "drift":
      return (
        <>
          <rect x="9" y="9" width="12" height="12" rx="2.5" />
          <path d="M5 15V5.5A2.5 2.5 0 0 1 7.5 3H17" />
          <path d="M15 13v3m0 2.5h.01" strokeWidth="2.2" />
        </>
      );
    case "broken":
      return (
        <>
          <path d="M9.5 13.5a4 4 0 0 0 5.2.8" />
          <path d="M14.5 10.5a4 4 0 0 0-5.2-.8" />
          <path d="m4 4 16 16" />
        </>
      );
    case "none":
      return <circle cx="12" cy="12" r="6.5" strokeWidth="2" />;
  }
}

interface MechanismGlyphProps {
  mechanism: MechanismWord;
  /** Destination names carried by the beyond-the-store note, appended to the
   *  tooltip so the glyph says where, not just how. */
  places?: string[];
}

/** The per-row mechanism glyph: how the asset is attached, not just whether.
 *  Replaces the state dot on panes that receive backend annotations. */
export default function MechanismGlyph({ mechanism, places }: MechanismGlyphProps) {
  const tail = places && places[0] ? ` · ${places.join(", ")}` : "";
  return (
    <Tooltip label={`${MECH_TIP[mechanism]}${tail}`} placement="bottom">
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-label={`Mechanism: ${mechanism}`}
        role="img"
        data-testid="mechanism-glyph"
        data-mechanism={mechanism}
        className={`shrink-0 ${MECH_CLASS[mechanism]}`}
      >
        {glyphPath(mechanism)}
      </svg>
    </Tooltip>
  );
}
