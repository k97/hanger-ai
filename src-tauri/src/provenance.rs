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

use std::collections::HashMap;
use std::path::Path;

/// The plugin store's two manifests, read once per scan. A missing or
/// malformed manifest is an absent class, never an error; a read the OS
/// refused sets `blocked` so the caller can say "couldn't check" rather
/// than "nothing found".
pub struct PluginIndex {
    /// marketplace name -> https repo url (github sources only carry repos).
    marketplaces: HashMap<String, String>,
    /// plugin name -> (commit sha, installed_at_ms), from the FIRST entry —
    /// a plugin installed at several scopes shares one upstream.
    plugins: HashMap<String, (Option<String>, Option<i64>)>,
    cache_prefix: String,
    marketplaces_prefix: String,
}

impl PluginIndex {
    pub fn load(home: &Path) -> (Option<Self>, bool) {
        let dir = home.join(".claude/plugins");
        let mut blocked = false;
        let mut read = |name: &str| -> Option<serde_json::Value> {
            match std::fs::read_to_string(dir.join(name)) {
                Ok(s) => serde_json::from_str(&s).ok(),
                Err(e) => {
                    if e.kind() == std::io::ErrorKind::PermissionDenied {
                        blocked = true;
                    }
                    None
                }
            }
        };
        let known = read("known_marketplaces.json");
        let installed = read("installed_plugins.json");
        let Some(known) = known else { return (None, blocked) };

        let mut marketplaces = HashMap::new();
        if let Some(map) = known.as_object() {
            for (name, entry) in map {
                let source = &entry["source"];
                if source["source"].as_str() == Some("github") {
                    if let Some(repo) = source["repo"].as_str() {
                        marketplaces
                            .insert(name.clone(), format!("https://github.com/{}", repo));
                    }
                }
            }
        }
        let mut plugins = HashMap::new();
        if let Some(map) = installed
            .as_ref()
            .and_then(|v| v["plugins"].as_object())
        {
            for (key, entries) in map {
                // "plugin-name@marketplace" — the name is everything before
                // the LAST '@', since a scoped plugin name can itself carry
                // a leading '@' (e.g. "@scope/tool-x@mkt-a").
                let plugin = key
                    .rsplit_once('@')
                    .map_or(key.as_str(), |(name, _)| name)
                    .to_string();
                let first = entries.as_array().and_then(|a| a.first());
                let sha = first
                    .and_then(|e| e["gitCommitSha"].as_str())
                    .map(String::from);
                let at = first
                    .and_then(|e| e["installedAt"].as_str())
                    .and_then(parse_iso_ms);
                plugins.insert(plugin, (sha, at));
            }
        }
        (
            Some(PluginIndex {
                marketplaces,
                plugins,
                cache_prefix: dir.join("cache").to_string_lossy().into_owned(),
                marketplaces_prefix: dir.join("marketplaces").to_string_lossy().into_owned(),
            }),
            blocked,
        )
    }

    pub fn origin_for(&self, canonical_path: &str) -> Option<Origin> {
        let (marketplace, plugin) = if let Some(rest) =
            strip_dir_prefix(canonical_path, &self.cache_prefix)
        {
            let mut segs = rest.split('/');
            (segs.next()?.to_string(), segs.next().map(String::from))
        } else if let Some(rest) = strip_dir_prefix(canonical_path, &self.marketplaces_prefix) {
            (rest.split('/').next()?.to_string(), None)
        } else {
            return None;
        };
        let repo_url = self.marketplaces.get(&marketplace)?;
        let (label, url) = normalize_source_url(repo_url)?;
        let (commit, installed_at_ms) = plugin
            .as_deref()
            .and_then(|p| self.plugins.get(p).cloned())
            .unwrap_or((None, None));
        Some(Origin {
            label,
            url: Some(url),
            kind: OriginKind::Delivered,
            commit,
            delivered_by: plugin,
            installed_at_ms,
        })
    }
}

/// "/a/b" under prefix "/a" -> Some("b"); never matches "/ab" from "/a".
fn strip_dir_prefix<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    let rest = path.strip_prefix(prefix)?;
    rest.strip_prefix('/')
}

/// "2026-07-20T02:30:08.089Z" -> epoch ms. Date arithmetic without a chrono
/// dependency: days from civil algorithm (Howard Hinnant's), UTC only.
fn parse_iso_ms(s: &str) -> Option<i64> {
    let (date, time) = s.split_once('T')?;
    let mut d = date.split('-');
    let (y, m, day): (i64, i64, i64) = (
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
        d.next()?.parse().ok()?,
    );
    let time = time.trim_end_matches('Z');
    let (hms, ms) = match time.split_once('.') {
        Some((a, b)) => {
            // Pad short fractional seconds out to milliseconds (".08" is
            // 80ms, not 0) rather than truncating a `None` to zero.
            let mut padded = b.to_string();
            while padded.len() < 3 {
                padded.push('0');
            }
            (a, padded[..3].parse::<i64>().ok()?)
        }
        None => (time, 0),
    };
    let mut t = hms.split(':');
    let (h, mi, sec): (i64, i64, i64) = (
        t.next()?.parse().ok()?,
        t.next()?.parse().ok()?,
        t.next().unwrap_or("0").parse().ok()?,
    );
    // A date that cannot be real is an absent timestamp, not a panic and not
    // a silently wrapped number — bound every component to its calendar
    // range before any arithmetic. Year is bounded to a range wide enough
    // for any real installedAt timestamp (0..=9999, four digits) while still
    // rejecting the adversarially large values that overflow the civil-days
    // math below; month/day/hour/minute use their calendar ranges, and
    // second allows 60 for a leap second.
    if !(0..=9999).contains(&y)
        || !(1..=12).contains(&m)
        || !(1..=31).contains(&day)
        || !(0..=23).contains(&h)
        || !(0..=59).contains(&mi)
        || !(0..=60).contains(&sec)
    {
        return None;
    }
    let y2 = if m <= 2 { y - 1 } else { y };
    let era = y2.div_euclid(400);
    let yoe = y2 - era * 400;
    let mp = (m + 9) % 12;
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some(((days * 24 + h) * 60 + mi) * 60_000 + sec * 1000 + ms)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A 17-digit year parses cleanly as `i64` (well under `i64::MAX`'s 19
    /// digits) but `era * 146097` overflows `i64` once `era` clears ~6.3e13
    /// — this year's era is ~7.5e13. An unreal date is an absent timestamp,
    /// never a panic.
    #[test]
    fn test_parse_iso_ms_oversized_year_does_not_panic() {
        assert_eq!(parse_iso_ms("30000000000000000-07-20T02:30:08.089Z"), None);
    }

    /// Sub-3-digit fractional seconds are a valid ISO-8601 variant and must
    /// scale up, not silently drop to 0.
    #[test]
    fn test_parse_iso_ms_short_fractional_seconds() {
        // ".08" is 80ms.
        assert_eq!(
            parse_iso_ms("2026-07-20T02:30:08.08Z"),
            parse_iso_ms("2026-07-20T02:30:08.080Z")
        );
        // ".8" is 800ms.
        assert_eq!(
            parse_iso_ms("2026-07-20T02:30:08.8Z"),
            parse_iso_ms("2026-07-20T02:30:08.800Z")
        );
    }
}

use std::path::PathBuf;

/// The `[remote "origin"] url` of the nearest enclosing checkout, walking
/// ancestors from the asset's directory up to and including `home` — never
/// past it: above home sits the whole disk, and a hit there says nothing
/// about the asset. Parsed as text; no git dependency. Memoized per
/// directory: a scan asks about many files in few directories.
///
/// `home` is a fence, not a hint, so containment is checked in canonical
/// (symlink- and `..`-resolved) space, not lexically. A lexical
/// `starts_with(home)` alone is insufficient two ways: a `..` component
/// embedded in `path` survives repeated `.parent()` calls and can make an
/// ancestor's string prefix match `home` while it does not actually resolve
/// under it; and a directory that is itself a symlink can sit lexically
/// inside `home` while resolving to a location outside it, which the OS
/// would then transparently follow when `.git/config` beneath it is opened.
/// Canonicalizing both sides before the containment check closes both, and
/// as a side effect also makes a relative `home` behave the same as an
/// absolute one, since canonicalize resolves against the process cwd.
///
/// A directory that does not exist cannot be canonicalized; that is not an
/// escape (there is nothing there to read) so it is treated as within the
/// fence and the subsequent read simply fails with "not found".
pub fn git_remote_origin(
    path: &Path,
    home: &Path,
    cache: &mut HashMap<PathBuf, Option<Origin>>,
) -> (Option<Origin>, bool) {
    let home_canon = match std::fs::canonicalize(home) {
        Ok(h) => h,
        // No resolvable fence: refuse to search rather than search unfenced.
        Err(_) => return (None, false),
    };

    let start: PathBuf = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent().map(Path::to_path_buf).unwrap_or_else(|| path.to_path_buf())
    };

    let mut blocked = false;
    let mut dir: Option<PathBuf> = Some(start);
    let mut visited: Vec<PathBuf> = Vec::new();
    let mut found: Option<Origin> = None;

    while let Some(d) = dir {
        if let Some(hit) = cache.get(&d) {
            found = hit.clone();
            break;
        }
        visited.push(d.clone());

        let within_fence = match std::fs::canonicalize(&d) {
            Ok(real) => real == home_canon || real.starts_with(&home_canon),
            // Doesn't exist (yet, or ever): nothing to read either way.
            Err(_) => true,
        };

        if within_fence {
            let cfg = d.join(".git/config");
            match std::fs::read_to_string(&cfg) {
                Ok(text) => {
                    found = parse_origin_url(&text).and_then(|raw| {
                        normalize_source_url(&raw).map(|(label, url)| Origin {
                            label,
                            url: Some(url),
                            kind: OriginKind::CheckedOut,
                            commit: None,
                            delivered_by: None,
                            installed_at_ms: None,
                        })
                    });
                    break;
                }
                Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                    blocked = true;
                }
                Err(_) => {}
            }
        } else {
            // A `..`-escaped or symlinked ancestor resolves outside home:
            // stop rather than follow it off the fence.
            break;
        }

        if d == home {
            break;
        }
        dir = d
            .parent()
            .map(Path::to_path_buf)
            .filter(|p| *p == home || p.starts_with(home));
    }

    for v in visited {
        cache.insert(v, found.clone());
    }
    (found, blocked)
}

/// First `url =` under `[remote "origin"]`. Text parse, quotes as written
/// by git itself; anything odd simply yields None.
fn parse_origin_url(config: &str) -> Option<String> {
    let mut in_origin = false;
    for line in config.lines() {
        let line = line.trim();
        if line.starts_with('[') {
            in_origin = line == "[remote \"origin\"]";
        } else if in_origin {
            if let Some(v) = line.strip_prefix("url") {
                return Some(v.trim_start().strip_prefix('=')?.trim().to_string());
            }
        }
    }
    None
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
