//! Every string the server sends an engine, as Karthik signed them off on
//! 2026-11-27 (`docs/plans/2026-11-27-hanger-mcp-server-naming-brief.md`,
//! "Answers"). Change one only through that brief.
//!
//! The Antigravity sentence is true until T22 (`fix/antigravity-source`)
//! lands; whichever branch merges second removes it, here and in
//! `LIST_ENGINES` (plan ruling Q9).

use super::tools::Refusal;

/// (name, title, description)
pub const LIST_ENGINES: (&str, &str, &str) = (
    "list_engines",
    "Engines on this Mac",
    "Lists the engines Hanger finds on this Mac. For each engine that declares MCP servers, says how many are on and how many are off, and what the ones Hanger has measured cost in tokens. Engine folders and config files are read when you call this; the asset totals come from Hanger's last scan. Antigravity's MCP servers are not read.",
);
pub const ENGINE_CONTEXT: (&str, &str, &str) = (
    "engine_context",
    "An engine's MCP servers",
    "Lists one engine's MCP servers: each server's name, its config file, whether it is on, and its tool count and token cost if Hanger has measured it. Reads the engine's config files when you call this. Launch commands, arguments and environment values are left out. Takes an engine_id from list_engines.",
);
pub const FIND_ASSETS: (&str, &str, &str) = (
    "find_assets",
    "Find skills, rules, subagents and servers",
    "Searches the names and text of the skills, rules, subagents and MCP servers in Hanger's last scan, and the tools of servers Hanger has measured. Returns up to 50 matches, each with its kind, name, path and where it lives. The matching text is not returned. Paths start with ~/.",
);
pub const REACH: (&str, &str, &str) = (
    "reach",
    "Which engines read an asset",
    "Says which engines read one asset in an engine's global folder, and through which folder link. Takes the asset's path as find_assets returns it. Assets in project folders aren't covered. Uses Hanger's last scan, and checks links on disk when you call it.",
);
pub const FINDINGS: (&str, &str, &str) = (
    "findings",
    "Broken links and parse failures",
    "Lists broken and drifted links in engines' global folders, and files Hanger couldn't parse in any folder, from Hanger's last scan. Duplicates and drift in project folders are left out, so this is less than Hanger's Needs review list. Parser messages are not returned.",
);

pub const INSTRUCTIONS: &str = "Read-only answers about the AI engines on this Mac and their skills, rules, subagents and MCP servers, from Hanger's store and the engines' config files. Most answers come from Hanger's last scan, and every reply carries as_of_ms, the time that scan finished. Paths start with ~/. Nothing here changes a file. Antigravity's MCP servers are not read.";

pub fn refusal(r: Refusal) -> &'static str {
    match r {
        Refusal::NotScannedYet => "Hanger hasn't finished a scan on this Mac yet. Open Hanger, let it scan, then ask again.",
        Refusal::OtherVersion => "Hanger's store was written by a different version of Hanger. Open Hanger once, then ask again.",
        Refusal::Busy => "Hanger's store is busy, probably mid-scan. Try again in a few seconds.",
        Refusal::Unreadable => "Hanger couldn't read its store.",
        Refusal::NotFound => "Hanger has nothing under that engine id or path. list_engines and find_assets give ones it knows.",
        Refusal::BadArgument => "limit must be from 1 to 50.",
        Refusal::SlowDown => "More than 30 calls in 10 seconds. Wait a few seconds, then try again.",
    }
}
