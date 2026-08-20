/**
 * Aligns two already-redacted launch display strings token by token, so the
 * launch-spec diff can show WHERE two hosts' launches diverge, not just
 * THAT they do.
 *
 * Whitespace-tokenised, not argv-aware -- the frontend never receives argv
 * at all (Rust's `Tool` type carries no `args` field over IPC --
 * `#[serde(skip_serializing)]`, per domain.rs), only the backend's redacted
 * `launchDisplay` string, so a compare over that string's tokens is the
 * finest grain available here.
 *
 * Alignment is by longest common subsequence (LCS) over the two token
 * arrays, not a bare position-by-position compare -- a plain index walk
 * mis-reads one inserted or removed flag as "every later token changed",
 * since nothing after the insertion lines up by index again. LCS finds the
 * longest run of tokens both specs agree on, in order, and everything
 * outside that run is the actual divergence: an inserted flag shows only
 * itself as differing, wherever it falls, and a token after it that is
 * genuinely unchanged re-syncs to "same". This is the standard textbook
 * technique (`diff(1)`'s own basis) and is optimal for this purpose -- no
 * token-level alignment can keep more shared tokens matched than the LCS
 * does. It is O(n*m) time and space in the token counts, which is
 * negligible for a launch line's few dozen tokens at most. Still no diff
 * library: this repo vendors nothing new without a ruling, and the DP here
 * is ~25 lines.
 *
 * One acknowledged limit: when a single gap between two matched anchors
 * contains BOTH a genuine change and an unrelated insertion or deletion
 * (rather than each landing in its own gap), the two are aligned
 * positionally within that gap rather than semantically separated -- LCS
 * guarantees the matched tokens are optimal, not that leftover tokens
 * within one gap are paired the way a human would read them. Real diff
 * tools have the same limit for two edits inside one hunk. It does not
 * affect correctness of what "differs" means, only which unmatched token a
 * differing row shows next to which other unmatched token.
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
 * The longest common subsequence of two token arrays, as index pairs
 * `[i, j]` (`a[i] === b[j]`), in increasing order of both indices.
 *
 * Standard bottom-up DP: `table[i][j]` is the LCS length of `a[i..]` and
 * `b[j..]`. The backtrack walks forward from the start rather than
 * unwinding from the end, so the returned pairs are already in the order a
 * caller wants to walk both arrays alongside them.
 */
function lcsIndexPairs(a: string[], b: string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const pairs: Array<[number, number]> = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

/** One row of the aligned diff: what to render on each side at this
 *  position, given what each side's token actually is (`undefined` when
 *  this row's token exists on only one side). Applies the env-assignment
 *  guard once, shared by every caller that builds a row -- a matched
 *  (non-differing) row never reaches this function at all. */
function differingRow(left: string | undefined, right: string | undefined): [LaunchDiffToken, LaunchDiffToken] {
  if (isEnvAssignment(left ?? "") || isEnvAssignment(right ?? "")) {
    return [
      { text: ENV_DIFFERS, differs: true },
      { text: ENV_DIFFERS, differs: true },
    ];
  }
  return [
    { text: left ?? "", differs: true },
    { text: right ?? "", differs: true },
  ];
}

/**
 * Aligns two launch strings' tokens by their longest common subsequence.
 *
 * `a` and `b` in the result are always the same length, row for row, so a
 * caller can render them as two aligned lines without separately tracking
 * which side ran out first or where the divergence starts. A token matched
 * by the LCS is the same row on both sides, `differs: false`; every
 * unmatched stretch between two matches (or before the first / after the
 * last) becomes one row per token, pairing the two sides positionally
 * within that stretch and padding the shorter side with `""` -- see the
 * module doc comment for what that positional pairing does and does not
 * guarantee when a stretch mixes an insertion with a genuine change.
 */
export function diffLaunch(a: string, b: string): LaunchDiffResult {
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const matches = lcsIndexPairs(tokensA, tokensB);

  const resultA: LaunchDiffToken[] = [];
  const resultB: LaunchDiffToken[] = [];

  // Emits one row per token in the unmatched stretch [aStart, aEnd) /
  // [bStart, bEnd), positionally paired up to the longer side's length.
  const emitGap = (aStart: number, aEnd: number, bStart: number, bEnd: number) => {
    const gapLength = Math.max(aEnd - aStart, bEnd - bStart);
    for (let k = 0; k < gapLength; k++) {
      const left = aStart + k < aEnd ? tokensA[aStart + k] : undefined;
      const right = bStart + k < bEnd ? tokensB[bStart + k] : undefined;
      const [rowA, rowB] = differingRow(left, right);
      resultA.push(rowA);
      resultB.push(rowB);
    }
  };

  let aCursor = 0;
  let bCursor = 0;
  for (const [ai, bi] of matches) {
    emitGap(aCursor, ai, bCursor, bi);
    resultA.push({ text: tokensA[ai], differs: false });
    resultB.push({ text: tokensB[bi], differs: false });
    aCursor = ai + 1;
    bCursor = bi + 1;
  }
  emitGap(aCursor, tokensA.length, bCursor, tokensB.length);

  return { a: resultA, b: resultB };
}
