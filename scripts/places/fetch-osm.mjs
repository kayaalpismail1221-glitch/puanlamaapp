/**
 * Bir ildeki yeme-içme mekânlarını OpenStreetMap'ten (Overpass API) indirir (il: config.mjs, `PLACES_CITY`).
 * Veri lisansı: ODbL — uygulamada "© OpenStreetMap katkıcıları" atfı gösterilmeli.
 *
 * Her kayıt son düzenlenme tarihiyle gelir (`out meta`).
 *
 * Önce ilin tamamı OSM il sınırıyla (ISO 3166-2) tek sorguda istenir; sunucu reddederse kutu 0,2°'lik karelere
 * bölünür (yine il sınırıyla kesişen kısım). Sonuç `scripts/.cache/osm…/tiles/` altına yazılır, yarıda kalırsa
 * kaldığı yerden devam eder. İlçe ve mahalle sınırları da aynı klasöre indirilir.
 * (İstanbul'un önbelleği eski, yalnızca kutuyla indirilmiş kareler; yenilenirse bu yolla iner.)
 *
 * Çalıştırma: PLACES_CITY=ankara npm run places:fetch  (yenilemek için önce o ilin önbellek klasörünü sil)
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { BBOX, CACHE_DIR, CITY, ISO } from './config.mjs';

const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TILE = 0.2;
const TILES_DIR = join(CACHE_DIR, 'tiles');

const PLACE_FILTER = `
  nwr["amenity"~"^(restaurant|fast_food|cafe|bar|pub|ice_cream|biergarten|food_court)$"]["name"];
  nwr["shop"~"^(pastry|bakery|confectionery)$"]["name"];
`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Overpass'a sorgu atar; sunucu meşgulse bekleyip (ve diğer sunucuyu deneyip) tekrarlar */
async function overpass(query, { maxsizeMb = 64, timeout = 90, attempts = 8 } = {}) {
  // Düşük timeout/maxsize, yoğun sunucunun sorguyu kabul etme şansını artırır
  const body = `[out:json][timeout:${timeout}][maxsize:${maxsizeMb * 1024 * 1024}];${query}`;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const endpoint = ENDPOINTS[attempt % ENDPOINTS.length];
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'User-Agent': 'Puanla-import/1.0', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: body }),
        signal: AbortSignal.timeout((timeout + 30) * 1000),
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

/** OSM'deki il sınırı (alan) */
const PROVINCE = `area["ISO3166-2"="${ISO}"]["admin_level"="4"]->.il;`;

async function fetchBoundaries() {
  for (const [level, file] of [
    [6, 'districts.json'],
    [8, 'neighborhoods.json'],
  ]) {
    const path = join(CACHE_DIR, file);
    if (existsSync(path)) continue;
    console.log(`${CITY}: sınırlar indiriliyor (admin_level=${level})…`);
    // Sınırı il alanına değen ilişkiler (komşu ilin sınır ilçeleri de gelir; ilçe listesi ayıklar)
    const json = await overpass(`${PROVINCE}rel(area.il)["boundary"="administrative"]["admin_level"="${level}"];out geom;`, {
      maxsizeMb: 512,
      timeout: 300,
    });
    writeFileSync(path, JSON.stringify(json));
  }
}

/** İlin tamamı tek sorguda; olmazsa null (karelere bölünür) */
async function fetchProvince() {
  const path = join(TILES_DIR, 'province.json');
  if (existsSync(path)) return true;
  console.log(`${CITY}: mekânlar tek sorguda isteniyor…`);
  try {
    const json = await overpass(`${PROVINCE}(${PLACE_FILTER.replaceAll(';', '(area.il);')});out center meta;`, {
      maxsizeMb: 256,
      timeout: 300,
      attempts: 3,
    });
    writeFileSync(path, JSON.stringify(json.elements));
    console.log(` → ${json.elements.length} mekân`);
    return true;
  } catch {
    console.log('\nTek sorgu olmadı, karelere bölünüyor.');
    return false;
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
    const json = await overpass(`${PROVINCE}(${PLACE_FILTER.replaceAll(';', `(${s},${w},${n},${e})(area.il);`)});out center meta;`);
    writeFileSync(path, JSON.stringify(json.elements));
    total += json.elements.length;
    console.log(` → ${json.elements.length} mekân`);
    await sleep(1000);
  }
  console.log(`Bitti. Bu çalıştırmada ${total} kayıt indirildi.`);
}

mkdirSync(CACHE_DIR, { recursive: true });
await fetchBoundaries();
mkdirSync(TILES_DIR, { recursive: true });
if (!(await fetchProvince())) await fetchTiles();
