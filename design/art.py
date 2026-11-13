"""Render IceQ Sole's original campaign artwork, category banners, product shots and app icons.

All artwork is original vector art (no third-party logos or brand marks), rendered to
optimised JPG/PNG with a headless Chromium browser (Microsoft Edge or Google Chrome).

    backend\\.venv\\Scripts\\python design\\art.py
"""
from __future__ import annotations

import os
import random
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from app.placeholders import shoe_group  # noqa: E402

SEED = ROOT / "backend" / "seed_assets"
PUBLIC = ROOT / "store" / "public"
DASH_PUBLIC = ROOT / "dashboard" / "public"
BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
FONT = "@import url('https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=block');"
rng = random.Random(11)

GRAIN = """<filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/>
<feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .07 0"/></filter>"""


def browser() -> str:
    for b in BROWSERS:
        if os.path.exists(b):
            return b
    raise SystemExit("No Edge/Chrome found for rendering")


def page(w: int, h: int, svg_body: str, defs: str = "") -> str:
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{FONT}
html,body{{margin:0;padding:0;width:{w}px;height:{h}px;overflow:hidden;background:#000}}
svg{{display:block}} text{{font-family:'Archivo',sans-serif}}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs>{GRAIN}{defs}</defs>{svg_body}
<rect width="{w}" height="{h}" filter="url(#grain)"/></svg></body></html>"""


def render(name: str, w: int, h: int, html: str, outputs: list[Path], fmt: str = "JPEG") -> None:
    tmp = Path(tempfile.mkdtemp(prefix="iceq-art-"))
    src, png = tmp / f"{name}.html", tmp / f"{name}.png"
    src.write_text(html, encoding="utf-8")
    subprocess.run([browser(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
                    "--virtual-time-budget=4000", f"--window-size={w},{h}", f"--screenshot={png}", src.as_uri()],
                   check=True, capture_output=True, timeout=120)
    img = Image.open(png).convert("RGB").crop((0, 0, w, h))
    for out in outputs:
        out.parent.mkdir(parents=True, exist_ok=True)
        if fmt == "PNG" or out.suffix == ".png":
            img.save(out, "PNG", optimize=True)
        else:
            img.save(out, "JPEG", quality=84, optimize=True, progressive=True)
        print(f"  ok {out.relative_to(ROOT)}  ({out.stat().st_size // 1024} KB)")
    shutil.rmtree(tmp, ignore_errors=True)


def shoe(x, y, scale, upper, *, rot=0, flip=False, uid="a", **kw) -> str:
    fl = "scale(-1 1) translate(-1000 0)" if flip else ""
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({scale}) translate(-500 -560) {fl}">{shoe_group(upper, uid=uid, **kw)}</g>'


def shards(w, h, n, color="#BDE7F8", op=(0.05, 0.22), size=(60, 260)) -> str:
    out = []
    for i in range(n):
        cx, cy, s = rng.uniform(0, w), rng.uniform(0, h), rng.uniform(*size)
        pts = [(cx + s * rng.uniform(-.6, .6), cy - s), (cx + s * .7, cy + s * rng.uniform(-.2, .4)),
               (cx + s * rng.uniform(-.2, .3), cy + s), (cx - s * .6, cy + s * rng.uniform(-.1, .5))]
        p = " ".join(f"{a:.0f},{b:.0f}" for a, b in pts)
        out.append(f'<polygon points="{p}" fill="url(#shard)" opacity="{rng.uniform(*op):.2f}" stroke="{color}" stroke-opacity=".35" stroke-width="1.5"/>')
    return "".join(out)


def snow(w, h, n, color="#fff") -> str:
    return "".join(f'<circle cx="{rng.uniform(0, w):.0f}" cy="{rng.uniform(0, h):.0f}" r="{rng.uniform(1, 4.5):.1f}" fill="{color}" opacity="{rng.uniform(.15, .7):.2f}"/>' for _ in range(n))


SHARD_DEF = '<linearGradient id="shard" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#8FD6F5" stop-opacity=".05"/></linearGradient>'


def outline_text(x, y, text, size, color="#fff", op=.12, anchor="start", stretch=125, weight=900, sw=2):
    return (f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="{size}" font-weight="{weight}" '
            f'style="font-stretch:{stretch}%;letter-spacing:-0.04em" fill="none" stroke="{color}" stroke-opacity="{op}" stroke-width="{sw}">{text}</text>')


# ------------------------------------------------------------------ scenes
def hero_main():
    w, h = 2400, 1350
    defs = SHARD_DEF + """<radialGradient id="bg" cx=".68" cy=".45" r=".75"><stop offset="0" stop-color="#28495A"/><stop offset=".55" stop-color="#0E1A22"/><stop offset="1" stop-color="#05080B"/></radialGradient>
    <radialGradient id="spot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#BDE7F8" stop-opacity=".45"/><stop offset="1" stop-color="#BDE7F8" stop-opacity="0"/></radialGradient>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#A9DDF3" stop-opacity=".18"/></linearGradient>
    <linearGradient id="plinth" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCE3E6"/><stop offset="1" stop-color="#8C989E"/></linearGradient>"""
    body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>
    {outline_text(2380, 520, 'ICE', 520, anchor='end', op=.08)}{outline_text(2380, 1000, 'COLD', 520, anchor='end', op=.08)}
    <ellipse cx="1620" cy="640" rx="760" ry="520" fill="url(#spot)"/>
    {shards(w, h, 14)}
    <rect y="980" width="{w}" height="370" fill="url(#floor)"/>
    <path d="M1170 1010 L2070 1010 L2130 1090 L1110 1090 Z" fill="url(#plinth)" opacity=".95"/>
    <rect x="1110" y="1090" width="1020" height="260" fill="#6F7B81"/>
    {shoe(1640, 760, 1.12, '#F6F7F7', rot=-9, uid='h1', wave='#A9DDF3', accent='#E4EAEC', sole='#FBFBFA')}
    {snow(w, h, 120)}"""
    render("hero-main", w, h, page(w, h, body, defs), [SEED / "banners/hero-main.jpg", PUBLIC / "images/hero-fallback.jpg"])

    mw, mh = 1080, 1350
    body = f"""<rect width="{mw}" height="{mh}" fill="url(#bg)"/>
    {outline_text(540, 300, 'ICE', 380, anchor='middle', op=.08)}
    <ellipse cx="540" cy="520" rx="560" ry="420" fill="url(#spot)"/>{shards(mw, mh, 8)}
    <path d="M170 600 L910 600 L960 660 L120 660 Z" fill="url(#plinth)"/><rect x="120" y="660" width="840" height="690" fill="#58646A"/>
    {shoe(540, 400, .86, '#F6F7F7', rot=-9, uid='h2', wave='#A9DDF3', accent='#E4EAEC', sole='#FBFBFA')}{snow(mw, mh, 70)}"""
    render("hero-main-mobile", mw, mh, page(mw, mh, body, defs), [SEED / "banners/hero-main-mobile.jpg"])


def hero_originals():
    w, h = 2400, 1350
    defs = SHARD_DEF + """<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B1C2B"/><stop offset=".6" stop-color="#16506E"/><stop offset="1" stop-color="#7CC8EC"/></linearGradient>
    <radialGradient id="ring" cx=".5" cy=".5" r=".5"><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset=".72" stop-color="#fff" stop-opacity=".35"/><stop offset=".74" stop-color="#fff" stop-opacity="0"/></radialGradient>"""
    body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>
    <circle cx="1650" cy="660" r="560" fill="url(#ring)"/><circle cx="1650" cy="660" r="420" fill="#fff" opacity=".06"/>
    {shards(w, h, 10, op=(.06, .18))}
    <text x="1650" y="1240" text-anchor="middle" font-size="64" font-weight="700" style="letter-spacing:.5em;font-stretch:110%" fill="#fff" opacity=".55">ICEQ ORIGINALS</text>
    {shoe(1650, 700, 1.15, '#F2F7F9', rot=-12, uid='o1', wave='#5DC1EC', accent='#BDE7F8', sole='#FFFFFF', tab='#1683B3')}"""
    render("hero-originals", w, h, page(w, h, body, defs), [SEED / "banners/hero-originals.jpg", PUBLIC / "images/og-originals.jpg"])


def promo_sale():
    w, h = 2400, 1030
    defs = SHARD_DEF + """<linearGradient id="bg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#050A12"/><stop offset=".5" stop-color="#0F2A40"/><stop offset="1" stop-color="#2E7BA3"/></linearGradient>
    <linearGradient id="ice" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#EAF8FE" stop-opacity=".95"/><stop offset="1" stop-color="#8FD6F5" stop-opacity=".55"/></linearGradient>
    <linearGradient id="iceSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#BDE7F8" stop-opacity=".75"/><stop offset="1" stop-color="#2BA6DA" stop-opacity=".35"/></linearGradient>"""

    def block(x, y, bw, bh):
        return (f'<path d="M{x} {y} L{x + bw} {y} L{x + bw + 60} {y - 50} L{x + 60} {y - 50} Z" fill="url(#ice)"/>'
                f'<rect x="{x}" y="{y}" width="{bw}" height="{bh}" fill="url(#iceSide)"/>'
                f'<path d="M{x + bw} {y} L{x + bw + 60} {y - 50} L{x + bw + 60} {y + bh - 50} L{x + bw} {y + bh} Z" fill="#8FD6F5" opacity=".35"/>')
    body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>{outline_text(2380, 760, '−20%', 640, anchor='end', op=.1)}
    {shards(w, h, 12)}
    {block(1180, 760, 360, 300)}{block(1560, 660, 360, 420)}{block(1940, 800, 360, 260)}
    {shoe(1380, 640, .48, '#F5F5F3', rot=-6, uid='p1', wave='#8FD6F5')}
    {shoe(1760, 540, .5, '#18181B', rot=-8, uid='p2', wave='#5DC1EC', sole='#EDEDEA')}
    {shoe(2140, 680, .46, '#A9DDF3', rot=-5, uid='p3', wave='#1683B3', sole='#FFFFFF')}{snow(w, h, 160)}"""
    render("promo-sale", w, h, page(w, h, body, defs), [SEED / "banners/promo-sale.jpg"])


CATS = {
    "lifestyle": ("#EFE6D2", "#D9CBB0", "#EFE6D2", "#B08D64", "#F8F4EA", "LIFE"),
    "running": ("#CFEAF5", "#5DC1EC", "#E7ECEE", "#2BA6DA", "#FFFFFF", "RUN"),
    "basketball": ("#E9562F", "#B8331A", "#F6F4F0", "#C8102E", "#F6F4F0", "HOOP"),
    "retro": ("#E8DCC3", "#C9B48E", "#2F6B4F", "#EFE6D2", "#C89B6D", "RETRO"),
    "skate": ("#9EA3A8", "#5C6166", "#151517", "#F7F7F5", "#F2EFE8", "SK8"),
}


def categories():
    w, h = 1200, 1500
    for slug, (bg1, bg2, upper, wave, sole, word) in CATS.items():
        defs = f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient>'
        dark = slug in ("basketball", "skate")
        deco = ""
        if slug == "basketball":
            deco = '<circle cx="600" cy="1500" r="520" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="10"/><line x1="0" y1="1180" x2="1200" y2="1180" stroke="#fff" stroke-opacity=".35" stroke-width="10"/>'
        elif slug == "running":
            deco = "".join(f'<rect x="{rng.randint(-200, 900)}" y="{y}" width="{rng.randint(300, 700)}" height="6" rx="3" fill="#fff" opacity=".6"/>' for y in range(200, 1400, 70))
        elif slug == "retro":
            deco = "".join(f'<circle cx="{x}" cy="{y}" r="7" fill="#B08D64" opacity=".25"/>' for x in range(30, 1200, 60) for y in range(30, 1500, 60) if (x + y) % 120 == 30)
        elif slug == "skate":
            deco = "".join(f'<line x1="{x}" y1="0" x2="{x}" y2="1500" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>' for x in range(0, 1200, 100)) + \
                   "".join(f'<line x1="0" y1="{y}" x2="1200" y2="{y}" stroke="#fff" stroke-opacity=".08" stroke-width="2"/>' for y in range(0, 1500, 100))
        else:
            deco = '<circle cx="900" cy="350" r="260" fill="#fff" opacity=".35"/>'
        body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>{deco}
        <g transform="rotate(-90 600 750)">{outline_text(600, 1010, word, 640, color='#fff' if dark else '#0A0A0B', op=.16 if dark else .1, anchor='middle', sw=3)}</g>
        {shoe(610, 760, .98, upper, rot=-14, uid=slug, wave=wave, sole=sole)}"""
        render(f"cat-{slug}", w, h, page(w, h, body, defs), [SEED / f"categories/{slug}.jpg", PUBLIC / f"images/category-{slug}.jpg"])


ORIGINALS = {
    "glacier-runner": ("#F2F7F9", "#5DC1EC", "#BDE7F8", "#FFFFFF", "#1683B3", ("#EEF3F5", "#D5E2E7"), ("#CFE9F5", "#9CCFE6")),
    "polar-court": ("#F7F7F5", "#E4E8EA", "#EDEDEA", "#FFFFFF", "#8FD6F5", ("#F3F2EF", "#E1DED7"), ("#E7EEF0", "#CAD7DB")),
    "midnight-trail": ("#1B1D22", "#3F5C70", "#2A2D33", "#2A2D33", "#5DC1EC", ("#E9E8E5", "#CFCDC8"), ("#2B3036", "#121418")),
}


def originals():
    w = h = 1600
    for slug, (upper, wave, accent, sole, tab, bgA, bgB) in ORIGINALS.items():
        for n, (bg, flip, sc, y) in enumerate([(bgA, False, 1.18, 860), (bgB, True, 1.45, 900)], start=1):
            defs = (f'<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg[0]}"/><stop offset="1" stop-color="{bg[1]}"/></linearGradient>'
                    '<radialGradient id="g" cx=".5" cy=".45" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>')
            body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/><rect width="{w}" height="{h}" fill="url(#g)"/>
            {shoe(800 if not flip else 760, y, sc, upper, rot=-4 if not flip else -10, flip=flip, uid=f'{slug}{n}', wave=wave, accent=accent, sole=sole, tab=tab)}"""
            render(f"{slug}-{n}", w, h, page(w, h, body, defs), [SEED / f"originals/{slug}/{n}.jpg"])


def story_and_auth():
    w, h = 1600, 2000
    defs = """<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B1220"/><stop offset=".55" stop-color="#2B2550"/><stop offset="1" stop-color="#E86A2C"/></linearGradient>
    <linearGradient id="street" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A1C24"/><stop offset="1" stop-color="#07080B"/></linearGradient>
    <linearGradient id="refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#E86A2C" stop-opacity=".35"/><stop offset="1" stop-color="#E86A2C" stop-opacity="0"/></linearGradient>"""
    city = []
    x = 0
    while x < w:
        bw, bh = rng.randint(90, 220), rng.randint(300, 900)
        city.append(f'<rect x="{x}" y="{1300 - bh}" width="{bw}" height="{bh}" fill="#0A0D16"/>')
        for wy in range(1300 - bh + 30, 1280, 46):
            for wx in range(x + 16, x + bw - 20, 34):
                if rng.random() < .28:
                    city.append(f'<rect x="{wx}" y="{wy}" width="14" height="20" fill="#F6C76E" opacity="{rng.uniform(.4, .9):.2f}"/>')
        x += bw + rng.randint(4, 20)
    body = f"""<rect width="{w}" height="{h}" fill="url(#sky)"/><circle cx="1180" cy="520" r="120" fill="#F6C76E" opacity=".85"/>
    {''.join(city)}<rect y="1300" width="{w}" height="700" fill="url(#street)"/><rect y="1300" width="{w}" height="400" fill="url(#refl)"/>
    {''.join(f'<rect x="{rng.randint(0, 1500)}" y="{rng.randint(1320, 1950)}" width="{rng.randint(60, 300)}" height="3" fill="#F6C76E" opacity="{rng.uniform(.1, .4):.2f}"/>' for _ in range(40))}
    {shoe(800, 1560, 1.2, '#F6F7F7', rot=-6, uid='st', wave='#E86A2C', accent='#E9E6E0', sole='#FBFBFA', tab='#8FD6F5')}"""
    render("story", w, h, page(w, h, body, defs), [PUBLIC / "images/story-lifestyle.jpg"])

    w, h = 1200, 1600
    defs = SHARD_DEF + '<radialGradient id="bg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#21404F"/><stop offset="1" stop-color="#05080B"/></radialGradient>'
    body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>{shards(w, h, 9)}
    {shoe(560, 560, .92, '#151517', rot=-14, uid='a1', wave='#5DC1EC', sole='#F2F2EF')}
    {shoe(660, 860, .92, '#F5F5F3', rot=8, flip=True, uid='a2', wave='#8FD6F5')}{snow(w, h, 70)}"""
    render("auth", w, h, page(w, h, body, defs), [PUBLIC / "images/auth-side.jpg"])


LOGO_PATHS = ('<path d="M16 2.6 27.6 9.3v13.4L16 29.4 4.4 22.7V9.3L16 2.6Z" stroke="{c}" stroke-width="3" stroke-linejoin="round" fill="none"/>'
              '<path d="M9.2 20.6h13.6" stroke="#8FD6F5" stroke-width="3" stroke-linecap="round"/>'
              '<path d="M20.4 23.4 28.6 30" stroke="{c}" stroke-width="3" stroke-linecap="round"/>')


def icons():
    def icon(size, pad, bg="#0A0A0B", radius=0):
        inner = size - 2 * pad
        return page(size, size, f'<rect width="{size}" height="{size}" rx="{radius}" fill="{bg}"/>'
                                f'<g transform="translate({pad} {pad}) scale({inner / 32})">{LOGO_PATHS.format(c="#FFFFFF")}</g>')
    for size, pad, name in [(192, 34, "icon-192.png"), (512, 92, "icon-512.png"), (512, 128, "icon-maskable-512.png"), (180, 30, "apple-touch-icon.png")]:
        render(name, size, size, icon(size, pad), [PUBLIC / "icons" / name, DASH_PUBLIC / "icons" / name], fmt="PNG")
    fav = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#0A0A0B"/><g transform="translate(4 4) scale(.75)">{LOGO_PATHS.format(c="#FFFFFF")}</g></svg>'
    for d in (PUBLIC, DASH_PUBLIC):
        (d / "favicon.svg").write_text(fav, encoding="utf-8")
    logo = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 40"><g transform="translate(2 4)">{LOGO_PATHS.format(c="#0A0A0B")}</g>'
            '<text x="46" y="28" font-family="Archivo, Arial Black, sans-serif" font-size="24" font-weight="900" fill="#0A0A0B" style="font-stretch:125%">ICEQ</text>'
            '<text x="128" y="28" font-family="Archivo, Arial, sans-serif" font-size="12" font-weight="600" letter-spacing="5" fill="#0A0A0B" opacity=".7">SOLE</text></svg>')
    (ROOT / "design" / "logo.svg").write_text(logo, encoding="utf-8")
    (PUBLIC / "images").mkdir(parents=True, exist_ok=True)
    (PUBLIC / "images" / "logo.svg").write_text(logo, encoding="utf-8")

    w, h = 1200, 630
    defs = '<radialGradient id="bg" cx=".7" cy=".5" r=".8"><stop offset="0" stop-color="#28495A"/><stop offset="1" stop-color="#05080B"/></radialGradient>'
    body = f"""<rect width="{w}" height="{h}" fill="url(#bg)"/>
    <g transform="translate(80 90) scale(2.4)">{LOGO_PATHS.format(c="#FFFFFF")}</g>
    <text x="80" y="300" font-size="110" font-weight="900" fill="#fff" style="font-stretch:125%;letter-spacing:-.03em">ICEQ</text>
    <text x="84" y="350" font-size="30" font-weight="600" fill="#fff" opacity=".7" style="letter-spacing:.5em">SOLE</text>
    <text x="80" y="520" font-size="34" font-weight="500" fill="#BDE7F8">Premium sneakers · Cambodia</text>
    {shoe(880, 330, .62, '#F6F7F7', rot=-10, uid='og', wave='#A9DDF3')}"""
    render("og", w, h, page(w, h, body, defs), [PUBLIC / "images/og-cover.jpg"])


if __name__ == "__main__":
    which = sys.argv[1:] or ["hero", "originals_hero", "promo", "categories", "originals", "story", "icons"]
    jobs = {"hero": hero_main, "originals_hero": hero_originals, "promo": promo_sale, "categories": categories,
            "originals": originals, "story": story_and_auth, "icons": icons}
    for j in which:
        print(f"[{j}]")
        jobs[j]()
