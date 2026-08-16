import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const PREFERENCE_KEY = "discovery_favourites";

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

  useEffect(() => {
    invoke<string | null>("get_preference", { key: PREFERENCE_KEY })
      .then((value) => setFavourites(parseFavourites(value)))
      .catch(() => {});
  }, []);

  const persist = (next: string[]) => {
    setFavourites(next);
    invoke("set_preference", { key: PREFERENCE_KEY, value: JSON.stringify(next) }).catch(() => {});
  };

  const toggleFavourite = (mark: string) => {
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
