/**
 * OSM ve Overture kayıtlarını tek mekân listesine birleştirir.
 *
 * 1. Her kaynaktan aday: isim temizlenir (büyük harf, emoji, Latin olmayan yazı), mekân olmayanlar ayıklanır,
 *    ilçe OSM sınırlarından bulunur (İstanbul dışı atılır), adres/telefon/web tek biçime getirilir.
 * 2. Aynı mekânın kayıtları birleşir: yakın (≤ 60 m, aynı telefonla ≤ 250 m) ve benzer adlı kayıtlar.
 *    Aynı kaynağın iki kaydı birleşmez (OSM'de iki ayrı düğüm iki ayrı mekândır); kapı numarası farklı
 *    kayıtlar da birleşmez (aynı zincirin komşu şubeleri).
 * 3. Konum, ad, adres, telefon önce Overture'dan (güncel), eksikler OSM'den; tür önce OSM'den.
 * 4. Yalnızca Overture'da olan, güveni düşük kayıtlar atılır (kapanmış/sahte sayfa riski).
 *
 * Mahalle burada hesaplanmaz: veritabanı her mekânın il/ilçe/mahallesini koordinattan kendisi yazar.
 * Çalıştırma: npm run places:build  → scripts/.cache/places.json + özet
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { districtAt, districtPolygons, distanceToPolygonKm } from './boundaries.mjs';
import { CACHE_DIR, CITY, OUTPUT_FILE, OVERTURE_FILE } from './config.mjs';
import {
  buildDiacriticDictionary,
  categorize,
  cleanName,
  distanceMeters,
  fold,
  formatAddress,
  isVenueName,
  normalizePhone,
  normalizeWebsite,
  osmAddress,
  OSM_TYPES,
  overtureCategory,
  restoreTurkish,
  similarNames,
} from './lib.mjs';

/**
 * Yalnızca Overture'da olan kayıtlar için en düşük güven (0–1). Google'la 50 mekânlık karşılaştırmada
 * (2026-09-26) Meta kayıtlarında 0,75 altı 7'de 1 doğru, üstü 10'da 8 doğru çıktı.
 */
const MIN_CONFIDENCE = 0.75;
/** Kaynağın bildirdiği ilçe pinin ilçesinden farklıysa, pin o ilçeye en fazla bu kadar uzak olabilir (sınır komşuluğu) */
const CLAIMED_DISTRICT_KM = 1.5;
const MERGE_METERS = 60;
const MERGE_SAME_PHONE_METERS = 250;

const districts = districtPolygons();
const readTiles = () =>
  readdirSync(join(CACHE_DIR, 'tiles')).flatMap((file) => JSON.parse(readFileSync(join(CACHE_DIR, 'tiles', file), 'utf8')));
const overtureData = existsSync(OVERTURE_FILE) ? JSON.parse(readFileSync(OVERTURE_FILE, 'utf8')) : null;
// Karelerden sonra kimlikle çekilen güncel durum (varsa): içinde olmayan kayıt OSM'den silinmiştir.
// Not: son düzenlenme tarihi doğrulukla ilişkili çıkmadı (Google karşılaştırması 2026-09-26), eleme ölçütü değil.
const META_FILE = join(CACHE_DIR, 'meta.json');
const osmMeta = existsSync(META_FILE) ? JSON.parse(readFileSync(META_FILE, 'utf8')) : null;

// Türkçe karakter sözlüğü tüm ham ad ve adreslerden (bkz. buildDiacriticDictionary)
const diacritics = buildDiacriticDictionary([
  ...readTiles().flatMap((e) => [e.tags?.name, e.tags?.['addr:street']]),
  ...(overtureData?.places ?? []).flatMap((p) => [p.name, p.address]),
]);
const turkish = (text) => restoreTurkish(text, diacritics);
const skipped = { name: 0, filtered: 0, outside: 0, category: 0, confidence: 0, foursquare: 0, location: 0, deleted: 0 };
const districtByName = new Map(districts.map((d) => [fold(d.name), d]));

/* ---------- OSM ---------- */

function osmRecords() {
  const seen = new Set();
  const records = [];
  {
    for (const el of readTiles()) {
      const id = `${el.type}/${el.id}`;
      if (seen.has(id)) continue; // kare sınırındaki yollar iki karede de gelir
      seen.add(id);
      if (osmMeta && !osmMeta[id]) {
        skipped.deleted++;
        continue;
      }
      const tags = el.tags ?? {};
      if (tags.disused || tags['disused:amenity'] || tags.abandoned || tags.opening_hours === 'closed') {
        skipped.filtered++;
        continue;
      }
      const name = turkish(cleanName(tags.name, tags['name:tr'], tags['name:en']));
      if (!name) {
        skipped.name++;
        continue;
      }
      if (!isVenueName(name, { bakery: tags.shop === 'bakery' })) {
        skipped.filtered++;
        continue;
      }
      const latitude = el.lat ?? el.center?.lat;
      const longitude = el.lon ?? el.center?.lon;
      if (latitude === undefined) continue;
      const district = districtAt(districts, longitude, latitude);
      if (!district) {
        skipped.outside++;
        continue;
      }
      records.push({
        source: 'osm',
        id,
        name,
        latitude,
        longitude,
        district: district.name,
        confidence: 1,
        address: turkish(osmAddress(tags, { district: district.name })),
        phone: normalizePhone(tags.phone ?? tags['contact:phone'] ?? tags['contact:mobile']),
        website: normalizeWebsite(tags.website ?? tags['contact:website'] ?? tags['contact:instagram']),
        osmCuisine: tags.cuisine ?? '',
        type: OSM_TYPES[tags.amenity ?? tags.shop],
      });
    }
  }
  return records;
}

/* ---------- Overture ---------- */

// Ayrıntılı tür eşlenemezse ana kategoriden
const BASIC = { restaurant: 'Restoran', cafe: 'Kafe', coffee_shop: 'Kafe', bar: 'Bar', fast_food_restaurant: 'Büfe & fast food' };

function overtureRecords() {
  if (!overtureData) {
    console.warn('Overture verisi yok (npm run places:fetch). Yalnızca OSM kullanılıyor.');
    return [];
  }
  const { release, places } = overtureData;
  console.log(`Overture ${release}: ${places.length} aday`);
  const records = [];
  for (const p of places) {
    // Yalnızca Foursquare'den gelen kayıtlar eski (İstanbul'da 2023–2025): karşılaştırmada 3'te 3 hatalı
    // (4 km kaymış pin, kapanmış, olmayan mekân). Meta, AllThePlaces (zincirlerin kendi siteleri), Microsoft kalır.
    if (!(p.datasets ?? []).some((d) => d !== 'Overture' && d !== 'Foursquare')) {
      skipped.foursquare++;
      continue;
    }
    const name = turkish(cleanName(p.name, p.name_tr, p.name_en));
    if (!name) {
      skipped.name++;
      continue;
    }
    const mapped = [p.category, ...(p.alternates ?? [])].map(overtureCategory);
    // Ana tür açıkça mekân dışıysa (nargile, internet kafe, şarküteri) at
    if (mapped[0] === null || !isVenueName(name, { bakery: p.category === 'bakery' })) {
      skipped.filtered++;
      continue;
    }
    const district = districtAt(districts, p.longitude, p.latitude);
    if (!district) {
      skipped.outside++;
      continue;
    }
    // Kaynak başka bir ilçe diyor ve pin oraya uzak: konum ya da kayıt güvenilmez ("Sbarro, Şişli" ama pin Silivri'de)
    const claimed = p.locality && districtByName.get(fold(p.locality.trim()));
    if (claimed && claimed !== district && distanceToPolygonKm([p.longitude, p.latitude], claimed) > CLAIMED_DISTRICT_KM) {
      skipped.location++;
      continue;
    }
    records.push({
      source: 'overture',
      id: p.id,
      name,
      latitude: p.latitude,
      longitude: p.longitude,
      district: district.name,
      confidence: p.confidence ?? 0,
      address: turkish(formatAddress(p.address, { district: district.name })),
      phone: normalizePhone(p.phone),
      website: normalizeWebsite(p.website),
      type: mapped.find(Boolean) ?? BASIC[p.basic_category],
      datasets: p.datasets ?? [],
    });
  }
  return records;
}

/* ---------- Birleştirme ---------- */

/** Kapı numarasının esası: "14/A" ve "14" aynı bina */
const houseNumber = (address) => address?.match(/No:(\d+)/)?.[1];
const nameKey = (name) => fold(name).replace(/[^a-z0-9]/g, '');
const OSM_DUPLICATE_METERS = 40;

/**
 * İki kayıt aynı mekân mı? `chains`: şehirde çok şubesi olan adlar (Starbucks, Simit Sarayı);
 * bunlarda yalnızca çok yakın kayıtlar birleşir, tek şubeli mekânda kaymış pin (≤ 250 m) de yakalanır.
 */
function sameVenue(a, b, d, chains) {
  const equal = nameKey(a.name) === nameKey(b.name);
  // OSM'de aynı mekân hem nokta hem bina olarak çizilmiş olabilir; başka durumda iki OSM kaydı iki mekândır
  if (a.source === 'osm' && b.source === 'osm') return equal && d <= OSM_DUPLICATE_METERS;
  const na = houseNumber(a.address);
  const nb = houseNumber(b.address);
  if (na && nb && na !== nb && d > 25) return false;
  if (!similarNames(a.name, b.name)) return false;
  // Overture kendi içinde de tekrar eder (Meta sayfası + Foursquare); aynı veri kümesinin iki kaydı çok yakın olmalı
  const sameDataset = a.source === 'overture' && b.source === 'overture' && a.datasets[0] === b.datasets[0];
  if (d <= (sameDataset ? 30 : MERGE_METERS)) return true;
  if (a.phone && a.phone === b.phone) return true;
  // Aynı sokak ve kapı numarası: pin kaymış aynı mekân (zincirlerde de)
  const street = (address) => fold(address.replace(/No:.*$/, '')).replace(/[^a-z0-9]/g, '');
  if (na && na === nb && street(a.address) === street(b.address)) return true;
  return equal && !chains.has(nameKey(a.name));
}

/** Kümede birbirine uymayan kayıt çifti var mı (zincirleme birleşme: A~B, B~C ama A≠C) */
function compatible(left, right) {
  for (const a of left) {
    for (const b of right) {
      const d = distanceMeters(a, b);
      if (d > MERGE_SAME_PHONE_METERS) return false;
      if (a.source === 'osm' && b.source === 'osm' && !(nameKey(a.name) === nameKey(b.name) && d <= OSM_DUPLICATE_METERS)) return false;
    }
  }
  return true;
}

function cluster(records) {
  const keyCount = new Map();
  for (const r of records) keyCount.set(nameKey(r.name), (keyCount.get(nameKey(r.name)) ?? 0) + 1);
  const chains = new Set([...keyCount].filter(([, n]) => n >= 6).map(([k]) => k));

  const CELL = 0.003; // ~250–330 m: komşu 9 hücre MERGE_SAME_PHONE_METERS'i kapsar
  const cellOf = (r) => [Math.floor(r.latitude / CELL), Math.floor(r.longitude / CELL)];
  const grid = new Map();
  records.forEach((r, i) => {
    const key = cellOf(r).join(',');
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  });
  const pairs = [];
  records.forEach((r, i) => {
    const [cy, cx] = cellOf(r);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const j of grid.get(`${cy + dy},${cx + dx}`) ?? []) {
          if (j <= i) continue;
          const d = distanceMeters(r, records[j]);
          if (d <= MERGE_SAME_PHONE_METERS && sameVenue(r, records[j], d, chains)) pairs.push([d, i, j]);
        }
      }
    }
  });

  // En yakın eşleşmeler önce: bir kayıt önce kendi mekânına bağlanır, uzaktaki şubeye değil
  pairs.sort((a, b) => a[0] - b[0]);
  const members = records.map((_, i) => [i]);
  const owner = records.map((_, i) => i);
  const recordsOf = (list) => list.map((k) => records[k]);
  for (const [, i, j] of pairs) {
    const a = owner[i];
    const b = owner[j];
    if (a === b || !compatible(recordsOf(members[a]), recordsOf(members[b]))) continue;
    for (const k of members[b]) owner[k] = a;
    members[a].push(...members[b]);
    members[b] = [];
  }
  return members.filter((m) => m.length).map(recordsOf);
}

/** Kümeden tek mekân satırı; null = atılır */
function merge(group) {
  const osm = group.filter((r) => r.source === 'osm');
  const overture = group.filter((r) => r.source === 'overture').sort((a, b) => b.confidence - a.confidence);
  if (!osm.length && overture[0].confidence < MIN_CONFIDENCE) {
    skipped.confidence++;
    return null;
  }
  // Overture öncelikli: kayıtların çoğu işletmenin kendi sayfasından ve aylık güncel; OSM girişleri yıllar
  // öncesinden kalabiliyor (iki kaynak ayrıştığında telefonların çoğu eski sabit hat / yeni cep farkı).
  // Konumda fark yok (pinler arası medyan 10 m). OSM yalnızca eksik bilgiyi ve Overture'da olmayan mekânı tamamlar.
  const ordered = [...overture, ...osm];
  const anchor = ordered[0];
  const address = (ordered.find((r) => houseNumber(r.address)) ?? ordered.find((r) => r.address))?.address ?? '';
  // Ad aynıysa Türkçe karakterli yazım seçilir: Overture'da "Tavuk Dunyasi" gibi sadeleşmiş adlar var
  const turkish = (name) => (name.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? []).length;
  const name = ordered
    .filter((r) => fold(r.name).replace(/[^a-z0-9]/g, '') === fold(anchor.name).replace(/[^a-z0-9]/g, ''))
    .reduce((best, r) => (turkish(r.name) > turkish(best) ? r.name : best), anchor.name);
  // Tür: OSM'nin türü Meta etiketlerinden güvenilir ("Cızbız Sucuk Köfte" → mediterranean)
  const cuisine = categorize(name, {
    osmCuisine: osm.map((r) => r.osmCuisine).join(';'),
    fallbacks: [...osm, ...overture].map((r) => r.type),
  });
  if (!cuisine) {
    skipped.category++;
    return null;
  }
  return {
    sources: ordered.map((r) => ({ source: r.source, external_id: r.id })),
    name,
    cuisine,
    address,
    phone: ordered.find((r) => r.phone)?.phone ?? null,
    website: ordered.find((r) => r.website)?.website ?? null,
    latitude: Math.round(anchor.latitude * 1e6) / 1e6,
    longitude: Math.round(anchor.longitude * 1e6) / 1e6,
    city: CITY,
    district: anchor.district,
  };
}

/* ---------- Ana akış ---------- */

const records = [...osmRecords(), ...overtureRecords()];
const groups = cluster(records);
const rows = groups.map(merge).filter(Boolean);
writeFileSync(OUTPUT_FILE, JSON.stringify(rows));

const pct = (n) => `${Math.round((n / rows.length) * 100)}%`;
const count = (list, key) =>
  Object.entries(list.reduce((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);

console.log(`\n${records.length} kayıt → ${groups.length} küme → ${rows.length} mekân (${OUTPUT_FILE})`);
console.log(
  `Atlanan: ${skipped.name} geçersiz ad, ${skipped.filtered} mekân değil, ${skipped.outside} İstanbul dışı, ` +
    `${skipped.confidence} düşük güven, ${skipped.category} kategorisiz, ${skipped.foursquare} yalnızca Foursquare, ` +
    `${skipped.location} ilçesi pinle çelişen, ${skipped.deleted} OSM'den silinmiş`,
);
const sourceMix = count(rows, (r) => [...new Set(r.sources.map((s) => s.source))].join('+'));
console.log(`Kaynak: ${sourceMix.map(([k, n]) => `${k} ${n}`).join(', ')}`);
console.log(
  `Adres ${pct(rows.filter((r) => r.address).length)} (kapı no ${pct(rows.filter((r) => houseNumber(r.address)).length)}), ` +
    `telefon ${pct(rows.filter((r) => r.phone).length)}, web ${pct(rows.filter((r) => r.website).length)}`,
);
console.log('\nKategoriler:');
for (const [k, n] of count(rows, (r) => r.cuisine)) console.log(`  ${k.padEnd(18)} ${n}`);
console.log(`\nİlçeler: ${count(rows, (r) => r.district).map(([k, n]) => `${k} ${n}`).join(', ')}`);
// Aynı ad aynı ilçede birden fazlaysa ya şubedir ya da birleşmemiş tekrar: sayısını izle
const repeated = count(rows, (r) => `${fold(r.name)}|${r.district}`).filter(([, n]) => n > 1).length;
console.log(`Aynı ad ve ilçede birden fazla mekân (şube ya da kalan tekrar): ${repeated}`);
