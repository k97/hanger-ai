import { useEffect, useState } from "react";
import { timeAgo } from "../utils/timeAgo";

interface ScanStampProps {
  scannedAt: Date | null;
  /** Required: both call sites pass one, and the fallback this used to carry
   *  was unreachable. Making it required moves the guarantee to the compiler,
   *  which is where a dead default cannot come back. */
  className: string;
}

/**
 * The one wording for "how old is the figure", and the 30s tick that keeps
 * it current with no scan event. Split out of the component on 2026-08-29
 * so the summary strip can put the same string in the Rescan button's
 * tooltip without rendering a second stamp — a `title` read from a
 * component that ticks is how the tooltip goes stale unseen.
 */
export function useScanStampText(scannedAt: Date | null): string {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);
  return scannedAt ? `Scanned ${timeAgo(scannedAt, new Date())}` : "Not scanned yet";
}

/**
 * How old the figure beside it is. Stays an age during a scan — whatever
 * control sits next to it already says a scan is running, and saying it
 * twice reads as two pieces of news. Two callers: the foot line's scan slot,
 * where it fills in while no scan is running (`ScanStatusIndicator.tsx`),
 * and the content header's toolbar slot while the link map is selected
 * (`App.tsx:1517`) — the map has no inspector column, so that slot holds
 * Rescan and this stamp beside it. It left the summary strip's headline on
 * 2026-08-29 (Karthik's ruling); the strip keeps the age in Rescan's
 * tooltip, through `useScanStampText` above.
 */
export default function ScanStamp({ scannedAt, className }: ScanStampProps) {
  const text = useScanStampText(scannedAt);
  return <span className={className}>{text}</span>;
}
