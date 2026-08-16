import { useEffect } from "react";
import { BRANDS, resolveBrand } from "../data/brands";
import { isAnyAgent } from "../utils/engineUtils";
import { reportUnmappedEngine } from "../utils/reportUnmappedEngine";

interface BrandIconProps {
  /** Any identifier the UI holds for an engine or host: key, host id, scope agent id, display name. */
  engineKey: string | null | undefined;
  /** For the unmapped report only; never rendered. */
  engineName?: string;
  /** Default 12. */
  size?: number;
  /** Layout only. `size` owns the dimensions. */
  className?: string;
  /** Only when placed inside another <svg>. */
  x?: number;
  y?: number;
}

/**
 * A brand mark from the sprite (BrandSprite), by any identifier the UI holds
 * for an engine or MCP host. Decorative: every site pairs it with a name or a
 * tooltip. An unmapped identifier draws the generic mark and reports itself
 * once per session (spec §6.3, §8). Any-agent draws nothing.
 */
export default function BrandIcon({ engineKey, engineName, size = 12, className, x, y }: BrandIconProps) {
  const anyAgent = isAnyAgent(engineKey);
  const brand = anyAgent ? undefined : resolveBrand(engineKey);
  const unmapped = !anyAgent && brand === undefined;

  useEffect(() => {
    if (unmapped && engineKey) reportUnmappedEngine(engineKey, engineName);
  }, [unmapped, engineKey, engineName]);

  if (anyAgent) return null;
  const id = brand ?? "generic";
  const hasDark = brand !== undefined && BRANDS[brand].darkSvg !== undefined;
  return (
    <svg
      width={size}
      height={size}
      x={x}
      y={y}
      aria-hidden="true"
      focusable="false"
      data-brand={id}
      className={`shrink-0 ${className ?? ""}`}
    >
      {/* A brand with a dark variant ships both marks and lets the theme class
          choose (see index.css). Doing it in CSS rather than in state means the
          swap rides the .dark toggle with no re-render and no flash. */}
      <use href={`#brand-${id}`} className={hasDark ? "brand-light-only" : undefined} />
      {hasDark && <use href={`#brand-${id}-dark`} className="brand-dark-only" />}
    </svg>
  );
}
