-- Update 12: support works like a live chat.
--   open      waiting in the queue for an agent (stays in the queue even if the person signs out or closes the page)
--   answered  an agent has connected; the person sees the agent's name and whether they're online
--   idle      the person was inactive for 5 minutes, so the live chat paused and the agent was released. Their next
--             message puts them back in the queue, and whichever agent picks it up sees the whole conversation.
--   closed    finished; the conversation is deleted 24 hours later. Paused chats with no messages for 24 hours close.
-- Safe to run again. Run after the earlier updates.

alter table public.support_tickets
  add column if not exists agent_id uuid references public.profiles (id) on delete set null,
  add column if not exists agent_name text check (char_length(agent_name) <= 60),
  add column if not exists connected_at timestamptz,
  add column if not exists user_last_at timestamptz;
alter table public.support_tickets drop constraint if exists support_tickets_status_check;
alter table public.support_tickets add constraint support_tickets_status_check check (status in ('open', 'answered', 'idle', 'closed'));

-- Users may close, reopen or pause nothing else; staff can change anything. Agent fields are set by the system only.
create or replace function public.support_tickets_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status <> 'closed' then new.closed_at := now(); end if;
  if new.status <> 'closed' then new.closed_at := null; end if;
  if public.is_service() or public.is_staff() then return new; end if;
  if new.user_id is distinct from old.user_id or new.topic is distinct from old.topic or new.subject is distinct from old.subject
     or new.created_at is distinct from old.created_at or new.agent_id is distinct from old.agent_id
     or new.agent_name is distinct from old.agent_name or new.connected_at is distinct from old.connected_at then
    raise exception 'Not allowed.';
  end if;
  if new.status is distinct from old.status and new.status not in ('closed', 'open') then raise exception 'Not allowed.'; end if;
  if new.status = 'open' and old.status <> 'open' then
    new.agent_id := null; new.agent_name := null; new.connected_at := null;
  end if;
  return new;
end $$;

-- A message moves the chat along: an agent's message connects that agent; the person's message keeps a live chat going,
-- or puts a paused or closed one back in the queue for the next available agent.
create or replace function public.support_messages_after() returns trigger language plpgsql security definer set search_path = public as $$
declare t support_tickets;
begin
  perform set_config('cw.system', 'on', true);
  select * into t from support_tickets where id = new.ticket_id;
  if new.from_staff then
    update support_tickets set last_message_at = now(), status = 'answered', closed_at = null,
           agent_id = case when t.status = 'answered' and t.agent_id is not null then t.agent_id else new.author end,
           agent_name = case when t.status = 'answered' and t.agent_id is not null then t.agent_name
                             else (select left(split_part(coalesce(nullif(trim(full_name), ''), 'Support'), ' ', 1), 60) from profiles where id = new.author) end,
           connected_at = case when t.status = 'answered' and t.agent_id is not null then t.connected_at else now() end
     where id = new.ticket_id;
  else
    update support_tickets set last_message_at = now(), user_last_at = now(), closed_at = null,
           status = case when t.status = 'answered' then 'answered' else 'open' end,
           agent_id = case when t.status = 'answered' then t.agent_id end,
           agent_name = case when t.status = 'answered' then t.agent_name end,
           connected_at = case when t.status = 'answered' then t.connected_at end
     where id = new.ticket_id;
  end if;
  perform set_config('cw.system', 'off', true);
  return new;
end $$;

-- Housekeeping, run whenever the queue or a chat is opened (and every minute if pg_cron is on):
-- pause live chats where the person has been inactive for 5 minutes, close chats paused for 24 hours,
-- and delete chats 24 hours after they were closed.
create or replace function public.support_housekeeping() returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('cw.system', 'on', true);
  update support_tickets set status = 'idle', agent_id = null, agent_name = null, connected_at = null
   where status = 'answered' and greatest(coalesce(user_last_at, created_at), coalesce(connected_at, created_at)) < now() - interval '5 minutes';
  update support_tickets set status = 'closed', closed_at = now()
   where status = 'idle' and last_message_at < now() - interval '24 hours';
  delete from support_tickets where status = 'closed' and closed_at < now() - interval '24 hours';
  perform set_config('cw.system', 'off', true);
end $$;
revoke execute on function public.support_housekeeping() from public, anon, authenticated;

-- Called by the person's open chat about once a minute (and when they send a message): keeps the live chat active,
-- and runs the housekeeping above.
create or replace function public.support_ping(p_ticket uuid default null) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_ticket is not null then
    perform set_config('cw.system', 'on', true);
    update support_tickets set user_last_at = now() where id = p_ticket and user_id = auth.uid() and status = 'answered';
    perform set_config('cw.system', 'off', true);
  end if;
  perform public.support_housekeeping();
end $$;
revoke execute on function public.support_ping(uuid) from public, anon;
grant execute on function public.support_ping(uuid) to authenticated;

-- Staff queue, with who is connected and whether the person is waiting on an agent's reply.
drop function if exists public.admin_support_queue(text);
create or replace function public.admin_support_queue(p_status text default 'open')
returns table (id uuid, user_id uuid, email text, name text, topic text, subject text, status text, created_at timestamptz,
               last_message_at timestamptz, messages bigint, last_message text, agent_name text, agent_id uuid,
               waiting_on_agent boolean, user_last_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then return; end if;
  perform public.support_housekeeping();
  return query
  select t.id, t.user_id, u.email::text, coalesce(p.full_name, p.business_name), t.topic, t.subject, t.status, t.created_at, t.last_message_at,
         (select count(*) from support_messages m where m.ticket_id = t.id),
         (select left(m.body, 200) from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1),
         t.agent_name, t.agent_id,
         coalesce((select not m.from_staff from support_messages m where m.ticket_id = t.id order by m.created_at desc limit 1), false),
         t.user_last_at
  from support_tickets t left join profiles p on p.id = t.user_id left join auth.users u on u.id = t.user_id
  where (p_status = 'all' or t.status = p_status)
  order by case t.status when 'open' then 0 when 'answered' then 1 when 'idle' then 2 else 3 end, t.last_message_at
  limit 300;
end $$;
revoke execute on function public.admin_support_queue(text) from public, anon;
grant execute on function public.admin_support_queue(text) to authenticated;

-- Every minute with pg_cron (built into Supabase). If pg_cron isn't on, the housekeeping still runs whenever
-- the queue or a chat is opened.
do $cron$
begin
  create extension if not exists pg_cron;
  perform cron.unschedule(jobid) from cron.job where jobname = 'community-work-support';
  perform cron.schedule('community-work-support', '* * * * *', 'select public.support_housekeeping()');
exception when others then
  raise notice 'Support housekeeping not scheduled (%). It still runs whenever the support queue or a chat is opened.', sqlerrm;
end $cron$;
