#!/usr/bin/env python3
"""Render the brush-calligraphy title logo with the TA風雅筆 font (Adobe Fonts activation on this Mac) to PNG.
Usage: uv run --with pillow --with fonttools python scripts/make_logo.py
Outputs: public/img/logo_white.png (transparent, white ink), public/img/logo_dark.png (transparent, sumi ink)
"""
import glob, os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

TITLE = 'VR録音道場'
def find_font():
    cands = glob.glob(os.path.expanduser('~/Library/Application Support/Adobe/CoreSync/plugins/livetype/.r/.*.otf')) + glob.glob(os.path.expanduser('~/Library/Fonts/*.otf')) + glob.glob('/Library/Fonts/*.otf')
    for p in cands:
        try:
            names = {n.toUnicode() for n in TTFont(p, lazy=True)['name'].names if n.nameID in (1, 4)}
        except Exception: continue
        if 'TA風雅筆' in names or 'TA_fuga_fude' in names: return p
    raise SystemExit('TA風雅筆 not found')

path = find_font(); print('font:', path)
def render(color, out, size=420, pad=60, shadow=None):
    font = ImageFont.truetype(path, size)
    tmp = Image.new('RGBA', (10, 10)); d = ImageDraw.Draw(tmp)
    x0, y0, x1, y1 = d.textbbox((0, 0), TITLE, font=font)
    W, H = x1 - x0 + pad * 2, y1 - y0 + pad * 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).text((pad - x0 + 10, pad - y0 + 12), TITLE, font=font, fill=shadow)
        img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(14)))
    ImageDraw.Draw(img).text((pad - x0, pad - y0), TITLE, font=font, fill=color)
    os.makedirs(os.path.dirname(out), exist_ok=True); img.save(out); print('wrote', out, img.size)
render((255, 255, 255, 255), 'public/img/logo_white.png', shadow=(0, 0, 0, 160))
render((28, 24, 22, 255), 'public/img/logo_dark.png')
