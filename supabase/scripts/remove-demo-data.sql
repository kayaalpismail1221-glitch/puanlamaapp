-- Demo verisini siler (seed.sql ile eklenen kurgusal mekânlar, demo hesaplar ve gönderileri).
-- Gerçek kullanıcılara açılmadan önce Supabase SQL Editor'de bir kez çalıştırın.

begin;

-- Demo hesaplar silinince profilleri, gönderileri, yorumları, takipleri ve sıralamaları da silinir
delete from auth.users where email like '%@demo.puanla.app';

-- Kurgusal mekânlar (gerçek kullanıcıların bu mekânlara ait kayıtları da silinir)
delete from public.places where source = 'seed';

commit;
