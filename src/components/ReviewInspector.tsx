import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { ArrowTopRightOnSquareIcon, Square2StackIcon } from "./icons";
import type { IssueKind, ReviewIssue } from "../utils/reviewIssues";
import Tooltip from "./Tooltip";

interface ReviewInspectorProps {
  issue: ReviewIssue | null;
  /** Position within the list on screen, and how long that list is. Neither is
   *  a total of anything — the list is already a filtered view. */
  position: number;
  outOf: number;
  onSkip: () => void;
}

const EYEBROW: Record<IssueKind, string> = {
  broken: "Broken link",
  drifted: "Drifted copy",
  duplicate: "Duplicate",
  parse: "Won't parse",
};

const STATE_LINE: Record<IssueKind, string> = {
  broken: "Symlink points at a file that no longer exists",
  drifted: "The copy no longer matches the source it came from",
  duplicate: "The same asset exists in more than one place",
  parse: "The front matter could not be read",
};

const STATE_INK: Record<IssueKind, string> = {
  broken: "text-state-danger",
  drifted: "text-state-warning",
  duplicate: "text-ink-2",
  parse: "text-ink-2",
};

const btnClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut > 0 ? path.slice(0, cut) : path;
}

/**
 * What the row could not say in one line: where the link lives, what it points
 * at, and what else that source feeds.
 *
 * A duplicate has no single "correct" copy, so the panel lists every one it
 * found rather than nominating a winner — choosing is the user's decision, and
 * this is the evidence for it.
 */
export default function ReviewInspector({
  issue,
  position,
  outOf,
  onSkip,
}: ReviewInspectorProps) {
  if (!issue) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 px-6 text-center bg-page">
        <span className="text-base-app font-medium text-ink-1">Nothing selected</span>
        <span className="text-small text-ink-3 leading-[1.6]">
          Pick an issue to see where it lives and what else it affects.
        </span>
      </div>
    );
  }

  const pairs: { key: string; value: string }[] = [];
  if (issue.kind === "duplicate") {
    for (const copy of issue.copies ?? []) {
      pairs.push({ key: "Copy", value: copy });
    }
    if (issue.sourcePath) {
      pairs.push({ key: "Shared source", value: issue.sourcePath });
    }
  } else {
    pairs.push({ key: "Link lives at", value: issue.path });
    if (issue.sourcePath) {
      pairs.push({
        key: issue.kind === "broken" ? "Points at" : "Copied from",
        value: issue.sourcePath,
      });
    }
    if (issue.detail) {
      pairs.push({ key: "Parser said", value: issue.detail });
    }
  }

  return (
    <div className="h-full flex flex-col bg-page min-h-0">
      <div className="px-[18px] pt-4 pb-3 border-b border-line shrink-0">
        <div className="flex items-center gap-2 font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-2">
          <span>{EYEBROW[issue.kind]}</span>
          <span>·</span>
          <span>{issue.category}</span>
        </div>

        <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1 mb-2">{issue.name}</h2>

        <div className="flex items-center gap-[7px] mb-3">
          <i
            className={`w-2 h-2 rounded-pill shrink-0 ${
              issue.kind === "broken"
                ? "bg-state-danger"
                : issue.kind === "drifted"
                ? "bg-state-warning"
                : "border-2 border-line-2"
            }`}
          />
          <span className={`font-flex text-small ${STATE_INK[issue.kind]}`}>
            {STATE_LINE[issue.kind]}
          </span>
        </div>

        <div className="flex items-center gap-2 bg-plane rounded-inner pl-2.5 pr-1.5 py-2 font-mono text-micro text-ink-2">
          <span className="flex-1 min-w-0 truncate">{issue.path}</span>
          <Tooltip label="Copy path" placement="bottom">
            <button
              aria-label="Copy path"
              onClick={() => navigator.clipboard?.writeText(issue.path).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <Square2StackIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
          <Tooltip label="Reveal in Finder" placement="bottom">
            <button
              aria-label="Reveal in Finder"
              onClick={() => revealItemInDir(parentOf(issue.path)).catch(() => {})}
              className="p-1 rounded-pill grid place-items-center text-ink-3 hover:bg-plane-2 hover:text-ink-1 transition-colors duration-hover cursor-pointer"
            >
              <ArrowTopRightOnSquareIcon size={13} aria-hidden="true" />
            </button>
          </Tooltip>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-[18px] mt-3.5 grid gap-px bg-line rounded-plane overflow-hidden">
          {pairs.map((pair, idx) => (
            <section key={`${pair.key}-${idx}`} className="bg-plane px-3.5 py-2.5">
              <div className="font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1">
                {pair.key}
              </div>
              <div className="font-mono text-micro text-ink-2 break-all">{pair.value}</div>
            </section>
          ))}
        </div>

        {issue.siblings && (
          <div className="mx-[18px] mt-3.5 px-3.5 py-2.5 bg-plane rounded-plane">
            <div className="font-flex text-micro tracking-[.06em] uppercase text-ink-3 mb-1.5">
              The same source also feeds
            </div>
            {issue.siblings.map((sibling) => (
              <div key={sibling} className="font-mono text-micro text-ink-2 break-all py-0.5">
                {sibling}
              </div>
            ))}
            <p className="text-small text-ink-2 leading-[1.6] mt-2">
              Repointing the source fixes all of them at once. Repointing this link alone leaves the
              others where they are.
            </p>
          </div>
        )}

        <dl className="mx-[18px] my-3.5 px-3.5 py-3 bg-plane rounded-plane grid grid-cols-[92px_1fr] gap-y-2 gap-x-3 text-small">
          <dt className="font-flex text-ink-3">Where</dt>
          <dd className="text-ink-1">{issue.whereLabel}</dd>
          <dt className="font-flex text-ink-3">Reaches</dt>
          <dd className="text-ink-1">
            {issue.crossRepo ? "More than one repository" : "This place only"}
          </dd>
          <dt className="font-flex text-ink-3">Reversible</dt>
          <dd className="text-ink-1">
            {issue.kind === "duplicate" || issue.kind === "parse"
              ? "Depends on what you choose"
              : "Yes — no file is written"}
          </dd>
        </dl>
      </div>

      <div className="px-[18px] py-3.5 border-t border-line flex gap-2 items-center shrink-0">
        <span className="font-flex text-micro text-ink-3 tabular">
          {position} of {outOf}
        </span>
        <span className="flex-1" />
        <button onClick={onSkip} className={btnClass}>
          Skip
        </button>
      </div>
    </div>
  );
}
