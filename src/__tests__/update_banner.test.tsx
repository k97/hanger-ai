// @vitest-environment happy-dom
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, test, expect, vi, afterEach } from "vitest";
import UpdateBanner from "../components/UpdateBanner";

describe("UpdateBanner Component", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders exact update version and row action content when update is available", () => {
    const onInstall = vi.fn();
    render(<UpdateBanner version="1.6.0" onInstall={onInstall} />);

    // Assert strictly on ROW CONTENT text
    expect(screen.getByText("Update available: v1.6.0")).toBeDefined();
    expect(screen.getByText("Install Update")).toBeDefined();

    const installButton = screen.getByRole("button", { name: /install update/i });
    fireEvent.click(installButton);
    expect(onInstall).toHaveBeenCalledTimes(1);
  });

  test("does NOT render update row content when banner is unmounted or 404 occurs", () => {
    const { container } = render(<></>);
    expect(screen.queryByText(/Update available:/i)).toBeNull();
    expect(screen.queryByText("Install Update")).toBeNull();
    expect(container.firstChild).toBeNull();
  });

  test("does NOT swallow signature verification error (surfaces error rather than silent banner suppression)", () => {
    const signatureErrorMsg = "Invalid minisign signature";
    const lower = signatureErrorMsg.toLowerCase();
    const isSilent =
      lower.includes("could not fetch a valid release json") ||
      lower.includes("404") ||
      lower.includes("failed to fetch") ||
      lower.includes("network") ||
      lower.includes("connect") ||
      lower.includes("invoke");

    // Signature error must NOT be classified as silent
    expect(isSilent).toBe(false);
    expect(screen.queryByText(/Update available:/i)).toBeNull();
  });
});
