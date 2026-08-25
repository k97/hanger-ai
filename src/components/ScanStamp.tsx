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
 * How old the figure beside it is. Stays an age during a scan — whatever
 * control sits next to it already says a scan is running, and saying it
 * twice reads as two pieces of news. Re-renders every 30 s so the age keeps
 * pace without a scan event. Two callers: `SummaryStrip` (`:101`), and the
 * content header's toolbar slot while the link map is selected
 * (`App.tsx:1517`) — the map has no inspector column, so that slot holds
 * Rescan and this stamp beside it.
 */
export default function ScanStamp({ scannedAt, className }: ScanStampProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);
  const text = scannedAt ? `Scanned ${timeAgo(scannedAt, new Date())}` : "Not scanned yet";
  return <span className={className}>{text}</span>;
}
