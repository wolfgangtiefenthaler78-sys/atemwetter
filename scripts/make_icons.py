#!/usr/bin/env python3
"""Atemwetter: erzeugt App-Symbol und Startbild in MAYOKA-Farben (Gelb → Gold → Orange).
Schreibt public/icon.png, die Android-Symbole und Startbilder unter android/app/src/main/res
sowie (falls vorhanden) das iPhone-Symbol und Startbild unter ios/App/App/Assets.xcassets.
Aufruf: python3 scripts/make_icons.py   (braucht Pillow)"""
import math, os
from PIL import Image, ImageDraw, ImageFilter

RES = "android/app/src/main/res"
# Verlauf von links oben nach rechts unten
STOPS = [(0.0, (255, 212, 84)),    # Sonnengelb
         (0.5, (247, 172, 56)),    # Gold
         (1.0, (238, 116, 44))]    # Orange (dunkler als #fb8a40, damit die Wellen klar stehen)
WAVE = (255, 255, 255)
ACCENT = (92, 192, 222)            # MAYOKA-Hellblau #5cc0de als kleine Akzent-Welle
SS = 4                              # Kantenglättung durch Überabtastung


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(w, h):
    img = Image.new("RGB", (w, h)); px = img.load(); d = w + h
    for y in range(h):
        for x in range(w):
            t = (x + y) / d
            for (t0, c0), (t1, c1) in zip(STOPS, STOPS[1:]):
                if t <= t1:
                    px[x, y] = lerp(c0, c1, (t - t0) / (t1 - t0)); break
    return img


def waves(size, scale=1.0):
    """Drei Atem-Wellen (wie bisher), Mittelpunkt in der Bildmitte, scale 1.0 = volle Fläche 512."""
    S = size * SS; k = S / 512 * scale; off = S / 2 - 256 * k
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0)); shadow = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    spec = [(118, 395, 155, 30, 36, WAVE), (85, 430, 255, 30, 36, WAVE), (140, 372, 357, 24, 34, ACCENT)]
    for x0, x1, yc, amp, width, col in spec:
        r = width / 2 * k
        n = int((x1 - x0) * k / 1.5) + 2          # dicht gesetzte Kreise ergeben einen sauberen, runden Strich
        for i in range(n):
            x = x0 + (x1 - x0) * i / (n - 1)
            y = yc - amp * math.sin((x - x0) / (x1 - x0) * 2 * math.pi) * 0.9
            X, Y = off + x * k, off + y * k
            ImageDraw.Draw(shadow).ellipse([X - r, Y + 6 * k - r, X + r, Y + 6 * k + r], fill=(120, 50, 0, 70))
            ImageDraw.Draw(layer).ellipse([X - r, Y - r, X + r, Y + r], fill=col + (255,))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10 * k))
    out = Image.alpha_composite(shadow, layer)
    return out.resize((size, size), Image.LANCZOS)


def square_icon(size, scale=1.0, round_mask=False):
    bg = gradient(size, size).convert("RGBA")
    img = Image.alpha_composite(bg, waves(size, scale))
    if round_mask:
        m = Image.new("L", (size * SS, size * SS), 0); ImageDraw.Draw(m).ellipse([0, 0, size * SS - 1, size * SS - 1], fill=255)
        img.putalpha(m.resize((size, size), Image.LANCZOS))
    return img


def splash(w, h):
    bg = gradient(w, h).convert("RGBA"); s = round(min(w, h) * 0.42)
    bg.alpha_composite(waves(s), ((w - s) // 2, (h - s) // 2))
    return bg.convert("RGB")


if __name__ == "__main__":
    square_icon(512).save("public/icon.png", optimize=True)
    dens = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
    for d, f in dens.items():
        base = f"{RES}/mipmap-{d}"
        square_icon(round(48 * f), 0.92).save(f"{base}/ic_launcher.png", optimize=True)
        square_icon(round(48 * f), 0.86, round_mask=True).save(f"{base}/ic_launcher_round.png", optimize=True)
        # Adaptives Symbol: 108 dp, sichtbar sicher sind nur die inneren 66 dp → Wellen auf ~60 % verkleinern
        waves(round(108 * f), 0.60).save(f"{base}/ic_launcher_foreground.png", optimize=True)
    for folder in sorted(os.listdir(RES)):
        p = f"{RES}/{folder}/splash.png"
        if folder.startswith("drawable") and os.path.exists(p):
            w, h = Image.open(p).size; splash(w, h).save(p, optimize=True)
    IOS = "ios/App/App/Assets.xcassets"
    if os.path.isdir(IOS):
        # iPhone: ein Symbol 1024 × 1024 ohne Transparenz (Ecken rundet iOS selbst), Startbild 2732 × 2732
        square_icon(1024, 0.92).convert("RGB").save(f"{IOS}/AppIcon.appiconset/AppIcon-512@2x.png", optimize=True)
        sp = splash(2732, 2732)
        for n in ("splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"):
            sp.save(f"{IOS}/Splash.imageset/{n}", optimize=True)
    print("ok: Symbole und Startbilder erzeugt")
