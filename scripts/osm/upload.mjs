/**
 * `places:build` çıktısını Supabase'e yükler. Aynı mekân tekrar gelirse (source + external_id)
 * günceller, yenisini ekler; tekrar çalıştırmak güvenlidir.
 *
 * RLS'i aşmak için service role (secret) anahtarı gerekir; yalnızca bu betikte, yerelde kullanılır:
 *   .env.local → SUPABASE_SERVICE_ROLE_KEY=...  (EXPO_PUBLIC_ öneki OLMADAN; uygulamaya girmez)
 *
 * Çalıştırma: npm run places:upload  (önce `--dry-run` ile deneyebilirsin)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createClient } from '@supabase/supabase-js';

import { CACHE_DIR } from './config.mjs';

const BATCH = 500;
const dryRun = process.argv.includes('--dry-run');

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY .env.local içinde olmalı.');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(join(CACHE_DIR, 'places.json'), 'utf8'));
console.log(`${rows.length} mekân yüklenecek${dryRun ? ' (deneme, yazılmayacak)' : ''}`);

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Bağlantı ve yetki kontrolü: 'osm' kaynağı ve yeni kategoriler migration'ı uygulanmış olmalı
const { data: cuisines, error: cuisineError } = await supabase.from('cuisines').select('name');
if (cuisineError) throw cuisineError;
const known = new Set(cuisines.map((c) => c.name));
const missing = [...new Set(rows.map((r) => r.cuisine))].filter((c) => !known.has(c));
if (missing.length) {
  console.error(`Veritabanında olmayan kategoriler: ${missing.join(', ')} → önce 20260926100000_osm_places.sql migration'ını çalıştır.`);
  process.exit(1);
}

if (!dryRun) {
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await supabase.from('places').upsert(batch, { onConflict: 'source,external_id' });
    if (error) {
      console.error(`\n${i}. satırdan itibaren hata:`, error.message);
      process.exit(1);
    }
    process.stdout.write(`\r${Math.min(i + BATCH, rows.length)}/${rows.length}`);
  }
  console.log();
}

const { count } = await supabase.from('places').select('id', { count: 'exact', head: true }).eq('source', 'osm');
console.log(`Veritabanında OSM kaynaklı mekân sayısı: ${count}`);
