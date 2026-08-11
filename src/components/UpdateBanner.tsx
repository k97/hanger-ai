import { Download, Info } from "lucide-react";

export interface UpdateBannerProps {
  version: string;
  onInstall: () => void;
  onDismiss?: () => void;
}

export default function UpdateBanner({ version, onInstall, onDismiss }: UpdateBannerProps) {
  return (
    <div
      data-testid="update-banner"
      className="flex items-center justify-between gap-3 px-3 py-1.5 bg-n-25 border border-n-100 rounded-control text-xs font-sans text-text-secondary"
    >
      <div className="flex items-center gap-2 truncate">
        <Info size={14} className="shrink-0 text-accent" />
        <span className="truncate font-medium text-text-primary">
          Update available: v{version}
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onInstall}
          className="flex items-center gap-1 px-2.5 py-1 bg-accent text-on-accent rounded-pill font-medium hover:opacity-90 transition-opacity cursor-pointer text-xs"
        >
          <Download size={12} />
          <span>Install Update</span>
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss update notification"
            className="text-text-muted hover:text-text-primary text-xs px-1 cursor-pointer"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
