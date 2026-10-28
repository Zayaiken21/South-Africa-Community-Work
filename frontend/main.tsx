import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  MapPin, Clock, Navigation, ArrowRight, ArrowLeft, Plus, Check, Bookmark, Search, ShieldCheck, Mail, Globe,
  BriefcaseBusiness, House, Menu, Download, Info, CircleHelp, Lock, FileText, ArrowUpRight, X, Users, Laptop, FileUser,
  CalendarDays, UserRound, Building2, Wallet,
} from 'lucide-react';
import JobsView, {LocationPicker, Sheet, useAreaLocation} from './JobsView';
import {AccountPage, AdminPage, ConsentBanner, ShiftsPage} from './marketplace';
import {Avatar, ProfilePage} from './profile';
import {modes} from './backend';
import {useAccount} from './backend';
import {consent, gaConfigured, startTracking} from './analytics';
import {API, money, milesLabel, savedJobs, setSavedJobs, toggleSaved, type CommunityJob, type SavedJob} from './catalog';
import {AdSlot, HangingOffer, initAds} from './ads';
import './app.css';

const file = window.location.pathname.split('/').pop() || 'index.html';
const mode = new URLSearchParams(window.location.search).get('mode');

// ---------- Install as an app (Android / desktop Chrome) ----------

let deferredPrompt: any = null;
const installListeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; installListeners.forEach(f => f()); });
window.addEventListener('appinstalled', () => { deferredPrompt = null; installListeners.forEach(f => f()); });
function useInstall() {
  const [, force] = useState(0);
  useEffect(() => { const f = () => force(n => n + 1); installListeners.add(f); return () => { installListeners.delete(f); }; }, []);
  return deferredPrompt ? async () => { deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; force(n => n + 1); } : null;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// Ads stay off account, admin, legal and offline pages.
const adFreePages = ['post-job.html', 'account.html', 'admin.html', 'profile.html', 'privacy.html', 'terms.html', 'offline.html', '404.html'];
if (!adFreePages.includes(file)) initAds();
if (file !== 'admin.html') startTracking();

function useConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => { if (!consent.get()) gaConfigured().then(setShow); }, []);
  return {show, choose: (v: 'granted' | 'denied') => { consent.set(v); setShow(false); }};
}

// ---------- Shell ----------

function App() {
  const [more, setMore] = useState(false);
  const install = useInstall();
  const acct = useAccount();
  const banner = useConsentBanner();
  const signedIn = !!acct.session;
  const tab = file === 'index.html' ? 'home' : file === 'find-work.html' ? (mode === 'remote' ? 'online' : 'jobs') : file === 'shifts.html' ? 'shifts'
    : file === 'saved-jobs.html' ? 'saved' : file === 'account.html' || file === 'admin.html' || file === 'post-job.html' || file === 'profile.html' ? 'account' : 'more';
  return (
    <>
      <header className="topbar">
        <a className="brand" href="index.html" aria-label="Community Work South Africa home">
          <Logo/><span>community<b>work</b><small>SOUTH AFRICA</small></span>
        </a>
        <nav className="topnav" aria-label="Main">
          <a className={tab === 'jobs' || tab === 'home' ? 'on' : ''} href="find-work.html">Find work</a>
          <a className={tab === 'online' ? 'on' : ''} href="find-work.html?mode=remote">Online jobs</a>
          <a className={tab === 'shifts' ? 'on' : ''} href="shifts.html">Shifts</a>
          <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html">Saved</a>
          <a href="cv-builder.html">CV builder</a>
          <a href="how-it-works.html">How it works</a>
        </nav>
        <div className="top-actions">
          {install && <button className="btn btn-outline btn-sm hide-sm" onClick={install}><Download size={16}/>Install app</button>}
          {signedIn
            ? <a className="account-chip hide-sm" href="account.html" title="My account">
                <Avatar url={acct.profile?.avatar_url} name={acct.profile?.full_name || acct.profile?.business_name} size={34} themeId={acct.profile?.theme}/>
                <span>{acct.profile && modes(acct.profile).active === 'business' ? 'Hiring' : 'Working'}</span>
              </a>
            : <><a className="btn btn-outline btn-sm hide-sm" href="account.html">Sign in</a><a className="btn btn-primary btn-sm hide-sm" href="account.html?signup=1&type=business"><Building2 size={16}/>Hire workers</a></>}
          <button className="icon-btn show-sm" aria-label="More" onClick={() => setMore(true)}><Menu size={22}/></button>
        </div>
      </header>

      <main className="app-main">
        {file === 'index.html' ? <JobsView welcome/>
          : file === 'find-work.html' ? <JobsView/>
          : file === 'post-job.html' ? <HirePage/>
          : file === 'shifts.html' ? <ShiftsPage/>
          : file === 'account.html' ? <AccountPage/>
          : file === 'admin.html' ? <AdminPage/>
          : file === 'profile.html' ? <ProfilePage/>
          : file === 'job.html' ? <Detail/>
          : file === 'saved-jobs.html' ? <Saved/>
          : file === 'how-it-works.html' ? <How/>
          : file === 'about.html' ? <About/>
          : file === 'help.html' ? <Help/>
          : file === 'privacy.html' ? <Privacy/>
          : file === 'terms.html' ? <Terms/>
          : file === 'offline.html' ? <Offline/>
          : <NotFound/>}
      </main>

      <footer className="site-footer">
        <div><a className="brand small" href="index.html"><Logo/><span>community<b>work</b></span></a><p>Opportunity starts in your community.</p></div>
        <nav aria-label="Footer">
          <a href="find-work.html">Find work</a><a href="find-work.html?mode=remote">Online jobs</a><a href="shifts.html">Paid shifts</a><a href="account.html?signup=1&type=business">Hire workers</a><a href="cv-builder.html">CV builder</a>
          <a href="how-it-works.html">How it works</a><a href="about.html">About</a><a href="help.html">Help</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a>
        </nav>
        <small>South Africa · All nine provinces · Some links are sponsored or affiliate links: we may earn a commission, at no cost to you.</small>
      </footer>

      {!adFreePages.includes(file) && <HangingOffer/>}

      <nav className="tabbar" aria-label="App">
        <a className={tab === 'home' || tab === 'jobs' ? 'on' : ''} href="index.html"><House size={22}/><span>Jobs</span></a>
        <a className={tab === 'online' ? 'on' : ''} href="find-work.html?mode=remote"><Globe size={22}/><span>Online</span></a>
        <a className={'post' + (tab === 'shifts' ? ' on' : '')} href="shifts.html"><span className="post-fab"><CalendarDays size={24}/></span><span>Shifts</span></a>
        <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html"><Bookmark size={22}/><span>Saved</span></a>
        <a className={tab === 'account' ? 'on' : ''} href="account.html"><UserRound size={22}/><span>{signedIn ? 'Account' : 'Sign in'}</span></a>
      </nav>

      <ConsentBanner show={banner.show} onChoose={banner.choose}/>

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="menu-list">
            {install && <button onClick={() => { setMore(false); install(); }}><Download size={20}/>Install the app</button>}
            {acct.staff && <a href="admin.html"><ShieldCheck size={20}/>{acct.staff === 'ceo' ? 'CEO dashboard' : 'Admin dashboard'}</a>}
            <a href="account.html"><UserRound size={20}/>{signedIn ? 'My account' : 'Sign in or create account'}</a>
            {!signedIn && <a href="account.html?signup=1&type=business"><Building2 size={20}/>Hire workers for shifts</a>}
            <a href="cv-builder.html"><FileUser size={20}/>Build your CV</a>
            <a href="how-it-works.html"><BriefcaseBusiness size={20}/>How it works</a>
            <a href="about.html"><Info size={20}/>About</a>
            <a href="help.html"><CircleHelp size={20}/>Help & safety</a>
            <a href="privacy.html"><Lock size={20}/>Privacy</a>
            <a href="terms.html"><FileText size={20}/>Terms</a>
          </div>
        </Sheet>
      )}
    </>
  );
}

function Logo() {
  return <img className="logo" src="./assets/favicon.svg?v=sa-2026" width="36" height="36" alt="" aria-hidden="true"/>;
}

function PageHead({tag, title, description}: {tag: string; title: string; description?: string}) {
  return <div className="page-head"><p className="overline">{tag}</p><h1>{title}</h1>{description && <p className="lede">{description}</p>}</div>;
}

// ---------- Pages ----------

// The old public "Post a job" form is replaced by business accounts (shifts with hourly pay and escrow).
function HirePage() {
  return (
    <div className="page">
      <PageHead tag="Hire in your community" title="Hire workers by the shift" description="Open a free business account, post a shift with an hourly rate in rand, and book nearby workers for a day or a week."/>
      <div className="split">
        <section className="card-panel">
          <ol className="steps">
            <li><strong>Create a business account.</strong> Takes a minute; verified businesses get a badge.</li>
            <li><strong>Post the shift.</strong> Duties, place, date, hours and pay per hour (at least the national minimum wage).</li>
            <li><strong>Book workers.</strong> See their profile, skills and CV, then book the ones you want.</li>
            <li><strong>Pay safely.</strong> Pay into TradeSafe escrow when you book; it’s released to the worker after the shift. Or pay cash on the day.</li>
          </ol>
          <div className="row-gap">
            <a className="btn btn-primary" href="account.html?signup=1&type=business"><Building2 size={17}/>Create business account</a>
            <a className="btn btn-outline" href="account.html">Sign in</a>
          </div>
        </section>
        <aside className="tips">
          <Wallet size={22}/>
          <h2>Why escrow?</h2>
          <p>Workers know the money is there before they travel, and you only release it once the hours are confirmed. If something goes wrong, our team reviews it before any money moves.</p>
          <a className="link" href="help.html">Questions? <ArrowRight size={15}/></a>
        </aside>
      </div>
    </div>
  );
}

function Detail() {
  const id = new URLSearchParams(window.location.search).get('id');
  const {location, locating, choose} = useAreaLocation();
  const [job, setJob] = useState<CommunityJob | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(() => savedJobs().some(s => s.key === 'community:' + id));

  useEffect(() => {
    if (!location || !id) return;
    setBusy(true);
    const ctrl = new AbortController();
    const p = new URLSearchParams({lat: String(location.lat), lon: String(location.lon), radius: '200', id});
    fetch(API + '?' + p, {signal: ctrl.signal})
      .then(async r => {
        const d: any = await r.json();
        if (!r.ok) throw Error(d.error || 'Unable to load job.');
        if (!d.jobs.length) throw Error('This job has ended, is outside its hiring area for your location, or was removed.');
        setJob(d.jobs[0]); setError('');
      })
      .catch(e => { if (!ctrl.signal.aborted) setError(e.message); })
      .finally(() => { if (!ctrl.signal.aborted) setBusy(false); });
    return () => ctrl.abort();
  }, [location, id]);

  const save = () => job && setSaved(toggleSaved({key: 'community:' + job.id, title: job.title, company: job.business, place: `${job.city}, ${job.province}`, href: 'job.html?id=' + encodeURIComponent(job.id), external: false, mode: 'onsite'}));

  return (
    <div className="page">
      <a className="back" href="find-work.html"><ArrowLeft size={17}/>Back to jobs</a>
      {!id ? <div className="card-panel"><h1>Choose a job first</h1><a className="btn btn-primary" href="find-work.html">Browse jobs</a></div>
        : locating || busy ? <div className="card-panel center" role="status"><span className="spinner"/>Loading job…</div>
        : !location ? <div className="card-panel narrow"><h2>Choose your area to view this job</h2><p className="muted">Posters hire within a set distance, so we check you’re in range first.</p><LocationPicker onSelect={choose}/></div>
        : error ? <div className="card-panel narrow" role="alert"><h2>Job unavailable</h2><p className="muted">{error}</p><a className="btn btn-primary" href="find-work.html">Find other work</a></div>
        : job ? (
          <>
            <div className="page-head">
              <p className="overline">{job.category} · Community post</p>
              <h1>{job.title}</h1>
              <p className="lede">{job.business} · {job.city}, {job.province}</p>
            </div>
            <div className="split">
              <section className="card-panel">
                <div className="big-pay">{money(job.pay)}<span> / {job.payType === 'hour' ? 'hour' : 'job'}</span></div>
                <p className="muted">{job.payType === 'hour' ? `About ${money(job.pay * job.hours)} for the shift` : `About ${money(job.hourly)} per hour`}</p>
                <div className="stat-row">
                  <span><Clock size={17}/>{job.hours} hours</span>
                  <span><Navigation size={17}/>{milesLabel(job.distance)} away</span>
                  <span><MapPin size={17}/>{job.city}</span>
                </div>
                <h3>About this job</h3>
                <p className="prose-text">{job.description}</p>
                <AdSlot spot="article" index={0} category={job.category} mode="onsite"/>
                <h3>When</h3>
                <p className="prose-text">{new Date(job.start).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg', dateStyle: 'full', timeStyle: 'short'})} SAST</p>
                <button className={'btn ' + (saved ? 'btn-dark' : 'btn-outline')} onClick={save}><Bookmark size={16} fill={saved ? 'currentColor' : 'none'}/>{saved ? 'Saved' : 'Save job'}</button>
              </section>
              <aside className="card-panel contact">
                <Mail size={22}/>
                <h2>Contact {job.business}</h2>
                <p className="contact-value">{job.contact}</p>
                <p className="hint-box">Contacting the poster doesn’t book the shift. Agree on the work, pay, hours and exact address first.</p>
                <a className="link" href="cv-builder.html"><FileUser size={15}/>No CV yet? Build one free</a>
                <a className="link" href="help.html#safety">Tips for staying safe</a>
              </aside>
            </div>
          </>
        ) : null}
    </div>
  );
}

function Saved() {
  const [list, setList] = useState<SavedJob[]>(() => savedJobs());
  useEffect(() => { const f = () => setList(savedJobs()); window.addEventListener('cw-saved', f); return () => window.removeEventListener('cw-saved', f); }, []);
  const remove = (key: string) => setSavedJobs(list.filter(s => s.key !== key));
  return (
    <div className="page">
      <PageHead tag="Your shortlist" title="Saved jobs" description="Saved on this device. Open a job to check it’s still available."/>
      {!list.length ? (
        <div className="empty">
          <div className="empty-icon"><Bookmark size={28}/></div>
          <h2>Nothing saved yet</h2>
          <p>Tap the bookmark on any job to keep it here.</p>
          <a className="btn btn-primary" href="find-work.html">Find work <ArrowRight size={17}/></a>
        </div>
      ) : (
        <div className="saved-list">
          {list.map(s => (
            <div className="saved-row" key={s.key}>
              <span className={'avatar ' + s.mode}>{s.mode === 'remote' ? <Globe size={18}/> : <MapPin size={18}/>}</span>
              <a href={s.href} {...(s.external ? {target: '_blank', rel: 'noopener noreferrer nofollow'} : {})}>
                <strong>{s.title}</strong>
                <span>{[s.company, s.place].filter(Boolean).join(' · ') || 'Open to see the details'}</span>
              </a>
              <button className="icon-btn" aria-label={'Remove ' + s.title} onClick={() => remove(s.key)}><X size={18}/></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function How() {
  return (
    <div className="page">
      <PageHead tag="How it works" title="Local work. Clear next steps." description="Three kinds of jobs in one place: community shifts, in-person jobs across South Africa, and online work."/>
      <div className="three">
        <div className="feature"><CalendarDays size={22}/><h3>Paid shifts</h3><p>Local businesses book workers by the day, at an hourly rate set up front, with pay secured in escrow.</p></div>
        <div className="feature"><MapPin size={22}/><h3>In person across SA</h3><p>Jobs from employers around the country, sorted by how close they are to you.</p></div>
        <div className="feature"><Laptop size={22}/><h3>Online jobs</h3><p>Remote roles open to people in South Africa. Apply on the original job site.</p></div>
      </div>
      <AdSlot spot="article"/>
      <div className="split even">
        <section className="card-panel">
          <Search size={22}/>
          <h2>Looking for work</h2>
          <ol className="steps">
            <li><strong>Your area is found for you.</strong> Allow location, or tap your city. Change it any time.</li>
            <li><strong>Pick a distance and type of work.</strong> Closest jobs come first.</li>
            <li><strong>Compare pay, hours and place.</strong> Save the ones you like.</li>
            <li><strong>Make contact.</strong> Call the poster, or apply on the job site for listings from other boards.</li>
            <li><strong>Need a CV?</strong> Use the free CV builder and download it as a PDF or Word file.</li>
          </ol>
          <a className="btn btn-primary" href="find-work.html">Find work <ArrowRight size={16}/></a>
        </section>
        <section className="card-panel">
          <Plus size={22}/>
          <h2>Looking to hire</h2>
          <ol className="steps">
            <li><strong>Open a business account.</strong> Free to join.</li>
            <li><strong>Post a shift.</strong> Duties, place, date and an hourly rate in rand.</li>
            <li><strong>Book workers.</strong> Check their profile, skills and CV.</li>
            <li><strong>Pay into escrow.</strong> Released to the worker’s bank after the shift, or pay cash.</li>
          </ol>
          <a className="btn btn-dark" href="account.html?signup=1&type=business">Hire workers <Plus size={16}/></a>
        </section>
      </div>
      <p className="hint-box">Distances are straight-line estimates. Shift pay held in escrow is managed by TradeSafe, a registered South African escrow provider; Community Work never holds the money itself.</p>
    </div>
  );
}

function About() {
  return (
    <div className="page">
      <PageHead tag="About" title="Opportunity shouldn’t feel far away." description="A place for South Africans to find work nearby or online, and for local businesses to find people in their area."/>
      <div className="split even">
        <section className="card-panel"><h2>Every city. Every town.</h2><p className="prose-text">Search works in all nine provinces. Community posts use the workplace’s exact position, so towns don’t need to be on a preset list. In-person and online listings from established job boards fill the gaps while local posts grow.</p><a className="btn btn-primary" href="find-work.html">Explore jobs</a></section>
        <section className="card-panel"><h2>Clear from the start.</h2><p className="prose-text">Community posts show pay, hours and location up front. Listings from other job boards link to the original advert, where you apply.</p><p className="hint-box">We’re an early-stage platform. We don’t claim business partnerships or guarantee employment.</p></section>
      </div>
    </div>
  );
}

const faqs: [string, string][] = [
  ['How does the app find my area?', 'When you open it, the app asks your phone or browser for your location. If that’s blocked, slow or outside South Africa, it estimates your area from your network. You can always tap your area at the top to choose a city or search an address.'],
  ['My location isn’t working.', 'Allow location for this site or app in your phone settings, then tap “Use my current location”. Or just tap your city — that works without GPS.'],
  ['Where do the online and in-person jobs come from?', 'Besides community posts, listings come from public job boards such as Remotive, Jobicy, Himalayas, Remote OK, Working Nomads and We Work Remotely. Tap Apply to open the original advert and apply there. Listings refresh several times a day.'],
  ['How do I make a CV?', 'Open CV builder from the menu. Fill in your details, choose a template and colour, then download a PDF or Word file. Everything stays on your device, and you can export a save file to keep editing later.'],
  ['Why am I seeing no jobs?', 'Your filters may be too narrow. Choose “Anywhere in SA”, clear the category or search, and check the In person and Online tabs.'],
  ['How is distance calculated?', 'It’s the straight-line distance between your area and the workplace. Travel by road will be longer.'],
  ['How do hourly and total pay work?', 'Hourly pay is multiplied by the hours to estimate the shift total. Total-job pay is divided by the hours when filtering by hourly pay.'],
  ['How do shifts and pay work?', 'A business posts a shift with an hourly rate. You apply with your profile and CV. If they book you on an escrow shift, they pay the full amount to TradeSafe, a South African escrow company, before you start. After the shift the hours are confirmed and the money is paid into your bank account. Cash shifts are paid in person by the business.'],
  ['Can I be paid with PayPal, Wise or Cash App?', 'Escrow pay goes to a South African bank account, because that’s how licensed escrow works here. Cash App isn’t available in South Africa. If you and the business agree, cash shifts are paid in person.'],
  ['Who can see my CV?', 'Only you, the businesses you apply to, and our support team. Delete or replace it in your account any time.'],
  ['What if there’s a problem with a shift?', 'Tap “Report a problem” on the shift. The money stays held while our team looks at what happened, then it’s released to the worker or refunded to the business.'],
  ['How do I report a problem?', 'Use the issue tracker below for technical problems. Don’t post bank details, ID documents or private addresses in a public issue.'],
];

function Help() {
  return (
    <div className="page reading">
      <PageHead tag="Help & safety" title="A little help along the way."/>
      {faqs.map(([q, a]) => <details className="faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}
      <AdSlot spot="article"/>
      <section className="card-panel" id="safety">
        <ShieldCheck size={22}/>
        <h2>Before you agree to work</h2>
        <p className="prose-text">Confirm who is hiring, the exact workplace, duties, hours and pay. Never pay anyone to get a job, and never share bank logins or ID documents through a job ad. If something feels wrong, stop and check the employer independently.</p>
        <a className="btn btn-outline" href="https://github.com/Zayaiken21/South-Africa-Community-Work/issues" target="_blank" rel="noreferrer">Report a technical issue <ArrowUpRight size={15}/></a>
      </section>
    </div>
  );
}

function Privacy() {
  const [cleared, setCleared] = useState(false);
  return (
    <div className="page reading">
      <PageHead tag="Privacy" title="Know what you share." description="How this version uses information. Updated 28 October 2026."/>
      <section className="card-panel prose">
        <h2>Your location</h2>
        <p>When you open the app it asks your device for your location to show nearby jobs. If location is blocked or unavailable, it estimates your area from your internet connection using GeoJS or ipapi. Your chosen area is saved on this device. Searches send coordinates to our jobs service to calculate distances. We don’t keep a history of your location.</p>
        <h2>Your account</h2>
        <p>When you create an account we store your email, name, account type and anything you add to your profile: headline, description, skills, phone, city and province. Businesses also store their business name and, optionally, registration number. Accounts are hosted by Supabase. Passwords are stored hashed; we never see them.</p>
        <h2>Your profile page</h2>
        <p>Your profile page (photo, name, headline, description, skills, experience, availability, languages, area and shifts completed) is visible to signed-in Community Work members. Your phone number is shown only to people you’re booked with. Profile photos are stored as public images so they can load quickly; don’t upload anything you wouldn’t show on a public profile. Suspended accounts are hidden.</p>
        <h2>Your CV</h2>
        <p>A CV you upload is stored privately. Only you, businesses whose shifts you apply to, and our support team can open it, through links that expire after two minutes. Replacing or removing it deletes the old file.</p>
        <h2>Shifts and applications</h2>
        <p>Shift details are shown to workers; the exact street address and phone numbers are shared only once a worker is booked. When you apply, the business sees your profile, skills and CV.</p>
        <h2>Payments</h2>
        <p>Escrow payments are handled by TradeSafe Escrow (Pty) Ltd. To pay or be paid, your name, SA ID number, mobile number and (for workers) bank details are sent to TradeSafe to meet South African financial rules (FICA). We don’t store your ID or bank account numbers; we keep only the last four digits and the payment status.</p>
        <h2>Usage statistics</h2>
        <p>We count page views and clicks on jobs and sponsored links to improve the service and report to partners. These records use a random code stored on your device, not your name, and are kept for up to 13 months. If you accept analytics cookies, Google Analytics also measures visits; you can say no and everything still works.</p>
        <h2>Listings from other job boards</h2>
        <p>In-person and online listings come from public job boards (such as Remotive, Jobicy, Himalayas, Remote OK, Working Nomads and We Work Remotely). When you tap Apply you leave this app, and that site’s own privacy policy applies.</p>
        <h2>CV builder</h2>
        <p>What you type into the CV builder stays in this browser on your device. Your PDF or Word file is created on your device too; nothing is uploaded.</p>
        <h2>Advertising</h2>
        <p>Community Work is free because of advertising. We use Google AdSense, which may use cookies and your device’s advertising ID to show ads, including ads based on your interests, and to measure them. Google and its partners act on their own privacy policies; see <a className="link" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noreferrer">how Google uses information from sites that use its services</a>. You can turn off personalised ads at <a className="link" href="https://adssettings.google.com" target="_blank" rel="noreferrer">Google’s Ad Settings</a>. Google ads are labelled “Advertisement”.</p>
        <h2>Sponsored and affiliate links</h2>
        <p>Cards and bars labelled “Sponsored” link to partners who may pay us a commission when you view, click or sign up. Their sites have their own privacy policies and may use cookies to track the referral. We don’t share your saved jobs or CV with them.</p>
        <h2>Service providers</h2>
        <p>GitHub Pages hosts the app. Supabase hosts accounts, shifts and usage statistics. TradeSafe handles escrow payments. Place search and place names use Photon (Komoot) with OpenStreetMap data. These services receive the network information needed to work.</p>
        <h2>Your device data</h2>
        <p>Saved jobs and your area stay on this device. You can clear them here, along with your analytics choice. To delete your account and everything in it, email us from your account address.</p>
        <button className="btn btn-outline" onClick={() => { try { ['cw-location', 'cw-saved-ids', 'cw-saved-jobs', 'cw-radius', 'cw-radius-v2', 'cw-consent', 'cw-vid'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ } setCleared(true); }}>
          {cleared ? <><Check size={16}/>Cleared</> : 'Clear my saved area and jobs'}
        </button>
      </section>
    </div>
  );
}

function Terms() {
  return (
    <div className="page reading">
      <PageHead tag="Terms" title="Clear expectations for everyone." description="Basic conditions for using this early-access platform. Updated 28 October 2026."/>
      <section className="card-panel prose">
        <h2>Finding work and contacting posters</h2>
        <p>Community Work shows job opportunities. Viewing or posting a job doesn’t create a booking, employment contract or payment guarantee. Posters and workers confirm details and make their own arrangements.</p>
        <h2>Listings from other job boards</h2>
        <p>Some listings come from third-party job boards and link to the original advert. We don’t control or verify them; apply and check the employer on the original site.</p>
        <h2>Accurate and authorised posts</h2>
        <p>Post only genuine jobs you’re allowed to advertise, with honest duties, pay, hours and location. No misleading, unlawful, discriminatory or abusive content, and no one else’s private information.</p>
        <h2>Location and availability</h2>
        <p>Distances use supplied coordinates and don’t guarantee travel time or identity. Jobs can be filled or change before a listing is updated.</p>
        <h2>Sponsored content</h2>
        <p>Some cards and links are sponsored or affiliate links, always labelled “Sponsored”. We may earn a commission from them. We don’t endorse or guarantee partners’ products; check them before you buy or sign up.</p>
        <h2>Shifts</h2>
        <p>Businesses set an hourly rate of at least the national minimum wage and are responsible for their obligations as the employer of the people they book, including safe working conditions. Workers agree to arrive on time and do the work described.</p>
        <h2>Escrow payments</h2>
        <p>For escrow shifts, the business pays the shift amount plus a service fee to TradeSafe when booking. TradeSafe holds the money and pays it to the worker’s bank account once the hours are confirmed by the business, or by our team after a review. Community Work does not hold funds itself. If a shift is cancelled before it starts, the payment is refunded. If there’s a dispute, the money stays held until our team decides, based on the information both sides give.</p>
        <h2>Cash shifts</h2>
        <p>For cash shifts, the business pays the worker directly. We record the shift but can’t recover unpaid cash.</p>
        <h2>Accounts</h2>
        <p>Keep your login private. We may verify, suspend or close accounts that break these terms or put others at risk.</p>
      </section>
    </div>
  );
}

function Offline() {
  return <div className="page"><div className="empty"><div className="empty-icon"><Globe size={28}/></div><h2>You’re offline</h2><p>Connect to the internet to load the latest jobs. Your saved jobs are still on this device.</p><a className="btn btn-primary" href="saved-jobs.html">Open saved jobs</a></div></div>;
}

function NotFound() {
  return <div className="page"><div className="empty"><h2>Page not found</h2><a className="btn btn-primary" href="index.html">Back to jobs</a></div></div>;
}

createRoot(document.getElementById('root')!).render(<App/>);
