"""Product images for IceQ Sole's own merch (logo keychain, lace charm).

These are the store's own branded accessories, drawn from the IceQ logo geometry (favicon.svg):
studio background, soft floor shadow, glossy acrylic / enamel surfaces. Replace them with real
photos in the dashboard whenever you have them.

    python design/merch.py   ->  backend/seed_assets/photos/merch-*.png
"""
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parents[1] / "backend" / "seed_assets" / "photos"
SS = 2            # supersampling
W = 1600 * SS     # final 1600 x 1600


def bg() -> Image.Image:
    im = Image.new("RGB", (W, W))
    d = ImageDraw.Draw(im)
    top, bot = (244, 243, 239), (226, 224, 218)
    for y in range(W):
        t = y / W
        d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)))
    return im


def shadow(size, box, blur, alpha=110, shape="ellipse"):
    m = Image.new("L", size, 0)
    dr = ImageDraw.Draw(m)
    (dr.ellipse if shape == "ellipse" else lambda b, fill: dr.rounded_rectangle(b, radius=180 * SS, fill=fill))(box, fill=alpha)
    return m.filter(ImageFilter.GaussianBlur(blur))


def logo(draw, cx, cy, scale, stroke_col, bar_col, w=3.1):
    """IceQ mark from favicon.svg (32-unit box), centred on cx, cy."""
    k = scale / 32
    P = lambda x, y: (cx + (x - 16.5) * k, cy + (y - 16.2) * k)  # noqa: E731
    lw = int(w * k)
    r = lw / 2

    def stroke(pts, col, closed=False):
        seq = pts + ([pts[0]] if closed else [])
        for a, b in zip(seq, seq[1:]):
            draw.line([P(*a), P(*b)], fill=col, width=lw)
        for p in pts:
            x, y = P(*p)
            draw.ellipse([x - r, y - r, x + r, y + r], fill=col)
    stroke([(16, 2.6), (27.6, 9.3), (27.6, 22.7), (16, 29.4), (4.4, 22.7), (4.4, 9.3)], stroke_col, closed=True)
    stroke([(9.2, 20.6), (22.8, 20.6)], bar_col)
    stroke([(20.4, 23.4), (28.6, 30)], stroke_col)


def gloss(layer: Image.Image, mask: Image.Image, strength=60):
    """Soft diagonal highlight on the upper-left of a shape."""
    g = Image.new("L", layer.size, 0)
    gd = ImageDraw.Draw(g)
    w, h = layer.size
    gd.ellipse([-w * 0.35, -h * 0.55, w * 0.75, h * 0.45], fill=strength)
    g = ImageChops.multiply(g.filter(ImageFilter.GaussianBlur(w // 12)), mask)
    white = Image.new("RGBA", layer.size, (255, 255, 255, 0))
    white.putalpha(g)
    return Image.alpha_composite(layer, white)


def ring(draw, cx, cy, r, thick):
    """Split ring: dark rim, bright face, thin highlight."""
    for i, col in enumerate([(120, 122, 128), (196, 198, 204), (232, 233, 236), (170, 172, 178)]):
        t = thick * (1 - i * 0.22)
        draw.ellipse([cx - r - t / 2, cy - r - t / 2, cx + r + t / 2, cy + r + t / 2], outline=col, width=int(max(2, t)))


def font(px):
    for f in ("C:/Windows/Fonts/bahnschrift.ttf", "C:/Windows/Fonts/arialbd.ttf"):
        try:
            fo = ImageFont.truetype(f, px)
            try:
                fo.set_variation_by_name("Bold")
            except Exception:  # noqa: BLE001
                pass
            return fo
        except OSError:
            continue
    return ImageFont.load_default()


def keychain() -> Image.Image:
    im = bg().convert("RGBA")
    tag = 900 * SS
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    x0, y0 = (W - tag) // 2, int(W * 0.30)
    box = [x0, y0, x0 + tag, y0 + tag]
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=190 * SS, fill=255)
    hole_c = (W // 2, y0 + 120 * SS)
    ImageDraw.Draw(mask).ellipse([hole_c[0] - 44 * SS, hole_c[1] - 44 * SS, hole_c[0] + 44 * SS, hole_c[1] + 44 * SS], fill=0)
    body = Image.new("RGBA", (W, W), (20, 20, 22, 255))
    body.putalpha(mask)
    layer = Image.alpha_composite(layer, body)
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle(box, radius=190 * SS, outline=(58, 58, 64, 255), width=6 * SS)
    # grommet
    d.ellipse([hole_c[0] - 62 * SS, hole_c[1] - 62 * SS, hole_c[0] + 62 * SS, hole_c[1] + 62 * SS], outline=(205, 207, 212, 255), width=16 * SS)
    logo(d, W // 2, y0 + tag * 0.53, 470 * SS, (250, 250, 250, 255), (143, 214, 245, 255))
    f = font(54 * SS)
    text = "I C E Q   S O L E"
    tw = d.textlength(text, font=f)
    d.text(((W - tw) / 2, y0 + tag - 150 * SS), text, font=f, fill=(235, 235, 235, 255))
    layer = gloss(layer, mask, 70)
    layer = layer.rotate(-9, resample=Image.BICUBIC, center=(W // 2, y0 + tag // 2))
    # split ring + short chain above the tag
    rd = ImageDraw.Draw(layer)
    ring(rd, W // 2 - 10 * SS, int(W * 0.20), 150 * SS, 26 * SS)
    # shadows
    sh = shadow((W, W), [W * 0.18, W * 0.86, W * 0.82, W * 0.95], 60 * SS, 120)
    im.paste((60, 58, 52), (0, 0), sh)
    tag_sh = layer.split()[3].filter(ImageFilter.GaussianBlur(40 * SS)).point(lambda a: a * 0.35)
    im.paste((40, 38, 34), (24 * SS, 46 * SS), tag_sh)
    return Image.alpha_composite(im, layer).convert("RGB")


def charm() -> Image.Image:
    im = bg().convert("RGBA")
    dia = 820 * SS
    cx, cy = W // 2, int(W * 0.56)
    box = [cx - dia // 2, cy - dia // 2, cx + dia // 2, cy + dia // 2]
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).ellipse(box, fill=255)
    layer = Image.new("RGBA", (W, W), (0, 0, 0, 0))
    body = Image.new("RGBA", (W, W), (169, 221, 243, 255))
    body.putalpha(mask)
    layer = Image.alpha_composite(layer, body)
    d = ImageDraw.Draw(layer)
    d.ellipse(box, outline=(120, 190, 222, 255), width=22 * SS)               # enamel rim
    inner = [box[0] + 60 * SS, box[1] + 60 * SS, box[2] - 60 * SS, box[3] - 60 * SS]
    d.ellipse(inner, outline=(255, 255, 255, 170), width=5 * SS)
    logo(d, cx, cy + 10 * SS, 440 * SS, (12, 12, 14, 255), (255, 255, 255, 255))
    layer = gloss(layer, mask, 90)
    # lace clip on top
    cd = ImageDraw.Draw(layer)
    clip = [cx - 120 * SS, box[1] - 150 * SS, cx + 120 * SS, box[1] + 40 * SS]
    cd.rounded_rectangle(clip, radius=60 * SS, fill=(190, 192, 198, 255), outline=(130, 132, 138, 255), width=8 * SS)
    cd.rounded_rectangle([clip[0] + 50 * SS, clip[1] + 50 * SS, clip[2] - 50 * SS, clip[3] - 70 * SS], radius=30 * SS, fill=(234, 235, 238, 255))
    sh = shadow((W, W), [W * 0.22, W * 0.86, W * 0.78, W * 0.94], 55 * SS, 125)
    im.paste((60, 58, 52), (0, 0), sh)
    body_sh = layer.split()[3].filter(ImageFilter.GaussianBlur(38 * SS)).point(lambda a: a * 0.33)
    im.paste((40, 38, 34), (20 * SS, 40 * SS), body_sh)
    return Image.alpha_composite(im, layer).convert("RGB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("merch-keychain-black.png", keychain), ("merch-lace-charm-ice-blue.png", charm)):
        fn().resize((1600, 1600), Image.LANCZOS).save(OUT / name, optimize=True)
        print("wrote", OUT / name)
