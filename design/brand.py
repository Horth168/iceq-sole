"""Export the IceQ Sole logo exactly as the store draws it (store/src/components/Logo.jsx).

- Mark: the hexagon "Q" (three stroked paths, 32x32 box, stroke 3, round caps/joins).
- Wordmark: "ICEQ" in Archivo (weight 900, width 125%, tracking -0.02em) and "SOLE" in Inter
  (weight 600, tracking 0.42em, 70% opacity), using the same variable fonts the site ships.
Letters are converted to outlines, so the SVGs need no fonts and scale to any size.

    backend/.venv/Scripts/python design/brand.py      (needs fonttools + brotli + Pillow)
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
FONTS = ROOT / "store" / "node_modules" / "@fontsource-variable"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "logo"

INK, WHITE, ACCENT, NIGHT = "#0A0A0B", "#FFFFFF", "#8FD6F5", "#0B0B0D"

# layout in CSS px, as on the site at sm+ (h-8 mark, gap-2.5, 21px ICEQ, gap-1.5, 12px SOLE)
MARK, GAP, ICEQ_PX, WORD_GAP, SOLE_PX = 32.0, 10.0, 21.0, 6.0, 12.0
MARK_PATHS = [  # (points, closed, colour key)
    ([(16, 2.6), (27.6, 9.3), (27.6, 22.7), (16, 29.4), (4.4, 22.7), (4.4, 9.3)], True, "ink"),
    ([(9.2, 20.6), (22.8, 20.6)], False, "accent"),
    ([(20.4, 23.4), (28.6, 30)], False, "ink"),
]
MARK_D = ["M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z", "M9.2 20.6h13.6", "M20.4 23.4 28.6 30"]


def font(name: str, axes: dict) -> TTFont:
    f = TTFont(FONTS / name)
    return instancer.instantiateVariableFont(f, axes)


class FlattenPen(BasePen):
    """Glyph outline -> list of polygons (curves split into short segments)."""
    def __init__(self, glyphset, steps=24):
        super().__init__(glyphset)
        self.contours, self.cur, self.steps = [], [], steps

    def _moveTo(self, p):
        self.cur = [p]

    def _lineTo(self, p):
        self.cur.append(p)

    def _curveToOne(self, p1, p2, p3):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            self.cur.append((mt**3 * p0[0] + 3 * mt * mt * t * p1[0] + 3 * mt * t * t * p2[0] + t**3 * p3[0],
                             mt**3 * p0[1] + 3 * mt * mt * t * p1[1] + 3 * mt * t * t * p2[1] + t**3 * p3[1]))

    def _qCurveToOne(self, p1, p2):
        p0 = self.cur[-1]
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            self.cur.append((mt * mt * p0[0] + 2 * mt * t * p1[0] + t * t * p2[0],
                             mt * mt * p0[1] + 2 * mt * t * p1[1] + t * t * p2[1]))

    def _closePath(self):
        if len(self.cur) > 2:
            self.contours.append(self.cur)
        self.cur = []

    _endPath = _closePath


def run(f: TTFont, text: str, px: float, tracking_em: float):
    """Glyph placements for a word: (glyph name, x offset px), total width px (no trailing tracking)."""
    cmap, hmtx, upm = f.getBestCmap(), f["hmtx"], f["head"].unitsPerEm
    s, x, out = px / upm, 0.0, []
    for i, ch in enumerate(text):
        g = cmap[ord(ch)]
        out.append((g, x))
        x += hmtx[g][0] * s + (tracking_em * px if i < len(text) - 1 else 0)
    return out, x, s


def cap_height(f: TTFont) -> float:
    os2 = f["OS/2"]
    return getattr(os2, "sCapHeight", 0) or f["head"].unitsPerEm * 0.7


def layout():
    archivo = font("archivo/files/archivo-latin-wdth-normal.woff2", {"wght": 900, "wdth": 125})
    inter = font("inter/files/inter-latin-wght-normal.woff2", {"wght": 600})
    iceq, iceq_w, s1 = run(archivo, "ICEQ", ICEQ_PX, -0.02)
    sole, sole_w, s2 = run(inter, "SOLE", SOLE_PX, 0.42)
    # optical centring: ICEQ's capital letters sit centred on the mark; SOLE shares the baseline
    baseline = MARK / 2 + cap_height(archivo) * s1 / 2
    x_iceq = MARK + GAP
    x_sole = x_iceq + iceq_w + WORD_GAP
    width = x_sole + sole_w
    words = [(archivo, iceq, x_iceq, s1, "ink", 1.0), (inter, sole, x_sole, s2, "ink", 0.7)]
    return words, width, baseline


def svg(words, width, baseline, colours, mark_only=False, pad=0.0, bg=None) -> str:
    w = MARK if mark_only else width
    h = MARK
    vb = f"{-pad} {-pad} {w + 2 * pad} {h + 2 * pad}"
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{(w + 2 * pad) * 16:g}" height="{(h + 2 * pad) * 16:g}">',
             "<title>IceQ Sole</title>"]
    if bg:
        parts.append(f'<rect x="{-pad}" y="{-pad}" width="{w + 2 * pad}" height="{h + 2 * pad}" fill="{bg}"/>')
    for d, (_, _, key) in zip(MARK_D, MARK_PATHS):
        cap = ' stroke-linecap="round"' if key == "accent" or d.startswith("M20") else ""
        parts.append(f'<path d="{d}" fill="none" stroke="{colours[key]}" stroke-width="3" stroke-linejoin="round"{cap}/>')
    if not mark_only:
        for f, glyphs, x0, s, key, op in words:
            gs = f.getGlyphSet()
            for g, x in glyphs:
                pen = SVGPathPen(gs)
                gs[g].draw(pen)
                d = pen.getCommands()
                if d:
                    o = f' fill-opacity="{op}"' if op < 1 else ""
                    parts.append(f'<path transform="translate({x0 + x:.3f} {baseline:.3f}) scale({s:.6f} {-s:.6f})" d="{d}" fill="{colours[key]}"{o}/>')
    parts.append("</svg>")
    return "\n".join(parts)


def hex_rgba(h: str, a: float = 1.0):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (int(round(a * 255)),)


def png(words, width, baseline, colours, scale: float, mark_only=False, pad=0.0, bg=None, ss=4) -> Image.Image:
    w = (MARK if mark_only else width) + 2 * pad
    h = MARK + 2 * pad
    k = scale * ss
    W, H = int(math.ceil(w * k)), int(math.ceil(h * k))
    img = Image.new("RGBA", (W, H), hex_rgba(bg) if bg else (0, 0, 0, 0))
    P = lambda x, y: ((x + pad) * k, (y + pad) * k)  # noqa: E731

    def stroke(points, closed, col):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        lw = 3 * k
        seq = points + ([points[0]] if closed else [])
        for a, b in zip(seq, seq[1:]):  # each segment as an exact rectangle (thick PIL lines are uneven)
            (ax, ay), (bx, by) = P(*a), P(*b)
            ln = math.hypot(bx - ax, by - ay) or 1
            nx, ny = -(by - ay) / ln * lw / 2, (bx - ax) / ln * lw / 2
            d.polygon([(ax + nx, ay + ny), (bx + nx, by + ny), (bx - nx, by - ny), (ax - nx, ay - ny)], fill=hex_rgba(col))
        for p in points:  # round joins and caps
            x, y = P(*p)
            r = lw / 2
            d.ellipse([x - r, y - r, x + r, y + r], fill=hex_rgba(col))
        img.alpha_composite(layer)

    for pts, closed, key in MARK_PATHS:
        stroke(pts, closed, colours[key])
    if not mark_only:
        for f, glyphs, x0, s, key, op in words:
            gs = f.getGlyphSet()
            for g, x in glyphs:
                pen = FlattenPen(gs)
                gs[g].draw(pen)
                mask = Image.new("1", (W, H), 0)
                for c in pen.contours:  # even-odd fill handles the holes in Q, O
                    cm = Image.new("1", (W, H), 0)
                    ImageDraw.Draw(cm).polygon([P(x0 + x + px * s, baseline - py * s) for px, py in c], fill=1)
                    mask = ImageChops.logical_xor(mask, cm)
                layer = Image.new("RGBA", (W, H), hex_rgba(colours[key], op))
                img.alpha_composite(Image.composite(layer, Image.new("RGBA", (W, H), (0, 0, 0, 0)), mask.convert("L")))
    return img.resize((W // ss, H // ss), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    words, width, baseline = layout()
    dark = {"ink": INK, "accent": ACCENT}
    light = {"ink": WHITE, "accent": ACCENT}
    files = {
        "iceq-sole-logo.svg": svg(words, width, baseline, dark),
        "iceq-sole-logo-white.svg": svg(words, width, baseline, light),
        "iceq-sole-mark.svg": svg(words, width, baseline, dark, mark_only=True),
        "iceq-sole-mark-white.svg": svg(words, width, baseline, light, mark_only=True),
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    long_side = 4000 / width  # full logo 4000 px wide
    png(words, width, baseline, dark, long_side).save(OUT / "iceq-sole-logo-4000.png", optimize=True)
    png(words, width, baseline, light, long_side).save(OUT / "iceq-sole-logo-white-4000.png", optimize=True)
    png(words, width, baseline, light, long_side, pad=10, bg=NIGHT).save(OUT / "iceq-sole-logo-on-black.png", optimize=True)
    png(words, width, baseline, dark, long_side, pad=10, bg="#F5F4F0").save(OUT / "iceq-sole-logo-on-light.png", optimize=True)
    png(words, width, baseline, dark, 2048 / MARK, mark_only=True).save(OUT / "iceq-sole-mark-2048.png", optimize=True)
    png(words, width, baseline, light, 2048 / MARK, mark_only=True).save(OUT / "iceq-sole-mark-white-2048.png", optimize=True)
    # square icon on the brand background (profile pictures, app stores, favicons)
    png(words, width, baseline, light, 2048 / (MARK + 20), mark_only=True, pad=10, bg=NIGHT).save(OUT / "iceq-sole-icon-2048.png", optimize=True)
    for p in sorted(OUT.iterdir()):
        size = Image.open(p).size if p.suffix == ".png" else "vector"
        print(f"{p.name:34} {size}")


if __name__ == "__main__":
    main()
