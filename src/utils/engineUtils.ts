/**
 * Resolves an engine display name or key for UI rendering.
 *
 * Sourced directly from the backend engines table display_name.
 *
 * Rules:
 * - NULL, undefined, empty string, "none", or "unknown" -> "Any agent"
 * - All other display names are passed through directly from the database/inventory.
 */

/** The values the backend and inventory use for "no particular engine". Shared
 *  by the label and by BrandIcon, so "no engine" and "an engine we cannot draw"
 *  are told apart in one place.
 *
 *  "any agent" is the rendered label, not a backend value, and it is here on
 *  purpose: several sites hold a label rather than a key — hostLabel() returns
 *  "Any agent" for a loose config — and drawing the unmapped-engine mark for
 *  the absence of an engine would be wrong twice, on screen and in telemetry. */
export function isAnyAgent(key: string | null | undefined): boolean {
  if (key === null || key === undefined) return true;
  const normalized = key.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "none" ||
    normalized === "unknown" ||
    normalized === "any agent"
  );
}

export function formatEngineLabel(label: string | null | undefined): string {
  if (isAnyAgent(label)) return "Any agent";
  return (label as string).trim();
}
