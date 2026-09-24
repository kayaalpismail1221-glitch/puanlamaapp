/**
 * İstanbul'daki yeme-içme mekânlarını OpenStreetMap'ten (Overpass API) indirir.
 * Veri lisansı: ODbL — uygulamada "© OpenStreetMap katkıcıları" atfı gösterilmeli.
 *
 * Overpass tek büyük sorguyu reddettiği için şehir 0,2°'lik karelere bölünür; her kare
 * `scripts/.cache/osm/tiles/` altına yazılır, yarıda kalırsa kaldığı yerden devam eder.
 * İlçe ve mahalle sınırları da aynı klasöre indirilir.
 *
 * Çalıştırma: npm run places:fetch  (yenilemek için önce scripts/.cache/osm klasörünü sil)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BBOX, CACHE_DIR } from './config.mjs';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TILE = 0.2;
const TILES_DIR = join(CACHE_DIR, 'tiles');

const PLACE_FILTER = `
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|biergarten|food_court)$"]["name"];
  nwr["shop"~"^(pastry|bakery|confectionery)$"]["name"];
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Overpass'a sorgu atar; sunucu meşgulse bekleyip (ve diğer sunucuyu deneyip) tekrarlar */
async function overpass(query, maxsizeMb = 64) {
  // Düşük timeout/maxsize, yoğun sunucunun sorguyu kabul etme şansını artırır
  const body = `[out:json][timeout:90][maxsize:${maxsizeMb * 1024 * 1024}];${query}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': 'Puanla-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: body }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith('{')) {
        const json = JSON.parse(text);
        // Sunucu zaman aşımında bile 200 dönebilir; bu durumda "remark" alanı dolu olur
        if (!json.remark?.includes('error')) return json;
      }
    } catch {
      // ağ hatası: tekrar dene
    }
    // Overpass IP başına ~4 sorgu hakkı verir, sonra 1-2 dk bekletir
    const wait = 30_000 * (attempt + 1);
    process.stdout.write(` (meşgul, ${wait / 1000} sn sonra tekrar)`);
    await sleep(wait);
  }
  throw new Error('Overpass yanıt vermedi');
}

async function fetchBoundaries() {
  const bbox = `(${BBOX.south},${BBOX.west},${BBOX.north},${BBOX.east})`;
  for (const [level, file] of [
    [6, 'districts.json'],
    [8, 'neighborhoods.json'],
  ]) {
    const path = join(CACHE_DIR, file);
    if (existsSync(path)) continue;
    console.log(`Sınırlar indiriliyor (admin_level=${level})…`);
    const json = await overpass(`rel["boundary"="administrative"]["admin_level"="${level}"]${bbox};out geom;`, 256);
    writeFileSync(path, JSON.stringify(json));
  }
}

async function fetchTiles() {
  mkdirSync(TILES_DIR, { recursive: true });
  const tiles = [];
  for (let s = BBOX.south; s < BBOX.north - 1e-9; s += TILE) {
    for (let w = BBOX.west; w < BBOX.east - 1e-9; w += TILE) {
      tiles.push([+s.toFixed(2), +w.toFixed(2), +Math.min(s + TILE, BBOX.north).toFixed(2), +Math.min(w + TILE, BBOX.east).toFixed(2)]);
    }
  }
  let total = 0;
  for (const [i, [s, w, n, e]] of tiles.entries()) {
    const path = join(TILES_DIR, `${s}_${w}.json`);
    if (existsSync(path)) continue;
    process.stdout.write(`Kare ${i + 1}/${tiles.length} (${s}, ${w})`);
    const json = await overpass(`(${PLACE_FILTER.replaceAll(';', `(${s},${w},${n},${e});`)});out center tags;`);
    writeFileSync(path, JSON.stringify(json.elements));
    total += json.elements.length;
    console.log(` → ${json.elements.length} mekân`);
    await sleep(1000);
  }
  console.log(`Bitti. Bu çalıştırmada ${total} kayıt indirildi.`);
}

mkdirSync(CACHE_DIR, { recursive: true });
await fetchBoundaries();
await fetchTiles();
