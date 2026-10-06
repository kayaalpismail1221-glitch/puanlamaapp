-- Arama: önce yakındakiler, adı birebir tutan uzak mekân da kaybolmaz (kullanıcı isteği 2026-10-03: Adana'dan
-- "adana kebap" aranınca Eskişehir/İstanbul'daki "Adana Kebap" adlı yerler Adana'daki kebapçıların önüne geçiyordu;
-- "önce yakındakiler, ama uydukça uzaktaki de gelsin, onu puanlamak istiyor olabilir").
--
-- Sıra (dilimler):
--   0 yakın (≤ 50 km) ve aranan metin adda birebir geçiyor
--   1 yakın ve aranan her kelime ad/tür/mahalle/ilçe/il içinde birebir geçiyor ("adana kebap" → Adana'daki
--     Kebapçı türündeki "Halil Usta"); benzerlik değil birebir kelime: Ankara'dan "çiya" aranınca "Viya Coffee"
--     öne geçmesin (20261019140000). Adres bu dilime girmez: adresi "Çiya Sk." olan yakın kafe, İstanbul'daki
--     Çiya Sofrası'nın önüne geçmesin (adres eşleşmesi 3. dilimde, yakın önce)
--   2 uzak ve aranan metin adda birebir geçiyor (İstanbul'daki Çiya Sofrası Ankara'dan aranınca)
--   3 geri kalan (adres eşleşmesi, yazım hatası/benzerlik): yakın önce
-- Dilim içinde eski sıra: ad başı, benzerlik dilimi, güven, benzerlik, uzaklık, popülerlik.
-- Konum yoksa her şey "yakın" sayılır, dilim 1 yok (önceki davranış: adda geçen, sonra benzerlik).
--
-- Hız: her dilim ayrı, indeksli ve en fazla `lim` satırla okunur; pahalı trigram benzerliği araması (dilim 3) yalnızca
-- ilk üç dilim listeyi dolduramazsa çalışır. Eskiden tüm adaylar (ör. "istanbul kebap"ta il adı yüzünden
-- İstanbul'daki on binlerce mekân) benzerlikle puanlanıp sıralanıyordu: canlıda ~3 sn.
--
-- Tanım 20261019140000_search_name_exact'teki son hâlden; boş ve kısa (< 3 harf) arama dalları aynen.

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
  -- Aranan kelimeler (en az 2 harf), her biri ayrı ayrı aranır
  word_patterns text[] := array(
    select '%' || public.like_escape(w) || '%'
    from regexp_split_to_table(public.tr_fold(btrim(coalesce(p_query, ''))), '\s+') w
    where char_length(w) >= 2
  );
  lim integer := least(greatest(p_limit, 1), 50);
  origin extensions.geography := case
    when p_latitude is not null and p_longitude is not null
    then extensions.st_setsrid(extensions.st_makepoint(p_longitude, p_latitude), 4326)::extensions.geography
  end;
  -- "Yakın": aynı şehir ölçeği (İstanbul'un bir ucundan öbürüne). Uzaktaki daha benzer ad bunların ardından gelir.
  near_meters constant double precision := 50000;
  picked uuid[];
  rest uuid[];
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

  -- Dilim 0–2: her biri indeksle daraltılır (birebir içerme: arama metninin trigram indeksi; yakın: konum indeksi)
  select coalesce(array_agg(t.id order by t.tier, t.prefix desc, t.band desc, t.trust desc, t.sim desc,
      t.distance asc nulls last, t.popularity desc, t.name), '{}')
  into picked
  from (
    (
      select pl.id, 0 as tier,
        public.tr_fold(pl.name) like prefix_pattern as prefix,
        round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as band,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
        extensions.word_similarity(q, pl.search_text) as sim,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
        pl.rating_count + pl.post_count as popularity,
        pl.name
      from public.places pl
      where pl.closed_at is null
        and pl.search_text like pattern
        and public.tr_fold(pl.name) like pattern
        and (origin is null or extensions.st_dwithin(pl.location, origin, near_meters))
      order by prefix desc, band desc, trust desc, sim desc, distance asc nulls last, popularity desc, pl.name
      limit lim
    )
    union all
    (
      select pl.id, 1 as tier,
        false as prefix,
        round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as band,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
        extensions.word_similarity(q, pl.search_text) as sim,
        pl.location operator(extensions.<->) origin as distance,
        pl.rating_count + pl.post_count as popularity,
        pl.name
      from public.places pl
      where origin is not null
        and cardinality(word_patterns) > 0
        and pl.closed_at is null
        and extensions.st_dwithin(pl.location, origin, near_meters)
        and pl.search_text like word_patterns[1]
        and pl.search_text like all (word_patterns)
        and not public.tr_fold(pl.name) like pattern
        and public.tr_fold(
          pl.name || ' ' || pl.cuisine || ' ' || coalesce(pl.neighborhood, '') || ' ' || coalesce(pl.district, '')
          || ' ' || coalesce(pl.city, '')
        ) like all (word_patterns)
      order by band desc, trust desc, sim desc, distance asc nulls last, popularity desc, pl.name
      limit lim
    )
    union all
    (
      select pl.id, 2 as tier,
        public.tr_fold(pl.name) like prefix_pattern as prefix,
        round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as band,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
        extensions.word_similarity(q, pl.search_text) as sim,
        pl.location operator(extensions.<->) origin as distance,
        pl.rating_count + pl.post_count as popularity,
        pl.name
      from public.places pl
      where origin is not null
        and pl.closed_at is null
        and pl.search_text like pattern
        and public.tr_fold(pl.name) like pattern
        and not extensions.st_dwithin(pl.location, origin, near_meters)
      order by prefix desc, band desc, trust desc, sim desc, distance asc nulls last, popularity desc, pl.name
      limit lim
    )
  ) t;
  picked := picked[1:lim];

  -- Dilim 3 (adres eşleşmesi, yazım hatası): yalnızca liste dolmadıysa; yakın önce
  if cardinality(picked) < lim then
    select coalesce(array_agg(s.id order by s.near desc, s.prefix desc, s.band desc, s.trust desc, s.sim desc,
        s.distance asc nulls last, s.popularity desc, s.name), '{}')
    into rest
    from (
      select pl.id,
        origin is null or pl.location operator(extensions.<->) origin < near_meters as near,
        public.tr_fold(pl.name) like prefix_pattern as prefix,
        round(extensions.word_similarity(q, pl.search_text)::numeric, 1) as band,
        public.place_trust(pl.rating_count + pl.post_count, pl.source, pl.weak) as trust,
        extensions.word_similarity(q, pl.search_text) as sim,
        case when origin is not null then pl.location operator(extensions.<->) origin end as distance,
        pl.rating_count + pl.post_count as popularity,
        pl.name
      from public.places pl
      where pl.closed_at is null
        and (pl.search_text like pattern or q operator(extensions.<%) pl.search_text)
        and pl.id <> all (picked)
      order by near desc, prefix desc, band desc, trust desc, sim desc, distance asc nulls last, popularity desc, pl.name
      limit lim - cardinality(picked)
    ) s;
    picked := picked || rest;
  end if;

  return query
  select v.*
  from unnest(picked) with ordinality as x (id, ord)
  join public.place_view v on v.id = x.id
  order by x.ord;
end;
$$;
