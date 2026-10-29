/*
  Accounts and paid shifts.
    Account page  — sign in / sign up, two-step sign-in, and the Working / Hiring dashboard
    Working       — overview, my shifts (with the free-cancel countdown), getting paid, appeals
    Hiring        — overview, posting shifts, managing bookings and pay, blocking workers
    Shifts page   — the shift board where workers pick up shifts
    CEO dashboard — overview, live, people, support, appeals, payments, affiliate ads, team, settings, activity log
  All data comes from Supabase; the database rules decide what each person may see and change.
*/
import {Component, useEffect, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  UserRound,
  Building2,
  LogOut,
  LoaderCircle,
  Check,
  X,
  Plus,
  MapPin,
  Clock,
  ShieldCheck,
  FileText,
  Wallet,
  CalendarDays,
  Users,
  BadgeCheck,
  Search,
  BarChart3,
  Activity,
  KeyRound,
  ArrowUpRight,
  Banknote,
  Lock,
  RefreshCw,
  Briefcase,
  Eye,
  LayoutDashboard,
  Settings,
  Trash2,
  Sparkles,
  Palette,
  Globe,
  ArrowRight,
  CheckCircle2,
  Repeat,
  Ban,
  Zap,
  AlertTriangle,
  Gavel,
  TrendingUp,
  MousePointerClick,
} from 'lucide-react';
import {useAccount, callFunction, errorText, modes, staffView, authFlags, type Profile} from './backend';
import {Avatar, ProfileEditor} from './profile';
import {themeStyle} from './themes';
import {track} from './analytics';
import {SupportAdmin} from './support';
import {PeopleAdmin, LiveFeed, AdsAdmin} from './admin-people';
import {Megaphone, EyeOff, Mail} from 'lucide-react';
import {LifeBuoy as SupportIcon} from 'lucide-react';
import {LocationPicker, Sheet, useAreaLocation} from './JobsView';
import {browseCategories, money, milesLabel, milesToKm, type Location} from './catalog';

/** South Africa's nine provinces. */
const PROVINCES = [
  'Eastern Cape',
  'Free State',
  'Gauteng',
  'KwaZulu-Natal',
  'Limpopo',
  'Mpumalanga',
  'North West',
  'Northern Cape',
  'Western Cape',
];
/** The page address's ?query values. */
const params = new URLSearchParams(location.search);
/** All times are shown in South African time. */
const tz = 'Africa/Johannesburg';
/** "Sat, 1 Nov". */
const day = (v: string) =>
  new Date(v).toLocaleDateString('en-ZA', {timeZone: tz, weekday: 'short', day: 'numeric', month: 'short'});
/** "09:00". */
const time = (v: string) => new Date(v).toLocaleTimeString('en-ZA', {timeZone: tz, hour: '2-digit', minute: '2-digit'});
/** Hours between two times. */
const hoursBetween = (a: string, b: string) => Math.round(((Date.parse(b) - Date.parse(a)) / 36e5) * 100) / 100;

/** A message box: info, error or success. */
function Notice({kind = 'info', children}: {kind?: 'info' | 'error' | 'ok'; children: React.ReactNode}) {
  return (
    <p
      className={kind === 'error' ? 'alert' : kind === 'ok' ? 'alert ok' : 'hint-box'}
      role={kind === 'error' ? 'alert' : 'status'}
    >
      {children}
    </p>
  );
}

/** Shown when backend-config.json is missing. */
function NotConfigured() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-icon">
          <Lock size={28} />
        </div>
        <h2>Accounts are almost ready</h2>
        <p>
          Sign-in will open as soon as the Community Work backend is switched on. Until then you can still browse jobs
          and build your CV.
        </p>
        <a className="btn btn-primary" href="find-work.html">
          Browse jobs
        </a>
      </div>
    </div>
  );
}

// ===================================================================== Account page
export function AccountPage() {
  const acct = useAccount();
  if (!acct.ready)
    return (
      <div className="page">
        <div className="card-panel center">
          <span className="spinner" />
          Loading…
        </div>
      </div>
    );
  if (!acct.sb) return <NotConfigured />;
  if (acct.recovery)
    return (
      <div className="page reading">
        <NewPassword sb={acct.sb} />
      </div>
    );
  if (!acct.session)
    return (
      <div className="page auth-page">
        <AuthForm sb={acct.sb} />
      </div>
    );
  if (!acct.profile) return <MissingProfile sb={acct.sb} email={acct.session.user.email || ''} reload={acct.reload} />;
  if (staffView(acct.staff, acct.profile)) return <AdminPage />;
  return (
    <TwoStepGate sb={acct.sb} token={acct.session.access_token} reload={acct.reload}>
      <Dashboard
        sb={acct.sb}
        profile={acct.profile}
        email={acct.session.user.email || ''}
        staff={acct.staff}
        reload={acct.reload}
      />
    </TwoStepGate>
  );
}

/** Asks for the authenticator code when two-step sign-in is on. */
function TwoStepGate({
  sb,
  token,
  reload,
  children,
}: {
  sb: SupabaseClient;
  token: string;
  reload: () => void;
  children: React.ReactNode;
}) {
  const two = useTwoStep(sb, token);
  if (two.loading)
    return (
      <div className="page">
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      </div>
    );
  if (two.verify)
    return (
      <div className="page reading">
        <TwoFactor
          sb={sb}
          onDone={() => {
            two.refresh();
            reload();
          }}
          onCancel={() => sb.auth.signOut().then(reload)}
        />
      </div>
    );
  return <>{children}</>;
}

// Signed in, but the database has no profile for this login (e.g. the account was made before the database was set up).
function MissingProfile({sb, email, reload}: {sb: SupabaseClient; email: string; reload: () => void}) {
  return (
    <div className="page reading">
      <section className="card-panel auth">
        <h1>You’re signed in</h1>
        <p className="muted">
          {email} is signed in, but your profile couldn’t be loaded. This happens to accounts created before Community
          Work finished setting up. Our team can repair it; then tap “Try again”.
        </p>
        <div className="row-gap">
          <button className="btn btn-primary" onClick={reload}>
            Try again
          </button>
          <button className="btn btn-outline" onClick={() => sb.auth.signOut().then(reload)}>
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </section>
    </div>
  );
}

/** Sign-in errors in plain words. */
const friendly = (m: string) =>
  /invalid login credentials/i.test(m)
    ? 'That email and password don’t match. Check for typos, or reset your password below.'
    : /email not confirmed/i.test(m)
      ? 'Please confirm your email first — tap the link we sent you. Can’t find it? Resend it below.'
      : /rate limit|too many/i.test(m)
        ? 'Too many tries for now. Wait a few minutes, then try again.'
        : /already registered|already been registered/i.test(m)
          ? 'That email already has an account. Sign in instead, or reset your password.'
          : /network|fetch/i.test(m)
            ? 'No connection. Check your internet and try again.'
            : m;

/** Password strength: [level 0–4, label]. */
function strength(pw: string): [number, string] {
  if (!pw) return [0, ''];
  let n = 0;
  if (pw.length >= 10) n++;
  if (pw.length >= 14) n++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) n++;
  if (/\d/.test(pw)) n++;
  if (/[^A-Za-z0-9]/.test(pw)) n++;
  return pw.length < 10 ? [1, 'Too short'] : n <= 2 ? [2, 'Okay'] : n <= 3 ? [3, 'Good'] : [4, 'Strong'];
}

/** Password box with show/hide, Caps Lock warning and strength bar. */
function PasswordField({mode, value, onChange}: {mode: 'in' | 'up'; value: string; onChange: (v: string) => void}) {
  const [show, setShow] = useState(false),
    [caps, setCaps] = useState(false);
  const [lvl, label] = strength(value);
  return (
    <label className="field">
      Password
      <span className="pw-wrap">
        <input
          name="password"
          type={show ? 'text' : 'password'}
          required
          minLength={mode === 'up' ? 10 : 1}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyUp={e => setCaps(e.getModifierState?.('CapsLock'))}
          autoComplete={mode === 'up' ? 'new-password' : 'current-password'}
        />
        <button
          type="button"
          className="pw-eye"
          onClick={() => setShow(!show)}
          aria-label={show ? 'Hide password' : 'Show password'}
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </span>
      {caps && <small className="warn-text">Caps Lock is on.</small>}
      {mode === 'up' && (
        <span className="pw-meter" data-level={lvl}>
          <i />
          <i />
          <i />
          <i />
          <small>{value ? label : 'At least 10 characters. A short sentence works well.'}</small>
        </span>
      )}
    </label>
  );
}

/** Sign in, create account, email sign-in link and password reset. */
function AuthForm({sb}: {sb: SupabaseClient}) {
  const [mode, setMode] = useState<'in' | 'up' | 'reset' | 'link'>(params.get('signup') ? 'up' : 'in');
  const [type, setType] = useState<'worker' | 'business'>(params.get('type') === 'business' ? 'business' : 'worker');
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem('cw-last-email') || '';
    } catch {
      return '';
    }
  });
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const [resend, setResend] = useState(false),
    [sent, setSent] = useState(false),
    [google, setGoogle] = useState(false);
  useEffect(() => {
    authFlags().then(f => setGoogle(f.google));
  }, []);
  const redirect = location.origin + location.pathname.replace(/[^/]*$/, '') + 'account.html';
  const go = (m: typeof mode) => {
    setMode(m);
    setMsg(null);
    setResend(false);
    setSent(false);
  };
  const remember = (e: string) => {
    try {
      localStorage.setItem('cw-last-email', e);
    } catch {
      /* private mode */
    }
  };

  async function submit(ev: React.FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    const em = email.trim().toLowerCase();
    setBusy(true);
    setMsg(null);
    setResend(false);
    try {
      if (mode === 'in') {
        const {error} = await sb.auth.signInWithPassword({email: em, password: pw});
        if (error) {
          if (/not confirmed/i.test(error.message)) setResend(true);
          throw error;
        }
        remember(em);
        track('sign_in');
      } else if (mode === 'up') {
        if (pw.length < 10) throw new Error('Use at least 10 characters for your password.');
        const {error} = await sb.auth.signUp({
          email: em,
          password: pw,
          options: {
            emailRedirectTo: redirect,
            data: {account_type: type, full_name: f.full_name?.trim(), business_name: f.business_name?.trim()},
          },
        });
        if (error) throw error;
        remember(em);
        track('sign_up', type);
        setSent(true);
      } else if (mode === 'link') {
        const {error} = await sb.auth.signInWithOtp({
          email: em,
          options: {shouldCreateUser: false, emailRedirectTo: redirect},
        });
        if (error && !/signups not allowed|not found/i.test(error.message)) throw error;
        remember(em);
        setSent(true);
      } else {
        const {error} = await sb.auth.resetPasswordForEmail(em, {redirectTo: redirect});
        if (error) throw error;
        setSent(true);
      }
    } catch (err) {
      setMsg({kind: 'error', text: friendly(errorText(err))});
    } finally {
      setBusy(false);
    }
  }

  if (sent)
    return (
      <section className="card-panel auth auth-sent">
        <span className="sent-icon">
          <Mail size={30} />
        </span>
        <h1>Check your email</h1>
        <p className="muted">
          {mode === 'up'
            ? 'We sent a confirmation link to'
            : mode === 'link'
              ? 'If there’s an account for'
              : 'If there’s an account for'}{' '}
          <strong>{email}</strong>
          {mode === 'up'
            ? '. Tap it to switch on your account, then sign in.'
            : mode === 'link'
              ? ', we sent a sign-in link. Open it on this device to sign straight in.'
              : ', we sent a link to choose a new password.'}
        </p>
        <p className="muted small">
          Not there after a minute? Check Spam or Promotions, and that the address is right.
        </p>
        <div className="row-gap">
          <button className="btn btn-outline" onClick={() => go('in')}>
            <ArrowRight size={16} />
            Back to sign in
          </button>
          {mode === 'up' && (
            <button
              className="btn btn-ghost"
              onClick={async () => {
                const {error} = await sb.auth.resend({
                  type: 'signup',
                  email: email.trim(),
                  options: {emailRedirectTo: redirect},
                });
                alert(error ? friendly(error.message) : 'Sent again.');
              }}
            >
              Resend email
            </button>
          )}
        </div>
      </section>
    );

  const title =
    mode === 'up'
      ? type === 'business'
        ? 'Hire people for shifts'
        : 'Find shifts near you'
      : mode === 'in'
        ? 'Welcome back'
        : mode === 'link'
          ? 'Sign in without a password'
          : 'Reset your password';
  return (
    <div className="auth-shell">
      <aside className="auth-side">
        <Logo2 />
        <h2>Work and hiring, close to home.</h2>
        <ul>
          <li>
            <Zap size={16} />
            Pick up paid shifts in one tap
          </li>
          <li>
            <ShieldCheck size={16} />
            Pay held safely in escrow
          </li>
          <li>
            <Building2 size={16} />
            Hire local people by the shift
          </li>
          <li>
            <Lock size={16} />
            Your details stay private
          </li>
        </ul>
      </aside>
      <section className="card-panel auth">
        <div className="page-head">
          <p className="overline">
            {mode === 'up'
              ? 'Create your free account'
              : mode === 'in'
                ? 'Sign in'
                : mode === 'link'
                  ? 'Email link'
                  : 'Forgot password'}
          </p>
          <h1>{title}</h1>
        </div>
        {(mode === 'in' || mode === 'up') && (
          <div className="segmented two" role="tablist">
            <button
              role="tab"
              aria-selected={mode === 'in'}
              className={mode === 'in' ? 'on' : ''}
              onClick={() => go('in')}
            >
              Sign in
            </button>
            <button
              role="tab"
              aria-selected={mode === 'up'}
              className={mode === 'up' ? 'on' : ''}
              onClick={() => go('up')}
            >
              Create account
            </button>
          </div>
        )}
        {google && (mode === 'in' || mode === 'up') && (
          <>
            <button
              className="btn btn-outline btn-block btn-lg google-btn"
              onClick={() => sb.auth.signInWithOAuth({provider: 'google', options: {redirectTo: redirect}})}
            >
              <GoogleMark />
              Continue with Google
            </button>
            <div className="or">
              <span>or with email</span>
            </div>
          </>
        )}
        <form className="form" onSubmit={submit}>
          {mode === 'up' && (
            <>
              <fieldset>
                <legend>I want to</legend>
                <div className="choice-row">
                  <button
                    type="button"
                    className={'choice' + (type === 'worker' ? ' on' : '')}
                    onClick={() => setType('worker')}
                  >
                    <UserRound size={20} />
                    <strong>Find work</strong>
                    <small>Pick up paid shifts</small>
                  </button>
                  <button
                    type="button"
                    className={'choice' + (type === 'business' ? ' on' : '')}
                    onClick={() => setType('business')}
                  >
                    <Building2 size={20} />
                    <strong>Hire workers</strong>
                    <small>Post shifts for my business</small>
                  </button>
                </div>
              </fieldset>
              <label className="field">
                Your full name
                <input
                  name="full_name"
                  required
                  minLength={2}
                  maxLength={120}
                  autoComplete="name"
                  placeholder="As on your ID"
                />
              </label>
              {type === 'business' && (
                <label className="field">
                  Business name
                  <input name="business_name" required minLength={2} maxLength={120} autoComplete="organization" />
                </label>
              )}
            </>
          )}
          <label className="field">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </label>
          {(mode === 'in' || mode === 'up') && <PasswordField mode={mode} value={pw} onChange={setPw} />}
          {mode === 'in' && (
            <button type="button" className="link forgot" onClick={() => go('reset')}>
              Forgot password?
            </button>
          )}
          {mode === 'up' && (
            <label className="check">
              <input type="checkbox" required />
              <span>
                I’m 18 or older and agree to the{' '}
                <a className="link" href="rules.html" target="_blank">
                  Community rules
                </a>
                ,{' '}
                <a className="link" href="terms.html" target="_blank">
                  terms
                </a>{' '}
                and{' '}
                <a className="link" href="privacy.html" target="_blank">
                  privacy policy
                </a>
                .
              </span>
            </label>
          )}
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          {resend && (
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={async () => {
                const {error} = await sb.auth.resend({
                  type: 'signup',
                  email: email.trim(),
                  options: {emailRedirectTo: redirect},
                });
                setMsg(
                  error
                    ? {kind: 'error', text: friendly(error.message)}
                    : {kind: 'ok', text: 'Confirmation email sent again.'},
                );
                setResend(false);
              }}
            >
              <Mail size={16} />
              Resend confirmation email
            </button>
          )}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={18} />}
            {mode === 'up'
              ? 'Create account'
              : mode === 'in'
                ? 'Sign in'
                : mode === 'link'
                  ? 'Email me a sign-in link'
                  : 'Send reset link'}
          </button>
          {mode === 'in' && (
            <button type="button" className="btn btn-ghost btn-block" onClick={() => go('link')}>
              <Mail size={16} />
              Email me a sign-in link instead
            </button>
          )}
          {(mode === 'reset' || mode === 'link') && (
            <button type="button" className="link center-link" onClick={() => go('in')}>
              Back to sign in with password
            </button>
          )}
        </form>
        <p className="muted small center-text">
          <Lock size={12} /> We never ask for your password by phone, email or WhatsApp.
        </p>
      </section>
    </div>
  );
}

/** Logo on the sign-in screen. */
function Logo2() {
  return (
    <span className="auth-logo">
      <img src="assets/favicon.svg" alt="" width={34} height={34} />
      <span>
        community<b>work</b>
      </span>
    </span>
  );
}
/** Google "G" for the optional Google button. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

/** Choose a new password after a reset link. */
function NewPassword({sb}: {sb: SupabaseClient}) {
  const [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  return (
    <section className="card-panel auth">
      <h1>Choose a new password</h1>
      <form
        className="form"
        onSubmit={async e => {
          e.preventDefault();
          const pw = String(new FormData(e.currentTarget).get('password'));
          const {error} = await sb.auth.updateUser({password: pw});
          setMsg(
            error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'Password updated. You’re signed in.'},
          );
          if (!error) setTimeout(() => location.replace('account.html'), 1200);
        }}
      >
        <label className="field">
          New password
          <input name="password" type="password" required minLength={10} autoComplete="new-password" />
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn btn-primary btn-block">Save password</button>
      </form>
    </section>
  );
}

/** Working or Hiring. */
type Mode = 'worker' | 'business';
/** A dashboard tab: [key, label, icon]. */
type TabDef = [string, string, React.ComponentType<{size?: number}>];
/** Dashboard tabs in Working mode. */
const WORK_TABS: TabDef[] = [
  ['overview', 'Overview', LayoutDashboard],
  ['bookings', 'My shifts', CalendarDays],
  ['profile', 'Profile', UserRound],
  ['payouts', 'Get paid', Wallet],
  ['settings', 'Settings', Settings],
];
/** Dashboard tabs in Hiring mode. */
const HIRE_TABS: TabDef[] = [
  ['overview', 'Overview', LayoutDashboard],
  ['shifts', 'Shifts', Briefcase],
  ['post', 'Post a shift', Plus],
  ['profile', 'Profile', Building2],
  ['settings', 'Settings', Settings],
];

/** The account dashboard: header, Working/Hiring switch, tabs. */
function Dashboard({
  sb,
  profile,
  email,
  staff,
  reload,
}: {
  sb: SupabaseClient;
  profile: Profile;
  email: string;
  staff: 'ceo' | 'admin' | null;
  reload: () => void;
}) {
  const m = modes(profile);
  const mode: Mode = m.active;
  const tabs = mode === 'business' ? HIRE_TABS : WORK_TABS;
  const [tab, setTabState] = useState<string>(() => {
    const t = params.get('tab');
    return t && tabs.some(x => x[0] === t) ? t : 'overview';
  });
  const [switching, setSwitching] = useState(false),
    [err, setErr] = useState('');
  const setTab = (t: string) => {
    setTabState(t);
    const u = new URL(location.href);
    u.searchParams.set('tab', t);
    history.replaceState(null, '', u);
  };
  useEffect(() => {
    if (!tabs.some(x => x[0] === tab)) setTab('overview');
  }, [mode]);

  // One mode at a time: switching swaps the whole dashboard, settings and payments to that mode.
  const [askBiz, setAskBiz] = useState(false),
    [bizName, setBizName] = useState(profile.business_name || '');
  async function switchMode(next: Mode, businessName?: string) {
    if (next === mode) return;
    if (next === 'business' && !(businessName || profile.business_name || '').trim()) {
      setAskBiz(true);
      return;
    }
    setSwitching(true);
    setErr('');
    const patch: Record<string, unknown> = {active_mode: next};
    if (businessName) patch.business_name = businessName.trim();
    const {error} = await sb.from('profiles').update(patch).eq('id', profile.id);
    setSwitching(false);
    if (error) return setErr(error.message);
    setAskBiz(false);
    setTabState('overview');
    const u = new URL(location.href);
    u.searchParams.delete('tab');
    history.replaceState(null, '', u);
    window.scrollTo({top: 0});
    reload();
  }
  const name = mode === 'business' ? profile.business_name : profile.full_name;

  return (
    <div className="page dash" style={themeStyle(profile.theme)}>
      <section className="dash-hero">
        <div className="dash-hero-bg">
          <span />
        </div>
        <div className="dash-hero-row">
          <a
            href={'profile.html?id=' + profile.id + (mode === 'business' ? '&view=business' : '')}
            className="dash-avatar"
            aria-label="View my profile"
          >
            <Avatar
              url={mode === 'business' ? profile.business_avatar_url : profile.avatar_url}
              name={name}
              size={84}
              themeId={profile.theme}
              ring
            />
          </a>
          <div className="dash-id">
            <p className="dash-hello">
              {greeting()}
              {profile.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
            </p>
            <h1>
              {name || 'Your account'}
              {profile.verified && <BadgeCheck size={22} className="pv-check" />}
            </h1>
            <p className="dash-sub">{email}</p>
          </div>
          {m.canSwitch && (
            <div className="mode-switch" role="tablist" aria-label="Account mode">
              <button
                role="tab"
                aria-selected={mode === 'worker'}
                className={mode === 'worker' ? 'on' : ''}
                onClick={() => switchMode('worker')}
                disabled={switching}
              >
                <Sparkles size={16} />
                Working
              </button>
              <button
                role="tab"
                aria-selected={mode === 'business'}
                className={mode === 'business' ? 'on' : ''}
                onClick={() => switchMode('business')}
                disabled={switching}
              >
                <Building2 size={16} />
                Hiring
              </button>
            </div>
          )}
        </div>
        <div className="dash-actions">
          <a
            className="chip-link"
            href={'profile.html?id=' + profile.id + (mode === 'business' ? '&view=business' : '')}
          >
            <Eye size={15} />
            {mode === 'business' ? 'View business page' : 'View profile'}
          </a>
          {staff && (
            <button
              className="chip-link strong"
              onClick={async () => {
                const {error} = await sb.rpc('set_staff_view', {p_on: true});
                if (error) return setErr(error.message);
                reload();
              }}
            >
              <ShieldCheck size={15} />
              Back to {staff === 'ceo' ? 'CEO' : 'admin'} view
            </button>
          )}
          <button className="chip-link" onClick={() => sb.auth.signOut().then(reload)}>
            <LogOut size={15} />
            Sign out
          </button>
        </div>
      </section>
      {err && <Notice kind="error">{err}</Notice>}
      {(profile.work_banned || profile.hire_banned) && !profile.banned && (
        <Notice kind="error">
          {profile.work_banned
            ? 'Working (picking up shifts) has been switched off for this account by Community Work.'
            : 'Hiring has been switched off for this business by Community Work, and its shifts are no longer shown.'}
          {profile.ban_reason ? ` Reason: ${profile.ban_reason}.` : ''} This is permanent.{' '}
          <a className="link" href="rules.html#enforcement">
            Community rules
          </a>
        </Notice>
      )}
      {(profile.suspended || profile.work_paused || profile.hire_paused) && <Suspended sb={sb} profile={profile} />}
      {askBiz && (
        <Sheet title="Switch to Hiring" onClose={() => setAskBiz(false)}>
          <form
            className="form"
            onSubmit={e => {
              e.preventDefault();
              if (bizName.trim().length >= 2) switchMode('business', bizName);
            }}
          >
            <p className="muted">
              Hiring mode gives you the business dashboard: post shifts, book workers and pay through escrow. You can
              switch back to Working any time.
            </p>
            <label className="field">
              Business name (shown to workers)
              <input
                value={bizName}
                onChange={e => setBizName(e.target.value)}
                minLength={2}
                maxLength={120}
                required
                autoFocus
                placeholder="e.g. Thandi’s Kitchen, or your own name"
              />
            </label>
            <button className="btn btn-primary btn-block themed" disabled={switching}>
              {switching ? <LoaderCircle className="spin" size={18} /> : <Building2 size={18} />}Switch to Hiring
            </button>
          </form>
        </Sheet>
      )}

      <nav className="dash-tabs" role="tablist">
        {tabs.map(([k, label, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            <Icon size={17} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="dash-body" key={mode + tab}>
        {tab === 'overview' &&
          (mode === 'business' ? (
            <BusinessOverview sb={sb} profile={profile} go={setTab} />
          ) : (
            <WorkerOverview sb={sb} profile={profile} go={setTab} />
          ))}
        {tab === 'profile' && <ProfileEditor sb={sb} profile={profile} onSaved={reload} mode={mode} />}
        {tab === 'bookings' && <WorkerBookings sb={sb} profile={profile} />}
        {tab === 'payouts' && <Payouts sb={sb} profile={profile} onSaved={reload} />}
        {tab === 'post' && <PostShift sb={sb} profile={profile} onPosted={() => setTab('shifts')} />}
        {tab === 'shifts' && <BusinessShifts sb={sb} profile={profile} />}
        {tab === 'settings' && (
          <AccountSettings
            sb={sb}
            profile={profile}
            email={email}
            mode={mode}
            onSwitch={() => switchMode(mode === 'business' ? 'worker' : 'business')}
            go={setTab}
          />
        )}
      </div>
    </div>
  );
}

/** Good morning / afternoon / evening. */
function greeting() {
  const h = Number(new Date().toLocaleString('en-ZA', {timeZone: tz, hour: 'numeric', hour12: false}));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** One number tile on an overview. */
function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{size?: number}>;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'green' | 'blue' | 'amber' | 'red' | 'theme';
}) {
  return (
    <div className={'stat ' + (tone || '')}>
      <span className="stat-icon">
        <Icon size={18} />
      </span>
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {sub && <small className="stat-sub">{sub}</small>}
    </div>
  );
}

/** Numbers for the overview pages (my_summary). */
type Summary = {
  worker: {upcoming: number; completed: number; earned_zar: number; held_zar: number; hours: number; next: any};
  business: {
    open: number;
    upcoming: number;
    booked: number;
    booked_shifts?: number;
    hired_total: number;
    held_zar: number;
    awaiting: number;
    spent_zar: number;
  };
};
/** Loads the overview numbers. */
function useSummary(sb: SupabaseClient) {
  const [s, setS] = useState<Summary | null>(null),
    [settings, setSettings] = useState<{strike_limit?: number; cancel_grace_minutes?: number; min_hourly_zar?: number}>(
      {},
    );
  useEffect(() => {
    sb.rpc('my_summary').then(({data}) => data && setS(data as Summary));
    sb.rpc('public_settings').then(({data}) => data && setSettings(data as any));
  }, []);
  return {s, settings};
}

/** Profile checklist on the worker overview. */
function Completeness({items, onFix}: {items: [string, boolean][]; onFix: () => void}) {
  const score = Math.round((items.filter(i => i[1]).length / items.length) * 100);
  if (score === 100) return null;
  return (
    <section className="card-panel nudge">
      <div className="ring" style={{'--p': score} as React.CSSProperties}>
        <span>{score}%</span>
      </div>
      <div className="nudge-body">
        <h3>Finish your profile</h3>
        <p className="muted">
          Complete profiles get picked faster. Still to do:{' '}
          {items
            .filter(i => !i[1])
            .map(i => i[0])
            .join(', ')}
          .
        </p>
      </div>
      <button className="btn btn-primary btn-sm themed" onClick={onFix}>
        Complete profile <ArrowRight size={15} />
      </button>
    </section>
  );
}

/** Working → Overview. */
function WorkerOverview({sb, profile, go}: {sb: SupabaseClient; profile: Profile; go: (t: string) => void}) {
  const {s, settings} = useSummary(sb);
  const w = s?.worker,
    limit = settings.strike_limit ?? 3,
    strikes = profile.strikes ?? 0;
  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile
          icon={CalendarDays}
          tone="theme"
          label="Upcoming shifts"
          value={w ? w.upcoming : '–'}
          sub={w?.next ? `Next: ${day(w.next.starts_at)}` : 'Nothing booked yet'}
        />
        <StatTile
          icon={CheckCircle2}
          tone="green"
          label="Shifts completed"
          value={w ? w.completed : '–'}
          sub={w ? `${Number(w.hours).toLocaleString('en-ZA')} hours worked` : ''}
        />
        <StatTile
          icon={Banknote}
          tone="blue"
          label="Earned"
          value={w ? money(w.earned_zar) : '–'}
          sub={w && w.held_zar ? `${money(w.held_zar)} held for you` : 'Paid to your bank'}
        />
        <StatTile
          icon={ShieldCheck}
          tone={strikes ? 'amber' : 'green'}
          label="Reliability"
          value={`${strikes}/${limit}`}
          sub={strikes ? 'strikes — cancelling adds one' : 'No strikes. Keep it up!'}
        />
      </div>
      {w?.next && (
        <section className="card-panel next-shift">
          <span className="next-date">
            <b>{new Date(w.next.starts_at).toLocaleDateString('en-ZA', {timeZone: tz, day: 'numeric'})}</b>
            {new Date(w.next.starts_at).toLocaleDateString('en-ZA', {timeZone: tz, month: 'short'})}
          </span>
          <div>
            <p className="overline">Your next shift</p>
            <h3>{w.next.title}</h3>
            <p className="meta-line">
              <Clock size={15} />
              {day(w.next.starts_at)} · {time(w.next.starts_at)}–{time(w.next.ends_at)} <MapPin size={15} />
              {w.next.address ? `${w.next.address}, ` : ''}
              {w.next.city}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => go('bookings')}>
            Details
          </button>
        </section>
      )}
      <Completeness
        onFix={() => go('profile')}
        items={[
          ['photo', !!profile.avatar_url],
          ['headline', !!profile.headline],
          ['about you', (profile.bio || '').length >= 40],
          ['skills', profile.skills.length >= 3],
          ['availability', (profile.availability ?? []).length > 0],
          ['CV', !!profile.resume_path],
        ]}
      />
      {!profile.payout_ready && (
        <section className="card-panel nudge">
          <span className="nudge-icon">
            <Wallet size={22} />
          </span>
          <div className="nudge-body">
            <h3>Set up how you get paid</h3>
            <p className="muted">Escrow shifts pay straight into your bank account.</p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => go('payouts')}>
            Add bank details
          </button>
        </section>
      )}
      <div className="quick-grid">
        <a className="quick" href="shifts.html">
          <span>
            <Search size={20} />
          </span>
          <strong>Find shifts</strong>
          <small>Pick up paid work near you</small>
        </a>
        <button className="quick" onClick={() => go('profile')}>
          <span>
            <Palette size={20} />
          </span>
          <strong>Style your profile</strong>
          <small>Photo, theme and experience</small>
        </button>
        <a className="quick" href="cv-builder.html">
          <span>
            <FileText size={20} />
          </span>
          <strong>Build a CV</strong>
          <small>Free PDF or Word</small>
        </a>
        <a className="quick" href="find-work.html?mode=remote">
          <span>
            <Globe size={20} />
          </span>
          <strong>Online jobs</strong>
          <small>Work from home</small>
        </a>
      </div>
    </div>
  );
}

/** Hiring → Overview. */
function BusinessOverview({sb, profile, go}: {sb: SupabaseClient; profile: Profile; go: (t: string) => void}) {
  const {s} = useSummary(sb);
  const b = s?.business;
  return (
    <div className="stack">
      <div className="stat-grid">
        <StatTile
          icon={Briefcase}
          tone="theme"
          label="Open shifts"
          value={b ? b.open : '–'}
          sub={b ? `${b.upcoming} upcoming in total` : ''}
        />
        <StatTile
          icon={Users}
          tone="green"
          label="Workers booked"
          value={b ? b.booked : '–'}
          sub={
            b
              ? `${b.booked_shifts ?? b.booked} upcoming ${(b.booked_shifts ?? b.booked) === 1 ? 'booking' : 'bookings'} · ${b.hired_total} different ${b.hired_total === 1 ? 'person' : 'people'} hired`
              : ''
          }
        />
        <StatTile
          icon={ShieldCheck}
          tone="blue"
          label="Held in escrow"
          value={b ? money(b.held_zar) : '–'}
          sub="Released after each shift"
        />
        <StatTile
          icon={Banknote}
          tone={b?.awaiting ? 'amber' : 'green'}
          label="Spent on shifts"
          value={b ? money(b.spent_zar) : '–'}
          sub={
            b?.awaiting
              ? `${b.awaiting} booking${b.awaiting > 1 ? 's' : ''} waiting for payment`
              : 'Including service fees'
          }
        />
      </div>
      {!!b?.awaiting && (
        <section className="card-panel nudge warn">
          <span className="nudge-icon">
            <Wallet size={22} />
          </span>
          <div className="nudge-body">
            <h3>
              {b.awaiting} worker{b.awaiting > 1 ? 's are' : ' is'} waiting for you to pay into escrow
            </h3>
            <p className="muted">Workers see the shift as secured once you’ve paid.</p>
          </div>
          <button className="btn btn-primary btn-sm themed" onClick={() => go('shifts')}>
            Pay now
          </button>
        </section>
      )}
      <Completeness
        onFix={() => go('profile')}
        items={[
          ['logo', !!profile.business_avatar_url],
          ['business name', !!profile.business_name],
          ['what you do', (profile.business_bio || '').length >= 40],
          ['type of business', !!profile.business_type],
          ['hours', !!profile.business_hours],
          ['phone', !!profile.phone],
        ]}
      />
      <div className="quick-grid">
        <button className="quick" onClick={() => go('post')}>
          <span>
            <Plus size={20} />
          </span>
          <strong>Post a shift</strong>
          <small>Set the hourly rate in rand</small>
        </button>
        <button className="quick" onClick={() => go('shifts')}>
          <span>
            <Users size={20} />
          </span>
          <strong>Manage workers</strong>
          <small>Hours, pay and no-shows</small>
        </button>
        <button className="quick" onClick={() => go('profile')}>
          <span>
            <Palette size={20} />
          </span>
          <strong>Business profile</strong>
          <small>Logo, theme and hours</small>
        </button>
        <a className="quick" href="shifts.html">
          <span>
            <Eye size={20} />
          </span>
          <strong>See the shift board</strong>
          <small>What workers see</small>
        </a>
      </div>
    </div>
  );
}

/** Settings tab: mode, payments, blocked workers, two-step sign-in, sign-in. */
function AccountSettings({
  sb,
  profile,
  email,
  mode,
  onSwitch,
  go,
}: {
  sb: SupabaseClient;
  profile: Profile;
  email: string;
  mode: Mode;
  onSwitch: () => void;
  go: (t: string) => void;
}) {
  const [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const [fee, setFee] = useState<number | null>(null);
  useEffect(() => {
    sb.rpc('public_settings').then(({data}) => data && setFee((data as any).platform_fee_percent));
  }, []);
  const hiring = mode === 'business';
  return (
    <div className="split">
      <div className="stack">
        {modes(profile).canSwitch && (
          <section className="card-panel section-card">
            <header className="sec-head">
              {hiring ? <Building2 size={18} /> : <Sparkles size={18} />}
              <div>
                <h2>You’re in {hiring ? 'Hiring' : 'Working'} mode</h2>
                <p>One mode at a time. Your dashboard, settings and payments all follow the mode you’re in.</p>
              </div>
            </header>
            <div className="mode-row">
              <span className="mode-ic">{hiring ? <Sparkles size={20} /> : <Building2 size={20} />}</span>
              <div>
                <strong>{hiring ? 'Want to pick up shifts?' : 'Need to hire people?'}</strong>
                <small>
                  {hiring
                    ? 'Switch to Working to find shifts, get paid to your bank and use your worker profile.'
                    : 'Switch to Hiring to post shifts, book workers and pay through escrow. Same login.'}
                </small>
              </div>
              <button className="btn btn-primary btn-sm themed" onClick={onSwitch}>
                <Repeat size={15} />
                Switch to {hiring ? 'Working' : 'Hiring'}
              </button>
            </div>
          </section>
        )}

        {hiring ? (
          <section className="card-panel section-card">
            <header className="sec-head">
              <Wallet size={18} />
              <div>
                <h2>Paying workers</h2>
                <p>How money moves when you book someone.</p>
              </div>
            </header>
            <dl className="pv-facts">
              <dt>
                <ShieldCheck size={15} />
                Escrow shifts
              </dt>
              <dd>
                You pay the shift amount{fee != null ? ` plus a ${fee}% service fee` : ''} into TradeSafe escrow when a
                worker picks it up. It’s released to them after you confirm the hours.
              </dd>
              <dt>
                <Banknote size={15} />
                Cash shifts
              </dt>
              <dd>You pay the worker in person and mark it paid in your Shifts tab.</dd>
              <dt>
                <FileText size={15} />
                Your details
              </dt>
              <dd>
                TradeSafe asks for your name, ID number and mobile once, at your first escrow payment (South African
                FICA rules).
              </dd>
            </dl>
            <div className="row-gap start">
              <button className="btn btn-outline btn-sm" onClick={() => go('shifts')}>
                Go to my shifts
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => go('profile')}>
                Edit business details
              </button>
            </div>
          </section>
        ) : (
          <section className="card-panel section-card">
            <header className="sec-head">
              <Wallet size={18} />
              <div>
                <h2>Getting paid</h2>
                <p>Escrow shift pay goes straight to your bank account.</p>
              </div>
            </header>
            <div className="mode-row">
              <span className="mode-ic">
                {profile.payout_ready ? <CheckCircle2 size={20} /> : <Wallet size={20} />}
              </span>
              <div>
                <strong>{profile.payout_ready ? 'Bank account added' : 'No bank account yet'}</strong>
                <small>
                  {profile.payout_ready
                    ? 'You can be paid for escrow shifts.'
                    : 'Add it before your first escrow shift so you can be paid.'}
                </small>
              </div>
              <button className="btn btn-outline btn-sm" onClick={() => go('payouts')}>
                {profile.payout_ready ? 'Change' : 'Add bank details'}
              </button>
            </div>
            <div className="mode-row">
              <span className="mode-ic">
                <ShieldCheck size={20} />
              </span>
              <div>
                <strong>
                  Reliability: {profile.strikes ?? 0} strike{profile.strikes === 1 ? '' : 's'}
                </strong>
                <small>
                  Cancelling a shift you picked up, or not showing up, adds a strike. 3 strikes pauses your account
                  until an appeal is approved.
                </small>
              </div>
            </div>
          </section>
        )}

        {hiring && <BlockedWorkers sb={sb} me={profile.id} />}
        <TwoStepCard sb={sb} />
        <section className="card-panel section-card">
          <header className="sec-head">
            <KeyRound size={18} />
            <div>
              <h2>Sign-in</h2>
              <p>{email}</p>
            </div>
          </header>
          <form
            className="form"
            onSubmit={async e => {
              e.preventDefault();
              const pw = String(new FormData(e.currentTarget).get('password'));
              const {error} = await sb.auth.updateUser({password: pw});
              setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'Password changed.'});
              if (!error) (e.target as HTMLFormElement).reset();
            }}
          >
            <label className="field">
              New password
              <input name="password" type="password" minLength={10} required autoComplete="new-password" />
              <small>At least 10 characters.</small>
            </label>
            {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
            <button className="btn btn-outline btn-sm">Change password</button>
          </form>
        </section>
      </div>
      <aside className="tips">
        <ShieldCheck size={22} />
        <h2>Your privacy</h2>
        <p className="muted">
          {hiring
            ? 'Your business profile is visible to signed-in members. Workers who pick up your shifts see your phone number and the exact address.'
            : 'Your profile is visible to signed-in members. Your phone number is only shown to people you’re booked with, and your CV only to businesses whose shifts you pick up.'}
        </p>
        <a className="link" href="privacy.html">
          Privacy details <ArrowRight size={15} />
        </a>
      </aside>
    </div>
  );
}

/** Workers this business has blocked, with Unblock. */
function BlockedWorkers({sb, me}: {sb: SupabaseClient; me: string}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => sb.rpc('my_blocked_workers').then(({data}) => setRows(data || []));
  useEffect(() => {
    load();
  }, []);
  return (
    <section className="card-panel section-card">
      <header className="sec-head">
        <Ban size={18} />
        <div>
          <h2>Blocked workers</h2>
          <p>They can’t see or book your shifts. Block someone from your Shifts list or their profile.</p>
        </div>
      </header>
      {!rows ? (
        <span className="spinner" />
      ) : !rows.length ? (
        <p className="muted">You haven’t blocked anyone.</p>
      ) : (
        rows.map(b => (
          <div className="mode-row" key={b.worker_id}>
            <a href={'profile.html?id=' + b.worker_id}>
              <Avatar url={b.avatar_url} name={b.full_name} size={44} themeId={b.theme} />
            </a>
            <div>
              <strong>{b.full_name || 'Worker'}</strong>
              <small>
                Blocked {new Date(b.created_at).toLocaleDateString('en-ZA')}
                {b.reason ? ` · ${b.reason}` : ''}
              </small>
            </div>
            <button
              className="btn btn-outline btn-sm"
              onClick={async () => {
                if (!confirm(`Unblock ${b.full_name || 'this worker'}? They’ll be able to book your shifts again.`))
                  return;
                await sb.from('business_blocks').delete().eq('business_id', me).eq('worker_id', b.worker_id);
                load();
              }}
            >
              Unblock
            </button>
          </div>
        ))
      )}
    </section>
  );
}

/** Turn two-step sign-in on or off. */
function TwoStepCard({sb}: {sb: SupabaseClient}) {
  const [factor, setFactor] = useState<string | null | undefined>(undefined),
    [setup, setSetup] = useState(false);
  const [required, setRequired] = useState(false),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const load = () => {
    sb.auth.mfa.listFactors().then(({data}) => setFactor(data?.totp?.find(f => f.status === 'verified')?.id ?? null));
    Promise.all([sb.from('staff').select('role').maybeSingle(), sb.rpc('public_settings')]).then(
      ([{data: st}, {data: s}]) => setRequired(!!st && !!(s as any)?.require_staff_mfa),
    );
  };
  useEffect(load, []);
  if (setup)
    return (
      <TwoFactor
        sb={sb}
        onDone={() => {
          setSetup(false);
          setMsg({kind: 'ok', text: 'Two-step sign-in is on.'});
          load();
        }}
        onCancel={() => setSetup(false)}
      />
    );
  return (
    <section className="card-panel section-card">
      <header className="sec-head">
        <ShieldCheck size={18} />
        <div>
          <h2>Two-step sign-in</h2>
          <p>Optional. Ask for a 6-digit code from an authenticator app each time you sign in.</p>
        </div>
      </header>
      <div className="mode-row">
        <span className="mode-ic">
          <KeyRound size={20} />
        </span>
        <div>
          <strong>{factor ? 'On' : 'Off'}</strong>
          <small>
            {factor
              ? 'Your account needs your password and a code from your phone.'
              : 'Recommended for business owners and the team, especially when money is involved.'}
          </small>
        </div>
        {factor === undefined ? (
          <span className="spinner" />
        ) : factor ? (
          <button
            className="btn btn-outline btn-sm"
            disabled={required}
            title={required ? 'Required for the Community Work team' : undefined}
            onClick={async () => {
              if (!confirm('Turn off two-step sign-in? Your password alone will be enough to sign in.')) return;
              const {error} = await sb.auth.mfa.unenroll({factorId: factor});
              setMsg(
                error
                  ? {
                      kind: 'error',
                      text: /aal2|assurance/i.test(error.message)
                        ? 'Sign out and back in with your code first, then turn it off.'
                        : error.message,
                    }
                  : {kind: 'ok', text: 'Two-step sign-in is off.'},
              );
              if (!error) {
                await sb.auth.refreshSession();
                load();
              }
            }}
          >
            Turn off
          </button>
        ) : (
          <button
            className="btn btn-primary btn-sm themed"
            onClick={() => {
              setMsg(null);
              setSetup(true);
            }}
          >
            Turn on
          </button>
        )}
      </div>
      {required && factor && <p className="muted small">Community Work requires two-step sign-in for team accounts.</p>}
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </section>
  );
}

/** Shown when the account (or one side) is paused or banned, with the appeal form. */
function Suspended({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  const [appeal, setAppeal] = useState<
    {status: string; response: string | null; created_at: string} | null | undefined
  >(undefined);
  const [busy, setBusy] = useState(false),
    [err, setErr] = useState('');
  const load = () =>
    sb
      .from('appeals')
      .select('status, response, created_at')
      .eq('user_id', profile.id)
      .order('created_at', {ascending: false})
      .limit(1)
      .then(({data}) => setAppeal(data?.[0] ?? null));
  useEffect(() => {
    load();
  }, []);
  const pending = appeal?.status === 'pending';
  return (
    <section className="card-panel suspended">
      {profile.banned ? (
        <header className="sec-head">
          <Ban size={20} />
          <div>
            <h2>This account has been closed</h2>
            <p>
              Community Work has closed this account, so it can’t pick up or post shifts. If you think this is a
              mistake, contact us through the Help page.
            </p>
          </div>
        </header>
      ) : (
        <>
          {profile.suspended ? (
            <header className="sec-head">
              <Ban size={20} />
              <div>
                <h2>Your account is paused</h2>
                <p>
                  {profile.suspended_reason || 'Suspended by Community Work'}. You can’t pick up or post shifts until
                  it’s restored.
                </p>
              </div>
            </header>
          ) : (
            <header className="sec-head">
              <Ban size={20} />
              <div>
                <h2>
                  {profile.work_paused && profile.hire_paused
                    ? 'Working and hiring are paused'
                    : profile.work_paused
                      ? 'Working is paused'
                      : 'Hiring is paused'}
                </h2>
                <p>
                  {profile.pause_reason ? profile.pause_reason + '. ' : ''}
                  {profile.work_paused && profile.hire_paused
                    ? 'You can’t pick up or post shifts'
                    : profile.work_paused
                      ? 'You can’t pick up shifts'
                      : 'Your business can’t post shifts and its open shifts are hidden'}{' '}
                  until Community Work restores it. You can appeal below.
                </p>
              </div>
            </header>
          )}
          {appeal === undefined ? (
            <span className="spinner" />
          ) : pending ? (
            <Notice>
              Your appeal was sent on {new Date(appeal!.created_at).toLocaleDateString('en-ZA')}. Our team will review
              it soon.
            </Notice>
          ) : (
            <form
              className="form"
              onSubmit={async e => {
                e.preventDefault();
                setBusy(true);
                setErr('');
                const reason = String(new FormData(e.currentTarget).get('reason')).trim();
                const {error} = await sb.from('appeals').insert({user_id: profile.id, reason});
                setBusy(false);
                if (error) setErr(error.message);
                else load();
              }}
            >
              {appeal?.status === 'denied' && (
                <Notice kind="error">
                  Your last appeal was not approved{appeal.response ? `: ${appeal.response}` : '.'} You can appeal again
                  with more information.
                </Notice>
              )}
              <label className="field">
                Tell us what happened
                <textarea
                  name="reason"
                  rows={4}
                  minLength={10}
                  maxLength={2000}
                  required
                  placeholder="Explain why you cancelled or missed the shifts, and what you’ll do differently."
                />
              </label>
              {err && <Notice kind="error">{err}</Notice>}
              <button className="btn btn-primary" disabled={busy}>
                {busy && <LoaderCircle className="spin" size={18} />}Send appeal
              </button>
            </form>
          )}
        </>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- worker: payouts and bookings
function Payouts({sb, profile, onSaved}: {sb: SupabaseClient; profile: Profile; onSaved: () => void}) {
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  return (
    <div className="split">
      <section className="card-panel form">
        <h2 className="form-step">
          <Wallet size={18} />
          Where your pay goes
        </h2>
        {profile.payout_ready && (
          <Notice kind="ok">Payouts are set up. Pay for completed shifts goes straight to your bank account.</Notice>
        )}
        <p className="muted">
          Shift pay is held safely by TradeSafe, a South African escrow company, and paid into your bank account once
          the shift is confirmed. Community Work never holds your money or sees your full bank details.
        </p>
        <form
          className="form"
          onSubmit={async e => {
            e.preventDefault();
            setBusy(true);
            setMsg(null);
            const f = Object.fromEntries(new FormData(e.currentTarget));
            try {
              const r = await callFunction(sb, 'payments', {action: 'payout_setup', ...f});
              setMsg({kind: 'ok', text: `Saved. Pay will go to the account ending ${r.last4}.`});
              onSaved();
              (e.target as HTMLFormElement).reset();
            } catch (err) {
              setMsg({kind: 'error', text: errorText(err)});
            } finally {
              setBusy(false);
            }
          }}
        >
          <div className="grid-2">
            <label className="field">
              First name (as on ID)
              <input name="givenName" required maxLength={60} />
            </label>
            <label className="field">
              Surname
              <input name="familyName" required maxLength={60} />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              SA ID number
              <input name="idNumber" required inputMode="numeric" pattern="\d{13}" maxLength={13} />
            </label>
            <label className="field">
              Mobile number
              <input name="mobile" required inputMode="tel" placeholder="082 123 4567" />
            </label>
          </div>
          <div className="grid-2">
            <label className="field">
              Bank
              <select name="bank" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {[
                  ['ABSA', 'Absa'],
                  ['CAPITEC', 'Capitec'],
                  ['FNB', 'FNB'],
                  ['NEDBANK', 'Nedbank'],
                  ['STANDARD_BANK', 'Standard Bank'],
                  ['TYME', 'TymeBank'],
                  ['AFRICAN_BANK', 'African Bank'],
                  ['DISCOVERY', 'Discovery'],
                  ['INVESTEC', 'Investec'],
                  ['OLD_MUTUAL', 'Old Mutual'],
                  ['BIDVEST', 'Bidvest'],
                  ['SASFIN', 'Sasfin'],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Account type
              <select name="accountType">
                <option value="CHEQUE">Cheque / current</option>
                <option value="SAVINGS">Savings</option>
              </select>
            </label>
          </div>
          <label className="field">
            Account number
            <input name="accountNumber" required inputMode="numeric" maxLength={16} autoComplete="off" />
          </label>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={18} /> : <ShieldCheck size={18} />}
            {profile.payout_ready ? 'Replace payout account' : 'Save payout details'}
          </button>
        </form>
      </section>
      <aside className="tips">
        <Banknote size={22} />
        <h2>How you get paid</h2>
        <ol>
          <li>
            <strong>The business pays first.</strong> When they book you, they pay the full shift into escrow.
          </li>
          <li>
            <strong>You work the shift.</strong> The money is already secured.
          </li>
          <li>
            <strong>Hours are confirmed.</strong> The business confirms, or our team does if there’s a problem.
          </li>
          <li>
            <strong>Pay is released to your bank.</strong> Usually the same or next working day.
          </li>
        </ol>
        <p className="muted">
          Cash shifts are paid in person by the business. Cash App isn’t available in South Africa; escrow pay goes to
          SA bank accounts.
        </p>
      </aside>
    </div>
  );
}

/** A worker's booking with its shift and payment. */
type Booking = {
  id: string;
  status: string;
  hours_worked: number | null;
  business_confirmed_at: string | null;
  worker_confirmed_at: string | null;
  message: string | null;
  shift: {
    id: string;
    title: string;
    city: string;
    province: string;
    address: string | null;
    starts_at: string;
    ends_at: string;
    hourly_rate_zar: number;
    payment_method: string;
    business_id: string;
    status: string;
  };
  payment?: {id: string; state: string; amount_zar: number} | null;
};

// Live countdown of the free-cancel window after picking up a shift. Ticks every second; disappears when the time is up.
function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}
/** Milliseconds as m:ss. */
const mmss = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** Live countdown of the free-cancel window after picking up a shift. */
function CancelTimer({
  pickedUpAt,
  graceMinutes,
  compact = false,
}: {
  pickedUpAt: string | number;
  graceMinutes: number;
  compact?: boolean;
}) {
  const end = (typeof pickedUpAt === 'number' ? pickedUpAt : Date.parse(pickedUpAt)) + graceMinutes * 60000;
  const now = useNow(end > Date.now());
  if (!graceMinutes || Number.isNaN(end)) return null;
  const left = end - now;
  if (left <= 0)
    return compact ? null : (
      <p className="cancel-timer over">
        <Clock size={15} />
        The free cancel window has ended — cancelling now counts as a strike.
      </p>
    );
  const pct = Math.min(100, (left / (graceMinutes * 60000)) * 100);
  return (
    <div className={'cancel-timer' + (left < 60000 ? ' soon' : '')} role="timer" aria-live="off">
      <Clock size={15} />
      <span>
        <b>{mmss(left)}</b> left to cancel for free
      </span>
      <i style={{width: pct + '%'}} />
    </div>
  );
}

/** Working → My shifts. */
function WorkerBookings({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  const [rows, setRows] = useState<Booking[] | null>(null),
    [err, setErr] = useState('');
  const [settings, setSettings] = useState({strike_limit: 3, cancel_grace_minutes: 10});
  const [cancelling, setCancelling] = useState<Booking | null>(null),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const {data, error} = await sb
      .from('applications')
      .select('*, shift:shifts(*)')
      .eq('worker_id', profile.id)
      .order('created_at', {ascending: false});
    if (error) return setErr(error.message);
    const {data: pays} = await sb
      .from('payments')
      .select('id, state, amount_zar, application_id')
      .eq('worker_id', profile.id);
    setRows((data as any[]).map(r => ({...r, payment: pays?.find(p => p.application_id === r.id) ?? null})));
  };
  useEffect(() => {
    load();
    sb.rpc('public_settings').then(({data}) => data && setSettings(s => ({...s, ...(data as any)})));
  }, []);
  useNow(!!cancelling); // keeps the strike warning in the cancel sheet up to date as the free window runs out
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!rows)
    return (
      <div className="card-panel center">
        <span className="spinner" />
      </div>
    );
  const now = Date.now();
  const upcoming = rows
    .filter(b => b.status === 'accepted' && Date.parse(b.shift.ends_at) > now)
    .sort((a, b) => Date.parse(a.shift.starts_at) - Date.parse(b.shift.starts_at));
  const past = rows.filter(b => !upcoming.includes(b));
  const free = (b: Booking) => Date.now() - Date.parse((b as any).created_at) < settings.cancel_grace_minutes * 60000;
  const strikes = profile.strikes ?? 0;

  async function cancel(b: Booking) {
    setBusy(true);
    const {error} = await sb.from('applications').update({status: 'withdrawn'}).eq('id', b.id);
    if (!error && b.payment && ['awaiting_payment', 'funded'].includes(b.payment.state)) {
      try {
        await callFunction(sb, 'payments', {
          action: 'cancel',
          paymentId: b.payment.id,
          reason: 'Worker cancelled the shift',
        });
      } catch {
        /* staff will refund */
      }
    }
    setBusy(false);
    setCancelling(null);
    if (error) alert(error.message);
    location.reload();
  }

  const card = (b: Booking) => (
    <article className="card-panel booking" key={b.id}>
      <div className="booking-top">
        <div>
          <h3>{b.shift.title}</h3>
          <p className="muted small">
            {day(b.shift.starts_at)} · {time(b.shift.starts_at)}–{time(b.shift.ends_at)}
          </p>
        </div>
        <StatusPill status={b.status} />
      </div>
      <p className="meta-line">
        <MapPin size={15} />
        {b.status === 'accepted' || b.status === 'completed' ? (b.shift.address ? `${b.shift.address}, ` : '') : ''}
        {b.shift.city}
        <a className="link small" href={'profile.html?view=business&id=' + b.shift.business_id}>
          Business profile <ArrowUpRight size={13} />
        </a>
      </p>
      <p className="meta-line">
        <Banknote size={15} />
        {money(b.shift.hourly_rate_zar)}/hr ·{' '}
        {money(b.shift.hourly_rate_zar * hoursBetween(b.shift.starts_at, b.shift.ends_at))} for the shift ·{' '}
        {b.shift.payment_method === 'cash' ? 'Paid in cash' : 'Escrow-protected'}
      </p>
      {b.payment && (
        <p className="meta-line">
          <Wallet size={15} />
          Pay: <PayState state={b.payment.state} />
        </p>
      )}
      {b.status === 'accepted' && Date.parse(b.shift.starts_at) > now && (
        <CancelTimer pickedUpAt={(b as any).created_at} graceMinutes={settings.cancel_grace_minutes} compact />
      )}
      <div className="row-gap start">
        {b.status === 'accepted' && Date.parse(b.shift.starts_at) > now && (
          <button className="btn btn-outline btn-sm" onClick={() => setCancelling(b)}>
            Cancel shift
          </button>
        )}
        {b.hours_worked != null && !b.worker_confirmed_at && (
          <button
            className="btn btn-primary btn-sm themed"
            onClick={async () => {
              await sb.from('applications').update({worker_confirmed_at: new Date().toISOString()}).eq('id', b.id);
              load();
            }}
          >
            <Check size={15} />
            Confirm {b.hours_worked} hours
          </button>
        )}
        {b.payment?.state === 'funded' && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              if (
                confirm(
                  'Report a problem with this shift’s pay? Our team will review it and the money stays held until resolved.',
                )
              ) {
                try {
                  await callFunction(sb, 'payments', {action: 'dispute', paymentId: b.payment!.id});
                  load();
                } catch (e) {
                  alert(errorText(e));
                }
              }
            }}
          >
            Report a problem
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div className="stack">
      {strikes > 0 && (
        <Notice kind="error">
          You have {strikes} of {settings.strike_limit} strikes. Cancelling a shift you picked up, or not showing up,
          adds a strike. At {settings.strike_limit} your account is paused until an appeal is approved.
        </Notice>
      )}
      {!profile.payout_ready && (
        <Notice>
          Add your bank details under <strong>Get paid</strong> so escrow shifts can pay you.
        </Notice>
      )}
      <h2 className="list-title">
        Upcoming <span>{upcoming.length}</span>
      </h2>
      {upcoming.length ? (
        upcoming.map(card)
      ) : (
        <div className="empty small">
          <div className="empty-icon">
            <CalendarDays size={26} />
          </div>
          <h3>No upcoming shifts</h3>
          <p>Pick up a shift near you in one tap.</p>
          <a className="btn btn-primary themed" href="shifts.html">
            Find shifts
          </a>
        </div>
      )}
      {past.length > 0 && (
        <>
          <h2 className="list-title">
            History <span>{past.length}</span>
          </h2>
          {past.map(card)}
        </>
      )}
      {cancelling && (
        <Sheet title="Cancel this shift?" onClose={() => setCancelling(null)}>
          <div className="form">
            <p>
              <strong>{cancelling.shift.title}</strong> · {day(cancelling.shift.starts_at)}{' '}
              {time(cancelling.shift.starts_at)}
            </p>
            <CancelTimer pickedUpAt={(cancelling as any).created_at} graceMinutes={settings.cancel_grace_minutes} />
            {free(cancelling) ? (
              <Notice kind="ok">
                You picked this up less than {settings.cancel_grace_minutes} minutes ago, so cancelling won’t count as a
                strike.
              </Notice>
            ) : (
              <Notice kind="error">
                This will be strike {strikes + 1} of {settings.strike_limit}.
                {strikes + 1 >= settings.strike_limit
                  ? ' Your account will be paused until an appeal is approved.'
                  : ''}{' '}
                The business is counting on you; only cancel if you really can’t make it.
              </Notice>
            )}
            <div className="row-gap start">
              <button className="btn btn-dark" disabled={busy} onClick={() => cancel(cancelling)}>
                {busy && <LoaderCircle className="spin" size={16} />}Yes, cancel shift
              </button>
              <button className="btn btn-outline" onClick={() => setCancelling(null)}>
                Keep my shift
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/** Booking status as a coloured label. */
function StatusPill({status}: {status: string}) {
  const label: Record<string, string> = {
    applied: 'Applied',
    accepted: 'Booked',
    declined: 'Released',
    withdrawn: 'Withdrawn',
    completed: 'Completed',
    no_show: 'No-show',
    open: 'Open',
    filled: 'Fully booked',
    in_progress: 'In progress',
    cancelled: 'Cancelled',
  };
  return <span className={'pill ' + status}>{label[status] ?? status}</span>;
}
/** Payment status as a coloured label. */
function PayState({state}: {state: string}) {
  const label: Record<string, string> = {
    awaiting_payment: 'Waiting for business to pay',
    funded: 'Held in escrow',
    released: 'Paid out',
    refunded: 'Refunded',
    disputed: 'Under review',
    cancelled: 'Cancelled',
    cash_paid: 'Paid in cash',
  };
  return <span className={'pill pay-' + state}>{label[state] ?? state}</span>;
}

// ---------------------------------------------------------------- business: post and manage shifts
function PostShift({sb, profile, onPosted}: {sb: SupabaseClient; profile: Profile; onPosted: () => void}) {
  const [settings, setSettings] = useState({min_hourly_zar: 30.23, platform_fee_percent: 10});
  const [spot, setSpot] = useState<Location | null>(null),
    [picking, setPicking] = useState(false);
  const [f, setF] = useState({
    title: '',
    category: '',
    description: '',
    address: '',
    city: profile.city || '',
    province: profile.province || '',
    date: '',
    start: '08:00',
    end: '16:00',
    rate: '',
    workers: '1',
    days: '1',
    payment: 'escrow',
  });
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  useEffect(() => {
    sb.rpc('public_settings').then(({data}) => data && setSettings(data as any));
  }, []);
  const set = (k: keyof typeof f, v: string) => setF(x => ({...x, [k]: v}));
  const hours = (() => {
    const [a, b] = [f.start, f.end].map(t => {
      const [h, m] = t.split(':').map(Number);
      return h + m / 60;
    });
    return b > a ? b - a : b + 24 - a;
  })();
  const pay = (Number(f.rate) || 0) * hours * (Number(f.workers) || 1) * (Number(f.days) || 1);
  const fee = f.payment === 'escrow' ? (pay * settings.platform_fee_percent) / 100 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!spot) return setMsg({kind: 'error', text: 'Set the workplace location.'});
    if (Number(f.rate) < settings.min_hourly_zar)
      return setMsg({
        kind: 'error',
        text: `Pay must be at least ${money(settings.min_hourly_zar)} an hour (national minimum wage).`,
      });
    if (hours < 4)
      return setMsg({
        kind: 'error',
        text: 'A shift must be at least 4 hours. South African law pays anyone who works under 4 hours in a day for 4 hours anyway.',
      });
    if (hours > 12)
      return setMsg({
        kind: 'error',
        text: 'A shift can be at most 12 hours, including overtime (Basic Conditions of Employment Act).',
      });
    setBusy(true);
    const rows = Array.from({length: Math.min(Number(f.days) || 1, 14)}, (_, i) => {
      const startLocal = new Date(`${f.date}T${f.start}:00+02:00`);
      startLocal.setUTCDate(startLocal.getUTCDate() + i);
      const end = new Date(startLocal.getTime() + hours * 36e5);
      return {
        business_id: profile.id,
        title: f.title.trim(),
        category: f.category,
        description: f.description.trim(),
        address: f.address.trim() || null,
        city: f.city.trim(),
        province: f.province,
        lat: spot.lat,
        lon: spot.lon,
        starts_at: startLocal.toISOString(),
        ends_at: end.toISOString(),
        hourly_rate_zar: Number(f.rate),
        workers_needed: Number(f.workers) || 1,
        payment_method: f.payment,
      };
    });
    const {error} = await sb.from('shifts').insert(rows);
    setBusy(false);
    if (error) return setMsg({kind: 'error', text: error.message});
    setMsg({
      kind: 'ok',
      text: rows.length > 1 ? `${rows.length} shifts posted.` : 'Shift posted. Nearby workers can apply now.',
    });
    setTimeout(onPosted, 900);
  }

  if (picking)
    return (
      <section className="card-panel form">
        <h2 className="form-step">Where is the work?</h2>
        <LocationPicker
          purpose="post"
          onSelect={l => {
            setSpot(l);
            setPicking(false);
            const prov = PROVINCES.find(p => l.label.includes(p));
            if (prov) set('province', prov);
          }}
        />
        <button className="btn btn-outline" onClick={() => setPicking(false)}>
          Back
        </button>
      </section>
    );
  return (
    <form className="split" onSubmit={submit}>
      <section className="card-panel form">
        <h2 className="form-step">
          <span>1</span>The shift
        </h2>
        <label className="field">
          Job title
          <input
            value={f.title}
            onChange={e => set('title', e.target.value)}
            required
            minLength={3}
            maxLength={100}
            placeholder="e.g. Waiter for Saturday lunch"
          />
        </label>
        <label className="field">
          Type of work
          <select value={f.category} onChange={e => set('category', e.target.value)} required>
            <option value="" disabled>
              Choose…
            </option>
            {browseCategories
              .filter(c => c !== 'Other')
              .map(c => (
                <option key={c}>{c}</option>
              ))}
            <option>Other</option>
          </select>
        </label>
        <label className="field">
          What the worker will do
          <textarea
            rows={4}
            value={f.description}
            onChange={e => set('description', e.target.value)}
            required
            minLength={10}
            maxLength={4000}
            placeholder="Duties, dress code, what to bring, who to ask for."
          />
          <small>{f.description.length}/4000</small>
        </label>
        <h2 className="form-step">
          <span>2</span>Where
        </h2>
        <button type="button" className={'location-set' + (spot ? ' done' : '')} onClick={() => setPicking(true)}>
          <MapPin size={21} />
          <span>
            <strong>{spot ? spot.label : 'Set the workplace location'}</strong>
            <small>{spot ? 'Tap to change' : 'Search the address or use your location on site'}</small>
          </span>
          {spot ? <Check size={20} /> : <Plus size={20} />}
        </button>
        <label className="field">
          Street address (shown only to booked workers)
          <input value={f.address} onChange={e => set('address', e.target.value)} maxLength={200} />
        </label>
        <div className="grid-2">
          <label className="field">
            City or town
            <input value={f.city} onChange={e => set('city', e.target.value)} required minLength={2} maxLength={100} />
          </label>
          <label className="field">
            Province
            <select value={f.province} onChange={e => set('province', e.target.value)} required>
              <option value="" disabled>
                Choose…
              </option>
              {PROVINCES.map(p => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>
        <h2 className="form-step">
          <span>3</span>When and pay
        </h2>
        <div className="grid-2">
          <label className="field">
            Date
            <input
              type="date"
              value={f.date}
              onChange={e => set('date', e.target.value)}
              required
              min={new Date().toISOString().slice(0, 10)}
            />
          </label>
          <label className="field">
            Repeat for
            <select value={f.days} onChange={e => set('days', e.target.value)}>
              {[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => (
                <option key={n} value={n}>
                  {n === 1 ? 'Just this day' : `${n} days in a row`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Start (SAST)
            <input type="time" value={f.start} onChange={e => set('start', e.target.value)} required />
          </label>
          <label className="field">
            End
            <input type="time" value={f.end} onChange={e => set('end', e.target.value)} required />
          </label>
        </div>
        <div className="grid-2">
          <label className="field">
            Pay per hour (R)
            <input
              type="number"
              inputMode="decimal"
              min={settings.min_hourly_zar}
              max={5000}
              step="0.01"
              value={f.rate}
              onChange={e => set('rate', e.target.value)}
              required
              placeholder={`At least ${settings.min_hourly_zar}`}
            />
          </label>
          <label className="field">
            Workers needed
            <input
              type="number"
              min={1}
              max={50}
              value={f.workers}
              onChange={e => set('workers', e.target.value)}
              required
            />
          </label>
        </div>
        <p className={'hint-box' + (hours < 4 || hours > 12 ? ' warn' : '')}>
          <Clock size={14} /> {hours.toFixed(hours % 1 ? 2 : 0)} hours. Shifts are 4–12 hours. Over 5 hours, give a
          1-hour meal break{hours > 9 ? '; over 9 hours, the extra time is overtime at 1.5× pay' : ''}. Sundays pay
          double, public holidays double.{' '}
          <a className="link" href="rules.html#business">
            Hiring rules
          </a>
        </p>
        <fieldset>
          <legend>How you’ll pay</legend>
          <div className="choice-row">
            <button
              type="button"
              className={'choice' + (f.payment === 'escrow' ? ' on' : '')}
              onClick={() => set('payment', 'escrow')}
            >
              <ShieldCheck size={20} />
              <strong>Escrow (recommended)</strong>
              <small>Pay in when you book; released after the shift</small>
            </button>
            <button
              type="button"
              className={'choice' + (f.payment === 'cash' ? ' on' : '')}
              onClick={() => set('payment', 'cash')}
            >
              <Banknote size={20} />
              <strong>Cash</strong>
              <small>You pay the worker in person</small>
            </button>
          </div>
        </fieldset>
        <label className="check">
          <input type="checkbox" required />
          <span>
            I’ll pay at least the minimum wage, give breaks, keep the workplace safe and follow the{' '}
            <a className="link" href="rules.html#business" target="_blank">
              Community rules
            </a>
            .
          </span>
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        {profile.hire_paused && (
          <Notice kind="error">
            Hiring is paused on your account, so you can’t post shifts right now. See your Overview to appeal.
          </Notice>
        )}
        <button
          className="btn btn-primary btn-block btn-lg"
          disabled={busy || profile.suspended || !!profile.hire_paused}
        >
          {busy ? <LoaderCircle className="spin" size={18} /> : <Plus size={18} />}Post shift
        </button>
      </section>
      <aside className="tips sticky">
        <Wallet size={22} />
        <h2>Cost</h2>
        <p className="big-pay">{money(pay + fee)}</p>
        <p className="muted">
          {money(Number(f.rate) || 0)}/hr × {hours.toFixed(hours % 1 ? 2 : 0)} h × {f.workers || 1} worker
          {Number(f.workers) > 1 ? 's' : ''}
          {Number(f.days) > 1 ? ` × ${f.days} days` : ''}
          {fee ? ` + ${settings.platform_fee_percent}% service fee (${money(fee)})` : ''}
        </p>
        <p className="muted">Workers receive the full hourly rate. You only pay for workers you book.</p>
      </aside>
    </form>
  );
}

/** A worker booked on one of my shifts. */
type Applicant = {
  id: string;
  status: string;
  message: string | null;
  hours_worked: number | null;
  business_confirmed_at: string | null;
  worker_confirmed_at: string | null;
  worker_id: string;
  worker?: Profile;
  payment?: {id: string; state: string; amount_zar: number; checkout_url: string | null} | null;
};
/** One of my posted shifts with its bookings. */
type MyShift = {
  id: string;
  title: string;
  city: string;
  starts_at: string;
  ends_at: string;
  hourly_rate_zar: number;
  workers_needed: number;
  status: string;
  payment_method: string;
  apps: Applicant[];
};

/** Hiring → Shifts: bookings, hours, pay, release, no-show, block. */
function BusinessShifts({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  const [rows, setRows] = useState<MyShift[] | null>(null),
    [err, setErr] = useState(''),
    [busyId, setBusyId] = useState('');
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  // Block a worker from all your shifts; if they're booked on an upcoming one, release them from it too.
  const block = (a: Applicant, upcoming: boolean) =>
    act(a.id, async () => {
      const reason = prompt(
        `Block ${a.worker?.full_name || 'this worker'} from all your shifts? They won’t see or book them again. Optional reason (only you and Community Work see it):`,
      );
      if (reason === null) return;
      const {error} = await sb
        .from('business_blocks')
        .insert({business_id: profile.id, worker_id: a.worker_id, reason: reason.slice(0, 300) || null});
      if (error && !/duplicate/.test(error.message)) throw error;
      if (upcoming && a.status === 'accepted') {
        const {error: e2} = await sb.from('applications').update({status: 'declined'}).eq('id', a.id);
        if (e2) throw e2;
        if (a.payment && ['awaiting_payment', 'funded'].includes(a.payment.state))
          await callFunction(sb, 'payments', {
            action: 'cancel',
            paymentId: a.payment.id,
            reason: 'Business released and blocked the worker',
          });
      }
    });
  const load = async () => {
    const {data: shifts, error} = await sb
      .from('shifts')
      .select('*')
      .eq('business_id', profile.id)
      .order('starts_at', {ascending: true});
    if (error) return setErr(error.message);
    const ids = (shifts || []).map(s => s.id);
    const {data: apps} = ids.length ? await sb.from('applications').select('*').in('shift_id', ids) : {data: []};
    const workerIds = [...new Set((apps || []).map((a: any) => a.worker_id))];
    const {data: workers} = workerIds.length ? await sb.from('profiles').select('*').in('id', workerIds) : {data: []};
    const {data: pays} = await sb
      .from('payments')
      .select('id, state, amount_zar, checkout_url, application_id')
      .eq('business_id', profile.id);
    const {data: bl} = await sb.from('business_blocks').select('worker_id').eq('business_id', profile.id);
    setBlocked(new Set((bl || []).map((b: any) => b.worker_id)));
    setRows(
      (shifts || []).map((s: any) => ({
        ...s,
        apps: (apps || [])
          .filter((a: any) => a.shift_id === s.id)
          .map((a: any) => ({
            ...a,
            worker: workers?.find((w: any) => w.id === a.worker_id),
            payment: pays?.find(p => p.application_id === a.id) ?? null,
          })),
      })),
    );
  };
  useEffect(() => {
    load();
  }, []);
  const act = async (id: string, fn: () => Promise<any>) => {
    setBusyId(id);
    try {
      await fn();
    } catch (e) {
      alert(errorText(e));
    } finally {
      setBusyId('');
      load();
    }
  };
  const update = (id: string, patch: Record<string, unknown>) =>
    act(id, async () => {
      const {error} = await sb.from('applications').update(patch).eq('id', id);
      if (error) throw error;
    });
  // Ending a booking (no-show or released) refunds any escrow payment back to the business.
  const endBooking = (a: Applicant, status: 'no_show' | 'declined') =>
    act(a.id, async () => {
      const {error} = await sb.from('applications').update({status}).eq('id', a.id);
      if (error) throw error;
      if (a.payment && ['awaiting_payment', 'funded'].includes(a.payment.state))
        await callFunction(sb, 'payments', {
          action: 'cancel',
          paymentId: a.payment.id,
          reason: status === 'no_show' ? 'Worker did not show up' : 'Business released the worker',
        });
    });
  const openCv = async (path: string) => {
    const {data} = await sb.storage.from('resumes').createSignedUrl(path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };

  if (err) return <Notice kind="error">{err}</Notice>;
  if (!rows)
    return (
      <div className="card-panel center">
        <span className="spinner" />
      </div>
    );
  if (!rows.length)
    return (
      <div className="empty">
        <div className="empty-icon">
          <Briefcase size={28} />
        </div>
        <h2>No shifts posted yet</h2>
        <p>Post a shift and nearby workers can pick it up straight away.</p>
        <a className="btn btn-primary" href="account.html?tab=post">
          Post a shift
        </a>
      </div>
    );
  return (
    <div className="stack">
      {rows.map(s => (
        <article className="card-panel booking" key={s.id}>
          <div className="booking-top">
            <h3>{s.title}</h3>
            <StatusPill status={s.status} />
          </div>
          <p className="meta-line">
            <CalendarDays size={15} />
            {day(s.starts_at)} · {time(s.starts_at)}–{time(s.ends_at)} <MapPin size={15} />
            {s.city} <Banknote size={15} />
            {money(s.hourly_rate_zar)}/hr · {s.payment_method === 'cash' ? 'Cash' : 'Escrow'}
          </p>
          <p className="meta-line">
            <Users size={15} />
            {s.apps.filter(a => ['accepted', 'completed'].includes(a.status)).length} of {s.workers_needed} spots filled
          </p>
          {(() => {
            const gone = s.apps.filter(a => ['declined', 'withdrawn'].includes(a.status)).length;
            return gone ? (
              <p className="muted small">
                {gone} cancelled or released {gone === 1 ? 'booking' : 'bookings'} hidden —{' '}
                {s.status === 'open' ? 'the spot is open for others again' : 'spots refilled'}.
              </p>
            ) : null;
          })()}
          {s.apps.some(
            a =>
              !['declined', 'withdrawn'].includes(a.status) || ['funded', 'disputed'].includes(a.payment?.state ?? ''),
          ) && (
            <div className="applicants">
              {s.apps
                .filter(
                  a =>
                    !['declined', 'withdrawn'].includes(a.status) ||
                    ['funded', 'disputed'].includes(a.payment?.state ?? ''),
                )
                .map(a => {
                  const w = a.worker;
                  const shiftHours = hoursBetween(s.starts_at, s.ends_at);
                  return (
                    <div className="applicant" key={a.id}>
                      <a href={'profile.html?id=' + a.worker_id} aria-label="Worker profile">
                        <Avatar url={w?.avatar_url} name={w?.full_name} size={46} themeId={w?.theme} ring />
                      </a>
                      <div className="applicant-body">
                        <a className="applicant-name" href={'profile.html?id=' + a.worker_id}>
                          {w?.full_name || 'Worker'}
                          {w?.verified && <BadgeCheck size={14} />}
                        </a>{' '}
                        <StatusPill status={a.status} />
                        {blocked.has(a.worker_id) && (
                          <span className="pill declined">
                            <Ban size={12} />
                            Blocked
                          </span>
                        )}
                        {w?.headline && <small>{w.headline}</small>}
                        {w?.skills?.length ? <small>{w.skills.slice(0, 6).join(' · ')}</small> : null}
                        {a.message && <small>“{a.message}”</small>}
                        {['accepted', 'completed'].includes(a.status) && w?.phone && <small>Phone: {w.phone}</small>}
                        {a.payment && (
                          <small>
                            Pay: <PayState state={a.payment.state} /> {money(a.payment.amount_zar)}
                          </small>
                        )}
                        <div className="row-gap">
                          <a className="btn btn-outline btn-sm" href={'profile.html?id=' + a.worker_id}>
                            <Eye size={14} />
                            Profile
                          </a>
                          {w?.resume_path && (
                            <button className="btn btn-outline btn-sm" onClick={() => openCv(w.resume_path!)}>
                              <FileText size={14} />
                              CV
                            </button>
                          )}
                          {a.status === 'applied' && (
                            <>
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={busyId === a.id}
                                onClick={() => update(a.id, {status: 'accepted'})}
                              >
                                <Check size={14} />
                                Book
                              </button>
                              <button
                                className="btn btn-outline btn-sm"
                                disabled={busyId === a.id}
                                onClick={() => update(a.id, {status: 'declined'})}
                              >
                                Decline
                              </button>
                            </>
                          )}
                          {a.status === 'accepted' &&
                            s.payment_method === 'escrow' &&
                            (!a.payment || a.payment.state === 'awaiting_payment') && (
                              <button
                                className="btn btn-primary btn-sm"
                                disabled={busyId === a.id}
                                onClick={() =>
                                  act(a.id, async () => {
                                    const extra: Record<string, string> = {};
                                    if (!profile.payout_ready && !a.payment) {
                                      // First escrow payment: TradeSafe needs the payer's legal details once.
                                      const given = prompt('Your first name (as on your ID) for TradeSafe');
                                      const family = prompt('Your surname');
                                      const id = prompt('Your 13-digit SA ID number');
                                      const mobile = prompt('Your mobile number');
                                      if (!given || !family || !id || !mobile) return;
                                      Object.assign(extra, {
                                        givenName: given,
                                        familyName: family,
                                        idNumber: id,
                                        mobile,
                                      });
                                    }
                                    const r = await callFunction(sb, 'payments', {
                                      action: 'fund',
                                      applicationId: a.id,
                                      ...extra,
                                    });
                                    window.open(r.checkoutUrl, '_blank', 'noopener');
                                  })
                                }
                              >
                                <Wallet size={14} />
                                {a.payment
                                  ? 'Finish paying'
                                  : `Pay ${money(s.hourly_rate_zar * shiftHours)} into escrow`}
                              </button>
                            )}
                          {a.status === 'accepted' &&
                            Date.parse(s.starts_at) < Date.now() &&
                            a.hours_worked == null && (
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => {
                                  const h = prompt('Hours worked', String(shiftHours));
                                  if (h)
                                    update(a.id, {
                                      hours_worked: Number(h),
                                      business_confirmed_at: new Date().toISOString(),
                                    });
                                }}
                              >
                                <Clock size={14} />
                                Record hours
                              </button>
                            )}
                          {a.status === 'accepted' &&
                            Date.parse(s.starts_at) < Date.now() &&
                            a.hours_worked == null && (
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() =>
                                  confirm(
                                    `Mark ${w?.full_name || 'this worker'} as a no-show? It counts as a strike on their account and any escrow payment is refunded to you.`,
                                  ) && endBooking(a, 'no_show')
                                }
                              >
                                No-show
                              </button>
                            )}
                          {a.status === 'accepted' && Date.parse(s.starts_at) > Date.now() && (
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() =>
                                confirm(
                                  `Release ${w?.full_name || 'this worker'} from this shift? The spot opens again and any escrow payment is refunded to you. It doesn’t count against the worker.`,
                                ) && endBooking(a, 'declined')
                              }
                            >
                              Release worker
                            </button>
                          )}
                          {a.payment?.state === 'funded' && a.hours_worked != null && (
                            <button
                              className="btn btn-dark btn-sm"
                              disabled={busyId === a.id}
                              onClick={() =>
                                confirm(
                                  `Release ${money(a.payment!.amount_zar)} to ${w?.full_name || 'the worker'}?`,
                                ) &&
                                act(a.id, () =>
                                  callFunction(sb, 'payments', {action: 'release', paymentId: a.payment!.id}),
                                )
                              }
                            >
                              <Banknote size={14} />
                              Release pay
                            </button>
                          )}
                          {s.payment_method === 'cash' && a.status === 'accepted' && a.hours_worked != null && (
                            <button
                              className="btn btn-dark btn-sm"
                              onClick={() =>
                                act(a.id, () =>
                                  callFunction(sb, 'payments', {action: 'cash_paid', applicationId: a.id}),
                                )
                              }
                            >
                              <Banknote size={14} />
                              Mark paid in cash
                            </button>
                          )}
                          {a.payment?.state === 'funded' && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() =>
                                confirm('Report a problem? Our team will review and the money stays held.') &&
                                act(a.id, () =>
                                  callFunction(sb, 'payments', {action: 'dispute', paymentId: a.payment!.id}),
                                )
                              }
                            >
                              Report a problem
                            </button>
                          )}
                          {!blocked.has(a.worker_id) && (
                            <button
                              className="btn btn-ghost btn-sm danger"
                              disabled={busyId === a.id}
                              onClick={() => block(a, Date.parse(s.starts_at) > Date.now())}
                            >
                              <Ban size={14} />
                              Block
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          {!s.apps.some(a => ['accepted', 'completed', 'no_show'].includes(a.status) || a.payment) && (
            <button
              className="link danger"
              onClick={async () => {
                if (
                  !confirm(
                    'Delete this shift? It’s removed completely, including any cancelled bookings. This can’t be undone.',
                  )
                )
                  return;
                const {error} = await sb.from('shifts').delete().eq('id', s.id);
                if (error) alert(error.message);
                load();
              }}
            >
              <Trash2 size={14} />
              Delete shift
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

// ===================================================================== Shift board
type OpenShift = {
  id: string;
  title: string;
  description: string;
  category: string;
  city: string;
  province: string;
  starts_at: string;
  ends_at: string;
  hourly_rate_zar: number;
  workers_needed: number;
  booked: number;
  payment_method: string;
  business_id?: string;
  business_name: string;
  business_verified: boolean;
  business_avatar?: string | null;
  business_theme?: string | null;
  distance_km: number | null;
};

// The Shifts tab follows the account's mode: Hiring shows the business's own shifts, Working (and visitors) the shift board.
export function ShiftsPage() {
  const acct = useAccount();
  if (!acct.ready)
    return (
      <div className="page">
        <div className="job-list">
          {[0, 1, 2].map(i => (
            <div className="job-card skeleton" key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      </div>
    );
  if (acct.sb && acct.profile && !staffView(acct.staff, acct.profile) && modes(acct.profile).active === 'business')
    return <HiringShifts sb={acct.sb} profile={acct.profile} />;
  return <ShiftBoard />;
}

/** shifts.html in Hiring mode. */
function HiringShifts({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  return (
    <div className="page" style={themeStyle(profile.theme)}>
      <div className="page-head with-action">
        <div>
          <p className="overline">Hiring · {profile.business_name || 'your business'}</p>
          <h1>Your shifts</h1>
          <p className="lede">Workers you’ve booked, hours to confirm and pay to release.</p>
        </div>
        <a className="btn btn-primary themed" href="account.html?tab=post">
          <Plus size={18} />
          Post a shift
        </a>
      </div>
      <BusinessShifts sb={sb} profile={profile} />
      {!profile.work_banned && (
        <p className="muted small center-text">
          Looking for work yourself? Switch to <strong>Working</strong> on your{' '}
          <a className="link" href="account.html">
            account page
          </a>
          .
        </p>
      )}
    </div>
  );
}

/** shifts.html for workers: open shifts nearby, pick up in one tap. */
function ShiftBoard() {
  const acct = useAccount();
  const {location: area, choose} = useAreaLocation();
  const [radius, setRadius] = useState(30); // miles
  const [rows, setRows] = useState<OpenShift[] | null>(null),
    [err, setErr] = useState('');
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState<OpenShift | null>(null),
    [pickArea, setPickArea] = useState(false);
  const [busy, setBusy] = useState(false),
    [pickErr, setPickErr] = useState(''),
    [booked, setBooked] = useState<OpenShift | null>(null);
  const load = () => {
    if (!acct.ready || !acct.sb) return;
    acct.sb
      .rpc('open_shifts', {
        p_lat: area?.lat ?? null,
        p_lon: area?.lon ?? null,
        p_radius_km: area ? milesToKm(radius) : 2000,
        p_limit: 200,
      })
      .then(({data, error}) => {
        if (error) setErr(error.message);
        else setRows(data as OpenShift[]);
      });
    if (acct.session)
      acct.sb
        .from('applications')
        .select('shift_id')
        .eq('worker_id', acct.session.user.id)
        .eq('status', 'accepted')
        .then(({data}) => setMine(new Set((data || []).map(d => d.shift_id))));
  };
  useEffect(load, [acct.ready, acct.session?.user.id, area?.lat, area?.lon, radius]);
  const [grace, setGrace] = useState(10),
    [bookedAt, setBookedAt] = useState(0);
  useEffect(() => {
    acct.sb?.rpc('public_settings').then(({data}) => data && setGrace((data as any).cancel_grace_minutes ?? 10));
  }, [acct.sb]);

  if (acct.ready && !acct.sb) return <NotConfigured />;
  const m = acct.profile ? modes(acct.profile) : null;
  function tryPick(s: OpenShift) {
    track('shift_view', s.id);
    if (!acct.session) {
      location.href = 'account.html?signup=1&type=worker';
      return;
    }
    setPickErr('');
    setPicking(s);
  }
  async function pickUp(s: OpenShift, message: string | null) {
    setBusy(true);
    setPickErr('');
    const {error} = await acct
      .sb!.from('applications')
      .insert({shift_id: s.id, worker_id: acct.session!.user.id, message});
    setBusy(false);
    if (error)
      return setPickErr(
        error.message.includes('row-level security') ? 'You can’t pick up this shift right now.' : error.message,
      );
    track('shift_apply', s.id);
    setMine(x => new Set([...x, s.id]));
    setPicking(null);
    setBookedAt(Date.now());
    setBooked(s);
    load();
  }

  const ceo = staffView(acct.staff, acct.profile);
  const blocked = !acct.profile ? null : ceo ? (
    <Notice>
      <ShieldCheck size={15} /> {acct.staff === 'ceo' ? 'CEO' : 'Admin'} view: you’re seeing the shift board the way
      workers do. Picking up is off —{' '}
      <a className="link" href="account.html">
        switch to your own account
      </a>{' '}
      to work.
    </Notice>
  ) : acct.profile.suspended || acct.profile.work_paused ? (
    <Notice kind="error">
      {acct.profile.suspended ? 'Your account is paused' : 'Working is paused on your account'}, so you can’t pick up
      shifts.{' '}
      <a className="link" href="account.html">
        Send an appeal
      </a>
    </Notice>
  ) : m?.active === 'business' ? (
    <Notice>
      You’re in <strong>Hiring</strong> mode.{' '}
      <button
        className="link"
        onClick={async () => {
          await acct.sb!.from('profiles').update({active_mode: 'worker'}).eq('id', acct.profile!.id);
          acct.reload();
        }}
      >
        Switch to Working
      </button>{' '}
      to pick up shifts.
    </Notice>
  ) : null;

  return (
    <div className="page">
      <div className="page-head">
        <p className="overline">Paid shifts · in person</p>
        <h1>Shifts near you</h1>
        <p className="lede">
          Pick up a shift with a local business in one tap — no waiting to be chosen. Pay is set per hour and, for
          escrow shifts, secured before you start.
        </p>
      </div>
      <div className="tools-top shifts-tools">
        <button className="location-chip" onClick={() => setPickArea(true)}>
          <MapPin size={16} />
          <span>{area ? area.label : 'Set your area'}</span>
        </button>
        <div className="chip-wrap">
          {[5, 15, 30, 60].map(r => (
            <button key={r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>
              {r} miles
            </button>
          ))}
        </div>
      </div>
      {!acct.session && (
        <Notice>
          Create a free account to pick up shifts.{' '}
          <a className="link" href="account.html?signup=1&type=worker">
            Sign up
          </a>{' '}
          ·{' '}
          <a className="link" href="account.html">
            Sign in
          </a>
        </Notice>
      )}
      {blocked}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows ? (
        <div className="job-list">
          {[0, 1, 2].map(i => (
            <div className="job-card skeleton" key={i}>
              <span />
              <span />
              <span />
            </div>
          ))}
        </div>
      ) : !rows.length ? (
        <div className="empty">
          <div className="empty-icon">
            <CalendarDays size={28} />
          </div>
          <h2>No open shifts here yet</h2>
          <p>Try a bigger distance, or check back soon — businesses post new shifts every day.</p>
          <a className="btn btn-outline" href="find-work.html">
            Browse other jobs
          </a>
        </div>
      ) : (
        <div className="job-list">
          {rows.map(s => {
            const h = hoursBetween(s.starts_at, s.ends_at);
            const have = mine.has(s.id),
              left = s.workers_needed - s.booked;
            const own = acct.session && s.business_id === acct.session.user.id;
            return (
              <article className="job-card shift-card" key={s.id} style={themeStyle(s.business_theme)}>
                <div className="card-head">
                  <a
                    href={s.business_id ? 'profile.html?view=business&id=' + s.business_id : undefined}
                    aria-label={s.business_name + ' profile'}
                  >
                    <Avatar url={s.business_avatar} name={s.business_name} size={46} themeId={s.business_theme} ring />
                  </a>
                  <div className="card-title">
                    <h3>{s.title}</h3>
                    <p>
                      {s.business_name}
                      {s.business_verified && (
                        <>
                          {' '}
                          · <BadgeCheck size={13} /> Verified
                        </>
                      )}
                    </p>
                  </div>
                  <span className="spots">
                    {left} {left === 1 ? 'spot' : 'spots'} left
                  </span>
                </div>
                <div className="tags">
                  <span className="tag onsite">
                    <MapPin size={13} />
                    In person
                  </span>
                  <span className="tag">{s.category}</span>
                  <span className={'tag ' + (s.payment_method === 'escrow' ? 'local' : '')}>
                    {s.payment_method === 'escrow' ? (
                      <>
                        <ShieldCheck size={13} />
                        Pay secured
                      </>
                    ) : (
                      <>
                        <Banknote size={13} />
                        Cash
                      </>
                    )}
                  </span>
                </div>
                <p className="excerpt">{s.description}</p>
                <div className="meta">
                  <span>
                    <CalendarDays size={14} />
                    {day(s.starts_at)} · {time(s.starts_at)}–{time(s.ends_at)}
                  </span>
                  <span>
                    <MapPin size={14} />
                    {s.city}
                    {s.distance_km != null ? ` · ${milesLabel(s.distance_km)} away` : ''}
                  </span>
                </div>
                <div className="card-foot">
                  <div className="pay">
                    <strong>{money(s.hourly_rate_zar)} / hr</strong>
                    <small>
                      {money(s.hourly_rate_zar * h)} for {h} h
                    </small>
                  </div>
                  {have ? (
                    <span className="pill accepted">
                      <Check size={13} />
                      You’re booked
                    </span>
                  ) : own ? (
                    <span className="pill">Your shift</span>
                  ) : ceo ? (
                    <a className="btn btn-outline btn-sm" href={'profile.html?view=business&id=' + s.business_id}>
                      Business
                    </a>
                  ) : (
                    <button className="btn btn-primary btn-sm themed" onClick={() => tryPick(s)}>
                      <Zap size={15} />
                      Pick up
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {pickArea && (
        <Sheet title="Where do you want to work?" onClose={() => setPickArea(false)}>
          <LocationPicker
            onSelect={l => {
              choose(l);
              setPickArea(false);
            }}
          />
        </Sheet>
      )}
      {picking && acct.sb && acct.session && (
        <Sheet title="Pick up this shift?" onClose={() => setPicking(null)}>
          <form
            className="form"
            style={themeStyle(picking.business_theme)}
            onSubmit={e => {
              e.preventDefault();
              pickUp(picking, String(new FormData(e.currentTarget).get('message') || '').slice(0, 500) || null);
            }}
          >
            <div className="pick-summary" style={themeStyle(picking.business_theme)}>
              <Avatar
                url={picking.business_avatar}
                name={picking.business_name}
                size={52}
                themeId={picking.business_theme}
                ring
              />
              <div>
                <strong>{picking.title}</strong>
                <span>{picking.business_name}</span>
                <span>
                  {day(picking.starts_at)} · {time(picking.starts_at)}–{time(picking.ends_at)} · {picking.city}
                </span>
              </div>
              <b className="pick-pay">
                {money(picking.hourly_rate_zar * hoursBetween(picking.starts_at, picking.ends_at))}
              </b>
            </div>
            {blocked}
            <ul className="pick-rules">
              <li>
                <Check size={15} />
                You’re booked straight away — no waiting to be chosen.
              </li>
              <li>
                <Check size={15} />
                You’ll see the exact address and the business’s phone number.
              </li>
              <li>
                <Clock size={15} />
                Changed your mind? You can cancel free for {grace} minutes after picking it up — a timer shows how long
                is left.
              </li>
              <li>
                <AlertTriangle size={15} />
                After that, cancelling or not showing up is a strike. 3 strikes pauses your account.
              </li>
              {picking.payment_method === 'escrow' && !acct.profile?.payout_ready && (
                <li>
                  <Wallet size={15} />
                  Add your bank details under Get paid so you can be paid.
                </li>
              )}
            </ul>
            <label className="field">
              Note to the business (optional)
              <textarea name="message" rows={2} maxLength={500} placeholder="e.g. I’ll arrive 15 minutes early." />
            </label>
            {pickErr && <Notice kind="error">{pickErr}</Notice>}
            <button className="btn btn-primary btn-block btn-lg themed" disabled={busy || !!blocked}>
              {busy ? <LoaderCircle className="spin" size={18} /> : <Zap size={18} />}Pick up shift
            </button>
          </form>
        </Sheet>
      )}
      {booked && (
        <Sheet title="You’re booked!" onClose={() => setBooked(null)}>
          <div className="success">
            <span className="success-icon">
              <Check size={30} />
            </span>
            <h2>{booked.title}</h2>
            <p>
              {day(booked.starts_at)} · {time(booked.starts_at)}–{time(booked.ends_at)} with {booked.business_name}. The
              address is in My shifts.
            </p>
            <CancelTimer pickedUpAt={bookedAt} graceMinutes={grace} />
            <a className="btn btn-primary" href="account.html?tab=bookings">
              See my shifts
            </a>
            <button className="btn btn-outline" onClick={() => setBooked(null)}>
              Keep browsing
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

// ===================================================================== CEO / admin dashboard
// Two-step sign-in state for this session: 'verify' = authenticator is on and its code hasn't been entered yet.
function useTwoStep(sb: SupabaseClient | null, token?: string) {
  const [state, setState] = useState<{loading: boolean; verify: boolean; enrolled: boolean; required: boolean}>({
    loading: true,
    verify: false,
    enrolled: false,
    required: false,
  });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!sb || !token) {
      setState(s => ({...s, loading: false}));
      return;
    }
    Promise.all([sb.auth.mfa.getAuthenticatorAssuranceLevel(), sb.rpc('public_settings')]).then(
      ([{data}, {data: st}]) =>
        setState({
          loading: false,
          verify: data?.nextLevel === 'aal2' && data?.currentLevel !== 'aal2',
          enrolled: data?.nextLevel === 'aal2',
          required: !!(st as any)?.require_staff_mfa,
        }),
    );
  }, [sb, token, tick]);
  return {...state, refresh: () => setTick(t => t + 1)};
}

/** admin.html: checks the visitor is team and has passed two-step sign-in if needed. */
export function AdminPage() {
  const acct = useAccount();
  const two = useTwoStep(acct.sb, acct.session?.access_token);
  if (!acct.ready)
    return (
      <div className="page">
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      </div>
    );
  if (!acct.sb) return <NotConfigured />;
  if (!acct.session)
    return (
      <div className="page auth-page">
        <Notice>Sign in with your team account to open the dashboard.</Notice>
        <AuthForm sb={acct.sb} />
      </div>
    );
  if (!acct.staff)
    return (
      <div className="page">
        <div className="empty">
          <h2>Staff only</h2>
          <p>This area is for the Community Work team.</p>
          <a className="btn btn-primary" href="account.html">
            My account
          </a>
        </div>
      </div>
    );
  if (two.loading)
    return (
      <div className="page">
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      </div>
    );
  if (two.verify || (two.required && !two.enrolled))
    return (
      <div className="page reading">
        <TwoFactor
          sb={acct.sb}
          onDone={() => {
            two.refresh();
            acct.reload();
          }}
        />
      </div>
    );
  return (
    <AdminConsole
      sb={acct.sb}
      role={acct.staff}
      me={acct.session.user.id}
      viewOn={staffView(acct.staff, acct.profile)}
    />
  );
}

/** Set up or enter the authenticator code. */
function TwoFactor({sb, onDone, onCancel}: {sb: SupabaseClient; onDone: () => void; onCancel?: () => void}) {
  const [factorId, setFactorId] = useState(''),
    [qr, setQr] = useState(''),
    [secret, setSecret] = useState(''),
    [err, setErr] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.auth.mfa.listFactors().then(async ({data}) => {
      const verified = data?.totp?.find(f => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      for (const f of data?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({factorId: f.id});
      const {data: e, error} = await sb.auth.mfa.enroll({factorType: 'totp', friendlyName: 'Community Work'});
      if (error || !e) return setErr(error?.message || 'Could not start authenticator setup. Refresh and try again.');
      setFactorId(e.id);
      setQr(e.totp.qr_code);
      setSecret(e.totp.secret);
    });
  }, []);
  return (
    <section className="card-panel auth">
      <KeyRound size={26} />
      <h1>{qr ? 'Turn on two-step sign-in' : 'Enter your authenticator code'}</h1>
      {qr ? (
        <>
          <p className="muted">
            Scan this with Google Authenticator, Microsoft Authenticator or Authy. From now on you’ll enter a code from
            it when you sign in — even someone with your password can’t get in without your phone.
          </p>
          <img className="qr" src={qr} alt="Authenticator QR code" width={200} height={200} />
          <p className="muted small">
            Can’t scan? Enter this key: <code>{secret}</code>
          </p>
        </>
      ) : (
        <p className="muted">Open your authenticator app and enter the 6-digit code for Community Work.</p>
      )}
      <form
        className="form"
        onSubmit={async e => {
          e.preventDefault();
          setBusy(true);
          setErr('');
          const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
          const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code});
          setBusy(false);
          if (error) setErr('That code didn’t work. Check the time on your phone and try the newest code.');
          else onDone();
        }}
      >
        <label className="field">
          6-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            autoFocus
          />
        </label>
        {err && <Notice kind="error">{err}</Notice>}
        <button className="btn btn-primary btn-block" disabled={busy || !factorId}>
          {busy && <LoaderCircle className="spin" size={18} />}Verify
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost btn-block" onClick={onCancel}>
            {qr ? 'Not now' : 'Sign out'}
          </button>
        )}
      </form>
    </section>
  );
}

/** If one dashboard tab hits an error, show it with a retry button instead of a blank page. */
class TabGuard extends Component<{children: React.ReactNode}, {error: string}> {
  state = {error: ''};
  static getDerivedStateFromError(e: unknown) {
    return {error: errorText(e)};
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <Notice kind="error">
        This part of the dashboard couldn’t load: {this.state.error}{' '}
        <button className="link" onClick={() => this.setState({error: ''})}>
          Try again
        </button>
      </Notice>
    );
  }
}

/** CEO dashboard tabs: [key, label, icon]. */
const ADMIN_TABS: [string, string, React.ComponentType<{size?: number}>][] = [
  ['overview', 'Overview', LayoutDashboard],
  ['live', 'Live', Activity],
  ['users', 'People', Users],
  ['support', 'Support', SupportIcon],
  ['appeals', 'Appeals', Gavel],
  ['payments', 'Payments', Wallet],
  ['ads', 'Affiliate ads', Megaphone],
  ['team', 'Team', ShieldCheck],
  ['settings', 'Settings', Settings],
  ['audit', 'Activity log', FileText],
];

/** The CEO / admin dashboard. */
function AdminConsole({
  sb,
  role,
  me,
  viewOn,
}: {
  sb: SupabaseClient;
  role: 'ceo' | 'admin';
  me: string;
  viewOn: boolean;
}) {
  const [tab, setTabState] = useState(params.get('tab') || 'overview');
  const setTab = (t: string) => {
    setTabState(t);
    const u = new URL(location.href);
    u.searchParams.set('tab', t);
    history.replaceState(null, '', u);
  };
  const [leaving, setLeaving] = useState(false);
  // The CEO view is the default for team accounts. Switching it off opens their own working/hiring account instead.
  async function ownAccount() {
    setLeaving(true);
    const {error} = await sb.rpc('set_staff_view', {p_on: false});
    if (error) {
      setLeaving(false);
      return alert(
        error.message.includes('set_staff_view') ? 'Run the latest database update (update 10) first.' : error.message,
      );
    }
    location.href = 'account.html';
  }
  const tabs = ADMIN_TABS.filter(([k]) => k !== 'settings' || role === 'ceo');
  const {data: pending} = useRpc<any[]>(sb, 'admin_appeals', {p_status: 'pending'}, [tab]);
  const {data: waiting} = useRpc<any[]>(sb, 'admin_support_queue', {p_status: 'open'}, [tab], 60000);
  return (
    <div className="page wide dash admin-dash">
      <section className="dash-hero admin">
        <div className="dash-hero-bg">
          <span />
        </div>
        <div className="dash-hero-row">
          <span className="hq-badge">
            <ShieldCheck size={30} />
          </span>
          <div className="dash-id">
            <p className="dash-hello">
              {greeting()} · {role === 'ceo' ? 'CEO' : 'Admin'}
            </p>
            <h1>{role === 'ceo' ? 'CEO dashboard' : 'Admin dashboard'}</h1>
            <p className="dash-sub">
              <Lock size={13} /> Team only · every action is logged
            </p>
          </div>
          <div className="dash-actions inline">
            <a className="chip-link" href="https://analytics.google.com/" target="_blank" rel="noreferrer">
              <BarChart3 size={15} />
              Analytics
            </a>
            <a className="chip-link" href="https://www.tradesafe.co.za/" target="_blank" rel="noreferrer">
              <Wallet size={15} />
              TradeSafe
            </a>
          </div>
        </div>
        <div className="view-switch">
          <span className="vs-label">
            <ShieldCheck size={16} />
            <span>
              <b>
                {role === 'ceo' ? 'CEO' : 'Admin'} view is {viewOn ? 'on' : 'off'}
              </b>
              <small>
                {viewOn
                  ? 'You see the whole site as the team, not as a worker or business.'
                  : 'Your Account tab opens your own working/hiring account.'}
              </small>
            </span>
          </span>
          <div className="vs-buttons">
            {!viewOn && (
              <button
                className="chip-link strong"
                onClick={async () => {
                  const {error} = await sb.rpc('set_staff_view', {p_on: true});
                  if (error) alert(error.message);
                  else location.reload();
                }}
              >
                <ShieldCheck size={15} />
                Turn CEO view on
              </button>
            )}
            <button className="chip-link" onClick={ownAccount} disabled={leaving}>
              {leaving ? <LoaderCircle className="spin" size={15} /> : <UserRound size={15} />}Use my own account
            </button>
            <button
              className="chip-link"
              onClick={() => sb.auth.signOut().then(() => location.replace('account.html'))}
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      </section>
      <nav className="dash-tabs" role="tablist">
        {tabs.map(([k, l, Icon]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            onClick={() => setTab(k)}
          >
            <Icon size={17} />
            <span>{l}</span>
            {k === 'appeals' && !!pending?.length && <em className="badge">{pending.length}</em>}
            {k === 'support' && !!waiting?.length && <em className="badge">{waiting.length}</em>}
          </button>
        ))}
      </nav>
      <TabGuard key={tab}>
        <div className="dash-body">
          {tab === 'overview' && <Overview sb={sb} go={setTab} />}
          {tab === 'live' && <Live sb={sb} />}
          {tab === 'users' && <PeopleAdmin sb={sb} />}
          {tab === 'ads' && <AdsAdmin sb={sb} role={role} />}
          {tab === 'support' && <SupportAdmin sb={sb} />}
          {tab === 'appeals' && <AppealsAdmin sb={sb} />}
          {tab === 'payments' && <PaymentsAdmin sb={sb} />}
          {tab === 'team' && <TeamAdmin sb={sb} role={role} me={me} />}
          {tab === 'settings' && <SettingsAdmin sb={sb} />}
          {tab === 'audit' && <AuditAdmin sb={sb} />}
        </div>
      </TabGuard>
    </div>
  );
}

/** Calls a database function, optionally every few seconds. */
function useRpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>, deps: unknown[], every = 0) {
  const [data, setData] = useState<T | null>(null),
    [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    const run = () =>
      sb.rpc(fn, args).then(({data, error}) => {
        if (!alive) return;
        if (error) setErr(error.message);
        else {
          setErr('');
          setData(data as T);
        }
      });
    run();
    const t = every ? setInterval(run, every) : null;
    return () => {
      alive = false;
      if (t) clearInterval(t);
    };
  }, deps);
  return {data, err};
}

/** A number with South African digit grouping. */
const n = (v: number | undefined) => (v ?? 0).toLocaleString('en-ZA');

/** CEO dashboard → Overview. */
function Overview({sb, go}: {sb: SupabaseClient; go: (t: string) => void}) {
  const [days, setDays] = useState(30);
  const {data: s, err} = useRpc<any>(sb, 'admin_stats', {p_days: days}, [days]);
  // Ad events are stored by ad id; show the ad's partner and headline instead.
  const [adNames, setAdNames] = useState<Record<string, string>>({});
  useEffect(() => {
    sb.from('promos')
      .select('id, partner, title')
      .then(({data}) =>
        setAdNames(Object.fromEntries((data || []).map((p: any) => [p.id, `${p.partner} · ${p.title}`]))),
      );
  }, []);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!s)
    return (
      <div className="card-panel center">
        <span className="spinner" />
      </div>
    );
  const max = Math.max(1, ...s.daily.map((d: any) => d.views));
  return (
    <div className="stack">
      <div className="chip-wrap">
        {[1, 7, 30, 90].map(d => (
          <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>
            {d === 1 ? 'Today' : `${d} days`}
          </button>
        ))}
      </div>
      {!!s.reliability?.appeals_pending && (
        <section className="card-panel nudge warn">
          <span className="nudge-icon">
            <Gavel size={22} />
          </span>
          <div className="nudge-body">
            <h3>
              {s.reliability.appeals_pending} appeal{s.reliability.appeals_pending > 1 ? 's' : ''} waiting
            </h3>
            <p className="muted">Suspended workers are waiting for a decision.</p>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => go('appeals')}>
            Review
          </button>
        </section>
      )}
      <p className="overline">Traffic</p>
      <div className="stat-grid">
        <StatTile
          icon={Users}
          tone="theme"
          label="Visitors"
          value={n(s.traffic.visitors)}
          sub={`${n(s.traffic.page_views)} page views`}
        />
        <StatTile icon={MousePointerClick} tone="blue" label="Job apply clicks" value={n(s.traffic.apply_clicks)} />
        <StatTile
          icon={TrendingUp}
          tone="amber"
          label="Affiliate ad clicks"
          value={n(s.traffic.sponsored_clicks)}
          sub={`${n(s.traffic.sponsored_views)} views · ${s.traffic.sponsored_views ? ((s.traffic.sponsored_clicks / s.traffic.sponsored_views) * 100).toFixed(1) : '0'}% click rate`}
        />
        <StatTile
          icon={UserRound}
          tone="green"
          label="New sign-ups"
          value={n(s.users.new)}
          sub={`${n(s.users.total)} accounts in total`}
        />
      </div>
      <p className="overline">Marketplace</p>
      <div className="stat-grid">
        <StatTile
          icon={Briefcase}
          tone="theme"
          label="Shifts posted"
          value={n(s.shifts.posted)}
          sub={`${n(s.shifts.open)} open · ${n(s.shifts.filled)} full · ${n(s.shifts.completed)} done`}
        />
        <StatTile icon={Zap} tone="blue" label="Shifts picked up" value={n(s.applications)} />
        <StatTile
          icon={ShieldCheck}
          tone="green"
          label="Held in escrow"
          value={money(s.payments.held_zar)}
          sub={`${n(s.payments.awaiting)} awaiting · ${n(s.payments.disputed)} disputed`}
        />
        <StatTile
          icon={Banknote}
          tone="green"
          label="Paid to workers"
          value={money(s.payments.released_zar)}
          sub={`${money(s.payments.fees_zar)} earned in fees`}
        />
      </div>
      {s.reliability && (
        <>
          <p className="overline">Reliability</p>
          <div className="stat-grid">
            <StatTile
              icon={Ban}
              tone="red"
              label="Cancellations"
              value={n(s.reliability.cancellations)}
              sub="strikes in this period"
            />
            <StatTile icon={AlertTriangle} tone="amber" label="No-shows" value={n(s.reliability.no_shows)} />
            <StatTile icon={Lock} tone="red" label="Suspended now" value={n(s.reliability.suspended)} />
            <StatTile icon={Gavel} tone="blue" label="Appeals waiting" value={n(s.reliability.appeals_pending)} />
          </div>
        </>
      )}
      <section className="card-panel">
        <h3>Visitors per day</h3>
        <div className="bars" role="img" aria-label="Daily page views">
          {s.daily.map((d: any) => (
            <div
              key={d.day}
              className="bar"
              title={`${d.day}: ${d.views} views, ${d.visitors} visitors, ${d.clicks} clicks`}
            >
              <i style={{height: `${(d.views / max) * 100}%`}} />
              <small>{String(d.day).slice(5)}</small>
            </div>
          ))}
          {!s.daily.length && <p className="muted">No visits recorded yet.</p>}
        </div>
      </section>
      <div className="split even">
        <Table
          title="Top pages"
          rows={s.top_pages}
          cols={[
            ['path', 'Page'],
            ['views', 'Views'],
          ]}
        />
        <Table
          title="Affiliate ads"
          rows={(s.top_sponsored || []).map((r: any) => ({...r, target: adNames[r.target] || r.target}))}
          cols={[
            ['target', 'Ad'],
            ['views', 'Views'],
            ['clicks', 'Clicks'],
          ]}
        />
      </div>
      <Table
        title="Most-clicked jobs"
        rows={s.top_jobs}
        cols={[
          ['target', 'Job'],
          ['clicks', 'Apply clicks'],
        ]}
      />
    </div>
  );
}

/** A titled table (cards on phones). */
function Table({title, rows, cols}: {title: string; rows: any[]; cols: [string, string][]}) {
  return (
    <section className="card-panel table-wrap">
      <h3>{title}</h3>
      {!rows?.length ? (
        <p className="muted">Nothing yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              {cols.map(([, l]) => (
                <th key={l}>{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {cols.map(([k, l]) => (
                  <td key={k} data-label={l}>
                    {typeof r[k] === 'number' ? n(r[k]) : String(r[k] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** CEO dashboard → Live. */
function Live({sb}: {sb: SupabaseClient}) {
  return <LiveFeed sb={sb} />;
}

/** CEO dashboard → Payments: release or refund escrow. */
function PaymentsAdmin({sb}: {sb: SupabaseClient}) {
  const [filter, setFilter] = useState('funded'),
    [rows, setRows] = useState<any[] | null>(null),
    [busy, setBusy] = useState('');
  const load = () => {
    let q = sb
      .from('payments')
      .select('*, shift:shifts(title, city, starts_at)')
      .order('created_at', {ascending: false})
      .limit(200);
    if (filter !== 'all') q = q.eq('state', filter);
    q.then(({data}) => setRows(data || []));
  };
  useEffect(load, [filter]);
  const act = async (id: string, action: string, ask: string) => {
    if (!confirm(ask)) return;
    setBusy(id);
    try {
      await callFunction(sb, 'payments', {action, paymentId: id});
    } catch (e) {
      alert(errorText(e));
    }
    setBusy('');
    load();
  };
  return (
    <div className="stack">
      <div className="chip-wrap">
        {[
          ['funded', 'Held in escrow'],
          ['disputed', 'Disputed'],
          ['awaiting_payment', 'Awaiting payment'],
          ['released', 'Paid out'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <Notice>
        Money is held by TradeSafe, not in this system. Releasing sends it to the worker’s bank account; cancelling
        refunds the business. Every action is logged with your name.
      </Notice>
      {!rows ? (
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      ) : !rows.length ? (
        <p className="muted">No payments here.</p>
      ) : (
        <section className="card-panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Shift</th>
                <th>Amount</th>
                <th>Hours</th>
                <th>State</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td data-label="Shift">
                    <strong>{p.shift?.title}</strong>
                    <br />
                    <small>
                      {p.shift?.city} · {p.shift?.starts_at ? day(p.shift.starts_at) : ''}
                    </small>
                  </td>
                  <td data-label="Amount">
                    {money(p.amount_zar)}
                    <br />
                    <small>fee {money(p.fee_zar)}</small>
                  </td>
                  <td data-label="Hours">{p.hours}</td>
                  <td data-label="State">
                    <PayState state={p.state} />
                    {p.provider_state && (
                      <>
                        <br />
                        <small>{p.provider_state}</small>
                      </>
                    )}
                  </td>
                  <td className="row-gap">
                    {['funded', 'disputed'].includes(p.state) && (
                      <button
                        className="btn btn-dark btn-sm"
                        disabled={busy === p.id}
                        onClick={() => act(p.id, 'release', `Release ${money(p.amount_zar)} to the worker?`)}
                      >
                        Release
                      </button>
                    )}
                    {['awaiting_payment', 'funded', 'disputed'].includes(p.state) && (
                      <button
                        className="btn btn-outline btn-sm"
                        disabled={busy === p.id}
                        onClick={() => act(p.id, 'cancel', 'Cancel and refund the business?')}
                      >
                        Refund
                      </button>
                    )}
                    {p.provider === 'tradesafe' && (
                      <button
                        className="icon-btn"
                        aria-label="Refresh from TradeSafe"
                        onClick={() => act(p.id, 'refresh', 'Re-check this payment with TradeSafe?')}
                      >
                        <RefreshCw size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/** CEO dashboard → Team: add and remove admins. */
function TeamAdmin({sb, role, me}: {sb: SupabaseClient; role: 'ceo' | 'admin'; me: string}) {
  const [rows, setRows] = useState<any[] | null>(null),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const load = () => sb.rpc('admin_list_staff').then(({data}) => setRows(data || []));
  useEffect(() => {
    load();
  }, []);
  return (
    <div className="stack">
      {role === 'ceo' && (
        <form
          className="card-panel form"
          onSubmit={async e => {
            e.preventDefault();
            const email = String(new FormData(e.currentTarget).get('email'));
            const {error} = await sb.rpc('admin_add', {p_email: email});
            setMsg(
              error
                ? {kind: 'error', text: error.message}
                : {
                    kind: 'ok',
                    text: `${email} is now an admin. They’ll set up an authenticator the first time they open the dashboard.`,
                  },
            );
            if (!error) {
              (e.target as HTMLFormElement).reset();
              load();
            }
          }}
        >
          <h3>Add an admin</h3>
          <p className="muted">
            They need a confirmed Community Work account first. Admins can see the dashboard, verify or suspend users
            and release or refund escrow. Only you can add or remove admins and change settings.
          </p>
          <div className="search-box">
            <input name="email" type="email" required placeholder="their@email.com" />
            <button className="btn btn-primary btn-sm">Add admin</button>
          </div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      )}
      <section className="card-panel table-wrap">
        <h3>Team</h3>
        {!rows ? (
          <span className="spinner" />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Since</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.user_id}>
                  <td data-label="Email">
                    {r.email}
                    {r.user_id === me && ' (you)'}
                  </td>
                  <td data-label="Role">{r.role === 'ceo' ? 'CEO' : 'Admin'}</td>
                  <td data-label="Since">{new Date(r.added_at).toLocaleDateString('en-ZA')}</td>
                  <td>
                    {role === 'ceo' && r.role !== 'ceo' && (
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={async () => {
                          if (confirm(`Remove ${r.email} as admin?`)) {
                            const {error} = await sb.rpc('admin_remove', {p_user: r.user_id});
                            if (error) alert(error.message);
                            load();
                          }
                        }}
                      >
                        Remove
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

/** CEO dashboard → Settings (CEO only). */
function SettingsAdmin({sb}: {sb: SupabaseClient}) {
  const [s, setS] = useState<any>(null),
    [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  useEffect(() => {
    sb.rpc('public_settings').then(({data}) => setS(data));
  }, []);
  if (!s) return <span className="spinner" />;
  return (
    <form
      className="card-panel form narrow section-card"
      onSubmit={async e => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const {error} = await sb.rpc('admin_set_settings', {
          p_min_hourly: Number(f.get('min')),
          p_fee_percent: Number(f.get('fee')),
          p_strike_limit: Number(f.get('strikes')),
          p_cancel_grace: Number(f.get('grace')),
          p_require_mfa: f.get('mfa') === 'on',
        });
        setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'Saved.'});
      }}
    >
      <header className="sec-head">
        <Settings size={18} />
        <div>
          <h2>Platform settings</h2>
          <p>Only the CEO can change these. Every change is logged.</p>
        </div>
      </header>
      <div className="grid-2">
        <label className="field">
          Minimum hourly pay (R)
          <input name="min" type="number" step="0.01" min={0} defaultValue={s.min_hourly_zar} />
          <small>National minimum wage: R30.23/hour from 1 March 2026. Update each March.</small>
        </label>
        <label className="field">
          Service fee to businesses (%)
          <input name="fee" type="number" step="0.5" min={0} max={30} defaultValue={s.platform_fee_percent} />
        </label>
      </div>
      <div className="grid-2">
        <label className="field">
          Strikes before suspension
          <input name="strikes" type="number" min={1} max={10} defaultValue={s.strike_limit ?? 3} />
          <small>Cancellations and no-shows. The count restarts after each approved appeal.</small>
        </label>
        <label className="field">
          Free cancel window (minutes)
          <input name="grace" type="number" min={0} max={120} defaultValue={s.cancel_grace_minutes ?? 10} />
          <small>Cancelling this soon after picking up isn’t a strike. 0 turns it off.</small>
        </label>
      </div>
      <label className="check">
        <input type="checkbox" name="mfa" defaultChecked={!!s.require_staff_mfa} />
        <span>
          <strong>Require two-step sign-in for all staff.</strong> Off by default: each person chooses in their account
          settings. Switch on your own first.
        </span>
      </label>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button className="btn btn-primary">Save settings</button>
      <CleanupCard sb={sb} />
    </form>
  );
}

/** Run the database clean-up now. */
function CleanupCard({sb}: {sb: SupabaseClient}) {
  const [busy, setBusy] = useState(false),
    [res, setRes] = useState('');
  return (
    <div className="inline-form">
      <strong>Database clean-up</strong>
      <p className="muted small">
        Runs automatically every night. Removes shifts that ended over a week ago with nobody booked, old cancelled
        bookings, visitor tracking older than 13 months and decided appeals older than a year. Worked and paid shifts
        are always kept.
      </p>
      <div className="row-gap start">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const {data, error} = await sb.rpc('admin_cleanup');
            setBusy(false);
            setRes(
              error
                ? error.message
                : `Removed ${(data as any).shifts} shifts, ${(data as any).bookings} bookings, ${(data as any).events} tracking records, ${(data as any).appeals} appeals.`,
            );
          }}
        >
          {busy ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}Run clean-up now
        </button>
      </div>
      {res && <p className="small">{res}</p>}
    </div>
  );
}

/** CEO dashboard → Appeals. */
function AppealsAdmin({sb}: {sb: SupabaseClient}) {
  const [status, setStatus] = useState('pending'),
    [rows, setRows] = useState<any[] | null>(null),
    [busy, setBusy] = useState('');
  const load = () =>
    sb.rpc('admin_appeals', {p_status: status}).then(({data, error}) => {
      if (error) alert(error.message);
      setRows(data || []);
    });
  useEffect(() => {
    setRows(null);
    load();
  }, [status]);
  const decide = async (id: string, approve: boolean, form: HTMLFormElement) => {
    const response = String(new FormData(form).get('response') || '').trim() || null;
    setBusy(id);
    const {error} = await sb.rpc('admin_review_appeal', {p_appeal: id, p_approve: approve, p_response: response});
    setBusy('');
    if (error) alert(error.message);
    else load();
  };
  return (
    <div className="stack">
      <div className="chip-wrap">
        {[
          ['pending', 'Waiting'],
          ['approved', 'Approved'],
          ['denied', 'Denied'],
          ['all', 'All'],
        ].map(([k, l]) => (
          <button key={k} className={status === k ? 'on' : ''} onClick={() => setStatus(k)}>
            {l}
          </button>
        ))}
      </div>
      {!rows ? (
        <div className="card-panel center">
          <span className="spinner" />
        </div>
      ) : !rows.length ? (
        <div className="empty small">
          <div className="empty-icon">
            <Gavel size={26} />
          </div>
          <h3>No appeals here</h3>
          <p>Suspended workers can appeal from their account page.</p>
        </div>
      ) : (
        rows.map(a => (
          <form className="card-panel appeal" key={a.id} onSubmit={e => e.preventDefault()}>
            <div className="booking-top">
              <div>
                <h3>
                  <a className="link" href={'profile.html?id=' + a.user_id}>
                    {a.full_name || a.email}
                  </a>
                </h3>
                <p className="muted small">
                  {a.email} · {new Date(a.created_at).toLocaleString('en-ZA', {timeZone: tz})} · {a.total_strikes}{' '}
                  strikes all-time
                </p>
              </div>
              <span
                className={
                  'pill ' + (a.status === 'pending' ? 'applied' : a.status === 'approved' ? 'accepted' : 'declined')
                }
              >
                {a.status === 'pending' ? 'Waiting' : a.status}
              </span>
            </div>
            {a.suspended_reason && (
              <p className="meta-line">
                <Ban size={15} />
                {a.suspended_reason}
              </p>
            )}
            <blockquote className="appeal-text">{a.reason}</blockquote>
            {a.status === 'pending' ? (
              <>
                <label className="field">
                  Reply to the worker (optional)
                  <input
                    name="response"
                    maxLength={1000}
                    placeholder="e.g. Approved — please give notice if you can’t make a shift."
                  />
                </label>
                <div className="row-gap start">
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={busy === a.id}
                    onClick={e => decide(a.id, true, (e.target as HTMLElement).closest('form')!)}
                  >
                    <Check size={15} />
                    Approve and restore
                  </button>
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={busy === a.id}
                    onClick={e => decide(a.id, false, (e.target as HTMLElement).closest('form')!)}
                  >
                    <X size={15} />
                    Deny
                  </button>
                </div>
              </>
            ) : (
              a.response && <p className="muted small">Reply: {a.response}</p>
            )}
          </form>
        ))
      )}
    </div>
  );
}

/** CEO dashboard → Activity log. */
function AuditAdmin({sb}: {sb: SupabaseClient}) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => {
    sb.from('audit_log')
      .select('*')
      .order('at', {ascending: false})
      .limit(200)
      .then(({data}) => setRows(data || []));
  }, []);
  if (!rows) return <span className="spinner" />;
  return (
    <Table
      title="Activity log (who did what)"
      rows={rows.map(r => ({
        ...r,
        at: new Date(r.at).toLocaleString('en-ZA', {timeZone: tz}),
        details: JSON.stringify(r.details),
      }))}
      cols={[
        ['at', 'When'],
        ['action', 'Action'],
        ['target', 'Target'],
        ['actor', 'By'],
        ['details', 'Details'],
      ]}
    />
  );
}

// ===================================================================== analytics consent banner
export function ConsentBanner({show, onChoose}: {show: boolean; onChoose: (v: 'granted' | 'denied') => void}) {
  if (!show) return null;
  return (
    <div className="consent" role="dialog" aria-label="Cookies">
      <p>
        We use Google Analytics cookies to understand how people use Community Work. You can say no and everything still
        works.
      </p>
      <div className="row-gap">
        <button className="btn btn-outline btn-sm" onClick={() => onChoose('denied')}>
          No thanks
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => onChoose('granted')}>
          Accept
        </button>
      </div>
    </div>
  );
}
