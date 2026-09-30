-- Kişisel puan ölçeği: segmentteki favorin her zaman 10,0 (kullanıcı kararı 2026-09-30).
--
-- Önceki ölçek kısa listelerde puanları aralığın ortasına sıkıştırıyordu: ilk "Beğendim" 10 değil 8,4 çıkıyordu.
-- Kullanıcı sevdiği yeri 8,4 görünce "ne alaka" deyip paylaşmıyordu. Artık grubun en iyisi üst sınırda
-- (Beğendim 10,0 · İdare eder 6,6 · Beğenmedim 3,3), her basamak (üst − alt) / max(n − 1, 4) aşağıda:
-- Beğendim 10,0 · 9,2 · 8,3 · 7,5 · 6,7 … Az mekânla alt sınıra yine inilmez (iki mekândan ikincisi 9,2).
-- Uygulamadaki `scoreAt` (src/lib/ranking.ts) ile birebir aynı.
--
-- Topluluk puanını bu değişiklik şişirmez: az puanlayan hesapların ağırlığı düşük
-- (20261013100000_trusted_community_score).

create or replace function public.sentiment_score(s public.sentiment, pos integer, cnt integer)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select (hi - (2 * p * (hi - lo) + gap) / (2 * gap)) / 10.0
  from (
    select
      case s when 'liked' then 100 when 'fine' then 66 else 33 end as hi,
      case s when 'liked' then 67 when 'fine' then 34 else 0 end as lo,
      greatest(cnt - 1, 4) as gap,
      least(greatest(pos, 0), greatest(cnt - 1, 0)) as p
  ) base
$$;

-- Tüm puanlar yeni ölçekle (sıra korunur)
select public.normalize_rankings();

-- Gönderilerdeki puan paylaşım anının kopyası; ölçek değiştiği için bir kez güncel puana eşitlenir
-- (fikir değil ölçek değişti: eski gönderiler 8,4 gibi düşük görünmesin)
update public.posts p
set score = r.score
from public.rankings r
where r.user_id = p.user_id and r.place_id = p.place_id and p.score is distinct from r.score;
