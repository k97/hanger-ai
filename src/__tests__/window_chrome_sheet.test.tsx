// @vitest-environment happy-dom
/** The window chrome as a band and a sheet.
 *
 *  The 40px cap band runs the full width of the window in the sidebar's
 *  material — the shell root carries `cap-band`, whose gradient starts at
 *  `--sidebar` so the rail column's own paint and the band agree — and the
 *  content columns paint their `--page` ground as a sheet that begins
 *  *below* the band, not behind it. The sheet rounds its top-left corner and
 *  draws its left edge only on whichever column comes first after the icon
 *  rail: the source list when it is open (SourceListShell already does
 *  this), otherwise <main>, and when <main> is `hidden` behind an expanded
 *  inspector, the inspector.
 *
 *  Since 2026-08-29 the same treatment is mirrored at the window's right
 *  edge: whichever column ends the window — the inspector whenever it
 *  renders, otherwise <main>, never the source list — draws the sheet's
 *  right edge and its top-right corner. Karthik: "follow the same aspect of
 *  how we did it before."
 *
 *  happy-dom lays nothing out, so this pins the class contract only; the
 *  corner actually meeting the rail, and the traffic lights sitting on the
 *  band's baseline, are screenshot claims (verifying-ui.md). */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import App from "../App";

let mockPreferences: Record<string, string> = {};

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (cmd: string, args?: any) => {
    if (cmd === "get_preference") return mockPreferences[args?.key] ?? null;
    if (cmd === "set_preference") {
      if (args?.key) mockPreferences[args.key] = String(args.value);
      return null;
    }
    if (cmd === "get_linked_directories") return [];
    if (cmd === "get_asset_counts") return { total: 0, byCategory: {}, engines: {} };
    if (cmd === "get_inventory")
      return { agents: [], skills: [], tools: [], rules: [], subagents: [], project_scans: [] };
    if (cmd === "get_detected_engines" || cmd === "get_known_engines") return [];
    if (cmd === "get_asset_annotations") return [];
    if (cmd === "get_mcp_processes") return [];
    return null;
  }),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async () => () => {}),
}));

const classes = (el: Element | null) => (el?.className ?? "").toString().split(/\s+/).filter(Boolean);
const main = () => document.querySelector("main")!;
const aside = () => document.querySelector("aside")!;
const sheetOf = (column: Element) => column.querySelector(":scope > [data-testid$='-sheet']");
const screen_ready = async (which: string) => {
  if (which === "linkmap") await screen.findByText("Link map");
  else await screen.findByRole("button", { name: /toggle sidebar/i });
  // The pane itself mounts after the preferences resolve; wait for it.
  await waitFor(() => expect(main().querySelector(":scope > div.overflow-x-auto > div > *")).not.toBeNull());
};

beforeEach(() => {
  cleanup();
  mockPreferences = {
    onboarding_complete: "true",
    consent_crash: "true",
    consent_usage: "true",
    sidebar_collapsed: "false",
    selected_sidebar_item: "profile",
    inspector_open: "true",
  };
});
afterEach(cleanup);

describe("The cap band", () => {
  it("is one material: every column paints --sidebar and nothing paints it twice", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    // Each column's own ground is the sidebar tint; the content columns then
    // cover theirs below the cap with the sheet. The shell root paints
    // nothing, so no column ever stacks a second tint over a first — that
    // double tint was the seam at the rail's edge (Karthik, 2026-08-28).
    const root = main().parentElement!;
    expect(classes(root)).not.toContain("cap-band");
    expect(classes(root)).not.toContain("bg-sidebar");
    expect(classes(main())).toContain("bg-sidebar");
    expect(classes(document.querySelector("[data-rail-column]"))).toContain("bg-sidebar");
    const css = fs.readFileSync(path.join(__dirname, "../styles/index.css"), "utf8");
    expect(css).not.toMatch(/cap-band/);
    const tokens = fs.readFileSync(path.join(__dirname, "../styles/tokens.css"), "utf8");
    expect(tokens).not.toMatch(/--cap-band/);
  });
});

describe("The content sheet", () => {
  it("<main> paints its page ground as a sheet below the cap, not behind it", async () => {
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(classes(main())).not.toContain("bg-page");
    const sheet = sheetOf(main());
    expect(sheet, "<main> has no sheet child").not.toBeNull();
    for (const c of ["absolute", "top-9", "bottom-0", "bg-page", "border-t", "border-line", "-z-10"]) {
      expect(classes(sheet), `sheet is missing ${c}`).toContain(c);
    }
    // The sheet sits behind the column's content: the column isolates its
    // stacking so -z-10 stays inside it.
    expect(classes(main())).toContain("isolate");
  });

  it("<main>'s sheet squares its corner beside an open source list and rounds it when it leads", async () => {
    render(<App />);
    const toggle = await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(classes(sheetOf(main()))).not.toContain("rounded-tl-plane");
    expect(classes(sheetOf(main()))).not.toContain("border-l");

    fireEvent.click(toggle);
    expect(classes(sheetOf(main()))).toContain("rounded-tl-plane");
    expect(classes(sheetOf(main()))).toContain("border-l");
  });

  it("the inspector's sheet takes the corner when it is expanded over a collapsed source list", async () => {
    // The column renders on the review screen without waiting for a scan.
    mockPreferences.selected_sidebar_item = "review";
    mockPreferences.sidebar_collapsed = "true";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(classes(aside())).not.toContain("bg-page");
    expect(classes(aside())).toContain("bg-sidebar");
    expect(classes(aside())).toContain("isolate");
    // Beside <main>, the inspector's sheet starts one pixel in and keeps a
    // square corner; the column draws no border of its own (see "The
    // inspector's divider" below).
    expect(classes(aside())).not.toContain("border-l");
    expect(classes(sheetOf(aside()))).toContain("left-px");
    expect(classes(sheetOf(aside()))).not.toContain("rounded-tl-plane");

    fireEvent.click(await screen.findByRole("button", { name: "Expand inspector" }));
    expect(classes(main())).toContain("hidden");
    // Leading now: the corner and the left edge move to the sheet, which
    // starts at the column's own edge — no divider beside a rail.
    expect(classes(sheetOf(aside()))).toContain("rounded-tl-plane");
    expect(classes(sheetOf(aside()))).toContain("border-l");
    expect(classes(sheetOf(aside()))).toContain("left-0");
    expect(classes(sheetOf(aside()))).not.toContain("left-px");
    expect(classes(aside())).not.toContain("border-l");
    // And the body paints no ground over it: a full-bleed bg-page on the
    // inspector's root squared the corner off from inside on 2026-08-28,
    // the same way four panes had in <main>.
    const body = aside().querySelector(":scope > div.flex-1 > *");
    expect(body, "the inspector rendered no body").not.toBeNull();
    expect(classes(body), "the inspector body paints bg-page over the sheet").not.toContain("bg-page");
  });

  // Every screen carries the corner, not just My machine (Karthik, 2026-08-28:
  // "include this in every screen in the future unless explicitly requested
  // to be removed"). The sheet is <main>'s, so the class is there on every
  // screen by construction; what can hide it is a pane painting its own
  // full-bleed --page ground over the curve. Four did.
  for (const screen of ["profile", "linkmap", "discovery", "review", "design"]) {
    it(`${screen}: the sheet leads with the corner when the source list is collapsed, and the pane paints no ground over it`, async () => {
      mockPreferences.selected_sidebar_item = screen;
      mockPreferences.sidebar_collapsed = "true";
      render(<App />);
      await screen_ready(screen);
      expect(classes(sheetOf(main()))).toContain("rounded-tl-plane");
      const paneRoot = main().querySelector(":scope > div.overflow-x-auto > div > *");
      expect(paneRoot, `${screen} rendered no pane inside <main>`).not.toBeNull();
      expect(classes(paneRoot), `${screen}'s pane root paints bg-page over the sheet`).not.toContain("bg-page");
    });
  }

  // The window's right edge, mirrored from the left (Karthik, 2026-08-29:
  // "follow the same aspect of how we did it before"). Whichever column
  // ends the window draws the sheet's right edge and its top-right corner:
  // the inspector whenever it renders, otherwise <main>. Never the source
  // list — <main> or the expanded inspector always follows it.
  for (const screen of ["profile", "linkmap", "discovery", "review", "design"]) {
    it(`${screen}: <main> ends the window while the inspector is closed, so its sheet takes the right corner and the right edge`, async () => {
      mockPreferences.selected_sidebar_item = screen;
      mockPreferences.inspector_open = "false";
      render(<App />);
      await screen_ready(screen);
      expect(document.querySelector("aside"), "an inspector rendered with inspector_open false").toBeNull();
      expect(classes(sheetOf(main()))).toContain("rounded-tr-plane");
      expect(classes(sheetOf(main()))).toContain("border-r");
    });
  }

  it("the inspector ends the window when it renders: its sheet takes the right corner and <main>'s sheet gives it up", async () => {
    mockPreferences.selected_sidebar_item = "review";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(classes(sheetOf(aside()))).toContain("rounded-tr-plane");
    expect(classes(sheetOf(aside()))).toContain("border-r");
    expect(classes(sheetOf(main()))).not.toContain("rounded-tr-plane");
    expect(classes(sheetOf(main()))).not.toContain("border-r");
    // Beside an open source list the inspector's left corner stays square,
    // so its sheet carries the right corner alone.
    expect(classes(sheetOf(aside()))).not.toContain("rounded-tl-plane");

    fireEvent.click(await screen.findByRole("button", { name: "Expand inspector" }));
    expect(classes(main())).toContain("hidden");
    expect(classes(sheetOf(aside()))).toContain("rounded-tr-plane");
    expect(classes(sheetOf(aside()))).toContain("border-r");
  });

  it("expanded over a collapsed source list, the inspector's sheet carries both corners", async () => {
    mockPreferences.selected_sidebar_item = "review";
    mockPreferences.sidebar_collapsed = "true";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    fireEvent.click(await screen.findByRole("button", { name: "Expand inspector" }));
    for (const c of ["border-l", "rounded-tl-plane", "border-r", "rounded-tr-plane"]) {
      expect(classes(sheetOf(aside())), `the sheet is missing ${c}`).toContain(c);
    }
  });

  it("the expanded inspector beside an open source list keeps a square corner", async () => {
    mockPreferences.selected_sidebar_item = "review";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    fireEvent.click(await screen.findByRole("button", { name: "Expand inspector" }));
    expect(classes(main())).toContain("hidden");
    expect(classes(sheetOf(aside()))).not.toContain("rounded-tl-plane");
    expect(classes(sheetOf(aside()))).not.toContain("border-l");
    expect(classes(aside())).not.toContain("border-l");
    // ...and no divider either: the column's left edge is the source list's.
    expect(classes(sheetOf(aside()))).toContain("left-0");
  });
});

// The divider between <main> and the inspector is the band's own material,
// not a --line rule (Karthik, 2026-08-29: "match it to the menubar colour
// for both dark & light themes", and "I dont want that line to be apparent
// on the menubar"). The column paints --sidebar once; beside <main> its
// sheet starts one pixel in, so that pixel column shows the shell material
// continuing down from the cap band — the same value in either theme by
// construction, and nothing distinct where it crosses the band. A border on
// the column ran the full height through the band in --line.
describe("The inspector's divider", () => {
  it("beside <main>, the column draws no border; its sheet leaves the first pixel to the shell material", async () => {
    // The column renders on the review screen without waiting for a scan.
    mockPreferences.selected_sidebar_item = "review";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    expect(document.querySelector("aside"), "no inspector column rendered").not.toBeNull();
    expect(classes(aside())).not.toContain("border-l");
    expect(classes(aside())).not.toContain("border-line");
    const sheet = sheetOf(aside());
    expect(classes(sheet)).toContain("left-px");
    expect(classes(sheet)).toContain("right-0");
    expect(classes(sheet)).not.toContain("inset-x-0");
    expect(classes(sheet)).not.toContain("left-0");
    // <main>'s sheet is unchanged: flush to its column, no gap on its side.
    expect(classes(sheetOf(main()))).toContain("left-0");
    expect(classes(sheetOf(main()))).not.toContain("left-px");
  });

  it("the resize handle starts under the band, so its hover paint never crosses it", async () => {
    mockPreferences.selected_sidebar_item = "review";
    render(<App />);
    await screen.findByRole("button", { name: /toggle sidebar/i });
    const handle = screen.getByTestId("inspector-resize-handle");
    expect(classes(handle)).toContain("top-9");
    expect(classes(handle)).not.toContain("top-0");
  });
});
