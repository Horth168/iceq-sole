"""Original IceQ Sole sneaker illustration (SVG).

* `shoe_group()` draws a generic, UNBRANDED low-top sneaker with an IceQ "wave" panel.
  It is used for campaign artwork (design/art.py) and the IceQ Originals label.
* `sneaker_svg()` builds clearly-labelled illustrated placeholders for demo products of
  third-party brands until genuine, licensed photos are uploaded. It never imitates a real model.
"""
from xml.sax.saxutils import escape


def _rgb(hex_color: str):
    h = hex_color.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(hex_color: str, factor: float) -> str:
    r, g, b = _rgb(hex_color)
    if factor < 1:
        r, g, b = (int(c * factor) for c in (r, g, b))
    else:
        r, g, b = (min(255, int(c + (255 - c) * (factor - 1))) for c in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


def is_light(hex_color: str) -> bool:
    r, g, b = _rgb(hex_color)
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170


def shoe_group(upper: str, *, accent: str | None = None, sole: str = "#F4F2EC", wave: str | None = None,
               tab: str = "#8FD6F5", uid: str = "s", shadow: bool = True) -> str:
    """A sneaker facing left, drawn in a 1000x800 box (sole bottom at y≈712)."""
    light = is_light(upper)
    accent = accent or (shade(upper, 0.8) if light else shade(upper, 1.3))
    wave = wave or (shade(upper, 0.62) if light else shade(upper, 1.55))
    collar = "#1d1d1f" if light else shade(upper, 0.45)
    lace = "#ffffff" if not light else "#e9e7e2"
    stitch = "rgba(0,0,0,.18)" if light else "rgba(255,255,255,.28)"
    return f"""
<g>
  <defs>
    <linearGradient id="up{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{shade(upper, 1.12)}"/><stop offset=".55" stop-color="{upper}"/><stop offset="1" stop-color="{shade(upper, .82)}"/>
    </linearGradient>
    <linearGradient id="so{uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{shade(sole, 1.05)}"/><stop offset="1" stop-color="{shade(sole, .86)}"/>
    </linearGradient>
    <linearGradient id="hl{uid}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <filter id="bl{uid}" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  {'<ellipse cx="520" cy="736" rx="400" ry="22" fill="#000" opacity=".28" filter="url(#bl' + uid + ')"/>' if shadow else ''}
  <path d="M690 345 C705 330 742 334 752 350 L760 404 L700 412 Z" fill="{shade(upper, .9)}"/>
  <path d="M150 640 L880 640 C893 640 898 653 895 668 L888 693 C884 704 873 713 860 713 L196 713 C160 713 135 693 138 666 C139 651 143 640 150 640 Z" fill="url(#so{uid})"/>
  <path d="M146 698 C300 706 700 706 890 696" stroke="{shade(sole, .55)}" stroke-width="10" stroke-linecap="round" opacity=".55"/>
  <path d="M146 676 L892 676" stroke="{shade(sole, .8)}" stroke-width="4" stroke-linecap="round"/>
  <path d="M170 640 C150 598 178 566 245 552 L420 505 C472 492 522 470 562 440 L622 401 C653 382 702 379 733 392 L792 416 C823 430 847 472 857 541 L869 640 Z" fill="url(#up{uid})"/>
  <path d="M170 640 C163 603 190 579 252 566 L318 556 C303 585 298 613 304 640 Z" fill="{accent}"/>
  <path d="M300 640 C380 600 470 600 560 560 C640 525 720 520 860 548 L866 600 C760 580 690 590 610 618 C560 634 520 640 500 640 Z" fill="{wave}"/>
  <path d="M760 412 C800 425 835 455 850 520 L862 590 C840 560 812 540 780 534 Z" fill="{accent}"/>
  <path d="M618 404 C650 386 700 384 731 395 C716 420 680 436 640 436 C628 426 620 416 618 404 Z" fill="{collar}"/>
  <g stroke="{lace}" stroke-width="10" stroke-linecap="round">
    <path d="M452 492 L478 520"/><path d="M490 478 L515 506"/><path d="M528 462 L552 490"/><path d="M565 444 L588 470"/><path d="M600 424 L622 450"/>
  </g>
  <g fill="{shade(upper, .55) if light else shade(upper, 1.6)}">
    <circle cx="447" cy="488" r="4"/><circle cx="485" cy="474" r="4"/><circle cx="523" cy="458" r="4"/><circle cx="560" cy="440" r="4"/><circle cx="596" cy="420" r="4"/>
  </g>
  <path d="M440 500 C500 480 560 450 612 410" stroke="{stitch}" stroke-width="3" stroke-dasharray="8 8" fill="none"/>
  <path d="M240 616 C380 604 520 594 846 604" stroke="{stitch}" stroke-width="3" stroke-dasharray="8 8" fill="none"/>
  <path d="M250 560 C380 530 520 500 640 420" stroke="url(#hl{uid})" stroke-width="16" stroke-linecap="round" fill="none" opacity=".55"/>
  <rect x="806" y="430" width="22" height="60" rx="9" fill="{tab}" transform="rotate(14 817 459)"/>
</g>"""


def sneaker_svg(color_hex: str, brand: str, model: str, view: int = 0, sole_hex: str = "#F4F2EC") -> str:
    """Placeholder card. view 0 = side profile, 1 = mirrored on cool backdrop, 2 = detail crop."""
    shoe = shoe_group(color_hex, sole=sole_hex, tab="#8FD6F5", uid=f"p{view}")
    bg_top, bg_bottom = ("#F3F2EF", "#E4E2DC") if view != 1 else ("#E3ECEF", "#CCD9DE")
    if view == 2:
        viewbox, transform = "130 330 560 560", "translate(0 60)"
    elif view == 1:
        viewbox, transform = "0 0 1000 1000", "translate(1000 60) scale(-1 1)"
    else:
        viewbox, transform = "0 0 1000 1000", "translate(0 60)"
    label = escape(f"{brand} · {model}".upper())
    caption = "" if view == 2 else f"""
  <text x="500" y="890" text-anchor="middle" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="22"
        letter-spacing="5" fill="#1d1d1f" opacity=".55">{label}</text>
  <text x="500" y="924" text-anchor="middle" font-family="Archivo, Helvetica, Arial, sans-serif" font-size="15"
        letter-spacing="4" fill="#1d1d1f" opacity=".35">ILLUSTRATION · PRODUCT PHOTO COMING SOON</text>"""
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" width="1200" height="1200">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{bg_top}"/><stop offset="1" stop-color="{bg_bottom}"/></linearGradient>
    <radialGradient id="glow" cx=".5" cy=".45" r=".55"><stop offset="0" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="-200" y="-200" width="1400" height="1400" fill="url(#bg)"/>
  <rect x="-200" y="-200" width="1400" height="1400" fill="url(#glow)"/>
  <g transform="{transform}">{shoe}</g>{caption}
</svg>"""
