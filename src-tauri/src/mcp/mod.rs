//! Everything Hanger knows about how MCP servers are declared on this machine.
//!
//! The rest of the codebase asks this module *what is registered*; it never
//! learns a config path, a JSON key, or a TOML table name. Adding a new host
//! should be a row in `registry::SOURCES` and nothing else.

pub mod agreement;
pub mod dialect;
pub mod discover;
pub mod engine_summary;
pub mod freshness;
pub mod identity;
pub mod observe;
pub mod probe;
pub mod redact;
pub mod registry;
pub mod servers;
