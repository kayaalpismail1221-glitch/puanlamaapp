-- Puanla: damak uyumu
-- Başkasının profilinde "%82 damak uyumu · 14 ortak mekân". İkinizin de puanladığı mekânlardaki
-- puan farkından hesaplanır. Sıralamalar zaten üyelere açık (Beli gibi); fonksiyon yalnızca
-- hesabı tek istekte yapar ve engelli çiftlerde hiçbir şey döndürmez.

/**
 * Uyum yüzdesi: her ortak mekân için 1 - |fark| / 5 (5 puan ve üstü fark = 0), yüzdeye çevrilmeden
 * önce 2 hayalî "yarı uyumlu" mekânla dengelenir. Böylece 1–2 ortak mekânla %100 çıkmaz;
 * ortak mekân arttıkça gerçek uyuma yaklaşır. 3 ortak mekândan azsa yüzde verilmez (null).
 */
create or replace function public.taste_match_percent(agreement_sum double precision, common integer)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when common >= 3 then round(100 * (agreement_sum + 1) / (common + 2))::int end
$$;

/**
 * Oturumdaki kullanıcıyla p_user_id arasındaki damak uyumu.
 * Dönen: { common, percent (null: yetersiz), places: [{ place, my_score, their_score }] }
 * `places` ortak mekânların tamamı (en fazla 200), ikinizin de en sevdiği önce.
 */
create or replace function public.taste_match(p_user_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with pairs as (
    select mine.place_id, mine.score::double precision as my_score, theirs.score::double precision as their_score
    from public.rankings mine
    join public.rankings theirs on theirs.place_id = mine.place_id and theirs.user_id = p_user_id
    where mine.user_id = auth.uid()
      and p_user_id <> auth.uid()
      and not public.is_blocked_between(auth.uid(), p_user_id)
  ),
  totals as (
    select count(*)::int as common, coalesce(sum(greatest(0, 1 - abs(my_score - their_score) / 5)), 0) as agreement
    from pairs
  )
  select case
    when auth.uid() is null or p_user_id = auth.uid() or public.is_blocked_between(auth.uid(), p_user_id) then null
    else jsonb_build_object(
      'common', t.common,
      'percent', public.taste_match_percent(t.agreement, t.common),
      'places', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object('place', to_jsonb(v), 'my_score', p.my_score, 'their_score', p.their_score)
            order by least(p.my_score, p.their_score) desc, p.my_score + p.their_score desc
          )
          from (select * from pairs order by least(my_score, their_score) desc limit 200) p
          join public.place_view v on v.id = p.place_id
        ),
        '[]'::jsonb
      )
    )
  end
  from totals t
$$;

revoke execute on function public.taste_match_percent(double precision, integer) from public, anon;
revoke execute on function public.taste_match(uuid) from public, anon;
grant execute on function public.taste_match_percent(double precision, integer) to authenticated;
grant execute on function public.taste_match(uuid) to authenticated;
