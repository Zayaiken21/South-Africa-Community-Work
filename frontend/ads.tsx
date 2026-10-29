import {track} from './analytics';
import {backend} from './backend';
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, X} from 'lucide-react';

/*
  Money spots, on the job pages only (Home, Find work, job details): affiliate offers first — the ones the CEO adds in the
  dashboard (Ads tab) plus any in affiliates.json — and Google AdSense second (ads-config.json).
  Nothing shows when neither has something for a spot — no filler promos.

  Preview the layout with sample offers: add ?adpreview=1 to any page URL.
*/

export type Spot = 'feed' | 'article' | 'sidebar' | 'hanging';

export type Offer = {
  id: string;
  partner: string;            // brand shown on the card, e.g. "Coursera"
  title: string;              // one-line headline
  text: string;               // one or two short sentences
  url: string;                // your affiliate / tracking link
  cta?: string;               // button text, default "Learn more"
  badge?: string;             // short highlight, e.g. "Free to join"
  logo?: string;              // https:// image, square
  spots?: Spot[];             // where it may appear (default: all but hanging)
  categories?: string[];      // job categories it suits; empty = any
  modes?: ('onsite' | 'remote')[]; // in-person / online jobs it suits; empty = any
  weight?: number;            // higher shows more often (default 1)
  impressionUrl?: string;     // optional view-tracking pixel from your network (pay per view)
  start?: string; end?: string; // optional ISO dates
  sample?: boolean;           // only shown in ?adpreview=1
};

type AdConfig = {enabled: boolean; client: string; slots: Partial<Record<'feed' | 'sidebar' | 'article', string>>; feedLayoutKey?: string};

const preview = new URLSearchParams(location.search).has('adpreview');
let offersPromise: Promise<Offer[]> | null = null;
let configPromise: Promise<AdConfig> | null = null;
let scriptAdded = false;

// Offers the CEO manages in the dashboard. The database only returns live ones (and none when offers are switched off).
function loadDbOffers(): Promise<Offer[]> {
  const today = new Date().toISOString().slice(0, 10);
  return backend().then(async sb => {
    if (!sb) return null;
    const [res, st] = await Promise.all([sb.from('promos').select('*').eq('active', true), sb.rpc('public_settings')]);
    return (st.data as any)?.promos_enabled === false ? null : res;
  }).then((res: any) => (res?.data || [])
    .filter((p: any) => (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today)).map((p: any): Offer => ({
    id: p.id, partner: p.partner, title: p.title, text: p.body || '', url: p.url, cta: p.cta || undefined, badge: p.badge || undefined,
    logo: p.logo || undefined, impressionUrl: p.impression_url || undefined, spots: p.spots?.length ? p.spots : undefined,
    categories: p.categories?.length ? p.categories : undefined, modes: p.modes?.length ? p.modes : undefined, weight: p.weight || 1,
  }))).catch(() => []);
}

function loadOffers(): Promise<Offer[]> {
  if (!offersPromise) {
    const file = fetch('./affiliates.json', {cache: 'no-cache'})
      .then(r => (r.ok ? r.json() : {offers: []}))
      .then((d: any) => {
        const now = Date.now();
        return (Array.isArray(d?.offers) ? d.offers : []).filter((o: Offer) =>
          o && o.id && o.title && /^https:\/\//.test(o.url || '') &&
          (preview ? true : !o.sample) &&
          (!o.start || Date.parse(o.start) <= now) && (!o.end || Date.parse(o.end) > now));
      })
      .catch(() => [] as Offer[]);
    offersPromise = Promise.all([loadDbOffers(), file]).then(([db, f]) => [...db, ...f]);
  }
  return offersPromise;
}

function loadAdConfig(): Promise<AdConfig> {
  if (!configPromise) {
    configPromise = fetch('./ads-config.json', {cache: 'no-cache'})
      .then(r => (r.ok ? r.json() : {}))
      .then((c: any) => ({enabled: !!c?.enabled, client: c?.client || '', slots: c?.slots || {}, feedLayoutKey: c?.feedLayoutKey}))
      .catch(() => ({enabled: false, client: '', slots: {}}));
  }
  return configPromise;
}

const adsenseLive = (c: AdConfig) => c.enabled && /^ca-pub-\d{10,}$/.test(c.client);

export function initAds() {
  loadAdConfig().then(c => {
    if (!adsenseLive(c) || scriptAdded) return;
    scriptAdded = true;
    const s = document.createElement('script');
    s.async = true; s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(c.client);
    document.head.appendChild(s);
  });
}

function useMoney() {
  const [state, setState] = useState<{offers: Offer[]; config: AdConfig} | null>(null);
  useEffect(() => { Promise.all([loadOffers(), loadAdConfig()]).then(([offers, config]) => setState({offers, config})); }, []);
  return state;
}

// Pick an offer for a spot: best match for the context, and no offer used by two spots on one page.
// Assignments are remembered per spot, so a spot keeps its offer when the job list re-renders.
const assigned = new Map<string, string>();
function pickOffer(offers: Offer[], spot: Spot, ctx: {category?: string; mode?: string}, seed: number): Offer | null {
  const key = `${spot}:${seed}`;
  const kept = offers.find(o => o.id === assigned.get(key));
  if (kept) return kept;
  const taken = new Set([...assigned].filter(([k]) => k !== key).map(([, id]) => id));
  const fits = offers.filter(o =>
    (o.spots?.length ? o.spots.includes(spot) : spot !== 'hanging') &&
    (!o.modes?.length || !ctx.mode || o.modes.includes(ctx.mode as any)));
  if (!fits.length) return null;
  const score = (o: Offer) => (o.weight || 1) * (o.categories?.length && ctx.category && o.categories.includes(ctx.category) ? 3 : 1);
  const fresh = fits.filter(o => !taken.has(o.id));
  const pool = (fresh.length ? fresh : fits).slice().sort((a, b) => score(b) - score(a));
  const best = pool.filter(o => score(o) === score(pool[0]));
  const o = best[0];
  assigned.set(key, o.id);
  return o;
}

// Counts a view once half the card is on screen: in your own dashboard, and with the partner's pixel if they gave one.
function useImpression(ref: React.RefObject<HTMLElement | null>, url?: string, offerId?: string, kind: 'sponsored_view' | 'ad_view' = 'sponsored_view') {
  useEffect(() => {
    const el = ref.current;
    if (!el || preview || (!url && !offerId)) return;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      if (offerId) track(kind, offerId);
      if (url) { const img = new Image(); img.referrerPolicy = 'no-referrer-when-downgrade'; img.src = url; }
    }, {threshold: 0.5});
    io.observe(el);
    return () => io.disconnect();
  }, [ref, url, offerId]);
}

function initials(name: string) { return name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'AD'; }

export function OfferCard({offer, spot, preview: isPreview = false}: {offer: Offer; spot: Spot; preview?: boolean}) {
  const ref = useRef<HTMLElement>(null);
  useImpression(ref, isPreview ? undefined : offer.impressionUrl, isPreview ? undefined : offer.id);
  return (
    <aside ref={ref} className={'sponsored sp-' + spot} aria-label={'Sponsored: ' + offer.partner}>
      <div className="sp-top">
        <span className="sp-label">Sponsored{offer.sample ? ' · sample' : ''}</span>
        <span className="sp-partner">{offer.partner}</span>
      </div>
      <a className="sp-body" href={offer.url} target="_blank" rel="sponsored noopener" data-offer={offer.id} data-partner={offer.partner}>
        {offer.logo ? <img className="sp-logo" src={offer.logo} alt="" loading="lazy" width={48} height={48}/> : <span className="sp-logo">{initials(offer.partner)}</span>}
        <span className="sp-text">
          <strong>{offer.title}</strong>
          <small>{offer.text}</small>
          {offer.badge && <em>{offer.badge}</em>}
        </span>
        <span className="sp-cta">{offer.cta || 'Learn more'}<ArrowUpRight size={15}/></span>
      </a>
      <p className="sp-note">We may earn a commission when you use this link.</p>
    </aside>
  );
}

function AdSenseUnit({config, spot}: {config: AdConfig; spot: 'feed' | 'article' | 'sidebar'}) {
  const ref = useRef<HTMLModElement>(null);
  const box = useRef<HTMLElement>(null);
  useImpression(box, undefined, 'adsense-' + spot, 'ad_view');
  useEffect(() => {
    if (!ref.current || ref.current.dataset.adsbygoogleStatus) return;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch { /* blocked */ }
  }, []);
  const format = spot === 'feed'
    ? {'data-ad-format': 'fluid', 'data-ad-layout-key': config.feedLayoutKey || ''}
    : spot === 'article' ? {'data-ad-format': 'fluid', 'data-ad-layout': 'in-article'}
    : {'data-ad-format': 'auto', 'data-full-width-responsive': 'true'};
  return (
    <aside ref={box} className={'ad ad-' + spot} aria-label="Advertisement">
      <span className="sp-label">Advertisement</span>
      <ins ref={ref} className="adsbygoogle" style={{display: 'block'}} data-ad-client={config.client} data-ad-slot={config.slots[spot]} {...format}/>
    </aside>
  );
}

/*
  One money spot. `index` = how many spots of this kind came before on the page:
  even spots prefer an affiliate offer, odd ones prefer AdSense, each falling back to the other.
*/
export function AdSlot({spot, index = 0, category, mode}: {spot: 'feed' | 'article' | 'sidebar'; index?: number; category?: string; mode?: string}) {
  const money = useMoney();
  const offer = useMemo(() => money ? pickOffer(money.offers, spot, {category, mode}, index) : null, [money]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!money) return null;
  const google = adsenseLive(money.config) && !!money.config.slots[spot];
  const preferGoogle = index % 2 === 1;
  if (offer && (!google || !preferGoogle)) return <OfferCard offer={offer} spot={spot}/>;
  if (google) return <AdSenseUnit config={money.config} spot={spot}/>;
  return null;
}

// Hanging (anchor) offer on phones. When AdSense is live, Google's own anchor ad takes this place instead.
export function HangingOffer() {
  const money = useMoney();
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    if (!money || (adsenseLive(money.config) && !preview)) return;
    try { if (!preview && Number(localStorage.getItem('cw-hang-closed') || 0) > Date.now() - 3 * 86400000) return; } catch { /* ignore */ }
    const o = money.offers.filter(x => x.spots?.includes('hanging'));
    if (!o.length) return;
    const pick = o[Math.floor(Math.random() * o.length)];
    const onScroll = () => { if (window.scrollY > window.innerHeight * 1.2) { setOffer(pick); window.removeEventListener('scroll', onScroll); } };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, [money]);
  const ref = useRef<HTMLDivElement>(null);
  useImpression(ref, offer?.impressionUrl, offer?.id);
  if (!offer) return null;
  const close = () => { setOffer(null); try { localStorage.setItem('cw-hang-closed', String(Date.now())); } catch { /* ignore */ } };
  return (
    <div ref={ref} className="hanging" role="complementary" aria-label={'Sponsored: ' + offer.partner}>
      <a href={offer.url} target="_blank" rel="sponsored noopener" data-offer={offer.id} data-partner={offer.partner}>
        <span className="hang-text"><small><b>Sponsored</b> · {offer.partner}</small><strong>{offer.title}</strong></span>
        <span className="hang-cta">{offer.cta || 'Open'}</span>
      </a>
      <button className="icon-btn" aria-label="Close sponsored message" onClick={close}><X size={18}/></button>
    </div>
  );
}
