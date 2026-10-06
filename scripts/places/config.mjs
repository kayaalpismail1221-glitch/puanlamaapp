import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '../..');

/**
 * Hangi il: `PLACES_CITY=ankara npm run places:…` ya da `--city=ankara` (varsayılan İstanbul).
 * İller `cities.json`'da: ad, ISO 3166-2 kodu (OSM il sınırı), kutu (Overture sorgusu), ilçeler (OSM yazımıyla).
 */
export const CITIES = JSON.parse(readFileSync(join(HERE, 'cities.json'), 'utf8'));
export const CITY_KEY = (process.argv.find((a) => a.startsWith('--city='))?.slice(7) ?? process.env.PLACES_CITY ?? 'istanbul')
  .trim()
  .toLowerCase();
if (!CITIES[CITY_KEY]) {
  throw new Error(`Bilinmeyen il "${CITY_KEY}". cities.json'dakiler: ${Object.keys(CITIES).join(', ')}`);
}
const config = CITIES[CITY_KEY];

export const CITY = config.city;
/** OSM il sınırı (admin_level 4) bu kodla bulunur */
export const ISO = config.iso;
/** İli kapsayan kutu (komşu il taşmaları ilçe listesiyle ayıklanır) */
export const BBOX = config.bbox;
/** İlin ilçeleri (OSM'deki yazımıyla) */
export const DISTRICTS = new Set(config.districts);

// İstanbul ilk il: önbelleği eski yerinde kalır; diğer iller kendi klasör/dosyalarında
const suffix = CITY_KEY === 'istanbul' ? '' : `-${CITY_KEY}`;
/** OSM kareleri ve idari sınırlar */
export const CACHE_DIR = join(ROOT, `scripts/.cache/osm${suffix}`);
/** fetch-overture.py çıktısı */
export const OVERTURE_FILE = join(ROOT, `scripts/.cache/overture/places${suffix}.json`);
/** build.mjs çıktısı, upload.mjs girdisi */
export const OUTPUT_FILE = join(ROOT, `scripts/.cache/places${suffix}.json`);
