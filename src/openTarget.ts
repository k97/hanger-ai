/**
 * The path an asset opens in an editor.
 *
 * The four kinds do not share a path shape. A skill's `abs_path` IS its
 * folder; a rule's and a subagent's are files; a tool's is a
 * `RegistrationKey` — `format!("{}:{}", config_path, server_name)`
 * (`src-tauri/src/domain.rs:147`) — which is not a filesystem path, so
 * handing it to `openPath` rejects and the rejection is swallowed.
 *
 * Splitting on the FIRST colon matches the key's other consumer,
 * `preferences.rs:1427`'s `abs_path.split_once(':')`. Neither rule is
 * universally safe — first-colon breaks on a config path that itself
 * contains a colon, last-colon breaks on a server name that does — but a
 * colon is far likelier in a server name than in a macOS path, and
 * agreeing with the producer beats either guess.
 */
export function assetOpenTarget(asset: { category: string; path: string }): string {
  if (asset.category !== "Tools") return asset.path;
  const separator = asset.path.indexOf(":");
  return separator === -1 ? asset.path : asset.path.slice(0, separator);
}
