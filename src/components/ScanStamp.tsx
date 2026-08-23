import { useEffect, useState } from "react";
import { timeAgo } from "../utils/timeAgo";

interface ScanStampProps {
  scannedAt: Date | null;
  className?: string;
}

/**
 * How old the figure beside it is. Stays an age during a scan — whatever
 * control sits next to it already says a scan is running, and saying it
 * twice reads as two pieces of news. Re-renders every 30 s so the age keeps
 * pace without a scan event. Two callers: the summary strip and the map cap.
 */
export default function ScanStamp({ scannedAt, className }: ScanStampProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, []);
  const text = scannedAt ? `Scanned ${timeAgo(scannedAt, new Date())}` : "Not scanned yet";
  return <span className={className ?? "text-micro text-ink-3 font-flex"}>{text}</span>;
}
