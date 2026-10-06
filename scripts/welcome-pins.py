"""
Karşılama haritasının süs pinlerini üretir → src/constants/welcome-map.ts. Pinler gerçek mekânların koordinatlarıdır
(scripts/.cache/places.json, `npm run places:build` çıktısı): hepsi karada, denize düşmez. Ad yok; puanlar süs (tohumlu).

- Genel pinler (stage 0): bütün alana seyrek (aralarında en az 700 m), her durakta görünür.
- Güven pinleri (stage 1): Güven durağı çevresinde sık; kamera Güven'e gelince belirir.
- Hatırla pinleri (stage 2): Hatırla durağı çevresinde sık; kamera Hatırla'ya gelince belirir.
- Simgeler: Güven'de 3 arkadaş, Hatırla'da her birinin (aynı sırayla) kayarak dönüştüğü 3 kaydet simgesi; yakınlarında
  pin yok.

Çalıştırma: python scripts/welcome-pins.py
"""
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BBOX = (40.975, 41.085, 28.965, 29.065)  # enlem, boylam aralığı (iki yaka)
TRUST = (41.0, 29.035)  # onboarding/index.tsx → CAMERAS.trust
REMEMBER = (41.011, 29.021)  # CAMERAS.remember
# Simgeler durak merkezinin kuzeyinde dağınık (haritanın üst kısmı; alt kısım degradeyle soluyor). Sıra eşleşir:
# i. arkadaş Güven → Hatırla geçişinde i. kaydet simgesine kayar (sağdaki sağdakine, soldaki soldakine)
FRIENDS_NEAR = [(41.0090, 29.0457), (41.0144, 29.0279), (41.0045, 29.0326)]
SAVES_NEAR = [(41.0173, 29.0270), (41.0209, 29.0139), (41.0146, 29.0198)]


def km(a, b):
    return math.hypot((a[0] - b[0]) * 111.0, (a[1] - b[1]) * 84.0)


def main():
    places = json.loads((ROOT / 'scripts/.cache/places.json').read_text(encoding='utf-8'))
    pts = [(p['latitude'], p['longitude']) for p in places
           if not p.get('weak') and BBOX[0] <= p['latitude'] <= BBOX[1] and BBOX[2] <= p['longitude'] <= BBOX[3]]
    rng = random.Random(7)
    rng.shuffle(pts)

    friends = [min(pts, key=lambda p: km(p, near)) for near in FRIENDS_NEAR]
    saves = [min(pts, key=lambda p: km(p, near)) for near in SAVES_NEAR]
    icons = friends + saves
    chosen = []

    def add(stage, near, radius, spacing, limit):
        n = 0
        for p in pts:
            if n >= limit:
                break
            if near and km(p, near) > radius:
                continue
            if any(km(p, icon) < 0.25 for icon in icons):
                continue
            if any(km(p, (c[0], c[1])) < spacing for c in chosen):
                continue
            chosen.append((p[0], p[1], stage))
            n += 1

    add(0, None, 0, 0.7, 42)
    add(1, TRUST, 1.7, 0.26, 10)
    add(2, REMEMBER, 1.2, 0.26, 12)

    def score():
        high = rng.random() < 0.82
        return round(6.8 + rng.random() * 3.2 if high else 3 + rng.random() * 3.6, 1)

    pin_rows = [
        f'  {{ latitude: {lat:.5f}, longitude: {lng:.5f}, score: {score()}, stage: {stage} }},'
        for lat, lng, stage in chosen
    ]
    hero_rows = [
        f'  {{ friend: {{ latitude: {f[0]:.5f}, longitude: {f[1]:.5f} }}, '
        f'save: {{ latitude: {v[0]:.5f}, longitude: {v[1]:.5f} }} }},'
        for f, v in zip(friends, saves)
    ]
    lines = [
        '/**',
        ' * Karşılama haritasının süs pinleri ve simgeleri (`app/onboarding/index.tsx`). Üretici: `python scripts/welcome-pins.py`',
        ' * (gerçek mekânların koordinatları, hepsi karada; ad yok, puanlar süs). `stage`: 0 her durakta, 1 Güven\'e gelince,',
        ' * 2 Hatırla\'ya gelince belirir.',
        ' */',
        'export type WelcomePin = { latitude: number; longitude: number; score: number; stage: 0 | 1 | 2 };',
        '',
        'export const WELCOME_PINS: WelcomePin[] = [',
        *pin_rows,
        '];',
        '',
        '/** Güven\'deki arkadaş simgeleri ve Hatırla\'da her birinin (aynı sırayla) kayarak dönüştüğü kaydet simgeleri */',
        'export const WELCOME_HEROES = [',
        *hero_rows,
        '];',
        '',
    ]
    (ROOT / 'src/constants/welcome-map.ts').write_text('\n'.join(lines), encoding='utf-8')
    counts = {s: sum(1 for c in chosen if c[2] == s) for s in (0, 1, 2)}
    print(f'src/constants/welcome-map.ts: {len(chosen)} pin {counts}, {len(friends)} arkadaş → kaydet')


if __name__ == '__main__':
    main()
