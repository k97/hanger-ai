import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DIRECTORIES } from "../data/directories";

const PREFERENCE_KEY = "discovery_favourites";

// The catalogue is static and hand-maintained, so a mark can be renamed or
// removed as part of ordinary upkeep (stamped with CATALOGUE_CHECKED). A
// user who favourited it keeps the old mark in their persisted preference
// forever unless something prunes it — DiscoveryPane already drops it
// silently when rendering, but DiscoverySidebar's badge counts the raw,
// unpruned list, so it can overcount (or in the worst case, stay visible at
// a positive count with nothing the pane can show).
const VALID_MARKS = new Set(DIRECTORIES.map((dir) => dir.mark));

export interface FavouritesState {
  /** Favourited marks, most-recently-favourited first. */
  favourites: string[];
  isFavourite: (mark: string) => boolean;
  toggleFavourite: (mark: string) => void;
}

function parseFavourites(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((m) => typeof m === "string") : [];
  } catch {
    return [];
  }
}

export function useFavourites(): FavouritesState {
  const [favourites, setFavourites] = useState<string[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    invoke<string | null>("get_preference", { key: PREFERENCE_KEY })
      .then((value) => {
        const parsed = parseFavourites(value);
        const pruned = parsed.filter((mark) => VALID_MARKS.has(mark));
        setFavourites(pruned);
        loadedRef.current = true;
        // Only write back when pruning actually changed something — an
        // untouched list shouldn't generate a preference write on every
        // mount.
        if (pruned.length !== parsed.length) {
          invoke("set_preference", {
            key: PREFERENCE_KEY,
            value: JSON.stringify(pruned),
          }).catch(() => {});
        }
      })
      .catch(() => {
        loadedRef.current = true;
      });
  }, []);

  const persist = (next: string[]) => {
    setFavourites(next);
    invoke("set_preference", { key: PREFERENCE_KEY, value: JSON.stringify(next) }).catch(() => {});
  };

  const toggleFavourite = (mark: string) => {
    if (!loadedRef.current) return;
    persist(
      favourites.includes(mark) ? favourites.filter((m) => m !== mark) : [mark, ...favourites]
    );
  };

  return {
    favourites,
    isFavourite: (mark: string) => favourites.includes(mark),
    toggleFavourite,
  };
}
