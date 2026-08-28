import { type ReactNode } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Align, Block, ListItem, Span } from "../utils/skillDocument";
import { CheckIcon } from "./icons";
import { captionClass, sectionHeadClass } from "./typeRoles";

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
        if (span.break) return <br key={i} />;
        // Roles nest from the inside out, so `**a \`b\` c**` keeps its code
        // mono inside the weight.
        let node: ReactNode = span.text;
        if (span.code) {
          node = (
            <code className="font-mono text-small bg-plane px-1.5 py-0.5 rounded-[6px] text-ink-1">{node}</code>
          );
        }
        if (span.strong) node = <strong className="font-medium text-ink-1">{node}</strong>;
        if (span.em) node = <em className="italic">{node}</em>;
        if (span.strike) node = <s className="line-through">{node}</s>;
        if (span.href) {
          const href = span.href;
          node = (
            <button
              onClick={() => openUrl(href).catch(() => {})}
              title={href}
              className="underline underline-offset-2 text-ink-1 cursor-pointer hover:text-ink-2 transition-colors duration-hover"
            >
              {node}
            </button>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

function alignClass(align: Align): string {
  return align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
}

/** A task item's box. It reports state and takes no input: the file is the source of truth. */
function TaskBox({ checked }: { checked: boolean }) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      aria-disabled="true"
      className={`inline-grid place-items-center w-[14px] h-[14px] -ml-[18px] mr-[4px] relative top-[2px] rounded-[6px] border ${
        checked ? "bg-fill border-fill text-on-fill" : "border-line-2"
      }`}
    >
      {checked && <CheckIcon size={10} aria-hidden="true" />}
    </span>
  );
}

function Item({ item }: { item: ListItem }) {
  return (
    <li className={item.checked === undefined ? "mb-[5px]" : "mb-[5px] list-none"}>
      {item.checked !== undefined && <TaskBox checked={item.checked} />}
      <Spans spans={item.spans} />
      {item.children && <Blocks blocks={item.children} nested />}
    </li>
  );
}

function Blocks({ blocks, nested = false }: { blocks: Block[]; nested?: boolean }) {
  return (
    <>
      {blocks.map((block, i) => {
        if (block.kind === "heading") {
          // The panel has one title already, so a document's # and ## sit a
          // step below it, and ### and deeper a step below those — two sizes,
          // both already on the scale.
          const top = i === 0 ? "" : block.level <= 2 ? "mt-4" : "mt-3.5";
          return block.level <= 2 ? (
            <h3 key={i} className={`text-lg-app font-medium text-ink-1 mb-1.5 ${top}`}>
              <Spans spans={block.spans} />
            </h3>
          ) : (
            <h4 key={i} className={`${sectionHeadClass} mb-1 ${top}`}>
              <Spans spans={block.spans} />
            </h4>
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
          const items = block.items.map((item, j) => <Item key={j} item={item} />);
          const spacing = nested ? "mt-[5px]" : "mb-2.5";
          return block.ordered ? (
            <ol key={i} className={`list-decimal ml-[18px] ${spacing}`}>
              {items}
            </ol>
          ) : (
            <ul key={i} className={`list-disc ml-[18px] ${spacing}`}>
              {items}
            </ul>
          );
        }
        if (block.kind === "table") {
          return (
            <div key={i} className="my-2.5 overflow-x-auto">
              <table className="w-full border-collapse text-base-app leading-body">
                <thead>
                  <tr>
                    {block.header.map((cell, c) => (
                      <th
                        key={c}
                        className={`px-2.5 first:pl-0 py-1.5 border-b border-line-2 font-medium text-ink-1 align-top ${alignClass(block.align[c])}`}
                      >
                        <Spans spans={cell} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => (
                        <td
                          key={c}
                          className={`px-2.5 first:pl-0 py-1.5 border-b border-line align-top ${alignClass(block.align[c])}`}
                        >
                          <Spans spans={cell} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (block.kind === "quote") {
          return (
            <blockquote key={i} className="my-2.5 pl-3 border-l-2 border-line-2 text-ink-2 [&>:last-child]:mb-0">
              <Blocks blocks={block.blocks} nested />
            </blockquote>
          );
        }
        if (block.kind === "rule") {
          return <hr key={i} className="my-3.5 border-0 border-t border-line" />;
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
      <Blocks blocks={blocks} />
    </div>
  );
}
