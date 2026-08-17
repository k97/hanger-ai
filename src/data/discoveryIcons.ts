/**
 * Real favicons/avatars for Discovery entries, bundled at build time — same
 * "nothing fetched at runtime" rule as brands.ts. Keyed by Directory.mark.
 *
 * Not every mark has a file here: a handful of sites have no usable icon
 * (no favicon at all, or artwork that has no backdrop of its own and
 * disappears against --page in one theme) and fall back to the plain
 * monogram in DiscoveryPane instead of showing nothing or something broken.
 */
const modules = import.meta.glob("../assets/discovery/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

export const DISCOVERY_ICONS: Record<string, string> = Object.fromEntries(
  Object.entries(modules).map(([path, url]) => [path.match(/([^/]+)\.png$/)![1], url]),
);
