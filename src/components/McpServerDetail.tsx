import { openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { MANAGE_URL } from "../utils/mcpServerView";
import EngineLabel from "./EngineLabel";
import Tooltip from "./Tooltip";
import { ArrowPathIcon } from "./icons";

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
  /** `(config_path, server_name)` — this registration's identity. */
  key: string;
  host: string;
  /** `global` | `user` | `local` | `project` — where the declaration lives. */
  tier: string;
  configPath: string;
  command: string;
  /** What this registration launches, already redacted by the backend. */
  launchDisplay: string;
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

/** Every registration that launches the server the same way, collapsed to
 *  one Tools block regardless of whether any of them has been probed yet.
 *  `result` is absent until at least one member has; once set, it is
 *  whichever member's probe is shown -- the same "first succeeded"
 *  attribution the Identity section already uses above, not a
 *  reconciliation across the group (spec §5.7). */
interface SpecGroup {
  launchDisplay: string;
  regs: Registration[];
  result?: VerifiedIdentity;
}

export interface McpServerView {
  name: string;
  /** Executable Verify will run. */
  command: string;
  transport: string;
  registrations: Registration[];
  /** Variable NAMES only. Values are never read from disk (scanning.md §7). */
  envKeys: string[];
}

interface Props {
  server: McpServerView;
  /** Probe results by REGISTRATION key. Two hosts can launch the same server
   *  differently, so there is no such thing as the server's tool list. */
  verified?: Record<string, VerifiedIdentity>;
  onVerify?: (registrationKey: string) => void;
  /** The registration key currently in flight, or null. */
  verifying?: string | null;
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

/**
 * One registration's own probe result on its "Registered in" row — "N
 * tools" or "verify failed". Nothing renders before a probe: the action
 * that produces a result lives in the Tools section now, not here.
 *
 * Ruled 2026-08-18, superseding 2026-08-16's placement: that ruling put
 * Verify on this row because Tools blocks were then one per REGISTRATION,
 * so a block's own label would have repeated whatever field it fell back
 * to — config path, host, launch, all already shown here. Task 9 replaced
 * that with one block per launch SPEC: a spec group is already labelled by
 * its own launch when more than one exists, which repeats nothing this row
 * says, so the collision that forced the move is gone. The affordance
 * belongs where the tool list it produces is about to appear.
 */
function RegistrationVerifyStatus({ result }: { result?: VerifiedIdentity }) {
  if (!result) return null;
  if (result.error) {
    return <span className="text-micro font-mono text-state-danger">verify failed</span>;
  }
  return (
    <span className="text-micro font-mono text-ink-3">
      {result.tools.length === 1 ? "1 tool" : `${result.tools.length} tools`}
    </span>
  );
}

/**
 * The Verify affordance for one spec group, not one registration. A group's
 * members share a launch and therefore share a tool list (Task 9's
 * premise), so probing any single member answers for the whole group —
 * `registrationKey` is just the handle `onVerify` needs to find that member
 * again, not an invitation to render one button per registration in a
 * group. The group is the honest unit.
 */
function VerifyButton({
  registrationKey,
  verifying,
  onVerify,
}: {
  registrationKey: string;
  verifying: boolean;
  onVerify?: (registrationKey: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onVerify?.(registrationKey)}
      disabled={verifying}
      className="self-start shrink-0 text-micro text-ink-2 border border-line-2 px-2.5 py-px rounded-pill cursor-pointer hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover disabled:opacity-60 disabled:cursor-default"
    >
      {verifying ? "Verifying…" : "Verify"}
    </button>
  );
}

/**
 * Re-probes a spec group that has already answered once. Quiet at rest —
 * ink-3 lifting to ink-1 on hover, no border — because it corrects an
 * answer already on screen rather than asking a question for the first
 * time, which is what earns Verify its louder, bordered pill and is
 * exactly what this control is not. Icon-only, so the accessible name
 * carries the whole meaning; it does not change while in flight the way
 * Verify's visible label does, since the spin animation already says so.
 *
 * "Check again" is unreviewed copy — ui-copy.md wants Karthik's sign-off on
 * a first-time label before it lands, and this has not had it yet.
 *
 * Nothing reads this list's tool count today: probing is session-only
 * (`useState` in the panel that owns `verified`), so a result never grows
 * stale without a restart clearing it first. It exists ahead of that need
 * because stage 3 persists probe results across sessions, and a cached list
 * with no way to recheck it would have nowhere to put this control if it
 * arrived only once the cache did.
 */
function CheckAgainButton({
  registrationKey,
  verifying,
  onVerify,
}: {
  registrationKey: string;
  verifying: boolean;
  onVerify?: (registrationKey: string) => void;
}) {
  return (
    <Tooltip label="Check again" placement="bottom">
      <button
        type="button"
        onClick={() => onVerify?.(registrationKey)}
        disabled={verifying}
        aria-label="Check again"
        className="shrink-0 text-ink-3 hover:text-ink-1 transition-colors duration-hover cursor-pointer disabled:opacity-60 disabled:cursor-default"
      >
        <ArrowPathIcon size={13} aria-hidden="true" className={verifying ? "animate-spin" : ""} />
      </button>
    </Tooltip>
  );
}

/** A probed registration's result: its tool list, or the error the handshake
 *  reported instead. Shared by the Tools section's single-probed (unlabelled)
 *  and multi-probed (labelled) layouts, so the two never drift apart. */
function ProbedToolList({ result }: { result: VerifiedIdentity }) {
  if (result.error) {
    return <p className="text-micro text-state-danger leading-[1.5]">{result.error}</p>;
  }
  return (
    // Not height-capped. DESIGN.md's 240px rule covers DisclosureBanner
    // regions; this is the panel's primary content, and a nested scrollbar
    // inside a scrolling panel is worse than a long page.
    <div className="border border-line rounded-inner flex flex-col">
      {result.tools.map((tool, i) => (
        <div
          key={tool.name}
          className={`px-[11px] py-2 flex flex-col gap-px ${i > 0 ? "border-t border-line" : ""}`}
        >
          {/* Tool names are code identifiers, so the mono face is semantic
              here rather than decorative. */}
          <span className="font-mono text-small text-ink-1">{tool.name}</span>
          {tool.description && (
            <span className="text-micro text-ink-3 leading-[1.45]">{tool.description}</span>
          )}
        </div>
      ))}
    </div>
  );
}

export default function McpServerDetail({ server, verified, onVerify, verifying = null }: Props) {
  // Counts the rows below, not unique hosts. spades-audio is 3 registrations
  // across 2 hosts -- a count that disagreed with the visible row count would
  // read as a bug. The prototype said "3 hosts" and was simply wrong.
  const regCount = server.registrations.length;

  // Every registration that has been probed, in order. The Tools section's
  // shape depends only on how many of these there are -- see the section
  // below.
  const probed = server.registrations
    .map((reg) => ({ reg, result: verified?.[reg.key] }))
    .filter((p): p is { reg: Registration; result: VerifiedIdentity } => !!p.result);

  // Every registration grouped by the launch it shares, whether or not it
  // has been probed -- three registrations agreeing on one launch render one
  // tool list, not three identical ones (spec §5.7), and a launch nobody has
  // probed yet still needs to exist as its own group so Verify has somewhere
  // to go. Order follows each spec's first appearance in `server.registrations`.
  //
  // Counting unprobed registrations here (not just probed ones, as the old
  // `toolsGroups` did) closes a gap the previous version of this comment
  // recorded as known: a server with two genuinely different launches, one
  // probed and one not, used to collapse to a single group and render its
  // one probed block unlabelled, floating free of the launch that produced
  // it. With every registration counted, that server correctly has two
  // groups, and the probed one is labelled like any other sibling.
  const specGroups: SpecGroup[] = [];
  for (const reg of server.registrations) {
    const result = verified?.[reg.key];
    const group = specGroups.find((g) => g.launchDisplay === reg.launchDisplay);
    if (group) {
      group.regs.push(reg);
      // First succeeded wins, same attribution the Identity section already
      // uses below -- so a later member's failure never displaces a result
      // already showing, and an early failure never hides a later success.
      // Only fall through to the first result overall when every member of
      // the group failed, and never overwrite with "still unprobed".
      if (result && (!group.result || (group.result.error && !result.error))) {
        group.result = result;
      }
    } else {
      specGroups.push({ launchDisplay: reg.launchDisplay, regs: [reg], result });
    }
  }

  // Protocol revision and capabilities come from the same handshake as a
  // tool list, so the Identity section reads whichever registration answered
  // first rather than trying to reconcile several. That pick is the same
  // class of ambiguity this task exists to close, just moved from the tool
  // list to server version/protocol/capabilities -- and unlike the tool
  // list, nothing else on screen flags when it matters (the divergence
  // banner fires on launchDisplay, not on a handshake result, so two
  // identically-launched registrations can still answer differently with
  // nothing above saying so). Attribution, not reconciliation: when more
  // than one registration answered, the count slot below names which one
  // this is -- it does not compare them or flag disagreement, which is a
  // stage-2 concern with its own mechanism.
  const succeeded = probed.filter((p) => !p.result.error);
  const anyVerifiedEntry = succeeded[0];
  const anyVerified = anyVerifiedEntry?.result;

  // Nothing to spawn: a Claude.ai connector lives on Anthropic's servers, a
  // remote server answers over HTTP. Both are real MCP servers; neither is a
  // local process.
  /** What a registration launches, as the backend redacted it. */
  const launchOf = (r: { launchDisplay: string }) => r.launchDisplay;

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
          <h3 className={HEADING}>Identity</h3>
          <span className={COUNT}>
            {anyVerified
              ? `verified ${relativeTime(anyVerified.verifiedAt)}${
                  // More than one registration answered, so this could be any
                  // of them -- name whose result is showing, same "host ·
                  // tier" convention the Tools section uses below.
                  succeeded.length > 1
                    ? ` · ${anyVerifiedEntry.reg.host} · ${anyVerifiedEntry.reg.tier}`
                    : ""
                }`
              : "unknown"}
          </span>
        </div>
        {anyVerified ? (
          <div className="flex flex-wrap gap-[6px]">
            {anyVerified.serverVersion && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                server <b className="font-medium text-ink-1">{anyVerified.serverVersion}</b>
              </span>
            )}
            {anyVerified.protocolVersion && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                MCP <b className="font-medium text-ink-1">{anyVerified.protocolVersion}</b>
              </span>
            )}
            {anyVerified.capabilities.length > 0 && (
              <span className="text-micro font-mono bg-plane border border-line px-2 py-px rounded-pill text-ink-2">
                caps <b className="font-medium text-ink-1">{anyVerified.capabilities.join(", ")}</b>
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
              {/* This registration's own probe result, once one exists.
                  Absent for a Claude.ai connector -- there is nothing local
                  to spawn, so it is never probed. */}
              {!isConnector && (
                <RegistrationVerifyStatus result={verified?.[reg.key]} />
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
          <h3 className={HEADING}>Tools</h3>
          {/* A tool count is honest in this slot only when the server has a
              single launch spec -- one launch means one tool surface, so
              the number can only ever mean one thing. With more than one
              spec, two registrations can expose two different tool
              surfaces, and one number here would read as the server's;
              each spec keeps its own count beside its own launch label
              instead (below), and this slot falls back to the registration
              count, which is true regardless of how many specs there are.
              Verify and Check-again live here too, in the single-spec case,
              for the same reason: with only one launch to act on, this slot
              is unambiguous, and Karthik's call (2026-08-18) is that the
              affordance belongs where the eye already is rather than below
              an otherwise-empty block. */}
          {!isConnector && specGroups.length === 1 ? (
            specGroups[0].result ? (
              <span className="inline-flex items-center gap-2">
                <span className={COUNT}>
                  {specGroups[0].result.error ? "—" : specGroups[0].result.tools.length}
                </span>
                <CheckAgainButton
                  registrationKey={specGroups[0].regs[0].key}
                  verifying={verifying === specGroups[0].regs[0].key}
                  onVerify={onVerify}
                />
              </span>
            ) : (
              <VerifyButton
                registrationKey={specGroups[0].regs[0].key}
                verifying={verifying === specGroups[0].regs[0].key}
                onVerify={onVerify}
              />
            )
          ) : (
            <span className={COUNT}>
              {regCount === 1 ? "1 registration" : `${regCount} registrations`}
            </span>
          )}
        </div>
        {isConnector ? (
          // A connector runs on Anthropic's servers -- there is no local
          // process to spawn and nothing Hanger can dial, so this is the
          // whole Tools section regardless of anything else about it.
          <div className="border border-dashed border-line-2 rounded-inner px-[14px] py-[18px] flex flex-col gap-2 items-start">
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
                className="text-micro border border-line-2 text-ink-2 px-2.5 py-px rounded-pill cursor-pointer hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover"
              >
                {MANAGE_URL["claude-ai"].label} ↗
              </button>
            )}
          </div>
        ) : specGroups.length === 1 ? (
          // Nothing to disambiguate when every registration of this server
          // shares one launch, probed or not -- `specGroups` counts all of
          // them, not just the probed ones, so this branch and the labelled
          // one below always agree with how many specs the server actually
          // has.
          specGroups[0].result ? (
            // Count and Check-again moved up to the section header (above) --
            // one spec means that slot is unambiguous, so the block itself
            // is just the list, same shape as the section's simplest case.
            <div data-testid="tools-block">
              <ProbedToolList result={specGroups[0].result} />
            </div>
          ) : (
            <div className="border border-dashed border-line-2 rounded-inner px-[14px] py-[18px] flex flex-col gap-2 items-start">
              <p className="text-micro text-ink-3 leading-[1.45]">
                {isRemote
                  ? "Asks the endpoint for its tool list. No credentials are sent."
                  : "Tools are only known by asking the server."}
              </p>
              {/* Verify itself now lives in the section header (above), not
                  here -- this explains why the list is empty; the header is
                  where the action to fill it lives. */}
            </div>
          )
        ) : (
          <div className="flex flex-col gap-3">
            {specGroups.map((group) => (
              <div key={group.launchDisplay} data-testid="tools-block" className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  {/* The spec this block's tools came from -- the rule this
                      redesign exists to hold: a tool count never appears
                      without the launch that produced it. */}
                  <span className="text-micro font-mono text-ink-3 truncate">
                    {group.launchDisplay}
                  </span>
                  {group.result && (
                    <span className="inline-flex items-center gap-2">
                      <span className={COUNT}>{group.result.error ? "—" : group.result.tools.length}</span>
                      <CheckAgainButton
                        registrationKey={group.regs[0].key}
                        verifying={verifying === group.regs[0].key}
                        onVerify={onVerify}
                      />
                    </span>
                  )}
                </div>
                {/* Which registrations share this spec -- host + tier, not
                    the path, same convention the old per-registration label
                    used. Plural when more than one host launches it
                    identically. */}
                <span className="text-micro font-mono text-ink-3 truncate">
                  {group.regs.map((r) => `${r.host} · ${r.tier}`).join(", ")}
                </span>
                {group.result ? (
                  <ProbedToolList result={group.result} />
                ) : (
                  <VerifyButton
                    registrationKey={group.regs[0].key}
                    verifying={verifying === group.regs[0].key}
                    onVerify={onVerify}
                  />
                )}
              </div>
            ))}
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
