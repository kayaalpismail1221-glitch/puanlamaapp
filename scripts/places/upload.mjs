/**
 * Sınırları ve birleşik mekân listesini Supabase'e yükler (migration 20261003100000_place_quality gerekir).
 *
 * 1. İlçe ve mahalle sınırları → `admin_areas`, ardından TÜM mekânların (kullanıcı eklediği dahil)
 *    il/ilçe/mahallesi koordinattan yeniden hesaplanır.
 * 2. Mekânlar `import_places` ile yazılır: kaynak kimliği (OSM/Overture) zaten bir mekâna bağlıysa o satır
 *    güncellenir — kimlik, puanlar, gönderiler korunur —, değilse yeni mekân eklenir. Tekrar çalıştırmak güvenli.
 * 3. `--prune`: bu turda gelmeyen (kaynaktan düşmüş) ve hiçbir kayda bağlı olmayan içe aktarılmış mekânlar silinir.
 *
 * Service role anahtarı gerekir, yalnızca yerelde: .env.local → SUPABASE_SERVICE_ROLE_KEY=... (EXPO_PUBLIC_ öneki OLMADAN)
 * Çalıştırma: npm run places:upload [-- --areas-only | --skip-areas | --prune | --dry-run]
 */
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

import { readBoundaries, toPolygon, inside, districtPolygons } from './boundaries.mjs';
import { CITY, DISTRICTS, OUTPUT_FILE } from './config.mjs';

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
  // Kutudaki mahallelerden yalnızca İstanbul ilçelerinin içinde kalanlar (Kocaeli/Tekirdağ taşmaları atılır)
  const neighborhoods = readBoundaries('neighborhoods.json')
    .map(toPolygon)
    .filter((n) => {
      if (!n) return false;
      const center = [(n.box[0] + n.box[2]) / 2, (n.box[1] + n.box[3]) / 2];
      return districts.some((d) => inside(center, d) || inside(n.rings[0][0], d));
    });
  const areas = [
    ...districts.map((d) => ({ ...d, level: 6, name: d.name })),
    ...neighborhoods.map((n) => ({ ...n, level: 8, name: n.name.replace(/\s+Mahallesi$/i, '').trim() })),
  ];
  console.log(`${districts.length}/${DISTRICTS.size} ilçe, ${neighborhoods.length} mahalle sınırı yükleniyor…`);
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
    process.stdout.write(`${changed} mekânın il/ilçe/mahallesi düzeldi`);
  }
  console.log();
}

async function uploadPlaces() {
  const rows = JSON.parse(readFileSync(OUTPUT_FILE, 'utf8'));
  console.log(`${rows.length} mekân yazılacak${dryRun ? ' (deneme, yazılmayacak)' : ''}`);
  const { data: cuisines, error } = await supabase.from('cuisines').select('name');
  if (error) throw error;
  const known = new Set(cuisines.map((c) => c.name));
  const missing = [...new Set(rows.map((r) => r.cuisine))].filter((c) => !known.has(c));
  if (missing.length) throw new Error(`Veritabanında olmayan kategoriler: ${missing.join(', ')}`);
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
  console.log(`Kaynaktan düşen, kullanılmayan mekânlar silindi: ${await rpc('prune_imported_places', { p_before: before }, 1)}`);
}

for (const source of ['osm', 'overture', 'user']) {
  const { count } = await supabase.from('places').select('id', { count: 'exact', head: true }).eq('source', source);
  console.log(`${source}: ${count}`);
}
