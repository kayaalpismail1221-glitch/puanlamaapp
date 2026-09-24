-- Harita "Puanla" katmanı: görünen bölgedeki, Puanla kullanıcılarının puanladığı mekânlar
-- ve topluluk ortalaması. En çok puanlananlar önce gelir (sınırlı sayıda pin).

create or replace function public.map_places(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_limit integer default 200
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
  with rated as (
    select r.place_id, avg(r.score)::double precision as average, count(*)::int as rating_count
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    where pl.latitude between p_south and p_north
      and pl.longitude between p_west and p_east
    group by r.place_id
    order by count(*) desc, avg(r.score) desc
    limit least(greatest(p_limit, 1), 300)
  )
  select v.*, rated.average, rated.rating_count
  from rated
  join public.place_view v on v.id = rated.place_id
$$;

revoke execute on function public.map_places(double precision, double precision, double precision, double precision, integer)
  from public, anon;
grant execute on function public.map_places(double precision, double precision, double precision, double precision, integer)
  to authenticated;
