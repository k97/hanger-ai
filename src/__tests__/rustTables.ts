import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

/**
 * Reading Hanger's own Rust registries as text is a shared idiom, not one
 * guard's trick: brand-coverage pins the marks, engine-labels the words,
 * no-hardcoded-engine-copy the strings in the webview, and readmeCounts the
 * figures in the README. Each read the same two tables through its own copy of
 * this function until 2026-08-30.
 *
 * The rule the copies encoded, kept here: count and collect between an array
 * literal's bounds, never by grepping a token. `AgentConfig {` occurs 12 times
 * in an 11-entry table and `McpHost {` 18 times in a 16-entry one — the struct
 * definitions, and in the second case an `impl`. A token grep does not fail; it
 * returns a wrong number confidently.
 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Read a repo-relative file as text. */
export const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

/**
 * Slice a source file between two anchors. Throws when either anchor has
 * moved, because a guard that silently collects nothing is worse than one that
 * fails loudly — `verification.md` calls that "a loop that iterated an empty
 * collection".
 */
export function block(source: string, startMarker: string, endMarker: string, what: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`${what}: marker "${startMarker}" not found — the guard's anchor moved`);
  const end = source.indexOf(endMarker, start);
  if (end < 0) throw new Error(`${what}: end marker "${endMarker}" not found after "${startMarker}"`);
  return source.slice(start, end);
}
