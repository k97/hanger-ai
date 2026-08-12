// A linked root is a CONTAINER iff at least one other linked root is a strict
// path-descendant of it. Derived from the linked set rather than stored: there
// is no mode to persist, nothing that can drift out of sync with reality, and
// unlinking the last child reverts the parent to an ordinary row for free.
//
// Paths arriving from get_linked_directories are canonical (link_directory
// canonicalises, migration v3 backfilled the rest), which is what makes prefix
// comparison sound here.

/** Normalises away a trailing slash so `/a/b` and `/a/b/` compare equal. */
function stripTrailingSlash(path: string): string {
  return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

/**
 * Linked roots strictly inside `root`, in the order they appear in `linked`.
 *
 * Matching is on a path-segment boundary, so `/Users/k/Workspace` is not a
 * descendant of `/Users/k/Work` despite sharing a string prefix.
 */
export function linkedDescendants(root: string, linked: string[]): string[] {
  const base = stripTrailingSlash(root);
  const prefix = `${base}/`;
  return linked.filter((candidate) => {
    const other = stripTrailingSlash(candidate);
    return other !== base && other.startsWith(prefix);
  });
}

/** Whether `root` holds at least one other linked root beneath it. */
export function isContainer(root: string, linked: string[]): boolean {
  return linkedDescendants(root, linked).length > 0;
}

/** Subtitle for a container row, e.g. "Watched · 2 repos linked". */
export function containerSubtitle(childCount: number): string {
  const noun = childCount === 1 ? "repo" : "repos";
  return `Watched · ${childCount} ${noun} linked`;
}
