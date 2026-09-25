/**
 * Lezzet haritasının şekilleri: kara (kıyı çizgisiyle dolgu) ve ülke sınırları, iki çözünürlükte.
 * - Dünya: Natural Earth 1:50m, sadeleştirilmiş (uzak görünümler için hafif)
 * - Bölge: Natural Earth 1:10m, Avrupa–Türkiye–Orta Doğu dikdörtgenine kırpılmış (yakın görünümde
 *   Marmara, Ege adaları, Boğaz gibi ayrıntılar tırtıksız görünsün)
 * Kaynak: Natural Earth (world-atlas paketi, kamu malı).
 *
 * Çalıştırma: npm run generate:world-map
 * Çıktı: src/constants/world-map.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { feature, mesh } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';

import { MAP_HEIGHT, MAP_WIDTH, project } from '../src/lib/world-projection.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const load = (name) => JSON.parse(readFileSync(join(root, `node_modules/world-atlas/${name}.json`), 'utf8'));

/** Bölge dikdörtgeni (derece): İspanya'dan İran'a, Kuzey Afrika'dan İskandinavya'ya */
const REGION = { west: -12, east: 62, south: 24, north: 66 };

const ANTARCTICA = '010';
const round = (n) => Math.round(n * 10);

/** 180. boylamı kesen halkalar tek parça kalsın diye batıdaki noktaları +360° kaydırır */
function unwrap(coords) {
  const crosses = coords.some(([a], i) => i > 0 && Math.abs(a - coords[i - 1][0]) > 180);
  return crosses ? coords.map(([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat]) : coords;
}

/** Noktaları göreli komutlarla yazar (onda bir birim hassasiyet); `close` halkayı kapatır */
function toPath(points, close) {
  let prev = null;
  let out = '';
  for (const { x, y } of points) {
    const p = [round(x), round(y)];
    if (!prev) out += `M${p[0] / 10} ${p[1] / 10}`;
    else if (p[0] !== prev[0] || p[1] !== prev[1]) out += `l${(p[0] - prev[0]) / 10} ${(p[1] - prev[1]) / 10}`;
    prev = p;
  }
  return out ? out + (close ? 'z' : '') : '';
}

const projectAll = (coords) => unwrap(coords).map(([lon, lat]) => project(lat, lon));

const size = (pts) =>
  Math.max(
    Math.max(...pts.map((p) => p.x)) - Math.min(...pts.map((p) => p.x)),
    Math.max(...pts.map((p) => p.y)) - Math.min(...pts.map((p) => p.y)),
  );

/* ---------- Dikdörtgene kırpma (harita biriminde) ---------- */

const regionBox = (() => {
  const a = project(REGION.north, REGION.west);
  const b = project(REGION.south, REGION.east);
  return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
})();

const at = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Sutherland–Hodgman: kapalı halkayı dikdörtgene kırpar (kenarda kalan düz parçalar görünümün dışında) */
function clipRing(points, box) {
  const edges = [
    [(p) => p.x >= box.x0, (a, b) => at(a, b, (box.x0 - a.x) / (b.x - a.x))],
    [(p) => p.x <= box.x1, (a, b) => at(a, b, (box.x1 - a.x) / (b.x - a.x))],
    [(p) => p.y >= box.y0, (a, b) => at(a, b, (box.y0 - a.y) / (b.y - a.y))],
    [(p) => p.y <= box.y1, (a, b) => at(a, b, (box.y1 - a.y) / (b.y - a.y))],
  ];
  let out = points;
  for (const [inside, cross] of edges) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i++) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
    if (!out.length) return [];
  }
  return out;
}

/** Açık çizgiyi dikdörtgenin içinde kalan parçalara böler */
function clipLine(points, box) {
  const inside = (p) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
  const parts = [];
  let cur = [];
  for (const p of points) {
    if (inside(p)) cur.push(p);
    else if (cur.length) {
      parts.push(cur);
      cur = [];
    }
  }
  if (cur.length) parts.push(cur);
  return parts.filter((part) => part.length > 1);
}

/* ---------- Şekiller ---------- */

function build({ source, keep, minRing, clip }) {
  const topo = load(source);
  const pre = presimplify(topo);
  const simple = simplify(pre, quantile(pre, keep));

  let land = '';
  for (const f of feature(simple, simple.objects.countries).features) {
    if (f.id === ANTARCTICA || !f.geometry) continue;
    const polygons = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    for (const polygon of polygons) {
      for (const r of polygon) {
        if (r.length < 4) continue;
        let pts = projectAll(r);
        if (size(pts) < minRing) continue;
        if (clip) pts = clipRing(pts, clip);
        if (pts.length > 2) land += toPath(pts, true);
      }
    }
  }

  // Yalnızca iki ülke arasındaki sınırlar (kıyılar kara şeklinin kenarından çizilir)
  let borders = '';
  const lines = mesh(simple, simple.objects.countries, (a, b) => a !== b);
  for (const line of lines.coordinates) {
    const pts = projectAll(line);
    for (const part of clip ? clipLine(pts, clip) : [pts]) borders += toPath(part, false);
  }
  return { land, borders };
}

const world = build({ source: 'countries-50m', keep: 0.14, minRing: 0.8 });
const region = build({ source: 'countries-10m', keep: 0.22, minRing: 0.15, clip: regionBox });

const out = `/**
 * Lezzet haritası şekilleri, Miller projeksiyonunda. Otomatik üretildi, elle düzenleme.
 * Üretmek için: npm run generate:world-map. Kaynak: Natural Earth (kamu malı).
 */

export const WORLD_MAP_SIZE = { width: ${MAP_WIDTH}, height: ${MAP_HEIGHT.toFixed(3)} };

/** Dünya (1:50m): kara ve ülke sınırları */
export const WORLD_LAND = '${world.land}';
export const WORLD_BORDERS = '${world.borders}';

/** Ayrıntılı bölge (1:10m); görünüm tamamen bu dikdörtgenin içindeyse kullanılır (harita birimi) */
export const REGION_BOX = { x: ${regionBox.x0.toFixed(1)}, y: ${regionBox.y0.toFixed(1)}, width: ${(regionBox.x1 - regionBox.x0).toFixed(1)}, height: ${(regionBox.y1 - regionBox.y0).toFixed(1)} };
export const REGION_LAND = '${region.land}';
export const REGION_BORDERS = '${region.borders}';
`;
writeFileSync(join(root, 'src/constants/world-map.ts'), out);
const kb = (s) => (s.length / 1024).toFixed(0);
console.log(
  `world-map.ts: ${kb(out)} KB (dünya kara ${kb(world.land)} + sınır ${kb(world.borders)}, bölge kara ${kb(region.land)} + sınır ${kb(region.borders)})`,
);
