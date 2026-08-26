# Changelog

All notable changes to this project are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Hanger has never used pull requests, so entries link to the commit that made the
change rather than to a PR.

Entries cover changes a user can observe. Test-only, documentation-only and
internal-refactor commits are omitted.

## [Unreleased]

## [0.1.0] - 2026-08-25

The first release since the interface was rebuilt.

Hanger recognises eleven engines, up from the four it knew at 0.0.3. It reads
MCP server registrations from sixteen hosts, which it could not do at all
before, and probes them to report which are running and which are unaccounted
for. A link map draws which engines reach which assets and by what mechanism.

The asset store moves from schema 2 to schema 7 on first launch. It is a
one-way step; the migration note under Changed has the detail. Asset reaping
stays off unless `HANGER_ENABLE_REAP` is set, as in 0.0.x.

284 of the 542 commits in this range changed something a user can observe.

### Added

- **a11y:** Real tooltips on icon-only controls; scan ticker moves to the foot ([f00ce10](https://github.com/k97/hanger-ai/commit/f00ce10))
- **agents:** Kiro, Trae, OpenCode, Amp and Zed ([07216c4](https://github.com/k97/hanger-ai/commit/07216c4))
- **agents:** Roo Code and its live successor Kilo Code ([21bc2f3](https://github.com/k97/hanger-ai/commit/21bc2f3))
- **agents:** Cline, and its three unrelated homes ([28367f6](https://github.com/k97/hanger-ai/commit/28367f6))
- **annotations:** Per-asset mechanism, engine reach, beyond-the-store ([dca8bbe](https://github.com/k97/hanger-ai/commit/dca8bbe))
- **annotations:** Draw reach's boundary where the link map draws it ([84f2a9f](https://github.com/k97/hanger-ai/commit/84f2a9f))
- **annotations:** Directory links reach every asset beneath their target ([e2de8a0](https://github.com/k97/hanger-ai/commit/e2de8a0))
- **brand:** One map resolves every engine identifier the UI holds to its mark ([14c6fe0](https://github.com/k97/hanger-ai/commit/14c6fe0))
- **brand:** A vendor file becomes a sprite symbol with its ids namespaced ([1b6c48e](https://github.com/k97/hanger-ai/commit/1b6c48e))
- **brand:** The sprite mounts once beside App so every mark resolves on every screen ([2c6efac](https://github.com/k97/hanger-ai/commit/2c6efac))
- **brand:** BrandIcon draws any engine identifier's mark, or the generic one, once reported ([043a585](https://github.com/k97/hanger-ai/commit/043a585))
- **brand:** EngineLabel is the one icon-plus-name compound the text sites share ([abc5afb](https://github.com/k97/hanger-ai/commit/abc5afb))
- **brand:** The Engine column, the ENGINES strip and the Inspector's Engine row show the mark ([11a9423](https://github.com/k97/hanger-ai/commit/11a9423))
- **brand:** Hosts in the MCP panel, the agent bubble and the map's node card show their mark ([700386d](https://github.com/k97/hanger-ai/commit/700386d))
- **brand:** Marks for the eight agents detection is about to name ([65898a4](https://github.com/k97/hanger-ai/commit/65898a4))
- **design:** Mono palette token foundation, guardrail scale update ([3b6717c](https://github.com/k97/hanger-ai/commit/3b6717c))
- **design:** Mono titlebar with pill controls and asset filter ([e0b97b8](https://github.com/k97/hanger-ai/commit/e0b97b8))
- **design:** Icon rail with needs-review badge ([2eccf34](https://github.com/k97/hanger-ai/commit/2eccf34))
- **design:** Source-list sidebar with pill navigation ([dedbdd2](https://github.com/k97/hanger-ai/commit/dedbdd2))
- **design:** Summary strip with state bar, legend filters, particle field ([fa141de](https://github.com/k97/hanger-ai/commit/fa141de))
- **design:** Facet chips replace category cards ([ac2f622](https://github.com/k97/hanger-ai/commit/ac2f622))
- **design:** Asset table on its list plane with pill rows ([92653c7](https://github.com/k97/hanger-ai/commit/92653c7))
- **design:** Inspector detail and link flow to mono spec ([887d7f1](https://github.com/k97/hanger-ai/commit/887d7f1))
- **design:** Modals, banners and onboarding on the mono vocabulary ([a440232](https://github.com/k97/hanger-ai/commit/a440232))
- **design:** Complete mono migration — stragglers, motion, guardrail endgame ([a26e4b6](https://github.com/k97/hanger-ai/commit/a26e4b6))
- **design:** The Design system page — the system, rendered by the app that uses it ([763d867](https://github.com/k97/hanger-ai/commit/763d867))
- **design:** The Design system page ships in dev builds only — code included ([f2cb533](https://github.com/k97/hanger-ai/commit/f2cb533))
- **design:** ListCard — the section-format card ([5dd7032](https://github.com/k97/hanger-ai/commit/5dd7032))
- **design:** MiniButton — the 26px tier on rounded-control ([477df39](https://github.com/k97/hanger-ai/commit/477df39))
- **design:** FindingChip — the chip and its edge-clamped popover ([819aede](https://github.com/k97/hanger-ai/commit/819aede))
- **discovery:** Typed directory catalogue ([a35bd22](https://github.com/k97/hanger-ai/commit/a35bd22))
- **discovery:** Tier-grouped rows, copyable commands, one confirmed exit ([46d9cf5](https://github.com/k97/hanger-ai/commit/46d9cf5))
- **discovery:** The category facets become Discovery's own source list ([3ad4227](https://github.com/k97/hanger-ai/commit/3ad4227))
- **discovery:** Add the FavouriteHeart control ([78b344b](https://github.com/k97/hanger-ai/commit/78b344b))
- **discovery:** Render the favourite heart and the Favourites view ([14ae9d2](https://github.com/k97/hanger-ai/commit/14ae9d2))
- **discovery:** Add the Favourites section to the sidebar ([abf1213](https://github.com/k97/hanger-ai/commit/abf1213))
- **discovery:** Wire favourites end to end ([382033f](https://github.com/k97/hanger-ai/commit/382033f))
- **discovery:** Real marks for the directory, with the monogram as fallback ([9e65645](https://github.com/k97/hanger-ai/commit/9e65645))
- **domain:** Add Scope::Local for project-keyed machine config ([36f5532](https://github.com/k97/hanger-ai/commit/36f5532))
- **engines:** The empty state names the engines from the table, not from a literal ([bea30c7](https://github.com/k97/hanger-ai/commit/bea30c7))
- **filter:** Hide category chips at zero ([cc769cd](https://github.com/k97/hanger-ai/commit/cc769cd))
- **icons:** ArchiveBoxIcon and the hand-drawn SkillIcon ([fe06a77](https://github.com/k97/hanger-ai/commit/fe06a77))
- **icons:** The inspector's row marks and the hand-drawn GaugeIcon ([17bbc1e](https://github.com/k97/hanger-ai/commit/17bbc1e))
- **icons:** EllipsisVerticalIcon — the overflow trigger's mark ([7285d8f](https://github.com/k97/hanger-ai/commit/7285d8f))
- **icons:** Animated-mark infrastructure and the scanning disc ([e1fbbf2](https://github.com/k97/hanger-ai/commit/e1fbbf2))
- **icons:** The looping marks — folder-sync, loader, rotate-ccw, server relay, frame, file-text, link-2 ([00c6354](https://github.com/k97/hanger-ai/commit/00c6354))
- **icons:** The entering marks — twelve findings that play once and hold ([33e8f18](https://github.com/k97/hanger-ai/commit/33e8f18))
- **inspector:** Open the panel straight away on row selection ([aa0672a](https://github.com/k97/hanger-ai/commit/aa0672a))
- **inspector:** The document screen the prototype actually specified ([4dcccfc](https://github.com/k97/hanger-ai/commit/4dcccfc))
- **inspector:** The Link to projects screen the prototype specified ([9487033](https://github.com/k97/hanger-ai/commit/9487033))
- **inspector:** One link flow, and a preview that suits the file ([eccd26b](https://github.com/k97/hanger-ai/commit/eccd26b))
- **inspector:** MCP server detail panel with registrations and tools ([5e6fe81](https://github.com/k97/hanger-ai/commit/5e6fe81))
- **inspector:** Send a Claude.ai connector where it is actually managed ([02ad6f6](https://github.com/k97/hanger-ai/commit/02ad6f6))
- **inspector:** Show what each registration launches, and flag when they differ ([ed445e3](https://github.com/k97/hanger-ai/commit/ed445e3))
- **inspector:** Show which host is running a registration ([98dd53c](https://github.com/k97/hanger-ai/commit/98dd53c))
- **inspector:** Finder icon, one toggle, and full-width expand ([7ce87b1](https://github.com/k97/hanger-ai/commit/7ce87b1))
- **inspector:** Read_asset_body carries bytes, lines, mtime and a token estimate ([7d8bd2a](https://github.com/k97/hanger-ai/commit/7d8bd2a))
- **inspector:** Content and Details tabs; the document sits in a card behind Content ([f80c45f](https://github.com/k97/hanger-ai/commit/f80c45f))
- **inspector:** List_asset_dir — a skill folder's entries, folders with file counts ([4ac506a](https://github.com/k97/hanger-ai/commit/4ac506a))
- **inspector:** Identity is a list card with Size and Modified from the backend ([3fa053b](https://github.com/k97/hanger-ai/commit/3fa053b))
- **inspector:** The MCP panel opens on Tools, Details second ([8181966](https://github.com/k97/hanger-ai/commit/8181966))
- **inspector:** In this skill — the folder listing from list_asset_dir ([e5552f0](https://github.com/k97/hanger-ai/commit/e5552f0))
- **inspector:** Identity & capabilities — transport said once, capabilities in words ([2ab0a00](https://github.com/k97/hanger-ai/commit/2ab0a00))
- **inspector:** Capabilities — declared tools, and that Bash runs commands ([82c80bf](https://github.com/k97/hanger-ai/commit/82c80bf))
- **inspector:** Reach takes the section format ([8ddd795](https://github.com/k97/hanger-ai/commit/8ddd795))
- **inspector:** Context — the skill's always-loaded tier and its on-open cost ([9105e50](https://github.com/k97/hanger-ai/commit/9105e50))
- **inspector:** Registered in and Environment as cards; the launch line only on disagreement ([fe2cf24](https://github.com/k97/hanger-ai/commit/fe2cf24))
- **inspector:** The verdict card — declared N times, launches agree or not, Compare and Open config ([243e6d4](https://github.com/k97/hanger-ai/commit/243e6d4))
- **inspector:** The tool table with description bytes, and the Composition card ([5b02208](https://github.com/k97/hanger-ai/commit/5b02208))
- **inspector:** InspectorCap — the identity row and its overflow menu ([e7fb40a](https://github.com/k97/hanger-ai/commit/e7fb40a))
- **inspector:** The identity row takes over the cap; the path moves to Identity ([af1c305](https://github.com/k97/hanger-ai/commit/af1c305))
- **inspectors:** Nothing-selected clicks, reading reads, a broken link snaps ([a894776](https://github.com/k97/hanger-ai/commit/a894776))
- **link:** Resolve every destination before offering to change it ([63a044e](https://github.com/k97/hanger-ai/commit/63a044e))
- **linkmap:** The link_graph command, computed in Rust end to end ([d6e5dd4](https://github.com/k97/hanger-ai/commit/d6e5dd4))
- **linkmap:** Backend-named empty states and the pure layout ([7c580a0](https://github.com/k97/hanger-ai/commit/7c580a0))
- **linkmap:** The link map view — rail entry, pane, inspector ([d5d2bdc](https://github.com/k97/hanger-ai/commit/d5d2bdc))
- **linkmap:** Camera, popovers, the projects chip, and open-project ([0785bc2](https://github.com/k97/hanger-ai/commit/0785bc2))
- **linkmap:** The Maps detail card replaces the popover and the inspector ([11dd857](https://github.com/k97/hanger-ai/commit/11dd857))
- **linkmap:** The system's one elevation, on the map's overlays ([4005bfb](https://github.com/k97/hanger-ai/commit/4005bfb))
- **linkmap:** Engine roots carry their mark in the canvas and on both cards ([b2dff50](https://github.com/k97/hanger-ai/commit/b2dff50))
- **linkmap:** State the map's notices on the map, not above it ([6963568](https://github.com/k97/hanger-ai/commit/6963568))
- **linkmap:** Name the docked card a placecard, and badge unread notices ([b9ddf0e](https://github.com/k97/hanger-ai/commit/b9ddf0e))
- **linkmap:** Graph nodes carry per-kind counts, linked_from and rule names ([95bf0f4](https://github.com/k97/hanger-ai/commit/95bf0f4))
- **linkmap:** Hover focus dims everything the hovered node does not reach ([4e2879b](https://github.com/k97/hanger-ai/commit/4e2879b))
- **linkmap:** The scan stamp in the map cap ([4e722bd](https://github.com/k97/hanger-ai/commit/4e722bd))
- **linkmap:** A state dot on the node a faulty edge arrives at ([3e048d1](https://github.com/k97/hanger-ai/commit/3e048d1))
- **linkmap:** Layer switches, Unlinked roots and Only drift and dangling ([04ef6b2](https://github.com/k97/hanger-ai/commit/04ef6b2))
- **linkmap:** Placecard bodies take the section-format list card ([87702f9](https://github.com/k97/hanger-ai/commit/87702f9))
- **linkmap:** A project placecard lists its rules under Rules here ([1359819](https://github.com/k97/hanger-ai/commit/1359819))
- **linkmap:** One mini action per node kind — Show its assets, Open project ([8c4374b](https://github.com/k97/hanger-ai/commit/8c4374b))
- **linkmap:** The placecard head carries the finding chip; Review → goes to Needs review ([de5f0f6](https://github.com/k97/hanger-ai/commit/de5f0f6))
- **links:** V4 migration, real upsert, deploy-time link recording ([5021b07](https://github.com/k97/hanger-ai/commit/5021b07))
- **links:** The store half of the scan-time symlink backfill ([86c7c70](https://github.com/k97/hanger-ai/commit/86c7c70))
- **links:** Wire the scan-time symlink backfill into the project walk ([2fbaa2c](https://github.com/k97/hanger-ai/commit/2fbaa2c))
- **mcp:** Parse all four config dialects ([1e38328](https://github.com/k97/hanger-ai/commit/1e38328))
- **mcp:** Discover registrations across all hosts ([2332bfb](https://github.com/k97/hanger-ai/commit/2332bfb))
- **mcp:** Verify a server by handshake to list its tools ([3ced632](https://github.com/k97/hanger-ai/commit/3ced632))
- **mcp:** Discover Claude.ai connectors, and stop offering Verify remotely ([e0f990c](https://github.com/k97/hanger-ai/commit/e0f990c))
- **mcp:** Verify remote servers, and persist Claude.ai connectors ([a4ab7d1](https://github.com/k97/hanger-ai/commit/a4ab7d1))
- **mcp:** A 401 should say what it needs, not just that it needs something ([e317d9d](https://github.com/k97/hanger-ai/commit/e317d9d))
- **mcp:** Read the process table to see what is actually running ([5eb20e8](https://github.com/k97/hanger-ai/commit/5eb20e8))
- **mcp:** Report which servers are running, and which are unaccounted for ([7d55515](https://github.com/k97/hanger-ai/commit/7d55515))
- **mcp:** OpenCode and Amp dialects, and a JSONC pre-pass ([2d23912](https://github.com/k97/hanger-ai/commit/2d23912))
- **mcp:** A format we do not read says so instead of reading as empty ([9d6e848](https://github.com/k97/hanger-ai/commit/9d6e848))
- **mcp:** A bridged endpoint is the server it proxies, not a new one ([a8ba0c9](https://github.com/k97/hanger-ai/commit/a8ba0c9))
- **mcp:** Normalise_launch decides whether two launches are the same command ([7dfdf75](https://github.com/k97/hanger-ai/commit/7dfdf75))
- **mcp:** Agreement compares (transport, url_fingerprint, launch) ([3860567](https://github.com/k97/hanger-ai/commit/3860567))
- **mcp:** Count_assets learns to count servers, not just registrations ([b6b48c5](https://github.com/k97/hanger-ai/commit/b6b48c5))
- **mcp:** Group_servers turns registrations into the rows the list renders ([15db6ab](https://github.com/k97/hanger-ai/commit/15db6ab))
- **mcp:** The server list gets its own card row and column labels ([d99a8bc](https://github.com/k97/hanger-ai/commit/d99a8bc))
- **mcp:** The View control, and the wiring that makes the list real ([bf381b2](https://github.com/k97/hanger-ai/commit/bf381b2))
- **mcp:** Probe results get a table, keyed by launch not by name ([1403d41](https://github.com/k97/hanger-ai/commit/1403d41))
- **mcp:** Tools blocks collapse from per-registration to per-spec ([91ca03f](https://github.com/k97/hanger-ai/commit/91ca03f))
- **mcp:** The empty inspector names MCP servers when that is the filter ([d238ac1](https://github.com/k97/hanger-ai/commit/d238ac1))
- **mcp:** A stat can answer what a spawn was being asked ([2584aeb](https://github.com/k97/hanger-ai/commit/2584aeb))
- **mcp:** A panel opens with the answer, not a button ([3131d77](https://github.com/k97/hanger-ai/commit/3131d77))
- **mcp:** A divergence shows the token it turns on ([b8ad4ce](https://github.com/k97/hanger-ai/commit/b8ad4ce))
- **mcp:** A bridge is transport, not a different server ([0469144](https://github.com/k97/hanger-ai/commit/0469144))
- **mcp:** Zero MCP servers is a finding, so the chip stays ([cc48d69](https://github.com/k97/hanger-ai/commit/cc48d69))
- **mcp:** The two empty states Tools shows at zero (Appendix A.1, A.2) ([a30024f](https://github.com/k97/hanger-ai/commit/a30024f))
- **mcp:** A config problem says which kind it is ([7dc1b62](https://github.com/k97/hanger-ai/commit/7dc1b62))
- **mcp:** One engine, no local files, fifty servers, two scopes ([c707de5](https://github.com/k97/hanger-ai/commit/c707de5))
- **mcp:** The empty inspector says what every request carries ([f6d108f](https://github.com/k97/hanger-ai/commit/f6d108f))
- **mcp:** The probe answer carries its description-bytes cost ([21139a1](https://github.com/k97/hanger-ai/commit/21139a1))
- **mcp:** The engine summary counts servers whose launches disagree ([e40db04](https://github.com/k97/hanger-ai/commit/e40db04))
- **mcp:** Probe and verify relay through the server racks ([d59be20](https://github.com/k97/hanger-ai/commit/d59be20))
- **motion:** The icon-motion vocabulary, longhand under the reduced-motion kill ([a530210](https://github.com/k97/hanger-ai/commit/a530210))
- **panes:** The category track sits above the strip ([2de751a](https://github.com/k97/hanger-ai/commit/2de751a))
- **panes:** The strip's figures follow the selected category; App owns the engine summary ([9509e63](https://github.com/k97/hanger-ai/commit/9509e63))
- **profile:** The global pane's states wear the v5 marks ([eb45261](https://github.com/k97/hanger-ai/commit/eb45261))
- **rail:** Add the Hanger brand mark to the icon rail ([ac21ae7](https://github.com/k97/hanger-ai/commit/ac21ae7))
- **reach:** The tiles carry each engine's own mark instead of a monogram ([65bdff2](https://github.com/k97/hanger-ai/commit/65bdff2))
- **reach:** The agents that read the shared convention now say so ([003e0ea](https://github.com/k97/hanger-ai/commit/003e0ea))
- **reach:** The card groups by verdict and states each reason once ([c545f09](https://github.com/k97/hanger-ai/commit/c545f09))
- **repo:** Disclose nested repositories, drop the scan button ([8a0a214](https://github.com/k97/hanger-ai/commit/8a0a214))
- **repo:** The repository pane's states wear the v5 marks; the refresh button joins the 13px action rank ([1ad96d9](https://github.com/k97/hanger-ai/commit/1ad96d9))
- **review:** Derive repo-level and cross-repo issues from the inventory ([31c6030](https://github.com/k97/hanger-ai/commit/31c6030))
- **review:** Needs review becomes a section, with cross-repo issues ([4beb256](https://github.com/k97/hanger-ai/commit/4beb256))
- **review:** IssuesForAsset — one asset's findings, counted the file's own way ([9393d48](https://github.com/k97/hanger-ai/commit/9393d48))
- **review:** Review, strip and track wear the v5 marks; the counting slot joins 12px ([f4122b2](https://github.com/k97/hanger-ai/commit/f4122b2))
- **scanner:** Collect nested repository candidates during the walk ([3a20e75](https://github.com/k97/hanger-ai/commit/3a20e75))
- **scanner:** Discover MCP servers from every host on the machine ([b3454ad](https://github.com/k97/hanger-ai/commit/b3454ad))
- **shell:** Four full-height columns, per-column caps, the plane ([36c0d66](https://github.com/k97/hanger-ai/commit/36c0d66))
- **shell:** The mark and the crumb's My machine are one home button ([e85c7a6](https://github.com/k97/hanger-ai/commit/e85c7a6))
- **shell:** Boot spins the disc, rescan turns ccw, the empty map states its own absence ([58cde4c](https://github.com/k97/hanger-ai/commit/58cde4c))
- **sidebar:** Derive container rows from the linked set ([7aaaa36](https://github.com/k97/hanger-ai/commit/7aaaa36))
- **sidebar:** The Global row shows each detected engine's mark before its name ([3954548](https://github.com/k97/hanger-ai/commit/3954548))
- **store:** Canonicalise project root paths, migration v3 ([e42ad11](https://github.com/k97/hanger-ai/commit/e42ad11))
- **store:** V5 frees .agents assets and unsticks re-attribution ([af20848](https://github.com/k97/hanger-ai/commit/af20848))
- **store:** V7 records how long a probe result may be trusted ([bb61ddb](https://github.com/k97/hanger-ai/commit/bb61ddb))
- **store:** Probe results survive the session that learned them ([9b92c73](https://github.com/k97/hanger-ai/commit/9b92c73))
- **strip:** The Global split reads the backend's mechanism words ([7fac413](https://github.com/k97/hanger-ai/commit/7fac413))
- **strip:** The meter is a retro-Aqua gel, and aqua means linked ([5b13d51](https://github.com/k97/hanger-ai/commit/5b13d51))
- **strip:** An MCP mode — probe coverage, the request-carries line, a Review pill for disagreeing servers ([a066c9e](https://github.com/k97/hanger-ai/commit/a066c9e))
- **surfaces:** Flat cards on every content pane ([552981a](https://github.com/k97/hanger-ai/commit/552981a))
- **table:** The mechanism glyph, Reach tiles and Beyond the store ([54f6240](https://github.com/k97/hanger-ai/commit/54f6240))
- **theme:** Follow the system appearance, and keep an explicit pick ([e1415ac](https://github.com/k97/hanger-ai/commit/e1415ac))
- **tokens:** --capsule and --capsule-shadow, registered once as capsule-raised ([ce4ff2f](https://github.com/k97/hanger-ai/commit/ce4ff2f))
- **toolbar:** Add a clear button to the search field ([a6fe9d8](https://github.com/k97/hanger-ai/commit/a6fe9d8))
- **ui:** UnderlineTabs — the inspector's view switch ([4e12436](https://github.com/k97/hanger-ai/commit/4e12436))
- **ui:** SegmentedTrack — the category row is one track with a raised capsule ([e3f7960](https://github.com/k97/hanger-ai/commit/e3f7960))

### Changed

- **store:** **Breaking:** Migrate the asset store from schema 2 to schema 7 ([e42ad11](https://github.com/k97/hanger-ai/commit/e42ad11), [5021b07](https://github.com/k97/hanger-ai/commit/5021b07), [af20848](https://github.com/k97/hanger-ai/commit/af20848), [1403d41](https://github.com/k97/hanger-ai/commit/1403d41), [bb61ddb](https://github.com/k97/hanger-ai/commit/bb61ddb))

  **Migration:** The five migrations run once, on first launch, and no action is
  required. They are forward-only: an older Hanger opens a version 7 store
  without migrating it back, so downgrading to 0.0.x is not supported once
  0.1.0 has run. The store is at
  `~/Library/Application Support/com.rkarthik.hanger/hanger.db` if you want a
  copy first.

- **mcp:** A probe reads one config file, not the whole machine ([0f420eb](https://github.com/k97/hanger-ai/commit/0f420eb))

### Removed

- **mcp:** Remove RepoPane's inert View control instead of wiring it ([2de465c](https://github.com/k97/hanger-ai/commit/2de465c))

### Fixed

- **agents:** Cover the shared subagent path and tighten directory adjacency ([309cfc4](https://github.com/k97/hanger-ai/commit/309cfc4))
- **brand:** Codex drops its white plate on the dark page ([45e9db0](https://github.com/k97/hanger-ai/commit/45e9db0))
- **chrome:** Land the measured traffic-light alignment DESIGN.md already documents ([40bc898](https://github.com/k97/hanger-ai/commit/40bc898))
- **copy:** The Global empty state stops at the finding ([6eee77c](https://github.com/k97/hanger-ai/commit/6eee77c))
- **deploy:** Refuse an unclaimed source instead of writing to the project root ([0511824](https://github.com/k97/hanger-ai/commit/0511824))
- **deploy:** Surface a refused preflight instead of dropping the row ([df9a5e5](https://github.com/k97/hanger-ai/commit/df9a5e5))
- **deploy:** A shared-store asset has no owner, but it does have a home ([5a9b0ff](https://github.com/k97/hanger-ai/commit/5a9b0ff))
- **discovery:** Prevent toggleFavourite race condition before initial load ([f30b806](https://github.com/k97/hanger-ai/commit/f30b806))
- **discovery:** Remove discoveryIcons dependency from DiscoveryPane ([0a0c06e](https://github.com/k97/hanger-ai/commit/0a0c06e))
- **discovery:** Reset the Favourites facet when its list empties from inside it ([af1f707](https://github.com/k97/hanger-ai/commit/af1f707))
- **discovery:** Keep the favourite heart visible on keyboard focus, clear its ring under reduced motion ([fb8bd04](https://github.com/k97/hanger-ai/commit/fb8bd04))
- **discovery:** Prune orphaned favourited marks so the sidebar badge stays honest ([735b63b](https://github.com/k97/hanger-ai/commit/735b63b))
- **empty-states:** A negative claim waits for a completed scan ([1d33d39](https://github.com/k97/hanger-ai/commit/1d33d39))
- **icons:** Aim-stagger's delay now lands on an actual animation ([3671aa2](https://github.com/k97/hanger-ai/commit/3671aa2))
- **icons:** Aim-loop holds its 0% frame through a staggered delay ([374e73d](https://github.com/k97/hanger-ai/commit/374e73d))
- **icons:** Give the ⋮ overflow trigger the size and optical correction its neighbours have ([0935c91](https://github.com/k97/hanger-ai/commit/0935c91))
- **icons:** Back the ellipsis optical factor off to 1.2 ([e479955](https://github.com/k97/hanger-ai/commit/e479955))
- **inspector:** Read the folders Hanger actually scans ([d6470b3](https://github.com/k97/hanger-ai/commit/d6470b3))
- **inspector:** Read the document, not the folder that holds it ([9393206](https://github.com/k97/hanger-ai/commit/9393206))
- **inspector:** Scroll the whole MCP panel, not just the tools box ([05f78e0](https://github.com/k97/hanger-ai/commit/05f78e0))
- **inspector:** Stop rendering the transport chip twice ([c98949a](https://github.com/k97/hanger-ai/commit/c98949a))
- **inspector:** The panel opens on what it is inspecting ([dc1b7f8](https://github.com/k97/hanger-ai/commit/dc1b7f8))
- **inspector:** Modified_ms is Option, so no caller invents an epoch date ([62cf6f8](https://github.com/k97/hanger-ai/commit/62cf6f8))
- **inspector:** The verdict card does not repeat the divergence sentence ([5191854](https://github.com/k97/hanger-ai/commit/5191854))
- **inspector:** No Modified row when the file has no mtime ([3d699a4](https://github.com/k97/hanger-ai/commit/3d699a4))
- **inspector:** A symlinked entry shows no size it never measured ([35e99c2](https://github.com/k97/hanger-ai/commit/35e99c2))
- **inspector:** A server's cap never sheds — Decision 4 holds now that servers carry findings ([6886ca8](https://github.com/k97/hanger-ai/commit/6886ca8))
- **inspector:** A clicked asset keeps its scope, so its place is its own ([50fe6b8](https://github.com/k97/hanger-ai/commit/50fe6b8))
- **inspector:** The cap's review route clears the kind and place filters ([2069c1c](https://github.com/k97/hanger-ai/commit/2069c1c))
- **inspector:** The cap's root stops covering its own drag region ([ca8a011](https://github.com/k97/hanger-ai/commit/ca8a011))
- **inspector:** The title block's hairline goes only where a tab row replaces it ([d6d99e2](https://github.com/k97/hanger-ai/commit/d6d99e2))
- **inspector:** Reserve equal scrollbar gutter to fix asymmetric padding ([8609df1](https://github.com/k97/hanger-ai/commit/8609df1))
- **inspector:** Thin the scrollbar, tighten section margins to 12px ([c021d00](https://github.com/k97/hanger-ai/commit/c021d00))
- **inspector:** Give the Details Path row a Copy path button ([8abd2bc](https://github.com/k97/hanger-ai/commit/8abd2bc))
- **inspector:** Finish the 12px inset on padding-based sections ([2f1923b](https://github.com/k97/hanger-ai/commit/2f1923b))
- **inspector:** Even out the cap's trailing-cluster spacing, widen the ⋮ hit target ([80aed5b](https://github.com/k97/hanger-ai/commit/80aed5b))
- **inspector-cap:** Fixed 27x27 footprint for toolbar icon buttons ([0f8135a](https://github.com/k97/hanger-ai/commit/0f8135a))
- **labels:** Every engine the backend can name now has a name in the panel ([a5c8713](https://github.com/k97/hanger-ai/commit/a5c8713))
- **link:** The failure notice pointed the wrong way ([1d5d11d](https://github.com/k97/hanger-ai/commit/1d5d11d))
- **linkmap:** Clicks reach the map again; grid ground; layers control ([a64f91e](https://github.com/k97/hanger-ai/commit/a64f91e))
- **linkmap:** Run link_graph off the main thread ([c675213](https://github.com/k97/hanger-ai/commit/c675213))
- **mcp:** Restore [tools.*] TOML parsing alongside [mcp_servers.*] ([15181b7](https://github.com/k97/hanger-ai/commit/15181b7))
- **mcp:** Carry args, and actually wire the Verify button ([b383a08](https://github.com/k97/hanger-ai/commit/b383a08))
- **mcp:** Resolve launches that carry their own arguments, widen PATH ([fc3f1b9](https://github.com/k97/hanger-ai/commit/fc3f1b9))
- **mcp:** Two defects only the running app could show ([93e2b90](https://github.com/k97/hanger-ai/commit/93e2b90))
- **mcp:** OpenCode's array-shaped command normalises before it reaches server_from_json ([590d1bd](https://github.com/k97/hanger-ai/commit/590d1bd))
- **mcp:** Zed nests its command, and every Zed server was a blank row ([a60615a](https://github.com/k97/hanger-ai/commit/a60615a))
- **mcp:** Windsurf is Devin Desktop, and the default agent was invisible ([777b7de](https://github.com/k97/hanger-ai/commit/777b7de))
- **mcp:** The frontend still said Windsurf after the backend said Devin Desktop ([815c3f6](https://github.com/k97/hanger-ai/commit/815c3f6))
- **mcp:** A tool list belongs to a registration, never to a server ([fc1f70f](https://github.com/k97/hanger-ai/commit/fc1f70f))
- **mcp:** Identity attributes its pick, and the empty state says where Verify went ([8c53c98](https://github.com/k97/hanger-ai/commit/8c53c98))
- **mcp:** An OpenCode launch stops being rewritten into one that is not on disk ([00db6e7](https://github.com/k97/hanger-ai/commit/00db6e7))
- **mcp:** The spawned-by column says Devin Desktop too ([161bbf8](https://github.com/k97/hanger-ai/commit/161bbf8))
- **mcp:** A registration's id is the key the store wrote, so Reach lands ([c7094ef](https://github.com/k97/hanger-ai/commit/c7094ef))
- **mcp:** A shared-launch group shows its succeeding probe, not whichever came first ([cb41d1c](https://github.com/k97/hanger-ai/commit/cb41d1c))
- **mcp:** A project-local server no longer joins the Global list ([dc8098f](https://github.com/k97/hanger-ai/commit/dc8098f))
- **mcp:** Beyond the store stays off MCP rows in every view, not just the Tools filter ([8b9acb9](https://github.com/k97/hanger-ai/commit/8b9acb9))
- **mcp:** A bridged endpoint's fingerprint hashes the raw url, not the sanitised one ([2f01562](https://github.com/k97/hanger-ai/commit/2f01562))
- **mcp:** Verify moves to where the tools are ([60223f8](https://github.com/k97/hanger-ai/commit/60223f8))
- **mcp:** What a server is comes before where it is declared ([57f1a76](https://github.com/k97/hanger-ai/commit/57f1a76))
- **mcp:** Resolve_registration reads the registry's declared dialect ([1029188](https://github.com/k97/hanger-ai/commit/1029188))
- **mcp:** A probe says goodbye before it says kill ([5e75def](https://github.com/k97/hanger-ai/commit/5e75def))
- **mcp:** A probe cleans up after itself, not just its target ([52f01b1](https://github.com/k97/hanger-ai/commit/52f01b1))
- **mcp:** Rule 2 could not see the one server it is named after ([0a6bdf7](https://github.com/k97/hanger-ai/commit/0a6bdf7))
- **mcp:** A shifted token is not a changed one ([d050eb8](https://github.com/k97/hanger-ai/commit/d050eb8))
- **mcp:** The bridge note stops short of asserting identity it cannot see ([722f8d0](https://github.com/k97/hanger-ai/commit/722f8d0))
- **mcp:** Three copy defects and two coverage gaps in the Tools empty states ([ddb67bd](https://github.com/k97/hanger-ai/commit/ddb67bd))
- **mcp:** M counts checked hosts against the DETECTED engine population ([9f069cb](https://github.com/k97/hanger-ai/commit/9f069cb))
- **mcp:** A project override reads a path, not a raw one ([8431bac](https://github.com/k97/hanger-ai/commit/8431bac))
- **mcp:** Every registering host carries the cost, not only detected engines ([94f6cb3](https://github.com/k97/hanger-ai/commit/94f6cb3))
- **mcp:** The note counts servers, and a repo pane keeps its own body ([52dd47a](https://github.com/k97/hanger-ai/commit/52dd47a))
- **mcp:** A TOML parse error names its line, it does not quote it ([33795e9](https://github.com/k97/hanger-ai/commit/33795e9))
- **mcp:** A project pin can finally say what it overrides ([c32e364](https://github.com/k97/hanger-ai/commit/c32e364))
- **mcp:** Two endpoints are two answers, not one arm speaking for both ([701591c](https://github.com/k97/hanger-ai/commit/701591c))
- **mcp:** A double click asks once ([106e5b7](https://github.com/k97/hanger-ai/commit/106e5b7))
- **mcp:** Verify is offered only where there is something to ask ([c50c2ee](https://github.com/k97/hanger-ai/commit/c50c2ee))
- **mcp:** The View control sits in the MCP section header, as an icon ([faf144a](https://github.com/k97/hanger-ai/commit/faf144a))
- **mcp:** One heading over the cost card, not two ([2fc8317](https://github.com/k97/hanger-ai/commit/2fc8317))
- **menu:** One padding on the popover panel, declared at the call site ([6623d2d](https://github.com/k97/hanger-ai/commit/6623d2d))
- **panes:** A scan in flight is pending, never an absence, in every category ([15da8c2](https://github.com/k97/hanger-ai/commit/15da8c2))
- **panes:** The All tab gets its own filter-empty state ([bbf5794](https://github.com/k97/hanger-ai/commit/bbf5794))
- **panes:** Pending state keys on rows to draw, not on counts (T4) ([a38e00a](https://github.com/k97/hanger-ai/commit/a38e00a))
- **profile:** Render every MCP registration, and call it what it is ([1a621dc](https://github.com/k97/hanger-ai/commit/1a621dc))
- **profile:** The MCP servers chip now triggers the process fetch ([6bf6d68](https://github.com/k97/hanger-ai/commit/6bf6d68))
- **profile:** Clicking one MCP server marks one row, not the whole file ([0a30bf7](https://github.com/k97/hanger-ai/commit/0a30bf7))
- **profile:** The empty plane names the absence it actually found ([c5ad929](https://github.com/k97/hanger-ai/commit/c5ad929))
- **reach:** The absent state carries the ring; brand-coverage pins a floor per source ([52b88c8](https://github.com/k97/hanger-ai/commit/52b88c8))
- **reach:** The column stops painting over the column beside it ([53e0a4c](https://github.com/k97/hanger-ai/commit/53e0a4c))
- **review:** A config file declares many servers, and the pane saw one ([9e4fe0e](https://github.com/k97/hanger-ai/commit/9e4fe0e))
- **review:** An issue id tells two servers in one file apart ([5a50971](https://github.com/k97/hanger-ai/commit/5a50971))
- **review:** A server's findings are its own, not its config file's ([6ef0dfd](https://github.com/k97/hanger-ai/commit/6ef0dfd))
- **review:** Match a registration key whole, not as a suffix of an id ([3420ee0](https://github.com/k97/hanger-ai/commit/3420ee0))
- **scan:** Merge scans by registration, not by config file ([56d2a07](https://github.com/k97/hanger-ai/commit/56d2a07))
- **scan:** The same dedup bug existed in four places, not one ([5e1e3ed](https://github.com/k97/hanger-ai/commit/5e1e3ed))
- **scanner:** Stop project walks re-parenting engine assets ([3b8cb2d](https://github.com/k97/hanger-ai/commit/3b8cb2d))
- **scanner:** Stop filing unknown engine ids under Gemini ([8d59736](https://github.com/k97/hanger-ai/commit/8d59736))
- **scanner:** A parse failure files under parse, never under broken links ([1d06863](https://github.com/k97/hanger-ai/commit/1d06863))
- **scanner:** A rules file in the shared store stops being re-stamped ([5f9abb4](https://github.com/k97/hanger-ai/commit/5f9abb4))
- **selection:** Identify an MCP row by registration, not by config file ([9e6abd6](https://github.com/k97/hanger-ai/commit/9e6abd6))
- **shell:** Window drag permission and cap hit-testing ([da9b30d](https://github.com/k97/hanger-ai/commit/da9b30d))
- **shell:** The cap's field says Search, because that is where it sits ([84ad45e](https://github.com/k97/hanger-ai/commit/84ad45e))
- **spacing:** Stop the legacy scale from redefining Tailwind's numerics ([44b808d](https://github.com/k97/hanger-ai/commit/44b808d))
- **store:** Stop the project walk stealing rows it reached through a symlink ([4a8a248](https://github.com/k97/hanger-ai/commit/4a8a248))
- **strip:** Say a scan is running once, not twice ([82831a2](https://github.com/k97/hanger-ai/commit/82831a2))
- **tooltip:** Keep labels inside the window and drop inherited casing ([0be2ac2](https://github.com/k97/hanger-ai/commit/0be2ac2))

### Security

- **mcp:** **Breaking:** Launch arguments stop crossing the IPC boundary ([b9acfa0](https://github.com/k97/hanger-ai/commit/b9acfa0))
- **inspector:** List_asset_dir never follows a symlink ([90f0f8a](https://github.com/k97/hanger-ai/commit/90f0f8a))
- **mcp:** Drop environment assignments buried inside a shell wrapper ([902af8b](https://github.com/k97/hanger-ai/commit/902af8b))
- **mcp:** The config side gets its own redactor, exact where the process side cannot be ([155db5c](https://github.com/k97/hanger-ai/commit/155db5c))
- **mcp:** A secret-shaped valueless toggle no longer swallows the next flag ([0057b3e](https://github.com/k97/hanger-ai/commit/0057b3e))
- **mcp:** The flag-or-value guard tests shape, not content ([7998205](https://github.com/k97/hanger-ai/commit/7998205))
- **mcp:** A pending-value token is never emitted verbatim, no shape test needed ([55abfd5](https://github.com/k97/hanger-ai/commit/55abfd5))
- **mcp:** The process-side redactor stops leaking what it was built to hide ([e5ad7d6](https://github.com/k97/hanger-ai/commit/e5ad7d6))
- **mcp:** A tool carries its launch already redacted ([e2ee7cb](https://github.com/k97/hanger-ai/commit/e2ee7cb))
- **mcp:** The panel renders a redacted launch instead of building one ([fa9d5f7](https://github.com/k97/hanger-ai/commit/fa9d5f7))
- **mcp:** The process-side redactor now catches header flags and query-string credentials ([140e119](https://github.com/k97/hanger-ai/commit/140e119))
- **mcp:** A header value that starts with - and a secret flag before --header no longer leak ([ff9ceae](https://github.com/k97/hanger-ai/commit/ff9ceae))
- **mcp:** A secret in a --flag=value's value is redacted, not pushed verbatim ([5c4361e](https://github.com/k97/hanger-ai/commit/5c4361e))
- **mcp:** Sanitise_url survives a second embedded scheme, and drops the fragment too ([df1b052](https://github.com/k97/hanger-ai/commit/df1b052))
- **telemetry:** The webview can report an engine it has no mark for, once sanitised ([de9a2a4](https://github.com/k97/hanger-ai/commit/de9a2a4))
- **telemetry:** An unmapped engine is reported once a session, never a path ([f6e347e](https://github.com/k97/hanger-ai/commit/f6e347e))

## [0.0.3] - 2026-08-12

### Added

- **updater:** Add a Check for Updates menu item backed by a single Rust owner, using native dialogs rather than webview ones ([a70f694](https://github.com/k97/hanger-ai/commit/a70f694))

### Changed

- **dialogs:** Permit native `plugin-dialog` surfaces while keeping the ban on blocking webview dialogs ([ac0e44a](https://github.com/k97/hanger-ai/commit/ac0e44a))

## [0.0.2] - 2026-08-12

### Added

- **roots:** Treat `~/.agents` as a first-class root, and guard against the engine-root corruption that could follow ([e0d0016](https://github.com/k97/hanger-ai/commit/e0d0016))
- **profile:** Show detected engines and the global asset count on the profile row ([b1f4ca3](https://github.com/k97/hanger-ai/commit/b1f4ca3))

### Changed

- **dialogs:** Remove all six blocking dialogs so no window can be held hostage by a modal ([7f5c132](https://github.com/k97/hanger-ai/commit/7f5c132))

### Fixed

- **updater:** Sign updates with the CI key that the app actually trusts. Updates published before this fix could not be verified by an installed build ([fa0a194](https://github.com/k97/hanger-ai/commit/fa0a194))

## [0.0.1] - 2026-08-12

### Added

- **app:** First public release: inventory, monitor and deploy harness assets across the engine directories on your machine, recorded in a local SQLite store. macOS only, distributed as a universal DMG ([325ed19](https://github.com/k97/hanger-ai/commit/325ed19))
- **release:** Publish under the MIT licence with a README and a security policy ([180d4a2](https://github.com/k97/hanger-ai/commit/180d4a2))

### Security

- **distribution:** Notarise the DMG with Apple and staple the ticket, so Gatekeeper clears it without a network round trip ([f862c7a](https://github.com/k97/hanger-ai/commit/f862c7a), [a392fb1](https://github.com/k97/hanger-ai/commit/a392fb1))

[Unreleased]: https://github.com/k97/hanger-ai/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/k97/hanger-ai/compare/v0.0.3...v0.1.0
[0.0.3]: https://github.com/k97/hanger-ai/compare/v0.0.2...v0.0.3
[0.0.2]: https://github.com/k97/hanger-ai/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/k97/hanger-ai/releases/tag/v0.0.1
