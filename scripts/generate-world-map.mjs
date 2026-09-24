/**
 * Dünya haritası şeklini (ülke sınırlarıyla) tek bir SVG path'ine çevirir.
 * Kaynak: Natural Earth (world-atlas paketi, kamu malı).
 *
 * Çalıştırma: npm run generate:world-map
 * Çıktı: src/constants/world-map.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { feature } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';

import { MAP_HEIGHT, MAP_WIDTH, project } from '../src/lib/world-projection.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const topology = JSON.parse(readFileSync(join(root, 'node_modules/world-atlas/countries-50m.json'), 'utf8'));

// Küçük ayrıntıları at; kıyılar tanınır kalsın diye üçgen alanına göre sadeleştirilir
const SIMPLIFY_QUANTILE = 0.12; // noktaların yalnızca %12'si kalır (~100 KB)
const MIN_RING_SIZE = 0.8; // harita birimi; bundan küçük adacıklar çizilmez
const pre = presimplify(topology);
const simplified = simplify(pre, quantile(pre, SIMPLIFY_QUANTILE));
const countries = feature(simplified, simplified.objects.countries).features;

const ANTARCTICA = '010';
const round = (n) => Math.round(n * 10);

/**
 * 180. boylamı kesen halkalar (Rusya'nın doğu ucu, Fiji) tek parça kalsın diye batıdaki
 * noktaları +360° kaydırır; taşan kısım haritanın dışında kalır ve yatay çizgi oluşmaz.
 */
function unwrap(coords) {
  const crosses = coords.some(([a], i) => i > 0 && Math.abs(a - coords[i - 1][0]) > 180);
  return crosses ? coords.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : coords;
}

/** Halkayı göreli komutlarla yazar (onda bir birim hassasiyet) */
function ring(coords) {
  let prev = null;
  let out = '';
  for (const [lon, lat] of unwrap(coords)) {
    const { x, y } = project(lat, lon);
    const p = [round(x), round(y)];
    if (!prev) out += `M${p[0] / 10} ${p[1] / 10}`;
    else if (p[0] !== prev[0] || p[1] !== prev[1]) out += `l${(p[0] - prev[0]) / 10} ${(p[1] - prev[1]) / 10}`;
    prev = p;
  }
  return out + 'z';
}

let path = '';
for (const country of countries) {
  if (country.id === ANTARCTICA || !country.geometry) continue;
  const polygons = country.geometry.type === 'Polygon' ? [country.geometry.coordinates] : country.geometry.coordinates;
  for (const polygon of polygons) {
    for (const r of polygon) {
      if (r.length < 4) continue;
      const pts = r.map(([lon, lat]) => project(lat, lon));
      const w = Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x));
      const h = Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y));
      if (Math.max(w, h) >= MIN_RING_SIZE) path += ring(r);
    }
  }
}

const out = `/**
 * Dünya haritası şekli (ülkeler), Miller projeksiyonunda. Otomatik üretildi, elle düzenleme.
 * Üretmek için: npm run generate:world-map. Kaynak: Natural Earth (kamu malı).
 */

export const WORLD_MAP_SIZE = { width: ${MAP_WIDTH}, height: ${MAP_HEIGHT.toFixed(3)} };

export const WORLD_PATH =
  '${path}';
`;
writeFileSync(join(root, 'src/constants/world-map.ts'), out);
console.log(`world-map.ts: ${(out.length / 1024).toFixed(0)} KB, ${countries.length} ülke`);
