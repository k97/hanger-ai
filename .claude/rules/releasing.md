# Releasing

Verified end to end on 2026-08-25 cutting v0.1.0, and again renumbering the
whole line from 1.x to 0.x. Every item below cost time or nearly shipped
something wrong.

- **`git push --tags` and `--mirror` are never correct here.** Sixteen
  `legacy/*` tags point into the pre-redesign private trunk that the
  separate-history construction exists to keep out of the public repo. Push
  tags one at a time, by name: `git push origin v0.1.0`.
- **A `v*` tag push starts a signed, notarised build** (`release.yml`), so any
  tag matching that glob is a release trigger. When pushing historical or
  backfilled tags, `gh workflow disable release.yml` first and re-enable after;
  otherwise three old commits each build for ten minutes and open draft
  releases nobody wants.
- **The version lives in four files** — `package.json`,
  `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` and
  `src-tauri/Cargo.lock`. Miss one and the tag disagrees with the binary.
- **Retagging does not renumber a built app.** `CFBundleShortVersionString` is
  baked from `tauri.conf.json` at build time, so a release retagged from
  v1.1.0 to v0.1.0 still installs an app calling itself 1.1.0 until it is
  rebuilt. Renumbering a published release means rebuilding it or shipping no
  binary with it.
- **The updater compares semver, and lower never wins.** Publishing a version
  below what a user already has strands that install permanently — it sees no
  update, and neither does any later release in the lower series. Recovery is
  a manual DMG install. Check download counts before renumbering downward.
- **The updater pubkey is compiled into each build.** A release signed with a
  key an installed build does not carry is rejected silently. v0.0.1
  (published at the time as 1.0.0) trusts a different key and can never
  self-update; 0.0.2 onward share the CI key. Compare key ids from the tag's
  `tauri.conf.json` before assuming an update will land.
- **`latest.json`'s `notes` field is what the in-app update dialog shows.**
  `release.yml` resolves it from `docs/release-notes/<version>.md`, falling
  back to the `## [<version>]` CHANGELOG section, and fails the build rather
  than publishing a placeholder. Write the curated file: the CHANGELOG section
  runs to hundreds of entries.
- **A published release is still editable.** `gh release edit --notes-file`
  and `gh release upload --clobber` both work after publishing; the
  `releases/latest/download/` CDN lags roughly forty seconds behind, so verify
  against the asset API before concluding an edit did not take.
- **Before tagging, read the Design system page's allowlist.**
  `src/__tests__/design-system-coverage.test.ts` fails a push that adds a
  component without a specimen, so drift cannot reach a release unnoticed;
  what it cannot judge is whether an *exemption* is still honest. Open the
  test's `ALLOWLIST`, and for each entry ask whether the reason still holds
  — a component that has since lost its IPC dependency, or one recorded as
  "owed a specimen", is a gap to close or carry into the notes, not a line
  to leave. Twelve components went unshown between 2026-08-16 and
  2026-08-28 because no step asked.
- **zsh eats `$tag:path`.** `git show $t:src-tauri/tauri.conf.json` parses the
  colon as a history modifier and silently requests `v1.0.0i.conf.json`. It
  reads as "the file does not exist at that tag" and once produced a wrong
  "no updater pubkey found" conclusion. Brace it: `git show "${t}:path"`.
