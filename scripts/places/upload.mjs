/**
 * Sınırları ve birleşik mekân listesini Supabase'e yükler (migration 20261003100000_place_quality gerekir).
 *
 * 1. İlçe ve mahalle sınırları → `admin_areas`, ardından TÜM mekânların (kullanıcı eklediği dahil)
 *    il/ilçe/mahallesi koordinattan yeniden hesaplanır.
 * 2. Mekânlar `import_places` ile yazılır: kaynak kimliği (OSM/Overture) zaten bir mekâna bağlıysa o satır
 *    güncellenir — kimlik, puanlar, gönderiler korunur —, değilse yeni mekân eklenir. Tekrar çalıştırmak güvenli.
 * 3. `--prune`: bu ilde bu turda gelmeyen (kaynaktan düşmüş) içe aktarılmış mekânlar: hiçbir kayda bağlı değilse
 *    silinir, bağlıysa (puan, gönderi, liste) `source_dropped_at` ile işaretlenir (yönetici incelemesi için)
 *    (migration 20261019120000_place_trust; il süzgeçli, başka illere dokunmaz).
 * Satırlardaki `weak` (build.mjs) zayıf kaydı işaretler: "yakınımdakiler"de çıkmaz, aramada sona düşer.
 *
 * Service role anahtarı gerekir, yalnızca yerelde: .env.local → SUPABASE_SERVICE_ROLE_KEY=... (EXPO_PUBLIC_ öneki OLMADAN)
 * Çalıştırma: [PLACES_CITY=ankara] npm run places:upload [-- --areas-only | --skip-areas | --prune | --dry-run]
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { readBoundaries, toPolygon, inside, districtPolygons } from './boundaries.mjs';
import { CITY, DISTRICTS, OUTPUT_FILE } from './config.mjs';
import { assignPlaces, sameVenueName } from './lib.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const BATCH = 200;

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde olmalı.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function rpc(name, params, attempts = 3) {
  for (let i = 1; ; i++) {
    const { data, error } = await supabase.rpc(name, params);
    if (!error) return data;
    if (i >= attempts || error.code === 'PGRST202' || error.code?.startsWith('42')) throw new Error(`${name}: ${error.message}`);
    await new Promise((r) => setTimeout(r, 2000 * i));
  }
}

/** İlişkinin yolları WKT çizgi olarak; çokgen PostGIS'te kurulur */
const toLines = (relation) =>
  `MULTILINESTRING(${relation.members
    .filter((m) => m.type === 'way' && m.geometry?.length > 1)
    .map((m) => `(${m.geometry.map((p) => `${p.lon} ${p.lat}`).join(', ')})`)
    .join(', ')})`;

async function uploadAreas() {
  const districts = districtPolygons();
  // Gelen mahallelerden yalnızca ilin ilçelerinin içinde kalanlar (komşu il taşmaları atılır)
  const neighborhoods = readBoundaries('neighborhoods.json')
    .map(toPolygon)
    .filter((n) => {
      if (!n?.name) return false; // geometrisi bozuk ya da adsız sınır (Ankara'da var)
      const center = [(n.box[0] + n.box[2]) / 2, (n.box[1] + n.box[3]) / 2];
      return districts.some((d) => inside(center, d) || inside(n.rings[0][0], d));
    });
  const areas = [
    ...districts.map((d) => ({ ...d, level: 6, name: d.name })),
    ...neighborhoods.map((n) => ({ ...n, level: 8, name: n.name.replace(/\s+Mahallesi$/i, '').trim() })),
  ];
  console.log(`${CITY}: ${districts.length}/${DISTRICTS.size} ilçe, ${neighborhoods.length} mahalle sınırı yükleniyor…`);
  if (dryRun) return;
  let done = 0;
  for (const area of areas) {
    await rpc('import_admin_area', {
      p_id: area.id,
      p_level: area.level,
      p_name: area.name.slice(0, 80),
      p_city: CITY,
      p_lines: toLines(area.relation),
    });
    process.stdout.write(`\r${++done}/${areas.length}`);
  }
  console.log('\nMekânların il/ilçe/mahallesi sınırlardan yeniden hesaplanıyor…');
  let after = null;
  let changed = 0;
  for (;;) {
    const [page] = await rpc('refresh_place_areas', { p_after: after, p_limit: 2000 });
    if (!page?.last_id) break;
    after = page.last_id;
    changed += page.changed;
    process.stdout.write(`\r${changed} mekânın il/ilçe/mahallesi düzeldi`);
  }
  console.log();
}

/** Tablonun tamamı, sayfa sayfa (PostgREST istek başına en çok 1000 satır döner) */
async function selectAll(table, columns, order) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    let query = supabase.from(table).select(columns);
    for (const column of order) query = query.order(column);
    const { data, error } = await query.range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

/**
 * Satırları canlıdaki mekânlara eşler (lib.mjs assignPlaces): birleştirme kuralı değişince yanlış birleşmiş mekân
 * bölünür, kopyalar birleşir, puanı/gönderisi olan mekân adı uyuşan satırda kalır. Satırların, aldıkları mekân
 * dışındaki mekânlara bağlı kaynakları import_places'tan önce çözülür; import_places her satırı burada seçilen mekâna
 * yazar, mekân alamayan satır yeni mekân açar. İlk kaynağı (places.source/external_id, tekil) başka satıra geçen
 * mekânın ilk kaynağı da önceden değişir (yeni mekân aynı kaynakla açılırken tekillik hatası olmasın). Yarıda kalan
 * yükleme yeniden çalıştırılabilir: eşleme o anki durumdan yeniden hesaplanır.
 */
async function matchPlaces(rows) {
  const links = await selectAll('place_sources', 'source, external_id, place_id', ['place_id', 'source', 'external_id']);
  const columns = 'id, name, source, external_id, rating_count, post_count, latitude, longitude, locked_fields';
  const places = new Map((await selectAll('places', columns, ['id'])).map((p) => [p.id, p]));
  const { assigned, detach, originals, candidates } = assignPlaces(
    rows,
    new Map(links.map((x) => [`${x.source}/${x.external_id}`, x.place_id])),
    places,
  );
  const contested = [...candidates.values()].filter((list) => list.length > 1).length;
  console.log(
    `${CITY}: ${contested} mekâna birden çok satır aday (bölünme), ${detach.length} kaynak bağı çözülecek, ` +
      `${originals.length} mekânın ilk kaynağı değişecek${dryRun ? ' (deneme)' : ''}`,
  );
  // Kullanıcı verisi olan mekânlarda değişen: bölünme, ad değişikliği, satırsız kalma (--prune silmez, işaretler)
  for (const [id, list] of candidates) {
    const place = places.get(id);
    if (place.rating_count + place.post_count === 0) continue;
    const label = `"${place.name}" (puan ${place.rating_count}, gönderi ${place.post_count})`;
    const keeper = list.find((r) => assigned.get(r) === id);
    const names = (list) => list.map((r) => `"${r.name}"`).join(', ');
    if (!keeper) console.log(`  ! ${label}: satırı kalmadı (${names(list)} başka mekâna yazılıyor)`);
    else if (!sameVenueName(keeper.name, place.name) && !place.locked_fields?.includes('name')) {
      console.log(`  ! ${label}: adı "${keeper.name}" olacak`);
    } else if (list.length > 1) console.log(`  ${label} korunuyor; ayrılan: ${names(list.filter((r) => r !== keeper))}`);
  }
  if (dryRun) return;
  const groups = new Map();
  for (const d of detach) {
    const group = `${d.place_id}|${d.source}`;
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(d.external_id);
  }
  for (const [group, ids] of groups) {
    const [placeId, source] = group.split('|');
    const { error } = await supabase
      .from('place_sources')
      .delete()
      .eq('place_id', placeId)
      .eq('source', source)
      .in('external_id', ids);
    if (error) throw error;
  }
  // İki adımda: önce hepsi boşalır, sonra yenisi yazılır (A'nın yeni ilk kaynağını B henüz bırakmamış olabilir)
  for (let i = 0; i < originals.length; i += 100) {
    const ids = originals.slice(i, i + 100).map((o) => o.id);
    const { error } = await supabase.from('places').update({ external_id: null }).in('id', ids);
    if (error) throw error;
  }
  for (const { id, source, external_id } of originals.filter((o) => o.external_id)) {
    const { error } = await supabase.from('places').update({ source, external_id }).eq('id', id);
    if (error) throw error;
  }
}

async function uploadPlaces() {
  const rows = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
  const { data: cuisines, error } = await supabase.from('cuisines').select('name');
  if (error) throw error;
  const known = new Set(cuisines.map((c) => c.name));
  const missing = [...new Set(rows.map((r) => r.cuisine))].filter((c) => !known.has(c));
  if (missing.length) throw new Error(`Veritabanında olmayan kategoriler: ${missing.join(', ')}`);
  await matchPlaces(rows);
  console.log(`${rows.length} mekân yazılacak${dryRun ? ' (deneme, yazılmayacak)' : ''}`);
  if (dryRun) return;

  let added = 0;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const [a, u] = await rpc('import_places', { p_rows: rows.slice(i, i + BATCH) });
    added += a;
    updated += u;
    process.stdout.write(`\r${Math.min(i + BATCH, rows.length)}/${rows.length} (yeni ${added}, güncellenen ${updated})`);
  }
  console.log();
}

const startedAt = new Date();
if (!args.has('--skip-areas')) await uploadAreas();
if (!args.has('--areas-only')) await uploadPlaces();
if (args.has('--prune') && !dryRun) {
  // Saat farkına pay: bu turdan önceki 10 dakikada yazılan hiçbir şey silinmez
  const before = new Date(startedAt.getTime() - 10 * 60_000).toISOString();
  const [removed, flagged] = await rpc('prune_imported_places', { p_before: before, p_city: CITY }, 1);
  console.log(`${CITY}: kaynaktan düşen ${removed} kullanılmayan mekân silindi, kullanılan ${flagged} mekân işaretlendi`);
}

for (const source of ['osm', 'overture', 'user']) {
  const { count } = await supabase.from('places').select('id', { count: 'exact', head: true }).eq('source', source);
  console.log(`${source}: ${count}`);
}
