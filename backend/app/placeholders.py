"""Original illustrated product placeholders (SVG).

Used ONLY for demo data of branded products until you upload genuine, licensed product
photography in the dashboard. The artwork is a generic, unbranded silhouette in the
colourway and is clearly marked as an illustration — it never imitates a real model.
"""
from xml.sax.saxutils import escape


def _shade(hex_color: str, factor: float) -> str:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if factor < 1:
        r, g, b = (int(c * factor) for c in (r, g, b))
    else:
        r, g, b = (int(c + (255 - c) * (factor - 1)) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def _is_light(hex_color: str) -> bool:
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170


SHOE = """
<g id="shoe">
  <ellipse cx="515" cy="742" rx="390" ry="26" fill="#000" opacity=".10"/>
  <path d="M150 640 L880 640 C892 640 897 652 894 667 L887 692 C884 703 873 712 860 712 L195 712 C160 712 136 692 139 666 C140 651 144 640 150 640 Z" fill="{sole}"/>
  <path d="M146 676 L892 676" stroke="{sole_line}" stroke-width="6" stroke-linecap="round"/>
  <path d="M170 640 C150 598 178 566 245 552 L420 505 C472 492 522 470 562 440 L622 401 C653 382 702 379 733 392 L792 416 C823 430 847 472 857 541 L869 640 Z" fill="{upper}"/>
  <path d="M170 640 C163 603 190 579 252 566 L318 556 C303 585 298 613 304 640 Z" fill="{accent}" opacity=".9"/>
  <path d="M520 640 C560 560 640 520 760 508 C790 506 820 512 850 520 L862 590 C800 575 720 585 650 615 C620 628 600 636 590 640 Z" fill="{accent}" opacity=".85"/>
  <path d="M760 412 C800 425 835 455 850 520 L862 590 C840 560 812 540 780 534 Z" fill="{heel}"/>
  <path d="M618 404 C650 386 700 384 731 395 C716 420 680 436 640 436 C628 426 620 416 618 404 Z" fill="{collar}"/>
  <g stroke="{lace}" stroke-width="9" stroke-linecap="round">
    <path d="M452 492 L478 520"/><path d="M490 478 L515 506"/><path d="M528 462 L552 490"/>
    <path d="M565 444 L588 470"/><path d="M600 424 L622 450"/>
  </g>
  <path d="M440 500 C500 480 560 450 612 410" stroke="{stitch}" stroke-width="3" stroke-dasharray="8 8" fill="none"/>
  <path d="M240 612 C380 600 520 590 840 600" stroke="{stitch}" stroke-width="3" stroke-dasharray="8 8" fill="none" opacity=".7"/>
  <rect x="806" y="430" width="22" height="58" rx="9" fill="{tab}" transform="rotate(14 817 459)"/>
</g>
"""


def sneaker_svg(color_hex: str, brand: str, model: str, view: int = 0, sole_hex: str = "#F4F2EC") -> str:
    """view 0 = side profile, 1 = mirrored on deeper backdrop, 2 = detail crop."""
    light = _is_light(color_hex)
    accent = _shade(color_hex, 0.78) if light else _shade(color_hex, 1.35)
    fill = {
        "upper": color_hex, "accent": accent, "heel": _shade(color_hex, 0.86 if light else 1.2),
        "collar": "#1d1d1f" if light else _shade(color_hex, 0.55), "lace": "#ffffff" if not light else "#e8e6e1",
        "stitch": "#00000033" if light else "#ffffff40", "tab": "#7cc8ec", "sole": sole_hex,
        "sole_line": _shade(sole_hex, 0.86),
    }
    shoe = SHOE.format(**fill)
    bg_top, bg_bottom = ("#F3F2EF", "#E6E4DF") if view != 1 else ("#DCE6EA", "#C9D6DC")
    if view == 2:
        viewbox, transform = "120 330 560 560", ""
    elif view == 1:
        viewbox, transform = "0 0 1000 1000", 'transform="translate(1000 0) scale(-1 1)"'
    else:
        viewbox, transform = "0 0 1000 1000", ""
    label = escape(f"{brand} · {model}".upper())
    caption = "" if view == 2 else f"""
  <text x="500" y="880" text-anchor="middle" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="22"
        letter-spacing="5" fill="#1d1d1f" opacity=".55">{label}</text>
  <text x="500" y="914" text-anchor="middle" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="15"
        letter-spacing="4" fill="#1d1d1f" opacity=".35">ILLUSTRATION · PRODUCT PHOTO COMING SOON</text>"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1200" height="1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg_top}"/><stop offset="1" stop-color="{bg_bottom}"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="-200" y="-200" width="1400" height="1400" fill="url(#bg)"/>
  <rect x="-200" y="-200" width="1400" height="1400" fill="url(#glow)"/>
  <g {transform}>{shoe}</g>{caption}
</svg>"""
