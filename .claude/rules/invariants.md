# Invariants

Things a change could plausibly break without any test obviously failing.
Moved from `CLAUDE.md` unchanged; citations are to the code that makes each
one true.

**Bundle identifier is `com.rkarthik.hanger`** (`src-tauri/tauri.conf.json:5`).
It keys the app's data directory and its update identity; changing it strands
every existing install's database and preferences.

**The crate is `tauri-app`, the lib is `tauri_app_lib`**
(`src-tauri/Cargo.toml:2`, `:9`). The names look like scaffolding left over
from `create-tauri-app`, but `main.rs` and every integration test import
`tauri_app_lib`. Renaming is a mechanical change with a wide blast radius.

**Counts come from the backend, never from the frontend.** One function,
`count_assets(db_path, root)` (`src-tauri/src/scanner.rs:9`), is the source
for every count on screen, exposed as the `get_asset_counts` command. The
frontend renders what it is given. `.length` on a filtered array, a `reduce`
over inventory, or a sum of category arrays is a counting implementation and
is forbidden — enforced by `src/__tests__/no-frontend-counting.test.ts`, which
fails on any match not on an explicit allowlist, and also fails when an
allowlist entry stops matching. A boolean derived from an array
(`names.length > 0`) is not a count and passes; a `const fooCount = x.length`
is and does not.

**Link state is derived at read time, not stored.** The `links` table has a
`mechanism` column (`src-tauri/src/preferences.rs:256`) but no `state` column;
`update_link_state` persists only `dest_hash` and `last_verified_at`
(`preferences.rs:1171-1178`). Whether a link is linked, drifted, or dangling
is recomputed from the filesystem on each read. Do not add a cached state
column without deciding what invalidates it.

**Schema changes are `PRAGMA user_version` migrations in
`preferences.rs::init_db`.** There are no `.sql` files and no migration
directory. The store is at version 3, pinned by
`src-tauri/tests/store_migration_tests.rs`.

**Styling is semantic tokens only.** No raw hex, no `text-red-500`. Enforced
by `src/__tests__/no-off-token-styles.test.ts` against a file-and-line
allowlist. See `.claude/DESIGN.md` for the token set. The guard reads every
line of every non-test `.tsx` file — prose and comments included — for bare
`rounded`/the Tailwind radius scale, `shadow` (only `shadow-overlay` passes),
the retired tokens `hairline`/`ink-mute`/`surface-elevated`, and `text-[Npx]`.
In comments write "radius", "elevation", "the --line border".

**No blocking webview dialogs.** `window.confirm/alert/prompt` and bare
`confirm(` are banned across `src/`, enforced by
`src/__tests__/no-blocking-dialogs.test.ts`. Native
`@tauri-apps/plugin-dialog` surfaces are allowed but must be imported under an
alias so call sites stay distinguishable.

**Asset reaping is off by default** behind `HANGER_ENABLE_REAP`
(`README.md:27-30`). It is disabled because it caused data loss twice when
transient unmounts or interrupted walks made live assets look stale.

**The two redactors keep separate loops but share their predicates.**
`mcp::redact::redact_launch` gets the argv vector and can be exact;
`mcp::observe::redact` gets one flat command line from the process table and
cannot. Both outputs reach the screen — the panel and the undeclared-servers
disclosure. `SECRET_WORDS`, `looks_secret` and `HEADER_FLAGS` live once, in
`mcp::redact`, and `observe` imports them. A second copy is how a bearer token
shipped: `observe` was fixed for two leak shapes and never learned the header
handling its sibling already had, under a comment asserting parity that no test
exercised. Adding a rule to one side without the other is the failure mode.
