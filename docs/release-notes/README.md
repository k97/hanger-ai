# Release notes

`release.yml` reads this directory when a `v*` tag is pushed. For tag `vX.Y.Z`
it looks for `X.Y.Z.md` and uses it verbatim as the GitHub release body and as
the `notes` field in `latest.json` — the text the in-app update dialog shows.

If the file is absent it falls back to the `## [X.Y.Z]` section of
`CHANGELOG.md`. If neither exists the build fails rather than publishing a
placeholder, which is what it used to do.

Write the curated version here. `CHANGELOG.md` is the exhaustive record and
runs to hundreds of entries per release; that is the wrong thing to put in a
dialog box.
