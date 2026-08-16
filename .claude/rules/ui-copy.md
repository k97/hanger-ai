# UI copy and labels

- **A first-time label gets a researched naming brief and Karthik's sign-off
  before it lands.** Renames he has already ruled on are exempt (the pane is
  "Global", not "Profile"; "Needs review"; "Design system").
- **Every user-facing string goes through `/humanizer` before it lands** —
  empty states, pending states, banners, tooltips, buttons. Karthik asked for
  this on 2026-08-16 after a pending line shipped as first drafted.
- **His suggested wording is direction, not the string.** Take the intent,
  write the line properly in the app's voice, show him the result.
- **Copy must be literally true of the code.** "Results appear as roots
  finish" shipped and was false — inventory lands only on `scan://complete`.
  Read what the code does before describing it.
- **Empty is a finding; pending is not.** No pane asserts an absence before
  `scannedAt` is set. `.claude/DESIGN.md` → Panes has the states and the
  final strings.
- Use the app's own nouns: "engine" (not "agent" for Claude Code et al.),
  "MCP servers" (not "tools"), "the global store". `src/utils/prose.ts` has
  `categoryNoun` and `joinNames` for the sentence forms.
