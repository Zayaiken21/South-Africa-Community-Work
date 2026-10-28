-- Upgrade 2: one account can both work and hire (switch between "Working" and "Hiring"), detailed profiles
-- with a profile photo and colour theme, and a public profile card.
-- Run once in Supabase → SQL Editor, AFTER 20261028120000_shift_pickup_strikes.sql. Keeps all existing data.

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
update public.profiles set can_hire = (account_type = 'business'), can_work = (account_type = 'worker'), active_mode = account_type;

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
  -- Profile photos must be the user's own upload in our storage, not a link to somewhere else.
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

create policy "own avatar upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar replace" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
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

-- ---------------------------------------------------------------- shift board with the business's photo and theme
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
