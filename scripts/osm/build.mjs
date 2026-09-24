/**
 * İndirilen OSM verisini `places` tablosuna uygun satırlara çevirir.
 * - İlçe ve mahalle, OSM idari sınırlarına göre (nokta-çokgen içinde) bulunur; İstanbul dışı atılır.
 * - Kategori önce isimden (Türkçe anahtar kelimeler), sonra OSM `cuisine` etiketinden, en son türden çıkar.
 * - Mekân olmayan yerler (kıraathane, ekmek fırını, internet kafe…) ayıklanır.
 *
 * Çalıştırma: npm run places:build  → scripts/.cache/osm/places.json + özet
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { CACHE_DIR, CITY, DISTRICTS } from './config.mjs';

const readJson = (file) => JSON.parse(readFileSync(join(CACHE_DIR, file), 'utf8'));

/* ---------- Metin ---------- */

/** Küçük harf + Türkçe karakterleri sadeleştirir: "Çiğ Köfte" → "cig kofte" */
function fold(text) {
  const map = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };
  return text
    .toLocaleLowerCase('tr')
    .normalize('NFC')
    .replace(/[çğıöşüâîû]/g, (c) => map[c] ?? c)
    .replace(/̇/g, '');
}

const cleanName = (name) => name.replace(/\s+/g, ' ').trim();

/* ---------- Sınırlar ---------- */

/** İlişkinin üye yollarını kapalı halkalara birleştirir */
function rings(relation) {
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
function inside([x, y], polygon) {
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

function polygons(file, filter = () => true) {
  return readJson(file)
    .elements.filter(filter)
    .map((rel) => {
      const rs = rings(rel);
      const xs = rs.flat().map((p) => p[0]);
      const ys = rs.flat().map((p) => p[1]);
      return { name: rel.tags.name, rings: rs, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
    })
    .filter((p) => p.rings.length);
}

/* ---------- Kategori ---------- */

// İsimdeki anahtar kelimeler (fold edilmiş), ilk eşleşen kazanır: özelden genele
const NAME_RULES = [
  [/kokorec/, 'Kokoreççi'],
  [/\bciger/, 'Ciğerci'],
  [/cig ?kofte/, 'Çiğ köfteci'],
  [/kofte/, 'Köfteci'],
  [/meyhane/, 'Meyhane'],
  [/kahvalti|serpme|menemen/, 'Kahvaltıcı'],
  [/esnaf lokanta|ev yemek/, 'Esnaf lokantası'],
  [/balik|fish|midye/, 'Balıkçı'],
  [/doner/, 'Dönerci'],
  [/durum/, 'Dürümcü'],
  [/kebap|kebab|ocakbasi|tantuni/, 'Kebapçı'],
  [/\bpide|lahmacun/, 'Pideci'],
  [/pizza|pizzeria/, 'Pizzacı'],
  [/burger/, 'Burgerci'],
  [/dondurma|gelato|ice ?cream/, 'Dondurmacı'],
  [/baklava|kunefe|tatli|muhallebi|lokum|kadayif|sekerleme|chocolat|cikolata|gulluoglu|hafiz mustafa|saray muhallebi/, 'Tatlıcı'],
  [/pastane|patisser|patiser|pasta ?evi|borek|simit|firin|bakery|poaca|pogaca/, 'Pastane & fırın'],
  [/sushi|ramen|noodle|\bwok\b|chinese|cin lokanta|japon|japanese|korean|kore |thai|asian|dim ?sum/, 'Uzak Doğu'],
  [/lokanta/, 'Esnaf lokantası'],
  [/coffee|kahve|cafe|kafe|espresso/, 'Kafe'],
];

// OSM cuisine etiketi → kategori
const CUISINE_TAGS = {
  kebab: 'Kebapçı', turkish_kebab: 'Kebapçı', adana_kebab: 'Kebapçı', tantuni: 'Kebapçı',
  doner: 'Dönerci', döner: 'Dönerci',
  meatball: 'Köfteci', kofte: 'Köfteci', köfte: 'Köfteci',
  cig_kofte: 'Çiğ köfteci', çiğ_köfte: 'Çiğ köfteci',
  pide: 'Pideci', lahmacun: 'Pideci', turkish_pizza: 'Pideci',
  pizza: 'Pizzacı',
  burger: 'Burgerci',
  fish: 'Balıkçı', seafood: 'Balıkçı',
  breakfast: 'Kahvaltıcı',
  meyhane: 'Meyhane',
  ice_cream: 'Dondurmacı', frozen_yogurt: 'Dondurmacı', gelato: 'Dondurmacı',
  dessert: 'Tatlıcı', baklava: 'Tatlıcı', cake: 'Tatlıcı', chocolate: 'Tatlıcı', waffle: 'Tatlıcı', crepe: 'Tatlıcı',
  pastry: 'Pastane & fırın', bakery: 'Pastane & fırın', simit: 'Pastane & fırın', borek: 'Pastane & fırın', börek: 'Pastane & fırın',
  coffee_shop: 'Kafe', coffee: 'Kafe', tea: 'Kafe', bubble_tea: 'Kafe',
  sushi: 'Uzak Doğu', japanese: 'Uzak Doğu', chinese: 'Uzak Doğu', asian: 'Uzak Doğu', thai: 'Uzak Doğu',
  korean: 'Uzak Doğu', vietnamese: 'Uzak Doğu', noodle: 'Uzak Doğu', ramen: 'Uzak Doğu',
  italian: 'Dünya mutfağı', mexican: 'Dünya mutfağı', indian: 'Dünya mutfağı', french: 'Dünya mutfağı',
  greek: 'Dünya mutfağı', american: 'Dünya mutfağı', international: 'Dünya mutfağı', lebanese: 'Dünya mutfağı',
  georgian: 'Dünya mutfağı', arab: 'Dünya mutfağı', syrian: 'Dünya mutfağı', iranian: 'Dünya mutfağı',
  persian: 'Dünya mutfağı', russian: 'Dünya mutfağı', spanish: 'Dünya mutfağı', mediterranean: 'Dünya mutfağı',
  uzbek: 'Dünya mutfağı', azerbaijani: 'Dünya mutfağı', ukrainian: 'Dünya mutfağı', african: 'Dünya mutfağı',
  sandwich: 'Büfe & fast food', chicken: 'Büfe & fast food', fried_chicken: 'Büfe & fast food',
  toast: 'Büfe & fast food', hot_dog: 'Büfe & fast food', fast_food: 'Büfe & fast food', kumpir: 'Büfe & fast food',
  wrap: 'Büfe & fast food',
  turkish: 'Restoran', regional: 'Restoran', local: 'Restoran', steak_house: 'Restoran', grill: 'Restoran',
  homemade: 'Esnaf lokantası', home_cooking: 'Esnaf lokantası',
};

const TYPE_FALLBACK = {
  restaurant: 'Restoran',
  food_court: 'Restoran',
  cafe: 'Kafe',
  bar: 'Bar',
  pub: 'Bar',
  biergarten: 'Bar',
  ice_cream: 'Dondurmacı',
  fast_food: 'Büfe & fast food',
  pastry: 'Pastane & fırın',
  bakery: 'Pastane & fırın',
  confectionery: 'Tatlıcı',
};

function categorize(tags) {
  const name = fold(tags.name);
  const type = tags.amenity ?? tags.shop;
  // Bar/pub isimde "cafe" geçse bile bardır; kafeler isimden tür kazanabilir
  for (const [pattern, cuisine] of NAME_RULES) {
    if (!pattern.test(name)) continue;
    if (cuisine === 'Kafe' && type !== 'cafe') continue;
    return cuisine;
  }
  for (const value of (tags.cuisine ?? '').split(';')) {
    const cuisine = CUISINE_TAGS[fold(value.trim()).replace(/\s+/g, '_')];
    if (cuisine) return cuisine;
  }
  return TYPE_FALLBACK[type];
}

/* ---------- Ayıklama ---------- */

// Yeme-içme mekânı sayılmayan yerler (fold edilmiş isimde)
const EXCLUDE = /kiraathane|kahvehane|kahve ocagi|cay ocagi|cay bahcesi|internet|oyun salonu|playstation|nargile|hookah|okey|lokali\b|dernegi|kulubu|yemekhane|kantin|catering|tekel|market|bufe ve tekel|ambalaj|geri donusum| depo$/;
// Ekmek fırınlarını at, pastane/börekçi/simitçi kalsın
const BAKERY_KEEP = /pastane|patisser|patiser|pasta|borek|simit|cafe|kafe|poaca|pogaca|tatli|kurabiye|cikolata|kahvalti/;

function keep(tags) {
  if (!tags.name || cleanName(tags.name).length < 2) return false;
  if (tags.disused || tags['disused:amenity'] || tags.abandoned || tags.opening_hours === 'closed') return false;
  const name = fold(tags.name);
  if (EXCLUDE.test(name)) return false;
  if (tags.shop === 'bakery' && !BAKERY_KEEP.test(name)) return false;
  return true;
}

/* ---------- Ana akış ---------- */

function main() {
  const districts = polygons('districts.json', (r) => DISTRICTS.has(r.tags.name));
  const neighborhoods = polygons('neighborhoods.json');
  console.log(`${districts.length} ilçe, ${neighborhoods.length} mahalle sınırı`);

  const seen = new Set();
  const rows = [];
  const skipped = { outside: 0, filtered: 0, uncategorized: 0 };
  for (const file of readdirSync(join(CACHE_DIR, 'tiles'))) {
    for (const el of readJson(join('tiles', file))) {
      const id = `${el.type}/${el.id}`;
      if (seen.has(id)) continue; // kare sınırındaki yollar iki karede de gelir
      seen.add(id);
      const tags = el.tags ?? {};
      if (!keep(tags)) {
        skipped.filtered++;
        continue;
      }
      const lat = el.lat ?? el.center?.lat;
      const lon = el.lon ?? el.center?.lon;
      if (lat === undefined || lon === undefined) continue;
      const district = districts.find((d) => inside([lon, lat], d));
      if (!district) {
        skipped.outside++;
        continue;
      }
      const cuisine = categorize(tags);
      if (!cuisine) {
        skipped.uncategorized++;
        continue;
      }
      const neighborhood = neighborhoods.find((n) => inside([lon, lat], n))?.name.replace(/\s+Mahallesi$/i, '') ?? '';
      rows.push({
        source: 'osm',
        external_id: id,
        name: cleanName(tags.name).slice(0, 120),
        cuisine,
        neighborhood: neighborhood.slice(0, 80),
        district: district.name,
        city: CITY,
        latitude: Math.round(lat * 1e6) / 1e6,
        longitude: Math.round(lon * 1e6) / 1e6,
      });
    }
  }

  writeFileSync(join(CACHE_DIR, 'places.json'), JSON.stringify(rows));

  const count = (key) =>
    Object.entries(rows.reduce((acc, r) => ((acc[r[key]] = (acc[r[key]] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);
  console.log(`\n${rows.length} mekân hazır → scripts/.cache/osm/places.json`);
  console.log(`Atlanan: ${skipped.filtered} ayıklandı, ${skipped.outside} İstanbul dışı, ${skipped.uncategorized} kategorisiz`);
  console.log(`Mahallesi bulunamayan: ${rows.filter((r) => !r.neighborhood).length}`);
  console.log('\nKategoriler:');
  for (const [k, n] of count('cuisine')) console.log(`  ${k.padEnd(18)} ${n}`);
  console.log('\nİlçeler (ilk 10):');
  for (const [k, n] of count('district').slice(0, 10)) console.log(`  ${k.padEnd(18)} ${n}`);
}

main();
