import { Fragment, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowDownTrayIcon,
  ClockIcon,
  CodeBracketIcon,
  CommandLineIcon,
  CpuChipIcon,
  DocumentIcon,
  DocumentTextIcon,
  FileTextIcon,
  FolderIcon,
  GaugeIcon,
  GlobeAltIcon,
  LinkIcon,
  Square2StackIcon,
  TagIcon,
} from "./icons";
import Tooltip from "./Tooltip";
import MarkdownDoc from "./MarkdownDoc";
import UnderlineTabs from "./UnderlineTabs";
import ListCard, { ListCardRow } from "./ListCard";
import type { Inventory } from "../App";
import { engineLabel, provenanceOf, sourceLabel } from "../utils/assetProvenance";
import { scopeAgent, type Scope } from "../utils/scopeAccess";
import EngineLabel from "./EngineLabel";
import BrandIcon from "./BrandIcon";
import { abbreviateHome } from "../utils/prose";
import type { EngineReachInfo } from "./EngineReachTiles";
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
}

const eyebrowClass = "font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3";

interface IdentityRow {
  key: string;
  label: string;
  icon: ReactNode;
  value?: ReactNode;
  wide?: ReactNode;
  trailing?: ReactNode;
}

/* The Reach card's groups, in reading order: what reaches it, then why the
   rest do not. `format` is a different fact from an unlinked root — the asset
   belongs to another engine and sits in that engine's format, so nothing is
   missing and nothing is broken — and giving it its own heading is what stops
   the card stating a reason once per row. Labels signed off 2026-08-17;
   `annotations.rs` emits only these two reasons, so three groups is the
   ceiling rather than an open list. */
const REACH_GROUPS: { key: string; title: string; holds: (r: EngineReachInfo) => boolean }[] = [
  { key: "reached", title: "Reaches it", holds: (r) => r.reached },
  { key: "unlinked", title: "Root not linked", holds: (r) => !r.reached && r.reason !== "format" },
  { key: "format", title: "Another engine's format", holds: (r) => !r.reached && r.reason === "format" },
];

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
export default function AssetDetail({ asset, inventory, onDocumentPath, annotation }: AssetDetailProps) {
  const [tab, setTab] = useState<"content" | "details">("content");
  const [view, setView] = useState<"preview" | "source">("preview");
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
    setTab("content");
    setView("preview");

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
  /* Empty groups are dropped, so the card never prints a heading over nothing.
     `members.length > 0` is a boolean, not a count — the counting contract
     allows the comparison and forbids the tally. */
  const reachGroups = REACH_GROUPS.map((group) => ({
    ...group,
    members: reach.filter(group.holds),
  })).filter((group) => group.members.length > 0);
  /* One store for the card. `via_store` is keyed off the asset's own root in
     annotations.rs, so every reached engine reports the same value and the cap
     cannot contradict the rows. */
  const reachStoreRaw = reach.find((r) => r.reached && r.via_store)?.via_store;
  const reachStore = reachStoreRaw ? abbreviateHome(reachStoreRaw) : null;

  const provenance = provenanceOf(asset as never, inventory);
  const shownPath = documentPath ?? asset.path;
  const document = text === null || kind !== "markdown" ? null : parseSkillDocument(text);
  // A config that will not parse keeps its Source tab and loses only the
  // formatted view — the file is still the answer to "what is in there".
  const pretty = text !== null && kind === "json" ? formatJson(text) : null;
  const showsTabs = document !== null || pretty !== null;

  const specRows: IdentityRow[] = document
    ? (SPEC_FIELDS as readonly string[])
        .filter((key) => key !== "name" && key !== "description" && key !== "allowed-tools")
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
    // file, and one panel cannot use the same word for two things.
    {
      key: "origin",
      label: "Origin",
      icon: <ArrowDownTrayIcon size={14} aria-hidden="true" />,
      wide: sourceLabel(asset as never),
    },
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
    ...(body
      ? [
          {
            key: "size",
            label: "Size",
            icon: <DocumentIcon size={14} aria-hidden="true" />,
            value: `${formatBytes(body.bytes)} · ${body.lines} lines`,
          },
          // Hide-at-zero: `modified_ms` is `None` when the platform reports
          // no mtime, so the row is omitted rather than rendering a
          // fabricated epoch date (formerly `unwrap_or(0)` → "Jan 1, 1970").
          ...(body.modified_ms !== null
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
          onChange={(id) => setTab(id as "content" | "details")}
          ariaLabel="Inspector view"
        />
      )}

      <div className="flex-1 min-h-0 overflow-y-auto scroll-gutter-stable scroll-thin">
        {kind !== "none" && tab === "content" && (
          <div role="tabpanel" id="panel-content" aria-labelledby="tab-content">
            {asset.category === "Skills" && body && (
              <section className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className={eyebrowClass}>Context</span>
                </div>
                <ListCard>
                  <ListCardRow
                    icon={<GaugeIcon size={14} aria-hidden="true" />}
                    label={
                      <span className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-small leading-[1.5]">
                          Name and description always loaded · {formatBytes(body.bytes)} when opened
                        </span>
                        <span className="font-mono text-micro text-ink-3 leading-[1.5]">
                          ≈ {body.estimated_tokens.toLocaleString("en-US")} tokens, estimated · not checked per
                          engine
                        </span>
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
                      className="m-0 px-[18px] pt-3 pb-[18px] overflow-x-auto overflow-y-hidden font-mono text-micro text-ink-2 leading-[1.6] whitespace-pre"
                    >
                      <code>{pretty}</code>
                    </pre>
                  ) : (
                    <pre
                      data-testid="asset-source"
                      className="m-0 px-[18px] pt-3 pb-[18px] overflow-x-auto overflow-y-hidden font-mono text-micro text-ink-2 leading-[1.6] whitespace-pre"
                    >
                      <code>{text}</code>
                    </pre>
                  )}
                </ListCard>
              </section>
            )}

            {loading && (
              <p className="px-[18px] py-3 text-small text-ink-3 flex items-center gap-2">
                <FileTextIcon size={12} active />
                Reading the file…
              </p>
            )}

            {docError && (
              <p className="mx-[12px] my-3 px-3.5 py-2.5 bg-plane rounded-inner text-small text-ink-3 leading-[1.6]">
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
              <div className="flex items-baseline justify-between gap-2 mb-3">
                <span className={eyebrowClass}>Identity</span>
              </div>
              <ListCard>
                {identityRows.map((row) => (
                  <ListCardRow
                    key={row.key}
                    data-testid={`identity-row-${row.key}`}
                    icon={row.icon}
                    label={row.label}
                    value={row.value}
                    wide={row.wide}
                    trailing={row.trailing}
                  />
                ))}
              </ListCard>
            </section>

            {dirEntries && dirEntries.length > 0 && (
              <section className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className={eyebrowClass}>Contents</span>
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
                            : formatBytes(e.bytes ?? 0)
                      }
                    />
                  ))}
                </ListCard>
              </section>
            )}

            {allowedTools.length > 0 && (
              <section className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className={eyebrowClass}>Capabilities</span>
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

            {/* Every engine, grouped by verdict. The row can draw at most three
                marks, so this is where the rest are answerable — and grouping is
                what lets each reason be stated once instead of on every line. A
                format miss is a different fact from an unlinked root: the asset
                belongs to another engine and is in that engine's format, so
                nothing is missing and nothing is broken. Labels signed off
                2026-08-17. */}
            {annotation && annotation.reach.length > 0 && (
              <section data-testid="reach-detail" className="mx-[12px] my-3.5">
                <div className="flex items-baseline justify-between gap-2 mb-3">
                  <span className={eyebrowClass}>Reach</span>
                  {/* One store for the whole card, not one per row. `via_store` is
                      keyed off the asset's own root in annotations.rs, so every
                      reached engine reports the same one by construction — this
                      cannot disagree with the rows beneath it. */}
                  {reachStore && (
                    <span data-testid="reach-store" className="font-mono text-micro text-ink-3">
                      → {reachStore}
                    </span>
                  )}
                </div>

                {reachGroups.map((group, i) => (
                  <Fragment key={group.key}>
                    <div
                      data-testid={`reach-group-${group.key}`}
                      className={`${eyebrowClass} mb-1 ${i > 0 ? "mt-3" : ""}`}
                    >
                      {group.title}
                    </div>
                    <ListCard data-testid={`reach-members-${group.key}`}>
                      {group.members.map((r) => (
                        <ListCardRow
                          key={r.engine_id}
                          data-testid={`reach-detail-${r.engine_key}`}
                          icon={
                            <i
                              className={`w-3.5 h-3.5 rounded-control grid place-items-center not-italic ${
                                r.reached ? "" : "border border-line opacity-40"
                              }`}
                            >
                              <BrandIcon engineKey={r.engine_key} engineName={r.engine_name} size={12} />
                            </i>
                          }
                          label={
                            <span className={`truncate min-w-0 ${r.reached ? "text-ink-1" : "text-ink-3"}`}>
                              {r.engine_name}
                            </span>
                          }
                          value={
                            r.reached ? (
                              r.via_root ? (
                                abbreviateHome(r.via_root)
                              ) : (
                                "in place"
                              )
                            ) : (
                              <span className="opacity-50">—</span>
                            )
                          }
                        />
                      ))}
                    </ListCard>
                  </Fragment>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
