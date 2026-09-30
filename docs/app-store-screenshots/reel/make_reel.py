"""Puanla tanıtım Reels'i: layers/ altındaki şeffaf katmanları canlandırıp 1080×1920, 30 fps H.264 MP4 üretir.

Kullanım:  python make_reel.py            → out/puanla-reels.mp4
           python make_reel.py --kareler  → yalnızca kontrol kareleri (out/kare-*.png)
Katmanlar: bash render-layers.sh
"""
import sys
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

W, H, FPS = 1080, 1920, 30
ROOT = Path(__file__).parent
L = ROOT / 'layers'
OUT = ROOT / 'out'

# Sahneler: (ad, başlangıç, bitiş) saniye. Seslendirme metni SCRIPT.md ile aynı zamanlamada.
SCENES = [
    ('hookA', 0.0, 1.9),
    ('hookB', 1.9, 3.8),
    ('s1', 3.8, 7.6),    # Feed
    ('s2', 7.6, 11.8),   # Karşılaştır
    ('s3', 11.8, 15.4),  # Listem
    ('s4', 15.4, 18.6),  # Harita
    ('s5', 18.6, 20.4),  # Mekân: arkadaş puanları
    ('s7', 20.4, 22.2),  # Damak uyumu
    ('cta', 22.2, 26.5),
]
DURATION = SCENES[-1][2]

# Slayt katmanları 440 CSS px × 2,4545 = 1080 px genişlikte; telefon üstü slaytta y = 214 CSS px
SLIDE_SCALE = 1080 / 440
PHONE_TOP_SRC = 214 * SLIDE_SCALE
PHONE_SCALE = 0.8
PHONE_TOP_DST = 600
COPY_SHIFT = 150


def load(name):
    return Image.open(L / f'{name}.png').convert('RGBA')


def ease_out(x):
    x = min(1.0, max(0.0, x))
    return 1 - (1 - x) ** 3


def ease_back(x):
    x = min(1.0, max(0.0, x))
    c = 1.4
    return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2


def with_alpha(im, a):
    if a >= 0.999:
        return im
    arr = np.array(im)
    arr[..., 3] = (arr[..., 3].astype(np.float32) * max(0.0, a)).astype(np.uint8)
    return Image.fromarray(arr)


def paste(canvas, im, x, y):
    """Negatif ya da taşan konumlara da güvenle bindirir"""
    x, y = int(round(x)), int(round(y))
    sx, sy = max(0, -x), max(0, -y)
    ex, ey = min(im.width, W - x), min(im.height, H - y)
    if ex <= sx or ey <= sy:
        return
    canvas.alpha_composite(im.crop((sx, sy, ex, ey)), (x + sx, y + sy))


def scaled(im, s):
    return im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.BILINEAR)


# ---------- Katmanları yükle ----------
bg = load('bg')  # 1080×2200: yavaşça yukarı kayar
layers = {}
for name, *_ in SCENES:
    if name.startswith('s'):
        layers[name] = {
            'copy': load(f'{name}-copy'),
            'phone': scaled(load(f'{name}-phone'), PHONE_SCALE),
            'float': scaled(load(f'{name}-float'), PHONE_SCALE),
        }
    else:
        layers[name] = {'full': load(name)}


def scene_alpha(t, length, fade_in=0.3, fade_out=0.25, last=False):
    a = min(1.0, t / fade_in)
    if not last:
        a = min(a, (length - t) / fade_out)
    return max(0.0, a)


def frame(time):
    canvas = Image.new('RGBA', (W, H))
    pan = (bg.height - H) * time / DURATION
    canvas.alpha_composite(bg.crop((0, int(pan), W, int(pan) + H)))

    for idx, (name, start, end) in enumerate(SCENES):
        if not (start <= time < end or (idx == len(SCENES) - 1 and time >= start)):
            continue
        t, length = time - start, end - start
        last = idx == len(SCENES) - 1
        a = scene_alpha(t, length, last=last)
        exit_dy = 0 if last else -40 * max(0.0, 1 - (length - t) / 0.25)
        lay = layers[name]

        if 'full' in lay:  # açılış ve kapanış: tek katman, hafif büyüyerek gelir
            s = 0.94 + 0.06 * ease_out(t / 0.6) + 0.02 * (t / length)
            im = scaled(lay['full'], s)
            dy = 50 * (1 - ease_out(t / 0.6)) + exit_dy
            paste(canvas, with_alpha(im, a), (W - im.width) / 2, (H - im.height) / 2 + dy)
            continue

        # Başlık: yukarı kayarak belirir
        copy_a = a * min(1.0, t / 0.4)
        paste(canvas, with_alpha(lay['copy'], copy_a), 0, COPY_SHIFT + 40 * (1 - ease_out(t / 0.5)) + exit_dy)

        # Telefon: alttan kayar, sahne boyunca çok hafif yaklaşır
        zoom = 1 + 0.03 * (t / length)
        enter = ease_out((t - 0.05) / 0.6)
        dy = 300 * (1 - enter) + exit_dy
        for key, delay in (('phone', 0.0), ('float', 0.55)):
            im = lay[key]
            if zoom != 1:
                im = scaled(im, zoom)
            s = PHONE_SCALE * zoom
            x = W / 2 - (W / 2) * s
            y = PHONE_TOP_DST - PHONE_TOP_SRC * s + dy
            if key == 'float':  # yüzen kartlar telefondan sonra "pop" ile gelir
                p = ease_back((t - delay) / 0.45)
                if p <= 0:
                    continue
                y += 30 * (1 - p)
                la = a * min(1.0, (t - delay) / 0.25)
            else:
                la = a * min(1.0, t / 0.3)
            paste(canvas, with_alpha(im, la), x, y)
    return canvas


OUT.mkdir(exist_ok=True)
if '--kareler' in sys.argv:
    for sec in (1.0, 2.8, 5.5, 9.5, 13.5, 17.0, 19.6, 21.3, 24.5):
        frame(sec).convert('RGB').save(OUT / f'kare-{sec:04.1f}.png')
        print('kare', sec)
    sys.exit()

path = OUT / 'puanla-reels.mp4'
writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*'avc1'), FPS, (W, H))
total = int(round(DURATION * FPS))
for i in range(total):
    rgb = np.array(frame(i / FPS).convert('RGB'))
    writer.write(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    if i % 60 == 0:
        print(f'{i}/{total}', flush=True)
writer.release()
print('yazıldı:', path)
