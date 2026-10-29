import {useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  Search, BadgeCheck, Ban, Building2, UserRound, MapPin, Phone, CalendarDays, Clock, Briefcase, Zap, ShieldCheck, Lock, Undo2,
  Eye, MousePointerClick, LogIn, UserPlus, FileDown, ArrowUpRight, Megaphone, Plus, Pencil, Trash2, Pause, Play, Activity, Mail, LoaderCircle,
} from 'lucide-react';
import {Avatar} from './profile';
import {Sheet} from './JobsView';
import {OfferCard, type Offer} from './ads';
import {browseCategories} from './catalog';

const ago = (v?: string | null) => {
  if (!v) return 'never';
  const m = Math.round((Date.now() - Date.parse(v)) / 60000);
  if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24); return d < 30 ? `${d} day${d > 1 ? 's' : ''} ago` : new Date(v).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'});
};
const Note = ({kind = 'info', children}: {kind?: 'info' | 'error' | 'ok'; children: React.ReactNode}) => <p className={kind === 'error' ? 'alert' : kind === 'ok' ? 'alert ok' : 'hint-box'} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;

// ===================================================================== People
type Person = {
  id: string; email: string; full_name: string | null; business_name: string | null; business_type: string | null; headline: string | null;
  city: string | null; province: string | null; phone: string | null; verified: boolean; suspended: boolean; banned: boolean; payout_ready: boolean;
  created_at: string; last_sign_in_at: string | null; strikes: number; total_strikes: number; suspended_reason: string | null; blocked_by: number;
  can_work?: boolean; can_hire?: boolean; active_mode?: 'worker' | 'business'; work_banned?: boolean; hire_banned?: boolean; ban_reason?: string | null;
  avatar_url?: string | null; business_avatar_url?: string | null; staff_role?: string | null; shifts_done?: number; shifts_posted?: number;
  work_paused?: boolean; hire_paused?: boolean; pause_reason?: string | null;
};
type Filter = 'all' | 'workers' | 'business' | 'paused' | 'banned';

export function PeopleAdmin({sb}: {sb: SupabaseClient}) {
  const [q, setQ] = useState(''), [rows, setRows] = useState<Person[] | null>(null), [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('all'), [sheet, setSheet] = useState<{p: Person; kind: Kind} | null>(null);
  // Before database update 10 the list has no working/hiring details, so fall back to the account type and whole-account actions only.
  const [legacy, setLegacy] = useState(false);
  const load = (search = q) => sb.rpc('admin_users', {p_search: search, p_limit: 200, p_offset: 0}).then(({data, error}) => {
    if (error) return setErr(error.message);
    const list = (data || []) as (Person & {account_type?: 'worker' | 'business'})[];
    const old = list.length > 0 && list[0].can_work === undefined;
    setLegacy(old);
    setRows(old ? list.map(p => ({...p, can_work: p.account_type !== 'business', can_hire: p.account_type === 'business' || !!p.business_name, active_mode: p.account_type})) : list);
  });
  useEffect(() => { load(''); }, []);
  const verify = async (p: Person) => { const {error} = await sb.rpc('admin_set_flags', {p_user: p.id, p_verified: !p.verified}); if (error) alert(error.message); load(); };
  const isPaused = (p: Person) => !p.banned && (p.suspended || !!p.work_paused || !!p.hire_paused);
  const isBanned = (p: Person) => p.banned || !!p.work_banned || !!p.hire_banned;
  const match = (p: Person, f: Filter) => f === 'all' ? true
    : f === 'workers' ? !!p.can_work && !p.work_banned
    : f === 'business' ? !!p.business_name && (!!p.can_hire || !!p.hire_banned)
    : f === 'paused' ? isPaused(p) : isBanned(p);
  const shown = (rows || []).filter(p => match(p, filter));

  return (
    <div className="stack">
      <form className="search-box big" onSubmit={e => { e.preventDefault(); load(); }}><Search size={18}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, business, email or phone" aria-label="Search people"/><button className="btn btn-dark btn-sm">Search</button></form>
      <div className="chip-wrap">{([['all', 'Everyone'], ['workers', 'Workers'], ['business', 'Businesses'], ['paused', 'Paused'], ['banned', 'Banned']] as [Filter, string][]).map(([k, l]) =>
        <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l} <em className="count">{rows ? (rows.filter(p => match(p, k)).length) : ''}</em></button>)}</div>
      {err && <Note kind="error">{err}</Note>}
      {legacy && <Note kind="error">Your database is missing the latest update, so phone numbers, photos and pausing or banning just one side aren’t available yet. In Supabase → SQL Editor, run <strong>supabase/run-updates.sql</strong>, then refresh this page.</Note>}
      {!rows ? <div className="card-panel center"><span className="spinner"/></div>
        : !shown.length ? <div className="empty small"><h3>Nobody here</h3><p>Try another filter or search.</p></div>
        : <div className="people-grid">{shown.map(p => <PersonCard key={p.id} p={p} paused={isPaused(p)} banned={isBanned(p)} onVerify={() => verify(p)} onOpen={kind => setSheet({p, kind})}/>)}</div>}
      {sheet && <ActionSheet sb={sb} p={sheet.p} kind={sheet.kind} legacy={legacy} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }}/>}
    </div>
  );
}

type Kind = 'pause' | 'ban';
type Scope = 'account' | 'work' | 'business';

function PersonCard({p, paused, banned, onVerify, onOpen}: {p: Person; paused: boolean; banned: boolean; onVerify: () => void; onOpen: (k: Kind) => void}) {
  const name = p.full_name?.trim() || 'No name added';
  const status = p.banned ? <span className="pill declined"><Ban size={12}/>Banned</span>
    : p.suspended ? <span className="pill paused"><Lock size={12}/>Paused</span>
    : p.verified ? <span className="pill accepted"><BadgeCheck size={12}/>Verified</span> : <span className="pill">Active</span>;
  const team = p.staff_role ? <span className="pill team"><ShieldCheck size={12}/>{p.staff_role === 'ceo' ? 'CEO' : 'Admin'}</span> : null;
  const live = !p.banned && !p.suspended && !p.staff_role;
  const sideState = (ban?: boolean, pause?: boolean, used?: boolean) => ban ? ' off' : pause ? ' paused' : !used ? ' unused' : '';
  const notes: [string, string][] = [];
  if (p.banned) notes.push(['Whole account banned', p.ban_reason || 'No reason recorded.']);
  else {
    if (p.work_banned || p.hire_banned) notes.push([p.work_banned ? 'Banned from working' : 'Business banned', p.ban_reason || 'No reason recorded.']);
    if (p.suspended) notes.push(['Account paused', p.suspended_reason || 'No reason recorded.']);
    else if (p.work_paused || p.hire_paused) notes.push([p.work_paused && p.hire_paused ? 'Working and hiring paused' : p.work_paused ? 'Working paused' : 'Hiring paused', p.pause_reason || 'No reason recorded.']);
  }
  return (
    <article className={'person-card' + (p.banned ? ' is-banned' : paused ? ' is-paused' : '')}>
      <header className="person-top">
        <Avatar url={p.avatar_url} name={name} size={52}/>
        <div className="person-id">
          <strong>{name}</strong>
          <a className="person-mail" href={'mailto:' + p.email}><Mail size={12}/>{p.email}</a>
          {p.headline && <small className="muted">{p.headline}</small>}
        </div>
        <div className="person-pills">{team}{status}</div>
      </header>

      <div className="person-sides">
        <div className={'side' + sideState(p.work_banned, p.work_paused, p.can_work) + (p.active_mode === 'worker' && live ? ' now' : '')}>
          <UserRound size={16}/><div><b>Working</b><small>{p.work_banned ? 'Banned' : p.work_paused ? 'Paused' : p.can_work ? `${p.shifts_done ?? 0} shifts done · ${p.strikes ?? 0} strike${p.strikes === 1 ? '' : 's'}` : 'Not used'}</small></div>
          {p.active_mode === 'worker' && live && !p.work_banned && <i className="now-tag">now</i>}
        </div>
        <div className={'side' + sideState(p.hire_banned, p.hire_paused, p.can_hire) + (p.active_mode === 'business' && live ? ' now' : '')}>
          {p.business_avatar_url ? <Avatar url={p.business_avatar_url} name={p.business_name} size={22}/> : <Building2 size={16}/>}
          <div><b>{p.business_name || 'No business'}</b><small>{p.hire_banned ? 'Business banned' : p.hire_paused ? 'Hiring paused' : p.business_name ? `${p.business_type ? p.business_type + ' · ' : ''}${p.shifts_posted ?? 0} shifts posted` : 'Not used'}</small></div>
          {p.active_mode === 'business' && live && !p.hire_banned && <i className="now-tag">now</i>}
        </div>
      </div>

      <dl className="person-facts">
        <div><dt><MapPin size={13}/>Area</dt><dd>{[p.city, p.province].filter(Boolean).join(', ') || '—'}</dd></div>
        <div><dt><Phone size={13}/>Phone</dt><dd>{p.phone ? <a href={'tel:' + p.phone.replace(/[^\d+]/g, '')}>{p.phone}</a> : '—'}</dd></div>
        <div><dt><CalendarDays size={13}/>Joined</dt><dd>{new Date(p.created_at).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'})}</dd></div>
        <div><dt><Clock size={13}/>Last sign-in</dt><dd>{ago(p.last_sign_in_at)}</dd></div>
        <div><dt><ShieldCheck size={13}/>Payouts</dt><dd>{p.payout_ready ? 'Bank added' : 'Not set up'}</dd></div>
        <div><dt><Ban size={13}/>Blocked by</dt><dd>{p.blocked_by ? `${p.blocked_by} business${p.blocked_by > 1 ? 'es' : ''}` : 'Nobody'}</dd></div>
      </dl>

      {notes.map(([t, r]) => <div key={t} className={'ban-box' + (t.includes('aused') ? ' pause' : '')}><strong>{t}</strong><span>{r}</span></div>)}

      {/* Same five buttons on every card, always on one line. */}
      <div className="act-bar">
        <a className="act" href={'profile.html?id=' + p.id}><Eye size={18}/><span>Profile</span></a>
        {p.business_name && !p.hire_banned
          ? <a className="act" href={'profile.html?view=business&id=' + p.id}><Building2 size={18}/><span>Business</span></a>
          : <span className="act disabled" aria-disabled="true"><Building2 size={18}/><span>Business</span></span>}
        <button className={'act' + (p.verified ? ' on' : '')} onClick={onVerify}><BadgeCheck size={18}/><span>{p.verified ? 'Verified' : 'Verify'}</span></button>
        <button className={'act warn' + (paused ? ' on' : '')} disabled={!!p.staff_role || p.banned} onClick={() => onOpen('pause')}><Lock size={18}/><span>{paused ? 'Paused' : 'Pause'}</span></button>
        <button className={'act danger' + (banned ? ' on' : '')} disabled={!!p.staff_role} onClick={() => onOpen('ban')}><Ban size={18}/><span>{banned ? 'Banned' : 'Ban'}</span></button>
      </div>
    </article>
  );
}

// One sheet for pausing and banning: pick the whole account, only working, or only the business — and undo any that are on.
function ActionSheet({sb, p, kind, legacy, onClose, onDone}: {sb: SupabaseClient; p: Person; kind: Kind; legacy: boolean; onClose: () => void; onDone: () => void}) {
  const ban = kind === 'ban';
  const who = p.full_name || p.email;
  const biz = p.business_name || 'their business';
  const on: Record<Scope, boolean> = ban
    ? {account: p.banned, work: !!p.work_banned, business: !!p.hire_banned}
    : {account: p.suspended, work: !!p.work_paused, business: !!p.hire_paused};
  const canWork = !legacy && !!p.can_work && !p.work_banned, canBiz = !legacy && !!p.business_name && !!p.can_hire && !p.hire_banned;
  const avail: Record<Scope, boolean> = {account: !on.account, work: canWork && !on.work && !on.account, business: canBiz && !on.business && !on.account};
  const label: Record<Scope, [string, string]> = ban ? {
    account: [`Ban ${who}`, 'Can’t work or hire on Community Work again, with any side of this account. Their open shifts disappear.'],
    work: ['Ban from working only', canBiz ? `No more picking up shifts. ${biz} keeps hiring — Working disappears from their account.` : 'They have no business, so this closes the whole account.'],
    business: [`Ban ${biz} only`, `The business can’t hire and its open shifts are removed. ${who} can still pick up shifts — Hiring disappears.`],
  } : {
    account: [`Pause ${who}`, 'Can’t work or hire until you restore them or approve their appeal. Their open shifts are hidden meanwhile.'],
    work: ['Pause working only', 'Can’t pick up shifts for now. Their business (if any) keeps hiring. They can appeal.'],
    business: [`Pause ${biz} only`, `The business can’t post shifts and its open shifts are hidden for now. ${who} can still pick up shifts. They can appeal.`],
  };
  const first = (['account', 'work', 'business'] as Scope[]).find(k => avail[k]) || 'account';
  const [scope, setScope] = useState<Scope>(first);
  const [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const call = async (sc: Scope, turnOn: boolean) => {
    if (legacy) return sb.rpc('admin_set_flags', ban ? {p_user: p.id, p_banned: turnOn} : {p_user: p.id, p_suspended: turnOn});
    return sb.rpc(ban ? 'admin_ban' : 'admin_pause', {p_user: p.id, p_scope: sc, p_on: turnOn, p_reason: turnOn ? (reason.trim() || null) : null});
  };
  const undo = async (sc: Scope) => {
    setBusy(true); setErr('');
    const {error} = await call(sc, false);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  };
  const active = (['account', 'work', 'business'] as Scope[]).filter(k => on[k]);
  const anyAvail = (['account', 'work', 'business'] as Scope[]).some(k => avail[k]);
  return (
    <Sheet title={ban ? 'Ban permanently' : 'Pause for now'} onClose={onClose}>
      <form className="form" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('');
        const {data, error} = await call(scope, true);
        setBusy(false);
        if (error) return setErr(error.message);
        if (ban && !legacy && data && data !== scope) alert('They had nothing else on this account, so the whole account was banned.');
        onDone();
      }}>
        <p className="muted">{ban ? <>Bans are permanent and can’t be appealed. For a second chance, use <strong>Pause</strong>.</> : <>A pause is temporary: they see the reason and can appeal. Restore any time.</>} Every change is logged with your name.</p>
        {legacy && <Note kind="error">Only the whole account can be {ban ? 'banned' : 'paused'} until you run <strong>supabase/run-updates.sql</strong> in Supabase.</Note>}
        {active.length > 0 && (
          <div className="undo-list">{active.map(k => (
            <div key={k} className="undo-row">
              <span><strong>{k === 'account' ? (ban ? 'Whole account banned' : 'Whole account paused') : k === 'work' ? (ban ? 'Banned from working' : 'Working paused') : (ban ? 'Business banned' : 'Hiring paused')}</strong>
                <small>{(ban ? p.ban_reason : k === 'account' ? p.suspended_reason : p.pause_reason) || 'No reason recorded.'}</small></span>
              <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => confirm(`${ban ? 'Lift this ban' : 'Restore this'} for ${who}?`) && undo(k)}><Undo2 size={14}/>{ban ? 'Lift' : 'Restore'}</button>
            </div>))}</div>
        )}
        {anyAvail && <>
          <div className="ban-options">{(['account', 'work', 'business'] as Scope[]).filter(k => avail[k]).map(k => (
            <label key={k} className={'ban-option' + (scope === k ? ' on' : '') + (ban ? '' : ' pause')}>
              <input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)}/>
              <span><strong>{label[k][0]}</strong><small>{label[k][1]}</small></span>
            </label>))}</div>
          {!legacy && <label className="field">Reason (they’ll see this)<textarea className="wrap-text" rows={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)} placeholder={ban ? 'e.g. Didn’t pay workers for three shifts' : 'e.g. Three late arrivals this month'}/><small>{reason.length}/300</small></label>}
        </>}
        {err && <Note kind="error">{err}</Note>}
        {anyAvail && <button className={'btn btn-block ' + (ban ? 'btn-danger' : 'btn-warn')} disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : ban ? <Ban size={17}/> : <Lock size={17}/>}{ban ? 'Ban permanently' : 'Pause'}</button>}
      </form>
    </Sheet>
  );
}

// ===================================================================== Live activity
const EVENT: Record<string, [string, React.ComponentType<{size?: number}>, string]> = {
  page_view: ['Opened a page', Eye, 'grey'], job_view: ['Looked at a job', Briefcase, 'blue'], apply_click: ['Clicked Apply on a job', ArrowUpRight, 'green'],
  sponsored_view: ['Saw an offer', Megaphone, 'grey'], sponsored_click: ['Clicked an offer', MousePointerClick, 'amber'], ad_view: ['Saw an ad', Megaphone, 'grey'],
  shift_view: ['Opened a shift', CalendarDays, 'blue'], shift_apply: ['Picked up a shift', Zap, 'green'], sign_up: ['Created an account', UserPlus, 'green'],
  sign_in: ['Signed in', LogIn, 'blue'], cv_download: ['Downloaded a CV', FileDown, 'green'], search: ['Searched', Search, 'grey'], install: ['Installed the app', Plus, 'green'],
  outbound_click: ['Left to another site', ArrowUpRight, 'grey'],
};
const PAGE: Record<string, string> = {'/': 'Home', '/index.html': 'Home', '/find-work.html': 'Find work', '/shifts.html': 'Shifts', '/account.html': 'Account', '/support.html': 'Support',
  '/help.html': 'Help', '/rules.html': 'Community rules', '/saved-jobs.html': 'Saved jobs', '/cv-builder.html': 'CV builder', '/job.html': 'Job details', '/profile.html': 'Profile',
  '/how-it-works.html': 'How it works', '/about.html': 'About', '/privacy.html': 'Privacy', '/terms.html': 'Terms', '/post-job.html': 'Hire workers'};
const pageName = (path?: string | null) => { if (!path) return ''; const p = path.replace(/^\/South-Africa-Community-Work/i, '').split('?')[0]; return PAGE[p] || p; };

export function LiveFeed({data}: {data: {active_visitors: number; events: number; recent: {at: string; type: string; path: string | null; target: string | null}[]}}) {
  return (
    <div className="stack">
      <div className="stat-grid two">
        <div className="tile big"><span><Activity size={15}/> Active in the last 30 min</span><strong>{data.active_visitors.toLocaleString('en-ZA')}</strong><small>people on the site</small></div>
        <div className="tile big"><span>Actions</span><strong>{data.events.toLocaleString('en-ZA')}</strong><small>refreshes every 15 seconds</small></div>
      </div>
      <section className="card-panel feed">
        <h3>Latest activity</h3>
        {!data.recent?.length ? <p className="muted">Nothing in the last 30 minutes.</p> : (
          <ol className="feed-list">{data.recent.map((e, i) => {
            const [label, Icon, tone] = EVENT[e.type] || [e.type.replace(/_/g, ' '), Activity, 'grey'];
            const detail = e.target && !/^[0-9a-f-]{36}$/i.test(e.target) ? e.target : '';
            return (
              <li key={i}>
                <span className={'feed-ic ' + tone}><Icon size={15}/></span>
                <div><strong>{label}</strong><small>{[pageName(e.path), detail].filter(Boolean).join(' · ') || '—'}</small></div>
                <time>{ago(e.at)}</time>
              </li>
            );
          })}</ol>
        )}
      </section>
    </div>
  );
}

// ===================================================================== Sponsored offers (job pages only)
type Promo = {id: string; partner: string; title: string; body: string | null; url: string; cta: string | null; badge: string | null; logo: string | null;
  impression_url: string | null; modes: string[]; categories: string[]; spots: string[]; weight: number; active: boolean; starts_on: string | null; ends_on: string | null};
const SPOTS: [string, string][] = [['feed', 'Between jobs in the list'], ['sidebar', 'Beside the list (computer)'], ['article', 'On a job’s page'], ['hanging', 'Banner at the bottom (phones)']];
const toOffer = (p: Partial<Promo>): Offer => ({id: p.id || 'preview', partner: p.partner || 'Partner name', title: p.title || 'Your headline', text: p.body || '', url: p.url || 'https://example.com',
  cta: p.cta || undefined, badge: p.badge || undefined, logo: p.logo || undefined});

export function AdsAdmin({sb, role}: {sb: SupabaseClient; role: 'ceo' | 'admin'}) {
  const [rows, setRows] = useState<Promo[] | null>(null), [stats, setStats] = useState<Record<string, {views: number; clicks: number}>>({});
  const [on, setOn] = useState<boolean | null>(null), [edit, setEdit] = useState<Partial<Promo> | null>(null), [err, setErr] = useState('');
  const ceo = role === 'ceo';
  const load = () => {
    sb.from('promos').select('*').order('created_at', {ascending: false}).then(({data, error}) => error ? setErr(error.message.includes('promos') ? 'Run the latest database update (update 10) to manage offers here.' : error.message) : setRows(data as Promo[]));
    sb.rpc('admin_promo_stats', {p_days: 30}).then(({data}) => setStats(Object.fromEntries(((data as any[]) || []).map(r => [r.target, {views: Number(r.views), clicks: Number(r.clicks)}]))));
    sb.rpc('public_settings').then(({data}) => setOn((data as any)?.promos_enabled ?? true));
  };
  useEffect(load, []);
  const save = async (p: Partial<Promo>) => {
    const row = {partner: p.partner, title: p.title, body: p.body || null, url: p.url, cta: p.cta || null, badge: p.badge || null, logo: p.logo || null,
      impression_url: p.impression_url || null, modes: p.modes || [], categories: p.categories || [], spots: p.spots?.length ? p.spots : ['feed', 'sidebar', 'article'],
      weight: p.weight || 1, active: p.active ?? true, starts_on: p.starts_on || null, ends_on: p.ends_on || null};
    const {error} = p.id ? await sb.from('promos').update(row).eq('id', p.id) : await sb.from('promos').insert(row);
    if (error) return error.message;
    setEdit(null); load(); return '';
  };
  return (
    <div className="stack">
      <section className="card-panel section-card ads-head">
        <header className="sec-head"><Megaphone size={18}/><div><h2>Sponsored offers</h2><p>Affiliate links shown only on the job pages — Home, Find work (in person and online) and job details. Nowhere else.</p></div></header>
        <div className="row-gap start">
          <label className="switch"><input type="checkbox" checked={!!on} disabled={!ceo || on === null} onChange={async e => { const v = e.target.checked; setOn(v); const {error} = await sb.rpc('admin_set_promos', {p_on: v}); if (error) { alert(error.message); setOn(!v); } }}/><span/>{on ? 'Showing on job pages' : 'All offers switched off'}</label>
          {ceo && <button className="btn btn-primary btn-sm" onClick={() => setEdit({active: true, weight: 1, spots: ['feed', 'sidebar', 'article'], modes: [], categories: []})}><Plus size={15}/>Add offer</button>}
        </div>
        {!ceo && <p className="muted small">Only the CEO can add or change offers.</p>}
      </section>
      {err && <Note kind="error">{err}</Note>}
      {!rows ? (!err && <div className="card-panel center"><span className="spinner"/></div>)
        : !rows.length ? <div className="empty small"><div className="empty-icon"><Megaphone size={26}/></div><h3>No offers yet</h3><p>Add your first affiliate link — a course, a data deal, work gear — and it appears between jobs.</p></div>
        : <div className="promo-list">{rows.map(p => {
            const st = stats[p.id] || {views: 0, clicks: 0};
            const live = p.active && (!p.starts_on || p.starts_on <= new Date().toISOString().slice(0, 10)) && (!p.ends_on || p.ends_on >= new Date().toISOString().slice(0, 10));
            return (
              <article key={p.id} className={'promo-row' + (live ? '' : ' paused')}>
                <div className="promo-main">
                  <strong>{p.title}</strong>
                  <small>{p.partner} · {p.modes.length === 1 ? (p.modes[0] === 'remote' ? 'Online jobs' : 'In-person jobs') : 'All jobs'}{p.categories.length ? ` · ${p.categories.slice(0, 3).join(', ')}${p.categories.length > 3 ? '…' : ''}` : ''}</small>
                  <a className="promo-url" href={p.url} target="_blank" rel="noreferrer">{p.url}</a>
                </div>
                <div className="promo-stats"><span><b>{st.views.toLocaleString('en-ZA')}</b>views</span><span><b>{st.clicks.toLocaleString('en-ZA')}</b>clicks</span><span><b>{st.views ? (st.clicks / st.views * 100).toFixed(1) : '0'}%</b>rate</span></div>
                <div className="promo-actions">
                  <span className={'pill ' + (live ? 'accepted' : '')}>{live ? 'Live' : p.active ? 'Scheduled' : 'Paused'}</span>
                  {ceo && <>
                    <button className="icon-btn" aria-label={p.active ? 'Pause' : 'Resume'} title={p.active ? 'Pause' : 'Resume'} onClick={async () => { await sb.from('promos').update({active: !p.active}).eq('id', p.id); load(); }}>{p.active ? <Pause size={16}/> : <Play size={16}/>}</button>
                    <button className="icon-btn" aria-label="Edit" title="Edit" onClick={() => setEdit(p)}><Pencil size={16}/></button>
                    <button className="icon-btn danger" aria-label="Delete" title="Delete" onClick={async () => { if (confirm(`Delete “${p.title}”?`)) { await sb.from('promos').delete().eq('id', p.id); load(); } }}><Trash2 size={16}/></button>
                  </>}
                </div>
              </article>
            );
          })}</div>}
      <p className="muted small">Views count when half an offer is on screen; clicks when someone taps it. Last 30 days. Google AdSense (if you switch it on in <code>ads-config.json</code>) also only shows on the job pages.</p>
      {edit && <PromoForm initial={edit} onSave={save} onClose={() => setEdit(null)}/>}
    </div>
  );
}

function PromoForm({initial, onSave, onClose}: {initial: Partial<Promo>; onSave: (p: Partial<Promo>) => Promise<string>; onClose: () => void}) {
  const [p, setP] = useState<Partial<Promo>>(initial), [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const set = <K extends keyof Promo>(k: K, v: Promo[K]) => setP(x => ({...x, [k]: v}));
  const toggle = (k: 'modes' | 'categories' | 'spots', v: string) => setP(x => { const cur = new Set(x[k] || []); cur.has(v) ? cur.delete(v) : cur.add(v); return {...x, [k]: [...cur]}; });
  return (
    <Sheet title={p.id ? 'Edit offer' : 'New offer'} onClose={onClose} wide>
      <form className="form promo-form" onSubmit={async e => { e.preventDefault(); setBusy(true); setErr(await onSave(p)); setBusy(false); }}>
        <div className="grid-2">
          <label className="field">Partner / brand<input value={p.partner || ''} onChange={e => set('partner', e.target.value)} required maxLength={60} placeholder="e.g. Coursera"/></label>
          <label className="field">Button text<input value={p.cta || ''} onChange={e => set('cta', e.target.value)} maxLength={24} placeholder="Learn more"/></label>
        </div>
        <label className="field">Headline<input value={p.title || ''} onChange={e => set('title', e.target.value)} required minLength={3} maxLength={90} placeholder="e.g. Learn Excel in two weeks"/></label>
        <label className="field">Short description<textarea className="wrap-text" rows={2} value={p.body || ''} onChange={e => set('body', e.target.value)} maxLength={200} placeholder="One or two short sentences."/><small>{(p.body || '').length}/200</small></label>
        <label className="field">Your affiliate link<input type="url" value={p.url || ''} onChange={e => set('url', e.target.value)} required pattern="https://.*" placeholder="https://…"/></label>
        <div className="grid-2">
          <label className="field">Highlight (optional)<input value={p.badge || ''} onChange={e => set('badge', e.target.value)} maxLength={30} placeholder="e.g. Free to join"/></label>
          <label className="field">Logo image link (optional)<input type="url" value={p.logo || ''} onChange={e => set('logo', e.target.value)} pattern="https://.*" placeholder="https://…/logo.png"/></label>
        </div>
        <fieldset><legend>Show with</legend><div className="chip-wrap">
          <button type="button" className={!p.modes?.length ? 'on' : ''} onClick={() => set('modes', [])}>All jobs</button>
          <button type="button" className={p.modes?.length === 1 && p.modes[0] === 'onsite' ? 'on' : ''} onClick={() => set('modes', ['onsite'])}>In-person jobs</button>
          <button type="button" className={p.modes?.length === 1 && p.modes[0] === 'remote' ? 'on' : ''} onClick={() => set('modes', ['remote'])}>Online jobs</button>
        </div></fieldset>
        <fieldset><legend>Best for these kinds of jobs (optional — shown more often next to them)</legend><div className="chip-wrap">
          {browseCategories.map(c => <button type="button" key={c} className={p.categories?.includes(c) ? 'on' : ''} onClick={() => toggle('categories', c)}>{c}</button>)}
        </div></fieldset>
        <fieldset><legend>Where it can appear</legend><div className="chip-wrap">
          {SPOTS.map(([k, l]) => <button type="button" key={k} className={p.spots?.includes(k) ? 'on' : ''} onClick={() => toggle('spots', k)}>{l}</button>)}
        </div></fieldset>
        <div className="grid-3">
          <label className="field">Starts (optional)<input type="date" value={p.starts_on || ''} onChange={e => set('starts_on', e.target.value || null)}/></label>
          <label className="field">Ends (optional)<input type="date" value={p.ends_on || ''} onChange={e => set('ends_on', e.target.value || null)}/></label>
          <label className="field">Priority<select value={p.weight || 1} onChange={e => set('weight', Number(e.target.value))}>{[1, 2, 3, 5, 10].map(w => <option key={w} value={w}>{w === 1 ? 'Normal' : `${w}× more often`}</option>)}</select></label>
        </div>
        <label className="field">View-tracking pixel from your network (optional)<input type="url" value={p.impression_url || ''} onChange={e => set('impression_url', e.target.value)} pattern="https://.*" placeholder="Only if your affiliate network gives you one"/></label>
        <label className="check"><input type="checkbox" checked={p.active ?? true} onChange={e => set('active', e.target.checked)}/><span>Live (untick to save it paused)</span></label>
        <p className="overline">Preview</p>
        <div className="promo-preview"><OfferCard offer={toOffer(p)} spot="feed" preview/></div>
        {err && <Note kind="error">{err}</Note>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : null}{p.id ? 'Save changes' : 'Add offer'}</button>
      </form>
    </Sheet>
  );
}
