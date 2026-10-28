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
