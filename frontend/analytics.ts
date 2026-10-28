// Visit and click tracking.
// 1. Your own records: anonymous events saved to the Supabase `events` table (no cookies; a random visitor id in
//    local storage). These feed the CEO dashboard: visitors, page views, job "Apply" clicks, sponsored views/clicks.
// 2. Google Analytics 4: loaded only after the visitor accepts analytics cookies. Set the ID in /analytics-config.json.
// Google AdSense ads run inside Google's own frames, so clicks on them can't be counted here — see AdSense reports.
import {backend} from './backend';

type Config = {ga4?: string};
let configPromise: Promise<Config> | null = null;
const config = (): Promise<Config> => (configPromise ??= fetch('./analytics-config.json', {cache: 'no-cache'}).then(r => (r.ok ? r.json() as Promise<Config> : {})).catch(() => ({})));

function randomId() { const a = new Uint8Array(12); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
function stored(store: Storage | undefined, key: string) {
  try { let v = store?.getItem(key); if (!v) { v = randomId(); store?.setItem(key, v); } return v; } catch { return randomId(); }
}
const visitor = stored(globalThis.localStorage, 'cw-vid');
const session = stored(globalThis.sessionStorage, 'cw-sid');

export type EventType = 'page_view' | 'job_view' | 'apply_click' | 'sponsored_view' | 'sponsored_click' | 'ad_view' | 'shift_view'
  | 'shift_apply' | 'sign_up' | 'sign_in' | 'cv_download' | 'search' | 'install' | 'outbound_click';

export function track(type: EventType, target?: string, meta: Record<string, unknown> = {}) {
  const path = location.pathname.split('/').pop() || 'index.html';
  backend().then(sb => sb?.rpc('track_event', {p_type: type, p_visitor: visitor, p_session: session, p_path: '/' + path, p_target: target?.slice(0, 300) ?? null, p_meta: meta}))
    .catch(() => { /* tracking never breaks the page */ });
  const g = (window as any).gtag;
  if (g) g('event', type === 'page_view' ? 'page_view' : type, {target, ...meta});
}

// ---------- Google Analytics consent ----------
export const consent = {
  get(): 'granted' | 'denied' | null { try { return localStorage.getItem('cw-consent') as any; } catch { return null; } },
  set(v: 'granted' | 'denied') { try { localStorage.setItem('cw-consent', v); } catch { /* ignore */ } if (v === 'granted') loadGA(); window.dispatchEvent(new Event('cw-consent')); },
};
export async function gaConfigured() { return /^G-[A-Z0-9]{4,}$/.test((await config()).ga4 || ''); }

let gaLoaded = false;
async function loadGA() {
  const id = (await config()).ga4;
  if (gaLoaded || !id || !/^G-[A-Z0-9]{4,}$/.test(id) || consent.get() !== 'granted') return;
  gaLoaded = true;
  const w = window as any;
  w.dataLayer = w.dataLayer || [];
  w.gtag = function () { w.dataLayer.push(arguments); };
  w.gtag('js', new Date());
  w.gtag('config', id, {anonymize_ip: true});
  const s = document.createElement('script');
  s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id);
  document.head.appendChild(s);
}

// ---------- Automatic tracking ----------
export function startTracking() {
  loadGA();
  track('page_view', undefined, {ref: document.referrer ? new URL(document.referrer).hostname : undefined});
  // One listener for every link: job "Apply", sponsored offers, and any other link leaving the site.
  document.addEventListener('click', e => {
    const a = (e.target as Element | null)?.closest?.('a') as HTMLAnchorElement | null;
    if (!a || !a.href) return;
    if (a.dataset.offer) return track('sponsored_click', a.dataset.offer, {partner: a.dataset.partner});
    if (a.dataset.track === 'apply') return track('apply_click', a.dataset.job || a.href, {source: a.dataset.source});
    if (a.dataset.track === 'cv') return track('cv_download');
    try { if (new URL(a.href).origin !== location.origin) track('outbound_click', a.href); } catch { /* ignore */ }
  }, {capture: true});
  window.addEventListener('appinstalled', () => track('install'));
}
