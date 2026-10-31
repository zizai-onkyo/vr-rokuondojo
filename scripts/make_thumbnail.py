#!/usr/bin/env python3
"""Compose the 16:9 award thumbnail from an in-game screenshot.
Usage: uv run --with pillow python scripts/make_thumbnail.py recordings/thumb_raw.png docs/deliverables/VR_Rokuondo.png
"""
import sys, os
from PIL import Image, ImageDraw, ImageFont

src, dst = sys.argv[1], sys.argv[2]
W, H = 1920, 1080
img = Image.open(src).convert('RGB').resize((W, H), Image.LANCZOS)

# top and bottom gradients so text reads on any background; faces stay in the clear middle band
mask = Image.new('L', (W, H), 0)
md = ImageDraw.Draw(mask)
TOP, BOT = 330, 300
for y in range(TOP): md.line([(0, y), (W, y)], fill=int(215 * (1 - y / TOP) ** 1.3))
for y in range(H - BOT, H): md.line([(0, y), (W, y)], fill=int(215 * ((y - (H - BOT)) / BOT) ** 1.3))
img = Image.composite(Image.new('RGB', (W, H), (5, 6, 9)), img, mask)

def font(size, weight='W8'):
    for p in [f'/System/Library/Fonts/ヒラギノ角ゴシック {weight}.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']:
        try: return ImageFont.truetype(p, size)
        except Exception: pass
    return ImageFont.load_default()

# brush-calligraphy logo (rendered from TA風雅筆 by scripts/make_logo.py)
logo = Image.open('public/img/logo_white.png').convert('RGBA')
LW = 1180; logo = logo.resize((LW, int(LW * logo.height / logo.width)), Image.LANCZOS)
img.paste(logo, (60, 22), logo)
d = ImageDraw.Draw(img)
d.text((86, 22 + logo.height + 6), '映画の現場で、セリフを録る  —  VR Rokuon Dōjō', font=font(40, 'W6'), fill=(210, 222, 235))
d.text((80, 842), '喋っている役者の口元を狙え。', font=font(74, 'W8'), fill=(255, 255, 255))
d.text((84, 946), '画角に入らず、影を落とさず、雑音に向けず、できるだけ近く。', font=font(48, 'W6'), fill=(226, 232, 240))
tag = '● REC'
tw = d.textlength(tag, font=font(34, 'W6'))
d.rounded_rectangle([W - 80 - tw - 48, 930, W - 80, 930 + 70], radius=14, fill=(200, 48, 40))
d.text((W - 80 - tw - 24, 930 + 13), tag, font=font(34, 'W6'), fill=(255, 255, 255))
os.makedirs(os.path.dirname(dst), exist_ok=True)
img.save(dst, 'PNG')
print('wrote', dst, img.size)
