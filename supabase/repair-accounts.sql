-- Repair: gives a profile to every login that doesn't have one (accounts made before the database was set up),
-- confirms the CEO email and makes sure it is CEO. Safe to run more than once.
insert into public.profiles (id, account_type, full_name, business_name)
select u.id,
       case when u.raw_user_meta_data ->> 'account_type' = 'business' then 'business'::public.account_type else 'worker'::public.account_type end,
       left(u.raw_user_meta_data ->> 'full_name', 120),
       left(u.raw_user_meta_data ->> 'business_name', 120)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

update auth.users set email_confirmed_at = now()
where lower(email) = (select lower(ceo_email) from public.app_settings where id = 1) and email_confirmed_at is null;

insert into public.staff (user_id, role)
select id, 'ceo' from auth.users
where lower(email) = (select lower(ceo_email) from public.app_settings where id = 1) and email_confirmed_at is not null
on conflict (user_id) do update set role = 'ceo';

-- Check: every login now has a profile, and who is staff.
select u.email, u.email_confirmed_at is not null as confirmed, p.account_type, s.role as staff_role
from auth.users u left join public.profiles p on p.id = u.id left join public.staff s on s.user_id = u.id
order by u.created_at;
