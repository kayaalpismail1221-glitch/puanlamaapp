-- Segmentler bölünür (kullanıcı kararı 2026-10-01): karşılaştırma yalnızca birbirine benzeyen yerler arasında.
-- restoran · kebapçı · sokak lezzeti · pizza ve burger · kahvaltı · börekçi ve fırın · kafe · tatlıcı ve pastane ·
-- meyhane ve bar. Kebapçı restorandan; pizzacı, burgerci ve büfe sokak lezzetinden; tatlıcı, dondurmacı ve pastane
-- kafeden ayrılır; yeni "Börekçi" kategorisi (börek, simit, poğaça) pastaneden ayrılır.
--
-- Her yeni liste tek bir eski listeden gelir (hiçbir eski liste iki yeni listeye karışmaz); kullanıcının sıralaması
-- aynen korunur, uydurma karşılaştırma oluşmaz. Eşitlik yalnızca eski listede aynı seviyedeki komşuyla kalır.
-- Uygulamadaki `constants/segments.ts` ve içe aktarım kuralları (`scripts/places/lib.mjs`) ile aynı.

-- ---------------------------------------------------------------------------
-- Kategori → segment
-- ---------------------------------------------------------------------------

insert into public.cuisines (name, position, segment)
select 'Börekçi', max(position) + 1, 'bakery' from public.cuisines
on conflict (name) do nothing;

update public.cuisines c
set segment = m.segment::public.place_segment
from (
  values
    ('Kebapçı', 'kebab'),
    ('Pizzacı', 'fastfood'),
    ('Burgerci', 'fastfood'),
    ('Büfe & fast food', 'fastfood'),
    ('Tatlıcı', 'dessert'),
    ('Dondurmacı', 'dessert'),
    ('Pastane & fırın', 'dessert'),
    ('Börekçi', 'bakery')
) as m (name, segment)
where c.name = m.name and c.segment is distinct from m.segment::public.place_segment;

-- ---------------------------------------------------------------------------
-- Sıralamaları yeni segmentlere taşıma
-- ---------------------------------------------------------------------------

/**
 * Sıralamaların segmentini mekânın kategorisinden yeniden hesaplar (segment eşlemesi değişince; kullanıcı
 * verilmezse herkes). Yeni liste eski listenin sırasını korur; birden çok eski listeden gelen kayıtlar kişisel
 * puana göre harmanlanır (aynı puanda eski liste ve sıra). Eşitlik yalnızca aynı eski listede aynı seviyedeki
 * komşuyla kalır. Puanlar sonra `normalize_rankings` ile. Değişen satır sayısını döner.
 */
create or replace function public.resegment_rankings(p_user_id uuid default null)
returns integer
language sql
security definer
set search_path = ''
as $$
  with cur as (
    select r.user_id, r.place_id, r.sentiment, r.segment as old_segment, r.position as old_position, r.score, r.tied,
      c.segment as new_segment,
      sum(case when r.tied and r.position > 0 then 0 else 1 end)
        over (partition by r.user_id, r.segment, r.sentiment order by r.position) as old_tier
    from public.rankings r
    join public.places pl on pl.id = r.place_id
    join public.cuisines c on c.name = pl.cuisine
    where p_user_id is null or r.user_id = p_user_id
  ),
  ordered as (
    select cur.*,
      (row_number() over w - 1)::int as new_position,
      coalesce(
        cur.tied and (lag(cur.old_segment) over w) = cur.old_segment and (lag(cur.old_tier) over w) = cur.old_tier,
        false
      ) as new_tied
    from cur
    window w as (partition by cur.user_id, cur.new_segment, cur.sentiment order by cur.score desc, cur.old_segment, cur.old_position)
  ),
  changed as (
    update public.rankings r
    set segment = o.new_segment, position = o.new_position, tied = o.new_tied
    from ordered o
    where r.user_id = o.user_id and r.place_id = o.place_id
      and (r.segment, r.position, r.tied) is distinct from (o.new_segment, o.new_position, o.new_tied)
    returning 1
  )
  select count(*)::int from changed
$$;

revoke execute on function public.resegment_rankings(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Mevcut veri
-- ---------------------------------------------------------------------------

-- Adında börek/simit/poğaça geçen pastaneler Börekçi; adında pastane de geçiyorsa ya da kategori elle düzeltilip
-- kilitlendiyse dokunulmaz (emin olunmayan veri değiştirilmez). Mekânı listenin sonuna taşıyan kategori tetikleyicisi
-- bu sırada kapalı: sıralamalar aşağıda sırası korunarak toplu taşınır.
alter table public.places disable trigger places_cuisine_segment;

update public.places
set cuisine = 'Börekçi'
where cuisine = 'Pastane & fırın'
  and public.tr_fold(name) ~ '(borek|simit|poaca|pogaca)'
  and public.tr_fold(name) !~ '(pastane|patisser|patiser|pasta ?evi|kurabiye)'
  and not ('cuisine' = any (locked_fields));

alter table public.places enable trigger places_cuisine_segment;

select public.resegment_rankings();
select public.normalize_rankings();
select public.refresh_community_priors();
