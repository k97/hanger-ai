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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SourceLocation {
    /// Path is relative to the home directory.
    MachineAbsolute,
    /// Path is relative to a repository root.
    RepoRelative,
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
    McpHost { id: "windsurf", display_name: "Windsurf", kind: HostKind::McpHost },
    McpHost { id: "zed", display_name: "Zed", kind: HostKind::McpHost },
    // Account-level, not machine configuration. Its servers run on
    // Anthropic's infrastructure; only the fact of connection is on disk.
    McpHost { id: "claude-ai", display_name: "Claude.ai", kind: HostKind::McpHost },
];

use Dialect::*;
use ScopeTier::*;
use SourceLocation::*;

pub const SOURCES: &[McpSource] = &[
    // Claude Code — user tier and local tier share one file.
    McpSource { host_id: "claude-code", location: MachineAbsolute, path: ".claude.json", tier: User, dialect: ClaudeJson },
    McpSource { host_id: "claude-code", location: MachineAbsolute, path: ".claude.json", tier: Local, dialect: ClaudeJson },
    McpSource { host_id: "claude-code", location: MachineAbsolute, path: ".claude/mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: MachineAbsolute, path: ".claude/settings.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: MachineAbsolute, path: ".claude/plugins/marketplaces/*/.mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "claude-code", location: RepoRelative, path: ".mcp.json", tier: Project, dialect: McpServers },
    McpSource { host_id: "claude-code", location: RepoRelative, path: ".claude/settings.json", tier: Project, dialect: McpServers },

    // Claude.ai — account-level connectors, not machine configuration.
    McpSource { host_id: "claude-ai", location: MachineAbsolute, path: ".claude.json", tier: Global, dialect: ClaudeAiConnectors },

    // Codex
    McpSource { host_id: "codex", location: MachineAbsolute, path: ".codex/config.toml", tier: Global, dialect: CodexToml },
    McpSource { host_id: "codex", location: RepoRelative, path: ".codex/config.toml", tier: Project, dialect: CodexToml },

    // Gemini
    McpSource { host_id: "gemini", location: MachineAbsolute, path: ".gemini/settings.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "gemini", location: RepoRelative, path: ".gemini/settings.json", tier: Project, dialect: McpServers },

    // Claude Desktop
    McpSource { host_id: "claude-desktop", location: MachineAbsolute, path: "Library/Application Support/Claude/claude_desktop_config.json", tier: Global, dialect: McpServers },

    // VS Code
    McpSource { host_id: "vscode", location: MachineAbsolute, path: "Library/Application Support/Code/User/mcp.json", tier: Global, dialect: VsCodeServers },
    McpSource { host_id: "vscode", location: RepoRelative, path: ".vscode/mcp.json", tier: Project, dialect: VsCodeServers },

    // Cursor
    McpSource { host_id: "cursor", location: MachineAbsolute, path: ".cursor/mcp.json", tier: Global, dialect: McpServers },
    McpSource { host_id: "cursor", location: RepoRelative, path: ".cursor/mcp.json", tier: Project, dialect: McpServers },

    // Windsurf
    McpSource { host_id: "windsurf", location: MachineAbsolute, path: ".codeium/windsurf/mcp_config.json", tier: Global, dialect: McpServers },

    // Zed
    McpSource { host_id: "zed", location: MachineAbsolute, path: ".config/zed/settings.json", tier: Global, dialect: ZedContextServers },
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
