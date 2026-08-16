import { useState } from "react";
import { HeartIcon, HeartIconSolid } from "./icons";

interface FavouriteHeartProps {
  favourited: boolean;
  name: string;
  onToggle: () => void;
}

/**
 * The X-style heart: outline and solid cross-fade in place via opacity
 * transitions (interruptible), with a one-shot scale-pop and pulse ring
 * layered on top only when favouriting — never on the way back out.
 */
export default function FavouriteHeart({ favourited, name, onToggle }: FavouriteHeartProps) {
  const [justFavourited, setJustFavourited] = useState(false);

  return (
    <button
      type="button"
      aria-pressed={favourited}
      aria-label={favourited ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={(e) => {
        e.stopPropagation();
        if (!favourited) setJustFavourited(true);
        onToggle();
      }}
      className={`relative w-4 h-4 shrink-0 grid place-items-center cursor-pointer transition-opacity duration-hover ease-spring ${
        favourited ? "opacity-100" : "opacity-0 group-hover:opacity-100"
      }`}
    >
      {justFavourited && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-pill bg-favourite-ring animate-heart-ring"
        />
      )}
      <span
        onAnimationEnd={() => setJustFavourited(false)}
        className={`relative grid place-items-center w-full h-full ${
          justFavourited ? "animate-heart-pop" : ""
        }`}
      >
        <HeartIcon
          size={14}
          className={`absolute inset-0 m-auto text-ink-3 transition-opacity duration-press ease-out ${
            favourited ? "opacity-0" : "opacity-100"
          }`}
        />
        <HeartIconSolid
          size={14}
          className={`absolute inset-0 m-auto text-favourite transition-opacity duration-press ease-out ${
            favourited ? "opacity-100" : "opacity-0"
          }`}
        />
      </span>
    </button>
  );
}
