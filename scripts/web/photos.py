"""photos.html ızgarasını (3×3, 520×600) karelere ayırır → web/img/yemek-<ad>.webp. Sıra photos.html'deki IDS ile aynı."""
import sys
from pathlib import Path

from PIL import Image

PHOTOS = ['kebap', 'meze', 'kahvalti', 'esnaf', 'balik', 'tatli', 'doner', 'pilav', 'restoran']
src, out = sys.argv[1:]
im = Image.open(src).convert('RGB')
for i, name in enumerate(PHOTOS):
    x, y = (i % 3) * 520, (i // 3) * 600
    im.crop((x, y, x + 520, y + 600)).save(Path(out) / f'yemek-{name}.webp', 'WEBP', quality=82, method=6)
    print(f'web/img/yemek-{name}.webp')
