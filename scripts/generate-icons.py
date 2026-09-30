"""
Uygulama ikonu ve açılış görseli üretir (marka: lacivert zemin, beyaz serif "p", puan yeşili nokta).

Çalıştırma: python scripts/generate-icons.py
Çıktılar: assets/images/{icon,splash-icon,android-icon-foreground,android-icon-background,
          android-icon-monochrome,notification-icon,favicon}.png
Not: iOS ikonu saydamlık içeremez; köşe yuvarlatmayı sistem yapar (tam kare çizilir).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
FONT = 'C:/Windows/Fonts/georgiab.ttf'

NAVY = (15, 30, 61)          # colors.primary #0F1E3D
NAVY_LIGHT = (32, 56, 104)   # üst ışık
WHITE = (255, 255, 255)
GREEN = (30, 123, 60)        # 10 puan rengi #1E7B3C
GREEN_LIGHT = (101, 179, 46)


def gradient(size, top, bottom):
    img = Image.new('RGB', (size, size), bottom)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def draw_mark(size, fg, dot, scale=1.0, shadow=False):
    """Saydam zemin üzerine "p" + nokta işaretini çizer."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT, int(size * 0.66 * scale))
    text = 'p'
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    # "p" x-yüksekliği ve alt uzantısıyla birlikte optik merkez biraz yukarıda
    x = (size - w) / 2 - box[0] - size * 0.03 * scale
    y = (size - h) / 2 - box[1] - size * 0.02 * scale
    d.text((x, y), text, font=font, fill=fg)
    # Puan noktası: "p"nin sağ üstünde
    r = size * 0.085 * scale
    cx = x + box[0] + w + r * 0.55
    cy = y + box[1] + r * 0.9
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=dot)
    if shadow:
        blur = layer.filter(ImageFilter.GaussianBlur(size * 0.02))
        shade = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shade.paste((0, 0, 0, 70), mask=blur.split()[3])
        base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        base.alpha_composite(shade, (0, int(size * 0.012)))
        base.alpha_composite(layer)
        return base
    return layer


def notification_icon():
    """Android durum çubuğu bildirim simgesi: saydam zeminde beyaz silüet, 24 dp'yi dolduracak kadar büyük (96 px)"""
    mark = draw_mark(768, WHITE, WHITE)
    mark = mark.crop(mark.getbbox())
    side = round(max(mark.size) / 0.86)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    return square.resize((96, 96), Image.LANCZOS)


def main():
    # iOS / genel ikon (1024, opak)
    icon = gradient(1024, NAVY_LIGHT, NAVY).convert('RGBA')
    icon.alpha_composite(draw_mark(1024, WHITE, GREEN_LIGHT, shadow=True))
    icon.convert('RGB').save(ROOT / 'icon.png')

    # Açılış ekranı: beyaz zemin üzerinde lacivert işaret (saydam)
    splash = draw_mark(1024, NAVY, GREEN, scale=1.15)
    splash.crop(splash.getbbox()).save(ROOT / 'splash-icon.png')

    # Android uyarlanabilir ikon: güvenli alan için işaret küçültülür
    draw_mark(512, WHITE, GREEN_LIGHT, scale=0.62).save(ROOT / 'android-icon-foreground.png')
    gradient(512, NAVY_LIGHT, NAVY).save(ROOT / 'android-icon-background.png')
    draw_mark(512, WHITE, WHITE, scale=0.62).save(ROOT / 'android-icon-monochrome.png')

    notification_icon().save(ROOT / 'notification-icon.png')

    # Web favicon
    icon.convert('RGB').resize((48, 48), Image.LANCZOS).save(ROOT / 'favicon.png')
    print('ikonlar üretildi')


if __name__ == '__main__':
    main()
