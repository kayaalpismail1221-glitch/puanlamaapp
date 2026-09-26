-- Keşfet'te semt/ilçe araması ve bölgenin en yüksek puanlı mekânları.
--
-- 1) `search_areas`: yazdıkça eşleşen şehir, ilçe ve mahalleler (açık mekân sayısıyla). Tam eşleşme ve baştan
--    eşleşme önce; aynı adlılarda şehir > ilçe > mahalle, sonra büyük olan.
-- 2) `area_top_places`: bir bölgenin mekânları, topluluk puanına (`community_score`) göre; puanlananlar önce,
--    sonra gönderisi olanlar. Segmentle (restoran, sokak lezzeti…) süzülebilir, sayfalıdır. Kapanan mekân yok.

create or replace function public.search_areas(p_query text, p_limit integer default 5)
returns table (kind text, name text, district text, city text, place_count integer)
language sql
stable
set search_path = ''
as $$
  with q as (select public.tr_fold(btrim(coalesce(p_query, ''))) as text),
  open_places as (
    select pl.city, pl.district, pl.neighborhood from public.places pl where pl.closed_at is null
  ),
  areas as (
    select 'city'::text as kind, o.city as name, null::text as district, o.city, count(*)::int as place_count
    from open_places o
    group by o.city
    union all
    select 'district', o.district, o.district, o.city, count(*)::int
    from open_places o
    where o.district <> ''
    group by o.city, o.district
    union all
    -- İlçeyle aynı adlı mahalle (Kadıköy Mahallesi) ilçenin tekrarı olmasın
    select 'neighborhood', o.neighborhood, o.district, o.city, count(*)::int
    from open_places o
    where o.neighborhood <> '' and public.tr_fold(o.neighborhood) <> public.tr_fold(o.district)
    group by o.city, o.district, o.neighborhood
  ),
  matched as (
    select a.*, public.tr_fold(a.name) as folded, q.text
    from areas a, q
    where char_length(q.text) >= 2
      and (public.tr_fold(a.name) like q.text || '%' or public.tr_fold(a.name) like '% ' || q.text || '%')
  )
  select m.kind, m.name, m.district, m.city, m.place_count
  from matched m
  order by
    (m.folded = m.text) desc,
    (m.folded like m.text || '%') desc,
    case m.kind when 'city' then 0 when 'district' then 1 else 2 end,
    m.place_count desc,
    m.name
  limit least(greatest(p_limit, 1), 20)
$$;

create or replace function public.area_top_places(
  p_city text,
  p_district text default null,
  p_neighborhood text default null,
  p_segment public.place_segment default null,
  p_limit integer default 30,
  p_offset integer default 0
)
returns table (
  id uuid,
  name text,
  cuisine text,
  neighborhood text,
  district text,
  city text,
  price_level smallint,
  latitude double precision,
  longitude double precision,
  photo text,
  average double precision,
  rating_count integer
)
language sql
stable
set search_path = ''
as $$
  with area as (
    select pl.id, pl.name
    from public.places pl
    join public.cuisines c on c.name = pl.cuisine
    where pl.closed_at is null
      and pl.city = p_city
      and (p_district is null or pl.district = p_district)
      and (p_neighborhood is null or pl.neighborhood = p_neighborhood)
      and (p_segment is null or c.segment = p_segment)
  ),
  rated as (
    select r.place_id, public.community_score(sum(r.score), count(*)) as average, count(*)::int as n
    from public.rankings r
    join area on area.id = r.place_id
    group by r.place_id
  ),
  posted as (
    select p.place_id, count(*)::int as n
    from public.posts p
    join area on area.id = p.place_id
    group by p.place_id
  ),
  -- Sıra önce ucuz sütunlarla belirlenir; görünüm (kapak fotoğrafı) yalnızca bu sayfadakiler için çekilir
  ranked as (
    select area.id, rated.average, coalesce(rated.n, 0) as rating_count, coalesce(posted.n, 0) as post_count, area.name
    from area
    left join rated on rated.place_id = area.id
    left join posted on posted.place_id = area.id
    order by rated.average desc nulls last, rating_count desc, post_count desc, area.name
    offset greatest(p_offset, 0)
    limit least(greatest(p_limit, 1), 50)
  )
  select v.id, v.name, v.cuisine, v.neighborhood, v.district, v.city, v.price_level, v.latitude, v.longitude,
    v.photo, ranked.average, ranked.rating_count
  from ranked
  join public.place_view v on v.id = ranked.id
  order by ranked.average desc nulls last, ranked.rating_count desc, ranked.post_count desc, ranked.name
$$;

revoke execute on function
  public.search_areas(text, integer),
  public.area_top_places(text, text, text, public.place_segment, integer, integer)
from public, anon;
grant execute on function
  public.search_areas(text, integer),
  public.area_top_places(text, text, text, public.place_segment, integer, integer)
to authenticated;
