// Guard, not a config. The frontend gate is `npx vitest run` FROM THE REPO
// ROOT (AGENTS.md, Test gates). Run from src-tauri/ instead, vitest finds no
// config upward, resolves this directory as its root, matches zero test
// files, and exits 1 having tested nothing — a silent wrong-scope failure
// that has already produced one bad gate result. Vitest loads this file when
// (and only when) it is started from src-tauri/, so the mistake now fails
// loudly with the fix in the message.
throw new Error(
  "vitest started from src-tauri/ — the frontend gate runs from the repo root: cd .. && npx vitest run"
);
