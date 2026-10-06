/**
 * Canlı veritabanının ve dosyaların yerel yedeği (kullanıcı isteği 2026-10-03: "gönderiler silinme durumu olmasın").
 *
 * Supabase ücretsiz planda otomatik yedek almıyor (Pro'da günlük, 7 gün); dosyalar (Storage) hiçbir planın veritabanı
 * yedeğinde yok. Bu betik servis anahtarıyla:
 *   1. `public` şemasındaki her tabloyu (görünümler `*_view` hariç) sayfa sayfa `tables/<ad>.json` olarak,
 *   2. hesap listesini (Auth: e-posta, oluşturulma, son giriş; şifre özetleri API'den gelmez) `auth-users.json`,
 *   3. tüm dosya kovalarını (gönderi fotoğrafları, profil fotoğrafları, yasal metinler) `storage/<kova>/…`
 * altına indirir. Klasör: `C:\dev\puanla-yedek\<tarih-saat>` (depo ve OneDrive dışında; kişisel veri içerir,
 * paylaşma). Geri yükleme şimdilik elle: tablolar JSON, sıra kimliklere göre.
 *
 * Çalıştırma: npm run backup   (.env.local'da SUPABASE_SERVICE_ROLE_KEY gerekir)
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const URL_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_BASE || !KEY) throw new Error('.env.local: EXPO_PUBLIC_SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli');
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Klasör adı yerel saatle: 2026-10-03-02-53
const now = new Date();
const stamp = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16).replace(/[:T]/g, '-');
const ROOT = join(process.env.PUANLA_BACKUP_DIR ?? 'C:\\dev\\puanla-yedek', stamp);
const PAGE = 1000;

async function json(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...headers, ...init.headers } });
  if (!res.ok) throw new Error(`${res.status} ${url}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function save(path, data) {
  const file = join(ROOT, path);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, typeof data === 'string' || data instanceof Uint8Array ? data : JSON.stringify(data));
}

/* 1. Tablolar */
const spec = await json(`${URL_BASE}/rest/v1/`);
const tables = Object.entries(spec.definitions ?? {}).filter(([name]) => !name.endsWith('_view'));
const summary = {};
for (const [name, def] of tables) {
  const columns = Object.keys(def.properties ?? {});
  const rows = [];
  if (columns.includes('id')) {
    // Kimlikten sonrası (keyset): yedek sürerken eklenen/silinen satır sayfaları kaydırmaz. Atlamalı (offset)
    // sayfalamada 2026-10-03'te yedek sırasında eklenen bir mekân bir satırı iki kez yazdırdı.
    let after;
    for (;;) {
      const page = await json(
        `${URL_BASE}/rest/v1/${name}?select=*&order=id&limit=${PAGE}${after ? `&id=gt.${after}` : ''}`,
      );
      rows.push(...page);
      if (page.length < PAGE) break;
      after = page.at(-1).id;
    }
  } else {
    // Kimliksiz (bileşik anahtarlı, küçük) tablolar: tüm sütunlara göre sıralı atlamalı sayfalama
    for (let from = 0; ; from += PAGE) {
      const page = await json(`${URL_BASE}/rest/v1/${name}?select=*&order=${columns.join(',')}`, {
        headers: { Range: `${from}-${from + PAGE - 1}` },
      });
      rows.push(...page);
      if (page.length < PAGE) break;
    }
  }
  // Son güvence: birebir aynı satır iki kez gelmesin
  const seen = new Set();
  const unique = rows.filter((r) => {
    const key = JSON.stringify(r);
    return !seen.has(key) && seen.add(key);
  });
  rows.length = 0;
  rows.push(...unique);
  await save(`tables/${name}.json`, rows);
  summary[name] = rows.length;
  process.stdout.write(`${name} ${rows.length}  `);
}
console.log();

/* 2. Hesaplar */
const users = [];
for (let page = 1; ; page++) {
  const { users: batch } = await json(`${URL_BASE}/auth/v1/admin/users?page=${page}&per_page=200`);
  users.push(...batch);
  if (batch.length < 200) break;
}
await save('auth-users.json', users);
summary['auth.users'] = users.length;

/* 3. Dosyalar */
async function listAll(bucket, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += 1000) {
    const items = await json(`${URL_BASE}/storage/v1/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    for (const item of items) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      // Klasörün kimliği yok: içine in
      if (item.id === null) out.push(...(await listAll(bucket, path)));
      else out.push(path);
    }
    if (items.length < 1000) break;
  }
  return out;
}

const buckets = await json(`${URL_BASE}/storage/v1/bucket`);
let bytes = 0;
for (const bucket of buckets) {
  const paths = await listAll(bucket.name);
  for (const path of paths) {
    const res = await fetch(`${URL_BASE}/storage/v1/object/${bucket.name}/${path.split('/').map(encodeURIComponent).join('/')}`, { headers });
    if (!res.ok) throw new Error(`${res.status} ${bucket.name}/${path}`);
    const body = new Uint8Array(await res.arrayBuffer());
    bytes += body.length;
    await save(`storage/${bucket.name}/${path}`, body);
  }
  summary[`storage/${bucket.name}`] = paths.length;
}

await save('ozet.json', { at: new Date().toISOString(), counts: summary, storageBytes: bytes });
console.log(`Yedek: ${ROOT}`);
console.log(`Hesap ${users.length}, gönderi ${summary.posts ?? 0}, puan ${summary.rankings ?? 0}, yorum ${summary.comments ?? 0}, ` +
  `mekân ${summary.places ?? 0}; dosya ${Object.entries(summary).filter(([k]) => k.startsWith('storage/')).map(([k, v]) => `${k.slice(8)} ${v}`).join(', ')} ` +
  `(${(bytes / 1048576).toFixed(1)} MB)`);
