import { BRANDS, BRAND_IDS, GENERIC_MARK } from "../data/brands";
import { toSymbol } from "../utils/svgSymbol";

/** Every brand mark as a <symbol>, joined once at module load. */
export const SPRITE: string = [
  ...BRAND_IDS.map((id) => toSymbol(id, BRANDS[id].svg)),
  toSymbol("generic", GENERIC_MARK.svg),
].join("");

/**
 * The brand sprite: mounted once (main.tsx), referenced everywhere by
 * <use href="#brand-…"> (BrandIcon). One copy of each mark's geometry and
 * gradient in the document however many rows show it.
 *
 * This is the one place brand markup is injected as HTML. Its input is
 * build-time vendor files and one in-house file (src/assets/brand); nothing
 * here comes from the user, the filesystem at runtime, or the backend.
 */
export default function BrandSprite() {
  return (
    <svg
      className="absolute w-0 h-0"
      aria-hidden="true"
      focusable="false"
      data-testid="brand-sprite"
      dangerouslySetInnerHTML={{ __html: SPRITE }}
    />
  );
}
