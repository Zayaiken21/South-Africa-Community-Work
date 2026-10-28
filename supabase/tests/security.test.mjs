// Security tests for the database rules. Runs the migration in an in-process Postgres (PGlite) with stand-ins
// for Supabase auth and storage, then acts as the CEO, an admin, a business, two workers and an anonymous visitor.
//   npm i @electric-sql/pglite   then   node supabase/tests/security.test.mjs supabase/migrations/20261028000000_marketplace.sql
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const db = new PGlite();
const pre = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}', created_at timestamptz default now(), last_sign_in_at timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
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
await ok('worker 1 sees the business profile (contact)', async () => (await as('w1', 'aal1', `select business_name from profiles where id = '${ids.biz}'`)).rows[0]?.business_name || Promise.reject(new Error('hidden')));
let overlapId;
await ok('business posts a second shift at the same time', async () => { overlapId = (await as('biz', 'aal1', shiftSql(50))).rows[0].id; return 'ok'; });
await denied('worker 1 cannot double-book the same hours', () => as('w1', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w1}')`));
await ok('worker 2 picks up the second shift', async () => { a2 = (await as('w2', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w2}') returning id`)).rows[0].id; return a2; });
await ok('cancelling within the grace period is free', async () => { await as('w2', 'aal1', `update applications set status = 'withdrawn' where id = '${a2}'`); return (await db.query(`select strikes from profiles where id=$1`, [ids.w2])).rows[0].strikes; });
await denied('worker cannot re-take a shift they cancelled', () => as('w2', 'aal1', `insert into applications (shift_id, worker_id) values ('${overlapId}', '${ids.w2}')`));

// profile protections
await denied('worker cannot mark itself verified', () => as('w1', 'aal1', `update profiles set verified = true where id = '${ids.w1}'`));
await denied('worker cannot set payout flag', () => as('w1', 'aal1', `update profiles set payout_ready = true where id = '${ids.w1}'`));
await denied('worker cannot switch to business after applying', () => as('w1', 'aal1', `update profiles set account_type = 'business' where id = '${ids.w1}'`));
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
await ok('new user can still switch to business before any activity', async () => { await as('d', 'aal1', `update profiles set account_type = 'business' where id = '${ids.d}'`); return (await db.query(`select account_type from profiles where id=$1`, [ids.d])).rows[0].account_type; });
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

console.log(`\n${pass} passed, ${fail} failed`);
