// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType } from "react";
import {
  ArchiveBoxIcon,
  ArrowDownTrayIcon,
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  ChatBubbleOvalLeftIcon,
  ClockIcon,
  CodeBracketIcon,
  CpuChipIcon,
  DocumentIcon,
  EllipsisVerticalIcon,
  GaugeIcon,
  KeyIcon,
  PencilSquareIcon,
  SignalIcon,
  SkillIcon,
  TagIcon,
} from "../components/icons";
import {
  ArchiveBoxIcon as HeroArchiveBox,
  ArrowDownTrayIcon as HeroArrowDownTray,
  ArrowPathRoundedSquareIcon as HeroArrowPathRoundedSquare,
  ArrowsRightLeftIcon as HeroArrowsRightLeft,
  ChatBubbleOvalLeftIcon as HeroChatBubbleOvalLeft,
  ClockIcon as HeroClock,
  CodeBracketIcon as HeroCodeBracket,
  CpuChipIcon as HeroCpuChip,
  DocumentIcon as HeroDocument,
  EllipsisVerticalIcon as HeroEllipsisVertical,
  KeyIcon as HeroKey,
  PencilSquareIcon as HeroPencilSquare,
  SignalIcon as HeroSignal,
  TagIcon as HeroTag,
} from "@heroicons/react/24/outline";

/**
 * These tests used to assert only `viewBox`, `width` and `stroke-width` — every
 * one of which is supplied by the `sized` wrapper, not by the mark inside it.
 * So they passed against ANY Heroicons outline mark on the 24 grid: swapping
 * `ArchiveBoxIcon` for `DocumentIcon` changed nothing they could see.
 *
 * Identity is the `d` attributes, and `sized` passes them through untouched
 * (its optical correction is a transform, not a path rewrite). Comparing each
 * export against the Heroicons mark it claims to wrap pins identity WITHOUT
 * hardcoding path data here, so a Heroicons version bump moves both sides
 * together instead of failing spuriously.
 */
const pathData = (html: string) => Array.from(html.matchAll(/\sd="([^"]+)"/g)).map((m) => m[1]);

const WRAPPED: Array<[string, ComponentType<{ size?: number }>, ComponentType]> = [
  ["ArchiveBoxIcon", ArchiveBoxIcon, HeroArchiveBox],
  ["ArrowDownTrayIcon", ArrowDownTrayIcon, HeroArrowDownTray],
  ["ArrowPathRoundedSquareIcon", ArrowPathRoundedSquareIcon, HeroArrowPathRoundedSquare],
  ["ArrowsRightLeftIcon", ArrowsRightLeftIcon, HeroArrowsRightLeft],
  ["ChatBubbleOvalLeftIcon", ChatBubbleOvalLeftIcon, HeroChatBubbleOvalLeft],
  ["ClockIcon", ClockIcon, HeroClock],
  ["CodeBracketIcon", CodeBracketIcon, HeroCodeBracket],
  ["CpuChipIcon", CpuChipIcon, HeroCpuChip],
  ["DocumentIcon", DocumentIcon, HeroDocument],
  ["KeyIcon", KeyIcon, HeroKey],
  ["PencilSquareIcon", PencilSquareIcon, HeroPencilSquare],
  ["SignalIcon", SignalIcon, HeroSignal],
  ["TagIcon", TagIcon, HeroTag],
];

describe("v4 marks", () => {
  it("each wrapped export draws the Heroicons mark it names, not merely some mark", () => {
    const wrong: string[] = [];
    for (const [name, Ours, Hero] of WRAPPED) {
      const ours = pathData(renderToStaticMarkup(<Ours size={14} />));
      const hero = pathData(renderToStaticMarkup(<Hero />));
      // A mark that inked nothing would compare equal to another that inked
      // nothing, so an empty render is its own failure.
      if (ours.length === 0) wrong.push(`${name}: renders no path data at all`);
      else if (JSON.stringify(ours) !== JSON.stringify(hero)) {
        wrong.push(`${name}: draws ${JSON.stringify(ours[0]).slice(0, 60)}…, expected the Heroicons mark of the same name`);
      }
    }
    expect(wrong, `Marks drawing the wrong glyph:\n${wrong.join("\n")}`).toEqual([]);
  });

  it("no two wrapped exports are the same glyph", () => {
    // The check above compares each export against its own twin, so a global
    // rename that swapped a PAIR consistently would satisfy it. Distinctness
    // is the second half.
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const [name, Ours] of WRAPPED) {
      const key = JSON.stringify(pathData(renderToStaticMarkup(<Ours size={14} />)));
      const prior = seen.get(key);
      if (prior) collisions.push(`${prior} and ${name} draw the same glyph`);
      else seen.set(key, name);
    }
    expect(collisions).toEqual([]);
  });

  it("the sized wrapper puts every mark on the 24 grid, stroke-compensated at 14px", () => {
    for (const [name, Ours] of WRAPPED) {
      const html = renderToStaticMarkup(<Ours size={14} />);
      expect(html, name).toContain('viewBox="0 0 24 24"');
      expect(html, name).toContain('width="14"');
      // strokeFor(14) is 1.9 (icons.tsx:76-81)
      expect(html, name).toContain('stroke-width="1.9"');
    }
  });

  it("EllipsisVerticalIcon carries an optical factor — its painted box outgrows its nominal size", () => {
    // Heroicons draws ⋮ as three r=0.75 dots (56% ink extent of the 24 grid)
    // against the 75% of the lucide panel-toggle marks it sits beside in the
    // inspector cap; without a correction it renders a plain 15px box like
    // any unfactored mark and reads visibly smaller next to them.
    const html = renderToStaticMarkup(<EllipsisVerticalIcon size={15} />);
    expect(html).toContain('width="19.95"');
    expect(html).toContain('height="19.95"');
    // strokeFor(19.95) is 1.7 (icons.tsx:99-103) — the box crossed the
    // 16px band, so the stroke thins a step even as the box grows.
    expect(html).toContain('stroke-width="1.7"');
    // Still the Heroicons ellipsis mark itself, not a substitute.
    expect(pathData(html)).toEqual(pathData(renderToStaticMarkup(<HeroEllipsisVertical />)));
  });

  it("SkillIcon is the hand-drawn document-with-sparkle, all three strokes", () => {
    const paths = pathData(renderToStaticMarkup(<SkillIcon size={14} />));
    const html = renderToStaticMarkup(<SkillIcon size={14} />);
    expect(html).toContain('viewBox="0 0 24 24"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="1.9"');
    // The document body and its two rules were unasserted: only the sparkle
    // was checked, so a SkillIcon that lost its page still passed.
    expect(paths[0]).toContain("M14.5 4.25H7A2.25 2.25 0 004.75 6.5v12.25");
    expect(paths[1]).toBe("M8.5 12.5h6.5M8.5 16.25h4");
    // The sparkle is what makes it a skill and not a document.
    expect(paths[2]).toContain("M18.25 2.75c.45 1.85 1.15 2.55 3 3");
    // And it is not simply Heroicons' document.
    expect(paths).not.toEqual(pathData(renderToStaticMarkup(<HeroDocument />)));
  });

  it("GaugeIcon is the hand-drawn dial: an arc and a needle, no reading", () => {
    const html = renderToStaticMarkup(<GaugeIcon size={14} />);
    expect(html).toContain("M4.9 17.2a7.5 7.5 0 1 1 14.2 0");
    expect(html).toContain("M12 14.8l4.2-4.2");
    expect(html).toContain('stroke-width="1.9"');
  });
});
