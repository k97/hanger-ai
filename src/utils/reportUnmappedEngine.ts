import { invoke } from "@tauri-apps/api/core";
import { normaliseBrandKey } from "../data/brands";
import { isAnyAgent } from "./engineUtils";

const reported = new Set<string>();

/** Paths are never engine identifiers, and a mangled path must not leave as a "key". */
const looksLikeAPath = (s: string) => /[\\/]/.test(s) || s.trimStart().startsWith("~");

/**
 * Tell the backend an engine identifier had no brand mark — once per key per
 * app session, however many rows show it. The backend owns consent and
 * dispatch (`report_unmapped_engine` → `track_event`, spec §8).
 */
export function reportUnmappedEngine(engineKey: string, engineName?: string): void {
  if (isAnyAgent(engineKey) || looksLikeAPath(engineKey)) return;
  const key = normaliseBrandKey(engineKey);
  if (key === "" || reported.has(key)) return;
  reported.add(key);
  const name = (engineName ?? engineKey).trim();
  invoke("report_unmapped_engine", { engineKey: key, engineName: name || undefined }).catch(() => {});
}

/** Test seam: forget what has been reported. */
export function resetUnmappedEngineReports(): void {
  reported.clear();
}
