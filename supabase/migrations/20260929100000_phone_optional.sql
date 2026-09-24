-- Telefon numarası yeniden toplanıyor: kayıtta isteğe bağlı adım, ileride rehberden arkadaş bulma için.
-- Numara yalnızca profile_private'ta durur (sadece sahibi görür); geçersiz biçim sessizce atlanır.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  display_name text := nullif(btrim(coalesce(meta ->> 'name', meta ->> 'full_name', '')), '');
  email_name text := split_part(coalesce(new.email, ''), '@', 1);
  -- Rakamlar alınır, baştaki 90 / 0 atılır: "0532 123 45 67" ve "+90 532…" aynı sonucu verir
  phone_digits text := regexp_replace(regexp_replace(coalesce(meta ->> 'phone', ''), '\D', '', 'g'), '^(90|0)', '');
begin
  insert into public.profiles (id, name, username)
  values (
    new.id,
    left(coalesce(display_name, nullif(email_name, ''), 'Puanla kullanıcısı'), 60),
    public.unique_username(coalesce(nullif(meta ->> 'username', ''), display_name, email_name, 'puanla'))
  );
  insert into public.profile_private (user_id, phone)
  values (
    new.id,
    case when phone_digits ~ '^5[0-9]{9}$' then '+90' || phone_digits end
  );
  return new;
end;
$$;
