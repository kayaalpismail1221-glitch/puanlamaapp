-- Uygulamanın adı Expeat oldu (eski adı Puanla). Kullanıcıya görünen sunucu metinleri:
-- 1) Bildirim metni (push): "X Expeat'e katıldı". Gövde 20261006110000_comment_social'daki ile aynı; yalnızca ad değişti.
-- 2) Yeni hesabın varsayılan adı "Expeat kullanıcısı", kullanıcı adı yedeği "expeat". Gövde 20261010100000_scale'deki
--    ile aynı; yalnızca bu iki değer değişti.
-- 3) Hiç ad vermemiş mevcut hesaplar: "Puanla kullanıcısı" → "Expeat kullanıcısı" (kullanıcı adlarına dokunulmaz).

/** Push metni; ad Expeat */
create or replace function public.notification_text(n public.notifications, locale text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor text := (select name from public.profiles where id = n.actor_id);
  place text := (
    select pl.name from public.places pl
    where pl.id = coalesce(n.place_id, (select place_id from public.posts where id = n.post_id))
  );
  body text := (select c.body from public.comments c where c.id = n.comment_id);
  theirs numeric;
  mine numeric;
begin
  if char_length(body) > 80 then body := left(body, 79) || '…'; end if;
  case n.type
    when 'friend_joined' then
      if place is not null then
        return case when locale = 'tr' then 'Davet ettiğin ' || actor || ' Expeat''e katıldı. Bakalım ' || place || '''a kaç verecek?'
                    else actor || ' joined Expeat from your invite. Let''s see what they give ' || place || '.' end;
      end if;
      return case when locale = 'tr' then 'Rehberindeki ' || actor || ' Expeat''e katıldı'
                  else actor || ' from your contacts joined Expeat' end;
    when 'like' then
      return case when locale = 'tr' then actor || ' gönderini beğendi · ' || place
                  else actor || ' liked your post · ' || place end;
    when 'comment' then
      return case when locale = 'tr' then actor || ' yorum yaptı: “' || body || '”'
                  else actor || ' commented: “' || body || '”' end;
    when 'reply' then
      return case when locale = 'tr' then actor || ' yorumuna yanıt verdi: “' || body || '”'
                  else actor || ' replied to your comment: “' || body || '”' end;
    when 'comment_like' then
      return case when locale = 'tr' then actor || ' yorumunu beğendi: “' || body || '”'
                  else actor || ' liked your comment: “' || body || '”' end;
    when 'tag' then
      return case when locale = 'tr' then actor || ' seni ' || place || ' gönderisinde etiketledi'
                  else actor || ' tagged you at ' || place end;
    when 'follow' then
      return case when locale = 'tr' then actor || ' seni takip etmeye başladı'
                  else actor || ' started following you' end;
    when 'friend_rated' then
      theirs := (select score from public.rankings where user_id = n.actor_id and place_id = n.place_id);
      mine := (select score from public.rankings where user_id = n.user_id and place_id = n.place_id);
      return case when locale = 'tr'
        then actor || ', ' || place || ' için ' || public.format_score(theirs, locale) || ' verdi. Sen '
             || public.format_score(mine, locale) || ' vermiştin.'
        else actor || ' gave ' || place || ' a ' || public.format_score(theirs, locale) || '. You gave it '
             || public.format_score(mine, locale) || '.' end;
    else
      return null;
  end case;
end;
$$;

/**
 * Yeni hesap açılınca profili oluşturur (davranış 20261010100000_scale'deki ile aynı). Ad yoksa "Expeat kullanıcısı".
 */
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
  attempt int := 0;
  failed_constraint text;
begin
  loop
    begin
      insert into public.profiles (id, name, username)
      values (
        new.id,
        left(coalesce(display_name, nullif(email_name, ''), 'Expeat kullanıcısı'), 60),
        public.unique_username(coalesce(nullif(meta ->> 'username', ''), display_name, email_name, 'expeat'))
      );
      exit;
    exception when unique_violation then
      get stacked diagnostics failed_constraint = constraint_name;
      attempt := attempt + 1;
      if failed_constraint is distinct from 'profiles_username_key' or attempt >= 5 then
        raise;
      end if;
    end;
  end loop;

  insert into public.profile_private (user_id, phone)
  values (
    new.id,
    case when phone_digits ~ '^5[0-9]{9}$' then '+90' || phone_digits end
  );
  return new;
end;
$$;

update public.profiles set name = 'Expeat kullanıcısı' where name = 'Puanla kullanıcısı';
