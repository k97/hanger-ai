/**
 * Resolves an engine display name or key for UI rendering.
 *
 * Sourced directly from the backend engines table display_name.
 *
 * Rules:
 * - NULL, undefined, empty string, "none", or "unknown" -> "Any agent"
 * - All other display names are passed through directly from the database/inventory.
 */
export function formatEngineLabel(label: string | null | undefined): string {
  if (!label) return "Any agent";
  const normalized = label.trim().toLowerCase();
  if (normalized === "" || normalized === "none" || normalized === "unknown") {
    return "Any agent";
  }
  return label.trim();
}
