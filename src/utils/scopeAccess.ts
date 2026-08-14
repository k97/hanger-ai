/**
 * The single place that knows the shape of a serialised Rust `Scope`.
 *
 * Before this module the shape was duplicated across five files as
 * `scope?.Project?.root` chains. Adding `Scope::Local` broke all of them
 * silently: a Local-scoped asset matches neither `Global` nor `Project`, so it
 * was discovered by the scanner and then dropped by every pane — while
 * `get_asset_counts` kept counting it, making the repo count exceed the rows
 * actually rendered.
 *
 * Adding a fourth variant should mean editing this file and nothing else.
 */

export type Scope =
  | { Global: { agent: string } }
  | { Project: { agent: string; root: string } }
  | { Local: { agent: string; root: string } }
  | undefined
  | null;

/** The repository a scope belongs to, or null for machine-wide scopes. */
export function scopeRoot(scope: Scope): string | null {
  if (!scope) return null;
  if ("Project" in scope) return scope.Project.root;
  if ("Local" in scope) return scope.Local.root;
  return null;
}

/** The host that owns this scope, whichever variant it is. */
export function scopeAgent(scope: Scope): string | null {
  if (!scope) return null;
  if ("Global" in scope) return scope.Global.agent;
  if ("Project" in scope) return scope.Project.agent;
  if ("Local" in scope) return scope.Local.agent;
  return null;
}

/** True only for machine-wide scopes — the profile pane's filter. */
export function isGlobalScope(scope: Scope): boolean {
  return Boolean(scope && "Global" in scope);
}

/**
 * True for any scope bound to `repoPath` — the repo pane's filter.
 *
 * Both Project (committed, shared with the team) and Local (private to this
 * user) belong to a repository. They render under different headings, but both
 * belong to the repo view.
 */
export function isRepoScope(scope: Scope, repoPath: string): boolean {
  return scopeRoot(scope) === repoPath;
}
