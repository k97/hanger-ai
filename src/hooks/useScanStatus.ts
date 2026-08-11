import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export type ScanPhase = "idle" | "scanning" | "resolving";

export interface ScanStatus {
  phase: ScanPhase;
  activeRootLabel: string | null;
  queued: number;
}

export function useScanStatus(): ScanStatus {
  const [status, setStatus] = useState<ScanStatus>({
    phase: "idle",
    activeRootLabel: null,
    queued: 0,
  });

  useEffect(() => {
    invoke<ScanStatus>("get_scan_status")
      .then((res) => {
        if (res) {
          setStatus(res);
        }
      })
      .catch(() => {});

    const unlistenPromise = listen<ScanStatus>("scan-status", (event) => {
      if (event.payload) {
        setStatus(event.payload);
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);

  return status;
}
