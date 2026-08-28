/**
 * Reading a SKILL.md well enough to show it.
 *
 * This is not a Markdown implementation and does not try to be. A SKILL.md is
 * YAML frontmatter plus prose, and the inspector renders one document format,
 * so the parser covers exactly what that format uses. A census of the 384
 * skill, rule and subagent files in the store (2026-08-29) set the list:
 * headings, paragraphs, nested and task lists, fenced code, pipe tables,
 * blockquotes, rules, and inline code / emphasis / strikethrough / links.
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

export type DocumentKind = "markdown" | "json" | "none";

/**
 * How an asset's file should be shown, decided by what the file actually is.
 *
 * Skills, rules and subagents are all prose with a YAML header, so they read
 * the same way. A tool is an entry in a JSON config — rendering it as prose
 * would show braces as paragraphs. An agent is not a file at all; it is a
 * folder layout inferred from a scan, so there is nothing to preview and the
 * panel does not pretend otherwise by offering an empty pane.
 */
export function documentKindFor(category: string): DocumentKind {
  if (category === "Agents") return "none";
  if (category === "Tools") return "json";
  return "markdown";
}

/**
 * Re-indents JSON so a config reads as structure rather than one long line.
 *
 * Returns null when the text is not JSON, which is a real case — a config
 * file can be mid-edit or hand-written with comments — and the caller falls
 * back to showing it verbatim rather than to an error.
 */
export function formatJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

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
  em?: boolean;
  strike?: boolean;
  href?: string;
  /** A hard line break — two trailing spaces, a trailing backslash or `<br>`. */
  break?: boolean;
}

export interface ListItem {
  spans: Span[];
  /** Only a task item carries this: `- [ ]` is false, `- [x]` true. */
  checked?: boolean;
  /** Whatever sits indented under the item — a sub-list, a fence, another paragraph. Absent when nothing does. */
  children?: Block[];
}

export type Align = "left" | "center" | "right" | null;

export type Block =
  | { kind: "heading"; level: number; spans: Span[] }
  | { kind: "paragraph"; spans: Span[] }
  | { kind: "list"; ordered: boolean; items: ListItem[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "table"; align: Align[]; header: Span[][]; rows: Span[][][] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "rule" };

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

// One alternation, tried left to right at each position: an escape beats
// everything, a code span beats emphasis, and `**` beats `*` where they
// share a start. Underscore emphasis wants a non-word character on both
// sides, so a snake_case_name never opens one; single-star emphasis wants a
// non-space after the opening star, so `2 * 3` never does either.
const INLINE =
  /(?<esc>\\[!-\/:-@\[-`{-~])|(?<tick>`+)(?<code>[\s\S]+?)\k<tick>(?!`)|!\[(?<alt>[^\]]*)\]\((?<src>[^)\s]+)\)|\[(?<label>[^\]]+)\]\((?<url>[^)\s]+)\)|\*\*(?<strong>[^*]+)\*\*|(?<![A-Za-z0-9_])__(?<ustrong>[^_]+)__(?![A-Za-z0-9_])|\*(?<em>[^*\s][^*]*)\*|(?<![A-Za-z0-9_])_(?<uem>[^_\s](?:[^_]*[^_\s])?)_(?![A-Za-z0-9_])|~~(?<strike>[^~]+)~~|(?<br><br\s*\/?>)/i;

function hardBreak(): Span {
  return { text: "\n", break: true };
}

function isPlain(span: Span): boolean {
  return !span.code && !span.strong && !span.em && !span.strike && !span.href && !span.break;
}

/** Appends a span, folding plain text into a plain neighbour so an escape or a `<br>` never leaves a seam. */
function push(spans: Span[], span: Span) {
  if (span.text === "") return;
  const last = spans[spans.length - 1];
  if (last && isPlain(last) && isPlain(span)) {
    last.text += span.text;
    return;
  }
  spans.push(span);
}

function linkSpan(text: string, destination: string): Span {
  // Only http(s) travels as a link. Any other scheme — javascript:, file:,
  // data: — keeps its label and loses its destination. An image is shown the
  // same way, as its alt text: the panel does not fetch pictures.
  return /^https?:\/\//i.test(destination) ? { text, href: destination } : { text };
}

/** Splits a line into text, inline code, bold, emphasis, strikethrough, links and breaks. */
function toSpans(line: string): Span[] {
  const spans: Span[] = [];
  let rest = line;

  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      push(spans, { text: rest });
      break;
    }
    if (match.index > 0) push(spans, { text: rest.slice(0, match.index) });

    const g = match.groups!;
    if (g.esc !== undefined) {
      push(spans, { text: g.esc.slice(1) });
    } else if (g.code !== undefined) {
      // A code span may pad itself with one space each side to hold a backtick.
      push(spans, { text: g.code.replace(/^ (.+) $/, "$1"), code: true });
    } else if (g.alt !== undefined) {
      push(spans, linkSpan(g.alt, g.src));
    } else if (g.label !== undefined) {
      push(spans, linkSpan(g.label, g.url));
    } else if (g.strong !== undefined || g.ustrong !== undefined) {
      // Emphasis nests: the inside is read again so `**a \`b\` c**` keeps its code.
      for (const inner of toSpans(g.strong ?? g.ustrong)) push(spans, { ...inner, strong: true });
    } else if (g.em !== undefined || g.uem !== undefined) {
      for (const inner of toSpans(g.em ?? g.uem)) push(spans, { ...inner, em: true });
    } else if (g.strike !== undefined) {
      for (const inner of toSpans(g.strike)) push(spans, { ...inner, strike: true });
    } else {
      push(spans, hardBreak());
    }

    rest = rest.slice(match.index + match[0].length);
  }

  return spans;
}

/** Joins a paragraph's lines with a space, or a hard break where a line asked for one. */
function linesToSpans(lines: string[]): Span[] {
  const spans: Span[] = [];
  let pendingBreak = false;
  lines.forEach((raw, index) => {
    const body = raw.trimStart();
    let text = body.trimEnd();
    let hard = false;
    if (/  $/.test(body)) {
      hard = true;
    } else if (/(?<!\\)\\$/.test(body)) {
      hard = true;
      text = body.slice(0, -1).trimEnd();
    }
    if (index > 0) push(spans, pendingBreak ? hardBreak() : { text: " " });
    for (const span of toSpans(text)) push(spans, span);
    pendingBreak = hard;
  });
  return spans;
}

const FENCE = /^\s*```(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
// Indent, marker, the gap after it, the text. The item's content column is
// the width of the first three, and every line indented that far is its.
const MARKER = /^( *)([-*+]|\d+[.)])( +)(.*)$/;
const TASK = /^\[( |x|X)\](?:\s+(.*))?$/;
const COMMENT_OPEN = /^\s*<!--/;
const TABLE_DIVIDER = /^\|?(?:\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?$/;

function leading(line: string): number {
  return /^ */.exec(line)![0].length;
}

/** The lines that end a paragraph, a lazily wrapped item or a quote. */
function startsBlock(line: string): boolean {
  return HEADING.test(line) || FENCE.test(line) || RULE.test(line) || QUOTE.test(line) || COMMENT_OPEN.test(line);
}

function isDivider(line: string): boolean {
  return line.includes("|") && TABLE_DIVIDER.test(line.trim());
}

/** Splits a table row on unescaped pipes; the outer pipes are decoration, not empty cells. */
function splitCells(line: string): string[] {
  const trimmed = line.trim();
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === "\\" && trimmed[i + 1] === "|") {
      cell += "\\|";
      i++;
    } else if (ch === "|") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) cells.pop();
  return cells.map((c) => c.trim());
}

function alignOf(divider: string): Align {
  const left = divider.startsWith(":");
  const right = divider.endsWith(":");
  return left && right ? "center" : right ? "right" : left ? "left" : null;
}

function readTable(lines: string[], start: number): { block: Block; next: number } | null {
  const header = splitCells(lines[start]);
  const dividers = splitCells(lines[start + 1]);
  if (header.length !== dividers.length) return null;

  const rows: Span[][][] = [];
  let i = start + 2;
  while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !MARKER.test(lines[i])) {
    // GFM's rule: a long row loses its extra cells and a short one is padded.
    const cells = splitCells(lines[i]).slice(0, header.length);
    while (cells.length < header.length) cells.push("");
    rows.push(cells.map(toSpans));
    i++;
  }
  return {
    block: { kind: "table", align: dividers.map(alignOf), header: header.map(toSpans), rows },
    next: i,
  };
}

function toItem(content: string[]): ListItem {
  const task = TASK.exec(content[0]);
  const first = task ? (task[2] ?? "") : content[0];
  // The item's body is a document of its own: its first paragraph is the
  // item's text and anything after — a sub-list, a fence — its children.
  const blocks = parseBlocks([first, ...content.slice(1)]);
  const [head, ...rest] = blocks;
  const item: ListItem = head?.kind === "paragraph" ? { spans: head.spans } : { spans: [] };
  const children = head?.kind === "paragraph" ? rest : blocks;
  if (task) item.checked = task[1] !== " ";
  if (children.length > 0) item.children = children;
  return item;
}

function readList(lines: string[], start: number): { block: Block; next: number } {
  const ordered = /^\d/.test(MARKER.exec(lines[start])![2]);
  const items: ListItem[] = [];
  let i = start;

  while (i < lines.length) {
    const marker = MARKER.exec(lines[i]);
    if (!marker || /^\d/.test(marker[2]) !== ordered) break;
    const contentColumn = marker[0].length - marker[4].length;
    const content: string[] = [marker[4]];
    i++;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        // Blank lines belong to the item only when something indented follows them.
        let j = i;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length && leading(lines[j]) >= contentColumn) {
          for (; i < j; i++) content.push("");
          continue;
        }
        i = j;
        break;
      }
      if (leading(line) >= contentColumn) {
        content.push(line.slice(contentColumn));
        i++;
        continue;
      }
      // Less indented than the item's text: a sibling marker or a new block
      // ends the item; anything else is a lazily wrapped line of it, unless
      // a blank line already closed the paragraph.
      if (MARKER.test(line) || startsBlock(line) || content[content.length - 1].trim() === "") break;
      content.push(line.trimStart());
      i++;
    }
    items.push(toItem(content));
  }

  return { block: { kind: "list", ordered, items }, next: i };
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: "paragraph", spans: linesToSpans(paragraph) });
    paragraph = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (COMMENT_OPEN.test(line)) {
      // A comment that opens its line is for the file's editor, not its
      // reader; one inside a sentence or a code span stays text.
      flushParagraph();
      while (i < lines.length && !lines[i].includes("-->")) i++;
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      flushParagraph();
      const language = fence[1].trim();
      const content: string[] = [];
      i++;
      // A fence holds everything verbatim, including blank lines and anything
      // that would otherwise read as markup.
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        content.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", language, text: content.join("\n") });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: "heading", level: heading[1].length, spans: toSpans(heading[2].trim()) });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      flushParagraph();
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      const inner: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(QUOTE.exec(lines[i])![1]);
        i++;
      }
      // A plain line straight after a quote is still the quote — GFM's lazy continuation.
      while (i < lines.length && lines[i].trim() && !startsBlock(lines[i]) && !MARKER.test(lines[i])) {
        inner.push(lines[i]);
        i++;
      }
      blocks.push({ kind: "quote", blocks: parseBlocks(inner) });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const table = readTable(lines, i);
      if (table) {
        flushParagraph();
        blocks.push(table.block);
        i = table.next;
        continue;
      }
    }

    if (MARKER.test(line)) {
      flushParagraph();
      const list = readList(lines, i);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    paragraph.push(line);
    i++;
  }

  flushParagraph();
  return blocks;
}

/** Reads the document body into the block list the renderer walks. */
export function toBlocks(body: string): Block[] {
  // A leading tab indents like four spaces so nesting reads the same either way.
  const lines = body
    .replace(/\r\n/g, "\n")
    .replace(/^\t+/gm, (tabs) => "    ".repeat(tabs.length))
    .split("\n");
  return parseBlocks(lines);
}
