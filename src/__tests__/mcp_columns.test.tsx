// @vitest-environment happy-dom
import { render, screen, cleanup } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import AssetHeaderRow from "../components/AssetHeaderRow";

afterEach(cleanup);

describe("the MCP section's columns", () => {
  it("does not render Beyond the store, which cannot apply to a server", () => {
    render(
      <AssetHeaderRow
        sortField="name"
        sortDirection="asc"
        showReachColumns
        showBeyondColumn={false}
        onSort={() => {}}
      />
    );
    expect(screen.queryByText("Beyond the store")).toBeNull();
    expect(screen.getByText("Reach")).toBeTruthy();
  });
});
