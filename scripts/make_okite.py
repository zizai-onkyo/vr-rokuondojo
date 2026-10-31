#!/usr/bin/env python3
"""Render the dojo precepts (心得) in brush calligraphy (TA風雅筆) to PNG, for the video callouts and the 心得 board.
Usage: uv run --with pillow --with fonttools python scripts/make_okite.py
Outputs: public/img/okite_w_N.png (white ink + shadow, for callouts over video), okite_d_N.png (sumi ink, for the board),
         okite_title_d.png / okite_title_w.png (「録音道場 心得」)
"""
import glob, os, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont

OKITE = [
    '一つ、マイクは喋る者の口元を狙うべし',
    '一つ、小声には寄り、大声には引くべし',
    '一つ、カメラの画角に入るべからず',
    '一つ、ブームの影をフレームに落とすべからず',
    '一つ、拾った音は己の耳で確かめるべし',
    '一つ、雑音源にマイクを向けるべからず',
]
TITLE = '録音道場　心得'

def find_font():
    cands = glob.glob(os.path.expanduser('~/Library/Application Support/Adobe/CoreSync/plugins/livetype/.r/.*.otf')) + glob.glob(os.path.expanduser('~/Library/Fonts/*.otf')) + glob.glob('/Library/Fonts/*.otf')
    for p in cands:
        try: names = {n.toUnicode() for n in TTFont(p, lazy=True)['name'].names if n.nameID in (1, 4)}
        except Exception: continue
        if 'TA風雅筆' in names or 'TA_fuga_fude' in names: return p
    raise SystemExit('TA風雅筆 not found')

path = find_font(); print('font:', path)
def render(text, color, out, size=150, pad=40, shadow=None):
    font = ImageFont.truetype(path, size)
    tmp = Image.new('RGBA', (10, 10)); d = ImageDraw.Draw(tmp)
    x0, y0, x1, y1 = d.textbbox((0, 0), text, font=font)
    W, H = x1 - x0 + pad * 2, y1 - y0 + pad * 2
    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    if shadow:
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).text((pad - x0 + 6, pad - y0 + 8), text, font=font, fill=shadow)
        img = Image.alpha_composite(img, sh.filter(ImageFilter.GaussianBlur(9)))
    ImageDraw.Draw(img).text((pad - x0, pad - y0), text, font=font, fill=color)
    os.makedirs(os.path.dirname(out), exist_ok=True); img.save(out); print('wrote', out, img.size)

for i, t in enumerate(OKITE, 1):
    render(t, (255, 255, 255, 255), f'public/img/okite_w_{i}.png', shadow=(0, 0, 0, 170))
    render(t, (30, 26, 24, 255), f'public/img/okite_d_{i}.png')
render(TITLE, (30, 26, 24, 255), 'public/img/okite_title_d.png', size=190)
render(TITLE, (255, 255, 255, 255), 'public/img/okite_title_w.png', size=190, shadow=(0, 0, 0, 170))
json.dump({'okite': OKITE, 'title': TITLE}, open('public/img/okite.json', 'w'), ensure_ascii=False, indent=2)
