"""
Uygulama ikonu ve açılış görseli üretir (marka: lacivert zemin, beyaz serif "e" (Expeat)).

Çalıştırma: python scripts/generate-icons.py
Çıktılar: assets/images/{icon,splash-wordmark,splash-wordmark-blur,
          android-icon-foreground,android-icon-background,android-icon-monochrome,notification-icon,favicon}.png
Not: iOS ikonu saydamlık içeremez; köşe yuvarlatmayı sistem yapar (tam kare çizilir).
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent / 'assets' / 'images'
FONT = 'C:/Windows/Fonts/georgiab.ttf'

NAVY = (15, 30, 61)          # colors.primary #0F1E3D
NAVY_LIGHT = (32, 56, 104)   # üst ışık
WHITE = (255, 255, 255)


def gradient(size, top, bottom):
    img = Image.new('RGB', (size, size), bottom)
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def draw_mark(size, fg, scale=1.0, shadow=False):
    """Saydam zemin üzerine serif "e" işaretini çizer."""
    layer = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # "e" x-yüksekliğinde bir harf; ikonu doldurması için büyük çizilir
    font = ImageFont.truetype(FONT, int(size * 0.86 * scale))
    text = 'e'
    box = d.textbbox((0, 0), text, font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((size - w) / 2 - box[0], (size - h) / 2 - box[1]), text, font=font, fill=fg)
    if shadow:
        blur = layer.filter(ImageFilter.GaussianBlur(size * 0.02))
        shade = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        shade.paste((0, 0, 0, 70), mask=blur.split()[3])
        base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        base.alpha_composite(shade, (0, int(size * 0.012)))
        base.alpha_composite(layer)
        return base
    return layer


WORDMARK = 'Expeat'
# Yazı erirken geçilen bulanık kopya: kenar payı ve bulanıklık, yazı genişliğine oranla
BLUR_MARGIN = 0.06
BLUR_RADIUS = 0.022


def splash_wordmark(color, text=WORDMARK):
    """Açılış ekranının "expeat" yazısı: ikondaki "e" ile aynı yazı tipi, saydam zemin. Sistem açılış ekranı ve
    uygulamadaki açılış animasyonu (components/launch-intro) aynı dosyayı aynı genişlikte çizer; geçiş görünmez.
    Dikeyde x-yüksekliğinin ortası görselin ortasına gelir: "p"nin alt uzantısı ve "t"nin üstü dengelenir."""
    size = 400
    font = ImageFont.truetype(FONT, size)
    probe = ImageDraw.Draw(Image.new('L', (1, 1)))
    left, top, right, bottom = probe.textbbox((0, 0), text, font=font)
    _, x_top, _, x_bottom = probe.textbbox((0, 0), 'x', font=font)
    middle = (x_top + x_bottom) / 2
    half = max(middle - top, bottom - middle)
    pad = round(size * 0.04)
    width, height = right - left + 2 * pad, round(2 * half) + 2 * pad
    img = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    ImageDraw.Draw(img).text((pad - left, height / 2 - middle), text, font=font, fill=color)
    return img


def blurred(img):
    """Yazının bulanık kopyası: bulanıklık taşsın diye her yandan kenar payı eklenir (aynı merkez)"""
    margin = round(img.width * BLUR_MARGIN)
    canvas = Image.new('RGBA', (img.width + 2 * margin, img.height + 2 * margin), (0, 0, 0, 0))
    canvas.alpha_composite(img, (margin, margin))
    soft = canvas.filter(ImageFilter.GaussianBlur(img.width * BLUR_RADIUS))
    # Bulanık görselde ayrıntı yok: yarı çözünürlük yeter (dosya küçülür)
    return soft.resize((soft.width // 2, soft.height // 2), Image.LANCZOS)


def notification_icon():
    """Android durum çubuğu bildirim simgesi: saydam zeminde beyaz silüet, 24 dp'yi dolduracak kadar büyük (96 px)"""
    mark = draw_mark(768, WHITE)
    mark = mark.crop(mark.getbbox())
    side = round(max(mark.size) / 0.86)
    square = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    square.alpha_composite(mark, ((side - mark.width) // 2, (side - mark.height) // 2))
    return square.resize((96, 96), Image.LANCZOS)


def main():
    # iOS / genel ikon (1024, opak)
    icon = gradient(1024, NAVY_LIGHT, NAVY).convert('RGBA')
    icon.alpha_composite(draw_mark(1024, WHITE, shadow=True))
    icon.convert('RGB').save(ROOT / 'icon.png')

    # Açılış ekranı: her görünümde ikondaki gibi lacivert zeminde beyaz "Expeat" (app.json → expo-splash-screen);
    # animasyon aynı görsellerle devam eder (components/launch-intro)
    mark = splash_wordmark(WHITE)
    mark.save(ROOT / 'splash-wordmark.png')
    blurred(mark).save(ROOT / 'splash-wordmark-blur.png')
    print(f'açılış yazısı {mark.width}x{mark.height} (en/boy {mark.width / mark.height:.4f}), '
          f'bulanık kenar payı {BLUR_MARGIN}')

    # Android uyarlanabilir ikon: güvenli alan için işaret küçültülür
    draw_mark(512, WHITE, scale=0.62).save(ROOT / 'android-icon-foreground.png')
    gradient(512, NAVY_LIGHT, NAVY).save(ROOT / 'android-icon-background.png')
    draw_mark(512, WHITE, scale=0.62).save(ROOT / 'android-icon-monochrome.png')

    notification_icon().save(ROOT / 'notification-icon.png')

    # Web favicon
    icon.convert('RGB').resize((48, 48), Image.LANCZOS).save(ROOT / 'favicon.png')
    print('ikonlar üretildi')


if __name__ == '__main__':
    main()
