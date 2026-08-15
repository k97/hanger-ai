// Camera math for the link map: fit, anchored zoom, clamped pan. Pure and
// windowless like the layout — the camera is view state, but its arithmetic
// is deterministic, so it lives here where it can be unit-tested.
//
// Semantics: `x`/`y` are the WORLD coordinates of the viewport's top-left
// corner; `scale` is screen pixels per world unit. The SVG consumes this as
// a viewBox (viewBoxOf), so rendering needs no transforms.

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 3;

/** Padding, in screen pixels, that fit leaves around the content. */
const FIT_PADDING = 24;

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Half-window overscroll on every side, the Maps feel: the content can be
 *  pushed at most to the viewport's centre, never lost off-screen, and an
 *  anchored zoom away from the edges is never fought by the clamp. */
function clampPosition(cam: Camera, content: Size, viewport: Size): Camera {
  const worldW = viewport.width / cam.scale;
  const worldH = viewport.height / cam.scale;
  const clampAxis = (pos: number, world: number, extent: number): number =>
    Math.min(Math.max(pos, -world / 2), extent - world / 2);
  return {
    scale: cam.scale,
    x: clampAxis(cam.x, worldW, content.width),
    y: clampAxis(cam.y, worldH, content.height),
  };
}

/** The whole content, centred, with breathing room — the Fit button. */
export function fitCamera(content: Size, viewport: Size): Camera {
  const usableW = Math.max(1, viewport.width - FIT_PADDING * 2);
  const usableH = Math.max(1, viewport.height - FIT_PADDING * 2);
  const scale = clampScale(
    Math.min(usableW / content.width, usableH / content.height),
  );
  const worldW = viewport.width / scale;
  const worldH = viewport.height / scale;
  return {
    scale,
    x: (content.width - worldW) / 2,
    y: (content.height - worldH) / 2,
  };
}

/** Zoom by `factor`, keeping the world point under `anchor` (viewport px)
 *  exactly where it is — the Maps gesture. */
export function zoomAt(
  cam: Camera,
  factor: number,
  anchor: Point,
  content: Size,
  viewport: Size,
): Camera {
  const scale = clampScale(cam.scale * factor);
  const applied = scale / cam.scale;
  if (applied === 1) return clampPosition(cam, content, viewport);
  const worldAnchorX = cam.x + anchor.x / cam.scale;
  const worldAnchorY = cam.y + anchor.y / cam.scale;
  return clampPosition(
    {
      scale,
      x: worldAnchorX - anchor.x / scale,
      y: worldAnchorY - anchor.y / scale,
    },
    content,
    viewport,
  );
}

/** Pan by a screen-pixel delta. */
export function panBy(
  cam: Camera,
  dx: number,
  dy: number,
  content: Size,
  viewport: Size,
): Camera {
  return clampPosition(
    { scale: cam.scale, x: cam.x + dx / cam.scale, y: cam.y + dy / cam.scale },
    content,
    viewport,
  );
}

export function viewBoxOf(cam: Camera, viewport: Size): string {
  return `${cam.x} ${cam.y} ${viewport.width / cam.scale} ${viewport.height / cam.scale}`;
}

/** World → viewport pixels; what anchors popovers to what they describe. */
export function toViewport(world: Point, cam: Camera): Point {
  return { x: (world.x - cam.x) * cam.scale, y: (world.y - cam.y) * cam.scale };
}
