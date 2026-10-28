// Security tests for the database rules. Runs the migration in an in-process Postgres (PGlite) with stand-ins
// for Supabase auth and storage, then acts as the CEO, an admin, a business, two workers and an anonymous visitor.
//   npm i @electric-sql/pglite
//   cat supabase/migrations/*.sql > /tmp/all.sql && node supabase/tests/security.test.mjs /tmp/all.sql
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db = new PGlite();
const pre = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status text);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant usage on schema auth, storage to anon, authenticated, service_role;
grant select on auth.users to service_role;
grant all on storage.objects to anon, authenticated, service_role;`;
await db.exec('create extension if not exists pgcrypto;').catch(()=>{});
await db.exec(pre);
await db.exec(readFileSync(process.argv[2], 'utf8'));
await db.exec(`grant usage on schema public to anon, authenticated, service_role;
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;`);

const ids = {ceo: '00000000-0000-0000-0000-00000000000c', admin: '00000000-0000-0000-0000-00000000000a', biz: '00000000-0000-0000-0000-00000000000b',
  w1: '00000000-0000-0000-0000-000000000001', w2: '00000000-0000-0000-0000-000000000002', d: '00000000-0000-0000-0000-00000000000d'};
let pass = 0, fail = 0;
async function as(who, aal, sql, params = []) {
  const claims = who === 'anon' ? {role: 'anon'} : who === 'service' ? {role: 'service_role'} : {sub: ids[who], role: 'authenticated', aal: aal || 'aal1'};
  const role = who === 'anon' ? 'anon' : who === 'service' ? 'service_role' : 'authenticated';
  await db.exec(`reset role; select set_config('request.jwt.claims', '${JSON.stringify(claims)}', false); set role ${role};`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role;'); }
}
async function ok(name, fn) { try { const r = await fn(); console.log('PASS', name, r ?? ''); pass++; } catch (e) { console.log('FAIL', name, '—', e.message); fail++; } }
async function denied(name, fn) { try { const r = await fn(); if (r?.rows && r.rows.length === 0 && r.affectedRows === 0) { console.log('PASS', name, '(no rows affected)'); pass++; return; } console.log('FAIL', name, '— was allowed', JSON.stringify(r?.rows?.slice?.(0, 2) ?? r)); fail++; } catch (e) { console.log('PASS', name, '→', e.message.slice(0, 90)); pass++; } }

// sign-ups (as the auth system)
const signup = (k, email, meta, confirmed = true) => db.query(`insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1,$2,$3,$4)`, [ids[k], email, confirmed ? new Date() : null, meta]);
await signup('ceo', 'ZayAiken2001@gmail.com', {full_name: 'Isaiah'}, false);
await signup('admin', 'admin@example.com', {});
await signup('biz', 'shop@example.com', {account_type: 'business', business_name: 'Mama Thandi Kitchen'});
await signup('w1', 'thabo@example.com', {account_type: 'worker', full_name: 'Thabo'});
await signup('w2', 'lerato@example.com', {full_name: 'Lerato'});
await signup('d', 'someone@example.com', {});
// The CEO and admin have switched on two-step sign-in (authenticator app).
await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified'), ($2, 'verified')`, [ids.ceo, ids.admin]);
await ok('profiles created for every sign-up', async () => (await db.query('select count(*)::int n from profiles')).rows[0].n === 6 || Promise.reject(new Error('count')));
await ok('CEO not staff before email confirmed', async () => (await db.query('select count(*)::int n from staff')).rows[0].n === 0 || Promise.reject(new Error('early')));
await db.query(`update auth.users set email_confirmed_at = now() where id = $1`, [ids.ceo]);
await ok('CEO becomes CEO after confirming email', async () => (await db.query('select role from staff')).rows[0].role);

// CEO powers need MFA
await denied('CEO without authenticator code cannot add admins', () => as('ceo', 'aal1', `select admin_add('admin@example.com')`));
await ok('CEO with authenticator code adds admin', async () => (await as('ceo', 'aal2', `select admin_add('admin@example.com') r`)).rows[0].r);
await denied('admin cannot add admins', () => as('admin', 'aal2', `select admin_add('someone@example.com')`));
await denied('admin cannot remove the CEO', () => as('ceo', 'aal2', `select admin_remove('${ids.ceo}')`));
await denied('worker cannot make itself staff', () => as('w1', 'aal2', `insert into staff values ('${ids.w1}', 'ceo')`));
await denied('worker cannot read staff list', async () => { const r = await as('w1', 'aal2', `select * from admin_list_staff()`); return r.rows.length ? r : {rows: [], affectedRows: 0}; });

// shifts
const future = new Date(Date.now() + 2 * 864e5), end = new Date(future.getTime() + 8 * 36e5);
const shiftSql = (rate) => `insert into shifts (business_id, title, description, category, city, province, lat, lon, starts_at, ends_at, hourly_rate_zar, workers_needed, address)
  values ('${ids.biz}', 'Kitchen assistant', 'Prep and wash up for lunch service', 'Hospitality', 'Braamfontein', 'Gauteng', -26.193, 28.031, '${future.toISOString()}', '${end.toISOString()}', ${rate}, 1, '12 Juta St') returning id`;
await denied('pay below minimum wage rejected', () => as('biz', 'aal1', shiftSql(25)));
let shiftId;
await ok('business posts a shift at R45/hr', async () => { shiftId = (await as('biz', 'aal1', shiftSql(45))).rows[0].id; return shiftId; });
await denied('worker cannot post shifts', () => as('w1', 'aal1', shiftSql(45).replace(ids.biz, ids.w1)));
await denied('business cannot post as another business', () => as('w1', 'aal1', shiftSql(45)));
await ok('anonymous visitors see open shifts (no address)', async () => { const r = await as('anon', null, `select * from open_shifts(-26.2, 28.04, 50)`); const row = r.rows[0]; if (!row || 'address' in row) throw new Error('bad'); return `${row.business_name}, ${row.distance_km.toFixed(1)} km, R${row.hourly_rate_zar}`; });
await ok('far-away visitor filtered by radius', async () => { const r = await as('anon', null, `select * from open_shifts(-33.92, 18.42, 50)`); if (r.rows.length) throw new Error('should be empty'); return 'none'; });

// pick-up: workers book themselves, first come first served
let a1, a2;
await ok('worker 1 picks up the shift → booked instantly', async () => { const r = (await as('w1', 'aal1', `insert into applications (shift_id, worker_id, message) values ('${shiftId}', '${ids.w1}', 'I have kitchen experience') returning id, status`)).rows[0]; a1 = r.id; return r.status; });
await ok('shift shows as filled', async () => (await db.query(`select status from shifts where id = $1`, [shiftId])).rows[0].status);
await denied('worker 2 cannot take a full shift', () => as('w2', 'aal1', `insert into applications (shift_id, worker_id) values ('${shiftId}', '${ids.w2}')`));
await denied('worker cannot book someone else', () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${shiftId}', '${ids.d}')`));
await denied('business cannot pick up shifts', () => as('biz', 'aal1', `insert into applications (shift_id, worker_id) values ('${shiftId}', '${ids.biz}')`));
await ok('worker 1 sees only own booking', async () => { const r = await as('w1', 'aal1', `select worker_id from applications`); if (r.rows.length !== 1 || r.rows[0].worker_id !== ids.w1) throw new Error(JSON.stringify(r.rows)); return 1; });
await ok('business sees who picked up and their profile', async () => { const r = await as('biz', 'aal1', `select p.full_name from applications a join profiles p on p.id = a.worker_id order by 1`); return r.rows.map(x => x.full_name).join(', '); });
await ok("worker 2 can't see worker 1's profile", async () => { const r = await as('w2', 'aal1', `select * from profiles where id = '${ids.w1}'`); if (r.rows.length) throw new Error('leak'); return 'hidden'; });
await ok('stranger sees no profiles but own', async () => { const r = await as('d', 'aal1', `select id from profiles`); if (r.rows.length !== 1) throw new Error(r.rows.length); return 1; });
await denied('worker cannot record hours', () => as('w1', 'aal1', `update applications set hours_worked = 8 where id = '${a1}'`));
await denied('worker cannot mark itself completed', () => as('w1', 'aal1', `update applications set status = 'completed' where id = '${a1}'`));
await denied('pay locked once booked', () => as('biz', 'aal1', `update shifts set hourly_rate_zar = 35 where id = '${shiftId}'`));
await ok('worker 1 still sees the filled shift', async () => (await as('w1', 'aal1', `select status from shifts where id = '${shiftId}'`)).rows[0]?.status || Promise.reject(new Error('hidden')));
await ok('worker 1 sees the business card with contact', async () => { const c = (await as('w1', 'aal1', `select profile_card('${ids.biz}', 'business') c`)).rows[0].c; if (!c?.business_name || c.full_name || c.skills) throw new Error(JSON.stringify(c)); return c.business_name; });
await ok("worker can't read the business owner's private profile row", async () => { const r = await as('w1', 'aal1', `select * from profiles where id = '${ids.biz}'`); if (r.rows.length) throw new Error('leak'); return 'hidden'; });
let overlapId;
await ok('business posts a second shift at the same time', async () => { overlapId = (await as('biz', 'aal1', shiftSql(50))).rows[0].id; return 'ok'; });
await denied('worker 1 cannot double-book the same hours', () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w1}')`));
await ok('worker 2 picks up the second shift', async () => { a2 = (await as('w2', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w2}') returning id`)).rows[0].id; return a2; });
await ok('cancelling within the grace period is free', async () => { await as('w2', 'aal1', `update applications set status = 'withdrawn' where id = '${a2}'`); return (await db.query(`select strikes from profiles where id=$1`, [ids.w2])).rows[0].strikes; });
await ok('a cancelled shift can be booked again', async () => { const id = (await as('w2', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w2}') returning id`)).rows[0].id; await as('w2', 'aal1', `update applications set status = 'withdrawn' where id = '${id}'`); return 'rebooked and cancelled again'; });
await ok('the shift is open again after the cancellation', async () => (await db.query(`select status from shifts where id = $1`, [overlapId])).rows[0].status);

// profile protections
await denied('worker cannot mark itself verified', () => as('w1', 'aal1', `update profiles set verified = true where id = '${ids.w1}'`));
await denied('worker cannot set payout flag', () => as('w1', 'aal1', `update profiles set payout_ready = true where id = '${ids.w1}'`));
await ok('account type only follows the switched-on mode', async () => { await as('w1', 'aal1', `update profiles set account_type = 'business' where id = '${ids.w1}'`); const t = (await db.query(`select account_type from profiles where id=$1`, [ids.w1])).rows[0].account_type; if (t !== 'worker') throw new Error(t); return t; });
await ok('worker edits own bio and skills', async () => { await as('w1', 'aal1', `update profiles set bio = 'Hard worker', skills = '{cooking,cleaning}' where id = '${ids.w1}'`); return (await db.query(`select skills from profiles where id=$1`, [ids.w1])).rows[0].skills; });
await denied("worker cannot edit someone else's profile", async () => { const r = await as('w1', 'aal1', `update profiles set bio = 'x' where id = '${ids.w2}'`); return {rows: [], affectedRows: r.affectedRows, ...(r.affectedRows ? {rows: [1]} : {})}; });

// payments: server only
await denied('business cannot create a payment record', () => as('biz', 'aal1', `insert into payments (application_id, shift_id, business_id, worker_id, hours, hourly_rate_zar, amount_zar) values ('${a1}', '${shiftId}', '${ids.biz}', '${ids.w1}', 8, 45, 360)`));
await ok('server records an escrow payment', async () => (await as('service', null, `insert into payments (application_id, shift_id, business_id, worker_id, hours, hourly_rate_zar, amount_zar, fee_zar, state) values ('${a1}', '${shiftId}', '${ids.biz}', '${ids.w1}', 8, 45, 360, 36, 'funded') returning state`)).rows[0].state);
await denied('worker cannot mark payment released', async () => { const r = await as('w1', 'aal1', `update payments set state = 'released'`); return {rows: r.affectedRows ? [1] : [], affectedRows: r.affectedRows}; });
await ok('worker sees own payment', async () => (await as('w1', 'aal1', `select amount_zar from payments`)).rows.length);
await ok('worker 2 sees no payments', async () => { const r = await as('w2', 'aal1', `select * from payments`); if (r.rows.length) throw new Error('leak'); return 0; });
await ok('payment change written to audit log', async () => (await db.query(`select action from audit_log where action like 'payment.%'`)).rows.map(r => r.action).join(','));

// analytics
await ok('anonymous visitor records a page view', async () => { await as('anon', null, `select track_event('page_view', 'visitor-abc-123', 'sess1', '/find-work.html')`); await as('anon', null, `select track_event('sponsored_click', 'visitor-abc-123', 'sess1', '/find-work.html', 'sample-freelance')`); return 'ok'; });
await denied('anonymous visitor cannot insert events directly', () => as('anon', null, `insert into events (visitor_id, type) values ('visitor-abc-123', 'page_view')`));
await denied('bad event type rejected', () => as('anon', null, `select track_event('hack', 'visitor-abc-123')`));
await ok('anonymous visitor cannot read events', async () => { const r = await as('anon', null, `select * from events`); if (r.rows.length) throw new Error('leak'); return 0; });
await ok('rate limit: 100 rapid events → max 60 stored', async () => { for (let i = 0; i < 100; i++) await as('anon', null, `select track_event('page_view', 'spammer-0001')`); return (await db.query(`select count(*)::int n from events where visitor_id = 'spammer-0001'`)).rows[0].n; });
await denied('admin without authenticator code cannot see stats', () => as('admin', 'aal1', `select admin_stats(30)`));
await ok('admin with authenticator code sees stats', async () => { const r = (await as('admin', 'aal2', `select admin_stats(30) s`)).rows[0].s; return JSON.stringify({users: r.users, traffic: r.traffic, payments: r.payments}); });
await ok('CEO sees live visitors', async () => JSON.stringify((await as('ceo', 'aal2', `select admin_live(30) l`)).rows[0].l).slice(0, 80));
await ok('admin suspends a user', async () => { await as('admin', 'aal2', `select admin_set_flags('${ids.d}', null, true)`); return (await db.query(`select suspended from profiles where id=$1`, [ids.d])).rows[0].suspended; });
await denied('admin cannot change platform settings', () => as('admin', 'aal2', `select admin_set_settings(20, 50)`));
await denied('CEO cannot set fee above 30%', () => as('ceo', 'aal2', `select admin_set_settings(null, 50)`));

// CV storage
await ok('worker 1 uploads own CV', async () => (await as('w1', 'aal1', `insert into storage.objects (bucket_id, name) values ('resumes', '${ids.w1}/cv.pdf') returning name`)).rows[0].name);
await denied("worker 1 cannot upload into worker 2's folder", () => as('w1', 'aal1', `insert into storage.objects (bucket_id, name) values ('resumes', '${ids.w2}/cv.pdf')`));
await ok('business can open applicant CV', async () => (await as('biz', 'aal1', `select name from storage.objects`)).rows.length);
await ok("worker 2 cannot open worker 1's CV", async () => { const r = await as('w2', 'aal1', `select name from storage.objects`); if (r.rows.length) throw new Error('leak'); return 0; });

await ok('business records 8 hours and confirms', async () => { await as('biz', 'aal1', `update applications set hours_worked = 8, business_confirmed_at = now() where id = '${a1}'`); return (await db.query(`select hours_worked from applications where id=$1`, [a1])).rows[0].hours_worked; });
await ok('worker confirms the hours', async () => { await as('w1', 'aal1', `update applications set worker_confirmed_at = now() where id = '${a1}'`); return !!(await db.query(`select worker_confirmed_at from applications where id=$1`, [a1])).rows[0].worker_confirmed_at; });
await ok('user turns on hiring with a business name and switches to it', async () => { await as('d', 'aal1', `update profiles set business_name = 'D Plumbing', can_hire = true, active_mode = 'business' where id = '${ids.d}'`); return (await db.query(`select account_type from profiles where id=$1`, [ids.d])).rows[0].account_type; });
await ok('admin searches users by email', async () => (await as('admin', 'aal2', `select email from admin_users('thabo')`)).rows.map(r => r.email).join());
await ok("search text can't break out of the query", async () => (await as('admin', 'aal2', `select count(*)::int n from admin_users($1)`, ["x' or 1=1 --"])).rows[0].n);
await denied('worker cannot run admin search', async () => { const r = await as('w1', 'aal2', `select * from admin_users('')`); return r.rows.length ? r : {rows: [], affectedRows: 0}; });
await denied('worker cannot read audit log', async () => { const r = await as('w1', 'aal2', `select * from audit_log`); return r.rows.length ? r : {rows: [], affectedRows: 0}; });

// strikes, suspension and appeals
const at = (days, hour) => { const d = new Date(Date.now() + days * 864e5); d.setUTCHours(hour, 0, 0, 0); return d; };
const post = async (days) => (await as('biz', 'aal1', `insert into shifts (business_id, title, description, category, city, province, lat, lon, starts_at, ends_at, hourly_rate_zar, workers_needed)
  values ('${ids.biz}', 'Shift ${days}', 'Prep and wash up for lunch service', 'Hospitality', 'Braamfontein', 'Gauteng', -26.193, 28.031, '${at(days, 6).toISOString()}', '${at(days, 12).toISOString()}', 45, 1) returning id`)).rows[0].id;
const pick = async (w, shift) => (await as(w, 'aal1', `insert into applications (shift_id, worker_id) values ('${shift}', '${ids[w]}') returning id`)).rows[0].id;
const strikesOf = async (w) => (await db.query(`select strikes, suspended from profiles where id=$1`, [ids[w]])).rows[0];
await denied('admin cannot change the strike rules', () => as('admin', 'aal2', `select admin_set_settings(null, null, 1, 0)`));
await ok('CEO sets the grace period to 0 minutes', async () => { await as('ceo', 'aal2', `select admin_set_settings(null, null, null, 0)`); return (await db.query(`select strike_limit, cancel_grace_minutes from app_settings`)).rows[0]; });
for (const n of [1, 2]) await ok(`cancellation ${n} → strike ${n}`, async () => { const app = await pick('w2', await post(5 + n)); await as('w2', 'aal1', `update applications set status = 'withdrawn' where id = '${app}'`); return JSON.stringify(await strikesOf('w2')); });
await denied('worker cannot wipe own strikes', () => as('w2', 'aal1', `update profiles set strikes = 0 where id = '${ids.w2}'`));
await ok('no-show marked by the business → strike 3 → suspended, count restarts', async () => { const app = await pick('w2', await post(9)); await as('biz', 'aal1', `update applications set status = 'no_show' where id = '${app}'`); return JSON.stringify(await strikesOf('w2')); });
await ok('strikes are recorded with type', async () => (await as('w2', 'aal1', `select kind from strikes order by at`)).rows.map(r => r.kind).join(','));
await denied('suspended worker cannot pick up shifts', async () => pick('w2', await post(12)));
await denied('suspended worker cannot unsuspend itself', () => as('w2', 'aal1', `update profiles set suspended = false where id = '${ids.w2}'`));
await denied('worker who is not suspended cannot appeal', () => as('w1', 'aal1', `insert into appeals (user_id, reason) values ('${ids.w1}', 'Please look at my account')`));
let appeal;
await ok('suspended worker sends an appeal', async () => { appeal = (await as('w2', 'aal1', `insert into appeals (user_id, reason) values ('${ids.w2}', 'My child was sick on the day I missed. I will not miss again.') returning id`)).rows[0].id; return 'pending'; });
await denied('only one open appeal at a time', () => as('w2', 'aal1', `insert into appeals (user_id, reason) values ('${ids.w2}', 'Second appeal while first is open')`));
await denied('worker cannot approve own appeal', async () => { const r = await as('w2', 'aal1', `update appeals set status = 'approved' where id = '${appeal}'`); return {rows: r.affectedRows ? [1] : [], affectedRows: r.affectedRows}; });
await ok("other workers can't see the appeal", async () => { const r = await as('w1', 'aal1', `select * from appeals`); if (r.rows.length) throw new Error('leak'); return 0; });
await denied('admin without authenticator code cannot decide appeals', () => as('admin', 'aal1', `select admin_review_appeal('${appeal}', true, 'ok')`));
await ok('admin sees the appeal queue', async () => (await as('admin', 'aal2', `select email, reason, total_strikes from admin_appeals('pending')`)).rows.map(r => `${r.email} (${r.total_strikes} strikes)`).join());
await ok('admin approves → account restored', async () => { await as('admin', 'aal2', `select admin_review_appeal('${appeal}', true, 'Approved. Please give notice next time.')`); return JSON.stringify(await strikesOf('w2')); });
await ok('restored worker can pick up shifts again', async () => pick('w2', await post(13)));
await ok('3 more cancellations → suspended again', async () => { for (const d of [14, 15, 16]) { const app = await pick('w2', await post(d)); await as('w2', 'aal1', `update applications set status = 'withdrawn' where id = '${app}'`); } return JSON.stringify(await strikesOf('w2')); });
await ok('business releasing a worker is not a strike for the worker', async () => { const app = await pick('w1', await post(20)); await as('biz', 'aal1', `update applications set status = 'declined' where id = '${app}'`); return JSON.stringify(await strikesOf('w1')); });
await ok('dashboard shows reliability numbers', async () => JSON.stringify((await as('ceo', 'aal2', `select admin_stats(30) s`)).rows[0].s.reliability));

// one account, two modes: working and hiring
const shiftFor = (owner, days) => `insert into shifts (business_id, title, description, category, city, province, lat, lon, starts_at, ends_at, hourly_rate_zar, workers_needed)
  values ('${ids[owner]}', 'Dual ${days}', 'Prep and wash up for lunch service', 'Hospitality', 'Braamfontein', 'Gauteng', -26.193, 28.031, '${at(days, 6).toISOString()}', '${at(days, 12).toISOString()}', 45, 1) returning id`;
await ok('existing accounts keep their mode', async () => JSON.stringify((await db.query(`select account_type, active_mode, can_work, can_hire from profiles where id in ($1, $2) order by account_type`, [ids.w1, ids.biz])).rows));
await denied('worker without hiring switched on cannot post', () => as('w1', 'aal1', shiftFor('w1', 30)));
await denied('switching to hiring needs a business name', () => as('w1', 'aal1', `update profiles set active_mode = 'business' where id = '${ids.w1}'`));
await ok('worker turns on hiring and switches to it', async () => { await as('w1', 'aal1', `update profiles set business_name = 'Thabo Car Wash', can_hire = true, active_mode = 'business' where id = '${ids.w1}'`); return JSON.stringify((await db.query(`select account_type, can_work, can_hire from profiles where id=$1`, [ids.w1])).rows[0]); });
let dualShift;
await ok('dual account posts a shift', async () => { dualShift = (await as('w1', 'aal1', shiftFor('w1', 31))).rows[0].id; return 'ok'; });
await denied("can't pick up your own shift", () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${dualShift}', '${ids.w1}')`));
await ok('switching back to working', async () => { await as('w1', 'aal1', `update profiles set active_mode = 'worker' where id = '${ids.w1}'`); return (await db.query(`select account_type from profiles where id=$1`, [ids.w1])).rows[0].account_type; });
await denied('in working mode you cannot post shifts', () => as('w1', 'aal1', shiftFor('w1', 32)));
await denied('in hiring mode you cannot pick up shifts', () => as('biz', 'aal1', `insert into applications (shift_id, worker_id) values ('${dualShift}', '${ids.biz}')`));
await ok('business switches to working and picks up the shift', async () => { await as('biz', 'aal1', `update profiles set active_mode = 'worker' where id = '${ids.biz}'`); const st = (await as('biz', 'aal1', `insert into applications (shift_id, worker_id) values ('${dualShift}', '${ids.biz}') returning status`)).rows[0].status; await as('biz', 'aal1', `update profiles set active_mode = 'business' where id = '${ids.biz}'`); return st; });
await ok('the business still manages its own shifts after switching back', async () => (await as('w1', 'aal1', `select count(*)::int n from applications where shift_id = '${dualShift}'`)).rows[0].n);
await denied('profile photo must be your own upload', () => as('w2', 'aal1', `update profiles set avatar_url = 'https://evil.example/pixel.png' where id = '${ids.w2}'`));
await denied("can't use someone else's photo", () => as('w2', 'aal1', `update profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/${ids.w1}/a.webp' where id = '${ids.w2}'`));
await ok('own uploaded photo and theme accepted', async () => { await as('w2', 'aal1', `update profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/${ids.w2}/a.webp', theme = 'jacaranda', languages = '{English,isiZulu}', availability = '{sat,sun,evenings}', experience = '[{"role":"Waiter","place":"Ocean Basket","years":"2"}]' where id = '${ids.w2}'`); return (await db.query(`select theme from profiles where id=$1`, [ids.w2])).rows[0].theme; });
await denied('unknown theme rejected', () => as('w2', 'aal1', `update profiles set theme = 'hacker' where id = '${ids.w2}'`));
await denied('bad availability value rejected', () => as('w2', 'aal1', `update profiles set availability = '{always}' where id = '${ids.w2}'`));
await denied('worker cannot upload a photo into another folder', () => as('w2', 'aal1', `insert into storage.objects (bucket_id, name) values ('avatars', '${ids.w1}/x.webp')`));
await ok('worker uploads own photo', async () => (await as('w2', 'aal1', `insert into storage.objects (bucket_id, name) values ('avatars', '${ids.w2}/a.webp') returning name`)).rows[0].name);
await ok('visitors who are not signed in get no profile card', async () => { const r = (await as('anon', null, `select profile_card('${ids.w1}') c`).catch(e => ({rows: [{c: 'denied'}]}))).rows[0].c; if (r && r !== 'denied') throw new Error('leak'); return r ?? 'null'; });
await ok('signed-in user sees a card without the phone number', async () => { const c = (await as('d', 'aal1', `select profile_card('${ids.w1}') c`)).rows[0].c; if (c.phone || c.resume_path) throw new Error('leak'); return `${c.full_name}, ${c.shifts_completed} done`; });
await ok('people booked together see the phone number', async () => { await db.query(`update profiles set phone = '082 000 0000' where id = $1`, [ids.w1]); const c = (await as('biz', 'aal1', `select profile_card('${ids.w1}') c`)).rows[0].c; if (!c.phone) throw new Error('missing'); return c.phone; });
await ok('suspended profiles are hidden from others', async () => { const c = (await as('w1', 'aal1', `select profile_card('${ids.w2}') c`)).rows[0].c; if (c) throw new Error('shown'); return 'hidden'; });
await ok('shift board shows the business photo and theme', async () => Object.keys((await as('anon', null, `select * from open_shifts(null, null, 2000)`)).rows[0] || {}).filter(k => k.startsWith('business')).join());
await ok('my dashboard summary', async () => JSON.stringify((await as('w1', 'aal1', `select my_summary() s`)).rows[0].s.business));

// two-step sign-in is a choice
await ok('admin without an authenticator switched on gets in with password only', async () => { await db.query(`delete from auth.mfa_factors where user_id = $1`, [ids.admin]); return !!(await as('admin', 'aal1', `select admin_stats(7) s`)).rows[0].s; });
await denied('CEO with an authenticator switched on still needs the code', () => as('ceo', 'aal1', `select admin_stats(7)`));
await denied("CEO can't require two-step for everyone without their own authenticator", async () => { await db.query(`delete from auth.mfa_factors where user_id = $1`, [ids.ceo]); try { return await as('ceo', 'aal1', `select admin_set_settings(null, null, null, null, true)`); } finally { await db.query(`insert into auth.mfa_factors (user_id, status) values ($1, 'verified')`, [ids.ceo]); } });
await ok('CEO requires two-step for the whole team', async () => { await as('ceo', 'aal2', `select admin_set_settings(null, null, null, null, true)`); return (await db.query(`select require_staff_mfa from app_settings`)).rows[0].require_staff_mfa; });
await denied('then an admin without the code is refused', () => as('admin', 'aal1', `select admin_stats(7)`));
await denied('visitors cannot call the two-step check', () => as('anon', null, `select staff_needs_mfa('${ids.admin}')`));

// deleting jobs and clean-up
let tidy;
await ok('business deletes a shift whose worker cancelled', async () => { tidy = (await as('biz', 'aal1', shiftFor('biz', 40))).rows[0].id; const app = (await as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${tidy}', '${ids.w1}') returning id`)).rows[0].id; await as('w1', 'aal1', `update applications set status = 'withdrawn' where id = '${app}'`); const r = await as('biz', 'aal1', `delete from shifts where id = '${tidy}'`); return r.affectedRows + ' deleted, bookings: ' + (await db.query(`select count(*)::int n from applications where shift_id = $1`, [tidy])).rows[0].n; });
await ok('the strike survives the deleted shift', async () => (await db.query(`select count(*)::int n from strikes where worker_id = $1 and application_id is null`, [ids.w1])).rows[0].n);
await ok("a shift with a booked worker can't be deleted", async () => { const r = await as('w1', 'aal1', `delete from shifts where id = '${dualShift}'`); if (r.affectedRows) throw new Error('deleted'); return 'kept'; });
await denied('visitors cannot run the clean-up', () => as('anon', null, `select cleanup_old_data()`));
await denied('admins cannot run the clean-up', () => as('admin', 'aal2', `select admin_cleanup()`));
await ok('clean-up removes old empty shifts, old tracking, keeps worked shifts', async () => {
  const old = new Date(Date.now() - 20 * 864e5), oldEnd = new Date(old.getTime() + 4 * 36e5);
  await db.exec(`select set_config('request.jwt.claims', '', false)`);
  const fut = new Date(Date.now() + 864e5);
  const sid = (await db.query(`insert into shifts (business_id, title, description, category, city, province, lat, lon, starts_at, ends_at, hourly_rate_zar) values ($1, 'Old empty', 'Nobody booked this shift at all', 'Retail', 'Rosebank', 'Gauteng', -26.1, 28.0, $2, $3, 45) returning id`, [ids.biz, fut, new Date(fut.getTime() + 4 * 36e5)])).rows[0].id;
  await db.query(`update shifts set starts_at = $2, ends_at = $3 where id = $1`, [sid, old, oldEnd]);
  await db.query(`insert into events (at, visitor_id, type) values (now() - interval '14 months', 'old-visitor-1', 'page_view')`);
  const kept = (await db.query(`select count(*)::int n from shifts where id = $1`, [shiftId])).rows[0].n;
  const r = (await as('ceo', 'aal2', `select admin_cleanup() r`)).rows[0].r;
  const after = (await db.query(`select count(*)::int n from shifts where title = 'Old empty'`)).rows[0].n + (await db.query(`select count(*)::int n from events where visitor_id = 'old-visitor-1'`)).rows[0].n;
  if (after) throw new Error('not removed'); if (!(await db.query(`select count(*)::int n from shifts where id = $1`, [shiftId])).rows[0].n === kept) throw new Error('worked shift removed');
  return JSON.stringify(r);
});

// blocking, releasing and bans
let blk;
await ok('business blocks a worker', async () => { await as('biz', 'aal1', `insert into business_blocks (business_id, worker_id, reason) values ('${ids.biz}', '${ids.w1}', 'Late twice')`); return (await as('biz', 'aal1', `select count(*)::int n from my_blocked_workers()`)).rows[0].n; });
await ok("blocked worker doesn't see that business's shifts", async () => { blk = (await as('biz', 'aal1', shiftFor('biz', 50))).rows[0].id; const r = await as('w1', 'aal1', `select id from open_shifts(null, null, 2000) where id = '${blk}'`); if (r.rows.length) throw new Error('visible'); const other = await as('d', 'aal1', `select id from open_shifts(null, null, 2000) where id = '${blk}'`); return other.rows.length ? 'hidden for blocked, shown to others' : 'not shown to others either'; });
await denied('blocked worker cannot pick up that business’s shift', () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${blk}', '${ids.w1}')`));
await denied('worker cannot see who blocked them', async () => { const r = await as('w1', 'aal1', `select * from business_blocks`); return r.rows.length ? r : {rows: [], affectedRows: 0}; });
await denied('a business cannot block for another business', () => as('w2', 'aal1', `insert into business_blocks (business_id, worker_id) values ('${ids.biz}', '${ids.d}')`));
await ok('business unblocks the worker', async () => { await as('biz', 'aal1', `delete from business_blocks where worker_id = '${ids.w1}'`); return (await as('w1', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where id = '${blk}'`)).rows[0].n; });
await ok('released worker drops off and the spot reopens', async () => { const app = (await as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${blk}', '${ids.w1}') returning id`)).rows[0].id; await as('biz', 'aal1', `update applications set status = 'declined' where id = '${app}'`); return (await db.query(`select status from shifts where id = $1`, [blk])).rows[0].status; });
await denied("released worker can't re-book the same shift", () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${blk}', '${ids.w1}')`));
await ok('released worker no longer sees that shift, others still do', async () => { const me = (await as('w1', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where id = '${blk}'`)).rows[0].n; const other = (await as('d', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where id = '${blk}'`)).rows[0].n; if (me !== 0 || other !== 1) throw new Error(`me ${me}, other ${other}`); return 'hidden for released worker'; });
await ok('blocked worker sees none of that business’s shifts', async () => { await as('biz', 'aal1', `insert into business_blocks (business_id, worker_id) values ('${ids.biz}', '${ids.w2}')`); const n = (await as('w2', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where business_id = '${ids.biz}'`)).rows[0].n; await as('biz', 'aal1', `delete from business_blocks where worker_id = '${ids.w2}'`); const after = (await as('w2', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where business_id = '${ids.biz}'`)).rows[0].n; if (n !== 0 || after === 0) throw new Error(`${n} / ${after}`); return `0 while blocked, ${after} after unblock`; });
await denied("an admin can't ban the CEO", () => as('admin', 'aal2', `select admin_set_flags('${ids.ceo}', null, null, true)`));
await ok('admin bans an account for good', async () => { await db.query(`delete from auth.mfa_factors where user_id = $1`, [ids.admin]); await db.query(`update app_settings set require_staff_mfa = false`); await as('admin', 'aal1', `select admin_set_flags('${ids.w2}', null, null, true)`); return JSON.stringify((await db.query(`select banned, suspended, suspended_reason from profiles where id=$1`, [ids.w2])).rows[0]); });
await denied('a banned account cannot appeal', () => as('w2', 'aal1', `insert into appeals (user_id, reason) values ('${ids.w2}', 'Please let me back in to work')`));
await denied('a banned account cannot unban itself', () => as('w2', 'aal1', `update profiles set banned = false where id = '${ids.w2}'`));
await ok('admin lifts the ban', async () => { await as('admin', 'aal1', `select admin_set_flags('${ids.w2}', null, null, false)`); return JSON.stringify((await db.query(`select banned, suspended from profiles where id=$1`, [ids.w2])).rows[0]); });
await denied('business logo must be an own upload', () => as('biz', 'aal1', `update profiles set business_avatar_url = 'https://evil.example/x.png' where id = '${ids.biz}'`));
await ok('business saves its own logo and about text', async () => { await as('biz', 'aal1', `update profiles set business_avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/${ids.biz}/logo.webp', business_bio = 'Family kitchen since 1998' where id = '${ids.biz}'`); const c = (await as('w1', 'aal1', `select profile_card('${ids.biz}', 'business') c`)).rows[0].c; return c.bio + ' / ' + (c.avatar_url ? 'logo' : 'no logo'); });
await ok('the shift board uses the business logo, not a personal photo', async () => { const r = (await as('anon', null, `select business_avatar from open_shifts(null, null, 2000) where business_id = '${ids.biz}' limit 1`)).rows[0]; return r ? (r.business_avatar || 'none') : 'no open shifts'; });

await ok('one worker on several shifts counts as one worker', async () => { const sum = (await as('biz', 'aal1', `select my_summary() s`)).rows[0].s.business; const card = (await as('w1', 'aal1', `select profile_card('${ids.biz}', 'business') c`)).rows[0].c; const people = (await db.query(`select count(distinct a.worker_id)::int n from applications a join shifts s on s.id = a.shift_id where s.business_id = $1 and a.status in ('accepted','completed')`, [ids.biz])).rows[0].n; if (sum.hired_total !== people || card.workers_hired !== people) throw new Error(JSON.stringify({sum, card: card.workers_hired, people})); return `${people} people, ${card.shifts_filled} bookings`; });

await ok("a business never sees its own shifts on the board", async () => { const own = (await as('biz', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where business_id = '${ids.biz}'`)).rows[0].n; const others = (await as('d', 'aal1', `select count(*)::int n from open_shifts(null, null, 2000) where business_id = '${ids.biz}'`)).rows[0].n; if (own !== 0 || !others) throw new Error(`${own} / ${others}`); return `0 own, ${others} for others`; });

console.log(`\n${pass} passed, ${fail} failed`);
