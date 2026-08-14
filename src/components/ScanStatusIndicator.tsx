import React from "react";
import { useScanStatus, ScanStatus } from "../hooks/useScanStatus";

export interface ScanStatusIndicatorProps {
  status?: ScanStatus;
}

/** Live scan progress. It belongs in the foot line, next to the figure it is
 *  in the middle of changing — in the title bar it was a ticker with nothing
 *  around it to give it meaning. */
export const ScanStatusIndicator: React.FC<ScanStatusIndicatorProps> = ({ status: statusProp }) => {
  const hookStatus = useScanStatus();
  const status = statusProp ?? hookStatus;

  if (status.phase === "idle") {
    return null;
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
