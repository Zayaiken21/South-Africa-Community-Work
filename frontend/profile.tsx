import {useEffect, useRef, useState} from 'react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {
  BadgeCheck, Camera, Car, Check, Clock, FileText, FileUp, Globe, GraduationCap, Languages, LoaderCircle, MapPin, Phone,
  Plus, Trash2, X, Briefcase, CalendarDays, Building2, Star, Users, ArrowUpRight, Palette, Eye, Lock, UserRound, Sparkles, Ban,
} from 'lucide-react';
import {useAccount, modes, type Experience, type Profile} from './backend';
import {THEMES, theme, themeStyle} from './themes';

const PROVINCES = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
const DAYS: [string, string][] = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
const TIMES: [string, string][] = [['mornings', 'Mornings'], ['afternoons', 'Afternoons'], ['evenings', 'Evenings'], ['nights', 'Nights']];
const LANGS = ['English', 'isiZulu', 'isiXhosa', 'Afrikaans', 'Sesotho', 'Setswana', 'Sepedi', 'Xitsonga', 'siSwati', 'Tshivenda', 'isiNdebele', 'Portuguese', 'French', 'Shona'];
const LICENCES: [string, string][] = [['none', 'No licence'], ['code8', 'Code 8 (B)'], ['code10', 'Code 10 (C1)'], ['code14', 'Code 14 (EC)'], ['other', 'Other']];
const SKILL_IDEAS = ['Customer service', 'Cash handling', 'Cooking', 'Cleaning', 'Driving', 'Forklift', 'Security (PSIRA)', 'Sales', 'Admin', 'Excel', 'First aid', 'Waitering', 'Barista', 'Stock control', 'Childcare', 'Gardening', 'Painting', 'Construction'];

// What a profile page shows. Comes from profile_card() for other people, or is built from your own profile.
export type Card = Partial<Profile> & {
  id: string; view?: 'worker' | 'business'; is_me?: boolean; member_since?: string; shifts_completed?: number; strikes_total?: number;
  shifts_posted?: number; workers_hired?: number; shifts_filled?: number; shifts_paid?: number; blocked_by_me?: boolean;
};
// Your own profile shown the way others see it: the worker side, or only the business side.
export const ownCard = (p: Profile, view: 'worker' | 'business' = 'worker'): Card => view === 'business'
  ? {id: p.id, view, is_me: true, member_since: p.created_at, business_name: p.business_name, business_type: p.business_type, bio: p.business_bio,
     avatar_url: p.business_avatar_url, theme: p.theme, business_hours: p.business_hours, website: p.website, city: p.city, province: p.province,
     verified: p.verified, phone: p.phone}
  : {...p, view, is_me: true, member_since: p.created_at};

export const initialsOf = (name?: string | null) =>
  (name || '?').replace(/[^\p{L}\p{N} ]/gu, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';

// ---------------------------------------------------------------- photo
export function Avatar({url, name, size = 44, themeId, ring = false}: {url?: string | null; name?: string | null; size?: number; themeId?: string | null; ring?: boolean}) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={'avatar-circle' + (ring ? ' ring' : '')} style={{...themeStyle(themeId), width: size, height: size, fontSize: Math.max(12, size * .34)}}>
      {url && !broken ? <img src={url} alt="" width={size} height={size} onError={() => setBroken(true)}/> : <b>{initialsOf(name)}</b>}
    </span>
  );
}

// Square-crops and shrinks a photo on the device before upload (max 512 px, WebP), so uploads are small and always round-friendly.
async function squarePhoto(file: File, size = 512): Promise<Blob> {
  const img = await createImageBitmap(file, {imageOrientation: 'from-image'} as ImageBitmapOptions);
  const side = Math.min(img.width, img.height);
  const out = Math.min(size, side);
  const c = document.createElement('canvas'); c.width = c.height = out;
  c.getContext('2d')!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
  return new Promise((ok, fail) => c.toBlob(b => (b ? ok(b) : fail(new Error('Could not read that photo.'))), 'image/webp', .88));
}

function PhotoPicker({sb, profile, onChange, field = 'avatar_url'}: {sb: SupabaseClient; profile: Profile; onChange: (url: string | null) => void; field?: 'avatar_url' | 'business_avatar_url'}) {
  const current = profile[field] ?? null;
  const [busy, setBusy] = useState(false), [err, setErr] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function pick(file: File) {
    setErr('');
    if (!/^image\//.test(file.type)) return setErr('Choose a photo (JPG, PNG or WebP).');
    if (file.size > 15 * 1024 * 1024) return setErr('That photo is too big. Try one under 15 MB.');
    setBusy(true);
    try {
      const blob = await squarePhoto(file);
      const path = `${profile.id}/avatar-${Date.now()}.webp`;
      const {error} = await sb.storage.from('avatars').upload(path, blob, {contentType: 'image/webp', cacheControl: '31536000'});
      if (error) throw error;
      const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      const {error: e2} = await sb.from('profiles').update({[field]: url}).eq('id', profile.id);
      if (e2) throw e2;
      const old = current?.split('/avatars/')[1];
      if (old) sb.storage.from('avatars').remove([decodeURIComponent(old)]);
      onChange(url);
    } catch (e: any) { setErr(e?.message || 'Upload failed.'); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  async function remove() {
    const old = current?.split('/avatars/')[1];
    await sb.from('profiles').update({[field]: null}).eq('id', profile.id);
    if (old) await sb.storage.from('avatars').remove([decodeURIComponent(old)]);
    onChange(null);
  }
  return (
    <div className="photo-picker">
      <button type="button" className="photo-btn" onClick={() => input.current?.click()} aria-label="Change profile photo">
        <Avatar url={current} name={field === 'business_avatar_url' ? profile.business_name : profile.full_name} size={112} themeId={profile.theme} ring/>
        <span className="photo-cam">{busy ? <LoaderCircle className="spin" size={18}/> : <Camera size={18}/>}</span>
      </button>
      <div className="photo-actions">
        <strong>{field === 'business_avatar_url' ? 'Business logo' : 'Profile photo'}</strong>
        <small>{field === 'business_avatar_url' ? 'Your logo or a photo of your shop. Workers see this, never your personal photo.' : 'A clear photo of your face. We crop it into a circle.'}</small>
        <div className="row-gap">
          <button type="button" className="btn btn-outline btn-sm" onClick={() => input.current?.click()} disabled={busy}><Camera size={15}/>{current ? 'Change' : 'Add'} {field === 'business_avatar_url' ? 'logo' : 'photo'}</button>
          {current && <button type="button" className="btn btn-ghost btn-sm" onClick={remove}><Trash2 size={15}/>Remove</button>}
        </div>
        {err && <p className="alert">{err}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic" hidden onChange={e => e.target.files?.[0] && pick(e.target.files[0])}/>
    </div>
  );
}

export function ThemePicker({value, onChange}: {value?: string; onChange: (id: string) => void}) {
  return (
    <div className="theme-grid" role="radiogroup" aria-label="Profile theme">
      {THEMES.map(t => (
        <button type="button" key={t.id} role="radio" aria-checked={theme(value).id === t.id} className={'swatch' + (theme(value).id === t.id ? ' on' : '')}
          style={themeStyle(t.id)} onClick={() => onChange(t.id)}>
          <i/><span>{t.label}</span>{theme(value).id === t.id && <Check size={14}/>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- profile view (public page + live preview)
const since = (d?: string) => d ? new Date(d).toLocaleDateString('en-ZA', {month: 'long', year: 'numeric'}) : '';

export function ProfileView({card, sb, compact = false, mode}: {card: Card; sb?: SupabaseClient | null; compact?: boolean; mode?: 'worker' | 'business'}) {
  const view = card.view ?? mode ?? 'worker';
  const showWork = view === 'worker', showBiz = view === 'business';
  const name = showBiz ? card.business_name : card.full_name;
  const done = card.shifts_completed ?? 0, strikes = card.strikes_total ?? 0;
  const reliability = done + strikes > 0 ? Math.round(done / (done + strikes) * 100) : null;
  const avail = card.availability ?? [];
  const openCv = async () => {
    if (!sb || !card.resume_path) return;
    const {data} = await sb.storage.from('resumes').createSignedUrl(card.resume_path, 120);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
  };
  return (
    <article className={'profile-view' + (compact ? ' compact' : '')} style={themeStyle(card.theme)}>
      <div className="pv-banner"><span className="pv-pattern"/></div>
      <div className="pv-head">
        <Avatar url={card.avatar_url} name={name} size={compact ? 84 : 124} themeId={card.theme} ring/>
        <div className="pv-title">
          <h1>{name || 'Your name'}{card.verified && <BadgeCheck size={compact ? 18 : 22} className="pv-check" aria-label="Verified"/>}</h1>
          {(showBiz ? card.business_type : card.headline) && <p className="pv-headline">{showBiz ? card.business_type : card.headline}</p>}
          <p className="pv-meta">
            {(card.city || card.province) && <span><MapPin size={14}/>{[card.city, card.province].filter(Boolean).join(', ')}</span>}
            {card.member_since && <span><CalendarDays size={14}/>Member since {since(card.member_since)}</span>}
          </p>
          <div className="pv-badges">
            {showWork && <span className="pv-badge"><Sparkles size={13}/>Available for shifts</span>}
            {showBiz && <span className="pv-badge"><Building2 size={13}/>Hiring</span>}
          </div>
        </div>
      </div>

      <div className="pv-stats">
        {showWork && <div><strong>{done}</strong><span>shifts completed</span></div>}
        {showWork && <div><strong>{reliability == null ? 'New' : reliability + '%'}</strong><span>reliability</span></div>}
        {showBiz && <div><strong>{card.shifts_posted ?? 0}</strong><span>shifts posted</span></div>}
        {showBiz && <div><strong>{card.workers_hired ?? 0}</strong><span>workers hired</span></div>}
        {showBiz && card.shifts_paid != null && <div><strong>{card.shifts_paid}</strong><span>shifts paid</span></div>}
      </div>

      <div className="pv-body">
        {card.bio && <section><h3>About</h3><p className="pv-bio">{card.bio}</p></section>}
        {showWork && !!card.skills?.length && <section><h3>Skills</h3><div className="pv-chips">{card.skills.map(s => <span key={s}>{s}</span>)}</div></section>}
        {showWork && !!card.experience?.length && (
          <section><h3>Experience</h3>
            <ol className="pv-timeline">{card.experience.map((x, i) => (
              <li key={i}><i/><div><strong>{x.role}</strong><span>{x.place}{x.years ? ` · ${x.years} ${x.years === '1' ? 'year' : 'years'}` : ''}</span>{x.note && <small>{x.note}</small>}</div></li>
            ))}</ol>
          </section>
        )}
        {showWork && (avail.length > 0 || !!card.languages?.length || card.has_transport != null || card.drivers_licence || card.education) && (
          <section><h3>Details</h3>
            {avail.length > 0 && <div className="pv-days" aria-label="Availability">
              {DAYS.map(([k, l]) => <span key={k} className={avail.includes(k) ? 'on' : ''}>{l}</span>)}
              {TIMES.filter(([k]) => avail.includes(k)).map(([k, l]) => <span key={k} className="on time">{l}</span>)}
            </div>}
            <dl className="pv-facts">
              {!!card.languages?.length && <><dt><Languages size={15}/>Languages</dt><dd>{card.languages.join(', ')}</dd></>}
              {card.has_transport != null && <><dt><Car size={15}/>Own transport</dt><dd>{card.has_transport ? 'Yes' : 'No'}</dd></>}
              {card.drivers_licence && <><dt><Car size={15}/>Driver’s licence</dt><dd>{LICENCES.find(l => l[0] === card.drivers_licence)?.[1]}</dd></>}
              {card.education && <><dt><GraduationCap size={15}/>Education</dt><dd>{card.education}</dd></>}
            </dl>
          </section>
        )}
        {showBiz && (card.business_hours || card.website) && (
          <section><h3>Business details</h3>
            <dl className="pv-facts">
              {card.business_hours && <><dt><Clock size={15}/>Hours</dt><dd>{card.business_hours}</dd></>}
              {card.website && <><dt><Globe size={15}/>Website</dt><dd><a className="link" href={card.website} target="_blank" rel="noopener noreferrer nofollow">{card.website.replace(/^https?:\/\//, '')}<ArrowUpRight size={13}/></a></dd></>}
            </dl>
          </section>
        )}
        {(card.phone || card.resume_path) && (
          <section className="pv-contact">
            {card.phone && <a className="btn btn-primary btn-sm themed" href={'tel:' + card.phone.replace(/\s/g, '')}><Phone size={15}/>{card.phone}</a>}
            {card.resume_path && sb && <button className="btn btn-outline btn-sm" onClick={openCv}><FileText size={15}/>View CV</button>}
          </section>
        )}
        {!card.is_me && !card.phone && <p className="pv-private"><Lock size={13}/>Contact details are shared once you’re booked together.</p>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- profile page (profile.html?id=…)
export function ProfilePage() {
  const acct = useAccount();
  const q = new URLSearchParams(location.search);
  const id = q.get('id'), view = q.get('view') === 'business' ? 'business' : 'worker';
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [busy, setBusy] = useState(false), [note, setNote] = useState('');
  const load = () => {
    if (!acct.sb || !acct.session) return;
    acct.sb.rpc('profile_card', {p_id: id || acct.session.user.id, p_view: view}).then(({data}) => setCard((data as Card) ?? null));
  };
  useEffect(load, [acct.ready, acct.session?.user.id, id, view]);
  if (!acct.ready) return <div className="page"><div className="card-panel center"><span className="spinner"/></div></div>;
  if (!acct.session) return (
    <div className="page reading"><div className="empty">
      <div className="empty-icon"><UserRound size={28}/></div><h2>Sign in to see profiles</h2>
      <p>Profiles are visible to Community Work members only.</p>
      <a className="btn btn-primary" href="account.html">Sign in</a>
    </div></div>
  );
  if (card === undefined) return <div className="page"><div className="card-panel center"><span className="spinner"/></div></div>;
  if (card === null) return <div className="page reading"><div className="empty"><h2>Profile not available</h2><p>This profile doesn’t exist or isn’t public right now.</p><a className="btn btn-primary" href="shifts.html">Browse shifts</a></div></div>;
  const hiring = acct.profile && modes(acct.profile).active === 'business';
  const canBlock = hiring && card.view === 'worker' && !card.is_me;
  async function toggleBlock() {
    if (!acct.sb || !acct.session) return;
    setBusy(true); setNote('');
    if (card!.blocked_by_me) {
      const {error} = await acct.sb.from('business_blocks').delete().eq('business_id', acct.session.user.id).eq('worker_id', card!.id);
      setNote(error ? error.message : 'Unblocked. They can book your shifts again.');
    } else {
      const reason = prompt(`Block ${card!.full_name || 'this worker'} from your shifts? They won’t see or book your shifts. Optional reason (only you and Community Work see it):`);
      if (reason === null) { setBusy(false); return; }
      const {error} = await acct.sb.from('business_blocks').insert({business_id: acct.session.user.id, worker_id: card!.id, reason: reason.slice(0, 300) || null});
      setNote(error ? error.message : 'Blocked. They can no longer see or book your shifts.');
    }
    setBusy(false); load();
  }
  return (
    <div className="page profile-page">
      <ProfileView card={card} sb={acct.sb}/>
      <div className="profile-actions">
        {card.is_me && <a className="btn btn-outline" href="account.html?tab=profile"><Palette size={16}/>Edit profile and theme</a>}
        {canBlock && <button className={'btn ' + (card.blocked_by_me ? 'btn-outline' : 'btn-ghost danger')} disabled={busy} onClick={toggleBlock}><Ban size={16}/>{card.blocked_by_me ? 'Unblock from my shifts' : 'Block from my shifts'}</button>}
      </div>
      {note && <p className="hint-box">{note}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- editor
export function ProfileEditor({sb, profile, onSaved, mode}: {sb: SupabaseClient; profile: Profile; onSaved: () => void; mode: 'worker' | 'business'}) {
  const [p, setP] = useState<Profile>({...profile, skills: profile.skills ?? [], languages: profile.languages ?? [], availability: profile.availability ?? [], experience: profile.experience ?? []});
  const [skill, setSkill] = useState(''), [lang, setLang] = useState('');
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState<{kind: 'error' | 'ok'; text: string} | null>(null);
  const [uploading, setUploading] = useState(false), [preview, setPreview] = useState(false);
  const m = modes(p);
  const set = <K extends keyof Profile>(k: K, v: Profile[K]) => { setP(x => ({...x, [k]: v})); setMsg(null); };
  const toggleIn = (k: 'availability' | 'languages', v: string) => set(k, (p[k] ?? []).includes(v) ? (p[k] ?? []).filter(x => x !== v) : [...(p[k] ?? []), v]);
  const addSkill = (s: string) => { const v = s.trim().slice(0, 40); if (v && !p.skills.includes(v) && p.skills.length < 30) set('skills', [...p.skills, v]); setSkill(''); };
  const addLang = (s: string) => { const v = s.trim().slice(0, 30); if (v && !(p.languages ?? []).includes(v) && (p.languages ?? []).length < 12) set('languages', [...(p.languages ?? []), v]); setLang(''); };
  const exp = p.experience ?? [];
  const setExp = (i: number, patch: Partial<Experience>) => set('experience', exp.map((x, j) => (j === i ? {...x, ...patch} : x)));

  const checks = mode === 'worker'
    ? [['Photo', !!p.avatar_url], ['Headline', !!p.headline], ['About you', (p.bio || '').length >= 40], ['3+ skills', p.skills.length >= 3], ['Availability', (p.availability ?? []).length > 0], ['Experience', exp.length > 0], ['CV', !!p.resume_path]] as const
    : [['Logo', !!p.business_avatar_url], ['Business name', !!p.business_name], ['What you do', (p.business_bio || '').length >= 40], ['Type of business', !!p.business_type], ['Hours', !!p.business_hours], ['Phone', !!p.phone]] as const;
  const score = Math.round(checks.filter(c => c[1]).length / checks.length * 100);

  async function save(e?: React.FormEvent) {
    e?.preventDefault(); setBusy(true); setMsg(null);
    const website = (p.website || '').trim();
    const {error} = await sb.from('profiles').update({
      full_name: p.full_name?.trim() || null, headline: p.headline?.trim() || null, bio: p.bio?.trim() || null, skills: p.skills,
      business_bio: p.business_bio?.trim() || null,
      phone: p.phone?.trim() || null, city: p.city?.trim() || null, province: p.province || null,
      business_name: p.business_name?.trim() || null, business_reg: p.business_reg?.trim() || null,
      theme: p.theme || 'savanna', languages: p.languages, availability: p.availability, has_transport: p.has_transport ?? null,
      drivers_licence: p.drivers_licence || null, education: p.education?.trim() || null,
      experience: exp.filter(x => x.role.trim() && x.place.trim()).map(x => ({role: x.role.trim().slice(0, 80), place: x.place.trim().slice(0, 80), years: (x.years || '').trim().slice(0, 10), note: (x.note || '').trim().slice(0, 200)})),
      business_type: p.business_type?.trim() || null, business_hours: p.business_hours?.trim() || null,
      website: website ? (/^https?:\/\//.test(website) ? website : 'https://' + website) : null,
    }).eq('id', p.id);
    setBusy(false);
    setMsg(error ? {kind: 'error', text: /website/.test(error.message) ? 'Check the website address.' : error.message} : {kind: 'ok', text: 'Profile saved.'});
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
    <form className="editor" onSubmit={save}>
      <div className="editor-main">
        <section className="card-panel form section-card">
          <header className="sec-head"><Palette size={18}/><div><h2>{mode === 'business' ? 'Logo and style' : 'Photo and style'}</h2><p>How your {mode === 'business' ? 'business page' : 'profile'} looks to {mode === 'worker' ? 'businesses' : 'workers'}.</p></div></header>
          <PhotoPicker sb={sb} profile={p} field={mode === 'business' ? 'business_avatar_url' : 'avatar_url'} onChange={url => { set(mode === 'business' ? 'business_avatar_url' : 'avatar_url', url); onSaved(); }}/>
          <div className="field"><span>Profile theme</span><ThemePicker value={p.theme} onChange={v => set('theme', v)}/></div>
        </section>

        {mode === 'worker' ? (
          <section className="card-panel form section-card">
            <header className="sec-head"><UserRound size={18}/><div><h2>About you</h2><p>A short, friendly introduction.</p></div></header>
            <label className="field">Full name<input value={p.full_name || ''} onChange={e => set('full_name', e.target.value)} maxLength={120} required/></label>
            <label className="field">Headline<input value={p.headline || ''} onChange={e => set('headline', e.target.value)} maxLength={120} placeholder="e.g. Reliable waiter and barista, 3 years’ experience"/></label>
            <label className="field">Who you are
              <textarea rows={5} value={p.bio || ''} onChange={e => set('bio', e.target.value)} maxLength={1000} placeholder="Your experience, what you’re good at, and what kind of shifts you’re looking for."/>
              <small>{(p.bio || '').length}/1000</small>
            </label>
          </section>
        ) : (
          <section className="card-panel form section-card">
            <header className="sec-head"><Building2 size={18}/><div><h2>Your business</h2><p>Help workers know who they’re working for.</p></div></header>
            <div className="grid-2">
              <label className="field">Business name<input value={p.business_name || ''} onChange={e => set('business_name', e.target.value)} maxLength={120} required/></label>
              <label className="field">Type of business<input value={p.business_type || ''} onChange={e => set('business_type', e.target.value)} maxLength={60} placeholder="e.g. Restaurant, warehouse, events"/></label>
            </div>
            <label className="field">What you do
              <textarea rows={5} value={p.business_bio || ''} onChange={e => set('business_bio', e.target.value)} maxLength={1000} placeholder="What your business does and what a shift with you is like."/>
              <small>{(p.business_bio || '').length}/1000</small>
            </label>
            <div className="grid-2">
              <label className="field">Trading hours<input value={p.business_hours || ''} onChange={e => set('business_hours', e.target.value)} maxLength={120} placeholder="Mon–Sat, 08:00–18:00"/></label>
              <label className="field">Website (optional)<input value={p.website || ''} onChange={e => set('website', e.target.value)} maxLength={200} inputMode="url" placeholder="www.example.co.za"/></label>
            </div>
            <div className="grid-2">
              <label className="field">Contact person<input value={p.full_name || ''} onChange={e => set('full_name', e.target.value)} maxLength={120} required/></label>
              <label className="field">Company registration (optional)<input value={p.business_reg || ''} onChange={e => set('business_reg', e.target.value)} maxLength={40}/></label>
            </div>
          </section>
        )}

        {mode === 'worker' && (
          <section className="card-panel form section-card">
            <header className="sec-head"><CalendarDays size={18}/><div><h2>When and how you work</h2><p>Businesses filter by these.</p></div></header>
            <div className="field"><span>Days you can work</span>
              <div className="day-pick">{DAYS.map(([k, l]) => <button type="button" key={k} className={(p.availability ?? []).includes(k) ? 'on' : ''} aria-pressed={(p.availability ?? []).includes(k)} onClick={() => toggleIn('availability', k)}>{l}</button>)}</div>
            </div>
            <div className="field"><span>Times</span>
              <div className="chip-wrap">{TIMES.map(([k, l]) => <button type="button" key={k} className={(p.availability ?? []).includes(k) ? 'on' : ''} aria-pressed={(p.availability ?? []).includes(k)} onClick={() => toggleIn('availability', k)}>{l}</button>)}</div>
            </div>
            <div className="field"><span>Languages you speak</span>
              <div className="chip-wrap">
                {(p.languages ?? []).map(l => <button type="button" key={l} className="on" onClick={() => toggleIn('languages', l)}>{l} <X size={13}/></button>)}
                {LANGS.filter(l => !(p.languages ?? []).includes(l)).slice(0, 8).map(l => <button type="button" key={l} onClick={() => addLang(l)}><Plus size={13}/>{l}</button>)}
              </div>
              <div className="search-box"><input value={lang} onChange={e => setLang(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLang(lang); } }} placeholder="Another language" maxLength={30}/><button type="button" className="btn btn-dark btn-sm" onClick={() => addLang(lang)}>Add</button></div>
            </div>
            <div className="grid-2">
              <label className="field">Own transport
                <select value={p.has_transport == null ? '' : p.has_transport ? 'yes' : 'no'} onChange={e => set('has_transport', e.target.value === '' ? null : e.target.value === 'yes')}>
                  <option value="">Prefer not to say</option><option value="yes">Yes, I have transport</option><option value="no">No, I use public transport</option>
                </select>
              </label>
              <label className="field">Driver’s licence
                <select value={p.drivers_licence || ''} onChange={e => set('drivers_licence', e.target.value || null)}>
                  <option value="">Choose…</option>{LICENCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
            <label className="field">Highest education (optional)<input value={p.education || ''} onChange={e => set('education', e.target.value)} maxLength={200} placeholder="e.g. Matric, N4 Hospitality, Diploma"/></label>
          </section>
        )}

        {mode === 'worker' && (
          <section className="card-panel form section-card">
            <header className="sec-head"><Briefcase size={18}/><div><h2>Experience</h2><p>Jobs, shifts or volunteering you’ve done.</p></div></header>
            {exp.length === 0 && <p className="muted">No experience added yet. Even informal work counts.</p>}
            {exp.map((x, i) => (
              <div className="exp-row" key={i}>
                <input aria-label="Role" placeholder="Role, e.g. Waiter" value={x.role} maxLength={80} onChange={e => setExp(i, {role: e.target.value})}/>
                <input aria-label="Where" placeholder="Where, e.g. Ocean Basket" value={x.place} maxLength={80} onChange={e => setExp(i, {place: e.target.value})}/>
                <input aria-label="Years" placeholder="Years" value={x.years || ''} maxLength={10} inputMode="decimal" onChange={e => setExp(i, {years: e.target.value})}/>
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => set('experience', exp.filter((_, j) => j !== i))}><Trash2 size={17}/></button>
              </div>
            ))}
            {exp.length < 12 && <button type="button" className="btn btn-outline btn-sm" onClick={() => set('experience', [...exp, {role: '', place: '', years: ''}])}><Plus size={15}/>Add experience</button>}
          </section>
        )}

        {mode === 'worker' && (
          <section className="card-panel form section-card">
            <header className="sec-head"><Star size={18}/><div><h2>Skills</h2><p>Up to 30.</p></div></header>
            <div className="chip-wrap">{p.skills.map(s => <button type="button" key={s} className="on" onClick={() => set('skills', p.skills.filter(x => x !== s))}>{s} <X size={13}/></button>)}</div>
            <div className="search-box"><input value={skill} onChange={e => setSkill(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(skill); } }} placeholder="Add a skill" maxLength={40}/><button type="button" className="btn btn-dark btn-sm" onClick={() => addSkill(skill)}>Add</button></div>
            <div className="chip-wrap">{SKILL_IDEAS.filter(s => !p.skills.includes(s)).slice(0, 10).map(s => <button type="button" key={s} onClick={() => addSkill(s)}><Plus size={13}/>{s}</button>)}</div>
          </section>
        )}

        {mode === 'worker' && (
          <section className="card-panel form section-card">
            <header className="sec-head"><FileText size={18}/><div><h2>CV</h2><p>Only businesses whose shifts you pick up can open it.</p></div></header>
            {p.resume_path ? (
              <div className="file-row"><FileText size={20}/><span>{p.resume_path.split('/').pop()}</span>
                <button type="button" className="icon-btn" aria-label="View CV" onClick={viewCv}><Eye size={18}/></button>
                <button type="button" className="icon-btn" aria-label="Remove CV" onClick={removeCv}><Trash2 size={18}/></button>
              </div>
            ) : <p className="muted">No CV uploaded.</p>}
            <label className="btn btn-outline btn-block upload">
              {uploading ? <LoaderCircle className="spin" size={18}/> : <FileUp size={18}/>}{p.resume_path ? 'Replace CV' : 'Upload CV (PDF or Word)'}
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])}/>
            </label>
            <a className="link" href="cv-builder.html">No CV yet? Build one free <ArrowUpRight size={14}/></a>
          </section>
        )}

        <section className="card-panel form section-card">
          <header className="sec-head"><MapPin size={18}/><div><h2>Contact and area</h2><p>Your phone is only shown to people you’re booked with.</p></div></header>
          <div className="grid-2">
            <label className="field">Phone / WhatsApp<input value={p.phone || ''} onChange={e => set('phone', e.target.value)} maxLength={30} inputMode="tel" placeholder="082 123 4567"/></label>
            <label className="field">City or town<input value={p.city || ''} onChange={e => set('city', e.target.value)} maxLength={100}/></label>
          </div>
          <label className="field">Province
            <select value={p.province || ''} onChange={e => set('province', e.target.value || null)}><option value="">Choose…</option>{PROVINCES.map(x => <option key={x}>{x}</option>)}</select>
          </label>
        </section>
      </div>

      <aside className="editor-side">
        <div className="card-panel strength">
          <div className="strength-top"><strong>Profile strength</strong><span>{score}%</span></div>
          <div className="meter"><i style={{width: score + '%'}}/></div>
          <ul>{checks.map(([l, ok]) => <li key={l} className={ok ? 'ok' : ''}>{ok ? <Check size={14}/> : <span className="dot"/>}{l}</li>)}</ul>
        </div>
        <button type="button" className="btn btn-outline btn-block show-sm" onClick={() => setPreview(v => !v)}><Eye size={16}/>{preview ? 'Hide preview' : 'Preview my profile'}</button>
        <div className={'preview-wrap' + (preview ? ' open' : '')}>
          <p className="overline">Live preview</p>
          <ProfileView card={ownCard(p, mode)} compact/>
          <a className="link" href={'profile.html?id=' + p.id + (mode === 'business' ? '&view=business' : '')}>Open my public {mode === 'business' ? 'business page' : 'profile'} <ArrowUpRight size={14}/></a>
        </div>
      </aside>

      <div className="save-bar">
        {msg && <span className={msg.kind === 'error' ? 'save-err' : 'save-ok'} role="status">{msg.kind === 'ok' && <Check size={15}/>}{msg.text}</span>}
        <button className="btn btn-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Check size={18}/>}Save profile</button>
      </div>
    </form>
  );
}
