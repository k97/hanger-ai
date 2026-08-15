import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { MANAGE_URL } from "../utils/mcpServerView";
import EngineLabel from "./EngineLabel";

/**
 * The inspector panel for one MCP server.
 *
 * Every other asset lives in exactly one place, so `AssetDetail`'s flat shape —
 * one name, one path, one version — fits it. An MCP server does not: it has N
 * config paths, no version until a handshake, and 17–20 tools. Forcing it
 * through `AssetDetail` would put a comma-joined blob in `details?: string`.
 *
 * Built to docs/hanger-mcp-panel.html, whose every value was probed from a real
 * machine. The context-budget bar in that study is deliberately absent here:
 * the ~40-tool ceiling is third-party guidance, not measured, and spec §5.5
 * excludes it.
 */

interface Registration {
  host: string;
  /** `global` | `user` | `local` | `project` — where the declaration lives. */
  tier: string;
  configPath: string;
  command: string;
  args?: string[];
  /**
   * Present only while a process matching this launch is running.
   *
   * Absent is the ordinary state, not a fault: stdio servers are started on
   * demand by whichever host needs them, so most registrations are idle most
   * of the time.
   */
  running?: { pid: number; spawningHost?: string };
}

interface VerifiedIdentity {
  serverVersion?: string;
  protocolVersion?: string;
  capabilities: string[];
  tools: Array<{ name: string; description?: string }>;
  verifiedAt: number;
  /** Present when the probe could not complete. Shown instead of an empty list. */
  error?: string;
}

export interface McpServerView {
  name: string;
  /** Executable Verify will run. */
  command: string;
  /** Arguments it needs. `node` without these is a REPL, not a server. */
  args: string[];
  transport: string;
  registrations: Registration[];
  verified?: VerifiedIdentity;
  /** Variable NAMES only. Values are never read from disk (scanning.md §7). */
  envKeys: string[];
}

interface Props {
  server: McpServerView;
  onVerify?: () => void;
  verifying?: boolean;
}

const SECTION = "px-[18px] py-[18px] border-b border-line";
const HEADING = "text-micro font-medium text-ink-3 uppercase tracking-[0.08em]";
const COUNT = "text-micro font-mono text-ink-2 tabular";

function relativeTime(then: number): string {
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function McpServerDetail({ server, onVerify, verifying = false }: Props) {
  const { verified } = server;
  // Counts the rows below, not unique hosts. spades-audio is 3 registrations
  // across 2 hosts -- a count that disagreed with the visible row count would
  // read as a bug. The prototype said "3 hosts" and was simply wrong.
  const regCount = server.registrations.length;

  // Nothing to spawn: a Claude.ai connector lives on Anthropic's servers, a
  // remote server answers over HTTP. Both are real MCP servers; neither is a
  // local process.
  /** What a registration actually launches, for comparison across hosts. */
  const launchOf = (r: { command: string; args?: string[] }) =>
    [r.command, ...(r.args ?? [])].join(" ").trim();

  /* The reason this panel exists rather than nested rows: the same server can
     be wired differently by different hosts, and nothing else on the machine
     can see across them. Silent when they agree — a "no divergence" badge on
     every server would be noise. */
  const launches = new Set(server.registrations.map(launchOf).filter(Boolean));
  const diverges = launches.size > 1;

  const isConnector = server.transport === "claude.ai";
  // Remote servers ARE verifiable now — dialled rather than spawned. Only a
  // Claude.ai connector has nothing Hanger can reach at all.
  const isRemote =
    !isConnector &&
    server.command.trim() === "" &&
    /^https?:\/\//.test(server.transport);

  return (
    <div className="flex-1 min-h-0 flex flex-col font-sans text-base text-ink-1">
      {/* No header of its own. The Flyout's chrome carries both the server
          name and the transport chip; this panel rendering either one again
          produced a visible duplicate. Twice now — the <h2> first, then the
          chip — so the rule is worth stating: the chrome owns identity, this
          component owns content. */}

      {/* One scroll region for the whole panel, as in AssetDetail. The tools
          list used to cap itself at 240px, which meant two nested scrollbars
          and a list you could only read a sixth of at a time. */}
      <div className="flex-1 min-h-0 overflow-y-auto">

      <section className={SECTION}>
        <div className="flex items-baseline justify-between gap-2 mb-[10px]">
          <h3 className={HEADING}>Registered in</h3>
          <span className={COUNT}>
            {`${regCount} ${regCount === 1 ? "registration" : "registrations"}`}
          </span>
        </div>
        <div className="flex flex-col gap-px bg-line border border-line rounded-inner overflow-hidden">
          {server.registrations.map((reg, i) => (
            <div key={`${reg.configPath}-${i}`} className="bg-page px-[11px] py-[9px] flex flex-col gap-[3px]">
              <div className="flex items-center justify-between gap-2">
                {/* reg.host is the display name (hostLabel); the map resolves names too. */}
                <EngineLabel engineKey={reg.host} className="text-small font-medium">
                  {reg.host}
                </EngineLabel>
                <span className="text-micro font-mono text-ink-3 uppercase tracking-[0.06em]">
                  {reg.tier}
                </span>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-micro font-mono text-ink-3 truncate flex-1">
                  {reg.configPath}
                </span>
                {/* Naming a file without letting you reach it is the same dead
                    end the connector state had. */}
                <button
                  type="button"
                  aria-label={`Reveal ${reg.configPath}`}
                  onClick={() => revealItemInDir(reg.configPath).catch(() => {})}
                  className="shrink-0 text-micro font-mono text-ink-3 px-1.5 rounded-pill cursor-pointer hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover"
                >
                  reveal
                </button>
              </div>
              {/* What it launches. Without this the panel could not show the
                  divergence it was designed to surface, and could not answer
                  "what does this actually run?" after a failed Verify. */}
              {launchOf(reg) && (
                <span
                  className={`text-micro font-mono truncate ${
                    diverges ? "text-state-warning" : "text-ink-3"
                  }`}
                >
                  {launchOf(reg)}
                </span>
              )}
              {/* Shown only when true. Most servers are started on demand, so
                  "not running" is the normal state and badging every row with
                  it would read as an error rather than as information. */}
              {reg.running && (
                <span className="text-micro font-mono text-state-success">
                  {`running · pid ${reg.running.pid}`}
                  {reg.running.spawningHost ? ` · ${reg.running.spawningHost}` : ""}
                </span>
              )}
            </div>
          ))}
        </div>
        {diverges && (
          <p className="text-micro text-state-warning leading-[1.45] mt-2">
            These hosts launch {server.name} differently. Whichever you are using decides
            which version you get.
          </p>
        )}
      </section>

      <section className={SECTION}>
        <div className="flex items-baseline justify-between gap-2 mb-[10px]">
          <h3 className={HEADING}>Identity</h3>
          <span className={COUNT}>
            {verified ? `verified ${relativeTime(verified.verifiedAt)}` : "unknown"}
          </span>
        </div>
        {verified && !verified.error ? (
          <div className="flex flex-wrap gap-[6px]">
            {verified.serverVersion && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                server <b className="font-medium text-ink-1">{verified.serverVersion}</b>
              </span>
            )}
            {verified.protocolVersion && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                MCP <b className="font-medium text-ink-1">{verified.protocolVersion}</b>
              </span>
            )}
            {verified.capabilities.length > 0 && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                caps <b className="font-medium text-ink-1">{verified.capabilities.join(", ")}</b>
              </span>
            )}
          </div>
        ) : (
          <p className="text-micro text-ink-3 leading-[1.5]">
            Version, protocol revision and capabilities are only knowable by handshake. Nothing on
            disk records them.
          </p>
        )}
      </section>

      <section className={SECTION}>
        <div className="flex items-baseline justify-between gap-2 mb-[10px]">
          <h3 className={HEADING}>Tools</h3>
          <span className={COUNT}>{verified && !verified.error ? verified.tools.length : "—"}</span>
        </div>

        {verified?.error ? (
          <p className="text-micro text-state-danger leading-[1.5]">{verified.error}</p>
        ) : verified ? (
          // Not height-capped. DESIGN.md's 240px rule covers DisclosureBanner
          // regions; this is the panel's primary content, and a nested
          // scrollbar inside a scrolling panel is worse than a long page.
          <div className="border border-line rounded-inner flex flex-col">
            {verified.tools.map((tool, i) => (
              <div
                key={tool.name}
                className={`px-[11px] py-2 flex flex-col gap-px ${i > 0 ? "border-t border-line" : ""}`}
              >
                {/* Tool names are code identifiers, so the mono face is
                    semantic here rather than decorative. */}
                <span className="font-mono text-small text-ink-1">{tool.name}</span>
                {tool.description && (
                  <span className="text-micro text-ink-3 leading-[1.45]">{tool.description}</span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border border-dashed border-line-2 rounded-inner px-[14px] py-[18px] flex flex-col gap-2 items-start">
            {/* Verify spawns a local process. A server with no command has
                nothing to spawn — a remote endpoint or a Claude.ai connector —
                so offering the button would invite a click that can only fail
                with "No such file or directory". */}
            {isConnector ? (
              <>
                <p className="text-small text-ink-2 leading-[1.5]">
                  Runs on Anthropic&rsquo;s servers, not on this machine.
                </p>
                {/* A dead end should still point somewhere. There is no file to
                    open and nothing to verify, but the place this is managed is
                    knowable, so offer it rather than stopping at "nothing
                    local to inspect". */}
                {MANAGE_URL["claude-ai"] && (
                  <button
                    type="button"
                    onClick={() => openUrl(MANAGE_URL["claude-ai"].url).catch(() => {})}
                    className="text-micro font-mono border border-line-2 px-[10px] py-px rounded-pill cursor-pointer hover:bg-plane-2 transition-colors duration-hover"
                  >
                    {MANAGE_URL["claude-ai"].label} ↗
                  </button>
                )}
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onVerify}
                  disabled={verifying}
                  className="text-micro font-mono bg-fill text-on-fill border border-line-2 px-[10px] py-px rounded-pill cursor-pointer"
                >
                  {verifying ? "Verifying…" : "Verify"}
                </button>
                {/* One line, not three. The long version explained the design
                    decision behind the button — useful once, noise on every
                    one of 23 servers. The credentials note stays for remote
                    servers because it is a privacy claim, not a mechanism. */}
                <p className="text-micro text-ink-3 leading-[1.45]">
                  {isRemote
                    ? "Asks the endpoint for its tool list. No credentials are sent."
                    : "Tools are only known by asking the server."}
                </p>
              </>
            )}
          </div>
        )}
      </section>

      {server.envKeys.length > 0 && (
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-2 mb-[10px]">
            <h3 className={HEADING}>Environment</h3>
            <span className={COUNT}>{server.envKeys.length}</span>
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {server.envKeys.map((key) => (
              <span
                key={key}
                className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2"
              >
                {key}
              </span>
            ))}
          </div>
          <p className="text-micro text-ink-3 leading-[1.5] mt-2">
            Names only. Hanger never reads a variable&rsquo;s value.
          </p>
        </section>
      )}
      </div>
    </div>
  );
}
