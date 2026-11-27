//! Hanger's own MCP server: a stdio server inside the Hanger binary that the
//! user's engines launch, answering read-only questions about the harness
//! from Hanger's store and the engines' config files. It never writes an
//! engine's config. Plan: `docs/plans/2026-11-27-hanger-mcp-server.md`.

pub mod places;
pub mod limit;
pub mod tools;
