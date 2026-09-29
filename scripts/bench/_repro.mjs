import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFileSync } from 'node:fs';
const cache = process.argv[2];
const db = await PGlite.create({ extensions: { postgis, pg_trgm }, loadDataDir: new Blob([readFileSync(cache)]) });
const me = (await db.query(`select f.follower_id as id from follows f
  where exists (select 1 from posts p where p.user_id = f.follower_id)
    and exists (select 1 from post_likes l where l.user_id = f.follower_id)
  group by f.follower_id order by count(*) desc limit 1`)).rows[0].id;
const place = (await db.query(`select place_id as id from posts group by place_id order by count(*) desc limit 1`)).rows[0].id;
console.log('me', me, 'place', place);
const seg = (await db.query(`select public.place_segment_of($1) s`, [place])).rows[0].s;
console.log('segment', seg);
console.log((await db.query(`select place_id, sentiment, segment, position from rankings where user_id=$1 and segment=$2 order by sentiment, position`, [me, seg])).rows);
console.log('already ranked?', (await db.query(`select sentiment, segment, position from rankings where user_id=$1 and place_id=$2`, [me, place])).rows);
console.log((await db.query(`select con.condeferrable, con.condeferred, pg_get_constraintdef(con.oid) d from pg_constraint con where conname='rankings_position_unique'`)).rows);
