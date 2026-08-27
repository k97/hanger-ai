// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

/** Exact class-token membership. `toContain("pt-2")` would also pass on
 *  `pt-2.5`, which is a different gap. */
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

     cap band            0 -> 40      its tallest control paints to 33.5
     track pill         54 -> 92      first painted gap 20.5, against
     summary strip     106 -> 291     14 here and
     list plane        305 -> 670     14 here.

   The cap is `h-10` (40px) around `h-[27px]` controls, so 6.5px of the band
   is unpainted -- and `pt-3.5` was measured from the band, not from the ink,
   which put the pane's first element 20.5px below the toolbar instead of the
   14px every gap below it uses. `pt-2` spends that slack: 6.5 + 8 = 14.5.

   The rail leans the other way off the same band: `mt-0.5` put the mark
   8.5px below the toolbar's ink where the rail's own rhythm is 12px
   (`my-[9px]` + `gap-[3px]`, mark->rule and rule->button, both measured at
   12 on the live window). `mt-[6px]` makes it 12.5.

   Revert either value and this reddens; it cannot tell you the result looks
   right, which is why the fix also carries a screenshot. */

const emptyInventory = {
  agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [],
} as any;

describe("the shell's first gap under the cap", () => {
  it("opens ProfilePane at pt-2, so the cap's 6.5px of unpainted band is spent, not added", () => {
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
    expect(classes(wrapper)).toContain("pt-2");
    expect(classes(wrapper)).not.toContain("pt-3.5");
  });

  it("opens RepoPane at the same pt-2 -- the two panes share this track", () => {
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
    expect(classes(wrapper)).toContain("pt-2");
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
        onOpenSettings={vi.fn()}
      />
    );
    const mark = screen.getByLabelText("Hanger");
    expect(classes(mark)).toContain("mt-[6px]");
    expect(classes(mark)).not.toContain("mt-0.5");
  });
});
