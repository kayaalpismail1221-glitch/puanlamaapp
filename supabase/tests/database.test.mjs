/**
 * Veritabanı testleri: migration'lar ve seed PGlite (WASM Postgres + PostGIS) üzerinde çalıştırılır,
 * sonra güvenlik kuralları ve fonksiyonlar gerçek kullanıcı rolleriyle denenir.
 *
 * Çalıştırma: npm run test:db
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SEGMENT_OF, SEGMENTS } from '../../src/constants/segments.ts';
import {
  answerComparison,
  calibratedScoreAt,
  comparisonPivot,
  emptyRankings,
  flattenRankings,
  insertEntry,
  isComparisonDone,
  levelStarts,
  placementIndex,
  removeFromRankings,
  scoreAt,
  segmentStanding,
  startComparison,
  tieComparison,
} from '../../src/lib/ranking.ts';
import { isBelowMinVersion } from '../../src/lib/version.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

/** Seed'deki demo kimlikleri */
const USER = (n) => `b0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PLACE = (n) => `a0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const POST = (n) => `c0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const KADIKOY = { lat: 40.99, lng: 29.027 };
const ANTALYA = { lat: 36.8969, lng: 30.7133 };

let db;

before(async () => {
  db = await PGlite.create({ extensions: { postgis, pg_trgm } });
  await db.exec(read('tests/supabase-shim.sql'));
  for (const file of readdirSync(join(root, 'migrations')).sort()) {
    await db.exec(read(join('migrations', file)));
  }
  await db.exec(read('seed.sql'));
});

after(() => db?.close());

/** Sorguyu belirli bir kullanıcı olarak (RLS etkin) çalıştırır; işlem sonunda geri alınmaz */
async function as(userId, sql, params = []) {
  return db.transaction(async (tx) => {
    if (userId) {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [
        JSON.stringify({ sub: userId, role: 'authenticated' }),
      ]);
      await tx.exec('set local role authenticated');
    } else {
      await tx.query(`select set_config('request.jwt.claims', '', true)`);
      await tx.exec('set local role anon');
    }
    return tx.query(sql, params);
  });
}

const rows = async (...args) => (await as(...args)).rows;
const one = async (...args) => (await rows(...args))[0];

/** Hata bekler; Postgres hata kodunu ya da mesaj parçasını doğrular */
async function rejects(promise, expected) {
  await assert.rejects(promise, (error) => {
    if (expected) assert.match(`${error.code} ${error.message}`, expected);
    return true;
  });
}

/** Yeni bir kayıtlı kullanıcı oluşturur (Supabase Auth'un yaptığı gibi auth.users'a ekler) */
async function signUp(meta = {}, email = `${randomUUID()}@test.dev`) {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [id, email, meta]);
  return id;
}

describe('kayıt', () => {
  test('profil oluşur, telefon numarası yalnızca sahibine görünür', async () => {
    const id = await signUp({ name: 'Ayşe Yılmaz', username: 'ayseyilmaz', phone: '0532 123 45 67' });
    const profile = await one(id, 'select * from profiles where id = $1', [id]);
    assert.equal(profile.name, 'Ayşe Yılmaz');
    assert.equal(profile.username, 'ayseyilmaz');
    assert.equal(profile.onboarded_at, null);
    const priv = await one(id, 'select phone from profile_private where user_id = $1', [id]);
    assert.equal(priv.phone, '+905321234567');
    assert.equal(profile.is_admin, false);
    const other = await signUp({ name: 'Başka Biri' });
    assert.equal(await one(other, 'select phone from profile_private where user_id = $1', [id]), undefined);
  });

  test('telefon isteğe bağlı; geçersiz numara saklanmaz', async () => {
    const none = await signUp({ name: 'Telefonsuz' });
    const bad = await signUp({ name: 'Sabit Hat', phone: '2161234567' });
    assert.equal((await one(none, 'select phone from profile_private where user_id = $1', [none])).phone, null);
    assert.equal((await one(bad, 'select phone from profile_private where user_id = $1', [bad])).phone, null);
  });

  test('alınmış kullanıcı adına sayı eklenir, Türkçe karakterler sadeleşir', async () => {
    const a = await signUp({ name: 'Çağrı Öztürk', username: 'cagriozturk' });
    const b = await signUp({ name: 'Çağrı Öztürk' });
    const [pa, pb] = await Promise.all([
      one(a, 'select username from profiles where id = $1', [a]),
      one(b, 'select username from profiles where id = $1', [b]),
    ]);
    assert.equal(pa.username, 'cagriozturk');
    assert.equal(pb.username, 'cagriozturk2');
  });

  test('meta veri yoksa e-postadan ad üretilir (Apple ile giriş)', async () => {
    const id = await signUp({}, 'gizli.kisi@privaterelay.appleid.com');
    const profile = await one(id, 'select name, username from profiles where id = $1', [id]);
    assert.equal(profile.name, 'gizli.kisi');
    assert.equal(profile.username, 'gizli.kisi');
  });

  test('kullanıcı adı uygunluğu girişsiz sorulabilir', async () => {
    assert.equal((await one(null, `select username_available('zeynepyer') as ok`)).ok, false);
    assert.equal((await one(null, `select username_available('yepyeni_ad') as ok`)).ok, true);
    assert.equal((await one(null, `select username_available('A B') as ok`)).ok, false);
  });

  test('e-postanın kayıtlı olup olmadığı girişsiz sorulabilir (büyük harf ve boşluk fark etmez)', async () => {
    await signUp({}, 'kayitli.kisi@test.dev');
    assert.equal((await one(null, `select email_registered('kayitli.kisi@test.dev') as ok`)).ok, true);
    assert.equal((await one(null, `select email_registered('  Kayitli.Kisi@TEST.dev ') as ok`)).ok, true);
    assert.equal((await one(null, `select email_registered('yeni.kisi@test.dev') as ok`)).ok, false);
  });
});

describe('toplu mekân içe aktarımı', () => {
  test('OSM kaynaklı mekân eklenir, aynı external_id tekrar eklenemez', async () => {
    const insert = `insert into places (name, cuisine, neighborhood, district, city, latitude, longitude, source, external_id)
      values ('Test Pizzacı', 'Pizzacı', 'Caferağa', 'Kadıköy', 'İstanbul', 40.99, 29.03, 'osm', 'node/1')`;
    await db.exec(insert);
    await rejects(db.exec(insert), /duplicate key/);
    // Üyeler kendi ekledikleri mekâna 'osm' kaynağını yazamaz (sütun yetkisi yok)
    const me = await signUp({ name: 'OSM Test', phone: '5551112299' });
    await rejects(
      as(me, `insert into places (name, cuisine, district, city, latitude, longitude, source) values ('X Yer', 'Kafe', 'Kadıköy', 'İstanbul', 40.99, 29.03, 'osm')`),
      /42501/,
    );
    await db.exec(`delete from places where source = 'osm'`);
  });
});

describe('mekân konumu ve birleşik içe aktarım', () => {
  /** Kutu biçimli sınır (WKT çizgi, iki parça): batı, güney, doğu, kuzey */
  const box = (w, s, e, n) => `MULTILINESTRING((${w} ${s}, ${e} ${s}, ${e} ${n}), (${e} ${n}, ${w} ${n}, ${w} ${s}))`;

  /** Testi tek işlemde çalıştırıp geri alır: sınırlar diğer testlerdeki mekânları etkilemesin */
  async function isolated(fn) {
    await db.transaction(async (tx) => {
      await tx.query(`select import_admin_area(1, 6::smallint, 'Kadıköy', 'İstanbul', $1)`, [box(29.0, 40.97, 29.05, 41.0)]);
      await tx.query(`select import_admin_area(2, 6::smallint, 'Üsküdar', 'İstanbul', $1)`, [box(29.0, 41.0, 29.05, 41.03)]);
      // Caferağa sınırı ilçe sınırından biraz taşıyor (OSM'deki gibi); Üsküdar tarafında seçilmemeli
      await tx.query(`select import_admin_area(11, 8::smallint, 'Caferağa', 'İstanbul', $1)`, [box(29.02, 40.98, 29.03, 41.001)]);
      await tx.query(`select import_admin_area(21, 8::smallint, 'Kuzguncuk', 'İstanbul', $1)`, [box(29.0, 41.0, 29.05, 41.03)]);
      // Beklenen hatalar işlemi iptal etmesin diye her üye sorgusu kendi kayıt noktasında
      await fn(tx, async (userId, sql, params = []) => {
        await tx.exec('savepoint as_user');
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: 'authenticated' })]);
        await tx.exec('set local role authenticated');
        try {
          const result = (await tx.query(sql, params)).rows;
          await tx.exec('release savepoint as_user');
          return result;
        } catch (error) {
          await tx.exec('rollback to savepoint as_user');
          throw error;
        } finally {
          await tx.exec('reset role');
          await tx.query(`select set_config('request.jwt.claims', '', true)`);
        }
      });
      await tx.rollback();
    });
  }

  test('ilçe ve mahalle koordinattan yazılır; elle yazılan ilçe düzelir', async () => {
    const me = await signUp({ name: 'Mekân Ekleyen' });
    await isolated(async (tx, asUser) => {
      await tx.query(`select refresh_place_areas()`);
      assert.equal((await tx.query(`select district from admin_areas where id = 11`)).rows[0].district, 'Kadıköy');
      // Seed'deki Moda mekânı kutunun içinde: mahallesi sınırdan yeniden hesaplandı
      assert.equal((await tx.query(`select neighborhood from places where id = $1`, [PLACE(1)])).rows[0].neighborhood, 'Caferağa');

      const [place] = await asUser(
        me,
        `insert into places (name, cuisine, district, city, neighborhood, address, latitude, longitude)
         values ('Yeni Burgerci', 'Burgerci', 'Kadıkoy', 'istanbul', '', 'Moda Cd. No:12', 40.99, 29.025)
         returning city, district, neighborhood, address`,
      );
      assert.deepEqual(place, { city: 'İstanbul', district: 'Kadıköy', neighborhood: 'Caferağa', address: 'Moda Cd. No:12' });

      // Mahalle sınırı taşsa da Üsküdar'daki nokta Kuzguncuk olur
      const [north] = (await tx.query(`select * from area_at(41.0005, 29.025)`)).rows;
      assert.deepEqual(north, { city: 'İstanbul', district: 'Üsküdar', neighborhood: 'Kuzguncuk' });
      // Kıyının hemen dışı (iskele) en yakın ilçeye bağlanır; uzak nokta boş döner
      assert.equal((await tx.query(`select * from area_at(40.99, 29.053)`)).rows[0].district, 'Kadıköy');
      assert.equal((await tx.query(`select * from area_at($1, $2)`, [ANTALYA.lat, ANTALYA.lng])).rows.length, 0);

      // Konum İstanbul dışında ama "İstanbul" yazılmışsa reddedilir; başka şehirde girilen değerler kalır
      await rejects(
        asUser(me, `insert into places (name, cuisine, district, city, latitude, longitude)
          values ('Yanlış Yer', 'Kafe', 'Kadıköy', 'İstanbul', 37.82, 36.79)`),
        /sınırları dışında/,
      );
      const [antalya] = await asUser(
        me,
        `insert into places (name, cuisine, district, city, latitude, longitude)
         values ('Sahil Kafe', 'Kafe', 'Muratpaşa', 'Antalya', $1, $2) returning district, city`,
        [ANTALYA.lat, ANTALYA.lng],
      );
      assert.deepEqual(antalya, { district: 'Muratpaşa', city: 'Antalya' });

      // Sınır tabloları ve içe aktarım fonksiyonları üyelere kapalı; konum sorgusu açık
      await rejects(asUser(me, 'select * from admin_areas'), /42501/);
      await rejects(asUser(me, 'select * from place_sources'), /42501/);
      await rejects(asUser(me, `select import_places('[]')`), /42501/);
      assert.equal((await asUser(me, 'select * from area_at(40.99, 29.025)'))[0].neighborhood, 'Caferağa');
    });
  });

  test('içe aktarım kaynak kimliğiyle eşleşir, kimlik korunur; kullanılmayan eski mekân temizlenir', async () => {
    const me = await signUp({ name: 'Puanlayan' });
    await isolated(async (tx) => {
      const row = (sources, name, extra = {}) => ({
        sources,
        name,
        cuisine: 'Kafe',
        address: 'Moda Cd. No:1',
        phone: '+902161234567',
        website: 'https://ornek.com',
        latitude: 40.99,
        longitude: 29.025,
        city: 'İstanbul',
        district: 'Kadıköy',
        ...extra,
      });
      const importRows = async (list) => (await tx.query(`select import_places($1) as r`, [JSON.stringify(list)])).rows[0].r;

      assert.deepEqual(
        await importRows([
          row([{ source: 'osm', external_id: 'node/9001' }], 'Eski Ad'),
          row([{ source: 'overture', external_id: 'ov-2' }], 'Kapanan Kafe'),
          row([{ source: 'overture', external_id: 'ov-3' }], 'Puanlı Kafe'),
        ]),
        [3, 0],
      );
      const first = (await tx.query(`select * from place_view where name = 'Eski Ad'`)).rows[0];
      assert.equal(first.neighborhood, 'Caferağa');
      assert.equal(first.address, 'Moda Cd. No:1');
      assert.equal(first.phone, '+902161234567');
      const rated = (await tx.query(`select id from places where name = 'Puanlı Kafe'`)).rows[0].id;
      await tx.query(`insert into saved_places (user_id, place_id) values ($1, $2)`, [me, rated]);

      const cutoff = (await tx.query(`select clock_timestamp() as t`)).rows[0].t;
      // Aynı mekân ikinci kaynaktan da geldi: yeni satır açılmaz, ad ve adres güncellenir
      assert.deepEqual(
        await importRows([
          row([{ source: 'osm', external_id: 'node/9001' }, { source: 'overture', external_id: 'ov-1' }], 'Yeni Ad', {
            address: 'Moda Cd. No:3',
          }),
        ]),
        [0, 1],
      );
      const again = (await tx.query(`select id, name, address from places where id = $1`, [first.id])).rows[0];
      assert.deepEqual(again, { id: first.id, name: 'Yeni Ad', address: 'Moda Cd. No:3' });
      assert.equal((await tx.query(`select count(*)::int as n from place_sources where place_id = $1`, [first.id])).rows[0].n, 2);

      // Başka ilin (sınırı yüklenmemiş) eski mekânı: İstanbul temizliği ona dokunmaz
      await importRows([
        row([{ source: 'overture', external_id: 'ov-ank' }], 'Ankara Kafe', {
          latitude: 39.92,
          longitude: 32.85,
          city: 'Ankara',
          district: 'Çankaya',
        }),
      ]);

      // Bu turda görülmeyen, kullanılmayan mekân silinir; Listem'deki kalır ama "kaynaktan düştü" işaretlenir
      await tx.query(
        `update places set imported_at = $1::timestamptz - interval '1 minute'
         where name in ('Kapanan Kafe', 'Puanlı Kafe', 'Ankara Kafe')`,
        [cutoff],
      );
      assert.deepEqual((await tx.query(`select prune_imported_places($1, 'İstanbul') as r`, [cutoff])).rows[0].r, [1, 1]);
      const left = (
        await tx.query(
          `select name, source_dropped_at is not null as dropped from places
           where name in ('Kapanan Kafe', 'Puanlı Kafe', 'Yeni Ad', 'Ankara Kafe') order by name`,
        )
      ).rows;
      assert.deepEqual(left, [
        { name: 'Ankara Kafe', dropped: false },
        { name: 'Puanlı Kafe', dropped: true },
        { name: 'Yeni Ad', dropped: false },
      ]);
      // Kaynakta yeniden görülünce işaret kalkar; il verilmeden temizlik çalışmaz
      await importRows([row([{ source: 'overture', external_id: 'ov-3' }], 'Puanlı Kafe')]);
      assert.equal((await tx.query(`select source_dropped_at from places where name = 'Puanlı Kafe'`)).rows[0].source_dropped_at, null);
      await tx.exec('savepoint no_city');
      await rejects(tx.query(`select prune_imported_places(now(), '')`), /İl gerekli/);
      await tx.exec('rollback to savepoint no_city');
    });
  });
});

describe('mekân bilgisi düzeltmeleri', () => {
  let place;
  const suggest = (user, field, value = null, lat = null, lng = null) =>
    one(user, `select suggest_place_correction($1, $2, $3, $4, $5) as r`, [place, field, value, lat, lng]).then((x) => x.r);
  const current = async () => (await db.query(`select * from places where id = $1`, [place])).rows[0];
  /** Oyu sayılan hesap: 8 günlük ve 5 mekân puanlamış (düzeltilen mekân hariç) */
  const trusted = async (meta) => {
    const user = await signUp(meta);
    await db.query(`update profiles set created_at = now() - interval '8 days' where id = $1`, [user]);
    await db.query(
      `insert into rankings (user_id, place_id, sentiment, position, score)
       select $1, id, 'liked', 100 + row_number() over (order by id), 8
       from (select id from places where id <> $2 order by id limit 5) p`,
      [user, place],
    );
    return user;
  };

  before(async () => {
    place = (
      await db.query(`insert into places (name, cuisine, district, city, latitude, longitude, phone, source, external_id)
        values ('Düzeltme Kafe', 'Kafe', 'Kadıköy', 'İstanbul', 40.99, 29.03, '+902160000000', 'osm', 'node/777') returning id`)
    ).rows[0].id;
    await db.query(`insert into place_sources (source, external_id, place_id) values ('osm', 'node/777', $1)`, [place]);
  });
  after(() => db.query(`delete from places where id = $1`, [place]));

  test('tek kişinin önerisi bekler; telefonda bağımsız üçüncü güvenilir kişi aynısını söyleyince uygulanır ve kilitlenir', async () => {
    const a = await trusted({ name: 'Düzelten A' });
    const b = await trusted({ name: 'Düzelten B' });
    const d = await trusted({ name: 'Düzelten D' });
    const c = await trusted({ name: 'Farklı C' });
    assert.equal(await suggest(a, 'phone', '+902164185115'), 'pending');
    assert.equal(await suggest(c, 'phone', '+902169999999'), 'pending'); // farklı değer sayılmaz
    assert.equal((await current()).phone, '+902160000000');
    // Herkes yalnızca kendi önerisini görür
    assert.equal((await rows(b, 'select * from place_corrections')).length, 0);
    assert.equal((await rows(a, 'select * from place_corrections')).length, 1);

    // Telefon (oltalamaya açık) iki kişiyle değişmez
    assert.equal(await suggest(b, 'phone', '+902164185115'), 'pending');
    assert.equal(await suggest(d, 'phone', '+902164185115'), 'applied');
    const after = await current();
    assert.equal(after.phone, '+902164185115');
    assert.deepEqual(after.locked_fields, ['phone']);
    const statuses = await db.query(`select status, count(*)::int as n from place_corrections where place_id = $1 group by status order by status`, [place]);
    assert.deepEqual(statuses.rows, [{ status: 'applied', n: 3 }, { status: 'pending', n: 1 }]);

    // Adres: yazım farkı (büyük harf, Türkçe karakter) aynı öneri sayılır
    assert.equal(await suggest(a, 'address', 'Güneşlibahçe Sk. No:43'), 'pending');
    assert.equal(await suggest(b, 'address', 'GUNESLIBAHCE SK. NO:43'), 'applied');
    assert.equal((await current()).address, 'GUNESLIBAHCE SK. NO:43');
  });

  test('içe aktarım kilitli alanı ezmez, diğerlerini günceller', async () => {
    const rowsJson = JSON.stringify([{
      sources: [{ source: 'osm', external_id: 'node/777' }],
      name: 'Düzeltme Kafe Moda', cuisine: 'Kafe', address: 'Eski Sk.', phone: '+902160000000', website: 'https://ornek.com',
      latitude: 40.99, longitude: 29.03, city: 'İstanbul', district: 'Kadıköy',
    }]);
    await db.query(`select import_places($1)`, [rowsJson]);
    const after = await current();
    assert.equal(after.phone, '+902164185115');
    assert.equal(after.address, 'GUNESLIBAHCE SK. NO:43');
    assert.equal(after.name, 'Düzeltme Kafe Moda');
    assert.equal(after.website, 'https://ornek.com');
  });

  test('geçersiz değer ve uzak konum reddedilir', async () => {
    const a = await signUp({ name: 'Hatalı Öneri' });
    await rejects(suggest(a, 'phone', '0216 418'), /22023/);
    await rejects(suggest(a, 'website', 'javascript:alert(1)'), /22023/);
    await rejects(suggest(a, 'location', null, ANTALYA.lat, ANTALYA.lng), /çok uzak/);
    await rejects(rows(null, `select suggest_place_correction($1, 'closed')`, [place]), /42501/);
    await rejects(rows(a, `select apply_place_correction(gen_random_uuid())`), /42501/);
  });

  test('yeni hesapların oyu kendiliğinden uygulanmaz (yönetici kuyruğunda bekler)', async () => {
    const fresh = await Promise.all([1, 2, 3, 4].map((n) => signUp({ name: `Yeni Hesap ${n}` })));
    for (const user of fresh) assert.equal(await suggest(user, 'closed'), 'pending');
    for (const user of fresh.slice(0, 3)) assert.equal(await suggest(user, 'website', 'https://oltalama.example.com'), 'pending');
    const now = await current();
    assert.equal(now.closed_at, null);
    assert.notEqual(now.website, 'https://oltalama.example.com');
    // Eski ama hiç puanlamamış hesap da sayılmaz
    const idle = await signUp({ name: 'Eski Boş' });
    await db.query(`update profiles set created_at = now() - interval '60 days' where id = $1`, [idle]);
    assert.equal(await suggest(idle, 'closed'), 'pending');
    assert.equal((await current()).closed_at, null);
    await db.query(`delete from place_corrections where place_id = $1 and status = 'pending'`, [place]);
  });

  test('kapandı: üç bağımsız bildirimle kapanır, arama ve haritadan çıkar', async () => {
    const [a, b, c] = await Promise.all([trusted({ name: 'K1' }), trusted({ name: 'K2' }), trusted({ name: 'K3' })]);
    await db.query(`insert into rankings (user_id, place_id, sentiment, position, score) values ($1, $2, 'liked', 0, 8)`, [a, place]);
    const inSearch = async () => (await rows(a, `select id from search_places('Düzeltme Kafe')`)).some((p) => p.id === place);
    const onMap = async () => (await rows(a, 'select id from map_places(40.8, 28.5, 41.3, 29.4)')).some((p) => p.id === place);
    assert.ok(await inSearch());
    assert.ok(await onMap());
    assert.equal(await suggest(a, 'closed'), 'pending');
    assert.equal(await suggest(b, 'closed'), 'pending');
    assert.equal(await suggest(c, 'closed'), 'applied');
    assert.ok((await current()).closed_at);
    assert.equal(await inSearch(), false);
    assert.equal(await onMap(), false);
    // Mekân sayfası ve geçmiş durur
    assert.ok((await one(a, 'select closed_at from place_view where id = $1', [place])).closed_at);
    await db.query(`update places set closed_at = null where id = $1`, [place]);
  });

  test('yönetici kuyruğu: yalnızca yönetici görür, onaylar ya da reddeder', async () => {
    const [user, admin] = await Promise.all([signUp({ name: 'Önerici' }), signUp({ name: 'Yönetici Düzeltme' })]);
    await db.query(`update profiles set is_admin = true where id = $1`, [admin]);
    assert.equal(await suggest(user, 'website', 'https://ciya.com.tr'), 'pending');
    assert.equal(await suggest(user, 'name', 'Çiya'), 'pending');
    await rejects(rows(user, 'select * from admin_place_corrections()'), /42501/);
    const queue = await rows(admin, 'select * from admin_place_corrections()');
    const website = queue.find((q) => q.field === 'website');
    const name = queue.find((q) => q.field === 'name');
    assert.equal(website.current_value, 'https://ornek.com');
    assert.equal(website.supporters, 1);
    await as(admin, 'select admin_resolve_correction($1, true)', [website.id]);
    await as(admin, 'select admin_resolve_correction($1, false)', [name.id]);
    const after = await current();
    assert.equal(after.website, 'https://ciya.com.tr');
    assert.equal(after.name, 'Düzeltme Kafe Moda');
    assert.ok(after.locked_fields.includes('website'));
  });
});

describe('mekân güveni ve arama', () => {
  const created = [];
  /** İçe aktarılmış gibi mekân; `rated`: puanı var (sayaç), `weak`: zayıf kayıt */
  const importedPlace = async (name, lat, lng, city, extra = {}) => {
    const { rows: [p] } = await db.query(
      `insert into places (name, cuisine, district, city, latitude, longitude, source, external_id, weak, rating_count, address)
       values ($1, $9, 'Merkez', $2, $3, $4, 'overture', $5, $6, $7, $8) returning id`,
      [name, city, lat, lng, `ov-${randomUUID()}`, !!extra.weak, extra.rated ? 1 : 0, extra.address ?? '', extra.cuisine ?? 'Kafe'],
    );
    created.push(p.id);
    return p.id;
  };
  after(() => db.query('delete from places where id = any($1)', [created]));

  test('arama: yakındaki önce, aynı benzerlikte puanlanmış önce; konum yoksa ad başı eşleşmesi önce', async () => {
    const user = await signUp({ name: 'Arayan' });
    const istanbul = await importedPlace('Kore Sofrası', 41.0, 29.0, 'İstanbul', { rated: true });
    const plain = await importedPlace('Boyang Kore Sofrası', 39.7812, 30.5081, 'Eskişehir');
    const rated = await importedPlace('Dostlar Kore Sofrası', 39.7815, 30.5121, 'Eskişehir', { rated: true });
    const order = async (lat, lng) =>
      (await rows(user, 'select id from search_places($1, $2, $3)', ['kore sofrasi', lat, lng]))
        .map((p) => p.id)
        .filter((id) => [istanbul, plain, rated].includes(id));

    // Eskişehir'den: önce yakındakiler (puanlanmış önce), İstanbul'daki ad başı eşleşmesi sonra
    assert.deepEqual(await order(39.78, 30.51), [rated, plain, istanbul]);
    // İstanbul'dan: İstanbul'daki önce
    assert.equal((await order(41.0, 29.0))[0], istanbul);
    // Konum yoksa hepsi "yakın": ad başı eşleşmesi önce
    assert.equal((await order(null, null))[0], istanbul);
  });

  test('arama: adında geçen önce; yalnızca adresi eşleşen yakın mekân adı eşleşen uzak mekânın arkasında', async () => {
    const user = await signUp({ name: 'Ankara’dan Arayan' });
    const famous = await importedPlace('Çiya Sofrası Deneme', 40.9895, 29.0255, 'İstanbul', { rated: true });
    const byAddress = await importedPlace('Viya Kahve Deneme', 39.9208, 32.8541, 'Ankara', { address: 'Çiya Sk. No:3' });
    // Canlıdaki gerçek örnekler: adlar iki kelimeye yayılan parçalarla "çiya"ya %60 benziyor ama içermiyor
    const lookalikes = [
      await importedPlace('Viya Coffee&More Deneme', 39.9209, 32.8542, 'Ankara'),
      await importedPlace('Vanilya Çikolata Deneme', 39.9210, 32.8543, 'Ankara'),
    ];
    const ids = (await rows(user, 'select id from search_places($1, $2, $3)', ['çiya', 39.92, 32.85]))
      .map((p) => p.id)
      .filter((id) => [famous, byAddress, ...lookalikes].includes(id));
    assert.equal(ids[0], famous);
  });

  test('arama: önce yakındakiler (adında geçen, sonra türü/şehri tutan), adı birebir tutan uzak mekân arkada ama listede', async () => {
    const user = await signUp({ name: 'Adanalı Arayan' });
    const nearByName = await importedPlace('Büyük Adana Kebap Deneme', 37.0001, 35.3211, 'Adana', { cuisine: 'Kebapçı' });
    // Adında "adana" ve "kebap" yok; türü Kebapçı, şehri Adana
    const nearByKind = await importedPlace('Halil Usta Deneme', 37.0003, 35.3213, 'Adana', { cuisine: 'Kebapçı' });
    const farByName = await importedPlace('Adana Kebap Salonu Deneme', 39.7767, 30.5206, 'Eskişehir', { cuisine: 'Kebapçı', rated: true });
    const order = async (lat, lng) =>
      (await rows(user, 'select id from search_places($1, $2, $3)', ['adana kebap', lat, lng]))
        .map((p) => p.id)
        .filter((id) => [nearByName, nearByKind, farByName].includes(id));

    assert.deepEqual(await order(37.0, 35.32), [nearByName, nearByKind, farByName]);
    // Eskişehir'den: oradaki önce; Adana'dakilerden adında geçen gelir (Halil Usta uzakta yalnızca benzerlikle)
    const fromEskisehir = await order(39.78, 30.52);
    assert.equal(fromEskisehir[0], farByName);
    assert.ok(fromEskisehir.includes(nearByName));
  });

  test('zayıf kayıt: içe aktarım işaretler; yakınımdakilerde çıkmaz, aramada en sonda; puanlanınca normal', async () => {
    const user = await signUp({ name: 'Yakın Arayan' });
    const imported = (weak) =>
      db.query('select import_places($1)', [
        JSON.stringify([
          {
            sources: [{ source: 'overture', external_id: 'ov-zayif-1' }],
            name: 'İçe Aktarılan Lokanta',
            cuisine: 'Kafe',
            latitude: 37.0003,
            longitude: 35.3003,
            city: 'Adana',
            district: 'Seyhan',
            weak,
          },
        ]),
      ]);
    await imported(true);
    const { rows: [fromImport] } = await db.query(`select id, weak from places where name = 'İçe Aktarılan Lokanta'`);
    created.push(fromImport.id);
    assert.equal(fromImport.weak, true);
    await imported(false);
    assert.equal((await db.query('select weak from places where id = $1', [fromImport.id])).rows[0].weak, false);

    const weak = await importedPlace('Zayıf Lokanta', 37.0001, 35.3001, 'Adana', { weak: true });
    const normal = await importedPlace('Normal Lokanta', 37.0002, 35.3002, 'Adana');
    const nearby = async () => (await rows(user, 'select id from search_places($1, $2, $3)', ['', 37.0, 35.3])).map((p) => p.id);
    const ids = await nearby();
    assert.ok(ids.includes(normal));
    assert.ok(!ids.includes(weak));
    const order = (await rows(user, 'select id from search_places($1, $2, $3)', ['lokanta', 37.0, 35.3]))
      .map((p) => p.id)
      .filter((id) => id === weak || id === normal);
    assert.deepEqual(order, [normal, weak]);
    // Adıyla aranınca bulunur
    assert.ok((await rows(user, `select id from search_places('Zayıf Lokanta')`)).some((p) => p.id === weak));

    // Biri puanlayınca zayıflığın önemi kalmaz: yakınımdakilerde görünür
    await as(user, `select rank_place($1, 'liked', 0)`, [weak]);
    assert.ok((await nearby()).includes(weak));
  });
});

describe('erişim kuralları', () => {
  test('giriş yapmamış kullanıcı içerik göremez', async () => {
    await rejects(rows(null, 'select * from profiles'), /42501/);
    await rejects(rows(null, 'select * from post_view'), /42501/);
    await rejects(rows(null, `select feed_following()`), /42501/);
    assert.equal((await rows(null, 'select * from cuisines')).length, Object.keys(SEGMENT_OF).length);
  });

  test('başkasının iletişim bilgisi ve Listem’i görünmez', async () => {
    const me = await signUp({ name: 'Test Kişi', phone: '5551112233' });
    await as(me, `insert into saved_places (place_id) values ($1)`, [PLACE(1)]);
    const other = USER(1);
    assert.equal((await rows(other, 'select * from profile_private where user_id = $1', [me])).length, 0);
    assert.equal((await rows(other, 'select * from saved_places where user_id = $1', [me])).length, 0);
    assert.equal((await rows(me, 'select * from saved_places')).length, 1);
  });

  test('profil yalnızca izin verilen alanlarda düzenlenir', async () => {
    const me = await signUp({ name: 'Düzenleyen' });
    await as(me, `update profiles set name = 'Yeni Ad', school_id = 'galatasaray' where id = $1`, [me]);
    assert.equal((await one(me, 'select name from profiles where id = $1', [me])).name, 'Yeni Ad');
    await rejects(as(me, `update profiles set follower_count = 999 where id = $1`, [me]), /42501/);
    // Başkasının profili: RLS satırı göstermez, güncelleme sessizce 0 satır etkiler
    await as(me, `update profiles set name = 'Hack' where id = $1`, [USER(1)]);
    assert.notEqual((await one(me, 'select name from profiles where id = $1', [USER(1)])).name, 'Hack');
    await rejects(as(me, `update profiles set username = 'zeynepyer' where id = $1`, [me]), /23505/);
  });

  test('sıralama tablosuna doğrudan yazılamaz', async () => {
    const me = await signUp({ name: 'Hileci' });
    await rejects(
      as(me, `insert into rankings (user_id, place_id, sentiment, position, score) values ($1, $2, 'liked', 0, 10)`, [
        me,
        PLACE(1),
      ]),
      /42501/,
    );
  });

  test('başkası adına takip, beğeni ve yorum yapılamaz', async () => {
    const me = await signUp({ name: 'Taklitçi' });
    await rejects(
      as(me, `insert into follows (follower_id, followee_id) values ($1, $2)`, [USER(1), USER(2)]),
      /42501|row-level security/,
    );
    await rejects(
      as(me, `insert into post_likes (post_id, user_id) values ($1, $2)`, [POST(1), USER(2)]),
      /42501|row-level security/,
    );
    await rejects(
      as(me, `insert into comments (post_id, user_id, body) values ($1, $2, 'x')`, [POST(1), USER(2)]),
      /42501/,
    );
  });

  test('depolamada yalnızca kendi klasörüne yazılır', async () => {
    const me = await signUp({ name: 'Yükleyen' });
    await as(me, `insert into storage.objects (bucket_id, name) values ('post-photos', $1)`, [`${me}/x/0.jpg`]);
    await rejects(
      as(me, `insert into storage.objects (bucket_id, name) values ('post-photos', $1)`, [`${USER(1)}/x/0.jpg`]),
      /row-level security/,
    );
    await rejects(
      as(me, `insert into storage.objects (bucket_id, name) values ('avatars', 'avatar.jpg')`),
      /row-level security/,
    );
  });
});

describe('sıralama', () => {
  // Seed'de aynı segmentteki (sokak lezzeti) mekânlar: dürümcü, kokoreççi, ciğerci, pideci, dürümcü (Ankara)
  const places = [3, 4, 5, 11, 19].map(PLACE);
  const BREAKFAST = [PLACE(1), PLACE(14)];

  async function myRankings(me) {
    return rows(
      me,
      `select place_id, sentiment, segment::text, position, score::float as score from rankings where user_id = $1`,
      [me],
    );
  }

  test('ekleme, yer değiştirme ve çıkarma sırayı ve puanları tutarlı tutar', async () => {
    const me = await signUp({ name: 'Sıralayan' });
    // liked: [p1], sonra p2 en üste, p3 en alta
    await as(me, `select rank_place($1, 'liked', 0)`, [places[0]]);
    await as(me, `select rank_place($1, 'liked', 0)`, [places[1]]);
    await as(me, `select rank_place($1, 'liked', 2)`, [places[2]]);
    await as(me, `select rank_place($1, 'fine', 0, '  fena değil ')`, [places[3]]);

    let list = await myRankings(me);
    const liked = list.filter((r) => r.sentiment === 'liked').sort((a, b) => a.position - b.position);
    assert.deepEqual(
      liked.map((r) => r.place_id),
      [places[1], places[0], places[2]],
    );
    liked.forEach((r, i) => assert.equal(r.score, scoreAt('liked', i, 3)));
    assert.ok(list.every((r) => r.segment === 'street'));
    assert.equal((await one(me, 'select note from rankings where place_id = $1 and user_id = $2', [places[3], me])).note, 'fena değil');

    // Ortadaki mekânı "idare eder" grubuna taşı: iki grup da yeniden puanlanır
    const score = await one(me, `select rank_place($1, 'fine', 1) as score`, [places[0]]);
    assert.equal(Number(score.score), scoreAt('fine', 1, 2));
    list = await myRankings(me);
    const byPlace = Object.fromEntries(list.map((r) => [r.place_id, r]));
    assert.equal(byPlace[places[1]].position, 0);
    assert.equal(byPlace[places[2]].position, 1);
    assert.equal(byPlace[places[1]].score, scoreAt('liked', 0, 2));
    assert.equal(byPlace[places[2]].score, scoreAt('liked', 1, 2));

    await as(me, `select unrank_place($1)`, [places[1]]);
    list = await myRankings(me);
    assert.equal(list.length, 3);
    assert.equal(list.find((r) => r.place_id === places[2]).position, 0);
    assert.equal(list.find((r) => r.place_id === places[2]).score, scoreAt('liked', 0, 1));
  });

  test('segmentler ayrı listeler: kahvaltıcı dürümcüyle kıyaslanmaz, puanı etkilemez', async () => {
    const me = await signUp({ name: 'Segmentçi' });
    await as(me, `select rank_place($1, 'liked', 0)`, [places[0]]);
    await as(me, `select rank_place($1, 'liked', 0)`, [places[1]]);
    // Kahvaltıcı en üste konsa da sokak lezzetleri listesi değişmez
    await as(me, `select rank_place($1, 'liked', 0)`, [BREAKFAST[0]]);
    const byPlace = Object.fromEntries((await myRankings(me)).map((r) => [r.place_id, r]));
    assert.equal(byPlace[BREAKFAST[0]].segment, 'breakfast');
    assert.equal(byPlace[BREAKFAST[0]].position, 0);
    assert.equal(byPlace[BREAKFAST[0]].score, scoreAt('liked', 0, 1));
    assert.equal(byPlace[places[1]].position, 0);
    assert.equal(byPlace[places[0]].position, 1);
    assert.equal(byPlace[places[0]].score, scoreAt('liked', 1, 2));

    // İkinci kahvaltıcı yalnızca kahvaltıcılar arasında yer alır (indeks 1 = ilkinin altı)
    await as(me, `select rank_place($1, 'liked', 1)`, [BREAKFAST[1]]);
    const after = Object.fromEntries((await myRankings(me)).map((r) => [r.place_id, r]));
    assert.equal(after[BREAKFAST[1]].position, 1);
    assert.equal(after[BREAKFAST[1]].score, scoreAt('liked', 1, 2));
    assert.equal(after[places[1]].score, scoreAt('liked', 0, 2), 'başka segment değişmez');

    // Görünüm segmenti de döner (uygulama bununla gruplar)
    const view = await rows(me, 'select place_id, segment::text from ranking_view where user_id = $1', [me]);
    assert.equal(view.find((r) => r.place_id === BREAKFAST[1]).segment, 'breakfast');
  });

  test('kategori başka segmente geçerse mekân yeni listenin sonuna taşınır, iki liste de yeniden puanlanır', async () => {
    const me = await signUp({ name: 'Kategori Değişen' });
    await as(me, `select rank_place($1, 'liked', 0)`, [places[0]]);
    await as(me, `select rank_place($1, 'liked', 1)`, [places[4]]);
    await as(me, `select rank_place($1, 'liked', 0)`, [BREAKFAST[0]]);
    const original = (await db.query('select cuisine from places where id = $1', [places[4]])).rows[0].cuisine;
    try {
      await db.query(`update places set cuisine = 'Kahvaltıcı' where id = $1`, [places[4]]);
      const byPlace = Object.fromEntries((await myRankings(me)).map((r) => [r.place_id, r]));
      assert.equal(byPlace[places[4]].segment, 'breakfast');
      assert.equal(byPlace[places[4]].position, 1);
      assert.equal(byPlace[places[4]].score, scoreAt('liked', 1, 2));
      assert.equal(byPlace[BREAKFAST[0]].score, scoreAt('liked', 0, 2));
      assert.equal(byPlace[places[0]].score, scoreAt('liked', 0, 1));
    } finally {
      await db.query('update places set cuisine = $2 where id = $1', [places[4], original]);
    }
    assert.equal((await one(me, 'select segment::text from rankings where place_id = $1', [places[4]])).segment, 'street');
  });

  test('aşırı indeks gruba sığdırılır, puanlanan mekân Listem’den düşer', async () => {
    const me = await signUp({ name: 'Kaydeden' });
    await as(me, `insert into saved_places (place_id, origin) values ($1, 'social')`, [places[4]]);
    await as(me, `select rank_place($1, 'disliked', 99)`, [places[4]]);
    const r = await one(me, 'select position, score::float as score from rankings where user_id = $1', [me]);
    assert.equal(r.position, 0);
    assert.equal(r.score, scoreAt('disliked', 0, 1));
    assert.equal((await rows(me, 'select * from saved_places')).length, 0);
  });

  test('"İkisi aynı": eşit puan; listenin başına eşitlik konmaz; eşit olan silinince sıradaki devralır', async () => {
    const me = await signUp({ name: 'Kararsız' });
    const [a, b, c] = places;
    await as(me, `select rank_place($1, 'liked', 0)`, [a]);
    await as(me, `select rank_place($1, 'liked', 1, null, true)`, [b]);
    await as(me, `select rank_place($1, 'liked', 2)`, [c]);
    const scores = async () =>
      Object.fromEntries(
        (await rows(me, 'select place_id, score::float as score, tied from rankings where user_id = $1', [me])).map((r) => [
          r.place_id,
          r.score,
        ]),
      );
    let now = await scores();
    assert.equal(now[a], 10);
    assert.equal(now[b], 10, 'eşit');
    assert.equal(now[c], scoreAt('liked', 1, 2), 'iki seviye: 10 ve bir alt');
    // Başa eşitlik istense de eşitlik konmaz
    await as(me, `select rank_place($1, 'liked', 0, null, true)`, [c]);
    assert.equal((await one(me, 'select tied from rankings where user_id = $1 and place_id = $2', [me, c])).tied, false);
    now = await scores();
    assert.equal(now[c], 10);
    assert.equal(now[a], scoreAt('liked', 1, 2));
    assert.equal(now[b], now[a], 'eşitlik korunur');
    // Uygulama tarafı aynı sonucu verir
    const { rows: list } = await db.query(
      `select place_id as "placeId", segment, tied from rankings where user_id = $1 and sentiment = 'liked' order by position`,
      [me],
    );
    const client = Object.fromEntries(
      flattenRankings({ liked: list, fine: [], disliked: [] }).map((e) => [e.placeId, e.score]),
    );
    assert.deepEqual(client, now);
  });

  const scoresOf = async (me) =>
    Object.fromEntries(
      (await rows(me, 'select place_id, score::float as score from rankings where user_id = $1', [me])).map((r) => [
        r.place_id,
        r.score,
      ]),
    );

  test('eşitlik zinciri: grubun başı çıkınca altındaki eşiti yeni baş olur, üstteki gruba eşitlenmez', async () => {
    const me = await signUp({ name: 'Zincirci' });
    const [a, b, c] = places;
    const setUp = async () => {
      await as(me, `select rank_place($1, 'liked', 0)`, [a]);
      await as(me, `select rank_place($1, 'liked', 1)`, [b]);
      await as(me, `select rank_place($1, 'liked', 2, null, true)`, [c]);
      const s = await scoresOf(me);
      assert.ok(s[a] > s[b], 'A > B');
      assert.equal(s[b], s[c], 'B = C');
    };
    // Silme: A > B = C iken B çıkar
    await setUp();
    await as(me, 'select unrank_place($1)', [b]);
    let s = await scoresOf(me);
    assert.equal(s[a], 10);
    assert.equal(s[c], scoreAt('liked', 1, 2), 'C, A’ya eşitlenmez');
    assert.equal((await one(me, 'select tied from rankings where user_id = $1 and place_id = $2', [me, c])).tied, false);
    // Yeniden puanlama (başka gruba taşıma) aynı yoldan geçer
    await as(me, 'select unrank_place($1)', [c]);
    await setUp();
    await as(me, `select rank_place($1, 'fine', 0)`, [b]);
    s = await scoresOf(me);
    assert.equal(s[c], scoreAt('liked', 1, 2));
    assert.equal(s[b], scoreAt('fine', 0, 1));
    // Uygulama aynısını yapar
    let client = emptyRankings();
    for (const [id, index, tied] of [[a, 0, false], [b, 1, false], [c, 2, true]]) {
      client = insertEntry(client, { sentiment: 'liked', index, tied }, { placeId: id, segment: 'street', ratedAt: '' });
    }
    client = removeFromRankings(client, b);
    assert.deepEqual(client.liked.map((e) => [e.placeId, !!e.tied]), [[a, false], [c, false]]);
  });

  test('eşit grubun arasına eşitliksiz giren mekân grubun altına iner (eski uygulamalar)', async () => {
    const me = await signUp({ name: 'Araya Giren' });
    const [a, b, c, x] = places;
    await as(me, `select rank_place($1, 'liked', 0)`, [a]);
    await as(me, `select rank_place($1, 'liked', 1, null, true)`, [b]);
    await as(me, `select rank_place($1, 'liked', 2)`, [c]);
    // A = B > C; X, A ile B'nin arasına eşitliksiz: A'dan kötü, dolayısıyla B'den de kötü
    await as(me, `select rank_place($1, 'liked', 1)`, [x]);
    const order = await rows(
      me,
      `select place_id, score::float as score from rankings where user_id = $1 and sentiment = 'liked' order by position`,
      [me],
    );
    assert.deepEqual(order.map((r) => r.place_id), [a, b, x, c]);
    assert.deepEqual(order.map((r) => r.score), [10, 10, scoreAt('liked', 1, 3), scoreAt('liked', 2, 3)], 'A = B korunur');
    let client = emptyRankings();
    for (const [id, index, tied] of [[a, 0, false], [b, 1, true], [c, 2, false], [x, 1, false]]) {
      client = insertEntry(client, { sentiment: 'liked', index, tied }, { placeId: id, segment: 'street', ratedAt: '' });
    }
    assert.deepEqual(client.liked.map((e) => e.placeId), [a, b, x, c]);
  });

  test('ikili arama eşit mekânları tek mekân gibi sorar ve yeni mekânı doğru seviyeye koyar', () => {
    let seed = 3;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 500; trial++) {
      const values = Array.from({ length: Math.floor(rand() * 12) }, () => Math.floor(rand() * 6)).sort((p, q) => q - p);
      const value = Object.fromEntries(values.map((v, i) => [`p${i}`, v]));
      const list = values.map((v, i) => ({ placeId: `p${i}`, segment: 'street', ratedAt: '', tied: i > 0 && v === values[i - 1] }));
      const mine = Math.floor(rand() * 6);
      const levels = levelStarts(list);
      let c = startComparison(levels.length);
      let questions = 0;
      while (!isComparisonDone(c)) {
        const theirs = value[list[levels[comparisonPivot(c)]].placeId];
        questions++;
        c = mine === theirs ? tieComparison(c) : answerComparison(c, mine > theirs);
      }
      assert.ok(questions <= Math.ceil(Math.log2(levels.length + 1)), 'eşitler ayrı ayrı sorulmaz');
      const placed = insertEntry(
        { ...emptyRankings(), liked: list },
        { sentiment: 'liked', index: placementIndex(levels, list.length, c), tied: c.tied },
        { placeId: 'yeni', segment: 'street', ratedAt: '' },
      ).liked;
      value.yeni = mine;
      assert.deepEqual(placed.map((e) => value[e.placeId]), [...values, mine].sort((p, q) => q - p), 'doğru sırada');
      placed.forEach((e, i) =>
        assert.equal(i > 0 && !!e.tied, i > 0 && value[e.placeId] === value[placed[i - 1].placeId], 'eşitlik yalnızca eşitlerde'),
      );
    }
  });

  test('listedeki sıra seviyeden: yuvarlamada eşit görünenler ayrı, "İkisi aynı" olanlar aynı sırada', () => {
    const entries = (ids, tied = []) => ids.map((id) => ({ placeId: id, segment: 'street', ratedAt: '', tied: tied.includes(id) }));
    const rankings = {
      liked: entries(Array.from({ length: 10 }, (_, i) => `l${i}`)),
      fine: entries(['f0', 'f1'], ['f1']),
      disliked: entries(['b0']).map((e) => ({ ...e, segment: 'cafe' })),
    };
    assert.equal(scoreAt('liked', 1, 10), scoreAt('liked', 0, 10), 'ilk ikisi 10,0 görünür');
    assert.equal(segmentStanding(rankings, 'l0').rank, 1);
    assert.equal(segmentStanding(rankings, 'l1').rank, 2, 'sıraladığın ikinci, ikinci');
    assert.equal(segmentStanding(rankings, 'f0').rank, 11);
    assert.equal(segmentStanding(rankings, 'f1').rank, 11, 'eşitler aynı sırada');
    assert.deepEqual(segmentStanding(rankings, 'f1'), { segment: 'street', rank: 11, total: 12 });
    assert.deepEqual(segmentStanding(rankings, 'b0'), { segment: 'cafe', rank: 1, total: 1 });
    assert.equal(segmentStanding(rankings, 'yok'), undefined);
  });

  test('uygulama ve sunucu rastgele 300 işlemde aynı sırayı, eşitliği, puanı ve topluluk katkısını verir', async () => {
    const me = await signUp({ name: 'Rastgele' });
    const pool = [...places, ...BREAKFAST, PLACE(25), PLACE(9)];
    const { rows: cuisines } = await db.query('select id, cuisine from places where id = any($1)', [pool]);
    const segmentOfPlace = Object.fromEntries(cuisines.map((r) => [r.id, SEGMENT_OF[r.cuisine]]));
    let seed = 11;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = (list) => list[Math.floor(rand() * list.length)];
    let client = emptyRankings();
    for (let step = 0; step < 300; step++) {
      const placeId = pick(pool);
      const segment = segmentOfPlace[placeId];
      if (rand() < 0.2) {
        await as(me, 'select unrank_place($1)', [placeId]);
        client = removeFromRankings(client, placeId);
      } else {
        const sentiment = rand() < 0.6 ? 'liked' : pick(['fine', 'disliked']);
        const size = client[sentiment].filter((e) => e.segment === segment && e.placeId !== placeId).length;
        const index = Math.floor(rand() * (size + 2)) - (rand() < 0.05 ? 1 : 0);
        const tied = rand() < 0.35;
        await as(me, 'select rank_place($1, $2, $3, null, $4)', [placeId, sentiment, index, tied]);
        client = insertEntry(client, { sentiment, index, tied }, { placeId, segment, ratedAt: '' });
      }
      const { rows: server } = await db.query(
        `select place_id, sentiment::text, segment::text, position, tied, score::float as score,
           calibrated_score::float as calibrated
         from rankings where user_id = $1 order by position`,
        [me],
      );
      const clientScores = Object.fromEntries(flattenRankings(client).map((e) => [e.placeId, e.score]));
      for (const sentiment of ['liked', 'fine', 'disliked']) {
        for (const seg of new Set(Object.values(segmentOfPlace))) {
          const s = server.filter((r) => r.sentiment === sentiment && r.segment === seg);
          const c = client[sentiment].filter((e) => e.segment === seg);
          const at = `adım ${step}, ${sentiment}/${seg}`;
          assert.deepEqual(s.map((r) => r.place_id), c.map((e) => e.placeId), `sıra: ${at}`);
          assert.deepEqual(s.map((r) => r.position), s.map((_, i) => i), `boşluksuz: ${at}`);
          assert.deepEqual(s.map((r, i) => i > 0 && r.tied), c.map((e, i) => i > 0 && !!e.tied), `eşitlik: ${at}`);
          const tiers = [];
          s.forEach((r, i) => tiers.push(i === 0 ? 0 : tiers[i - 1] + (r.tied ? 0 : 1)));
          s.forEach((r, i) => {
            assert.equal(r.score, clientScores[r.place_id], `puan: ${at}`);
            assert.equal(r.calibrated, calibratedScoreAt(sentiment, tiers[i], tiers.at(-1) + 1), `katkı: ${at}`);
          });
        }
      }
    }
  });

  test('puan formülü uygulamayla birebir aynı', async () => {
    for (const sentiment of ['liked', 'fine', 'disliked']) {
      for (let count = 1; count <= 25; count++) {
        const { rows: scores } = await db.query(
          `select i, sentiment_score($1, i, $2)::float as score from generate_series(0, $2 - 1) i`,
          [sentiment, count],
        );
        for (const { i, score } of scores) assert.equal(score, scoreAt(sentiment, i, count), `${sentiment} ${i}/${count}`);
      }
    }
  });

  test('segmentteki favorin hep 10; az mekânla alt sınıra inilmez; liste büyüyünce tüm aralık; gruplar örtüşmez', () => {
    for (let count = 1; count <= 30; count++) assert.equal(scoreAt('liked', 0, count), 10);
    assert.equal(scoreAt('fine', 0, 1), 6.6);
    assert.equal(scoreAt('disliked', 0, 1), 3.3);
    assert.equal(scoreAt('liked', 1, 2), 9.8);
    // Eğri: üst taraf yüksek kalır, düşüş sona doğru hızlanır
    assert.deepEqual([0, 1, 2, 3, 4].map((i) => scoreAt('liked', i, 5)), [10, 9.8, 9.2, 8.1, 6.7]);
    assert.ok(scoreAt('liked', 19, 30) > 8.4, 'çok puanlayanın sevdiği yerler yüksek kalır');
    assert.equal(scoreAt('liked', 29, 30), 6.7);
    for (let count = 1; count <= 30; count++) {
      assert.ok(scoreAt('liked', count - 1, count) > scoreAt('fine', 0, 1 + (count % 7)));
      assert.ok(scoreAt('fine', count - 1, count) > scoreAt('disliked', 0, 1 + (count % 5)));
      for (let i = 1; i < count; i++) assert.ok(scoreAt('liked', i, count) <= scoreAt('liked', i - 1, count));
    }
  });

  test('topluluk katkısı: formül uygulamayla aynı; tek mekânın favorisi 8,9; liste katkı ortalaması uzunluktan bağımsız', async () => {
    const bandMean = { liked: 10 - 3.3 / 3, fine: 6.6 - 3.2 / 3, disliked: 3.3 - 3.3 / 3 };
    for (const sentiment of ['liked', 'fine', 'disliked']) {
      for (let count = 1; count <= 40; count++) {
        const { rows: values } = await db.query(
          `select i, calibrated_score($1, i, $2)::float as v from generate_series(0, $2 - 1) i`,
          [sentiment, count],
        );
        for (const { i, v } of values) assert.equal(v, calibratedScoreAt(sentiment, i, count), `${sentiment} ${i}/${count}`);
        const mean = values.reduce((sum, r) => sum + r.v, 0) / count;
        assert.ok(Math.abs(mean - bandMean[sentiment]) < 0.001, `${sentiment} ${count}: ortalama ${mean}`);
        for (let i = 1; i < count; i++) assert.ok(values[i].v < values[i - 1].v, 'sıra düştükçe katkı düşer');
      }
    }
    assert.equal(calibratedScoreAt('liked', 0, 1), 8.9, 'tek mekânlık listenin favorisi "beğendim" kadar');
    assert.equal(calibratedScoreAt('liked', 0, 30), 9.993, 'uzun listenin favorisi tam 10’a yakın');
    // Uzun listede kişinin gördüğü puana yaklaşır
    for (let t = 0; t < 30; t++) assert.ok(Math.abs(calibratedScoreAt('liked', t, 30) - scoreAt('liked', t, 30)) < 0.25);
  });

  test('topluluk puanı düz ortalama: kişinin gördüğü 10 ortalamaya 10 girer (kalibre katkı yalnızca saklanır)', async () => {
    const me = await signUp({ name: 'Tek Mekânlı' });
    const target = PLACE(22);
    await as(me, `select rank_place($1, 'liked', 0)`, [target]);
    const mine = await one(
      me,
      'select score::float as score, calibrated_score::float as calibrated from rankings where user_id = $1',
      [me],
    );
    assert.deepEqual(mine, { score: 10, calibrated: 8.9 });
    const expected = await one(me, 'select avg(score)::double precision as a, count(*)::int as c from rankings where place_id = $1', [target]);
    const details = (await one(me, 'select place_details($1) as d', [target])).d;
    assert.equal(details.rating.average, expected.a);
    const { city, district } = await one(me, 'select city, district from places where id = $1', [target]);
    const area = await rows(me, 'select id, average from area_top_places($1, $2)', [city, district]);
    assert.equal(area.find((p) => p.id === target).average, expected.a);
  });

  test('segment eşlemesi veritabanıyla aynı', async () => {
    const { rows: cuisines } = await db.query('select name, segment::text from cuisines');
    assert.deepEqual(Object.fromEntries(cuisines.map((c) => [c.name, c.segment])), SEGMENT_OF);
  });

  test('segmentler bölünür: börekçi pastaneyle, pizzacı kokoreççiyle, kebapçı restoranla aynı listede değil', async () => {
    const { rows } = await db.query(`select name, segment::text from cuisines where name = any($1)`, [
      ['Börekçi', 'Pastane & fırın', 'Tatlıcı', 'Kafe', 'Pizzacı', 'Kokoreççi', 'Pideci', 'Kebapçı', 'Restoran'],
    ]);
    const seg = Object.fromEntries(rows.map((r) => [r.name, r.segment]));
    assert.notEqual(seg['Börekçi'], seg['Pastane & fırın']);
    assert.notEqual(seg['Börekçi'], seg['Kafe']);
    assert.notEqual(seg['Tatlıcı'], seg['Kafe']);
    assert.equal(seg['Tatlıcı'], seg['Pastane & fırın']);
    assert.notEqual(seg['Pizzacı'], seg['Kokoreççi']);
    assert.equal(seg['Pideci'], seg['Kokoreççi']);
    assert.notEqual(seg['Kebapçı'], seg['Restoran']);
  });

  test('segment eşlemesi değişince listeler sırası ve eşitliği korunarak bölünür', async () => {
    const me = await signUp({ name: 'Bölünen' });
    const [kafe1, kafe2, tatli1, tatli2] = [10, 15, 13, 26].map(PLACE);
    for (const id of [kafe1, kafe2, tatli1, tatli2]) await as(me, `select rank_place($1, 'liked', 99)`, [id]);
    // Eski düzen: kafe ve tatlıcılar tek listede. K1 = T1 > K2 = T2
    const oldList = async (list) => {
      await db.query(
        `update rankings r set segment = 'cafe', position = v.position, tied = v.tied
         from (select * from unnest($2::uuid[], $3::int[], $4::bool[]) as t(place_id, position, tied)) v
         where r.user_id = $1 and r.place_id = v.place_id`,
        [me, list.map((e) => e[0]), list.map((_, i) => i), list.map((e) => e[1])],
      );
      await db.query('select resegment_rankings($1)', [me]);
      await db.query('select normalize_rankings($1)', [me]);
      const { rows } = await db.query(
        `select place_id, segment::text, position, tied, score::float as score from rankings where user_id = $1
         order by segment, position`,
        [me],
      );
      return Object.fromEntries(rows.map((r) => [r.place_id, r]));
    };
    let s = await oldList([[kafe1, false], [tatli1, true], [kafe2, false], [tatli2, true]]);
    assert.deepEqual([s[kafe1].segment, s[kafe2].segment, s[tatli1].segment, s[tatli2].segment], ['cafe', 'cafe', 'dessert', 'dessert']);
    assert.deepEqual([s[kafe1].position, s[kafe2].position], [0, 1], 'kafeler sırasını korur');
    assert.deepEqual([s[tatli1].position, s[tatli2].position], [0, 1], 'tatlıcılar sırasını korur');
    assert.equal(s[kafe2].tied, false, 'K2, K1’in eşiti değildi');
    assert.equal(s[tatli2].tied, false, 'T2, T1’in eşiti değildi');
    assert.equal(s[kafe1].score, 10);
    assert.equal(s[kafe2].score, scoreAt('liked', 1, 2));
    // Aynı seviyedekiler bölününce eşitlik kalır: K1 = T1 = K2 > T2
    s = await oldList([[kafe1, false], [tatli1, true], [kafe2, true], [tatli2, false]]);
    assert.equal(s[kafe2].tied, true, 'K1 = K2 korunur');
    assert.equal(s[kafe2].score, 10);
    assert.equal(s[tatli2].tied, false);
    assert.equal(s[tatli2].score, scoreAt('liked', 1, 2));
    assert.equal(s[tatli2].position, 1);
  });

  test('topluluk puanı: az puanlı mekân uca gitmez, puan sayısı arttıkça ortalamaya yaklaşır', async () => {
    const score = async (total, n) => (await db.query('select community_score($1, $2) as s', [total, n])).rows[0].s;
    assert.equal(await score(0, 0), null);
    assert.ok(Math.abs((await score(10, 1)) - 8) < 1e-9);
    assert.ok((await score(1, 1)) > 4.9);
    const many = await score(9 * 50, 50);
    assert.ok(many > 8.9 && many < 9);
  });

  test('topluluk puanı türün ortalamasından başlar; eski puanlar hafifler', async () => {
    const priors = (await db.query('select segment::text, mean::float as mean from community_priors')).rows;
    assert.equal(priors.length, SEGMENTS.length, 'her tür için başlangıç değeri');
    assert.ok(priors.every((p) => p.mean >= 0 && p.mean <= 10));
    const recency = async (ago) =>
      Number((await db.query(`select rating_recency(now() - $1::interval) as w`, [ago])).rows[0].w);
    assert.equal(await recency('1 month'), 1);
    assert.equal(await recency('18 months'), 0.75);
    assert.equal(await recency('3 years'), 0.5);
    // Başlangıç değeri mekânın türünden
    const cafePrior = priors.find((p) => p.segment === 'cafe').mean;
    const { rows: [cafe] } = await db.query(
      `select pl.id from places pl join cuisines c on c.name = pl.cuisine where c.segment = 'cafe' limit 1`,
    );
    const s1 = (await db.query('select place_community_score($1, 10, 1) as s', [cafe.id])).rows[0].s;
    assert.ok(Math.abs(s1 - (2 * cafePrior + 10) / 3) < 1e-9);
  });

  test('güvenilir topluluk puanı: az puanlayan hesabın puanı az ağırlık taşır', async () => {
    const weighted = async (total, w) =>
      (await db.query('select weighted_community_score($1, $2) as s', [total, w])).rows[0].s;
    // Tam ağırlıkta eski formülle aynı
    assert.equal(await weighted(10, 1), (await db.query('select community_score(10, 1) as s')).rows[0].s);
    assert.equal(await weighted(0, 0), null);

    // Beş yeni hesap mekâna 10 verirse eskiden ~9,1; artık her biri 0,2 ağırlıkla
    const fresh = [];
    for (let i = 0; i < 5; i++) fresh.push(await signUp({ name: `Yeni ${i}` }));
    const target = PLACE(18);
    const before = await one(fresh[0], 'select place_details($1) as d', [target]);
    for (const id of fresh) await as(id, `select rank_place($1, 'liked', 0)`, [target]);
    const weightOf = async (id) => Number((await one(id, 'select weight from rankings where user_id = $1 limit 1', [id])).weight);
    assert.equal(await weightOf(fresh[0]), 0.2);
    const after = (await one(fresh[0], 'select place_details($1) as d', [target])).d.rating;
    assert.equal(after.count, (before.d.rating.count ?? 0) + 5, 'sayı ağırlıksız');
    // Expeat puanı şimdilik düz ortalama: ağırlık saklanır ama puana girmez
    assert.equal(after.average, (await one(fresh[0], 'select avg(score)::double precision as a, count(*)::int as c from rankings where place_id = $1', [target])).a);

    // Kişi puanladıkça ağırlığı artar, 5 mekânda tam olur; puan silinince geri düşer
    const me = fresh[0];
    for (const n of [1, 2, 3, 4]) await as(me, `select rank_place($1, 'fine', 0)`, [PLACE(n)]);
    const weights = await rows(me, 'select distinct weight from rankings where user_id = $1', [me]);
    assert.deepEqual(weights.map((w) => Number(w.weight)), [1]);
    await as(me, 'select unrank_place($1)', [PLACE(4)]);
    assert.equal(await weightOf(me), 0.8);
  });
});

describe('gönderiler', () => {
  test('gönderi fotoğraf ve etiketlerle oluşur; puan sıralamadan gelir', async () => {
    const me = await signUp({ name: 'Paylaşan' });
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(15)]);
    const id = randomUUID();
    const post = await one(
      me,
      `select * from create_post($1, $2, ' Harika meze ', '250-500', 'aksam', array['Fava', ' ', 'Topik'], array['Manzaralı'], array[$3::uuid, $4::uuid], $5)`,
      [id, PLACE(15), USER(1), me, JSON.stringify([{ path: `${me}/${id}/0.jpg`, width: 1440, height: 1800 }])],
    );
    assert.equal(post.caption, 'Harika meze');
    assert.equal(Number(post.score), scoreAt('liked', 0, 1));
    assert.deepEqual(post.dishes, ['Fava', 'Topik']);
    assert.deepEqual(post.photos, [`${me}/${id}/0.jpg`]);
    assert.deepEqual(post.tagged.map((u) => u.id), [USER(1)]);
    assert.equal(post.author.id, me);
    assert.equal(post.place.id, PLACE(15));
    assert.equal((await one(me, 'select post_count from profiles where id = $1', [me])).post_count, 1);
  });

  test('başkasının klasöründeki fotoğraf ve 5’ten fazla fotoğraf reddedilir', async () => {
    const me = await signUp({ name: 'Kurnaz' });
    const id = randomUUID();
    await rejects(
      as(me, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', $3)`, [
        id,
        PLACE(1),
        JSON.stringify([{ path: `${USER(1)}/${id}/0.jpg` }]),
      ]),
      /row-level security/,
    );
    const six = Array.from({ length: 6 }, (_, i) => ({ path: `${me}/${id}/${i}.jpg` }));
    await rejects(
      as(me, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', $3)`, [id, PLACE(1), JSON.stringify(six)]),
      /En fazla 5/,
    );
  });

  test('beğeni, yorum ve sayaçlar; beğeni sayısı istemciden değiştirilemez', async () => {
    const me = await signUp({ name: 'Beğenen' });
    const before = (await one(me, 'select like_count, comment_count from posts where id = $1', [POST(1)]));
    await as(me, `insert into post_likes (post_id) values ($1)`, [POST(1)]);
    await as(me, `insert into comments (post_id, body) values ($1, 'Süper')`, [POST(1)]);
    let post = await one(me, 'select * from post_view where id = $1', [POST(1)]);
    assert.equal(post.like_count, before.like_count + 1);
    assert.equal(post.comment_count, before.comment_count + 1);
    assert.equal(post.liked_by_me, true);

    await as(me, `delete from post_likes where post_id = $1`, [POST(1)]);
    post = await one(me, 'select * from post_view where id = $1', [POST(1)]);
    assert.equal(post.like_count, before.like_count);
    assert.equal(post.liked_by_me, false);

    await rejects(as(USER(1), `update posts set like_count = 1000 where id = $1`, [POST(1)]), /42501/);
  });

  test('yorumu yazan ya da gönderi sahibi siler, başkası silemez', async () => {
    const me = await signUp({ name: 'Yorumcu' });
    const { id } = await one(me, `insert into comments (post_id, body) values ($1, 'Merhaba') returning id`, [POST(3)]);
    await as(USER(5), 'delete from comments where id = $1', [id]);
    assert.equal((await rows(me, 'select * from comments where id = $1', [id])).length, 1);
    // g3 gönderisinin sahibi u3
    await as(USER(3), 'delete from comments where id = $1', [id]);
    assert.equal((await rows(me, 'select * from comments where id = $1', [id])).length, 0);
  });

  test('kaydedilen gönderiler listesi', async () => {
    const me = await signUp({ name: 'Arşivci' });
    await as(me, `insert into post_saves (post_id, created_at) values ($1, now() - interval '1 hour')`, [POST(2)]);
    await as(me, `insert into post_saves (post_id) values ($1)`, [POST(5)]);
    const saved = await rows(me, `select id, saved_by_me from saved_posts()`);
    // En son kaydedilen başta (gönderinin kendi tarihinden bağımsız)
    assert.deepEqual(saved.map((p) => p.id), [POST(5), POST(2)]);
    assert.ok(saved.every((p) => p.saved_by_me));
  });
});

describe('takip ve engelleme', () => {
  test('takip sayaçları ve takip feed’i', async () => {
    const me = await signUp({ name: 'Takipçi' });
    await as(me, `insert into follows (followee_id) values ($1), ($2)`, [USER(1), USER(3)]);
    const profile = await one(me, 'select following_count from profiles where id = $1', [me]);
    assert.equal(profile.following_count, 2);
    const feed = await rows(me, 'select user_id, created_at from feed_following()');
    assert.ok(feed.length > 0);
    assert.ok(feed.every((p) => [USER(1), USER(3)].includes(p.user_id)));
    const times = feed.map((p) => +new Date(p.created_at));
    assert.deepEqual(times, [...times].sort((a, b) => b - a));

    const u1 = await one(me, 'select is_following, follows_me from profile_view where id = $1', [USER(1)]);
    assert.equal(u1.is_following, true);
    assert.equal(u1.follows_me, false);
  });

  test('engellenen kişinin içeriği görünmez ve takip kalkar', async () => {
    const me = await signUp({ name: 'Engelleyen' });
    await as(me, `insert into follows (followee_id) values ($1)`, [USER(2)]);
    await as(me, `insert into blocks (blocked_id) values ($1)`, [USER(2)]);
    assert.equal((await rows(me, 'select * from follows where follower_id = $1', [me])).length, 0);
    assert.equal((await rows(me, 'select * from post_view where user_id = $1', [USER(2)])).length, 0);
    assert.equal((await rows(me, 'select * from profile_view where id = $1', [USER(2)])).length, 0);
    await rejects(as(me, `insert into follows (followee_id) values ($1)`, [USER(2)]), /row-level security/);
    // Engellenen de engelleyeni göremez
    assert.equal((await rows(USER(2), 'select * from profile_view where id = $1', [me])).length, 0);
  });

  test('engelli çiftler birbirinin puanlarını göremez', async () => {
    const [me, other, third] = await Promise.all([signUp({ name: 'Puan Gizleyen' }), signUp({ name: 'Puan Engellenen' }), signUp({ name: 'Üçüncü' })]);
    await db.query(`insert into rankings (user_id, place_id, sentiment, position, score) values ($1, $3, 'liked', 0, 9), ($2, $3, 'liked', 0, 8)`, [me, other, PLACE(1)]);
    const seen = async (viewer, owner) => (await rows(viewer, 'select * from rankings where user_id = $1', [owner])).length;
    assert.equal(await seen(other, me), 1);
    await as(me, `insert into blocks (blocked_id) values ($1)`, [other]);
    assert.equal(await seen(other, me), 0);
    assert.equal(await seen(me, other), 0);
    assert.equal((await rows(other, 'select * from ranking_view where user_id = $1', [me])).length, 0);
    // Kendi puanları ve başkaları etkilenmez
    assert.equal(await seen(me, me), 1);
    assert.equal(await seen(third, me), 1);
  });
});

describe('moderasyon', () => {
  test('engellenenler listelenir ve engel kaldırılabilir', async () => {
    const me = await signUp({ name: 'Engel Listesi' });
    await as(me, `insert into blocks (blocked_id) values ($1)`, [USER(3)]);
    const list = await rows(me, 'select id, username from blocked_users()');
    assert.deepEqual(list.map((u) => u.id), [USER(3)]);
    // Başkasının engel listesi görünmez
    assert.equal((await rows(USER(1), 'select * from blocked_users()')).length, 0);
    await as(me, `delete from blocks where blocked_id = $1`, [USER(3)]);
    assert.equal((await rows(me, 'select * from blocked_users()')).length, 0);
    assert.equal((await rows(me, 'select * from profile_view where id = $1', [USER(3)])).length, 1);
    await rejects(rows(null, 'select * from blocked_users()'), /42501/);
  });

  test('uygunsuz ifadeler reddedilir, masum kelimeler geçer', async () => {
    const me = await signUp({ name: 'Yorumcu' });
    const post = POST(1);
    const comment = (body) => as(me, `insert into comments (post_id, body) values ($1, $2)`, [post, body]);
    for (const bad of ['amk bu ne', 'Tam bir OROSPU çocuğu', 'what the fuck', 'siktir git', 'Şerefsizler']) {
      await rejects(comment(bad), /Uygunsuz ifade/);
    }
    for (const ok of ['Şikâyet ettim ama götürdüler', 'Sikke gibi pide', 'Amasya elması', 'Dick’s burger', 'Pastası çok iyi', 'I got the kebab', 'Nice pic!']) {
      await comment(ok);
    }
    await rejects(as(me, `update profiles set name = 'Salak Adam' where id = $1`, [me]), /Uygunsuz ifade/);
    await rejects(
      as(me, `insert into places (name, cuisine, district, city, latitude, longitude) values ('Orospu Kebap', 'Kebapçı', 'Kadıköy', 'İstanbul', 40.99, 29.03)`),
      /Uygunsuz ifade/,
    );
    // Hata ipucu uygulamanın çevirisi için sabit
    try {
      await comment('amk');
    } catch (error) {
      assert.equal(error.hint, 'objectionable');
    }
  });

  test('bio: sahibi yazar, herkes profilde görür; 150 karakter, 3 satır, uygunsuz ifade yok', async () => {
    const me = await signUp({ name: 'Bio Sahibi' });
    const other = await signUp({ name: 'Bakan' });
    const setBio = (who, bio) => as(who, `update profiles set bio = $2 where id = $1`, [me, bio]);
    await setBio(me, 'Kahvaltı avcısı 🍳\nKadıköy');
    assert.equal((await one(other, 'select bio from profile_view where id = $1', [me])).bio, 'Kahvaltı avcısı 🍳\nKadıköy');

    // Başkası yazamaz (RLS: satır güncellenmez)
    await setBio(other, 'başkası yazdı');
    assert.equal((await one(me, 'select bio from profiles where id = $1', [me])).bio, 'Kahvaltı avcısı 🍳\nKadıköy');

    await rejects(setBio(me, 'a'.repeat(151)), /check/);
    await rejects(setBio(me, 'bir\niki\nüç\ndört'), /check/);
    await rejects(setBio(me, ' boşlukla başlar'), /check/);
    await rejects(setBio(me, ''), /check/);
    await rejects(setBio(me, 'siktir git'), /Uygunsuz ifade/);
    await setBio(me, null);
    assert.equal((await one(other, 'select bio from profile_view where id = $1', [me])).bio, null);
  });
});

describe('öneriler', () => {
  test('gitmediğin, beğenilen mekânlar; arkadaş puanı öne çıkar', async () => {
    const me = await signUp({ name: 'Öneri Arayan' });
    await as(me, `insert into follows (followee_id) values ($1)`, [USER(1)]);
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(1)]);
    const recs = await rows(me, 'select * from recommended_places(40.99, 29.03, 50)');
    assert.ok(recs.length > 0);
    assert.ok(!recs.some((r) => r.id === PLACE(1)), 'puanladığın mekân önerilmez');
    assert.ok(recs.every((r) => (r.friend_average ?? r.community_average) >= 6.7));
    assert.ok(recs.every((r) => r.distance_km !== null));
    const friendRated = await rows(me, 'select place_id from rankings where user_id = $1 and score >= 6.7', [USER(1)]);
    const withFriend = recs.filter((r) => r.friend_count > 0);
    assert.ok(withFriend.every((r) => friendRated.some((f) => f.place_id === r.id)));
    // Konumsuz da çalışır; engellenen kişinin puanı sayılmaz
    assert.ok((await rows(me, 'select * from recommended_places()')).length > 0);
    await rejects(rows(null, 'select * from recommended_places()'), /42501/);
  });
});

describe('yönetici moderasyonu', () => {
  test('yalnızca yönetici şikâyetleri görür; kapatma, kaldırma ve yasaklama', async () => {
    const admin = await signUp({ name: 'Yönetici' });
    await db.exec(`update profiles set is_admin = true where id = '${admin}'`);
    const reporter = await signUp({ name: 'Şikâyetçi' });
    const offender = await signUp({ name: 'Kural Dışı' });

    // Kullanıcı is_admin'i kendisi açamaz
    await rejects(as(reporter, `update profiles set is_admin = true where id = $1`, [reporter]), /42501/);
    await rejects(rows(reporter, 'select * from admin_reports()'), /42501/);

    // Gönderi şikâyeti → kapat
    await as(reporter, `insert into reports (post_id, reason) values ($1, 'spam')`, [POST(2)]);
    await as(admin, `insert into reports (post_id, reason) values ($1, 'offensive')`, [POST(2)]);
    let queue = await rows(admin, 'select * from admin_reports()');
    const postReport = queue.find((r) => r.target_id === POST(2));
    assert.equal(postReport.target_type, 'post');
    assert.equal(postReport.report_count, 2);
    assert.equal(postReport.author_id, USER(2));
    assert.ok(postReport.place_name);
    await as(admin, `select admin_resolve_report($1, 'dismiss')`, [postReport.id]);
    queue = await rows(admin, 'select * from admin_reports()');
    assert.ok(!queue.some((r) => r.target_id === POST(2)));
    assert.equal((await rows(admin, 'select id from posts where id = $1', [POST(2)])).length, 1);

    // Yorum şikâyeti → kaldır
    const comment = (await one(offender, `insert into comments (post_id, body) values ($1, 'Berbat bir yer') returning id`, [POST(3)])).id;
    await as(reporter, `insert into reports (comment_id, reason) values ($1, 'offensive')`, [comment]);
    const commentReport = (await rows(admin, 'select * from admin_reports()')).find((r) => r.target_id === comment);
    assert.equal(commentReport.preview, 'Berbat bir yer');
    await as(admin, `select admin_resolve_report($1, 'remove')`, [commentReport.id]);
    assert.equal((await rows(admin, 'select id from comments where id = $1', [comment])).length, 0);

    // Kullanıcı şikâyeti → yasakla
    await as(reporter, `insert into reports (user_id, reason) values ($1, 'fake')`, [offender]);
    const userReport = (await rows(admin, 'select * from admin_reports()')).find((r) => r.target_id === offender);
    await rejects(as(reporter, `select admin_resolve_report($1, 'ban')`, [userReport.id]), /42501/);
    await as(admin, `select admin_resolve_report($1, 'ban')`, [userReport.id]);
    const banned = (await db.query(`select banned_until from auth.users where id = $1`, [offender])).rows[0];
    assert.ok(banned.banned_until);
    assert.ok(!(await rows(admin, 'select * from admin_reports()')).some((r) => r.author_id === offender));

    // Yönetici kendini yasaklayamaz, geçersiz işlem reddedilir
    await as(reporter, `insert into reports (user_id, reason) values ($1, 'other')`, [admin]);
    const selfReport = (await rows(admin, 'select * from admin_reports()')).find((r) => r.target_id === admin);
    await rejects(as(admin, `select admin_resolve_report($1, 'ban')`, [selfReport.id]), /yasaklayamazsın/);
    await rejects(as(admin, `select admin_resolve_report($1, 'delete')`, [selfReport.id]), /Geçersiz/);
  });
});

describe('feed ve arama', () => {
  test('yakınımda: yarıçap genişler ve uzaklık döner', async () => {
    const me = await signUp({ name: 'Gezgin' });
    const feed = (await one(me, 'select feed_popular($1, $2) as f', [KADIKOY.lat, KADIKOY.lng])).f;
    assert.ok([3, 10, 30].includes(feed.radius_km));
    assert.ok(feed.entries.length > 0);
    for (const e of feed.entries) assert.ok(e.distance_km <= feed.radius_km);
    assert.equal(feed.fallback_city, null);
  });

  test('sayfalar sabit anda sıralanır: tekrar yok, sonradan paylaşılan araya girmez', async () => {
    const me = await signUp({ name: 'Kaydıran' });
    const { city } = (await db.query('select city from places where id = $1', [PLACE(15)])).rows[0];
    const page = async (offset, asOf) =>
      (await one(me, `select feed_popular(p_city => $1, p_offset => $2, p_limit => 3, p_as_of => $3) as f`, [city, offset, asOf])).f;

    const first = await page(0, null);
    assert.ok(first.as_of);
    const all = await page(0, first.as_of).then(async (p) => [...p.entries, ...(await page(3, first.as_of)).entries]);
    const ids = all.map((e) => e.post.id);
    assert.equal(new Set(ids).size, ids.length);

    // Sonradan paylaşılan gönderi aynı oturumun sayfalarına girmez, yenileyince (yeni an) gelir
    const author = await signUp({ name: 'Sonradan' });
    await as(author, `select rank_place($1, 'liked', 0)`, [PLACE(15)]);
    const postId = randomUUID();
    await as(author, `select create_post($1, $2, 'yeni', null, null, '{}', '{}', '{}', '[]')`, [postId, PLACE(15)]);
    const stale = [...(await page(0, first.as_of)).entries, ...(await page(3, first.as_of)).entries];
    assert.ok(!stale.some((e) => e.post.id === postId));
    const fresh = (await one(me, 'select feed_popular(p_city => $1, p_limit => 50) as f', [city])).f;
    assert.ok(fresh.entries.some((e) => e.post.id === postId));
  });

  test('yakında gönderi yoksa en yakın şehir gösterilir', async () => {
    const me = await signUp({ name: 'Antalyalı' });
    const feed = (await one(me, 'select feed_popular($1, $2) as f', [ANTALYA.lat, ANTALYA.lng])).f;
    assert.equal(feed.fallback_city, 'İzmir');
    // İzmir'in gönderileri önce (10'dan azsa ardından genelden doldurulur)
    const nearby = feed.nearby_count ?? feed.entries.length;
    assert.ok(nearby > 0);
    assert.ok(feed.entries.slice(0, nearby).every((e) => e.post.place.city === 'İzmir'));
  });

  test('yakınımda bölgede 10\'dan az gönderi varsa genelden doldurulur; sayfalar tekrarsız, uzaktakinde uzaklık yok', async () => {
    const author = await signUp({ name: 'Vanlı Yazar' });
    const placeId = (
      await db.query(
        `insert into places (name, cuisine, district, city, latitude, longitude) values ('Van Kahvaltı Evi', 'Kahvaltıcı', 'İpekyolu', 'Van', 38.4946, 43.38) returning id`,
      )
    ).rows[0].id;
    await as(author, `select rank_place($1, 'liked', 0)`, [placeId]);
    const postId = randomUUID();
    await as(author, `select create_post($1, $2, 'kahvaltı', null, null, '{}', '{}', '{}', '[]')`, [postId, placeId]);

    const me = await signUp({ name: 'Vanlı' });
    const feed = (await one(me, 'select feed_popular($1, $2, p_limit => 50) as f', [38.5, 43.37])).f;
    assert.equal(feed.nearby_count, 1);
    assert.equal(feed.entries[0].post.id, postId);
    assert.ok(feed.entries[0].distance_km < 3);
    const { rows: rest } = await db.query('select id from posts where id <> $1 order by hot desc limit 49', [postId]);
    assert.deepEqual(feed.entries.slice(1).map((e) => e.post.id), rest.map((r) => r.id));
    assert.ok(feed.entries.slice(1).every((e) => e.distance_km === null));

    // Sayfalar birleşik sırada yürür: bölge sayfa sınırında bitse de tekrar ya da boşluk yok
    const page = async (offset) =>
      (await one(me, 'select feed_popular($1, $2, p_offset => $3, p_limit => 3, p_as_of => $4) as f', [38.5, 43.37, offset, feed.as_of])).f;
    const paged = [...(await page(0)).entries, ...(await page(3)).entries].map((e) => e.post.id);
    assert.deepEqual(paged, feed.entries.slice(0, 6).map((e) => e.post.id));

    // Şehir seçilince doldurma yok
    const city = (await one(me, `select feed_popular(p_city => 'Van') as f`)).f;
    assert.deepEqual(city.entries.map((e) => e.post.id), [postId]);
    assert.equal(city.nearby_count, null);

    await db.query('delete from posts where id = $1', [postId]);
    await db.query('delete from rankings where place_id = $1', [placeId]);
    await db.query('delete from places where id = $1', [placeId]);
  });

  test('şehir ve ilçe seçimi', async () => {
    const me = await signUp({ name: 'Ankaralı' });
    const feed = (await one(me, `select feed_popular(p_city => 'Ankara', p_district => 'Çankaya') as f`)).f;
    assert.ok(feed.entries.length > 0);
    assert.ok(feed.entries.every((e) => e.post.place.district === 'Çankaya'));
  });

  test('Türkçe karakterden bağımsız mekân ve kişi araması', async () => {
    const me = await signUp({ name: 'Arayan' });
    const byCuisine = await rows(me, `select name from search_places('kahvalti')`);
    assert.ok(byCuisine.some((p) => p.name === 'Serpme Kahvaltı Evi'));
    const byDistrict = await rows(me, `select district from search_places('KADIKÖY')`);
    assert.ok(byDistrict.length > 0 && byDistrict.every((p) => p.district === 'Kadıköy'));
    const typo = await rows(me, `select name from search_places('hunkar esnaf')`);
    assert.equal(typo[0].name, 'Hünkâr Esnaf Lokantası');
    // Konum yokken boş arama: en popüler mekânlar önce (alfabetik değil)
    const popular = await rows(me, `select id, name from search_places('')`);
    const { rows: counts } = await db.query(
      `select pl.id, (select count(*) from rankings r where r.place_id = pl.id) + (select count(*) from posts p where p.place_id = pl.id) as n
       from places pl`,
    );
    const pop = Object.fromEntries(counts.map((c) => [c.id, Number(c.n)]));
    for (let i = 1; i < popular.length; i++) assert.ok(pop[popular[i - 1].id] >= pop[popular[i].id]);
    assert.notEqual(popular[0].name, 'Adana Ocakbaşı');
    const near = await rows(me, `select name from search_places('', $1, $2, 3)`, [KADIKOY.lat, KADIKOY.lng]);
    assert.equal(near.length, 3);
    const users = await rows(me, `select username from search_users('@zeyn')`);
    assert.equal(users[0].username, 'zeynepyer');
  });

  test('mekân sayfası özeti ve arkadaş puanları', async () => {
    const me = await signUp({ name: 'Meraklı' });
    await as(me, `insert into follows (followee_id) values ($1), ($2)`, [USER(3), USER(5)]);
    const details = (await one(me, 'select place_details($1) as d', [PLACE(7)])).d;
    assert.equal(details.place.name, 'Meyhane Asmalı');
    assert.equal(details.post_count, 2);
    assert.equal(details.summary.price.key, '1000-2000');
    assert.ok(details.summary.dishes.some((d) => d.name === 'Fava'));
    assert.deepEqual(details.friends.map((f) => f.user.id).sort(), [USER(3), USER(5)].sort());
    assert.ok(details.friends.every((f) => f.post_id));

    const scores = await rows(me, 'select * from friend_scores($1)', [[PLACE(7), PLACE(1)]]);
    assert.equal(scores.find((s) => s.place_id === PLACE(7)).count, 2);
    assert.equal((await one(me, 'select place_details($1) as d', [randomUUID()])).d, null);
  });

  test('harita: görünen bölgedeki puanlanmış mekânlar ve topluluk ortalaması', async () => {
    const me = await signUp({ name: 'Haritacı' });
    // İstanbul kutusu: Ankara/İzmir mekânları gelmez, puanlanmamış mekân gelmez
    const pins = await rows(me, 'select * from map_places(40.8, 28.5, 41.3, 29.4)');
    assert.ok(pins.length > 0);
    assert.ok(pins.every((p) => p.city === 'İstanbul' && p.rating_count > 0));
    const moda = pins.find((p) => p.id === PLACE(1));
    const expected = await one(
      me,
      'select avg(score)::double precision as a, count(*)::int as c from rankings where place_id = $1',
      [PLACE(1)],
    );
    assert.equal(moda.rating_count, expected.c);
    assert.equal(moda.average, expected.a);
    // En çok puanlanan önce, sınır uygulanır
    assert.ok(pins[0].rating_count >= pins.at(-1).rating_count);
    assert.equal((await rows(me, 'select * from map_places(40.8, 28.5, 41.3, 29.4, 1)')).length, 1);
    await rejects(rows(null, 'select * from map_places(40.8, 28.5, 41.3, 29.4)'), /42501/);
  });

  test('takip önerileri aynı okulu öne alır', async () => {
    const me = await signUp({ name: 'Yeni Öğrenci' });
    await as(me, `update profiles set school_id = 'orta-dogu-teknik' where id = $1`, [me]);
    const suggestions = await rows(me, 'select id from suggested_users(10)');
    assert.equal(suggestions[0].id, USER(4));
    assert.ok(!suggestions.some((s) => s.id === me));
  });
});

describe('liderlik tablosu', () => {
  test("XP sırası, yarışma usulü; genelde XP'si olmayan yok (kendin hariç); user_rank aynı sırayı verir", async () => {
    const me = await signUp({ name: 'Yarışmacı' });
    const board = await rows(me, 'select * from leaderboard()');
    for (let i = 1; i < board.length; i++) {
      const [a, b] = [board[i - 1], board[i]];
      assert.ok(a.xp >= b.xp);
      assert.ok(a.xp > b.xp ? b.rank > a.rank : b.rank === a.rank);
    }
    assert.ok(board.filter((e) => e.xp === 0).every((e) => e.user_id === me));
    // Kırılım XP'yi verir
    for (const e of board) {
      assert.equal(e.xp, e.ratings * 10 + e.posts * 20 + e.photo_posts * 20 + e.likes * 2 + e.invites * 100 + e.welcome * 50);
    }
    const top = board[0];
    assert.equal((await one(me, 'select user_rank($1) as r', [top.user_id])).r, top.rank);
    assert.equal((await one(me, 'select user_rank($1) as r', [me])).r, null);
    await rejects(rows(null, 'select * from leaderboard()'), /42501/);
  });

  test('XP kuralları: puan +10, gönderi +20, fotoğraf +20, beğeni +2 (kendi beğenin değil); silinince düşer', async () => {
    const me = await signUp({ name: 'XP Toplayan' });
    const fan = await signUp({ name: 'XP Hayranı' });
    const mine = async () => (await rows(me, `select * from leaderboard('friends')`)).find((e) => e.user_id === me);
    assert.equal((await mine()).xp, 0);

    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(3)]);
    assert.equal((await mine()).xp, 10);
    const plain = randomUUID();
    await as(me, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', '[]')`, [plain, PLACE(3)]);
    assert.equal((await mine()).xp, 30);
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(4)]);
    const photo = randomUUID();
    await as(me, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', $3)`, [
      photo,
      PLACE(4),
      JSON.stringify([{ path: `${me}/${photo}/0.jpg` }]),
    ]);
    const after = await mine();
    assert.equal(after.xp, 10 + 20 + 10 + 40);
    assert.equal(after.photo_posts, 1);

    await as(fan, 'insert into post_likes (post_id) values ($1)', [photo]);
    await as(me, 'insert into post_likes (post_id) values ($1)', [photo]);
    assert.equal((await mine()).xp, 82, 'yalnızca başkasının beğenisi');
    // Bu ayın tablosu da aynı (hepsi bu ay)
    assert.equal((await rows(me, `select * from leaderboard('friends', 'month')`)).find((e) => e.user_id === me).xp, 82);

    await as(me, 'delete from posts where id = $1', [photo]);
    assert.equal((await mine()).xp, 10 + 20 + 10);
  });

  test('günde en fazla 20 puanlama XP getirir', async () => {
    const me = await signUp({ name: 'Puan Makinesi' });
    const { rows: many } = await db.query(`select id from places where closed_at is null order by id limit 25`);
    for (const p of many) await as(me, `select rank_place($1, 'fine', 0)`, [p.id]);
    const e = (await rows(me, `select * from leaderboard('friends')`)).find((x) => x.user_id === me);
    assert.equal(e.ratings, 20);
    assert.equal(e.xp, 200);
  });

  test('davet: yeni kullanıcı davet edeni bir kez yazar; ilk puanından sonra davet eden +100, davetli +50', async () => {
    const inviter = await signUp({ name: 'Davet Eden', username: 'davetci' });
    const invitee = await signUp({ name: 'Davetli' });
    const xpOf = async (id) => (await rows(id, `select * from leaderboard('friends')`)).find((e) => e.user_id === id);

    const who = await one(invitee, `select set_inviter('@Davetci') as p`);
    assert.equal(who.p.id, inviter);
    await rejects(one(invitee, `select set_inviter('davetci')`), /already_set|zaten/);
    assert.equal((await xpOf(inviter)).invites, 0, 'davetli henüz puan vermedi');

    await as(invitee, `select rank_place($1, 'liked', 0)`, [PLACE(5)]);
    assert.equal((await xpOf(inviter)).xp, 100);
    const me = await xpOf(invitee);
    assert.equal(me.welcome, 1);
    assert.equal(me.xp, 10 + 50);

    // Kim kimi davet etti başkasına görünmez; sütun doğrudan yazılamaz
    assert.equal((await rows(inviter, 'select invited_by from profile_private')).every((r) => r.invited_by === null), true);
    await rejects(as(invitee, 'update profile_private set invited_by = null where user_id = $1', [invitee]), /permission denied/);
  });

  test('davet eden kuralları: kendisi, bilinmeyen ve senden sonra katılan olamaz', async () => {
    const early = await signUp({ name: 'Erken' });
    const late = await signUp({ name: 'Geç', username: 'gecgelen' });
    const lateName = (await one(late, 'select username from profiles where id = $1', [late])).username;
    await rejects(one(early, 'select set_inviter($1)', [lateName]), /newer|sonra/);
    const earlyName = (await one(early, 'select username from profiles where id = $1', [early])).username;
    await rejects(one(early, 'select set_inviter($1)', [earlyName]), /P0002/);
    await rejects(one(early, `select set_inviter('yokboylebiri')`), /P0002/);
    await rejects(rows(null, `select set_inviter('x')`), /42501/);
  });

  test('arkadaş ve okul kapsamı', async () => {
    const me = await signUp({ name: 'Kulüp' });
    await as(me, `insert into follows (followee_id) values ($1)`, [USER(2)]);
    const friends = await rows(me, `select user_id from leaderboard('friends')`);
    assert.deepEqual(friends.map((f) => f.user_id).sort(), [me, USER(2)].sort());
    const school = await rows(me, `select user_id from leaderboard('school', 'all', 'bogazici')`);
    assert.deepEqual(school.map((f) => f.user_id).sort(), [USER(1), USER(3), USER(5)].sort());
  });
});

describe('bildirimler', () => {
  const inbox = (userId) => rows(userId, 'select * from my_notifications()');

  /** Yeni kullanıcı + puanladığı mekânda fotoğraflı bir gönderi */
  async function author(name) {
    const id = await signUp({ name });
    await as(id, `select rank_place($1, 'liked', 0)`, [PLACE(15)]);
    const postId = randomUUID();
    await as(id, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', $3)`, [
      postId,
      PLACE(15),
      JSON.stringify([{ path: `${id}/${postId}/0.jpg` }]),
    ]);
    return { id, postId };
  }

  test('beğeni, yorum, takip; kendine bildirim yok, beğeni geri alınınca silinir', async () => {
    const { id: me, postId } = await author('Bildirim Sahibi');
    const fan = await signUp({ name: 'Hayran' });
    await as(fan, `insert into post_likes (post_id) values ($1)`, [postId]);
    await as(fan, `insert into comments (post_id, body) values ($1, 'Enfes görünüyor')`, [postId]);
    await as(fan, `insert into follows (followee_id) values ($1)`, [me]);
    await as(me, `insert into post_likes (post_id) values ($1)`, [postId]);

    let list = await inbox(me);
    assert.deepEqual(list.map((n) => n.type).sort(), ['comment', 'follow', 'like']);
    const comment = list.find((n) => n.type === 'comment');
    assert.equal(comment.actor.id, fan);
    assert.equal(comment.comment, 'Enfes görünüyor');
    assert.equal(comment.photo, `${me}/${postId}/0.jpg`);
    assert.equal(comment.place_id, PLACE(15));
    assert.equal(list.find((n) => n.type === 'follow').following, false);

    await as(fan, `delete from post_likes where post_id = $1`, [postId]);
    await as(fan, `delete from follows where followee_id = $1`, [me]);
    list = await inbox(me);
    assert.deepEqual(list.map((n) => n.type), ['comment']);

    // Tekrar beğenmek çift bildirim üretmez
    await as(fan, `insert into post_likes (post_id) values ($1)`, [postId]);
    await as(fan, `delete from post_likes where post_id = $1`, [postId]);
    await as(fan, `insert into post_likes (post_id) values ($1)`, [postId]);
    assert.equal((await inbox(me)).filter((n) => n.type === 'like').length, 1);
  });

  test('gönderide etiketlenen kişiye bildirim gider', async () => {
    const friend = await signUp({ name: 'Etiketlenen' });
    const me = await signUp({ name: 'Etiketleyen' });
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(15)]);
    const postId = randomUUID();
    await as(me, `select create_post($1, $2, null, null, null, '{}', '{}', array[$3::uuid], '[]')`, [
      postId,
      PLACE(15),
      friend,
    ]);
    const [n] = await inbox(friend);
    assert.equal(n.type, 'tag');
    assert.equal(n.post_id, postId);
    assert.equal(n.actor.id, me);
  });

  test('arkadaşın gittiğin yeri puanladı: yalnızca takipçiler ve o mekânı puanlamışlar', async () => {
    const rater = await signUp({ name: 'Puanlayan' });
    const been = await signUp({ name: 'Gitmiş Takipçi' });
    const notBeen = await signUp({ name: 'Gitmemiş Takipçi' });
    const stranger = await signUp({ name: 'Yabancı' });
    await as(been, `select rank_place($1, 'fine', 0)`, [PLACE(16)]);
    await as(stranger, `select rank_place($1, 'fine', 0)`, [PLACE(16)]);
    await as(been, `insert into follows (followee_id) values ($1)`, [rater]);
    await as(notBeen, `insert into follows (followee_id) values ($1)`, [rater]);

    await as(rater, `select rank_place($1, 'liked', 0)`, [PLACE(16)]);
    const [n] = await inbox(been);
    assert.equal(n.type, 'friend_rated');
    assert.equal(n.place_id, PLACE(16));
    assert.equal(Number(n.score), scoreAt('liked', 0, 1));
    assert.equal(Number(n.my_score), scoreAt('fine', 0, 1));
    assert.equal(n.following, true);
    assert.equal((await inbox(notBeen)).length, 0);
    assert.equal((await inbox(stranger)).length, 0);

    // Yeniden sıralamak ikinci bildirim üretmez
    await as(rater, `select rank_place($1, 'fine', 0)`, [PLACE(16)]);
    assert.equal((await inbox(been)).length, 1);
  });

  test('engelli çiftler arasında bildirim oluşmaz, eskileri görünmez', async () => {
    const { id: me, postId } = await author('Engelleyen Yazar');
    const troll = await signUp({ name: 'Trol' });
    await as(troll, `insert into post_likes (post_id) values ($1)`, [postId]);
    await as(me, `insert into blocks (blocked_id) values ($1)`, [troll]);
    assert.equal((await inbox(me)).length, 0);
  });

  test('okundu işaretleme, sayaç ve erişim kuralları', async () => {
    const { id: me, postId } = await author('Okuyan');
    const fan = await signUp({ name: 'Okunan' });
    await as(fan, `insert into post_likes (post_id) values ($1)`, [postId]);
    await as(fan, `insert into follows (followee_id) values ($1)`, [me]);
    assert.equal((await one(me, 'select unread_notification_count() as c')).c, 2);
    // Başkasının bildirimleri görünmez, bildirim elle yazılamaz
    assert.equal((await rows(fan, 'select * from notifications where user_id = $1', [me])).length, 0);
    await rejects(
      as(fan, `insert into notifications (user_id, actor_id, type) values ($1, $2, 'follow')`, [me, fan]),
      /42501/,
    );
    await as(me, 'select mark_notifications_read()');
    assert.equal((await one(me, 'select unread_notification_count() as c')).c, 0);
    assert.ok((await inbox(me)).every((n) => n.read_at));
  });

  test('push jetonu: cihaz hesap değiştirince devralınır, çıkışta silinir; tercih yalnızca sahibinde', async () => {
    const a = await signUp({ name: 'Cihaz A' });
    const b = await signUp({ name: 'Cihaz B' });
    const token = 'ExponentPushToken[abc123]';
    const owner = async () => (await db.query('select user_id, locale from push_tokens where token = $1', [token])).rows[0];
    await as(a, 'select register_push_token($1, $2)', [token, 'en']);
    await as(b, 'select register_push_token($1, $2)', [token, 'tr']);
    assert.deepEqual(await owner(), { user_id: b, locale: 'tr' });
    await rejects(as(a, 'select * from push_tokens'), /42501/);
    await rejects(as(a, 'select register_push_token($1)', ['gecersiz']), /check constraint/);
    // Başkasının jetonunu silemez
    await as(a, 'select unregister_push_token($1)', [token]);
    assert.equal((await owner()).user_id, b);
    await as(b, 'select unregister_push_token($1)', [token]);
    assert.equal(await owner(), undefined);

    await as(a, `update profile_private set push_muted = '{like,follow}' where user_id = $1`, [a]);
    assert.equal((await one(a, 'select push_muted from profile_private where user_id = $1', [a])).push_muted, '{like,follow}');
    assert.equal((await rows(b, 'select push_muted from profile_private where user_id = $1', [a])).length, 0);
  });

  test('push metni alıcının dilinde', async () => {
    const rater = await signUp({ name: 'Zeynep' });
    const fan = await signUp({ name: 'Mert' });
    await as(fan, `select rank_place($1, 'fine', 0)`, [PLACE(17)]);
    await as(fan, `insert into follows (followee_id) values ($1)`, [rater]);
    await as(rater, `select rank_place($1, 'liked', 0)`, [PLACE(17)]);
    const text = async (locale) =>
      (
        await db.query(
          `select notification_text(n, $2) as t, notification_path(n) as p from notifications n where user_id = $1 and type = 'friend_rated'`,
          [fan, locale],
        )
      ).rows[0];
    const place = (await db.query('select name from places where id = $1', [PLACE(17)])).rows[0].name;
    assert.deepEqual(await text('tr'), { t: `Zeynep, ${place} için 10,0 verdi. Sen 6,6 vermiştin.`, p: `mekan/${PLACE(17)}` });
    assert.equal((await text('en')).t, `Zeynep gave ${place} a 10.0. You gave it 6.6.`);
  });
});

describe('rehber ve masa döngüsü', () => {
  const inbox = (userId) => rows(userId, 'select * from my_notifications()');
  /** Supabase Auth'un SMS kodunu doğrulaması (kendi rolüyle, oturumsuz) */
  const verifyPhone = (id, phone) =>
    db.query('update auth.users set phone = $2, phone_confirmed_at = now() where id = $1', [id, phone]);
  const priv = async (id) =>
    (await db.query('select phone, phone_verified_at, verified_phone_hash from profile_private where user_id = $1', [id]))
      .rows[0];
  const match = (id, phones, save = false) => rows(id, 'select * from match_contacts($1, $2)', [phones, save]);

  test('yalnızca doğrulanmış numara eşleşir; numara tek hesapta; elle değişince doğrulama düşer', async () => {
    const me = await signUp({ name: 'Rehber Sahibi' });
    // Doğrulanmamış numara (kayıtta yazılan) eşleşmez: başkası adına görünülemez
    const claimer = await signUp({ name: 'Numara Yazan', phone: '0532 000 00 01' });
    assert.equal((await match(me, ['05320000001'])).length, 0);

    const owner = await signUp({ name: 'Numaranın Sahibi' });
    await verifyPhone(owner, '905320000001');
    assert.equal((await priv(owner)).phone, '+905320000001');
    const [hit] = await match(me, ['+90 532 000 00 01', 'bozuk', '02161234567']);
    assert.equal(hit.phone, '+905320000001');
    assert.equal(hit.user.id, owner);
    assert.equal(hit.following, false);

    // Aynı numarayı SMS'le doğrulayan yeni hesap numarayı devralır
    await verifyPhone(claimer, '905320000001');
    assert.equal((await priv(owner)).verified_phone_hash, null);
    assert.equal((await match(me, ['05320000001']))[0].user.id, claimer);

    // Elle değiştirilen numara doğrulanmamış sayılır; doğrulama alanları istemciden yazılamaz
    await as(claimer, `update profile_private set phone = '+905320000002' where user_id = $1`, [claimer]);
    assert.equal((await priv(claimer)).phone_verified_at, null);
    assert.equal((await match(me, ['05320000001', '05320000002'])).length, 0);
    await rejects(as(claimer, `update profile_private set phone_verified_at = now() where user_id = $1`, [claimer]), /42501/);
  });

  test('bulunabilirlik kapalı ya da engelli kişi eşleşmez; tablolar doğrudan okunamaz; sınırlar', async () => {
    const me = await signUp({ name: 'Arayan' });
    const hidden = await signUp({ name: 'Gizli' });
    const blocked = await signUp({ name: 'Engelli' });
    await verifyPhone(hidden, '905320000011');
    await verifyPhone(blocked, '905320000012');
    await as(hidden, `update profile_private set discoverable = false where user_id = $1`, [hidden]);
    await as(me, `insert into blocks (blocked_id) values ($1)`, [blocked]);
    assert.equal((await match(me, ['05320000011', '05320000012'])).length, 0);

    await match(me, ['05320000011'], true);
    for (const table of ['contact_hashes', 'invites', 'contact_matches']) {
      await rejects(as(me, `select * from ${table}`), /42501/);
    }
    await rejects(match(me, Array.from({ length: 3001 }, (_, i) => `0532${String(i).padStart(7, '0')}`)), /3000/);
    await rejects(as(null, `select * from match_contacts('{}')`), /42501/);

    // Numara taramasına karşı günlük sınır
    const spammer = await signUp({ name: 'Tarayıcı' });
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: spammer })]);
      await tx.exec('set local role authenticated');
      for (let i = 0; i < 30; i++) await tx.query(`select * from match_contacts('{}')`);
      await rejects(tx.query(`select * from match_contacts('{}')`), /rehber eşleştirme/);
    });
  });

  test('rehberindeki kişi katılınca bildirim; yalnızca kaydedilen rehber için', async () => {
    const me = await signUp({ name: 'Eski Kullanıcı' });
    const peek = await signUp({ name: 'Kaydetmeden Bakan' });
    await match(me, ['0532 000 00 21', '0532 000 00 22'], true);
    await match(peek, ['05320000021']);
    // Rehber yeniden eşleştirilince çıkarılan numara unutulur
    await match(me, ['05320000021'], true);

    const friend = await signUp({ name: 'Yeni Katılan' });
    await verifyPhone(friend, '905320000021');
    const other = await signUp({ name: 'Rehberden Çıkarılan' });
    await verifyPhone(other, '905320000022');

    const list = await inbox(me);
    assert.deepEqual(list.map((n) => [n.type, n.actor.id]), [['friend_joined', friend]]);
    assert.equal(list[0].place_id, null);
    assert.equal((await inbox(peek)).length, 0);
    const text = await db.query(
      `select notification_text(n, 'tr') as t, notification_path(n) as p from notifications n where user_id = $1`,
      [me],
    );
    assert.deepEqual(text.rows[0], { t: "Rehberindeki Yeni Katılan Expeat'e katıldı", p: `kullanici/${friend}` });

    // Numarayı yeniden doğrulamak ikinci bildirim üretmez
    await db.query('update auth.users set phone_confirmed_at = now() + interval \'1 minute\' where id = $1', [friend]);
    assert.equal((await inbox(me)).length, 1);
  });

  test('davet: katılınca davet edene bildirim, davet bağlamı, aynı mekânı puanlayınca karşılaştırma', async () => {
    const host = await signUp({ name: 'Masa Sahibi' });
    await as(host, `select rank_place($1, 'liked', 0)`, [PLACE(18)]);
    const postId = randomUUID();
    await as(host, `select create_post($1, $2, null, null, null, '{}', '{}', '{}', '[]')`, [postId, PLACE(18)]);
    await as(host, 'select create_invites($1, $2, $3)', [PLACE(18), ['0532 000 00 31', 'bozuk'], postId]);
    // Aynı kişi aynı mekân için tekrar davet edilince çoğalmaz; başkasının gönderisine bağlanamaz
    await as(host, 'select create_invites($1, $2)', [PLACE(18), ['05320000031']]);
    const stranger = await signUp({ name: 'Başkası' });
    await rejects(as(stranger, 'select create_invites($1, $2, $3)', [PLACE(18), ['05320000032'], postId]), /42501/);
    await rejects(as(host, 'select create_invites($1, $2)', [PLACE(18), Array(11).fill('05320000033')]), /10/);
    assert.equal(
      (await db.query('select count(*)::int as c from invites where inviter_id = $1', [host])).rows[0].c,
      1,
    );

    const guest = await signUp({ name: 'Davetli' });
    await verifyPhone(guest, '905320000031');
    const [joined] = await inbox(host);
    assert.equal(joined.type, 'friend_joined');
    assert.equal(joined.actor.id, guest);
    assert.equal(joined.place_id, PLACE(18));

    const [invite] = await rows(guest, 'select * from my_invites()');
    assert.equal(invite.inviter.id, host);
    assert.equal(invite.place.id, PLACE(18));
    assert.equal(Number(invite.inviter_score), scoreAt('liked', 0, 1));
    assert.equal(invite.my_score, null);
    assert.equal(invite.following, false);
    assert.equal((await rows(stranger, 'select * from my_invites()')).length, 0);

    // Davetli aynı mekânı puanlayınca, takip etmese bile davet eden karşılaştırmayı görür
    await as(guest, `select rank_place($1, 'fine', 0)`, [PLACE(18)]);
    const rated = (await inbox(host)).find((n) => n.type === 'friend_rated');
    assert.equal(rated.actor.id, guest);
    assert.equal(Number(rated.score), scoreAt('fine', 0, 1));
    assert.equal(Number(rated.my_score), scoreAt('liked', 0, 1));
    assert.equal(Number((await rows(guest, 'select * from my_invites()'))[0].my_score), scoreAt('fine', 0, 1));
  });
});

describe('damak uyumu', () => {
  // Aynı segmentteki (restoran) mekânlar: sıralar birbirini etkilesin
  const ps = [2, 6, 16, 22].map(PLACE);
  const rankAll = async (userId, placeIds) => {
    for (const [i, id] of placeIds.entries()) await as(userId, `select rank_place($1, 'liked', $2)`, [id, i]);
  };
  const match = async (me, other) => (await one(me, 'select taste_match($1) as m', [other])).m;
  // Uygulamadaki açıklamayla aynı formül: 1 - |fark| / 5, iki yarı uyumlu mekânla dengelenir
  const expected = (pairs) =>
    Math.round((100 * (pairs.reduce((s, [a, b]) => s + Math.max(0, 1 - Math.abs(a - b) / 5), 0) + 1)) / (pairs.length + 2));

  test('aynı sıralama yüksek, ters sıralama düşük uyum; ortak mekânlar puanlarıyla', async () => {
    const [a, b, c] = [await signUp({ name: 'Uyum A' }), await signUp({ name: 'Uyum B' }), await signUp({ name: 'Uyum C' })];
    await rankAll(a, ps.slice(0, 3));
    await rankAll(b, ps.slice(0, 3));
    await rankAll(c, ps.slice(0, 3).reverse());

    const same = await match(a, b);
    assert.equal(same.common, 3);
    assert.equal(same.percent, 80);
    assert.equal(same.places.length, 3);
    assert.ok(same.places.every((p) => p.my_score === p.their_score && p.place.id));

    const reversed = await match(a, c);
    const scores = [0, 1, 2].map((i) => scoreAt('liked', i, 3));
    assert.equal(reversed.percent, expected(scores.map((s, i) => [s, scores[2 - i]])));
    assert.ok(reversed.percent < same.percent);
    // İkisinin de sevdiği önce: en düşük puanı en yüksek olan (ortadaki mekân, ikisinde de aynı puan)
    assert.equal(reversed.places[0].place.id, ps[1]);
  });

  test('3 ortak mekândan az: yüzde yok; kendisi, engelli çift ve oturumsuz', async () => {
    const [a, b] = [await signUp({ name: 'Az Ortak A' }), await signUp({ name: 'Az Ortak B' })];
    await rankAll(a, ps.slice(0, 2));
    await rankAll(b, [ps[0], ps[1], ps[3]]);
    const few = await match(a, b);
    assert.equal(few.common, 2);
    assert.equal(few.percent, null);
    assert.equal((await match(a, await signUp({ name: 'Hiç Ortak' }))).common, 0);

    assert.equal(await match(a, a), null);
    await as(a, `insert into blocks (blocked_id) values ($1)`, [b]);
    assert.equal(await match(a, b), null);
    assert.equal(await match(b, a), null);
    await rejects(rows(null, 'select taste_match($1)', [a]), /42501/);
  });
});

describe('paylaşılabilir listeler', () => {
  // Aynı segmentteki (sokak lezzeti) mekânlar: sahibin puan sırası tek listeden gelir
  const ps = [3, 4, 5, 9].map(PLACE);
  const saveList = (userId, args) =>
    one(userId, 'select save_list($1, $2, $3, $4, $5) as id', [
      args.id ?? null,
      args.title,
      args.description ?? null,
      args.places,
      args.notes ?? null,
    ]).then((r) => r.id);
  const details = async (userId, id) => (await one(userId, 'select list_details($1) as d', [id])).d;

  test('oluşturma, sahibin puanına göre sıra, notlar; güncelleme mekânları değiştirir', async () => {
    const me = await signUp({ name: 'Liste Yapan' });
    // Puan sırası: p3 > p1 (beğendim) > p2 (idare eder); p4 puanlanmamış
    await as(me, `select rank_place($1, 'liked', 0)`, [ps[0]]);
    await as(me, `select rank_place($1, 'liked', 0)`, [ps[2]]);
    await as(me, `select rank_place($1, 'fine', 0)`, [ps[1]]);

    const id = await saveList(me, {
      title: '  Kadıköy favorilerim ',
      description: ' ',
      places: [ps[3], ps[1], ps[0], ps[2], ps[0]],
      notes: ['', 'Mercimek çorbası', null, 'Acılı iste'],
    });
    const d = await details(me, id);
    assert.equal(d.list.title, 'Kadıköy favorilerim');
    assert.equal(d.list.description, null);
    assert.equal(d.list.place_count, 4, 'tekrar eden mekân bir kez eklenir');
    assert.equal(d.list.author.id, me);
    assert.deepEqual(
      d.items.map((i) => i.place.id),
      [ps[2], ps[0], ps[1], ps[3]],
    );
    assert.equal(Number(d.items[0].score), scoreAt('liked', 0, 2));
    assert.equal(d.items[3].score, null);
    assert.equal(d.items[0].note, 'Acılı iste');
    assert.equal(d.items[2].note, 'Mercimek çorbası');
    assert.equal(d.items[3].note, null);

    // Güncelleme: başlık ve mekânlar tamamen değişir; yeniden puanlama sırayı değiştirir
    await saveList(me, { id, title: 'Yeni ad', places: [ps[0], ps[1]] });
    await as(me, `select rank_place($1, 'liked', 0)`, [ps[1]]);
    const updated = await details(me, id);
    assert.equal(updated.list.title, 'Yeni ad');
    assert.deepEqual(
      updated.items.map((i) => i.place.id),
      [ps[1], ps[0]],
    );
    assert.equal((await one(me, 'select user_lists($1) as l', [me])).l.length, 1);
  });

  test('kurallar: boş/50+ mekân, uygunsuz başlık, başkasının listesi, doğrudan yazma', async () => {
    const me = await signUp({ name: 'Kural Liste' });
    await rejects(saveList(me, { title: 'Boş', places: [] }), /22023/);
    await rejects(saveList(me, { title: 'Çok', places: Array.from({ length: 51 }, () => randomUUID()) }), /22023/);
    await rejects(saveList(me, { title: '', places: [ps[0]] }), /23514/);
    await rejects(saveList(me, { title: 'amk listesi', places: [ps[0]] }), /Uygunsuz/);
    await rejects(saveList(me, { title: 'Yok', places: [randomUUID()] }), /23503/);

    const id = await saveList(me, { title: 'Benim', places: [ps[0]] });
    const other = await signUp({ name: 'Başkası Liste' });
    await rejects(saveList(other, { id, title: 'Çaldım', places: [ps[1]] }), /P0002/);
    await rejects(as(other, `insert into lists (title) values ('x')`), /42501/);
    await rejects(as(other, `update lists set save_count = 99 where id = $1`, [id]), /42501/);
    await rejects(as(other, `insert into list_places (list_id, place_id, position) values ($1, $2, 0)`, [id, ps[1]]), /42501/);
    // Başkası silemez (0 satır), sahibi siler
    await as(other, 'delete from lists where id = $1', [id]);
    assert.ok(await details(me, id));
    await as(me, 'delete from lists where id = $1', [id]);
    assert.equal(await details(me, id), null);
  });

  test('görünürlük: üyeler görür, girişsiz ve engelli kişi görmez', async () => {
    const owner = await signUp({ name: 'Görünür Liste' });
    await as(owner, `select rank_place($1, 'liked', 0)`, [ps[0]]);
    const id = await saveList(owner, { title: 'Açık liste', places: [ps[0], ps[1]], notes: ['Tavsiye'] });

    const member = await signUp({ name: 'Üye Bakan' });

    const seen = await details(member, id);
    assert.equal(seen.items.length, 2);
    assert.equal(seen.list.author.name, 'Görünür Liste');
    assert.equal(seen.list.saved_by_me, false);
    assert.equal(seen.items[0].note, 'Tavsiye');
    assert.equal(Number(seen.items[0].score), scoreAt('liked', 0, 1));
    assert.equal(await details(member, randomUUID()), null);
    await rejects(rows(null, 'select list_details($1)', [id]), /42501/);
    await rejects(rows(null, 'select user_lists($1)', [owner]), /42501/);
    await rejects(rows(null, 'select * from lists'), /42501/);

    const blocked = await signUp({ name: 'Engelli Liste' });
    await as(owner, `insert into blocks (blocked_id) values ($1)`, [blocked]);
    assert.equal(await details(blocked, id), null);
    assert.equal((await one(blocked, 'select user_lists($1) as l', [owner])).l.length, 0);
    await rejects(as(blocked, `insert into list_saves (list_id) values ($1)`, [id]), /row-level security/);
  });

  test('kaydetme: sayaç, kaydedilen listeler, kendi listesini kaydedemez; kimin kaydettiği gizli', async () => {
    const owner = await signUp({ name: 'Kaydedilen Liste' });
    const id = await saveList(owner, { title: 'Popüler liste', places: [ps[0]] });
    const [a, b] = [await signUp({ name: 'Kaydeden A' }), await signUp({ name: 'Kaydeden B' })];
    await as(a, `insert into list_saves (list_id) values ($1)`, [id]);
    await as(b, `insert into list_saves (list_id) values ($1)`, [id]);
    await rejects(as(owner, `insert into list_saves (list_id) values ($1)`, [id]), /row-level security/);
    await rejects(as(a, `insert into list_saves (list_id, user_id) values ($1, $2)`, [id, owner]), /row-level security/);

    assert.equal((await details(owner, id)).list.save_count, 2);
    const saved = (await one(a, 'select saved_lists() as l', [])).l;
    assert.deepEqual(saved.map((l) => l.id), [id]);
    assert.equal(saved[0].saved_by_me, true);
    assert.equal((await rows(owner, 'select * from list_saves where list_id = $1', [id])).length, 0);

    await as(a, 'delete from list_saves where list_id = $1', [id]);
    await as(b, 'select delete_account()');
    assert.equal((await details(owner, id)).list.save_count, 0);
    assert.equal((await one(a, 'select saved_lists() as l', [])).l.length, 0);
  });

  test('liste şikâyet edilir; yönetici kaldırınca liste silinir', async () => {
    const owner = await signUp({ name: 'Şikâyetli Liste' });
    const id = await saveList(owner, { title: 'Kötü liste', places: [ps[0]] });
    const reporter = await signUp({ name: 'Liste Şikâyetçi' });
    await as(reporter, `insert into reports (list_id, reason) values ($1, 'spam')`, [id]);
    await rejects(as(reporter, `insert into reports (list_id, user_id, reason) values ($1, $2, 'spam')`, [id, owner]), /23514/);

    const admin = await signUp({ name: 'Liste Yönetici' });
    await db.exec(`update profiles set is_admin = true where id = '${admin}'`);
    const queue = await rows(admin, 'select * from admin_reports()');
    const item = queue.find((r) => r.target_id === id);
    assert.equal(item.target_type, 'list');
    assert.equal(item.author_id, owner);
    assert.equal(item.preview, 'Kötü liste');
    await as(admin, 'select admin_resolve_report($1, $2)', [item.id, 'remove']);
    assert.equal(await details(owner, id), null);
  });
});

describe('hesap', () => {
  test('hesap silinince tüm verisi silinir ve sayaçlar düzelir', async () => {
    const me = await signUp({ name: 'Ayrılan' });
    await as(me, `insert into follows (followee_id) values ($1)`, [USER(6)]);
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(2)]);
    await as(me, `select create_post($1, $2)`, [randomUUID(), PLACE(2)]);
    const followers = (await one(me, 'select follower_count from profiles where id = $1', [USER(6)])).follower_count;

    await as(me, 'select delete_account()');
    const { rows: left } = await db.query(
      `select (select count(*) from profiles where id = $1)::int as p,
              (select count(*) from posts where user_id = $1)::int as g,
              (select count(*) from rankings where user_id = $1)::int as r`,
      [me],
    );
    assert.deepEqual(left[0], { p: 0, g: 0, r: 0 });
    const after = (await db.query('select follower_count from profiles where id = $1', [USER(6)])).rows[0];
    assert.equal(after.follower_count, followers - 1);
  });

  test('profil fotoğrafı yalnızca kendi klasöründen; dış adres yazılamaz', async () => {
    const me = await signUp({ name: 'Fotoğraflı' });
    await as(me, 'update profiles set avatar_path = $2 where id = $1', [me, `${me}/avatar-1.jpg`]);
    await rejects(as(me, 'update profiles set avatar_path = $2 where id = $1', [me, 'https://izleyici.example.com/p.jpg']), /22023/);
    await rejects(as(me, 'update profiles set avatar_path = $2 where id = $1', [me, `${USER(1)}/avatar.jpg`]), /22023/);
    await rejects(as(me, 'update profiles set avatar_path = $2 where id = $1', [me, `${me}/../${USER(1)}/a.jpg`]), /22023/);
    await as(me, 'update profiles set avatar_path = null where id = $1', [me]);
    // Başka sütunu güncellemek eski (betikle yazılmış) dış adrese takılmaz
    await db.query('update profiles set avatar_path = $2 where id = $1', [me, 'https://i.pravatar.cc/200?img=1']);
    await as(me, 'update profiles set name = $2 where id = $1', [me, 'Fotoğraflı Ad']);
  });

  test('ağır XP referansı ve puanlama yetkileri', async () => {
    const me = await signUp({ name: 'Yetki' });
    await rejects(rows(me, 'select * from xp_totals(null)'), /42501/);
    await rejects(rows(null, `select rank_place($1, 'liked', 0)`, [PLACE(1)]), /42501/);
  });

  test('günlük mekân ekleme sınırı', async () => {
    const me = await signUp({ name: 'Spamcı' });
    await db.transaction(async (tx) => {
      await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me })]);
      await tx.exec('set local role authenticated');
      for (let i = 0; i < 30; i++) {
        await tx.query(
          `insert into places (name, cuisine, district, city, latitude, longitude) values ($1, 'Kafe', 'Kadıköy', 'İstanbul', 40.99, 29.03)`,
          [`Deneme ${i}`],
        );
      }
      await rejects(
        tx.query(
          `insert into places (name, cuisine, district, city, latitude, longitude) values ('Fazla', 'Kafe', 'Kadıköy', 'İstanbul', 40.99, 29.03)`,
        ),
        /Günlük mekân ekleme sınırına/,
      );
    });
  });
});

describe('yorum yanıtları ve beğeniler', () => {
  const inbox = (userId) => rows(userId, 'select * from my_notifications()');

  async function postBy(name) {
    const id = await signUp({ name });
    await as(id, `select rank_place($1, 'liked', 0)`, [PLACE(13)]);
    const postId = randomUUID();
    await as(id, `select create_post($1, $2, 'x', null, null, '{}', '{}', '{}', '[]')`, [postId, PLACE(13)]);
    return { id, postId };
  }
  const comment = async (userId, postId, body, parentId = null) =>
    (await one(userId, 'insert into comments (post_id, body, parent_id) values ($1, $2, $3) returning id', [postId, body, parentId]))
      .id;

  test('yanıt: yanıtlanan yoruma "reply", gönderi sahibine "comment"; görünümde parent_id', async () => {
    const { id: owner, postId } = await postBy('Yanıt Sahibi');
    const [ayse, mert] = [await signUp({ name: 'Ayşe' }), await signUp({ name: 'Mert' })];
    const root = await comment(ayse, postId, 'Harika yer');
    const reply = await comment(mert, postId, 'Katılıyorum!', root);

    const ayseInbox = await inbox(ayse);
    assert.deepEqual(ayseInbox.map((n) => n.type), ['reply']);
    assert.equal(ayseInbox[0].comment, 'Katılıyorum!');
    assert.equal(ayseInbox[0].post_id, postId);
    assert.deepEqual((await inbox(owner)).map((n) => n.type).sort(), ['comment', 'comment']);

    // Gönderi sahibi bir yorumu yanıtlarsa yorum yazarına yalnızca "reply"; kendine bildirim yok
    await comment(owner, postId, 'Teşekkürler', reply);
    assert.deepEqual((await inbox(mert)).map((n) => n.type), ['reply']);
    // Kendi yorumuna yanıt veren gönderi sahibine iki kez bildirim gitmez
    const ownRoot = await comment(owner, postId, 'Ek bilgi');
    await comment(ayse, postId, 'Sağ ol', ownRoot);
    assert.equal((await inbox(owner)).filter((n) => n.actor.id === ayse).length, 2, 'ilk yorum + yanıt, tekrar yok');

    const view = await rows(ayse, 'select id, parent_id from comment_view where post_id = $1 order by created_at', [postId]);
    assert.equal(view.find((c) => c.id === reply).parent_id, root);
    assert.equal(view.find((c) => c.id === root).parent_id, null);
    assert.equal((await one(ayse, 'select comment_count from posts where id = $1', [postId])).comment_count, 5);

    // Üst yorum silinince yanıtları (yanıtın yanıtı dahil) da silinir, sayaç düşer
    await as(ayse, 'delete from comments where id = $1', [root]);
    assert.equal((await rows(ayse, 'select id from comments where id = $1', [reply])).length, 0);
    assert.equal((await one(ayse, 'select comment_count from posts where id = $1', [postId])).comment_count, 2);
  });

  test('yanıt başka gönderideki yoruma verilemez; engelli kişiye yanıt yok', async () => {
    const a = await postBy('Gönderi A');
    const b = await postBy('Gönderi B');
    const c = await comment(a.id, a.postId, 'Bizim yorum');
    await rejects(comment(b.id, b.postId, 'Yanlış yer', c), /P0002/);
    await rejects(comment(b.id, a.postId, 'Hayali', randomUUID()), /P0002/);

    const troll = await signUp({ name: 'Yanıt Trolü' });
    const target = await comment(a.id, a.postId, 'Beni rahat bırak');
    await as(troll, 'insert into post_likes (post_id) values ($1)', [a.postId]);
    await as(a.id, 'insert into blocks (blocked_id) values ($1)', [troll]);
    await rejects(comment(troll, a.postId, 'Yine ben', target), /row-level security|42501/);
  });

  test('yorum beğenme: sayaç, benim beğenim, bildirim; geri alınca hepsi geri; başkasının beğenisi görünmez', async () => {
    const { id: owner, postId } = await postBy('Beğenilen Yorumcu');
    const fan = await signUp({ name: 'Yorum Hayranı' });
    const c1 = await comment(owner, postId, 'Pideyi deneyin');
    const c2 = await comment(owner, postId, 'Ayranı da');

    await as(fan, 'insert into comment_likes (comment_id) values ($1)', [c1]);
    await as(fan, 'insert into comment_likes (comment_id) values ($1)', [c2]);
    const seen = await rows(fan, 'select id, like_count, liked_by_me from comment_view where post_id = $1', [postId]);
    assert.deepEqual(
      seen.map((c) => [c.id === c1 ? 'c1' : 'c2', c.like_count, c.liked_by_me]).sort(),
      [
        ['c1', 1, true],
        ['c2', 1, true],
      ],
    );
    assert.equal((await one(owner, 'select liked_by_me from comment_view where id = $1', [c1])).liked_by_me, false);
    assert.equal((await rows(owner, 'select * from comment_likes')).length, 0, 'kimin beğendiği görünmez');

    // Aynı gönderideki iki yorum iki ayrı bildirim; metin beğenilen yorumu gösterir
    const likes = (await inbox(owner)).filter((n) => n.type === 'comment_like');
    assert.equal(likes.length, 2);
    assert.deepEqual(likes.map((n) => n.comment).sort(), ['Ayranı da', 'Pideyi deneyin']);
    const text = (
      await db.query(
        `select notification_text(n, 'tr') as t from notifications n where user_id = $1 and type = 'comment_like' and comment_id = $2`,
        [owner, c1],
      )
    ).rows[0].t;
    assert.equal(text, 'Yorum Hayranı yorumunu beğendi: “Pideyi deneyin”');

    await as(fan, 'delete from comment_likes where comment_id = $1', [c1]);
    assert.equal((await one(fan, 'select like_count from comment_view where id = $1', [c1])).like_count, 0);
    assert.equal((await inbox(owner)).filter((n) => n.type === 'comment_like').length, 1);

    // Sayaç elle yazılamaz, başkası adına beğenilemez, iki kez beğenilemez
    await rejects(as(fan, 'update comments set like_count = 99 where id = $1', [c2]), /permission denied/);
    await rejects(as(fan, 'insert into comment_likes (comment_id, user_id) values ($1, $2)', [c1, owner]), /row-level security/);
    await rejects(as(fan, 'insert into comment_likes (comment_id) values ($1)', [c2]), /23505|duplicate/);
    // Kendi yorumunu beğenmek bildirim üretmez
    await as(owner, 'insert into comment_likes (comment_id) values ($1)', [c2]);
    assert.equal((await inbox(owner)).filter((n) => n.type === 'comment_like').length, 1);
  });
});

describe('tanıyor olabileceğin kişiler', () => {
  const pymk = (userId, limit = 50) => rows(userId, 'select * from people_you_may_know($1)', [limit]);
  const find = (list, id) => list.find((s) => s.profile.id === id);

  test('gerekçeler ve sıra: seni takip eden > rehber > birlikte etiketlenen > ortak arkadaş > popüler', async () => {
    const me = await signUp({ name: 'Öneri Alan' });
    const [follower, contact, tagged, friend, friendOfFriend, followed] = await Promise.all(
      ['Takipçi', 'Rehberdeki', 'Etiketleyen', 'Arkadaş', 'Arkadaşın Arkadaşı', 'Zaten Takipte'].map((name) => signUp({ name })),
    );
    await as(follower, 'insert into follows (followee_id) values ($1)', [me]);
    await as(me, 'insert into follows (followee_id) values ($1)', [friend]);
    await as(me, 'insert into follows (followee_id) values ($1)', [followed]);
    await as(friend, 'insert into follows (followee_id) values ($1)', [friendOfFriend]);

    // Rehber: numarası doğrulanmış kişi, benim kayıtlı rehberimde
    await db.query('update auth.users set phone = $2, phone_confirmed_at = now() where id = $1', [contact, '905551112233']);
    await as(me, 'select * from match_contacts($1, true)', [['0555 111 22 33']]);

    // Beni gönderisinde etiketleyen
    await as(tagged, `select rank_place($1, 'liked', 0)`, [PLACE(10)]);
    await as(tagged, `select create_post($1, $2, 'x', null, null, '{}', '{}', array[$3::uuid], '[]')`, [randomUUID(), PLACE(10), me]);

    const list = await pymk(me);
    const ids = list.map((s) => s.profile.id);
    assert.equal(find(list, follower).reason, 'follows_you');
    assert.equal(find(list, contact).reason, 'contact');
    assert.equal(find(list, tagged).reason, 'together');
    const fof = find(list, friendOfFriend);
    assert.equal(fof.reason, 'mutual');
    assert.equal(fof.mutual_count, 1);
    assert.equal(fof.mutual_name, 'Arkadaş');
    assert.ok(ids.indexOf(follower) < ids.indexOf(contact));
    assert.ok(ids.indexOf(contact) < ids.indexOf(tagged));
    assert.ok(ids.indexOf(tagged) < ids.indexOf(friendOfFriend));
    assert.ok(list.slice(ids.indexOf(friendOfFriend) + 1).every((s) => ['popular', 'school', 'engaged'].includes(s.reason)));
    assert.ok(!ids.includes(me) && !ids.includes(followed) && !ids.includes(friend));
    assert.ok(list.every((s) => s.profile.name && s.profile.username));
  });

  test('✕ ile gizlenen ve engelli kişiler hiçbir öneri listesinde çıkmaz; oturumsuz çağrılamaz', async () => {
    const me = await signUp({ name: 'Gizleyen' });
    const [hidden, blocked] = [await signUp({ name: 'Gizlenen' }), await signUp({ name: 'Engelli Önerilen' })];
    await as(hidden, 'insert into follows (followee_id) values ($1)', [me]);
    await as(blocked, 'insert into follows (followee_id) values ($1)', [me]);
    assert.ok(find(await pymk(me), hidden));

    await as(me, 'insert into suggestion_dismissals (dismissed_id) values ($1)', [hidden]);
    await as(me, 'insert into blocks (blocked_id) values ($1)', [blocked]);
    const list = await pymk(me);
    assert.equal(find(list, hidden), undefined);
    assert.equal(find(list, blocked), undefined);
    const suggested = await rows(me, 'select id from suggested_users(100)');
    assert.ok(!suggested.some((u) => u.id === hidden));

    // Gizlemeler yalnızca sahibine görünür, başkası adına gizlenemez
    assert.equal((await rows(hidden, 'select * from suggestion_dismissals')).length, 0);
    await rejects(
      as(hidden, 'insert into suggestion_dismissals (user_id, dismissed_id) values ($1, $2)', [me, blocked]),
      /row-level security/,
    );
    await rejects(rows(null, 'select * from people_you_may_know(5)'), /42501/);
  });
});

describe('semt araması ve bölgenin en iyileri', () => {
  test('yazdıkça ilçe ve mahalleler; tam ve baştan eşleşme önce; en az 2 harf', async () => {
    const me = await signUp({ name: 'Semt Arayan' });
    const kadikoy = await rows(me, 'select * from search_areas($1, 10)', ['kadık']);
    assert.equal(kadikoy[0].kind, 'district');
    assert.equal(kadikoy[0].name, 'Kadıköy');
    assert.equal(kadikoy[0].city, 'İstanbul');
    const expected = await one(
      me,
      `select count(*)::int as n from places where city = 'İstanbul' and district = 'Kadıköy' and closed_at is null`,
    );
    assert.equal(kadikoy[0].place_count, expected.n);

    const moda = await rows(me, 'select * from search_areas($1)', ['MODA']);
    assert.equal(moda[0].kind, 'neighborhood');
    assert.equal(moda[0].name, 'Moda');
    assert.equal(moda[0].district, 'Kadıköy');

    // Türkçe harfsiz yazım da bulur; tek harf aramaz
    assert.equal((await rows(me, 'select * from search_areas($1)', ['besiktas']))[0].name, 'Beşiktaş');
    assert.equal((await rows(me, 'select * from search_areas($1)', ['k'])).length, 0);
    assert.equal((await rows(me, 'select * from search_areas($1)', ['istanbul']))[0].kind, 'city');
    await rejects(rows(null, 'select * from search_areas($1)', ['kad']), /42501/);
  });

  test('bölgenin mekânları topluluk puanına göre; segment süzgeci; kapanan mekân yok', async () => {
    const me = await signUp({ name: 'Bölge Gezen' });
    const list = await rows(me, `select * from area_top_places('İstanbul', 'Kadıköy')`);
    assert.ok(list.length > 0);
    assert.ok(list.every((p) => p.district === 'Kadıköy' && p.city === 'İstanbul'));
    const rated = list.filter((p) => p.rating_count > 0);
    assert.ok(rated.length > 0);
    assert.deepEqual(
      list.slice(0, rated.length).map((p) => p.id),
      rated.map((p) => p.id),
      'puanlananlar önce',
    );
    for (let i = 1; i < rated.length; i++) assert.ok(rated[i - 1].average >= rated[i].average);
    const first = await one(
      me,
      'select avg(score)::double precision as a, count(*)::int as n from rankings where place_id = $1',
      [rated[0].id],
    );
    assert.equal(rated[0].average, first.a);
    assert.equal(rated[0].rating_count, first.n);

    const moda = await rows(me, `select * from area_top_places('İstanbul', 'Kadıköy', 'Moda')`);
    assert.ok(moda.length > 0 && moda.every((p) => p.neighborhood === 'Moda'));
    const breakfast = await rows(me, `select * from area_top_places('İstanbul', 'Kadıköy', null, 'breakfast')`);
    assert.ok(breakfast.length > 0 && breakfast.every((p) => p.cuisine === 'Kahvaltıcı'));
    assert.equal((await rows(me, `select * from area_top_places('İstanbul', 'Kadıköy', null, null, 1, 1)`)).length, 1);

    const closed = list[0].id;
    try {
      await db.query('update places set closed_at = now() where id = $1', [closed]);
      assert.ok(!(await rows(me, `select id from area_top_places('İstanbul', 'Kadıköy')`)).some((p) => p.id === closed));
      const after = (await rows(me, 'select * from search_areas($1)', ['kadıköy']))[0];
      assert.equal(after.place_count, (await one(me, `select count(*)::int as n from places where district = 'Kadıköy' and closed_at is null`)).n);
    } finally {
      await db.query('update places set closed_at = null where id = $1', [closed]);
    }
    await rejects(rows(null, `select * from area_top_places('İstanbul', 'Kadıköy')`), /42501/);
  });
});

describe('arama hızı: bölge dizini ve mekân arama', () => {
  /** Dizin, mekânlardan baştan sayılmış hâliyle aynı olmalı */
  async function assertIndexMatchesPlaces() {
    const { rows: diff } = await db.query(`
      with fresh as (
        select 'city' as kind, city, '' as district, city as name, count(*)::int as n
        from places where closed_at is null and city <> '' group by city
        union all
        select 'district', city, district, district, count(*)::int
        from places where closed_at is null and city <> '' and district <> '' group by city, district
        union all
        select 'neighborhood', city, district, neighborhood, count(*)::int
        from places
        where closed_at is null and city <> '' and neighborhood <> '' and tr_fold(neighborhood) <> tr_fold(district)
        group by city, district, neighborhood
      )
      select coalesce(f.kind, a.kind) as kind, coalesce(f.name, a.name) as name, f.n, a.place_count
      from fresh f
      full join area_index a on a.kind = f.kind and a.city = f.city and a.district = f.district and a.name = f.name
      where f.n is distinct from a.place_count`);
    assert.deepEqual(diff, []);
  }

  test('dizin mekân ekleme, taşıma, kapanma ve silmeyle güncel kalır', async () => {
    await assertIndexMatchesPlaces();
    const me = await signUp({ name: 'Dizin Test' });
    const { id } = await one(
      me,
      `insert into places (name, cuisine, neighborhood, district, city, latitude, longitude)
       values ('Dizin Deneme Kafe', 'Kafe', 'Moda', 'Kadıköy', 'İstanbul', 40.985, 29.026) returning id`,
    );
    await assertIndexMatchesPlaces();
    const moda = async () => (await rows(me, 'select * from search_areas($1)', ['moda']))[0].place_count;
    const before = await moda();
    await db.query(`update places set neighborhood = 'Caferağa' where id = $1`, [id]);
    await assertIndexMatchesPlaces();
    assert.equal(await moda(), before - 1);
    await db.query('update places set closed_at = now() where id = $1', [id]);
    await assertIndexMatchesPlaces();
    await db.query('update places set closed_at = null where id = $1', [id]);
    await assertIndexMatchesPlaces();
    await db.query('delete from places where id = $1', [id]);
    await assertIndexMatchesPlaces();
  });

  test('mekân arama: kısa (baştan), uzun (benzerlik), boş (yakın ya da popüler); kapanan yok', async () => {
    const me = await signUp({ name: 'Hızlı Arayan' });
    const names = async (q) => (await rows(me, 'select name from search_places($1, null, null, 10)', [q])).map((r) => r.name);
    assert.ok((await names('ç')).every((n) => /^[çc]/i.test(n)), 'tek harf: adın başı');
    assert.ok((await names('ku')).includes('Kuzguncuk Meze Evi'));
    assert.equal((await names('kuzgun'))[0], 'Kuzguncuk Meze Evi');
    assert.ok((await names('meze')).includes('Kuzguncuk Meze Evi'), 'kelime ortası da bulunur');
    // Boş arama, konumla: en yakın önce (Kadıköy'deyken Moda'daki)
    const near = await rows(me, 'select name, district from search_places($1, $2, $3, 5)', ['', KADIKOY.lat, KADIKOY.lng]);
    assert.equal(near[0].district, 'Kadıköy');
    // Konumsuz boş arama: puanlanan/paylaşılan mekânlar
    const popular = await rows(me, `select id from search_places('', null, null, 50)`);
    assert.ok(popular.length > 0);
    const counted = await rows(
      me,
      'select id from places p where exists (select 1 from rankings r where r.place_id = p.id) or exists (select 1 from posts x where x.place_id = p.id)',
    );
    assert.ok(popular.every((p) => counted.some((c) => c.id === p.id)));

    const closed = (await rows(me, `select id from search_places('kuzgun', null, null, 1)`))[0].id;
    try {
      await db.query('update places set closed_at = now() where id = $1', [closed]);
      assert.ok(!(await names('kuzgun')).includes('Kuzguncuk Meze Evi'));
    } finally {
      await db.query('update places set closed_at = null where id = $1', [closed]);
    }
  });
});

describe('haritada bölgeye gitme', () => {
  test('bölge sınırları mekânlarını kapsar; mekânsız bölge boş; oturumsuz çağrılamaz', async () => {
    const me = await signUp({ name: 'Haritada Gezen' });
    const b = await one(me, `select * from area_bounds('İstanbul', 'Kadıköy')`);
    assert.ok(b.south < b.north && b.west < b.east);
    const inside = await rows(me, `select latitude, longitude from places where district = 'Kadıköy' and closed_at is null`);
    const within = inside.filter((p) => p.latitude >= b.south && p.latitude <= b.north && p.longitude >= b.west && p.longitude <= b.east);
    assert.ok(within.length >= inside.length * 0.9);
    // Kadıköy, İstanbul'un içinde kalır
    const city = await one(me, `select * from area_bounds('İstanbul')`);
    assert.ok(city.south <= b.south && city.north >= b.north);
    assert.ok((await one(me, `select * from area_bounds('İstanbul', 'Kadıköy', 'Moda')`)).north <= b.north);
    assert.equal((await rows(me, `select * from area_bounds('Hayal Şehir')`)).length, 0);
    await rejects(rows(null, `select * from area_bounds('İstanbul')`), /42501/);
  });
});

describe('yıllık hedef yarışı', () => {
  test('sen ve takip ettiklerin; yalnızca o yılın puanları; tamamlanma oranına göre sıra; hedefsizler sonda', async () => {
    const me = await signUp({ name: 'Hedefçi' });
    const fast = await signUp({ name: 'Hızlı Gezen' });
    const slow = await signUp({ name: 'Yavaş Gezen' });
    const none = await signUp({ name: 'Hedefsiz' });
    const blocked = await signUp({ name: 'Engellenen Gezen' });
    const stranger = await signUp({ name: 'Tanımadığım' });
    for (const id of [fast, slow, none, blocked]) await as(me, `insert into follows (followee_id) values ($1)`, [id]);
    await as(me, `insert into blocks (blocked_id) values ($1)`, [blocked]);

    await as(me, 'update profiles set year_goal = 10 where id = $1', [me]);
    await as(fast, 'update profiles set year_goal = 2 where id = $1', [fast]);
    await as(slow, 'update profiles set year_goal = 100 where id = $1', [slow]);
    await as(stranger, 'update profiles set year_goal = 5 where id = $1', [stranger]);
    for (const p of [PLACE(1), PLACE(2)]) {
      await as(fast, `select rank_place($1, 'liked', 0)`, [p]);
      await as(slow, `select rank_place($1, 'liked', 0)`, [p]);
    }
    await as(none, `select rank_place($1, 'liked', 0)`, [PLACE(3)]);
    // Geçen yılın puanı bu yılın hedefine sayılmaz
    await db.query(`update rankings set rated_at = now() - interval '400 days' where user_id = $1 and place_id = $2`, [
      slow,
      PLACE(2),
    ]);

    const list = await rows(me, 'select user_id, goal, done, profile from year_challenge()');
    assert.deepEqual(
      list.map((r) => r.user_id),
      [fast, slow, me, none],
      'hızlı %100, yavaş %1, ben %0, hedefsiz en sonda; engellenen ve takip etmediğim yok',
    );
    assert.deepEqual(
      list.map((r) => [r.goal, r.done]),
      [
        [2, 2],
        [100, 1],
        [10, 0],
        [null, 1],
      ],
    );
    const lastYear = await rows(me, 'select user_id, done from year_challenge(extract(year from now())::integer - 1)');
    assert.equal(lastYear.find((r) => r.user_id === slow).done, 1);
    assert.equal(list[0].profile.name, 'Hızlı Gezen');
    await rejects(rows(null, 'select * from year_challenge()'), /42501/);
  });
});

describe('ölçek: sayaçlar ve indeksli okumalar', () => {
  /** Sayaçlar gerçek kayıtlarla birebir aynı mı (tüm tablo) */
  async function assertCountersConsistent() {
    const { rows: bad } = await db.query(`
      select 'place' as kind, pl.id from places pl
      where pl.rating_count <> (select count(*) from rankings r where r.place_id = pl.id)
         or pl.post_count <> (select count(*) from posts p where p.place_id = pl.id)
      union all
      select 'profile', pr.id from profiles pr
      where pr.like_total <> coalesce((select sum(p.like_count) from posts p where p.user_id = pr.id), 0)
         or pr.post_count <> (select count(*) from posts p where p.user_id = pr.id)`);
    assert.deepEqual(bad, []);
  }

  test('puan, gönderi, beğeni ve silmelerde sayaçlar tutarlı kalır; istemci yazamaz', async () => {
    await assertCountersConsistent();
    const me = await signUp({ name: 'Sayaç Sahibi' });
    const fan = await signUp({ name: 'Sayaç Hayranı' });
    await as(me, `select rank_place($1, 'liked', 0)`, [PLACE(4)]);
    await as(me, `select rank_place($1, 'fine', 0)`, [PLACE(4)]); // yeniden puanlama sayıyı artırmaz
    await as(fan, `select rank_place($1, 'liked', 0)`, [PLACE(4)]);
    const postId = randomUUID();
    await as(me, `select create_post($1, $2)`, [postId, PLACE(4)]);
    await as(fan, `insert into post_likes (post_id) values ($1)`, [postId]);
    await as(me, `insert into post_likes (post_id) values ($1)`, [postId]);
    await assertCountersConsistent();
    assert.equal((await one(me, 'select like_total from profiles where id = $1', [me])).like_total, 2);

    await as(fan, `delete from post_likes where post_id = $1`, [postId]);
    await as(fan, `select unrank_place($1)`, [PLACE(4)]);
    await assertCountersConsistent();
    // Gönderi silinince beğenileri de gider; toplam beğeni düşer
    await as(me, `delete from posts where id = $1`, [postId]);
    await assertCountersConsistent();
    assert.equal((await one(me, 'select like_total from profiles where id = $1', [me])).like_total, 0);

    await rejects(as(me, `update profiles set like_total = 999 where id = $1`, [me]), /42501/);
    await rejects(as(me, `update places set rating_count = 999 where id = $1`, [PLACE(4)]), /42501/);
    await rejects(as(me, `update posts set hot = 999 where user_id = $1`, [me]), /42501|428C9/);
  });

  test('popüler feed sıcaklığa göre sıralı ve eksiksiz; yoğun ve seyrek bölgede aynı sonuç', async () => {
    const me = await signUp({ name: 'Sıcaklık' });
    for (const [lat, lng] of [
      [KADIKOY.lat, KADIKOY.lng],
      [41.04, 29.0],
    ]) {
      const feed = (await one(me, 'select feed_popular($1, $2, p_limit => 50) as f', [lat, lng])).f;
      const { rows: region } = await db.query(
        `select p.id from posts p join places pl on pl.id = p.place_id
         where extensions.st_dwithin(pl.location, extensions.st_setsrid(extensions.st_makepoint($2, $1), 4326)::extensions.geography, $3 * 1000)
         order by p.hot desc limit 50`,
        [lat, lng, feed.radius_km],
      );
      // Bölgede 10'dan az gönderi varsa ardından genelden doldurulur (20261019160000_feed_fill)
      const { rows: rest } =
        region.length < 10
          ? await db.query('select id from posts where id <> all($1::uuid[]) order by hot desc limit $2', [
              region.map((r) => r.id),
              50 - region.length,
            ])
          : { rows: [] };
      const expected = [...region, ...rest];
      assert.equal(feed.nearby_count ?? null, region.length < 10 ? region.length : null);
      assert.deepEqual(feed.entries.map((e) => e.post.id), expected.map((r) => r.id));
      // Küçük sayfa: bölge toplanmadan sıcaklık indeksinden okunur; aynı sıra
      const page = (await one(me, 'select feed_popular($1, $2, p_offset => 1, p_limit => 2) as f', [lat, lng])).f;
      assert.deepEqual(page.entries.map((e) => e.post.id), expected.slice(1, 3).map((r) => r.id));
    }
    const city = (await one(me, `select feed_popular(p_city => 'İstanbul', p_limit => 50) as f`)).f;
    const { rows: cityExpected } = await db.query(
      `select p.id from posts p join places pl on pl.id = p.place_id where pl.city = 'İstanbul' order by p.hot desc limit 50`,
    );
    assert.deepEqual(city.entries.map((e) => e.post.id), cityExpected.map((r) => r.id));

    // Etkileşim sıcaklığı artırır; aynı yaşta daha çok etkileşim alan önde
    const hot = async (id) => (await db.query('select hot from posts where id = $1', [id])).rows[0].hot;
    const last = city.entries.at(-1).post.id;
    const before = await hot(last);
    const fan = await signUp({ name: 'Beğenen' });
    await as(fan, `insert into post_likes (post_id) values ($1)`, [last]);
    await as(fan, `insert into comments (post_id, body) values ($1, 'Harika')`, [last]);
    assert.ok((await hot(last)) > before);
    const { rows: same } = await db.query(
      `select hot_rank(10, 0, now()) > hot_rank(0, 0, now()) as a,
              hot_rank(0, 0, now()) > hot_rank(0, 0, now() - interval '1 hour') as b,
              abs(hot_rank(2, 0, now() - interval '14 days') - hot_rank(0, 0, now())) < 1e-9 as c`,
    );
    assert.deepEqual(same[0], { a: true, b: true, c: true }, 'üç kat etkileşim iki hafta yeniliğe denk');
    // Bölgede popüler olan önde; feed yine de haftalar içinde tazelenir
    const { rows: order } = await db.query(
      `select hot_rank(100, 0, now() - interval '5 days') > hot_rank(0, 0, now()) as five_days,
              hot_rank(30, 0, now() - interval '14 days') > hot_rank(3, 0, now()) as two_weeks,
              hot_rank(10, 0, now()) > hot_rank(100, 0, now() - interval '30 days') as month,
              hot_rank(0, 5, now()) = hot_rank(10, 0, now()) as comment_weight`,
    );
    assert.deepEqual(order[0], { five_days: true, two_weeks: true, month: true, comment_weight: true });
  });

  test('aynı anda aynı kullanıcı adıyla kayıt: ikincisi düşmez, sıradaki boş ad verilir', async () => {
    // Yarışı taklit: ilk denemede kullanıcı adı üretici, bu arada başkasının aldığı adı döndürür
    const id = randomUUID();
    await db
      .transaction(async (tx) => {
        await tx.exec(`
          create temp sequence username_calls;
          alter function public.unique_username(text) rename to unique_username_real;
          create function public.unique_username(base text) returns text language sql as $$
            select case when nextval('pg_temp.username_calls') = 1 then 'zeynepyer' else public.unique_username_real(base) end
          $$;`);
        await tx.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
          id,
          `${id}@test.dev`,
          { name: 'Zeynep Yarış', username: 'zeynepyer' },
        ]);
        const { rows: created } = await tx.query('select username from profiles where id = $1', [id]);
        assert.match(created[0].username, /^zeynepyer\d+$/);
        await tx.rollback();
      })
      .catch((error) => {
        if (!/rollback/i.test(String(error?.message))) throw error;
      });
    assert.equal((await db.query('select 1 from profiles where id = $1', [id])).rows.length, 0);
  });

  test('aramada % ve _ harfiyen aranır', async () => {
    const me = await signUp({ name: 'Joker' });
    assert.equal((await rows(me, `select id from search_places('%')`)).length, 0);
    assert.equal((await rows(me, `select id from search_places('_')`)).length, 0);
    assert.equal((await rows(me, `select id from search_users('%')`)).length, 0);
  });
});

describe('büyüme ölçümü', () => {
  test('paylaşım kaydı yalnızca log_share ile; özet yalnızca yöneticiye', async () => {
    const inviter = await signUp({ name: 'Paylaşımcı' });
    const invitee = await signUp({ name: 'Davetli Ölçüm' });
    await as(inviter, `select log_share('story', 'favorites', 'sheet', true)`);
    await as(inviter, `select log_share('post', $1)`, [randomUUID()]);
    await rejects(as(inviter, `select log_share('reklam')`), /23514/);
    await rejects(as(inviter, `insert into share_events (kind) values ('post')`), /42501/);
    await rejects(rows(inviter, 'select * from share_events'), /42501/);
    await rejects(as(null, `select log_share('post')`), /42501/);

    // Davetle gelen ve ilk puanını veren kişi K'ya sayılır
    await db.query(`update profiles set created_at = now() - interval '40 days' where id = $1`, [inviter]);
    await as(inviter, `select rank_place($1, 'liked', 0)`, [PLACE(2)]);
    await as(invitee, 'select set_inviter($1)', [(await one(inviter, 'select username from profiles where id = $1', [inviter])).username]);
    await as(invitee, `select rank_place($1, 'liked', 0)`, [PLACE(2)]);

    await rejects(as(inviter, 'select growth_stats(30)'), /42501/);
    const admin = await signUp({ name: 'Ölçen' });
    await db.query(`update profiles set is_admin = true where id = $1`, [admin]);
    const stats = (await one(admin, 'select growth_stats(30) as s')).s;
    assert.ok(stats.shares >= 2 && stats.shares_completed >= 1 && stats.sharers >= 1);
    assert.ok(stats.shares_by_kind.story >= 1);
    assert.ok(stats.invited_joins >= 1);
    assert.ok(stats.k > 0 && stats.active_users >= 2);
  });
});

/**
 * Expeat puanı modelinin başvuru uygulaması (migration 20261017100000_place_model'deki `refresh_place_strengths` ile
 * birebir): Plackett–Luce, listeler + beğendim/beğenmedim çizgileri, MM yinelemesi, sonra gösterilen puan.
 */
function fitPlaceModel(rows, iterations) {
  const BAND = { liked: 0, fine: 2, disliked: 4 };
  const lists = new Map();
  for (const r of rows) {
    const key = `${r.user_id}|${r.segment}`;
    if (!lists.has(key)) lists.set(key, []);
    lists.get(key).push(r);
  }
  const items = new Map();
  const listRows = [];
  for (const entries of lists.values()) {
    const segment = entries[0].segment;
    const out = [];
    for (const sentiment of ['liked', 'fine', 'disliked']) {
      const group = entries.filter((e) => e.sentiment === sentiment).sort((a, b) => a.position - b.position);
      let tier = 0;
      group.forEach((e) => {
        if (!(e.tied && e.position > 0)) tier++;
        out.push({ item: e.place_id, isPlace: true, w: e.w, band: BAND[sentiment], tier, segment });
      });
    }
    const w = Math.max(...entries.map((e) => e.weight));
    out.push({ item: `L:${segment}`, isPlace: false, w, band: 1, tier: 0, segment });
    out.push({ item: `D:${segment}`, isPlace: false, w, band: 3, tier: 0, segment });
    const keys = [...new Set(out.map((e) => e.band * 1e6 + e.tier))].sort((a, b) => a - b);
    for (const e of out) {
      e.step = keys.indexOf(e.band * 1e6 + e.tier);
      if (!items.has(e.item)) items.set(e.item, { segment, isPlace: e.isPlace, lg: 0 });
    }
    listRows.push(out);
  }
  const steps = (list) => Math.max(...list.map((e) => e.step)) + 1;
  for (let it = 0; it < iterations; it++) {
    const wins = new Map();
    const den = new Map();
    const add = (map, key, v) => map.set(key, (map.get(key) ?? 0) + v);
    for (const list of listRows) {
      const n = steps(list);
      const gamma = (e) => Math.exp(items.get(e.item).lg);
      const all = Array(n).fill(0);
      const placesOnly = Array(n).fill(0);
      for (const e of list) {
        all[e.step] += gamma(e);
        if (e.isPlace) placesOnly[e.step] += gamma(e);
      }
      const uAll = Array(n).fill(0);
      const uPlaces = Array(n).fill(0);
      for (const e of list) {
        let rest = 0;
        for (let s = e.step + 1; s < n; s++) rest += e.isPlace ? all[s] : placesOnly[s];
        e.u = rest > 0 ? e.w / (gamma(e) + rest) : 0;
        add(wins, e.item, rest > 0 ? e.w : 0);
        uAll[e.step] += e.u;
        if (e.isPlace) uPlaces[e.step] += e.u;
      }
      for (const e of list) {
        let above = 0;
        for (let s = 0; s < e.step; s++) above += e.isPlace ? uAll[s] : uPlaces[s];
        add(den, e.item, e.u + above);
      }
    }
    for (const [key, item] of items) {
      item.next = Math.log(((wins.get(key) ?? 0) + 1) / ((den.get(key) ?? 0) + 2 / (Math.exp(item.lg) + 1)));
    }
    for (const item of items.values()) item.lg = item.next;
  }
  const scores = new Map();
  const segments = new Set([...items.values()].map((i) => i.segment));
  const round9 = (x) => (Math.sign(x) * Math.round(Math.abs(x) * 1e9)) / 1e9;
  for (const segment of segments) {
    const aL = Math.exp(items.get(`L:${segment}`).lg);
    const aD = Math.exp(items.get(`D:${segment}`).lg);
    const places = [...items.entries()]
      .filter(([, i]) => i.isPlace && i.segment === segment)
      .map(([id, i]) => {
        const g = Math.exp(i.lg);
        const pLiked = g / (g + aL);
        const pDisliked = aD / (g + aD);
        const pFine = Math.max(1 - pLiked - pDisliked, 0);
        const t = pLiked + pFine + pDisliked;
        return { id, key: round9(i.lg), pl: pLiked / t, pf: pFine / t, pd: pDisliked / t };
      });
    const position = (p, band) => {
      const total = places.reduce((s, q) => s + q[band], 0);
      if (total === 0) return 0.5;
      const above = places.filter((q) => q.key > p.key).reduce((s, q) => s + q[band], 0);
      const peers = places.filter((q) => q.key === p.key).reduce((s, q) => s + q[band], 0);
      return (above + peers / 2) / total;
    };
    for (const p of places) {
      const [xl, xf, xd] = [position(p, 'pl'), position(p, 'pf'), position(p, 'pd')];
      const score = p.pl * (10 - 3.3 * xl ** 2) + p.pf * (6.6 - 3.2 * xf ** 2) + p.pd * (3.3 - 3.3 * xd ** 2);
      scores.set(p.id, Math.min(10, Math.max(0, score)));
    }
  }
  return { items, scores };
}

describe('Expeat puanı modeli', () => {
  const resetModel = () =>
    db.exec(`delete from place_strengths; delete from segment_anchors; update model_state set fitted_at = now();`);
  after(resetModel);

  /** Kadıköy'de yalnızca bu testlerin puanladığı yeni mekânlar */
  async function newPlaces(n, cuisine = 'Köfteci') {
    const ids = [];
    for (let i = 0; i < n; i++) {
      const { rows: [row] } = await db.query(
        `insert into places (name, cuisine, district, city, latitude, longitude)
         values ($1, $2, 'Kadıköy', 'İstanbul', 40.99 + $3 * 0.0001, 29.03) returning id`,
        [`Model Yeri ${randomUUID().slice(0, 8)}`, cuisine, i],
      );
      ids.push(row.id);
    }
    return ids;
  }
  const rankList = async (user, list, sentiment = 'liked') => {
    for (const [i, id] of list.entries()) await as(user, `select rank_place($1, $2, $3)`, [id, sentiment, i]);
  };
  const modelScore = async (id) =>
    (await db.query('select score, strength from place_strengths where place_id = $1', [id])).rows[0];

  test('veritabanındaki model başvuru uygulamasıyla birebir aynı (güç, çizgiler, puan)', async () => {
    await resetModel();
    await db.query('select refresh_place_strengths(60)');
    const { rows } = await db.query(
      `select user_id, segment::text, place_id, sentiment::text, position, tied, weight::float8 as weight,
         (weight * rating_recency(rated_at))::float8 as w
       from rankings`,
    );
    const { items, scores } = fitPlaceModel(rows, 60);
    const { rows: sql } = await db.query('select place_id, strength, score from place_strengths');
    assert.equal(sql.length, [...items.values()].filter((i) => i.isPlace).length);
    for (const r of sql) {
      assert.ok(Math.abs(r.strength - items.get(r.place_id).lg) < 1e-6, `güç ${r.place_id}`);
      assert.ok(Math.abs(r.score - scores.get(r.place_id)) < 1e-6, `puan ${r.place_id}: ${r.score} / ${scores.get(r.place_id)}`);
    }
    const { rows: anchors } = await db.query('select segment::text, liked, disliked from segment_anchors');
    for (const a of anchors) {
      assert.ok(Math.abs(a.liked - items.get(`L:${a.segment}`).lg) < 1e-6);
      assert.ok(Math.abs(a.disliked - items.get(`D:${a.segment}`).lg) < 1e-6);
    }
  });

  test('güçlü rakipleri geçen önde: ortalamada eşit iki mekânı model ayırır; puan güçle aynı sırada', async () => {
    const [x, y, s1, s2, w1, w2] = await newPlaces(6);
    const users = [];
    for (let i = 0; i < 9; i++) users.push(await signUp({ name: `Model ${i}` }));
    for (const u of users.slice(0, 3)) await rankList(u, [x, s1, s2]);
    for (const u of users.slice(3, 6)) await rankList(u, [y, w1, w2]);
    for (const u of users.slice(6)) await rankList(u, [s1, s2, w1, w2]);
    await resetModel();
    const bayes = async (id) =>
      (
        await db.query(
          `select place_community_score(place_id, sum(coalesce(calibrated_score, score) * weight * rating_recency(rated_at)),
             sum(weight * rating_recency(rated_at))) as a from rankings where place_id = $1 group by place_id`,
          [id],
        )
      ).rows[0].a;
    assert.ok(Math.abs((await bayes(x)) - (await bayes(y))) < 1e-9, 'ortalama X ile Y’yi ayıramaz');
    await db.query('select refresh_place_strengths(300)');
    const [mx, my, ms1, mw1] = await Promise.all([x, y, s1, w1].map(modelScore));
    assert.ok(mx.strength > my.strength && mx.score > my.score, `X (${mx.score}) > Y (${my.score})`);
    assert.ok(ms1.score > mw1.score, 'güçlüler zayıfların önünde');
    // Segment içinde puan sırası güç sırasıyla aynı; puan 0–10
    const { rows: seg } = await db.query(
      `select strength, score from place_strengths where segment = 'street' order by strength desc`,
    );
    for (let i = 1; i < seg.length; i++) assert.ok(seg[i].score <= seg[i - 1].score + 1e-12, 'puan güçle azalır');
    assert.ok(seg.every((r) => r.score >= 0 && r.score <= 10));

    // Model hesaplanmaya devam eder ama gösterilen Expeat puanı şimdilik düz ortalama (20261021100000_plain_average)
    const late = await signUp({ name: 'Geç Gelen' });
    const plain = async (id) => (await one(late, 'select avg(score)::double precision as a, count(*)::int as c from rankings where place_id = $1', [id])).a;
    const before = (await one(late, 'select place_details($1) as d', [x])).d.rating.average;
    assert.equal(before, await plain(x));
    await as(late, `select rank_place($1, 'disliked', 0)`, [x]);
    const after = (await one(late, 'select place_details($1) as d', [x])).d.rating.average;
    assert.ok(after < before, 'beğenmeyen yeni puan düşürür');
    assert.equal(after, await plain(x));

    // Modelin görmediği mekân da düz ortalamayla
    const [fresh] = await newPlaces(1);
    await as(late, `select rank_place($1, 'liked', 0)`, [fresh]);
    const shown = (await one(late, 'select place_details($1) as d', [fresh])).d.rating.average;
    assert.equal(shown, 10);
  });

  test('öneriler: tek arkadaşın puanı topluluğu ezmez', async () => {
    const [loved, hated, filler] = await newPlaces(3, 'Kebapçı');
    const crowd = [];
    for (let i = 0; i < 5; i++) crowd.push(await signUp({ name: `Kalabalık ${i}` }));
    for (const u of crowd) {
      await rankList(u, [loved, filler]);
      await rankList(u, [hated], 'disliked');
    }
    const friend = await signUp({ name: 'Zevki Farklı' });
    await rankList(friend, [hated]);
    await rankList(friend, [loved], 'fine');
    const me = await signUp({ name: 'Öneri Bekleyen' });
    await as(me, 'insert into follows (followee_id) values ($1)', [friend]);
    await resetModel();
    const recs = await rows(me, 'select * from recommended_places(null, null, 50)');
    const find = (id) => recs.findIndex((r) => r.id === id);
    // Eskiden: arkadaşın "idare eder"i (6,6) topluluğun favorisini eliyor, "beğendim"i (10) sevilmeyeni başa koyuyordu
    assert.ok(find(loved) >= 0, 'topluluğun sevdiği mekân, arkadaş idare eder dese de önerilir');
    assert.equal(recs[find(loved)].friend_average, scoreAt('fine', 0, 1), 'gösterilen arkadaş puanı onun puanı');
    assert.ok(find(hated) === -1 || find(hated) > find(loved), 'arkadaşın 10’u sevilmeyeni başa taşıyamaz');
  });
});

// Dosyadaki tüm testlerden sonra çalışır: beğeni, silme, davet, hesap silme dahil her olay sayaçlara yansımış olmalı
describe('XP sayaçları', () => {
  const COLS = 'ratings, posts, photo_posts, likes, invites, welcome';
  const nonZero = 'ratings + posts + photo_posts + likes + invites + welcome';

  test('sayaçlar baştan hesaplanan XP ile birebir aynı (tüm zamanlar ve bu ay)', async () => {
    const all = async (sql) => (await db.query(sql)).rows;
    assert.deepEqual(
      await all(`select user_id, ${COLS} from xp_all where ${nonZero} <> 0 order by user_id`),
      await all(`select user_id, ${COLS} from xp_totals(null) where ${nonZero} > 0 order by user_id`),
    );
    assert.deepEqual(
      await all(`select user_id, ${COLS} from xp_monthly where month = xp_month_of(now()) and ${nonZero} <> 0 order by user_id`),
      await all(`select user_id, ${COLS} from xp_totals(month_start()) where ${nonZero} > 0 order by user_id`),
    );
  });

  test('günde 20 puanlama sayılır; silinen gönderinin fotoğraf ve beğeni XP’si düşer', async () => {
    const me = await signUp({ name: 'Çalışkan' });
    const fan = await signUp({ name: 'Hayran' });
    const { rows: places } = await db.query('select id from places order by id limit 22');
    for (const p of places) await as(me, `select rank_place($1, 'fine', 0)`, [p.id]);
    const xpOf = async () => (await one(me, 'select * from leaderboard($1)', ['friends'])).xp;
    assert.equal(await xpOf(), 200);

    const id = randomUUID();
    await as(
      me,
      `select * from create_post($1, $2, 'Güzel', null, null, array[]::text[], array[]::text[], array[]::uuid[], $3)`,
      [id, places[0].id, JSON.stringify([{ path: `${me}/${id}/0.jpg`, width: 1440, height: 1800 }])],
    );
    await as(fan, 'insert into post_likes (post_id) values ($1)', [id]);
    assert.equal(await xpOf(), 200 + 20 + 20 + 2);
    await as(me, 'delete from posts where id = $1', [id]);
    assert.equal(await xpOf(), 200);
    // Profildeki sıra genel tablodaki kendi satırınla aynı
    const own = (await rows(me, 'select * from leaderboard()')).find((e) => e.user_id === me);
    assert.equal((await one(me, 'select user_rank($1) as r', [me])).r, own.rank);
  });
});

describe('push jetonu temizliği', () => {
  // Supabase'in pg_net'inin taklidi: istekler kaydedilir, yanıtlar testte elle yazılır
  before(async () => {
    await db.exec(`
      create schema net;
      create table net.requests (id bigint generated always as identity primary key, url text, body jsonb);
      create table net._http_response (id bigint primary key, status_code integer, content text);
      create function net.http_post(url text, body jsonb) returns bigint language sql
        as $$ insert into net.requests (url, body) values (url, body) returning id $$;
    `);
  });
  // Diğer testlerde push yine atlansın
  after(() => db.exec('drop schema net cascade'));

  const tokensOf = async (userId) =>
    (await db.query('select token from push_tokens where user_id = $1 order by token', [userId])).rows.map((r) => r.token);
  const lastRequest = async () => (await db.query('select * from net.requests order by id desc limit 1')).rows[0];
  const respond = (id, body, status = 200) =>
    db.query('insert into net._http_response (id, status_code, content) values ($1, $2, $3)', [
      id,
      status,
      typeof body === 'string' ? body : JSON.stringify(body),
    ]);
  const maintain = () => db.query('select push_maintenance()');
  const count = async (table) => Number((await db.query(`select count(*) as n from ${table}`)).rows[0].n);
  /** Takip bildirimi: alıcının tüm cihazlarına tek istek */
  const notify = async (to) => {
    const fan = await signUp({ name: 'Takipçi' });
    await as(fan, 'insert into follows (followee_id) values ($1)', [to]);
    return lastRequest();
  };
  const dead = { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };

  test('gönderim yanıtında ya da teslim raporunda "DeviceNotRegistered" olan jeton silinir', async () => {
    const me = await signUp({ name: 'Üç Cihazlı' });
    const [a, b, c] = ['ExponentPushToken[aaa]', 'ExponentPushToken[bbb]', 'ExponentPushToken[ccc]'];
    for (const token of [c, a, b]) await as(me, 'select register_push_token($1)', [token]);

    const send = await notify(me);
    assert.equal(send.url, 'https://exp.host/--/api/v2/push/send');
    assert.deepEqual(
      send.body.map((m) => m.to),
      [a, b, c],
    );
    // Jetonlar mesaj sırasıyla saklanır (Expo yanıtı aynı sırada döner)
    const sent = await db.query('select tokens from push_sends where request_id = $1', [send.id]);
    assert.deepEqual(sent.rows[0].tokens, [a, b, c]);

    // Yanıt gelmeden bakım hiçbir şey silmez
    await maintain();
    assert.deepEqual(await tokensOf(me), [a, b, c]);

    // a hemen ölü; b ve c gönderildi, teslim raporları beklenir
    await respond(send.id, { data: [dead, { status: 'ok', id: 'r-b' }, { status: 'ok', id: 'r-c' }] });
    await maintain();
    assert.deepEqual(await tokensOf(me), [b, c]);
    assert.equal(await count('push_sends'), 0);
    assert.deepEqual((await db.query('select ticket_id, token from push_receipts order by ticket_id')).rows, [
      { ticket_id: 'r-b', token: b },
      { ticket_id: 'r-c', token: c },
    ]);

    // Raporlar 15 dakika dolmadan istenmez
    await maintain();
    assert.equal((await lastRequest()).id, send.id);
    await db.query(`update push_receipts set created_at = now() - interval '20 minutes'`);
    await maintain();
    const ask = await lastRequest();
    assert.equal(ask.url, 'https://exp.host/--/api/v2/push/getReceipts');
    assert.deepEqual([...ask.body.ids].sort(), ['r-b', 'r-c']);
    // Yanıt beklenirken aynı raporlar bir saat dolmadan yeniden istenmez
    await maintain();
    assert.equal((await lastRequest()).id, ask.id);

    // b'nin uygulaması silinmiş, c teslim edildi
    await respond(ask.id, { data: { 'r-b': dead, 'r-c': { status: 'ok' } } });
    await maintain();
    assert.deepEqual(await tokensOf(me), [c]);
    assert.equal(await count('push_receipts'), 0);
    assert.equal(await count('push_receipt_requests'), 0);
  });

  test('henüz hazır olmayan rapor bir saat sonra yeniden istenir; 24 saatten eskisi atılır', async () => {
    const me = await signUp({ name: 'Bekleyen' });
    const token = 'ExponentPushToken[late]';
    await as(me, 'select register_push_token($1)', [token]);
    const send = await notify(me);
    await respond(send.id, { data: [{ status: 'ok', id: 'r-late' }] });
    await maintain();
    await db.query(`update push_receipts set created_at = now() - interval '20 minutes'`);
    await maintain();
    const ask = await lastRequest();
    assert.deepEqual(ask.body.ids, ['r-late']);
    // Rapor henüz yok: yanıtta kimliği yok, kayıt bekler
    await respond(ask.id, { data: {} });
    await maintain();
    assert.equal(await count('push_receipts'), 1);
    await db.query(`update push_receipts set requested_at = now() - interval '61 minutes'`);
    await maintain();
    const again = await lastRequest();
    assert.notEqual(again.id, ask.id);
    assert.deepEqual(again.body.ids, ['r-late']);
    await db.query(`update push_receipts set created_at = now() - interval '25 hours'`);
    await maintain();
    assert.equal(await count('push_receipts'), 0);
    assert.deepEqual(await tokensOf(me), [token]);
    await db.query('delete from push_receipt_requests');
  });

  test('başka hatalar, uyuşmayan ya da bozuk yanıt jeton silmez', async () => {
    const me = await signUp({ name: 'İki Cihazlı' });
    const tokens = ['ExponentPushToken[xxx]', 'ExponentPushToken[yyy]'];
    for (const token of tokens) await as(me, 'select register_push_token($1)', [token]);
    const rate = { status: 'error', details: { error: 'MessageRateExceeded' } };
    const cases = [
      { data: [rate, rate] }, // başka hata
      { data: [dead] }, // mesaj sayısıyla uyuşmuyor: hangi jetonun öldüğü bilinemez
      { errors: [{ code: 'VALIDATION_ERROR' }] }, // istek bütünüyle reddedildi
      'Bad Gateway', // JSON değil
    ];
    for (const body of cases) {
      const send = await notify(me);
      await respond(send.id, body, typeof body === 'string' ? 502 : 200);
      await maintain();
      assert.deepEqual(await tokensOf(me), tokens);
    }
    // 200 dönen ama JSON olmayan yanıt da bakımı durdurmaz
    const send = await notify(me);
    await respond(send.id, '<html>', 200);
    await maintain();
    assert.deepEqual(await tokensOf(me), tokens);
    assert.equal(await count('push_sends'), 0);
    assert.equal(await count('push_receipts'), 0);
  });

  test('çıkışta silinen jetonun bekleyen raporu da gider; bakım istemciye kapalı', async () => {
    const me = await signUp({ name: 'Çıkan' });
    const token = 'ExponentPushToken[out]';
    await as(me, 'select register_push_token($1)', [token]);
    const send = await notify(me);
    await respond(send.id, { data: [{ status: 'ok', id: 'r-out' }] });
    await maintain();
    assert.equal(await count('push_receipts'), 1);
    await as(me, 'select unregister_push_token($1)', [token]);
    assert.equal(await count('push_receipts'), 0);

    await rejects(as(me, 'select push_maintenance()'), /42501/);
    await rejects(as(me, `select push_apply_receipts('{}'::jsonb)`), /42501/);
    await rejects(as(null, `select push_apply_tickets('{}'::text[], '{}'::jsonb)`), /42501/);
    await rejects(as(me, 'select * from push_receipts'), /42501/);
    await rejects(as(null, 'select * from push_sends'), /42501/);
    await rejects(as(me, 'select * from push_receipt_requests'), /42501/);
  });
});

describe('zorunlu güncelleme', () => {
  test('en düşük sürüm oturumsuz da okunur; istemci değiştiremez', async () => {
    const user = await signUp({ name: 'Sürümcü' });
    const expected = [
      { platform: 'android', min_version: '1.0.0' },
      { platform: 'ios', min_version: '1.0.0' },
    ];
    assert.deepEqual(await rows(null, 'select platform, min_version from app_min_versions order by platform'), expected);
    assert.deepEqual(await rows(user, 'select platform, min_version from app_min_versions order by platform'), expected);
    await rejects(as(user, `update app_min_versions set min_version = '9.9.9'`), /42501/);
    await rejects(as(null, `insert into app_min_versions (platform, min_version) values ('web', '1.0.0')`), /42501/);
    await rejects(as(user, `delete from app_min_versions`), /42501/);
    await rejects(db.query(`update app_min_versions set min_version = 'yeni' where platform = 'ios'`), /check constraint/);
  });

  test('sürüm karşılaştırması: sayısal, belirsizlikte kilitlemez', () => {
    assert.equal(isBelowMinVersion('1.0.1', '1.0.2'), true);
    assert.equal(isBelowMinVersion('1.0.9', '1.0.10'), true);
    assert.equal(isBelowMinVersion('1.9.9', '2.0'), true);
    assert.equal(isBelowMinVersion('1.0.2', '1.0.2'), false);
    assert.equal(isBelowMinVersion('1.1', '1.0.10'), false);
    assert.equal(isBelowMinVersion('2.0.0', '1.9.9'), false);
    assert.equal(isBelowMinVersion(' 1.0.1 ', '1.0.1'), false);
    assert.equal(isBelowMinVersion(null, '1.0.2'), false);
    assert.equal(isBelowMinVersion('1.0.1', null), false);
    assert.equal(isBelowMinVersion('1.0.1-beta', '1.0.2'), false);
    assert.equal(isBelowMinVersion('1.0.1', '1.0.2.3'), false);
  });
});
