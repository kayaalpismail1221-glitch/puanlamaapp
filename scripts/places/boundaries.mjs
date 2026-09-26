/**
 * OSM idari sınırları (Overpass `out geom` çıktısı): ilişkinin yollarını halkalara birleştirir,
 * nokta-çokgen testi yapar. Veritabanındaki `admin_areas` aynı ilişkilerden kurulur (upload.mjs).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { CACHE_DIR, DISTRICTS } from './config.mjs';

export const readBoundaries = (file) => JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8')).elements;

/** İlişkinin üye yollarını kapalı halkalara birleştirir */
export function rings(relation) {
  const segments = relation.members
    .filter((m) => m.type === 'way' && m.geometry?.length > 1)
    .map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const key = ([x, y]) => `${x},${y}`;
  const result = [];
  while (segments.length) {
    let ring = segments.shift();
    let closed = key(ring[0]) === key(ring.at(-1));
    while (!closed) {
      const end = key(ring.at(-1));
      const i = segments.findIndex((s) => key(s[0]) === end || key(s.at(-1)) === end);
      if (i === -1) break; // eksik parça: olduğu kadarıyla kapat
      const [next] = segments.splice(i, 1);
      ring = ring.concat((key(next[0]) === end ? next : next.reverse()).slice(1));
      closed = key(ring[0]) === key(ring.at(-1));
    }
    if (ring.length >= 4) result.push(ring);
  }
  return result;
}

/** Çift-tek kuralı: iç halkalar (delikler) kendiliğinden hariç kalır */
export function inside([x, y], polygon) {
  if (x < polygon.box[0] || x > polygon.box[2] || y < polygon.box[1] || y > polygon.box[3]) return false;
  let hit = false;
  for (const ring of polygon.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
  }
  return hit;
}

export function toPolygon(relation) {
  const rs = rings(relation);
  if (!rs.length) return null;
  const xs = rs.flat().map((p) => p[0]);
  const ys = rs.flat().map((p) => p[1]);
  return {
    id: relation.id,
    name: relation.tags.name,
    relation,
    rings: rs,
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

/** İstanbul'un 39 ilçesi */
export function districtPolygons() {
  return readBoundaries('districts.json')
    .filter((r) => DISTRICTS.has(r.tags.name))
    .map(toPolygon)
    .filter(Boolean);
}

/** Noktanın ilçesi; sınırın hemen dışındaki (iskele, sahil) noktalar için ~300 m tolerans */
export function districtAt(districts, lon, lat) {
  const exact = districts.find((d) => inside([lon, lat], d));
  if (exact) return exact;
  const step = 0.003;
  for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
    const near = districts.find((d) => inside([lon + dx, lat + dy], d));
    if (near) return near;
  }
  return null;
}

/** Noktanın çokgene uzaklığı (km); içindeyse 0. Kısa mesafede eşdikdörtgen yaklaşımı */
export function distanceToPolygonKm([x, y], polygon) {
  if (inside([x, y], polygon)) return 0;
  const kx = 111.32 * Math.cos((y * Math.PI) / 180);
  const ky = 110.57;
  let best = Infinity;
  for (const ring of polygon.rings) {
    for (let i = 1; i < ring.length; i++) {
      const [ax, ay] = ring[i - 1];
      const [bx, by] = ring[i];
      const dx = (bx - ax) * kx;
      const dy = (by - ay) * ky;
      const px = (x - ax) * kx;
      const py = (y - ay) * ky;
      const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)));
      best = Math.min(best, Math.hypot(px - t * dx, py - t * dy));
    }
  }
  return best;
}
