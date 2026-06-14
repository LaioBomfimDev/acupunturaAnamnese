import json, os
from PIL import Image, ImageDraw, ImageFont

here = os.path.dirname(os.path.abspath(__file__))
maps_dir = os.path.join(here, '..', 'public', 'maps')
pts = json.load(open(os.path.join(here, 'qa-overlay-points.json'), encoding='utf-8'))

files = {
  'body_front': 'body-front.webp', 'body_back': 'body-back.webp',
  'legs_front': 'legs-front.webp', 'legs_back': 'legs-back.webp',
  'hands_palmar': 'hands-palmar.webp', 'hands_dorsal': 'hands-dorsal.webp',
  'feet_dorsal': 'feet-dorsal.webp', 'feet_plantar': 'feet-plantar.webp',
}
try:
    font = ImageFont.truetype("arial.ttf", 16)
except Exception:
    font = ImageFont.load_default()

out_dir = os.path.join(here, 'qa-overlays')
os.makedirs(out_dir, exist_ok=True)
for map_id, fname in files.items():
    img = Image.open(os.path.join(maps_dir, fname)).convert('RGB')
    d = ImageDraw.Draw(img)
    W, H = img.size
    for p in pts.get(map_id, []):
        x = p['xPct'] / 100 * W
        y = p['yPct'] / 100 * H
        r = 9
        d.ellipse([x-r, y-r, x+r, y+r], outline=(200, 0, 0), width=3, fill=(255, 220, 0))
        d.text((x+r+1, y-8), p['code'], fill=(150, 0, 0), font=font)
    out = os.path.join(out_dir, map_id + '.png')
    img.save(out)
    print('wrote', out, len(pts.get(map_id, [])))
