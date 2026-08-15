import type { ReactNode } from "react";
import BrandIcon from "./BrandIcon";

interface EngineLabelProps {
  engineKey: string | null | undefined;
  engineName?: string;
  /** Mark size; default 12. */
  size?: number;
  className?: string;
  children: ReactNode;
}

/** Icon + label for an engine or host: one gap and one baseline for every
 *  text site, instead of seven (spec §6.4). */
export default function EngineLabel({ engineKey, engineName, size = 12, className, children }: EngineLabelProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 min-w-0 ${className ?? ""}`}>
      <BrandIcon engineKey={engineKey} engineName={engineName} size={size} />
      <span className="truncate">{children}</span>
    </span>
  );
}
