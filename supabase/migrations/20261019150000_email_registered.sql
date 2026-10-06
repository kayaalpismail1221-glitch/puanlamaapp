-- Kayıtta e-posta adımı: adres zaten kayıtlıysa uyarı açılır pencere yerine alanın altında kırmızı yazıyla
-- gösterilir ve "Devam" çalışmaz (kullanıcı isteği 2026-10-02). Eskiden bu ancak şifre adımında, kayıt isteğinin
-- yanıtından öğreniliyordu.
--
-- Hesap varlığını söylemek yeni bir sızıntı değil: "Confirm email" kapalıyken Supabase'in kayıt isteği de aynı
-- bilgiyi veriyor ("User already registered"). Yalnızca evet/hayır döner; e-posta ve hesap bilgisi dönmez.

create or replace function public.email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Supabase Auth e-postaları küçük harfle saklar; eşitlik benzersiz e-posta indeksini kullanır
  select exists (select 1 from auth.users where email = lower(trim(p_email)))
$$;

revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;
