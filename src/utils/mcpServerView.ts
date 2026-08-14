import type { McpServerView } from "../components/McpServerDetail";
import { scopeAgent, scopeRoot, type Scope } from "./scopeAccess";

/** The subset of a `Tool` row this view needs. */
interface ToolRow {
  name: string;
  command?: string;
  args?: string[];
  transport?: string;
  config_path: string;
  owning_agent?: string;
  scope?: unknown;
}

const HOST_NAMES: Record<string, string> = {
  "claude-code": "Claude Code",
  claude_code: "Claude Code",
  codex: "Codex",
  gemini: "Gemini / Antigravity",
  "claude-desktop": "Claude Desktop",
  claude_desktop: "Claude Desktop",
  vscode: "VS Code",
  cursor: "Cursor",
  windsurf: "Windsurf",
  zed: "Zed",
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

/** A loose config declares no owner; the scanner leaves it unattributed. */
function hostLabel(id: string | null | undefined): string {
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
  serverName: string
): McpServerView | null {
  const matches = (tools ?? []).filter((t) => t.name === serverName);
  if (matches.length === 0) return null;

  const registrations = matches.map((t) => ({
    host: hostLabel(scopeAgent(t.scope as Scope) || t.owning_agent),
    tier: tierOf(t.scope),
    configPath: t.config_path,
    command: t.command ?? "",
    args: t.args ?? [],
  }));

  return {
    name: serverName,
    // The launch Verify will use. A command without its arguments starts the
    // wrong process entirely -- `node` alone is a REPL, not a server.
    command: matches[0].command ?? "",
    args: matches[0].args ?? [],
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
