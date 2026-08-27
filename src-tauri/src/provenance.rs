//! Where an asset came from, derived at scan time. Four classes in
//! precedence order — declared, delivered, checked out, launched — and a
//! blocked marker for lookups the OS refused, which the panel words
//! differently from "nothing found". Karthik's ruling, 2026-08-27.
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OriginKind {
    Declared,
    Delivered,
    CheckedOut,
    Launched,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Origin {
    pub label: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    pub kind: OriginKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivered_by: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub installed_at_ms: Option<i64>,
}

/// Hosts whose URL path's first two segments name the project, so
/// "owner/repo" is a better label than the hostname.
const FORGE_HOSTS: &[&str] = &["github.com", "gitlab.com", "bitbucket.org", "codeberg.org"];

/// Normalise a source string to (display label, https link). `None` when the
/// value is not a linkable http(s)/ssh remote — the caller keeps it as a
/// label-only origin rather than handing an arbitrary string to the OS.
pub fn normalize_source_url(raw: &str) -> Option<(String, String)> {
    let raw = raw.trim().trim_end_matches('/');
    // scp-like: git@host:owner/repo(.git)
    let https = if let Some(rest) = raw.strip_prefix("git@") {
        let (host, path) = rest.split_once(':')?;
        format!("https://{}/{}", host, path.trim_end_matches(".git"))
    } else if let Some(rest) = raw.strip_prefix("ssh://git@") {
        format!("https://{}", rest.trim_end_matches(".git"))
    } else if raw.starts_with("https://") || raw.starts_with("http://") {
        raw.trim_end_matches(".git").to_string()
    } else {
        return None;
    };
    let after_scheme = https.split_once("://")?.1;
    let mut parts = after_scheme.splitn(2, '/');
    let host = parts.next()?;
    if host.is_empty() {
        return None;
    }
    let path = parts.next().unwrap_or("");
    let label = if FORGE_HOSTS.contains(&host) {
        let segs: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();
        if segs.len() >= 2 {
            format!("{}/{}", segs[0], segs[1])
        } else {
            host.to_string()
        }
    } else {
        host.to_string()
    };
    Some((label, https))
}

pub fn origin_from_declared(raw: &str) -> Origin {
    match normalize_source_url(raw) {
        Some((label, url)) => Origin {
            label,
            url: Some(url),
            kind: OriginKind::Declared,
            commit: None,
            delivered_by: None,
            installed_at_ms: None,
        },
        None => Origin {
            label: raw.trim().to_string(),
            url: None,
            kind: OriginKind::Declared,
            commit: None,
            delivered_by: None,
            installed_at_ms: None,
        },
    }
}
