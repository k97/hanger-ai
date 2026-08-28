import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ClockIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentIcon,
  DocumentTextIcon,
  FileTextIcon,
  FolderIcon,
  GlobeAltIcon,
  LinkIcon,
  Square2StackIcon,
  TagIcon,
} from "./icons";
import InfoPopover from "./InfoPopover";
import Tooltip from "./Tooltip";
import OriginValue from "./OriginValue";
import MarkdownDoc from "./MarkdownDoc";
import UnderlineTabs from "./UnderlineTabs";
import ListCard, { ListCardRow } from "./ListCard";
import ReachCard from "./ReachCard";
import { sectionHeadClass, rowLabelClass, rowValueClass, rowMonoClass, captionClass } from "./typeRoles";
import type { Inventory } from "../App";
import { engineLabel, originRow, provenanceOf, type OriginWire } from "../utils/assetProvenance";
import { scopeAgent, type Scope } from "../utils/scopeAccess";
import EngineLabel from "./EngineLabel";
import { abbreviateHome } from "../utils/prose";
import type { AssetAnnotationView } from "./AssetRow";
import {
  documentKindFor,
  formatJson,
  parseSkillDocument,
  SPEC_FIELDS,
  toBlocks,
} from "../utils/skillDocument";

interface DetailAsset {
  category: string;
  name: string;
  path: string;
  scopeBadge?: string;
  version?: string;
  details?: string;
  /** Present on inventory items; absent on the flattened list shapes some
   *  callers pass. `scopeAgent` and `engineLabel` both treat a missing scope
   *  as "no agent", so the mark and the text stay in sync either way. */
  scope?: Scope;
  /** The backend's resolved origin for this asset, narrowed at the boundary
   *  (`assetProvenance.ts`, `OriginWire`). Absent when the backend found
   *  nothing that names a source. */
  origin?: OriginWire;
  /** True when the backend could not check every place a source is named —
   *  a different fact from finding nothing, and `originRow` words them
   *  differently. */
  origin_blocked?: boolean;
}

/** What `read_asset_body` answers: the file's text plus the measurements the
 *  backend took while reading it — never re-derived on the frontend. */
interface AssetBody {
  path: string;
  text: string;
  bytes: number;
  lines: number;
  /** `None` when the platform reports no mtime (or it predates the epoch) —
   *  never a fabricated zero. The Modified row is omitted rather than
   *  rendering that as a date. */
  modified_ms: number | null;
  estimated_tokens: number;
  /** The measurements for the frontmatter alone — name and description, the
   *  slice every engine loads into its startup list regardless of whether the
   *  skill ever opens. `None` when the backend could not isolate it; the
   *  Always on row is omitted rather than asserting a made-up figure. */
  always_on_bytes: number | null;
  always_on_estimated_tokens: number | null;
}

/** What `list_asset_dir` answers for a skill's folder: its top-level entries,
 *  folders carrying how many files sit beneath them — never counted here.
 *  `symlink` (90f0f8a): the backend never follows a link, so a symlink entry
 *  carries neither `bytes` nor `file_count` — nothing read its target. */
interface AssetDirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  bytes: number | null;
  file_count: number | null;
}

interface AssetDetailProps {
  asset: DetailAsset;
  inventory: Inventory | null;
  /** The panel's own body has loaded a document at this path — which, for a
   *  skill, is one level inside the folder `asset.path` names. Lifted so the
   *  cap's overflow menu (Open in editor, Copy path, Reveal) acts on the
   *  same path this panel is showing, not the folder it was handed. */
  onDocumentPath?: (path: string) => void;
  /** The backend's per-engine verdicts for this asset. The Reach column draws
   *  at most three of them, so this panel is where the rest are answerable.
   *  Null means the backend had no verdict — the section is omitted rather
   *  than asserting an absence of engines. */
  annotation?: AssetAnnotationView | null;
  /** Which tab to open on, remembered by the owner (`Flyout`) across the
   *  point where this panel is unmounted for `McpServerDetail` or back.
   *  "primary" is this panel's first tab, Content. Read once, at mount:
   *  while mounted the tab below is the only copy that decides anything,
   *  and `onTabChange` keeps the owner's in step with it. */
  initialTab?: "primary" | "details";
  /** The user moved to another tab. */
  onTabChange?: (tab: "primary" | "details") => void;
}

/**
 * The caveat on every token figure in the Context ledger. Behind the
 * section's info trigger rather than under the card: it qualifies the
 * numbers, it does not compete with them.
 */
const CONTEXT_NOTE =
  "Token figures are bytes divided by four. Every engine tokenises differently, so " +
  "treat them as a size, not a count.";

interface IdentityRow {
  key: string;
  label: string;
  icon: ReactNode;
  value?: ReactNode;
  wide?: ReactNode;
  trailing?: ReactNode;
}

/** "3.1 kB" or "431 B" — the backend's own byte count, never re-measured. */
function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function basenameOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut >= 0 ? path.slice(cut + 1) : path;
}

/**
 * The inspector's detail screen: what this file is, what it is related to, and
 * what it says.
 *
 * The document is the point of the panel. Everything above it — the state
 * line, the meta grid — exists to answer the questions the document itself
 * cannot: where the file sits and what else on the machine depends on it.
 */
export default function AssetDetail({ asset, inventory, onDocumentPath, annotation, initialTab, onTabChange }: AssetDetailProps) {
  // Opens where the user last was, then stays there: the tab is the user's
  // question, not the asset's, so moving down a table with Details open keeps
  // answering it. Deliberately NOT reset by the body-load effect below, where
  // it used to sit; `Flyout` carries it across the panel swap.
  const [tab, setTab] = useState<"content" | "details">(
    initialTab === "details" ? "details" : "content",
  );
  const changeTab = (next: "content" | "details") => {
    setTab(next);
    onTabChange?.(next === "details" ? "details" : "primary");
  };
  const [view, setView] = useState<"preview" | "source">("preview");
  // Whether the Origin row's delivery-facts disclosure is open. Reset with
  // the rest of the asset's own state below, not carried across assets the
  // way the tab is (that's the user's view preference; this belongs to the
  // asset on screen).
  const [originOpen, setOriginOpen] = useState(false);
  const [body, setBody] = useState<AssetBody | null>(null);
  // What the backend actually read. A skill's own path is the folder that
  // holds it, so the document sits one level in and the panel says so rather
  // than showing a directory above a rendered file.
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [dirEntries, setDirEntries] = useState<AssetDirEntry[] | null>(null);
  const text = body?.text ?? null;

  const kind = documentKindFor(asset.category);

  useEffect(() => {
    let cancelled = false;
    setBody(null);
    setDocumentPath(null);
    setDocError(null);
    setView("preview");
    setOriginOpen(false);

    // An agent has no file of its own — it is a folder layout the scan
    // inferred — so there is nothing to read and no pane to fill.
    if (kind === "none") {
      setLoading(false);
      return;
    }
    setLoading(true);

    invoke<AssetBody>("read_asset_body", { path: asset.path })
      .then((result) => {
        if (cancelled) return;
        setBody(result);
        setDocumentPath(result.path);
        onDocumentPath?.(result.path);
      })
      .catch((err) => {
        if (!cancelled) setDocError(String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [asset.path, kind]);

  // The folder listing is a skill-only fact — every other category returns
  // early and clears whatever the last selection left behind.
  useEffect(() => {
    let cancelled = false;
    setDirEntries(null);
    if (asset.category !== "Skills") return;

    invoke<AssetDirEntry[]>("list_asset_dir", { path: asset.path })
      .then((result) => {
        if (!cancelled) setDirEntries(result);
      })
      .catch(() => {
        if (!cancelled) setDirEntries(null);
      });

    return () => {
      cancelled = true;
    };
  }, [asset.path, asset.category]);

  const reach = annotation?.reach ?? [];
  /* One store for the card. `via_store` is keyed off the asset's own root in
     annotations.rs, so every reached engine reports the same value and the cap
     cannot contradict the rows. */
  const reachStoreRaw = reach.find((r) => r.reached && r.via_store)?.via_store;
  const reachStore = reachStoreRaw ? abbreviateHome(reachStoreRaw) : null;

  const provenance = provenanceOf(asset as never, inventory);
  const originView = originRow(asset.origin, asset.origin_blocked);
  const shownPath = documentPath ?? asset.path;
  const document = text === null || kind !== "markdown" ? null : parseSkillDocument(text);
  // A config that will not parse keeps its Source tab and loses only the
  // formatted view — the file is still the answer to "what is in there".
  const pretty = text !== null && kind === "json" ? formatJson(text) : null;
  const showsTabs = document !== null || pretty !== null;

  const specRows: IdentityRow[] = document
    ? (SPEC_FIELDS as readonly string[])
        .filter((key) => key !== "name" && key !== "description" && key !== "allowed-tools")
        // Karthik's ruling, 2026-08-27: `compatibility` and `metadata` are
        // dropped from this panel's own summary — not from SPEC_FIELDS,
        // which documents the skill spec's six keys and is used elsewhere.
        // `metadata` is a YAML map; `parseSkillDocument` is line-based and
        // reads a key with no inline value as opening a LIST, so
        // `metadata:` followed by indented sub-keys always stores an empty
        // array and the row rendered blank on every skill that used it (15
        // of 133 on this machine). `compatibility` is free prose with no
        // length contract (24-141 chars observed here) and reads as an
        // essay in a table row even when it parses correctly. Neither
        // becomes unreachable: the Content tab's Source view still shows
        // the raw frontmatter, so a skill's compatibility and metadata stay
        // readable there — this only drops them from the Identity card.
        .filter((key) => key !== "compatibility" && key !== "metadata")
        .filter((key) => document.frontmatter[key] !== undefined)
        .map((key) => {
          const label = key[0].toUpperCase() + key.slice(1);
          return {
            key: label.replace(/\s+/g, "-").toLowerCase(),
            label,
            icon: <DocumentTextIcon size={14} aria-hidden="true" />,
            wide: String(
              Array.isArray(document.frontmatter[key])
                ? (document.frontmatter[key] as string[]).join(", ")
                : document.frontmatter[key]
            ),
          };
        })
    : [];

  const raw = document?.frontmatter["allowed-tools"];
  const allowedTools: string[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];

  const identityRows: IdentityRow[] = [
    {
      key: "engine",
      label: "Engine",
      icon: <CpuChipIcon size={14} aria-hidden="true" />,
      wide: (
        <EngineLabel engineKey={scopeAgent(asset.scope as Scope)} size={14}>
          {engineLabel(asset as never)}
        </EngineLabel>
      ),
    },
    {
      key: "scope",
      label: "Scope",
      icon: <GlobeAltIcon size={14} aria-hidden="true" />,
      wide: provenance.place,
    },
    ...(provenance.linkedInto.length > 0
      ? [
          {
            key: "linked-into",
            label: "Linked into",
            icon: <LinkIcon size={14} aria-hidden="true" />,
            wide: provenance.linkedInto.join(", "),
          },
        ]
      : []),
    ...(provenance.source
      ? [
          {
            key: "points-at",
            label: "Points at",
            icon: <LinkIcon size={14} aria-hidden="true" />,
            value: provenance.source,
          },
        ]
      : []),
    // "Origin" rather than "Source": the Source tab below means the raw
    // file, and one panel cannot use the same word for two things. The row
    // itself is rendered explicitly below, out of this flat array, because
    // its disclosure sub-rows must sit inside the card between it and the
    // next row. This entry only marks where the loop splices that row in —
    // the render loop reads nothing off it but `key`. `label` and `icon`
    // are left empty/null on purpose, not "Origin" and the real icon, so
    // editing them here cannot look like it changes what renders; the row's
    // real label and icon are hardcoded in the explicit block below.
    // Included only when `originRow` has something to say — the ordinary
    // no-origin case returns null and the row is dropped entirely, the same
    // way `linked-into` and `points-at` above are.
    ...(originView ? [{ key: "origin", label: "", icon: null, wide: undefined }] : []),
    ...(asset.version
      ? [
          {
            key: "version",
            label: "Version",
            icon: <TagIcon size={14} aria-hidden="true" />,
            value: asset.version,
          },
        ]
      : []),
    // The byte count lives in Contents (per file) and the Context ledger
    // (bytes plus tokens) already; Identity repeating it added nothing but
    // the line count, which is not carried forward — a first-time label to
    // keep it needs its own sign-off (`ui-copy.md`).
    // Hide-at-zero: `modified_ms` is `None` when the platform reports no
    // mtime, so the row is omitted rather than rendering a fabricated epoch
    // date (formerly `unwrap_or(0)` → "Jan 1, 1970").
    ...(body && body.modified_ms !== null
      ? [
          {
            key: "modified",
            label: "Modified",
            icon: <ClockIcon size={14} aria-hidden="true" />,
            value: new Date(body.modified_ms).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            }),
          },
        ]
      : []),
    ...specRows,
    // Last (Decision 11): every other row says something about the asset;
    // this one says where it is. `shownPath` is the document AssetDetail
    // actually read, not the folder the panel was handed (a skill's own
    // path is its containing folder). `<bdi>` isolates the path's own
    // direction so a home-relative segment can't skew a trailing filename.
    {
      key: "path",
      label: "Path",
      icon: <FolderIcon size={14} aria-hidden="true" />,
      value: (
        <span className="block max-w-55 truncate" title={shownPath}>
          <bdi>{shownPath}</bdi>
        </span>
      ),
      trailing: (
        <Tooltip label="Copy path" placement="bottom">
          <button
            type="button"
            aria-label="Copy path"
            onClick={() => navigator.clipboard?.writeText(shownPath).catch(() => {})}
            className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
          >
            <Square2StackIcon size={13} aria-hidden="true" />
          </button>
        </Tooltip>
      ),
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col font-sans">
      {/* The state line, the path chip and the Link/Open actions moved up
          into the inspector cap (App.tsx) — the panel no longer restates
          the asset's identity above its own tabs. The path itself moved
          into Details > Identity's Path row, below. */}
      {kind !== "none" && (
        <UnderlineTabs
          tabs={[{ id: "content", label: "Content" }, { id: "details", label: "Details" }]}
          active={tab}
          onChange={(id) => changeTab(id as "content" | "details")}
          ariaLabel="Inspector view"
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scroll-gutter-stable scroll-thin">
        {kind !== "none" && tab === "content" && (
          <div role="tabpanel" id="panel-content" aria-labelledby="tab-content">
            {asset.category === "Skills" && body && (
              <section className="mx-[12px] my-3.5">
                {/* items-center, not items-baseline: the trigger is a glyph,
                    and a glyph has no baseline to share with the section head. */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className={sectionHeadClass}>Context</span>
                  {/* Names this panel's section, where the MCP panel says
                      "About the request figures" -- see the ContextNote
                      comment in McpServerDetail.tsx for why the two are
                      deliberately different strings. */}
                  <InfoPopover label="About the context figures">{CONTEXT_NOTE}</InfoPopover>
                </div>
                <ListCard>
                  {body.always_on_bytes != null && body.always_on_estimated_tokens != null && (
                    <ListCardRow
                      label={
                        <span className="flex flex-col gap-0.5 min-w-0">
                          <span className={rowValueClass}>Always on</span>
                          <span className={captionClass}>
                            Name and description, in every engine&rsquo;s startup list
                          </span>
                        </span>
                      }
                      value={
                        <span className="flex flex-col gap-0.5 items-end">
                          <span className={rowValueClass}>
                            ≈ {body.always_on_estimated_tokens.toLocaleString("en-US")} tokens
                          </span>
                          <span className={captionClass}>{formatBytes(body.always_on_bytes)}</span>
                        </span>
                      }
                    />
                  )}
                  <ListCardRow
                    label={
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className={rowValueClass}>When it opens</span>
                        <span className={captionClass}>SKILL.md in full, frontmatter included</span>
                      </span>
                    }
                    value={
                      <span className="flex flex-col gap-0.5 items-end">
                        <span className={rowValueClass}>
                          ≈ {body.estimated_tokens.toLocaleString("en-US")} tokens
                        </span>
                        <span className={captionClass}>{formatBytes(body.bytes)}</span>
                      </span>
                    }
                  />
                </ListCard>
              </section>
            )}

            {text !== null && (
              <section className="mx-[12px] my-3.5">
                <ListCard>
                  <ListCardRow
                    icon={<DocumentIcon size={14} aria-hidden="true" />}
                    label={<span className="font-mono">{basenameOf(shownPath)}</span>}
                    trailing={
                      showsTabs ? (
                        <Tooltip label="View source" placement="bottom">
                          <button
                            type="button"
                            aria-label="View source"
                            aria-pressed={view === "source"}
                            onClick={() => setView((v) => (v === "source" ? "preview" : "source"))}
                            className="ml-auto w-[21px] h-[21px] rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
                          >
                            <CodeBracketIcon size={13} aria-hidden="true" />
                          </button>
                        </Tooltip>
                      ) : undefined
                    }
                  />
                  {view === "preview" && document ? (
                    <MarkdownDoc blocks={toBlocks(document.body)} />
                  ) : view === "preview" && pretty ? (
                    <pre
                      data-testid="asset-formatted"
                      className="m-0 px-[18px] pt-3 pb-[18px] overflow-x-auto overflow-y-hidden font-mono text-small text-ink-1 leading-code whitespace-pre"
                    >
                      <code>{pretty}</code>
                    </pre>
                  ) : (
                    <pre
                      data-testid="asset-source"
                      className="m-0 px-[18px] pt-3 pb-[18px] overflow-x-auto overflow-y-hidden font-mono text-small text-ink-1 leading-code whitespace-pre"
                    >
                      <code>{text}</code>
                    </pre>
                  )}
                </ListCard>
              </section>
            )}

            {loading && (
              <p className={`px-[12px] py-3 ${captionClass} flex items-center gap-2`}>
                <FileTextIcon size={12} active />
                Reading the file…
              </p>
            )}

            {docError && (
              <p className={`mx-[12px] my-3 px-3.5 py-2.5 bg-plane rounded-inner ${captionClass}`}>
                {docError}
              </p>
            )}
          </div>
        )}

        {(kind === "none" || tab === "details") && (
          <div
            role={kind === "none" ? undefined : "tabpanel"}
            id={kind === "none" ? undefined : "panel-details"}
            aria-labelledby={kind === "none" ? undefined : "tab-details"}
          >
            <section className="mx-[12px] my-3.5">
              <div className="flex items-baseline justify-between gap-2 mb-2">
                <span className={sectionHeadClass}>Identity</span>
              </div>
              <ListCard>
                {identityRows.map((row) =>
                  row.key === "origin" ? (
                    // Only ever present in `identityRows` when `originView`
                    // is non-null (see where the row is spliced in above);
                    // the `originView &&` here is for TypeScript's benefit,
                    // not a runtime branch.
                    originView && (
                    <Fragment key="origin">
                      <ListCardRow
                        data-testid="identity-row-origin"
                        icon={<ArrowDownTrayIcon size={14} aria-hidden="true" />}
                        label="Origin"
                        wide={<OriginValue origin={originView} variant="identity" />}
                        trailing={
                          originView.subRows.length > 0 ? (
                            <button
                              type="button"
                              data-testid="origin-disclosure"
                              aria-expanded={originOpen}
                              aria-label={originOpen ? "Hide origin details" : "Show origin details"}
                              onClick={() => setOriginOpen((v) => !v)}
                              className="p-1 -m-1 text-ink-3 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
                            >
                              <ChevronDownIcon
                                size={12}
                                aria-hidden="true"
                                className={
                                  originOpen
                                    ? "rotate-180 transition-transform duration-hover"
                                    : "transition-transform duration-hover"
                                }
                              />
                            </button>
                          ) : undefined
                        }
                      />
                      {originOpen &&
                        originView.subRows.map((r) => (
                          <div
                            key={r.label}
                            data-testid="origin-sub-row"
                            className="flex items-center gap-2.5 pl-9 pr-3 py-[9px] min-h-9 bg-plane"
                          >
                            <span className={`min-w-0 flex-1 ${rowLabelClass}`}>{r.label}</span>
                            <span className={`ml-auto shrink-0 ${r.mono ? rowMonoClass : rowValueClass}`}>
                              {r.value}
                            </span>
                          </div>
                        ))}
                    </Fragment>
                    )
                  ) : (
                    <ListCardRow
                      key={row.key}
                      data-testid={`identity-row-${row.key}`}
                      icon={row.icon}
                      label={row.label}
                      value={row.value}
                      wide={row.wide}
                      trailing={row.trailing}
                    />
                  )
                )}
              </ListCard>
            </section>

            {dirEntries && dirEntries.length > 0 && (
              <section className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className={sectionHeadClass}>Contents</span>
                </div>
                <ListCard>
                  {dirEntries.map((e) => (
                    <ListCardRow
                      key={e.name}
                      data-testid="skill-dir-row"
                      icon={
                        e.kind === "dir" ? (
                          <FolderIcon size={14} aria-hidden="true" />
                        ) : e.kind === "symlink" ? (
                          <LinkIcon size={14} aria-hidden="true" />
                        ) : (
                          <DocumentIcon size={14} aria-hidden="true" />
                        )
                      }
                      label={<span className="font-mono">{e.name}</span>}
                      value={
                        e.kind === "dir"
                          ? `${e.file_count ?? 0} ${e.file_count === 1 ? "file" : "files"}`
                          // A symlink's target was never read, so its size is
                          // not "0 B" — it is not known.
                          : e.kind === "symlink"
                            ? "—"
                            // SKILL.md is the only entry a model ever loads;
                            // every other entry's size recedes to secondary
                            // ink so SKILL.md is the one that reads as full weight.
                            : e.name === "SKILL.md"
                              ? formatBytes(e.bytes ?? 0)
                              : <span className="text-ink-3">{formatBytes(e.bytes ?? 0)}</span>
                      }
                    />
                  ))}
                </ListCard>
                {/* No prose under this card. "Only SKILL.md is read into
                    context" is a fact about the harness rather than about the
                    asset on screen — true of every skill, so the panel was
                    restating it on every asset opened. It lives in
                    docs/harness.md, under the conventions the code encodes.
                    Karthik's ruling, 2026-08-28. */}
              </section>
            )}

            {allowedTools.length > 0 && (
              <section className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className={sectionHeadClass}>Capabilities</span>
                </div>
                <ListCard>
                  {allowedTools.map((tool) => (
                    <ListCardRow
                      key={tool}
                      data-testid="capability-row"
                      icon={<CommandLineIcon size={14} aria-hidden="true" />}
                      label={<span className="font-mono">{tool}</span>}
                      wide={tool.startsWith("Bash") ? "Shell access" : undefined}
                    />
                  ))}
                </ListCard>
              </section>
            )}

            {/* Every engine, grouped by the route it takes to this asset. The
                row can draw at most three marks, so this is where the rest are
                answerable. Keyed by path so the selected plate is forgotten
                when the asset changes — the selection belongs to the asset on
                screen, not to the user's view, and Flyout renders this panel
                unkeyed, so nothing else would reset it. Karthik's ruling,
                2026-08-28. */}
            {annotation && annotation.reach.length > 0 && (
              <section data-testid="reach-detail" className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <span className={sectionHeadClass}>Reach</span>
                  {/* One store for the whole card, not one per row. `via_store` is
                      keyed off the asset's own root in annotations.rs, so every
                      reached engine reports the same one by construction — this
                      cannot disagree with the rows beneath it. */}
                  {reachStore && (
                    <span data-testid="reach-store" className="font-mono text-small text-ink-3">
                      → {reachStore}
                    </span>
                  )}
                </div>

                <ReachCard key={asset.path} reach={reach} />
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
