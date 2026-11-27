# Hanger's model layer: what to build, what to borrow, what to fix first

Hanger does not need a model of its own to become useful as a harness. The evidence supports a narrow first step: the deterministic facts Hanger already computes (reach, tool tokens, hashes, findings), exposed to the user's engines through a Hanger MCP server, with a model used only to explain those facts and to turn requests into previewed operations that Hanger's Rust writer applies. The 2026-11-24 ruling survives on keys and writes but needs three amendments: the Claude subscription route has unresolved terms, a non-bare `claude -p` run executes an untrusted repo's hooks, and the engine's own tools are an exfiltration channel once it has read harness text. The research also found drift in what Hanger ships: the Gemini switch may not reach Antigravity users, Codex now has a vendor write API, and three engines read Claude Code's directories. A dynamic tab strip is supportable only as saved views beside fixed kind tabs.

Every URL below was accessed 2026-11-27. "Verified" means the researcher read the page (often through a fetch tool that summarises). "Inferred" means a search snippet, a secondary source, or reasoning.

## 1. Jobs a model layer would do, ranked by value against risk

Harness managers are deterministic, engines are intelligent, gateways do retrieval, and nothing found combines a cross-engine inventory with a model ([rulesync](https://github.com/dyoshikawa/rulesync), verified; [ToolHive optimizer](https://docs.stacklok.com/toolhive/guides-vmcp/optimizer), verified). Engines already run single-engine model jobs: `/doctor` applies fixes after confirmation, `/doctor prompt-audit` finds conflicting instructions, `/insights` reads up to 200 sessions at the user's token cost ([skills](https://code.claude.com/docs/en/skills), verified; [costs](https://code.claude.com/docs/en/costs), verified). Hanger's open ground is the cross-engine version.

| Rank | Job | Value evidence | Model needed? | Risk |
|---|---|---|---|---|
| 1 | Explain an asset's state across engines and recommend a previewed switch | Five servers cost ~55K tokens; tool search lifted Opus 4 accuracy from 49% to 74% ([Anthropic](https://www.anthropic.com/engineering/advanced-tool-use), verified) | Facts no; explanation yes | Low if grounded in reach verdicts |
| 2 | Usage-grounded pruning ("never invoked in 30 days") | ccusage has 19.6k stars ([ccusage](https://github.com/ryoppippi/ccusage), verified); `/skill-doctor` flags never-invoked skills ([skills](https://code.claude.com/docs/en/skills), verified) | No, transcript parsing | Medium: transcripts hold code and secrets |
| 3 | Effective-config summary per repo ("Codex sees 3 rules, Claude Code 5") | `codex debug prompt-input` dumps model-visible input ([Codex commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli), verified) | Narrative only | Low; must separate "will load" from "may load" |
| 4 | Sentence to previewed operations ("turn off every GitHub server in Codex") | No prior art; `/usage` `f` shows each change before making it ([costs](https://code.claude.com/docs/en/costs), verified) | Yes, intent to selector | Medium; safe only if Rust applies an enum |
| 5 | Security triage of tool and skill text | 76 confirmed malicious of 3,984 skills ([Snyk ToxicSkills](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/), verified, vendor study) | Deterministic first; judge for injected prose | High: the reader is exposed to the attack |
| 6 | Semantic duplicates and cross-engine contradictions | Linters exist; no accuracy data ([asitis-agent-tools](https://github.com/Katta041/asitis-agent-tools), verified) | Embeddings or small model | Medium; unmeasured |
| 7 | Drafting rules and skills | Vendor-owned: `/init`, Kiro steering, skill-creator ([commands](https://code.claude.com/docs/en/commands), verified; [skill-creator](https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/SKILL.md), verified) | Yes | Low value: duplicates engines |

Two cautions. Claude Code defers MCP tools by default, loading only names at session start ([Claude Code MCP](https://code.claude.com/docs/en/mcp), verified), so Hanger's per-engine token ranking overstates Claude Code's cost when tool search is on. A recommendation must say whether the engine defers. And the retrieval that ships locally is keyword search plus small embeddings, not small chat models (ToolHive, above). Hanger already has an FTS5 `asset_search` index (`src-tauri/src/search.rs`).

## 2. Ten architecture routes, decided by auth and terms rather than cost

Cost does not decide this. Claude Haiku 5.5 costs $0.10 per MTok in and $0.50 out ([Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), verified); gemini-2.5-flash-lite is $0.10 and $0.40 ([Gemini pricing](https://aistudio.google.com/docs/pricing), verified). Tagging 500 assets of 2k tokens is about $0.10 (inferred arithmetic). Auth, terms and privacy decide it.

| Route | Auth Hanger touches | Terms risk | Offline | Approvals into Hanger | Maintenance |
|---|---|---|---|---|---|
| `claude -p`, user's subscription | None | Unresolved | No | `--permission-prompt-tool`, hooks | Flags move fast |
| `claude --bare -p` or Agent SDK, user's key | Holds or forwards a key | Documented path | No | `canUseTool`; prompt tool | Node or Python sidecar for SDK |
| `codex exec` or `codex app-server` | None if Codex owns `auth.json` | Lower | No | `*/requestApproval` requests | Schemas per installed version |
| Gemini CLI or `agy -p` | None, or key | High for OAuth | No | Not researched | Product churn |
| ACP client | Per agent | Per agent | No | `session/request_permission` | One protocol, Rust crate |
| Direct API, user's key | Holds key | Low | No | Hanger's own loop | Hanger owns prompts |
| Ollama | None | None | Yes | Hanger's own loop | User installs it |
| Apple Foundation Models | None | None | Yes | Hanger's own loop | Swift bridge, 4096 tokens |
| Hanger as MCP server | None | Low | No | Engine's UI, elicitation | Spec churn |
| MCP sampling | None | n/a | No | n/a | Deprecated |

The table is inferred from the findings below.

**Claude Code.** `-p` supports `--output-format stream-json`, `--json-schema`, `--allowedTools` and `--permission-prompt-tool`, and since v2.1.302 starts in Manual mode, so unapproved calls fail closed ([headless](https://code.claude.com/docs/en/headless), verified). `--bare`, the recommended scripted mode, "doesn't use your subscription login". Without it, `-p` "runs the hooks in a project's `.claude/settings.json` and connects the servers in its `.mcp.json`, even in a folder you've never trusted" (same page, verified). The terms bar routing requests through Free, Pro, Max or Ultra credentials "on behalf of their users" and require Commercial Terms for "running Claude Code in your products", yet nothing prevents "an end user from signing in to the unmodified Claude Code binary with their own Claude subscription" ([legal](https://code.claude.com/docs/en/legal-and-compliance), verified). A desktop app shelling out to the user's signed-in binary fits none of these cleanly (inferred). The Agent SDK is API-key only unless Anthropic approves otherwise ([Agent SDK](https://code.claude.com/docs/en/agent-sdk/overview), verified).

**Codex.** `codex exec --json` emits JSONL, `--output-schema` constrains output, and `--sandbox read-only` is the default ([non-interactive](https://learn.chatgpt.com/docs/non-interactive-mode), verified). `codex app-server` speaks stdio JSON-RPC and sends approval requests a UI answers ([app-server](https://learn.chatgpt.com/docs/app-server.md), verified). A summary of that page said its auth "has never been permitted for commercial or hosted services"; read it in full before relying on that. OpenAI's Sign in with ChatGPT terms allow requests from "the user's local runtime" and require local token storage ([SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/), verified). `codex mcp-server` has been removed ([Codex SDK](https://learn.chatgpt.com/docs/codex-sdk), verified).

**Gemini and Antigravity.** Third-party access with Gemini CLI OAuth is "a violation of applicable terms" ([Gemini CLI ToS](https://geminicli.com/docs/resources/tos-privacy), verified). No ruling was found on driving the unmodified `agy` binary ([forum](https://discuss.ai.google.dev/t/is-invoking-the-official-antigravity-cli-agy-print-from-a-third-party-developer-tool-an-acceptable-use/175462), inferred), and `agy -p` reportedly drops stdout without a TTY ([antigravity-cli#76](https://github.com/google-antigravity/antigravity-cli/issues/76), inferred).

**Local models.** Ollama offers unauthenticated localhost HTTP with JSON-schema output and `/api/embed` ([structured outputs](https://docs.ollama.com/capabilities/structured-outputs), verified; [embeddings](https://docs.ollama.com/capabilities/embeddings), verified). Apple's on-device model has "a context window of 4096 tokens per session" ([Apple](https://developer.apple.com/documentation/foundationmodels/managing-the-context-window.md), verified). A 4B model produced schema-valid output 91.56% of the time in one benchmark ([SchemaGUI](https://arxiv.org/pdf/2608.22390), inferred), so invalid output is a certainty to design for.

**ACP.** ACP lists 52 agents; Claude comes "via Zed's SDK adapter" ([ACP agents](https://agentclientprotocol.com/overview/agents), verified), so it likely inherits the SDK's auth limits (inferred). `session/request_permission` carries diffs and allow/reject options ([ACP tool calls](https://agentclientprotocol.com/protocol/tool-calls), verified), and a Rust crate implements the client ([ACP Rust](https://agentclientprotocol.com/libraries/rust), verified). An ACP client is an editor running agents, close to the "never an agent runner" line (inferred).

**MCP.** Sampling is deprecated in the 2026-07-28 spec, with the advice to "integrate directly with LLM provider APIs" ([MCP changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog.md), verified). The live MCP route is the reverse: Hanger as a server whose tools the user's engines call with their own model and auth (inferred).

**Gateways.** Claude Code's docs say interactive sessions refetch tools on `list_changed` ([MCP](https://code.claude.com/docs/en/mcp), verified); user issues say it is ignored mid-session ([claudeissues 62058](https://claudeissues.com/issue/62058-mcp-notifications-tools-list-changed-not-acted-on-mid-session), inferred). Zed confirms support ([Zed MCP](https://zed.dev/docs/ai/mcp), verified). MetaMCP was archived on 2026-11-12 ([metamcp](https://github.com/metatool-ai/metamcp), verified).

## 3. Control surfaces: three engines can be driven, the rest are read

### Findings that touch what Hanger ships (verify against the code)

None of these has been run against Hanger. Each is a lead to check, not a confirmed defect.

**The Gemini switch may miss Antigravity users.** "Gemini CLI was replaced by Antigravity CLI on June 18th, 2026" for consumer users. Enterprise and paid API-key users keep Gemini CLI ([Gemini CLI config](https://geminicli.com/docs/reference/configuration/), verified; [Google blog](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli), verified). Antigravity keeps MCP servers in `~/.gemini/config/mcp_config.json` and `.agents/mcp_config.json`, switched by a `disabled` key ([migration](https://antigravity.google/docs/cli/gcli-migration), verified; [Antigravity MCP](https://antigravity.google/docs/mcp), verified). Hanger's Gemini switch writes `~/.gemini/mcp-server-enablement.json` (`docs/release-notes/0.7.0.md`), the legacy CLI's file ([Gemini MCP](https://geminicli.com/docs/tools/mcp-server/), verified), under an engine filed as "Gemini / Antigravity" (`src-tauri/src/agents.rs` → `AGENT_CONFIGS`). An off switch may report success while Antigravity keeps loading the server: the half-fix shape `.claude/rules/shared-asset-machinery.md` warns about.

**Codex has a vendor write API.** `codex app-server` exposes `config/value/write`, `config/batchWrite`, `skills/config/write` (skills on or off by path) and `mcpServerStatus/list` ([app-server](https://learn.chatgpt.com/docs/app-server), verified). Hanger edits `mcp_servers.<id>.enabled` in `config.toml` in place (`src-tauri/src/mcp/registry.rs` → `SWITCHES`) and moves skill folders into its keep. Codex could do both writes itself. Whether `config/value/write` reaches a running session is unknown.

**Claude Code keeps per-project `/mcp` state in `~/.claude.json`,** as `disabledMcpServers` and `enabledMcpServers` ([MCP](https://code.claude.com/docs/en/mcp), verified). Hanger switches through `claude mcp remove` and `add-json` and never writes that file (`docs/release-notes/0.7.0.md`). Check whether Hanger reads those lists, so a server disabled in `/mcp` does not show as on, and note that T18 slice 2 would need a write path no CLI offers.

**OpenCode's documented config shape changed** to `mcp.servers.<name>` with `disabled: true` ("Use `disabled`, not an `enabled` field"), plus `permissions`, `plugins` and `agents` keys ([OpenCode MCP](https://opencode.ai/docs/mcp-servers/), verified; [config](https://opencode.ai/docs/config/), verified). Check Hanger's OpenCode reader (`src-tauri/src/mcp/registry.rs` → `HOSTS`) against both shapes; the docs may be ahead of installed versions.

**Shared directories widen reach.** Cursor reads `.claude/skills/`, `~/.claude/skills/`, `.codex/skills/` and `~/.codex/skills/` ([Cursor skills](https://cursor.com/docs/skills), verified). Cline reads `.claude/skills/` ([Cline skills](https://docs.cline.bot/customization/skills.md), verified). Amp reads `.claude/skills/`, `~/.claude/skills/` and `~/.claude/plugins/cache/` ([Amp settings](https://ampcode.com/docs/cli/settings), verified). VS Code's Copilot harness reads repository `.claude/settings.json` hooks ([VS Code hooks](https://code.visualstudio.com/docs/agent-customization/hooks), verified). `agy plugin import claude` consumes Claude plugins ([Antigravity plugins](https://antigravity.google/docs/plugins), verified). A skill switched off for Claude Code would vanish from Cursor, Cline and Amp, and a Claude Code hook reaches Copilot. Check each edge against the reach verdicts in `src-tauri/src/annotations.rs` (`docs/harness.md`).

**The claude.ai sync owns `~/.claude/skills/synced/`** and moves removed skills to `skills/.trash/` ([.claude directory](https://code.claude.com/docs/en/claude-directory), verified). A Hanger keep move there could fight the sync (inferred).

### What Hanger could drive safely

Codex app-server is the strongest target. Claude Code is next: `claude plugin … --json` returns `id`, `version`, `enabled` and `errors` ([plugin CLI](https://code.claude.com/docs/en/plugins/cli-reference), verified), and `-p` `system/init` lists loaded servers and plugins with their errors ([headless](https://code.claude.com/docs/en/headless), verified). OpenCode's server connects and disconnects MCP servers without changing config ([OpenCode server](https://opencode.ai/docs/server/), verified). Copilot CLI (`copilot plugin list --json`), Cline (`cline config mcp --json`) and Cursor (`agent mcp enable|disable`) have smaller CLIs ([Copilot](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-plugin-reference), [Cline](https://docs.cline.bot/mcp/configuring-mcp-servers), [Cursor](https://cursor.com/docs/cli/mcp), all verified). For Zed and Kiro, file reads are the surface.

No engine marks its files as owned in a machine-readable way; ownership is prose, as with `~/.claude.json`, a file Claude Code "writes for itself" ([settings](https://code.claude.com/docs/en/settings), verified). Managed policy paths, such as `/Library/Application Support/ClaudeCode/` ([managed settings](https://code.claude.com/docs/en/managed-settings), verified), should show as locked in Needs review and never be written (inferred).

## 4. A dynamic interface: let the model draft views, keep the strip fixed

Production generative-UI stacks keep components and navigation fixed and let the model pick the component and its data: Vercel AI SDK UI maps tool results to developer-written components ([AI SDK](https://ai-sdk.dev/docs/ai-sdk-ui/generative-user-interfaces), verified), and OpenAI's Apps SDK forbids "tabs, or deeper navigation" in model-invoked cards ([Apps SDK](https://developers.openai.com/apps-sdk/concepts/ui-guidelines), verified). Only Google's research demo generates whole interfaces, and it "can sometimes take a minute or more" ([Google Research](https://research.google/blog/generative-ui-a-rich-custom-visual-interactive-user-experience-for-any-prompt/), verified).

Shipping tools confirm before any new grouping. Chrome shows one suggested group at a time ([Chrome Help](https://support.google.com/chrome/answer/14519765?hl=en), inferred). Linear marks auto-applied suggestions and shows reasoning on hover ([Linear](https://linear.app/docs/triage-intelligence), verified). In Superhuman the user creates the tab and the model only classifies into it ([Superhuman](https://help.superhuman.com/hc/en-us/articles/45274846287891-Organize-with-AI), inferred). Complaints cluster where classification hides items: Apple Mail users miss mail filed in "a completely unrelated category" ([Apple Discussions](https://discussions-kr-prz.apple.com/thread/255898411), inferred).

HCI agrees. A split interface that copied predicted items into a separate area "was found most beneficial and least costly", while adapting once per interaction did worse than no adaptation ([Gajos 2006](https://www.eecs.harvard.edu/~kgajos/papers/2006/kgajos-avi06.pdf), verified). Office 2007 dropped adaptive menus: "auto-customization, unless it does a perfect job, is usually worse than no customization at all" ([Harris](https://learn.microsoft.com/en-us/archive/blogs/jensenh/combating-the-perception-of-bloat-why-the-ui-part-3), verified). Amershi et al. ask systems to "update and adapt cautiously" ([Guidelines](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf), verified). WCAG 3.2.3 lets navigation order change only when the user initiates it ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/consistent-navigation.html), verified).

**Patterns for Hanger** (inferred from the above):

- **Saved views, drafted by a model, frozen by the user.** The model proposes one view at a time: a name plus a deterministic predicate over backend fields (kind, reach, path, name or description match, findings). The user accepts, renames or discards it. Accepted views are rules in SQLite, evaluated by the backend each scan. Membership is reproducible, the predicate is unit-testable, and nothing waits on a model to render.
- **Strip layout.** Kind tabs first, a divider, then pinned views in the user's order, model-drafted ones carrying a provenance mark (its label needs a naming brief per `.claude/rules/ui-copy.md`). Overflow goes to a menu.
- **Per-asset tags, if wanted,** follow Linear: suggestions by default, auto-apply as a per-tag opt-in, a visible "why", one-click removal.
- **Dynamic content in fixed slots** (an inspector card, a findings summary, a next action), not dynamic navigation.
- **Degrade to nothing.** No model means no suggestions; invalid output fails schema validation and is dropped.

**What stays fixed.** The kind tabs, their order (All, Skills, MCP servers, Rules, Subagents in `src/components/CategoryFilterCards.tsx`) and their ←/→ keys. Every count, a view's badge included, comes from `count_assets` (`src-tauri/src/scanner.rs`), never `.length` on a model list (`.claude/rules/invariants.md`). No view hides an asset: All stays ground truth. A view is a lens, never a write. A view matching zero assets is a finding about the rule, not the machine.

## A2UI and AG-UI

These are two different layers, not rival answers to one question. A2UI describes a piece of UI. AG-UI carries events between an agent and an app.

**A2UI.** Google started it. It now lives in the `a2ui-project` org under Apache-2.0 ([repo](https://github.com/a2ui-project/a2ui), verified). v0.8 went public on 2025-12-15 ([launch post](https://developers.googleblog.com/introducing-a2ui-an-open-project-for-agent-driven-interfaces/), verified). Google calls v1.0, released 2026-11-11, "the first stable version" ([1.0 post](https://developers.googleblog.com/a2ui-10-build-delightful-fast-reliable-agentic-experiences/), verified), and the spec marks v0.8 deprecated ([versions.json](https://raw.githubusercontent.com/a2ui-project/a2ui/main/specification/versions.json), verified). The agent sends JSON messages (`createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface`, plus function calls). The client sends back `action` and `error`. A surface is a flat list of components wired by ID, with a separate data model updated by JSON Pointer. The spec names no required transport. It lists AG-UI, A2A, MCP, SSE, WebSockets and REST as bindings ([spec v1.0](https://a2ui.org/specification/v1.0-a2ui/), verified).

The constraint is the catalogue. The client declares `supportedCatalogIds` at session start. Each catalogue entry pairs a component schema with one of the client's own native components. The agent sends "only component types and properties that the renderer knows how to build natively, never raw HTML, CSS, or executable scripts" ([catalogs](https://a2ui.org/concepts/catalogs/), verified). Schemas set `additionalProperties: false`, and arguments that fail validation "are not sent" ([spec v1.0](https://a2ui.org/specification/v1.0-a2ui/), verified). The basic catalogue is optional. Replacing it with your own components is the intended path ([catalogs](https://a2ui.org/concepts/catalogs/), verified). `@a2ui/react` is listed among the official renderers ([SDKs](https://a2ui.org/concepts/sdks/), verified); its React 19 support was not checked. Named adopters are Jira, Alation, ByteDance's Lynx renderer and Gemini surfaces ([1.0 post](https://developers.googleblog.com/a2ui-10-build-delightful-fast-reliable-agentic-experiences/), verified). None of the engines in `AGENT_CONFIGS` appeared as an emitter or renderer (inferred).

**AG-UI.** CopilotKit created it. It is MIT-licensed, and the repo announces "AG-UI 1.0" ([repo](https://github.com/ag-ui-protocol/ag-ui), verified). It is a run-scoped stream of typed events: run start and finish, text message and tool call families, `StateSnapshot`, `StateDelta` as JSON Patch, and `Custom` ([events](https://docs.ag-ui.com/concepts/events), verified). The frontend sends one `RunAgentInput` per run. HTTP implementations must support SSE, and in-process channels are allowed ([transports](https://docs.ag-ui.com/spec/1.0/basic/transports/index.md), verified). It says outright that it "is not a generative UI specification" and that it carries A2UI, MCP-UI and Open-JSON-UI payloads ([generative UI specs](https://docs.ag-ui.com/concepts/generative-ui-specs), verified). No page read states a security model, and its generative-UI draft lists HTML as a possible output ([draft](https://docs.ag-ui.com/drafts/generative-ui.md), verified). Approval is an interrupt: the run ends with `outcome: interrupt`, and a new run must resume it ([interrupt-resume](https://docs.ag-ui.com/spec/1.0/basic/patterns/interrupt-resume.md), verified). The official SDKs are TypeScript and Python. The Rust SDK is community-maintained and client-side only ([Rust SDK](https://docs.ag-ui.com/sdk/rust/overview), verified). No coding CLI speaks it natively. Multi-CLI wrappers drive Claude Code, Codex, OpenCode and Gemini CLI over ACP instead ([AG2](https://docs.ag2.ai/docs/user-guide/cli_agents/), inferred).

**How they relate.** Google's launch post says AG-UI "fully supports the A2UI spec" (verified, launch post). AG-UI places itself beside MCP (agent to tools) and A2A (agent to agent) ([agentic protocols](https://docs.ag-ui.com/agentic-protocols.md), verified). Neither project mentions ACP (verified as absence on the pages read). ACP and AG-UI cover the same edge, an app talking to an agent, in different shapes. ACP's `session/request_permission` pauses inside a live turn and waits for a reply ([ACP](https://agentclientprotocol.com/protocol/tool-calls), verified). AG-UI closes the run and starts a new one (inferred from both specs).

**What each means for Hanger** (all inferred from the above and the rulings):

- *Saved views (ruling 6).* A view is a name and a deterministic predicate, which is data, not UI. Neither protocol defines a predicate. A JSON schema for the predicate, checked in Rust, gives the same closed vocabulary and validation that A2UI's catalogue gives, without a renderer. The kind tabs stay fixed either way.
- *The in-app model run (rulings 1 and 2).* The engines speak ACP, `codex app-server` JSON-RPC or `stream-json`, not AG-UI. Adopting AG-UI would make Hanger the producer-side adapter with no official Rust SDK. Its run-ending interrupt would also sit awkwardly over a CLI that is waiting mid-turn. Hanger's frontend talks to Rust over Tauri IPC, so a network-grade transport buys it nothing. Ollama (ruling 7) returns only tags and duplicate pairs, so it needs no UI protocol.
- *Dynamic content in fixed slots.* A2UI does fit here. A model-filled explanation or next-action card is "a model picks components and data", and Hanger's design system maps directly onto a custom catalogue. Each catalogue entry would be an existing typed component that already has a specimen, so the design-system coverage guard still applies, and tokens stay the only styling.
- *Hanger's own MCP server (ruling 3).* It should return plain structured tool results. A2UI over MCP travels as `application/a2ui+json` resources ([A2UI in MCP Apps](https://a2ui.org/guides/a2ui-in-mcp-apps/), verified), but no engine Hanger serves was found to render them. AG-UI plays no part in MCP.

**Best for Hanger: A2UI, later, for model-filled cards in fixed slots; AG-UI not at all.** A2UI's trusted catalogue is the same discipline Hanger's design system already enforces: typed components, tokens only and no injected markup. So it can become the contract for model output that reaches the screen. AG-UI solves transport between one frontend and many agent frameworks over a network. Hanger has neither problem, and its engines speak ACP or their own JSON-RPC. First adoption: nothing now. Saved views ship as Hanger's own predicate schema. When the in-app model run (rulings 1 and 2) first produces an explanation card, define a Hanger A2UI catalogue limited to existing specimened components and render it through `@a2ui/react` or a small renderer of Hanger's own. What would change the verdict: an engine Hanger drives starting to emit AG-UI or A2UI natively; Hanger needing to render UI from third-party agents or MCP servers; or `@a2ui/react` failing on React 19 or costing more than a typed JSON contract, in which case the answer becomes neither.

## 5. Safety: Hanger reads exactly the files the attacks live in

Tool descriptions poison the model on `tools/list` before any call, and can change after approval ([Invariant Labs](https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks), verified; [Trail of Bits](https://blog.trailofbits.com/2025/04/21/jumping-the-line-how-mcp-servers-can-attack-you-before-you-ever-use-them/), verified). 91% of confirmed-malicious skills in Snyk's study used prompt injection ([Snyk](https://snyk.io/blog/toxicskills-malicious-ai-agent-skills-clawhub/), verified). OWASP knows no foolproof prevention ([OWASP LLM01](https://genai.owasp.org/llmrisk/llm01-prompt-injection/), verified). Willison's advice: never combine private data, untrusted content and external communication ([lethal trifecta](https://simonwillison.net/2025/Jun/16/the-lethal-trifecta/), verified). One Hanger model session could read every engine's untrusted text at once (inferred).

The defences with security arguments are architectural: CaMeL solves about 77% of AgentDojo tasks with provable security against 84% undefended ([CaMeL](https://arxiv.org/abs/2503.18813), verified), and once an agent has read untrusted input "it must be constrained" ([Willison summary](https://simonwillison.net/2025/Jun/13/prompt-injection-design-patterns/), verified). Classifiers are a layer: Anthropic's auto-mode classifier misses 17% of real overeager actions ([Anthropic](https://www.anthropic.com/engineering/claude-code-auto-mode), verified).

**Rules for Hanger** (inferred from the above):

1. **Quarantined reading.** A model reading a skill or tool description returns a closed schema validated in Rust. Its free text is shown, never parsed into an action.
2. **Writes from an enum Hanger owns.** The model may propose `switch_mcp(engine, server, on|off)` or `toggle_skill(name)`, checked against the store and `SWITCHES`. The existing writer (parse check, refuse if changed, backup, receipt, rename, read-back, Undo) runs unchanged. Paths never come from model text.
3. **Strip the engine's tools for reads.** A `claude -p` reader gets no tools and no network; a `codex exec` reader gets `read-only` and no approvals. No exact invocation was tested.
4. **Never write another engine's approval settings** on a model's suggestion: Claude `permissions`, Codex `approval_policy` and `sandbox_mode`, Gemini `trustedFolders.json`.
5. **Approve per write, showing the literal change**: the one-key diff, or the untruncated `add-json` argv, as the MCP spec's "MUST" for server setup requires ([MCP security](https://modelcontextprotocol.io/specification/draft/basic/security_best_practices), verified). Users accept 93% of prompts ([Anthropic](https://www.anthropic.com/engineering/claude-code-auto-mode), verified), so keep prompts rare and batch them on one diff screen.
6. **Structural redaction.** 55% of hardcoded MCP secrets match no vendor format ([Help Net Security on Hush](https://www.helpnetsecurity.com/2026/09/18/hush-security-mcp-credential-exposure-report/), verified, vendor study), so patterns are not enough. Send names, transport, command basename and env and header key names only, extending `mcp::redact` to a third consumer.
7. **Hash on review.** A changed tool description or skill raises a Needs review finding, as Trail of Bits recommends. No model needed.
8. **Log by hash**: request, enum action, hashes of texts in context, approval, receipt. No config values.

**Privacy follows the engine.** Consumer Claude plans train "when this setting is on" with five-year retention; commercial terms do not train by default and keep 30 days ([Claude Code data usage](https://code.claude.com/docs/en/data-usage), verified). OpenAI API data is not used for training unless opted in ([OpenAI](https://developers.openai.com/api/docs/guides/your-data), verified). Headless runs leave plaintext transcripts under `~/.claude/projects/` for 30 days (data usage page, verified). Consent copy should name the engine and plan type, and telemetry must never carry model inputs or outputs (inferred).

**macOS.** A CLI Hanger spawns is generally attributed to Hanger for TCC, so Hanger's grants become the engine's ([Apple forums](https://developer.apple.com/forums/thread/731504), inferred).

## Options for Hanger

**A. Model-free first, Hanger as an MCP server.** First ship: deterministic findings (hash change, plaintext secret slot, unpinned `npx`/`uvx`, `curl | sh` in SKILL.md), the Antigravity and shared-directory reach fixes, and engine status. Then a stdio MCP server exposing `list_assets`, `get_reach`, `get_findings` and a `switch_server` proposal that Hanger's UI approves. Cost: moderate Rust work, MCP spec churn. Risk: low; users get model help through their own engines and terms.

**B. Headless installed engine, per the ruling.** Hanger spawns `codex exec` or `codex app-server`, and `claude -p`, as a quarantined reader; app-server or ACP routes approvals into Hanger's cards. First ship: "explain this server across engines", schema-constrained. Cost: per-version flag and schema tracking. Risk: Claude terms, untrusted hooks in non-bare runs, Gemini OAuth.

**C. Local model layer.** Ollama, when present, does tagging, view drafts and embedding dedup. Cost: small. Risk: low accuracy on 2 to 4B models and absence on most machines; a missing daemon reads "not available", never empty.

**D. Gateway.** Hanger aggregates MCP servers so switching is mid-session. Cost: highest. Risk: `list_changed` is contradictory for Claude Code and unconfirmed elsewhere, and engine configs would point at Hanger, changing ownership.

**Recommendation: A, then a constrained B, with C optional; defer D.** A delivers the measured value (cost, reach, findings) without a model, and fixes shipped drift that would otherwise have a model explain wrong facts. B then adds explanation and previewed operations, as a quarantined reader with writes kept in Rust.

**Testing the 2026-11-24 ruling** (`docs/TODO.md` → T20). "No model or key of Hanger's own" and "approval for every write" both hold. Three parts need amending. The Claude default: the terms are ambiguous for a local app driving a signed-in binary, the documented path (`--bare`) needs an API key, and Codex has clearer local-runtime terms. "Reads freely in scope": a non-bare `-p` run in a repo executes its hooks and `.mcp.json` servers with no trust prompt, so reading a project must not mean running Claude Code in it unless the user trusts that folder. The engine as reader keeps its own tools, the exfiltration leg of the trifecta, so reads need tools stripped. Gemini support should be API-key or Vertex only.

**T18 and T19.** The direction absorbs T19 entirely: version-gated flags, sign-in state and the Gemini/Antigravity split are prerequisites for any engine run. It absorbs T18 slice 3's findings (widened with hash-change and skill-script checks) and the vendor-CLI half of slice 5 (`claude plugin --json`, `gh skill`). Slices 2 and 4 stay deterministic slices the model later drives. Slice 6 waits for a `list_changed` spike per engine.

## Questions for Karthik

:::question
Which engine should Hanger use by default for model runs?

This sets the terms risk of every model feature. Anthropic's terms are ambiguous for a local app driving a signed-in `claude`; OpenAI's allow local-runtime requests.

- [ ] Codex by default until Anthropic answers — clearest published terms for local use
- [ ] Claude Code by default, as ruled — most users and richest surface, terms unresolved
- [ ] No default, the user picks — no implied endorsement, one more setup step

Recommended: Codex by default until Anthropic answers
:::

:::question
Should Hanger ask Anthropic before driving a user's Claude subscription?

The legal page bars routing plan credentials "on behalf of" users but allows signing in to the unmodified binary. A written answer settles it.

- [ ] Ask Anthropic first, ship Claude via `--bare` with the user's key meanwhile — documented path, no ambiguity
- [ ] Ship the subscription route now — fastest, carries account-enforcement risk for users
- [ ] Support Claude only through the user's API key — simplest, excludes subscription-only users

Recommended: Ask Anthropic first, ship Claude via `--bare` with the user's key meanwhile
:::

:::question
Should Hanger ship an MCP server of its own before any in-app model?

Users ask their own engines about Hanger's inventory, with no model or key in Hanger. Writes are still approved in Hanger's UI.

- [ ] Yes, first — lowest risk, reuses engines users already run
- [ ] After the in-app model — keeps the first model feature inside Hanger
- [ ] Not at all — avoids exposing inventory to third-party model context

Recommended: Yes, first
:::

:::question
How should Hanger handle Gemini CLI and Antigravity CLI?

Antigravity replaced Gemini CLI for consumers on 2026-06-18 and keeps MCP servers in a different file. Hanger's switch writes the legacy file.

- [ ] Split into two engines with separate switches — reach and switches stay honest per binary
- [ ] One row, two writers — fewer rows, harder to explain partial success
- [ ] Make Antigravity read-only until researched — no wrong writes, a visible gap

Recommended: Split into two engines with separate switches
:::

:::question
Should Codex switches move to the app-server's `config/value/write`?

Codex would do the edit itself. The cost is spawning `codex app-server` and tracking its per-version schema.

- [ ] Spike it, then switch if it round-trips cleanly — vendor-owned writes, less dialect risk
- [ ] Keep the in-place TOML edit — works today, already guarded
- [ ] Use it for skills only — replaces the folder move, leaves MCP alone

Recommended: Spike it, then switch if it round-trips cleanly
:::

:::question
What form should the dynamic tab strip take?

The evidence supports a separate, user-frozen area beside fixed tabs and warns against model-reordered navigation.

- [ ] Saved views the model drafts and the user freezes — predictable, testable, works with no model
- [ ] Per-asset tags with suggestions — finer grain, more noise
- [ ] Neither for now — keep the strip static until the model layer exists

Recommended: Saved views the model drafts and the user freezes
:::

:::question
Should Hanger support a local model through Ollama?

Ollama gives schema output and embeddings over localhost with no key. Most machines lack it, and small models often emit invalid output.

- [ ] Optional, for tagging and dedup only — offline and private, degrades to nothing
- [ ] Optional, plus a user API key — wider reach, Hanger then holds a secret
- [ ] Not now — one less runtime to support

Recommended: Optional, for tagging and dedup only
:::

:::question
What happens to the gateway (T18 slice 6)?

Mid-session switching needs each engine to honour `list_changed`. Claude Code's docs say yes, user issues say no, most engines are unconfirmed.

- [ ] Run a `list_changed` spike per engine first — evidence before building
- [ ] Drop it — "applies to the next session" stays the honest copy
- [ ] Build it for Claude Code and Zed only — confirmed engines, partial reach

Recommended: Run a `list_changed` spike per engine first
:::

## Gaps / unverified

- No Anthropic statement names a local desktop app spawning the user's own `claude` binary.
- The app-server auth sentence and OpenAI prices came through summaries.
- Antigravity headless flags, its stdout bug and wrapper legality are snippet-level; its settings file and hooks were not found.
- Whether `config/value/write` reaches a running Codex session, and Codex `list_changed` handling, are unknown.
- The Claude Code `list_changed` issues were not opened.
- No accuracy data exists for contradiction detection, scanner recall, small-model classification or pre-session recommendations.
- No study tests model-generated navigation; the HCI results concern frequency-based menus.
- TCC attribution for spawned CLIs rests on forum posts.
- None of the section 3 findings has been checked against Hanger's code.

## Rulings (Karthik, 2026-11-27, in Plannotator)

Approved, all eight questions answered:

1. Default engine for model runs: **none; the user picks.** (Not the recommendation.)
2. Anthropic: **ask Anthropic first; meanwhile ship Claude only via `--bare` with the user's own key.**
3. **Hanger ships an MCP server of its own first,** before any in-app model.
4. Gemini CLI and Antigravity CLI: **split into two engines with separate switches** (see `docs/TODO.md` T22).
5. Codex switches: **spike `config/value/write` on the app-server, switch over only if it round-trips cleanly.**
6. Dynamic tab strip: **saved views the model drafts and the user freezes;** kind tabs stay fixed.
7. Local model through Ollama: **optional, for tagging and dedup only.**
8. Gateway (T18 slice 6): **run a `list_changed` spike per engine first.**

### Further questions

:::question
Should model output that reaches the screen use an A2UI catalogue, or a typed JSON contract of Hanger's own?

This decides the format for model-filled cards in fixed slots, such as an explanation or a next action, once the in-app model run exists. A2UI 1.0 is stable and its catalogue maps onto Hanger's specimened components. A contract of Hanger's own is smaller, but it would reinvent the same validation.

- [ ] A2UI catalogue of existing specimened components — a stable public schema, an official React renderer, and the coverage guard still applies
- [ ] Hanger's own typed JSON contract — no dependency, but Hanger owns the schema and its validation
- [ ] Decide when the first card is built — keep the choice open until the model run ships

Recommended: A2UI catalogue of existing specimened components
:::
