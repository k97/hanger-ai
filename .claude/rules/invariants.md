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
directory. The store is at version 8. That number has gone stale here four times, so
treat `src-tauri/tests/store_migration_tests.rs` as the source of truth and
this line as a hint — the tests pin every version and fail when one moves;
this prose does not.

**Styling is semantic tokens only.** No raw hex, no `text-red-500`. Enforced
by `src/__tests__/no-off-token-styles.test.ts` against a file-and-line
allowlist. See `.claude/DESIGN.md` for the token set. The guard reads every
line of every non-test `.tsx` file — prose and comments included — for bare
`rounded`/the Tailwind radius scale, `shadow` (only `shadow-overlay` passes),
the retired tokens `hairline`/`ink-mute`/`surface-elevated`, and `text-[Npx]`.
In comments write "radius", "elevation", "the --line border".

**Type takes a role, an icon takes a box.** Text roles live in
`src/components/typeRoles.ts` (13 body, 12 secondary, 11 badges; leadings
`leading-body/caption/code/display`; sentence-case heads, no `uppercase`);
new UI imports them, never re-declares the strings.
`src/__tests__/type-roles.test.ts` scans every non-test `.tsx` under `src/`,
and its `ALLOW` list is the migration to-do, not an exemption pool. Icons:
`strokeFor(box)` in `icons.tsx` is the one stroke rule (`max(1.5, 24/box)`);
shell marks are 16, rows 14, chevrons 12–13. `icon_weight.test.ts` pins the
values and the sites changed on 2026-08-28 only — a new `size={15}` or a
literal `strokeWidth` in a component passes it. `.claude/DESIGN.md` §2, §4.

**No blocking webview dialogs.** `window.confirm/alert/prompt` and bare
`confirm(` are banned across `src/`, enforced by
`src/__tests__/no-blocking-dialogs.test.ts`. Native
`@tauri-apps/plugin-dialog` surfaces are allowed but must be imported under an
alias so call sites stay distinguishable.

**Asset reaping is off by default** behind `HANGER_ENABLE_REAP`
(`README.md` → Design Decisions). It is disabled because it caused data loss twice when
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

**A bare `data-tauri-drag-region` fires only on the pointer's exact target.**
Tauri's injected `drag.js` ends with
`if (attr === '' || attr === 'true') return el === composedPath[0]` — an
ancestor carrying the attribute never counts. So any positioned element that
covers a cap's drag overlay kills dragging for the whole strip, silently and
untestably: `happy-dom` has no paint order, so no test can catch it. Phase 2b
broke every inspector drag this way by putting `relative` on a full-width row
above the overlay. Keep drag-region children individually positioned and their
container unpositioned, or use `data-tauri-drag-region="deep"`.

**The global focus ring is unlayered, and so must any opt-out be.**
`index.css` draws the one focus ring with a bare `:focus-visible` rule
outside every `@layer`; Tailwind utilities live in `@layer utilities`, and
an unlayered declaration outranks a layered one regardless of specificity.
So `focus:outline-none` / `focus-visible:outline-none` on an element do
nothing here — six pre-existing sites carry them inertly, and the search
palette shipped a black box around its field until the review read the
built CSS. The palette's exception is an unlayered rule beside the global
one (`[cmdk-input]:focus-visible { outline: none; }`), documented in
`DESIGN.md` §3. Do not move the global rule into a layer: that would
silently disarm those six sites at once.

**Write transactions on `asset_search` open `BEGIN IMMEDIATE`, and the
index writers set their own busy timeout.** The store runs a rollback
journal; rusqlite's default busy timeout is 5 s; the rescan a server-detail
open triggers holds the write lock longer than that. Two facts make the
default shape fail *without waiting*: `index_probe_tools` reads before it
writes, and even a first-statement `DELETE` on the FTS5 table performs a
read first, because FTS5's vtable constructor reads its shadow config
table when the statement is prepared — so a `Deferred` transaction already
holds SHARED when it needs RESERVED and SQLite returns `SQLITE_BUSY`
instead of invoking the busy handler. `search.rs` opens both writers
`Immediate` with a 30 s timeout and logs the SQLite error text (log only).
Two live defects, 2026-08-28; the contention tests in `search_tests.rs`
pin both.
