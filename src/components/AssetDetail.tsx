import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowTopRightOnSquareIcon, Square2StackIcon } from "./icons";
import Tooltip from "./Tooltip";
import MarkdownDoc from "./MarkdownDoc";
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

interface AssetDetailProps {
  asset: DetailAsset;
  inventory: Inventory | null;
  /** Opens the link flow on this asset. Absent for kinds that cannot deploy. */
  onLink?: () => void;
  /** The backend's per-engine verdicts for this asset. The Reach column draws
   *  at most three of them, so this panel is where the rest are answerable.
   *  Null means the backend had no verdict — the section is omitted rather
   *  than asserting an absence of engines. */
  annotation?: AssetAnnotationView | null;
}

const btnClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-nav ease-spring hover:bg-plane-2 active:scale-[0.96]";
const btnPrimaryClass =
  "h-[30px] px-4 rounded-pill border border-transparent bg-fill text-on-fill text-small font-medium cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]";
const segClass =
  "h-[27px] px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const segPressedClass =
  "h-[27px] px-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-flex text-small font-medium cursor-pointer transition-colors duration-nav ease-spring";

const DOT: Record<string, string> = {
  linked: "bg-state-success",
  drifted: "bg-state-warning",
  broken: "bg-state-danger",
  local: "border-2 border-line-2",
};
const STATE_INK: Record<string, string> = {
  linked: "text-state-success",
  drifted: "text-state-warning",
  broken: "text-state-danger",
  local: "text-ink-3",
};

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

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : path;
}

/** "3.1 kB · 84 lines" — measured from the text actually read, never guessed. */
function sizeOf(text: string): string {
  const bytes = new TextEncoder().encode(text).byteLength;
  const size = bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`;
  const lines = text.split("\n");
  return `${size} · ${lines.length} lines`;
}

/**
 * The inspector's detail screen: what this file is, what it is related to, and
 * what it says.
 *
 * The document is the point of the panel. Everything above it — the state
 * line, the meta grid — exists to answer the questions the document itself
 * cannot: where the file sits and what else on the machine depends on it.
 */
export default function AssetDetail({ asset, inventory, onLink, annotation }: AssetDetailProps) {
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const [text, setText] = useState<string | null>(null);
  // What the backend actually read. A skill's own path is the folder that
  // holds it, so the document sits one level in and the panel says so rather
  // than showing a directory above a rendered file.
  const [documentPath, setDocumentPath] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const kind = documentKindFor(asset.category);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setDocumentPath(null);
    setDocError(null);
    setTab("preview");

    // An agent has no file of its own — it is a folder layout the scan
    // inferred — so there is nothing to read and no pane to fill.
    if (kind === "none") {
      setLoading(false);
      return;
    }
    setLoading(true);

    invoke<{ path: string; text: string }>("read_asset_body", { path: asset.path })
      .then((body) => {
        if (cancelled) return;
        setText(body.text);
        setDocumentPath(body.path);
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

  const meta: { key: string; value: ReactNode }[] = [
    {
      key: "Engine",
      value: (
        <EngineLabel engineKey={scopeAgent(asset.scope as Scope)} size={14}>
          {engineLabel(asset as never)}
        </EngineLabel>
      ),
    },
    { key: "Scope", value: provenance.place },
    ...(provenance.linkedInto.length > 0
      ? [{ key: "Linked into", value: provenance.linkedInto.join(", ") }]
      : []),
    ...(provenance.source ? [{ key: "Points at", value: provenance.source }] : []),
    // "Origin" rather than "Source": the Source tab below means the raw
    // file, and one panel cannot use the same word for two things.
    { key: "Origin", value: sourceLabel(asset as never) },
    ...(asset.version ? [{ key: "Version", value: asset.version }] : []),
    ...(text ? [{ key: "Size", value: sizeOf(text) }] : []),
  ];

  const specMeta = document
    ? (SPEC_FIELDS as readonly string[])
        .filter((key) => key !== "name" && key !== "description")
        .filter((key) => document.frontmatter[key] !== undefined)
        .map((key) => ({
          key: key === "allowed-tools" ? "Allowed tools" : key[0].toUpperCase() + key.slice(1),
          value: String(
            Array.isArray(document.frontmatter[key])
              ? (document.frontmatter[key] as string[]).join(", ")
              : document.frontmatter[key]
          ),
        }))
    : [];

  return (
    <div className="flex-1 min-h-0 flex flex-col font-sans">
      <div className="px-[18px] pt-3 pb-3.5 border-b border-line shrink-0">
        <div className="flex items-center gap-[7px] mb-3">
          <i className={`w-2 h-2 rounded-pill shrink-0 ${DOT[provenance.state]}`} />
          <span className={`font-flex text-small ${STATE_INK[provenance.state]}`}>
            {provenance.statement}
          </span>
        </div>

        <div className="flex items-center gap-2 bg-plane rounded-inner pl-2.5 pr-1.5 py-2 font-mono text-micro text-ink-2">
          <span className="flex-1 min-w-0 truncate select-all" title={shownPath}>
            {shownPath}
          </span>
          <Tooltip label="Copy path" placement="bottom">
            <button
              aria-label="Copy path"
              onClick={() => navigator.clipboard?.writeText(shownPath).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <Square2StackIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Reveal in Finder" placement="bottom">
            <button
              aria-label="Reveal in Finder"
              onClick={() => revealItemInDir(parentOf(shownPath)).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <ArrowTopRightOnSquareIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex gap-2 px-[18px] py-3 border-b border-line shrink-0">
        {onLink && (
          <button onClick={onLink} className={btnPrimaryClass}>
            Link to…
          </button>
        )}
        <button onClick={() => openPath(shownPath).catch(() => {})} className={btnClass}>
          Open in editor
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <dl className="mx-[18px] my-3.5 px-3.5 py-3 bg-plane rounded-plane grid grid-cols-[92px_1fr] gap-y-2 gap-x-3 text-small">
          {[...meta, ...specMeta].map((row) => (
            <div key={row.key} className="contents">
              <dt className="font-flex text-ink-3">{row.key}</dt>
              <dd className="text-ink-1 break-all">{row.value}</dd>
            </div>
          ))}
        </dl>

        {/* Every engine, grouped by verdict. The row can draw at most three
            marks, so this is where the rest are answerable — and grouping is
            what lets each reason be stated once instead of on every line. A
            format miss is a different fact from an unlinked root: the asset
            belongs to another engine and is in that engine's format, so
            nothing is missing and nothing is broken. Labels signed off
            2026-08-17. */}
        {annotation && annotation.reach.length > 0 && (
          <section
            data-testid="reach-detail"
            className="mx-[18px] mb-3.5 px-3.5 py-3 bg-plane rounded-plane flex flex-col gap-3"
          >
            <div className="flex items-baseline justify-between gap-2.5">
              <span className="font-flex text-micro font-medium uppercase tracking-[.06em] text-ink-3">
                Reach
              </span>
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

            {reachGroups.map((group) => (
              <div key={group.key} className="flex flex-col gap-1.5">
                <div
                  data-testid={`reach-group-${group.key}`}
                  className="flex items-center gap-2 font-flex text-micro uppercase tracking-[.06em] text-ink-3"
                >
                  <span className="shrink-0">{group.title}</span>
                  <span className="flex-1 h-px bg-line" aria-hidden="true" />
                </div>
                <ul
                  data-testid={`reach-members-${group.key}`}
                  className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 items-center"
                >
                  {group.members.map((r) => (
                    <li
                      key={r.engine_id}
                      data-testid={`reach-detail-${r.engine_key}`}
                      className="contents"
                    >
                      <span className="flex items-center gap-2 min-w-0 text-small">
                        <i
                          className={`w-4 h-4 rounded-[6px] grid place-items-center shrink-0 not-italic ${
                            r.reached ? "" : "border border-line opacity-40"
                          }`}
                        >
                          <BrandIcon engineKey={r.engine_key} engineName={r.engine_name} size={12} />
                        </i>
                        <span className={`truncate ${r.reached ? "text-ink-1" : "text-ink-3"}`}>
                          {r.engine_name}
                        </span>
                      </span>
                      {r.reached ? (
                        <span className="font-mono text-micro text-ink-3 justify-self-end truncate max-w-[168px]">
                          {r.via_root ? abbreviateHome(r.via_root) : "in place"}
                        </span>
                      ) : (
                        /* The header already said why. The dash holds the
                           column so the names stay in one edge. */
                        <span className="font-mono text-micro text-ink-3 opacity-50 justify-self-end">
                          —
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {showsTabs && (
          <>
            <div className="flex gap-1.5 mx-[18px]" role="group" aria-label="Document view">
              <button
                aria-pressed={tab === "preview"}
                onClick={() => setTab("preview")}
                className={tab === "preview" ? segPressedClass : segClass}
              >
                Preview
              </button>
              <button
                aria-pressed={tab === "source"}
                onClick={() => setTab("source")}
                className={tab === "source" ? segPressedClass : segClass}
              >
                Source
              </button>
            </div>

            {tab === "preview" && document ? (
              <MarkdownDoc blocks={toBlocks(document.body)} />
            ) : tab === "preview" && pretty ? (
              <pre
                data-testid="asset-formatted"
                className="mx-[18px] my-3 p-3 bg-plane rounded-inner overflow-x-auto font-mono text-micro text-ink-2 leading-[1.6] whitespace-pre"
              >
                <code>{pretty}</code>
              </pre>
            ) : (
              <pre
                data-testid="asset-source"
                className="mx-[18px] my-3 p-3 bg-plane rounded-inner overflow-x-auto font-mono text-micro text-ink-2 leading-[1.6] whitespace-pre"
              >
                <code>{text}</code>
              </pre>
            )}
          </>
        )}

        {/* Read, but nothing to format — a config mid-edit, say. The file is
            still the answer, so it is shown; there is just nothing to switch
            between. */}
        {text !== null && !showsTabs && (
          <pre
            data-testid="asset-source"
            className="mx-[18px] my-3 p-3 bg-plane rounded-inner overflow-x-auto font-mono text-micro text-ink-2 leading-[1.6] whitespace-pre"
          >
            <code>{text}</code>
          </pre>
        )}

        {loading && (
          <p className="px-[18px] py-3 text-small text-ink-3">Reading the file…</p>
        )}

        {docError && (
          <p className="mx-[18px] my-3 px-3.5 py-2.5 bg-plane rounded-inner text-small text-ink-3 leading-[1.6]">
            {docError}
          </p>
        )}
      </div>
    </div>
  );
}
