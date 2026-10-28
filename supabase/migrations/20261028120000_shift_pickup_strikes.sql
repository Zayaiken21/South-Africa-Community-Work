-- Upgrade 1: workers pick up shifts themselves, strikes for cancellations and no-shows, suspension and appeals.
-- Safe to run again. Run in Supabase → SQL Editor, after 20261028000000_marketplace.sql. Safe to run on a live database.

alter table public.app_settings
  add column if not exists strike_limit int not null default 3 check (strike_limit between 1 and 10),
  add column if not exists cancel_grace_minutes int not null default 10 check (cancel_grace_minutes between 0 and 120);

alter table public.profiles
  add column if not exists suspended_reason text check (char_length(suspended_reason) <= 200),
  add column if not exists suspended_at timestamptz,
  add column if not exists strikes int not null default 0 check (strikes >= 0);

create or replace function public.public_settings()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('min_hourly_zar', min_hourly_zar, 'platform_fee_percent', platform_fee_percent,
                           'strike_limit', strike_limit, 'cancel_grace_minutes', cancel_grace_minutes) from app_settings where id = 1;
$$;

-- True only for the server: the service-role key, or a direct database session with no signed-in user
-- (migrations, the SQL editor). Checks the callers token, not current_user, which inside a
-- security-definer function is always the function owner.
create or replace function public.is_service()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(current_setting('cw.system', true), '') = 'on'
      or (coalesce(auth.jwt() ->> 'sub', '') = '' and coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated')
          and session_user in ('postgres', 'supabase_admin'));
$$;

-- Users cant grant themselves verified/payout/suspension flags or change account type after hiring starts.
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended
     or new.strikes is distinct from old.strikes or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.account_type is distinct from old.account_type and (
       exists (select 1 from shifts where business_id = old.id) or exists (select 1 from applications where worker_id = old.id)) then
    raise exception 'Account type can''t change once you have shifts or applications.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Workers pick up shifts themselves: a new booking is confirmed straight away if a spot is free.
-- The shift row is locked first, so two workers cant take the last spot at the same moment.
create or replace function public.applications_pickup() returns trigger language plpgsql security definer set search_path = public as $$
declare s shifts; booked int;
begin
  select * into s from shifts where id = new.shift_id for update;
  if s.id is null or s.status <> 'open' or s.starts_at <= now() then raise exception 'This shift is no longer available.'; end if;
  select count(*) into booked from applications where shift_id = s.id and status in ('accepted', 'completed');
  if booked >= s.workers_needed then raise exception 'Someone just took the last spot on this shift.'; end if;
  if exists (select 1 from applications a join shifts o on o.id = a.shift_id
             where a.worker_id = new.worker_id and a.status = 'accepted' and o.starts_at < s.ends_at and o.ends_at > s.starts_at) then
    raise exception 'You already have a shift at that time.';
  end if;
  new.status := 'accepted';
  new.hours_worked := null; new.business_confirmed_at := null; new.worker_confirmed_at := null;
  new.created_at := now(); new.updated_at := now();
  return new;
end $$;
drop trigger if exists applications_pickup on public.applications;
drop trigger if exists applications_pickup on public.applications;
create trigger applications_pickup before insert on public.applications for each row execute function public.applications_pickup();

-- Who may change what: workers cancel or confirm hours; businesses complete, mark no-shows, release a worker and confirm hours.

create or replace function public.applications_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare s shifts; is_worker boolean; is_business boolean; booked int;
begin
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  select * into s from shifts where id = new.shift_id;
  is_worker := old.worker_id = auth.uid();
  is_business := s.business_id = auth.uid();
  if new.shift_id <> old.shift_id or new.worker_id <> old.worker_id then raise exception 'Not allowed.'; end if;
  if is_worker and not is_business then
    if new.status <> old.status and not (old.status in ('applied', 'accepted') and new.status = 'withdrawn' and s.starts_at > now()) then
      raise exception 'You can only cancel before the shift starts.';
    end if;
    if new.hours_worked is distinct from old.hours_worked or new.business_confirmed_at is distinct from old.business_confirmed_at then
      raise exception 'Only the business records hours.';
    end if;
    if new.worker_confirmed_at is distinct from old.worker_confirmed_at and new.worker_confirmed_at is not null then new.worker_confirmed_at := now(); end if;
  elsif is_business then
    if new.status <> old.status and not (
         (old.status = 'applied' and new.status in ('accepted', 'declined')) or
         (old.status = 'accepted' and new.status in ('completed', 'no_show', 'declined'))) then
      raise exception 'That status change isn''t allowed.';
    end if;
    if new.worker_confirmed_at is distinct from old.worker_confirmed_at or new.message is distinct from old.message then raise exception 'Not allowed.'; end if;
    if new.status = 'accepted' and old.status <> 'accepted' then
      select count(*) into booked from applications where shift_id = s.id and status in ('accepted', 'completed');
      if booked >= s.workers_needed then raise exception 'This shift is already fully booked.'; end if;
    end if;
    if new.business_confirmed_at is distinct from old.business_confirmed_at and new.business_confirmed_at is not null then new.business_confirmed_at := now(); end if;
  else
    raise exception 'Not allowed.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Strikes: a worker who cancels a shift they picked up, or doesnt show up, gets a strike.
-- At the strike limit (3 by default) the account is suspended until staff approve an appeal; the count then
-- starts again, so every further 3 strikes means another suspension. Cancelling within a few minutes of
-- picking up (a mis-tap) is free.
create table if not exists public.strikes (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  application_id uuid references public.applications (id) on delete set null,
  kind text not null check (kind in ('cancelled', 'no_show')),
  at timestamptz not null default now()
);
create index if not exists strikes_worker_idx on public.strikes (worker_id, at desc);
alter table public.strikes enable row level security;
drop policy if exists "worker sees own strikes" on public.strikes;
drop policy if exists "worker sees own strikes" on public.strikes;
create policy "worker sees own strikes" on public.strikes for select using (worker_id = auth.uid());
drop policy if exists "staff see strikes" on public.strikes;
drop policy if exists "staff see strikes" on public.strikes;
create policy "staff see strikes" on public.strikes for select using (public.is_staff());

create or replace function public.applications_strike() returns trigger language plpgsql security definer set search_path = public as $$
declare cfg app_settings; total int;
begin
  if old.status <> 'accepted' or new.status not in ('withdrawn', 'no_show') then return new; end if;
  select * into cfg from app_settings where id = 1;
  if new.status = 'withdrawn' and old.created_at > now() - make_interval(mins => cfg.cancel_grace_minutes) then return new; end if;
  insert into strikes (worker_id, application_id, kind) values (new.worker_id, new.id, case when new.status = 'no_show' then 'no_show' else 'cancelled' end);
  perform set_config('cw.system', 'on', true);
  update profiles set strikes = strikes + 1 where id = new.worker_id returning strikes into total;
  if total >= cfg.strike_limit then
    update profiles set suspended = true, suspended_at = now(), strikes = 0,
           suspended_reason = format('%s cancelled or missed shifts', cfg.strike_limit) where id = new.worker_id;
    insert into audit_log (actor, action, target, details) values (auth.uid(), 'user.auto_suspended', new.worker_id::text,
           jsonb_build_object('reason', 'strikes', 'limit', cfg.strike_limit, 'last', new.status));
  end if;
  perform set_config('cw.system', 'off', true);
  return new;
end $$;
drop trigger if exists applications_strike on public.applications;
drop trigger if exists applications_strike on public.applications;
create trigger applications_strike after update of status on public.applications for each row execute function public.applications_strike();

-- Appeals: a suspended user explains what happened; staff approve (account restored) or deny.
create table if not exists public.appeals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (char_length(reason) between 10 and 2000),
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  response text check (char_length(response) <= 1000),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists appeals_one_pending on public.appeals (user_id) where status = 'pending';
alter table public.appeals enable row level security;
drop policy if exists "own appeals" on public.appeals;
drop policy if exists "own appeals" on public.appeals;
create policy "own appeals" on public.appeals for select using (user_id = auth.uid());
drop policy if exists "staff see appeals" on public.appeals;
drop policy if exists "staff see appeals" on public.appeals;
create policy "staff see appeals" on public.appeals for select using (public.is_staff());
create or replace function public.can_appeal() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and suspended)
     and not exists (select 1 from appeals where user_id = auth.uid() and status = 'pending');
$$;
drop policy if exists "suspended users appeal" on public.appeals;
drop policy if exists "suspended users appeal" on public.appeals;
create policy "suspended users appeal" on public.appeals for insert
  with check (user_id = auth.uid() and status = 'pending' and response is null and reviewed_by is null and public.can_appeal());

drop policy if exists "worker applies" on public.applications;
drop policy if exists "worker picks up shifts" on public.applications;
drop policy if exists "worker picks up shifts" on public.applications;
create policy "worker picks up shifts" on public.applications for insert with check (worker_id = auth.uid() and public.can_apply(shift_id));

drop function if exists public.admin_users(text, int, int);
create or replace function public.admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, account_type account_type, full_name text, business_name text, city text, province text,
               verified boolean, suspended boolean, payout_ready boolean, created_at timestamptz, last_sign_in_at timestamptz,
               strikes int, total_strikes bigint, suspended_reason text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.account_type, p.full_name, p.business_name, p.city, p.province, p.verified, p.suspended, p.payout_ready,
         u.created_at, u.last_sign_in_at, p.strikes, (select count(*) from strikes s where s.worker_id = p.id), p.suspended_reason
  from profiles p join auth.users u on u.id = p.id
  where public.is_staff()
    and (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or p.business_name ilike '%' || p_search || '%')
  order by u.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;

create or replace function public.admin_set_flags(p_user uuid, p_verified boolean default null, p_suspended boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update profiles set verified = coalesce(p_verified, verified), suspended = coalesce(p_suspended, suspended),
         suspended_at = case when p_suspended then now() when p_suspended = false then null else suspended_at end,
         suspended_reason = case when p_suspended then 'Suspended by Community Work' when p_suspended = false then null else suspended_reason end,
         strikes = case when p_suspended = false then 0 else strikes end
   where id = p_user;
  if p_suspended = false then
    update appeals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), response = coalesce(response, 'Account restored.')
     where user_id = p_user and status = 'pending';
  end if;
  perform audit('user.flags', p_user::text, jsonb_build_object('verified', p_verified, 'suspended', p_suspended));
end $$;

drop function if exists public.admin_set_settings(numeric, numeric);
create or replace function public.admin_set_settings(p_min_hourly numeric default null, p_fee_percent numeric default null,
                                                     p_strike_limit int default null, p_cancel_grace int default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can change settings.'; end if;
  update app_settings set min_hourly_zar = coalesce(p_min_hourly, min_hourly_zar), platform_fee_percent = coalesce(p_fee_percent, platform_fee_percent),
         strike_limit = coalesce(p_strike_limit, strike_limit), cancel_grace_minutes = coalesce(p_cancel_grace, cancel_grace_minutes), updated_at = now() where id = 1;
  perform audit('settings.changed', null, jsonb_build_object('min_hourly_zar', p_min_hourly, 'fee_percent', p_fee_percent,
                                                             'strike_limit', p_strike_limit, 'cancel_grace_minutes', p_cancel_grace));
end $$;

-- Appeals queue and decision. Approving restores the account and clears the strike count.
create or replace function public.admin_appeals(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, full_name text, reason text, status text, response text,
               suspended_reason text, total_strikes bigint, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, u.email::text, coalesce(p.business_name, p.full_name), a.reason, a.status, a.response, p.suspended_reason,
         (select count(*) from strikes s where s.worker_id = a.user_id), a.created_at, a.reviewed_at
  from appeals a join profiles p on p.id = a.user_id join auth.users u on u.id = a.user_id
  where public.is_staff() and (p_status = 'all' or a.status = p_status)
  order by a.created_at desc limit 200;
$$;
create or replace function public.admin_review_appeal(p_appeal uuid, p_approve boolean, p_response text default null)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update appeals set status = case when p_approve then 'approved' else 'denied' end, response = left(p_response, 1000),
         reviewed_by = auth.uid(), reviewed_at = now()
   where id = p_appeal and status = 'pending' returning user_id into uid;
  if uid is null then raise exception 'This appeal has already been decided.'; end if;
  if p_approve then
    update profiles set suspended = false, suspended_at = null, suspended_reason = null, strikes = 0 where id = uid;
  end if;
  perform audit(case when p_approve then 'appeal.approved' else 'appeal.denied' end, uid::text, jsonb_build_object('appeal', p_appeal));
end $$;

-- Dashboard numbers for the last p_days days.
create or replace function public.admin_stats(p_days int default 30) returns json language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => least(greatest(p_days, 1), 365)); result json;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select json_build_object(
    'users', (select json_build_object('total', count(*), 'workers', count(*) filter (where account_type = 'worker'),
                                       'businesses', count(*) filter (where account_type = 'business'),
                                       'new', count(*) filter (where created_at >= since)) from profiles),
    'shifts', (select json_build_object('open', count(*) filter (where status = 'open'), 'filled', count(*) filter (where status = 'filled'),
                                        'completed', count(*) filter (where status = 'completed'), 'posted', count(*) filter (where created_at >= since)) from shifts),
    'applications', (select count(*) from applications where created_at >= since),
    'reliability', (select json_build_object('suspended', (select count(*) from profiles where suspended),
                                             'appeals_pending', (select count(*) from appeals where status = 'pending'),
                                             'strikes', (select count(*) from strikes where at >= since),
                                             'cancellations', (select count(*) from strikes where kind = 'cancelled' and at >= since),
                                             'no_shows', (select count(*) from strikes where kind = 'no_show' and at >= since))),
    'payments', (select json_build_object('held_zar', coalesce(sum(amount_zar) filter (where state = 'funded'), 0),
                                          'released_zar', coalesce(sum(amount_zar) filter (where state = 'released' and released_at >= since), 0),
                                          'fees_zar', coalesce(sum(fee_zar) filter (where state = 'released' and released_at >= since), 0),
                                          'awaiting', count(*) filter (where state = 'awaiting_payment'),
                                          'disputed', count(*) filter (where state = 'disputed')) from payments),
    'traffic', (select json_build_object('page_views', count(*) filter (where type = 'page_view'),
                                         'visitors', count(distinct visitor_id),
                                         'apply_clicks', count(*) filter (where type = 'apply_click'),
                                         'sponsored_clicks', count(*) filter (where type = 'sponsored_click'),
                                         'sponsored_views', count(*) filter (where type = 'sponsored_view'),
                                         'ad_views', count(*) filter (where type = 'ad_view'),
                                         'sign_ups', count(*) filter (where type = 'sign_up')) from events where at >= since),
    'daily', (select coalesce(json_agg(d order by d.day), '[]') from (
                select date_trunc('day', at)::date as day, count(*) filter (where type = 'page_view') as views,
                       count(distinct visitor_id) as visitors, count(*) filter (where type in ('apply_click', 'sponsored_click', 'outbound_click')) as clicks
                from events where at >= since group by 1) d),
    'top_pages', (select coalesce(json_agg(t), '[]') from (select path, count(*) as views from events where type = 'page_view' and at >= since group by path order by 2 desc limit 10) t),
    'top_sponsored', (select coalesce(json_agg(t), '[]') from (select target, count(*) filter (where type = 'sponsored_click') as clicks, count(*) filter (where type = 'sponsored_view') as views
                       from events where type in ('sponsored_click', 'sponsored_view') and at >= since group by target order by 2 desc limit 10) t),
    'top_jobs', (select coalesce(json_agg(t), '[]') from (select target, count(*) as clicks from events where type = 'apply_click' and at >= since group by target order by 2 desc limit 10) t)
  ) into result;
  return result;
end $$;

revoke execute on function public.admin_add(text), public.admin_remove(uuid), public.admin_list_staff(), public.admin_users(text, int, int),
  public.admin_set_flags(uuid, boolean, boolean), public.admin_set_settings(numeric, numeric, int, int), public.admin_stats(int), public.admin_live(int),
  public.admin_appeals(text), public.admin_review_appeal(uuid, boolean, text) from public, anon;
grant execute on function public.admin_add(text), public.admin_remove(uuid), public.admin_list_staff(), public.admin_users(text, int, int),
  public.admin_set_flags(uuid, boolean, boolean), public.admin_set_settings(numeric, numeric, int, int), public.admin_stats(int), public.admin_live(int),
  public.admin_appeals(text), public.admin_review_appeal(uuid, boolean, text) to authenticated;
grant execute on function public.public_settings() to anon, authenticated;

grant select on public.strikes, public.appeals to authenticated;
grant insert on public.appeals to authenticated;
