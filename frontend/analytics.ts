// Visit and click tracking.
// 1. Your own records: anonymous events saved to the Supabase `events` table (no cookies; a random visitor id in
//    local storage). These feed the CEO dashboard: visitors, page views, job "Apply" clicks, affiliate ad views/clicks.
// 2. Google Analytics 4: loaded only after the visitor accepts analytics cookies. Set the ID in /analytics-config.json.
import {backend} from './backend';

/** analytics-config.json: the optional Google Analytics ID. */
type Config = {ga4?: string};
/** analytics-config.json, loaded once. */
let configPromise: Promise<Config> | null = null;
/** Loads analytics-config.json. */
const config = (): Promise<Config> =>
  (configPromise ??= fetch('./analytics-config.json', {cache: 'no-cache'})
    .then(r => (r.ok ? (r.json() as Promise<Config>) : {}))
    .catch(() => ({})));

/** A random id (not linked to the person). */
function randomId() {
  const a = new Uint8Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
/** Reads or creates an id kept in browser storage. */
function stored(store: Storage | undefined, key: string) {
  try {
    let v = store?.getItem(key);
    if (!v) {
      v = randomId();
      store?.setItem(key, v);
    }
    return v;
  } catch {
    return randomId();
  }
}
/** Stays the same on this device; counts unique visitors. */
const visitor = stored(globalThis.localStorage, 'cw-vid');
/** Changes each visit; counts visits. */
const session = stored(globalThis.sessionStorage, 'cw-sid');

/** Every kind of event the dashboard counts. */
export type EventType =
  | 'page_view'
  | 'job_view'
  | 'apply_click'
  | 'sponsored_view'
  | 'sponsored_click'
  | 'ad_view'
  | 'shift_view'
  | 'shift_apply'
  | 'sign_up'
  | 'sign_in'
  | 'cv_download'
  | 'search'
  | 'install'
  | 'outbound_click';

/** Records one event (page view, click, …) for the dashboard. */
export function track(type: EventType, target?: string, meta: Record<string, unknown> = {}) {
  const path = location.pathname.split('/').pop() || 'index.html';
  backend()
    .then(sb =>
      sb?.rpc('track_event', {
        p_type: type,
        p_visitor: visitor,
        p_session: session,
        p_path: '/' + path,
        p_target: target?.slice(0, 300) ?? null,
        p_meta: meta,
      }),
    )
    .catch(() => {
      /* tracking never breaks the page */
    });
  const g = (window as any).gtag;
  if (g) g('event', type === 'page_view' ? 'page_view' : type, {target, ...meta});
}

// ---------- Google Analytics consent ----------
export const consent = {
  get(): 'granted' | 'denied' | null {
    try {
      return localStorage.getItem('cw-consent') as any;
    } catch {
      return null;
    }
  },
  set(v: 'granted' | 'denied') {
    try {
      localStorage.setItem('cw-consent', v);
    } catch {
      /* ignore */
    }
    if (v === 'granted') loadGA();
    window.dispatchEvent(new Event('cw-consent'));
  },
};
/** Whether a Google Analytics ID is set (decides if the cookie banner shows). */
export async function gaConfigured() {
  return /^G-[A-Z0-9]{4,}$/.test((await config()).ga4 || '');
}

/** Google Analytics is only loaded once. */
let gaLoaded = false;
/** Loads Google Analytics after the visitor accepts cookies. */
async function loadGA() {
  const id = (await config()).ga4;
  if (gaLoaded || !id || !/^G-[A-Z0-9]{4,}$/.test(id) || consent.get() !== 'granted') return;
  gaLoaded = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () {
    w.dataLayer.push(arguments);
  };
  w.gtag('js', new Date());
  w.gtag('config', id, {anonymize_ip: true});
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
}

// ---------- Automatic tracking ----------
export function startTracking() {
  loadGA();
  track('page_view', undefined, {ref: document.referrer ? new URL(document.referrer).hostname : undefined});
  // One listener for every link: job "Apply", sponsored offers, and any other link leaving the site.
  document.addEventListener(
    'click',
    e => {
      const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      if (a.dataset.offer) return track('sponsored_click', a.dataset.offer, {partner: a.dataset.partner});
      if (a.dataset.track === 'apply') return track('apply_click', a.dataset.job || a.href, {source: a.dataset.source});
      if (a.dataset.track === 'cv') return track('cv_download');
      try {
        if (new URL(a.href).origin !== location.origin) track('outbound_click', a.href);
      } catch {
        /* ignore */
      }
    },
    {capture: true},
  );
  window.addEventListener('appinstalled', () => track('install'));
  joinOnline();
}

// ---------------------------------------------------------------- who's online right now
/** The live channel every open page joins, so the dashboard can see who is on the site this moment. */
export const ONLINE_CHANNEL = 'online-now';
/** One person on the site right now, as the dashboard sees them (no names — just where they are). */
export type OnlinePerson = {path: string; signedIn: boolean; since: string; userId?: string};

/**
 * Joins the live "online now" channel with this visitor's random id and current page. Nothing is stored: when the page
 * closes or goes offline, they drop off the list within seconds.
 */
async function joinOnline() {
  const sb = await backend();
  if (!sb || !visitor) return;
  const {data} = await sb.auth.getSession();
  const me: OnlinePerson = {
    path: location.pathname.split('/').pop() || 'index.html',
    signedIn: !!data.session,
    since: new Date().toISOString(),
    userId: data.session?.user.id,
  };
  const channel = sb.channel(ONLINE_CHANNEL, {config: {presence: {key: visitor}}});
  channel.subscribe(status => {
    if (status === 'SUBSCRIBED') channel.track(me);
  });
}
