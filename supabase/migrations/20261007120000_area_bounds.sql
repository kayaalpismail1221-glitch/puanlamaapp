-- Haritada semt/ilçe/şehre gitmek için bölgenin sınırları: açık mekânlarının kapladığı alan.
-- Yanlış konumlu tek tük mekân alanı şişirmesin diye uçlardan %2 atılır (yüzdelik; az mekânda hepsi kalır); mekânı olmayan bölge boş döner.

create or replace function public.area_bounds(p_city text, p_district text default null, p_neighborhood text default null)
returns table (south double precision, west double precision, north double precision, east double precision)
language sql
stable
set search_path = ''
as $$
  select
    percentile_disc(0.02) within group (order by pl.latitude),
    percentile_disc(0.02) within group (order by pl.longitude),
    percentile_disc(0.98) within group (order by pl.latitude),
    percentile_disc(0.98) within group (order by pl.longitude)
  from public.places pl
  where pl.closed_at is null
    and pl.city = p_city
    and (p_district is null or pl.district = p_district)
    and (p_neighborhood is null or pl.neighborhood = p_neighborhood)
  having count(*) > 0
$$;

revoke execute on function public.area_bounds(text, text, text) from public, anon;
grant execute on function public.area_bounds(text, text, text) to authenticated;
