-- Segmentler benzer ailelere bölünür (kullanıcı kararı 2026-10-08): karşılaştırma yalnızca gerçekten aynı deneyimi
-- sunan yerler arasında. Sokak lezzeti → döner ve dürüm · kokoreç ve ciğer · köfteci · çiğ köfteci · pideci;
-- pizza ve burger → pizzacı · burgerci · büfe ve fast food; meyhane ve bar → meyhane · bar. Restoran (esnaf lokantası,
-- balıkçı, Uzak Doğu, dünya mutfağı), kebapçı, kahvaltıcı, börekçi, kafe, tatlıcı ve pastane (+ dondurmacı) aynen kalır.
--
-- Her yeni liste tek bir eski listeden gelir (hiçbir eski liste iki yeni listeye karışmaz): kullanıcının sıralaması
-- aynen korunur, sorulmamış bir karşılaştırma uydurulmaz. Eşitlik yalnızca eski listede aynı seviyedeki komşuyla kalır
-- (`resegment_rankings`, 20261016110000_segment_split). Uygulamadaki `constants/segments.ts` ile aynı.

update public.cuisines c
set segment = m.segment::public.place_segment
from (
  values
    ('Dürümcü', 'doner'),
    ('Dönerci', 'doner'),
    ('Kokoreççi', 'offal'),
    ('Ciğerci', 'offal'),
    ('Köfteci', 'meatball'),
    ('Çiğ köfteci', 'cigkofte'),
    ('Pideci', 'pide'),
    ('Pizzacı', 'pizza'),
    ('Burgerci', 'burger'),
    ('Meyhane', 'meyhane'),
    ('Bar', 'bar')
) as m (name, segment)
where c.name = m.name and c.segment is distinct from m.segment::public.place_segment;

select public.resegment_rankings();
select public.normalize_rankings();
select public.refresh_community_priors();
