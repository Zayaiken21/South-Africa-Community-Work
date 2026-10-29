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
