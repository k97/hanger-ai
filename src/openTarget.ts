/**
 * The path an asset opens in an editor.
 *
 * The four kinds do not share a path shape. A skill's `abs_path` IS its
 * folder; a rule's and a subagent's are files; a tool's is a
 * `RegistrationKey` — `format!("{}:{}", config_path, server_name)`
 * (`src-tauri/src/domain.rs:147`) — which is not a filesystem path, so
 * handing it to `openPath` rejects and the rejection is swallowed.
 *
 * Splitting on the LAST colon mirrors what the frontend already does for the
 * same key in `McpServerDetail.tsx:842`.
 */
export function assetOpenTarget(asset: { category: string; path: string }): string {
  if (asset.category !== "Tools") return asset.path;
  const separator = asset.path.lastIndexOf(":");
  return separator === -1 ? asset.path : asset.path.slice(0, separator);
}
