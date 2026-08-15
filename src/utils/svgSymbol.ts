/**
 * A vendor SVG file becomes one `<symbol>` in the brand sprite.
 *
 * Kept: viewBox, root fill / fill-rule / clip-rule / stroke* (so a
 * currentColor mark stays currentColor through <use>), every child element.
 * Dropped: root width/height/style/xmlns, <title> (the wrapper carries
 * accessibility). Rewritten: every id and every reference to one, prefixed
 * `brand-{id}-` — the vendored files both use id="a", and in one sprite the
 * second would silently resolve to the first (spec §6.1).
 */
const ROOT_OPEN = /<svg\b([^>]*)>/i;
const ATTR = /([:\w-]+)="([^"]*)"/g;
const KEPT_ROOT_ATTRS = ["fill", "fill-rule", "clip-rule", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"];

export function prefixIds(markup: string, prefix: string): string {
  return markup
    .replace(/\bid="([^"]+)"/g, (_m, v: string) => `id="${prefix}${v}"`)
    .replace(/url\(#([^)]+)\)/g, (_m, v: string) => `url(#${prefix}${v})`)
    .replace(/\b(xlink:href|href)="#([^"]+)"/g, (_m, a: string, v: string) => `${a}="#${prefix}${v}"`);
}

export function toSymbol(id: string, raw: string): string {
  const open = ROOT_OPEN.exec(raw);
  if (!open) throw new Error(`toSymbol(${id}): no <svg> root`);
  const attrs: Record<string, string> = {};
  for (const m of open[1].matchAll(ATTR)) attrs[m[1]] = m[2];
  const viewBox = attrs["viewBox"];
  if (!viewBox) throw new Error(`toSymbol(${id}): root has no viewBox`);

  const bodyStart = raw.indexOf(">", open.index) + 1;
  const bodyEnd = raw.lastIndexOf("</svg>");
  if (bodyEnd < 0) throw new Error(`toSymbol(${id}): no </svg>`);
  const inner = prefixIds(
    raw.slice(bodyStart, bodyEnd).replace(/<title>[\s\S]*?<\/title>/g, ""),
    `brand-${id}-`,
  ).trim();

  const kept = KEPT_ROOT_ATTRS.filter((k) => attrs[k] !== undefined)
    .map((k) => ` ${k}="${attrs[k]}"`)
    .join("");
  return `<symbol id="brand-${id}" viewBox="${viewBox}"${kept}>${inner}</symbol>`;
}
