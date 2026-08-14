import type { Inventory } from "../App";
import { classifyAsset, type LinkState, type ReviewableAsset } from "./linkStateCounts";

/**
 * Where an asset came from and where it has gone.
 *
 * The inspector's job is to explain a file's relationships, and every one of
 * them is already derivable from the inventory: what a symlink points at, and
 * which other places share that same source. This is the same grouping the
 * cross-repo issues use — kept here as its own reading so the panel can state
 * it plainly rather than only when something has gone wrong.
 */

export interface Provenance {
  state: LinkState;
  /** The line under the title: what this file's situation actually is. */
  statement: string;
  /** Folder names this asset is linked into, excluding its own place. */
  linkedInto: string[];
  /** What a symlink resolves to, when it is one. */
  source?: string;
  /** Where the asset itself lives: a repository name, or the user profile. */
  place: string;
}

interface ScopedAsset extends ReviewableAsset {
  path?: string;
  config_path?: string;
  scope?: { Global?: { agent: string }; Project?: { agent: string; root: string } };
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

function pathOf(asset: ScopedAsset): string {
  return asset.path ?? asset.config_path ?? "";
}

function placeOf(asset: ScopedAsset): string {
  const root = asset.scope?.Project?.root;
  return root ? basename(root) : "User profile";
}

/** The engine an asset belongs to, in the words the panel uses. */
export function engineLabel(asset: ScopedAsset): string {
  const agent = asset.scope?.Project?.agent ?? asset.scope?.Global?.agent;
  if (!agent) return "Any agent";
  const NAMES: Record<string, string> = {
    claude: "Claude Code",
    gemini: "Gemini CLI",
    codex: "Codex",
    cursor: "Cursor",
    copilot: "GitHub Copilot",
    opencode: "OpenCode",
  };
  return NAMES[agent] ?? agent;
}

/** Whether the file arrived from somewhere else, and if so from where. */
export function sourceLabel(asset: ScopedAsset & { source_origin?: string }): string {
  const origin = asset.source_origin;
  if (origin) return origin;
  return "Local · not from a registry";
}

/**
 * Reads one asset's relationships out of the whole inventory.
 *
 * `linkedInto` comes from grouping every asset by the source it points at, so
 * "symlinked into 3 projects" is counted the same way the review page counts a
 * broken source's fan-out. The two can never disagree.
 */
export function provenanceOf(asset: ScopedAsset, inventory: Inventory | null): Provenance {
  const state = classifyAsset(asset);
  const place = placeOf(asset);
  const source = asset.source_path ?? asset.sourcePath ?? undefined;
  const selfPath = pathOf(asset);

  // Every file that resolves to the same source as this one. A file that IS a
  // source counts the links pointing back at it.
  const target = source ?? selfPath;
  const linkedInto: string[] = [];
  const seen = new Set<string>();

  if (inventory) {
    const all: ScopedAsset[] = [
      ...inventory.skills,
      ...inventory.tools,
      ...inventory.rules,
      ...inventory.subagents,
    ] as ScopedAsset[];

    for (const other of all) {
      const otherPath = pathOf(other);
      if (otherPath === selfPath) continue;
      const otherSource = other.source_path ?? other.sourcePath;
      if (otherSource !== target && otherPath !== target) continue;
      const where = placeOf(other);
      if (seen.has(where)) continue;
      seen.add(where);
      linkedInto.push(where);
    }
  }

  let statement: string;
  if (state === "broken") {
    statement = "Symlink points at a file that no longer exists";
  } else if (state === "drifted") {
    statement = "The copy no longer matches the source it came from";
  } else if (state === "linked") {
    statement =
      linkedInto.length === 0
        ? "Symlinked, with no other copy on this machine"
        : linkedInto.length === 1
        ? `Symlinked into ${linkedInto[0]}`
        : `Symlinked into ${linkedInto.length} projects`;
  } else {
    statement =
      linkedInto.length === 0
        ? "Local only · nothing links to it"
        : linkedInto.length === 1
        ? `The source for the copy in ${linkedInto[0]}`
        : `The source for ${linkedInto.length} copies`;
  }

  return { state, statement, linkedInto, source, place };
}
