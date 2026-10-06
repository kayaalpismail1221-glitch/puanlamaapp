/**
 * OSM ve Overture kayıtlarını tek mekân listesine birleştirir.
 *
 * 1. Her kaynaktan aday: isim temizlenir (büyük harf, emoji, Latin olmayan yazı), mekân olmayanlar ayıklanır,
 *    ilçe OSM sınırlarından bulunur (il dışı atılır), adres/telefon/web tek biçime getirilir.
 * 2. Aynı mekânın kayıtları birleşir: yakın (≤ 60 m, aynı telefonla ≤ 250 m) ve benzer adlı kayıtlar.
 *    Aynı kaynağın iki kaydı birleşmez (OSM'de iki ayrı düğüm iki ayrı mekândır); kapı numarası farklı
 *    kayıtlar da birleşmez (aynı zincirin komşu şubeleri). Kümedeki her kayıt çiftinin adı uyuşmalı (zincirleme
 *    birleşme yok); yalnızca sokak/mahalle adında uyuşan adlar ayrıca aynı türde olmalı.
 * 3. Konum, ad, adres, telefon önce Overture'dan (güncel), eksikler OSM'den; tür önce OSM'den.
 * 4. Yalnızca Overture'da olan, güveni düşük kayıtlar atılır (kapanmış/sahte sayfa riski).
 *
 * Mahalle burada hesaplanmaz: veritabanı her mekânın il/ilçe/mahallesini koordinattan kendisi yazar.
 * Çalıştırma: [PLACES_CITY=ankara] npm run places:build  → scripts/.cache/places[-il].json + özet
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { districtAt, districtPolygons, distanceToPolygonKm, inside, readBoundaries, toPolygon } from './boundaries.mjs';
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
  nameTokens,
  similarNames,
  spellingSimilarity,
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
/**
 * Aynı nokta: farklı kaynaktan bu kadar yakın, ilk ayırt edici kelimesi ve türü aynı iki kayıt, adlar şunlardan biriyse
 * tek mekândır: biri İngilizceye çevrilmiş (TRANSLATED_NAME: "Tuğba Ekmek ve Pasta Fırını" / "Tugba Bread and Cake
 * Bakery", 8 m), yalnızca yazımda ayrışıyor (SPELLING_SIMILARITY: "Burger Yiyelin" / "Burger Yiyelim") ya da yalnızca
 * tür/şube kelimesinde ayrışıyor (GENERIC_WORDS: "Fornello Pizza" / "Fornello Pizzeria", "Günbilir Balık Restaurant" /
 * "Gunbilir Fish Restaurant"). Tür şartı kardeş işletmeleri ayırır: "Çiya Sofrası" (restoran) / "Çiya Kebap"
 * (kebapçı), 4 m; "Sembol Ocakbaşı" / "Sembol Künefe".
 */
const SAME_SPOT_METERS = 25;
const SPELLING_SIMILARITY = 0.85;
/** Mekânın adında tür ya da şube bildiren kelimeler (fold'lanmış): ayırt edici değil */
const GENERIC_WORDS = new Set([
  'restaurant', 'restoran', 'restorani', 'restaurant', 'lokanta', 'lokantasi', 'cafe', 'kafe', 'kafesi', 'balik', 'baligi',
  'balikcisi', 'balikci', 'fish', 'seafood', 'meze', 'pizza', 'pizzeria', 'pizzacisi', 'kebap', 'kebab', 'kebapcisi',
  'doner', 'donercisi', 'burger', 'burgers', 'tatli', 'tatlicisi', 'pastane', 'pastanesi', 'pasta', 'borek', 'borekcisi',
  'firin', 'firini', 'cikolata', 'chocolat', 'chocolate', 'helva', 'helvacisi', 'turkish', 'delight', 'place', 'yeri',
  'nun', 'nin', 'grill', 'steakhouse', 'steak', 'ocakbasi', 'meyhane', 'meyhanesi', 'kahvalti', 'kahvaltici', 'corba',
  'corbaci', 'kofte', 'koftecisi', 'pide', 'pidecisi', 'dondurma', 'dondurmacisi', 'evi', 'salon', 'salonu',
]);
/**
 * Zayıf kayıt (silinmez; "yakınımdakiler"de çıkmaz, aramada sona düşer; puanlanınca önemi kalmaz).
 * 2026-10-02 Google ölçümü: telefonu/sitesi/adresi olmayan yalnız-OSM kaydı 21'de 6, güveni < 0,80 yalnız-Overture
 * kaydı 17'de ~6 doğru; iki kaynakta olan ~%75, güveni ≥ 0,80 yalnız-Overture ~%60.
 */
const WEAK_CONFIDENCE = 0.8;
/** Overture'ın (Meta) adı İngilizceye çevirdiği kayıtlar: OSM'deki Türkçe ad tercih edilir */
const TRANSLATED_NAME = /\b(bread|cake|bakery|meatball|soup|kitchen|patisserie|pastry|dessert|grill house|coffee house)\b/i;

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
const skipped = { name: 0, filtered: 0, outside: 0, category: 0, confidence: 0, foursquare: 0, location: 0, deleted: 0, mall: 0 };
let translated = 0;
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
  if (a.source !== b.source && d <= SAME_SPOT_METERS && sameSpotVenue(a, b)) return true;
  if (!namesMatch(a, b)) return false;
  // Overture kendi içinde de tekrar eder (Meta sayfası + Foursquare); aynı veri kümesinin iki kaydı çok yakın olmalı
  const sameDataset = a.source === 'overture' && b.source === 'overture' && a.datasets[0] === b.datasets[0];
  if (d <= (sameDataset ? 30 : MERGE_METERS)) return true;
  if (a.phone && a.phone === b.phone) return true;
  // Aynı sokak ve kapı numarası: pin kaymış aynı mekân (zincirlerde de)
  const street = (address) => fold(address.replace(/No:.*$/, '')).replace(/[^a-z0-9]/g, '');
  if (na && na === nb && street(a.address) === street(b.address)) return true;
  return equal && !chains.has(nameKey(a.name));
}

/** Kaydın türü (birleşmeden önce, kendi bilgisiyle; önbellekli) */
const recordCategory = new WeakMap();
function categoryOf(r) {
  if (!recordCategory.has(r)) recordCategory.set(r, categorize(r.name, { osmCuisine: r.osmCuisine ?? '', fallbacks: [r.type] }));
  return recordCategory.get(r);
}

/** Aynı noktadaki iki kaydın adı aynı mekânı mı gösteriyor (bkz. SAME_SPOT_METERS) */
function sameSpotVenue(a, b) {
  const tokensA = nameTokens(a.name);
  const tokensB = nameTokens(b.name);
  const [first] = tokensA;
  if (!first || first.length < 4 || first !== tokensB[0]) return false;
  // Yazım hatası türü de bozabilir ("Mero Lahamcun" tanınmıyor): adlar neredeyse aynıysa tür aranmaz
  if (spellingSimilarity(a.name, b.name) >= SPELLING_SIMILARITY) return true;
  if (categoryOf(a) !== categoryOf(b)) return false;
  if (TRANSLATED_NAME.test(a.name) || TRANSLATED_NAME.test(b.name)) return true;
  const distinct = (tokens) => new Set(tokens.filter((t) => !GENERIC_WORDS.has(t)));
  const [da, db] = [distinct(tokensA), distinct(tokensB)];
  const within = (x, y) => [...x].every((t) => y.has(t));
  return da.size > 0 && db.size > 0 && (within(da, db) || within(db, da));
}

/** Sokak ve mahalle adında yer bildirmeyen kelimeler (fold'lanmış) */
const STREET_WORDS = new Set([
  'cad', 'cadde', 'caddesi', 'sok', 'sokak', 'sokagi', 'bulvari', 'blv', 'bulv', 'yolu', 'mah', 'mahallesi', 'meydani',
  'kat', 'apt', 'sitesi', 'carsisi', 'pasaji', 'han', 'hani', 'merkezi',
]);
const neighborhoods = readBoundaries('neighborhoods.json').map(toPolygon).filter((n) => n?.name);

const MALL_WORDS = new Set(['avm', 'mall', 'outlet']);
const MALL_METERS = 300;
let mallAnchors;
/**
 * Yakındaki AVM'lerin adı. AVM: adında ya da adresinde "X AVM", "X Mall", "Mall of X" geçen kayıt. AVM'deki mekânın
 * adında AVM'nin adı geçer ("Espressolab Anatolium Marmara AVM", "Marmara Forum Subway"); bu ad yalnızca AVM'ye
 * MALL_METERS'tan yakın kayıtlar için konum kelimesidir (il geneli değil: "Kale AVM" yüzünden Sarıyer'deki "Rumeli
 * Kale Cafe" bölünmesin).
 */
function mallWordsNear(r) {
  mallAnchors ??= allRecords.flatMap((m) => {
    const words = new Set();
    for (const text of [m.name, m.address ?? '']) {
      const t = fold(text).split(/[^a-z0-9]+/).filter(Boolean);
      t.forEach((w, i) => {
        if (!MALL_WORDS.has(w)) return;
        words.add(w);
        // "Mall of İstanbul": ad sonra gelir; "Vadi Mall", "Forum AVM": önce
        const name = w === 'mall' && t[i + 1] === 'of' ? t[i + 2] : t[i - 1];
        if (name && name.length > 2 && !STREET_WORDS.has(name)) words.add(name);
      });
    }
    return words.size ? [{ words: [...words], latitude: m.latitude, longitude: m.longitude }] : [];
  });
  return mallAnchors.filter((m) => distanceMeters(m, r) <= MALL_METERS).flatMap((m) => m.words);
}

const recordPlaceWords = new WeakMap();
/** Kaydın konum kelimeleri: adresindeki sokak, bulunduğu mahalle ve yakındaki AVM'nin adı (önbellekli) */
function placeWords(r) {
  if (!recordPlaceWords.has(r)) {
    const words = (text) => fold(text).split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STREET_WORDS.has(t));
    const hood = neighborhoods.find((n) => inside([r.longitude, r.latitude], n));
    recordPlaceWords.set(r, [
      ...words((r.address ?? '').replace(/No:.*$/, '')),
      ...(hood ? words(hood.name) : []),
      ...mallWordsNear(r),
    ]);
  }
  return recordPlaceWords.get(r);
}

/** AVM'nin kendi kaydı ("Optimum AVM", "Istanbul, Vadi Mall"): mekân değil, AVM'deki mekânları birbirine bağlıyordu */
function isMallRecord(r) {
  if (!fold(r.name).split(/[^a-z0-9]+/).some((w) => MALL_WORDS.has(w))) return false;
  const place = new Set([...placeWords(r), 'of']);
  return nameTokens(r.name).every((w) => place.has(w));
}

/**
 * Adlar aynı mekânı mı gösteriyor (similarNames). Benzerlik yalnızca konum kelimesinden geliyorsa (sokak, mahalle ya
 * da AVM adı) tür de aynı olmalı ve konum dışında kalan ayırt edici kelimeler çatışmamalı: "Topkapı Pub" / "Topkapı
 * Kebap", "Espressolab Anatolium Marmara AVM" / "Çaytaze Anatolium Marmara AVM" ayrı kalır; sokağıyla adaş mekân
 * birleşmeye devam eder ("Ara Cafe" / "Cafe Ara", Ara Güler Sk.; "Asmalıpera Pub" / "Asmalı Pera Bar").
 */
function namesMatch(a, b) {
  if (!similarNames(a.name, b.name)) return false;
  const ignore = new Set([...placeWords(a), ...placeWords(b)]);
  if (similarNames(a.name, b.name, { ignore })) return true;
  if (categoryOf(a) !== categoryOf(b)) return false;
  const rest = (r) => nameTokens(r.name).filter((t) => !ignore.has(t) && !GENERIC_WORDS.has(t)).join('');
  const [ra, rb] = [rest(a), rest(b)];
  return !ra || !rb || ra.includes(rb) || rb.includes(ra);
}

/** İki kaydın adı aynı mekânın olabilir mi (sameVenue'deki ad koşullarından biri) */
function namesCompatible(a, b) {
  if (nameKey(a.name) === nameKey(b.name) || namesMatch(a, b)) return true;
  return a.source !== b.source && sameSpotVenue(a, b);
}

/**
 * İki küme birleşebilir mi: her kayıt çifti birbirine yakın olmalı ve adları uyuşmalı. Zincirleme birleşme olmaz
 * (A~B, B~C ama A≠C): "Cihangir Lokantası" adı mahalledeki her "… Cihangir" mekânına benzediği için mahallenin
 * mekânlarını tek kümede topluyordu (2026-10-02, İstanbul'da 150 küme: "Sbarro" + "Popeyes", "Bebek Bar" + "Little
 * China Bebek" …).
 */
function compatible(left, right) {
  for (const a of left) {
    for (const b of right) {
      const d = distanceMeters(a, b);
      if (d > MERGE_SAME_PHONE_METERS) return false;
      if (a.source === 'osm' && b.source === 'osm' && !(nameKey(a.name) === nameKey(b.name) && d <= OSM_DUPLICATE_METERS)) return false;
      if (!namesCompatible(a, b)) return false;
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
  let name = ordered
    .filter((r) => fold(r.name).replace(/[^a-z0-9]/g, '') === fold(anchor.name).replace(/[^a-z0-9]/g, ''))
    .reduce((best, r) => (turkish(r.name) > turkish(best) ? r.name : best), anchor.name);
  const osmName = osm.find((r) => !TRANSLATED_NAME.test(r.name))?.name;
  if (osmName && TRANSLATED_NAME.test(name) && !turkish(name)) {
    name = osmName;
    translated++;
  }
  // Tür: OSM'nin türü Meta etiketlerinden güvenilir ("Cızbız Sucuk Köfte" → mediterranean)
  const cuisine = categorize(name, {
    osmCuisine: osm.map((r) => r.osmCuisine).join(';'),
    fallbacks: [...osm, ...overture].map((r) => r.type),
  });
  if (!cuisine) {
    skipped.category++;
    return null;
  }
  const weak = !overture.length
    ? !osm.some((r) => r.phone || r.website || r.address)
    : !osm.length && overture[0].confidence < WEAK_CONFIDENCE;
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
    weak,
  };
}

/* ---------- Ana akış ---------- */

console.log(`İl: ${CITY}`);
const allRecords = [...osmRecords(), ...overtureRecords()];
const records = allRecords.filter((r) => !isMallRecord(r));
skipped.mall = allRecords.length - records.length;
const groups = cluster(records);
const rows = groups.map(merge).filter(Boolean);
writeFileSync(OUTPUT_FILE, JSON.stringify(rows));

const pct = (n) => `${Math.round((n / rows.length) * 100)}%`;
const count = (list, key) =>
  Object.entries(list.reduce((acc, r) => ((acc[key(r)] = (acc[key(r)] ?? 0) + 1), acc), {})).sort((a, b) => b[1] - a[1]);

console.log(`\n${records.length} kayıt → ${groups.length} küme → ${rows.length} mekân (${OUTPUT_FILE})`);
console.log(
  `Atlanan: ${skipped.name} geçersiz ad, ${skipped.filtered} mekân değil, ${skipped.outside} ${CITY} dışı, ` +
    `${skipped.confidence} düşük güven, ${skipped.category} kategorisiz, ${skipped.foursquare} yalnızca Foursquare, ` +
    `${skipped.location} ilçesi pinle çelişen, ${skipped.deleted} OSM'den silinmiş, ${skipped.mall} AVM'nin kendisi`,
);
const sourceMix = count(rows, (r) => [...new Set(r.sources.map((s) => s.source))].join('+'));
console.log(`Zayıf (yakınımdakilerde çıkmaz): ${rows.filter((r) => r.weak).length} (${pct(rows.filter((r) => r.weak).length)}); çevrilmiş ad yerine Türkçe ad: ${translated}`);
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
