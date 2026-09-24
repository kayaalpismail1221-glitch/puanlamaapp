-- OpenStreetMap'ten toplu mekân içe aktarımı için hazırlık.
-- 1) Yeni kaynak türü: 'osm' (external_id = "node/123", "way/456"…)
-- 2) Şehirdeki gerçek mekân çeşitliliğini karşılayan ek kategoriler (mevcutların sırası değişmez)

alter table public.places drop constraint places_source_check;
alter table public.places add constraint places_source_check
  check (source in ('seed', 'user', 'foursquare', 'google', 'osm'));

insert into public.cuisines (name, position) values
  ('Restoran', 13),
  ('Dönerci', 14),
  ('Köfteci', 15),
  ('Çiğ köfteci', 16),
  ('Pizzacı', 17),
  ('Uzak Doğu', 18),
  ('Dünya mutfağı', 19),
  ('Büfe & fast food', 20),
  ('Pastane & fırın', 21),
  ('Dondurmacı', 22),
  ('Bar', 23)
on conflict (name) do nothing;
