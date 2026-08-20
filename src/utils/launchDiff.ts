/**
 * Aligns two already-redacted launch display strings token by token, so the
 * launch-spec diff can show WHERE two hosts' launches diverge, not just
 * THAT they do.
 *
 * Whitespace-tokenised, not argv-aware -- the frontend never receives argv
 * at all (Rust's `Tool` type carries no `args` field over IPC --
 * `#[serde(skip_serializing)]`, per domain.rs), only the backend's redacted
 * `launchDisplay` string, so a position-wise compare over that string is
 * the finest grain available here. No diff library:
 * this repo vendors nothing new without a ruling, and a launch line's usual
 * shape -- command, flags, one changing version or path -- does not need
 * one.
 *
 * SECURITY, verbatim from Karthik and standing: "Redact in the launch-spec
 * diff: show that env differs, never what it differs to." A token shaped
 * like an environment assignment (`KEY=value`) that differs between the two
 * specs is rendered on neither side, replaced with a fixed label -- even
 * though the backend has already redacted anything its own heuristic
 * recognised as secret-shaped (`mcp::redact::looks_secret`, a keyword list
 * over flag names). A value with no secret-sounding key name, or a value
 * the backend's redactor never runs against because it arrived embedded in
 * argv, is exactly the shape that heuristic is built to miss -- this is a
 * second, independent guard, not a rendering of the first one's output. See
 * `mcp::observe::is_env_assignment`, which this mirrors: this file has no
 * boundary across which that Rust logic could reach it, so it is ported
 * rather than shared, and any change to one predicate's shape should be
 * checked against the other.
 */

export interface LaunchDiffToken {
  /** What to render at this position. For a differing environment
   *  assignment, this is the fixed label below, never either side's actual
   *  token text -- redacted or not. */
  text: string;
  /** Whether this position differs between the two specs. */
  differs: boolean;
}

export interface LaunchDiffResult {
  a: LaunchDiffToken[];
  b: LaunchDiffToken[];
}

/** Never a real token: what a differing environment assignment renders as
 *  on both sides, instead of either value. */
const ENV_DIFFERS = "env differs";

/**
 * Is this whitespace-separated word an environment assignment rather than
 * an argument?
 *
 * Mirrors `mcp::observe::is_env_assignment` exactly: a real flag starts
 * with `-`, so `--client-type=persistent` is kept and `API_KEY=REDACT_ME_1`
 * is not.
 */
function isEnvAssignment(token: string): boolean {
  if (token.startsWith("-")) return false;
  const eq = token.indexOf("=");
  if (eq <= 0) return false;
  const name = token.slice(0, eq);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function tokenize(launch: string): string[] {
  return launch.split(/\s+/).filter(Boolean);
}

/**
 * Compares two launch display strings position by position.
 *
 * `a` and `b` in the result are always the same length -- padded to
 * whichever spec has more tokens -- so a caller can render them as two
 * aligned lines without separately tracking which side ran out first. A
 * token present on only one side is a difference at that position, same as
 * two unequal tokens; the missing side renders as an empty string rather
 * than inventing filler.
 */
export function diffLaunch(a: string, b: string): LaunchDiffResult {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const length = Math.max(tokensA.length, tokensB.length);

  const resultA: LaunchDiffToken[] = [];
  const resultB: LaunchDiffToken[] = [];

  for (let i = 0; i < length; i++) {
    const left = tokensA[i];
    const right = tokensB[i];

    if (left !== undefined && left === right) {
      resultA.push({ text: left, differs: false });
      resultB.push({ text: right, differs: false });
      continue;
    }

    if (isEnvAssignment(left ?? "") || isEnvAssignment(right ?? "")) {
      resultA.push({ text: ENV_DIFFERS, differs: true });
      resultB.push({ text: ENV_DIFFERS, differs: true });
      continue;
    }

    resultA.push({ text: left ?? "", differs: true });
    resultB.push({ text: right ?? "", differs: true });
  }

  return { a: resultA, b: resultB };
}
