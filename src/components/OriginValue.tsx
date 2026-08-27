import Tooltip from "./Tooltip";
import { ArrowTopRightOnSquareIcon } from "./icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { OriginRowView } from "../utils/assetProvenance";

type OriginValueVariant = "identity" | "registration";

/**
 * Per-variant styling. The two call sites (`AssetDetail`'s Identity card and
 * `McpServerDetail`'s per-registration line) covary on every one of these —
 * text size, icon size, ink weight, width cap, and test id all change
 * together between the two, so a single variant name carries them rather
 * than five independent props nobody mixes and matches.
 */
const VARIANTS: Record<
  OriginValueVariant,
  { testId: string; linkClassName: string; valueClassName: string; mutedClassName: string; iconSize: number }
> = {
  identity: {
    testId: "origin-open-link",
    linkClassName:
      "inline-flex items-center gap-1 text-small text-ink-1 border-b border-transparent hover:border-ink-1 transition-colors duration-hover cursor-pointer",
    valueClassName: "truncate max-w-55",
    mutedClassName: "truncate max-w-55 inline-block align-bottom",
    iconSize: 11,
  },
  registration: {
    testId: "registration-origin-link",
    linkClassName:
      "inline-flex items-center gap-1 min-w-0 text-micro text-ink-2 border-b border-transparent hover:border-ink-1 transition-colors duration-hover cursor-pointer",
    valueClassName: "truncate",
    mutedClassName: "truncate",
    iconSize: 10,
  },
};

interface OriginValueProps {
  origin: OriginRowView;
  variant: OriginValueVariant;
}

/**
 * The tooltip-wrapped Origin value: a link out when `origin.url` is present,
 * a plain (optionally muted) span otherwise. Shared by the Identity card's
 * Origin row and each MCP registration's Origin line — the two containers
 * differ for real reasons (one row with a disclosure vs. a compact per-
 * registration block) and stay separate; this is only the value they both
 * render the same way.
 */
export default function OriginValue({ origin, variant }: OriginValueProps) {
  const v = VARIANTS[variant];
  return (
    <Tooltip label={origin.tooltip} placement="bottom">
      {origin.url ? (
        <button
          type="button"
          data-testid={v.testId}
          aria-label={`${origin.value} — ${origin.tooltip}`}
          onClick={() => openUrl(origin.url!).catch(() => {})}
          /* The underline is a hover affordance, not a resting state
             (Karthik, 2026-08-28): the external-link mark already says it is
             a link, so a permanent rule under every origin is decoration.
             `border-transparent` rather than no border, so the 1px is
             reserved and the row does not shift when the rule appears. */
          className={v.linkClassName}
        >
          <span className={v.valueClassName}>{origin.value}</span>
          <ArrowTopRightOnSquareIcon size={v.iconSize} aria-hidden="true" className="text-ink-3 shrink-0" />
        </button>
      ) : (
        <span className={`${v.mutedClassName} ${origin.muted ? "text-ink-3" : "text-ink-2"}`}>
          {origin.value}
        </span>
      )}
    </Tooltip>
  );
}
