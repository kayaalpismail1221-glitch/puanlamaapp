"""Google Play seti: render-play.py çıktısını Play kurallarına getirir ve denetler.
- Telefon görselleri: 1080×1920 (9:16), 24 bit PNG (alfa yok). Play: kenar 320–3840 px, uzun kenar ≤ 2 × kısa kenar.
- Tanıtım görseli: 1024×500, 24 bit PNG (2× çizimden küçültülür).
- `_onizleme.jpg`: 8'li set + tanıtım görseli (yüklemeden önce göz atmak için).
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).parent / 'out' / 'play'


def export():
    for f in sorted(OUT.glob('puanla-play-*.png')):
        im = Image.open(f).convert('RGB')
        if im.size != (1080, 1920):
            raise SystemExit(f'{f.name}: {im.size}, 1080×1920 bekleniyordu')
        im.save(f)
        print(f.name, im.size)

    src = OUT / 'feature-2x.png'
    if src.exists():
        im = Image.open(src).convert('RGB')
        if im.size != (2048, 1000):
            raise SystemExit(f'{src.name}: {im.size}, 2048×1000 bekleniyordu')
        im.resize((1024, 500), Image.LANCZOS).save(OUT / 'feature-graphic.png')
        src.unlink()
        print('feature-graphic.png', (1024, 500))

    shots = sorted(OUT.glob('puanla-play-*.png'), key=lambda p: int(p.stem.split('-')[-1]))[:8]
    if shots:
        w, h = 270, 480
        sheet = Image.new('RGB', (w * 4 + 50, h * 2 + 30 + 260), '#0b1426')
        for i, p in enumerate(shots):
            sheet.paste(Image.open(p).resize((w, h), Image.LANCZOS), (10 + (i % 4) * (w + 10), 10 + (i // 4) * (h + 10)))
        feature = OUT / 'feature-graphic.png'
        if feature.exists():
            sheet.paste(Image.open(feature).resize((500, 244), Image.LANCZOS), (10, h * 2 + 30))
        sheet.save(OUT / '_onizleme.jpg', quality=88)
        print('_onizleme.jpg')


if __name__ == '__main__':
    export()
