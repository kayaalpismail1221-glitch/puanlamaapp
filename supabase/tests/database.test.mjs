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
  test('profil ve gizli iletişim bilgisi oluşur', async () => {
    const id = await signUp({ name: 'Ayşe Yılmaz', username: 'ayseyilmaz', phone: '5321234567' });
    const profile = await one(id, 'select * from profiles where id = $1', [id]);
    assert.equal(profile.name, 'Ayşe Yılmaz');
    assert.equal(profile.username, 'ayseyilmaz');
    assert.equal(profile.onboarded_at, null);
    const priv = await one(id, 'select phone from profile_private where user_id = $1', [id]);
    assert.equal(priv.phone, '+905321234567');
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

describe('erişim kuralları', () => {
  test('giriş yapmamış kullanıcı içerik göremez', async () => {
    await rejects(rows(null, 'select * from profiles'), /42501/);
    await rejects(rows(null, 'select * from post_view'), /42501/);
    await rejects(rows(null, `select feed_following()`), /42501/);
    assert.equal((await rows(null, 'select * from cuisines')).length, 12);
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
  const places = [1, 2, 3, 4, 5].map(PLACE);

  async function myRankings(me) {
    return rows(me, `select place_id, sentiment, position, score::float as score from rankings where user_id = $1`, [me]);
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
    assert.equal(list.find((r) => r.place_id === places[2]).score, 10);
  });

  test('aşırı indeks gruba sığdırılır, puanlanan mekân Listem’den düşer', async () => {
    const me = await signUp({ name: 'Kaydeden' });
    await as(me, `insert into saved_places (place_id, origin) values ($1, 'social')`, [places[4]]);
    await as(me, `select rank_place($1, 'disliked', 99)`, [places[4]]);
    const r = await one(me, 'select position, score::float as score from rankings where user_id = $1', [me]);
    assert.equal(r.position, 0);
    assert.equal(r.score, 3.3);
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
    assert.equal(Number(post.score), 10);
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
    await as(me, `insert into post_saves (post_id) values ($1), ($2)`, [POST(2), POST(5)]);
    const saved = await rows(me, `select id, saved_by_me from list_posts(p_saved => true)`);
    assert.deepEqual(saved.map((p) => p.id).sort(), [POST(2), POST(5)]);
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

describe('feed ve arama', () => {
  test('yakınımda: yarıçap genişler ve uzaklık döner', async () => {
    const me = await signUp({ name: 'Gezgin' });
    const feed = (await one(me, 'select feed_popular($1, $2) as f', [KADIKOY.lat, KADIKOY.lng])).f;
    assert.ok([3, 10, 30].includes(feed.radius_km));
    assert.ok(feed.entries.length > 0);
    for (const e of feed.entries) assert.ok(e.distance_km <= feed.radius_km);
    assert.equal(feed.fallback_city, null);
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
