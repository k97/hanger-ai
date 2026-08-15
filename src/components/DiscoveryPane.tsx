import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ArrowTopRightOnSquareIcon, CheckIcon, Square2StackIcon } from "./icons";
import {
  CATALOGUE_CHECKED,
  DIRECTORIES,
  TIERS,
  type Directory,
} from "../data/directories";
import { kindCounts, matchesDirectory } from "../utils/directoryFacets";

interface DiscoveryPaneProps {
  /** The toolbar filter field, shared with the asset panes. */
  filterText?: string;
}

const chipBaseClass =
  "h-7 px-3.5 rounded-pill border border-line-2 font-flex text-small text-ink-2 whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const chipPressedClass =
  "h-7 pl-2.5 pr-3.5 rounded-pill border border-transparent bg-tint text-tint-ink font-medium whitespace-nowrap inline-flex items-center gap-2 cursor-pointer transition-colors duration-nav ease-spring font-flex text-small";

const btnClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const btnPrimaryClass =
  "h-[30px] px-4 rounded-pill border border-transparent bg-fill text-on-fill text-small font-medium cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96]";

/** Strips the scheme so the row shows the domain the way people say it. */
function bare(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Discovery — where the ecosystem publishes agent assets.
 *
 * The row is the whole interaction: it navigates. The fetch command is the one
 * exception — it copies rather than navigating, because that string is what the
 * user actually needs in a terminal.
 *
 * Hanger deliberately does not fetch from these directories. Leaving the app is
 * therefore a real decision, and gets a confirmation the user can switch off.
 */
export default function DiscoveryPane({ filterText = "" }: DiscoveryPaneProps) {
  const [kind, setKind] = useState<string>("All");
  const [confirmBeforeOpening, setConfirmBeforeOpening] = useState(true);
  const [pending, setPending] = useState<Directory | null>(null);
  const [remember, setRemember] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    invoke<string | null>("get_preference", { key: "discovery_confirm_open" })
      .then((value) => {
        if (value !== null) setConfirmBeforeOpening(value === "true");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(timer);
  }, [toast]);

  const facets = kindCounts(DIRECTORIES);
  const shown = DIRECTORIES.filter((dir) => matchesDirectory(dir, kind, filterText));

  const setConfirmPreference = (next: boolean) => {
    setConfirmBeforeOpening(next);
    invoke("set_preference", {
      key: "discovery_confirm_open",
      value: next ? "true" : "false",
    }).catch(() => {});
  };

  const leave = (url: string) => {
    openUrl(url).catch(() => {});
  };

  const requestOpen = (dir: Directory) => {
    if (!confirmBeforeOpening) {
      leave(dir.url);
      return;
    }
    setRemember(false);
    setPending(dir);
  };

  const confirmOpen = () => {
    if (remember) setConfirmPreference(false);
    if (pending) leave(pending.url);
    setPending(null);
  };

  const copyFetch = (command: string) => {
    navigator.clipboard?.writeText(command).catch(() => {});
    setToast("Command copied");
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-page font-sans relative">
      <header className="px-[18px] pt-5 pb-1 shrink-0">
        <div className="flex items-baseline gap-3.5 mb-[7px]">
          <h1 className="text-lg-app font-medium tracking-[-0.2px] text-ink-1">
            Where the ecosystem publishes agent assets
          </h1>
          <span className="ml-auto font-flex text-micro text-ink-3 shrink-0">
            Checked {CATALOGUE_CHECKED}
          </span>
        </div>
        <p className="text-small text-ink-2 leading-[1.55] max-w-[74ch]">
          {DIRECTORIES.length} directories worth knowing about. Hanger doesn't fetch from them, so
          open one, run its command, then rescan and the new assets appear under My machine.
        </p>
      </header>

      <div
        className="flex items-center gap-[7px] px-[18px] pt-3.5 pb-2.5 overflow-x-auto shrink-0"
        role="group"
        aria-label="Filter by what a directory holds"
      >
        {facets.map((facet) => {
          const pressed = facet.kind === kind;
          return (
            <button
              key={facet.kind}
              tabIndex={0}
              aria-pressed={pressed}
              onClick={() => setKind(facet.kind)}
              className={pressed ? chipPressedClass : chipBaseClass}
            >
              {pressed && <CheckIcon size={14} className="shrink-0" />}
              <span>{facet.kind}</span>
              <span
                className={`text-micro tabular ${
                  pressed ? "text-tint-ink opacity-70" : "text-ink-3"
                }`}
              >
                {facet.count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto mx-[18px] p-1.5 border border-line rounded-tl-plane rounded-tr-plane">
        {shown.length === 0 ? (
          <p className="py-9 px-3 text-center text-small text-ink-3">
            No directory matches that filter.
          </p>
        ) : (
          TIERS.map((tier) => {
            const rows = shown.filter((dir) => dir.tier === tier.tier);
            if (rows.length === 0) return null;
            return (
              <section key={tier.tier}>
                <div className="flex items-center gap-2.5 px-3 pt-[15px] pb-[7px] font-flex text-micro font-medium tracking-[.06em] uppercase text-ink-3">
                  <span>{tier.tier}</span>
                  <i className="flex-1 h-px bg-line" />
                  <span className="font-normal tracking-normal normal-case text-small text-ink-3 opacity-75">
                    {tier.note}
                  </span>
                </div>

                {rows.map((dir) => (
                  <div
                    key={dir.name}
                    role="button"
                    tabIndex={0}
                    onClick={() => requestOpen(dir)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        requestOpen(dir);
                      }
                    }}
                    className="group w-full grid grid-cols-[26px_1fr_16px] gap-3 items-start px-3 py-[11px] rounded-inner text-left cursor-pointer transition-colors duration-hover ease-spring hover:bg-plane-2 active:bg-tint"
                  >
                    <span className="w-[26px] h-[26px] rounded-[6px] bg-page border border-line-2 grid place-items-center font-flex text-micro font-medium text-ink-2">
                      {dir.mark}
                    </span>

                    <span className="min-w-0">
                      <span className="flex items-baseline gap-[9px] flex-wrap mb-[3px]">
                        <span className="text-base-app font-medium text-ink-1">{dir.name}</span>
                        {/* Several directories are named after their domain.
                            Printing it twice is noise, so the url only shows
                            when it says something the name does not. */}
                        {bare(dir.url).toLowerCase() !== dir.name.toLowerCase() && (
                          <span className="font-mono text-micro text-ink-3">{bare(dir.url)}</span>
                        )}
                      </span>
                      <span className="block text-small text-ink-2 leading-[1.5] mb-[7px] max-w-[78ch]">
                        {dir.desc}
                      </span>
                      <span className="flex items-center gap-[7px] flex-wrap">
                        {dir.kinds.map((k) => (
                          <span
                            key={k}
                            className="font-flex text-micro px-2 py-0.5 rounded-pill bg-plane-2 text-ink-2 group-hover:bg-page transition-colors duration-hover"
                          >
                            {k}
                          </span>
                        ))}
                        <button
                          title="Copy this command"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyFetch(dir.fetch);
                          }}
                          className="font-mono text-micro text-ink-3 px-[7px] py-[3px] rounded-[6px] inline-flex items-center gap-[5px] cursor-pointer transition-colors duration-hover ease-spring hover:bg-page hover:text-ink-2"
                        >
                          {dir.fetch}
                          <Square2StackIcon
                            size={11}
                            className="opacity-0 group-hover:opacity-50 transition-opacity duration-hover"
                          />
                        </button>
                      </span>
                    </span>

                    <ArrowTopRightOnSquareIcon
                      size={14}
                      className="text-ink-3 opacity-0 group-hover:opacity-100 transition-opacity duration-hover mt-[3px]"
                    />
                  </div>
                ))}
              </section>
            );
          })
        )}
      </div>

      <div className="h-8 shrink-0 flex items-center px-[18px] gap-3.5 font-flex text-micro text-ink-3">
        <span>
          {shown.length === DIRECTORIES.length
            ? `${DIRECTORIES.length} directories`
            : `${shown.length} of ${DIRECTORIES.length} directories`}
        </span>
        <button
          onClick={() => setConfirmPreference(!confirmBeforeOpening)}
          className="ml-auto font-flex text-micro text-ink-3 px-2.5 py-1 rounded-pill inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-hover ease-spring hover:bg-plane-2 hover:text-ink-1"
        >
          {confirmBeforeOpening ? (
            <>
              Confirms before opening links · <b className="font-medium text-ink-2">turn off</b>
            </>
          ) : (
            <>
              Opens links without asking ·{" "}
              <b className="font-medium text-ink-2">turn back on</b>
            </>
          )}
        </button>
      </div>

      {pending && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPending(null);
          }}
          className="absolute inset-0 z-40 bg-scrim grid place-items-start justify-center pt-2"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Open ${pending.name} in your browser?`}
            className="w-[352px] bg-page border border-line rounded-plane p-5 animate-drop"
          >
            <h2 className="text-base-app font-medium text-ink-1 mb-1.5">
              Open {pending.name} in your browser?
            </h2>
            <p className="text-small text-ink-2 leading-[1.55] mb-3">
              Hanger doesn't fetch from directories. This leaves the app and opens your default
              browser.
            </p>
            <code className="block font-mono text-micro text-ink-2 bg-plane rounded-inner px-2.5 py-2 mb-3.5 break-all">
              {pending.url}
            </code>
            <label className="flex items-center gap-2 text-small text-ink-2 cursor-pointer mb-4 select-none">
              <input
                type="checkbox"
                aria-label="Don't ask me again"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-3.5 h-3.5 accent-ink-1 cursor-pointer"
              />
              Don't ask me again
            </label>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPending(null)} className={btnClass}>
                Cancel
              </button>
              <button onClick={confirmOpen} className={btnPrimaryClass}>
                Open
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute left-0 right-0 bottom-[22px] z-50 flex justify-center pointer-events-none">
          <div
            role="status"
            className="bg-fill text-on-fill font-flex text-small px-4 py-2 rounded-pill animate-rise"
          >
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
