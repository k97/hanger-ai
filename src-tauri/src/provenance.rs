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
    /// marketplace name -> a repo/remote url string, one of `github`'s
    /// `repo` reassembled into an https url, or `url`/`git-subdir`'s own
    /// `url` field passed through as-is (both normalized later, in
    /// `origin_for`, by `normalize_source_url`). A `local` (plain-string
    /// `source`) marketplace has no remote and never gets an entry here.
    marketplaces: HashMap<String, String>,
    /// plugin name -> (commit sha, installed_at_ms), from the FIRST entry —
    /// a plugin installed at several scopes shares one upstream.
    plugins: HashMap<String, (Option<String>, Option<i64>)>,
    cache_prefix: String,
    marketplaces_prefix: String,
}

impl PluginIndex {
    pub fn load(home: &Path) -> (Option<Self>, bool) {
        // engine_base, not home.join: with CLAUDE_CONFIG_DIR set, discover.rs
        // reads plugin-declared MCP servers from the relocated directory, and
        // this index has to look for their marketplace/commit manifests in
        // the same place or every Delivered origin beneath it reports absent
        // (review finding, Important 1).
        let dir = crate::agents::engine_base(home, ".claude").join("plugins");
        // `origin_for` compares `cache_prefix`/`marketplaces_prefix` against
        // a CANONICAL asset path (`canonicalize_asset_path` in scanner.rs
        // resolves every path component), so the prefix built here has to be
        // canonical too — otherwise a symlinked `.claude`, `.claude/plugins`,
        // or `.claude/plugins/cache` (dotfiles managers like stow/chezmoi lay
        // out any of the three that way) never matches, and every Delivered
        // origin beneath it is silently reported as absent (Task 7 review,
        // round 2). Falling back to the lexical `dir` when canonicalize
        // fails is deliberate and covers the overwhelmingly common case —
        // no plugin store on this machine at all: the two manifest reads
        // just below fail with "not found" either way, which already
        // degrades correctly to "no index" via the `let Some(known) = ...`
        // return below. A failed canonicalize must never produce a
        // different, WRONG prefix that happens to match something
        // unintended — falling back to the unresolved path can only ever
        // under-match (miss a real symlinked store), never over-match.
        let dir = std::fs::canonicalize(&dir).unwrap_or(dir);
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
                // `entry["source"]` is `Value::Null` for any entry that is
                // not a JSON object (a local marketplace's `source` is a
                // plain STRING path, not an object at all) — serde_json's
                // Index impl returns Null rather than panicking when the
                // receiver isn't an object/array, so indexing `source`
                // below is safe whatever shape `entry["source"]` turns out
                // to be: object, string, null, or number.
                let source = &entry["source"];
                let repo_url = match source["source"].as_str() {
                    Some("github") => {
                        source["repo"].as_str().map(|repo| format!("https://github.com/{}", repo))
                    }
                    // `url` and `git-subdir` both carry the remote in their
                    // own `url` field; `git-subdir`'s `path` identifies a
                    // subdirectory within that repo, not a separate
                    // location, so it is not appended here — the repo alone
                    // is what a link to it can safely name.
                    Some("url") | Some("git-subdir") => source["url"].as_str().map(String::from),
                    // "github"/"url"/"git-subdir" are the only source kinds
                    // known to this app; a plain-string `source` (local, no
                    // remote) or any other/malformed shape yields no entry
                    // here, which is correct — not a miss.
                    _ => None,
                };
                if let Some(url) = repo_url {
                    marketplaces.insert(name.clone(), url);
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

/// How a recognized flag consumes argv tokens.
enum FlagArity {
    /// Takes no value; only the flag itself is consumed.
    Valueless,
    /// Takes a value in the next token (or, `=`-joined, in itself); that
    /// value is never the package.
    ValueTaking,
    /// The flag's OWN value (the next token, or `=`-joined) is the package
    /// itself.
    IsPackage,
}

/// Look up a flag's arity from each runner's own documented options. Only
/// flags we are confident about appear here — an omission merely declines
/// to resolve a launch; a wrong entry could misattribute or leak, so
/// nothing goes in this table on a guess. Look up by NAME only — an
/// `=`-joined value, if any, is split off by the caller before this runs.
///
/// Sources (checked against the tools' own `--help` / docs, 2026-08-27 and
/// 2026-08-28): only flags we are confident about are listed — an omission
/// merely declines to resolve a launch, but a wrong entry could misattribute
/// or leak, so nothing goes in these tables on a guess. `-p` is deliberately
/// different per runner: npx/bunx's own `--help` documents it as
/// `--package` (IsPackage); uvx's documents it as `--python` (ValueTaking) —
/// the dispatch is per-runner precisely so the two never collide.
///
/// - npx (`npm exec --help`): `-y`/`--yes`, `--workspaces`,
///   `--include-workspace-root`, `--strict-allow-scripts` and
///   `--dangerously-allow-all-scripts` take no value; `-c`/`--call`,
///   `-w`/`--workspace` and `--allow-scripts` take a value that is not a
///   package; `-p`/`--package <spec>` names the package to install when it
///   differs from the command to run. npm's own global config flags also
///   turn up in real MCP configs: `--registry`, `--prefix` and `--loglevel`
///   take a value; `-s`/`--silent` takes none.
/// - bunx (`bunx --help`): `-p`/`--package <spec>` names the package,
///   mirroring npx; `--bun`, `--no-install`, `--verbose` and `--silent`
///   take no value. `-y`/`--yes` is NOT in bunx's own `--help` — it is kept
///   here only because configs written for npx get copied to bunx
///   verbatim, and treating it as valueless is the safe classification
///   either way.
/// - uvx (`uv tool run` / `uvx --help`): `--from <pkg>` names the package to
///   install when it differs from the command to run. Value-taking:
///   `-w`/`--with`, `--with-editable`, `--with-requirements`,
///   `-c`/`--constraints`, `-b`/`--build-constraints`, `--overrides`,
///   `--env-file`, `--python-platform`, `--torch-backend`, `--index`,
///   `--default-index`, `-i`/`--index-url`, `--extra-index-url`,
///   `-f`/`--find-links`, `--index-strategy`, `--keyring-provider`,
///   `-P`/`--upgrade-package`, `--upgrade-group`, `--resolution`,
///   `--prerelease`, `--fork-strategy`, `--exclude-newer`,
///   `--exclude-newer-package`, `--link-mode`, `-C`/`--config-setting`,
///   `--config-settings-package`, `--no-build-isolation-package`,
///   `--no-build-package`, `--no-binary-package`, `--cache-dir`,
///   `--refresh-package`, `-p`/`--python`, `--color`,
///   `--allow-insecure-host`, `--directory`, `--project`, `--config-file`.
///   Valueless: `--isolated`, `--no-env-file`, `--lfs`, `--no-index`,
///   `-U`/`--upgrade`, `-V`/`--version`, `--compile-bytecode`,
///   `--no-build-isolation`, `--no-build`, `--no-binary`,
///   `-n`/`--no-cache`, `--refresh`, `--managed-python`,
///   `--no-managed-python`, `--no-python-downloads`, `-q`/`--quiet`,
///   `-v`/`--verbose`, `--system-certs`, `--offline`, `--no-progress`,
///   `--no-config`, `-h`/`--help`.
///
/// Short clusters (`-yq`) are not decomposed and stay unrecognized — a known
/// limit, not an oversight; see the "decline, never guess" rule on
/// `launched_origin` above.
fn recognized_flag(runner: &str, flag: &str) -> Option<FlagArity> {
    match runner {
        "npx" => match flag {
            "-y" | "--yes" | "--workspaces" | "--include-workspace-root"
            | "--strict-allow-scripts" | "--dangerously-allow-all-scripts" | "-s"
            | "--silent" => Some(FlagArity::Valueless),
            "-c" | "--call" | "-w" | "--workspace" | "--allow-scripts" | "--registry"
            | "--prefix" | "--loglevel" => Some(FlagArity::ValueTaking),
            "-p" | "--package" => Some(FlagArity::IsPackage),
            _ => None,
        },
        "bunx" => match flag {
            // -y/--yes: not in bunx's own --help; kept as valueless because
            // npx configs get copied here verbatim and a boolean is safe.
            "--bun" | "-y" | "--yes" | "--no-install" | "--verbose" | "--silent" => {
                Some(FlagArity::Valueless)
            }
            "-p" | "--package" => Some(FlagArity::IsPackage),
            _ => None,
        },
        "uvx" => match flag {
            "--isolated" | "--no-cache" | "-n" | "--refresh" | "-q" | "--quiet" | "-v"
            | "--verbose" | "--no-env-file" | "--lfs" | "--no-index" | "-U" | "--upgrade"
            | "-V" | "--version" | "--compile-bytecode" | "--no-build-isolation"
            | "--no-build" | "--no-binary" | "--managed-python" | "--no-managed-python"
            | "--no-python-downloads" | "--system-certs" | "--offline" | "--no-progress"
            | "--no-config" | "-h" | "--help" => Some(FlagArity::Valueless),
            "--with" | "-w" | "--with-editable" | "--with-requirements" | "-c"
            | "--constraints" | "-b" | "--build-constraints" | "--overrides" | "--env-file"
            | "--python-platform" | "--torch-backend" | "--index" | "--default-index" | "-i"
            | "--index-url" | "--extra-index-url" | "-f" | "--find-links"
            | "--index-strategy" | "--keyring-provider" | "-P" | "--upgrade-package"
            | "--upgrade-group" | "--resolution" | "--prerelease" | "--fork-strategy"
            | "--exclude-newer" | "--exclude-newer-package" | "--link-mode" | "-C"
            | "--config-setting" | "--config-settings-package"
            | "--no-build-isolation-package" | "--no-build-package" | "--no-binary-package"
            | "--cache-dir" | "--refresh-package" | "-p" | "--python" | "--color"
            | "--allow-insecure-host" | "--directory" | "--project" | "--config-file" => {
                Some(FlagArity::ValueTaking)
            }
            "--from" => Some(FlagArity::IsPackage),
            _ => None,
        },
        _ => None,
    }
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
/// to know an arbitrary unrecognized flag's arity, and guessing is unsound
/// in both directions: guess "takes a value" and an unrecognized valueless
/// flag before a real value-taking one lets that value's value leak through
/// two hops later; guess "takes no value" and a real value-taking flag
/// donates its value as the package. Both shapes shipped as bugs here.
///
/// So the scan does not guess. For each `-`-prefixed token it splits on `=`
/// FIRST, then looks up the flag NAME (never the whole `flag=value` token)
/// against `recognized_flag`, and only then decides what to do — checking
/// identity before shape matters: doing it the other way round treated
/// every `=`-joined token as self-contained-and-irrelevant, so
/// `--from=pkg` and `--package=pkg` fell through as if they carried nothing
/// worth reading, skipping straight past the package name they actually
/// carry. The three recognized arities:
/// - **valueless** — skip the flag alone.
/// - **value-taking** — skip the flag, and skip the following token too —
///   UNLESS the flag was `=`-joined, in which case the value already
///   travelled with it and there is no separate token to skip.
/// - **package-flag** — the flag's own value (`=`-joined, or the next
///   token when it wasn't) IS the package. That value is validated as a
///   package name on its own; if it fails, the call returns `None` rather
///   than falling through to scan past it for something else.
///
/// A bare `--` marks the next token as the package outright — no runner
/// lookup needed for it — but that token still has to pass
/// `is_valid_package_name` below like any other candidate; `--` waives
/// recognition, not validation.
///
/// **Any flag that is not `--`, not recognized, and not `=`-joined makes
/// the whole call return `None` immediately** — an unattributed server is
/// honest; guessing past an unknown flag is how the leak happened. An
/// unrecognized `=`-joined flag is the one case safe to skip without
/// recognizing it: the `=` already proves it cannot consume the following
/// token, so there is nothing left for it to misattribute. The cost: a
/// launch using a real, un-enumerated flag (written without `=`) declines
/// to resolve at all rather than resolving wrong.
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
    // Walk argv deciding each flag's arity by recognition only — never by
    // guessing. See the rule spelled out in the doc comment above: split on
    // `=` FIRST, then look up the flag's NAME, then dispatch on its arity.
    let rest = &tokens[1..];
    let mut i = 0;
    let mut raw_pkg: Option<&str> = None;
    while i < rest.len() {
        let t = rest[i];
        if t == "--" {
            // The next token is the package outright; recognition is
            // skipped, but it still has to pass validation below.
            raw_pkg = rest.get(i + 1).copied();
            break;
        }
        if t.starts_with('-') {
            let (flag, eq_value) = match t.split_once('=') {
                Some((name, value)) => (name, Some(value)),
                None => (t, None),
            };
            match recognized_flag(runner.as_str(), flag) {
                Some(FlagArity::Valueless) => {
                    i += 1;
                    continue;
                }
                Some(FlagArity::ValueTaking) => {
                    // `=`-joined: the value travelled with the flag, so
                    // there is no separate token after it to skip.
                    i += if eq_value.is_some() { 1 } else { 2 };
                    continue;
                }
                Some(FlagArity::IsPackage) => {
                    raw_pkg = eq_value.or_else(|| rest.get(i + 1).copied());
                    break;
                }
                None => {
                    if eq_value.is_some() {
                        // Unrecognized but self-contained: the `=` proves
                        // it cannot consume the next token, so there is
                        // nothing here to misattribute — safe to skip.
                        i += 1;
                        continue;
                    }
                    return None; // unrecognized, ambiguous arity: decline
                }
            }
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

/// A single call's verdict: what was found, and whether some lookup along
/// the way was refused by the OS. `blocked` is true ONLY when nothing was
/// found AND a refusal happened — a resolved origin always outranks a
/// blocked side-path, per the panel's "looked and found nothing" vs
/// "couldn't check" distinction (Karthik's ruling, 2026-08-27).
pub struct Resolved {
    pub origin: Option<Origin>,
    pub blocked: bool,
}

/// One resolver per scan, holding the one thing every class but `declared`
/// needs: `home`, for the plugin store's manifests and as the fence for the
/// checked-out walk's git cache. Built once (`new`), asked about many files
/// (`resolve_file`).
pub struct OriginResolver {
    home: PathBuf,
    plugins: Option<PluginIndex>,
    plugins_blocked: bool,
    git_cache: HashMap<PathBuf, (Option<Origin>, bool)>,
}

impl OriginResolver {
    pub fn new(home: &Path) -> Self {
        // KEPT, after briefly being removed as apparently-redundant and
        // restored the same round (see the Task 7 report for the failing
        // test that caught the reversal). `PluginIndex::load` now
        // canonicalizes its own prefix independently, so this alone no
        // longer carries that fix. But `git_remote_origin`'s walk
        // termination — `let reached_home = d ==
        // home` and the `.filter(|p| *p == home || p.starts_with(home))`
        // that decides whether to keep climbing — compares directly against
        // the RAW `home` parameter it is given, not against its own
        // internally-canonicalized `home_canon` (that copy is used only for
        // the `within_fence` check). Every `d` in that walk is canonical,
        // because it descends from the scanner's already-canonicalized
        // asset path. So an uncanonicalized `home` (a tempdir under
        // macOS's `/var` -> `/private/var`, or any real symlinked-ancestor
        // home) never satisfies either comparison, and the walk terminates
        // one directory short of `home` itself — missing a `.git/config`
        // that sits AT the fence, exactly the shape
        // `test_global_sites_is_global_argument_is_load_bearing` builds.
        // Canonicalizing here is what keeps `self.home`, and therefore
        // every `d` it is compared against, in the same (canonical) space.
        let home = std::fs::canonicalize(home).unwrap_or_else(|_| home.to_path_buf());
        let (plugins, plugins_blocked) = PluginIndex::load(&home);
        OriginResolver {
            home,
            plugins,
            plugins_blocked,
            git_cache: HashMap::new(),
        }
    }

    /// declared > delivered > (global only) checked-out. `path` is the
    /// asset's canonical path string, as the scanner already computes it —
    /// the plugin-index and checked-out lookups both key off the resolved
    /// (symlink-followed) location, not the lexical one a deployed asset
    /// was reached through.
    ///
    /// The checked-out git lookup runs for global-scoped assets only: a
    /// project- or local-scoped asset's own pane already names the
    /// repository it lives in, so printing that repo's own remote as the
    /// asset's "origin" would be noise, not information.
    pub fn resolve_file(&mut self, declared: Option<&str>, path: &str, is_global: bool) -> Resolved {
        if let Some(d) = declared {
            if !d.trim().is_empty() {
                return Resolved { origin: Some(origin_from_declared(d)), blocked: false };
            }
        }
        let mut blocked = self.plugins_blocked;
        if let Some(idx) = &self.plugins {
            if let Some(o) = idx.origin_for(path) {
                return Resolved { origin: Some(o), blocked: false };
            }
        }
        if is_global {
            let (o, b) = git_remote_origin(Path::new(path), &self.home, &mut self.git_cache);
            blocked |= b;
            if o.is_some() {
                return Resolved { origin: o, blocked: false };
            }
        }
        Resolved { origin: None, blocked }
    }

    /// delivered (plugin store) > launched (package or endpoint host).
    ///
    /// Tools have no declared class — nothing in an MCP registration is the
    /// asset's own claim about where it came from, the way frontmatter is
    /// for the other three kinds — and checked-out is skipped outright: a
    /// registration's enclosing checkout is the repository the pane it
    /// lives in already names, so printing that repo's own remote again as
    /// the tool's "origin" would repeat information already on screen, not
    /// add any.
    ///
    /// `config_path` arrives in different forms depending on which scanner
    /// pass produced the registration: the machine pass stores it LEXICALLY
    /// on purpose (scanner.rs, the registry-pass `upsert_asset` call site;
    /// four `asset_annotations_tests` pin that it must stay that way), while
    /// the project pass' own dedup key canonicalizes. `PluginIndex::origin_for`
    /// only matches a canonical prefix, so this canonicalizes `config_path`
    /// itself before comparing — the same fix Task 7 made to `PluginIndex`'s
    /// own prefixes, applied here to the caller's input instead.
    pub fn resolve_tool(
        &mut self,
        config_path: &str,
        command: &str,
        args: &[String],
        transport: &str,
    ) -> Resolved {
        let canonical = canonicalize_lenient(Path::new(config_path));
        if let Some(idx) = &self.plugins {
            if let Some(o) = idx.origin_for(&canonical.to_string_lossy()) {
                return Resolved { origin: Some(o), blocked: false };
            }
        }
        match launched_origin(command, args, transport) {
            Some(o) => Resolved { origin: Some(o), blocked: false },
            None => Resolved { origin: None, blocked: self.plugins_blocked },
        }
    }
}

/// Best-effort canonicalization for a path whose leaf — or several
/// trailing components — may not exist on disk: `fs::canonicalize` fails
/// outright the moment any component is missing, which a registration's
/// config path can be (a scan that has since moved on, or a test fixture
/// that never materializes the full plugin-cache tree). Walk from the full
/// path up to the nearest existing ancestor, canonicalize THAT (resolving
/// any symlinked directory in the part that does exist), and rejoin the
/// non-existent tail lexically. A path that exists in full canonicalizes on
/// the very first try, identically to `fs::canonicalize` — byte for byte,
/// not merely to the same directory: the first ancestor IS the path itself,
/// so its "suffix" is empty, and without the `is_empty` check below,
/// `canon.join("")` appends a trailing separator `fs::canonicalize` would
/// never produce (proven at `test_matches_plain_canonicalize_when_the_full_path_exists`
/// below — remove the check and it reddens). `Path::ancestors` always
/// terminates at a root component, and every real filesystem root
/// canonicalizes, so this returns before exhausting the iterator on any
/// real input; the fallback below only guards a filesystem that somehow
/// canonicalizes nothing at all, so this never panics on adversarial input.
fn canonicalize_lenient(path: &Path) -> PathBuf {
    for ancestor in path.ancestors() {
        if let Ok(canon) = std::fs::canonicalize(ancestor) {
            let suffix = match path.strip_prefix(ancestor) {
                Ok(s) => s,
                Err(_) => return canon,
            };
            return if suffix.as_os_str().is_empty() {
                canon
            } else {
                canon.join(suffix)
            };
        }
    }
    path.to_path_buf()
}

#[cfg(test)]
mod canonicalize_lenient_tests {
    use super::*;

    /// The parity claim in the doc comment above: a path that exists in
    /// full must canonicalize identically to `fs::canonicalize`, not merely
    /// to the same directory with a spurious trailing separator
    /// (`PathBuf::join("")` appends one, since an empty relative path still
    /// has one component to join). `PathBuf`'s own `PartialEq` compares
    /// path COMPONENTS, not bytes, so it cannot see that separator — two
    /// `PathBuf`s built as `"/tmp"` and `PathBuf::from("/tmp").join("")`
    /// are `==` even though their `to_string_lossy()` differ
    /// (`"/tmp"` vs `"/tmp/"`). `resolve_tool`'s actual caller compares
    /// STRINGS (`canonical.to_string_lossy()`, fed into `origin_for`'s
    /// prefix match), so this asserts on the string form too — a `PathBuf`
    /// comparison here would stay green with the `is_empty` guard removed
    /// and prove nothing. Removing the guard reddens this.
    #[test]
    fn test_matches_plain_canonicalize_when_the_full_path_exists() {
        let td = tempfile::tempdir().unwrap();
        let f = td.path().join("real.txt");
        std::fs::write(&f, "x").unwrap();
        let plain = std::fs::canonicalize(&f).unwrap();
        assert_eq!(
            canonicalize_lenient(&f).to_string_lossy(),
            plain.to_string_lossy(),
        );
    }

    /// A leaf (and here, a whole missing subtree) that does not exist still
    /// resolves the existing prefix and rejoins the missing tail lexically.
    #[test]
    fn test_rejoins_nonexistent_tail_onto_canonical_prefix() {
        let td = tempfile::tempdir().unwrap();
        let real = td.path().join("real");
        std::fs::create_dir_all(&real).unwrap();
        let missing = real.join("nope/deeper/x.json");
        let canon_real = std::fs::canonicalize(&real).unwrap();
        assert_eq!(canonicalize_lenient(&missing), canon_real.join("nope/deeper/x.json"));
    }
}
