/**
 * What linking an asset into a set of projects would actually do.
 *
 * The link screen's whole promise is that you can see the consequence before
 * you accept it, so every destination is resolved to a concrete path and a
 * concrete verb — created, replaced, or already done — before the button is
 * ever pressed.
 *
 * None of that is derived here. Where a source lands inside a project, and
 * whether something already sits there, are filesystem questions that only
 * the backend can answer; `check_deploy_target` answers them per destination
 * and this module reads its reply. Re-deriving the path in TypeScript would
 * put the same rule in two places and let them drift apart silently.
 */

/** What the backend reports about one candidate destination. */
export interface PreflightResult {
  target_exists: boolean;
  collision: boolean;
  has_permissions: boolean;
  warning: string | null;
  /** Where the asset would land, resolved by the backend. */
  target_path: string;
  /** A link back to this exact source is already there. */
  already_linked: boolean;
}

export type Disposition = "new" | "replaces" | "already-linked" | "unwritable";

export type Outcome = { ok: true } | { ok: false; reason: string };

/** One destination row: what it is, what would happen, and later what did. */
export interface DestinationPlan {
  /** The project root. */
  root: string;
  /** Its display name — the folder, not the whole path. */
  name: string;
  /** Where the asset would land inside that project. */
  targetPath: string;
  disposition: Disposition;
  /** Set once the link has been attempted. */
  outcome?: Outcome;
}

const TAGS: Record<Disposition, string> = {
  new: "New",
  replaces: "Replaces a copy",
  "already-linked": "Already linked",
  unwritable: "Not writable",
};

/** The word the row carries, in the panel's voice. */
export function tagFor(disposition: Disposition): string {
  return TAGS[disposition];
}

export function projectName(root: string): string {
  const parts = root.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? root;
}

/**
 * Reads one destination's preflight into a row the panel can render.
 *
 * Order matters. An unwritable parent is checked before an existing file
 * because offering to replace something you cannot write is a promise the
 * app cannot keep.
 */
export function planFor(root: string, preflight: PreflightResult): DestinationPlan {
  let disposition: Disposition;
  if (preflight.already_linked) {
    disposition = "already-linked";
  } else if (!preflight.has_permissions) {
    disposition = "unwritable";
  } else if (preflight.target_exists) {
    disposition = "replaces";
  } else {
    disposition = "new";
  }

  return {
    root,
    name: projectName(root),
    targetPath: preflight.target_path,
    disposition,
  };
}

/**
 * The destinations a link would actually change.
 *
 * Already-linked and unwritable rows stay visible — seeing that a project is
 * already covered is the answer to a real question — but neither is ever
 * acted on.
 */
export function actionable(plans: DestinationPlan[]): DestinationPlan[] {
  const doable: DestinationPlan[] = [];
  for (const plan of plans) {
    if (plan.disposition === "already-linked") continue;
    if (plan.disposition === "unwritable") continue;
    doable.push(plan);
  }
  return doable;
}

/** Whether a row can be chosen at all, or is only there to be read. */
export function selectable(plan: DestinationPlan): boolean {
  return plan.disposition !== "already-linked" && plan.disposition !== "unwritable";
}

/**
 * Whether this kind of asset can be linked into several projects at once.
 *
 * Rules are the exception. A rule merges section-by-section into a file that
 * usually already exists at the destination, and which section wins is a
 * decision per destination — there is no honest way to answer it once and
 * fan the answer out.
 */
export function allowsManyDestinations(category: string): boolean {
  return category !== "Rules";
}

/**
 * The foot line: what is about to happen, or what happened.
 *
 * Once anything has been attempted the line reports outcomes instead of
 * intent, because a partial failure is the case the reader most needs to see.
 */
export function footLine(plans: DestinationPlan[]): string {
  let linked = 0;
  let failed = 0;
  let waiting = 0;

  for (const plan of plans) {
    if (!plan.outcome) waiting += 1;
    else if (plan.outcome.ok) linked += 1;
    else failed += 1;
  }

  if (linked === 0 && failed === 0) {
    return waiting === 1 ? "1 project" : `${waiting} projects`;
  }

  const said: string[] = [];
  if (linked > 0) said.push(`${linked} linked`);
  if (failed > 0) said.push(`${failed} failed`);
  if (waiting > 0) said.push(`${waiting} pending`);
  return said.join(" · ");
}
