-- Ölü push jetonlarının temizliği. Uygulamayı silen ya da bildirimleri kaldırılan cihazın jetonu `push_tokens`'ta
-- kalıyordu; her bildirimde ona da gönderiliyordu. Expo bu cihazlar için "DeviceNotRegistered" der (bazen hemen
-- gönderim yanıtında, çoğunlukla APNs/FCM'den dönen teslim raporunda, ~15 dk sonra); o jeton silinir.
--
-- Akış (pg_net zaman uyumsuz: istek şimdi gider, yanıt `net._http_response`'a sonra düşer):
-- 1. `on_notification_push` gönderim isteğinin kimliğini ve jetonları mesaj sırasıyla `push_sends`'e yazar.
-- 2. `push_maintenance` (pg_cron, 15 dakikada bir): gönderim yanıtlarını okur (`push_apply_tickets`): ölü jeton
--    silinir, başarılı gönderimin teslim raporu kimliği `push_receipts`'e girer.
-- 3. 15 dakikadan eski raporlar Expo'dan toplu istenir (getReceipts, istek başına 1000), yanıtı bir sonraki turda
--    `push_apply_receipts` işler: ölü jeton silinir, cevabı gelen rapor kaydı silinir.
-- Expo raporları 24 saat tutar; daha eski bekleyen kayıtlar ve sahipsiz istekler atılır. Diğer hatalar
-- (MessageRateExceeded, InvalidCredentials…) jetonu silmez.
-- Testlerde pg_net yoksa bakım ve gönderim atlanır; pg_cron yoksa zamanlama kurulmaz.

create table public.push_sends (
  request_id bigint primary key,
  -- Gönderilen mesajların jetonları, mesaj sırasıyla (Expo yanıtı aynı sırada döner)
  tokens text[] not null,
  created_at timestamptz not null default now()
);

create table public.push_receipts (
  ticket_id text primary key,
  token text not null references public.push_tokens (token) on delete cascade,
  created_at timestamptz not null default now(),
  -- Rapor en son ne zaman istendi (henüz hazır değilse bir saat sonra yeniden istenir)
  requested_at timestamptz
);

create index push_receipts_token_idx on public.push_receipts (token);
create index push_receipts_created_idx on public.push_receipts (created_at);

create table public.push_receipt_requests (
  request_id bigint primary key,
  ticket_ids text[] not null,
  created_at timestamptz not null default now()
);

alter table public.push_sends enable row level security;
alter table public.push_receipts enable row level security;
alter table public.push_receipt_requests enable row level security;
revoke all on public.push_sends, public.push_receipts, public.push_receipt_requests from public, anon, authenticated;

/** Gönderim yanıtı: {"data": [{"status": "ok", "id": …} | {"status": "error", "details": {"error": …}}]} */
create or replace function public.push_apply_tickets(p_tokens text[], p_response jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tickets jsonb := p_response -> 'data';
begin
  -- Yanıt mesaj sayısıyla uyuşmuyorsa (istek bütünüyle reddedildi, biçim değişti) hiçbir şey yapılmaz
  if jsonb_typeof(tickets) is distinct from 'array' or jsonb_array_length(tickets) <> coalesce(cardinality(p_tokens), 0) then
    return;
  end if;

  delete from public.push_tokens
  where token in (
    select p_tokens[t.i]
    from jsonb_array_elements(tickets) with ordinality as t (ticket, i)
    where t.ticket -> 'details' ->> 'error' = 'DeviceNotRegistered'
  );

  insert into public.push_receipts (ticket_id, token)
  select t.ticket ->> 'id', p_tokens[t.i]
  from jsonb_array_elements(tickets) with ordinality as t (ticket, i)
  where t.ticket ->> 'status' = 'ok'
    and t.ticket ->> 'id' is not null
    -- Jeton bu arada silinmiş olabilir (çıkış, ölü jeton)
    and exists (select 1 from public.push_tokens pt where pt.token = p_tokens[t.i])
  on conflict (ticket_id) do nothing;
end;
$$;

/** Rapor yanıtı: {"data": {"<id>": {"status": "ok"} | {"status": "error", "details": {"error": …}}}} */
create or replace function public.push_apply_receipts(p_response jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  receipts jsonb := p_response -> 'data';
begin
  if jsonb_typeof(receipts) is distinct from 'object' then
    return;
  end if;

  delete from public.push_tokens
  where token in (
    select r.token
    from public.push_receipts r
    join jsonb_each(receipts) e on e.key = r.ticket_id
    where e.value -> 'details' ->> 'error' = 'DeviceNotRegistered'
  );
  -- Cevabı gelen rapor işlendi; listede olmayanlar henüz hazır değil, sonra yeniden istenir
  delete from public.push_receipts
  where ticket_id in (select e.key from jsonb_each(receipts) e);
end;
$$;

/** pg_cron'un 15 dakikada bir çağırdığı bakım (yukarıdaki akış). pg_net yoksa hiçbir şey yapmaz. */
create or replace function public.push_maintenance()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  ids text[];
  request bigint;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'net' and p.proname = 'http_post'
  ) then
    return;
  end if;

  -- 1. Gönderim yanıtları
  for r in execute
    'select s.request_id, s.tokens, h.status_code, h.content
     from public.push_sends s join net._http_response h on h.id = s.request_id'
  loop
    if r.status_code = 200 then
      begin
        perform public.push_apply_tickets(r.tokens, r.content::jsonb);
      exception when others then
        null; -- bozuk yanıt: atla, gönderim kaydı yine de silinir
      end;
    end if;
    delete from public.push_sends where request_id = r.request_id;
  end loop;

  -- 2. Rapor yanıtları
  for r in execute
    'select q.request_id, h.status_code, h.content
     from public.push_receipt_requests q join net._http_response h on h.id = q.request_id'
  loop
    if r.status_code = 200 then
      begin
        perform public.push_apply_receipts(r.content::jsonb);
      exception when others then
        null;
      end;
    end if;
    delete from public.push_receipt_requests where request_id = r.request_id;
  end loop;

  -- Yanıtı hiç gelmeyenler (pg_net yanıtları birkaç saat tutar) ve Expo'nun artık tutmadığı raporlar
  delete from public.push_sends where created_at < now() - interval '1 day';
  delete from public.push_receipt_requests where created_at < now() - interval '1 day';
  delete from public.push_receipts where created_at < now() - interval '1 day';

  -- 3. Hazır olması beklenen raporları iste (tur başına en fazla 10 × 1000)
  for i in 1..10 loop
    select array_agg(ticket_id) into ids
    from (
      select ticket_id from public.push_receipts
      where created_at < now() - interval '15 minutes'
        and (requested_at is null or requested_at < now() - interval '1 hour')
      order by created_at
      limit 1000
    ) ready;
    exit when ids is null;
    execute 'select net.http_post(url := $1, body := $2)'
    into request
    using 'https://exp.host/--/api/v2/push/getReceipts', jsonb_build_object('ids', to_jsonb(ids));
    insert into public.push_receipt_requests (request_id, ticket_ids) values (request, ids);
    update public.push_receipts set requested_at = now() where ticket_id = any (ids);
  end loop;
end;
$$;

-- Gönderim: 20260930100000_notifications'taki tanımın aynısı; ek olarak istek kimliği ve jeton sırası saklanır
create or replace function public.on_notification_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  tokens text[];
  unread integer;
  request bigint;
begin
  -- pg_net yoksa (test ortamı) push atlanır
  if not exists (
    select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
    where s.nspname = 'net' and p.proname = 'http_post'
  ) then
    return null;
  end if;
  if exists (select 1 from public.profile_private where user_id = new.user_id and new.type = any (push_muted)) then
    return null;
  end if;

  unread := (select count(*) from public.notifications where user_id = new.user_id and read_at is null);
  select
    jsonb_agg(jsonb_build_object(
      'to', t.token,
      'body', public.notification_text(new, t.locale),
      'sound', 'default',
      'badge', unread,
      'data', jsonb_build_object('path', public.notification_path(new), 'id', new.id)
    ) order by t.token),
    array_agg(t.token order by t.token)
  into messages, tokens
  from public.push_tokens t
  where t.user_id = new.user_id;

  if messages is not null then
    execute 'select net.http_post(url := $1, body := $2)'
    into request
    using 'https://exp.host/--/api/v2/push/send', messages;
    insert into public.push_sends (request_id, tokens) values (request, tokens);
  end if;
  return null;
end;
$$;

revoke execute on function
  public.push_apply_tickets(text[], jsonb),
  public.push_apply_receipts(jsonb),
  public.push_maintenance()
from public, anon, authenticated;

-- Zamanlama: Supabase'de pg_cron hazır gelir (Integrations → Cron); burada açılır ve iş kurulur (aynı adla
-- yeniden çalıştırılırsa iş güncellenir). Testte (PGlite) pg_cron yok.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    execute $cron$select cron.schedule('push-token-cleanup', '*/15 * * * *', 'select public.push_maintenance()')$cron$;
  end if;
end;
$$;
