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
