import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// `process` is typed by @types/node; tsc checks this file through
// `src/__tests__/vite_watch_ignores.test.ts`.
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  test: {
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 8397,
    strictPort: true,
    // `false` fell through to Vite's default, which binds [::1] only. Tauri
    // probes devUrl over 127.0.0.1, never saw the frontend come up, and
    // `tauri dev` hung with no window and no error. TAURI_DEV_HOST still wins
    // when set, for device testing over the network.
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 8398,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`, and `.agents/`: its
      // `skills` is a symlink to ~/.agents/skills, which a skills sync
      // rewrites on a timer. Each change reloaded the page, and a reload
      // starts a full scan. Nothing under `src/` imports from `.agents/`.
      //
      // 4. Docs and markdown: nothing under `src/` imports a `.md` file or
      // anything in `docs/`, but Tailwind's plugin scans every file for
      // class names, so each doc edit pushed a CSS update and a page reload.
      // On 2026-11-25 agents editing docs, tests and the design notes reloaded
      // the dev app dozens of times in an hour, and three times it stuck on
      // "Scanning your machine" until it was restarted.
      //
      // 5. Test files, in `tauri dev` only. Under Vitest (`VITEST` is set)
      // they stay watched, or `vitest` watch mode would stop re-running.
      ignored: [
        "**/src-tauri/**",
        "**/.agents/**",
        "**/docs/**",
        "**/*.md",
        ...(process.env.VITEST ? [] : ["**/*.{test,spec}.{ts,tsx}", "**/__tests__/**"]),
      ],
    },
  },
}));
