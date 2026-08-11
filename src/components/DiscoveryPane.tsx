import { Globe, Search, Terminal, Hammer, HardDrive } from "lucide-react";

export default function DiscoveryPane() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-surface animate-fade-in font-sans">
      {/* Discovery Header */}
      <div className="p-4 border-b border-n-100 flex items-center justify-between shrink-0">
        <span className="text-xs text-text-muted">
          Browse and install third-party AI agent assets from community indexes
        </span>
      </div>

      {/* Discovery Content Area */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        {/* Mock Search Bar */}
        <div className="relative max-w-md w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            disabled
            placeholder="Search community skills, tools, and hooks (v1.1+)..."
            className="w-full pl-10 pr-4 py-2 bg-n-50 border border-n-100 rounded-md text-sm text-text-muted cursor-not-allowed focus:outline-none"
          />
        </div>

        {/* Informational Hero Card */}
        <div className="border border-n-100 rounded-xl bg-n-25 p-8 flex flex-col gap-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <Globe className="text-brand-lime" size={24} />
            <h2 className="text-md font-bold text-text-primary">Community Asset Indexing</h2>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            The Discovery Hub will connect with Glama, MCP Index, and Github community repositories to provide one-click installs of custom tools and skills directly into Hanger.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div className="p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1">
              <Terminal size={14} className="text-brand-violet" />
              <span className="text-xs font-bold text-text-primary">MCP Tools</span>
              <span className="text-[10px] text-text-muted">Installs external tool configurations.</span>
            </div>
            <div className="p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1">
              <Hammer size={14} className="text-brand-pink" />
              <span className="text-xs font-bold text-text-primary">Agent Skills</span>
              <span className="text-[10px] text-text-muted">Extends Claude and Gemini environments.</span>
            </div>
            <div className="p-3 border border-n-100 rounded-md bg-surface/50 flex flex-col gap-1">
              <HardDrive size={14} className="text-text-secondary" />
              <span className="text-xs font-bold text-text-primary">System Hooks</span>
              <span className="text-[10px] text-text-muted">Automated lifecycle event triggers.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
