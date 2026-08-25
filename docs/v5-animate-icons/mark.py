#!/usr/bin/env python3
"""Print a ready-to-paste animated <svg> for any Lucide mark.

Geometry is read from the installed lucide-react (ISC, already a dependency),
so what you paste is the real mark, not an approximation. Run from the repo
root:

    python3 docs/v5-animate-icons/mark.py radar
    python3 docs/v5-animate-icons/mark.py folder-sync --motion spin --rest
    python3 docs/v5-animate-icons/mark.py check-check --size 40 --stagger
    python3 docs/v5-animate-icons/mark.py --list folder

Motions: spin, draw, lift, seek, breathe  (see _proto.css for what each does)

ORIGIN. A whole-mark rotate turns about the grid centre (12,12), which is the
default. A rotate applied to an off-centre SUB-GROUP must turn about that
group's own centre instead — pass --origin X,Y. Getting this wrong is
invisible at 0 and 360 degrees and obvious at 90; see 00-state-inventory.md
section 2.1.
"""
import argparse, json, os, re, sys

ICONS = "node_modules/lucide-react/dist/esm/icons"


def load(name):
    p = os.path.join(ICONS, name + ".js")
    if not os.path.exists(p):
        sys.exit(f"no such mark: {name}\n(looked in {ICONS}; try --list)")
    src = open(p).read()
    m = re.search(r'createLucideIcon\(\s*"[^"]+"\s*,\s*(\[.*\])\s*\)\s*;', src, re.S)
    if not m:
        sys.exit(f"could not parse {p}")
    body = re.sub(r'([{,]\s*)([A-Za-z_][\w-]*)(\s*:)', r'\1"\2"\3', m.group(1))
    body = re.sub(r',(\s*[\]}])', r'\1', body)
    return [(t, {k: v for k, v in a.items() if k != "key"}) for t, a in json.loads(body)]


def main():
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("name", nargs="?", help="lucide mark, e.g. disc-3")
    ap.add_argument("--size", type=int, default=40)
    ap.add_argument("--motion", default="draw",
                    choices=["spin", "draw", "lift", "seek", "breathe", "none"])
    ap.add_argument("--rest", action="store_true",
                    help="play once and hold (default is loop)")
    ap.add_argument("--stagger", action="store_true",
                    help="cascade the elements by 110ms each")
    ap.add_argument("--only", default="",
                    help="comma-separated element indices that move, e.g. 1,3")
    ap.add_argument("--origin", default="",
                    help="rotation origin as X,Y in grid units, e.g. 17,16")
    ap.add_argument("--list", metavar="SUBSTR", nargs="?", const="",
                    help="list available marks matching SUBSTR")
    a = ap.parse_args()

    if a.list is not None:
        names = sorted(f[:-3] for f in os.listdir(ICONS) if f.endswith(".js"))
        hits = [n for n in names if a.list in n]
        print(f"{len(hits)} of {len(names)} marks")
        for i in range(0, len(hits), 4):
            print("  " + "".join(x.ljust(26) for x in hits[i:i + 4]))
        return

    if not a.name:
        ap.print_help()
        return

    els = load(a.name)
    idx = ([int(x) for x in a.only.split(",")] if a.only else list(range(len(els))))
    if a.motion == "none":
        idx = []

    cls = f"aim-{a.motion} " + ("aim-once" if a.rest else "aim-loop")
    if a.stagger:
        cls += " aim-stagger"
    needs_len = a.stagger or a.motion == "draw"

    static, moving = [], []
    for i, (tag, at) in enumerate(els):
        s = " ".join(f'{k}="{v}"' for k, v in at.items())
        if i in idx:
            if needs_len:
                s += ' pathLength="1"'
            if a.stagger:
                s += f' style="--i:{idx.index(i)}"'
            moving.append(f"  <{tag} {s}/>")
        else:
            static.append(f"<{tag} {s}/>")

    out = [f'<svg class="aim" width="{a.size}" height="{a.size}" '
           f'viewBox="0 0 24 24" aria-hidden="true">']
    out += ["  " + s for s in static]
    if moving:
        o = ""
        if a.origin:
            x, y = a.origin.split(",")
            o = f' style="--ox:{x.strip()}px;--oy:{y.strip()}px"'
        out.append(f'  <g class="{cls}"{o}>')
        out += ["  " + m for m in moving]
        out.append("  </g>")
    out.append("</svg>")
    print("\n".join(out))

    if a.motion == "spin" and a.only and not a.origin:
        print("\n# NOTE: rotating a sub-group without --origin turns it about the",
              "\n#       grid centre (12,12). If those elements are off-centre that",
              "\n#       is wrong — measure their bbox centre and pass --origin.",
              file=sys.stderr)


if __name__ == "__main__":
    main()
