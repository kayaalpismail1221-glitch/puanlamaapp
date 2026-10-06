-- Profil bio'su (kullanıcı isteği 2026-10-03): profilde adın altında, okulun üstünde kısa bir tanıtım.
-- En fazla 150 karakter ve 3 satır; boşlukla başlayıp bitmez (istemci kırpar, boşsa null yazar). Uygunsuz ifade
-- filtresi ad ve kullanıcı adıyla birlikte bio'yu da denetler. Herkes okur (profiller zaten herkese açık), yalnızca
-- sahibi yazar.

alter table public.profiles
  add column bio text
  check (
    bio is null
    or (
      char_length(bio) between 1 and 150
      and bio = btrim(bio)
      and char_length(bio) - char_length(replace(bio, E'\n', '')) <= 2
    )
  );

grant update (bio) on public.profiles to authenticated;

drop trigger profiles_objectionable on public.profiles;
create trigger profiles_objectionable before insert or update of name, username, bio on public.profiles
  for each row execute function public.reject_objectionable('name', 'username', 'bio');

-- Başkasının profili profile_view'dan okunur: bio sona eklenir (sütun sırası korunur, var olan sütunlar aynı)
create or replace view public.profile_view with (security_invoker = true) as
select
  p.id,
  p.username,
  p.name,
  p.avatar_path,
  p.school_id,
  p.follower_count,
  p.following_count,
  p.post_count,
  p.created_at,
  exists (
    select 1 from public.follows f where f.follower_id = auth.uid() and f.followee_id = p.id
  ) as is_following,
  exists (
    select 1 from public.follows f where f.follower_id = p.id and f.followee_id = auth.uid()
  ) as follows_me,
  p.bio
from public.profiles p
where not public.is_blocked_between(auth.uid(), p.id);
