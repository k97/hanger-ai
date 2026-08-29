import React from "react";
import { useScanStatus, ScanStatus } from "../hooks/useScanStatus";
import ScanStamp from "./ScanStamp";

export interface ScanStatusIndicatorProps {
  status?: ScanStatus;
  /** How old the figure above the foot line is. Omitted, the slot is empty
   *  while nothing is running — the shape `NeedsReviewPane` keeps. Given —
   *  a Date, or `null` for a store nothing has scanned yet — the slot falls
   *  back to that age, so one place answers both questions in turn: which
   *  root a running scan is on, and how old the count is when none is. */
  scannedAt?: Date | null;
}

/** The foot line's status slot. It belongs there, next to the figure it is
 *  in the middle of changing — in the title bar it was a ticker with nothing
 *  around it to give it meaning. Live progress takes the slot while a scan
 *  runs; the age of the last scan holds it the rest of the time, which is
 *  where that stamp moved from the hero banner on 2026-08-29. */
export const ScanStatusIndicator: React.FC<ScanStatusIndicatorProps> = ({
  status: statusProp,
  scannedAt,
}) => {
  const hookStatus = useScanStatus();
  const status = statusProp ?? hookStatus;

  // `undefined` is "this caller keeps no stamp", distinct from `null`,
  // "nothing has been scanned yet" — which has its own wording to print.
  if (status.phase === "idle") {
    return scannedAt === undefined ? null : (
      <ScanStamp scannedAt={scannedAt} className="text-micro text-ink-3 select-none font-flex" />
    );
  }

  let label = "";
  if (status.phase === "scanning") {
    label = `Scanning ${status.activeRootLabel ?? ""}`.trim();
    if (status.queued > 0) {
      label += ` · ${status.queued} queued`;
    }
  } else if (status.phase === "resolving") {
    label = "Resolving links";
  }

  return (
    <div
      data-testid="scan-status-indicator"
      className="flex items-center gap-2 text-micro text-ink-3 select-none font-flex"
    >
      <span className="w-1.5 h-1.5 rounded-pill bg-ink-2 motion-safe:animate-pulse" />
      <span>{label}</span>
    </div>
  );
};
