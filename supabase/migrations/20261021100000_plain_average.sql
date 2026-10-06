-- Expeat puanı şimdilik düz ortalama (kullanıcı kararı 2026-10-06: "insanların puanının ortalaması olsun").
--
-- Mekânın Expeat puanı, onu puanlayan herkesin kendi listesinde gördüğü puanın (`rankings.score`) ortalaması.
-- Kalibre katkı, puanlayan ağırlığı, tazelik, türün başlangıç değeri ve karşılaştırma modeli puana girmez.
-- Mekân sayfası, harita, bölgenin en iyileri ve öneriler topluluk puanını yalnızca `puanla_score` üzerinden
-- okuduğu için değişiklik tek yerde; fonksiyonun imzası aynı kalır (çağıranların topladığı ağırlıklı toplamlar
-- yalnızca "görünen puan var mı" için kullanılır).
--
-- Model tabloları, `refresh_place_strengths` ve kalibre puanlar yerinde duruyor, hesaplanmaya devam ediyor.
-- Geri dönüş: `puanla_score`'u 20261017100000_place_model'deki gövdeye döndürmek yeterli.

create or replace function public.puanla_score(
  p_place_id uuid,
  p_total numeric,
  p_weight numeric,
  p_new_total numeric,
  p_new_weight numeric
)
returns double precision
language sql
stable
parallel safe
set search_path = ''
as $$
  select case
    when coalesce(p_weight, 0) > 0 then
      (select avg(r.score)::double precision from public.rankings r where r.place_id = p_place_id)
  end
$$;
