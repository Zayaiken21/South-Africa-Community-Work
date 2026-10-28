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
