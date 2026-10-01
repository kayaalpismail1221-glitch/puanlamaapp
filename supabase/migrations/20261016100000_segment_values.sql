-- Yeni segment değerleri (kullanıcı kararı 2026-10-01: "börekçi kafe ve tatlıcıyla, pizzacı kokoreççiyle aynı
-- listede olmasın"). Postgres yeni enum değerinin aynı işlemde kullanılmasına izin vermez; eşleme ve taşıma bir
-- sonraki migration'da (20261016110000_segment_split). Canlıda bu dosya ayrı çalıştırılır.

alter type public.place_segment add value if not exists 'kebab' after 'restaurant';
alter type public.place_segment add value if not exists 'fastfood' after 'street';
alter type public.place_segment add value if not exists 'bakery' after 'breakfast';
alter type public.place_segment add value if not exists 'dessert' after 'cafe';
