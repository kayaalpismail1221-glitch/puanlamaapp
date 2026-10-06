/**
 * Veritabanı yük ölçümü: migration'lar PGlite'a (WASM Postgres + PostGIS) yüklenir, büyük sentetik veri üretilir
 * (varsayılan 20 bin kullanıcı · 12 bin mekân · 60 bin gönderi · 200 bin puan · 400 bin beğeni · 500 bin bildirim),
 * sonra uygulamanın sık çağırdığı her okuma/yazma gerçek kullanıcı rolüyle (RLS açık) ölçülür.
 *
 * Amaç: bir sorgu tüm tabloyu tarıyorsa veri büyüdükçe süresi artar; burada erken görünür.
 * PGlite tek çekirdekli WASM'dir, gerçek Postgres'ten birkaç kat yavaştır: mutlak değer değil, büyüme önemli.
 * Yeni bir RPC eklenince aşağıdaki listeye de eklenmeli.
 *
 * Çalıştırma: npm run bench:db
 *   BENCH_SCALE=2      veriyi iki katına çıkarır (mekân sayısı sabit)
 *   BENCH_CACHE=dosya  üretilen veritabanını saklar/yeniden kullanır (~45 sn kazandırır; migration değişince silin)
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { Buffer } from 'node:buffer';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase');
const read = (path) => readFileSync(join(root, path), 'utf8');
const scale = Number(process.env.BENCH_SCALE ?? 1);
const cache = process.env.BENCH_CACHE;

const USERS = 20000 * scale;
const PLACES = 12000;
const RANKINGS = 200000 * scale;
const POSTS = 60000 * scale;
const LIKES = 400000 * scale;
const FOLLOWS = 300000 * scale;
const COMMENTS = 60000 * scale;
const NOTIFICATIONS = 500000 * scale;

const extensions = { postgis, pg_trgm };
const cached = cache && existsSync(cache);
const db = cached
  ? await PGlite.create({ extensions, loadDataDir: new Blob([readFileSync(cache)]) })
  : await PGlite.create({ extensions });

if (!cached) {
  const started = performance.now();
  await db.exec(read('tests/supabase-shim.sql'));
  for (const file of readdirSync(join(root, 'migrations')).sort()) await db.exec(read(join('migrations', file)));
  await db.exec(read('seed.sql'));

  // Tetikleyiciler kapalı üretilir (hız için); sayaçlar sonda topluca hesaplanır
  const steps = [
    `set session_replication_role = replica`,
    `insert into auth.users (id, email)
       select ('d0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'u' || g || '@bench.dev'
       from generate_series(1, ${USERS}) g`,
    `insert into profiles (id, username, name, school_id)
       select ('d0000000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'user' || g, 'Kişi ' || g,
         case when g % 5 = 0 then 'okul' || (g % 40) end
       from generate_series(1, ${USERS}) g`,
    `insert into profile_private (user_id) select id from profiles where username like 'user%'`,
    // İstanbul'da yoğun, Ankara'da seyrek mekânlar
    `insert into places (name, cuisine, neighborhood, district, city, latitude, longitude, source, external_id)
       select 'Mekan ' || g, (select name from cuisines order by position offset (g % 23) limit 1), 'Mah' || (g % 300),
         'Ilce' || (g % 39), case when g % 10 = 0 then 'Ankara' else 'İstanbul' end,
         case when g % 10 = 0 then 39.9 + random() * 0.1 else 40.95 + random() * 0.17 end,
         case when g % 10 = 0 then 32.8 + random() * 0.1 else 28.85 + random() * 0.33 end,
         'osm', 'bench/' || g
       from generate_series(1, ${PLACES}) g`,
    `create temp table u as select id, row_number() over () as n from profiles`,
    `create temp table pl as select id, row_number() over () as n from places`,
    `create index on u (n)`,
    `create index on pl (n)`,
    // Tetikleyiciler kapalı: segment mekânın mutfağından, sıra her (kullanıcı, segment) listesinde 0, 1, 2…
    `insert into rankings (user_id, place_id, sentiment, position, score, segment)
       select x.user_id, x.place_id, 'liked',
         row_number() over (partition by x.user_id, x.segment order by x.place_id) - 1, x.score, x.segment
       from (
         select distinct on (u.id, pl.id) u.id as user_id, pl.id as place_id,
           round((random() * 10)::numeric, 1) as score, c.segment
         from (select 1 + (g % ${USERS}) a, 1 + floor(random() * ${PLACES})::int b from generate_series(1, ${RANKINGS}) g) s
         join u on u.n = s.a join pl on pl.n = s.b
         join places p on p.id = pl.id join cuisines c on c.name = p.cuisine
       ) x`,
    // Tetikleyiciler kapalıyken ertelenebilir benzersizlik denetlenmez (random() alt sorgusu birkaç çift sıra
    // üretebiliyor): sıralar her listede yeniden numaralanır, yoksa rank_place ölçümü çakışmaya düşer
    `update rankings r set position = n.position
       from (select user_id, place_id,
               (row_number() over (partition by user_id, segment, sentiment order by position, place_id) - 1)::int as position
             from rankings) n
       where r.user_id = n.user_id and r.place_id = n.place_id and r.position <> n.position`,
    `insert into posts (user_id, place_id, caption, score, like_count, comment_count, created_at)
       select r.user_id, r.place_id, 'harika', r.score, floor(random() * 30), floor(random() * 5),
         now() - random() * interval '180 days'
       from (select * from rankings order by random() limit ${POSTS}) r`,
    `insert into post_photos (post_id, position, path)
       select id, 0, user_id || '/' || id || '/0.jpg' from posts on conflict do nothing`,
    `create temp table po as select id, row_number() over () as n from posts`,
    `create index on po (n)`,
    // Takipte birkaç popüler hesap çok takipçi alır
    `insert into follows (follower_id, followee_id)
       select distinct x.id, y.id
       from (select 1 + floor(random() * ${USERS})::int a, 1 + floor(power(random(), 3) * ${USERS})::int b
             from generate_series(1, ${FOLLOWS})) s
       join u x on x.n = s.a join u y on y.n = s.b
       where x.id <> y.id
       on conflict do nothing`,
    `insert into post_likes (post_id, user_id)
       select distinct po.id, u.id
       from (select 1 + floor(random() * ${POSTS})::int a, 1 + floor(random() * ${USERS})::int b
             from generate_series(1, ${LIKES})) s
       join po on po.n = s.a join u on u.n = s.b
       on conflict do nothing`,
    `insert into comments (post_id, user_id, body)
       select po.id, u.id, 'güzel'
       from (select 1 + floor(random() * ${POSTS})::int a, 1 + floor(random() * ${USERS})::int b
             from generate_series(1, ${COMMENTS})) s
       join po on po.n = s.a join u on u.n = s.b`,
    `insert into notifications (user_id, actor_id, type, post_id, created_at, read_at)
       select p.user_id, l.user_id, 'like', l.post_id, now() - random() * interval '90 days',
         case when random() < 0.9 then now() end
       from post_likes l join posts p on p.id = l.post_id
       where p.user_id <> l.user_id
       limit ${NOTIFICATIONS}`,
    `update profiles p set
       follower_count = (select count(*) from follows where followee_id = p.id),
       following_count = (select count(*) from follows where follower_id = p.id),
       post_count = (select count(*) from posts where user_id = p.id),
       like_total = coalesce((select sum(like_count) from posts where user_id = p.id), 0)`,
    `update places pl set
       rating_count = (select count(*) from rankings where place_id = pl.id),
       post_count = (select count(*) from posts where place_id = pl.id)`,
    `set session_replication_role = origin`,
    // Tetikleyiciler kapalıyken XP sayaçları dolmadı: migration'daki gibi baştan hesaplanır
    `truncate xp_all, xp_monthly`,
    `insert into xp_all (user_id, ratings, posts, photo_posts, likes, invites, welcome)
       select user_id, ratings, posts, photo_posts, likes, invites, welcome from xp_totals(null)`,
    `insert into xp_monthly (month, user_id, ratings, posts, photo_posts, likes, invites, welcome)
       select xp_month_of(now()), user_id, ratings, posts, photo_posts, likes, invites, welcome
       from xp_totals(month_start())`,
    `analyze`,
  ];
  for (const step of steps) await db.exec(step);
  console.log(`Veri üretildi: ${Math.round((performance.now() - started) / 1000)} sn`);
  if (cache) writeFileSync(cache, Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer()));
}

const pick = async (sql) => (await db.query(sql)).rows[0].id;
// En çok takip eden (takip feed'i ve öneriler için en ağır durum), gönderisi ve beğenisi olan kullanıcı
const me = await pick(`
  select f.follower_id as id from follows f
  where exists (select 1 from posts p where p.user_id = f.follower_id)
    and exists (select 1 from post_likes l where l.user_id = f.follower_id)
  group by f.follower_id order by count(*) desc limit 1`);
const popular = await pick(`select followee_id as id from follows group by followee_id order by count(*) desc limit 1`);
const place = await pick(`select place_id as id from posts group by place_id order by count(*) desc limit 1`);
const post = await pick(`select id from posts order by like_count desc limit 1`);
const myPost = await pick(`select id from posts where user_id = '${me}' limit 1`);
const myLike = await pick(`select post_id as id from post_likes where user_id = '${me}' limit 1`);

/** Sorguyu kullanıcı olarak (RLS açık) çalıştırır, 3 denemenin ortancasını yazar; yazmalar geri alınır */
async function measure(label, sql, params = []) {
  const times = [];
  let count = 0;
  for (let i = 0; i < 3; i++) {
    const started = performance.now();
    await db
      .transaction(async (tx) => {
        await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: me })]);
        await tx.exec('set local role authenticated');
        count = (await tx.query(sql, params)).rows.length;
        await tx.rollback();
      })
      .catch((error) => {
        if (!/rollback/i.test(String(error?.message))) throw error;
      });
    times.push(performance.now() - started);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(34)} ${times[1].toFixed(1).padStart(8)} ms  (${count} satır)`);
}

const KADIKOY = [40.99, 29.027];
await measure('feed_popular (konum)', `select feed_popular($1, $2)`, KADIKOY);
await measure('feed_popular (konum, 6. sayfa)', `select feed_popular($1, $2, null, null, 100, 20)`, KADIKOY);
await measure('feed_popular (şehir)', `select feed_popular(null, null, 'İstanbul')`);
await measure('feed_popular (seyrek ilçe)', `select feed_popular(null, null, 'Ankara', 'Ilce0')`);
await measure('feed_popular (yakında yok)', `select feed_popular(38.4, 27.1)`);
await measure('feed_following', `select * from feed_following()`);
await measure('list_posts (kullanıcı)', `select * from list_posts($1)`, [popular]);
await measure('list_posts (mekân)', `select * from list_posts(null, $1)`, [place]);
await measure('place_details', `select place_details($1)`, [place]);
await measure('search_places (boş)', `select * from search_places('')`);
await measure('search_places (boş, konum)', `select * from search_places('', $1, $2)`, KADIKOY);
await measure('search_places ("kebap")', `select * from search_places('kebap', $1, $2)`, KADIKOY);
// İki kelime: yakındaki tür/şehir eşleşmesi (20261019180000_search_near_words) 50 km içinde tüm kelimelere bakar
await measure('search_places ("istanbul kebap")', `select * from search_places('istanbul kebap', $1, $2)`, KADIKOY);
await measure('search_users ("user12")', `select * from search_users('user12')`);
await measure('suggested_users', `select * from suggested_users(30)`);
await measure('leaderboard (genel)', `select * from leaderboard('all', 'all')`);
await measure('leaderboard (genel, bu ay)', `select * from leaderboard('all', 'month')`);
await measure('leaderboard (arkadaşlar, bu ay)', `select * from leaderboard('friends', 'month')`);
await measure('user_rank', `select user_rank($1)`, [popular]);
await measure('profile_view', `select * from profile_view where id = $1`, [popular]);
await measure('ranking_view (kullanıcı)', `select * from ranking_view where user_id = $1 order by score desc`, [popular]);
await measure('map_places (İstanbul)', `select * from map_places(40.9, 28.8, 41.2, 29.3)`);
await measure('map_places (semt)', `select * from map_places(40.98, 29.01, 41.0, 29.04)`);
await measure('recommended_places', `select * from recommended_places($1, $2)`, KADIKOY);
await measure('taste_match', `select taste_match($1)`, [popular]);
await measure('people_you_may_know', `select * from people_you_may_know(20)`);
await measure('year_challenge', `select * from year_challenge()`);
await measure('my_notifications', `select * from my_notifications()`);
await measure('unread_notification_count', `select unread_notification_count()`);
await measure('area_view', `select * from area_view`);
await measure('comment_view', `select * from comment_view where post_id = $1 order by created_at limit 500`, [post]);
await measure('followers_of', `select * from followers_of($1, 0, 100)`, [popular]);
await measure('yaz: beğen', `insert into post_likes (post_id) values ($1)`, [post]);
await measure('yaz: beğeniyi geri al', `delete from post_likes where post_id = $1`, [myLike]);
await measure('yaz: yorum', `insert into comments (post_id, body) values ($1, 'selam')`, [post]);
await measure('yaz: rank_place', `select rank_place($1, 'liked', 0)`, [place]);
await measure('yaz: gönderi sil', `delete from posts where id = $1`, [myPost]);
await db.close();
