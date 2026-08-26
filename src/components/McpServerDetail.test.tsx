// @vitest-environment happy-dom
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { describe, it, expect, afterEach, vi } from "vitest";
import McpServerDetail, { McpServerView } from "./McpServerDetail";

const openUrl = vi.fn().mockResolvedValue(undefined);
vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (u: string) => openUrl(u),
  openPath: vi.fn(),
  revealItemInDir: vi.fn(),
}));

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

const openDetails = () => fireEvent.click(screen.getByRole("tab", { name: "Details" }));
/** The Tools section's eyebrow; the tab of the same name sits above it. */
const toolsHeading = () => screen.getByRole("heading", { name: "Tools" });

describe("McpServerDetail", () => {
  it("lists every registration, including two from the same host", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
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
    openDetails();
    expect(screen.getByText("MCP 2025-06-18")).toBeTruthy();
    expect(screen.getByText("1.0.0")).toBeTruthy();
    // base has three registrations but only "cc-user" was probed -- its list
    // renders unlabelled. A "Claude Code · user" prefix here would disagree
    // with the "leaves a single probed registration... unlabelled" test.
    expect(screen.queryByText("Claude Code · user")).toBeNull();
  });

  it("offers a way to check a probed spec again, and hands it a key from that group", () => {
    // Probing is session-only today (useState in the panel that owns
    // `verified`), so a result never actually goes stale without the app
    // restarting first -- but stage 3 persists probe results, and this
    // control needs to exist before that cache does, not arrive stranded
    // once it does.
    const onVerify = vi.fn();
    render(
      <McpServerDetail
        server={{ ...base, registrations: [base.registrations[0]] }}
        onVerify={onVerify}
        verified={{
          "cc-user": { capabilities: [], tools: [{ name: "get_system_volume" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    const button = screen.getByRole("button", { name: "Check again" });
    // Resting is half of what `active` means -- no motion class at all
    // while nothing is in flight, not merely a stopped-looking spin.
    expect(button.querySelector("g.aim-loop")).toBeNull();
    fireEvent.click(button);
    expect(onVerify).toHaveBeenCalledWith("cc-user");
  });

  it("spins and disables the check-again control while a re-probe is in flight", () => {
    render(
      <McpServerDetail
        server={{ ...base, registrations: [base.registrations[0]] }}
        verifying={["cc-user"]}
        verified={{
          "cc-user": { capabilities: [], tools: [{ name: "get_system_volume" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    const button = screen.getByRole("button", { name: "Check again" });
    expect(button).toHaveProperty("disabled", true);
    // Pins ServerRelayIcon by its distinctive geometry -- the rack rect --
    // and its out-of-phase structure, not merely "a loop class is present".
    expect(button.querySelectorAll("g.aim-relay.aim-loop")).toHaveLength(2);
    expect(button.querySelector('rect[x="2"][y="2"]')).toBeTruthy();
    expect(
      (button.querySelectorAll("g.aim-relay.aim-loop")[1] as HTMLElement).style.animationDelay
    ).toBe("-0.6s");
    // The icon-only control's accessible name is constant -- the spin is
    // the only signal that a check is running, so a class assertion is the
    // only way to pin it. Repointed for task 10: ServerRelayIcon carries its
    // motion on an inner <g class="aim-loop">, not on the svg's own class
    // attribute, so the svg-level `animate-spin` check this used to be has
    // nothing left to match.
    expect(button.querySelector("g.aim-loop")).toBeTruthy();
  });

  it("puts Verify in the section header when the server has one unprobed launch spec", () => {
    // Karthik's call, 2026-08-18: one launch means the header slot is
    // unambiguous, so the affordance belongs where the eye already is
    // rather than below an otherwise-empty block.
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} />);
    const toolsHeader = toolsHeading().parentElement!;
    expect(within(toolsHeader).getByRole("button", { name: /^verify$/i })).toBeTruthy();
    // Nothing has been probed, so there is nothing to count -- the
    // registration-count fallback stays off this slot too.
    expect(within(toolsHeader).queryByText(/registration/i)).toBeNull();
  });

  it("puts the tool count and Check again in the section header when the one spec is probed", () => {
    render(
      <McpServerDetail
        server={{ ...base, registrations: [base.registrations[0]] }}
        verified={{
          "cc-user": {
            capabilities: [],
            tools: [{ name: "get_system_volume" }, { name: "set_system_volume" }],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    const toolsHeader = toolsHeading().parentElement!;
    expect(within(toolsHeader).getByText("2")).toBeTruthy();
    expect(within(toolsHeader).getByRole("button", { name: "Check again" })).toBeTruthy();
    expect(within(toolsHeader).queryByText(/registration/i)).toBeNull();
  });

  it("keeps the header's registration count, never a tool count, when the server has more than one launch spec", () => {
    // The regression this pins: §5.7's rule (a tool count never appears
    // without the launch that produced it) still binds on this slot once
    // there is more than one spec to disagree. A later change that hoists
    // a single group's count up here unconditionally must fail this.
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@latest" },
        { key: "/b:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "/a:tauri": { capabilities: [], tools: [{ name: "get_docs" }], verifiedAt: 1_700_000_000_000 },
          "/b:tauri": { capabilities: [], tools: [{ name: "search_api" }, { name: "extra" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    const toolsHeader = toolsHeading().parentElement!;
    expect(within(toolsHeader).getByText("2 registrations")).toBeTruthy();
    // No button of any kind in the header for this case -- Verify and
    // Check-again live beside each spec's own launch label instead.
    expect(within(toolsHeader).queryByRole("button")).toBeNull();
    // Each group still carries its own count, beside its own launch --
    // unaffected by where the header falls back to.
    const toolsSection = toolsHeading().closest("section")!;
    expect(within(toolsSection).getByText(/@tauri\/mcp@latest/)).toBeTruthy();
    expect(within(toolsSection).getByText(/@tauri\/mcp@2\.9\.1/)).toBeTruthy();
  });

  it("offers Verify inside Tools, and explains why tools are unknown, when never verified", () => {
    // Scoped to one registration: base's three all agree, so one spec group
    // covers all of them -- a real and correct outcome, but not what this
    // test is about. One registration keeps the query singular.
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} />);
    expect(screen.getByRole("button", { name: /verify/i })).toBeTruthy();
    // One short line is enough to explain an empty section.
    expect(screen.getByText(/only known by asking the server/i)).toBeTruthy();
    // Ruled 2026-08-18, superseding 2026-08-16: Verify moved INTO the Tools
    // section, where the tool list it produces is about to appear. The
    // "Registered in" row still reports a probed registration's own result,
    // but offers no action of its own now that Task 9's per-spec grouping
    // removed the labelling collision that forced the button there.
    const toolsSection = toolsHeading().closest("section")!;
    expect(within(toolsSection).getByRole("button", { name: /verify/i })).toBeTruthy();
    openDetails();
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    expect(within(registeredSection).queryByRole("button", { name: /verify/i })).toBeNull();
    // The old copy told the reader to act elsewhere. The button is right
    // here now, so that instruction is not just moved but gone.
    expect(screen.queryByText(/use Verify on a registration above/i)).toBeNull();
  });

  it("renders Verify as a word to click, not an identifier to read", () => {
    // "Verify" is a control label, not a path or a hash -- the mono face is
    // reserved for things read literally. A class assertion is the only way
    // to pin this: nothing about the rendered text or role distinguishes the
    // two font stacks.
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} />);
    const button = screen.getByRole("button", { name: /^verify$/i });
    expect(button.className).not.toMatch(/font-mono/);
  });

  it("never renders an environment variable value", () => {
    render(<McpServerDetail server={{ ...base, envKeys: ["API_KEY", "NODE_OPTIONS"] }} />);
    openDetails();
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
    openDetails();
    expect(screen.getByText("MCP 2024-11-05")).toBeTruthy();
    expect(screen.getByTestId("identity-row-prompts").textContent).toBe("Promptsoffered");
    expect(screen.getByTestId("identity-row-tools").textContent).toBe("Toolsoffered");
    expect(screen.getByTestId("identity-row-resources").textContent).toBe("Resourcesnot offered");
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
    openDetails();
    const identitySection = screen.getByRole("heading", { name: "Identity & capabilities" }).closest("section")!;
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

  it("offers no control at all while a first probe is in flight", () => {
    // Was "disables the button while a probe is in flight", asserting a
    // disabled Verify labelled "Verifying…". Task 6 makes the panel ask on
    // open, so that button would render Verify, then Verifying…, then vanish
    // behind a count — three states inside a fast server's 200ms. The block
    // below carries the pending state instead, on a 250ms delay. A probed
    // spec still keeps its Check again control, spinning and disabled; that
    // is the test directly above this one.
    render(<McpServerDetail server={base} verifying={["cc-user"]} />);
    expect(screen.queryByRole("button", { name: /verif/i })).toBeNull();
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

  it("offers no Verify when there is nothing to ask", () => {
    // m6. `nothingToAsk` already refuses to auto-probe a declaration with no
    // command and no http endpoint -- there is no program to start and no
    // target to dial -- but the header offered Verify anyway whenever the
    // server was not a Claude.ai connector. Clicking it produced "Could not
    // start ``", a failure the user was invited into, and cached that
    // failure under the transport-shared cache key. The backend's own
    // engine summary classifies this same shape "can't be asked at all";
    // two surfaces disagreeing about whether the question is askable is the
    // defect, and the auto-probe's answer is the right one.
    render(
      <McpServerDetail
        server={{
          ...base,
          command: "",
          transport: "sse",
          registrations: [{ ...base.registrations[0], command: "", launchDisplay: "", transport: "sse" }],
        }}
      />
    );
    expect(screen.queryByRole("button", { name: /verify/i })).toBeNull();
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
    openDetails();
    // said once (2026-08-22) — the launch returns to a row only when launches disagree
    expect(screen.getAllByText(/tauri-mcp/).length).toBeGreaterThan(0);
  });

  it("a registration row is host · tier, then its config path; agreeing launches are not restated", () => {
    render(<McpServerDetail server={{ ...base, envKeys: ["API_KEY"] }} />);
    openDetails();
    // One card, three stacked rows -- base's registrations all agree.
    const rows = screen.getAllByTestId("registration-row");
    expect(rows).toHaveLength(3);
    // Every base registration launches "node", but they agree, so the launch
    // line stays off the row entirely -- restating an agreed-upon launch is
    // exactly the noise this task removes.
    expect(rows[0].textContent).not.toMatch(/node/);
    // Environment is its own card now too: the key sits in a mono span,
    // nested inside the same bordered-card shape as Registered in.
    const envKey = screen.getByText("API_KEY");
    expect(envKey.className).toMatch(/font-mono/);
    expect(envKey.closest(".rounded-inner")).toBeTruthy();
  });

  it("states the verdict once: declared N times, twice by the same engine, and that the launches agree", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    const card = screen.getByTestId("verdict-card");
    expect(card.textContent).toContain("Declared 3 times, twice by the same engine");
    expect(card.textContent).toContain(
      "All 3 launches agree — the same command from Claude Code (.claude.json), Claude Code (mcp.json) and Claude Desktop."
    );
    expect(card.querySelector("i")?.className).toContain("bg-state-warning");
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open config" })).toBeTruthy();
  });
  it("offers Compare only when the launches disagree, and no card for a lone registration", () => {
    const diverged = { ...base, registrations: [
      { key: "a", host: "Codex", tier: "global", configPath: "~/.codex/config.toml", command: "npx", launchDisplay: "npx tauri-mcp@2.9.1" },
      { key: "b", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json", command: "npx", launchDisplay: "npx tauri-mcp@latest" },
    ] };
    render(<McpServerDetail server={diverged} />);
    openDetails();
    expect(screen.getByTestId("verdict-card").textContent).toContain("Declared 2 times");
    expect(screen.getByTestId("verdict-card").textContent).not.toContain("same engine");
    expect(screen.getByRole("button", { name: "Compare" })).toBeTruthy();
    cleanup();
    render(<McpServerDetail server={{ ...base, registrations: [base.registrations[0]] }} />);
    openDetails();
    expect(screen.queryByTestId("verdict-card")).toBeNull();
  });

  it("says nothing about divergence when the registrations agree", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
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
    openDetails();
    expect(screen.getByText(/differ/i)).toBeTruthy();
  });

  it("identifies mcp-remote as a local bridge, without asserting identity with a sibling registration", () => {
    // §6.1, task 9, fix round 1: the note originally said the bridged and
    // direct registrations were "the same server" -- a claim this panel
    // cannot verify. `directRemoteRegs` (the production code) matches ANY
    // empty-launch registration by construction, so a bridged "notion"
    // reaching mcp.notion.com and a DIFFERENT direct "notion" some other
    // host points at an unrelated endpoint would trigger the identical
    // rendering, with the old text stating an identity nothing here can
    // confirm. The backend's own `Agreement` verdict exists precisely
    // because it does not trust name-matching -- it compares
    // `url_fingerprint` -- and that verdict never crosses IPC to this panel
    // (a locked invariant: never rendered, logged, or serialised). This
    // fixture is exactly that shape (same declared name, unverifiable
    // endpoint agreement) to prove the new copy makes no claim the old one
    // did that this data cannot support.
    const server: McpServerView = {
      ...base,
      name: "notion",
      registrations: [
        {
          key: "zed-1",
          host: "Zed",
          tier: "global",
          configPath: "~/.config/zed/settings.json",
          command: "npx",
          launchDisplay: "npx mcp-remote https://mcp.notion.com/mcp",
          bridged: true,
        },
        {
          key: "cc-1",
          host: "Claude Code",
          tier: "global",
          configPath: "~/.claude.json",
          command: "",
          launchDisplay: "",
          bridged: false,
        },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    const note = screen.getByTestId("bridge-note");
    expect(note).toBeTruthy();
    expect(within(note).getByText(/local bridge process/i)).toBeTruthy();
    // The retired identity claim must be gone: it asserted the two
    // registrations WERE the same server, which nothing on this panel can
    // verify.
    expect(within(note).queryByText(/same server as/i)).toBeNull();
    // Never a query string, never a token, inside the NOTE specifically:
    // it states the fact, not the endpoint. (The pre-existing "Registered
    // in" row above it already renders the raw redacted launch, URL
    // included, by design -- unrelated to this task's own constraint on
    // what the note itself may say.)
    expect(within(note).queryByText(/mcp\.notion\.com/)).toBeNull();
  });

  it("keeps two remote arms of one server apart instead of answering for both", () => {
    // M1, final review: every DIRECT remote registration has an empty
    // `launchDisplay` -- no dialect puts a URL into command/args -- so all
    // of them folded into one ""-keyed spec group. With one group, the
    // panel took the single-spec branch: it auto-probed arm A on open and
    // rendered A's tool list unlabelled, with A's count in the header slot
    // whose own comment says a number there "can only ever mean one thing".
    // Arm B was not represented anywhere. That is spec 4.1a's standing rule
    // -- the panel never states one arm's tools as the server's -- broken
    // for every Conflicting-remote server, automatically and with no
    // gesture from the user.
    const server: McpServerView = {
      ...base,
      name: "github",
      command: "",
      transport: "https://api.a.example.com/mcp",
      registrations: [
        {
          key: "cc-1",
          host: "Claude Code",
          tier: "user",
          configPath: "~/.claude.json",
          command: "",
          launchDisplay: "",
          transport: "https://api.a.example.com/mcp",
        },
        {
          key: "zed-1",
          host: "Zed",
          tier: "global",
          configPath: "~/.config/zed/settings.json",
          command: "",
          launchDisplay: "",
          transport: "https://api.b.example.com/mcp",
        },
      ],
    };
    render(
      <McpServerDetail
        server={server}
        verified={{
          "cc-1": { capabilities: [], tools: [{ name: "create_issue" }], verifiedAt: 1 },
        }}
      />
    );

    // Two endpoints are two things to ask, so two blocks -- never one block
    // carrying arm A's answer as the whole server's.
    expect(screen.getAllByTestId("tools-block")).toHaveLength(2);
    // And each block is labelled with the endpoint it belongs to, in the
    // only form allowed on screen: the sanitised transport the backend
    // already ships. No raw URL and no fingerprint reaches this panel.
    expect(screen.getByText("https://api.a.example.com/mcp")).toBeTruthy();
    expect(screen.getByText("https://api.b.example.com/mcp")).toBeTruthy();
    openDetails();
    // And the divergence fires: `launches` filtered empty strings out, so
    // two remote arms could never make it true, however far apart they were.
    expect(screen.getByText(/differ/i)).toBeTruthy();
  });

  it("says nothing about a bridge when no registration is bridged", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    expect(screen.queryByTestId("bridge-note")).toBeNull();
  });

  it("says nothing about a bridge when every registration is bridged (no direct sibling)", () => {
    const server: McpServerView = {
      ...base,
      name: "notion",
      registrations: [
        {
          key: "zed-1",
          host: "Zed",
          tier: "global",
          configPath: "~/.config/zed/settings.json",
          command: "npx",
          launchDisplay: "npx mcp-remote https://mcp.notion.com/mcp",
          bridged: true,
        },
        {
          key: "cd-1",
          host: "Claude Desktop",
          tier: "global",
          configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
          command: "npx",
          launchDisplay: "npx mcp-remote https://mcp.notion.com/mcp",
          bridged: true,
        },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    expect(screen.queryByTestId("bridge-note")).toBeNull();
  });

  it("says nothing about agreement when two bridges genuinely conflict, even with a direct sibling present", () => {
    // Isolates the `!diverges` gate specifically: a bridged and a direct
    // registration existing together is not by itself proof they agree --
    // two bridges pointed at DIFFERENT endpoints, plus an empty-launch
    // direct sibling, still has one bridged reg and one direct reg on the
    // fixture, but the divergence warning above is the true story here, not
    // "they agree instead of conflicting."
    const server: McpServerView = {
      ...base,
      name: "notion",
      registrations: [
        {
          key: "zed-1",
          host: "Zed",
          tier: "global",
          configPath: "~/.config/zed/settings.json",
          command: "npx",
          launchDisplay: "npx mcp-remote https://a.example.com/mcp",
          bridged: true,
        },
        {
          key: "vscode-1",
          host: "VS Code",
          tier: "global",
          configPath: "~/.vscode/mcp.json",
          command: "npx",
          launchDisplay: "npx mcp-remote https://b.example.com/mcp",
          bridged: true,
        },
        {
          key: "cc-1",
          host: "Claude Code",
          tier: "global",
          configPath: "~/.claude.json",
          command: "",
          launchDisplay: "",
          bridged: false,
        },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    expect(screen.getByText(/differ/i)).toBeTruthy();
    expect(screen.queryByTestId("bridge-note")).toBeNull();
  });

  it("shows the two launches aligned on the token that differs, beneath the divergence warning", () => {
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@latest" },
        { key: "/b:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    // The warning still names the server in prose; the aligned diff sits
    // beneath it and names the token itself, on both sides.
    expect(within(registeredSection).getByText(/launch tauri differently/i)).toBeTruthy();
    expect(within(registeredSection).getByText("@tauri/mcp@latest")).toBeTruthy();
    expect(within(registeredSection).getByText("@tauri/mcp@2.9.1")).toBeTruthy();
    // The shared tokens ("npx", "-y") are not styled as differing.
    const sharedToken = within(registeredSection).getAllByText("npx")[0];
    expect(sharedToken.className).not.toMatch(/state-warning/);
  });

  it("labels each aligned line by the host and tier that launches it", () => {
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@latest" },
        { key: "/b:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    expect(within(registeredSection).getAllByText(/Codex · global/).length).toBeGreaterThan(0);
    expect(within(registeredSection).getAllByText(/Gemini · global/).length).toBeGreaterThan(0);
  });

  it("diffs three or more diverging specs against the first, not pairwise", () => {
    // §6.1's guidance: N>2 diffs every spec against the FIRST group's spec,
    // the same "first wins" attribution Identity already uses — not an
    // N-way alignment matrix. Three specs render two aligned pairs, each
    // sharing the first spec's line as the baseline.
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@1.0.0" },
        { key: "/b:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@2.0.0" },
        { key: "/c:tauri", host: "VS Code", tier: "global", configPath: "~/.vscode/mcp.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@3.0.0" },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    const registeredSection = screen.getByText("Registered in").closest("section")!;
    // The baseline (1.0.0) appears once per comparison it anchors -- twice,
    // not three times, since it is never compared to itself.
    expect(within(registeredSection).getAllByText("@tauri/mcp@1.0.0")).toHaveLength(2);
    expect(within(registeredSection).getByText("@tauri/mcp@2.0.0")).toBeTruthy();
    expect(within(registeredSection).getByText("@tauri/mcp@3.0.0")).toBeTruthy();
  });

  it("never renders a secret that leaked into a diverging launch's env assignment", () => {
    // The security constraint, verbatim and standing: "Redact in the
    // launch-spec diff: show that env differs, never what it differs to."
    // REDACT_ME_1 is planted directly into launchDisplay to prove the diff
    // itself withholds it -- independent of whatever the backend's own
    // redaction already caught -- rather than trusting the backend alone.
    //
    // Scoped to the diff block (`data-testid="launch-diff"`), not the whole
    // panel: the "Registered in" row above it renders each registration's
    // raw `launchDisplay` verbatim by design -- "already redacted by the
    // backend" is the panel's standing trust boundary for that row, and a
    // value planted to simulate a backend redaction MISS necessarily shows
    // there too. That is pre-existing behaviour, unrelated to this task and
    // out of its scope. What this task owns is that the NEW diff view adds
    // no further exposure of its own.
    const server: McpServerView = {
      ...base,
      name: "leaky-server",
      registrations: [
        { key: "a", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "node", launchDisplay: "node server.js API_KEY=REDACT_ME_1" },
        { key: "b", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "node", launchDisplay: "node server.js API_KEY=REDACT_ME_2" },
      ],
    };
    render(<McpServerDetail server={server} />);
    openDetails();
    const diffBlock = screen.getByTestId("launch-diff");
    expect(within(diffBlock).queryByText(/REDACT_ME/)).toBeNull();
    expect(within(diffBlock).getAllByText(/env differs/i).length).toBeGreaterThan(0);
  });

  it("lets you open the config file a registration came from", () => {
    render(<McpServerDetail server={base} />);
    openDetails();
    const openers = screen.getAllByRole("button", { name: /^Reveal / });
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
    openDetails();
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
            {
              key: "zed-remote",
              host: "Zed",
              tier: "global",
              configPath: "~/.config/zed/settings.json",
              command: "npx",
              launchDisplay: "npx mcp-remote https://example.com/sse",
            },
          ],
        }}
      />
    );
    openDetails();
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
    //
    // Scoped to Tools: this fixture diverges (two launches), so Task 8's
    // launch-spec diff also labels its aligned lines by host + tier in
    // "Registered in" now, and an unscoped query finds both.
    const toolsSection = toolsHeading().closest("section")!;
    expect(within(toolsSection).getByText("Codex · global")).toBeTruthy();
    expect(within(toolsSection).getByText("Gemini · global")).toBeTruthy();
  });

  it("labels a probed spec's block when a sibling spec exists but has not been probed yet", () => {
    // This server genuinely has two specs -- Verify moving into the Tools
    // section is what surfaces that honestly. The old grouping counted only
    // PROBED registrations, so this exact server (one probed launch, one
    // not) used to collapse to a single unlabelled block, indistinguishable
    // from a server with only one launch. Fixed by grouping every
    // registration, probed or not: two specs on screen means two blocks,
    // and the one that came back IS worth labelling, because there is a
    // second one right below it this could be confused with.
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
    // Scoped to Tools -- see the comment on the sibling test above; this
    // fixture diverges too, so the launch-spec diff repeats the same
    // "Codex · global" / "Gemini · global" labels in "Registered in".
    const toolsSection = toolsHeading().closest("section")!;
    expect(within(toolsSection).getByText("Codex · global")).toBeTruthy();
    // The other spec is real and still unprobed -- it gets its own Verify,
    // not silence.
    expect(within(toolsSection).getByText("Gemini · global")).toBeTruthy();
    expect(within(toolsSection).getByRole("button", { name: /^verify$/i })).toBeTruthy();
  });

  it("offers one Verify per spec when a server has two unprobed launches", () => {
    // Two specs, neither probed -- each is its own group and each needs its
    // own way to act, since probing one tells you nothing about the other.
    const onVerify = vi.fn();
    const server: McpServerView = {
      ...base,
      name: "tauri",
      registrations: [
        { key: "/a:tauri", host: "Codex", tier: "global", configPath: "~/.codex/config.toml",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@latest" },
        { key: "/b:tauri", host: "Gemini", tier: "global", configPath: "~/.gemini/settings.json",
          command: "npx", launchDisplay: "npx -y @tauri/mcp@2.9.1" },
      ],
    };
    render(<McpServerDetail server={server} onVerify={onVerify} />);
    const toolsSection = toolsHeading().closest("section")!;
    const buttons = within(toolsSection).getAllByRole("button", { name: /^verify$/i });
    expect(buttons).toHaveLength(2);
    // Each button hands back a key belonging to ITS group, not the other
    // one's -- the group is the unit, but onVerify still needs one real
    // registration to act on.
    fireEvent.click(buttons[0]);
    expect(onVerify).toHaveBeenCalledWith("/a:tauri");
    fireEvent.click(buttons[1]);
    expect(onVerify).toHaveBeenCalledWith("/b:tauri");
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
    const toolsSection = toolsHeading().closest("section")!;
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
    const toolsSection = toolsHeading().closest("section")!;
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

describe("McpServerDetail — the tool table and Context (M5)", () => {
  it("the tools list is name and description only — no header, no schema column, no per-tool bytes", () => {
    render(
      <McpServerDetail
        server={{ ...base, registrations: [base.registrations[0]] }}
        verified={{ "cc-user": {
          capabilities: ["tools"], verifiedAt: 1_700_000_000_000,
          tools: [
            { name: "get_system_volume", description: "Get the current macOS system volume level (0–100) and mute state." },
            { name: "list_audio_apps", description: "List the apps currently producing audio." },
            { name: "undescribed" },
          ],
          // Deliberately divergent, because the old fixture had toolCount ===
          // tools.length (3 and 3) and a perTool entry for every tool. That
          // made "reads the backend count" and "computes it from the array"
          // indistinguishable, and "rows come from tools" indistinguishable
          // from "rows come from perTool". Here the backend says 5 while the
          // list holds 3, and `ghost_tool` is a perTool entry with no twin.
          // estimatedTokens is deliberately not descriptionBytesTotal / 4
          // either (that quotient is 27) -- a component that divided the byte
          // figure instead of rendering the backend's own estimate would
          // still have passed every assertion below.
          cost: { toolCount: 5, describedToolCount: 2, descriptionBytesTotal: 109, estimatedTokens: 42,
            perTool: [{ name: "get_system_volume", descriptionBytes: 69 }, { name: "list_audio_apps", descriptionBytes: 40 }, { name: "undescribed", descriptionBytes: 0 }, { name: "ghost_tool", descriptionBytes: 12 }] },
        } }}
      />
    );
    const block = screen.getByTestId("tools-block");
    expect(within(block).queryByText("Tool")).toBeNull();
    expect(within(block).queryByText("Schema")).toBeNull();
    expect(within(block).queryByText("Description")).toBeNull();
    expect(within(block).queryByText("69 B")).toBeNull();
    // No per-row schema placeholder either -- the old table drew a "—" in
    // every row's Schema column, and nothing in this shape should still be
    // producing one.
    expect(within(block).queryAllByText("—")).toHaveLength(0);
    expect(within(block).getByText("get_system_volume")).toBeTruthy();
    expect(within(block).getByText("list_audio_apps")).toBeTruthy();
    // Rows still come from `result.tools`, never `cost.perTool`: `perTool`
    // entries carry no description, so sourcing rows there would silently
    // drop every one. `ghost_tool` has bytes and no tool, and must not draw
    // a row.
    expect(within(block).queryByText("ghost_tool")).toBeNull();
    // The tab and the section count still carry the backend's figure — 5,
    // which is NOT `tools.length` (3), so an implementation that counted the
    // array fails here.
    expect(screen.getByRole("tab", { name: "Tools 5" })).toBeTruthy();
    expect(within(block).getByText("undescribed")).toBeTruthy();
    // And the descriptions themselves render, which only the tools source has.
    expect(within(block).getByText("Get the current macOS system volume level (0–100) and mute state.")).toBeTruthy();
    // The section leads the panel and is checkable against the table.
    const context = screen.getByRole("heading", { name: "Context per request" }).closest("section")!;
    expect(context.textContent).toContain("Descriptions");
    expect(context.textContent).toContain("2 of 5 tools carry one");
    expect(context.textContent).toContain("≈ 42 tokens");
    expect(context.textContent).toContain("109 B");
    expect(context.textContent).toContain("Input schemas");
    expect(context.textContent).toContain("Usually the larger part of a definition");
    expect(context.textContent).toContain("Not measured");
    expect(context.textContent).not.toContain("the remainder, not in the store");
    expect(context.textContent).toContain(
      "A request carries a name, a description and an input schema for every tool. The " +
        "schemas are never stored, so nothing here can weigh them. Token figures are bytes " +
        "divided by four, so treat them as a size, not a count."
    );
    expect(context.textContent).not.toContain("tool definitions in every request");
  });
  it("draws no Context section before anything has answered", () => {
    render(<McpServerDetail server={base} />);
    expect(screen.queryByRole("heading", { name: "Context per request" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Tools" })).toBeTruthy();
  });
});

/**
 * Opening the panel is the question. The Verify button in front of the answer
 * made this a form to fill in; these pin the four states that replace it.
 *
 * The two rules themselves — fresh cache serves without spawning, a running
 * server is never auto-probed — are enforced in Rust and proved there
 * (`src-tauri/tests/mcp_cached_probe_tests.rs`), because only the backend can
 * see freshness. What the panel owns, and what these test, is asking once per
 * launch spec, carrying the running fact the backend cannot cheaply
 * recompute, and rendering what comes back.
 */
describe("McpServerDetail — lazy on open", () => {
  const running = (reg: McpServerView["registrations"][number]) => ({
    ...reg,
    running: { pid: 4242, spawningHost: "Claude Code" },
  });

  it("asks for the tool list on open, once per launch spec rather than once per registration", () => {
    const onAutoProbe = vi.fn();
    // base is three registrations sharing one launch. Three requests here
    // would be three handshakes with the same server for one panel open.
    render(<McpServerDetail server={base} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledTimes(1);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", false);
  });

  it("asks one launch at a time when a server's hosts disagree, never both at once", () => {
    // Two versions of one server, both stopped, both about to be started by
    // Hanger in the same tick. For a port-bound or singleton server that is
    // claude-code#40220 again and self-inflicted: one child loses the port and
    // its EADDRINUSE is written as that launch's answer for seven days.
    // Clicking Verify could only ever start one at a time; asking on open must
    // not be worse than the button it replaced.
    const onAutoProbe = vi.fn();
    const server: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { ...base.registrations[1], launchDisplay: "npx -y @tauri/mcp@2.8.0" },
      ],
    };
    const { rerender } = render(<McpServerDetail server={server} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledTimes(1);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", false);

    // While that one is in flight, nothing else is asked.
    rerender(
      <McpServerDetail server={server} onAutoProbe={onAutoProbe} verifying={["cc-user"]} />
    );
    expect(onAutoProbe).toHaveBeenCalledTimes(1);

    // It lands; the next launch goes.
    rerender(<McpServerDetail server={server} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledTimes(2);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-global", false);
  });

  it("waits for a launch the user asked about before asking about another", () => {
    // The cap is one request per panel, whoever started it. A Verify click on
    // one launch must not race an automatic ask on the next.
    const onAutoProbe = vi.fn();
    const server: McpServerView = {
      ...base,
      registrations: [
        { ...base.registrations[0], launchDisplay: "npx -y @tauri/mcp@2.9.1" },
        { ...base.registrations[1], launchDisplay: "npx -y @tauri/mcp@2.8.0" },
      ],
    };
    render(
      <McpServerDetail server={server} onAutoProbe={onAutoProbe} verifying={["cc-global"]} />
    );
    expect(onAutoProbe).not.toHaveBeenCalled();
  });

  it("hands the running fact straight to the backend, which confirms it before spawning", () => {
    // The panel used to withhold — treat every launch as running until
    // `get_mcp_processes` answered — because a stale or missing snapshot read
    // as "stopped" and ended in a spawn. `cached_probe` now checks the live
    // process table itself before starting anything, so the snapshot is a hint
    // that saves a 61ms check, not the thing the rule rests on. Withholding
    // would only cost the user the 11.2s scan before a first probe.
    const onAutoProbe = vi.fn();
    render(<McpServerDetail server={base} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", false);
  });

  it("asks again about a launch that has since stopped, and not before", () => {
    // The request key carries the running flag, so a launch declined while a
    // host had it up is asked once more when the process list shows it gone —
    // which is the only moment the answer could newly be obtainable. Asking
    // on any other render would be a spawn nobody requested.
    const onAutoProbe = vi.fn();
    const up: McpServerView = { ...base, registrations: [running(base.registrations[0])] };
    const down: McpServerView = { ...base, registrations: [base.registrations[0]] };

    const { rerender } = render(<McpServerDetail server={up} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", true);

    // Still up: nothing new to ask.
    rerender(<McpServerDetail server={up} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledTimes(1);

    rerender(<McpServerDetail server={down} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledTimes(2);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", false);
  });

  it("does not ask again for a launch it already has an answer for", () => {
    const onAutoProbe = vi.fn();
    render(
      <McpServerDetail
        server={base}
        onAutoProbe={onAutoProbe}
        verified={{
          "cc-user": { capabilities: [], tools: [{ name: "get_system_volume" }], verifiedAt: 1_700_000_000_000 },
        }}
      />
    );
    expect(onAutoProbe).not.toHaveBeenCalled();
  });

  it("says the launch is running when ANY registration of it is", () => {
    // The registrations of one spec share a launch, so one running process is
    // the whole group's answer. Reading only the first row would have missed
    // it here, where Claude Desktop is the host that started it.
    const onAutoProbe = vi.fn();
    const server: McpServerView = {
      ...base,
      registrations: [base.registrations[0], base.registrations[1], running(base.registrations[2])],
    };
    render(<McpServerDetail server={server} onAutoProbe={onAutoProbe} />);
    expect(onAutoProbe).toHaveBeenCalledWith("cc-user", true);
  });

  it("explains why it left a running server alone instead of showing an empty list", () => {
    const server: McpServerView = { ...base, registrations: [running(base.registrations[0])] };
    render(<McpServerDetail server={server} onAutoProbe={vi.fn()} declined={["cc-user"]} />);
    expect(
      screen.getByText(/already running.*second copy.*only allow one at a time.*left it alone/i)
    ).toBeTruthy();
    // The resting explanation belongs to a server nobody has asked yet. Both
    // at once would read as two different reasons for one empty block.
    expect(screen.queryByText("Tools are only known by asking the server.")).toBeNull();
  });

  it("takes the declined explanation from the backend's answer, not from its own snapshot", () => {
    // The provenance is the whole point. A process list can be minutes old, so
    // a launch can read as stopped here while the machine says it is running —
    // in which case the backend declines and this panel would otherwise
    // explain the empty block by saying nobody has asked yet, which is false.
    render(
      <McpServerDetail server={base} onAutoProbe={vi.fn()} declined={["cc-user"]} />
    );
    expect(screen.getByText(/already running/i)).toBeTruthy();
    expect(screen.queryByText("Tools are only known by asking the server.")).toBeNull();
  });

  it("does not claim a server was left alone merely because a process matched it", () => {
    // The other direction: a running badge is not by itself a reason to say
    // Hanger declined. Only the backend knows whether it did.
    const server: McpServerView = { ...base, registrations: [running(base.registrations[0])] };
    render(<McpServerDetail server={server} onAutoProbe={vi.fn()} />);
    expect(screen.queryByText(/already running/i)).toBeNull();
  });

  it("keeps the declined explanation off a server that is merely unprobed", () => {
    render(<McpServerDetail server={base} onAutoProbe={vi.fn()} />);
    expect(screen.queryByText(/already running/i)).toBeNull();
    expect(screen.getByText("Tools are only known by asking the server.")).toBeTruthy();
  });

  it("holds the loading line back for 250ms so a fast server never makes it strobe", () => {
    // Measured probes on this machine run 100ms-1.3s; spades-audio answers in
    // 196ms. An indicator that appeared instantly would flash and vanish on
    // every fast server, which reads as a glitch rather than as progress.
    vi.useFakeTimers();
    try {
      render(<McpServerDetail server={base} verifying={["cc-user"]} onAutoProbe={vi.fn()} />);
      expect(screen.queryByText("Asking the server…")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(249);
      });
      expect(screen.queryByText("Asking the server…")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(screen.getByText("Asking the server…")).toBeTruthy();
      // Pins ServerRelayIcon specifically, not just "some spinner appeared":
      // two out-of-phase rack groups, the second half a cycle behind the
      // first. Geometry read from ServerRelayIcon's spec in icons.tsx, not
      // retyped from memory. A regression that merged the two racks into one
      // group -- both fading together instead of trading emphasis -- would
      // be visually wrong but invisible to any assertion that only checks a
      // mark is present, so the count and the phase offset are both pinned
      // here, alongside the geometry.
      const pending = screen.getByText("Asking the server…").closest("div")!;
      const relayGroups = pending.querySelectorAll("g.aim-relay");
      expect(relayGroups).toHaveLength(2);
      expect(pending.querySelector('rect[x="2"][y="2"]')).toBeTruthy();
      expect((relayGroups[0] as HTMLElement).style.animationDelay).toBe("");
      expect((relayGroups[1] as HTMLElement).style.animationDelay).toBe("-0.6s");
    } finally {
      vi.useRealTimers();
    }
  });

  it("says nothing at all about an empty list while the answer is still coming", () => {
    // Not the same as the delay above: before 250ms the block is quiet, but
    // it must not fill the silence with "Tools are only known by asking the
    // server", which would be replaced a quarter-second later by its own
    // answer arriving.
    vi.useFakeTimers();
    try {
      render(<McpServerDetail server={base} verifying={["cc-user"]} onAutoProbe={vi.fn()} />);
      expect(screen.queryByText("Tools are only known by asking the server.")).toBeNull();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(screen.queryByText("Tools are only known by asking the server.")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks nothing of a Claude.ai connector, which has no local process and no endpoint", () => {
    const onAutoProbe = vi.fn();
    render(
      <McpServerDetail
        server={{ ...base, command: "", transport: "claude.ai" }}
        onAutoProbe={onAutoProbe}
      />
    );
    expect(onAutoProbe).not.toHaveBeenCalled();
  });

  it("still offers the re-check on a running server — declining to ask is not refusing to", () => {
    const onVerify = vi.fn();
    const server: McpServerView = { ...base, registrations: [running(base.registrations[0])] };
    render(<McpServerDetail server={server} onVerify={onVerify} onAutoProbe={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));
    expect(onVerify).toHaveBeenCalledWith("cc-user");
  });
});

describe("McpServerDetail — Tools first, Details second", () => {
  it("opens on Tools; Identity, Registered in and Environment sit behind Details", () => {
    render(<McpServerDetail server={{ ...base, envKeys: ["API_KEY"] }} />);
    expect(screen.getByRole("tab", { name: "Tools" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").id).toBe("panel-tools");
    expect(toolsHeading()).toBeTruthy();
    expect(screen.queryByText("Registered in")).toBeNull();
    openDetails();
    expect(screen.getByRole("tabpanel").id).toBe("panel-details");
    const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(["Identity & capabilities", "Registered in", "Environment"]);
    expect(screen.queryByRole("heading", { name: "Tools" })).toBeNull();
  });
});

describe("McpServerDetail — Identity & capabilities card", () => {
  it("Identity & capabilities is one card: server, protocol, transport, then the three capabilities in words", () => {
    const { container } = render(
      <McpServerDetail
        server={base}
        verified={{
          "cc-user": {
            serverVersion: "1.0.0",
            protocolVersion: "2025-06-18",
            capabilities: ["tools"],
            tools: [],
            verifiedAt: 1_700_000_000_000,
          },
        }}
      />
    );
    openDetails();
    const rowTestIds = Array.from(
      container.querySelectorAll('[data-testid^="identity-row-"]')
    ).map((el) => el.getAttribute("data-testid"));
    expect(rowTestIds).toEqual([
      "identity-row-server",
      "identity-row-protocol",
      "identity-row-transport",
      "identity-row-tools",
      "identity-row-resources",
      "identity-row-prompts",
    ]);
    expect(screen.getByTestId("identity-row-transport").textContent).toBe("Transportstdio");
  });
});
