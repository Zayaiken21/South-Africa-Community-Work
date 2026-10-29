/*
  The app shell, loaded on every page.
  Sets up the install prompt, service worker, analytics and growing text boxes; draws the header, menu, bottom tab bar
  and footer; and shows the page that matches the file name (index.html, find-work.html, account.html, …).
  The simple pages (job details, saved jobs, how it works, about, privacy, terms, offline, 404) live here too.
*/
import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  MapPin,
  Clock,
  Navigation,
  ArrowRight,
  ArrowLeft,
  Plus,
  Check,
  Bookmark,
  Search,
  ShieldCheck,
  Mail,
  Globe,
  BriefcaseBusiness,
  House,
  Menu,
  Download,
  Info,
  Lock,
  FileText,
  X,
  Laptop,
  FileUser,
  CalendarDays,
  LogOut,
  UserRound,
  Building2,
  Wallet,
  LifeBuoy,
  BookOpen,
} from 'lucide-react';
import JobsView, {LocationPicker, Sheet, useAreaLocation} from './JobsView';
import {AccountPage, AdminPage, ConsentBanner, ShiftsPage} from './marketplace';
import {Avatar, ProfilePage} from './profile';
import {SupportPage} from './support';
import {RulesPage} from './rules';
import {modes, staffView, useAccount} from './backend';
import {consent, gaConfigured, startTracking} from './analytics';
import {
  API,
  money,
  milesLabel,
  savedJobs,
  setSavedJobs,
  toggleSaved,
  type CommunityJob,
  type SavedJob,
} from './catalog';
import {AdSlot, HangingOffer} from './ads';
import './app.css';

/** The current page's file name; decides which page to show. */
const file = window.location.pathname.split('/').pop() || 'index.html';
/** Worker and business pages that CEO view doesn't show (the team member is sent to the dashboard instead). */
const ceoHidden = ['shifts.html', 'saved-jobs.html', 'support.html', 'help.html', 'post-job.html'];
/** ?mode=remote on Find work shows online jobs. */
const mode = new URLSearchParams(window.location.search).get('mode');

// ---------- Install as an app (Android / desktop Chrome) ----------

let deferredPrompt: any = null;
/** Parts of the page that show an "Install app" button. */
const installListeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach(f => f());
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  installListeners.forEach(f => f());
});
/** The install prompt, when the browser offers one. */
function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force(n => n + 1);
    installListeners.add(f);
    return () => {
      installListeners.delete(f);
    };
  }, []);
  return deferredPrompt
    ? async () => {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        force(n => n + 1);
      }
    : null;
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () =>
    navigator.serviceWorker
      .register('./sw.js', {updateViaCache: 'none'})
      .then(reg => reg.update())
      .catch(() => {}),
  );
  // When a new version takes over, reload once so people never keep using an old copy.
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloaded && navigator.serviceWorker.controller) {
      reloaded = true;
      location.reload();
    }
  });
}

// Text boxes grow with what people type, and wrap long lines, so they can always read everything they've written.
const grow = (el: HTMLTextAreaElement) => {
  const min = el.classList.contains('one-line') ? 48 : 110;
  el.style.height = 'auto';
  el.style.height = Math.max(min, el.scrollHeight + 2) + 'px';
};
['input', 'focusin'].forEach(ev =>
  document.addEventListener(ev, e => {
    if (e.target instanceof HTMLTextAreaElement && !e.target.closest('.randy-input')) grow(e.target);
  }),
);

// Affiliate ads only appear on the job pages: Home, Find work (in person and online) and job details.
const adPages = ['index.html', 'find-work.html', 'job.html'];
if (file !== 'admin.html') startTracking();

/** Whether to show the analytics cookie question. */
function useConsentBanner() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!consent.get()) gaConfigured().then(setShow);
  }, []);
  return {
    show,
    choose: (v: 'granted' | 'denied') => {
      consent.set(v);
      setShow(false);
    },
  };
}

// ---------- Shell ----------

function App() {
  const [more, setMore] = useState(false);
  const install = useInstall();
  const acct = useAccount();
  const banner = useConsentBanner();
  const signedIn = !!acct.session;
  const ceoView = staffView(acct.staff, acct.profile);
  const teamLabel = acct.staff === 'ceo' ? 'CEO' : 'Admin';
  // CEO view shows only the dashboard and the job pages (to check how affiliate ads look). Worker and business pages
  // send the team member back to the dashboard; "Use my own account" in the menu switches CEO view off.
  useEffect(() => {
    if (ceoView && ceoHidden.includes(file)) location.replace('account.html');
  }, [ceoView]);
  const tab =
    file === 'index.html'
      ? 'home'
      : file === 'find-work.html'
        ? mode === 'remote'
          ? 'online'
          : 'jobs'
        : file === 'shifts.html'
          ? 'shifts'
          : file === 'saved-jobs.html'
            ? 'saved'
            : file === 'support.html' || file === 'help.html'
              ? 'support'
              : file === 'account.html' || file === 'admin.html' || file === 'post-job.html' || file === 'profile.html'
                ? 'account'
                : 'more';
  return (
    <>
      <header className="topbar">
        <a className="brand" href="index.html" aria-label="Community Work South Africa home">
          <Logo />
          <span>
            community<b>work</b>
            <small>SOUTH AFRICA</small>
          </span>
        </a>
        <nav className="topnav" aria-label="Main">
          <a className={tab === 'jobs' || tab === 'home' ? 'on' : ''} href="find-work.html">
            Find work
          </a>
          {!ceoView && (
            <a className={tab === 'online' ? 'on' : ''} href="find-work.html?mode=remote">
              Online jobs
            </a>
          )}
          {ceoView ? (
            <a className={tab === 'account' ? 'on' : ''} href="account.html">
              {teamLabel} dashboard
            </a>
          ) : (
            <>
              <a className={tab === 'shifts' ? 'on' : ''} href="shifts.html">
                Shifts
              </a>
              <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html">
                Saved
              </a>
              <a href="cv-builder.html">CV builder</a>
              <a href="how-it-works.html">How it works</a>
              <a className={tab === 'support' ? 'on' : ''} href="support.html">
                Support
              </a>
            </>
          )}
        </nav>
        <div className="top-actions">
          {install && (
            <button className="btn btn-outline btn-sm hide-sm" onClick={install}>
              <Download size={16} />
              Install app
            </button>
          )}
          {signedIn ? (
            <a className="account-chip hide-sm" href="account.html" title="My account">
              {ceoView ? (
                <span className="team-chip-ic">
                  <ShieldCheck size={18} />
                </span>
              ) : (
                (() => {
                  const biz = acct.profile && modes(acct.profile).active === 'business';
                  return (
                    <Avatar
                      url={biz ? acct.profile?.business_avatar_url : acct.profile?.avatar_url}
                      name={biz ? acct.profile?.business_name : acct.profile?.full_name}
                      size={34}
                      themeId={acct.profile?.theme}
                    />
                  );
                })()
              )}
              <span>
                {ceoView ? teamLabel : acct.profile && modes(acct.profile).active === 'business' ? 'Hiring' : 'Working'}
              </span>
            </a>
          ) : (
            <>
              <a className="btn btn-outline btn-sm hide-sm" href="account.html">
                Sign in
              </a>
              <a className="btn btn-primary btn-sm hide-sm" href="account.html?signup=1&type=business">
                <Building2 size={16} />
                Hire workers
              </a>
            </>
          )}
          <button className="icon-btn show-sm" aria-label="More" onClick={() => setMore(true)}>
            <Menu size={22} />
          </button>
        </div>
      </header>

      <main className="app-main">
        {file === 'index.html' ? (
          <JobsView welcome />
        ) : file === 'find-work.html' ? (
          <JobsView />
        ) : file === 'post-job.html' ? (
          <HirePage />
        ) : file === 'shifts.html' ? (
          <ShiftsPage />
        ) : file === 'account.html' ? (
          <AccountPage />
        ) : file === 'admin.html' ? (
          <AdminPage />
        ) : file === 'profile.html' ? (
          <ProfilePage />
        ) : file === 'support.html' ? (
          <SupportPage />
        ) : file === 'rules.html' ? (
          <RulesPage />
        ) : file === 'job.html' ? (
          <Detail />
        ) : file === 'saved-jobs.html' ? (
          <Saved />
        ) : file === 'how-it-works.html' ? (
          <How />
        ) : file === 'about.html' ? (
          <About />
        ) : file === 'help.html' ? (
          <SupportPage />
        ) : file === 'privacy.html' ? (
          <Privacy />
        ) : file === 'terms.html' ? (
          <Terms />
        ) : file === 'offline.html' ? (
          <Offline />
        ) : (
          <NotFound />
        )}
      </main>

      <footer className="site-footer">
        <div>
          <a className="brand small" href="index.html">
            <Logo />
            <span>
              community<b>work</b>
            </span>
          </a>
          <p>Opportunity starts in your community.</p>
        </div>
        {!ceoView && (
          <nav aria-label="Footer">
            <a href="find-work.html">Find work</a>
            <a href="find-work.html?mode=remote">Online jobs</a>
            <a href="shifts.html">Paid shifts</a>
            <a href="account.html?signup=1&type=business">Hire workers</a>
            <a href="cv-builder.html">CV builder</a>
            <a href="how-it-works.html">How it works</a>
            <a href="about.html">About</a>
            <a href="support.html">Help & support</a>
            <a href="rules.html">Community rules</a>
            <a href="privacy.html">Privacy</a>
            <a href="terms.html">Terms</a>
          </nav>
        )}
        <small>
          South Africa · All nine provinces · Some links are sponsored or affiliate links: we may earn a commission, at
          no cost to you.
        </small>
      </footer>

      {adPages.includes(file) && <HangingOffer />}

      {ceoView ? (
        <nav className="tabbar two" aria-label="App">
          <a className={tab === 'home' || tab === 'jobs' ? 'on' : ''} href="index.html">
            <House size={22} />
            <span>Jobs</span>
          </a>

          <a className={tab === 'account' ? 'on' : ''} href="account.html">
            <ShieldCheck size={22} />
            <span>{teamLabel}</span>
          </a>
        </nav>
      ) : (
        <nav className="tabbar" aria-label="App">
          <a className={tab === 'home' || tab === 'jobs' || tab === 'online' ? 'on' : ''} href="index.html">
            <House size={22} />
            <span>Jobs</span>
          </a>
          <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html">
            <Bookmark size={22} />
            <span>Saved</span>
          </a>
          <a className={'post' + (tab === 'shifts' ? ' on' : '')} href="shifts.html">
            <span className="post-fab">
              <CalendarDays size={24} />
            </span>
            <span>Shifts</span>
          </a>
          <a className={tab === 'support' ? 'on' : ''} href="support.html">
            <LifeBuoy size={22} />
            <span>Support</span>
          </a>
          <a className={tab === 'account' ? 'on' : ''} href="account.html">
            <UserRound size={22} />
            <span>{signedIn ? 'Account' : 'Sign in'}</span>
          </a>
        </nav>
      )}

      <ConsentBanner show={banner.show} onChoose={banner.choose} />

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="menu-list">
            {install && (
              <button
                onClick={() => {
                  setMore(false);
                  install();
                }}
              >
                <Download size={20} />
                Install the app
              </button>
            )}
            {ceoView && acct.sb && (
              <>
                <button
                  onClick={async () => {
                    const {error} = await acct.sb!.rpc('set_staff_view', {p_on: false});
                    if (error) alert(error.message);
                    else location.href = 'account.html';
                  }}
                >
                  <UserRound size={20} />
                  Use my own account
                </button>
                <button onClick={() => acct.sb!.auth.signOut().then(() => location.replace('account.html'))}>
                  <LogOut size={20} />
                  Sign out
                </button>
              </>
            )}
            {acct.staff && !ceoView && (
              <a href="admin.html">
                <ShieldCheck size={20} />
                {acct.staff === 'ceo' ? 'CEO dashboard' : 'Admin dashboard'}
              </a>
            )}
            {!ceoView && (
              <>
                {!signedIn && (
                  <a href="account.html?signup=1&type=business">
                    <Building2 size={20} />
                    Hire workers for shifts
                  </a>
                )}
                <a href="cv-builder.html">
                  <FileUser size={20} />
                  Build your CV
                </a>
                <a href="how-it-works.html">
                  <BriefcaseBusiness size={20} />
                  How it works
                </a>
                <a href="about.html">
                  <Info size={20} />
                  About
                </a>
                <a href="rules.html">
                  <BookOpen size={20} />
                  Community rules
                </a>
                <a href="privacy.html">
                  <Lock size={20} />
                  Privacy
                </a>
                <a href="terms.html">
                  <FileText size={20} />
                  Terms
                </a>
              </>
            )}
          </div>
        </Sheet>
      )}
    </>
  );
}

/** The pin logo. */
function Logo() {
  return <img className="logo" src="./assets/favicon.svg?v=sa-2026" width="36" height="36" alt="" aria-hidden="true" />;
}

/** Title block at the top of simple pages. */
function PageHead({tag, title, description}: {tag: string; title: string; description?: string}) {
  return (
    <div className="page-head">
      <p className="overline">{tag}</p>
      <h1>{title}</h1>
      {description && <p className="lede">{description}</p>}
    </div>
  );
}

// ---------- Pages ----------

// The old public "Post a job" form is replaced by business accounts (shifts with hourly pay and escrow).
function HirePage() {
  return (
    <div className="page">
      <PageHead
        tag="Hire in your community"
        title="Hire workers by the shift"
        description="Open a free business account, post a shift with an hourly rate in rand, and book nearby workers for a day or a week."
      />
      <div className="split">
        <section className="card-panel">
          <ol className="steps">
            <li>
              <strong>Create a business account.</strong> Takes a minute; verified businesses get a badge.
            </li>
            <li>
              <strong>Post the shift.</strong> Duties, place, date, hours and pay per hour (at least the national
              minimum wage).
            </li>
            <li>
              <strong>Book workers.</strong> See their profile, skills and CV, then book the ones you want.
            </li>
            <li>
              <strong>Pay safely.</strong> Pay into TradeSafe escrow when you book; it’s released to the worker after
              the shift. Or pay cash on the day.
            </li>
          </ol>
          <div className="row-gap">
            <a className="btn btn-primary" href="account.html?signup=1&type=business">
              <Building2 size={17} />
              Create business account
            </a>
            <a className="btn btn-outline" href="account.html">
              Sign in
            </a>
          </div>
        </section>
        <aside className="tips">
          <Wallet size={22} />
          <h2>Why escrow?</h2>
          <p>
            Workers know the money is there before they travel, and you only release it once the hours are confirmed. If
            something goes wrong, our team reviews it before any money moves.
          </p>
          <a className="link" href="support.html">
            Questions? <ArrowRight size={15} />
          </a>
        </aside>
      </div>
    </div>
  );
}

// A job's description with an affiliate ad placed inside the text, the way news and blog sites do:
// after the first paragraph when there are several, otherwise straight after the text.
function InText({text, category}: {text: string; category: string}) {
  const paras = text
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean);
  const cut = paras.length > 1 ? 1 : paras.length;
  return (
    <>
      {paras.slice(0, cut).map((p, i) => (
        <p className="prose-text" key={i}>
          {p}
        </p>
      ))}
      <AdSlot spot="article" index={0} category={category} mode="onsite" />
      {paras.slice(cut).map((p, i) => (
        <p className="prose-text" key={'b' + i}>
          {p}
        </p>
      ))}
    </>
  );
}

/** job.html: one community post, with its affiliate ad inside the text. */
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
        if (!d.jobs.length)
          throw Error('This job has ended, is outside its hiring area for your location, or was removed.');
        setJob(d.jobs[0]);
        setError('');
      })
      .catch(e => {
        if (!ctrl.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setBusy(false);
      });
    return () => ctrl.abort();
  }, [location, id]);

  const save = () =>
    job &&
    setSaved(
      toggleSaved({
        key: 'community:' + job.id,
        title: job.title,
        company: job.business,
        place: `${job.city}, ${job.province}`,
        href: 'job.html?id=' + encodeURIComponent(job.id),
        external: false,
        mode: 'onsite',
      }),
    );

  return (
    <div className="page">
      <a className="back" href="find-work.html">
        <ArrowLeft size={17} />
        Back to jobs
      </a>
      {!id ? (
        <div className="card-panel">
          <h1>Choose a job first</h1>
          <a className="btn btn-primary" href="find-work.html">
            Browse jobs
          </a>
        </div>
      ) : locating || busy ? (
        <div className="card-panel center" role="status">
          <span className="spinner" />
          Loading job…
        </div>
      ) : !location ? (
        <div className="card-panel narrow">
          <h2>Choose your area to view this job</h2>
          <p className="muted">Posters hire within a set distance, so we check you’re in range first.</p>
          <LocationPicker onSelect={choose} />
        </div>
      ) : error ? (
        <div className="card-panel narrow" role="alert">
          <h2>Job unavailable</h2>
          <p className="muted">{error}</p>
          <a className="btn btn-primary" href="find-work.html">
            Find other work
          </a>
        </div>
      ) : job ? (
        <>
          <div className="page-head">
            <p className="overline">{job.category} · Community post</p>
            <h1>{job.title}</h1>
            <p className="lede">
              {job.business} · {job.city}, {job.province}
            </p>
          </div>
          <div className="split">
            <section className="card-panel">
              <div className="big-pay">
                {money(job.pay)}
                <span> / {job.payType === 'hour' ? 'hour' : 'job'}</span>
              </div>
              <p className="muted">
                {job.payType === 'hour'
                  ? `About ${money(job.pay * job.hours)} for the shift`
                  : `About ${money(job.hourly)} per hour`}
              </p>
              <div className="stat-row">
                <span>
                  <Clock size={17} />
                  {job.hours} hours
                </span>
                <span>
                  <Navigation size={17} />
                  {milesLabel(job.distance)} away
                </span>
                <span>
                  <MapPin size={17} />
                  {job.city}
                </span>
              </div>
              <h3>About this job</h3>
              <InText text={job.description} category={job.category} />
              <h3>When</h3>
              <p className="prose-text">
                {new Date(job.start).toLocaleString('en-ZA', {
                  timeZone: 'Africa/Johannesburg',
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}{' '}
                SAST
              </p>
              <button className={'btn ' + (saved ? 'btn-dark' : 'btn-outline')} onClick={save}>
                <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
                {saved ? 'Saved' : 'Save job'}
              </button>
            </section>
            <aside className="card-panel contact">
              <Mail size={22} />
              <h2>Contact {job.business}</h2>
              <p className="contact-value">{job.contact}</p>
              <p className="hint-box">
                Contacting the poster doesn’t book the shift. Agree on the work, pay, hours and exact address first.
              </p>
              <a className="link" href="cv-builder.html">
                <FileUser size={15} />
                No CV yet? Build one free
              </a>
              <a className="link" href="support.html#safety">
                Tips for staying safe
              </a>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** saved-jobs.html: jobs saved on this device. */
function Saved() {
  const [list, setList] = useState<SavedJob[]>(() => savedJobs());
  useEffect(() => {
    const f = () => setList(savedJobs());
    window.addEventListener('cw-saved', f);
    return () => window.removeEventListener('cw-saved', f);
  }, []);
  const remove = (key: string) => setSavedJobs(list.filter(s => s.key !== key));
  return (
    <div className="page">
      <PageHead
        tag="Your shortlist"
        title="Saved jobs"
        description="Saved on this device. Open a job to check it’s still available."
      />
      {!list.length ? (
        <div className="empty">
          <div className="empty-icon">
            <Bookmark size={28} />
          </div>
          <h2>Nothing saved yet</h2>
          <p>Tap the bookmark on any job to keep it here.</p>
          <a className="btn btn-primary" href="find-work.html">
            Find work <ArrowRight size={17} />
          </a>
        </div>
      ) : (
        <div className="saved-list">
          {list.map(s => (
            <div className="saved-row" key={s.key}>
              <span className={'avatar ' + s.mode}>
                {s.mode === 'remote' ? <Globe size={18} /> : <MapPin size={18} />}
              </span>
              <a href={s.href} {...(s.external ? {target: '_blank', rel: 'noopener noreferrer nofollow'} : {})}>
                <strong>{s.title}</strong>
                <span>{[s.company, s.place].filter(Boolean).join(' · ') || 'Open to see the details'}</span>
              </a>
              <button className="icon-btn" aria-label={'Remove ' + s.title} onClick={() => remove(s.key)}>
                <X size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** how-it-works.html. */
function How() {
  return (
    <div className="page">
      <PageHead
        tag="How it works"
        title="Local work. Clear next steps."
        description="Three kinds of jobs in one place: community shifts, in-person jobs across South Africa, and online work."
      />
      <div className="three">
        <div className="feature">
          <CalendarDays size={22} />
          <h3>Paid shifts</h3>
          <p>Local businesses book workers by the day, at an hourly rate set up front, with pay secured in escrow.</p>
        </div>
        <div className="feature">
          <MapPin size={22} />
          <h3>In person across SA</h3>
          <p>Jobs from employers around the country, sorted by how close they are to you.</p>
        </div>
        <div className="feature">
          <Laptop size={22} />
          <h3>Online jobs</h3>
          <p>Remote roles open to people in South Africa. Apply on the original job site.</p>
        </div>
      </div>
      <div className="split even">
        <section className="card-panel">
          <Search size={22} />
          <h2>Looking for work</h2>
          <ol className="steps">
            <li>
              <strong>Your area is found for you.</strong> Allow location, or tap your city. Change it any time.
            </li>
            <li>
              <strong>Pick a distance and type of work.</strong> Closest jobs come first.
            </li>
            <li>
              <strong>Compare pay, hours and place.</strong> Save the ones you like.
            </li>
            <li>
              <strong>Make contact.</strong> Call the poster, or apply on the job site for listings from other boards.
            </li>
            <li>
              <strong>Need a CV?</strong> Use the free CV builder and download it as a PDF or Word file.
            </li>
          </ol>
          <a className="btn btn-primary" href="find-work.html">
            Find work <ArrowRight size={16} />
          </a>
        </section>
        <section className="card-panel">
          <Plus size={22} />
          <h2>Looking to hire</h2>
          <ol className="steps">
            <li>
              <strong>Open a business account.</strong> Free to join.
            </li>
            <li>
              <strong>Post a shift.</strong> Duties, place, date and an hourly rate in rand.
            </li>
            <li>
              <strong>Book workers.</strong> Check their profile, skills and CV.
            </li>
            <li>
              <strong>Pay into escrow.</strong> Released to the worker’s bank after the shift, or pay cash.
            </li>
          </ol>
          <a className="btn btn-dark" href="account.html?signup=1&type=business">
            Hire workers <Plus size={16} />
          </a>
        </section>
      </div>
      <p className="hint-box">
        Distances are straight-line estimates. Shift pay held in escrow is managed by TradeSafe, a registered South
        African escrow provider; Community Work never holds the money itself.
      </p>
    </div>
  );
}

/** about.html. */
function About() {
  return (
    <div className="page">
      <PageHead
        tag="About"
        title="Opportunity shouldn’t feel far away."
        description="A place for South Africans to find work nearby or online, and for local businesses to find people in their area."
      />
      <div className="split even">
        <section className="card-panel">
          <h2>Every city. Every town.</h2>
          <p className="prose-text">
            Search works in all nine provinces. Community posts use the workplace’s exact position, so towns don’t need
            to be on a preset list. In-person and online listings from established job boards fill the gaps while local
            posts grow.
          </p>
          <a className="btn btn-primary" href="find-work.html">
            Explore jobs
          </a>
        </section>
        <section className="card-panel">
          <h2>Clear from the start.</h2>
          <p className="prose-text">
            Community posts show pay, hours and location up front. Listings from other job boards link to the original
            advert, where you apply.
          </p>
          <p className="hint-box">
            We’re an early-stage platform. We don’t claim business partnerships or guarantee employment.
          </p>
        </section>
      </div>
    </div>
  );
}

/** privacy.html. */
function Privacy() {
  const [cleared, setCleared] = useState(false);
  return (
    <div className="page reading">
      <PageHead
        tag="Privacy"
        title="Know what you share."
        description="How this version uses information. Updated 28 October 2026."
      />
      <section className="card-panel prose">
        <h2>Your location</h2>
        <p>
          When you open the app it asks your device for your location to show nearby jobs. If location is blocked or
          unavailable, it estimates your area from your internet connection using GeoJS or ipapi. Your chosen area is
          saved on this device. Searches send coordinates to our jobs service to calculate distances. We don’t keep a
          history of your location.
        </p>
        <h2>Your account</h2>
        <p>
          When you create an account we store your email, name, account type and anything you add to your profile:
          headline, description, skills, phone, city and province. Businesses also store their business name and,
          optionally, registration number. Accounts are hosted by Supabase. Passwords are stored hashed; we never see
          them.
        </p>
        <h2>Your profile page</h2>
        <p>
          Your profile page (photo, name, headline, description, skills, experience, availability, languages, area and
          shifts completed) is visible to signed-in Community Work members. Your phone number is shown only to people
          you’re booked with. Profile photos are stored as public images so they can load quickly; don’t upload anything
          you wouldn’t show on a public profile. Suspended accounts are hidden.
        </p>
        <h2>Your CV</h2>
        <p>
          A CV you upload is stored privately. Only you, businesses whose shifts you apply to, and our support team can
          open it, through links that expire after two minutes. Replacing or removing it deletes the old file.
        </p>
        <h2>Shifts and applications</h2>
        <p>
          Shift details are shown to workers; the exact street address and phone numbers are shared only once a worker
          is booked. When you apply, the business sees your profile, skills and CV.
        </p>
        <h2>Payments</h2>
        <p>
          Escrow payments are handled by TradeSafe Escrow (Pty) Ltd. To pay or be paid, your name, SA ID number, mobile
          number and (for workers) bank details are sent to TradeSafe to meet South African financial rules (FICA). We
          don’t store your ID or bank account numbers; we keep only the last four digits and the payment status.
        </p>
        <h2>Usage statistics</h2>
        <p>
          We count page views and clicks on jobs and sponsored links to improve the service and report to partners.
          These records use a random code stored on your device, not your name, and are kept for up to 13 months. If you
          accept analytics cookies, Google Analytics also measures visits; you can say no and everything still works.
        </p>
        <h2>Listings from other job boards</h2>
        <p>
          In-person listings come from employers’ own careers pages, and online listings from public job boards (such as
          Remotive, Jobicy, Himalayas, Remote OK, Working Nomads and We Work Remotely). When you tap Apply you leave
          this app, and that site’s own privacy policy applies.
        </p>
        <h2>CV builder</h2>
        <p>
          What you type into the CV builder stays in this browser on your device. Your PDF or Word file is created on
          your device too; nothing is uploaded.
        </p>
        <h2>Support chats</h2>
        <p>
          Messages you send to our support team are kept while your chat is open, so you can carry on after closing the
          page or signing out. A chat is deleted completely 24 hours after it’s closed. Chats that are paused for 24
          hours close automatically.
        </p>
        <h2>Affiliate ads</h2>
        <p>
          Community Work is free because of affiliate ads. Ads labelled “Sponsored” on the job pages link to partners
          who may pay us a commission when you click or sign up. Their sites have their own privacy policies and may use
          cookies to track the referral. We count views and clicks on these ads anonymously, and we never share your
          saved jobs, profile or CV with partners.
        </p>
        <h2>Service providers</h2>
        <p>
          GitHub Pages hosts the app. Supabase hosts accounts, shifts and usage statistics. TradeSafe handles escrow
          payments. Place search and place names use Photon (Komoot) with OpenStreetMap data. These services receive the
          network information needed to work.
        </p>
        <h2>Your device data</h2>
        <p>
          Saved jobs and your area stay on this device. You can clear them here, along with your analytics choice. To
          delete your account and everything in it, email us from your account address.
        </p>
        <button
          className="btn btn-outline"
          onClick={() => {
            try {
              [
                'cw-location',
                'cw-saved-ids',
                'cw-saved-jobs',
                'cw-radius',
                'cw-radius-v2',
                'cw-consent',
                'cw-vid',
              ].forEach(k => localStorage.removeItem(k));
            } catch {
              /* ignore */
            }
            setCleared(true);
          }}
        >
          {cleared ? (
            <>
              <Check size={16} />
              Cleared
            </>
          ) : (
            'Clear my saved area and jobs'
          )}
        </button>
      </section>
    </div>
  );
}

/** terms.html. */
function Terms() {
  return (
    <div className="page reading">
      <PageHead
        tag="Terms"
        title="Clear expectations for everyone."
        description="Basic conditions for using this early-access platform. Updated 28 October 2026."
      />
      <section className="card-panel prose">
        <h2>Finding work and contacting posters</h2>
        <p>
          Community Work shows job opportunities. Viewing or posting a job doesn’t create a booking, employment contract
          or payment guarantee. Posters and workers confirm details and make their own arrangements.
        </p>
        <h2>Listings from other job boards</h2>
        <p>
          Some listings come from third-party job boards and link to the original advert. We don’t control or verify
          them; apply and check the employer on the original site.
        </p>
        <h2>Accurate and authorised posts</h2>
        <p>
          Post only genuine jobs you’re allowed to advertise, with honest duties, pay, hours and location. No
          misleading, unlawful, discriminatory or abusive content, and no one else’s private information.
        </p>
        <h2>Location and availability</h2>
        <p>
          Distances use supplied coordinates and don’t guarantee travel time or identity. Jobs can be filled or change
          before a listing is updated.
        </p>
        <h2>Sponsored content</h2>
        <p>
          Some cards and links are sponsored or affiliate links, always labelled “Sponsored”. We may earn a commission
          from them. We don’t endorse or guarantee partners’ products; check them before you buy or sign up.
        </p>
        <h2>Shifts</h2>
        <p>
          Businesses set an hourly rate of at least the national minimum wage and are responsible for their obligations
          as the employer of the people they book, including safe working conditions. Workers agree to arrive on time
          and do the work described.
        </p>
        <h2>Escrow payments</h2>
        <p>
          For escrow shifts, the business pays the shift amount plus a service fee to TradeSafe when booking. TradeSafe
          holds the money and pays it to the worker’s bank account once the hours are confirmed by the business, or by
          our team after a review. Community Work does not hold funds itself. If a shift is cancelled before it starts,
          the payment is refunded. If there’s a dispute, the money stays held until our team decides, based on the
          information both sides give.
        </p>
        <h2>Cash shifts</h2>
        <p>
          For cash shifts, the business pays the worker directly. We record the shift but can’t recover unpaid cash.
        </p>
        <h2>Accounts</h2>
        <p>
          Keep your login private. We may verify, suspend or close accounts that break these terms or put others at
          risk.
        </p>
      </section>
    </div>
  );
}

/** offline.html, shown when there's no connection. */
function Offline() {
  return (
    <div className="page">
      <div className="empty">
        <div className="empty-icon">
          <Globe size={28} />
        </div>
        <h2>You’re offline</h2>
        <p>Connect to the internet to load the latest jobs. Your saved jobs are still on this device.</p>
        <a className="btn btn-primary" href="saved-jobs.html">
          Open saved jobs
        </a>
      </div>
    </div>
  );
}

/** 404.html. */
function NotFound() {
  return (
    <div className="page">
      <div className="empty">
        <h2>Page not found</h2>
        <a className="btn btn-primary" href="index.html">
          Back to jobs
        </a>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
