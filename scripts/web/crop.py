"""shots.sh çıktısını kırpar → web/img/ekran-N.webp + web/img/ekran.json (boyutlar; build.mjs okur).
Tüm görseller aynı yükseklikte (telefonlar aynı ölçekte görünür) ve telefon yatayda ortada kalır."""
import json
import sys
from pathlib import Path

from PIL import Image

raw, out, *ns = sys.argv[1:]
ims = {n: Image.open(Path(raw) / f's{n}.png').convert('RGBA') for n in ns}
boxes = {n: im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox() for n, im in ims.items()}
top = min(b[1] for b in boxes.values())
bottom = max(b[3] for b in boxes.values())
meta_path = Path(out) / 'ekran.json'
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
for n, im in ims.items():
    l, _, r, _ = boxes[n]
    cx = im.width // 2
    half = max(cx - l, r - cx)
    crop = im.crop((cx - half, top, cx + half, bottom))
    crop.save(Path(out) / f'ekran-{n}.webp', 'WEBP', quality=86, method=6)
    meta[n] = list(crop.size)
    print(f'web/img/ekran-{n}.webp', crop.size)
meta_path.write_text(json.dumps(dict(sorted(meta.items())), indent=1) + '\n')
