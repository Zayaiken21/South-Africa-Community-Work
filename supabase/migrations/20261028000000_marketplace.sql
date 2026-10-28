-- Community Work South Africa — accounts, shifts, escrow records, analytics and staff roles.
-- Every table uses row level security. Money never sits in this database: TradeSafe (a South African
-- escrow provider) holds it; these tables only record what TradeSafe reports.


-- ---------------------------------------------------------------- settings
create table public.app_settings (
  id int primary key default 1 check (id = 1),
  ceo_email text not null,
  min_hourly_zar numeric(10,2) not null default 30.23,      -- National Minimum Wage from 1 March 2026
  platform_fee_percent numeric(5,2) not null default 10 check (platform_fee_percent between 0 and 30),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (ceo_email) values ('zayaiken2001@gmail.com');
alter table public.app_settings enable row level security;

create or replace function public.public_settings()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object('min_hourly_zar', min_hourly_zar, 'platform_fee_percent', platform_fee_percent) from app_settings where id = 1;
$$;

-- ---------------------------------------------------------------- roles & helpers
create type public.account_type as enum ('worker', 'business');
create type public.staff_role as enum ('ceo', 'admin');

create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  added_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
alter table public.staff enable row level security;

-- Staff powers need a second factor (authenticator app): the session must be at assurance level aal2.
create or replace function public.is_staff(require_mfa boolean default true)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid())
     and (not require_mfa or coalesce(auth.jwt() ->> 'aal', '') = 'aal2');
$$;
create or replace function public.is_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from staff where user_id = auth.uid() and role = 'ceo')
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;
-- True only for the server: the service-role key, or a direct database session with no signed-in user
-- (migrations, the SQL editor). Checks the caller's token, not current_user, which inside a
-- security-definer function is always the function owner.
create or replace function public.is_service()
returns boolean language sql stable as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or (coalesce(auth.jwt() ->> 'sub', '') = '' and coalesce(auth.jwt() ->> 'role', '') not in ('anon', 'authenticated')
          and session_user in ('postgres', 'supabase_admin'));
$$;

create policy "staff see own role" on public.staff for select using (user_id = auth.uid());
create policy "staff see staff" on public.staff for select using (public.is_staff());

-- ---------------------------------------------------------------- audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid,
  action text not null,
  target text,
  details jsonb not null default '{}'
);
alter table public.audit_log enable row level security;
create policy "staff read audit" on public.audit_log for select using (public.is_staff());

create or replace function public.audit(p_action text, p_target text, p_details jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_log (actor, action, target, details) values (auth.uid(), p_action, p_target, coalesce(p_details, '{}'));
$$;
revoke execute on function public.audit(text, text, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  account_type public.account_type not null default 'worker',
  full_name text check (char_length(full_name) <= 120),
  headline text check (char_length(headline) <= 120),
  bio text check (char_length(bio) <= 1000),
  skills text[] not null default '{}' check (coalesce(array_length(skills, 1), 0) <= 30),
  phone text check (char_length(phone) <= 30),
  city text check (char_length(city) <= 100),
  province text check (province in ('Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape')),
  lat double precision check (lat between -35 and -22),
  lon double precision check (lon between 16 and 33),
  resume_path text check (char_length(resume_path) <= 300),
  business_name text check (char_length(business_name) <= 120),
  business_reg text check (char_length(business_reg) <= 40),
  -- Set only by the server (TradeSafe) or staff:
  tradesafe_token_id text,
  payout_ready boolean not null default false,
  verified boolean not null default false,
  suspended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "own profile" on public.profiles for select using (id = auth.uid());
create policy "own profile update" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
create policy "staff read profiles" on public.profiles for select using (public.is_staff());
create policy "staff update profiles" on public.profiles for update using (public.is_staff());
-- Businesses see the profiles of people who applied to their shifts; workers see the business behind a shift.

-- Users can't grant themselves verified/payout/suspension flags or change account type after hiring starts.
create or replace function public.profiles_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_service() or public.is_staff() then new.updated_at := now(); return new; end if;
  if new.tradesafe_token_id is distinct from old.tradesafe_token_id or new.payout_ready is distinct from old.payout_ready
     or new.verified is distinct from old.verified or new.suspended is distinct from old.suspended then
    raise exception 'These account details can only be changed by Community Work.';
  end if;
  if new.account_type is distinct from old.account_type and (
       exists (select 1 from shifts where business_id = old.id) or exists (select 1 from applications where worker_id = old.id)) then
    raise exception 'Account type can''t change once you have shifts or applications.';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before update on public.profiles for each row execute function public.profiles_guard();

-- New sign-ups get a profile; the CEO email becomes CEO once it is confirmed.
create or replace function public.handle_auth_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into profiles (id, account_type, full_name, business_name)
    values (new.id,
            case when new.raw_user_meta_data ->> 'account_type' = 'business' then 'business'::account_type else 'worker'::account_type end,
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
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user();
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users for each row execute function public.handle_auth_user();

-- ---------------------------------------------------------------- shifts
create type public.shift_status as enum ('open', 'filled', 'in_progress', 'completed', 'cancelled');

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 100),
  description text not null check (char_length(description) between 10 and 4000),
  category text not null check (char_length(category) <= 60),
  address text check (char_length(address) <= 200),
  city text not null check (char_length(city) between 2 and 100),
  province text not null check (province in ('Eastern Cape','Free State','Gauteng','KwaZulu-Natal','Limpopo','Mpumalanga','North West','Northern Cape','Western Cape')),
  lat double precision not null check (lat between -35 and -22),
  lon double precision not null check (lon between 16 and 33),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  hourly_rate_zar numeric(10,2) not null check (hourly_rate_zar > 0 and hourly_rate_zar <= 5000),
  workers_needed int not null default 1 check (workers_needed between 1 and 50),
  payment_method text not null default 'escrow' check (payment_method in ('escrow', 'cash')),
  status public.shift_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours')
);
create index shifts_open_idx on public.shifts (status, starts_at);
create index shifts_business_idx on public.shifts (business_id);
alter table public.shifts enable row level security;

create policy "anyone sees open shifts" on public.shifts for select using (status = 'open' and starts_at > now() - interval '1 hour');
create policy "business sees own shifts" on public.shifts for select using (business_id = auth.uid());
create policy "staff see shifts" on public.shifts for select using (public.is_staff());
create policy "business edits own shifts" on public.shifts for update using (business_id = auth.uid()) with check (business_id = auth.uid());
create policy "staff edit shifts" on public.shifts for update using (public.is_staff());

create or replace function public.shifts_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare minimum numeric;
begin
  select min_hourly_zar into minimum from app_settings where id = 1;
  if new.hourly_rate_zar < minimum then
    raise exception 'Hourly pay must be at least R% (South African national minimum wage).', minimum;
  end if;
  if tg_op = 'INSERT' and new.starts_at < now() then raise exception 'Choose a start time in the future.'; end if;
  if tg_op = 'UPDATE' and not (public.is_service() or public.is_staff()) then
    if new.business_id <> old.business_id then raise exception 'Shift owner can''t change.'; end if;
    if exists (select 1 from applications a where a.shift_id = old.id and a.status in ('accepted', 'completed'))
       and (new.hourly_rate_zar <> old.hourly_rate_zar or new.starts_at <> old.starts_at or new.ends_at <> old.ends_at or new.payment_method <> old.payment_method) then
      raise exception 'Pay and times are locked once someone is booked. Cancel and repost instead.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger shifts_guard before insert or update on public.shifts for each row execute function public.shifts_guard();

-- ---------------------------------------------------------------- applications (bookings)
create type public.application_status as enum ('applied', 'accepted', 'declined', 'withdrawn', 'completed', 'no_show');

create table public.applications (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  worker_id uuid not null references public.profiles (id) on delete cascade,
  status public.application_status not null default 'applied',
  message text check (char_length(message) <= 500),
  hours_worked numeric(5,2) check (hours_worked between 0 and 16),
  business_confirmed_at timestamptz,
  worker_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, worker_id)
);
create index applications_worker_idx on public.applications (worker_id);
alter table public.applications enable row level security;

create policy "worker sees own applications" on public.applications for select using (worker_id = auth.uid());
create policy "staff see applications" on public.applications for select using (public.is_staff());
create policy "staff update applications" on public.applications for update using (public.is_staff());

-- Who may change what: workers withdraw or confirm hours; businesses accept, decline, complete and confirm hours.
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
      raise exception 'You can only withdraw before the shift starts.';
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
create trigger applications_guard before update on public.applications for each row execute function public.applications_guard();

-- Keep shift status in step with bookings.
create or replace function public.sync_shift_status() returns trigger language plpgsql security definer set search_path = public as $$
declare s shifts; booked int;
begin
  select * into s from shifts where id = new.shift_id;
  select count(*) into booked from applications where shift_id = s.id and status in ('accepted', 'completed');
  if s.status = 'open' and booked >= s.workers_needed then update shifts set status = 'filled' where id = s.id;
  elsif s.status = 'filled' and booked < s.workers_needed then update shifts set status = 'open' where id = s.id; end if;
  return new;
end $$;
create trigger applications_sync after insert or update of status on public.applications for each row execute function public.sync_shift_status();

-- ---------------------------------------------------------------- escrow payment records (written only by the server)
create type public.payment_state as enum ('awaiting_payment', 'funded', 'released', 'refunded', 'disputed', 'cancelled', 'cash_paid');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.applications (id) on delete restrict,
  shift_id uuid not null references public.shifts (id) on delete restrict,
  business_id uuid not null references public.profiles (id),
  worker_id uuid not null references public.profiles (id),
  hours numeric(5,2) not null check (hours > 0 and hours <= 16),
  hourly_rate_zar numeric(10,2) not null,
  amount_zar numeric(12,2) not null check (amount_zar > 0),
  fee_zar numeric(12,2) not null default 0,
  provider text not null default 'tradesafe' check (provider in ('tradesafe', 'cash')),
  provider_transaction_id text unique,
  provider_allocation_id text,
  checkout_url text,
  state public.payment_state not null default 'awaiting_payment',
  provider_state text,
  released_by uuid references auth.users (id),
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "parties see payments" on public.payments for select using (business_id = auth.uid() or worker_id = auth.uid());
create policy "staff see payments" on public.payments for select using (public.is_staff());
-- No insert/update/delete policies: only the server (service role) writes payments.

-- ---------------------------------------------------------------- relationship checks
-- Policies call these instead of querying other protected tables directly, which avoids policy loops.
create or replace function public.owns_shift(p_shift uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from shifts where id = p_shift and business_id = auth.uid());
$$;
create or replace function public.applied_to_shift(p_shift uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications where shift_id = p_shift and worker_id = auth.uid());
$$;
create or replace function public.is_my_applicant(p_worker uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications a join shifts s on s.id = a.shift_id where a.worker_id = p_worker and s.business_id = auth.uid());
$$;
create or replace function public.is_my_employer(p_business uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications a join shifts s on s.id = a.shift_id where s.business_id = p_business and a.worker_id = auth.uid());
$$;
create or replace function public.is_active(p_type account_type) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and account_type = p_type and not suspended);
$$;
create or replace function public.can_apply(p_shift uuid) returns boolean language sql stable security definer set search_path = public as $$
  select public.is_active('worker') and exists (select 1 from shifts where id = p_shift and status = 'open' and starts_at > now() and business_id <> auth.uid());
$$;
create or replace function public.shift_booked(p_shift uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from applications where shift_id = p_shift and status in ('accepted', 'completed'));
$$;

create policy "business sees applicants" on public.profiles for select using (public.is_my_applicant(id));
create policy "worker sees employers" on public.profiles for select using (public.is_my_employer(id));
create policy "business posts shifts" on public.shifts for insert with check (business_id = auth.uid() and public.is_active('business'));
create policy "business deletes unbooked shifts" on public.shifts for delete using (business_id = auth.uid() and not public.shift_booked(id));
create policy "worker sees applied shifts" on public.shifts for select using (public.applied_to_shift(id));
create policy "business sees applications to its shifts" on public.applications for select using (public.owns_shift(shift_id));
create policy "worker applies" on public.applications for insert with check (worker_id = auth.uid() and status = 'applied' and public.can_apply(shift_id));
create policy "parties update applications" on public.applications for update using (worker_id = auth.uid() or public.owns_shift(shift_id));

-- Public shift board: open shifts with the business name and distance. Street address stays hidden until booking.
create or replace function public.open_shifts(p_lat double precision default null, p_lon double precision default null,
                                              p_radius_km int default 200, p_limit int default 200)
returns table (id uuid, title text, description text, category text, city text, province text, lat double precision, lon double precision,
               starts_at timestamptz, ends_at timestamptz, hourly_rate_zar numeric, workers_needed int, booked int, payment_method text,
               business_name text, business_verified boolean, distance_km double precision)
language sql stable security definer set search_path = public as $$
  select * from (
    select s.id as id, s.title as title, s.description as description, s.category as category, s.city as city, s.province as province,
           round(s.lat::numeric, 2)::float8 as lat, round(s.lon::numeric, 2)::float8 as lon,
           s.starts_at as starts_at, s.ends_at as ends_at, s.hourly_rate_zar as hourly_rate_zar, s.workers_needed as workers_needed,
           (select count(*)::int from applications a where a.shift_id = s.id and a.status in ('accepted', 'completed')) as booked,
           s.payment_method as payment_method, coalesce(p.business_name, p.full_name, 'Local business') as business_name, p.verified as business_verified,
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

create or replace function public.payments_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (actor, action, target, details)
  values (auth.uid(), 'payment.' || coalesce(new.state::text, 'deleted'), new.id::text,
          jsonb_build_object('from', case when tg_op = 'UPDATE' then old.state::text end, 'amount_zar', new.amount_zar, 'provider_state', new.provider_state));
  return new;
end $$;
create trigger payments_audit after insert or update on public.payments for each row execute function public.payments_audit();

-- ---------------------------------------------------------------- first-party analytics
create table public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor_id text not null check (char_length(visitor_id) between 8 and 64),
  session_id text check (char_length(session_id) <= 64),
  user_id uuid,
  type text not null check (type in ('page_view', 'job_view', 'apply_click', 'sponsored_view', 'sponsored_click', 'ad_view',
                                     'shift_view', 'shift_apply', 'sign_up', 'sign_in', 'cv_download', 'search', 'install', 'outbound_click')),
  path text check (char_length(path) <= 200),
  target text check (char_length(target) <= 300),
  meta jsonb not null default '{}' check (pg_column_size(meta) <= 2000)
);
create index events_at_idx on public.events (at desc);
create index events_type_at_idx on public.events (type, at desc);
create index events_visitor_at_idx on public.events (visitor_id, at desc);
alter table public.events enable row level security;
create policy "staff read events" on public.events for select using (public.is_staff());
-- Visitors record events only through track_event(), which validates and rate-limits.

create or replace function public.track_event(p_type text, p_visitor text, p_session text default null, p_path text default null,
                                              p_target text default null, p_meta jsonb default '{}')
returns void language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from events where visitor_id = p_visitor and at > now() - interval '1 minute') >= 60 then return; end if;
  insert into events (visitor_id, session_id, user_id, type, path, target, meta)
  values (left(p_visitor, 64), left(p_session, 64), auth.uid(), p_type, left(p_path, 200), left(p_target, 300),
          case when pg_column_size(coalesce(p_meta, '{}')) <= 2000 then coalesce(p_meta, '{}') else '{}' end);
end $$;
grant execute on function public.track_event(text, text, text, text, text, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- CEO / admin tools
create or replace function public.admin_add(p_email text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not public.is_ceo() then raise exception 'Only the CEO can add admins (with your authenticator code).'; end if;
  select id into uid from auth.users where lower(email) = lower(trim(p_email)) and email_confirmed_at is not null;
  if uid is null then raise exception 'No confirmed account uses that email. Ask them to sign up and confirm their email first.'; end if;
  insert into staff (user_id, role, added_by) values (uid, 'admin', auth.uid()) on conflict (user_id) do nothing;
  perform audit('admin.added', p_email);
  return json_build_object('user_id', uid);
end $$;

create or replace function public.admin_remove(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can remove admins.'; end if;
  if exists (select 1 from staff where user_id = p_user and role = 'ceo') then raise exception 'The CEO can''t be removed.'; end if;
  delete from staff where user_id = p_user;
  perform audit('admin.removed', p_user::text);
end $$;

create or replace function public.admin_list_staff() returns table (user_id uuid, email text, role staff_role, added_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.user_id, u.email::text, s.role, s.created_at from staff s join auth.users u on u.id = s.user_id
  where public.is_staff() order by s.role, s.created_at;
$$;

create or replace function public.admin_users(p_search text default '', p_limit int default 50, p_offset int default 0)
returns table (id uuid, email text, account_type account_type, full_name text, business_name text, city text, province text,
               verified boolean, suspended boolean, payout_ready boolean, created_at timestamptz, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text, p.account_type, p.full_name, p.business_name, p.city, p.province, p.verified, p.suspended, p.payout_ready,
         u.created_at, u.last_sign_in_at
  from profiles p join auth.users u on u.id = p.id
  where public.is_staff()
    and (coalesce(p_search, '') = '' or u.email ilike '%' || p_search || '%' or p.full_name ilike '%' || p_search || '%' or p.business_name ilike '%' || p_search || '%')
  order by u.created_at desc limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;

create or replace function public.admin_set_flags(p_user uuid, p_verified boolean default null, p_suspended boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update profiles set verified = coalesce(p_verified, verified), suspended = coalesce(p_suspended, suspended) where id = p_user;
  perform audit('user.flags', p_user::text, jsonb_build_object('verified', p_verified, 'suspended', p_suspended));
end $$;

create or replace function public.admin_set_settings(p_min_hourly numeric default null, p_fee_percent numeric default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_ceo() then raise exception 'Only the CEO can change settings.'; end if;
  update app_settings set min_hourly_zar = coalesce(p_min_hourly, min_hourly_zar), platform_fee_percent = coalesce(p_fee_percent, platform_fee_percent), updated_at = now() where id = 1;
  perform audit('settings.changed', null, jsonb_build_object('min_hourly_zar', p_min_hourly, 'fee_percent', p_fee_percent));
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

-- Live view: events in the last N minutes.
create or replace function public.admin_live(p_minutes int default 30) returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  return (select json_build_object('active_visitors', count(distinct visitor_id), 'events', count(*),
          'recent', coalesce((select json_agg(e) from (select at, type, path, target from events where at > now() - make_interval(mins => least(p_minutes, 240)) order by at desc limit 50) e), '[]'))
          from events where at > now() - make_interval(mins => least(p_minutes, 240)));
end $$;

revoke execute on function public.admin_add(text), public.admin_remove(uuid), public.admin_list_staff(), public.admin_users(text, int, int),
  public.admin_set_flags(uuid, boolean, boolean), public.admin_set_settings(numeric, numeric), public.admin_stats(int), public.admin_live(int) from public, anon;
grant execute on function public.admin_add(text), public.admin_remove(uuid), public.admin_list_staff(), public.admin_users(text, int, int),
  public.admin_set_flags(uuid, boolean, boolean), public.admin_set_settings(numeric, numeric), public.admin_stats(int), public.admin_live(int) to authenticated;
grant execute on function public.public_settings() to anon, authenticated;

-- ---------------------------------------------------------------- CV storage (private)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 5242880,
        array['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create policy "own CV upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own CV replace" on storage.objects for update to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own CV delete" on storage.objects for delete to authenticated
  using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "CV readers" on storage.objects for select to authenticated using (
  bucket_id = 'resumes' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_staff()
    or public.is_my_applicant(((storage.foldername(name))[1])::uuid)));
