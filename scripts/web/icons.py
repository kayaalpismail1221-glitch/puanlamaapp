"""Web sitesi ikonları: uygulama ikonundan (assets/images/icon.png) favicon, apple-touch-icon ve köşesi yuvarlak ikon."""
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
web = root / 'web'
(web / 'img').mkdir(parents=True, exist_ok=True)
icon = Image.open(root / 'assets/images/icon.png').convert('RGB')


def rounded(size, radius=0.225):
    im = icon.resize((size * 4, size * 4), Image.LANCZOS)
    mask = Image.new('L', im.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *im.size), radius=int(im.size[0] * radius), fill=255)
    im.putalpha(mask)
    return im.resize((size, size), Image.LANCZOS)


icon.resize((180, 180), Image.LANCZOS).save(web / 'apple-touch-icon.png')  # iOS köşeleri kendisi yuvarlar
rounded(192).save(web / 'img/icon-192.png')
rounded(512).save(web / 'img/icon-512.png')
rounded(64).save(web / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print('web/apple-touch-icon.png, web/favicon.ico, web/img/icon-192.png, web/img/icon-512.png')
