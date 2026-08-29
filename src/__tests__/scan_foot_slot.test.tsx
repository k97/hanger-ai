// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScanStatusIndicator } from "../components/ScanStatusIndicator";

/**
 * The foot line's right-hand slot holds one fact at a time: while a scan
 * runs, which root it is on; while none does, how old the figure above it
 * is. The age used to sit in the hero banner and moved here on 2026-08-29
 * (Karthik's ruling), so the banner carries no line that only ages.
 */
describe("the foot line's scan slot", () => {
  beforeEach(() => cleanup());

  const idle = { phase: "idle" as const, activeRootLabel: null, queued: 0 };
  const scanning = { phase: "scanning" as const, activeRootLabel: "rkarthik-zehn", queued: 0 };
  const fourMinAgo = new Date(Date.now() - 4 * 60_000);

  it("shows the age of the last scan while nothing is running", () => {
    render(<ScanStatusIndicator status={idle} scannedAt={fourMinAgo} />);
    expect(screen.getByText("Scanned 4 min ago")).toBeTruthy();
  });

  it("says so plainly before any scan has finished", () => {
    render(<ScanStatusIndicator status={idle} scannedAt={null} />);
    expect(screen.getByText("Not scanned yet")).toBeTruthy();
  });

  it("gives the slot to live progress while a scan runs, and does not say both", () => {
    render(<ScanStatusIndicator status={scanning} scannedAt={fourMinAgo} />);
    expect(screen.getByTestId("scan-status-indicator").textContent).toContain(
      "Scanning rkarthik-zehn"
    );
    expect(screen.queryByText("Scanned 4 min ago")).toBeNull();
  });

  it("stays empty when the caller keeps no age — the shape the review pane uses", () => {
    const { container } = render(<ScanStatusIndicator status={idle} />);
    expect(container.textContent).toBe("");
  });
});
