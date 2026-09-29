/**
 * Popüler feed: o bölgede en çok ilgi gören gönderiler önce (kullanıcı kararı 2026-09-29).
 *
 * Önceki sıcaklıkta (20261010100000_scale) etkileşimin üç katı yalnızca bir gün yeniliğe denkti; 5 gün önce 100
 * beğeni alan gönderi bugünkü beğenisiz gönderinin gerisinde kalıyordu. Artık üç kat etkileşim iki haftaya denk:
 * birkaç günlük farkta popüler olan önde, feed yine de haftalar içinde tazelenir (1 ay önceki 100 beğenili
 * gönderiyi bugün 10 beğeni alan geçer). Yorum beğeninin iki katı sayılır. Formül zamandan bağımsız kaldığı için
 * sütunda saklanır ve indekslenir; `feed_popular` değişmez (bölge 3 → 10 → 30 km, yoksa en yakın şehir).
 *
 * Saklanan üretilen sütun fonksiyon değişince yeniden hesaplanmaz: sütun ve indeksi yeniden kurulur.
 */

drop index if exists public.posts_hot_idx;
alter table public.posts drop column hot;

create or replace function public.hot_rank(likes integer, comments integer, created_at timestamptz)
returns double precision
language sql
immutable
parallel safe
set search_path = ''
as $$
  select ln(1 + greatest(likes, 0) + 2 * greatest(comments, 0))
    + extract(epoch from created_at)::double precision * ln(3) / (14 * 86400)
$$;

alter table public.posts add column hot double precision
  generated always as (public.hot_rank(like_count, comment_count, created_at)) stored;

create index posts_hot_idx on public.posts (hot desc);

analyze public.posts;
