// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/** Exact class-token membership. `toContain("pt-1")` would also pass on
 *  `pt-1.5`, which is a different gap. */
const classes = (el: Element) => el.className.toString().split(/\s+/);

/** The pane's own padded wrapper. `CategoryFilterCards` puts a bare
 *  `<section className="font-sans select-none shrink-0">` between it and the
 *  track, so the track's parentElement is NOT the element under test. */
const paneWrapper = (track: Element) => track.closest('[class*="px-[18px]"]')!;
import ProfilePane from "../components/ProfilePane";
import RepoPane from "../components/RepoPane";
import IconRail from "../components/IconRail";

afterEach(cleanup);

/* A CLASS-CONTRACT GUARD, not a geometry test. happy-dom lays nothing out --
   every rect it returns is 0 -- so nothing here can see a pixel. What it
   pins is the three padding values whose sum is the gap, measured on the
   real window over the app's dev bridge (ws 9223, execute_js) on 2026-08-27:

                             before        after
     cap band            0 -> 40       0 -> 40    tallest control paints to 33.5
     track pill         54 -> 92      46 -> 84    first painted gap 20.5 -> 12.5
     summary strip     106 -> 291     98 -> 225   14 here, unchanged
     list plane        305 -> 670    239 -> 670   14 here, unchanged
     rail mark          42 -> 64      46 -> 68    now level with the track pill

   The cap is `h-10` (40px) around `h-[27px]` controls, so 6.5px of the band
   is unpainted -- and `pt-3.5` was measured from the band, not from the ink,
   which put the pane's first element 20.5px below the toolbar instead of the
   14px every gap below it uses.

   `pt-1.5` spends that slack and then some: 6 + 6.5 = 12.5. Karthik chose it
   over 14.5 (`pt-2`, which matches the 14px rhythm below) and 10.5 (`pt-1`),
   each rendered in the running app before the call. 12.5 is not the matching
   value and is not meant to be -- it is the one that lands the tab pill's
   top on the rail mark's, both at 46, and puts the content column on the
   rail's own 12px rhythm rather than on the pane's 14px one.

   The rail leans the other way off the same band: `mt-0.5` put the mark
   8.5px below the toolbar's ink where that rhythm is 12px (`my-[9px]` +
   `gap-[3px]`, mark->rule and rule->button, both measured at 12 on the live
   window). `mt-[6px]` makes it 12.5, the same number from the other side.

   Revert either value and this reddens; it cannot tell you the result looks
   right, which is why the fix also carries a screenshot. */

const emptyInventory = {
  agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [],
} as any;

describe("the shell's first gap under the cap", () => {
  it("opens ProfilePane at pt-1.5, so the cap's 6.5px of unpainted band is spent, not added", () => {
    render(
      <ProfilePane
        inventory={emptyInventory}
        loading={false}
        selectedCategory={null}
        onSelectAsset={vi.fn()}
        onLinkAsset={vi.fn()}
        onRescan={vi.fn()}
      />
    );
    const wrapper = paneWrapper(screen.getByRole("tablist"));
    expect(classes(wrapper)).toContain("pt-1.5");
    expect(classes(wrapper)).not.toContain("pt-3.5");
  });

  it("opens RepoPane at the same pt-1.5 -- the two panes share this track", () => {
    render(
      <RepoPane
        repoPath="/Users/test/Work"
        inventory={emptyInventory}
        loading={false}
        onRefresh={vi.fn()}
        onSelectAsset={vi.fn()}
        onLinkFromProfile={vi.fn()}
      />
    );
    const wrapper = paneWrapper(screen.getByRole("tablist"));
    expect(classes(wrapper)).toContain("pt-1.5");
    expect(classes(wrapper)).not.toContain("pt-3.5");
  });

  it("drops the rail's mark to mt-[6px], onto the rail's own 12px rhythm", () => {
    render(
      <IconRail
        active="machine"
        needsReviewCount={0}
        onSelectMachine={vi.fn()}
        onSelectLinkMap={vi.fn()}
        onSelectDiscovery={vi.fn()}
        onSelectReview={vi.fn()}
        onOpenSearch={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    const mark = screen.getByLabelText("Hanger");
    expect(classes(mark)).toContain("mt-[6px]");
    expect(classes(mark)).not.toContain("mt-0.5");
  });
});
