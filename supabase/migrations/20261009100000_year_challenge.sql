/**
 * Yıllık hedef yarışı: profildeki "2026 hedefin" kartından açılan sayfada sen ve takip ettiklerin.
 * Her kişi için yıllık hedef (yoksa null) ve o yıl puanlanan mekân sayısı. Sayım istemcideki `placesThisYear`
 * ile aynı: `rated_at` o yılın içinde. Yıl İstanbul saatine göre; verilmezse bu yıl. Engellenenler çıkar.
 * Sıra: hedefi olanlar önce (tamamlanma oranı, sonra sayı), hedefsizler en sonda (sayıya göre).
 */
create function public.year_challenge(p_year integer default null)
returns table (
  user_id uuid,
  profile jsonb,
  goal integer,
  done integer
)
language sql
stable
set search_path = ''
as $$
  with bounds as (
    select make_timestamptz(
      coalesce(p_year, extract(year from now() at time zone 'Europe/Istanbul')::integer),
      1, 1, 0, 0, 0, 'Europe/Istanbul'
    ) as start_at
  ),
  members as (
    select pr.id, pr.year_goal
    from public.profiles pr
    where (
        pr.id = auth.uid()
        or pr.id in (select f.followee_id from public.follows f where f.follower_id = auth.uid())
      )
      and not public.is_blocked_between(auth.uid(), pr.id)
  ),
  counted as (
    select
      m.id,
      m.year_goal::integer as goal,
      (
        select count(*)::integer
        from public.rankings r, bounds b
        where r.user_id = m.id
          and r.rated_at >= b.start_at
          and r.rated_at < b.start_at + interval '1 year'
      ) as done
    from members m
  )
  select c.id, public.profile_json(p), c.goal, c.done
  from counted c
  join public.profiles p on p.id = c.id
  order by c.goal is null, (c.done::numeric / nullif(c.goal, 0)) desc nulls last, c.done desc, p.name
$$;

revoke execute on function public.year_challenge(integer) from public, anon;
grant execute on function public.year_challenge(integer) to authenticated;
