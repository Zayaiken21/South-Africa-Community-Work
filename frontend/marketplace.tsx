import {useEffect, useMemo, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  UserRound, Building2, LogOut, LoaderCircle, Check, X, Plus, MapPin, Clock, ShieldCheck, FileUp, FileText, Trash2, Wallet,
  CalendarDays, Users, BadgeCheck, Search, BarChart3, Activity, KeyRound, ArrowUpRight, Banknote, Lock, RefreshCw, Briefcase, Eye,
} from 'lucide-react';
import {useAccount, callFunction, errorText, type Profile} from './backend';
import {track} from './analytics';
import {LocationPicker, Sheet, useAreaLocation} from './JobsView';
import {browseCategories, money, type Location} from './catalog';

const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
const params = new URLSearchParams(location.search);
const tz = 'Africa/Johannesburg';
const day = (v: string) => new Date(v).toLocaleDateString('en-ZA', {timeZone: tz, weekday: 'short', day: 'numeric', month: 'short'});
const time = (v: string) => new Date(v).toLocaleTimeString('en-ZA', {timeZone: tz, hour: '2-digit', minute: '2-digit'});
const hoursBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 36e5 * 100) / 100;

function Notice({kind = 'info', children}: {kind?: 'info' | 'error' | 'ok'; children: React.ReactNode}) {
  return <p className={kind === 'error' ? 'alert' : kind === 'ok' ? 'alert ok' : 'hint-box'} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

function NotConfigured() {
  return (
    <div className="page"><div className="empty">
      <div className="empty-icon"><Lock size={28}/></div>
      <h2>Accounts are almost ready</h2>
      <p>Sign-in will open as soon as the Community Work backend is switched on. Until then you can still browse jobs and build your CV.</p>
      <a className="btn btn-primary" href="find-work.html">Browse jobs</a>
    </div></div>
  );
}

// ===================================================================== Account page
export function AccountPage() {
  const acct = useAccount();
  if (!acct.ready) return <div className="page"><div className="card-panel center"><span className="spinner"/>Loading…</div></div>;
  if (!acct.sb) return <NotConfigured/>;
  if (acct.recovery) return <div className="page reading"><NewPassword sb={acct.sb}/></div>;
  if (!acct.session || !acct.profile) return <div className="page reading"><AuthForm sb={acct.sb}/></div>;
  return <Dashboard sb={acct.sb} profile={acct.profile} email={acct.session.user.email || ''} staff={acct.staff} reload={acct.reload}/>;
}

function AuthForm({sb}: {sb: SupabaseClient}) {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>(params.get('signup') ? 'up' : 'in');
  const [type, setType] = useState<'worker' | 'business'>(params.get('type') === 'business' ? 'business' : 'worker');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const redirect = location.origin + location.pathname.replace(/[^/]*$/, '') + 'account.html';

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true); setMsg(null);
    try {
      if (mode === 'in') {
        const {error} = await sb.auth.signInWithPassword({email: f.email.trim(), password: f.password});
        if (error) throw error;
        track('sign_in');
      } else if (mode === 'up') {
        if (f.password.length < 10) throw new Error('Use at least 10 characters for your password.');
        const {error} = await sb.auth.signUp({email: f.email.trim(), password: f.password, options: {
          emailRedirectTo: redirect, data: {account_type: type, full_name: f.full_name?.trim(), business_name: f.business_name?.trim()}}});
        if (error) throw error;
        track('sign_up', type);
        setMsg({kind: 'ok', text: 'Check your email and tap the link to confirm your account, then sign in.'});
      } else {
        const {error} = await sb.auth.resetPasswordForEmail(f.email.trim(), {redirectTo: redirect});
        if (error) throw error;
        setMsg({kind: 'ok', text: 'If that email has an account, we’ve sent a link to reset your password.'});
      }
    } catch (err) { setMsg({kind: 'error', text: errorText(err)}); }
    finally { setBusy(false); }
  }

  return (
    <section className="card-panel auth">
      <div className="page-head">
        <p className="overline">{mode === 'up' ? 'Create your account' : mode === 'in' ? 'Welcome back' : 'Reset password'}</p>
        <h1>{mode === 'up' ? (type === 'business' ? 'Hire people for shifts' : 'Find shifts near you') : mode === 'in' ? 'Sign in' : 'Forgot your password?'}</h1>
      </div>
      {mode !== 'reset' && (
        <div className="segmented two" role="tablist">
          <button role="tab" aria-selected={mode === 'in'} className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Sign in</button>
          <button role="tab" aria-selected={mode === 'up'} className={mode === 'up' ? 'on' : ''} onClick={() => setMode('up')}>Create account</button>
        </div>
      )}
      <form className="form" onSubmit={submit}>
        {mode === 'up' && (
          <>
            <fieldset><legend>I want to</legend>
              <div className="choice-row">
                <button type="button" className={'choice' + (type === 'worker' ? ' on' : '')} onClick={() => setType('worker')}><UserRound size={20}/><strong>Find work</strong><small>Pick up paid shifts</small></button>
                <button type="button" className={'choice' + (type === 'business' ? ' on' : '')} onClick={() => setType('business')}><Building2 size={20}/><strong>Hire workers</strong><small>Post shifts for my business</small></button>
              </div>
            </fieldset>
            <label className="field">Your full name<input name="full_name" required minLength={2} maxLength={120} autoComplete="name"/></label>
            {type === 'business' && <label className="field">Business name<input name="business_name" required minLength={2} maxLength={120} autoComplete="organization"/></label>}
          </>
        )}
        <label className="field">Email<input name="email" type="email" required autoComplete="email"/></label>
        {mode !== 'reset' && <label className="field">Password<input name="password" type="password" required minLength={mode === 'up' ? 10 : 1} autoComplete={mode === 'up' ? 'new-password' : 'current-password'}/>{mode === 'up' && <small>At least 10 characters.</small>}</label>}
        {mode === 'up' && <label className="check"><input type="checkbox" required/><span>I agree to the <a className="link" href="terms.html">terms</a> and <a className="link" href="privacy.html">privacy policy</a>.</span></label>}
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy}>{busy && <LoaderCircle className="spin" size={18}/>}{mode === 'up' ? 'Create account' : mode === 'in' ? 'Sign in' : 'Send reset link'}</button>
        <button type="button" className="link center-link" onClick={() => setMode(mode === 'reset' ? 'in' : 'reset')}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</button>
      </form>
    </section>
  );
}

function NewPassword({sb}: {sb: SupabaseClient}) {
  const [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  return (
    <section className="card-panel auth">
      <h1>Choose a new password</h1>
      <form className="form" onSubmit={async e => {
        e.preventDefault();
        const pw = String(new FormData(e.currentTarget).get('password'));
        const {error} = await sb.auth.updateUser({password: pw});
        setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'Password updated. You’re signed in.'});
        if (!error) setTimeout(() => location.replace('account.html'), 1200);
      }}>
        <label className="field">New password<input name="password" type="password" required minLength={10} autoComplete="new-password"/></label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn btn-primary btn-block">Save password</button>
      </form>
    </section>
  );
}

function Dashboard({sb, profile, email, staff, reload}: {sb: SupabaseClient; profile: Profile; email: string; staff: 'ceo' | 'admin' | null; reload: () => void}) {
  const business = profile.account_type === 'business';
  const tabs = business
    ? [['shifts', 'My shifts'], ['post', 'Post a shift'], ['profile', 'Business profile']] as const
    : [['profile', 'Profile'], ['bookings', 'My shifts'], ['payouts', 'Get paid']] as const;
  const [tab, setTab] = useState<string>(params.get('tab') || tabs[0][0]);
  return (
    <div className="page">
      <div className="account-head">
        <span className={'avatar big ' + (business ? 'onsite' : '')}>{(profile.business_name || profile.full_name || email).slice(0, 2).toUpperCase()}</span>
        <div>
          <h1>{business ? profile.business_name || profile.full_name : profile.full_name || 'Your account'}</h1>
          <p className="muted">{email} · {business ? 'Business' : 'Worker'}{profile.verified && <> · <BadgeCheck size={14}/> Verified</>}</p>
        </div>
        <div className="row-gap end">
          {staff && <a className="btn btn-dark btn-sm" href="admin.html"><ShieldCheck size={16}/>{staff === 'ceo' ? 'CEO dashboard' : 'Admin'}</a>}
          <button className="btn btn-outline btn-sm" onClick={() => sb.auth.signOut().then(reload)}><LogOut size={16}/>Sign out</button>
        </div>
      </div>
      {profile.suspended && <Notice kind="error">This account is suspended. Contact support if you think this is a mistake.</Notice>}
      <div className="segmented tabs" role="tablist">
        {tabs.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>)}
      </div>
      {tab === 'profile' && <ProfileEditor sb={sb} profile={profile} onSaved={reload}/>}
      {tab === 'bookings' && <WorkerBookings sb={sb} profile={profile}/>}
      {tab === 'payouts' && <Payouts sb={sb} profile={profile} onSaved={reload}/>}
      {tab === 'post' && <PostShift sb={sb} profile={profile} onPosted={() => setTab('shifts')}/>}
      {tab === 'shifts' && <BusinessShifts sb={sb} profile={profile}/>}
    </div>
  );
}

// ---------------------------------------------------------------- profile + CV
const SKILL_IDEAS = ['Customer service', 'Cash handling', 'Cooking', 'Cleaning', 'Driving (Code 10)', 'Forklift', 'Security (PSIRA)', 'Sales', 'Admin', 'Excel', 'First aid', 'Waitering', 'Barista', 'Stock control', 'Childcare', 'Gardening', 'Painting', 'Construction'];

function ProfileEditor({sb, profile, onSaved}: {sb: SupabaseClient; profile: Profile; onSaved: () => void}) {
  const [p, setP] = useState(profile);
  const [skill, setSkill] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const [uploading, setUploading] = useState(false);
  const business = p.account_type === 'business';
  const set = (k: keyof Profile, v: any) => setP(x => ({...x, [k]: v}));
  const addSkill = (s: string) => { const v = s.trim().slice(0, 40); if (v && !p.skills.includes(v) && p.skills.length < 30) set('skills', [...p.skills, v]); setSkill(''); };

  async function save(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const {error} = await sb.from('profiles').update({
      full_name: p.full_name, headline: p.headline, bio: p.bio, skills: p.skills, phone: p.phone, city: p.city, province: p.province || null,
      lat: p.lat, lon: p.lon, business_name: p.business_name, business_reg: p.business_reg,
    }).eq('id', p.id);
    setBusy(false);
    setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'Saved.'});
    if (!error) onSaved();
  }

  async function upload(file: File) {
    setMsg(null);
    if (file.size > 5 * 1024 * 1024) return setMsg({kind: 'error', text: 'CV files can be up to 5 MB.'});
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    if (!['pdf', 'doc', 'docx'].includes(ext)) return setMsg({kind: 'error', text: 'Upload a PDF or Word document.'});
    setUploading(true);
    const path = `${p.id}/cv-${Date.now()}.${ext}`;
    const {error} = await sb.storage.from('resumes').upload(path, file, {contentType: file.type || undefined, upsert: false});
    if (!error) {
      if (p.resume_path) await sb.storage.from('resumes').remove([p.resume_path]);
      await sb.from('profiles').update({resume_path: path}).eq('id', p.id);
      set('resume_path', path);
    }
    setUploading(false);
    setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: 'CV saved to your account.'});
  }
  async function viewCv() {
    if (!p.resume_path) return;
    const {data} = await sb.storage.from('resumes').createSignedUrl(p.resume_path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  }
  async function removeCv() {
    if (!p.resume_path) return;
    await sb.storage.from('resumes').remove([p.resume_path]);
    await sb.from('profiles').update({resume_path: null}).eq('id', p.id);
    set('resume_path', null);
  }

  return (
    <form className="split" onSubmit={save}>
      <section className="card-panel form">
        <h2 className="form-step">{business ? 'About your business' : 'About you'}</h2>
        {business && <label className="field">Business name<input value={p.business_name || ''} onChange={e => set('business_name', e.target.value)} maxLength={120} required/></label>}
        {business && <label className="field">Company registration number (optional)<input value={p.business_reg || ''} onChange={e => set('business_reg', e.target.value)} maxLength={40}/></label>}
        <label className="field">{business ? 'Contact person' : 'Full name'}<input value={p.full_name || ''} onChange={e => set('full_name', e.target.value)} maxLength={120} required/></label>
        {!business && <label className="field">Headline<input value={p.headline || ''} onChange={e => set('headline', e.target.value)} maxLength={120} placeholder="e.g. Reliable waiter with 3 years’ experience"/></label>}
        <label className="field">{business ? 'What you do' : 'Short description of who you are'}
          <textarea rows={5} value={p.bio || ''} onChange={e => set('bio', e.target.value)} maxLength={1000} placeholder={business ? 'Tell workers about your business and what a shift is like.' : 'Your experience, what you’re good at, when you can work.'}/>
          <small>{(p.bio || '').length}/1000</small>
        </label>
        <div className="grid-2">
          <label className="field">Phone / WhatsApp<input value={p.phone || ''} onChange={e => set('phone', e.target.value)} maxLength={30} inputMode="tel" placeholder="082 123 4567"/></label>
          <label className="field">City or town<input value={p.city || ''} onChange={e => set('city', e.target.value)} maxLength={100}/></label>
        </div>
        <label className="field">Province
          <select value={p.province || ''} onChange={e => set('province', e.target.value)}>
            <option value="">Choose…</option>{PROVINCES.map(x => <option key={x}>{x}</option>)}
          </select>
        </label>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Check size={18}/>}Save profile</button>
      </section>
      {!business && (
        <aside className="card-panel form">
          <h2 className="form-step">Skills</h2>
          <div className="chip-wrap">
            {p.skills.map(s => <button type="button" key={s} className="on" onClick={() => set('skills', p.skills.filter(x => x !== s))}>{s} <X size={13}/></button>)}
          </div>
          <div className="search-box">
            <input value={skill} onChange={e => setSkill(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skill); } }} placeholder="Add a skill" maxLength={40}/>
            <button type="button" className="btn btn-dark btn-sm" onClick={() => addSkill(skill)}>Add</button>
          </div>
          <div className="chip-wrap">{SKILL_IDEAS.filter(s => !p.skills.includes(s)).slice(0, 10).map(s => <button type="button" key={s} onClick={() => addSkill(s)}><Plus size={13}/>{s}</button>)}</div>
          <h2 className="form-step">CV</h2>
          {p.resume_path ? (
            <div className="file-row"><FileText size={20}/><span>{p.resume_path.split('/').pop()}</span>
              <button type="button" className="icon-btn" aria-label="View CV" onClick={viewCv}><Eye size={18}/></button>
              <button type="button" className="icon-btn" aria-label="Remove CV" onClick={removeCv}><Trash2 size={18}/></button>
            </div>
          ) : <p className="muted">Businesses you apply to can open your CV. Nobody else can.</p>}
          <label className="btn btn-outline btn-block upload">
            {uploading ? <LoaderCircle className="spin" size={18}/> : <FileUp size={18}/>}{p.resume_path ? 'Replace CV' : 'Upload CV (PDF or Word)'}
            <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])}/>
          </label>
          <a className="link" href="cv-builder.html">No CV yet? Build one free <ArrowUpRight size={14}/></a>
        </aside>
      )}
    </form>
  );
}

// ---------------------------------------------------------------- worker: payouts and bookings
function Payouts({sb, profile, onSaved}: {sb: SupabaseClient; profile: Profile; onSaved: () => void}) {
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  return (
    <div className="split">
      <section className="card-panel form">
        <h2 className="form-step"><Wallet size={18}/>Where your pay goes</h2>
        {profile.payout_ready && <Notice kind="ok">Payouts are set up. Pay for completed shifts goes straight to your bank account.</Notice>}
        <p className="muted">Shift pay is held safely by TradeSafe, a South African escrow company, and paid into your bank account once the shift is confirmed. Community Work never holds your money or sees your full bank details.</p>
        <form className="form" onSubmit={async e => {
          e.preventDefault(); setBusy(true); setMsg(null);
          const f = Object.fromEntries(new FormData(e.currentTarget));
          try { const r = await callFunction(sb, 'payments', {action: 'payout_setup', ...f}); setMsg({kind: 'ok', text: `Saved. Pay will go to the account ending ${r.last4}.`}); onSaved(); (e.target as HTMLFormElement).reset(); }
          catch (err) { setMsg({kind: 'error', text: errorText(err)}); } finally { setBusy(false); }
        }}>
          <div className="grid-2">
            <label className="field">First name (as on ID)<input name="givenName" required maxLength={60}/></label>
            <label className="field">Surname<input name="familyName" required maxLength={60}/></label>
          </div>
          <div className="grid-2">
            <label className="field">SA ID number<input name="idNumber" required inputMode="numeric" pattern="\d{13}" maxLength={13}/></label>
            <label className="field">Mobile number<input name="mobile" required inputMode="tel" placeholder="082 123 4567"/></label>
          </div>
          <div className="grid-2">
            <label className="field">Bank
              <select name="bank" required defaultValue=""><option value="" disabled>Choose…</option>
                {[['ABSA', 'Absa'], ['CAPITEC', 'Capitec'], ['FNB', 'FNB'], ['NEDBANK', 'Nedbank'], ['STANDARD_BANK', 'Standard Bank'], ['TYME', 'TymeBank'], ['AFRICAN_BANK', 'African Bank'], ['DISCOVERY', 'Discovery'], ['INVESTEC', 'Investec'], ['OLD_MUTUAL', 'Old Mutual'], ['BIDVEST', 'Bidvest'], ['SASFIN', 'Sasfin']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="field">Account type<select name="accountType"><option value="CHEQUE">Cheque / current</option><option value="SAVINGS">Savings</option></select></label>
          </div>
          <label className="field">Account number<input name="accountNumber" required inputMode="numeric" maxLength={16} autoComplete="off"/></label>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <ShieldCheck size={18}/>}{profile.payout_ready ? 'Replace payout account' : 'Save payout details'}</button>
        </form>
      </section>
      <aside className="tips">
        <Banknote size={22}/>
        <h2>How you get paid</h2>
        <ol>
          <li><strong>The business pays first.</strong> When they book you, they pay the full shift into escrow.</li>
          <li><strong>You work the shift.</strong> The money is already secured.</li>
          <li><strong>Hours are confirmed.</strong> The business confirms, or our team does if there’s a problem.</li>
          <li><strong>Pay is released to your bank.</strong> Usually the same or next working day.</li>
        </ol>
        <p className="muted">Cash shifts are paid in person by the business. Cash App isn’t available in South Africa; escrow pay goes to SA bank accounts.</p>
      </aside>
    </div>
  );
}

type Booking = {id: string; status: string; hours_worked: number | null; business_confirmed_at: string | null; worker_confirmed_at: string | null; message: string | null;
  shift: {id: string; title: string; city: string; province: string; address: string | null; starts_at: string; ends_at: string; hourly_rate_zar: number; payment_method: string; business_id: string; status: string};
  payment?: {id: string; state: string; amount_zar: number} | null};

function WorkerBookings({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  const [rows, setRows] = useState<Booking[] | null>(null), [err, setErr] = useState('');
  const load = async () => {
    const {data, error} = await sb.from('applications').select('*, shift:shifts(*)').eq('worker_id', profile.id).order('created_at', {ascending: false});
    if (error) return setErr(error.message);
    const {data: pays} = await sb.from('payments').select('id, state, amount_zar, application_id').eq('worker_id', profile.id);
    setRows((data as any[]).map(r => ({...r, payment: pays?.find(p => p.application_id === r.id) ?? null})));
  };
  useEffect(() => { load(); }, []);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!rows) return <div className="card-panel center"><span className="spinner"/></div>;
  if (!rows.length) return <div className="empty"><div className="empty-icon"><CalendarDays size={28}/></div><h2>No shifts yet</h2><p>Find a shift near you and apply in one tap.</p><a className="btn btn-primary" href="shifts.html">See shifts</a></div>;
  return (
    <div className="stack">
      {!profile.payout_ready && <Notice>Add your payout details under <strong>Get paid</strong> so businesses can book you for escrow-paid shifts.</Notice>}
      {rows.map(b => (
        <article className="card-panel booking" key={b.id}>
          <div className="booking-top"><h3>{b.shift.title}</h3><StatusPill status={b.status}/></div>
          <p className="meta-line"><CalendarDays size={15}/>{day(b.shift.starts_at)} · {time(b.shift.starts_at)}–{time(b.shift.ends_at)} <MapPin size={15}/>{b.status === 'accepted' || b.status === 'completed' ? (b.shift.address ? `${b.shift.address}, ` : '') : ''}{b.shift.city}</p>
          <p className="meta-line"><Banknote size={15}/>{money(b.shift.hourly_rate_zar)}/hr · {money(b.shift.hourly_rate_zar * hoursBetween(b.shift.starts_at, b.shift.ends_at))} for the shift · {b.shift.payment_method === 'cash' ? 'Paid in cash' : 'Escrow-protected'}</p>
          {b.payment && <p className="meta-line"><Wallet size={15}/>Pay: <PayState state={b.payment.state}/></p>}
          <div className="row-gap">
            {(b.status === 'applied' || b.status === 'accepted') && Date.parse(b.shift.starts_at) > Date.now() &&
              <button className="btn btn-outline btn-sm" onClick={async () => { await sb.from('applications').update({status: 'withdrawn'}).eq('id', b.id); load(); }}>Withdraw</button>}
            {b.hours_worked != null && !b.worker_confirmed_at &&
              <button className="btn btn-primary btn-sm" onClick={async () => { await sb.from('applications').update({worker_confirmed_at: new Date().toISOString()}).eq('id', b.id); load(); }}><Check size={15}/>Confirm {b.hours_worked} hours</button>}
            {b.payment?.state === 'funded' && <button className="btn btn-outline btn-sm" onClick={async () => { if (confirm('Report a problem with this shift’s pay? Our team will review it and the money stays held until resolved.')) { try { await callFunction(sb, 'payments', {action: 'dispute', paymentId: b.payment!.id}); load(); } catch (e) { alert(errorText(e)); } } }}>Report a problem</button>}
          </div>
        </article>
      ))}
    </div>
  );
}

function StatusPill({status}: {status: string}) {
  const label: Record<string, string> = {applied: 'Applied', accepted: 'Booked', declined: 'Not selected', withdrawn: 'Withdrawn', completed: 'Completed', no_show: 'No-show',
    open: 'Open', filled: 'Fully booked', in_progress: 'In progress', cancelled: 'Cancelled'};
  return <span className={'pill ' + status}>{label[status] ?? status}</span>;
}
function PayState({state}: {state: string}) {
  const label: Record<string, string> = {awaiting_payment: 'Waiting for business to pay', funded: 'Held in escrow', released: 'Paid out', refunded: 'Refunded',
    disputed: 'Under review', cancelled: 'Cancelled', cash_paid: 'Paid in cash'};
  return <span className={'pill pay-' + state}>{label[state] ?? state}</span>;
}

// ---------------------------------------------------------------- business: post and manage shifts
function PostShift({sb, profile, onPosted}: {sb: SupabaseClient; profile: Profile; onPosted: () => void}) {
  const [settings, setSettings] = useState({min_hourly_zar: 30.23, platform_fee_percent: 10});
  const [spot, setSpot] = useState<Location | null>(null), [picking, setPicking] = useState(false);
  const [f, setF] = useState({title: '', category: '', description: '', address: '', city: profile.city || '', province: profile.province || '',
    date: '', start: '08:00', end: '16:00', rate: '', workers: '1', days: '1', payment: 'escrow'});
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  useEffect(() => { sb.rpc('public_settings').then(({data}) => data && setSettings(data as any)); }, []);
  const set = (k: keyof typeof f, v: string) => setF(x => ({...x, [k]: v}));
  const hours = (() => { const [a, b] = [f.start, f.end].map(t => { const [h, m] = t.split(':').map(Number); return h + m / 60; }); return b > a ? b - a : b + 24 - a; })();
  const pay = (Number(f.rate) || 0) * hours * (Number(f.workers) || 1) * (Number(f.days) || 1);
  const fee = f.payment === 'escrow' ? pay * settings.platform_fee_percent / 100 : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!spot) return setMsg({kind: 'error', text: 'Set the workplace location.'});
    if (Number(f.rate) < settings.min_hourly_zar) return setMsg({kind: 'error', text: `Pay must be at least ${money(settings.min_hourly_zar)} an hour (national minimum wage).`});
    if (hours > 16) return setMsg({kind: 'error', text: 'A shift can be up to 16 hours.'});
    setBusy(true);
    const rows = Array.from({length: Math.min(Number(f.days) || 1, 14)}, (_, i) => {
      const startLocal = new Date(`${f.date}T${f.start}:00+02:00`); startLocal.setUTCDate(startLocal.getUTCDate() + i);
      const end = new Date(startLocal.getTime() + hours * 36e5);
      return {business_id: profile.id, title: f.title.trim(), category: f.category, description: f.description.trim(), address: f.address.trim() || null,
        city: f.city.trim(), province: f.province, lat: spot.lat, lon: spot.lon, starts_at: startLocal.toISOString(), ends_at: end.toISOString(),
        hourly_rate_zar: Number(f.rate), workers_needed: Number(f.workers) || 1, payment_method: f.payment};
    });
    const {error} = await sb.from('shifts').insert(rows);
    setBusy(false);
    if (error) return setMsg({kind: 'error', text: error.message});
    setMsg({kind: 'ok', text: rows.length > 1 ? `${rows.length} shifts posted.` : 'Shift posted. Nearby workers can apply now.'});
    setTimeout(onPosted, 900);
  }

  if (picking) return <section className="card-panel form"><h2 className="form-step">Where is the work?</h2><LocationPicker purpose="post" onSelect={l => { setSpot(l); setPicking(false); const prov = PROVINCES.find(p => l.label.includes(p)); if (prov) set('province', prov); }}/><button className="btn btn-outline" onClick={() => setPicking(false)}>Back</button></section>;
  return (
    <form className="split" onSubmit={submit}>
      <section className="card-panel form">
        <h2 className="form-step"><span>1</span>The shift</h2>
        <label className="field">Job title<input value={f.title} onChange={e => set('title', e.target.value)} required minLength={3} maxLength={100} placeholder="e.g. Waiter for Saturday lunch"/></label>
        <label className="field">Type of work<select value={f.category} onChange={e => set('category', e.target.value)} required><option value="" disabled>Choose…</option>{browseCategories.filter(c => c !== 'Other').map(c => <option key={c}>{c}</option>)}<option>Other</option></select></label>
        <label className="field">What the worker will do<textarea rows={4} value={f.description} onChange={e => set('description', e.target.value)} required minLength={10} maxLength={4000} placeholder="Duties, dress code, what to bring, who to ask for."/></label>
        <h2 className="form-step"><span>2</span>Where</h2>
        <button type="button" className={'location-set' + (spot ? ' done' : '')} onClick={() => setPicking(true)}><MapPin size={21}/><span><strong>{spot ? spot.label : 'Set the workplace location'}</strong><small>{spot ? 'Tap to change' : 'Search the address or use your location on site'}</small></span>{spot ? <Check size={20}/> : <Plus size={20}/>}</button>
        <label className="field">Street address (shown only to booked workers)<input value={f.address} onChange={e => set('address', e.target.value)} maxLength={200}/></label>
        <div className="grid-2">
          <label className="field">City or town<input value={f.city} onChange={e => set('city', e.target.value)} required minLength={2} maxLength={100}/></label>
          <label className="field">Province<select value={f.province} onChange={e => set('province', e.target.value)} required><option value="" disabled>Choose…</option>{PROVINCES.map(p => <option key={p}>{p}</option>)}</select></label>
        </div>
        <h2 className="form-step"><span>3</span>When and pay</h2>
        <div className="grid-2">
          <label className="field">Date<input type="date" value={f.date} onChange={e => set('date', e.target.value)} required min={new Date().toISOString().slice(0, 10)}/></label>
          <label className="field">Repeat for<select value={f.days} onChange={e => set('days', e.target.value)}>{[1, 2, 3, 4, 5, 6, 7, 10, 14].map(n => <option key={n} value={n}>{n === 1 ? 'Just this day' : `${n} days in a row`}</option>)}</select></label>
        </div>
        <div className="grid-2">
          <label className="field">Start (SAST)<input type="time" value={f.start} onChange={e => set('start', e.target.value)} required/></label>
          <label className="field">End<input type="time" value={f.end} onChange={e => set('end', e.target.value)} required/></label>
        </div>
        <div className="grid-2">
          <label className="field">Pay per hour (R)<input type="number" inputMode="decimal" min={settings.min_hourly_zar} max={5000} step="0.01" value={f.rate} onChange={e => set('rate', e.target.value)} required placeholder={`At least ${settings.min_hourly_zar}`}/></label>
          <label className="field">Workers needed<input type="number" min={1} max={50} value={f.workers} onChange={e => set('workers', e.target.value)} required/></label>
        </div>
        <fieldset><legend>How you’ll pay</legend>
          <div className="choice-row">
            <button type="button" className={'choice' + (f.payment === 'escrow' ? ' on' : '')} onClick={() => set('payment', 'escrow')}><ShieldCheck size={20}/><strong>Escrow (recommended)</strong><small>Pay in when you book; released after the shift</small></button>
            <button type="button" className={'choice' + (f.payment === 'cash' ? ' on' : '')} onClick={() => set('payment', 'cash')}><Banknote size={20}/><strong>Cash</strong><small>You pay the worker in person</small></button>
          </div>
        </fieldset>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn btn-primary btn-block btn-lg" disabled={busy || profile.suspended}>{busy ? <LoaderCircle className="spin" size={18}/> : <Plus size={18}/>}Post shift</button>
      </section>
      <aside className="tips sticky">
        <Wallet size={22}/>
        <h2>Cost</h2>
        <p className="big-pay">{money(pay + fee)}</p>
        <p className="muted">{money(Number(f.rate) || 0)}/hr × {hours.toFixed(hours % 1 ? 2 : 0)} h × {f.workers || 1} worker{Number(f.workers) > 1 ? 's' : ''}{Number(f.days) > 1 ? ` × ${f.days} days` : ''}{fee ? ` + ${settings.platform_fee_percent}% service fee (${money(fee)})` : ''}</p>
        <p className="muted">Workers receive the full hourly rate. You only pay for workers you book.</p>
      </aside>
    </form>
  );
}

type Applicant = {id: string; status: string; message: string | null; hours_worked: number | null; business_confirmed_at: string | null; worker_confirmed_at: string | null; worker_id: string;
  worker?: Profile; payment?: {id: string; state: string; amount_zar: number; checkout_url: string | null} | null};
type MyShift = {id: string; title: string; city: string; starts_at: string; ends_at: string; hourly_rate_zar: number; workers_needed: number; status: string; payment_method: string; apps: Applicant[]};

function BusinessShifts({sb, profile}: {sb: SupabaseClient; profile: Profile}) {
  const [rows, setRows] = useState<MyShift[] | null>(null), [err, setErr] = useState(''), [busyId, setBusyId] = useState('');
  const load = async () => {
    const {data: shifts, error} = await sb.from('shifts').select('*').eq('business_id', profile.id).order('starts_at', {ascending: true});
    if (error) return setErr(error.message);
    const ids = (shifts || []).map(s => s.id);
    const {data: apps} = ids.length ? await sb.from('applications').select('*').in('shift_id', ids) : {data: []};
    const workerIds = [...new Set((apps || []).map((a: any) => a.worker_id))];
    const {data: workers} = workerIds.length ? await sb.from('profiles').select('*').in('id', workerIds) : {data: []};
    const {data: pays} = await sb.from('payments').select('id, state, amount_zar, checkout_url, application_id').eq('business_id', profile.id);
    setRows((shifts || []).map((s: any) => ({...s, apps: (apps || []).filter((a: any) => a.shift_id === s.id)
      .map((a: any) => ({...a, worker: workers?.find((w: any) => w.id === a.worker_id), payment: pays?.find(p => p.application_id === a.id) ?? null}))})));
  };
  useEffect(() => { load(); }, []);
  const act = async (id: string, fn: () => Promise<any>) => { setBusyId(id); try { await fn(); } catch (e) { alert(errorText(e)); } finally { setBusyId(''); load(); } };
  const update = (id: string, patch: Record<string, unknown>) => act(id, async () => { const {error} = await sb.from('applications').update(patch).eq('id', id); if (error) throw error; });
  const openCv = async (path: string) => { const {data} = await sb.storage.from('resumes').createSignedUrl(path, 120); if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener'); };

  if (err) return <Notice kind="error">{err}</Notice>;
  if (!rows) return <div className="card-panel center"><span className="spinner"/></div>;
  if (!rows.length) return <div className="empty"><div className="empty-icon"><Briefcase size={28}/></div><h2>No shifts posted yet</h2><p>Post a shift and nearby workers can apply straight away.</p><a className="btn btn-primary" href="account.html?tab=post">Post a shift</a></div>;
  return (
    <div className="stack">
      {rows.map(s => (
        <article className="card-panel booking" key={s.id}>
          <div className="booking-top"><h3>{s.title}</h3><StatusPill status={s.status}/></div>
          <p className="meta-line"><CalendarDays size={15}/>{day(s.starts_at)} · {time(s.starts_at)}–{time(s.ends_at)} <MapPin size={15}/>{s.city} <Banknote size={15}/>{money(s.hourly_rate_zar)}/hr · {s.payment_method === 'cash' ? 'Cash' : 'Escrow'}</p>
          <p className="meta-line"><Users size={15}/>{s.apps.filter(a => ['accepted', 'completed'].includes(a.status)).length} of {s.workers_needed} booked · {s.apps.length} applied</p>
          {s.apps.length > 0 && (
            <div className="applicants">
              {s.apps.map(a => {
                const w = a.worker; const shiftHours = hoursBetween(s.starts_at, s.ends_at);
                return (
                  <div className="applicant" key={a.id}>
                    <span className="avatar">{(w?.full_name || '?').slice(0, 2).toUpperCase()}</span>
                    <div className="applicant-body">
                      <strong>{w?.full_name || 'Worker'}{w?.verified && <BadgeCheck size={14}/>}</strong> <StatusPill status={a.status}/>
                      {w?.headline && <small>{w.headline}</small>}
                      {w?.skills?.length ? <small>{w.skills.slice(0, 6).join(' · ')}</small> : null}
                      {a.message && <small>“{a.message}”</small>}
                      {['accepted', 'completed'].includes(a.status) && w?.phone && <small>Phone: {w.phone}</small>}
                      {a.payment && <small>Pay: <PayState state={a.payment.state}/> {money(a.payment.amount_zar)}</small>}
                      <div className="row-gap">
                        {w?.resume_path && <button className="btn btn-outline btn-sm" onClick={() => openCv(w.resume_path!)}><FileText size={14}/>CV</button>}
                        {a.status === 'applied' && <>
                          <button className="btn btn-primary btn-sm" disabled={busyId === a.id} onClick={() => update(a.id, {status: 'accepted'})}><Check size={14}/>Book</button>
                          <button className="btn btn-outline btn-sm" disabled={busyId === a.id} onClick={() => update(a.id, {status: 'declined'})}>Decline</button>
                        </>}
                        {a.status === 'accepted' && s.payment_method === 'escrow' && (!a.payment || a.payment.state === 'awaiting_payment') &&
                          <button className="btn btn-primary btn-sm" disabled={busyId === a.id} onClick={() => act(a.id, async () => {
                            const extra: Record<string, string> = {};
                            if (!profile.payout_ready && !a.payment) {
                              // First escrow payment: TradeSafe needs the payer's legal details once.
                              const given = prompt('Your first name (as on your ID) for TradeSafe'); const family = prompt('Your surname'); const id = prompt('Your 13-digit SA ID number'); const mobile = prompt('Your mobile number');
                              if (!given || !family || !id || !mobile) return;
                              Object.assign(extra, {givenName: given, familyName: family, idNumber: id, mobile});
                            }
                            const r = await callFunction(sb, 'payments', {action: 'fund', applicationId: a.id, ...extra});
                            window.open(r.checkoutUrl, '_blank', 'noopener');
                          })}><Wallet size={14}/>{a.payment ? 'Finish paying' : `Pay ${money(s.hourly_rate_zar * shiftHours)} into escrow`}</button>}
                        {a.status === 'accepted' && Date.parse(s.starts_at) < Date.now() && a.hours_worked == null &&
                          <button className="btn btn-outline btn-sm" onClick={() => { const h = prompt('Hours worked', String(shiftHours)); if (h) update(a.id, {hours_worked: Number(h), business_confirmed_at: new Date().toISOString()}); }}><Clock size={14}/>Record hours</button>}
                        {a.status === 'accepted' && Date.parse(s.starts_at) < Date.now() && a.hours_worked == null &&
                          <button className="btn btn-outline btn-sm" onClick={() => update(a.id, {status: 'no_show'})}>No-show</button>}
                        {a.payment?.state === 'funded' && a.hours_worked != null &&
                          <button className="btn btn-dark btn-sm" disabled={busyId === a.id} onClick={() => confirm(`Release ${money(a.payment!.amount_zar)} to ${w?.full_name || 'the worker'}?`) && act(a.id, () => callFunction(sb, 'payments', {action: 'release', paymentId: a.payment!.id}))}><Banknote size={14}/>Release pay</button>}
                        {s.payment_method === 'cash' && a.status === 'accepted' && a.hours_worked != null &&
                          <button className="btn btn-dark btn-sm" onClick={() => act(a.id, () => callFunction(sb, 'payments', {action: 'cash_paid', applicationId: a.id}))}><Banknote size={14}/>Mark paid in cash</button>}
                        {a.payment?.state === 'funded' && <button className="btn btn-outline btn-sm" onClick={() => confirm('Report a problem? Our team will review and the money stays held.') && act(a.id, () => callFunction(sb, 'payments', {action: 'dispute', paymentId: a.payment!.id}))}>Report a problem</button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {s.status === 'open' && !s.apps.some(a => ['accepted', 'completed'].includes(a.status)) &&
            <button className="link" onClick={async () => { if (confirm('Delete this shift?')) { await sb.from('shifts').delete().eq('id', s.id); load(); } }}>Delete shift</button>}
        </article>
      ))}
    </div>
  );
}

// ===================================================================== Shift board
type OpenShift = {id: string; title: string; description: string; category: string; city: string; province: string; starts_at: string; ends_at: string;
  hourly_rate_zar: number; workers_needed: number; booked: number; payment_method: string; business_name: string; business_verified: boolean; distance_km: number | null};

export function ShiftsPage() {
  const acct = useAccount();
  const {location: area, choose} = useAreaLocation();
  const [radius, setRadius] = useState(50);
  const [rows, setRows] = useState<OpenShift[] | null>(null), [err, setErr] = useState('');
  const [mine, setMine] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState<OpenShift | null>(null), [pickArea, setPickArea] = useState(false);
  useEffect(() => {
    if (!acct.ready || !acct.sb) return;
    acct.sb.rpc('open_shifts', {p_lat: area?.lat ?? null, p_lon: area?.lon ?? null, p_radius_km: area ? radius : 2000, p_limit: 200})
      .then(({data, error}) => { if (error) setErr(error.message); else setRows(data as OpenShift[]); });
    if (acct.session) acct.sb.from('applications').select('shift_id').eq('worker_id', acct.session.user.id).then(({data}) => setMine(new Set((data || []).map(d => d.shift_id))));
  }, [acct.ready, acct.session?.user.id, area?.lat, area?.lon, radius]);

  if (acct.ready && !acct.sb) return <NotConfigured/>;
  const worker = acct.profile?.account_type === 'worker';
  return (
    <div className="page">
      <div className="page-head">
        <p className="overline">Paid shifts · in person</p>
        <h1>Shifts near you</h1>
        <p className="lede">Book a shift with a local business. Pay is set per hour and, for escrow shifts, held safely before you start.</p>
      </div>
      <div className="tools-top shifts-tools">
        <button className="location-chip" onClick={() => setPickArea(true)}><MapPin size={16}/><span>{area ? area.label : 'Set your area'}</span></button>
        <div className="chip-wrap">{[10, 25, 50, 100].map(r => <button key={r} className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>{r} km</button>)}</div>
      </div>
      {!acct.session && <Notice>Create a free worker account to apply. <a className="link" href="account.html?signup=1&type=worker">Sign up</a> · <a className="link" href="account.html">Sign in</a></Notice>}
      {err && <Notice kind="error">{err}</Notice>}
      {!rows ? <div className="job-list">{[0, 1, 2].map(i => <div className="job-card skeleton" key={i}><span/><span/><span/></div>)}</div>
        : !rows.length ? <div className="empty"><div className="empty-icon"><CalendarDays size={28}/></div><h2>No open shifts here yet</h2><p>Try a bigger distance, or check back soon — businesses post new shifts every day.</p><a className="btn btn-outline" href="find-work.html">Browse other jobs</a></div>
        : <div className="job-list">{rows.map(s => {
            const h = hoursBetween(s.starts_at, s.ends_at);
            const applied = mine.has(s.id);
            return (
              <article className="job-card community" key={s.id}>
                <div className="card-head"><span className="avatar">{s.business_name.slice(0, 2).toUpperCase()}</span>
                  <div className="card-title"><h3>{s.title}</h3><p>{s.business_name}{s.business_verified && <> · <BadgeCheck size={13}/> Verified</>}</p></div></div>
                <div className="tags"><span className="tag onsite"><MapPin size={13}/>In person</span><span className="tag">{s.category}</span><span className={'tag ' + (s.payment_method === 'escrow' ? 'local' : '')}>{s.payment_method === 'escrow' ? <><ShieldCheck size={13}/>Pay secured</> : <><Banknote size={13}/>Cash</>}</span></div>
                <p className="excerpt">{s.description}</p>
                <div className="meta"><span><CalendarDays size={14}/>{day(s.starts_at)} · {time(s.starts_at)}–{time(s.ends_at)}</span><span><MapPin size={14}/>{s.city}{s.distance_km != null ? ` · ${s.distance_km.toFixed(s.distance_km < 10 ? 1 : 0)} km` : ''}</span><span><Users size={14}/>{s.workers_needed - s.booked} of {s.workers_needed} spots left</span></div>
                <div className="card-foot">
                  <div className="pay"><strong>{money(s.hourly_rate_zar)} / hr</strong><small>{money(s.hourly_rate_zar * h)} for {h} h</small></div>
                  {applied ? <span className="pill accepted">Applied</span>
                    : <button className="btn btn-primary btn-sm" onClick={() => { track('shift_view', s.id); if (!acct.session) location.href = 'account.html?signup=1&type=worker'; else if (!worker) alert('Shifts are booked by worker accounts. Create a separate worker account to apply.'); else setApplying(s); }}>Apply</button>}
                </div>
              </article>
            );
          })}</div>}
      {pickArea && <Sheet title="Where do you want to work?" onClose={() => setPickArea(false)}><LocationPicker onSelect={l => { choose(l); setPickArea(false); }}/></Sheet>}
      {applying && acct.sb && acct.session && (
        <Sheet title={`Apply: ${applying.title}`} onClose={() => setApplying(null)}>
          <form className="form" onSubmit={async e => {
            e.preventDefault();
            const message = String(new FormData(e.currentTarget).get('message') || '').slice(0, 500) || null;
            const {error} = await acct.sb!.from('applications').insert({shift_id: applying.id, worker_id: acct.session!.user.id, message});
            if (error) return alert(error.message);
            track('shift_apply', applying.id);
            setMine(m => new Set([...m, applying.id])); setApplying(null);
          }}>
            <p className="muted">{applying.business_name} will see your profile, skills and CV. If they book you, you’ll see the exact address and their contact details.</p>
            <label className="field">Message (optional)<textarea name="message" rows={3} maxLength={500} placeholder="Why you’re a good fit, when you can arrive."/></label>
            {!acct.profile?.payout_ready && applying.payment_method === 'escrow' && <Notice>Add payout details in your account so you can be paid for escrow shifts.</Notice>}
            <button className="btn btn-primary btn-block">Send application</button>
          </form>
        </Sheet>
      )}
    </div>
  );
}

// ===================================================================== CEO / admin dashboard
export function AdminPage() {
  const acct = useAccount();
  const [aal, setAal] = useState<'aal1' | 'aal2' | null>(null);
  useEffect(() => { acct.sb?.auth.mfa.getAuthenticatorAssuranceLevel().then(({data}) => setAal((data?.currentLevel as any) ?? 'aal1')); }, [acct.sb, acct.session?.access_token]);
  if (!acct.ready) return <div className="page"><div className="card-panel center"><span className="spinner"/></div></div>;
  if (!acct.sb) return <NotConfigured/>;
  if (!acct.session) return <div className="page reading"><Notice>Sign in with your staff account.</Notice><AuthForm sb={acct.sb}/></div>;
  if (!acct.staff) return <div className="page"><div className="empty"><h2>Staff only</h2><p>This area is for the Community Work team.</p><a className="btn btn-primary" href="account.html">My account</a></div></div>;
  if (aal === null) return <div className="page"><div className="card-panel center"><span className="spinner"/></div></div>;
  if (aal !== 'aal2') return <div className="page reading"><TwoFactor sb={acct.sb} onDone={() => { setAal('aal2'); acct.reload(); }}/></div>;
  return <AdminConsole sb={acct.sb} role={acct.staff} me={acct.session.user.id}/>;
}

function TwoFactor({sb, onDone}: {sb: SupabaseClient; onDone: () => void}) {
  const [factorId, setFactorId] = useState(''), [qr, setQr] = useState(''), [secret, setSecret] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    sb.auth.mfa.listFactors().then(async ({data}) => {
      const verified = data?.totp?.find(f => f.status === 'verified');
      if (verified) return setFactorId(verified.id);
      for (const f of data?.all ?? []) if (f.status !== 'verified') await sb.auth.mfa.unenroll({factorId: f.id});
      const {data: e, error} = await sb.auth.mfa.enroll({factorType: 'totp', friendlyName: 'Community Work admin'});
      if (error || !e) return setErr(error?.message || 'Could not start authenticator setup. Refresh and try again.');
      setFactorId(e.id); setQr(e.totp.qr_code); setSecret(e.totp.secret);
    });
  }, []);
  return (
    <section className="card-panel auth">
      <KeyRound size={26}/>
      <h1>{qr ? 'Protect your admin account' : 'Enter your authenticator code'}</h1>
      {qr ? <>
        <p className="muted">Scan this with Google Authenticator, Microsoft Authenticator or Authy. You’ll need a code from it every time you open the dashboard — even someone with your password can’t get in without your phone.</p>
        <img className="qr" src={qr} alt="Authenticator QR code" width={200} height={200}/>
        <p className="muted small">Can’t scan? Enter this key: <code>{secret}</code></p>
      </> : <p className="muted">Open your authenticator app and enter the 6-digit code for Community Work.</p>}
      <form className="form" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setErr('');
        const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
        const {error} = await sb.auth.mfa.challengeAndVerify({factorId, code});
        setBusy(false);
        if (error) setErr('That code didn’t work. Check the time on your phone and try the newest code.'); else onDone();
      }}>
        <label className="field">6-digit code<input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required autoFocus/></label>
        {err && <Notice kind="error">{err}</Notice>}
        <button className="btn btn-primary btn-block" disabled={busy || !factorId}>{busy && <LoaderCircle className="spin" size={18}/>}Verify</button>
      </form>
    </section>
  );
}

function AdminConsole({sb, role, me}: {sb: SupabaseClient; role: 'ceo' | 'admin'; me: string}) {
  const [tab, setTab] = useState('overview');
  const tabs = [['overview', 'Overview'], ['live', 'Live'], ['users', 'Users'], ['payments', 'Payments'], ['team', 'Team'], ...(role === 'ceo' ? [['settings', 'Settings']] : []), ['audit', 'Activity log']];
  return (
    <div className="page wide">
      <div className="account-head">
        <span className="avatar big"><ShieldCheck size={22}/></span>
        <div><h1>{role === 'ceo' ? 'CEO dashboard' : 'Admin dashboard'}</h1><p className="muted">Community Work South Africa · protected with your authenticator</p></div>
        <div className="row-gap end">
          <a className="btn btn-outline btn-sm" href="https://analytics.google.com/" target="_blank" rel="noreferrer"><BarChart3 size={15}/>Google Analytics</a>
          <a className="btn btn-outline btn-sm" href="https://www.google.com/adsense/" target="_blank" rel="noreferrer">AdSense</a>
          <a className="btn btn-outline btn-sm" href="https://www.tradesafe.co.za/" target="_blank" rel="noreferrer">TradeSafe</a>
        </div>
      </div>
      <div className="segmented tabs scroll" role="tablist">{tabs.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overview' && <Overview sb={sb}/>}
      {tab === 'live' && <Live sb={sb}/>}
      {tab === 'users' && <UsersAdmin sb={sb}/>}
      {tab === 'payments' && <PaymentsAdmin sb={sb}/>}
      {tab === 'team' && <TeamAdmin sb={sb} role={role} me={me}/>}
      {tab === 'settings' && <SettingsAdmin sb={sb}/>}
      {tab === 'audit' && <AuditAdmin sb={sb}/>}
    </div>
  );
}

function useRpc<T>(sb: SupabaseClient, fn: string, args: Record<string, unknown>, deps: unknown[], every = 0) {
  const [data, setData] = useState<T | null>(null), [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    const run = () => sb.rpc(fn, args).then(({data, error}) => { if (!alive) return; if (error) setErr(error.message); else { setErr(''); setData(data as T); } });
    run();
    const t = every ? setInterval(run, every) : null;
    return () => { alive = false; if (t) clearInterval(t); };
  }, deps);
  return {data, err};
}

function Tile({label, value, sub}: {label: string; value: React.ReactNode; sub?: string}) {
  return <div className="tile"><span>{label}</span><strong>{value}</strong>{sub && <small>{sub}</small>}</div>;
}
const n = (v: number | undefined) => (v ?? 0).toLocaleString('en-ZA');

function Overview({sb}: {sb: SupabaseClient}) {
  const [days, setDays] = useState(30);
  const {data: s, err} = useRpc<any>(sb, 'admin_stats', {p_days: days}, [days]);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!s) return <div className="card-panel center"><span className="spinner"/></div>;
  const max = Math.max(1, ...s.daily.map((d: any) => d.views));
  return (
    <div className="stack">
      <div className="chip-wrap">{[1, 7, 30, 90].map(d => <button key={d} className={days === d ? 'on' : ''} onClick={() => setDays(d)}>{d === 1 ? 'Today' : `${d} days`}</button>)}</div>
      <div className="tile-grid">
        <Tile label="Visitors" value={n(s.traffic.visitors)} sub={`${n(s.traffic.page_views)} page views`}/>
        <Tile label="Job apply clicks" value={n(s.traffic.apply_clicks)}/>
        <Tile label="Sponsored clicks" value={n(s.traffic.sponsored_clicks)} sub={`${n(s.traffic.sponsored_views)} views · ${s.traffic.sponsored_views ? ((s.traffic.sponsored_clicks / s.traffic.sponsored_views) * 100).toFixed(1) : '0'}% click rate`}/>
        <Tile label="Sign-ups" value={n(s.users.new)} sub={`${n(s.users.total)} accounts: ${n(s.users.workers)} workers, ${n(s.users.businesses)} businesses`}/>
        <Tile label="Shifts" value={n(s.shifts.posted)} sub={`${n(s.shifts.open)} open · ${n(s.shifts.filled)} booked · ${n(s.shifts.completed)} done`}/>
        <Tile label="Applications" value={n(s.applications)}/>
        <Tile label="Held in escrow" value={money(s.payments.held_zar)} sub={`${n(s.payments.awaiting)} awaiting payment · ${n(s.payments.disputed)} disputed`}/>
        <Tile label="Paid to workers" value={money(s.payments.released_zar)} sub={`${money(s.payments.fees_zar)} in service fees`}/>
      </div>
      <section className="card-panel">
        <h3>Visitors per day</h3>
        <div className="bars" role="img" aria-label="Daily page views">
          {s.daily.map((d: any) => <div key={d.day} className="bar" title={`${d.day}: ${d.views} views, ${d.visitors} visitors, ${d.clicks} clicks`}><i style={{height: `${(d.views / max) * 100}%`}}/><small>{String(d.day).slice(5)}</small></div>)}
          {!s.daily.length && <p className="muted">No visits recorded yet.</p>}
        </div>
      </section>
      <div className="split even">
        <Table title="Top pages" rows={s.top_pages} cols={[['path', 'Page'], ['views', 'Views']]}/>
        <Table title="Sponsored offers" rows={s.top_sponsored} cols={[['target', 'Offer'], ['views', 'Views'], ['clicks', 'Clicks']]}/>
      </div>
      <Table title="Most-clicked jobs" rows={s.top_jobs} cols={[['target', 'Job'], ['clicks', 'Apply clicks']]}/>
      <p className="muted small">Google AdSense ad clicks happen inside Google’s ad frames and appear in your AdSense reports, not here.</p>
    </div>
  );
}

function Table({title, rows, cols}: {title: string; rows: any[]; cols: [string, string][]}) {
  return (
    <section className="card-panel table-wrap">
      <h3>{title}</h3>
      {!rows?.length ? <p className="muted">Nothing yet.</p> : (
        <table><thead><tr>{cols.map(([, l]) => <th key={l}>{l}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{cols.map(([k]) => <td key={k}>{typeof r[k] === 'number' ? n(r[k]) : String(r[k] ?? '—')}</td>)}</tr>)}</tbody></table>
      )}
    </section>
  );
}

function Live({sb}: {sb: SupabaseClient}) {
  const {data, err} = useRpc<any>(sb, 'admin_live', {p_minutes: 30}, [], 15000);
  if (err) return <Notice kind="error">{err}</Notice>;
  if (!data) return <div className="card-panel center"><span className="spinner"/></div>;
  return (
    <div className="stack">
      <div className="tile-grid"><Tile label="Active in last 30 min" value={<><Activity size={20}/> {n(data.active_visitors)}</>} sub="visitors"/><Tile label="Events" value={n(data.events)} sub="refreshes every 15 seconds"/></div>
      <Table title="Latest activity" rows={(data.recent || []).map((e: any) => ({...e, at: time(e.at)}))} cols={[['at', 'Time'], ['type', 'Event'], ['path', 'Page'], ['target', 'Detail']]}/>
    </div>
  );
}

function UsersAdmin({sb}: {sb: SupabaseClient}) {
  const [q, setQ] = useState(''), [rows, setRows] = useState<any[] | null>(null), [err, setErr] = useState('');
  const load = (search = q) => sb.rpc('admin_users', {p_search: search, p_limit: 100, p_offset: 0}).then(({data, error}) => error ? setErr(error.message) : setRows(data));
  useEffect(() => { load(''); }, []);
  const flag = async (id: string, patch: {p_verified?: boolean; p_suspended?: boolean}) => { const {error} = await sb.rpc('admin_set_flags', {p_user: id, ...patch}); if (error) alert(error.message); load(); };
  return (
    <div className="stack">
      <form className="search-box big" onSubmit={e => { e.preventDefault(); load(); }}><Search size={18}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by email, name or business"/><button className="btn btn-dark btn-sm">Search</button></form>
      {err && <Notice kind="error">{err}</Notice>}
      {!rows ? <div className="card-panel center"><span className="spinner"/></div> : (
        <section className="card-panel table-wrap"><table>
          <thead><tr><th>Account</th><th>Type</th><th>Area</th><th>Joined</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(u => (
            <tr key={u.id}>
              <td><strong>{u.business_name || u.full_name || '—'}</strong><br/><small>{u.email}</small></td>
              <td>{u.account_type}{u.payout_ready && <><br/><small>payouts set</small></>}</td>
              <td>{[u.city, u.province].filter(Boolean).join(', ') || '—'}</td>
              <td>{new Date(u.created_at).toLocaleDateString('en-ZA')}</td>
              <td>{u.suspended ? <span className="pill declined">Suspended</span> : u.verified ? <span className="pill accepted">Verified</span> : <span className="pill">Active</span>}</td>
              <td className="row-gap">
                <button className="btn btn-outline btn-sm" onClick={() => flag(u.id, {p_verified: !u.verified})}>{u.verified ? 'Unverify' : 'Verify'}</button>
                <button className="btn btn-outline btn-sm" onClick={() => confirm(u.suspended ? 'Restore this account?' : 'Suspend this account? They won’t be able to post or apply.') && flag(u.id, {p_suspended: !u.suspended})}>{u.suspended ? 'Restore' : 'Suspend'}</button>
              </td>
            </tr>))}</tbody>
        </table></section>
      )}
    </div>
  );
}

function PaymentsAdmin({sb}: {sb: SupabaseClient}) {
  const [filter, setFilter] = useState('funded'), [rows, setRows] = useState<any[] | null>(null), [busy, setBusy] = useState('');
  const load = () => {
    let q = sb.from('payments').select('*, shift:shifts(title, city, starts_at)').order('created_at', {ascending: false}).limit(200);
    if (filter !== 'all') q = q.eq('state', filter);
    q.then(({data}) => setRows(data || []));
  };
  useEffect(load, [filter]);
  const act = async (id: string, action: string, ask: string) => {
    if (!confirm(ask)) return;
    setBusy(id);
    try { await callFunction(sb, 'payments', {action, paymentId: id}); } catch (e) { alert(errorText(e)); }
    setBusy(''); load();
  };
  return (
    <div className="stack">
      <div className="chip-wrap">{[['funded', 'Held in escrow'], ['disputed', 'Disputed'], ['awaiting_payment', 'Awaiting payment'], ['released', 'Paid out'], ['all', 'All']].map(([k, l]) => <button key={k} className={filter === k ? 'on' : ''} onClick={() => setFilter(k)}>{l}</button>)}</div>
      <Notice>Money is held by TradeSafe, not in this system. Releasing sends it to the worker’s bank account; cancelling refunds the business. Every action is logged with your name.</Notice>
      {!rows ? <div className="card-panel center"><span className="spinner"/></div> : !rows.length ? <p className="muted">No payments here.</p> : (
        <section className="card-panel table-wrap"><table>
          <thead><tr><th>Shift</th><th>Amount</th><th>Hours</th><th>State</th><th></th></tr></thead>
          <tbody>{rows.map(p => (
            <tr key={p.id}>
              <td><strong>{p.shift?.title}</strong><br/><small>{p.shift?.city} · {p.shift?.starts_at ? day(p.shift.starts_at) : ''}</small></td>
              <td>{money(p.amount_zar)}<br/><small>fee {money(p.fee_zar)}</small></td>
              <td>{p.hours}</td>
              <td><PayState state={p.state}/>{p.provider_state && <><br/><small>{p.provider_state}</small></>}</td>
              <td className="row-gap">
                {['funded', 'disputed'].includes(p.state) && <button className="btn btn-dark btn-sm" disabled={busy === p.id} onClick={() => act(p.id, 'release', `Release ${money(p.amount_zar)} to the worker?`)}>Release</button>}
                {['awaiting_payment', 'funded', 'disputed'].includes(p.state) && <button className="btn btn-outline btn-sm" disabled={busy === p.id} onClick={() => act(p.id, 'cancel', 'Cancel and refund the business?')}>Refund</button>}
                {p.provider === 'tradesafe' && <button className="icon-btn" aria-label="Refresh from TradeSafe" onClick={() => act(p.id, 'refresh', 'Re-check this payment with TradeSafe?')}><RefreshCw size={15}/></button>}
              </td>
            </tr>))}</tbody>
        </table></section>
      )}
    </div>
  );
}

function TeamAdmin({sb, role, me}: {sb: SupabaseClient; role: 'ceo' | 'admin'; me: string}) {
  const [rows, setRows] = useState<any[] | null>(null), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const load = () => sb.rpc('admin_list_staff').then(({data}) => setRows(data || []));
  useEffect(() => { load(); }, []);
  return (
    <div className="stack">
      {role === 'ceo' && (
        <form className="card-panel form" onSubmit={async e => {
          e.preventDefault();
          const email = String(new FormData(e.currentTarget).get('email'));
          const {error} = await sb.rpc('admin_add', {p_email: email});
          setMsg(error ? {kind: 'error', text: error.message} : {kind: 'ok', text: `${email} is now an admin. They’ll set up an authenticator the first time they open the dashboard.`});
          if (!error) { (e.target as HTMLFormElement).reset(); load(); }
        }}>
          <h3>Add an admin</h3>
          <p className="muted">They need a confirmed Community Work account first. Admins can see the dashboard, verify or suspend users and release or refund escrow. Only you can add or remove admins and change settings.</p>
          <div className="search-box"><input name="email" type="email" required placeholder="their@email.com"/><button className="btn btn-primary btn-sm">Add admin</button></div>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        </form>
      )}
      <section className="card-panel table-wrap"><h3>Team</h3>
        {!rows ? <span className="spinner"/> : <table><thead><tr><th>Email</th><th>Role</th><th>Since</th><th></th></tr></thead>
          <tbody>{rows.map(r => <tr key={r.user_id}><td>{r.email}{r.user_id === me && ' (you)'}</td><td>{r.role === 'ceo' ? 'CEO' : 'Admin'}</td><td>{new Date(r.added_at).toLocaleDateString('en-ZA')}</td>
            <td>{role === 'ceo' && r.role !== 'ceo' && <button className="btn btn-outline btn-sm" onClick={async () => { if (confirm(`Remove ${r.email} as admin?`)) { const {error} = await sb.rpc('admin_remove', {p_user: r.user_id}); if (error) alert(error.message); load(); } }}>Remove</button>}</td></tr>)}</tbody></table>}
      </section>
    </div>
  );
}

function SettingsAdmin({sb}: {sb: SupabaseClient}) {
  const [s, setS] = useState<any>(null), [msg, setMsg] = useState('');
  useEffect(() => { sb.rpc('public_settings').then(({data}) => setS(data)); }, []);
  if (!s) return <span className="spinner"/>;
  return (
    <form className="card-panel form narrow" onSubmit={async e => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const {error} = await sb.rpc('admin_set_settings', {p_min_hourly: Number(f.get('min')), p_fee_percent: Number(f.get('fee'))});
      setMsg(error ? error.message : 'Saved.');
    }}>
      <h3>Platform settings</h3>
      <label className="field">Minimum hourly pay (R)<input name="min" type="number" step="0.01" min={0} defaultValue={s.min_hourly_zar}/><small>South Africa’s national minimum wage is R30.23/hour from 1 March 2026. Update it each March.</small></label>
      <label className="field">Service fee charged to businesses (%)<input name="fee" type="number" step="0.5" min={0} max={30} defaultValue={s.platform_fee_percent}/></label>
      {msg && <Notice>{msg}</Notice>}
      <button className="btn btn-primary">Save settings</button>
    </form>
  );
}

function AuditAdmin({sb}: {sb: SupabaseClient}) {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { sb.from('audit_log').select('*').order('at', {ascending: false}).limit(200).then(({data}) => setRows(data || [])); }, []);
  if (!rows) return <span className="spinner"/>;
  return <Table title="Activity log (who did what)" rows={rows.map(r => ({...r, at: new Date(r.at).toLocaleString('en-ZA', {timeZone: tz}), details: JSON.stringify(r.details)}))}
    cols={[['at', 'When'], ['action', 'Action'], ['target', 'Target'], ['actor', 'By'], ['details', 'Details']]}/>;
}

// ===================================================================== analytics consent banner
export function ConsentBanner({show, onChoose}: {show: boolean; onChoose: (v: 'granted' | 'denied') => void}) {
  if (!show) return null;
  return (
    <div className="consent" role="dialog" aria-label="Cookies">
      <p>We use Google Analytics cookies to understand how people use Community Work. You can say no and everything still works.</p>
      <div className="row-gap"><button className="btn btn-outline btn-sm" onClick={() => onChoose('denied')}>No thanks</button><button className="btn btn-primary btn-sm" onClick={() => onChoose('granted')}>Accept</button></div>
    </div>
  );
}
