-- Yeni segment değerleri (kullanıcı kararı 2026-10-08: "kafe restoranla olmasın, benzer aileler olsun, abuksubutluk
-- asla olmasın; burgerci burgerciyle"). Postgres yeni enum değerinin aynı işlemde kullanılmasına izin vermez; eşleme
-- ve taşıma bir sonraki migration'da (20261022110000_segment_families). Canlıda bu dosya ayrı çalıştırılır.
-- 'street' ve 'nightlife' artık kullanılmaz (enum değeri silinemez; hiçbir kategori onlara eşlenmez).

alter type public.place_segment add value if not exists 'doner' after 'kebab';
alter type public.place_segment add value if not exists 'offal' after 'doner';
alter type public.place_segment add value if not exists 'meatball' after 'offal';
alter type public.place_segment add value if not exists 'cigkofte' after 'meatball';
alter type public.place_segment add value if not exists 'pide' after 'cigkofte';
alter type public.place_segment add value if not exists 'pizza' after 'pide';
alter type public.place_segment add value if not exists 'burger' after 'pizza';
alter type public.place_segment add value if not exists 'meyhane' after 'dessert';
alter type public.place_segment add value if not exists 'bar' after 'meyhane';
