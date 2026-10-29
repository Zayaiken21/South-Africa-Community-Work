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
