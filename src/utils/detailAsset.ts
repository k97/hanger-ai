import type { OriginWire } from "./assetProvenance";

/** What a row click hands up: identity enough to resolve the full backend
 *  record, nothing more. */
export interface AssetClickTarget {
  id?: string;
  name: string;
  category: "Skills" | "Agents" | "Tools" | "Rules" | "Subagents";
  path: string;
}

/**
 * Builds the object the inspector is handed once a clicked row's full
 * backend record (`fullAsset`) is resolved from the inventory.
 *
 * Extracted out of `App.tsx`'s `handleSelectAsset` (Task 11 fix round 1) so
 * this construction has exactly one copy: a hand-rolled duplicate in a test
 * harness could drift from the real handler and stay green after the real
 * one regressed, which is exactly what happened the first time this was
 * written inline. `App.tsx` and any test that wants to assert what the
 * inspector receives both call this.
 */
export function buildDetailAsset(asset: AssetClickTarget, fullAsset: any) {
  return {
    // Carried through, not dropped. Resolving by registrationKey and then
    // storing only `path` put the file back in charge of identity:
    // ProfilePane compares what it is given, and for a tool `path` is the
    // config FILE, so clicking one server in ~/.claude.json marked every
    // server declared in it.
    id: asset.id,
    name: fullAsset.name,
    category: asset.category,
    path: asset.path,
    source_path: fullAsset.source_path || fullAsset.source_origin,
    source_origin: fullAsset.source_origin,
    origin: fullAsset.origin as OriginWire | undefined,
    origin_blocked: fullAsset.origin_blocked as boolean | undefined,
    isSymlink: !!fullAsset.is_symlink,
    is_symlink: !!fullAsset.is_symlink,
    // The scope object itself, not just its display string below —
    // `provenanceOf`/`placeOf` (assetProvenance.ts) read `scope` to resolve
    // where the asset actually lives. Without it every clicked asset
    // resolved to "Global" regardless of its real scope.
    scope: fullAsset.scope,
    scopeBadge: fullAsset.scope?.Global ? "Global" : "Project",
    version: fullAsset.version,
    // The inspector renders origin once, in its own row (AssetDetail's
    // Origin row) — not again here as a composed subtitle. Skills used to
    // duplicate it as `Origin: ${source_origin}`; every category leaves
    // this undefined now except the two below, which describe something
    // the Origin row doesn't.
    details: asset.category === "Skills"
      ? undefined
      : asset.category === "Tools"
        ? `Command: ${fullAsset.command} (Transport: ${fullAsset.transport})`
        : asset.category === "Subagents"
          ? (fullAsset.declared_tools?.length ? `Declared Tools: ${fullAsset.declared_tools.join(", ")}` : undefined)
          : undefined,
  };
}
