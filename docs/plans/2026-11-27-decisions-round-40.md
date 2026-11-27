# Round 40: publish v0.8.0?

The `Release v0.8.0` build succeeded and opened a draft. It holds the
universal DMG, the updater bundle and its signature, and `latest.json`
(version 0.8.0, all six darwin platforms). The notes in `latest.json` are
`docs/release-notes/0.8.0.md`, which the update dialog shows. CI on `main`
(`76b70a1`) passed too.

Publishing makes it the latest release, so every installed Hanger offers the
update at its next daily check.

:::question
Publish the v0.8.0 draft as the latest release?

- [ ] Publish now
- [ ] Install the DMG and try it first — I'll wait for your word
- [ ] Keep it a draft

Recommended: Publish now
:::

## Answer (Karthik, 2026-11-27)

**Publish now.** Published as Latest at 2026-11-27T12:40:24Z. `releases/latest/download/latest.json` served 0.8.0 within about 10 seconds.
