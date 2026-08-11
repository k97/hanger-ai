import React, { useState } from "react";
import { ChevronRight, AlertTriangle, AlertCircle, Info } from "lucide-react";

export interface DisclosureBannerProps {
  variant: "warning" | "error" | "info";
  summary: string;
  count: number;
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

  const getVariantStyles = () => {
    switch (variant) {
      case "warning":
        return "border-warning-tint bg-warning-tint text-warning-text-on-tint";
      case "error":
        return "border-danger-tint bg-danger-tint text-danger-text-on-tint";
      case "info":
      default:
        return "border-n-100 bg-n-25 text-text-secondary";
    }
  };

  const renderVariantIcon = () => {
    switch (variant) {
      case "warning":
        return <AlertTriangle size={14} className="shrink-0" />;
      case "error":
        return <AlertCircle size={14} className="shrink-0" />;
      case "info":
      default:
        return <Info size={14} className="shrink-0" />;
    }
  };

  const formattedSummary = (() => {
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
    <div className={`rounded-control border text-row transition-colors ${getVariantStyles()}`}>
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-3 font-sans font-medium text-left cursor-pointer focus:outline-none rounded-control"
      >
        <ChevronRight
          size={14}
          className={`shrink-0 transition-transform duration-fast ${
            isOpen ? "rotate-90" : ""
          }`}
        />
        {renderVariantIcon()}
        <span className="truncate">{formattedSummary}</span>
      </button>

      {isOpen && (
        <div
          className="overflow-y-auto px-3 pb-3 pt-1 border-t border-current/10 font-sans"
          style={{ maxHeight: "240px" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
