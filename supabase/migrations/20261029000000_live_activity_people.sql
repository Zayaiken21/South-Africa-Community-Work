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
