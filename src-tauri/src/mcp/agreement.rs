//! Whether the registrations of one server agree with each other.
//!
//! A server name can be declared by more than one host, or more than once by
//! the same host. `agreement_for` decides what that means: the same launch
//! everywhere is `Consistent`, the same launch declared twice by one engine
//! is redundant (`Duplicate`), and anything else is `Conflicting`.
//!
//! **The comparison key is `(transport, url_fingerprint, launch)`, never
//! launch alone.** Karthik's ruling, 2026-08-17. A remote server's launch is
//! empty — its whole identity lives in `transport` — so comparing launch
//! alone made every HTTP server invisible to divergence detection: two
//! registrations at different URLs both hash the empty launch and read as
//! agreeing.
//!
//! `transport` alone is not enough either. `transport` is sanitised for
//! display and drops the query string (`dialect::sanitise_url`), so two
//! endpoints differing only by `?region=` render — and would compare —
//! identically. `url_fingerprint` is a hash of the endpoint as configured,
//! before that sanitisation, carried for exactly this comparison and never
//! rendered.
//!
//! `mcp-remote` and other local bridges are unwrapped before the key is
//! built, via `dialect::unwrap_bridge`. Skipping that step makes a bridged
//! stdio launch (`npx mcp-remote <url>`) compare as `stdio` against every
//! other host's direct `(http, url)` declaration of the same server, so a
//! Zed registration would report as permanently conflicting with everyone
//! else even when it proxies the identical endpoint. A bridge's fingerprint
//! is computed fresh, from the URL `unwrap_bridge` recovers, since
//! `McpServer::url_fingerprint` is only ever set for a direct declaration.

use std::collections::HashMap;

use crate::mcp::dialect::{unwrap_bridge, url_fingerprint};
use crate::mcp::discover::Registration;
use crate::mcp::identity::{launch_hash, normalise_launch};

/// Whether a server's registrations agree with each other.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Agreement {
    /// Every registration resolves to the same `(transport, url_fingerprint,
    /// launch)`.
    Consistent,
    /// Two or more distinct specs are declared for the same name — including
    /// two different transports. Different transports mean different
    /// software, not a spec diff to reconcile.
    Conflicting,
    /// The same spec, declared more than once by the same engine. Redundant
    /// registration, not disagreement.
    Duplicate,
}

/// The verdict for one server name, plus what a later stage needs to render
/// it.
///
/// `aliased_with` is always empty here — aliasing is a cross-group
/// annotation computed in `group_servers` (Task 5), not a property of one
/// group's own registrations.
#[derive(Debug, Clone)]
pub struct ServerAgreement {
    pub verdict: Agreement,
    pub aliased_with: Vec<String>,
    pub distinct_specs: usize,
}

/// The `(transport, url_fingerprint, launch)` comparison key for one
/// registration.
///
/// A bridge is unwrapped first: if `unwrap_bridge` recovers the endpoint a
/// stdio launch actually proxies, the launch is treated as empty (there is
/// nothing left to distinguish it by), the transport becomes that endpoint,
/// and its fingerprint is computed fresh — the same key a direct
/// `{"url": …}` registration of the same server produces.
type Key = (String, Option<String>, String);

fn comparison_key(reg: &Registration) -> Key {
    let server = &reg.server;
    let (transport, fingerprint, command, args): (String, Option<String>, &str, &[String]) =
        match unwrap_bridge(&server.command, &server.args) {
            Some(url) => {
                let fp = url_fingerprint(&url);
                (url, Some(fp), "", &[])
            }
            None => (
                server.transport.clone(),
                server.url_fingerprint.clone(),
                server.command.as_str(),
                server.args.as_slice(),
            ),
        };

    let normalised = normalise_launch(
        command,
        args,
        &server.env_keys,
        server.project_root.as_deref(),
    );
    (transport, fingerprint, launch_hash(&normalised))
}

/// Decides how the registrations of one server name agree.
///
/// `regs` is assumed to already be one name's group (`group_servers`, Task 5,
/// owns forming the groups); this function does not itself group or fold
/// names.
pub fn agreement_for(regs: &[Registration]) -> ServerAgreement {
    let keys: Vec<Key> = regs.iter().map(comparison_key).collect();

    let mut distinct: Vec<&Key> = Vec::new();
    for key in &keys {
        if !distinct.contains(&key) {
            distinct.push(key);
        }
    }
    let distinct_specs = distinct.len();

    let verdict = if distinct_specs > 1 {
        Agreement::Conflicting
    } else {
        // Every registration shares one spec. Duplicate if the same engine
        // declared it more than once — redundant, not disagreement.
        let mut per_host: HashMap<&str, usize> = HashMap::new();
        for reg in regs {
            *per_host.entry(reg.host_id).or_insert(0) += 1;
        }
        if per_host.values().any(|&count| count > 1) {
            Agreement::Duplicate
        } else {
            Agreement::Consistent
        }
    };

    ServerAgreement {
        verdict,
        aliased_with: Vec::new(),
        distinct_specs,
    }
}
