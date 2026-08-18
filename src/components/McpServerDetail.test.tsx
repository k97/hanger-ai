// @vitest-environment happy-dom
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import McpServerDetail, { McpServerView } from "./McpServerDetail";

const openUrl = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: (u: string) => openUrl(u) }));

const base: McpServerView = {
  name: "spades-audio",
  command: "node",
  transport: "stdio",
  registrations: [
    { key: "cc-user", host: "Claude Code", tier: "user", configPath: "~/.claude.json", command: "node", launchDisplay: "node" },
    { key: "cc-global", host: "Claude Code", tier: "global", configPath: "~/.claude/mcp.json", command: "node", launchDisplay: "node" },
    {
      key: "cd-global",
      host: "Claude Desktop",
      tier: "global",
      configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
      command: "node",
      launchDisplay: "node",
    },
  ],
  envKeys: [],
};

// This repo configures no global cleanup, so rendered DOM accumulates
// within a file and role queries match across tests.
afterEach(cleanup);

describe("McpServerDetail", () => {
  it("lists every registration, including two from the same host", () => {
    render(<McpServerDetail server={base} />);
    // Two Claude Code registrations is a real condition, not duplication to
    // collapse -- it is what the config_path dedup bug was hiding.
    expect(screen.getAllByText("Claude Code")).toHaveLength(2);
    const desktopHost = screen.getByText("Claude Desktop");
    expect(desktopHost).toBeTruthy();
    // Paired with the host label above: its mark must resolve to Claude
    // Desktop specifically, not the generic mark or a different host.
    expect(desktopHost.parentElement?.querySelector("svg")?.getAttribute("data-brand")).toBe("claude_desktop");
    expect(screen.getByText("~/.claude/mcp.json")).toBeTruthy();
    // Scoped to "Registered in": the Tools section below deliberately echoes
    // the same "N registrations" wording in its own count slot -- ruled
    // 2026-08-16 to stay exactly this way, since it is never a tool count --
    // so the phrase now appears twice on screen. Both are correct; this test
    // is about the registration list specifically.
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    expect(within(registeredSection).getByText("3 registrations")).toBeTruthy();
  });

  it("renders tools with their descriptions once verified", () => {
    render(
      <McpServerDetail
        server={base}
        verified={{
          "cc-user": {
            serverVersion: "1.0.0",
            protocolVersion: "2025-06-18",
            capabilities: ["tools"],
            tools: [
              {
                name: "get_system_volume",
                description: "Get the current macOS system volume level (0–100) and mute state.",
              },
            ],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    expect(screen.getByText("get_system_volume")).toBeTruthy();
    expect(screen.getByText(/current macOS system volume/)).toBeTruthy();
    expect(screen.getByText("2025-06-18")).toBeTruthy();
    expect(screen.getByText("1.0.0")).toBeTruthy();
    // base has three registrations but only "cc-user" was probed -- its list
    // renders unlabelled. A "Claude Code · user" prefix here would disagree
    // with the "leaves a single probed registration... unlabelled" test.
    expect(screen.queryByText("Claude Code · user")).toBeNull();
  });

  it("offers Verify and explains why tools are unknown when never verified", () => {
    // Scoped to one registration: base's three all agree and are all
    // unverified, so each registration's own row would render its own Verify
    // button -- a real and correct outcome of one control per registration,
    // but not what this test is about. One registration keeps the query
    // singular so the assertions below stay exactly what they were.
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} />);
    expect(screen.getByRole("button", { name: /verify/i })).toBeTruthy();
    // One short line is enough to explain an empty section. The three-line
    // version explained the design decision behind the button — read once,
    // then noise on every remaining server.
    expect(screen.getByText(/only known by asking the server/i)).toBeTruthy();
    // Ruled 2026-08-16: the control moved to the "Registered in" row, and the
    // Tools section's empty state must not grow a second one -- that was the
    // original duplication this design replaced.
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    const toolsSection = screen.getByText("Tools").closest("section")!;
    expect(within(registeredSection).getByRole("button", { name: /verify/i })).toBeTruthy();
    expect(within(toolsSection).queryByRole("button", { name: /verify/i })).toBeNull();
  });

  it("never renders an environment variable value", () => {
    render(<McpServerDetail server={{ ...base, envKeys: ["API_KEY", "NODE_OPTIONS"] }} />);
    expect(screen.getByText("API_KEY")).toBeTruthy();
    expect(screen.getByText("NODE_OPTIONS")).toBeTruthy();
    expect(screen.queryByText(/sk-/)).toBeNull();
  });

  it("reports a failed verification instead of an empty tool list", () => {
    render(
      <McpServerDetail
        server={base}
        verified={{
          "cc-user": {
            capabilities: [],
            tools: [],
            verifiedAt: 1_700_000_000_000,
            error: "Timed out after 20s waiting for the server to respond",
          },
        }}
      />
    );
    expect(screen.getByText(/Timed out after 20s/)).toBeTruthy();
  });

  it("flags a server speaking an older protocol revision", () => {
    render(
      <McpServerDetail
        server={{ ...base, name: "tauri" }}
        verified={{
          "cc-user": {
            serverVersion: "0.12.0",
            protocolVersion: "2024-11-05",
            capabilities: ["prompts", "tools"],
            tools: [{ name: "manage_window" }],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    expect(screen.getByText("2024-11-05")).toBeTruthy();
    expect(screen.getByText("prompts, tools")).toBeTruthy();
});

  it("names whose result the Identity section is showing when more than one registration answered", () => {
    // The Identity slot picks whichever registration answered first -- the
    // same class of ambiguity this task exists to close, just moved from the
    // tool list to server version/protocol/capabilities. Two registrations
    // can answer differently even when their launch is identical (a floating
    // @latest resolving differently at different times), so the divergence
    // banner -- which fires on launchDisplay -- would say nothing. This test
    // asserts attribution only: the slot must name ONE of the two
    // registrations it could be. It must not assert WHICH one -- array order
    // is an implementation detail, and stage 2 (which reconciles disagreeing
    // handshakes) is free to reorder or change the pick.
    const diverged: McpServerView = {
      ...base,
      registrations: [
        { key: "a", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx tauri-mcp@latest" },
        { key: "b", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx tauri-mcp@latest" },
      ],
    };
    render(
      <McpServerDetail
        server={diverged}
        verified={{
          a: { protocolVersion: "2025-06-18", capabilities: [], tools: [], verifiedAt: 1_700_000_000_000 },
          b: { protocolVersion: "2024-11-05", capabilities: [], tools: [], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    const identitySection = screen.getByText("Identity").closest("section")!;
    const slot = within(identitySection).getByText(/^verified /);
    expect(slot.textContent).toMatch(/^verified .+ · (Codex|Gemini) · global$/);
  });

  it("hands the registration key to Verify", () => {
    // Superseded by Task 4: this used to assert the panel passed the real
    // command and its arguments to Verify, back when the frontend resolved
    // the launch itself. Probing now happens backend-side from a
    // registration key (`Tool.args` no longer even crosses IPC -- see
    // ipc_boundary_tests.rs), so the thing worth asserting here is that the
    // click hands Verify the key it needs to find that registration again.
    // Scoped to one registration -- see the "never verified" test above for
    // why base's three agreeing, unverified registrations cannot share a
    // singular button query.
    const onVerify = vi.fn();
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} onVerify={onVerify} />);
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(onVerify).toHaveBeenCalledTimes(1);
    expect(onVerify).toHaveBeenCalledWith(base.registrations[0].key);
    expect(base.command).toBe("node");
  });

  it("disables the button while a probe is in flight", () => {
    render(<McpServerDetail server={base} verifying="cc-user" />);
    expect(screen.getByRole("button", { name: /verifying/i })).toHaveProperty("disabled", true);
  });

  it("renders neither the server name nor the transport — the chrome owns those", () => {
    // Twice this panel duplicated something the Flyout header already shows:
    // first an <h2> with the server name, then the transport chip. Both were
    // visible defects. The boundary: chrome owns identity, this owns content.
    render(<McpServerDetail server={base} />);
    expect(screen.queryByText("stdio")).toBeNull();
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("offers Verify for a remote server and says it sends no credentials", () => {
    // Superseded within the hour. This first asserted remote servers get no
    // Verify button, true only while the probe was stdio-only. A remote server
    // is dialled rather than spawned, so it IS verifiable -- and the copy must
    // be honest that a protected endpoint will refuse.
    // Scoped to one registration -- see the "never verified" test above.
    render(<McpServerDetail server={{ ...base, command: "",
      transport: "https://mei-recipes-api.example.workers.dev/mcp",
      registrations: [base.registrations[0]] }} />);
    expect(screen.getByRole("button", { name: /verify/i })).toBeTruthy();
    expect(screen.getByText(/no credentials are sent/i)).toBeTruthy();
  });

  it("sends a claude.ai connector where it is actually managed", () => {
    // No file to open and nothing to verify — but "nothing local to inspect"
    // left the reader at a dead end when the destination is knowable.
    // Scoped to one registration -- see the "never verified" test above.
    render(<McpServerDetail server={{ ...base, name: "Notion", command: "",
      transport: "claude.ai", registrations: [base.registrations[0]] }} />);
    expect(screen.queryByRole("button", { name: /verify/i })).toBeNull();
    expect(screen.getByText(/runs on anthropic/i)).toBeTruthy();

    const link = screen.getByRole("button", { name: /open claude\.ai connectors/i });
    link.click();
    expect(openUrl).toHaveBeenCalledWith("https://claude.ai/settings/connectors");
  });

  it("shows what each registration actually runs", () => {
    // The panel's stated job is making cross-host differences visible, and the
    // row rendered host/tier/path with no command at all — so the one thing it
    // existed to show was invisible. It also answers "what does this launch?",
    // which is the question behind every failed Verify.
    render(<McpServerDetail server={base} />);
    expect(screen.getAllByText(/node/).length).toBeGreaterThan(0);
  });

  it("says nothing about divergence when the registrations agree", () => {
    render(<McpServerDetail server={base} />);
    expect(screen.queryByText(/differ/i)).toBeNull();
  });

  it("flags when the same server is launched differently by different hosts", () => {
    const diverged = {
      ...base,
      registrations: [
        { key: "codex-1", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx @hypothesi/tauri-mcp-server" },
        { key: "gemini-1", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx tauri-mcp@0.9" },
      ],
    };
    render(<McpServerDetail server={diverged} />);
    expect(screen.getByText(/differ/i)).toBeTruthy();
  });

  it("lets you open the config file a registration came from", () => {
    render(<McpServerDetail server={base} />);
    const openers = screen.getAllByRole("button", { name: /reveal|open config/i });
    expect(openers.length).toBe(base.registrations.length);
  });

  it("shows which host is running a registration, with its pid", () => {
    render(
      <McpServerDetail
        server={{
          ...base,
          registrations: [
            { ...base.registrations[0], running: { pid: 8269, spawningHost: "Claude Code" } },
            base.registrations[1],
            base.registrations[2],
          ],
        }}
      />
    );
    expect(screen.getByText(/8269/)).toBeTruthy();
    // "Claude Code" is also a host label on two rows, so assert on the
    // running line specifically rather than on the name alone.
    expect(screen.getByText(/running · pid 8269 · Claude Code/)).toBeTruthy();
  });

  it("says nothing about running state when nothing is running", () => {
    // An absent process is not evidence of a broken server — most are started
    // on demand. A "not running" badge on every row would read as an error.
    render(<McpServerDetail server={base} />);
    expect(screen.queryByText(/not running/i)).toBeNull();
    expect(screen.queryByText(/running · pid/)).toBeNull();
  });

  it("renders the backend's redacted launch and never joins arguments itself", () => {
    // The panel used to build `[command, ...args].join(" ")`, which printed a
    // --header bearer token. It now renders a string the backend already
    // redacted, so there is nothing here that could leak.
    render(
      <McpServerDetail
        server={{
          ...base,
          registrations: [
            {
              key: "cc-remote",
              host: "Claude Code",
              tier: "user",
              configPath: "~/.claude.json",
              command: "npx",
              launchDisplay: "npx mcp-remote https://example.com/sse --header Authorization: <redacted>",
            },
          ],
        }}
      />
    );
    // Scoped to "Registered in": kept from when the Tools section briefly
    // also rendered each registration's launch as its block label (that
    // design was ruled out 2026-08-16 for exactly this kind of collision;
    // Tools blocks are now labelled by host + tier, never by launch). The
    // absence check stays unscoped -- it is a document-wide guarantee that
    // "Bearer" never leaks, and narrowing it would weaken exactly what it
    // exists to catch.
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    expect(within(registeredSection).getByText(/Authorization: <redacted>/)).toBeTruthy();
    expect(screen.queryByText(/Bearer/)).toBeNull();
  });

  it("labels each probed registration's tools and never shows a server-wide count", () => {
    // The defect this closes: one probe of an arbitrary registration was
    // rendered in the section-count slot — the same slot that reads
    // "3 registrations" above it — so it read as a property of the server. On a
    // conflicting server that is a fabricated fact, stated on exactly the rows
    // that exist to warn the user.
    //
    // RULING 2026-08-16 changed the label, not just the query: labelling a
    // Tools block with the launch (as originally specced) collided with the
    // "Registered in" row Task 3 added for the same launch, and with two other
    // pre-existing tests when the label fell back to other registration
    // fields. There is no field a Tools block can repeat that "Registered in"
    // doesn't already show. The fix relocates identity-showing entirely: a
    // block with two or more probed registrations is labelled by host + tier
    // instead, which "Registered in" never renders as one combined string.
    const diverged: McpServerView = {
      ...base,
      registrations: [
        { key: "a", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx tauri-mcp@2.9.1" },
        { key: "b", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx tauri-mcp@latest" },
      ],
    };
    render(
      <McpServerDetail
        server={diverged}
        verified={{
          a: { capabilities: ["tools"], tools: [{ name: "pinned_only" }], verifiedAt: 1_700_000_000_000 },
          b: { capabilities: ["tools"], tools: [{ name: "floating_only" }, { name: "extra" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(screen.getByText("pinned_only")).toBeTruthy();
    expect(screen.getByText("floating_only")).toBeTruthy();
    // Each block names the registration it came from -- host + tier -- so "1"
    // and "2" are never presented as the server's tool count.
    expect(screen.getByText("Codex · global")).toBeTruthy();
    expect(screen.getByText("Gemini · global")).toBeTruthy();
  });

  it("leaves a single probed registration's tool list unlabelled — the row above already shows only one of N was probed", () => {
    const diverged: McpServerView = {
      ...base,
      registrations: [
        { key: "a", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx tauri-mcp@2.9.1" },
        { key: "b", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx tauri-mcp@latest" },
      ],
    };
    render(
      <McpServerDetail
        server={diverged}
        verified={{
          a: { capabilities: ["tools"], tools: [{ name: "solo_tool" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(screen.getByText("solo_tool")).toBeTruthy();
    // Nothing in the Tools section repeats "Codex" or pairs it with "global"
    // as a label -- disambiguation isn't needed when only one came back.
    expect(screen.queryByText("Codex · global")).toBeNull();
  });

  it("asks to verify one registration, not the server", () => {
    const onVerify = vi.fn();
    render(
      <McpServerDetail
        server={{ ...base, registrations: [{ ...base.registrations[0], key: "k1" }] }}
        onVerify={onVerify}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /verify/i }));
    expect(onVerify).toHaveBeenCalledWith("k1");
  });

  it("shows one unlabelled Tools block when every registration agrees", () => {
    // Stage 1 rendered one block per probed registration -- honest but
    // repetitive: three registrations on one launch showed three identical
    // tool lists.
    //
    // Brief error: task-9-brief.md's fixture passes a `view` prop with
    // `verified` nested inside it and gives `tools` as bare strings. Neither
    // shape exists here -- Props takes sibling `server`/`verified`,
    // VerifiedIdentity.tools is `{ name, description? }[]`, and Registration
    // requires `configPath`/`command`. Adapted to the real API; the scenario
    // and every assertion below are unchanged from the brief.
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Claude Code", tier: "global", configPath: "~/.claude.json", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { key: "/b:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { key: "/c:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "/a:tauri": { capabilities: [], tools: [{ name: "get_docs" }, { name: "search_api" }], verifiedAt: 1_700_000_000_000 },
          "/b:tauri": { capabilities: [], tools: [{ name: "get_docs" }, { name: "search_api" }], verifiedAt: 1_700_000_000_000 },
          "/c:tauri": { capabilities: [], tools: [{ name: "get_docs" }, { name: "search_api" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(screen.getAllByTestId("tools-block")).toHaveLength(1);
    // Scoped to Tools: with all three probes succeeding, the Identity
    // section's own attribution slot legitimately prints
    // "verified … · Claude Code · global" (more than one registration
    // answered -- see "names whose result the Identity section is showing"
    // above). An unscoped query would find that text and fail this assertion
    // for a reason that has nothing to do with the Tools section.
    const toolsSection = screen.getByText("Tools").closest("section")!;
    expect(within(toolsSection).queryByText(/Claude Code · global/)).toBeNull();
    expect(screen.getAllByText("get_docs")).toHaveLength(1);
  });

  it("labels each block with its spec when the specs differ", () => {
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Claude Code", tier: "global", configPath: "~/.claude.json", command: "npx", launchDisplay: "npx -y @tauri/mcp@latest" },
        { key: "/b:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "/a:tauri": { capabilities: [], tools: [{ name: "get_docs" }, { name: "new_tool" }], verifiedAt: 1_700_000_000_000 },
          "/b:tauri": { capabilities: [], tools: [{ name: "get_docs" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(screen.getAllByTestId("tools-block")).toHaveLength(2);
    // Scoped to Tools: "Registered in" already prints each registration's own
    // launch verbatim (Task 3), so an unscoped query finds two matches for
    // the same substring -- one there, one in the block label -- and throws
    // rather than asserting anything.
    const toolsSection = screen.getByText("Tools").closest("section")!;
    // A tool count is never rendered without the launch it belongs to unless
    // that launch is the server's only one.
    expect(within(toolsSection).getByText(/@tauri\/mcp@latest/)).toBeTruthy();
    expect(within(toolsSection).getByText(/@tauri\/mcp@2\.9\.1/)).toBeTruthy();
  });

  it("prefers a succeeding probe over a failing one when a shared launch disagrees", () => {
    // Regression: the grouping loop used to keep whichever registration was
    // first in `probed` order, error or not. Two registrations sharing one
    // launch, first errored second succeeded, hid a real tool list behind an
    // unrelated failure -- something stage 1's per-registration rendering
    // never did, since each registration always showed its own result.
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Claude Code", tier: "global", configPath: "~/.claude.json", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { key: "/b:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "/a:tauri": { capabilities: [], tools: [], verifiedAt: 1_700_000_000_000, error: "Timed out after 20s waiting for the server to respond" },
          "/b:tauri": { capabilities: [], tools: [{ name: "get_docs" }, { name: "search_api" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(screen.getAllByTestId("tools-block")).toHaveLength(1);
    expect(screen.getByText("get_docs")).toBeTruthy();
    expect(screen.getByText("search_api")).toBeTruthy();
    expect(screen.queryByText(/Timed out after 20s/)).toBeNull();
  });

  it("falls back to the failure when every member of a shared-launch group failed", () => {
    // The other side of the same branch: nobody in the group succeeded, so
    // there is nothing to prefer -- the block must still show the failure
    // rather than rendering an empty list as if nothing had been probed.
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Claude Code", tier: "global", configPath: "~/.claude.json", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { key: "/b:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml", command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "/a:tauri": { capabilities: [], tools: [], verifiedAt: 1_700_000_000_000, error: "Timed out after 20s waiting for the server to respond" },
          "/b:tauri": { capabilities: [], tools: [], verifiedAt: 1_700_000_000_000, error: "Connection refused" },
        }}
      />
    );
    expect(screen.getAllByTestId("tools-block")).toHaveLength(1);
    expect(screen.getByText(/Timed out after 20s/)).toBeTruthy();
  });
});
