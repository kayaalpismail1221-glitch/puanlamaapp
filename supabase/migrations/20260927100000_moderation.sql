-- Kullanıcı içeriği güvenliği (App Store Kuralı 1.2)
-- 1) Uygunsuz ifade filtresi: gönderi açıklaması, yorum, ad/kullanıcı adı ve kullanıcının eklediği mekân adı
--    ağır küfür, hakaret ve nefret söylemi içeremez. Eşleşme tüm kelime (ya da kök + ek) üzerindendir;
--    "şikâyet", "götürmek", "Dick's" gibi masum kelimeler takılmaz. İngilizceyle çakışan kısa
--    kelimeler (göt→"got", piç→"pic", oç→"oc") bilerek listede yok.
-- 2) Engellenenler listesi: kullanıcı engellediği kişileri görüp engeli kaldırabilir.

-- ---------------------------------------------------------------------------
-- Uygunsuz ifade filtresi
-- ---------------------------------------------------------------------------

/**
 * Metin (Türkçe karakterler sadeleştirilmiş, küçük harf) listedeki bir ifadeyi içeriyor mu?
 * \m / \M: kelime başı / sonu. Kök + ek biçimleri (orospu…, siktir…) ayrıca yazılır.
 */
create or replace function public.is_objectionable(input text)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select public.tr_fold(coalesce(input, '')) ~ (
    '\m('
    -- Türkçe
    || 'amk|aq|amq|amina|aminakoyim|aminakoydugum|amcik\w*|orospu\w*|orospucocugu|piclik'
    || '|sik|sikik|sikim|siktir\w*|sikerim|sikeyim|sikis\w*|sokuk|yarrak\w*|yarak|dasak\w*|tassak\w*'
    || '|gotveren|gotune|gotunu|ibne\w*|pezevenk\w*|kahpe\w*|kaltak\w*|fahise\w*|surtuk\w*|yavsak\w*'
    || '|gavat\w*|kavat\w*|serefsiz\w*|haysiyetsiz\w*|pust\w*|dallama\w*|gerizekali\w*|salak\w*|aptal\w*'
    -- İngilizce
    || '|fuck\w*|motherfuck\w*|shit\w*|bullshit|cunt\w*|bitch\w*|asshole\w*|bastard\w*|whore\w*|slut\w*'
    || '|nigg\w*|fag|fags|faggot\w*|retard\w*|kys'
    || ')\M'
  )
$$;

create or replace function public.reject_objectionable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  col text;
  value text;
begin
  foreach col in array tg_argv loop
    execute format('select ($1).%I::text', col) into value using new;
    if public.is_objectionable(value) then
      raise exception 'Uygunsuz ifade' using errcode = 'P0001', hint = 'objectionable';
    end if;
  end loop;
  return new;
end;
$$;

create trigger posts_objectionable before insert or update of caption on public.posts
  for each row execute function public.reject_objectionable('caption');

create trigger comments_objectionable before insert or update of body on public.comments
  for each row execute function public.reject_objectionable('body');

create trigger profiles_objectionable before insert or update of name, username on public.profiles
  for each row execute function public.reject_objectionable('name', 'username');

-- Toplu içe aktarımlar (OSM vb.) ve demo verisi kendi kaynaklarından gelir; yalnızca kullanıcı eklemesi denetlenir
create or replace function public.reject_objectionable_place()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.source = 'user' and public.is_objectionable(new.name) then
    raise exception 'Uygunsuz ifade' using errcode = 'P0001', hint = 'objectionable';
  end if;
  return new;
end;
$$;

create trigger places_objectionable before insert or update of name on public.places
  for each row execute function public.reject_objectionable_place();

-- ---------------------------------------------------------------------------
-- Engellenenler listesi
-- ---------------------------------------------------------------------------

/**
 * Engellediğin kişiler (profil görünümleri engellenenleri gizlediği için ayrı fonksiyon).
 * Yalnızca ad, kullanıcı adı ve avatar döner.
 */
create or replace function public.blocked_users()
returns table (id uuid, name text, username text, avatar_path text, blocked_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.username, p.avatar_path, b.created_at
  from public.blocks b
  join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

revoke execute on function public.is_objectionable(text), public.reject_objectionable(), public.reject_objectionable_place()
  from public, anon, authenticated;
revoke execute on function public.blocked_users() from public, anon;
grant execute on function public.blocked_users() to authenticated;
