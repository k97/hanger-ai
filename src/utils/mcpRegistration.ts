/**
 * What makes one MCP server registration distinct from another.
 *
 * A config FILE is not an asset. `~/.claude.json` declares ten servers,
 * `~/.codex/config.toml` three. Identity is the pair (file, server name). The
 * same server registered by two hosts is two registrations — that cross-host
 * coverage is what the feature exists to show, not duplication to collapse.
 *
 * This module exists because four modules previously each answered this
 * question for themselves and three answered `config_path`, which kept the
 * first server in every file and discarded the rest: 23 servers in the
 * database, 7 rows on screen, under a heading that read 23.
 */

declare const REGISTRATION_KEY: unique symbol;

/**
 * A key minted by the backend, not by this layer.
 *
 * Branded because a bare `config_path` and a real key are both `string`, so
 * the compiler could not tell them apart and did not: the annotation join
 * looked assets up by `config_path` alone and Reach rendered blank for every
 * MCP row. The brand makes that a type error at the call site.
 *
 * There is deliberately no way to construct one here. The backend owns the
 * format — `RegistrationKey` in `src-tauri/src/domain.rs`, which joins the
 * pair with a colon to match what the store keys `assets.abs_path` on. A
 * TypeScript fallback that rebuilt the string could not canonicalise the path
 * and used a hyphen, so it produced a key that matched nothing.
 */
export type RegistrationKey = string & { readonly [REGISTRATION_KEY]: "registration" };

/**
 * `id` is required, not optional. Every `Tool` crossing IPC carries one
 * (`pub id: String` in domain.rs, assigned in `tool_from_registration`), so an
 * absent id means a fixture, and a fixture that omits it was exercising a
 * fallback production never takes.
 */
interface RegistrationLike {
  id: string;
}

/** The identity of one registration, as the backend minted it. */
export const registrationKey = (tool: RegistrationLike): RegistrationKey =>
  tool.id as RegistrationKey;

/**
 * Collapse genuine duplicates — the same registration arriving twice because a
 * root was scanned more than once — while keeping every distinct server.
 */
export const dedupeRegistrations = <T extends RegistrationLike>(tools: T[]): T[] => {
  const seen = new Set<RegistrationKey>();
  return tools.filter((tool) => {
    const key = registrationKey(tool);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
