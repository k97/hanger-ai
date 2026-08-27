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

/// `.git/config` has no realistic size, but nothing enforces that: a
/// pathological repo (or a symlink pointed at a device or a hostile file)
/// could hand `read_to_string` an enormous target during a home-directory
/// walk. Same cap and the same reasoning as the hash budget in
/// `scanner.rs:698-702` — a file over this size is skipped and treated as
/// an absent origin, not read into memory first.
const GIT_CONFIG_SIZE_CAP: u64 = 10_000_000;

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
///
/// The cache stores `(Option<Origin>, bool)` per directory, not just the
/// origin: `blocked` is part of a directory's verdict, not a side effect of
/// the specific call that first computed it. A cache-hit call must report
/// the same `blocked` a fresh walk starting at that directory would — so
/// each visited directory is cached with the "blocked from here onward"
/// value (a suffix-OR over the chain to wherever the walk terminated), and a
/// later lookup that lands on any of those directories, cached or not,
/// reports the same answer for the same filesystem state.
pub fn git_remote_origin(
    path: &Path,
    home: &Path,
    cache: &mut HashMap<PathBuf, (Option<Origin>, bool)>,
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

    // `blocked` from whatever point the walk terminates at: a cache hit's
    // own stored verdict, or `false` when the walk ends by a successful
    // read, an oversized file, an escaped fence, or reaching the top with no
    // block at that final step. `visited` collects only the NEW directories
    // this call itself walked, each with whether ITS OWN read hit
    // `PermissionDenied` — folded into a suffix-OR against `tail_blocked`
    // once the walk ends, so every directory caches "blocked from here to
    // the answer", not just "blocked at this one step".
    let mut tail_blocked = false;
    let mut dir: Option<PathBuf> = Some(start);
    let mut visited: Vec<(PathBuf, bool)> = Vec::new();
    let mut found: Option<Origin> = None;

    'walk: while let Some(d) = dir {
        if let Some((hit_origin, hit_blocked)) = cache.get(&d) {
            found = hit_origin.clone();
            tail_blocked = *hit_blocked;
            break 'walk;
        }

        let within_fence = match std::fs::canonicalize(&d) {
            Ok(real) => real == home_canon || real.starts_with(&home_canon),
            // Doesn't exist (yet, or ever): nothing to read either way.
            Err(_) => true,
        };

        if !within_fence {
            // A `..`-escaped or symlinked ancestor resolves outside home:
            // stop rather than follow it off the fence.
            visited.push((d, false));
            break 'walk;
        }

        let cfg = d.join(".git/config");
        let too_large =
            matches!(std::fs::metadata(&cfg), Ok(m) if m.len() > GIT_CONFIG_SIZE_CAP);
        if too_large {
            // A config this large is never a real one — skip it rather than
            // read it into memory, same as scanner.rs's hash budget. A `.git`
            // marker found here still ends the walk (this IS the nearest
            // checkout root); an oversized config just yields no usable
            // origin, and it's an absent origin, not a blocked read.
            found = None;
            visited.push((d, false));
            break 'walk;
        }

        let mut blocked_here = false;
        match std::fs::read_to_string(&cfg) {
            Ok(text) => {
                // `d` resolved inside home, but `.git/config` itself can
                // still be a symlink to somewhere outside it — check the
                // leaf file's real location too before trusting its
                // content. A `.git` marker found here still ends the
                // walk (this IS the nearest checkout root); a poisoned
                // config just yields no usable origin, same as a config
                // with no parseable remote.
                let cfg_within = std::fs::canonicalize(&cfg)
                    .map(|real| real == home_canon || real.starts_with(&home_canon))
                    .unwrap_or(false);
                found = if cfg_within {
                    parse_origin_url(&text).and_then(|raw| {
                        normalize_source_url(&raw).map(|(label, url)| Origin {
                            label,
                            url: Some(url),
                            kind: OriginKind::CheckedOut,
                            commit: None,
                            delivered_by: None,
                            installed_at_ms: None,
                        })
                    })
                } else {
                    None
                };
                visited.push((d, false));
                break 'walk;
            }
            Err(e) if e.kind() == std::io::ErrorKind::PermissionDenied => {
                blocked_here = true;
            }
            Err(_) => {}
        }

        let reached_home = d == home;
        visited.push((d.clone(), blocked_here));
        if reached_home {
            break 'walk;
        }
        dir = d
            .parent()
            .map(Path::to_path_buf)
            .filter(|p| *p == home || p.starts_with(home));
    }

    let mut running_blocked = tail_blocked;
    for (v, blocked_here) in visited.into_iter().rev() {
        running_blocked = running_blocked || blocked_here;
        cache.insert(v, (found.clone(), running_blocked));
    }

    (found, running_blocked)
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

/// What a registration's launch says about where the server came from.
/// Inference, not declaration — and built ONLY from a validated package
/// token or the transport URL's host. Raw args never flow into the result:
/// a config can carry `--header "Bearer …"`, and both redactors exist
/// because exactly that shipped once (see mcp::redact).
///
/// Picking the package token has to account for flags that take a value:
/// `npx --api-key sk-live-… some-server` must not read `sk-live-…` as the
/// package just because it comes right after a flag and happens to match
/// the package-name character class — an API key does too. There is no way
/// to know, for an arbitrary unrecognized flag, whether it takes a value.
/// The rule here: a flag written `--flag=value` is self-contained and never
/// consumes the next token; a short allowlist of flags known to be
/// valueless (`-y`/`--yes`) is skipped bare; every other flag is assumed to
/// consume the next token as its value. When that assumption runs the scan
/// off the end of argv, the result is `None`, not a guess — an absent
/// origin is honest, a wrong one that happens to be a secret is not. The
/// cost: a launch that uses some OTHER valueless flag we don't know about
/// (e.g. uvx's `-q`/`-v`/`--isolated`) has its package token skipped as if
/// it were that flag's value, and now resolves to `None` instead of the
/// real package — a completeness loss, never a leak.
pub fn launched_origin(command: &str, args: &[String], transport: &str) -> Option<Origin> {
    // Remote endpoint: transport is an already-sanitised URL (dialect.rs:27).
    // Host only — never any other part of the URL reaches the result.
    if transport.starts_with("http://") || transport.starts_with("https://") {
        let (scheme, after) = transport.split_once("://")?;
        let host = after.split(['/', '?', '#']).next()?;
        if !host.is_empty() {
            return Some(Origin {
                label: host.to_string(),
                url: Some(format!("{}://{}", scheme, host)),
                kind: OriginKind::Launched,
                commit: None,
                delivered_by: None,
                installed_at_ms: None,
            });
        }
        return None;
    }

    // Codex-style single-string launches embed the whole command line in
    // `command` with `args` empty; split it back into tokens so both shapes
    // go through the same path.
    let mut tokens: Vec<&str> = command.split_whitespace().collect();
    tokens.extend(args.iter().map(String::as_str));
    if tokens.is_empty() {
        return None;
    }
    let runner = Path::new(tokens[0])
        .file_name()
        .map(|f| f.to_string_lossy().into_owned())
        .unwrap_or_default();
    let registry = match runner.as_str() {
        "npx" | "bunx" => "npm",
        "uvx" => "pypi",
        _ => return None,
    };
    // First non-flag token after the runner is the package — but a flag
    // that isn't self-contained (`=`-joined) or known-valueless is assumed
    // to consume the token after it, so that token is never read as the
    // package. See the rule spelled out in the doc comment above.
    const VALUELESS_FLAGS: &[&str] = &["-y", "--yes"];
    let rest = &tokens[1..];
    let mut i = 0;
    let mut raw_pkg: Option<&str> = None;
    while i < rest.len() {
        let t = rest[i];
        if t.starts_with('-') {
            if t.contains('=') || VALUELESS_FLAGS.contains(&t) {
                i += 1;
            } else {
                i += 2; // assume this flag consumes the next token as its value
            }
            continue;
        }
        raw_pkg = Some(t);
        break;
    }
    let raw_pkg = raw_pkg?;
    let name = strip_version_suffix(raw_pkg);
    if !is_valid_package_name(name) {
        return None;
    }
    let (label, url) = match registry {
        "npm" => (
            format!("npm: {}", name),
            format!("https://www.npmjs.com/package/{}", name),
        ),
        _ => (
            format!("PyPI: {}", name),
            format!("https://pypi.org/project/{}/", name),
        ),
    };
    Some(Origin {
        label,
        url: Some(url),
        kind: OriginKind::Launched,
        commit: None,
        delivered_by: None,
        installed_at_ms: None,
    })
}

/// "pkg@1.2.3" -> "pkg"; "@scope/pkg@latest" -> "@scope/pkg". Only the LAST
/// '@' is a version separator — a leading '@' (scope marker) at index 0 is
/// never treated as one.
fn strip_version_suffix(token: &str) -> &str {
    match token.rfind('@') {
        Some(i) if i > 0 => &token[..i],
        _ => token,
    }
}

/// The npm name grammar, close enough to also fence PyPI names: an optional
/// `@scope/` prefix, then a package segment; every segment restricted to
/// lowercase alphanumerics and `-._~`, and forbidden from leading with `.`
/// or `_` (which also rules out the bare segments `.` and `..` — a
/// dot-only segment normalizes to the registry root in a browser, a link
/// that does not go where its label claims). The full name is bounded at
/// npm's own 214-character limit. One pass, one rule, applied to whichever
/// segments are present — no dead first pass. Anything outside it is not a
/// package name and never becomes a link.
fn is_valid_package_name(name: &str) -> bool {
    if name.is_empty() || name.len() > 214 {
        return false;
    }
    let segment_ok = |s: &str| {
        !s.is_empty()
            && !s.starts_with('.')
            && !s.starts_with('_')
            && s.chars()
                .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || "-._~".contains(c))
    };
    match name.strip_prefix('@') {
        Some(rest) => match rest.split_once('/') {
            Some((scope, pkg)) => segment_ok(scope) && segment_ok(pkg),
            None => false,
        },
        None => segment_ok(name),
    }
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
