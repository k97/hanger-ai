import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowTopRightOnSquareIcon, Square2StackIcon } from "./icons";
import Tooltip from "./Tooltip";
import MarkdownDoc from "./MarkdownDoc";
import type { Inventory } from "../App";
import { engineLabel, provenanceOf, sourceLabel } from "../utils/assetProvenance";
import { parseSkillDocument, SPEC_FIELDS, toBlocks } from "../utils/skillDocument";

interface DetailAsset {
  category: string;
  name: string;
  path: string;
  scopeBadge?: string;
  version?: string;
  details?: string;
}

interface AssetDetailProps {
  asset: DetailAsset;
  inventory: Inventory | null;
  /** Opens the link flow on this asset. Absent for kinds that cannot deploy. */
  onLink?: () => void;
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
export default function AssetDetail({ asset, inventory, onLink }: AssetDetailProps) {
  const [tab, setTab] = useState<"preview" | "source">("preview");
  const [text, setText] = useState<string | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setDocError(null);
    setTab("preview");
    setLoading(true);

    invoke<string>("read_asset_body", { path: asset.path })
      .then((body) => {
        if (!cancelled) setText(body);
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
  }, [asset.path]);

  const provenance = provenanceOf(asset as never, inventory);
  const document = text === null ? null : parseSkillDocument(text);

  const meta: { key: string; value: string }[] = [
    { key: "Engine", value: engineLabel(asset as never) },
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
          <span className="flex-1 min-w-0 truncate select-all" title={asset.path}>
            {asset.path}
          </span>
          <Tooltip label="Copy path" placement="bottom">
            <button
              aria-label="Copy path"
              onClick={() => navigator.clipboard?.writeText(asset.path).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <Square2StackIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Reveal in Finder" placement="bottom">
            <button
              aria-label="Reveal in Finder"
              onClick={() => revealItemInDir(parentOf(asset.path)).catch(() => {})}
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
        <button onClick={() => openPath(asset.path).catch(() => {})} className={btnClass}>
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

        {document && (
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

            {tab === "preview" ? (
              <MarkdownDoc blocks={toBlocks(document.body)} />
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
