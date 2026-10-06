-- Arama: adında geçen önce, sonra yakın (20261019120000_place_trust'taki tanım; yalnızca uzun aramanın sırası değişti).
--
-- "Yakındakiler önce" kuralı, adı değil yalnızca adresi/semti eşleşen yakın mekânı adı tam eşleşen uzak mekânın önüne
-- koyuyordu: Ankara'dan "çiya" → önce adresinde "çiya" geçen Ankara kafeleri, sonra İstanbul'daki Çiya Sofrası.
-- Yeni sıra: adında geçen (içerir ya da kelime benzerliği eşikte) → yakın (50 km) → ad başı → benzerlik (0,1 dilim) →
-- güven → benzerlik → uzaklık → popülerlik. "kore" Eskişehir'den: adında "kore" geçen Eskişehir mekânı İstanbul'daki
-- "Kore Sofrası"nın önünde kalır (ikisi de adında geçiyor, yakın önce).

create or replace function public.search_places(
  p_query text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_limit integer default 30
)
returns setof public.place_view
language plpgsql
stable
set search_path = ''
as $$
declare
  q text := public.tr_fold(btrim(coalesce(p_query, '')));
  pattern text := '%' || public.like_escape(q) || '%';
  prefix_pattern text := public.like_escape(q) || '%';
  lim integer := least(greatest(p_limit, 1), 50);
  origin extensions.geography := case
    when p_latitude is not null and p_longitude is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  end;
  -- "Yakın": aynı şehir ölçeği (İstanbul'un bir ucundan öbürüne). Uzaktaki daha benzer ad bunların ardından gelir.
  near_meters constant double precision := 50000;
begin
  if q = '' then
    if origin is not null then
      return query
      select v.*
      from (
        select pl.id, pl.location operator(extensions.<->) origin as distance
        from public.places pl
        -- "Yakınımdakiler": kanıtı zayıf, kullanılmamış kayıt listelenmez (adıyla aranınca bulunur)
        where pl.closed_at is null and (not pl.weak or pl.rating_count + pl.post_count > 0)
        order by pl.location operator(extensions.<->) origin
        limit lim
      ) near
      join public.place_view v on v.id = near.id
      order by near.distance;
    else
      return query
      select v.*
      from (
        select pl.id, pl.rating_count + pl.post_count as popularity, pl.name
        from public.places pl
        where pl.closed_at is null
        order by pl.rating_count + pl.post_count desc, pl.name
        limit lim
      ) popular
      join public.place_view v on v.id = popular.id
      order by popular.popularity desc, popular.name;
    end if;
    return;
  end if;

  -- Kısa ve uzun arama ayrı sorgu: her biri kendi indeksini kullanabilsin (kısa arama zaten yalnızca ad başında)
  if char_length(q) < 3 then
    return query
    with hits as (
      select
        pl.id,
        pl.name,
        pl.rating_count + pl.post_count as popularity,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
        origin is null or pl.location operator(extensions.<->) origin < near_meters as near,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust
      from public.places pl
      where pl.closed_at is null and public.tr_fold(pl.name) like prefix_pattern
      order by near desc, trust desc, popularity desc, distance asc nulls last, pl.name
      limit lim
    )
    select v.*
    from hits
    join public.place_view v on v.id = hits.id
    order by hits.near desc, hits.trust desc, hits.popularity desc, hits.distance asc nulls last, hits.name;
    return;
  end if;

  return query
  with hits as (
    select
      pl.id,
      pl.name,
      -- Aranan, mekânın adında geçiyor (adres/semt eşleşmesi değil)
      public.tr_fold(pl.name) like pattern or q operator(extensions.<%) public.tr_fold(pl.name) as in_name,
      extensions.word_similarity(q, pl.search_text) as similarity,
      -- Benzerlik 0,1'lik dilimlerde: neredeyse aynı benzerlikte güvenilir mekân öne, zayıf kayıt arkaya geçebilsin
      round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as similarity_band,
      public.tr_fold(pl.name) like prefix_pattern as prefix,
      case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
      origin is null or pl.location operator(extensions.<->) origin < near_meters as near,
      public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
      pl.rating_count + pl.post_count as popularity
    from public.places pl
    where pl.closed_at is null
      and (pl.search_text like pattern or q operator(extensions.<%) pl.search_text)
    order by in_name desc, near desc, prefix desc, similarity_band desc, trust desc, similarity desc,
      distance asc nulls last, popularity desc, pl.name
    limit lim
  )
  select v.*
  from hits
  join public.place_view v on v.id = hits.id
  order by hits.in_name desc, hits.near desc, hits.prefix desc, hits.similarity_band desc, hits.trust desc,
    hits.similarity desc, hits.distance asc nulls last, hits.popularity desc, hits.name;
end;
$$;
