-- Denetim düzeltmeleri (2026-09-30):
-- 1) "Bilgi yanlış mı?" yalnızca güvenilir hesapların oyuyla kendiliğinden uygulanır (bedava hesaplarla telefon/web
--    değiştirip oltalama ya da mekânı "kapandı" yapıp haritadan silme kapanır); telefon ve web için 3 kişi.
-- 2) Engellenen kişiler birbirinin puanlarını (ve dolayısıyla Favori 4'ünü, Gittiklerim'ini) göremez.
-- 3) Profil fotoğrafı yolu kullanıcının kendi klasöründe olmalı (dış adres yazılıp izleyenlerin IP'si sızmasın).
-- 4) Ağır referans fonksiyonu xp_totals istemciye kapalı; rank_place yetkileri diğer RPC'lerle aynı.

-- ---------------------------------------------------------------------------
-- 1) Mekân düzeltmeleri: güvenilir hesap
-- ---------------------------------------------------------------------------

/** Düzeltme oyu sayılan hesap: en az 7 günlük ve en az 5 mekân puanlamış */
create or replace function public.is_trusted_reviewer(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = p_user_id
      and p.created_at <= now() - interval '7 days'
      and (select count(*) from public.rankings r where r.user_id = p_user_id) >= 5
  )
$$;

revoke execute on function public.is_trusted_reviewer(uuid) from public, anon, authenticated;

/**
 * Düzeltme önerir. Değer istemcide biçimlenir (telefon E.164, web https://); burada yine denetlenir.
 * Dönen değer: 'applied' (uyuşan bağımsız ve güvenilir öneri sayısı eşiğe ulaştı) ya da 'pending'.
 * Yeni hesapların önerisi de kaydedilir (yönetici kuyruğunda görünür) ama kendiliğinden uygulanmaya sayılmaz.
 */
create or replace function public.suggest_place_correction(
  p_place_id uuid,
  p_field public.correction_field,
  p_value text default null,
  p_latitude double precision default null,
  p_longitude double precision default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  place public.places;
  new_id uuid;
  agreeing integer;
  v_value text := nullif(btrim(coalesce(p_value, '')), '');
  -- Oltalamaya açık alanlar (telefon, web) ve mekânı listelerden kaldıran "kapandı" üç kişi ister
  needed integer := case when p_field in ('closed', 'phone', 'website') then 3 else 2 end;
begin
  if me is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  select * into place from public.places where id = p_place_id;
  if place.id is null then
    raise exception 'Mekân bulunamadı' using errcode = 'P0002';
  end if;

  -- Biçim denetimi (hatalı değer kuyruğa bile girmesin)
  if p_field = 'phone' and v_value is not null and v_value !~ '^\+[0-9]{8,15}$' then
    raise exception 'Geçersiz telefon' using errcode = '22023';
  elsif p_field = 'website' and v_value is not null and (v_value !~ '^https?://[^ ]+\.[^ ]+$' or char_length(v_value) > 300) then
    raise exception 'Geçersiz web adresi' using errcode = '22023';
  elsif p_field = 'name' and (v_value is null or char_length(v_value) not between 2 and 120) then
    raise exception 'Geçersiz ad' using errcode = '22023';
  elsif p_field = 'location' and (
    p_latitude is null or p_longitude is null
    -- Konum düzeltmesi mekânı şehrin öbür ucuna taşıyamaz
    or not extensions.st_dwithin(place.location,
      extensions.st_makepoint(p_longitude, p_latitude)::extensions.geography, 2000)
  ) then
    raise exception 'Konum mekâna çok uzak' using errcode = '22023', hint = 'correction_too_far';
  end if;
  if p_field in ('name', 'address') and public.is_objectionable(v_value) then
    raise exception 'Uygunsuz ifade' using errcode = 'P0001', hint = 'objectionable';
  end if;

  delete from public.place_corrections
  where place_id = p_place_id and field = p_field and user_id = me and status = 'pending';
  insert into public.place_corrections (place_id, user_id, field, value, latitude, longitude)
  values (p_place_id, me, p_field,
    case when p_field in ('location', 'closed') then null else coalesce(v_value, '') end,
    case when p_field = 'location' then p_latitude end,
    case when p_field = 'location' then p_longitude end)
  returning id into new_id;

  -- Yeni hesabın önerisi kendiliğinden uygulanmaz (yönetici görür)
  if not public.is_trusted_reviewer(me) then
    return 'pending';
  end if;

  -- Birbirinden bağımsız kaç güvenilir kişi aynı şeyi söylüyor (engellediği/engellendiği kişiler sayılmaz)
  select count(distinct o.user_id) into agreeing
  from public.place_corrections o
  where o.place_id = p_place_id and o.field = p_field and o.status = 'pending'
    and (o.user_id = me or not public.is_blocked_between(me, o.user_id))
    and public.is_trusted_reviewer(o.user_id)
    and (
      p_field = 'closed'
      or (p_field = 'location' and extensions.st_dwithin(
            extensions.st_makepoint(o.longitude, o.latitude)::extensions.geography,
            extensions.st_makepoint(p_longitude, p_latitude)::extensions.geography, 50))
      or (p_field not in ('closed', 'location') and public.correction_key(o.value) = public.correction_key(v_value))
    );

  if agreeing >= needed then
    perform public.apply_place_correction(new_id);
    return 'applied';
  end if;
  return 'pending';
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Engellenen kişiler birbirinin puanlarını göremez
-- ---------------------------------------------------------------------------

/**
 * Çağıranın engellediği ve onu engelleyen kişiler. Politikada `(select …)` içinde bir kez hesaplanır;
 * satır başına fonksiyon çağrısı yok (topluluk sorguları büyük tabloları tarar).
 */
create or replace function public.block_peer_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(peer), '{}')
  from (
    select blocked_id as peer from public.blocks where blocker_id = auth.uid()
    union
    select blocker_id from public.blocks where blocked_id = auth.uid()
  ) s
$$;

revoke execute on function public.block_peer_ids() from public, anon;
grant execute on function public.block_peer_ids() to authenticated;

drop policy "Sıralamalar üyelere açık" on public.rankings;
create policy "Sıralamalar üyelere açık" on public.rankings
  for select to authenticated
  -- Tür dönüşümü alt sorguyu dizi ifadesi yapar (`= any (select …)` satır karşılaştırması olurdu); değer bir kez hesaplanır
  using (not (user_id = any ((select public.block_peer_ids())::uuid[])));

-- ---------------------------------------------------------------------------
-- 3) Profil fotoğrafı yalnızca kendi klasöründen
-- ---------------------------------------------------------------------------

/**
 * Kullanıcı `avatar_path`'e yalnızca kendi depolama klasöründeki bir yolu yazabilir. Demo/betik hesapları (service
 * role) dış adres kullanabildiği için kural sütun kısıtı değil, istemci rolüne bakan tetikleyici.
 */
create or replace function public.check_avatar_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated'
    and new.avatar_path is not null
    and new.avatar_path is distinct from old.avatar_path
    and (new.avatar_path not like new.id::text || '/%' or new.avatar_path like '%..%')
  then
    raise exception 'Geçersiz profil fotoğrafı yolu' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger profiles_avatar_path before update of avatar_path on public.profiles
  for each row execute function public.check_avatar_path();

-- ---------------------------------------------------------------------------
-- 4) Yetkiler
-- ---------------------------------------------------------------------------

-- Doğruluk referansı (testler ve bench); tüm tabloyu tarar, istemci çağırmaz
revoke execute on function public.xp_totals(timestamptz) from public, anon, authenticated;

-- 20261013140000'de yeniden oluşturulurken yetkisi verilmemişti (Supabase varsayılanı anon'a da açar)
revoke execute on function public.rank_place(uuid, public.sentiment, integer, text, boolean) from public, anon;
grant execute on function public.rank_place(uuid, public.sentiment, integer, text, boolean) to authenticated;
