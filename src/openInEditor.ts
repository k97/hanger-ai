import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";

export type OpenResult = { ok: true } | { ok: false; reason: "missing" | "failed" };

/**
 * Open a path, in a named editor when one is chosen.
 *
 * A chosen editor goes to the backend's `open_in_editor`, which opens the app
 * it detected by path. `openPath(path, name)` ran `open -a <name>`, which
 * resolves by the app's filename, so Xcode installed as `Xcode_26.6.app`
 * opened nothing. The backend also refuses any editor it did not detect.
 *
 * The stat is not belt-and-braces: `open -a` skips the opener's existence
 * check, so without this a bad path (a tool's registration key, a deleted
 * asset) does nothing and says nothing. The backend refuses it too, but only
 * this check can tell "missing" from "failed".
 */
export async function openInEditor(path: string, editorName: string | null): Promise<OpenResult> {
  if (!path) return { ok: false, reason: "missing" };
  const exists = await invoke<boolean>("path_exists", { path }).catch(() => false);
  if (!exists) return { ok: false, reason: "missing" };
  try {
    if (editorName) await invoke("open_in_editor", { path, editor: editorName });
    else await openPath(path);
    return { ok: true };
  } catch {
    return { ok: false, reason: "failed" };
  }
}
