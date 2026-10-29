-- ALL UPDATES IN ONE FILE (updates 1–11, 29 Oct 2026). Paste everything into a NEW query in Supabase SQL Editor and press Run.
-- Safe to run more than once. Run AFTER the first file (20261028000000_marketplace.sql), which you already ran.

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

-- Upgrade 2: one account can both work and hire (switch between "Working" and "Hiring"), detailed profiles
-- with a profile photo and colour theme, and a public profile card.
-- Safe to run again. Run in Supabase → SQL Editor, AFTER 20261028120000_shift_pickup_strikes.sql. Keeps all existing data.

-- ---------------------------------------------------------------- modes and profile details
alter table public.profiles
  add column if not exists can_work boolean not null default true,
  add column if not exists can_hire boolean not null default false,
  add column if not exists active_mode public.account_type not null default 'worker',
  add column if not exists avatar_url text check (char_length(avatar_url) <= 500),
  add column if not exists theme text not null default 'savanna'
    check (theme in ('savanna', 'ocean', 'sunset', 'jacaranda', 'ruby', 'gold', 'midnight', 'fynbos')),
  add column if not exists languages text[] not null default '{}' check (coalesce(array_length(languages, 1), 0) <= 12),
  add column if not exists availability text[] not null default '{}'
    check (availability <@ array['mon','tue','wed','thu','fri','sat','sun','mornings','afternoons','evenings','nights']::text[]),
  add column if not exists has_transport boolean,
  add column if not exists drivers_licence text check (drivers_licence in ('none', 'code8', 'code10', 'code14', 'other')),
  add column if not exists education text check (char_length(education) <= 200),
  add column if not exists experience jsonb not null default '[]'
    check (jsonb_typeof(experience) = 'array' and jsonb_array_length(experience) <= 12 and pg_column_size(experience) <= 8000),
  add column if not exists business_type text check (char_length(business_type) <= 60),
  add column if not exists business_hours text check (char_length(business_hours) <= 120),
  add column if not exists website text check (website ~ '^https?://[^\s]+$' and char_length(website) <= 200);

-- Existing accounts keep what they signed up as.
update public.profiles set can_hire = true, can_work = false, active_mode = 'business'
 where account_type = 'business' and active_mode = 'worker' and not can_hire;

alter table public.profiles drop constraint if exists profiles_has_a_mode, drop constraint if exists profiles_mode_enabled;
alter table public.profiles
  add constraint profiles_has_a_mode check (can_work or can_hire),
  add constraint profiles_mode_enabled check ((active_mode = 'worker' and can_work) or (active_mode = 'business' and can_hire));

-- New sign-ups: "Find work" turns on working, "Hire workers" turns on hiring. The other can be switched on later.
create or replace function public.handle_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
declare biz boolean := coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'business';
begin
  if tg_op = 'INSERT' then
    insert into profiles (id, account_type, active_mode, can_work, can_hire, full_name, business_name)
    values (new.id,
            case when biz then 'business'::account_type else 'worker'::account_type end,
            case when biz then 'business'::account_type else 'worker'::account_type end,
            not biz, biz,
            left(new.raw_user_meta_data ->> 'full_name', 120),
            left(new.raw_user_meta_data ->> 'business_name', 120))
    on conflict (id) do nothing;
  end if;
  if new.email_confirmed_at is not null and lower(new.email) = (select lower(ceo_email) from app_settings where id = 1) then
    insert into staff (user_id, role) values (new.id, 'ceo') on conflict (user_id) do update set role = 'ceo';
    insert into audit_log (actor, action, target) values (new.id, 'ceo.confirmed', new.email);
  end if;
  return new;
end $$;

-- What a user may change on their own profile. account_type now simply follows the mode they have switched to.
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.account_type := new.active_mode;
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended
     or new.strikes is distinct from old.strikes or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at or new.created_at is distinct from old.created_at then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and not (new.avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.avatar_url) > 0) then
    raise exception 'Upload your profile photo from your account page.';
  end if;
  if new.can_hire and not old.can_hire and coalesce(trim(new.business_name), '') = '' then
    raise exception 'Add your business name to start hiring.';
  end if;
  if old.can_hire and not new.can_hire and exists (
       select 1 from shifts s where s.business_id = old.id and s.ends_at > now() and s.status in ('open', 'filled', 'in_progress')) then
    raise exception 'Finish or delete your upcoming shifts before turning off hiring.';
  end if;
  if old.can_work and not new.can_work and exists (
       select 1 from applications a join shifts s on s.id = a.shift_id where a.worker_id = old.id and a.status = 'accepted' and s.ends_at > now()) then
    raise exception 'Finish or cancel your upcoming shifts before turning off working.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Posting needs hiring switched on; picking up shifts needs working switched on. Either way, not suspended.
create or replace function public.is_active(p_type account_type) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not suspended
                 and case when p_type = 'worker' then can_work else can_hire end);
$$;

-- ---------------------------------------------------------------- profile photos (public images)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "own avatar upload" on storage.objects;
create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar replace" on storage.objects;
create policy "own avatar replace" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar delete" on storage.objects;
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "own avatar list" on storage.objects;
create policy "own avatar list" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------- profile card
-- True when the signed-in user and p_other have a confirmed booking together (either side).
create or replace function public.booked_together(p_other uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications a join shifts s on s.id = a.shift_id
                 where a.status in ('accepted', 'completed')
                   and ((a.worker_id = auth.uid() and s.business_id = p_other) or (a.worker_id = p_other and s.business_id = auth.uid())));
$$;

-- A profile page for any signed-in user. Phone number only for people booked together; CV only for
-- businesses the worker picked up a shift with, staff and the owner.
create or replace function public.profile_card(p_id uuid) returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', p.id, 'is_me', p.id = auth.uid(), 'full_name', p.full_name, 'headline', p.headline, 'bio', p.bio, 'skills', p.skills,
    'city', p.city, 'province', p.province, 'avatar_url', p.avatar_url, 'theme', p.theme, 'languages', p.languages,
    'availability', p.availability, 'has_transport', p.has_transport, 'drivers_licence', p.drivers_licence,
    'education', p.education, 'experience', p.experience, 'verified', p.verified, 'can_work', p.can_work, 'can_hire', p.can_hire,
    'business_name', p.business_name, 'business_type', p.business_type, 'business_hours', p.business_hours, 'website', p.website,
    'member_since', p.created_at,
    'shifts_completed', (select count(*) from applications a where a.worker_id = p.id and a.status = 'completed'),
    'strikes_total', (select count(*) from strikes k where k.worker_id = p.id),
    'shifts_posted', (select count(*) from shifts s where s.business_id = p.id),
    'workers_hired', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = p.id and a.status in ('accepted', 'completed')),
    'phone', case when p.id = auth.uid() or public.booked_together(p.id) or public.is_staff() then p.phone end,
    'resume_path', case when p.id = auth.uid() or public.is_my_applicant(p.id) or public.is_staff() then p.resume_path end)
  from profiles p
  where p.id = p_id and auth.uid() is not null and (not p.suspended or p.id = auth.uid() or public.is_staff());
$$;
revoke execute on function public.profile_card(uuid) from public, anon;
grant execute on function public.profile_card(uuid) to authenticated;

-- ---------------------------------------------------------------- shift board with the businesss photo and theme
drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, p.full_name, 'Local business') as business_name,
           p.verified as business_verified, p.avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;

-- ---------------------------------------------------------------- dashboard summaries for the signed-in user
create or replace function public.my_summary() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'worker', json_build_object(
      'upcoming', (select count(*) from applications a join shifts s on s.id = a.shift_id where a.worker_id = auth.uid() and a.status = 'accepted' and s.ends_at > now()),
      'completed', (select count(*) from applications a where a.worker_id = auth.uid() and a.status = 'completed'),
      'earned_zar', (select coalesce(sum(amount_zar), 0) from payments where worker_id = auth.uid() and state in ('released', 'cash_paid')),
      'held_zar', (select coalesce(sum(amount_zar), 0) from payments where worker_id = auth.uid() and state = 'funded'),
      'hours', (select coalesce(sum(hours_worked), 0) from applications where worker_id = auth.uid() and status = 'completed'),
      'next', (select json_build_object('id', s.id, 'title', s.title, 'city', s.city, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                                        'hourly_rate_zar', s.hourly_rate_zar, 'address', s.address)
               from applications a join shifts s on s.id = a.shift_id
               where a.worker_id = auth.uid() and a.status = 'accepted' and s.ends_at > now() order by s.starts_at limit 1)),
    'business', json_build_object(
      'open', (select count(*) from shifts where business_id = auth.uid() and status = 'open' and starts_at > now()),
      'upcoming', (select count(*) from shifts where business_id = auth.uid() and status in ('open', 'filled') and ends_at > now()),
      'booked', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = auth.uid() and a.status = 'accepted' and s.ends_at > now()),
      'hired_total', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = auth.uid() and a.status in ('accepted', 'completed')),
      'held_zar', (select coalesce(sum(amount_zar), 0) from payments where business_id = auth.uid() and state = 'funded'),
      'awaiting', (select count(*) from payments where business_id = auth.uid() and state = 'awaiting_payment'),
      'spent_zar', (select coalesce(sum(amount_zar + fee_zar), 0) from payments where business_id = auth.uid() and state in ('released', 'cash_paid'))))
  where auth.uid() is not null;
$$;
revoke execute on function public.my_summary() from public, anon;
grant execute on function public.my_summary() to authenticated;

-- Upgrade 3: two-step sign-in (authenticator app) becomes a choice, and old or deleted jobs are cleaned up.
-- Safe to run again. Run in Supabase → SQL Editor, AFTER 20261028140000_dual_accounts_profiles.sql. Keeps all live data.

-- ---------------------------------------------------------------- optional two-step sign-in for staff
-- Off by default. A staff member who switches on an authenticator always needs its code (a stolen password alone
-- still cant get in). The CEO can also require it for the whole team.
alter table public.app_settings add column if not exists require_staff_mfa boolean not null default false;

create or replace function public.staff_needs_mfa(p_user uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select require_staff_mfa from public.app_settings where id = 1), false)
      or exists (select 1 from auth.mfa_factors f where f.user_id = p_user and f.status::text = 'verified');
$$;
revoke execute on function public.staff_needs_mfa(uuid) from public, anon, authenticated;
grant execute on function public.staff_needs_mfa(uuid) to service_role;

create or replace function public.is_staff(require_mfa boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
     and (not require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2' or not public.staff_needs_mfa(auth.uid()));
$$;
create or replace function public.is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'ceo')
     and (coalesce(auth.jwt() ->> 'aal', '') = 'aal2' or not public.staff_needs_mfa(auth.uid()));
$$;

create or replace function public.public_settings()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('min_hourly_zar', min_hourly_zar, 'platform_fee_percent', platform_fee_percent,
                           'strike_limit', strike_limit, 'cancel_grace_minutes', cancel_grace_minutes,
                           'require_staff_mfa', require_staff_mfa) from app_settings where id = 1;
$$;
grant execute on function public.public_settings() to anon, authenticated;

drop function if exists public.admin_set_settings(numeric, numeric, int, int);
create or replace function public.admin_set_settings(p_min_hourly numeric default null, p_fee_percent numeric default null,
                                                     p_strike_limit int default null, p_cancel_grace int default null,
                                                     p_require_mfa boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can change settings.'; end if;
  if p_require_mfa and not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status::text = 'verified') then
    raise exception 'Switch on your own authenticator first, so you don''t lock yourself out.';
  end if;
  update app_settings set min_hourly_zar = coalesce(p_min_hourly, min_hourly_zar), platform_fee_percent = coalesce(p_fee_percent, platform_fee_percent),
         strike_limit = coalesce(p_strike_limit, strike_limit), cancel_grace_minutes = coalesce(p_cancel_grace, cancel_grace_minutes),
         require_staff_mfa = coalesce(p_require_mfa, require_staff_mfa), updated_at = now() where id = 1;
  perform audit('settings.changed', null, jsonb_build_object('min_hourly_zar', p_min_hourly, 'fee_percent', p_fee_percent,
                'strike_limit', p_strike_limit, 'cancel_grace_minutes', p_cancel_grace, 'require_staff_mfa', p_require_mfa));
end $$;
revoke execute on function public.admin_set_settings(numeric, numeric, int, int, boolean) from public, anon;
grant execute on function public.admin_set_settings(numeric, numeric, int, int, boolean) to authenticated;

-- ---------------------------------------------------------------- deleting jobs
-- A business can delete a shift nobody has worked or been paid for. Its bookings (cancelled ones included) go with it.
create or replace function public.shift_deletable(p_shift uuid) returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from payments where shift_id = p_shift)
     and not exists (select 1 from applications where shift_id = p_shift and status in ('accepted', 'completed', 'no_show'));
$$;
drop policy if exists "business deletes unbooked shifts" on public.shifts;
drop policy if exists "business deletes unworked shifts" on public.shifts;
create policy "business deletes unworked shifts" on public.shifts for delete
  using (business_id = auth.uid() and public.shift_deletable(id));

-- Strikes keep their record when the shift is deleted (application_id becomes empty), so deleting cant wipe a strike.

-- ---------------------------------------------------------------- automatic clean-up (saves database space)
-- Runs every night at 03:17 SAST. Removes only data nobody needs:
--   • shifts that ended over 7 days ago with nobody booked, and cancelled shifts over 7 days old
--   • cancelled/withdrawn/declined bookings over 30 days old (strike records are kept)
--   • visitor tracking older than 13 months (as the privacy page says)
--   • decided appeals older than 12 months
-- Shifts that were worked or paid are kept, because they are the record of what was earned.
create or replace function public.cleanup_old_data() returns json language plpgsql security definer set search_path = public as $$
declare d_shifts int; d_apps int; d_events int; d_appeals int;
begin
  perform set_config('cw.system', 'on', true);
  delete from shifts s
   where s.ends_at < now() - interval '7 days'
     and not exists (select 1 from payments p where p.shift_id = s.id)
     and not exists (select 1 from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed', 'no_show'));
  get diagnostics d_shifts = row_count;
  delete from shifts s where s.status = 'cancelled' and s.updated_at < now() - interval '7 days'
     and not exists (select 1 from payments p where p.shift_id = s.id);
  delete from applications a where a.status in ('withdrawn', 'declined') and a.updated_at < now() - interval '30 days'
     and not exists (select 1 from payments p where p.application_id = a.id);
  get diagnostics d_apps = row_count;
  delete from events where at < now() - interval '13 months';
  get diagnostics d_events = row_count;
  delete from appeals where status <> 'pending' and created_at < now() - interval '12 months';
  get diagnostics d_appeals = row_count;
  perform set_config('cw.system', 'off', true);
  insert into audit_log (actor, action, target, details)
  values (null, 'cleanup.ran', null, jsonb_build_object('shifts', d_shifts, 'bookings', d_apps, 'events', d_events, 'appeals', d_appeals));
  return json_build_object('shifts', d_shifts, 'bookings', d_apps, 'events', d_events, 'appeals', d_appeals);
end $$;
revoke execute on function public.cleanup_old_data() from public, anon, authenticated;

-- The CEO can also run it from the dashboard.
create or replace function public.admin_cleanup() returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can run the clean-up.'; end if;
  return public.cleanup_old_data();
end $$;
revoke execute on function public.admin_cleanup() from public, anon;
grant execute on function public.admin_cleanup() to authenticated;

-- Nightly schedule with pg_cron (built into Supabase). If pg_cron isnt switched on, this step is skipped:
-- turn it on under Database → Extensions → pg_cron, then run this files last block again.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'community-work-cleanup';
  perform cron.schedule('community-work-cleanup', '17 1 * * *', 'select public.cleanup_old_data()');
exception when others then
  raise notice 'Nightly clean-up not scheduled (%). Turn on pg_cron in Database → Extensions and run this block again.', sqlerrm;
end $$;

-- Update 4: one mode at a time. An account is either Working or Hiring. Switching is done with the
-- Working / Hiring switch on the dashboard. Picking up shifts only works in Working mode, posting only in Hiring mode.
-- Safe to run again. Run after the earlier updates.

create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_mode = 'business' then
    new.can_hire := true;
    if coalesce(trim(new.business_name), '') = '' then
      raise exception 'Add your business name to start hiring.';
    end if;
  else
    new.can_work := true;
  end if;
  new.account_type := new.active_mode;
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended
     or new.strikes is distinct from old.strikes or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at or new.created_at is distinct from old.created_at then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and not (new.avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.avatar_url) > 0) then
    raise exception 'Upload your profile photo from your account page.';
  end if;
  new.updated_at := now();
  return new;
end $$;

create or replace function public.is_active(p_type account_type) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not suspended and active_mode = p_type);
$$;

-- Update 5: cancelled shifts open up again (and can be re-booked), businesses can block workers,
-- Community Work can ban accounts for good, and workers only ever see the business side of a hiring account.
-- Safe to run again. Run after the earlier updates.

-- ---------------------------------------------------------------- new profile fields
alter table public.profiles
  add column if not exists business_bio text check (char_length(business_bio) <= 1000),
  add column if not exists business_avatar_url text check (char_length(business_avatar_url) <= 500),
  add column if not exists banned boolean not null default false;

create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.active_mode = 'business' then
    new.can_hire := true;
    if coalesce(trim(new.business_name), '') = '' then
      raise exception 'Add your business name to start hiring.';
    end if;
  else
    new.can_work := true;
  end if;
  new.account_type := new.active_mode;
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended
     or new.strikes is distinct from old.strikes or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at or new.created_at is distinct from old.created_at
     or new.banned is distinct from old.banned then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and not (new.avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.avatar_url) > 0) then
    raise exception 'Upload your profile photo from your account page.';
  end if;
  if new.business_avatar_url is distinct from old.business_avatar_url and new.business_avatar_url is not null
     and not (new.business_avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.business_avatar_url) > 0) then
    raise exception 'Upload your business logo from your account page.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- Workers no longer read the business owner row directly; they use profile_card(id, 'business'), which shows only the business.
drop policy if exists "worker sees employers" on public.profiles;

-- ---------------------------------------------------------------- re-booking after a cancellation
-- One active booking per worker per shift, but a cancelled booking no longer blocks booking the shift again.
alter table public.applications drop constraint if exists applications_shift_id_worker_id_key;
create unique index if not exists applications_one_active on public.applications (shift_id, worker_id)
  where status in ('applied', 'accepted', 'completed', 'no_show');

-- ---------------------------------------------------------------- businesses blocking workers
create table if not exists public.business_blocks (
  business_id uuid not null references public.profiles (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  reason text check (char_length(reason) <= 300),
  created_at timestamptz not null default now(),
  primary key (business_id, worker_id),
  check (business_id <> worker_id)
);
create index if not exists business_blocks_worker_idx on public.business_blocks (worker_id);
alter table public.business_blocks enable row level security;
drop policy if exists "business sees own blocks" on public.business_blocks;
create policy "business sees own blocks" on public.business_blocks for select using (business_id = auth.uid());
drop policy if exists "business blocks workers" on public.business_blocks;
create policy "business blocks workers" on public.business_blocks for insert with check (business_id = auth.uid() and public.is_active('business'));
drop policy if exists "business unblocks workers" on public.business_blocks;
create policy "business unblocks workers" on public.business_blocks for delete using (business_id = auth.uid());
drop policy if exists "staff see blocks" on public.business_blocks;
create policy "staff see blocks" on public.business_blocks for select using (public.is_staff());

create or replace function public.blocked_by(p_business uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_blocks where business_id = p_business and worker_id = auth.uid());
$$;

create or replace function public.my_blocked_workers() returns table (worker_id uuid, full_name text, avatar_url text, theme text, reason text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select b.worker_id, p.full_name, p.avatar_url, p.theme, b.reason, b.created_at
  from business_blocks b join profiles p on p.id = b.worker_id
  where b.business_id = auth.uid() order by b.created_at desc;
$$;
revoke execute on function public.my_blocked_workers() from public, anon;
grant execute on function public.my_blocked_workers() to authenticated;

-- ---------------------------------------------------------------- picking up shifts
create or replace function public.applications_pickup() returns trigger language plpgsql security definer set search_path = public as $$
declare s shifts; booked int;
begin
  select * into s from shifts where id = new.shift_id for update;
  if s.id is null or s.status <> 'open' or s.starts_at <= now() then raise exception 'This shift is no longer available.'; end if;
  if exists (select 1 from business_blocks where business_id = s.business_id and worker_id = new.worker_id) then
    raise exception 'This business is not taking bookings from you.';
  end if;
  if exists (select 1 from applications where shift_id = s.id and worker_id = new.worker_id and status = 'declined') then
    raise exception 'The business released you from this shift, so it can not be booked again.';
  end if;
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

-- ---------------------------------------------------------------- shift board
-- Full shifts disappear for everyone until a spot opens again; a blocked worker never sees that business.
drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, 'Local business') as business_name,
           p.verified as business_verified, p.business_avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended
      and (auth.uid() is null or not exists (select 1 from business_blocks b where b.business_id = s.business_id and b.worker_id = auth.uid()))
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;

-- ---------------------------------------------------------------- profile pages
-- p_view = worker: the personal worker profile. p_view = business: only the business (name, logo, about, hours, stats),
-- never the owner behind it.
drop function if exists public.profile_card(uuid);
create or replace function public.profile_card(p_id uuid, p_view text default 'worker') returns json
language sql stable security definer set search_path = public as $$
  select case when p_view = 'business' then
    case when p.can_hire then json_build_object(
      'id', p.id, 'view', 'business', 'is_me', p.id = auth.uid(),
      'business_name', coalesce(p.business_name, 'Local business'), 'business_type', p.business_type, 'bio', p.business_bio,
      'avatar_url', p.business_avatar_url, 'theme', p.theme, 'business_hours', p.business_hours, 'website', p.website,
      'city', p.city, 'province', p.province, 'verified', p.verified, 'member_since', p.created_at,
      'shifts_posted', (select count(*) from shifts s where s.business_id = p.id),
      'workers_hired', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = p.id and a.status in ('accepted', 'completed')),
      'shifts_paid', (select count(*) from payments y where y.business_id = p.id and y.state in ('released', 'cash_paid')),
      'phone', case when p.id = auth.uid() or public.booked_together(p.id) or public.is_staff() then p.phone end) end
  else json_build_object(
    'id', p.id, 'view', 'worker', 'is_me', p.id = auth.uid(), 'full_name', p.full_name, 'headline', p.headline, 'bio', p.bio,
    'skills', p.skills, 'city', p.city, 'province', p.province, 'avatar_url', p.avatar_url, 'theme', p.theme, 'languages', p.languages,
    'availability', p.availability, 'has_transport', p.has_transport, 'drivers_licence', p.drivers_licence,
    'education', p.education, 'experience', p.experience, 'verified', p.verified, 'member_since', p.created_at,
    'shifts_completed', (select count(*) from applications a where a.worker_id = p.id and a.status = 'completed'),
    'strikes_total', (select count(*) from strikes k where k.worker_id = p.id),
    'blocked_by_me', exists (select 1 from business_blocks b where b.business_id = auth.uid() and b.worker_id = p.id),
    'phone', case when p.id = auth.uid() or public.booked_together(p.id) or public.is_staff() then p.phone end,
    'resume_path', case when p.id = auth.uid() or public.is_my_applicant(p.id) or public.is_staff() then p.resume_path end)
  end
  from profiles p
  where p.id = p_id and auth.uid() is not null and (not p.suspended or p.id = auth.uid() or public.is_staff());
$$;
revoke execute on function public.profile_card(uuid, text) from public, anon;
grant execute on function public.profile_card(uuid, text) to authenticated;

-- ---------------------------------------------------------------- permanent bans by Community Work
create or replace function public.can_appeal() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and suspended and not banned)
     and not exists (select 1 from appeals where user_id = auth.uid() and status = 'pending');
$$;

drop function if exists public.admin_set_flags(uuid, boolean, boolean);
create or replace function public.admin_set_flags(p_user uuid, p_verified boolean default null, p_suspended boolean default null,
                                                  p_banned boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if p_user = auth.uid() and (p_suspended or p_banned) then raise exception 'You can not suspend or ban yourself.'; end if;
  if exists (select 1 from staff where user_id = p_user and role = 'ceo') and (p_suspended or p_banned) then
    raise exception 'The CEO account can not be suspended or banned.';
  end if;
  if p_banned then
    update profiles set banned = true, suspended = true, suspended_at = now(), suspended_reason = 'Closed by Community Work' where id = p_user;
    update appeals set status = 'denied', reviewed_by = auth.uid(), reviewed_at = now(), response = coalesce(response, 'Account closed.')
     where user_id = p_user and status = 'pending';
  elsif p_banned = false then
    update profiles set banned = false, suspended = false, suspended_at = null, suspended_reason = null, strikes = 0 where id = p_user;
  end if;
  update profiles set verified = coalesce(p_verified, verified),
         suspended = case when p_banned is null then coalesce(p_suspended, suspended) else suspended end,
         suspended_at = case when p_banned is not null then suspended_at when p_suspended then now() when p_suspended = false then null else suspended_at end,
         suspended_reason = case when p_banned is not null then suspended_reason when p_suspended then 'Suspended by Community Work' when p_suspended = false then null else suspended_reason end,
         strikes = case when p_suspended = false then 0 else strikes end
   where id = p_user;
  if p_suspended = false then
    update profiles set banned = false where id = p_user;
    update appeals set status = 'approved', reviewed_by = auth.uid(), reviewed_at = now(), response = coalesce(response, 'Account restored.')
     where user_id = p_user and status = 'pending';
  end if;
  perform audit('user.flags', p_user::text, jsonb_build_object('verified', p_verified, 'suspended', p_suspended, 'banned', p_banned));
end $$;
revoke execute on function public.admin_set_flags(uuid, boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_set_flags(uuid, boolean, boolean, boolean) to authenticated;

drop function if exists public.admin_users(text, int, int);
create or replace function public.admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, account_type account_type, full_name text, business_name text, city text, province text,
               verified boolean, suspended boolean, payout_ready boolean, created_at timestamptz, last_sign_in_at timestamptz,
               strikes int, total_strikes bigint, suspended_reason text, banned boolean, blocked_by bigint)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.account_type, p.full_name, p.business_name, p.city, p.province, p.verified, p.suspended, p.payout_ready,
         u.created_at, u.last_sign_in_at, p.strikes, (select count(*) from strikes s where s.worker_id = p.id), p.suspended_reason, p.banned,
         (select count(*) from business_blocks b where b.worker_id = p.id)
  from profiles p join auth.users u on u.id = p.id
  where public.is_staff()
    and (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or p.business_name ilike '%' || p_search || '%')
  order by u.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;
revoke execute on function public.admin_users(text, int, int) from public, anon;
grant execute on function public.admin_users(text, int, int) to authenticated;

-- Update 6: a worker released from a shift no longer sees that shift on the board.
-- A worker blocked by a business sees none of that business's shifts until unblocked.
-- Safe to run again.

drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, 'Local business') as business_name,
           p.verified as business_verified, p.business_avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended
      and (auth.uid() is null or (
            not exists (select 1 from business_blocks b where b.business_id = s.business_id and b.worker_id = auth.uid())
        and not exists (select 1 from applications r where r.shift_id = s.id and r.worker_id = auth.uid() and r.status = 'declined')))
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;

-- Update 7: worker counts count people, not bookings. One worker on four shifts is one worker.
-- Safe to run again.

create or replace function public.my_summary() returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'worker', json_build_object(
      'upcoming', (select count(*) from applications a join shifts s on s.id = a.shift_id where a.worker_id = auth.uid() and a.status = 'accepted' and s.ends_at > now()),
      'completed', (select count(*) from applications a where a.worker_id = auth.uid() and a.status = 'completed'),
      'earned_zar', (select coalesce(sum(amount_zar), 0) from payments where worker_id = auth.uid() and state in ('released', 'cash_paid')),
      'held_zar', (select coalesce(sum(amount_zar), 0) from payments where worker_id = auth.uid() and state = 'funded'),
      'hours', (select coalesce(sum(hours_worked), 0) from applications where worker_id = auth.uid() and status = 'completed'),
      'next', (select json_build_object('id', s.id, 'title', s.title, 'city', s.city, 'starts_at', s.starts_at, 'ends_at', s.ends_at,
                                        'hourly_rate_zar', s.hourly_rate_zar, 'address', s.address)
               from applications a join shifts s on s.id = a.shift_id
               where a.worker_id = auth.uid() and a.status = 'accepted' and s.ends_at > now() order by s.starts_at limit 1)),
    'business', json_build_object(
      'open', (select count(*) from shifts where business_id = auth.uid() and status = 'open' and starts_at > now()),
      'upcoming', (select count(*) from shifts where business_id = auth.uid() and status in ('open', 'filled') and ends_at > now()),
      'booked', (select count(distinct a.worker_id) from applications a join shifts s on s.id = a.shift_id where s.business_id = auth.uid() and a.status = 'accepted' and s.ends_at > now()),
      'booked_shifts', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = auth.uid() and a.status = 'accepted' and s.ends_at > now()),
      'hired_total', (select count(distinct a.worker_id) from applications a join shifts s on s.id = a.shift_id where s.business_id = auth.uid() and a.status in ('accepted', 'completed')),
      'held_zar', (select coalesce(sum(amount_zar), 0) from payments where business_id = auth.uid() and state = 'funded'),
      'awaiting', (select count(*) from payments where business_id = auth.uid() and state = 'awaiting_payment'),
      'spent_zar', (select coalesce(sum(amount_zar + fee_zar), 0) from payments where business_id = auth.uid() and state in ('released', 'cash_paid'))))
  where auth.uid() is not null;
$$;
revoke execute on function public.my_summary() from public, anon;
grant execute on function public.my_summary() to authenticated;

drop function if exists public.profile_card(uuid);
create or replace function public.profile_card(p_id uuid, p_view text default 'worker') returns json
language sql stable security definer set search_path = public as $$
  select case when p_view = 'business' then
    case when p.can_hire then json_build_object(
      'id', p.id, 'view', 'business', 'is_me', p.id = auth.uid(),
      'business_name', coalesce(p.business_name, 'Local business'), 'business_type', p.business_type, 'bio', p.business_bio,
      'avatar_url', p.business_avatar_url, 'theme', p.theme, 'business_hours', p.business_hours, 'website', p.website,
      'city', p.city, 'province', p.province, 'verified', p.verified, 'member_since', p.created_at,
      'shifts_posted', (select count(*) from shifts s where s.business_id = p.id),
      'workers_hired', (select count(distinct a.worker_id) from applications a join shifts s on s.id = a.shift_id where s.business_id = p.id and a.status in ('accepted', 'completed')),
      'shifts_filled', (select count(*) from applications a join shifts s on s.id = a.shift_id where s.business_id = p.id and a.status in ('accepted', 'completed')),
      'shifts_paid', (select count(*) from payments y where y.business_id = p.id and y.state in ('released', 'cash_paid')),
      'phone', case when p.id = auth.uid() or public.booked_together(p.id) or public.is_staff() then p.phone end) end
  else json_build_object(
    'id', p.id, 'view', 'worker', 'is_me', p.id = auth.uid(), 'full_name', p.full_name, 'headline', p.headline, 'bio', p.bio,
    'skills', p.skills, 'city', p.city, 'province', p.province, 'avatar_url', p.avatar_url, 'theme', p.theme, 'languages', p.languages,
    'availability', p.availability, 'has_transport', p.has_transport, 'drivers_licence', p.drivers_licence,
    'education', p.education, 'experience', p.experience, 'verified', p.verified, 'member_since', p.created_at,
    'shifts_completed', (select count(*) from applications a where a.worker_id = p.id and a.status = 'completed'),
    'strikes_total', (select count(*) from strikes k where k.worker_id = p.id),
    'blocked_by_me', exists (select 1 from business_blocks b where b.business_id = auth.uid() and b.worker_id = p.id),
    'phone', case when p.id = auth.uid() or public.booked_together(p.id) or public.is_staff() then p.phone end,
    'resume_path', case when p.id = auth.uid() or public.is_my_applicant(p.id) or public.is_staff() then p.resume_path end)
  end
  from profiles p
  where p.id = p_id and auth.uid() is not null and (not p.suspended or p.id = auth.uid() or public.is_staff());
$$;
revoke execute on function public.profile_card(uuid, text) from public, anon;
grant execute on function public.profile_card(uuid, text) to authenticated;

-- Update 8: you never see your own business's shifts on the shift board (manage them under Shifts in Hiring mode).
-- Also keeps: released workers don't see that shift; blocked workers see none of that business's shifts. Safe to run again.

drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, 'Local business') as business_name,
           p.verified as business_verified, p.business_avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended
      and (auth.uid() is null or (
            not exists (select 1 from business_blocks b where b.business_id = s.business_id and b.worker_id = auth.uid())
        and not exists (select 1 from applications r where r.shift_id = s.id and r.worker_id = auth.uid() and r.status = 'declined')
        and s.business_id <> auth.uid()))
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;

-- Update 9: customer support queue (Randy hands over to a person) and shift-length rules from South African law.
-- Safe to run again. Run after the earlier updates.

-- ---------------------------------------------------------------- shift length: 4 to 12 hours
-- BCEA section 9A: anyone who works less than four hours on a day must be paid for four hours, so shifts are at least 4 hours.
-- BCEA section 10: no more than 12 hours in a day including overtime.
create or replace function public.shifts_length_rules() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at then
    if new.ends_at - new.starts_at < interval '4 hours' then
      raise exception 'Shifts must be at least 4 hours. By law, anyone who works less than 4 hours in a day is paid for 4.';
    end if;
    if new.ends_at - new.starts_at > interval '12 hours' then
      raise exception 'Shifts can be at most 12 hours, including overtime.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists shifts_length_rules on public.shifts;
create trigger shifts_length_rules before insert or update on public.shifts for each row execute function public.shifts_length_rules();

-- ---------------------------------------------------------------- support tickets
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  topic text not null default 'other' check (topic in ('account', 'shifts', 'payments', 'hiring', 'safety', 'appeal', 'jobs', 'other')),
  subject text not null check (char_length(subject) between 3 and 140),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists support_tickets_queue_idx on public.support_tickets (status, last_message_at);
create index if not exists support_tickets_user_idx on public.support_tickets (user_id, created_at desc);
alter table public.support_tickets enable row level security;

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  author uuid references public.profiles (id) on delete set null,
  from_staff boolean not null default false,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_ticket_idx on public.support_messages (ticket_id, created_at);
alter table public.support_messages enable row level security;

create or replace function public.my_ticket(p_ticket uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from support_tickets where id = p_ticket and user_id = auth.uid());
$$;

drop policy if exists "own tickets" on public.support_tickets;
create policy "own tickets" on public.support_tickets for select using (user_id = auth.uid());
drop policy if exists "staff see tickets" on public.support_tickets;
create policy "staff see tickets" on public.support_tickets for select using (public.is_staff());
drop policy if exists "users open tickets" on public.support_tickets;
create policy "users open tickets" on public.support_tickets for insert
  with check (user_id = auth.uid() and status = 'open'
              and (select count(*) from support_tickets t where t.user_id = auth.uid() and t.status <> 'closed') < 5);
drop policy if exists "users close own tickets" on public.support_tickets;
create policy "users close own tickets" on public.support_tickets for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "staff update tickets" on public.support_tickets;
create policy "staff update tickets" on public.support_tickets for update using (public.is_staff());

drop policy if exists "own ticket messages" on public.support_messages;
create policy "own ticket messages" on public.support_messages for select using (public.my_ticket(ticket_id));
drop policy if exists "staff see messages" on public.support_messages;
create policy "staff see messages" on public.support_messages for select using (public.is_staff());
drop policy if exists "users write on own tickets" on public.support_messages;
create policy "users write on own tickets" on public.support_messages for insert
  with check (author = auth.uid() and not from_staff and public.my_ticket(ticket_id));
drop policy if exists "staff reply" on public.support_messages;
create policy "staff reply" on public.support_messages for insert with check (author = auth.uid() and from_staff and public.is_staff());

-- Users can only close (or reopen) their own ticket; staff can change anything.
create or replace function public.support_tickets_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then
    if new.status = 'closed' and old.status <> 'closed' then new.closed_at := now(); end if;
    return new;
  end if;
  if new.user_id is distinct from old.user_id or new.topic is distinct from old.topic or new.subject is distinct from old.subject
     or new.created_at is distinct from old.created_at then
    raise exception 'Not allowed.';
  end if;
  if new.status is distinct from old.status and new.status not in ('closed', 'open') then raise exception 'Not allowed.'; end if;
  if new.status = 'closed' and old.status <> 'closed' then new.closed_at := now(); end if;
  return new;
end $$;
drop trigger if exists support_tickets_guard on public.support_tickets;
create trigger support_tickets_guard before update on public.support_tickets for each row execute function public.support_tickets_guard();

-- A new message moves the ticket: a staff reply marks it answered; a user message puts it back in the queue.
create or replace function public.support_messages_after() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cw.system', 'on', true);
  update support_tickets set last_message_at = now(),
         status = case when new.from_staff then 'answered' else 'open' end, closed_at = null
   where id = new.ticket_id;
  perform set_config('cw.system', 'off', true);
  return new;
end $$;
drop trigger if exists support_messages_after on public.support_messages;
create trigger support_messages_after after insert on public.support_messages for each row execute function public.support_messages_after();

-- Your place in the queue (1 = next to be answered).
create or replace function public.support_queue_position(p_ticket uuid) returns int language sql stable security definer set search_path = public as $$
  select case when t.status = 'open' then (select count(*)::int from support_tickets o where o.status = 'open' and o.last_message_at <= t.last_message_at) end
  from support_tickets t where t.id = p_ticket and (t.user_id = auth.uid() or public.is_staff());
$$;
revoke execute on function public.support_queue_position(uuid) from public, anon;
grant execute on function public.support_queue_position(uuid) to authenticated;

-- Staff queue: waiting tickets first, oldest first.
create or replace function public.admin_support_queue(p_status text default 'open')
returns table (id uuid, user_id uuid, email text, name text, topic text, subject text, status text, created_at timestamptz,
               last_message_at timestamptz, messages bigint, last_message text)
language sql stable security definer set search_path = public as $$
  select t.id, t.user_id, u.email::text, coalesce(p.full_name, p.business_name), t.topic, t.subject, t.status, t.created_at, t.last_message_at,
         (select count(*) from support_messages m where m.ticket_id = t.id),
         (select left(m.body, 200) from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1)
  from support_tickets t left join profiles p on p.id = t.user_id left join auth.users u on u.id = t.user_id
  where public.is_staff() and (p_status = 'all' or t.status = p_status)
  order by case when t.status = 'open' then 0 else 1 end, t.last_message_at
  limit 300;
$$;
revoke execute on function public.admin_support_queue(text) from public, anon;
grant execute on function public.admin_support_queue(text) to authenticated;

-- Update 10: separate bans and pauses for working and for a business (or the whole account), CEO view for team accounts,
-- and affiliate ads on the job pages that the CEO adds from the dashboard (text cards or uploaded image banners).
-- Safe to run again. Run after the earlier updates.

-- ---------------------------------------------------------------- new profile fields
alter table public.profiles
  add column if not exists work_banned boolean not null default false,
  add column if not exists hire_banned boolean not null default false,
  add column if not exists ban_reason text check (char_length(ban_reason) <= 300),
  add column if not exists staff_view boolean not null default true,
  add column if not exists work_paused boolean not null default false,
  add column if not exists hire_paused boolean not null default false,
  add column if not exists pause_reason text check (char_length(pause_reason) <= 300);

create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.work_banned and new.active_mode = 'worker' then
    raise exception 'Working is switched off for this account by Community Work.';
  end if;
  if new.hire_banned and new.active_mode = 'business' then
    raise exception 'Hiring is switched off for this account by Community Work.';
  end if;
  if new.active_mode = 'business' then
    new.can_hire := true;
    if coalesce(trim(new.business_name), '') = '' then
      raise exception 'Add your business name to start hiring.';
    end if;
  else
    new.can_work := true;
  end if;
  if new.work_banned then new.can_work := false; end if;
  if new.hire_banned then new.can_hire := false; end if;
  new.account_type := new.active_mode;
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended
     or new.strikes is distinct from old.strikes or new.suspended_reason is distinct from old.suspended_reason
     or new.suspended_at is distinct from old.suspended_at or new.created_at is distinct from old.created_at
     or new.banned is distinct from old.banned or new.work_banned is distinct from old.work_banned
     or new.hire_banned is distinct from old.hire_banned or new.ban_reason is distinct from old.ban_reason
     or new.staff_view is distinct from old.staff_view or new.work_paused is distinct from old.work_paused
     or new.hire_paused is distinct from old.hire_paused or new.pause_reason is distinct from old.pause_reason then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null
     and not (new.avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.avatar_url) > 0) then
    raise exception 'Upload your profile photo from your account page.';
  end if;
  if new.business_avatar_url is distinct from old.business_avatar_url and new.business_avatar_url is not null
     and not (new.business_avatar_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/avatars/'
              and position('/avatars/' || new.id::text || '/' in new.business_avatar_url) > 0) then
    raise exception 'Upload your business logo from your account page.';
  end if;
  new.updated_at := now();
  return new;
end $$;

-- A banned side can not be used, even if someone calls the database directly.
create or replace function public.is_active(p_type account_type) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and not suspended and not banned and active_mode = p_type
                 and not (p_type = 'worker' and (work_banned or work_paused)) and not (p_type = 'business' and (hire_banned or hire_paused)));
$$;

-- ---------------------------------------------------------------- bans by Community Work
-- p_scope: account (the person, everything), work (can no longer pick up shifts), business (the business can no longer hire).
-- Bans are permanent: there is no appeal. A ban on the only side someone has closes the whole account.
create or replace function public.admin_ban(p_user uuid, p_scope text, p_on boolean, p_reason text default null)
returns text language plpgsql security definer set search_path = public as $$
declare p profiles; scope text := p_scope;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if scope not in ('account', 'work', 'business') then raise exception 'Unknown ban type.'; end if;
  select * into p from profiles where id = p_user for update;
  if p.id is null then raise exception 'Account not found.'; end if;
  if p_on and (p_user = auth.uid() or exists (select 1 from staff where user_id = p_user)) then
    raise exception 'Team accounts can not be banned. Remove them from the team first.';
  end if;
  if p_on and scope = 'work' and (p.hire_banned or not p.can_hire or coalesce(trim(p.business_name), '') = '') then scope := 'account'; end if;
  if p_on and scope = 'business' and p.work_banned then scope := 'account'; end if;

  if scope = 'account' then
    perform public.admin_set_flags(p_user, null, null, p_on);
    if not p_on then update profiles set work_banned = false, hire_banned = false where id = p_user; end if;
  elsif scope = 'work' then
    if p_on then
      update profiles set work_banned = true, active_mode = 'business' where id = p_user;
    else
      update profiles set work_banned = false where id = p_user;
    end if;
  else
    if p_on then
      update profiles set hire_banned = true, active_mode = 'worker' where id = p_user;
      update shifts s set status = 'cancelled' where s.business_id = p_user and s.status = 'open' and s.starts_at > now()
         and not exists (select 1 from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed'));
    else
      update profiles set hire_banned = false where id = p_user;
    end if;
  end if;
  update profiles set ban_reason = case when p_on then left(nullif(trim(p_reason), ''), 300)
                                        when not (banned or work_banned or hire_banned) then null else ban_reason end
   where id = p_user;
  perform audit('user.ban', p_user::text, jsonb_build_object('scope', scope, 'on', p_on, 'reason', p_reason));
  return scope;
end $$;
revoke execute on function public.admin_ban(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_ban(uuid, text, boolean, text) to authenticated;

-- Team members choose between the CEO view and their own working or hiring account.
create or replace function public.set_staff_view(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update profiles set staff_view = p_on where id = auth.uid();
end $$;
revoke execute on function public.set_staff_view(boolean) from public, anon;
grant execute on function public.set_staff_view(boolean) to authenticated;

-- ---------------------------------------------------------------- pauses by Community Work
-- Like bans, but temporary and appealable. p_scope: account (everything), work (no picking up shifts), business (no hiring).
create or replace function public.admin_pause(p_user uuid, p_scope text, p_on boolean, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if p_scope not in ('account', 'work', 'business') then raise exception 'Unknown pause type.'; end if;
  if p_on and (p_user = auth.uid() or exists (select 1 from staff where user_id = p_user)) then
    raise exception 'Team accounts can not be paused. Remove them from the team first.';
  end if;
  if p_scope = 'account' then
    perform public.admin_set_flags(p_user, null, p_on, null);
    if p_on then
      update profiles set suspended_reason = coalesce(left(nullif(trim(p_reason), ''), 200), suspended_reason) where id = p_user;
    else
      update profiles set work_paused = false, hire_paused = false, pause_reason = null where id = p_user;
    end if;
  elsif p_scope = 'work' then
    update profiles set work_paused = p_on where id = p_user;
  else
    update profiles set hire_paused = p_on where id = p_user;
  end if;
  if p_scope <> 'account' then
    update profiles set pause_reason = case when p_on then coalesce(left(nullif(trim(p_reason), ''), 300), pause_reason)
                                            when not (work_paused or hire_paused) then null else pause_reason end
     where id = p_user;
  end if;
  perform audit('user.pause', p_user::text, jsonb_build_object('scope', p_scope, 'on', p_on, 'reason', p_reason));
end $$;
revoke execute on function public.admin_pause(uuid, text, boolean, text) from public, anon;
grant execute on function public.admin_pause(uuid, text, boolean, text) to authenticated;

-- Anyone paused (whole account or one side) can appeal; banned accounts can not.
create or replace function public.can_appeal() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (suspended or work_paused or hire_paused) and not banned)
     and not exists (select 1 from appeals where user_id = auth.uid() and status = 'pending');
$$;

create or replace function public.admin_appeals(p_status text default 'pending')
returns table (id uuid, user_id uuid, email text, full_name text, reason text, status text, response text,
               suspended_reason text, total_strikes bigint, created_at timestamptz, reviewed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.user_id, u.email::text, coalesce(p.business_name, p.full_name), a.reason, a.status, a.response,
         coalesce(p.suspended_reason, case when p.work_paused and p.hire_paused then 'Working and hiring paused'
                                           when p.work_paused then 'Working paused' when p.hire_paused then 'Hiring paused' end
                                      || coalesce(': ' || p.pause_reason, '')),
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
    update profiles set suspended = false, suspended_at = null, suspended_reason = null, strikes = 0,
                        work_paused = false, hire_paused = false, pause_reason = null
     where id = uid and not banned;
  end if;
  perform audit(case when p_approve then 'appeal.approved' else 'appeal.denied' end, uid::text, jsonb_build_object('appeal', p_appeal));
end $$;

-- A banned business's shifts disappear from the board straight away.
drop function if exists public.open_shifts(double precision, double precision, int, int);
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_id uuid, business_name text, business_verified boolean, business_avatar text, business_theme text, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, p.id as business_id, coalesce(p.business_name, 'Local business') as business_name,
           p.verified as business_verified, p.business_avatar_url as business_avatar, p.theme as business_theme,
           case when p_lat is null or p_lon is null then null
                else 6371 * 2 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lon - p_lon) / 2), 2))) end as distance_km
    from shifts s join profiles p on p.id = s.business_id
    where s.status = 'open' and s.starts_at > now() and not p.suspended and not p.banned and not p.hire_banned and not p.hire_paused
      and (auth.uid() is null or (
            not exists (select 1 from business_blocks b where b.business_id = s.business_id and b.worker_id = auth.uid())
        and not exists (select 1 from applications r where r.shift_id = s.id and r.worker_id = auth.uid() and r.status = 'declined')
        and s.business_id <> auth.uid()))
  ) x
  where x.distance_km is null or x.distance_km <= least(greatest(p_radius_km, 1), 2000)
  order by x.distance_km nulls last, x.starts_at
  limit least(greatest(p_limit, 1), 500);
$$;
grant execute on function public.open_shifts(double precision, double precision, int, int) to anon, authenticated;

-- ---------------------------------------------------------------- people list for the CEO dashboard
drop function if exists public.admin_users(text, int, int);
create or replace function public.admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, account_type account_type, full_name text, business_name text, city text, province text,
               verified boolean, suspended boolean, payout_ready boolean, created_at timestamptz, last_sign_in_at timestamptz,
               strikes int, total_strikes bigint, suspended_reason text, banned boolean, blocked_by bigint,
               can_work boolean, can_hire boolean, active_mode account_type, work_banned boolean, hire_banned boolean, ban_reason text,
               avatar_url text, business_avatar_url text, phone text, headline text, business_type text, staff_role text,
               shifts_done bigint, shifts_posted bigint, work_paused boolean, hire_paused boolean, pause_reason text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.account_type, p.full_name, p.business_name, p.city, p.province, p.verified, p.suspended, p.payout_ready,
         u.created_at, u.last_sign_in_at, p.strikes, (select count(*) from strikes s where s.worker_id = p.id), p.suspended_reason, p.banned,
         (select count(*) from business_blocks b where b.worker_id = p.id),
         p.can_work, p.can_hire, p.active_mode, p.work_banned, p.hire_banned, p.ban_reason,
         p.avatar_url, p.business_avatar_url, p.phone, p.headline, p.business_type, (select st.role::text from staff st where st.user_id = p.id),
         (select count(*) from applications a where a.worker_id = p.id and a.status = 'completed'),
         (select count(*) from shifts s where s.business_id = p.id),
         p.work_paused, p.hire_paused, p.pause_reason
  from profiles p join auth.users u on u.id = p.id
  where public.is_staff()
    and (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%'
         or p.business_name ilike '%' || p_search || '%' or p.phone ilike '%' || p_search || '%')
  order by u.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;
revoke execute on function public.admin_users(text, int, int) from public, anon;
grant execute on function public.admin_users(text, int, int) to authenticated;

-- ---------------------------------------------------------------- affiliate ads on the job pages
alter table public.app_settings add column if not exists promos_enabled boolean not null default true;

create table if not exists public.promos (
  id uuid primary key default gen_random_uuid(),
  partner text not null check (char_length(partner) between 1 and 60),
  title text not null check (char_length(title) between 3 and 90),
  body text check (char_length(body) <= 200),
  url text not null check (url ~ '^https://' and char_length(url) <= 600),
  cta text check (char_length(cta) <= 24),
  badge text check (char_length(badge) <= 30),
  logo text check (logo is null or (logo ~ '^https://' and char_length(logo) <= 600)),
  impression_url text check (impression_url is null or (impression_url ~ '^https://' and char_length(impression_url) <= 600)),
  modes text[] not null default '{}' check (modes <@ array['onsite', 'remote']::text[]),
  categories text[] not null default '{}' check (cardinality(categories) <= 25),
  spots text[] not null default '{feed,sidebar,article}' check (spots <@ array['feed', 'sidebar', 'article', 'hanging']::text[]),
  weight int not null default 1 check (weight between 1 and 10),
  active boolean not null default true,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.promos enable row level security;
create or replace function public.promos_on() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select promos_enabled from app_settings where id = 1), true);
$$;
grant execute on function public.promos_on() to anon, authenticated;
drop policy if exists "anyone sees live promos" on public.promos;
create policy "anyone sees live promos" on public.promos for select
  using (active and (starts_on is null or starts_on <= current_date) and (ends_on is null or ends_on >= current_date)
         and public.promos_on());
drop policy if exists "staff see promos" on public.promos;
create policy "staff see promos" on public.promos for select using (public.is_staff());
drop policy if exists "ceo adds promos" on public.promos;
create policy "ceo adds promos" on public.promos for insert with check (public.is_ceo());
drop policy if exists "ceo edits promos" on public.promos;
create policy "ceo edits promos" on public.promos for update using (public.is_ceo()) with check (public.is_ceo());
drop policy if exists "ceo deletes promos" on public.promos;
create policy "ceo deletes promos" on public.promos for delete using (public.is_ceo());
grant select on public.promos to anon, authenticated;
grant insert, update, delete on public.promos to authenticated;

-- Image banners: an uploaded picture shown instead of the text card. Stored in the public 'promos' bucket, CEO uploads only.
alter table public.promos add column if not exists image text check (image is null or (image ~ '^https://' and char_length(image) <= 600));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('promos', 'promos', true, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
drop policy if exists "ceo uploads ad images" on storage.objects;
create policy "ceo uploads ad images" on storage.objects for insert to authenticated with check (bucket_id = 'promos' and public.is_ceo());
drop policy if exists "ceo replaces ad images" on storage.objects;
create policy "ceo replaces ad images" on storage.objects for update to authenticated using (bucket_id = 'promos' and public.is_ceo());
drop policy if exists "ceo deletes ad images" on storage.objects;
create policy "ceo deletes ad images" on storage.objects for delete to authenticated using (bucket_id = 'promos' and public.is_ceo());
drop policy if exists "ceo lists ad images" on storage.objects;
create policy "ceo lists ad images" on storage.objects for select to authenticated using (bucket_id = 'promos' and public.is_ceo());

create or replace function public.promos_touch() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  perform audit('promo.' || lower(tg_op), new.id::text, jsonb_build_object('partner', new.partner, 'active', new.active));
  return new;
end $$;
drop trigger if exists promos_touch on public.promos;
create trigger promos_touch before insert or update on public.promos for each row execute function public.promos_touch();

create or replace function public.admin_set_promos(p_on boolean) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can change this.'; end if;
  update app_settings set promos_enabled = p_on where id = 1;
  perform audit('settings.promos', 'promos', jsonb_build_object('on', p_on));
end $$;
revoke execute on function public.admin_set_promos(boolean) from public, anon;
grant execute on function public.admin_set_promos(boolean) to authenticated;

-- Views and clicks per offer (the offer id is recorded as the event target).
create or replace function public.admin_promo_stats(p_days int default 30)
returns table (target text, views bigint, clicks bigint) language sql stable security definer set search_path = public as $$
  select e.target, count(*) filter (where e.type = 'sponsored_view'), count(*) filter (where e.type = 'sponsored_click')
  from events e
  where public.is_staff() and e.type in ('sponsored_view', 'sponsored_click') and e.at >= now() - make_interval(days => least(greatest(p_days, 1), 400))
  group by e.target;
$$;
revoke execute on function public.admin_promo_stats(int) from public, anon;
grant execute on function public.admin_promo_stats(int) to authenticated;

create or replace function public.public_settings()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('min_hourly_zar', min_hourly_zar, 'platform_fee_percent', platform_fee_percent,
                           'strike_limit', strike_limit, 'cancel_grace_minutes', cancel_grace_minutes,
                           'require_staff_mfa', require_staff_mfa, 'promos_enabled', promos_enabled) from app_settings where id = 1;
$$;
grant execute on function public.public_settings() to anon, authenticated;

-- Update 11: the CEO dashboard's Live tab shows who did what (name, email and business for signed-in people,
-- a short visitor code for guests) over any window up to 24 hours, and names the people online right now.
-- Safe to run again. Run after the earlier updates.

create or replace function public.admin_live(p_minutes int default 30) returns json
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(mins => least(greatest(p_minutes, 1), 1440));
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  return json_build_object(
    'active_visitors', (select count(distinct visitor_id) from events where at > since),
    'signed_in', (select count(distinct user_id) from events where at > since and user_id is not null),
    'events', (select count(*) from events where at > since),
    'recent', coalesce((select json_agg(e) from (
        select ev.at, ev.type, ev.path, ev.target, ev.user_id, upper(left(ev.visitor_id, 4)) as visitor,
               p.full_name as name, p.business_name as business, u.email::text as email, p.active_mode as mode,
               (select st.role::text from staff st where st.user_id = ev.user_id) as staff_role
        from events ev left join profiles p on p.id = ev.user_id left join auth.users u on u.id = ev.user_id
        where ev.at > since order by ev.at desc limit 150) e), '[]'),
    'people', coalesce((select json_agg(x) from (
        select ev.user_id, max(ev.at) as last_at, count(*) as actions,
               (array_agg(ev.path order by ev.at desc))[1] as last_path,
               max(p.full_name) as name, max(p.business_name) as business, max(u.email::text) as email
        from events ev left join profiles p on p.id = ev.user_id left join auth.users u on u.id = ev.user_id
        where ev.at > since and ev.user_id is not null
        group by ev.user_id order by max(ev.at) desc limit 100) x), '[]'));
end $$;
revoke execute on function public.admin_live(int) from public, anon;
grant execute on function public.admin_live(int) to authenticated;

-- Names for the signed-in people the dashboard sees online right now (team only).
create or replace function public.admin_people_names(p_ids uuid[])
returns table (id uuid, name text, business text, email text, mode account_type, staff_role text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.business_name, u.email::text, p.active_mode, (select st.role::text from staff st where st.user_id = p.id)
  from profiles p join auth.users u on u.id = p.id
  where public.is_staff() and p.id = any(p_ids[1:300]);
$$;
revoke execute on function public.admin_people_names(uuid[]) from public, anon;
grant execute on function public.admin_people_names(uuid[]) to authenticated;

