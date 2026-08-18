import type { McpServerView } from "../components/McpServerDetail";
import { registrationKey } from "./mcpRegistration";
import { scopeAgent, scopeRoot, type Scope } from "./scopeAccess";

/** The subset of a `Tool` row this view needs. */
interface ToolRow {
  /** Required: the backend mints it, and a row without one is not a
      registration. See `registrationKey` in ./mcpRegistration. */
  id: string;
  name: string;
  command?: string;
  /** The launch, already redacted by the backend, for display only. */
  launch_display?: string;
  transport?: string;
  config_path: string;
  owning_agent?: string;
  scope?: unknown;
}

/**
 * A running process matched to a registration, from `get_mcp_processes`.
 *
 * Field names are snake_case because they cross the IPC boundary verbatim from
 * `mcp::observe::ProcessMatch`; renaming them here would silently produce
 * `undefined` rather than a type error.
 */
export interface ProcessMatch {
  /** Empty when nothing on disk accounts for this process. */
  registration_key: string;
  pid: number;
  command_line: string;
  spawning_host?: string;
}

/** The processes nothing on disk accounts for — the disclosure's subject. */
export const unaccountedProcesses = (processes: ProcessMatch[] | undefined): ProcessMatch[] =>
  (processes ?? []).filter((p) => p.registration_key === "");

/** One launch, and every process currently running it. */
export interface ProcessGroup {
  commandLine: string;
  pids: number[];
  spawningHost?: string;
}

/**
 * Collapse identical launches into one row each.
 *
 * A leaked server does not leak once. This machine runs roughly 79 `chroma-mcp`
 * instances against a single `--data-dir`, and listing them individually turns
 * the disclosure into a wall that hides the `macos-mcp` sitting among them. The
 * repetition is itself the finding, so it is stated as a multiplier rather than
 * as eighty rows.
 *
 * Ordered by how many processes share the launch, so the worst offender reads
 * first.
 */
export const groupProcesses = (processes: ProcessMatch[]): ProcessGroup[] => {
  const byLaunch = new Map<string, ProcessGroup>();
  for (const p of processes) {
    const existing = byLaunch.get(p.command_line);
    if (existing) {
      existing.pids.push(p.pid);
      continue;
    }
    byLaunch.set(p.command_line, {
      commandLine: p.command_line,
      pids: [p.pid],
      spawningHost: p.spawning_host,
    });
  }
  return [...byLaunch.values()].sort((a, b) => b.pids.length - a.pids.length);
};

const HOST_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini / Antigravity",
  "claude-desktop": "Claude Desktop",
  claude_desktop: "Claude Desktop",
  vscode: "VS Code",
  cursor: "Cursor",
  // Cognition rebranded Windsurf to Devin Desktop on 2026-06-02. The key
  // stays `windsurf` — it is the host id, and ids are internal — only the
  // label users read moves.
  windsurf: "Devin Desktop",
  zed: "Zed",
  "claude-ai": "Claude.ai",
  claude_ai: "Claude.ai",
  kiro: "Kiro",
  trae: "Trae",
  opencode: "OpenCode",
  amp: "Amp",
  roocode: "Roo Code",
  kilocode: "Kilo Code",
  cline: "Cline",
};

/**
 * Where a server that is not configured on this machine is actually managed.
 *
 * A Claude.ai connector runs on Anthropic's infrastructure: there is no file to
 * open and nothing local to verify. Saying only "nothing local to inspect"
 * leaves the reader at a dead end when the place to go is knowable.
 */
export const MANAGE_URL: Record<string, { label: string; url: string }> = {
  "claude-ai": {
    label: "Open Claude.ai connectors",
    url: "https://claude.ai/settings/connectors",
  },
};

/**
 * A loose config declares no owner; the scanner leaves it unattributed.
 *
 * Exported for `engine-labels.test.ts`, which asserts that no id in the Rust
 * registry falls through to the `?? id` branch — the branch that printed
 * `roocode` in lower case beside a correctly drawn Roo Code mark.
 */
export function hostLabel(id: string | null | undefined): string {
  if (!id) return "Any agent";
  return HOST_NAMES[id] ?? id;
}

function tierOf(scope: unknown): string {
  const s = scope as Scope;
  if (!s) return "global";
  if ("Local" in s) return "local";
  if ("Project" in s) return "project";
  return "global";
}

/**
 * Gather every registration of one server into the panel's view model.
 *
 * Grouped by server *name*, not config path: the same server declared by three
 * hosts is one subject with three registrations, and showing that is the point
 * of the panel. `scopeRoot` is used rather than reading `Project.root`
 * directly so Local-scoped registrations are not silently skipped.
 */
export function buildMcpServerView(
  tools: ToolRow[] | undefined,
  serverName: string,
  processes: ProcessMatch[] = []
): McpServerView | null {
  const matches = (tools ?? []).filter((t) => t.name === serverName);
  if (matches.length === 0) return null;

  const registrations = matches.map((t) => {
    // Keyed on `registrationKey`, the mirror of `Tool::registration_key`, so
    // the process lands on the host that actually declared it. An unaccounted
    // process carries an empty key and belongs to no registration — matching
    // it would attach every orphan on the machine to the first row.
    const key = registrationKey(t);
    const hit = key ? processes.find((p) => p.registration_key === key) : undefined;
    return {
      key,
      host: hostLabel(scopeAgent(t.scope as Scope) || t.owning_agent),
      tier: tierOf(t.scope),
      configPath: t.config_path,
      command: t.command ?? "",
      launchDisplay: t.launch_display ?? "",
      ...(hit ? { running: { pid: hit.pid, spawningHost: hit.spawning_host } } : {}),
    };
  });

  return {
    name: serverName,
    // The launch Verify will use. A command without its arguments starts the
    // wrong process entirely -- `node` alone is a REPL, not a server.
    command: matches[0].command ?? "",
    transport: matches[0].transport ?? "unknown",
    registrations,
    // Env var names are not carried on the Tool row today; the panel renders
    // the section only when there is something to show.
    envKeys: [],
  };
}

/** Exposed for the repo pane, which groups by the root a scope belongs to. */
export function registrationRoot(scope: unknown): string | null {
  return scopeRoot(scope as Scope);
}
