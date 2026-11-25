/**
 * The name GA4 sees for the screen the sidebar has selected.
 *
 * `selectedSidebarItem` is a screen id, or a repository path. Seven fixed names
 * leave the machine and nothing else — the backend's `telemetry::SCREENS`
 * allowlist drops anything outside them, so a path cannot become a
 * `page_title` even if this map falls behind.
 */
const SCREEN_NAMES: Record<string, string> = {
  profile: "my_machine",
  global: "my_machine",
  review: "needs_review",
  linkmap: "link_map",
  discovery: "discovery",
  design: "design_system",
};

/** A repository path, or any id this map does not know, reports as `repo`.
 *  Global on a named tab (`global:<tab>`, e.g. `global:Engines`) is still My
 *  machine: a tab is not a screen. */
export function screenNameFor(item: string): string {
  if (item.startsWith("global:")) return "my_machine";
  return SCREEN_NAMES[item] ?? "repo";
}
