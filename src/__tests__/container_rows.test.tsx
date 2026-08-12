// @vitest-environment happy-dom
//
// A linked root is a CONTAINER iff at least one other linked root is a strict
// path-descendant of it. Derived from the linked set at render time — never
// stored — so unlinking the last child reverts the parent to an ordinary row
// with no state to maintain and nothing that can drift out of sync.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { isContainer, linkedDescendants } from "../utils/containerRoots";
import Sidebar from "../components/Sidebar";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve({ total_assets: 0 })),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(),
}));

function renderSidebar(linkedRepos: string[]) {
  return render(
    <Sidebar
      width={260}
      setWidth={() => {}}
      collapsed={false}
      setCollapsed={() => {}}
      selectedItem="profile"
      setSelectedItem={() => {}}
      inventory={null}
      assetCounts={null}
      detectedEngines={[]}
      linkedRepos={linkedRepos}
      loadLinkedRepos={async () => {}}
      onOpenSettings={() => {}}
      setError={() => {}}
    />
  );
}

describe("container derivation", () => {
  it("treats a root with a linked descendant as a container", () => {
    const linked = ["/Users/k/Work", "/Users/k/Work/repo1", "/Users/k/Work/repo2"];
    expect(isContainer("/Users/k/Work", linked)).toBe(true);
    expect(linkedDescendants("/Users/k/Work", linked)).toEqual([
      "/Users/k/Work/repo1",
      "/Users/k/Work/repo2",
    ]);
  });

  it("does not treat a leaf root as a container", () => {
    const linked = ["/Users/k/Work", "/Users/k/Work/repo1"];
    expect(isContainer("/Users/k/Work/repo1", linked)).toBe(false);
    expect(linkedDescendants("/Users/k/Work/repo1", linked)).toEqual([]);
  });

  it("reverts to an ordinary root once the last child is unlinked", () => {
    expect(isContainer("/Users/k/Work", ["/Users/k/Work"])).toBe(false);
  });

  it("does not mistake a sibling sharing a name prefix for a descendant", () => {
    // The classic prefix bug: /Users/k/Workspace starts with /Users/k/Work but
    // is not inside it. Matching must be on path segments, not raw strings.
    const linked = ["/Users/k/Work", "/Users/k/Workspace"];
    expect(isContainer("/Users/k/Work", linked)).toBe(false);
    expect(linkedDescendants("/Users/k/Work", linked)).toEqual([]);
  });

  it("counts a deeper descendant, not only immediate children", () => {
    const linked = ["/Users/k/Work", "/Users/k/Work/clients/acme"];
    expect(isContainer("/Users/k/Work", linked)).toBe(true);
  });

  it("treats a nested container as a container in its own right", () => {
    const linked = [
      "/Users/k/Work",
      "/Users/k/Work/clients",
      "/Users/k/Work/clients/acme",
    ];
    expect(isContainer("/Users/k/Work", linked)).toBe(true);
    expect(isContainer("/Users/k/Work/clients", linked)).toBe(true);
    expect(isContainer("/Users/k/Work/clients/acme", linked)).toBe(false);
  });

  it("tolerates a trailing slash on the root", () => {
    expect(isContainer("/Users/k/Work/", ["/Users/k/Work/", "/Users/k/Work/repo1"])).toBe(true);
  });
});

describe("sidebar container rows", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // This suite renders Sidebar repeatedly; without explicit teardown the
  // previous tree stays mounted and text queries match across renders.
  afterEach(() => {
    cleanup();
  });

  it("labels a container row with its linked child count", async () => {
    renderSidebar(["/Users/k/Work", "/Users/k/Work/repo1", "/Users/k/Work/repo2"]);
    await waitFor(() => {
      expect(screen.getByText("Watched · 2 repos linked")).toBeDefined();
    });
  });

  it("uses the singular form for a single linked child", async () => {
    renderSidebar(["/Users/k/Work", "/Users/k/Work/repo1"]);
    await waitFor(() => {
      expect(screen.getByText("Watched · 1 repo linked")).toBeDefined();
    });
  });

  it("gives ordinary repo rows no watched subtitle", async () => {
    renderSidebar(["/Users/k/solo-project"]);
    await waitFor(() => {
      expect(screen.getByText("solo-project")).toBeDefined();
    });
    expect(screen.queryByText(/Watched ·/)).toBeNull();
  });

  it("selects the canonical path link_directory returns, not the one picked", async () => {
    // link_directory canonicalises before storing, so the path the directory
    // picker handed over may not be the path that ends up in the sidebar. If
    // the picked path is selected instead, the new row is never highlighted
    // because no row carries that path.
    const picked = "/Users/k/via/proj";
    const canonical = "/private/Users/k/real/proj";

    (open as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(picked);
    (invoke as unknown as ReturnType<typeof vi.fn>).mockImplementation((cmd: string) => {
      if (cmd === "link_directory") return Promise.resolve(canonical);
      if (cmd === "get_asset_counts") return Promise.resolve({ total_assets: 0 });
      return Promise.resolve(undefined);
    });

    const setSelectedItem = vi.fn();
    render(
      <Sidebar
        width={260}
        setWidth={() => {}}
        collapsed={false}
        setCollapsed={() => {}}
        selectedItem="profile"
        setSelectedItem={setSelectedItem}
        inventory={null}
        assetCounts={null}
        detectedEngines={[]}
        linkedRepos={[]}
        loadLinkedRepos={async () => {}}
        onOpenSettings={() => {}}
          setError={() => {}}
      />
    );

    fireEvent.click(screen.getByText("Add repository…"));

    await waitFor(() => {
      expect(setSelectedItem).toHaveBeenCalledWith(canonical);
    });
  });

  it("never indents child rows", async () => {
    // Nesting was rejected: filterRepoAssets matches root paths by exact
    // equality at five call sites, so a tree would force prefix matching plus a
    // rollup ruling per category. The list stays flat.
    const { container } = renderSidebar([
      "/Users/k/Work",
      "/Users/k/Work/repo1",
    ]);
    await waitFor(() => {
      expect(screen.getByText("repo1")).toBeDefined();
    });
    const indented = container.querySelectorAll(
      '[class*="ml-"], [class*="pl-6"], [class*="pl-8"]'
    );
    expect(indented.length).toBe(0);
  });
});
