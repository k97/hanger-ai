/**
 * Reading a SKILL.md well enough to show it.
 *
 * This is not a Markdown implementation and does not try to be. A SKILL.md is
 * YAML frontmatter plus prose, and the inspector renders one document format,
 * so the parser covers exactly what that format uses: headings, paragraphs,
 * lists, fenced code, and inline code / emphasis / links.
 *
 * The important consequence is safety. Everything here produces plain data
 * that the renderer turns into React elements — no HTML string is ever built,
 * so a document cannot inject markup no matter what it contains. Anything the
 * parser does not recognise survives as text rather than disappearing.
 *
 * Field vocabulary follows the Agent Skills standard (agentskills.io), which
 * defines only the six keys in SPEC_FIELDS; everything else is a runtime
 * extension, and spec-compliant readers ignore keys they do not know.
 */

/** The keys the Agent Skills standard itself defines. */
export const SPEC_FIELDS = [
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
] as const;

export type FrontmatterValue = string | string[];

export interface SkillDocument {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

export interface Span {
  text: string;
  code?: boolean;
  strong?: boolean;
  href?: string;
}

export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: Span[][] }
  | { kind: "code"; language: string; text: string };

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

/**
 * Splits leading YAML frontmatter from the body.
 *
 * Deliberately shallow: it reads `key: value`, inline `[a, b]` sequences and
 * `- item` blocks, which is the whole of what a SKILL.md header uses. A header
 * it cannot parse is left in the body rather than silently dropped.
 */
export function parseSkillDocument(text: string): SkillDocument {
  const normalised = text.replace(/\r\n/g, "\n");
  const lines = normalised.split("\n");

  if (lines[0]?.trim() !== "---") {
    return { frontmatter: {}, body: normalised };
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      close = i;
      break;
    }
  }
  // An unterminated header is not a header. Hand the file back whole.
  if (close === -1) {
    return { frontmatter: {}, body: normalised };
  }

  const frontmatter: Record<string, FrontmatterValue> = {};
  let pendingKey: string | null = null;

  for (let i = 1; i < close; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && pendingKey) {
      const existing = frontmatter[pendingKey];
      const list = Array.isArray(existing) ? existing : [];
      list.push(unquote(listItem[1]));
      frontmatter[pendingKey] = list;
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    // Everything after the FIRST colon is the value, so a description may
    // contain one without being cut in half.
    const raw = line.slice(separator + 1).trim();

    if (!raw) {
      // A key on its own opens a block sequence on the lines beneath it.
      pendingKey = key;
      frontmatter[key] = [];
      continue;
    }

    pendingKey = null;
    const inlineList = /^\[(.*)\]$/.exec(raw);
    if (inlineList) {
      frontmatter[key] = inlineList[1]
        .split(",")
        .map((entry) => unquote(entry))
        .filter(Boolean);
    } else {
      frontmatter[key] = unquote(raw);
    }
  }

  return { frontmatter, body: lines.slice(close + 1).join("\n") };
}

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/;

/** Splits a line into text, inline code, bold and links. */
function toSpans(line: string): Span[] {
  const spans: Span[] = [];
  let rest = line;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match || match.index === undefined) {
      spans.push({ text: rest });
      break;
    }

    if (match.index > 0) {
      spans.push({ text: rest.slice(0, match.index) });
    }

    const token = match[0];
    if (token.startsWith("`")) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else if (token.startsWith("**")) {
      spans.push({ text: token.slice(2, -2), strong: true });
    } else {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)!;
      // Only http(s) travels as a link. Any other scheme — javascript:, file:,
      // data: — keeps its label and loses its destination.
      const href = /^https?:\/\//i.test(link[2]) ? link[2] : undefined;
      spans.push(href ? { text: link[1], href } : { text: link[1] });
    }

    const tail = rest.slice(match.index);
    rest = tail.slice(token.length);
  }

  return spans.filter((span) => span.text !== "");
}

/** Reads the document body into the block list the renderer walks. */
export function toBlocks(body: string): Block[] {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  let paragraph: string[] = [];
  let list: { ordered: boolean; items: Span[][] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: toSpans(paragraph.join(" ")) });
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    blocks.push({ kind: "list", ordered: list.ordered, items: list.items });
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = /^\s*```(.*)$/.exec(line);
    if (fence) {
      flush();
      const language = fence[1].trim();
      const content: string[] = [];
      i++;
      // A fence holds everything verbatim, including blank lines and anything
      // that would otherwise read as markup.
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        content.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "code", language, text: content.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ kind: "heading", level: heading[1].length, spans: toSpans(heading[2].trim()) });
      continue;
    }

    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push(toSpans((bullet ?? numbered)![1].trim()));
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flush();
  return blocks;
}
