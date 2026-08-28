import { openUrl } from "@tauri-apps/plugin-opener";
import type { Block, Span } from "../utils/skillDocument";
import { captionClass } from "./typeRoles";

/**
 * Renders the parsed document.
 *
 * Every node here is a React element built from plain data — no HTML string is
 * ever produced — so a document cannot introduce markup whatever it contains.
 * The parser has already refused any link scheme other than http(s).
 */

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, i) => {
        if (span.code) {
          return (
            <code
              key={i}
              className="font-mono text-small bg-plane px-1.5 py-0.5 rounded-[6px] text-ink-1"
            >
              {span.text}
            </code>
          );
        }
        if (span.href) {
          const href = span.href;
          return (
            <button
              key={i}
              onClick={() => openUrl(href).catch(() => {})}
              title={href}
              className="underline underline-offset-2 text-ink-1 cursor-pointer hover:text-ink-2 transition-colors duration-hover"
            >
              {span.text}
            </button>
          );
        }
        if (span.strong) {
          return (
            <strong key={i} className="font-medium text-ink-1">
              {span.text}
            </strong>
          );
        }
        if (span.em) {
          return (
            <em key={i} className="italic">
              {span.text}
            </em>
          );
        }
        return <span key={i}>{span.text}</span>;
      })}
    </>
  );
}

export default function MarkdownDoc({ blocks }: { blocks: Block[] }) {
  if (blocks.length === 0) {
    return (
      <p className={`px-[18px] py-3 ${captionClass}`}>
        This file has no body beyond its front matter.
      </p>
    );
  }

  return (
    <div className="px-[18px] pt-3 pb-[18px] text-base-app text-ink-1 leading-body">
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          // The panel has one title already, so every heading in the document
          // sits a step below it rather than competing with it.
          return (
            <h3
              key={i}
              className={`text-lg-app font-medium text-ink-1 mb-1.5 ${i === 0 ? "" : "mt-4"}`}
            >
              <Spans spans={block.spans} />
            </h3>
          );
        }
        if (block.kind === "paragraph") {
          return (
            <p key={i} className="mb-2.5">
              <Spans spans={block.spans} />
            </p>
          );
        }
        if (block.kind === "list") {
          const items = block.items.map((spans, j) => (
            <li key={j} className="mb-[5px]">
              <Spans spans={spans} />
            </li>
          ));
          return block.ordered ? (
            <ol key={i} className="list-decimal ml-[18px] mb-2.5">
              {items}
            </ol>
          ) : (
            <ul key={i} className="list-disc ml-[18px] mb-2.5">
              {items}
            </ul>
          );
        }
        return (
          <pre
            key={i}
            className="my-2 px-3 py-2.5 bg-plane rounded-inner overflow-x-auto overflow-y-hidden font-mono text-small text-ink-1 leading-code whitespace-pre"
          >
            <code>{block.text}</code>
          </pre>
        );
      })}
    </div>
  );
}
