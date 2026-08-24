# Verification

This file owns verification — what counts as proof that work is done. It
carries the content of `AGENTS.md` and `.agents/AGENTS.md`, archived
2026-08-16 under `docs/archive/`. Superpowers owns method — how work is
planned, tested, debugged and reviewed. Where the two disagree on whether
something has been demonstrated, this file wins; if a skill would have you
declare a phase complete on evidence this file disallows, stop and report the
conflict rather than resolving it yourself.

## Gates

`CLAUDE.md` → Verification pins the exact commands. A figure quoted from any
other invocation is not a gate result. Numeric exit criteria are run in the
dispatch that reports them; a figure copied from an earlier log is fabricated
evidence.

## What counts as evidence

Ranked; use the highest available.

1. A test that failed, then passed, with both runs committed.
2. Command output pasted verbatim, including the command and its exit code.
3. A file diff.
4. A screenshot from a running build (see `verifying-ui.md`), or GUI
   automation against the real application window with corroborating state
   evidence (database reads, file checks). Automation may *execute*
   verification; only Karthik may declare an iteration closed.

Nothing else is evidence.

## What is never evidence

- Any generated or synthesised image. Screenshots come from a real running
  build or they do not exist; if you cannot run the build, say so.
- A described UI outcome with no screenshot from a running build, regardless
  of whether backend tests pass. "Build succeeds" is not "the UI shows X".
- A test written after the implementation and passing on first run. Red
  first, or it did not verify anything.
- A description of a test rather than its output; a summary asserting a
  criterion is met without the artefact; a sign-off, checkmark, or completion
  marker you produced yourself.
- Prior conversation history. Context resets between sessions; a claim that
  something was done earlier is not proof it was done.
- A control proves only the artefact it ran against: a guard validated on a
  scratch branch and re-authored on trunk is unproven. A guard, detector, or
  allowlist change is unverified until a planted violation outside its scope
  is shown to still fail — green alone proves nothing.
- **A live, green control can still assert nothing**, which is a different
  failure from the one above and was the most repeated finding of the MCP
  detector cycle. Four shapes, all found only by asking what input would make
  the check fail: a regex whose pattern could not match the code it existed to
  catch; a fixture that stopped carrying the credential it asserted absent; a
  loop that iterated an empty collection; a comment claiming two modules were
  mirrored, which no test exercised. If the answer to "what would make this
  fail?" is "nothing", it is decoration. Plant that input, watch it fail, then
  count the green.
- **A floor set below the real number is that failure wearing a number.**
  `brand-coverage.test.ts` carried per-source floors of 3/9/5/2 against actual
  counts of 11/16/13/2 — live, green, and able to sleep through a fourfold
  collapse in what it collected. A threshold guards only at the value it is
  set to; when the thing it counts grows, the floor moves with it or it stops
  being a control.
- **A ruling recorded is not a ruling executed.** Those floors were stale
  because a preflight ruling committed to raising them at a later task, and
  nothing red ever signalled that it had not happened. Intent in a plan or a
  ledger carries no enforcement. A decision that must survive needs a control,
  not a note.
- **Moving a symbol can disarm a guard that reads it as text.** Several guards
  here scan source for an anchor — `block(scanner, "pub const AGENT_CONFIGS")`
  — and throw when it moves file. Before relocating a const, type or function,
  grep the guards for its name. Repointing is trivial; discovering it from a
  red gate two commits later is not, and repointing it at *less* than it read
  before is how the guard quietly stops guarding.
- **A missing file is a claim about your working directory first.** A relative
  path resolves against wherever the last `cd` left the shell, not the repo
  root. This session read three such failures as a destructive clean having
  wiped the spec, plan and ledger, and reported that to Karthik before checking
  `pwd`. Nothing had been deleted. Use absolute paths, or `cd` to the root in
  the same command.
- A control that fails to fire is a finding about the detector and is
  reported. Replacing it with one that fires, without disclosure, is
  fabricated evidence.
- Stacking fixes on a diverged tree: when a verified baseline works and later
  changes break it, revert to the baseline before patching forward.
- Browser-mock shims in application code. UI verification happens in the real
  Tauri window only; if it cannot be driven, hand verification to Karthik —
  never simulate it in a mocked web build.
- **A green test in `happy-dom` is not evidence about geometry.** It lays
  nothing out: every `offsetTop`/`offsetLeft`/`offsetWidth`/`scrollWidth` and
  every `getBoundingClientRect` is 0, there is no paint order, and its
  `ResizeObserver` exists (`typeof` is `"function"`) but `observe()` is a no-op
  that never fires. So position, overflow, shedding, clamping and hit-testing
  are unassertable here — swapping a capsule's `top` and `left` left three
  tests green. Say which claims the environment cannot reach, and route them to
  a screenshot rather than counting the green. A class-contract guard is an
  honest substitute only if its comment says that is what it is.

Backend-only work: when a task changes no meaningful UI, no screenshot is
acceptable evidence for its exit criteria; a checkpoint that contains one is
rejected without review.

## Human-gated steps

- A step gated on Karthik's action — verification, confirmation, approval —
  is never narrated as complete unless his result is present in the
  conversation. Restoring and removing a verification mechanism without his
  confirmation in between is a false completion claim, the same class as
  fabricated evidence.
- His confirmation applies only to the items he named. Extending a partial
  confirmation to unnamed checklist items is fabricated sign-off.
- A checkpoint with any verification item marked incomplete is not merged
  until he accepts the gap in writing.
- Self-instrumentation and reading your own runtime logs is encouraged for
  diagnosis; final verification of user-facing behaviour stays human-gated.

## Checkpoints and reporting

- Stop after each numbered section of a brief's scope. Report, then wait; do
  not begin section 3 because section 2 went smoothly.
- A checkpoint report contains: what was built, the evidence per the ranking
  above, what is left, and anything encountered that contradicts the brief.
  Report blockers immediately rather than routing around them — a brief that
  turns out to be wrong is useful information; a workaround that hides it is
  not.
- Any destructive git operation — `reset --hard`, checkout of a different
  base, force push, branch delete — is reported in the checkpoint that
  follows it, always.
- Production source changes are never staged in a commit prefixed `test()` or
  `docs()`, and never omitted from the report. Any change under
  `src-tauri/src/` gets its own red/green cycle and its own diff.
- Any edit to a test, detector, or allowlist forced by another change is
  reported with its cause and committed separately from the change that
  forced it. An unreported enforcement-file edit fails the task even if
  correct.

## Scope

- A brief's "Out of scope" list is binding; raise a blocker rather than
  building something on it, even a two-line change that is obviously needed.
- Decisions a brief lists as locked are locked; raise a blocker if the
  implementation contradicts one, do not silently pick another approach.
- Do not delete or weaken a test to make a build pass. When a production
  change fails an existing test, stop and report; never edit a detector,
  matcher, or guard to make a violation invisible. Exceptions go in an
  explicit allowlist with a stated reason; Karthik decides whether the test
  or the change is wrong.

## Exit

Work is complete when every exit criterion has evidence attached, in order,
in one report. Partial completion is reported as partial. Do not round up.
