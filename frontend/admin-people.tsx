/*
  Parts of the CEO / admin dashboard:
    People      — a card per account with its working and hiring sides, contact details, and Pause / Ban per side
    Live        — what visitors are doing right now, in plain words
    Affiliate ads — add, edit, pause and measure the affiliate ads shown on the job pages
*/
import {useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  Search,
  BadgeCheck,
  Ban,
  Building2,
  UserRound,
  MapPin,
  Phone,
  CalendarDays,
  Clock,
  Briefcase,
  Zap,
  ShieldCheck,
  Lock,
  Undo2,
  Eye,
  MousePointerClick,
  LogIn,
  UserPlus,
  FileDown,
  ArrowUpRight,
  Megaphone,
  Plus,
  Pencil,
  Trash2,
  Pause,
  Play,
  Activity,
  Mail,
  LoaderCircle,
} from 'lucide-react';
import {Avatar} from './profile';
import {Sheet} from './JobsView';
import {OfferCard, type Offer} from './ads';
import {ONLINE_CHANNEL, type OnlinePerson} from './analytics';
import {browseCategories} from './catalog';

/** "5 min ago", "2 h ago", or a date. */
const ago = (v?: string | null) => {
  if (!v) return 'never';
  const m = Math.round((Date.now() - Date.parse(v)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 30
    ? `${d} day${d > 1 ? 's' : ''} ago`
    : new Date(v).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'});
};
/** A small message box (info, error or success). */
const Note = ({kind = 'info', children}: {kind?: 'info' | 'error' | 'ok'; children: React.ReactNode}) => (
  <p
    className={kind === 'error' ? 'alert' : kind === 'ok' ? 'alert ok' : 'hint-box'}
    role={kind === 'error' ? 'alert' : 'status'}
  >
    {children}
  </p>
);

// ===================================================================== People
type Person = {
  id: string;
  email: string;
  full_name: string | null;
  business_name: string | null;
  business_type: string | null;
  headline: string | null;
  city: string | null;
  province: string | null;
  phone: string | null;
  verified: boolean;
  suspended: boolean;
  banned: boolean;
  payout_ready: boolean;
  created_at: string;
  last_sign_in_at: string | null;
  strikes: number;
  total_strikes: number;
  suspended_reason: string | null;
  blocked_by: number;
  can_work?: boolean;
  can_hire?: boolean;
  active_mode?: 'worker' | 'business';
  work_banned?: boolean;
  hire_banned?: boolean;
  ban_reason?: string | null;
  avatar_url?: string | null;
  business_avatar_url?: string | null;
  staff_role?: string | null;
  shifts_done?: number;
  shifts_posted?: number;
  work_paused?: boolean;
  hire_paused?: boolean;
  pause_reason?: string | null;
};
/** The filter chips above the people list. */
type Filter = 'all' | 'workers' | 'business' | 'paused' | 'banned';

/** People tab: search, filters and a card per account. */
export function PeopleAdmin({sb}: {sb: SupabaseClient}) {
  const [q, setQ] = useState(''),
    [rows, setRows] = useState<Person[] | null>(null),
    [err, setErr] = useState('');
  const [filter, setFilter] = useState<Filter>('all'),
    [sheet, setSheet] = useState<{p: Person; kind: Kind} | null>(null);
  // Before database update 10 the list has no working/hiring details, so fall back to the account type and whole-account actions only.
  const [legacy, setLegacy] = useState(false);
  const load = (search = q) =>
    sb.rpc('admin_users', {p_search: search, p_limit: 200, p_offset: 0}).then(({data, error}) => {
      if (error) return setErr(error.message);
      const list = (data || []) as (Person & {account_type?: 'worker' | 'business'})[];
      const old = list.length > 0 && list[0].can_work === undefined;
      setLegacy(old);
      setRows(
        old
          ? list.map(p => ({
              ...p,
              can_work: p.account_type !== 'business',
              can_hire: p.account_type === 'business' || !!p.business_name,
              active_mode: p.account_type,
            }))
          : list,
      );
    });
  useEffect(() => {
    load('');
  }, []);
  const verify = async (p: Person) => {
    const {error} = await sb.rpc('admin_set_flags', {p_user: p.id, p_verified: !p.verified});
    if (error) alert(error.message);
    load();
  };
  const isPaused = (p: Person) => !p.banned && (p.suspended || !!p.work_paused || !!p.hire_paused);
  const isBanned = (p: Person) => p.banned || !!p.work_banned || !!p.hire_banned;
  const match = (p: Person, f: Filter) =>
    f === 'all'
      ? true
      : f === 'workers'
        ? !!p.can_work && !p.work_banned
        : f === 'business'
          ? !!p.business_name && (!!p.can_hire || !!p.hire_banned)
          : f === 'paused'
            ? isPaused(p)
            : isBanned(p);
  const shown = (rows || []).filter(p => match(p, filter));

  return (
    <div className="stack">
      <form
        className="search-box big"
        onSubmit={e => {
          e.preventDefault();
          load();
        }}
      >
        <Search size={18} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Name, business, email or phone"
          aria-label="Search people"
        />
        <button className="btn btn-dark btn-sm">Search</button>
      </form>
      <div className="chip-wrap">
        {(
          [
            ['all', 'Everyone'],
            ['workers', 'Workers'],
            ['business', 'Businesses'],
            ['paused', 'Paused'],
            ['banned', 'Banned'],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l} <em className="count">{rows ? rows.filter(p => match(p, k)).length : ''}</em>
          </button>
        ))}
      </div>
      {err && <Note kind="error">{err}</Note>}
      {legacy && (
        <Note kind="error">
          Your database is missing the latest update, so phone numbers, photos and pausing or banning just one side
          aren’t available yet. In Supabase → SQL Editor, run <strong>supabase/run-updates.sql</strong>, then refresh
          this page.
        </Note>
      )}
      {!rows ? (
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      ) : !shown.length ? (
        <div className="empty small">
          <h3>Nobody here</h3>
          <p>Try another filter or search.</p>
        </div>
      ) : (
        <div className="people-grid">
          {shown.map(p => (
            <PersonCard
              key={p.id}
              p={p}
              paused={isPaused(p)}
              banned={isBanned(p)}
              onVerify={() => verify(p)}
              onOpen={kind => setSheet({p, kind})}
            />
          ))}
        </div>
      )}
      {sheet && (
        <ActionSheet
          sb={sb}
          p={sheet.p}
          kind={sheet.kind}
          legacy={legacy}
          onClose={() => setSheet(null)}
          onDone={() => {
            setSheet(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/** Which sheet is open: pause (temporary, appealable) or ban (permanent). */
type Kind = 'pause' | 'ban';
/** What a pause or ban covers: the whole account, only working, or only the business. */
type Scope = 'account' | 'work' | 'business';

/** One person: who they are, both sides of their account, contact details, any pause/ban, and the same five action buttons. */
function PersonCard({
  p,
  paused,
  banned,
  onVerify,
  onOpen,
}: {
  p: Person;
  paused: boolean;
  banned: boolean;
  onVerify: () => void;
  onOpen: (k: Kind) => void;
}) {
  const name = p.full_name?.trim() || 'No name added';
  const status = p.banned ? (
    <span className="pill declined">
      <Ban size={12} />
      Banned
    </span>
  ) : p.suspended ? (
    <span className="pill paused">
      <Lock size={12} />
      Paused
    </span>
  ) : p.verified ? (
    <span className="pill accepted">
      <BadgeCheck size={12} />
      Verified
    </span>
  ) : (
    <span className="pill">Active</span>
  );
  const team = p.staff_role ? (
    <span className="pill team">
      <ShieldCheck size={12} />
      {p.staff_role === 'ceo' ? 'CEO' : 'Admin'}
    </span>
  ) : null;
  const live = !p.banned && !p.suspended && !p.staff_role;
  const sideState = (ban?: boolean, pause?: boolean, used?: boolean) =>
    ban ? ' off' : pause ? ' paused' : !used ? ' unused' : '';
  const notes: [string, string][] = [];
  if (p.banned) notes.push(['Whole account banned', p.ban_reason || 'No reason recorded.']);
  else {
    if (p.work_banned || p.hire_banned)
      notes.push([p.work_banned ? 'Banned from working' : 'Business banned', p.ban_reason || 'No reason recorded.']);
    if (p.suspended) notes.push(['Account paused', p.suspended_reason || 'No reason recorded.']);
    else if (p.work_paused || p.hire_paused)
      notes.push([
        p.work_paused && p.hire_paused
          ? 'Working and hiring paused'
          : p.work_paused
            ? 'Working paused'
            : 'Hiring paused',
        p.pause_reason || 'No reason recorded.',
      ]);
  }
  return (
    <article className={'person-card' + (p.banned ? ' is-banned' : paused ? ' is-paused' : '')}>
      <header className="person-top">
        <Avatar url={p.avatar_url} name={name} size={52} />
        <div className="person-id">
          <strong>{name}</strong>
          <a className="person-mail" href={'mailto:' + p.email}>
            <Mail size={12} />
            {p.email}
          </a>
          {p.headline && <small className="muted">{p.headline}</small>}
        </div>
        <div className="person-pills">
          {team}
          {status}
        </div>
      </header>

      <div className="person-sides">
        <div
          className={
            'side' +
            sideState(p.work_banned, p.work_paused, p.can_work) +
            (p.active_mode === 'worker' && live ? ' now' : '')
          }
        >
          <UserRound size={16} />
          <div>
            <b>Working</b>
            <small>
              {p.work_banned
                ? 'Banned'
                : p.work_paused
                  ? 'Paused'
                  : p.can_work
                    ? `${p.shifts_done ?? 0} shifts done · ${p.strikes ?? 0} strike${p.strikes === 1 ? '' : 's'}`
                    : 'Not used'}
            </small>
          </div>
          {p.active_mode === 'worker' && live && !p.work_banned && <i className="now-tag">now</i>}
        </div>
        <div
          className={
            'side' +
            sideState(p.hire_banned, p.hire_paused, p.can_hire) +
            (p.active_mode === 'business' && live ? ' now' : '')
          }
        >
          {p.business_avatar_url ? (
            <Avatar url={p.business_avatar_url} name={p.business_name} size={22} />
          ) : (
            <Building2 size={16} />
          )}
          <div>
            <b>{p.business_name || 'No business'}</b>
            <small>
              {p.hire_banned
                ? 'Business banned'
                : p.hire_paused
                  ? 'Hiring paused'
                  : p.business_name
                    ? `${p.business_type ? p.business_type + ' · ' : ''}${p.shifts_posted ?? 0} shifts posted`
                    : 'Not used'}
            </small>
          </div>
          {p.active_mode === 'business' && live && !p.hire_banned && <i className="now-tag">now</i>}
        </div>
      </div>

      <dl className="person-facts">
        <div>
          <dt>
            <MapPin size={13} />
            Area
          </dt>
          <dd>{[p.city, p.province].filter(Boolean).join(', ') || '—'}</dd>
        </div>
        <div>
          <dt>
            <Phone size={13} />
            Phone
          </dt>
          <dd>{p.phone ? <a href={'tel:' + p.phone.replace(/[^\d+]/g, '')}>{p.phone}</a> : '—'}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={13} />
            Joined
          </dt>
          <dd>
            {new Date(p.created_at).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short', year: 'numeric'})}
          </dd>
        </div>
        <div>
          <dt>
            <Clock size={13} />
            Last sign-in
          </dt>
          <dd>{ago(p.last_sign_in_at)}</dd>
        </div>
        <div>
          <dt>
            <ShieldCheck size={13} />
            Payouts
          </dt>
          <dd>{p.payout_ready ? 'Bank added' : 'Not set up'}</dd>
        </div>
        <div>
          <dt>
            <Ban size={13} />
            Blocked by
          </dt>
          <dd>{p.blocked_by ? `${p.blocked_by} business${p.blocked_by > 1 ? 'es' : ''}` : 'Nobody'}</dd>
        </div>
      </dl>

      {notes.map(([t, r]) => (
        <div key={t} className={'ban-box' + (t.includes('aused') ? ' pause' : '')}>
          <strong>{t}</strong>
          <span>{r}</span>
        </div>
      ))}

      {/* Same five buttons on every card, always on one line. */}
      <div className="act-bar">
        <a className="act" href={'profile.html?id=' + p.id}>
          <Eye size={18} />
          <span>Profile</span>
        </a>
        {p.business_name && !p.hire_banned ? (
          <a className="act" href={'profile.html?view=business&id=' + p.id}>
            <Building2 size={18} />
            <span>Business</span>
          </a>
        ) : (
          <span className="act disabled" aria-disabled="true">
            <Building2 size={18} />
            <span>Business</span>
          </span>
        )}
        <button className={'act' + (p.verified ? ' on' : '')} onClick={onVerify}>
          <BadgeCheck size={18} />
          <span>{p.verified ? 'Verified' : 'Verify'}</span>
        </button>
        <button
          className={'act warn' + (paused ? ' on' : '')}
          disabled={!!p.staff_role || p.banned}
          onClick={() => onOpen('pause')}
        >
          <Lock size={18} />
          <span>{paused ? 'Paused' : 'Pause'}</span>
        </button>
        <button
          className={'act danger' + (banned ? ' on' : '')}
          disabled={!!p.staff_role}
          onClick={() => onOpen('ban')}
        >
          <Ban size={18} />
          <span>{banned ? 'Banned' : 'Ban'}</span>
        </button>
      </div>
    </article>
  );
}

// One sheet for pausing and banning: pick the whole account, only working, or only the business — and undo any that are on.
function ActionSheet({
  sb,
  p,
  kind,
  legacy,
  onClose,
  onDone,
}: {
  sb: SupabaseClient;
  p: Person;
  kind: Kind;
  legacy: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const ban = kind === 'ban';
  const who = p.full_name || p.email;
  const biz = p.business_name || 'their business';
  const on: Record<Scope, boolean> = ban
    ? {account: p.banned, work: !!p.work_banned, business: !!p.hire_banned}
    : {account: p.suspended, work: !!p.work_paused, business: !!p.hire_paused};
  const canWork = !legacy && !!p.can_work && !p.work_banned,
    canBiz = !legacy && !!p.business_name && !!p.can_hire && !p.hire_banned;
  const avail: Record<Scope, boolean> = {
    account: !on.account,
    work: canWork && !on.work && !on.account,
    business: canBiz && !on.business && !on.account,
  };
  const label: Record<Scope, [string, string]> = ban
    ? {
        account: [
          `Ban ${who}`,
          'Can’t work or hire on Community Work again, with any side of this account. Their open shifts disappear.',
        ],
        work: [
          'Ban from working only',
          canBiz
            ? `No more picking up shifts. ${biz} keeps hiring — Working disappears from their account.`
            : 'They have no business, so this closes the whole account.',
        ],
        business: [
          `Ban ${biz} only`,
          `The business can’t hire and its open shifts are removed. ${who} can still pick up shifts — Hiring disappears.`,
        ],
      }
    : {
        account: [
          `Pause ${who}`,
          'Can’t work or hire until you restore them or approve their appeal. Their open shifts are hidden meanwhile.',
        ],
        work: [
          'Pause working only',
          'Can’t pick up shifts for now. Their business (if any) keeps hiring. They can appeal.',
        ],
        business: [
          `Pause ${biz} only`,
          `The business can’t post shifts and its open shifts are hidden for now. ${who} can still pick up shifts. They can appeal.`,
        ],
      };
  const first = (['account', 'work', 'business'] as Scope[]).find(k => avail[k]) || 'account';
  const [scope, setScope] = useState<Scope>(first);
  const [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState('');
  const call = async (sc: Scope, turnOn: boolean) => {
    if (legacy)
      return sb.rpc('admin_set_flags', ban ? {p_user: p.id, p_banned: turnOn} : {p_user: p.id, p_suspended: turnOn});
    return sb.rpc(ban ? 'admin_ban' : 'admin_pause', {
      p_user: p.id,
      p_scope: sc,
      p_on: turnOn,
      p_reason: turnOn ? reason.trim() || null : null,
    });
  };
  const undo = async (sc: Scope) => {
    setBusy(true);
    setErr('');
    const {error} = await call(sc, false);
    setBusy(false);
    if (error) return setErr(error.message);
    onDone();
  };
  const active = (['account', 'work', 'business'] as Scope[]).filter(k => on[k]);
  const anyAvail = (['account', 'work', 'business'] as Scope[]).some(k => avail[k]);
  return (
    <Sheet title={ban ? 'Ban permanently' : 'Pause for now'} onClose={onClose}>
      <form
        className="form"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          const {data, error} = await call(scope, true);
          setBusy(false);
          if (error) return setErr(error.message);
          if (ban && !legacy && data && data !== scope)
            alert('They had nothing else on this account, so the whole account was banned.');
          onDone();
        }}
      >
        <p className="muted">
          {ban ? (
            <>
              Bans are permanent and can’t be appealed. For a second chance, use <strong>Pause</strong>.
            </>
          ) : (
            <>A pause is temporary: they see the reason and can appeal. Restore any time.</>
          )}{' '}
          Every change is logged with your name.
        </p>
        {legacy && (
          <Note kind="error">
            Only the whole account can be {ban ? 'banned' : 'paused'} until you run{' '}
            <strong>supabase/run-updates.sql</strong> in Supabase.
          </Note>
        )}
        {active.length > 0 && (
          <div className="undo-list">
            {active.map(k => (
              <div key={k} className="undo-row">
                <span>
                  <strong>
                    {k === 'account'
                      ? ban
                        ? 'Whole account banned'
                        : 'Whole account paused'
                      : k === 'work'
                        ? ban
                          ? 'Banned from working'
                          : 'Working paused'
                        : ban
                          ? 'Business banned'
                          : 'Hiring paused'}
                  </strong>
                  <small>
                    {(ban ? p.ban_reason : k === 'account' ? p.suspended_reason : p.pause_reason) ||
                      'No reason recorded.'}
                  </small>
                </span>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  disabled={busy}
                  onClick={() => confirm(`${ban ? 'Lift this ban' : 'Restore this'} for ${who}?`) && undo(k)}
                >
                  <Undo2 size={14} />
                  {ban ? 'Lift' : 'Restore'}
                </button>
              </div>
            ))}
          </div>
        )}
        {anyAvail && (
          <>
            <div className="ban-options">
              {(['account', 'work', 'business'] as Scope[])
                .filter(k => avail[k])
                .map(k => (
                  <label key={k} className={'ban-option' + (scope === k ? ' on' : '') + (ban ? '' : ' pause')}>
                    <input type="radio" name="scope" checked={scope === k} onChange={() => setScope(k)} />
                    <span>
                      <strong>{label[k][0]}</strong>
                      <small>{label[k][1]}</small>
                    </span>
                  </label>
                ))}
            </div>
            {!legacy && (
              <label className="field">
                Reason (they’ll see this)
                <textarea
                  className="wrap-text"
                  rows={3}
                  maxLength={300}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder={ban ? 'e.g. Didn’t pay workers for three shifts' : 'e.g. Three late arrivals this month'}
                />
                <small>{reason.length}/300</small>
              </label>
            )}
          </>
        )}
        {err && <Note kind="error">{err}</Note>}
        {anyAvail && (
          <button className={'btn btn-block ' + (ban ? 'btn-danger' : 'btn-warn')} disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={17} /> : ban ? <Ban size={17} /> : <Lock size={17} />}
            {ban ? 'Ban permanently' : 'Pause'}
          </button>
        )}
      </form>
    </Sheet>
  );
}

// ===================================================================== Live activity
const EVENT: Record<string, [string, React.ComponentType<{size?: number}>, string]> = {
  page_view: ['Opened a page', Eye, 'grey'],
  job_view: ['Looked at a job', Briefcase, 'blue'],
  apply_click: ['Clicked Apply on a job', ArrowUpRight, 'green'],
  sponsored_view: ['Saw an affiliate ad', Megaphone, 'grey'],
  sponsored_click: ['Clicked an affiliate ad', MousePointerClick, 'amber'],
  ad_view: ['Saw an ad', Megaphone, 'grey'],
  shift_view: ['Opened a shift', CalendarDays, 'blue'],
  shift_apply: ['Picked up a shift', Zap, 'green'],
  sign_up: ['Created an account', UserPlus, 'green'],
  sign_in: ['Signed in', LogIn, 'blue'],
  cv_download: ['Downloaded a CV', FileDown, 'green'],
  search: ['Searched', Search, 'grey'],
  install: ['Installed the app', Plus, 'green'],
  outbound_click: ['Left to another site', ArrowUpRight, 'grey'],
};
/** Readable names for the site's pages in the Live feed. */
const PAGE: Record<string, string> = {
  '/': 'Home',
  '/index.html': 'Home',
  '/find-work.html': 'Find work',
  '/shifts.html': 'Shifts',
  '/account.html': 'Account',
  '/support.html': 'Support',
  '/help.html': 'Help',
  '/rules.html': 'Community rules',
  '/saved-jobs.html': 'Saved jobs',
  '/cv-builder.html': 'CV builder',
  '/job.html': 'Job details',
  '/profile.html': 'Profile',
  '/how-it-works.html': 'How it works',
  '/about.html': 'About',
  '/privacy.html': 'Privacy',
  '/terms.html': 'Terms',
  '/post-job.html': 'Hire workers',
};
/** A page path as a readable name. */
const pageName = (path?: string | null) => {
  if (!path) return '';
  const p = path.replace(/^\/South-Africa-Community-Work/i, '').split('?')[0];
  return PAGE[p] || p;
};

/** One event in the activity feed, with who did it (signed-in people) or a short visitor code (guests). */
type LiveEvent = {
  at: string;
  type: string;
  path: string | null;
  target: string | null;
  user_id: string | null;
  visitor: string;
  name: string | null;
  business: string | null;
  email: string | null;
  mode: string | null;
  staff_role: string | null;
};
type LiveData = {
  active_visitors: number;
  signed_in?: number;
  events: number;
  recent: LiveEvent[];
  people?: {
    user_id: string;
    last_at: string;
    actions: number;
    last_path: string | null;
    name: string | null;
    business: string | null;
    email: string | null;
  }[];
};
type Named = {
  id: string;
  name: string | null;
  business: string | null;
  email: string | null;
  mode: string | null;
  staff_role: string | null;
};

/** How a signed-in person is shown: their name, then their business, then their email. */
const who = (p: {name?: string | null; business?: string | null; email?: string | null}) =>
  [p.name, p.business && `(${p.business})`].filter(Boolean).join(' ') || p.email || 'Signed-in member';

/** People on the site this moment, from the live "online now" channel every open page joins. */
function useOnlineNow(sb: SupabaseClient) {
  const [people, setPeople] = useState<{key: string; info: OnlinePerson}[]>([]);
  useEffect(() => {
    const ch = sb.channel(ONLINE_CHANNEL);
    const sync = () =>
      setPeople(
        Object.entries(ch.presenceState<OnlinePerson>()).map(([key, list]) => ({key, info: list[list.length - 1]})),
      );
    ch.on('presence', {event: 'sync'}, sync).subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, []);
  return people;
}

const WINDOWS: [number, string][] = [
  [30, '30 min'],
  [240, '4 hours'],
  [1440, '24 hours'],
];

/** Live tab: who is online now, and who did what in the chosen time window. */
export function LiveFeed({sb}: {sb: SupabaseClient}) {
  const [minutes, setMinutes] = useState(30);
  const [data, setData] = useState<LiveData | null>(null),
    [err, setErr] = useState('');
  const online = useOnlineNow(sb);
  const [names, setNames] = useState<Record<string, Named>>({});
  useEffect(() => {
    let alive = true;
    const load = () =>
      sb.rpc('admin_live', {p_minutes: minutes}).then(({data, error}) => {
        if (!alive) return;
        if (error) setErr(error.message);
        else {
          setErr('');
          setData(data as LiveData);
        }
      });
    load();
    const t = setInterval(load, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [minutes]);
  // Names for signed-in people who are online right now.
  const ids = online.map(o => o.info.userId).filter((x): x is string => !!x && !names[x]);
  useEffect(() => {
    if (!ids.length) return;
    sb.rpc('admin_people_names', {p_ids: ids}).then(
      ({data}) => data && setNames(n => ({...n, ...Object.fromEntries((data as Named[]).map(p => [p.id, p]))})),
    );
  }, [ids.join()]);
  const signedInNow = online.filter(o => o.info.signedIn).length;
  const label = WINDOWS.find(w => w[0] === minutes)?.[1] || `${minutes} min`;

  return (
    <div className="stack">
      <section className="card-panel online-now">
        <header className="sec-head">
          <span className="live-pulse" />
          <div>
            <h2>Online now: {online.length.toLocaleString('en-ZA')}</h2>
            <p>
              {signedInNow} signed in · {online.length - signedInNow} guests · updates instantly
            </p>
          </div>
        </header>
        {!online.length ? (
          <p className="muted">Nobody is on the site right now.</p>
        ) : (
          <ul className="online-list">
            {online
              .slice()
              .sort((a, b) => Number(b.info.signedIn) - Number(a.info.signedIn))
              .slice(0, 60)
              .map(o => {
                const n = o.info.userId ? names[o.info.userId] : undefined;
                return (
                  <li key={o.key}>
                    <span className={'dot ' + (o.info.signedIn ? 'member' : 'guest')} />
                    <strong>
                      {o.info.signedIn ? (n ? who(n) : 'Signed-in member') : `Guest ${o.key.slice(0, 4).toUpperCase()}`}
                    </strong>
                    {n?.staff_role && <em className="pill team">{n.staff_role === 'ceo' ? 'CEO' : 'Admin'}</em>}
                    <small>
                      {pageName('/' + o.info.path)} · here {ago(o.info.since)}
                    </small>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <div className="chip-wrap">
        {WINDOWS.map(([m, l]) => (
          <button
            key={m}
            className={minutes === m ? 'on' : ''}
            onClick={() => {
              setData(null);
              setMinutes(m);
            }}
          >
            Last {l}
          </button>
        ))}
      </div>
      {err && (
        <Note kind="error">
          {err.includes('admin_live')
            ? 'Run the latest database update (supabase/run-updates.sql) to see who did what.'
            : err}
        </Note>
      )}
      {!data ? (
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      ) : (
        <>
          <div className="stat-grid">
            <div className="tile big">
              <span>
                <Activity size={15} /> Visitors
              </span>
              <strong>{data.active_visitors.toLocaleString('en-ZA')}</strong>
              <small>in the last {label}</small>
            </div>
            <div className="tile big">
              <span>Signed in</span>
              <strong>{(data.signed_in ?? 0).toLocaleString('en-ZA')}</strong>
              <small>members active</small>
            </div>
            <div className="tile big">
              <span>Actions</span>
              <strong>{data.events.toLocaleString('en-ZA')}</strong>
              <small>refreshes every 15 seconds</small>
            </div>
          </div>
          {!!data.people?.length && (
            <section className="card-panel feed">
              <h3>Members active in the last {label}</h3>
              <ol className="feed-list">
                {data.people.map(p => (
                  <li key={p.user_id}>
                    <span className="feed-ic green">
                      <UserRound size={15} />
                    </span>
                    <div>
                      <strong>{who(p)}</strong>
                      <small>
                        {p.email} · {p.actions} action{p.actions === 1 ? '' : 's'} · last on{' '}
                        {pageName(p.last_path) || '—'}
                      </small>
                    </div>
                    <time>{ago(p.last_at)}</time>
                  </li>
                ))}
              </ol>
            </section>
          )}
          <section className="card-panel feed">
            <h3>Who did what</h3>
            {!data.recent?.length ? (
              <p className="muted">Nothing in the last {label}.</p>
            ) : (
              <ol className="feed-list">
                {data.recent.map((e, i) => {
                  const [what, Icon, tone] = EVENT[e.type] || [e.type.replace(/_/g, ' '), Activity, 'grey'];
                  const detail = e.target && !/^[0-9a-f-]{36}$/i.test(e.target) ? e.target : '';
                  const person = e.user_id ? who(e) : e.visitor ? `Guest ${e.visitor}` : 'A visitor';
                  return (
                    <li key={i}>
                      <span className={'feed-ic ' + tone}>
                        <Icon size={15} />
                      </span>
                      <div>
                        <strong>
                          <span className={e.user_id ? 'who member' : 'who'}>{person}</span>{' '}
                          {what.charAt(0).toLowerCase() + what.slice(1)}
                        </strong>
                        <small>
                          {[pageName(e.path), detail].filter(Boolean).join(' · ') || '—'}
                          {e.staff_role ? ' · team' : ''}
                        </small>
                      </div>
                      <time>{ago(e.at)}</time>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}

// ===================================================================== Affiliate ads (job pages only)
type Promo = {
  id: string;
  partner: string;
  title: string;
  body: string | null;
  url: string;
  cta: string | null;
  badge: string | null;
  logo: string | null;
  image: string | null;
  impression_url: string | null;
  modes: string[];
  categories: string[];
  spots: string[];
  weight: number;
  active: boolean;
  starts_on: string | null;
  ends_on: string | null;
};

/** Where an ad can go, with the banner size that fits best there. */
const SPOTS: [string, string, string][] = [
  ['feed', 'Between jobs', 'Wide banner 728×250, or a text card'],
  ['sidebar', 'Sidebar', 'Square 300×250 or tall 300×600'],
  ['article', 'Inside job text', 'Wide banner 728×90 or 728×250'],
  ['hanging', 'Phone banner', 'Strip 320×100 at the bottom of phones'],
];
/** An ad being edited, in the shape the preview card needs. */
const toOffer = (p: Partial<Promo>): Offer => ({
  id: p.id || 'preview',
  partner: p.partner || 'Partner name',
  title: p.title || 'Your headline',
  text: p.body || '',
  url: p.url || 'https://example.com',
  cta: p.cta || undefined,
  badge: p.badge || undefined,
  logo: p.logo || undefined,
  image: p.image || undefined,
});
/** Today's date as YYYY-MM-DD. */
const today = () => new Date().toISOString().slice(0, 10);

/** CEO dashboard → Affiliate ads: add, edit, pause, schedule and delete ads, and see views and clicks for each. */
export function AdsAdmin({sb, role}: {sb: SupabaseClient; role: 'ceo' | 'admin'}) {
  const [rows, setRows] = useState<Promo[] | null>(null),
    [stats, setStats] = useState<Record<string, {views: number; clicks: number}>>({});
  const [on, setOn] = useState<boolean | null>(null),
    [edit, setEdit] = useState<Partial<Promo> | null>(null),
    [err, setErr] = useState('');
  const ceo = role === 'ceo';
  const load = () => {
    sb.from('promos')
      .select('*')
      .order('created_at', {ascending: false})
      .then(({data, error}) =>
        error
          ? setErr(
              error.message.includes('promos')
                ? 'Run the latest database update (supabase/run-updates.sql) to manage affiliate ads here.'
                : error.message,
            )
          : setRows(data as Promo[]),
      );
    sb.rpc('admin_promo_stats', {p_days: 30}).then(({data}) =>
      setStats(
        Object.fromEntries(
          ((data as any[]) || []).map(r => [r.target, {views: Number(r.views), clicks: Number(r.clicks)}]),
        ),
      ),
    );
    sb.rpc('public_settings').then(({data}) => setOn((data as any)?.promos_enabled ?? true));
  };
  useEffect(load, []);
  const save = async (p: Partial<Promo>) => {
    const row = {
      partner: p.partner,
      title: p.title,
      body: p.body || null,
      url: p.url,
      cta: p.cta || null,
      badge: p.badge || null,
      logo: p.logo || null,
      image: p.image || null,
      impression_url: p.impression_url || null,
      modes: p.modes || [],
      categories: p.categories || [],
      spots: p.spots?.length ? p.spots : ['feed', 'sidebar', 'article'],
      weight: p.weight || 1,
      active: p.active ?? true,
      starts_on: p.starts_on || null,
      ends_on: p.ends_on || null,
    };
    const {error} = p.id ? await sb.from('promos').update(row).eq('id', p.id) : await sb.from('promos').insert(row);
    if (error) return error.message;
    setEdit(null);
    load();
    return '';
  };
  return (
    <div className="stack">
      <section className="card-panel section-card ads-head">
        <header className="sec-head">
          <Megaphone size={18} />
          <div>
            <h2>Affiliate ads</h2>
            <p>
              Your affiliate links, shown on the job pages only — between jobs, in the sidebar, inside job text and as a
              phone banner. You earn when people click.
            </p>
          </div>
        </header>
        <div className="row-gap start">
          <label className="switch">
            <input
              type="checkbox"
              checked={!!on}
              disabled={!ceo || on === null}
              onChange={async e => {
                const v = e.target.checked;
                setOn(v);
                const {error} = await sb.rpc('admin_set_promos', {p_on: v});
                if (error) {
                  alert(error.message);
                  setOn(!v);
                }
              }}
            />
            <span />
            {on ? 'Showing on job pages' : 'All ads switched off'}
          </label>
          {ceo && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() =>
                setEdit({active: true, weight: 1, spots: ['feed', 'sidebar', 'article'], modes: [], categories: []})
              }
            >
              <Plus size={15} />
              Add an ad
            </button>
          )}
        </div>
        {!ceo && <p className="muted small">Only the CEO can add or change ads.</p>}
      </section>
      {err && <Note kind="error">{err}</Note>}
      {!rows ? (
        !err && (
          <div className="card-panel center">
            <span className="spinner" />
          </div>
        )
      ) : !rows.length ? (
        <div className="empty small">
          <div className="empty-icon">
            <Megaphone size={26} />
          </div>
          <h3>No ads yet</h3>
          <p>
            Add your first affiliate link — upload a banner or write a short text ad — and it appears on the job pages.
          </p>
        </div>
      ) : (
        <div className="promo-list">
          {rows.map(p => {
            const st = stats[p.id] || {views: 0, clicks: 0};
            const live = p.active && (!p.starts_on || p.starts_on <= today()) && (!p.ends_on || p.ends_on >= today());
            return (
              <article key={p.id} className={'promo-row' + (live ? '' : ' paused')}>
                {p.image ? (
                  <img className="promo-thumb" src={p.image} alt="" />
                ) : (
                  <span className="promo-thumb text">Aa</span>
                )}
                <div className="promo-main">
                  <strong>{p.title}</strong>
                  <small>
                    {p.partner} · {p.image ? 'Banner' : 'Text ad'} ·{' '}
                    {p.modes.length === 1 ? (p.modes[0] === 'remote' ? 'Online jobs' : 'In-person jobs') : 'All jobs'} ·{' '}
                    {p.spots
                      .map(k => SPOTS.find(x => x[0] === k)?.[1])
                      .filter(Boolean)
                      .join(', ')}
                  </small>
                  <a className="promo-url" href={p.url} target="_blank" rel="noreferrer">
                    {p.url}
                  </a>
                </div>
                <div className="promo-stats">
                  <span>
                    <b>{st.views.toLocaleString('en-ZA')}</b>views
                  </span>
                  <span>
                    <b>{st.clicks.toLocaleString('en-ZA')}</b>clicks
                  </span>
                  <span>
                    <b>{st.views ? ((st.clicks / st.views) * 100).toFixed(1) : '0'}%</b>rate
                  </span>
                </div>
                <div className="promo-actions">
                  <span className={'pill ' + (live ? 'accepted' : '')}>
                    {live ? 'Live' : p.active ? 'Scheduled' : 'Paused'}
                  </span>
                  {ceo && (
                    <>
                      <button
                        className="icon-btn"
                        aria-label={p.active ? 'Pause' : 'Resume'}
                        title={p.active ? 'Pause' : 'Resume'}
                        onClick={async () => {
                          await sb.from('promos').update({active: !p.active}).eq('id', p.id);
                          load();
                        }}
                      >
                        {p.active ? <Pause size={16} /> : <Play size={16} />}
                      </button>
                      <button className="icon-btn" aria-label="Edit" title="Edit" onClick={() => setEdit(p)}>
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn danger"
                        aria-label="Delete"
                        title="Delete"
                        onClick={async () => {
                          if (confirm(`Delete “${p.title}”?`)) {
                            await sb.from('promos').delete().eq('id', p.id);
                            load();
                          }
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="muted small">
        A view counts when half an ad is on screen; a click when someone taps it. Last 30 days.
      </p>
      {edit && <PromoForm sb={sb} initial={edit} onSave={save} onClose={() => setEdit(null)} />}
    </div>
  );
}

/** Add / edit form for one affiliate ad, with an image upload and a live preview. */
function PromoForm({
  sb,
  initial,
  onSave,
  onClose,
}: {
  sb: SupabaseClient;
  initial: Partial<Promo>;
  onSave: (p: Partial<Promo>) => Promise<string>;
  onClose: () => void;
}) {
  const [p, setP] = useState<Partial<Promo>>(initial),
    [busy, setBusy] = useState(false),
    [err, setErr] = useState('');
  const [kind, setKind] = useState<'image' | 'text'>(initial.image ? 'image' : initial.id ? 'text' : 'image'),
    [uploading, setUploading] = useState(false);
  const set = <K extends keyof Promo>(k: K, v: Promo[K]) => setP(x => ({...x, [k]: v}));
  const toggle = (k: 'modes' | 'categories' | 'spots', v: string) =>
    setP(x => {
      const cur = new Set(x[k] || []);
      cur.has(v) ? cur.delete(v) : cur.add(v);
      return {...x, [k]: [...cur]};
    });
  // Uploads the banner to the public 'promos' storage folder and uses its web address.
  async function upload(file: File) {
    if (file.size > 3 * 1024 * 1024) return setErr('Images can be up to 3 MB.');
    setUploading(true);
    setErr('');
    const path = `${Date.now()}-${file.name.toLowerCase().replace(/[^a-z0-9.]+/g, '-')}`;
    const {error} = await sb.storage.from('promos').upload(path, file, {contentType: file.type, upsert: false});
    setUploading(false);
    if (error)
      return setErr(
        error.message.includes('Bucket')
          ? 'Run the latest database update first (it creates the image folder).'
          : error.message,
      );
    set('image', sb.storage.from('promos').getPublicUrl(path).data.publicUrl);
  }
  return (
    <Sheet title={p.id ? 'Edit ad' : 'New affiliate ad'} onClose={onClose} wide>
      <form
        className="form promo-form"
        onSubmit={async e => {
          e.preventDefault();
          if (kind === 'image' && !p.image) return setErr('Upload a banner image, or switch to a text ad.');
          setBusy(true);
          setErr(await onSave(kind === 'text' ? {...p, image: null} : p));
          setBusy(false);
        }}
      >
        <div className="segmented two" role="tablist">
          <button type="button" className={kind === 'image' ? 'on' : ''} onClick={() => setKind('image')}>
            Image banner
          </button>
          <button type="button" className={kind === 'text' ? 'on' : ''} onClick={() => setKind('text')}>
            Text ad
          </button>
        </div>
        <div className="grid-2">
          <label className="field">
            Partner / brand
            <input
              value={p.partner || ''}
              onChange={e => set('partner', e.target.value)}
              required
              maxLength={60}
              placeholder="Shown as “Sponsored · name”"
            />
          </label>
          <label className="field">
            Your affiliate link
            <input
              type="url"
              value={p.url || ''}
              onChange={e => set('url', e.target.value)}
              required
              pattern="https://.*"
              placeholder="https://…"
            />
          </label>
        </div>
        <label className="field">
          {kind === 'image' ? 'Description of the image (for screen readers)' : 'Headline'}
          <input
            value={p.title || ''}
            onChange={e => set('title', e.target.value)}
            required
            minLength={3}
            maxLength={90}
            placeholder={kind === 'image' ? 'e.g. Safety boots on sale' : 'e.g. Learn Excel in two weeks'}
          />
        </label>
        {kind === 'image' ? (
          <div className="field">
            Banner image
            <label className="upload-box">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
              />
              {uploading ? <LoaderCircle className="spin" size={20} /> : <Plus size={20} />}
              <span>
                <strong>{p.image ? 'Replace image' : 'Upload image'}</strong>
                <small>JPG, PNG, WebP or GIF, up to 3 MB. Sizes: see “Where it can appear”.</small>
              </span>
            </label>
            <input
              type="url"
              value={p.image || ''}
              onChange={e => set('image', e.target.value || null)}
              pattern="https://.*"
              placeholder="…or paste an image link (https://)"
              aria-label="Image link"
            />
          </div>
        ) : (
          <>
            <label className="field">
              Short description
              <textarea
                className="wrap-text"
                rows={2}
                value={p.body || ''}
                onChange={e => set('body', e.target.value)}
                maxLength={200}
                placeholder="One or two short sentences."
              />
              <small>{(p.body || '').length}/200</small>
            </label>
            <div className="grid-3">
              <label className="field">
                Button text
                <input
                  value={p.cta || ''}
                  onChange={e => set('cta', e.target.value)}
                  maxLength={24}
                  placeholder="Learn more"
                />
              </label>
              <label className="field">
                Highlight (optional)
                <input
                  value={p.badge || ''}
                  onChange={e => set('badge', e.target.value)}
                  maxLength={30}
                  placeholder="e.g. Free to join"
                />
              </label>
              <label className="field">
                Logo link (optional)
                <input
                  type="url"
                  value={p.logo || ''}
                  onChange={e => set('logo', e.target.value)}
                  pattern="https://.*"
                  placeholder="https://…"
                />
              </label>
            </div>
          </>
        )}
        <fieldset>
          <legend>Where it can appear</legend>
          <div className="spot-grid">
            {SPOTS.map(([k, l, size]) => (
              <button
                type="button"
                key={k}
                className={'spot' + (p.spots?.includes(k) ? ' on' : '')}
                onClick={() => toggle('spots', k)}
              >
                <strong>{l}</strong>
                <small>{size}</small>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Show with</legend>
          <div className="chip-wrap">
            <button type="button" className={!p.modes?.length ? 'on' : ''} onClick={() => set('modes', [])}>
              All jobs
            </button>
            <button
              type="button"
              className={p.modes?.length === 1 && p.modes[0] === 'onsite' ? 'on' : ''}
              onClick={() => set('modes', ['onsite'])}
            >
              In-person jobs
            </button>
            <button
              type="button"
              className={p.modes?.length === 1 && p.modes[0] === 'remote' ? 'on' : ''}
              onClick={() => set('modes', ['remote'])}
            >
              Online jobs
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Best next to these kinds of jobs (optional)</legend>
          <div className="chip-wrap">
            {browseCategories.map(c => (
              <button
                type="button"
                key={c}
                className={p.categories?.includes(c) ? 'on' : ''}
                onClick={() => toggle('categories', c)}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid-3">
          <label className="field">
            Starts (optional)
            <input type="date" value={p.starts_on || ''} onChange={e => set('starts_on', e.target.value || null)} />
          </label>
          <label className="field">
            Ends (optional)
            <input type="date" value={p.ends_on || ''} onChange={e => set('ends_on', e.target.value || null)} />
          </label>
          <label className="field">
            How often
            <select value={p.weight || 1} onChange={e => set('weight', Number(e.target.value))}>
              {[1, 2, 3, 5, 10].map(w => (
                <option key={w} value={w}>
                  {w === 1 ? 'Normal' : `${w}× more often`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          View-tracking pixel (optional)
          <input
            type="url"
            value={p.impression_url || ''}
            onChange={e => set('impression_url', e.target.value)}
            pattern="https://.*"
            placeholder="Only if your affiliate programme gives you one"
          />
        </label>
        <label className="check">
          <input type="checkbox" checked={p.active ?? true} onChange={e => set('active', e.target.checked)} />
          <span>Live (untick to save it paused)</span>
        </label>
        <p className="overline">Preview</p>
        <div className="promo-preview">
          <OfferCard offer={toOffer(kind === 'text' ? {...p, image: null} : p)} spot="feed" preview />
        </div>
        {err && <Note kind="error">{err}</Note>}
        <button className="btn btn-primary btn-block" disabled={busy || uploading}>
          {busy ? <LoaderCircle className="spin" size={17} /> : null}
          {p.id ? 'Save changes' : 'Add ad'}
        </button>
      </form>
    </Sheet>
  );
}
