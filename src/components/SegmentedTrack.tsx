import { useLayoutEffect, useRef, useState } from "react";
import { LoaderCircleIcon } from "./icons";

export interface TrackSegment {
  id: string;
  label: string;
  /** Backend-owned; rendered verbatim. `undefined` with `loading` draws a spinner. */
  count?: number;
}
export interface SegmentedTrackProps {
  segments: TrackSegment[];
  selectedId: string;
  onSelect: (id: string) => void;
  ariaLabel: string;
  loading?: boolean;
}

export default function SegmentedTrack({
  segments,
  selectedId,
  onSelect,
  ariaLabel,
  loading,
}: SegmentedTrackProps) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [capsuleStyle, setCapsuleStyle] = useState<{ top: number; left: number; width: number }>({
    top: 4,
    left: 4,
    width: 0,
  });

  useLayoutEffect(() => {
    const selectedButton = buttonRefs.current[selectedId];
    if (selectedButton) {
      setCapsuleStyle({
        top: selectedButton.offsetTop,
        left: selectedButton.offsetLeft,
        width: selectedButton.offsetWidth,
      });
      selectedButton.scrollIntoView?.({ inline: "nearest", block: "nearest", behavior: "smooth" });
    } else {
      setCapsuleStyle({ top: 4, left: 4, width: 0 });
    }
  }, [selectedId, segments]);

  const focusSegment = (index: number) => {
    const segment = segments[index];
    if (!segment) return;
    buttonRefs.current[segment.id]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        focusSegment(index === segments.length - 1 ? 0 : index + 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        focusSegment(index === 0 ? segments.length - 1 : index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusSegment(0);
        break;
      case "End":
        event.preventDefault();
        focusSegment(segments.length - 1);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect(segments[index].id);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="relative inline-flex max-w-full p-1 rounded-pill bg-plane border border-line overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <i
        data-testid="track-capsule"
        aria-hidden="true"
        className="absolute h-7 rounded-pill capsule-raised transition-[left,width] duration-nav ease-spring"
        style={{ top: capsuleStyle.top, left: capsuleStyle.left, width: capsuleStyle.width }}
      />
      {segments.map((segment, index) => {
        const selected = segment.id === selectedId;
        return (
          <button
            key={segment.id}
            type="button"
            role="tab"
            id={`seg-${segment.id}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            ref={(el) => {
              buttonRefs.current[segment.id] = el;
            }}
            onClick={() => onSelect(segment.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`relative z-[1] h-7 px-4 rounded-pill font-flex text-small whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-nav ease-spring ${
              selected ? "text-ink-1 font-medium" : "text-ink-2 hover:text-ink-1"
            }`}
          >
            <span>{segment.label}</span>
            <span className={`text-micro tabular ${selected ? "text-ink-2" : "text-ink-3"}`}>
              {segment.count === undefined && loading ? (
                <LoaderCircleIcon size={12} active />
              ) : (
                segment.count ?? 0
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
