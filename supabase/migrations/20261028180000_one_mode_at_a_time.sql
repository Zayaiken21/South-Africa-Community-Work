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
