import { describe, it, expect } from "vitest";
import {
  documentKindFor,
  formatJson,
  parseSkillDocument,
  SPEC_FIELDS,
  toBlocks,
} from "./skillDocument";

describe("parseSkillDocument — frontmatter", () => {
  it("splits YAML frontmatter from the body", () => {
    const doc = parseSkillDocument(
      ["---", "name: agent-browser", "description: Drives Chromium over CDP.", "---", "", "# Heading", "Body text."].join("\n")
    );
    expect(doc.frontmatter.name).toBe("agent-browser");
    expect(doc.frontmatter.description).toBe("Drives Chromium over CDP.");
    expect(doc.body.trim()).toBe("# Heading\nBody text.");
  });

  it("treats a file with no frontmatter as all body", () => {
    const doc = parseSkillDocument("# Just a document\n\nNo front matter here.");
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toContain("Just a document");
  });

  it("does not mistake a horizontal rule further down for frontmatter", () => {
    const doc = parseSkillDocument("Some prose.\n\n---\n\nMore prose.");
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toContain("More prose.");
  });

  it("reads a list value written inline or as a block", () => {
    const doc = parseSkillDocument(
      ["---", "name: x", "allowed-tools: [Read, Write]", "tags:", "  - testing", "  - review", "---", "body"].join("\n")
    );
    expect(doc.frontmatter["allowed-tools"]).toEqual(["Read", "Write"]);
    expect(doc.frontmatter.tags).toEqual(["testing", "review"]);
  });

  it("strips quotes from a quoted scalar", () => {
    const doc = parseSkillDocument(['---', 'description: "A thing, with a comma"', "---", ""].join("\n"));
    expect(doc.frontmatter.description).toBe("A thing, with a comma");
  });

  it("keeps a colon inside a value", () => {
    const doc = parseSkillDocument(["---", "description: Use when: the page needs JS", "---", ""].join("\n"));
    expect(doc.frontmatter.description).toBe("Use when: the page needs JS");
  });

  it("survives an unterminated frontmatter block rather than eating the file", () => {
    const doc = parseSkillDocument("---\nname: x\nno closing fence\nstill going");
    expect(doc.frontmatter).toEqual({});
    expect(doc.body).toContain("no closing fence");
  });

  it("knows which keys the Agent Skills standard defines", () => {
    // Everything else is a runtime extension — the panel labels them as such.
    expect(SPEC_FIELDS).toContain("name");
    expect(SPEC_FIELDS).toContain("description");
    expect(SPEC_FIELDS).toContain("license");
    expect(SPEC_FIELDS).toContain("compatibility");
    expect(SPEC_FIELDS).toContain("metadata");
    expect(SPEC_FIELDS).toContain("allowed-tools");
    expect(SPEC_FIELDS).not.toContain("version");
  });
});

describe("documentKindFor — how each kind of asset should be shown", () => {
  it("reads prose kinds as prose", () => {
    for (const kind of ["Skills", "Rules", "Subagents"]) {
      expect(documentKindFor(kind), kind).toBe("markdown");
    }
  });

  it("reads a tool as the config entry it is", () => {
    expect(documentKindFor("Tools")).toBe("json");
  });

  it("offers no document for an agent, which has no file of its own", () => {
    expect(documentKindFor("Agents")).toBe("none");
  });
});

describe("formatJson", () => {
  it("re-indents a config so it reads as structure", () => {
    expect(formatJson('{"a":{"b":1}}')).toBe('{\n  "a": {\n    "b": 1\n  }\n}');
  });

  it("returns nothing for text that is not JSON, rather than throwing", () => {
    // A config mid-edit is a real state, not an error to surface.
    expect(formatJson("{ not json")).toBeNull();
    expect(formatJson("")).toBeNull();
  });
});

describe("toBlocks — the document subset a SKILL.md actually uses", () => {
  it("reads headings at each level", () => {
    expect(toBlocks("# One\n## Two\n### Three")).toEqual([
      { kind: "heading", level: 1, spans: [{ text: "One" }] },
      { kind: "heading", level: 2, spans: [{ text: "Two" }] },
      { kind: "heading", level: 3, spans: [{ text: "Three" }] },
    ]);
  });

  it("joins wrapped lines into one paragraph and breaks on a blank line", () => {
    const blocks = toBlocks("first line\nsecond line\n\nnew paragraph");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ kind: "paragraph", spans: [{ text: "first line second line" }] });
    expect(blocks[1]).toEqual({ kind: "paragraph", spans: [{ text: "new paragraph" }] });
  });

  it("groups consecutive bullets into one list", () => {
    const blocks = toBlocks("- one\n- two\n* three");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      kind: "list",
      ordered: false,
      items: [[{ text: "one" }], [{ text: "two" }], [{ text: "three" }]],
    });
  });

  it("reads an ordered list as ordered", () => {
    const blocks = toBlocks("1. first\n2. second");
    expect(blocks[0]).toEqual({
      kind: "list",
      ordered: true,
      items: [[{ text: "first" }], [{ text: "second" }]],
    });
  });

  it("keeps a fenced block verbatim, including its blank lines and markup", () => {
    const blocks = toBlocks(["```bash", "npx skills add x", "", "# not a heading in here", "```"].join("\n"));
    expect(blocks).toEqual([
      { kind: "code", language: "bash", text: "npx skills add x\n\n# not a heading in here" },
    ]);
  });

  it("closes an unterminated fence at the end of the file", () => {
    const blocks = toBlocks("```\nstill open");
    expect(blocks).toEqual([{ kind: "code", language: "", text: "still open" }]);
  });

  it("marks inline code, bold and links as spans rather than flattening them", () => {
    const [block] = toBlocks("Run `bun test`, read **this**, see [the spec](https://agentskills.io).");
    expect(block).toEqual({
      kind: "paragraph",
      spans: [
        { text: "Run " },
        { text: "bun test", code: true },
        { text: ", read " },
        { text: "this", strong: true },
        { text: ", see " },
        { text: "the spec", href: "https://agentskills.io" },
        { text: "." },
      ],
    });
  });

  it("reads *single-asterisk* emphasis, and still prefers **bold** over it", () => {
    const [block] = toBlocks("a *soft* word, a **hard** one, and 2 * 3 math.");
    expect(block).toEqual({
      kind: "paragraph",
      spans: [
        { text: "a " },
        { text: "soft", em: true },
        { text: " word, a " },
        { text: "hard", strong: true },
        { text: " one, and 2 * 3 math." },
      ],
    });
  });

  it("only accepts http and https links, so no other scheme can ride in", () => {
    for (const url of ["javascript:void(0)", "data:text/html,<script>", "file:///etc/passwd"]) {
      const [block] = toBlocks(`[click](${url})`);
      const spans = (block as { spans: { text: string; href?: string }[] }).spans;
      // The label survives as text; the destination does not survive at all.
      expect(spans.some((span) => span.href), url).toBe(false);
      expect(spans.map((span) => span.text).join("")).toContain("click");
    }
  });

  it("returns nothing for an empty document", () => {
    expect(toBlocks("")).toEqual([]);
    expect(toBlocks("   \n\n  ")).toEqual([]);
  });
});
