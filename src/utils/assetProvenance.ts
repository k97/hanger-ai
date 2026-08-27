import { scopeRoot, scopeAgent, type Scope } from "./scopeAccess";
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
  // Local-scoped assets belong to a repo too, despite living in a
  // machine-level file. scopeRoot knows all three variants.
  const root = scopeRoot(asset.scope as Scope);
  return root ? basename(root) : "Global";
}

const KINDS: Record<string, string> = {
  Skills: "Skill",
  Subagents: "Subagent",
  Tools: "MCP server",
  Rules: "Rule",
  Agents: "Agent",
};

/**
 * The eyebrow's word for a category.
 *
 * The lists are plural because they hold many; the inspector is looking at
 * exactly one, and reading "Skills" above a single skill is a small lie the
 * panel does not need to tell.
 */
export function kindLabel(category: string): string {
  return KINDS[category] ?? category;
}

/** The engine an asset belongs to, in the words the panel uses. */
export function engineLabel(asset: ScopedAsset): string {
  const agent = scopeAgent(asset.scope as Scope);
  if (!agent) return "Any agent";
  // Keyed by the ids the backend actually puts in a scope: `AGENT_CONFIGS`
  // rows, plus the two filename-attributed rules owners. Every one of them
  // needs an entry or the panel prints the id — a subagent under ~/.kiro read
  // "Engine: kiro" beside a correctly drawn Kiro mark.
  // `engine-labels.test.ts` fails when the Rust table grows past this map.
  const NAMES: Record<string, string> = {
    claude: "Claude Code",
    "claude-code": "Claude Code",
    claude_code: "Claude Code",
    gemini: "Gemini CLI",
    codex: "Codex",
    cursor: "Cursor",
    copilot: "GitHub Copilot",
    kiro: "Kiro",
    trae: "Trae",
    opencode: "OpenCode",
    amp: "Amp",
    zed: "Zed",
    roocode: "Roo Code",
    kilocode: "Kilo Code",
    cline: "Cline",
  };
  return NAMES[agent] ?? agent;
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

/**
 * The Origin row's view model.
 *
 * `OriginWire` is a discriminated union on `kind`, not four independent
 * optionals, because the Rust producer only ever populates `commit`,
 * `delivered_by` and `installed_at_ms` when `kind === "delivered"` (each
 * field carries `skip_serializing_if = "Option::is_none"`). A flat interface
 * would let a fixture claim `kind: "declared"` with a `commit` attached — a
 * state the backend can never emit — which is the exact shape that shipped a
 * defect elsewhere in this project (a probe-answer type that let `error` and
 * `cost` vary independently). Narrowing at the boundary makes that state
 * unrepresentable instead of merely untested.
 *
 * Strings below are ruled by Karthik 2026-08-27 (`/humanizer`-passed). They
 * are not to be reworded.
 */
export type OriginKind = "declared" | "delivered" | "checked_out" | "launched";

interface OriginFace {
  label: string;
  url?: string;
}

export type OriginWire =
  | (OriginFace & { kind: "declared" })
  | (OriginFace & { kind: "delivered"; commit?: string; delivered_by?: string; installed_at_ms?: number })
  | (OriginFace & { kind: "checked_out" })
  | (OriginFace & { kind: "launched" });

export interface OriginSubRow {
  label: string;
  value: string;
  mono: boolean;
}

export interface OriginRowView {
  /** The face: the row's primary displayed value. */
  value: string;
  /** Present only when the face links out. */
  url?: string;
  tooltip: string;
  /** Non-empty only when the disclosure exists (kind === "delivered"). */
  subRows: OriginSubRow[];
  /** True for the blocked state — the one no-origin state left with a row. */
  muted: boolean;
}

const ORIGIN_TOOLTIPS: Record<OriginKind, string> = {
  declared: "The asset declares this",
  delivered: "Hanger read this from the plugin that installed it",
  checked_out: "Hanger read this from the folder's git remote",
  launched: "Hanger read this from the launch command",
};

/**
 * Turns the backend's resolved `origin` into the inspector's Origin row.
 *
 * Returns `null` for the ordinary case — no origin found, and the check
 * wasn't blocked — because the Path row two lines below already says where
 * the asset lives; restating "nothing named a source" on every row (roughly
 * 123 of 133 skills on Karthik's machine) is the noise `McpServerDetail`'s
 * "Registered in" block already avoids for the same field. Callers render
 * the row only when this returns non-null. The blocked state still returns
 * a row: Hanger not having checked every place a source is named is a
 * finding, not a null result.
 */
export function originRow(
  origin: OriginWire | null | undefined,
  blocked: boolean | undefined,
): OriginRowView | null {
  if (!origin) {
    if (!blocked) return null;
    return {
      value: "Not determined",
      tooltip: "Hanger couldn't check every place a source is named",
      subRows: [],
      muted: true,
    };
  }

  const subRows: OriginSubRow[] = [];
  if (origin.kind === "delivered") {
    if (origin.commit) {
      subRows.push({ label: "Pinned at", value: origin.commit.slice(0, 7), mono: true });
    }
    if (origin.delivered_by) {
      subRows.push({ label: "Delivered by", value: origin.delivered_by, mono: false });
    }
    if (origin.installed_at_ms !== undefined) {
      subRows.push({
        label: "Installed",
        // Same options as the Modified row (AssetDetail.tsx, ~line 353) — the
        // two rows sit in one card and must not disagree on date format.
        value: new Date(origin.installed_at_ms).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        mono: true,
      });
    }
  }

  return {
    value: origin.label,
    url: origin.url,
    tooltip: ORIGIN_TOOLTIPS[origin.kind],
    subRows,
    muted: false,
  };
}
