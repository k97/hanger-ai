//! Deciding whether two differently-written launch commands are the same
//! command.
//!
//! A config file, a running process, and a second host's declaration of "the
//! same" MCP server rarely spell the launch identically: one gives an
//! absolute interpreter path, another a bare name; one wraps the call in a
//! Windows shim; one writes `-y`, another `--yes`. `normalise_launch` reduces
//! a launch to a canonical form so later work can compare two launches for
//! agreement, group servers by spec, and key persisted probe results on a
//! stable hash.
//!
//! Two rules are deliberately strict:
//!
//! - **Env keys only, never values.** `NormalisedLaunch` and `launch_hash`
//!   never carry an environment variable's value, only its name — this repo
//!   has shipped a token to the screen before (see
//!   `.claude/rules/invariants.md`, the redactor entry).
//! - **Fold documented flag equivalences only.** `-y` folds to `--yes`
//!   because that is a documented pair; nothing else does. The asymmetry is
//!   deliberate: a false conflict (two same launches read as different) is
//!   recoverable — a human looks and sees it — but a missed conflict (two
//!   different launches read as the same) is silent forever. Any pair not
//!   confidently documented stays different.
//!
//! The same asymmetry governs `${workspaceFolder}`: leaving it literal when
//! there is no root to resolve it against would make two different projects'
//! launches compare *equal* by coincidence of spelling — a missed conflict,
//! not a false one. `LaunchNote::Unexpandable` exists so that case is visible
//! instead of silent.

use sha2::{Digest, Sha256};

/// What changed when a launch was reduced to canonical form. Diagnostic only
/// — never fed into `launch_hash`, so two launches that reach the same
/// canonical form hash identically regardless of which notes fired to get
/// there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LaunchNote {
    /// The command was a path to an interpreter or executable
    /// (`/opt/homebrew/bin/node`); only its basename (`node`) is comparable
    /// across machines and install locations.
    InterpreterBasename { from: String, to: String },
    /// A platform shim (`cmd /c`) was unwrapped to the command it actually
    /// runs.
    ShimUnwrapped { shim: String },
    /// A flag was rewritten to its documented equivalent form.
    FlagFolded { from: String, to: String },
    /// A path placeholder (`~`, `$HOME`) was expanded.
    PathExpanded { from: String, to: String },
    /// A placeholder token had no value to resolve it against, so it was
    /// left literal instead.
    Unexpandable { token: String },
}

/// A launch command reduced to the form two differently-written declarations
/// of the same command agree on.
///
/// `env_keys` carries variable NAMES only — never values (see module docs).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalisedLaunch {
    pub command: String,
    pub args: Vec<String>,
    pub env_keys: Vec<String>,
    pub notes: Vec<LaunchNote>,
}

/// Documented equivalences only. An undocumented pair stays different: a
/// false conflict is recoverable by looking, a missed one is not.
const FLAG_EQUIVALENCES: &[(&str, &str)] = &[("-y", "--yes")];

/// `(shim command, flag that precedes the real command line)`. `cmd /c` hands
/// the actual program as the argument that follows the flag.
///
/// `sh -c` is deliberately not in this table. Its argument is one shell
/// string (`sh -c "npx -y server"`), not pre-split argv the way `cmd /c`'s
/// remaining arguments are; unwrapping it correctly needs a shell-aware
/// parser nobody has asked for. A half-right unwrap can produce a wrong
/// normalisation in either direction — false conflict or missed conflict —
/// while no rule at all produces at worst a false conflict, which a human
/// recovers from by looking. Absent is safer than half-right.
const SHIMS: &[(&str, &str)] = &[("cmd", "/c"), ("cmd.exe", "/c")];

fn basename(command: &str) -> &str {
    command
        .rsplit(|c| c == '/' || c == '\\')
        .next()
        .unwrap_or(command)
}

/// Expands `~` and `$HOME` against this machine's actual home directory.
fn expand_home(value: &str, notes: &mut Vec<LaunchNote>) -> String {
    let Ok(home) = std::env::var("HOME") else {
        return value.to_string();
    };

    let mut out = value.to_string();

    if out == "~" || out.starts_with("~/") {
        let expanded = format!("{home}{}", &out[1..]);
        notes.push(LaunchNote::PathExpanded {
            from: out.clone(),
            to: expanded.clone(),
        });
        out = expanded;
    }

    if out.contains("$HOME") {
        let expanded = out.replace("$HOME", &home);
        notes.push(LaunchNote::PathExpanded {
            from: out.clone(),
            to: expanded.clone(),
        });
        out = expanded;
    }

    out
}

/// Expands `${workspaceFolder}` against `workspace_root` when one is given.
///
/// Leaving the token literal when there is no root to resolve it against is
/// not neutral: two VS Code project registrations both launching
/// `${workspaceFolder}/x` would compare *equal* as literal strings while
/// resolving to different paths in different repositories — a missed
/// conflict, silent forever, exactly what §5.1's asymmetry warns against. So
/// `None` does not just skip the substitution; it records `Unexpandable` so
/// the ambiguity is visible instead of quietly compared as identity.
fn expand_workspace_folder(
    value: &str,
    workspace_root: Option<&str>,
    notes: &mut Vec<LaunchNote>,
) -> String {
    const TOKEN: &str = "${workspaceFolder}";
    if !value.contains(TOKEN) {
        return value.to_string();
    }

    match workspace_root {
        Some(root) => {
            let expanded = value.replace(TOKEN, root);
            notes.push(LaunchNote::PathExpanded {
                from: value.to_string(),
                to: expanded.clone(),
            });
            expanded
        }
        None => {
            notes.push(LaunchNote::Unexpandable {
                token: TOKEN.to_string(),
            });
            value.to_string()
        }
    }
}

/// Reduces a launch to canonical form (see module docs for the rule
/// order). `env_keys` is `&[String]` of variable NAMES — there is no value
/// anywhere in this signature, so an environment value cannot enter
/// `NormalisedLaunch` or `launch_hash`: the guarantee is structural, not
/// something a caller could get wrong.
pub fn normalise_launch(
    command: &str,
    args: &[String],
    env_keys: &[String],
    workspace_root: Option<&str>,
) -> NormalisedLaunch {
    let mut notes: Vec<LaunchNote> = Vec::new();

    // Steps 1-2: interpreter basename, then unwrap platform shims. Looped,
    // because unwrapping a shim can reveal another path-qualified command
    // underneath (e.g. a shim that launches an absolute interpreter path).
    let mut cur_command = command.to_string();
    let mut cur_args: Vec<String> = args.to_vec();
    loop {
        let base = basename(&cur_command).to_string();
        if base != cur_command {
            notes.push(LaunchNote::InterpreterBasename {
                from: cur_command.clone(),
                to: base.clone(),
            });
            cur_command = base;
        }

        let shim = SHIMS
            .iter()
            .find(|(name, flag)| *name == cur_command && cur_args.first().map(String::as_str) == Some(*flag));

        match shim {
            Some(&(name, flag)) if cur_args.len() >= 2 => {
                notes.push(LaunchNote::ShimUnwrapped {
                    shim: format!("{name} {flag}"),
                });
                let next_command = cur_args[1].clone();
                let rest = cur_args[2..].to_vec();
                cur_command = next_command;
                cur_args = rest;
                // Re-check basename/shim on the command just unwrapped.
                continue;
            }
            _ => break,
        }
    }

    // Step 3: fold documented flag equivalences only.
    let cur_args: Vec<String> = cur_args
        .into_iter()
        .map(|arg| {
            let fold = FLAG_EQUIVALENCES.iter().find(|(short, _)| *short == arg);
            if let Some(&(short, long)) = fold {
                notes.push(LaunchNote::FlagFolded {
                    from: short.to_string(),
                    to: long.to_string(),
                });
                long.to_string()
            } else {
                arg
            }
        })
        .collect();

    // Step 4: expand ~, $HOME, ${workspaceFolder}.
    let cur_args: Vec<String> = cur_args
        .into_iter()
        .map(|arg| {
            let arg = expand_home(&arg, &mut notes);
            expand_workspace_folder(&arg, workspace_root, &mut notes)
        })
        .collect();

    // Step 5: env keys only, never values — the signature only ever receives
    // names; caller order is preserved (launch_hash sorts its own copy).
    let env_keys = env_keys.to_vec();

    NormalisedLaunch {
        command: cur_command,
        args: cur_args,
        env_keys,
        notes,
    }
}

/// Hex SHA-256 of the normalised form: command, args in order, and env key
/// NAMES sorted so two configs that list the same keys in different order
/// agree. Values never enter this — see module docs. Notes are diagnostic
/// and are not hashed, so the identity depends only on what the launch does,
/// not on which rules fired to normalise it.
pub fn launch_hash(n: &NormalisedLaunch) -> String {
    let mut sorted_env_keys = n.env_keys.clone();
    sorted_env_keys.sort();

    let mut hasher = Sha256::new();
    hasher.update(n.command.as_bytes());
    hasher.update([0u8]);
    for arg in &n.args {
        hasher.update(arg.as_bytes());
        hasher.update([0u8]);
    }
    hasher.update([0u8]);
    for key in &sorted_env_keys {
        hasher.update(key.as_bytes());
        hasher.update([0u8]);
    }

    hex::encode(hasher.finalize())
}
