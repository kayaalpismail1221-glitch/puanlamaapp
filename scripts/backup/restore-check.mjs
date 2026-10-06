/**
 * Yedeğin geri yüklenebildiğini sınar: boş bir yerel veritabanını (PGlite + PostGIS, testlerle aynı) depodaki tüm
 * migration'larla kurar, yedeği içine yükler ve doğrular. Canlıya dokunmaz.
 *
 *   1. Her tablo yedekteki satır sayısıyla birebir yüklendi mi (tür dönüşümü Postgres'in kendisiyle:
 *      `jsonb_populate_recordset`; üretilen sütunlar yeniden hesaplanır)
 *   2. Tablolar arası bağlantılar tam mı: her yabancı anahtar için öksüz satır sayısı (gönderisi silinmiş beğeni vb.)
 *   3. Veritabanındaki her fotoğraf yolu yedekteki dosyalarda var mı (gönderi ve profil fotoğrafları)
 *   4. Uygulamanın okuduğu görünümler çalışıyor mu (gönderi/profil/mekân görünümü satır sayıları)
 *
 * Yükleme sırasında tetikleyiciler kapalı (session_replication_role = replica): sayaçlar ve bildirimler yedekteki
 * hâliyle gelir, yeniden üretilmez. Gerçek bir geri yüklemede de aynı yol izlenir (bkz. CLAUDE.md "Yedek").
 *
 * Çalıştırma: npm run backup:check [-- <yedek klasörü>]   (verilmezse en yenisi)
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const BACKUPS = process.env.PUANLA_BACKUP_DIR ?? 'C:\\dev\\puanla-yedek';
const dir =
  process.argv[2] ??
  join(
    BACKUPS,
    readdirSync(BACKUPS)
      .filter((d) => existsSync(join(BACKUPS, d, 'ozet.json')))
      .sort()
      .at(-1),
  );
if (!existsSync(join(dir, 'ozet.json'))) throw new Error(`Tamamlanmış yedek değil (ozet.json yok): ${dir}`);
const summary = JSON.parse(readFileSync(join(dir, 'ozet.json'), 'utf8'));
console.log(`Yedek: ${dir} (${summary.at})`);

const db = await PGlite.create({ extensions: { postgis, pg_trgm } });
await db.exec(readFileSync(join(ROOT, 'supabase/tests/supabase-shim.sql'), 'utf8'));
for (const file of readdirSync(join(ROOT, 'supabase/migrations')).sort()) {
  await db.exec(readFileSync(join(ROOT, 'supabase/migrations', file), 'utf8'));
}
// Migration'ların eklediği başlangıç satırları (mutfaklar, sürüm alt sınırı…) yedektekiyle değişsin
await db.exec(`set session_replication_role = replica`);
console.log('Şema kuruldu (migration\'lar). Yükleniyor…');

const problems = [];
const load = (file) => JSON.parse(readFileSync(join(dir, file), 'utf8'));

/* Hesaplar: Auth'un tablosunun yerel karşılığına (profiller buna bağlı) */
const users = load('auth-users.json');
await db.query(
  `insert into auth.users (id, email, phone, raw_user_meta_data, raw_app_meta_data, created_at, email_confirmed_at)
   select (u->>'id')::uuid, u->>'email', nullif(u->>'phone', ''), u->'user_metadata', u->'app_metadata',
     (u->>'created_at')::timestamptz, (u->>'email_confirmed_at')::timestamptz
   from jsonb_array_elements($1::jsonb) u`,
  [JSON.stringify(users)],
);

/* Tablolar */
const { rows: localTables } = await db.query(
  `select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
const local = new Set(localTables.map((t) => t.table_name));
// Migration'ların başlangıç satırları dahil hepsi bir kez, birlikte boşaltılır. Tek tek `truncate … cascade`
// bağlı tabloları da boşaltıyordu (profiles boşalınca önceden yüklenen mekânlar ve gönderiler gidiyordu).
await db.exec(`truncate ${[...local].map((t) => `public."${t}"`).join(', ')}`);
const loaded = {};
for (const file of readdirSync(join(dir, 'tables')).sort()) {
  const table = file.replace(/\.json$/, '');
  const data = load(join('tables', file));
  if (!local.has(table)) {
    // Canlıda görünüm olan ya da depoda olmayan nesne
    if (data.length) problems.push(`${table}: depodaki şemada tablo yok (${data.length} satır yüklenmedi)`);
    continue;
  }
  const { rows: cols } = await db.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER'`,
    [table],
  );
  const names = cols.map((c) => `"${c.column_name}"`).join(', ');
  // Aynı birincil anahtar iki kez geliyorsa yedek bozuk: çökmeden say, ilkini yükle
  const ids = data.length && 'id' in data[0] ? data.map((r) => r.id) : [];
  const dupes = ids.length - new Set(ids).size;
  if (dupes) problems.push(`${table}: yedekte aynı kimlikli ${dupes} satır`);
  const firstSeen = new Set();
  const rowsToLoad = dupes ? data.filter((r) => !firstSeen.has(r.id) && firstSeen.add(r.id)) : data;
  for (let i = 0; i < rowsToLoad.length; i += 5000) {
    await db.query(
      `insert into public."${table}" (${names}) overriding system value
       select ${names} from jsonb_populate_recordset(null::public."${table}", $1::jsonb)`,
      [JSON.stringify(rowsToLoad.slice(i, i + 5000))],
    );
  }
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public."${table}"`);
  loaded[table] = n;
  if (n !== rowsToLoad.length) problems.push(`${table}: yedekte ${rowsToLoad.length}, yüklenen ${n}`);
}
await db.exec(`set session_replication_role = origin`);

/* Bağlantılar: her yabancı anahtar için öksüz satır */
const { rows: fks } = await db.query(`
  select c.conname, c.conrelid::regclass::text as child, c.confrelid::regclass::text as parent,
    array(select a.attname from unnest(c.conkey) with ordinality k(n, i) join pg_attribute a
          on a.attrelid = c.conrelid and a.attnum = k.n order by k.i) as child_cols,
    array(select a.attname from unnest(c.confkey) with ordinality k(n, i) join pg_attribute a
          on a.attrelid = c.confrelid and a.attnum = k.n order by k.i) as parent_cols
  from pg_constraint c join pg_namespace s on s.oid = c.connamespace
  where c.contype = 'f' and s.nspname = 'public'`);
let checkedFks = 0;
for (const fk of fks) {
  const notNull = fk.child_cols.map((c) => `c."${c}" is not null`).join(' and ');
  const match = fk.child_cols.map((c, i) => `p."${fk.parent_cols[i]}" = c."${c}"`).join(' and ');
  const { rows: [{ n }] } = await db.query(
    `select count(*)::int as n from ${fk.child} c where ${notNull} and not exists (select 1 from ${fk.parent} p where ${match})`,
  );
  checkedFks++;
  if (n) problems.push(`${fk.child} → ${fk.parent} (${fk.conname}): ${n} öksüz satır`);
}

/* Fotoğraf dosyaları */
const fileExists = (bucket, path) => existsSync(join(dir, 'storage', bucket, ...path.split('/')));
let photoFiles = 0;
const { rows: photos } = await db.query(`select path from public.post_photos where path !~ '^https?://'`);
for (const { path } of photos) {
  for (const p of [path, path.replace(/\.jpg$/, '_t.jpg')]) {
    photoFiles++;
    if (!fileExists('post-photos', p)) problems.push(`post-photos/${p}: dosya yedekte yok`);
  }
}
const { rows: avatars } = await db.query(
  `select avatar_path from public.profiles where avatar_path is not null and avatar_path !~ '^https?://'`,
);
for (const { avatar_path: p } of avatars) {
  photoFiles++;
  if (!fileExists('avatars', p)) problems.push(`avatars/${p}: dosya yedekte yok`);
}

/* Uygulamanın okuduğu görünümler */
const views = {};
for (const view of ['post_view', 'profile_view', 'place_view', 'comment_view']) {
  const { rows: [{ n }] } = await db.query(`select count(*)::int as n from public.${view}`);
  views[view] = n;
}
if (views.post_view !== loaded.posts) problems.push(`post_view ${views.post_view} ≠ posts ${loaded.posts}`);

await db.close();

console.log(
  `Hesap ${users.length}, tablo ${Object.keys(loaded).length}: gönderi ${loaded.posts}, puan ${loaded.rankings}, ` +
    `yorum ${loaded.comments}, beğeni ${loaded.post_likes}, takip ${loaded.follows}, mekân ${loaded.places}`,
);
console.log(`Yabancı anahtar ${checkedFks} denetlendi; fotoğraf dosyası ${photoFiles} denetlendi`);
console.log(`Görünümler: ${Object.entries(views).map(([k, v]) => `${k} ${v}`).join(', ')}`);
if (problems.length) {
  console.log(`\nSORUN (${problems.length}):\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log('\nGERİ YÜKLENEBİLİR: tüm satırlar yüklendi, bağlantılar tam, fotoğraflar eksiksiz.');
}
