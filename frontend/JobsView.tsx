import {useEffect, useMemo, useRef, useState} from 'react';
import {
  MapPin, Search, SlidersHorizontal, LoaderCircle, Navigation, Bookmark, ArrowUpRight, Globe, X, Check, Plus,
  BriefcaseBusiness, ChevronDown, LocateFixed, RefreshCw, Users, Laptop, Building2, FileUser, ArrowRight,
} from 'lucide-react';
import {provinces, categories as postCategories} from '../lib/jobs';
import {LocationPicker} from './LocationPicker';
import {autoLocate} from './location';
import {AdSlot} from './ads';
import {Fragment} from 'react';
import {
  API, FEED_URL, browseCategories, money, ago, when, distanceKm, readStore, writeStore, savedJobs, toggleSaved,
  type Location, type CommunityJob, type Feed, type Listing,
} from './catalog';
export {LocationPicker} from './LocationPicker';

type Mode = 'all' | 'onsite' | 'remote';
const radii = [10, 25, 50, 100, 200, 0];
const radiusLabel = (r: number) => r ? `${r} km` : 'Anywhere in SA';
const PAGE = 24;

// ---------- Shared location state (auto-detect once, then remember) ----------

export function useAreaLocation() {
  const [location, setLocation] = useState<Location | null>(() => readStore<Location | null>('cw-location', null));
  const [locating, setLocating] = useState(false);
  const [reason, setReason] = useState<string>('');
  const tried = useRef(false);

  useEffect(() => {
    if (location || tried.current) return;
    tried.current = true;
    setLocating(true);
    autoLocate().then(r => {
      if (r.location) { setLocation(r.location); writeStore('cw-location', r.location); }
      else setReason(r.reason || 'unavailable');
    }).finally(() => setLocating(false));
  }, [location]);

  const choose = (l: Location) => { setLocation(l); setReason(''); writeStore('cw-location', l); };
  return {location, locating, reason, choose};
}

// ---------- Data ----------

function useFeed() {
  const [feed, setFeed] = useState<Feed | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch(FEED_URL, {cache: 'no-cache'})
      .then(r => { if (!r.ok) throw Error(); return r.json(); })
      .then(d => setFeed(d as Feed))
      .catch(() => setError(true));
  }, []);
  return {feed, feedError: error};
}

function useCommunityJobs(location: Location | null, radius: number, refresh: number) {
  const [jobs, setJobs] = useState<CommunityJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!location) { setJobs([]); return; }
    const ctrl = new AbortController();
    setLoading(true); setError('');
    const p = new URLSearchParams({lat: String(location.lat), lon: String(location.lon), radius: String(radius || 200), sort: 'distance'});
    fetch(API + '?' + p, {signal: ctrl.signal})
      .then(async r => { const d: any = await r.json(); if (!r.ok) throw Error(d.error || 'Community jobs could not load.'); setJobs(d.jobs || []); })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setJobs([]); } })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [location?.lat, location?.lon, radius, refresh]);
  return {community: jobs, communityLoading: loading, communityError: error};
}

function toListings(community: CommunityJob[], feed: Feed | null, location: Location | null): Listing[] {
  const a: Listing[] = community.map(j => ({
    key: 'community:' + j.id, kind: 'community', mode: 'onsite', title: j.title, company: j.business,
    place: `${j.city}, ${j.province}`, category: j.category, excerpt: j.description.slice(0, 220),
    payLabel: `${money(j.pay)} / ${j.payType === 'hour' ? 'hr' : 'job'}`,
    paySub: j.payType === 'hour' ? `${j.hours} h · about ${money(j.pay * j.hours)}` : `${j.hours} h · ${money(j.hourly)}/hr`,
    hourly: j.hourly, distance: j.distance, date: j.createdAt || Date.parse(j.start),
    dateLabel: 'Starts ' + when(j.start), href: 'job.html?id=' + encodeURIComponent(j.id), external: false,
  }));
  const b: Listing[] = (feed?.jobs || []).map(j => ({
    key: j.id, kind: 'feed', mode: j.mode, title: j.title, company: j.company, place: j.location, category: j.category,
    excerpt: j.excerpt, payLabel: j.salary, paySub: j.type, hourly: j.hourlyZar,
    distance: location && j.lat != null && j.lon != null ? distanceKm(location.lat, location.lon, j.lat, j.lon) : undefined,
    date: Date.parse(j.posted), dateLabel: ago(Date.parse(j.posted)), href: j.url, external: true, source: j.source, sourceUrl: j.sourceUrl,
  }));
  return [...a, ...b];
}

// ---------- Feed ----------

export default function JobsView({welcome = false}: {welcome?: boolean}) {
  const initialMode = (new URLSearchParams(window.location.search).get('mode') as Mode) || 'all';
  const {location, locating, reason, choose} = useAreaLocation();
  const [mode, setMode] = useState<Mode>(['all', 'onsite', 'remote'].includes(initialMode) ? initialMode : 'all');
  const [radius, setRadius] = useState<number>(() => readStore('cw-radius-v2', 0));
  const [category, setCategory] = useState('');
  const [query, setQuery] = useState('');
  const [minPay, setMinPay] = useState('');
  const [sort, setSort] = useState<'best' | 'newest' | 'pay'>('best');
  const [shown, setShown] = useState(PAGE);
  const [sheet, setSheet] = useState<'' | 'location' | 'filters'>('');
  const [refresh, setRefresh] = useState(0);
  const [saved, setSaved] = useState(() => new Set(savedJobs().map(s => s.key)));

  const {feed, feedError} = useFeed();
  const {community, communityLoading, communityError} = useCommunityJobs(location, radius, refresh);

  useEffect(() => writeStore('cw-radius-v2', radius), [radius]);
  useEffect(() => setShown(PAGE), [mode, radius, category, query, minPay, sort, location]);
  useEffect(() => {
    const sync = () => setSaved(new Set(savedJobs().map(s => s.key)));
    window.addEventListener('cw-saved', sync);
    return () => window.removeEventListener('cw-saved', sync);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (mode === 'all') url.searchParams.delete('mode'); else url.searchParams.set('mode', mode);
    history.replaceState(null, '', url);
  }, [mode]);

  const all = useMemo(() => toListings(community, feed, location), [community, feed, location]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const min = Number(minPay) || 0;
    return all.filter(l => {
      if (category && l.category !== category) return false;
      if (q && !`${l.title} ${l.company} ${l.place} ${l.excerpt}`.toLowerCase().includes(q)) return false;
      if (min && !(l.hourly && l.hourly >= min)) return false;
      if (l.mode === 'onsite' && location && radius && l.kind === 'feed') {
        if (l.distance == null || l.distance > radius) return false;
      }
      return true;
    });
  }, [all, category, query, minPay, radius, location]);

  const counts = useMemo(() => ({
    all: matches.length,
    onsite: matches.filter(l => l.mode === 'onsite').length,
    remote: matches.filter(l => l.mode === 'remote').length,
  }), [matches]);

  const list = useMemo(() => {
    const out = matches.filter(l => mode === 'all' || l.mode === mode);
    const near = (l: Listing) => (l.mode === 'remote' ? 1e6 : l.distance ?? 5e5);
    out.sort((a, b) => {
      if (sort === 'newest') return b.date - a.date;
      if (sort === 'pay') return (b.hourly || 0) - (a.hourly || 0) || b.date - a.date;
      // Best match: community posts near you first, then nearest in-person, then the newest online roles.
      if (a.kind !== b.kind && a.kind === 'community') return -1;
      if (a.kind !== b.kind && b.kind === 'community') return 1;
      return location ? near(a) - near(b) || b.date - a.date : (a.mode === b.mode ? b.date - a.date : a.mode === 'onsite' ? -1 : 1);
    });
    return out;
  }, [matches, mode, sort, location]);

  const filterCount = (radius ? 1 : 0) + (minPay ? 1 : 0) + (category ? 1 : 0);
  const loading = !feed && !feedError;
  const area = location ? location.label.split(',')[0] : '';

  function save(l: Listing) {
    toggleSaved({key: l.key, title: l.title, company: l.company, place: l.place, href: l.href, external: l.external, mode: l.mode});
  }

  return (
    <div className="feed-page">
      {welcome && (
        <section className="welcome">
          <div>
            <p className="overline"><span className="live-dot"/> Jobs across all nine provinces</p>
            <h1>Good work,<br/>closer to <em>home.</em></h1>
            <p className="lede">Shifts from your community, in-person jobs across South Africa, and online work you can do from anywhere.</p>
          </div>
          <div className="welcome-stats" aria-label="What you can find">
            <div><Users size={20}/><strong>Community</strong><span>Local shifts posted here</span></div>
            <div><Building2 size={20}/><strong>In person</strong><span>Employers across SA</span></div>
            <div><Laptop size={20}/><strong>Online</strong><span>Remote roles open to SA</span></div>
          </div>
        </section>
      )}

      <section className="feed-tools" aria-label="Search and filters">
        <div className="tools-top">
          {!welcome && <h1 className="feed-title">Find work</h1>}
          <button className={'location-chip' + (location ? '' : ' unset')} onClick={() => setSheet('location')}>
            {locating ? <LoaderCircle className="spin" size={16}/> : <MapPin size={16}/>}
            <span>{locating ? 'Finding your area…' : location ? location.label : 'Set your area'}</span>
            <ChevronDown size={15}/>
          </button>
        </div>
        <div className="search-row">
          <label className="search-box big">
            <Search size={19}/>
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Job title, company or skill" aria-label="Search jobs" enterKeyHint="search"/>
            {query && <button className="icon-btn" aria-label="Clear search" onClick={() => setQuery('')}><X size={17}/></button>}
          </label>
          <button className={'btn btn-outline filter-btn' + (filterCount ? ' on' : '')} onClick={() => setSheet('filters')} aria-label="Filters">
            <SlidersHorizontal size={18}/><span className="hide-sm">Filters</span>{filterCount > 0 && <span className="pill-count">{filterCount}</span>}
          </button>
        </div>
        <div className="segmented" role="tablist" aria-label="Work type">
          {([['all', 'All jobs', BriefcaseBusiness], ['onsite', 'In person', MapPin], ['remote', 'Online', Globe]] as const).map(([m, label, Icon]) => (
            <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
              <Icon size={16}/>{label}<span className="seg-count">{loading ? '·' : counts[m]}</span>
            </button>
          ))}
        </div>
        <div className="chip-scroll" role="group" aria-label="Category">
          <button className={!category ? 'on' : ''} onClick={() => setCategory('')}>All types</button>
          {browseCategories.map(c => <button key={c} className={category === c ? 'on' : ''} onClick={() => setCategory(category === c ? '' : c)}>{c}</button>)}
        </div>
      </section>

      <div className="feed-layout">
        <div className="feed-main">
          {!location && !locating && (
            <div className="banner">
              <LocateFixed size={22}/>
              <div>
                <strong>{reason === 'outside' ? 'You seem to be outside South Africa' : 'Set your area for jobs near you'}</strong>
                <span>{reason === 'denied' ? 'Location is blocked, so pick your city instead.' : 'We’ll show distances and local community shifts. Online jobs work from anywhere.'}</span>
              </div>
              <button className="btn btn-primary btn-sm" onClick={() => setSheet('location')}>Choose area</button>
            </div>
          )}
          {location?.approx && (
            <button className="banner subtle" onClick={() => setSheet('location')}>
              <MapPin size={18}/><div><span>Showing jobs around <strong>{area}</strong> based on your network. Tap to set your exact area.</span></div>
            </button>
          )}

          <div className="results-bar">
            <span>
              <strong>{loading ? 'Loading jobs…' : `${list.length.toLocaleString('en-ZA')} ${list.length === 1 ? 'job' : 'jobs'}`}</strong>
              {location && mode !== 'remote' && <span className="muted"> · {radius ? `within ${radius} km of ${area}` : `nearest to ${area}`}</span>}
              {communityLoading && <LoaderCircle className="spin inline" size={14}/>}
            </span>
            <label className="sort">
              <span className="hide-sm">Sort</span>
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} aria-label="Sort jobs">
                <option value="best">{location ? 'Closest first' : 'Best match'}</option>
                <option value="newest">Newest</option>
                <option value="pay">Highest pay</option>
              </select>
            </label>
          </div>

          {welcome && (
            <a className="cv-promo" href="cv-builder.html">
              <span className="cv-promo-icon"><FileUser size={22}/></span>
              <span><strong>No CV yet? Build one in minutes</strong><small>Free · download as PDF or Word · stays on your phone</small></span>
              <ArrowRight size={18}/>
            </a>
          )}

          {communityError && location && (
            <p className="alert soft">Community shifts couldn’t load right now. <button className="link" onClick={() => setRefresh(v => v + 1)}><RefreshCw size={13}/> Retry</button></p>
          )}

          {loading ? (
            <div className="job-list">{[0, 1, 2].map(i => <div className="job-card skeleton" key={i}><span/><span/><span/></div>)}</div>
          ) : list.length === 0 ? (
            <div className="empty">
              <div className="empty-icon"><BriefcaseBusiness size={28}/></div>
              <h2>No matching jobs yet</h2>
              <p>{feedError || !feed?.updated ? 'More listings are on their way. Try again soon, or widen your search.' : 'Try a bigger distance, another category, or clear your search.'}</p>
              <div className="row-gap">
                <button className="btn btn-outline" onClick={() => { setQuery(''); setCategory(''); setMinPay(''); setRadius(0); setMode('all'); }}>Clear filters</button>
                <a className="btn btn-primary" href="post-job.html"><Plus size={17}/>Post a job</a>
              </div>
            </div>
          ) : (
            <>
              <div className="job-list">
                {list.slice(0, shown).map((l, i) => (
                  <Fragment key={l.key}>
                    <JobCard job={l} saved={saved.has(l.key)} onSave={() => save(l)}/>
                    {/* One ad after the 4th job, then every 8 jobs — never above the first results */}
                    {(i === 3 || (i > 3 && (i - 3) % 8 === 0)) && i < list.length - 1 && <AdSlot kind="feed" seed={i}/>}
                  </Fragment>
                ))}
              </div>
              {shown < list.length && <button className="btn btn-outline btn-block more" onClick={() => setShown(s => s + PAGE)}>Show more jobs</button>}
            </>
          )}

          {feed?.sources?.length ? (
            <p className="sources">
              Listings from community posters, plus {feed.sources.map((s, i) => <span key={s.name}>{i ? ', ' : ''}<a href={s.url} target="_blank" rel="noreferrer">{s.name}</a></span>)}.
              {feed.updated && <> Updated {ago(Date.parse(feed.updated)).toLowerCase()}.</>} Apply on the original site.
            </p>
          ) : null}
        </div>

        <aside className="feed-side">
          <div className="side-card mint">
            <Navigation size={20}/>
            <h3>{location ? area : 'Your area'}</h3>
            <p>{location ? `${radiusLabel(radius)} search${location.approx ? ' · approximate' : ''}` : 'Set your area to see what’s nearby.'}</p>
            <button className="btn btn-outline btn-sm" onClick={() => setSheet('location')}>{location ? 'Change area' : 'Set area'}</button>
            <small>Distances are straight-line estimates. Check your route before agreeing to work.</small>
          </div>
          <a className="side-card cv" href="cv-builder.html">
            <FileUser size={20}/>
            <h3>Build your CV</h3>
            <p>Fill in your details and download a polished CV as PDF or Word.</p>
            <span className="link">Open CV builder <ArrowRight size={15}/></span>
          </a>
          <AdSlot kind="sidebar" seed={2}/>
          <div className="side-card dark">
            <span className="overline">For local businesses</span>
            <h3>Need hands on deck?</h3>
            <p>Post a shift with clear pay and hours. Nearby workers see it first.</p>
            <a className="btn btn-light btn-sm" href="post-job.html">Post a job <ArrowUpRight size={15}/></a>
          </div>
        </aside>
      </div>

      {sheet === 'location' && (
        <Sheet title="Where do you want to work?" onClose={() => setSheet('')}>
          <LocationPicker onSelect={l => { choose(l); setSheet(''); }}/>
        </Sheet>
      )}
      {sheet === 'filters' && (
        <Sheet title="Filters" onClose={() => setSheet('')}>
          <div className="form">
            <fieldset>
              <legend>Distance from {area || 'you'}</legend>
              <div className="chip-wrap">
                {radii.map(r => <button key={r} type="button" className={radius === r ? 'on' : ''} onClick={() => setRadius(r)}>{radiusLabel(r)}</button>)}
              </div>
              {!location && <small>Set your area to use distance.</small>}
            </fieldset>
            <label className="field">Type of work
              <select value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All types</option>
                {browseCategories.map(c => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">Minimum pay per hour (R)
              <input type="number" inputMode="numeric" min="0" step="1" placeholder="Any pay" value={minPay} onChange={e => setMinPay(e.target.value)}/>
              <small>Only jobs that list pay in rand are shown when this is set.</small>
            </label>
            <div className="sheet-actions">
              <button className="btn btn-outline" onClick={() => { setRadius(0); setCategory(''); setMinPay(''); setSort('best'); }}>Reset</button>
              <button className="btn btn-primary" onClick={() => setSheet('')}>Show {list.length.toLocaleString('en-ZA')} jobs</button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function JobCard({job, saved, onSave}: {job: Listing; saved: boolean; onSave: () => void}) {
  const initials = job.company.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'CW';
  const linkProps = job.external ? {target: '_blank', rel: 'noopener noreferrer nofollow'} : {};
  return (
    <article className={'job-card' + (job.kind === 'community' ? ' community' : '')}>
      <div className="card-head">
        <span className={'avatar ' + job.mode}>{initials}</span>
        <div className="card-title">
          <h3><a href={job.href} {...linkProps}>{job.title}</a></h3>
          <p>{job.company}</p>
        </div>
        <button className={'save-btn' + (saved ? ' on' : '')} onClick={onSave} aria-pressed={saved} aria-label={saved ? 'Remove from saved' : 'Save job'}>
          <Bookmark size={19} fill={saved ? 'currentColor' : 'none'}/>
        </button>
      </div>
      <div className="tags">
        <span className={'tag ' + job.mode}>{job.mode === 'remote' ? <><Globe size={13}/>Online</> : <><MapPin size={13}/>In person</>}</span>
        {job.kind === 'community' && <span className="tag local"><Users size={13}/>Community post</span>}
        <span className="tag">{job.category}</span>
      </div>
      {job.excerpt && <p className="excerpt">{job.excerpt}</p>}
      <div className="meta">
        <span title={job.place}><MapPin size={14}/>{job.place}</span>
        {job.distance != null && job.mode === 'onsite' && <span><Navigation size={14}/>{job.distance < 1 ? '<1' : job.distance.toFixed(job.distance < 10 ? 1 : 0)} km</span>}
        <span>{job.dateLabel}</span>
      </div>
      <div className="card-foot">
        <div className="pay">
          {job.payLabel ? <strong>{job.payLabel}</strong> : <span className="muted">Pay not listed</span>}
          {job.paySub && <small>{job.paySub}</small>}
        </div>
        <a className={'btn btn-sm ' + (job.external ? 'btn-outline' : 'btn-primary')} href={job.href} {...linkProps}>
          {job.external ? <>Apply<ArrowUpRight size={15}/></> : 'View job'}
        </a>
      </div>
      {job.source && <p className="via">via <a href={job.sourceUrl} target="_blank" rel="noreferrer">{job.source}</a></p>}
    </article>
  );
}

// Bottom sheet on phones, centred dialog on larger screens.
export function Sheet({title, onClose, wide = false, children}: {title: string; onClose: () => void; wide?: boolean; children: React.ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = old; };
  }, []);
  return (
    <dialog ref={ref} className={'sheet' + (wide ? ' wide' : '')} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet-grip" aria-hidden/>
      <div className="sheet-head"><h2>{title}</h2><button className="icon-btn" aria-label="Close" onClick={onClose}><X size={22}/></button></div>
      <div className="sheet-body">{children}</div>
    </dialog>
  );
}

// ---------- Posting form (same API contract as before) ----------

export function PostForm({onDone}: {onDone: () => void}) {
  const [spot, setSpot] = useState<Location | null>(null);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [payType, setPayType] = useState('hour');
  const [city, setCity] = useState('');
  const [province, setProvince] = useState('');

  function pickSpot(l: Location) {
    setSpot(l); setPicking(false);
    const parts = l.label.split(',').map(s => s.trim());
    const prov = provinces.find(p => parts.includes(p));
    if (prov && !province) setProvince(prov);
    if (!city) {
      const guess = parts.filter(p => p !== prov && !/^\d/.test(p) && p !== 'My current location');
      if (guess.length) setCity(guess[guess.length - 1]);
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!spot) { setError('Set the workplace location before posting.'); return; }
    setBusy(true); setError('');
    const f = new FormData(e.currentTarget);
    const body: any = Object.fromEntries(f.entries());
    delete body.confirm;
    for (const k of ['pay', 'hours', 'radius']) body[k] = Number(body[k]);
    body.latitude = spot.lat; body.longitude = spot.lon;
    body.start = String(body.start) + ':00+02:00';
    try {
      const r = await fetch(API, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
      const data: any = await r.json();
      if (!r.ok) throw Error(data.error);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to post job'); }
    finally { setBusy(false); }
  }

  if (picking) return (
    <div className="form">
      <h2 className="form-step">Where is the work?</h2>
      <LocationPicker purpose="post" onSelect={pickSpot}/>
      <button type="button" className="btn btn-outline" onClick={() => setPicking(false)}>Back to job details</button>
    </div>
  );

  return (
    <form className="form" onSubmit={submit}>
      <h2 className="form-step"><span>1</span>The job</h2>
      <label className="field">Job title<input name="title" placeholder="e.g. Weekend kitchen assistant" required minLength={2} maxLength={100}/></label>
      <label className="field">Business or your name<input name="business" placeholder="Who is hiring?" required minLength={2} maxLength={120}/></label>
      <label className="field">What the work involves<textarea name="description" rows={4} placeholder="Duties, skills, experience and any equipment needed." minLength={2} maxLength={4000} required/></label>
      <label className="field">Category
        <select name="category" required defaultValue="">
          <option value="" disabled>Select category</option>
          {postCategories.map(c => <option key={c}>{c}</option>)}
        </select>
      </label>

      <h2 className="form-step"><span>2</span>Where</h2>
      <button type="button" className={'location-set' + (spot ? ' done' : '')} onClick={() => setPicking(true)}>
        <MapPin size={21}/>
        <span><strong>{spot ? spot.label : 'Set the workplace location'}</strong><small>{spot ? 'Tap to change' : 'Search the address or use your location on site'}</small></span>
        {spot ? <Check size={20}/> : <Plus size={20}/>}
      </button>
      <div className="grid-2">
        <label className="field">City or town<input name="city" value={city} onChange={e => setCity(e.target.value)} placeholder="e.g. Mthatha" required minLength={2} maxLength={100}/></label>
        <label className="field">Province
          <select name="province" required value={province} onChange={e => setProvince(e.target.value)}>
            <option value="" disabled>Select province</option>
            {provinces.map(p => <option key={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <label className="field">Hire people within (km)<input name="radius" type="number" inputMode="numeric" min="1" max="200" defaultValue="25" required/></label>

      <h2 className="form-step"><span>3</span>Pay and time</h2>
      <div className="grid-2">
        <label className="field">Pay (R)<input name="pay" type="number" inputMode="decimal" min="0.01" max="1000000" step="0.01" placeholder="e.g. 65" required/></label>
        <label className="field">Paid
          <select name="payType" value={payType} onChange={e => setPayType(e.target.value)}>
            <option value="hour">Per hour</option>
            <option value="job">For the whole job</option>
          </select>
        </label>
      </div>
      <div className="grid-2">
        <label className="field">Hours<input name="hours" type="number" inputMode="decimal" min="0.25" max="24" step="0.25" placeholder="e.g. 8" required/></label>
        <label className="field">Starts (SAST)<input name="start" type="datetime-local" required/></label>
      </div>

      <h2 className="form-step"><span>4</span>Contact</h2>
      <label className="field">Public contact details<input name="contact" placeholder="Business phone, WhatsApp or email" required minLength={2} maxLength={200}/>
        <small>Shown to workers in your hiring area.</small>
      </label>
      <p className="hint-box">The pay is what you offer the worker. There’s no posting fee, and payment is arranged directly between you.</p>
      <label className="check"><input type="checkbox" name="confirm" required/><span>These details are accurate and I’m allowed to post this job.</span></label>
      {error && <p role="alert" className="alert">{error}</p>}
      <button className="btn btn-primary btn-block btn-lg" disabled={busy}>
        {busy ? <LoaderCircle size={18} className="spin"/> : <Plus size={18}/>}{busy ? 'Posting…' : 'Post this job'}
      </button>
    </form>
  );
}
