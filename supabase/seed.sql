-- Geliştirme verisi: kurgusal mekânlar, demo kullanıcılar ve gönderiler.
-- Yalnızca geliştirme/test içindir. Gerçek kullanıcılara açılmadan önce
-- supabase/scripts/remove-demo-data.sql ile silin.
-- Demo hesaplar @demo.puanla.app uzantılıdır ve şifreleri yoktur (giriş yapılamaz).

insert into public.places (id, name, cuisine, neighborhood, district, city, price_level, latitude, longitude, photo_url, source) values
  ('a0000000-0000-4000-8000-000000000001', 'Serpme Kahvaltı Evi', 'Kahvaltıcı', 'Moda', 'Kadıköy', 'İstanbul', 2, 40.9846, 29.0268, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000002', 'Hünkâr Esnaf Lokantası', 'Esnaf lokantası', 'Kadıköy Çarşı', 'Kadıköy', 'İstanbul', 1, 40.9905, 29.0254, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000003', 'Dürümcü Hasan Usta', 'Dürümcü', 'Çarşı', 'Beşiktaş', 'İstanbul', 1, 41.0431, 29.0059, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000004', 'Kokoreççi Rıza', 'Kokoreççi', 'Çarşı', 'Beşiktaş', 'İstanbul', 1, 41.0441, 29.0031, null, 'seed'),
  ('a0000000-0000-4000-8000-000000000005', 'Ciğerci Bekir', 'Ciğerci', 'Yeldeğirmeni', 'Kadıköy', 'İstanbul', 2, 40.9951, 29.0292, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000006', 'Rumeli Balıkçısı', 'Balıkçı', 'Rumelihisarı', 'Sarıyer', 'İstanbul', 3, 41.0848, 29.0567, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000007', 'Meyhane Asmalı', 'Meyhane', 'Asmalımescit', 'Beyoğlu', 'İstanbul', 3, 41.0318, 28.9762, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000008', 'Kuzguncuk Meze Evi', 'Meyhane', 'Kuzguncuk', 'Üsküdar', 'İstanbul', 3, 41.0356, 29.0311, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000009', 'Etiler Burger Co.', 'Burgerci', 'Etiler', 'Beşiktaş', 'İstanbul', 2, 41.0812, 29.0334, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000010', 'Hisarüstü Kahve', 'Kafe', 'Hisarüstü', 'Sarıyer', 'İstanbul', 1, 41.0857, 29.0443, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000011', 'Karadeniz Pide Salonu', 'Pideci', 'Çarşı', 'Beşiktaş', 'İstanbul', 1, 41.0422, 29.0072, 'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000012', 'Adana Ocakbaşı', 'Kebapçı', 'Levent', 'Beşiktaş', 'İstanbul', 2, 41.0781, 29.0123, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000013', 'Bahariye Tatlıcısı', 'Tatlıcı', 'Bahariye', 'Kadıköy', 'İstanbul', 1, 40.9878, 29.0305, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000014', 'Arnavutköy Kahvaltı Bahçesi', 'Kahvaltıcı', 'Arnavutköy', 'Beşiktaş', 'İstanbul', 2, 41.0676, 29.0431, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000015', 'Yeşil Tabak', 'Kafe', 'Cihangir', 'Beyoğlu', 'İstanbul', 2, 41.0319, 28.9834, 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000016', 'Çarşı Balık Ekmek', 'Balıkçı', 'Çarşı', 'Beşiktaş', 'İstanbul', 1, 41.0425, 29.0049, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000017', 'Usta Ev Yemekleri', 'Esnaf lokantası', 'Levent', 'Beşiktaş', 'İstanbul', 1, 41.0795, 29.0101, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000018', 'Moda Sahil Meyhanesi', 'Meyhane', 'Moda', 'Kadıköy', 'İstanbul', 3, 40.9818, 29.0249, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000019', 'Kızılay Döner Evi', 'Dürümcü', 'Kızılay', 'Çankaya', 'Ankara', 1, 39.9208, 32.8541, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000020', 'Bahçeli Kahvaltı Sokağı', 'Kahvaltıcı', 'Bahçelievler', 'Çankaya', 'Ankara', 2, 39.9227, 32.8237, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000021', 'Tunalı Meyhanesi', 'Meyhane', 'Kavaklıdere', 'Çankaya', 'Ankara', 3, 39.905, 32.86, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000022', 'Ulus Esnaf Lokantası', 'Esnaf lokantası', 'Ulus', 'Altındağ', 'Ankara', 1, 39.9416, 32.8547, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000023', 'Kordon Balık', 'Balıkçı', 'Alsancak', 'Konak', 'İzmir', 3, 38.438, 27.143, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000024', 'Kemeraltı Boyoz Kahvaltı', 'Kahvaltıcı', 'Kemeraltı', 'Konak', 'İzmir', 1, 38.4189, 27.1287, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 'seed'),
  ('a0000000-0000-4000-8000-000000000025', 'Bornova Kokoreç', 'Kokoreççi', 'Küçükpark', 'Bornova', 'İzmir', 1, 38.4622, 27.2166, null, 'seed'),
  ('a0000000-0000-4000-8000-000000000026', 'Karşıyaka Çarşı Tatlıcısı', 'Tatlıcı', 'Çarşı', 'Karşıyaka', 'İzmir', 1, 38.4561, 27.1098, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1080&q=75&auto=format&fit=crop', 'seed');

-- Demo hesaplar; profil satırlarını on_auth_user_created tetikleyicisi oluşturur
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'zeynepyer@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Zeynep Aksoy", "username": "zeynepyer"}', now() - interval '60 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'emrekaya@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Emre Kaya", "username": "emrekaya"}', now() - interval '55 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'denizyildiz@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Deniz Yıldız", "username": "denizyildiz"}', now() - interval '50 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'canozturk@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Can Öztürk", "username": "canozturk"}', now() - interval '45 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'elifdemir@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Elif Demir", "username": "elifdemir"}', now() - interval '40 days', now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-4000-8000-000000000006', 'authenticated', 'authenticated', 'mertsahin@demo.puanla.app', '', now(), '{"provider":"email","providers":["email"]}', '{"name": "Mert Şahin", "username": "mertsahin"}', now() - interval '35 days', now(), '', '', '', '');

update public.profiles p
set avatar_path = v.avatar, school_id = v.school, onboarded_at = p.created_at
from (values
  ('b0000000-0000-4000-8000-000000000001'::uuid, 'https://i.pravatar.cc/200?img=47', 'bogazici'),
  ('b0000000-0000-4000-8000-000000000002'::uuid, 'https://i.pravatar.cc/200?img=12', 'istanbul-teknik'),
  ('b0000000-0000-4000-8000-000000000003'::uuid, 'https://i.pravatar.cc/200?img=32', 'bogazici'),
  ('b0000000-0000-4000-8000-000000000004'::uuid, 'https://i.pravatar.cc/200?img=15', 'orta-dogu-teknik'),
  ('b0000000-0000-4000-8000-000000000005'::uuid, 'https://i.pravatar.cc/200?img=45', 'bogazici'),
  ('b0000000-0000-4000-8000-000000000006'::uuid, 'https://i.pravatar.cc/200?img=53', 'istanbul-teknik')
) as v (id, avatar, school)
where p.id = v.id;

insert into public.follows (follower_id, followee_id) values
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004'),
  ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000005'),
  ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006'),
  ('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003'),
  ('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000002'),
  ('b0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000004');

insert into public.posts (id, user_id, place_id, caption, score, price_per_person, meal, dishes, highlights, like_count, created_at) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Pazar sabahı için en iyisi. Menemen efsane, çay sınırsız.', 9.4, '250-500', 'kahvalti', array['Menemen', 'Serpme kahvaltı']::text[], array['Fiyat/performans', 'Kalabalık gruba uygun']::text[], 12, now() - interval '2 hours'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', 'Gece 2’de bile kuyruk vardı, hak ediyor.', 8.8, 'u250', 'gece', array['Yarım kokoreç']::text[], array['Öğrenci dostu', 'Hızlı servis']::text[], 8, now() - interval '5 hours'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000007', 'Mezeler taze, fava ve topik mutlaka. Rakı masası için ideal.', 8.1, '1000-2000', 'aksam', array['Fava', 'Topik', 'Levrek']::text[], array['Rezervasyon şart', 'Sessiz, sohbetlik']::text[], 21, now() - interval '9 hours'),
  ('c0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000009', 'Fena değil ama fiyatına göre küçük.', 6.2, null, null, '{}'::text[], '{}'::text[], 4, now() - interval '20 hours'),
  ('c0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', 'Kuru fasulye pilav, annemin yemeği gibi.', 9.0, 'u250', 'ogle', array['Kuru fasulye', 'Pilav']::text[], array['Fiyat/performans', 'Porsiyon büyük']::text[], 15, now() - interval '26 hours'),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000006', 'Manzara + levrek. Ders çıkışı gidilir.', 8.6, '1000-2000', 'aksam', array['Levrek']::text[], array['Manzaralı']::text[], 30, now() - interval '40 hours'),
  ('c0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000003', 'Acılı dürüm iyi, lavaş biraz kuru.', 7.4, null, null, '{}'::text[], '{}'::text[], 3, now() - interval '52 hours'),
  ('c0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000013', 'Kazandibi çok iyi.', 7.9, null, null, '{}'::text[], '{}'::text[], 9, now() - interval '70 hours'),
  ('c0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000010', 'Ders çalışmak için sessiz ve priz bol.', 8.3, 'u250', 'ogle', '{}'::text[], array['Sessiz, sohbetlik', 'Öğrenci dostu']::text[], 11, now() - interval '96 hours'),
  ('c0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000007', 'Servis biraz yavaştı ama ortam güzel.', 7.6, null, null, '{}'::text[], '{}'::text[], 6, now() - interval '120 hours'),
  ('c0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', 'Hafta içi sabah sakin, tavsiye.', 8.9, '250-500', 'kahvalti', array['Menemen']::text[], array['Fiyat/performans']::text[], 5, now() - interval '150 hours'),
  ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000020', 'Ankara’da serpme kahvaltının adresi. Sucuklu yumurta şahane.', 9.1, '250-500', 'kahvalti', array['Sucuklu yumurta']::text[], array['Porsiyon büyük']::text[], 27, now() - interval '6 hours'),
  ('c0000000-0000-4000-8000-000000000013', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000019', 'Kızılay’da gece yarısı dönerci. Porsiyon büyük.', 8.4, null, null, '{}'::text[], '{}'::text[], 18, now() - interval '14 hours'),
  ('c0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000021', 'Tunalı’da samimi bir meyhane, ara sıcaklar iyi.', 7.8, null, null, '{}'::text[], '{}'::text[], 12, now() - interval '30 hours'),
  ('c0000000-0000-4000-8000-000000000015', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000022', 'Ulus’ta öğlen kuyruğu var ama değer. Etli nohut 10/10.', 8.9, null, null, '{}'::text[], '{}'::text[], 22, now() - interval '48 hours'),
  ('c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000023', 'Kordon’da gün batımı + çipura. İzmir’e gelen gitsin.', 8.7, '1000-2000', 'aksam', array['Çipura']::text[], array['Manzaralı', 'Rezervasyon şart']::text[], 41, now() - interval '4 hours'),
  ('c0000000-0000-4000-8000-000000000017', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000024', 'Boyoz, yumurta, çay. İzmir sabahı böyle başlar.', 9.2, 'u250', 'kahvalti', array['Boyoz', 'Gevrek']::text[], array['Fiyat/performans', 'Öğrenci dostu']::text[], 35, now() - interval '10 hours'),
  ('c0000000-0000-4000-8000-000000000018', 'b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000025', 'Öğrenci dostu fiyat, kokoreç bol baharatlı.', 8.0, null, null, '{}'::text[], '{}'::text[], 9, now() - interval '28 hours'),
  ('c0000000-0000-4000-8000-000000000019', 'b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000026', 'Lokma sıcak sıcak geliyor.', 7.5, null, null, '{}'::text[], '{}'::text[], 7, now() - interval '60 hours');

insert into public.post_photos (post_id, position, path, width, height) values
  ('c0000000-0000-4000-8000-000000000001', 0, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000001', 1, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000002', 0, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000003', 0, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000003', 1, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000003', 2, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000004', 0, 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000005', 0, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000006', 0, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000006', 1, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000007', 0, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000008', 0, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000009', 0, 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000010', 0, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000011', 0, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000012', 0, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000013', 0, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000014', 0, 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000014', 1, 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000015', 0, 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000016', 0, 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000017', 0, 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000018', 0, 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=1080&q=75&auto=format&fit=crop', 1080, 1350),
  ('c0000000-0000-4000-8000-000000000019', 0, 'https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1080&q=75&auto=format&fit=crop', 1080, 1350);

insert into public.post_tags (post_id, user_id) values
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000004'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000006'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000005'),
  ('c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000006'),
  ('c0000000-0000-4000-8000-000000000014', 'b0000000-0000-4000-8000-000000000003'),
  ('c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000005');

insert into public.comments (id, post_id, user_id, body, created_at) values
  ('d0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002', 'Bir dahakine beni de çağır!', now() - interval '1.5 hours'),
  ('d0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'Menemen gerçekten iyiydi 🙌', now() - interval '1 hours'),
  ('d0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000004', 'Rezervasyon gerekiyor mu?', now() - interval '8 hours'),
  ('d0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 'Hafta sonu kesin gerekiyor.', now() - interval '7 hours'),
  ('d0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 'Fiyatlar nasıl?', now() - interval '30 hours'),
  ('d0000000-0000-4000-8000-000000000006', 'c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000002', 'Kesin gidiyorum!', now() - interval '3 hours'),
  ('d0000000-0000-4000-8000-000000000007', 'c0000000-0000-4000-8000-000000000016', 'b0000000-0000-4000-8000-000000000004', 'Rezervasyon şart mı?', now() - interval '2 hours'),
  ('d0000000-0000-4000-8000-000000000008', 'c0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000001', 'Ankara’ya gelince ilk durak.', now() - interval '5 hours');

-- Demo kullanıcıların sıralamaları gönderi puanlarından türetilir; puanlar sonra sıradan yeniden hesaplanır
insert into public.rankings (user_id, place_id, sentiment, position, score, rated_at)
select
  user_id,
  place_id,
  sentiment,
  (row_number() over (partition by user_id, sentiment order by score desc, created_at) - 1)::int,
  score,
  created_at
from (
  select distinct on (user_id, place_id)
    user_id, place_id, score, created_at,
    (case when score >= 6.7 then 'liked' when score >= 3.4 then 'fine' else 'disliked' end)::public.sentiment as sentiment
  from public.posts
  order by user_id, place_id, created_at desc
) latest;

select public.recompute_group_scores(g.user_id, g.sentiment)
from (select distinct user_id, sentiment from public.rankings) g;
