import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { CheckIcon, ExclamationTriangleIcon, FileTextIcon, Link2Icon, UnlinkIcon } from "./icons";
import {
  actionable,
  allowsManyDestinations,
  footLine,
  planFor,
  planForFailure,
  selectable,
  shortPath,
  tagFor,
  type DestinationPlan,
  type Outcome,
  type PreflightResult,
} from "../utils/linkPlan";
import type { Inventory } from "../App";

interface LinkPanelProps {
  asset: { name: string; category: string; path: string };
  /** Every linked repository, in sidebar order. */
  destinations: string[];
  inventory: Inventory | null;
  /** A repository to arrive with already ticked. */
  preSelected?: string;
  onCancel: () => void;
  /** Something landed on disk; the inventory is now stale. */
  onLinked: () => void;
  /** A rule collided and the section-by-section chooser has to take over. */
  onMergeRules: (destination: string, targetRulePath: string) => void;
}

const labelClass =
  "block font-flex text-micro font-medium uppercase tracking-[.06em] text-ink-3 mb-[7px] select-none";
const helpClass = "text-micro text-ink-3 mt-2.5 leading-[1.6]";
const mechClass =
  "flex-1 h-[30px] rounded-pill border border-line-2 font-flex text-small text-ink-2 cursor-pointer transition-colors duration-nav ease-spring hover:bg-plane-2";
const mechPressedClass =
  "flex-1 h-[30px] rounded-pill border border-transparent bg-tint text-tint-ink font-flex text-small font-medium cursor-pointer transition-colors duration-nav ease-spring";
const btnClass =
  "h-[30px] px-4 rounded-pill border border-line-2 text-small font-medium text-ink-1 cursor-pointer transition-[background-color,transform] duration-nav ease-spring hover:bg-plane-2 active:scale-[0.96]";
const btnPrimaryClass =
  "h-[30px] px-4 rounded-pill border border-transparent bg-fill text-on-fill text-small font-medium cursor-pointer transition-transform duration-press ease-spring active:scale-[0.96] disabled:opacity-50 disabled:cursor-default";
const selectClass =
  "w-full px-2.5 py-2 rounded-inner border border-line-2 bg-page text-ink-1 text-small font-mono cursor-pointer focus:outline-none focus:border-ink-1";

/** The tag a row carries once the work has run, or before it has. */
function toneFor(plan: DestinationPlan): string {
  if (plan.outcome) {
    return plan.outcome.ok
      ? "bg-success-tint text-success-text-on-tint"
      : "bg-danger-tint text-danger-text-on-tint";
  }
  if (plan.disposition === "replaces") return "bg-warning-tint text-warning-text-on-tint";
  if (plan.disposition === "unwritable") return "bg-danger-tint text-danger-text-on-tint";
  return "bg-plane-2 text-ink-3";
}

function wordFor(plan: DestinationPlan): string {
  if (!plan.outcome) return tagFor(plan.disposition);
  return plan.outcome.ok ? "Linked" : plan.outcome.reason;
}

/**
 * The inspector's second screen: choosing where a file should also live.
 *
 * The panel's contract is that nothing happens you did not see coming, so it
 * preflights every destination on arrival rather than at the moment you press
 * the button. That is what lets a row say "Already linked" before you tick it
 * and what makes the consequence list real rather than a guess.
 *
 * Linking runs one destination at a time because the backend deploys one at a
 * time. That makes partial success a genuine outcome, not an edge case, so
 * every row keeps its own result and the foot line reports the split.
 */
export default function LinkPanel({
  asset,
  destinations,
  inventory,
  preSelected,
  onCancel,
  onLinked,
  onMergeRules,
}: LinkPanelProps) {
  const many = allowsManyDestinations(asset.category);

  const [preflights, setPreflights] = useState<Record<string, PreflightResult>>({});
  // A destination whose check_deploy_target call rejected outright — e.g. no
  // agent claims the asset's source, so the backend never resolved a target.
  // Keyed apart from `preflights` because there is no PreflightResult to
  // store; the row is built from the reason instead of a verdict.
  const [preflightErrors, setPreflightErrors] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(true);
  const [chosen, setChosen] = useState<string[]>(preSelected ? [preSelected] : []);
  const [mechanism, setMechanism] = useState<"symlink" | "copy">("symlink");
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [ruleTarget, setRuleTarget] = useState<string>("");

  // Keyed on the contents rather than the array, so a caller that rebuilds the
  // list on every render cannot spin this effect.
  const destinationKey = destinations.join("|");

  // Every destination is checked up front. They are filesystem stats, and
  // knowing the answer before the tick is the whole point of the screen.
  //
  // check_deploy_target can reject outright — the backend refuses to resolve
  // a target at all, e.g. when no agent claims the asset's source. That is a
  // SanitisedError, not a missing destination, and it must reach the panel
  // as a row that says why rather than being swallowed: an asset sourced
  // from the shared `.agents/` convention fails this way for every
  // destination, since resolution depends on the source path, not the
  // target, and dropping every one of those rows would leave the panel
  // wrongly claiming nothing is linked.
  useEffect(() => {
    let cancelled = false;
    setReading(true);
    setPreflights({});
    setPreflightErrors({});

    Promise.all(
      destinations.map((root) =>
        invoke<PreflightResult>("check_deploy_target", {
          sourcePath: asset.path,
          targetProjectPath: root,
        })
          .then((result) => ({ root, ok: true as const, result }))
          .catch((err) => ({ root, ok: false as const, reason: String(err) }))
      )
    ).then((results) => {
      if (cancelled) return;
      const found: Record<string, PreflightResult> = {};
      const failed: Record<string, string> = {};
      for (const entry of results) {
        if (entry.ok) found[entry.root] = entry.result;
        else failed[entry.root] = entry.reason;
      }
      setPreflights(found);
      setPreflightErrors(failed);
      setReading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [asset.path, destinationKey]);

  const rows = useMemo(() => {
    const built: DestinationPlan[] = [];
    for (const root of destinations) {
      const preflight = preflights[root];
      if (preflight) {
        const plan = planFor(root, preflight);
        built.push(outcomes[root] ? { ...plan, outcome: outcomes[root] } : plan);
        continue;
      }
      const reason = preflightErrors[root];
      if (reason) built.push(planForFailure(root, reason));
    }
    return built;
  }, [destinations, preflights, preflightErrors, outcomes]);

  const picked = useMemo(
    () => rows.filter((plan) => chosen.includes(plan.root) && selectable(plan)),
    [rows, chosen]
  );
  const work = actionable(picked);

  // Distinct reasons behind every undeployable row, deduplicated: the source
  // is the same asset for every destination, so a resolution failure is
  // ordinarily identical across all of them and worth saying once rather
  // than once per row.
  const undeployableReasons = useMemo(() => {
    const seen = new Set<string>();
    for (const plan of rows) {
      if (plan.disposition === "undeployable" && plan.reason) seen.add(plan.reason);
    }
    return Array.from(seen);
  }, [rows]);

  // Candidate rule files already in the chosen project, root-to-deepest.
  const ruleCandidates = useMemo(() => {
    if (asset.category !== "Rules" || work.length === 0 || !inventory) return [];
    const root = work[0].root;
    return inventory.rules
      .filter((rule) => rule.scope?.Project?.root === root && rule.name === asset.name)
      .slice()
      .sort((a, b) => a.path.split("/").length - b.path.split("/").length);
  }, [asset.category, asset.name, inventory, work]);

  useEffect(() => {
    setRuleTarget(ruleCandidates[0]?.path ?? work[0]?.targetPath ?? "");
  }, [ruleCandidates, work]);

  const toggle = (plan: DestinationPlan) => {
    if (!selectable(plan)) return;
    setChosen((current) => {
      if (!many) return current.includes(plan.root) ? [] : [plan.root];
      return current.includes(plan.root)
        ? current.filter((root) => root !== plan.root)
        : [...current, plan.root];
    });
  };

  const needsMerge = asset.category === "Rules" && work.some((plan) => plan.disposition === "replaces");

  const run = async () => {
    if (needsMerge) {
      onMergeRules(work[0].root, ruleTarget);
      return;
    }

    setRunning(true);
    setFailure(null);
    const landed: Record<string, Outcome> = {};

    for (const plan of work) {
      try {
        await invoke("execute_deploy", {
          sourcePath: asset.path,
          targetProjectPath: plan.root,
          deployType: mechanism,
        });
        landed[plan.root] = { ok: true };
      } catch (err) {
        landed[plan.root] = { ok: false, reason: String(err) };
      }
      // Written per destination so a long run reports as it goes rather than
      // sitting silent until the last one returns.
      setOutcomes({ ...landed });
    }

    setRunning(false);
    const anyFailed = Object.values(landed).some((outcome) => !outcome.ok);
    if (anyFailed) {
      setFailure("Some destinations were left unchanged. Each row says what happened.");
    }
    onLinked();
  };

  const done = Object.keys(outcomes).length > 0 && !running;

  return (
    <div className="flex-1 min-h-0 flex flex-col font-sans">
      <div className="flex-1 min-h-0 overflow-y-auto scroll-gutter-stable scroll-thin">
        <div className="px-[12px] pt-4">
          <span className={labelClass} id="link-destinations">
            Destinations
          </span>

          {reading ? (
            <div className="flex items-center gap-2 text-ink-3 text-small py-2">
              <FileTextIcon size={12} active aria-hidden="true" />
              Checking each project…
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center text-center">
              <UnlinkIcon size={36} className="text-ink-3 mb-2" />
              <p className="text-small text-ink-3 leading-[1.6]">
                No repositories are linked yet. Add one from the sidebar and it will appear here.
              </p>
            </div>
          ) : (
            <div
              role="group"
              aria-labelledby="link-destinations"
              className="border border-line-2 rounded-inner overflow-hidden"
            >
              {rows.map((plan, index) => {
                const open = selectable(plan);
                const ticked = open ? chosen.includes(plan.root) : true;
                return (
                  <label
                    key={plan.root}
                    title={plan.disposition === "undeployable" ? plan.reason : undefined}
                    className={`flex items-center gap-2.5 h-[30px] px-2.5 text-small ${
                      index > 0 ? "border-t border-line" : ""
                    } ${open ? "cursor-pointer hover:bg-plane-2" : "cursor-default"} transition-colors duration-hover`}
                  >
                    <input
                      type={many ? "checkbox" : "radio"}
                      name={many ? undefined : "link-destination"}
                      checked={ticked}
                      disabled={!open || running}
                      onChange={() => toggle(plan)}
                      className="w-3.5 h-3.5 accent-[var(--fill)] cursor-pointer disabled:cursor-default"
                    />
                    <span className={`flex-1 min-w-0 truncate ${open ? "text-ink-1" : "text-ink-3"}`}>
                      {plan.name}
                    </span>
                    {!open && (
                      <span className="font-flex text-micro text-ink-3 shrink-0">
                        {tagFor(plan.disposition)}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {undeployableReasons.length > 0 && (
            <p className={helpClass} data-testid="link-undeployable-reason">
              {undeployableReasons.length === 1
                ? undeployableReasons[0]
                : "Some destinations can't be resolved. Point at a row for why."}
            </p>
          )}

          {!many && (
            <p className={helpClass}>
              A rule merges section by section into the file already at the destination, and which
              section wins is a decision per project — so rules go one project at a time.
            </p>
          )}
        </div>

        {asset.category === "Rules" && ruleCandidates.length > 0 && (
          <div className="px-[12px] pt-4">
            <label className={labelClass} htmlFor="rule-target">
              Target file
            </label>
            <select
              id="rule-target"
              value={ruleTarget}
              onChange={(event) => setRuleTarget(event.target.value)}
              className={selectClass}
            >
              {ruleCandidates.map((rule) => (
                <option key={rule.path} value={rule.path}>
                  {rule.path}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="px-[12px] pt-4">
          <span className={labelClass} id="link-mechanism">
            Mechanism
          </span>
          <div className="flex gap-1.5 w-full" role="group" aria-labelledby="link-mechanism">
            <button
              type="button"
              aria-pressed={mechanism === "symlink"}
              disabled={running}
              onClick={() => setMechanism("symlink")}
              className={mechanism === "symlink" ? mechPressedClass : mechClass}
            >
              Symlink
            </button>
            <button
              type="button"
              aria-pressed={mechanism === "copy"}
              disabled={running}
              onClick={() => setMechanism("copy")}
              className={mechanism === "copy" ? mechPressedClass : mechClass}
            >
              Tracked copy
            </button>
          </div>
          <p className={helpClass}>
            A symlink stays in step with this file, so an edit here reaches every project at once. A
            tracked copy can be edited per project and Hanger tells you when it drifts.
          </p>
        </div>

        {picked.length > 0 && (
          <div className="mx-[12px] mt-[18px] bg-plane rounded-plane pt-1 px-3.5 pb-2.5">
            <div className="py-2.5 font-flex text-micro uppercase tracking-[.06em] text-ink-3">
              {done ? "What happened" : "What will happen"}
            </div>
            {picked.map((plan, index) => (
              <div
                key={plan.root}
                data-testid="link-consequence"
                className={`flex items-center gap-2.5 py-[7px] text-small ${
                  index > 0 ? "border-t border-line" : ""
                }`}
              >
                <span className="flex-1 min-w-0 truncate font-mono text-micro text-ink-2" title={plan.targetPath}>
                  {shortPath(plan)}
                </span>
                <span
                  className={`shrink-0 font-flex text-micro px-2.5 py-[3px] rounded-pill ${toneFor(plan)}`}
                >
                  {wordFor(plan)}
                </span>
              </div>
            ))}
          </div>
        )}

        {failure && (
          <div className="mx-[12px] mt-3 flex items-start gap-2 text-state-warning text-small leading-[1.6]">
            <ExclamationTriangleIcon size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{failure}</span>
          </div>
        )}

        {done && !failure && (
          <div className="mx-[12px] mt-3 flex items-center gap-1.5 text-state-success text-small font-medium">
            <CheckIcon size={14} aria-hidden="true" />
            Done. The inventory is refreshing.
          </div>
        )}
      </div>

      <div className="px-[18px] py-[15px] border-t border-line flex items-center gap-2 shrink-0">
        <span className="font-flex text-micro text-ink-3" data-testid="link-foot">
          {footLine(picked)}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={onCancel} className={btnClass}>
          {done ? "Close" : "Cancel"}
        </button>
        <button
          type="button"
          disabled={work.length === 0 || running || reading}
          onClick={run}
          className={btnPrimaryClass}
        >
          {running ? (
            <span className="flex items-center justify-center gap-2">
              <Link2Icon size={12} active aria-hidden="true" />
              Linking…
            </span>
          ) : needsMerge ? (
            "Compare & merge…"
          ) : (
            "Link"
          )}
        </button>
      </div>
    </div>
  );
}
