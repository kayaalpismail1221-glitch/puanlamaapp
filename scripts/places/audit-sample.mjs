/**
 * Doğruluk ölçümü için rastgele örneklem: build çıktısından kaynak türüne göre katmanlı (varsayılan 20 yalnızca
 * Overture, 10 yalnızca OSM, 20 ikisi), her mekân için konuma odaklı Google Haritalar araması. Mekânlar elle
 * (ya da tarayıcıyla) kontrol edilir: var mı, açık mı, adres/telefon/konum tutuyor mu. Google verisi yalnızca
 * karşılaştırma içindir, veritabanına yazılmaz (kalıcı saklanamaz).
 *
 * 2026-09-26 ölçümleri: gevşek kurallarla 50'de 25 tam doğru; bkz. CLAUDE.md "Mekân verisi".
 *
 * Çalıştırma: npm run places:audit -- [tohum] [overture osm ikisi]   ör. npm run places:audit -- 7 20 10 20
 */
import { readFileSync } from 'node:fs';

import { OUTPUT_FILE } from './config.mjs';

const [seedArg = '1', ...counts] = process.argv.slice(2);
const [nOverture = 20, nOsm = 10, nBoth = 20] = counts.map(Number);

let seed = Number(seedArg) * 2654435761 % 2147483648 || 1;
const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

const rows = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
const kind = (r) => {
  const sources = new Set(r.sources.map((s) => s.source));
  return sources.size > 1 ? 'ikisi' : [...sources][0];
};

function pick(k, n) {
  const pool = rows.filter((r) => kind(r) === k);
  const chosen = new Set();
  while (chosen.size < Math.min(n, pool.length)) chosen.add(Math.floor(random() * pool.length));
  return [...chosen].map((i) => pool[i]);
}

const sample = [...pick('overture', nOverture), ...pick('osm', nOsm), ...pick('ikisi', nBoth)];
sample.forEach((r, i) => {
  const url = `https://www.google.com/maps/search/${encodeURIComponent(r.name)}/@${r.latitude},${r.longitude},18z?hl=tr`;
  console.log(`${i + 1}. [${kind(r)}] ${r.name} | ${r.address || '—'} | ${r.district} | ${r.phone ?? '—'}\n   ${url}`);
});
