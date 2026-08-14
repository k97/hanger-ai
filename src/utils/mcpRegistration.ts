/**
 * What makes one MCP server registration distinct from another.
 *
 * Mirrors `Tool::registration_key` in src-tauri/src/domain.rs. The two must
 * agree, so both are stated once rather than inlined at each call site.
 *
 * A config FILE is not an asset. `~/.claude.json` declares ten servers,
 * `~/.codex/config.toml` three. Identity is the pair (file, server name).
 * The same server registered by two hosts is two registrations — that
 * cross-host coverage is what the feature exists to show, not duplication to
 * collapse.
 *
 * This module exists because four modules previously each answered this
 * question for themselves and three answered `config_path`, which kept the
 * first server in every file and discarded the rest: 23 servers in the
 * database, 7 rows on screen, under a heading that read 23.
 */

interface RegistrationLike {
  id?: string;
  name: string;
  config_path: string;
}

/** The identity of one registration. Prefer the backend's `id` when present. */
export const registrationKey = (tool: RegistrationLike): string =>
  tool.id ?? `${tool.config_path}-${tool.name}`;

/**
 * Collapse genuine duplicates — the same registration arriving twice because a
 * root was scanned more than once — while keeping every distinct server.
 */
export const dedupeRegistrations = <T extends RegistrationLike>(tools: T[]): T[] => {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const key = registrationKey(tool);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
