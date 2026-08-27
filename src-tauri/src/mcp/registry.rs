//! The static table of MCP hosts and the files they declare servers in.
//!
//! Pure data — no I/O, no filesystem access. `discover` resolves these
//! entries against a real home directory.

/// What a program does with MCP servers.
///
/// `Agent` hosts also own skills, rules and subagents, so they are valid
/// deploy targets. `McpHost` consumes MCP and nothing else — it must never
/// appear as a target for a skill deployment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostKind {
    Agent,
    McpHost,
}

/// Which of the three upstream MCP scopes a source populates.
///
/// `Global` is Hanger's machine-wide tier. `User` and `Local` are Claude
/// Code's own terms: user-tier loads everywhere, local-tier loads only in the
/// project it is keyed to, and both live in `~/.claude.json`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScopeTier {
    Global,
    User,
    Local,
    Project,
}

/// The shape of a config file's server declarations.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Dialect {
    /// `{"mcpServers": {name: {...}}}` — the common case.
    McpServers,
    /// `{"servers": {name: {type, ...}}}` — VS Code.
    VsCodeServers,
    /// `[mcp_servers.name]` TOML tables — Codex.
    CodexToml,
    /// `{"context_servers": {name: {...}}}` — Zed.
    ZedContextServers,
    /// `mcpServers` plus `projects[abs_path].mcpServers` — Claude Code.
    ClaudeJson,
    /// `claudeAiMcpEverConnected` — account-level Claude.ai connectors.
    ///
    /// These run on Anthropic's servers, so no config file describes them and
    /// nothing local can be started. The breadcrumb is the only on-disk trace
    /// they exist, and without it Hanger claims to show every MCP server while
    /// omitting them.
    ClaudeAiConnectors,
    /// `{"mcp": {name: {type: "local"|"remote", ...}}}` — OpenCode, and Kilo
    /// Code, whose v7 config is OpenCode-derived and uses the same key.
    OpenCodeMcp,
    /// `{"amp.mcpServers": {name: {...}}}` — Amp nests its servers under a
    /// dotted key inside a general settings file rather than owning the file.
    AmpSettingsKey,
    /// A format Hanger detects but deliberately does not parse.
    ///
    /// Zero servers and "we cannot read this file" are indistinguishable to a
    /// user, and the second is a fact about Hanger rather than about their
    /// machine. Naming it turns a silent gap into a stated one, and every
    /// engine that ships after us inherits the honest state rather than
    /// looking broken.
    Unsupported,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceLocation {
    /// Path is relative to the home directory.
    HomeRelative,
    /// Path is relative to a repository root.
    RepoRelative,
    /// Path is relative to the filesystem root — managed and system-wide
    /// configuration. Stored WITHOUT a leading slash: `Path::join` on an
    /// absolute path discards the base, which would defeat the system root
    /// `discover_machine_at` passes and silently read the host.
    SystemAbsolute,
}

#[derive(Debug, Clone, Copy)]
pub struct McpHost {
    pub id: &'static str,
    pub display_name: &'static str,
    pub kind: HostKind,
}

#[derive(Debug, Clone, Copy)]
pub struct McpSource {
    pub host_id: &'static str,
    pub location: SourceLocation,
    /// Home-relative or repo-relative. A `*` segment marks a glob.
    pub path: &'static str,
    pub tier: ScopeTier,
    pub dialect: Dialect,
}

pub const HOSTS: &[McpHost] = &[
    McpHost { id: "claude-code", display_name: "Claude Code", kind: HostKind::Agent },
    McpHost { id: "codex", display_name: "Codex", kind: HostKind::Agent },
    McpHost { id: "gemini", display_name: "Gemini / Antigravity", kind: HostKind::Agent },
    McpHost { id: "claude-desktop", display_name: "Claude Desktop", kind: HostKind::McpHost },
    McpHost { id: "vscode", display_name: "VS Code", kind: HostKind::McpHost },
    McpHost { id: "cursor", display_name: "Cursor", kind: HostKind::McpHost },
    // Rebranded from Windsurf on 2026-06-02. The id stays `windsurf` because
    // it keys existing rows and ids are internal; only the label is user-
    // facing, and it names a product that no longer exists.
    McpHost { id: "windsurf", display_name: "Devin Desktop", kind: HostKind::McpHost },
    McpHost { id: "zed", display_name: "Zed", kind: HostKind::McpHost },
    // Account-level, not machine configuration. Its servers run on
    // Anthropic's infrastructure; only the fact of connection is on disk.
    McpHost { id: "claude-ai", display_name: "Claude.ai", kind: HostKind::McpHost },
    McpHost { id: "kiro", display_name: "Kiro", kind: HostKind::Agent },
    McpHost { id: "trae", display_name: "Trae", kind: HostKind::Agent },
    McpHost { id: "opencode", display_name: "OpenCode", kind: HostKind::Agent },
    McpHost { id: "amp", display_name: "Amp", kind: HostKind::Agent },
    McpHost { id: "roocode", display_name: "Roo Code", kind: HostKind::Agent },
    McpHost { id: "kilocode", display_name: "Kilo Code", kind: HostKind::Agent },
    McpHost { id: "cline", display_name: "Cline", kind: HostKind::Agent },
];

/// Local bridges that proxy a remote MCP endpoint over stdio.
///
/// A table rather than a literal buried in the parser: `mcp-remote` is the
/// common wrapper today and others will appear, and adding one must be a row.
pub const BRIDGES: &[&str] = &["mcp-remote"];

/// Runners that precede the real program in a launch.
pub const RUNNERS: &[&str] = &["npx", "bunx", "uvx", "pnpm", "yarn"];

use Dialect::*;
use ScopeTier::*;
use SourceLocation::*;

pub const SOURCES: &[McpSource] = &[
    // Claude Code — user tier and local tier share one file.
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".claude.json", tier: User, dialect: ClaudeJson },
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".claude.json", tier: Local, dialect: ClaudeJson },
    // ~/.mcp.json — reached by Claude Code's ancestor walk from any project
    // under $HOME (measured 2026-08-27; the docs say "project root" and are
    // incomplete). Global by ruling: it reaches every project under home.
    // Mid-tree .mcp.json files are the RepoAncestors row in Plan B.
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".claude/mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".claude/settings.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: HomeRelative, path: ".claude/plugins/marketplaces/*/.mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: RepoRelative, path: ".mcp.json", tier: Project, dialect: McpServers },
    McpSource { host_id: "claude-code", location: RepoRelative, path: ".claude/settings.json", tier: Project, dialect: McpServers },

    // Managed MCP servers — a deployed, fleet-wide server set, same format as
    // a project .mcp.json (code.claude.com/docs/en/managed-mcp, fetched
    // 2026-08-27). KNOWN GAP: when this file exists it takes EXCLUSIVE
    // control and suppresses every other source, which Hanger reads but does
    // not model — it will list the suppressed sources as reaching. Karthik's
    // ruling 2026-08-27: ship the read now, record the gap
    // (docs/roadmap.md, reach-state entry).
    McpSource { host_id: "claude-code", location: SystemAbsolute, path: "Library/Application Support/ClaudeCode/managed-mcp.json", tier: Global, dialect: McpServers },

    // Claude.ai — account-level connectors, not machine configuration.
    McpSource { host_id: "claude-ai", location: HomeRelative, path: ".claude.json", tier: Global, dialect: ClaudeAiConnectors },

    // Codex
    McpSource { host_id: "codex", location: HomeRelative, path: ".codex/config.toml", tier: Global, dialect: CodexToml },
    McpSource { host_id: "codex", location: RepoRelative, path: ".codex/config.toml", tier: Project, dialect: CodexToml },

    // Gemini
    McpSource { host_id: "gemini", location: HomeRelative, path: ".gemini/settings.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "gemini", location: RepoRelative, path: ".gemini/settings.json", tier: Project, dialect: McpServers },

    // Gemini's system tier — outranks workspace and user, and MERGES with
    // them rather than suppressing (gemini-cli docs/cli/enterprise.md,
    // fetched 2026-08-27), so listing it alongside the others is accurate.
    McpSource { host_id: "gemini", location: SystemAbsolute, path: "Library/Application Support/GeminiCli/settings.json", tier: Global, dialect: McpServers },

    // Claude Desktop
    McpSource { host_id: "claude-desktop", location: HomeRelative, path: "Library/Application Support/Claude/claude_desktop_config.json", tier: Global, dialect: McpServers },

    // VS Code
    McpSource { host_id: "vscode", location: HomeRelative, path: "Library/Application Support/Code/User/mcp.json", tier: Global, dialect: VsCodeServers },
    McpSource { host_id: "vscode", location: RepoRelative, path: ".vscode/mcp.json", tier: Project, dialect: VsCodeServers },

    // Cursor
    McpSource { host_id: "cursor", location: HomeRelative, path: ".cursor/mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "cursor", location: RepoRelative, path: ".cursor/mcp.json", tier: Project, dialect: McpServers },

    // Devin Desktop (formerly Windsurf).
    // Legacy Cascade agent — still read, so still declared.
    McpSource { host_id: "windsurf", location: HomeRelative, path: ".codeium/windsurf/mcp_config.json", tier: Global, dialect: McpServers },
    // Devin Local, the default agent for new tabs. Without these three a
    // Devin Desktop user on the default agent sees zero servers.
    McpSource { host_id: "windsurf", location: HomeRelative, path: ".config/devin/config.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "windsurf", location: RepoRelative, path: ".devin/config.json", tier: Project, dialect: McpServers },
    McpSource { host_id: "windsurf", location: RepoRelative, path: ".devin/mcp_config.json", tier: Project, dialect: McpServers },

    // Zed
    McpSource { host_id: "zed", location: HomeRelative, path: ".config/zed/settings.json", tier: Global, dialect: ZedContextServers },

    // Kiro
    McpSource { host_id: "kiro", location: HomeRelative, path: ".kiro/settings/mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "kiro", location: RepoRelative, path: ".kiro/settings/mcp.json", tier: Project, dialect: McpServers },

    // Trae
    McpSource { host_id: "trae", location: RepoRelative, path: ".trae/mcp.json", tier: Project, dialect: McpServers },

    // OpenCode
    McpSource { host_id: "opencode", location: HomeRelative, path: ".config/opencode/opencode.json", tier: Global, dialect: OpenCodeMcp },
    McpSource { host_id: "opencode", location: RepoRelative, path: "opencode.json", tier: Project, dialect: OpenCodeMcp },

    // Amp — servers nest inside a settings file Amp does not own.
    McpSource { host_id: "amp", location: HomeRelative, path: ".config/amp/settings.json", tier: Global, dialect: AmpSettingsKey },

    // Roo Code
    McpSource { host_id: "roocode", location: RepoRelative, path: ".roo/mcp.json", tier: Project, dialect: McpServers },

    // Kilo Code — JSONC. `discover.rs` reads every source that resolves to an
    // existing file and appends all registrations; Hanger enforces no
    // precedence between `.kilo/kilo.jsonc` and the root `kilo.jsonc` below.
    // Kilo Code itself prefers `.kilo/kilo.jsonc` when both are present, but
    // a user with both and an overlapping server name sees both entries here.
    McpSource { host_id: "kilocode", location: HomeRelative, path: ".config/kilo/kilo.jsonc", tier: Global, dialect: OpenCodeMcp },
    McpSource { host_id: "kilocode", location: RepoRelative, path: ".kilo/kilo.jsonc", tier: Project, dialect: OpenCodeMcp },
    McpSource { host_id: "kilocode", location: RepoRelative, path: "kilo.jsonc", tier: Project, dialect: OpenCodeMcp },

    // Cline — its MCP settings live in VS Code's extension storage, keyed by
    // an extension id that can change. Declared explicitly so a change breaks
    // a test rather than silently reporting zero servers.
    McpSource { host_id: "cline", location: HomeRelative, path: "Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json", tier: Global, dialect: McpServers },

    // Continue is NOT registered here. Its format and path were verified
    // against upstream docs and qualify ("YAML at a path we can name" —
    // ~/.continue/config.yaml, top-level `mcpServers` key), but adding the
    // HOSTS entry fails `src/__tests__/brand-coverage.test.ts`, which
    // requires every host id to resolve to a mark in `src/data/brands.ts` —
    // a file outside this task's touch scope. See docs/roadmap.md.
];

impl McpHost {
    /// The stable `engines.key` for this host.
    ///
    /// The database uses underscores where registry ids use hyphens.
    pub fn engine_key(&self) -> String {
        self.id.replace('-', "_")
    }
}

pub fn host_by_id(id: &str) -> Option<&'static McpHost> {
    HOSTS.iter().find(|h| h.id == id)
}

/// Resolve a host from its `engines.key`.
///
/// `kind` is derived through this lookup rather than stored as a column.
/// Whether VS Code is an MCP-only host is a fact about VS Code, fixed at
/// compile time — not per-machine state. Persisting it would duplicate this
/// table inside SQLite, put the two copies out of sync the moment one changed,
/// and demand a schema migration to correct what is really a typo in a
/// constant.
pub fn host_by_engine_key(key: &str) -> Option<&'static McpHost> {
    HOSTS.iter().find(|h| h.engine_key() == key)
}
