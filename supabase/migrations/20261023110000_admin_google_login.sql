-- Yönetim paneline Google ile giriş (kullanıcı isteği 2026-10-09: "gmail ile giriş, asla veri açığı bırakma").
--
-- `20261023100000_admin_panel`'deki gizli anahtar kaldırılır. Yetki artık oturumdaki hesaptan gelir:
--   * hesabın `profiles.is_admin` alanı doğru olmalı (kullanıcı değiştiremez, yalnızca SQL ile atanır) VE
--   * oturum Google ile açılmış olmalı (JWT `amr` içinde 'oauth'). Hesabın şifresi ele geçse bile şifreli oturum
--     hiçbir yönetici işlevini çalıştıramaz; giriş Google hesabının kendi güvenliğine (2 adımlı doğrulama) dayanır.
-- `is_admin()` tüm yönetici fonksiyonlarının ortak kapısı olduğu için kural hepsine birden uygulanır.
-- Panel `admin_panel(işlem, argümanlar)` yalnızca oturum açmış kullanıcıya açık; anon çağıramaz.
-- Değiştirici işlemler `admin_audit`'e yapanın kimliğiyle yazılır.
--
-- Yönetici atama (kişi web panelinde Google ile bir kez giriş yaptıktan sonra, SQL Editor'de):
--   update public.profiles set is_admin = true
--   where id = (select id from auth.users where lower(email) = lower('<gmail adresi>'));

drop function if exists public.admin_panel(text, text, jsonb);
drop function if exists public.admin_panel_auth(text);
drop table if exists public.admin_panel_keys;

/** Oturum Google (OAuth) ile mi açıldı: Supabase erişim jetonunun `amr` (kimlik doğrulama yöntemleri) alanı */
create or replace function public.session_is_oauth()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from jsonb_array_elements(
      case jsonb_typeof(auth.jwt() -> 'amr') when 'array' then auth.jwt() -> 'amr' else '[]'::jsonb end
    ) m
    where m ->> 'method' = 'oauth'
  )
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false)
    and public.session_is_oauth()
$$;

alter table public.admin_audit
  add column admin_id uuid references public.profiles (id) on delete set null,
  add column admin_email text;

create or replace function public.admin_panel(p_action text, p_args jsonb default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a jsonb := coalesce(p_args, '{}');
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Giriş gerekli' using errcode = '42501';
  end if;
  if not public.session_is_oauth() then
    raise exception 'Google ile giriş gerekli' using errcode = '42501', hint = 'oauth_required';
  end if;
  if not public.is_admin() then
    raise exception 'Bu hesap yönetici değil' using errcode = '42501', hint = 'not_admin';
  end if;

  case p_action
    when 'me' then
      result := (select jsonb_build_object('id', p.id, 'username', p.username, 'name', p.name,
                                           'avatar_path', p.avatar_path,
                                           'email', (select u.email from auth.users u where u.id = p.id))
                 from public.profiles p where p.id = auth.uid());
    when 'overview' then
      result := public.admin_overview();
    when 'growth' then
      result := public.growth_stats(coalesce((a ->> 'days')::int, 30));
    when 'reports' then
      result := (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.admin_reports() r);
    when 'resolve_report' then
      perform public.admin_resolve_report((a ->> 'id')::uuid, a ->> 'action');
    when 'corrections' then
      result := public.admin_corrections();
    when 'resolve_correction' then
      perform public.admin_resolve_correction((a ->> 'id')::uuid, (a ->> 'accept')::boolean);
    when 'users' then
      result := public.admin_users(a);
    when 'user' then
      result := public.admin_user((a ->> 'id')::uuid);
    when 'set_ban' then
      if (a ->> 'id')::uuid = auth.uid() then
        raise exception 'Kendi hesabını yasaklayamazsın' using errcode = '22023';
      end if;
      perform public.admin_set_ban((a ->> 'id')::uuid, (a ->> 'banned')::boolean);
    when 'places' then
      result := public.admin_places(a);
    when 'update_place' then
      result := public.admin_update_place((a ->> 'id')::uuid, a -> 'patch');
    when 'posts' then
      result := public.admin_posts(a);
    when 'delete_post' then
      delete from public.posts where id = (a ->> 'id')::uuid;
    when 'verifications' then
      result := public.admin_verifications();
    when 'add_verification' then
      result := public.admin_add_verification(a);
    when 'cancel_verification' then
      update public.place_verifications set cancelled_at = coalesce(cancelled_at, now())
      where id = (a ->> 'id')::uuid;
    when 'versions' then
      result := (select coalesce(jsonb_agg(to_jsonb(v) order by v.platform), '[]') from public.app_min_versions v);
    when 'set_version' then
      update public.app_min_versions set min_version = a ->> 'version', updated_at = now()
      where platform = a ->> 'platform';
    when 'audit' then
      result := (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc), '[]')
                 from (select * from public.admin_audit order by created_at desc limit 200) x);
    else
      raise exception 'Bilinmeyen işlem: %', p_action using errcode = '22023';
  end case;

  if p_action in ('resolve_report', 'resolve_correction', 'set_ban', 'update_place', 'delete_post',
                  'add_verification', 'cancel_verification', 'set_version') then
    insert into public.admin_audit (action, args, admin_id, admin_email)
    values (p_action, a, auth.uid(), (select u.email from auth.users u where u.id = auth.uid()));
  end if;

  return coalesce(result, '{"ok": true}');
end;
$$;

revoke execute on function public.admin_panel(text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_panel(text, jsonb) to authenticated;
revoke execute on function public.session_is_oauth() from public, anon;
grant execute on function public.session_is_oauth() to authenticated;
