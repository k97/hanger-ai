import { scopeRoot, type Scope } from "./scopeAccess";
import { registrationKey } from "./mcpRegistration";
import type { Inventory } from "../App";

/**
 * Needs review — every unresolved decision on the machine.
 *
 * Two kinds of problem live here and they are genuinely different:
 *
 *   Repo-level — one asset, in one place, is wrong. A link whose target has
 *   gone, a copy that has diverged from its source, a file the parser could
 *   not read. Fixing it touches that one place.
 *
 *   Cross-repo — the problem is the relationship between places. The same
 *   skill exists in four repositories, or one source feeds links in three of
 *   them and has just broken. Fixing it means choosing which place wins, so
 *   the row has to say what else it affects before the user can decide.
 *
 * Counts are accumulated in loops rather than through .length/.reduce: the
 * counting law reserves those for backend-owned asset totals, and these are
 * derived groupings of flagged assets, not totals.
 */

export type IssueKind = "broken" | "drifted" | "duplicate" | "parse";

export type IssueCategory = "Skills" | "Tools" | "Rules" | "Subagents";

export interface ReviewIssue {
  /** Stable across renders: category, kind and the path (or name) it concerns. */
  id: string;
  name: string;
  category: IssueCategory;
  kind: IssueKind;
  /** The one-line statement of what is wrong, in the row's Problem column. */
  problem: string;
  path: string;
  /** What a symlinked asset points at — the provenance the inspector explains. */
  sourcePath?: string;
  /** The parser's own words, or the note explaining a consolidation. */
  detail?: string;
  /** Where the row says the problem lives. */
  whereLabel: string;
  /** Filter keys: a repository root, "global", or several for a duplicate. */
  whereKeys: string[];
  /** True when resolving this touches more than the place it sits in. */
  crossRepo: boolean;
  /** Every path a duplicated name occupies. */
  copies?: string[];
  /** Other links fed by the same source as this one. */
  siblings?: string[];
}

export interface ReviewCounts {
  broken: number;
  drifted: number;
  duplicate: number;
  parse: number;
  crossRepo: number;
  total: number;
}

export interface ReviewPlace {
  key: string;
  label: string;
  count: number;
}

export interface ReviewDerivation {
  issues: ReviewIssue[];
  counts: ReviewCounts;
  places: ReviewPlace[];
}

interface Candidate {
  name: string;
  category: IssueCategory;
  /**
   * The file to show and reveal. For a Tool this is the config FILE, which
   * many servers share — display only, never identity. Use `identity` for
   * anything that has to tell two candidates apart.
   */
  path: string;
  /**
   * What makes this candidate distinct from every other in its category.
   *
   * The path for a skill, rule or subagent, because there the file IS the
   * asset. The backend-minted registration key for a Tool, because a config
   * file declares many servers and `path` cannot separate them.
   */
  identity: string;
  root: string | null;
  linkState?: string | null;
  parseStatus?: string;
  parseError?: string;
  drifted?: boolean;
  isSymlink?: boolean;
  sourcePath?: string;
}

const SEVERITY: Record<IssueKind, number> = {
  broken: 0,
  drifted: 1,
  parse: 2,
  duplicate: 3,
};

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

/** "global" for a user-profile asset, the project root otherwise. */
function placeKey(root: string | null): string {
  return root ?? "global";
}

function placeLabel(root: string | null): string {
  return root === null ? "Global" : basename(root);
}

function rootOf(scope: unknown): string | null {
  return scopeRoot(scope as Scope);
}

/**
 * Flattens the inventory into one shape, deduplicated by identity within a
 * category.
 *
 * `identity` defaults to the path because for a skill, rule or subagent the
 * file IS the asset. It does not default correctly for a Tool: a config file
 * declares many servers, and keying on `path` there kept the first and dropped
 * the rest — sixteen of twenty-five on the development machine. The one that
 * mattered was a server declared both in a repo's `.mcp.json` and in
 * `~/.claude.json`, exactly the unresolved decision this pane exists to show.
 *
 * A dropped candidate also never reaches `faultOf`, so its parse failure is
 * absent rather than wrong, and the file reads as clean.
 */
function candidates(inventory: Inventory): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();

  const push = (
    candidate: Omit<Candidate, "identity">,
    identity: string = candidate.path
  ) => {
    const key = `${candidate.category}::${identity}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ ...candidate, identity });
  };

  for (const s of inventory.skills) {
    push({
      name: s.name, category: "Skills", path: s.path, root: rootOf(s.scope),
      linkState: s.link_state, parseStatus: s.parse_status, parseError: s.parse_error,
      drifted: s.drifted, isSymlink: s.is_symlink, sourcePath: s.source_path,
    });
  }
  for (const t of inventory.tools) {
    push({
      name: t.name, category: "Tools", path: t.config_path, root: rootOf(t.scope),
      linkState: t.link_state, parseStatus: t.parse_status, parseError: t.parse_error,
      drifted: t.drifted, isSymlink: t.is_symlink, sourcePath: t.source_path,
    // `path` stays the config file — it is what the row shows. Identity is
    // separate and belongs to the backend, which is the whole point.
    }, registrationKey(t));
  }
  for (const r of inventory.rules) {
    push({
      name: r.name, category: "Rules", path: r.path, root: rootOf(r.scope),
      linkState: r.link_state, parseStatus: r.parse_status, parseError: r.parse_error,
      drifted: r.drifted, isSymlink: r.is_symlink, sourcePath: r.source_path,
    });
  }
  for (const sa of inventory.subagents) {
    push({
      name: sa.name, category: "Subagents", path: sa.path, root: rootOf(sa.scope),
      linkState: sa.link_state, parseStatus: sa.parse_status, parseError: sa.parse_error,
      sourcePath: sa.source_path,
    });
  }

  return out;
}

/** A fault belongs to one asset. Duplication is a relationship, never a fault. */
type Fault = Exclude<IssueKind, "duplicate">;

/** The single-asset problem, if this asset has one. */
function faultOf(candidate: Candidate): Fault | null {
  if (candidate.linkState === "broken") return "broken";
  if (candidate.parseStatus === "failed") return "parse";
  if (
    candidate.linkState === "drifted" ||
    candidate.linkState === "foreign" ||
    candidate.drifted === true
  ) {
    return "drifted";
  }
  return null;
}

const PROBLEM: Record<Fault, string> = {
  broken: "Target missing",
  drifted: "Copy diverged",
  parse: "Front matter invalid",
};

/** "2 repos" when the places are all repositories, "2 places" when not. */
function spanLabel(keys: string[]): string {
  let places = 0;
  let repos = 0;
  for (const key of keys) {
    places += 1;
    if (key !== "global") repos += 1;
  }
  return repos === places ? `${places} repos` : `${places} places`;
}

/**
 * Turns the inventory into the issue list, its tallies and the places it
 * touches. Places come from the issues themselves — a repository with nothing
 * wrong in it does not appear, because there is nothing there to review.
 */
export function deriveReviewIssues(inventory: Inventory | null): ReviewDerivation {
  const counts: ReviewCounts = {
    broken: 0, drifted: 0, duplicate: 0, parse: 0, crossRepo: 0, total: 0,
  };
  if (!inventory) return { issues: [], counts, places: [] };

  const all = candidates(inventory);

  // Every link that shares a source, so a broken one can name what else it
  // affects. This is the fan-out the user asked to see.
  const bySource = new Map<string, Candidate[]>();
  for (const candidate of all) {
    if (!candidate.sourcePath) continue;
    const group = bySource.get(candidate.sourcePath);
    if (group) group.push(candidate);
    else bySource.set(candidate.sourcePath, [candidate]);
  }

  // Same name, same kind, more than one place on disk.
  const byName = new Map<string, Candidate[]>();
  for (const candidate of all) {
    const key = `${candidate.category}::${candidate.name}`;
    const group = byName.get(key);
    if (group) group.push(candidate);
    else byName.set(key, [candidate]);
  }

  const issues: ReviewIssue[] = [];

  for (const candidate of all) {
    const fault = faultOf(candidate);
    if (!fault) continue;

    const family = candidate.sourcePath ? bySource.get(candidate.sourcePath) : undefined;
    const siblings: string[] = [];
    const affectedKeys = new Set<string>([placeKey(candidate.root)]);
    if (family) {
      for (const relative of family) {
        // Same shape as the id above: "is this me?" is an identity question,
        // and two tools sharing a config file answer it wrongly by path. That
        // it cannot fire today is a coincidence — tools rarely carry a
        // sourcePath — rather than a property of the code.
        if (relative.identity === candidate.identity) continue;
        siblings.push(relative.path);
        affectedKeys.add(placeKey(relative.root));
      }
    }

    // A fault only reaches beyond its own place when the source it shares
    // feeds links somewhere else.
    const crossRepo = affectedKeys.size > 1;

    issues.push({
      // `identity`, not `path`: two servers in one config file with the same
      // fault stringify to the same id from `path`, and that id is a React key
      // and a filter identity. Unreachable until the dedup fix let the second
      // server through, which is why it is fixed alongside it.
      id: `${candidate.category}:${fault}:${candidate.identity}`,
      name: candidate.name,
      category: candidate.category,
      kind: fault,
      problem: PROBLEM[fault],
      path: candidate.path,
      sourcePath: candidate.sourcePath,
      detail: fault === "parse" ? candidate.parseError : undefined,
      whereLabel: placeLabel(candidate.root),
      whereKeys: [placeKey(candidate.root)],
      crossRepo,
      siblings: siblings.length > 0 ? siblings : undefined,
    });
  }

  for (const [key, group] of byName) {
    const paths: string[] = [];
    const keys: string[] = [];
    const keySet = new Set<string>();
    const sources = new Set<string>();
    for (const candidate of group) {
      paths.push(candidate.path);
      const place = placeKey(candidate.root);
      if (!keySet.has(place)) {
        keySet.add(place);
        keys.push(place);
      }
      if (candidate.sourcePath) sources.add(candidate.sourcePath);
    }
    if (paths.length < 2) continue;

    const first = group[0];
    const problem =
      sources.size > 0
        ? `${paths.length} copies, ${sources.size} source${sources.size === 1 ? "" : "s"}`
        : `${paths.length} copies, no shared source`;

    issues.push({
      id: `duplicate:${key}`,
      name: first.name,
      category: first.category,
      kind: "duplicate",
      problem,
      path: first.path,
      sourcePath: first.sourcePath,
      whereLabel: keys.length > 1 ? spanLabel(keys) : placeLabel(first.root),
      whereKeys: keys,
      crossRepo: keys.length > 1,
      copies: paths,
    });
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY[a.kind] - SEVERITY[b.kind];
    return bySeverity !== 0 ? bySeverity : a.name.localeCompare(b.name);
  });

  const tally = new Map<string, ReviewPlace>();
  for (const issue of issues) {
    counts[issue.kind] += 1;
    counts.total += 1;
    if (issue.crossRepo) counts.crossRepo += 1;

    for (const key of issue.whereKeys) {
      const place = tally.get(key);
      if (place) {
        place.count += 1;
      } else {
        tally.set(key, {
          key,
          label: key === "global" ? "Global" : basename(key),
          count: 1,
        });
      }
    }
  }

  const places: ReviewPlace[] = [];
  for (const place of tally.values()) places.push(place);
  // The user profile sits last: it is one place among many repositories, and
  // reading it first would imply a hierarchy the machine does not have.
  places.sort((a, b) => (a.key === "global" ? 1 : 0) - (b.key === "global" ? 1 : 0));

  return { issues, counts, places };
}

export interface AssetFindings {
  issues: ReviewIssue[];
  count: number;
  severity: "warning" | "danger";
}

/**
 * Every issue that concerns one asset — by its own path, by a duplicate's
 * `copies`, or (for a server) by any of its registration keys. A Tool's
 * registration key has nowhere else to live on a `ReviewIssue`, so it is
 * read off the tail of `id`: `deriveReviewIssues` builds a fault issue's id
 * from `candidate.identity`, and identity is the registration key.
 *
 * `count` is accumulated in the loop below, not read off `.length` — see the
 * counting note at the top of this file.
 */
export function issuesForAsset(
  derivation: ReviewDerivation,
  asset: { path: string; registrationKeys?: string[] }
): AssetFindings {
  const issues: ReviewIssue[] = [];
  let count = 0;
  let severity: "warning" | "danger" = "warning";

  for (const issue of derivation.issues) {
    const ownPath = issue.path === asset.path;
    const asCopy = issue.copies?.includes(asset.path) ?? false;
    const asRegistration = asset.registrationKeys?.some((key) => issue.id.endsWith(key)) ?? false;
    if (!ownPath && !asCopy && !asRegistration) continue;

    issues.push(issue);
    count += 1;
    if (issue.kind === "broken" || issue.kind === "parse") severity = "danger";
  }

  return { issues, count, severity };
}

/** True when an issue survives the kind chip, the place row and the filter field. */
export function matchesIssueFilter(
  issue: ReviewIssue,
  kind: IssueKind | null,
  place: string | null,
  query: string
): boolean {
  if (kind !== null && issue.kind !== kind) return false;

  // Two pseudo-places sit alongside the real ones: "cross" is every issue whose
  // resolution reaches beyond one repository, "repo" is everything else.
  if (place === "cross") {
    if (!issue.crossRepo) return false;
  } else if (place === "repo") {
    if (issue.crossRepo) return false;
  } else if (place !== null && !issue.whereKeys.includes(place)) {
    return false;
  }

  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  const haystack = [
    issue.name,
    issue.problem,
    issue.path,
    issue.sourcePath ?? "",
    issue.whereLabel,
    issue.detail ?? "",
    ...(issue.copies ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}
