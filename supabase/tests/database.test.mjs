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

import { SEGMENT_OF } from '../../src/constants/segments.ts';
import { scoreAt } from '../../src/lib/ranking.ts';

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

describe('erişim kuralları', () => {
  test('giriş yapmamış kullanıcı içerik göremez', async () => {
    await rejects(rows(null, 'select * from profiles'), /42501/);
    await rejects(rows(null, 'select * from post_view'), /42501/);
    await rejects(rows(null, `select feed_following()`), /42501/);
    assert.equal((await rows(null, 'select * from cuisines')).length, 23);
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
  // Seed'de aynı segmentteki (sokak lezzeti) mekânlar: dürümcü, kokoreççi, ciğerci, burgerci, pideci
  const places = [3, 4, 5, 9, 11].map(PLACE);
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

  test('az mekânla uç puan yok; liste büyüyünce tüm aralık kullanılır; gruplar örtüşmez', () => {
    assert.equal(scoreAt('liked', 0, 1), 8.4);
    assert.ok(scoreAt('liked', 1, 2) > 7.5);
    assert.equal(scoreAt('liked', 0, 5), 10);
    assert.equal(scoreAt('liked', 4, 5), 6.7);
    for (let count = 1; count <= 30; count++) {
      assert.ok(scoreAt('liked', count - 1, count) > scoreAt('fine', 0, 1 + (count % 7)));
      assert.ok(scoreAt('fine', count - 1, count) > scoreAt('disliked', 0, 1 + (count % 5)));
      for (let i = 1; i < count; i++) assert.ok(scoreAt('liked', i, count) <= scoreAt('liked', i - 1, count));
    }
  });

  test('segment eşlemesi veritabanıyla aynı', async () => {
    const { rows: cuisines } = await db.query('select name, segment::text from cuisines');
    assert.deepEqual(Object.fromEntries(cuisines.map((c) => [c.name, c.segment])), SEGMENT_OF);
  });

  test('topluluk puanı: az puanlı mekân uca gitmez, puan sayısı arttıkça ortalamaya yaklaşır', async () => {
    const score = async (total, n) => (await db.query('select community_score($1, $2) as s', [total, n])).rows[0].s;
    assert.equal(await score(0, 0), null);
    assert.ok(Math.abs((await score(10, 1)) - 8) < 1e-9);
    assert.ok((await score(1, 1)) > 4.9);
    const many = await score(9 * 50, 50);
    assert.ok(many > 8.9 && many < 9);
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
    assert.ok(feed.entries.every((e) => e.post.place.city === 'İzmir'));
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
      'select community_score(sum(score), count(*)) as a, count(*)::int as c from rankings where place_id = $1',
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
  test('değerlendirme sayısı, eşitlikte beğeni; yarışma usulü sıra', async () => {
    const me = await signUp({ name: 'Yarışmacı' });
    const board = await rows(me, 'select * from leaderboard()');
    for (let i = 1; i < board.length; i++) {
      const [a, b] = [board[i - 1], board[i]];
      assert.ok(a.reviews > b.reviews || (a.reviews === b.reviews && a.likes >= b.likes));
      assert.ok(b.rank >= a.rank);
    }
    // Genel tabloda değerlendirmesi olmayan listelenmez; kullanıcının kendisi hariç
    assert.ok(board.filter((e) => e.reviews === 0).every((e) => e.user_id === me));
    const top = board[0];
    assert.equal((await one(me, 'select user_rank($1) as r', [top.user_id])).r, top.rank);
    assert.equal((await one(me, 'select user_rank($1) as r', [me])).r, null);
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
    assert.deepEqual(await text('tr'), { t: `Zeynep, ${place} için 8,4 verdi. Sen 5,0 vermiştin.`, p: `mekan/${PLACE(17)}` });
    assert.equal((await text('en')).t, `Zeynep gave ${place} a 8.4. You gave it 5.0.`);
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
    assert.deepEqual(text.rows[0], { t: "Rehberindeki Yeni Katılan Puanla'ya katıldı", p: `kullanici/${friend}` });

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
  const ps = [2, 6, 12, 22].map(PLACE);
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
