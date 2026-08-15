import React, { useState } from "react";
import { ChevronRightIcon, ExclamationTriangleIcon, ExclamationCircleIcon, InformationCircleIcon } from "./icons";

export interface DisclosureBannerProps {
  variant: "warning" | "error" | "info";
  summary: string;
  /** How many items the body lists; prefixed onto the summary with
   *  pluralisation. Omit for a notice that is a sentence, not a tally —
   *  the summary then renders verbatim. */
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

export default function DisclosureBanner({
  variant,
  summary,
  count,
  children,
  defaultOpen = false,
}: DisclosureBannerProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Neutral plane in every variant — the state carries the colour, not the ground.
  const getVariantStyles = () => {
    switch (variant) {
      case "warning":
        return "border-line bg-plane text-state-warning";
      case "error":
        return "border-line bg-plane text-state-danger";
      case "info":
      default:
        return "border-line bg-plane text-ink-2";
    }
  };

  const renderVariantIcon = () => {
    switch (variant) {
      case "warning":
        return <ExclamationTriangleIcon size={14} className="shrink-0" />;
      case "error":
        return <ExclamationCircleIcon size={14} className="shrink-0" />;
      case "info":
      default:
        return <InformationCircleIcon size={14} className="shrink-0" />;
    }
  };

  const formattedSummary = (() => {
    if (count === undefined) {
      return summary.trim();
    }
    const isPlural = count !== 1;
    const base = summary.trim();
    if (isPlural) {
      if (base.endsWith("s")) {
        return `${count} ${base}`;
      }
      return `${count} ${base}s`;
    } else {
      if (base.endsWith("s")) {
        return `${count} ${base.slice(0, -1)}`;
      }
      return `${count} ${base}`;
    }
  })();

  return (
    <div className={`rounded-inner border text-small transition-colors duration-hover ${getVariantStyles()}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 font-sans font-medium text-left cursor-pointer focus:outline-none rounded-inner"
      >
        <ChevronRightIcon
          size={14}
          className={`shrink-0 transition-transform duration-hover ease-spring ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        {renderVariantIcon()}
        <span className="truncate">{formattedSummary}</span>
      </button>

      {isOpen && (
        <div
          className="overflow-y-auto px-3 pb-3 pt-1 border-t border-line font-sans text-ink-2"
          style={{ maxHeight: "240px" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
