// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useFavourites } from "./useFavourites";
import { invoke } from "@tauri-apps/api/core";

const mockPreferences: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    return null;
  }),
}));

describe("useFavourites", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(mockPreferences)) delete mockPreferences[key];
  });

  it("starts empty when no preference is stored", async () => {
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual([]));
  });

  it("loads a previously stored list on mount", async () => {
    mockPreferences.discovery_favourites = JSON.stringify(["sy", "gl"]);
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual(["sy", "gl"]));
  });

  it("adds a mark to the front on toggle and persists it", async () => {
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual([]));

    act(() => result.current.toggleFavourite("sy"));

    expect(result.current.favourites).toEqual(["sy"]);
    expect(result.current.isFavourite("sy")).toBe(true);
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("set_preference", {
        key: "discovery_favourites",
        value: JSON.stringify(["sy"]),
      });
    });
  });

  it("most recently favourited moves to the front", async () => {
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual([]));

    act(() => result.current.toggleFavourite("sy"));
    act(() => result.current.toggleFavourite("gl"));

    expect(result.current.favourites).toEqual(["gl", "sy"]);
  });

  it("removes a mark on second toggle", async () => {
    mockPreferences.discovery_favourites = JSON.stringify(["sy", "gl"]);
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual(["sy", "gl"]));

    act(() => result.current.toggleFavourite("sy"));

    expect(result.current.favourites).toEqual(["gl"]);
    expect(result.current.isFavourite("sy")).toBe(false);
  });

  it("recovers from a corrupt stored value instead of throwing", async () => {
    mockPreferences.discovery_favourites = "not json";
    const { result } = renderHook(() => useFavourites());
    await waitFor(() => expect(result.current.favourites).toEqual([]));
  });

  it("ignores toggleFavourite before initial load completes to prevent data loss", async () => {
    vi.mocked(invoke).mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    const { result } = renderHook(() => useFavourites());

    act(() => result.current.toggleFavourite("sy"));

    expect(result.current.favourites).toEqual([]);
    expect(vi.mocked(invoke)).not.toHaveBeenCalledWith("set_preference", expect.anything());
  });
});
