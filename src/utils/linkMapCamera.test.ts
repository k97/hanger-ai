// Pure camera math for the link map's zoom and pan. No DOM, no window —
// the same discipline as the layout: identical inputs, identical camera.
import { describe, it, expect } from "vitest";
import {
  fitCamera,
  zoomAt,
  panBy,
  viewBoxOf,
  toViewport,
  MIN_SCALE,
  MAX_SCALE,
  type Camera,
} from "./linkMapCamera";

const content = { width: 880, height: 470 };
const viewport = { width: 1100, height: 520 };

describe("linkMapCamera", () => {
  it("fit shows the whole content, centred, and twice the same", () => {
    const a = fitCamera(content, viewport);
    const b = fitCamera(content, viewport);
    expect(a).toEqual(b);

    // Everything visible: the world window is at least the content size.
    expect(viewport.width / a.scale).toBeGreaterThanOrEqual(content.width);
    expect(viewport.height / a.scale).toBeGreaterThanOrEqual(content.height);

    // Centred: equal margins on the axis with slack.
    const worldW = viewport.width / a.scale;
    expect(a.x).toBeCloseTo((content.width - worldW) / 2, 5);
  });

  it("zoomAt keeps the world point under the cursor stationary", () => {
    const start = fitCamera(content, viewport);
    const cursor = { x: 300, y: 200 };

    // The world point under the cursor before the zoom…
    const worldBefore = {
      x: start.x + cursor.x / start.scale,
      y: start.y + cursor.y / start.scale,
    };

    const zoomed = zoomAt(start, 1.5, cursor, content, viewport);
    const screenAfter = toViewport(worldBefore, zoomed);

    // …is still under the cursor after it.
    expect(screenAfter.x).toBeCloseTo(cursor.x, 3);
    expect(screenAfter.y).toBeCloseTo(cursor.y, 3);
    expect(zoomed.scale).toBeCloseTo(start.scale * 1.5, 5);
  });

  it("clamps scale to the published range", () => {
    const start = fitCamera(content, viewport);
    const tiny = zoomAt(start, 0.0001, { x: 0, y: 0 }, content, viewport);
    const huge = zoomAt(tiny, 100000, { x: 0, y: 0 }, content, viewport);
    expect(tiny.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    expect(huge.scale).toBeLessThanOrEqual(MAX_SCALE);
  });

  it("pan cannot lose the content entirely", () => {
    let cam = zoomAt(fitCamera(content, viewport), 2, { x: 550, y: 260 }, content, viewport);
    for (let i = 0; i < 50; i++) {
      cam = panBy(cam, 10000, 10000, content, viewport);
    }
    // The world window still overlaps the content.
    expect(cam.x).toBeLessThanOrEqual(content.width);
    expect(cam.y).toBeLessThanOrEqual(content.height);

    for (let i = 0; i < 50; i++) {
      cam = panBy(cam, -10000, -10000, content, viewport);
    }
    expect(cam.x + viewport.width / cam.scale).toBeGreaterThanOrEqual(0);
    expect(cam.y + viewport.height / cam.scale).toBeGreaterThanOrEqual(0);
  });

  it("viewBox is the camera window in world units", () => {
    const cam: Camera = { x: 10, y: 20, scale: 2 };
    expect(viewBoxOf(cam, viewport)).toBe(`10 20 ${1100 / 2} ${520 / 2}`);
  });
});
