import {useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {
  MapPin, Clock, Navigation, ArrowRight, ArrowLeft, Plus, Check, Bookmark, Search, ShieldCheck, Mail, Globe,
  BriefcaseBusiness, House, Menu, Download, Info, CircleHelp, Lock, FileText, ArrowUpRight, X, Users, Laptop, FileUser,
} from 'lucide-react';
import JobsView, {LocationPicker, PostForm, Sheet, useAreaLocation} from './JobsView';
import {API, money, savedJobs, setSavedJobs, toggleSaved, type CommunityJob, type SavedJob} from './catalog';
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

// ---------- Shell ----------

function App() {
  const [more, setMore] = useState(false);
  const install = useInstall();
  const tab = file === 'index.html' ? 'home' : file === 'find-work.html' ? (mode === 'remote' ? 'online' : 'jobs') : file === 'post-job.html' ? 'post' : file === 'saved-jobs.html' ? 'saved' : 'more';
  return (
    <>
      <header className="topbar">
        <a className="brand" href="index.html" aria-label="Community Work South Africa home">
          <Logo/><span>community<b>work</b><small>SOUTH AFRICA</small></span>
        </a>
        <nav className="topnav" aria-label="Main">
          <a className={tab === 'jobs' || tab === 'home' ? 'on' : ''} href="find-work.html">Find work</a>
          <a className={tab === 'online' ? 'on' : ''} href="find-work.html?mode=remote">Online jobs</a>
          <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html">Saved</a>
          <a href="cv-builder.html">CV builder</a>
          <a href="how-it-works.html">How it works</a>
        </nav>
        <div className="top-actions">
          {install && <button className="btn btn-outline btn-sm hide-sm" onClick={install}><Download size={16}/>Install app</button>}
          <a className="btn btn-primary btn-sm hide-sm" href="post-job.html"><Plus size={16}/>Post a job</a>
          <button className="icon-btn show-sm" aria-label="More" onClick={() => setMore(true)}><Menu size={22}/></button>
        </div>
      </header>

      <main className="app-main">
        {file === 'index.html' ? <JobsView welcome/>
          : file === 'find-work.html' ? <JobsView/>
          : file === 'post-job.html' ? <PostPage/>
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
          <a href="find-work.html">Find work</a><a href="find-work.html?mode=remote">Online jobs</a><a href="post-job.html">Post a job</a><a href="cv-builder.html">CV builder</a>
          <a href="how-it-works.html">How it works</a><a href="about.html">About</a><a href="help.html">Help</a><a href="privacy.html">Privacy</a><a href="terms.html">Terms</a>
        </nav>
        <small>South Africa · All nine provinces</small>
      </footer>

      <nav className="tabbar" aria-label="App">
        <a className={tab === 'home' || tab === 'jobs' ? 'on' : ''} href="index.html"><House size={22}/><span>Jobs</span></a>
        <a className={tab === 'online' ? 'on' : ''} href="find-work.html?mode=remote"><Globe size={22}/><span>Online</span></a>
        <a className={'post' + (tab === 'post' ? ' on' : '')} href="post-job.html"><span className="post-fab"><Plus size={24}/></span><span>Post</span></a>
        <a className={tab === 'saved' ? 'on' : ''} href="saved-jobs.html"><Bookmark size={22}/><span>Saved</span></a>
        <button className={tab === 'more' ? 'on' : ''} onClick={() => setMore(true)}><Menu size={22}/><span>More</span></button>
      </nav>

      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="menu-list">
            {install && <button onClick={() => { setMore(false); install(); }}><Download size={20}/>Install the app</button>}
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
  return <span className="logo" aria-hidden><i/><i/><i/><i/></span>;
}

function PageHead({tag, title, description}: {tag: string; title: string; description?: string}) {
  return <div className="page-head"><p className="overline">{tag}</p><h1>{title}</h1>{description && <p className="lede">{description}</p>}</div>;
}

// ---------- Pages ----------

function PostPage() {
  const [done, setDone] = useState(false);
  return (
    <div className="page">
      <PageHead tag="Hire in your community" title="Post a job" description="Clear pay, hours and a precise location. Workers in your hiring area see it first."/>
      <div className="split">
        <section className="card-panel">
          {done ? (
            <div className="success" role="status">
              <span className="success-icon"><Check size={30}/></span>
              <h2>Your job is live</h2>
              <p>Workers within your hiring radius can now see it and contact you.</p>
              <a className="btn btn-primary" href="find-work.html">Browse jobs <ArrowRight size={17}/></a>
              <button className="btn btn-outline" onClick={() => setDone(false)}>Post another job</button>
            </div>
          ) : <PostForm onDone={() => { setDone(true); window.scrollTo({top: 0, behavior: 'smooth'}); }}/>}
        </section>
        <aside className="tips">
          <ShieldCheck size={22}/>
          <h2>A clear post gets better replies</h2>
          <ol>
            <li><strong>Describe the real work.</strong> Duties, experience and equipment.</li>
            <li><strong>Be upfront about pay.</strong> Hourly or a total for the job.</li>
            <li><strong>Pin the workplace.</strong> Use the street address, not where you are now.</li>
            <li><strong>Make contact easy.</strong> A business number or email you’re happy to share.</li>
          </ol>
          <a className="link" href="help.html">Need help? <ArrowRight size={15}/></a>
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
                  <span><Navigation size={17}/>{job.distance.toFixed(1)} km away</span>
                  <span><MapPin size={17}/>{job.city}</span>
                </div>
                <h3>About this job</h3>
                <p className="prose-text">{job.description}</p>
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
        <div className="feature"><Users size={22}/><h3>Community posts</h3><p>Shifts posted here by local businesses and people, shown to workers within the poster’s hiring area.</p></div>
        <div className="feature"><MapPin size={22}/><h3>In person across SA</h3><p>Jobs from employers around the country, sorted by how close they are to you.</p></div>
        <div className="feature"><Laptop size={22}/><h3>Online jobs</h3><p>Remote roles open to people in South Africa. Apply on the original job site.</p></div>
      </div>
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
            <li><strong>Describe the job.</strong> Title, duties and what’s needed.</li>
            <li><strong>Set pay and hours.</strong> In rand, hourly or for the whole job.</li>
            <li><strong>Pin the workplace and hiring distance.</strong></li>
            <li><strong>Publish.</strong> Nearby workers contact you directly.</li>
          </ol>
          <a className="btn btn-dark" href="post-job.html">Post a job <Plus size={16}/></a>
        </section>
      </div>
      <p className="hint-box">Distances are straight-line estimates. This app helps you find and contact jobs; it doesn’t book shifts or handle wages.</p>
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
  ['Where do the online and in-person jobs come from?', 'Besides community posts, listings come from public job boards such as Adzuna, Remotive, Jobicy and Himalayas. Tap Apply to open the original advert and apply there. Listings refresh several times a day.'],
  ['How do I make a CV?', 'Open CV builder from the menu. Fill in your details, choose a template and colour, then download a PDF or Word file. Everything stays on your device, and you can export a save file to keep editing later.'],
  ['Why am I seeing no jobs?', 'Your filters may be too narrow. Choose “Anywhere in SA”, clear the category or search, and check the In person and Online tabs.'],
  ['How is distance calculated?', 'It’s the straight-line distance between your area and the workplace. Travel by road will be longer.'],
  ['How do hourly and total pay work?', 'Hourly pay is multiplied by the hours to estimate the shift total. Total-job pay is divided by the hours when filtering by hourly pay.'],
  ['Does posting create an employment agreement?', 'No. The poster and worker agree on the work, terms and payment directly.'],
  ['How do I report a problem?', 'Use the issue tracker below for technical problems. Don’t post bank details, ID documents or private addresses in a public issue.'],
];

function Help() {
  return (
    <div className="page reading">
      <PageHead tag="Help & safety" title="A little help along the way."/>
      {faqs.map(([q, a]) => <details className="faq" key={q}><summary>{q}</summary><p>{a}</p></details>)}
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
      <PageHead tag="Privacy" title="Know what you share." description="How this version uses information. Updated 20 October 2026."/>
      <section className="card-panel prose">
        <h2>Your location</h2>
        <p>When you open the app it asks your device for your location to show nearby jobs. If location is blocked or unavailable, it estimates your area from your internet connection using GeoJS or ipapi. Your chosen area is saved on this device. Searches send coordinates to our jobs service to calculate distances. We don’t keep a history of your location.</p>
        <h2>Job listings</h2>
        <p>When you post a job, its title, description, poster name, city, province, workplace position, category, pay, hours, hiring radius, start time and contact details are stored and shown to workers in range. Only publish details you’re allowed to share.</p>
        <h2>Listings from other job boards</h2>
        <p>In-person and online listings come from public job boards (Adzuna, Remotive, Jobicy, Himalayas). When you tap Apply you leave this app, and that site’s own privacy policy applies.</p>
        <h2>CV builder</h2>
        <p>What you type into the CV builder stays in this browser on your device. Your PDF or Word file is created on your device too; nothing is uploaded.</p>
        <h2>Service providers</h2>
        <p>GitHub Pages hosts the app. A Cloudflare-backed service hosts the community jobs database. Place search and place names use Photon (Komoot) with OpenStreetMap data. These services receive the network information needed to work.</p>
        <h2>Your device data</h2>
        <p>Saved jobs and your area stay on this device. You can clear them here. This doesn’t remove published job listings.</p>
        <button className="btn btn-outline" onClick={() => { try { ['cw-location', 'cw-saved-ids', 'cw-saved-jobs', 'cw-radius', 'cw-radius-v2'].forEach(k => localStorage.removeItem(k)); } catch { /* ignore */ } setCleared(true); }}>
          {cleared ? <><Check size={16}/>Cleared</> : 'Clear my saved area and jobs'}
        </button>
      </section>
    </div>
  );
}

function Terms() {
  return (
    <div className="page reading">
      <PageHead tag="Terms" title="Clear expectations for everyone." description="Basic conditions for using this early-access platform. Updated 20 October 2026."/>
      <section className="card-panel prose">
        <h2>Finding work and contacting posters</h2>
        <p>Community Work shows job opportunities. Viewing or posting a job doesn’t create a booking, employment contract or payment guarantee. Posters and workers confirm details and make their own arrangements.</p>
        <h2>Listings from other job boards</h2>
        <p>Some listings come from third-party job boards and link to the original advert. We don’t control or verify them; apply and check the employer on the original site.</p>
        <h2>Accurate and authorised posts</h2>
        <p>Post only genuine jobs you’re allowed to advertise, with honest duties, pay, hours and location. No misleading, unlawful, discriminatory or abusive content, and no one else’s private information.</p>
        <h2>Location and availability</h2>
        <p>Distances use supplied coordinates and don’t guarantee travel time or identity. Jobs can be filled or change before a listing is updated.</p>
        <h2>Payments and disputes</h2>
        <p>This app doesn’t collect payments, hold funds or pay wages. Confirm payment terms directly. Employers remain responsible for their employment obligations.</p>
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
