import { useEffect, useRef, useState } from "react";
import { openUrl, openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { MANAGE_URL } from "../utils/mcpServerView";
import { diffLaunch, type LaunchDiffToken } from "../utils/launchDiff";
import { joinNames } from "../utils/prose";
import EngineLabel from "./EngineLabel";
import InfoPopover from "./InfoPopover";
import Tooltip from "./Tooltip";
import UnderlineTabs from "./UnderlineTabs";
import ListCard, { ListCardRow } from "./ListCard";
import { miniBtnClass, miniSetClass } from "./miniButton";
import type { ProbeView, ToolCost } from "../utils/probeView";
import {
  RevealInFileManagerIcon,
  ServerRelayIcon,
  TagIcon,
  SignalIcon,
  ArrowPathRoundedSquareIcon,
  WrenchScrewdriverIcon,
  ArchiveBoxIcon,
  ChatBubbleOvalLeftIcon,
  KeyIcon,
  ArrowsRightLeftIcon,
  DocumentTextIcon,
} from "./icons";

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
  /** Where this registration reaches the server, as the backend sanitised it
   *  (`Tool.transport`): `stdio`, `claude.ai`, or an endpoint whose userinfo
   *  and query string are already stripped (`dialect::sanitise_url`). The
   *  server-wide `transport` cannot stand in for it — that is one arm's
   *  value (`group_servers` takes the first registration's), and telling two
   *  remote arms apart is exactly what it is needed for. */
  transport?: string;
  /** True when this registration reaches its server through a local bridge
   *  (mcp-remote) rather than declaring the endpoint directly. Backend-owned
   *  (`Tool.bridged`) — never inferred here from `launchDisplay`'s text. */
  bridged?: boolean;
  /**
   * Present only while a process matching this launch is running.
   *
   * Absent is the ordinary state, not a fault: stdio servers are started on
   * demand by whichever host needs them, so most registrations are idle most
   * of the time.
   */
  running?: { pid: number; spawningHost?: string };
}

/** The panel's own name for the probe union -- `answered` carries the tool
 *  list and its optional cost, `failed` carries only the error. See
 *  `src/utils/probeView.ts` for why the wire cannot express this directly. */
type VerifiedIdentity = ProbeView;

/** Every registration that launches the server the same way, collapsed to
 *  one Tools block regardless of whether any of them has been probed yet.
 *  `result` is absent until at least one member has; once set, it is
 *  whichever member's probe is shown -- the same "first succeeded"
 *  attribution the Identity section already uses above, not a
 *  reconciliation across the group (spec §5.7). */
interface SpecGroup {
  /** What made these registrations one group: the launch they share, or --
   *  for a direct remote declaration, which has no launch at all -- the
   *  sanitised endpoint they dial. Also the block's label and React key: two
   *  remote groups both had `launchDisplay` `""` and collided on both. */
  key: string;
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
  /** The user asked: Verify, or the re-check. Always reaches the server. */
  onVerify?: (registrationKey: string) => void;
  /**
   * The panel opened, and this launch has no answer yet.
   *
   * Distinct from `onVerify` because it is not a request to start anything:
   * the backend answers from its cache where it can, and declines to spawn a
   * server that is already running. `running` is the second half of that
   * decision and is supplied from here rather than recomputed in Rust — the
   * `running · pid N` line below is rendered from the same fact, and a spawn
   * decision that contradicts what is on screen would be worse than the
   * process-table refresh it saves.
   */
  onAutoProbe?: (registrationKey: string, running: boolean) => void;
  /**
   * Registration keys the backend declined to probe, because the launch is
   * already running.
   *
   * From the answer, never from `reg.running`. A process list can be minutes
   * old, so a launch can read as stopped here while the machine says
   * otherwise — `cached_probe` checks the live process table before it starts
   * anything, and this is how it says it did. Deriving the state from the
   * panel's own snapshot instead would explain an empty block by saying nobody
   * had asked, at exactly the moment that was false.
   */
  declined?: readonly string[];
  /** Registration keys with a request in flight. More than one launch spec
   *  can be in flight at once now that the panel asks on open. */
  verifying?: readonly string[];
}

/** Stable empty default, so the effect below does not see a new array every
 *  render. */
const NONE_IN_FLIGHT: readonly string[] = [];
const NONE_DECLINED: readonly string[] = [];

/** How long a probe must run before it is worth saying so. */
const PENDING_DELAY_MS = 250;

/** Hanger starts its own private copy, performs the handshake, and stops it.
 *  "Asking the server" is the vocabulary the resting state already uses. */
const PROBE_PENDING = "Asking the server…";

/** Why an empty Tools block is not a failure. Nothing went wrong: a host has
 *  this server running, asking it means starting a second copy, and some
 *  servers permit exactly one — a bot token with a single long-poll
 *  connection, an OAuth callback port. The re-check beside this is there for
 *  anyone who wants to ask anyway. */
const DECLINED_RUNNING =
  "This server is already running. Asking for its tool list means starting a second copy, and some servers only allow one at a time, so Hanger left it alone.";

/**
 * Shown while Hanger is asking, and only after a quarter-second.
 *
 * Probes on this machine measure 100ms-1.3s; spades-audio answers in 196ms.
 * An indicator that appeared the instant a request left would flash and
 * vanish on every fast server, which reads as a glitch rather than as
 * progress — so nothing is drawn at all until the wait is long enough to be
 * worth explaining. The whole block appears at once, text and frame
 * together, rather than an empty frame growing a line.
 */
function ProbePending() {
  const [longEnough, setLongEnough] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setLongEnough(true), PENDING_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
  if (!longEnough) return null;
  return (
    <div className="border border-dashed border-line-2 rounded-inner px-[14px] py-[18px] flex items-center gap-2 text-micro text-ink-3">
      <ServerRelayIcon size={12} active aria-hidden="true" />
      {PROBE_PENDING}
    </div>
  );
}

/* Sections separate on whitespace, not a rule. The --line border in this
   panel family means header-from-body (Flyout, ReviewInspector) -- spending
   it between content sections too left this the only panel in the app drawing
   one, and the skill panel beside it has never needed one. Every section here
   already leads with an eyebrow and encloses a bordered card; that is the
   structure, and a rule on top of it was a third statement of the same
   boundary.

   Margins, not padding, and the exact string AssetDetail uses: adjacent
   margins collapse to one gap, adjacent padding sums to two. The same 14px
   spelled `py-` drew twice the gap here that `my-` drew next door, which is
   what made this panel's rhythm read as foreign once the rule came off.
   `src/__tests__/inspector-section-rhythm.test.ts` holds the two spellings
   together. */
const SECTION = "mx-[12px] my-5";
const HEADING = "text-micro font-medium text-ink-3 uppercase tracking-[.06em]";
const COUNT = "text-micro font-mono text-ink-2 tabular";

/** The filename a config path ends in -- what the verdict card's labels need
 *  to tell two same-host registrations apart, without a whole path's worth
 *  of directory noise. */
function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1];
}

/** "3.1 kB" or "431 B" — the backend's own byte count, never re-measured. */
function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

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
  if (result.kind === "failed") {
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
  onVerify,
}: {
  registrationKey: string;
  onVerify?: (registrationKey: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onVerify?.(registrationKey)}
      className="self-start shrink-0 text-micro text-ink-2 border border-line-2 px-2.5 py-px rounded-pill cursor-pointer hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover"
    >
      Verify
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
        <ServerRelayIcon size={13} active={verifying} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}

/** A probed registration's result: its tool list, or the error the handshake
 *  reported instead. Shared by the Tools section's single-probed (unlabelled)
 *  and multi-probed (labelled) layouts, so the two never drift apart. */
function ProbedToolList({ result }: { result: VerifiedIdentity }) {
  if (result.kind === "failed") {
    return <p className="text-micro text-state-danger leading-[1.5]">{result.error}</p>;
  }
  return (
    // Not height-capped. DESIGN.md's 240px rule covers DisclosureBanner
    // regions; this is the panel's primary content, and a nested scrollbar
    // inside a scrolling panel is worse than a long page.
    //
    // No header, no schema column, no per-tool figure: a probed tool is a
    // name and a description and the row shows exactly that. The section's
    // accounting lives in the Context-per-request ledger; a per-tool size
    // has no decision attached to it, so it earns no place here.
    <ListCard>
      {result.tools.map((tool) => (
        <div key={tool.name} className="flex flex-col gap-[3px] px-3 py-[9px]">
          {/* Tool names are code identifiers, so the mono face is semantic
              here rather than decorative. */}
          <span className="font-mono text-small text-ink-1 min-w-0 truncate">
            {tool.name}
          </span>
          {tool.description && (
            <span className="text-small text-ink-2 leading-[1.45]">{tool.description}</span>
          )}
        </div>
      ))}
    </ListCard>
  );
}

/**
 * What a request actually carries for one spec group's tools -- the byte and
 * token accounting `cost` already holds. Extracted so each spec group in the
 * multi-spec Tools layout can render its own ledger directly above its own
 * `ProbedToolList`, rather than one figure floating above every group's list
 * with nothing saying which list it describes.
 */
function ContextPerRequest({ cost }: { cost: ToolCost }) {
  return (
    <ListCard>
        <ListCardRow
          label={
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-small leading-[1.5]">Descriptions</span>
              <span className="text-micro text-ink-3 leading-[1.5]">
                {cost.describedToolCount} of {cost.toolCount} tools carry one
              </span>
            </span>
          }
          value={
            <span className="flex flex-col gap-0.5 items-end">
              <span className="text-base-app text-ink-1">
                ≈ {cost.estimatedTokens.toLocaleString("en-US")} tokens
              </span>
              <span>{formatBytes(cost.descriptionBytesTotal)}</span>
            </span>
          }
        />
        <ListCardRow
          label={
            <span className="flex flex-col gap-0.5 min-w-0">
              <span className="text-small leading-[1.5]">Input schemas</span>
              <span className="text-micro text-ink-3 leading-[1.5]">
                Usually the larger part of a definition
              </span>
            </span>
          }
        wide={<span className="text-ink-3">Not measured</span>}
      />
    </ListCard>
  );
}

/**
 * How the ledger above got its figures, and what it cannot reach. Lives
 * behind the info trigger in whichever header row owns the ledger -- the
 * section heading when there is one launch spec, the block's own launch line
 * when there are several. Read once and then in the way, which is what a
 * popover is for.
 */
const CONTEXT_NOTE =
  "A request carries a name, a description and an input schema for every tool. This weighs " +
  "the descriptions in the list below; the schemas are never stored, so nothing here can " +
  "weigh them. Token figures are bytes divided by four, so treat them as a size, not a count.";

/** The one trigger both ledgers hang their note from. */
function ContextNote() {
  return <InfoPopover label="About these figures">{CONTEXT_NOTE}</InfoPopover>;
}

/** One side of an aligned launch-spec diff: which host(s) launch it this
 *  way, and the tokens themselves with the differing ones picked out. Same
 *  mono face and warning color the per-registration launch line already
 *  uses when `diverges` is true (above, in "Registered in") -- this is a
 *  closer look at the same fact, not a different vocabulary for it. */
function LaunchDiffLine({ label, tokens }: { label: string; tokens: LaunchDiffToken[] }) {
  return (
    <div className="flex flex-col gap-px min-w-0">
      <span className="text-micro font-mono text-ink-3 truncate">{label}</span>
      <div className="flex flex-wrap gap-x-1.5 gap-y-px font-mono text-micro">
        {tokens.map((token, i) => (
          <span key={i} className={token.differs ? "text-state-warning font-medium" : "text-ink-2"}>
            {token.text}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function McpServerDetail({
  server,
  verified,
  onVerify,
  onAutoProbe,
  declined = NONE_DECLINED,
  verifying = NONE_IN_FLIGHT,
}: Props) {
  // Tools first, Details second: the tool list is what "is this server
  // healthy" reduces to, and it is the only content most opens need. A new
  // server resets to Tools rather than keeping whatever the last one was
  // showing -- otherwise opening a server right after reading another's
  // Environment tab would land there for a server that never showed it.
  const [tab, setTab] = useState<"tools" | "details">("tools");
  useEffect(() => {
    setTab("tools");
  }, [server.name]);

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
  /* What makes two registrations the same thing to ask.
     `launchDisplay` for anything with a local launch, exactly as before. A
     DIRECT remote registration has none -- no dialect puts a URL into
     command/args, as the bridge note below says itself -- so every one of
     them used to fold into a single ""-keyed group, and a server declared at
     two different endpoints rendered one arm's tools with the other arm
     erased. Its endpoint is what identifies it, and `transport` is that
     endpoint in the only form allowed on screen: sanitised by the backend,
     userinfo and query string already stripped.
     Two arms differing only in their query string still fold together here.
     The raw URL never crosses IPC and `url_fingerprint` may not be rendered,
     logged or serialised, so that comparison belongs to the server list's
     agreement verdict, which does hold it -- this is the honest
     approximation available to the panel, not a claim the two are one. */
  const specKeyOf = (r: Registration) => r.launchDisplay || r.transport || "";

  const specGroups: SpecGroup[] = [];
  for (const reg of server.registrations) {
    const result = verified?.[reg.key];
    const group = specGroups.find((g) => g.key === specKeyOf(reg));
    if (group) {
      group.regs.push(reg);
      // First succeeded wins, same attribution the Identity section already
      // uses below -- so a later member's failure never displaces a result
      // already showing, and an early failure never hides a later success.
      // Only fall through to the first result overall when every member of
      // the group failed, and never overwrite with "still unprobed".
      if (result && (!group.result || (group.result.kind === "failed" && result.kind !== "failed"))) {
        group.result = result;
      }
    } else {
      specGroups.push({
        key: specKeyOf(reg),
        launchDisplay: reg.launchDisplay,
        regs: [reg],
        result,
      });
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
  const succeeded = probed.filter(
    (p): p is { reg: Registration; result: Extract<VerifiedIdentity, { kind: "answered" }> } =>
      p.result.kind === "answered"
  );
  const anyVerifiedEntry = succeeded[0];
  const anyVerified = anyVerifiedEntry?.result;

  // The single spec's own result, narrowed once here rather than re-indexed
  // (and re-narrowed) at every read below -- `specGroups[0].result.kind`
  // repeated inline does not stay narrowed across expressions.
  const soloResult = specGroups.length === 1 ? specGroups[0].result : undefined;

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
  const launchesDiverge = launches.size > 1;

  /* The same finding for servers that are dialled rather than launched.
     `launches` above is built from `launchDisplay` and drops every empty
     one, so two direct remote registrations pointed at different endpoints
     could never make it true however far apart they were -- the list row
     said Conflicting (the backend compares fingerprints) and the panel that
     exists to explain the conflict said nothing. Bridged registrations are
     excluded: a bridge HAS a launch and is already counted above, and one
     bridge beside one direct sibling is the case the note further down
     covers rather than a divergence. */
  const remoteEndpoints = new Set(
    server.registrations
      .filter((r) => !r.bridged && !r.launchDisplay)
      .map((r) => r.transport)
      .filter(Boolean)
  );
  const endpointsDiverge = remoteEndpoints.size > 1;
  const diverges = launchesDiverge || endpointsDiverge;

  // `specGroups` already dedups by exact launchDisplay match (above), so
  // filtering out the empty-launch group here leaves exactly one entry per
  // distinct non-empty launch -- the same count `launches` reports. This is
  // what the aligned diff below iterates: comparing against an empty
  // baseline (a connector-ish registration with no command sorted first)
  // would show every token as differing for no real reason.
  const divergingGroups = specGroups.filter((g) => g.launchDisplay);

  /* `a8ba0c9` (backend) folds a registration reached through the local
     mcp-remote bridge to the same comparison key as a direct sibling of the
     same endpoint, so the pair never reaches `diverges` above -- a direct
     registration's `launchDisplay` is always empty (no dialect ever puts a
     URL into `command`/`args`), so it drops out of `launches` entirely and
     the bridged registration's own display is the only thing left standing.
     That is correct, but silent: nothing said why a bridge and a direct
     declaration of the same server were never flagged as a conflict.

     Fix round 1: the note this renders used to say the two registrations
     WERE the same server. That is not knowable here. `directRemoteRegs`
     matches ANY empty-launch registration by name -- a bridged "notion"
     and an unrelated direct "notion" at a different endpoint under a
     different host would produce the identical rendering, and the old copy
     asserted an identity nothing on this panel can confirm. The backend's
     `Agreement` verdict is what actually compares `url_fingerprint`
     (`mcp::agreement::comparison_key`), and it does not cross IPC to this
     component -- only to `McpServerRow` on the server list, which is where
     "they agree" carries real authority. Threading `url_fingerprint` (or
     the verdict itself) down to this panel would answer it properly, but
     `url_fingerprint` carries a locked invariant against being rendered,
     logged, or serialised (`dialect.rs`'s doc comment on the field) --
     loosening that is Karthik's call, parked, not made here.

     What the note says now is scoped to what IS true by construction: the
     bridge's relationship to its own endpoint. `unwrap_bridge` resolved it
     to the URL it proxies, so "this is a local bridge process, not a
     separate server" holds regardless of any sibling registration. It
     still renders only when the panel holds both shapes -- a bridge with
     no direct sibling (or vice versa) has nothing to contrast, and a real
     divergence already has its own warning above -- but that condition no
     longer needs to be watertight proof of shared identity, because the
     softened claim does not depend on it. */
  const bridgedRegs = server.registrations.filter((r) => r.bridged);
  const directRemoteRegs = server.registrations.filter((r) => !r.bridged && !r.launchDisplay);
  const showsBridgeNote = !diverges && bridgedRegs.length > 0 && directRemoteRegs.length > 0;

  /* The verdict card: one stated fact instead of leaving the reader to count
     registration rows and cross-reference config paths themselves. A lone
     host declaring the server twice is its own kind of surprise, worth
     naming beside -- not instead of -- whether the launches themselves
     agree. */
  const sameEngineTwice = server.registrations.some(
    (reg, i) => server.registrations.findIndex((r) => r.host === reg.host) !== i
  );
  const headline = `Declared ${regCount} times${sameEngineTwice ? ", twice by the same engine" : ""}`;
  const verdictWarns = diverges || sameEngineTwice;
  /* Host, or "host (config basename)" when that same host declares the
     server more than once -- otherwise a same-engine list reads as one
     voice repeated rather than as two separate declarations. */
  const labels = server.registrations.map((reg) =>
    server.registrations.filter((r) => r.host === reg.host).length > 1
      ? `${reg.host} (${basename(reg.configPath)})`
      : reg.host
  );
  // Only the agreeing case gets a sentence here. A diverging launch is
  // already explained beside the diff that shows which part differs
  // (Registered in, below) -- saying so twice was the defect this task
  // exists to remove, and this panel's rule is said once.
  const detail = !diverges
    ? `All ${regCount} launches agree — the same command from ${joinNames(labels)}.`
    : undefined;
  /* Compare scrolls to the aligned launch diff two sections down; a ref
     rather than an anchor + hash because this is the panel's own scroll
     container jumping to its own content, not navigation the URL should
     remember. */
  const launchDiffRef = useRef<HTMLDivElement>(null);

  const isConnector = server.transport === "claude.ai";
  // Remote servers ARE verifiable now — dialled rather than spawned. Only a
  // Claude.ai connector has nothing Hanger can reach at all.
  const isRemote =
    !isConnector &&
    server.command.trim() === "" &&
    /^https?:\/\//.test(server.transport);

  /* Nothing here can be asked anything: a Claude.ai connector runs on
     Anthropic's servers, and a declaration with neither a command nor an
     http endpoint has no target at all. Asking anyway produces "Could not
     start ``" — a failure message the user never invited, arriving on its
     own the moment the panel opens. */
  const nothingToAsk = isConnector || (server.command.trim() === "" && !isRemote);

  /* Whether a launch is running, as far as this panel's own snapshot goes.
     `some`, not the first row: the registrations of one spec share a launch,
     so a process under any of them is the group's answer, and reading only
     the first row would miss the case where it is Claude Desktop's copy that
     is up. This is a HINT sent to the backend, not a safety decision — the
     snapshot can be missing or minutes old, so `cached_probe` confirms
     against the live process table before it starts anything. */
  const isRunning = (group: SpecGroup) => group.regs.some((reg) => !!reg.running);

  /* Ask about ONE launch at a time, and never one that has been asked already.

     One at a time is not politeness. A server whose hosts pin two different
     versions has two launches here, and firing both in the same tick starts
     two third-party processes simultaneously — for a port-bound or singleton
     server, the second takes the port or the token from the first, and the
     loser's EADDRINUSE is then written as that launch's answer for seven days.
     Verify could only ever start one at a time; asking on open must not be
     worse than the button it replaced. `verifying` covers the user's own
     clicks too, so a manual probe pauses the automatic ones rather than racing
     them.

     Keyed `${key}:${running}` rather than by key alone, so that a launch which
     was declined while running is asked again once it stops, and not before. A
     launch that already has an answer is never asked again either way. */
  const asked = useRef<Set<string>>(new Set());
  const unanswered = specGroups
    .filter((group) => !group.result)
    .map((group) => `${group.regs[0].key}:${isRunning(group)}`);
  // The dependency is the serialised request list, not the array: `specGroups`
  // is rebuilt every render and would re-run this on every keystroke
  // elsewhere in the tree. The ref makes a re-run harmless regardless, which
  // matters under StrictMode's double-invoked effects.
  const requests = unanswered.join("|");
  // A boolean, not a count — `no-frontend-counting` permits `names.length > 0`
  // and forbids assigning the length itself.
  const somethingInFlight = verifying.length > 0;
  useEffect(() => {
    if (!onAutoProbe || nothingToAsk || somethingInFlight) return;
    const next = (requests ? requests.split("|") : []).find(
      (request) => !asked.current.has(request)
    );
    if (!next) return;
    asked.current.add(next);
    const separator = next.lastIndexOf(":");
    onAutoProbe(next.slice(0, separator), next.slice(separator + 1) === "true");
  }, [requests, nothingToAsk, onAutoProbe, somethingInFlight]);

  return (
    <div className="flex-1 min-h-0 flex flex-col font-sans text-base text-ink-1">
      {/* No header of its own. The Flyout's chrome carries both the server
          name and the transport chip; this panel rendering either one again
          produced a visible duplicate. Twice now — the <h2> first, then the
          chip — so the rule is worth stating: the chrome owns identity, this
          component owns content. */}

      <UnderlineTabs
        tabs={[
          {
            id: "tools",
            label: "Tools",
            // Honest in the same single-spec case the section head's own
            // count slot below is honest in, and for the same reason --
            // more than one launch spec can mean more than one tool
            // surface, so a count here would claim to speak for a server
            // that has no one figure. The backend's own count, never
            // `.tools.length`: a probe's tool list can outrun what the
            // store paid to keep (`cost.toolCount` already reconciles that).
            count: soloResult?.kind === "answered" ? soloResult.cost?.toolCount : undefined,
          },
          { id: "details", label: "Details" },
        ]}
        active={tab}
        onChange={(id) => setTab(id === "details" ? "details" : "tools")}
        ariaLabel="Inspector view"
      />

      {/* One scroll region for the whole panel, as in AssetDetail. The tools
          list used to cap itself at 240px, which meant two nested scrollbars
          and a list you could only read a sixth of at a time. */}
      <div className="flex-1 min-h-0 overflow-y-auto scroll-gutter-stable scroll-thin">
      {tab === "tools" ? (
        <div role="tabpanel" id="panel-tools" aria-labelledby="tab-tools">
        {/* What a request actually carries, ahead of the list that produced
            it. Only knowable once a probe has answered -- `cost` travels
            with the same handshake result the tool list itself came from,
            so nothing here can exist before that. The union's `failed` arm
            has no `cost` at all, so `kind === "answered"` is the whole
            check; `.cost` on top of that is still needed because it stays
            optional even on an answered probe. Before the narrowing, a
            failed probe still built a `cost` object (zeroed, over an empty
            tool list -- the backend did not special-case it), which is why
            a bare `.cost` truthy check would have drawn "0 of 0 tools carry
            one" for a server that never answered. */}
        {soloResult?.kind === "answered" && soloResult.cost && (
          <section className={SECTION}>
            {/* items-center, not items-baseline: the trigger is a glyph, and
                a glyph has no baseline to share with the eyebrow beside it. */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <h3 className={HEADING}>Context per request</h3>
              <ContextNote />
            </div>
            <ContextPerRequest cost={soloResult.cost} />
          </section>
        )}
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
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
            {/* `nothingToAsk`, not `!isConnector`: an empty-command declaration
                with no http endpoint has no program to start and no target to
                dial either, and the auto-probe already refuses it. Offering
                Verify anyway invited a click that could only ever produce
                "Could not start ``" and cache that failure. Same test on both
                surfaces, so they cannot disagree about whether the question is
                askable. */}
            {!nothingToAsk && specGroups.length === 1 ? (
              soloResult ? (
                <span className="inline-flex items-center gap-2">
                  <span className={COUNT}>
                    {soloResult.kind === "failed"
                      ? "—"
                      : soloResult.cost?.toolCount ?? soloResult.tools.length}
                  </span>
                  <CheckAgainButton
                    registrationKey={specGroups[0].regs[0].key}
                    verifying={verifying.includes(specGroups[0].regs[0].key)}
                    onVerify={onVerify}
                  />
                </span>
              ) : verifying.includes(specGroups[0].regs[0].key) ? (
                // Nothing. The panel asks on open now, so a control here would
                // read Verify, then Verifying…, then be replaced by a count,
                // three states inside a fast server's 200ms. The block below
                // says a probe is running, and only once it has run long
                // enough to be worth saying.
                null
              ) : (
                <VerifyButton
                  registrationKey={specGroups[0].regs[0].key}
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
            ) : verifying.includes(specGroups[0].regs[0].key) ? (
              <ProbePending />
            ) : (
              <div className="border border-dashed border-line-2 rounded-inner px-[14px] py-[18px] flex flex-col gap-2 items-start">
                <p className="text-micro text-ink-3 leading-[1.45]">
                  {declined.includes(specGroups[0].regs[0].key)
                    ? DECLINED_RUNNING
                    : isRemote
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
                <div key={group.key} data-testid="tools-block" className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    {/* The spec this block's tools came from -- the rule this
                        redesign exists to hold: a tool count never appears
                        without the launch that produced it. `key`, not
                        `launchDisplay`: a direct remote registration has no
                        launch, and an empty label beside a count is the same
                        unattributed number under a different name. */}
                    <span className="text-micro font-mono text-ink-3 truncate">
                      {group.key}
                    </span>
                    {group.result && (
                      <span className="inline-flex items-center gap-2">
                        <span className={COUNT}>
                          {group.result.kind === "failed"
                            ? "—"
                            : group.result.cost?.toolCount ?? group.result.tools.length}
                        </span>
                        <CheckAgainButton
                          registrationKey={group.regs[0].key}
                          verifying={verifying.includes(group.regs[0].key)}
                          onVerify={onVerify}
                        />
                        {/* This block has no heading of its own, so the note
                            hangs from the nearest row that owns its figures --
                            beside the count it explains. Gated on exactly what
                            gates the ledger below, or a failed probe would
                            offer an explanation of numbers it never drew. */}
                        {group.result.kind === "answered" && group.result.cost && <ContextNote />}
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
                  {/* Same `kind` check as the single-spec ledger above: the
                      union's `failed` arm has no `cost` at all, so this can
                      no longer read a zeroed one for a probe that never
                      answered. `group.result` is set regardless of outcome
                      (first member wins until a success arrives). */}
                  {group.result?.kind === "answered" && group.result.cost && (
                    <ContextPerRequest cost={group.result.cost} />
                  )}
                  {group.result ? (
                    <ProbedToolList result={group.result} />
                  ) : verifying.includes(group.regs[0].key) ? (
                    <ProbePending />
                  ) : (
                    <>
                      {/* Same explanation as the single-spec block above, per
                          launch: one spec of a server can be running while
                          another sits idle. */}
                      {declined.includes(group.regs[0].key) && (
                        <p className="text-micro text-ink-3 leading-[1.45]">{DECLINED_RUNNING}</p>
                      )}
                      <VerifyButton
                        registrationKey={group.regs[0].key}
                        onVerify={onVerify}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
        </div>
      ) : (
        <div role="tabpanel" id="panel-details" aria-labelledby="tab-details">
        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className={HEADING}>Identity & capabilities</h3>
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
            <ListCard>
              {anyVerified.serverVersion && (
                <ListCardRow
                  data-testid="identity-row-server"
                  icon={<TagIcon size={14} aria-hidden="true" />}
                  label="Server"
                  value={anyVerified.serverVersion}
                />
              )}
              {anyVerified.protocolVersion && (
                <ListCardRow
                  data-testid="identity-row-protocol"
                  icon={<SignalIcon size={14} aria-hidden="true" />}
                  label="Protocol"
                  value={`MCP ${anyVerified.protocolVersion}`}
                />
              )}
              <ListCardRow
                data-testid="identity-row-transport"
                icon={<ArrowPathRoundedSquareIcon size={14} aria-hidden="true" />}
                label="Transport"
                value={server.transport}
              />
              <ListCardRow
                data-testid="identity-row-tools"
                icon={<WrenchScrewdriverIcon size={14} aria-hidden="true" />}
                label="Tools"
                wide={anyVerified.capabilities.includes("tools") ? "offered" : "not offered"}
              />
              <ListCardRow
                data-testid="identity-row-resources"
                icon={<ArchiveBoxIcon size={14} aria-hidden="true" />}
                label="Resources"
                wide={anyVerified.capabilities.includes("resources") ? "offered" : "not offered"}
              />
              <ListCardRow
                data-testid="identity-row-prompts"
                icon={<ChatBubbleOvalLeftIcon size={14} aria-hidden="true" />}
                label="Prompts"
                wide={anyVerified.capabilities.includes("prompts") ? "offered" : "not offered"}
              />
            </ListCard>
          ) : (
            <p className="text-micro text-ink-3 leading-[1.5]">
              Version, protocol revision and capabilities are only knowable by handshake. Nothing on
              disk records them.
            </p>
          )}
        </section>

        {/* The verdict, stated once: how many declarations, whether they
            agree, and the two actions that follow from either answer. Only
            worth a card once there is more than one registration to compare
            -- a lone declaration has nothing to agree or disagree with
            itself. */}
        {regCount >= 2 && (
          <section className={SECTION}>
            <ListCard>
              <div
                className="flex flex-col gap-[3px] px-3 py-[9px] text-small"
                data-testid="verdict-card"
              >
                <span className="flex items-center gap-2">
                  <i
                    aria-hidden="true"
                    className={`w-2 h-2 rounded-pill shrink-0 not-italic ${
                      verdictWarns ? "bg-state-warning" : "bg-state-success"
                    }`}
                  />
                  <span className="font-medium">{headline}</span>
                </span>
                {detail && (
                  <span className="text-micro text-ink-3 leading-[1.5]">{detail}</span>
                )}
              </div>
            </ListCard>
            <div className={`${miniSetClass} mt-2`}>
              {diverges && (
                <button
                  type="button"
                  className={miniBtnClass}
                  onClick={() => launchDiffRef.current?.scrollIntoView?.({ block: "nearest" })}
                >
                  <ArrowsRightLeftIcon size={13} aria-hidden="true" />
                  Compare
                </button>
              )}
              <button
                type="button"
                className={miniBtnClass}
                onClick={() => openPath(server.registrations[0].configPath).catch(() => {})}
              >
                <DocumentTextIcon size={13} aria-hidden="true" />
                Open config
              </button>
            </div>
          </section>
        )}

        <section className={SECTION}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h3 className={HEADING}>Registered in</h3>
            <span className={COUNT}>
              {`${regCount} ${regCount === 1 ? "registration" : "registrations"}`}
            </span>
          </div>
          <ListCard>
            {server.registrations.map((reg, i) => (
              <div
                key={`${reg.configPath}-${i}`}
                className="flex flex-col gap-[3px] px-3 py-[9px] text-small"
                data-testid="registration-row"
              >
                <span className="flex items-center gap-2 min-w-0">
                  {/* reg.host is the display name (hostLabel); the map resolves names too. */}
                  <EngineLabel engineKey={reg.host} className="text-small font-medium">
                    {reg.host}
                  </EngineLabel>
                  <span className="ml-auto font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3">
                    {reg.tier}
                  </span>
                </span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-micro font-mono text-ink-3 truncate flex-1">
                    {reg.configPath}
                  </span>
                  {/* Naming a file without letting you reach it is the same dead
                      end the connector state had. */}
                  <Tooltip label="Reveal in Finder" placement="bottom">
                    <button
                      type="button"
                      aria-label={`Reveal ${reg.configPath}`}
                      onClick={() => revealItemInDir(reg.configPath).catch(() => {})}
                      className="shrink-0 p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
                    >
                      <RevealInFileManagerIcon size={13} aria-hidden="true" />
                    </button>
                  </Tooltip>
                </div>
                {/* What it launches -- only when hosts disagree about it. An
                    agreeing launch is already implied by every sibling row
                    saying nothing, and restating it three times over was the
                    noise this task removes; said once (2026-08-22), it comes
                    back the moment there is something to compare it against. */}
                {diverges && launchOf(reg) && (
                  <span className="text-micro font-mono truncate text-state-warning">
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
          </ListCard>
          {endpointsDiverge && (
            <p className="text-micro text-state-warning leading-[1.45] mt-2">
              These hosts reach {server.name} at different endpoints. Whichever you are using
              decides which server answers.
            </p>
          )}
          {launchesDiverge && (
            <>
              <p className="text-micro text-state-warning leading-[1.45] mt-2">
                These hosts launch {server.name} differently. Whichever you are using decides
                which version you get.
              </p>
              {/* The prose above says THAT the launches differ; this says
                  WHERE. Kept beneath rather than replacing it -- the sentence
                  still answers "should I care" at a glance, and the aligned
                  lines answer "which part" for anyone who reads on. Diffed
                  against the FIRST diverging spec only, the same "first wins"
                  attribution the Identity section above already uses -- not
                  an N-way alignment matrix. For the common two-host case this
                  is the whole picture; for three or more, every comparison
                  shares one baseline rather than comparing every pair. */}
              <div ref={launchDiffRef} data-testid="launch-diff" className="flex flex-col gap-2 mt-2">
                {divergingGroups.slice(1).map((group) => {
                  const diff = diffLaunch(divergingGroups[0].launchDisplay, group.launchDisplay);
                  const label = (g: SpecGroup) => g.regs.map((r) => `${r.host} · ${r.tier}`).join(", ");
                  return (
                    <div
                      key={group.launchDisplay}
                      className="border border-line rounded-inner px-[11px] py-[9px] flex flex-col gap-1.5"
                    >
                      <LaunchDiffLine label={label(divergingGroups[0])} tokens={diff.a} />
                      <LaunchDiffLine label={label(group)} tokens={diff.b} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {showsBridgeNote && (
            <p data-testid="bridge-note" className="text-micro text-ink-3 leading-[1.45] mt-2">
              One of these registrations reaches {server.name} through mcp-remote, a local bridge
              process, not a separate MCP server. It forwards to whatever endpoint it is configured
              with. Whether that matches another registration here is what the server list&rsquo;s
              agreement reading settles, not this panel.
            </p>
          )}
        </section>

        {server.envKeys.length > 0 && (
          <section className={SECTION}>
            <div className="flex items-baseline justify-between gap-2 mb-2">
              <h3 className={HEADING}>Environment</h3>
              <span className={COUNT}>{server.envKeys.length}</span>
            </div>
            <ListCard>
              {server.envKeys.map((key) => (
                <ListCardRow
                  key={key}
                  icon={<KeyIcon size={14} aria-hidden="true" />}
                  label={<span className="font-mono">{key}</span>}
                />
              ))}
            </ListCard>
            <p className="text-micro text-ink-3 leading-[1.5] mt-2">
              Names only. Hanger never reads a variable&rsquo;s value.
            </p>
          </section>
        )}
        </div>
      )}
      </div>
    </div>
  );
}
