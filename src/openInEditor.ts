import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

export type OpenResult = { ok: true } | { ok: false; reason: "missing" | "failed" };

/**
 * Open a path, in a named editor when one is chosen.
 *
 * `openPath(path, app)` reaches `/usr/bin/open <path> -a <app>` on macOS
 * (`open-5.3.6/src/macos.rs`). The stat is not belt-and-braces: the plugin
 * skips its own check when an app is named, so without this a bad path — a
 * tool's registration key, a deleted asset — does nothing at all and says
 * nothing.
 */
export async function openInEditor(path: string, editorName: string | null): Promise<OpenResult> {
  if (!path) return { ok: false, reason: "missing" };
  const exists = await invoke<boolean>("path_exists", { path }).catch(() => false);
  if (!exists) return { ok: false, reason: "missing" };
  try {
    if (editorName) await openPath(path, editorName);
    else await openPath(path);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
