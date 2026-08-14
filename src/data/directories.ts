/**
 * Where the ecosystem publishes agent assets.
 *
 * A static, hand-checked catalogue rather than a live feed: Hanger does not
 * fetch from these directories, so nothing here needs to be fresh to the
 * minute. Entries carry the command that pulls from them, which the user
 * copies and runs themselves.
 *
 * Volume figures drift daily, so descriptions hedge them ("≈21,000 at last
 * count") rather than asserting a live number the app cannot verify.
 */

/** When the catalogue below was last checked by hand. Shown in the lead so a
 *  stale list reads as stale rather than as live. */
export const CATALOGUE_CHECKED = "August 2026";

export type Tier = "Standard" | "Official" | "Community";

export interface Directory {
  /** Two-character monogram shown in the row's mark. Unique across the set. */
  mark: string;
  name: string;
  url: string;
  tier: Tier;
  /** What the directory holds. Drives the facet chips. */
  kinds: string[];
  /** The command or instruction that pulls from it — copied, never run here. */
  fetch: string;
  desc: string;
}

export const TIERS: { tier: Tier; note: string }[] = [
  { tier: "Standard", note: "read these first, the rest implement them" },
  { tier: "Official", note: "published by the vendor" },
  { tier: "Community", note: "independently maintained" },
];

export const DIRECTORIES: Directory[] = [
  // ── Standard ───────────────────────────────────────────────────────────
  {
    mark: "io",
    name: "Agent Skills spec",
    url: "https://agentskills.io",
    tier: "Standard",
    kinds: ["Format spec", "Skills"],
    fetch: "github.com/agentskills/agentskills",
    desc:
      "Not a listing. The open specification for SKILL.md itself — directory layout, frontmatter schema and the progressive disclosure model every directory below implements. Read it once and the rest of this page makes sense.",
  },
  {
    mark: "mc",
    name: "Model Context Protocol",
    url: "https://modelcontextprotocol.io",
    tier: "Standard",
    kinds: ["Format spec", "MCP servers"],
    fetch: "github.com/modelcontextprotocol",
    desc:
      "The specification behind every MCP server listed further down: transports, tool and resource schemas, and the client handshake. Tools in Hanger are MCP server entries in an engine's config, so this is the shape they conform to.",
  },
  {
    mark: "am",
    name: "AGENTS.md",
    url: "https://agents.md",
    tier: "Standard",
    kinds: ["Format spec", "Rules"],
    fetch: "Write AGENTS.md at your repository root",
    desc:
      "The cross-tool convention for project rules — one Markdown file per directory, applying to everything beneath it. Read by Codex, Copilot, Gemini CLI, Cursor and others, which is why Hanger classifies it as a rule wherever it appears.",
  },

  // ── Official ───────────────────────────────────────────────────────────
  {
    mark: "an",
    name: "anthropics/skills",
    url: "https://github.com/anthropics/skills",
    tier: "Official",
    kinds: ["Skills", "Plugins"],
    fetch: "/plugin marketplace add anthropics/skills",
    desc:
      "Anthropic's public repository of example and document skills — PowerPoint, Excel, Word and PDF handling alongside creative and enterprise examples. Registers directly as a Claude Code plugin marketplace.",
  },
  {
    mark: "pc",
    name: "anthropics/claude-plugins-community",
    url: "https://github.com/anthropics/claude-plugins-community",
    tier: "Official",
    kinds: ["Plugins", "Skills", "Subagents", "Commands"],
    fetch: "/plugin marketplace add anthropics/claude-plugins-community",
    desc:
      "The community marketplace Anthropic hosts but does not author. Unlike the official one it is not added for you, and every plugin in it has passed automated safety screening before listing.",
  },
  {
    mark: "re",
    name: "MCP Registry",
    url: "https://registry.modelcontextprotocol.io",
    tier: "Official",
    kinds: ["MCP servers"],
    fetch: "curl https://registry.modelcontextprotocol.io/v0/servers",
    desc:
      "The canonical feed under the Model Context Protocol umbrella, built for machines rather than browsing — most of the directories below read from it. Go here to confirm a server's official identity, not to shop.",
  },
  {
    mark: "ms",
    name: "modelcontextprotocol/servers",
    url: "https://github.com/modelcontextprotocol/servers",
    tier: "Official",
    kinds: ["MCP servers"],
    fetch: "npx -y @modelcontextprotocol/server-filesystem",
    desc:
      "The reference server implementations maintained alongside the protocol — filesystem, fetch, git, memory and more. The ones to read when writing your own, and the safest to point an agent at first.",
  },
  {
    mark: "cx",
    name: "Codex skills",
    url: "https://developers.openai.com/codex/skills",
    tier: "Official",
    kinds: ["Skills"],
    fetch: "Place skills in ~/.codex/skills",
    desc:
      "OpenAI's documentation for building and installing skills in Codex. It follows the same SKILL.md format, so a skill written for Claude transfers without conversion — which is exactly what Hanger's cross-engine linking assumes.",
  },
  {
    mark: "cu",
    name: "Cursor Agent Skills",
    url: "https://cursor.com/docs/context/skills",
    tier: "Official",
    kinds: ["Skills", "Rules"],
    fetch: "Place skills in .cursor/skills",
    desc:
      "Cursor's adoption of the same standard, alongside its own .cursor/rules MDC format for project rules. Useful for understanding how one machine ends up holding the same skill under three different directory names.",
  },

  // ── Community ──────────────────────────────────────────────────────────
  {
    mark: "sh",
    name: "skills.sh",
    url: "https://www.skills.sh",
    tier: "Community",
    kinds: ["Skills", "Commands"],
    fetch: "npx skills add <repo>",
    desc:
      "A distribution hub organised by the agent that consumes the skill. Pulls repositories into your project as ordinary files you own and can edit, with nothing updating behind your back.",
  },
  {
    mark: "as",
    name: "agentskill.sh",
    url: "https://agentskill.sh",
    tier: "Community",
    kinds: ["Skills", "Plugins"],
    fetch: "npx @agentskill.sh/cli setup",
    desc:
      "One of the largest indexes by volume, spanning sixteen categories plus curated bundles you can install together. Open submission, so provenance varies entry by entry — read before you run.",
  },
  {
    mark: "sd",
    name: "Skills Directory",
    url: "https://www.skillsdirectory.com",
    tier: "Community",
    kinds: ["Skills"],
    fetch: "Follow each skill's own instructions",
    desc:
      "A curated index that scans every entry for prompt injection, credential theft and exfiltration before listing it, then publishes a grade. The only entry here that treats a skill as something your agent will run with your file access.",
  },
  {
    mark: "ch",
    name: "Claude Skills Hub",
    url: "https://claudeskills.info",
    tier: "Community",
    kinds: ["Skills"],
    fetch: "Follow each skill's own instructions",
    desc:
      "A ranked directory built by indexing public SKILL.md files on GitHub — tens of thousands at last count — ordered by installs and refreshed daily. Good for finding the well-worn version of a common skill.",
  },
  {
    mark: "cm",
    name: "Claude Marketplaces",
    url: "https://claudemarketplaces.com",
    tier: "Community",
    kinds: ["Skills", "Plugins", "MCP servers"],
    fetch: "/plugin marketplace add <owner>/<repo>",
    desc:
      "Browses skills, plugins and MCP servers by category — frontend, backend, testing, security, DevOps — and, unusually, indexes the plugin marketplaces themselves so you can find the source repository rather than a single skill.",
  },
  {
    mark: "sm",
    name: "SkillsMP",
    url: "https://skillsmp.com",
    tier: "Community",
    kinds: ["Skills"],
    fetch: "Follow each skill's own instructions",
    desc:
      "Explores public SKILL.md files by task, creator or occupation rather than by technology. The occupation axis is the useful one: it surfaces skills written for work you do, not for the stack you happen to use.",
  },
  {
    mark: "cl",
    name: "Claude Market",
    url: "https://www.claudemarket.ai",
    tier: "Community",
    kinds: ["Skills", "MCP servers"],
    fetch: "Follow each skill's own instructions",
    desc:
      "A general index of reusable SKILL.md instructions alongside MCP servers, presented as an app store. Entries are short and task-shaped, which makes it a reasonable place to start if you do not yet know what you want.",
  },
  {
    mark: "lb",
    name: "LobeHub",
    url: "https://lobehub.com/skills",
    tier: "Community",
    kinds: ["Skills", "MCP servers", "Plugins"],
    fetch: "Follow each entry's own instructions",
    desc:
      "The largest MCP directory by raw count — tens of thousands of servers — with a skills section covering Claude, Codex and ChatGPT. Breadth over curation: expect to filter hard.",
  },
  {
    mark: "mm",
    name: "MCP Market",
    url: "https://mcpmarket.com",
    tier: "Community",
    kinds: ["MCP servers", "Skills"],
    fetch: "Follow each server's own instructions",
    desc:
      "Thousands of MCP servers organised across two dozen categories — developer tools, API development, data science, productivity — with a separate agent-skills section. Category-first rather than search-first.",
  },
  {
    mark: "aw",
    name: "Awesome Claude",
    url: "https://awesomeclaude.ai",
    tier: "Community",
    kinds: ["Skills", "MCP servers", "Commands"],
    fetch: "Follow each entry's own instructions",
    desc:
      "A hand-kept companion to the awesome-list tradition, pairing a skills directory with MCP servers and a cheatsheet. Smaller than the crawlers, which is the point — someone chose each line.",
  },
  {
    mark: "ts",
    name: "Tons of Skills",
    url: "https://tonsofskills.com",
    tier: "Community",
    kinds: ["Plugins", "Skills", "Subagents"],
    fetch: "npx ccpi install <plugin>",
    desc:
      "An open-source marketplace of plugins, skills and agents with its own package-manager CLI. Installing through a package manager means the assets arrive versioned, which is rarer here than it should be.",
  },
  {
    mark: "at",
    name: "aitmpl.com",
    url: "https://www.aitmpl.com/plugins/",
    tier: "Community",
    kinds: ["Plugins", "Commands", "Subagents"],
    fetch: "/plugin marketplace add <owner>/<repo>",
    desc:
      "A directory of Claude Code plugin collections rather than individual assets — useful when you want the whole working set a team publishes instead of cherry-picking one command at a time.",
  },
  {
    mark: "mp",
    name: "mattpocock/skills",
    url: "https://github.com/mattpocock/skills",
    tier: "Community",
    kinds: ["Skills", "Commands", "Plugins"],
    fetch: "npx skills add mattpocock/skills",
    desc:
      "A single engineer's working set, shipped through Claude Code's official marketplace. Built around common failure modes in coding agents — planning, debugging, dispatching subagents and running autonomous loops.",
  },
  {
    mark: "ar",
    name: "alirezarezvani/claude-skills",
    url: "https://github.com/alirezarezvani/claude-skills",
    tier: "Community",
    kinds: ["Skills", "Subagents", "Commands"],
    fetch: "/plugin marketplace add alirezarezvani/claude-skills",
    desc:
      "A large cross-tool collection — hundreds of skills and dozens of agents — with conversion scripts targeting more than a dozen coding agents. The clearest demonstration that one folder can serve every agent on your machine.",
  },
  {
    mark: "cc",
    name: "ccplugins/awesome-claude-code-plugins",
    url: "https://github.com/ccplugins/awesome-claude-code-plugins",
    tier: "Community",
    kinds: ["Plugins", "Commands", "Subagents", "MCP servers"],
    fetch: "/plugin marketplace add ccplugins/awesome-claude-code-plugins",
    desc:
      "A curated list of slash commands, subagents, MCP servers and hooks in one place. The four asset kinds Hanger tracks, catalogued together, which makes it a good map of what a plugin can even contain.",
  },
  {
    mark: "vo",
    name: "VoltAgent/awesome-claude-code-subagents",
    url: "https://github.com/VoltAgent/awesome-claude-code-subagents",
    tier: "Community",
    kinds: ["Subagents"],
    fetch: "/plugin marketplace add VoltAgent/awesome-claude-code-subagents",
    desc:
      "The reference collection for subagents specifically — over a hundred specialised agents covering language, infrastructure and review roles. Worth reading for how the descriptions are written, since that is what dispatches them.",
  },
  {
    mark: "he",
    name: "Hermes Agent skills",
    url: "https://hermes-agent.nousresearch.com/docs/skills/",
    tier: "Community",
    kinds: ["Skills"],
    fetch: "See the docs for the sync script",
    desc:
      "Nous Research's skills documentation for Hermes Agent. Documentation rather than an index, and it follows the same SKILL.md standard, so skills written elsewhere transfer without conversion.",
  },
  {
    mark: "sy",
    name: "Smithery",
    url: "https://smithery.ai",
    tier: "Community",
    kinds: ["MCP servers"],
    fetch: "npx @smithery/cli install <server>",
    desc:
      "A registry with a real installer and hosted remote servers, so a tool can be added without cloning anything. The cleanest install path of the MCP directories, at the cost of trusting a middleman with the connection.",
  },
  {
    mark: "gl",
    name: "Glama",
    url: "https://glama.ai/mcp/servers",
    tier: "Community",
    kinds: ["MCP servers"],
    fetch: "Follow each server's own instructions",
    desc:
      "Among the largest MCP directories — roughly twenty thousand servers at last count — with visual previews and daily crawls. Volume is the draw; treat the long tail as unreviewed.",
  },
  {
    mark: "pu",
    name: "PulseMCP",
    url: "https://www.pulsemcp.com",
    tier: "Community",
    kinds: ["MCP servers"],
    fetch: "Follow each server's own instructions",
    desc:
      "Hand-reviewed daily since MCP's launch week, with editorial notes and a weekly newsletter. Slower to list a new server than the crawlers, which is precisely why a listing here means something.",
  },
  {
    mark: "so",
    name: "mcp.so",
    url: "https://mcp.so",
    tier: "Community",
    kinds: ["MCP servers"],
    fetch: "Follow each server's own instructions",
    desc:
      "A large community-submitted index with unusually good coverage of third-party and unofficial servers — the place to look when a vendor has not shipped an MCP server but somebody else has.",
  },
  {
    mark: "pk",
    name: "punkpeye/awesome-mcp-servers",
    url: "https://github.com/punkpeye/awesome-mcp-servers",
    tier: "Community",
    kinds: ["MCP servers"],
    fetch: "git clone https://github.com/punkpeye/awesome-mcp-servers",
    desc:
      "The awesome-list that most of the MCP directories were originally seeded from. A flat Markdown file, which means you can read the whole ecosystem in one scroll and diff it over time.",
  },
  {
    mark: "cd",
    name: "cursor.directory",
    url: "https://cursor.directory",
    tier: "Community",
    kinds: ["Rules", "MCP servers"],
    fetch: "Copy a rule into .cursor/rules",
    desc:
      "The largest collection of project rules, organised by language and framework. Written for Cursor's MDC format, but the prose transfers to CLAUDE.md or AGENTS.md with no more than a header change.",
  },
  {
    mark: "pj",
    name: "PatrickJS/awesome-cursorrules",
    url: "https://github.com/PatrickJS/awesome-cursorrules",
    tier: "Community",
    kinds: ["Rules"],
    fetch: "git clone https://github.com/PatrickJS/awesome-cursorrules",
    desc:
      "The original .cursorrules collection, still the widest sample of how teams actually write rules. The single-file format it uses is now superseded, so read it for the content rather than the layout.",
  },
  {
    mark: "s5",
    name: "sanjeed5/awesome-cursor-rules-mdc",
    url: "https://github.com/sanjeed5/awesome-cursor-rules-mdc",
    tier: "Community",
    kinds: ["Rules"],
    fetch: "git clone https://github.com/sanjeed5/awesome-cursor-rules-mdc",
    desc:
      "The same idea rebuilt for the current MDC rule format, with glob-scoped activation per file. Useful as a reference for splitting one oversized rules file into several that attach only when relevant.",
  },
];
