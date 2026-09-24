-- Mekân aramasında popülerlik: boş aramada (konum yoksa) en çok puanlanan ve paylaşılan mekânlar önce;
-- metin aramalarında da eşitlik bozucu. Popülerlik = sıralama sayısı + gönderi sayısı.

create or replace function public.search_places(
  p_query text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
)
returns setof public.place_view
language sql
stable
set search_path = ''
as $$
  with q as (
    select
      public.tr_fold(btrim(coalesce(p_query, ''))) as text,
      case
        when p_latitude is not null and p_longitude is not null
        then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
      end as origin
  ),
  hits as (
    select
      pl.id,
      case when q.text = '' then 0 else extensions.word_similarity(q.text, pl.search_text) end as similarity,
      (q.text <> '' and public.tr_fold(pl.name) like q.text || '%') as prefix,
      case when q.origin is not null then pl.location operator(extensions.<->) q.origin end as distance,
      (
        (select count(*) from public.rankings r where r.place_id = pl.id)
        + (select count(*) from public.posts p where p.place_id = pl.id)
      ) as popularity
    from public.places pl, q
    where q.text = ''
       or pl.search_text like '%' || q.text || '%'
       or q.text operator(extensions.<%) pl.search_text
    order by prefix desc, similarity desc, distance asc nulls last, popularity desc, pl.name
    limit least(greatest(p_limit, 1), 50)
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.prefix desc, hits.similarity desc, hits.distance asc nulls last, hits.popularity desc, v.name
$$;
