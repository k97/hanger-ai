import { Command } from "cmdk";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { MagnifyingGlassIcon } from "./icons";
import { groupLabelClass, captionClass } from "./typeRoles";

export type SearchKind = "skill" | "rule" | "subagent" | "server" | "mcp_tool";

/** Mirrors `search::SearchHit` (src-tauri/src/search.rs). */
export interface SearchHit {
  kind: SearchKind;
  /** What to select by: the asset path, or the registration key for a
   *  server and for each of its tools. */
  id: string;
  path: string;
  name: string;
  /** The server a tool belongs to; null for every other kind. */
  server: string | null;
  /** "global" or the project root. */
  place: string;
  /** Matched runs sit between U+E000 and U+E001. */
  snippet: string;
  rank: number;
}

export interface SearchResponse {
  hits: SearchHit[];
  total: number;
}

const MARK_OPEN = "";
const MARK_CLOSE = "";

/** Fixed group order (Karthik's ruling, 2026-08-28, superseding "glyph rows,
 *  no headings"): a heading does the grouping's job now, so the glyph is
 *  gone. Rows stay in the backend's rank order within their group; a kind
 *  with no hits renders nothing. */
const GROUP_ORDER: { kind: SearchKind; heading: string }[] = [
  { kind: "skill", heading: "Skills" },
  { kind: "server", heading: "MCP servers" },
  { kind: "mcp_tool", heading: "Tools" },
  { kind: "rule", heading: "Rules" },
  { kind: "subagent", heading: "Subagents" },
];

/** The snippet's private-use markers become <mark>; nothing else is parsed. */
export function renderSnippet(snippet: string): ReactNode {
  return snippet.split(MARK_OPEN).flatMap((chunk, i) => {
    if (i === 0) return [chunk];
    const end = chunk.indexOf(MARK_CLOSE);
    if (end === -1) return [chunk];
    return [
      <mark key={i} className="text-ink-1 font-medium">
        {chunk.slice(0, end)}
      </mark>,
      // MARK_CLOSE is one UTF-16 code unit, so this offsets past it exactly.
      chunk.slice(end + 1),
    ];
  });
}

export function placeLabel(place: string): string {
  if (place === "global") return "Global";
  return place.split("/").filter(Boolean).pop() ?? place;
}

interface SearchPaletteProps {
  open: boolean;
  /** The last completed scan; null before the first. The index reflects a
   *  completed scan, so before one there is nothing honest to answer. */
  scannedAt: Date | null;
  onClose: () => void;
  onPick: (hit: SearchHit) => void;
}

const DEBOUNCE_MS = 80;

export interface SearchPalettePanelProps {
  query: string;
  onQueryChange: (q: string) => void;
  /** null: nothing asked yet; []: asked, nothing found. */
  hits: SearchHit[] | null;
  /** False before the first scan completes: the pending line shows and nothing is queried. */
  hasScanned: boolean;
  onPick: (hit: SearchHit) => void;
  /** The panel's accessible name and the input's. The app passes the real ones;
   *  the Design system page passes sample names so a reader never hears a control that does nothing. */
  dialogLabel: string;
  inputLabel: string;
  autoFocus?: boolean;
}

/**
 * The palette's dialog panel: the `Command` root, the input row and the
 * ranked list, with its three copy states. No `invoke`, no timers, no
 * window listeners — those stay with `SearchPalette`, which owns the wash
 * and the debounced fetch. Kept presentational so the Design system page
 * can render it from fixtures.
 */
export function SearchPalettePanel({
  query,
  onQueryChange,
  hits,
  hasScanned,
  onPick,
  dialogLabel,
  inputLabel,
  autoFocus,
}: SearchPalettePanelProps) {
  const q = query.trim();
  const answeredEmpty = hits !== null && hits.length === 0;
  const groups = GROUP_ORDER.map(({ kind, heading }) => ({
    kind,
    heading,
    rows: (hits ?? []).filter((hit) => hit.kind === kind),
  })).filter((group) => group.rows.length > 0);

  return (
    <div
      role="dialog"
      aria-label={dialogLabel}
      className="w-[560px] max-w-[calc(100vw-32px)] max-h-[60vh] flex flex-col bg-page border border-line rounded-plane shadow-overlay animate-drop overflow-hidden"
    >
      <Command shouldFilter={false} label={dialogLabel} className="flex flex-col min-h-0">
        <div className="p-3 shrink-0">
          <div className="relative h-[30px]">
            <MagnifyingGlassIcon
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none"
              aria-hidden="true"
            />
            {/* The panel already frames this field, and it's the only focusable
                control inside it, so it opts out of the global focus ring — via
                the unlayered `[cmdk-input]:focus-visible` rule in index.css, not
                a utility class, because a layered utility cannot outrank an
                unlayered one (CSS Cascade 5). The pill's own focus treatment —
                a `--line-2` border, a page ground — is the affordance instead;
                ink-1 read as harsh (Karthik, 2026-08-29). */}
            <Command.Input
              autoFocus={autoFocus}
              value={query}
              onValueChange={onQueryChange}
              aria-label={inputLabel}
              placeholder="Search skills, rules, subagents and MCP servers"
              className="w-full h-full rounded-pill border border-transparent bg-plane pl-[30px] pr-3.5 text-small text-ink-1 placeholder:text-ink-3 focus:border-line-2 focus:bg-page transition-colors duration-hover ease-spring"
            />
          </div>
        </div>
        <Command.List className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 scroll-thin [&_[cmdk-group-items]]:flex [&_[cmdk-group-items]]:flex-col [&_[cmdk-group-items]]:gap-px">
          {!hasScanned ? (
            <p className={`py-8 px-4 text-center ${captionClass}`}>Results show up here once the first scan finishes.</p>
          ) : hits === null ? (
            // Covers an empty query and a rejected search alike: neither has an
            // answer to show, so both get the hint rather than an asserted absence.
            <p className={`py-8 px-4 text-center ${captionClass}`}>Type to search names and what's inside.</p>
          ) : answeredEmpty ? (
            <p className={`py-8 px-4 text-center ${captionClass}`}>Nothing matches “{q}”.</p>
          ) : null}
          {groups.map((group, i) => (
            <Command.Group key={group.kind} aria-label={group.heading}>
              {/* cmdk's own `heading` prop marks the string aria-hidden and
                  wires aria-labelledby itself; rendered as our own div
                  instead so the app's own tokens apply directly — the
                  sidebar's own group-label shape (`Sidebar.tsx`'s `grpClass`). */}
              <div
                className={`flex items-center px-3 pb-[5px] ${groupLabelClass} ${i === 0 ? "pt-1" : "pt-[11px]"}`}
                aria-hidden="true"
              >
                {group.heading}
              </div>
              {group.rows.map((hit) => (
                <Command.Item
                  key={`${hit.kind}:${hit.id}:${hit.name}`}
                  value={`${hit.kind}:${hit.id}:${hit.name}`}
                  data-kind={hit.kind}
                  onSelect={() => onPick(hit)}
                  className="h-[46px] px-3 rounded-pill flex flex-col justify-center gap-0.5 cursor-pointer hover:bg-plane data-[selected=true]:bg-tint transition-colors duration-nav ease-spring"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-base-app text-ink-1 truncate">{hit.name}</span>
                    {hit.server && (
                      <span className="text-base-app text-ink-3 truncate">
                        · <span>{hit.server}</span>
                      </span>
                    )}
                    <span className={`ml-auto pl-4 ${captionClass} tabular shrink-0`}>{placeLabel(hit.place)}</span>
                  </div>
                  <div className={`${captionClass} truncate`}>{renderSnippet(hit.snippet)}</div>
                </Command.Item>
              ))}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}

/**
 * The search palette: ⌘K or the rail's Search button. A wash over the app,
 * a top-aligned panel, and a cmdk list the backend has already ranked
 * (`shouldFilter={false}`). Hits come back as one ranked list from the
 * backend and are grouped by kind under headings, in fixed group order,
 * each group keeping the backend's own rank order within it.
 */
export default function SearchPalette({ open, scannedAt, onClose, onPick }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  // null: nothing asked yet (or the query is empty); []: asked, nothing found.
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits(null);
  }, [open]);

  useEffect(() => {
    if (!open || scannedAt === null) return;
    const q = query.trim();
    if (q === "") {
      // Bump seq so a response for the just-cleared query can't land under the hint.
      seq.current += 1;
      setHits(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      invoke<SearchResponse>("search_assets", { query: q, limit: 50 })
        .then((res) => {
          if (seq.current === mine) setHits(res.hits);
        })
        .catch(() => {
          // A rejected search is not a "nothing found" answer: back to null
          // so the hint shows instead of asserting an empty result.
          if (seq.current === mine) setHits(null);
        });
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [open, query, scannedAt]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="search-wash"
      className="fixed inset-0 z-[100] flex justify-center items-start pt-[12vh] bg-scrim animate-fade-in font-sans"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <SearchPalettePanel
        query={query}
        onQueryChange={setQuery}
        hits={hits}
        hasScanned={scannedAt !== null}
        onPick={onPick}
        dialogLabel="Search"
        inputLabel="Search assets"
        autoFocus
      />
    </div>
  );
}
