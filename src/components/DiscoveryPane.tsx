import { Globe, Search, Terminal, Hammer, HardDrive } from "lucide-react";

export default function DiscoveryPane() {
  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-page animate-fade-in font-sans">
      {/* Discovery Header */}
      <div className="px-[18px] py-3.5 border-b border-line flex items-center justify-between shrink-0">
        <span className="text-small text-ink-3">
          Browse and install third-party AI agent assets from community indexes
        </span>
      </div>

      {/* Discovery Content Area */}
      <div className="flex-1 overflow-y-auto p-[18px] flex flex-col gap-5">
        {/* Mock Search Bar */}
        <div className="relative max-w-md w-full h-[27px]">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-3 pointer-events-none" />
          <input
            type="text"
            disabled
            placeholder="Search community skills, tools, and hooks (v1.1+)..."
            className="w-full h-full pl-[30px] pr-3.5 bg-plane rounded-pill text-small text-ink-3 cursor-not-allowed focus:outline-none"
          />
        </div>

        {/* Informational Hero Card */}
        <div className="border border-line rounded-plane bg-plane p-6 flex flex-col gap-4 max-w-2xl">
          <div className="flex items-center gap-3">
            <Globe className="text-ink-2" size={20} />
            <h2 className="text-lg-app font-medium tracking-[-0.3px] text-ink-1">Community Asset Indexing</h2>
          </div>
          <p className="text-small text-ink-2 leading-[1.65]">
            The Discovery Hub will connect with Glama, MCP Index, and Github community repositories to provide one-click installs of custom tools and skills directly into Hanger.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-2">
            <div className="p-3 border border-line rounded-inner bg-page flex flex-col gap-1">
              <Terminal size={14} className="text-ink-3" />
              <span className="text-small font-medium text-ink-1">MCP Tools</span>
              <span className="text-micro text-ink-3">Installs external tool configurations.</span>
            </div>
            <div className="p-3 border border-line rounded-inner bg-page flex flex-col gap-1">
              <Hammer size={14} className="text-ink-3" />
              <span className="text-small font-medium text-ink-1">Agent Skills</span>
              <span className="text-micro text-ink-3">Extends Claude and Gemini environments.</span>
            </div>
            <div className="p-3 border border-line rounded-inner bg-page flex flex-col gap-1">
              <HardDrive size={14} className="text-ink-3" />
              <span className="text-small font-medium text-ink-1">System Hooks</span>
              <span className="text-micro text-ink-3">Automated lifecycle event triggers.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
