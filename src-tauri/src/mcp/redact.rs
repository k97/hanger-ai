//! Redaction on the config side of the IPC boundary.
//!
//! `observe::redact` is the process-side redactor. It is handed one flat command
//! line recovered from the process table, so it has no choice but to split on
//! whitespace. This module is handed the argv vector intact and can therefore be
//! exact: `--header "Authorization: Bearer …"` is ONE argument here and four
//! words there, and only the exact form keeps the header name while dropping its
//! value. The two are deliberately separate; merging them would force this side
//! down to the other's precision.
//!
//! This function is not the security boundary on its own. The boundary is that
//! `Tool` carries no `args` at all (spec §4.1); this produces the string that
//! stands in for them.

use crate::mcp::dialect::sanitise_url;

/// Flag names whose value is assumed to be a credential.
///
/// Shared with `mcp::observe::redact`, the process-side redactor: one copy
/// getting fixed and the other not is how the process-side leak this module's
/// history warns about survived a whole review round.
pub(crate) const SECRET_WORDS: [&str; 5] = ["key", "token", "secret", "password", "auth"];

/// Flags whose value is a `Name: value` header pair.
const HEADER_FLAGS: [&str; 2] = ["--header", "-H"];

pub(crate) fn looks_secret(flag: &str) -> bool {
    let lower = flag.to_lowercase();
    SECRET_WORDS.iter().any(|w| lower.contains(w))
}

/// `Authorization: Bearer …` -> `Authorization: <redacted>`.
///
/// The header NAME is kept because it is diagnostic — it says the endpoint is
/// protected and how — while the value is never anything but a credential.
fn redact_header_value(raw: &str) -> String {
    match raw.split_once(':') {
        Some((name, _)) => format!("{}: <redacted>", name.trim()),
        None => "<redacted>".to_string(),
    }
}

enum Pending {
    Header,
    Value,
}

/// The launch as it may be shown to a user: every credential removed, every
/// innocent argument intact.
pub fn redact_launch(command: &str, args: &[String]) -> String {
    let mut out: Vec<String> = Vec::with_capacity(args.len() + 1);
    if !command.is_empty() {
        out.push(command.to_string());
    }

    let mut pending: Option<Pending> = None;

    for arg in args {
        if let Some(p) = pending.take() {
            // Invariant: a token in a pending-value position is never
            // emitted verbatim. Two rounds of trying to first decide "is this
            // token actually a flag, not a value" each left a
            // differently-shaped secret exposed (`-secretX`, then
            // `--secretX`), because a flag and a value can share any shape —
            // no shape test can tell them apart in general. Redact
            // unconditionally instead. Then, if this same token could ALSO
            // have started a fresh secret capture of its own — it is a
            // header flag, or itself looks like a secret flag — keep the
            // streak going so the token after it is redacted too. Never fall
            // through to the flag-detection branches below for a token
            // consumed here.
            match p {
                Pending::Header => out.push(redact_header_value(arg)),
                Pending::Value => out.push("<redacted>".to_string()),
            }
            if HEADER_FLAGS.contains(&arg.as_str()) || (arg.starts_with('-') && looks_secret(arg)) {
                pending = Some(Pending::Value);
            }
            continue;
        }

        if HEADER_FLAGS.contains(&arg.as_str()) {
            out.push(arg.clone());
            pending = Some(Pending::Header);
            continue;
        }

        // The `=` spellings, header first: `--header` does not contain any
        // secret word, so the generic branch below would pass it through whole.
        if let Some((flag, value)) = arg.split_once('=') {
            if HEADER_FLAGS.contains(&flag) {
                out.push(format!("{}={}", flag, redact_header_value(value)));
                continue;
            }
            if flag.starts_with('-') && looks_secret(flag) {
                out.push(format!("{}=<redacted>", flag));
                continue;
            }
        }

        // Only a FLAG is tested for secret words. Testing every argument would
        // blank `https://example.com/token-service/mcp`.
        if arg.starts_with('-') && looks_secret(arg) {
            out.push(arg.clone());
            pending = Some(Pending::Value);
            continue;
        }

        if arg.contains("://") {
            out.push(sanitise_url(arg));
            continue;
        }

        out.push(arg.clone());
    }

    out.join(" ")
}
