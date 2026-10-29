/*
  Affiliate ads.

  The CEO adds them in CEO dashboard → Affiliate ads: a partner name, the affiliate link (we earn per click on the
  partner's side), and either an uploaded image banner or a text card (headline, short text, button).
  They only appear on the job pages — Home, Find work (in person and online) and job details — in four places:

    feed     between jobs in the list
    sidebar  beside the list on computers (it sits in the page flow on phones)
    article  inside the text of a job's page
    hanging  a small banner at the bottom of the screen on phones

  A view is counted when half an ad is on screen and a click when someone taps it (see analytics.ts), so the
  dashboard can show views, clicks and click rate per ad.
*/
import {useEffect, useMemo, useRef, useState} from 'react';
import {ArrowUpRight, X} from 'lucide-react';
import {track} from './analytics';
import {backend} from './backend';

/** The four places an ad can go. */
export type Spot = 'feed' | 'article' | 'sidebar' | 'hanging';

/** One affiliate ad, as shown on the site. */
export type Offer = {
  id: string; // database id; also the "target" of its view/click events
  partner: string; // brand shown on the ad
  title: string; // headline (text cards) or alt text (image banners)
  text: string; // one or two short sentences (text cards)
  url: string; // the affiliate link
  cta?: string; // button text, default "Learn more"
  badge?: string; // short highlight, e.g. "Free to join"
  logo?: string; // small square logo for text cards
  image?: string; // uploaded banner; when set, the ad is shown as this picture
  spots?: Spot[]; // where it may appear (default: everywhere but the phone banner)
  categories?: string[]; // job categories it suits; shown more often next to those jobs
  modes?: ('onsite' | 'remote')[]; // in-person and/or online jobs; empty = both
  weight?: number; // higher = shown more often
  impressionUrl?: string; // optional view pixel from the partner
};

// ---------------------------------------------------------------- loading
let offersPromise: Promise<Offer[]> | null = null;

/** Live ads from the database, loaded once per page. Paused, scheduled or switched-off ads are left out. */
function loadOffers(): Promise<Offer[]> {
  if (offersPromise) return offersPromise;
  const today = new Date().toISOString().slice(0, 10);
  offersPromise = backend()
    .then(async sb => {
      if (!sb) return [];
      const [{data: rows}, {data: settings}] = await Promise.all([
        sb.from('promos').select('*').eq('active', true),
        sb.rpc('public_settings'),
      ]);
      if ((settings as any)?.promos_enabled === false) return [];
      return ((rows as any[]) || [])
        .filter(p => (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today))
        .map(
          (p): Offer => ({
            id: p.id,
            partner: p.partner,
            title: p.title,
            text: p.body || '',
            url: p.url,
            cta: p.cta || undefined,
            badge: p.badge || undefined,
            logo: p.logo || undefined,
            image: p.image || undefined,
            impressionUrl: p.impression_url || undefined,
            spots: p.spots?.length ? p.spots : undefined,
            categories: p.categories?.length ? p.categories : undefined,
            modes: p.modes?.length ? p.modes : undefined,
            weight: p.weight || 1,
          }),
        );
    })
    .catch(() => []);
  return offersPromise;
}

/** The live ads for this page (null while loading). */
function useOffers() {
  const [offers, setOffers] = useState<Offer[] | null>(null);
  useEffect(() => {
    loadOffers().then(setOffers);
  }, []);
  return offers;
}

// ---------------------------------------------------------------- choosing an ad for a spot
// Best match for the jobs around it, never the same ad in two spots on one page, and a spot keeps its ad when the list re-renders.
const assigned = new Map<string, string>();
/** Picks the ad for one spot. */
function pickOffer(offers: Offer[], spot: Spot, ctx: {category?: string; mode?: string}, seed: number): Offer | null {
  const key = `${spot}:${seed}`;
  const kept = offers.find(o => o.id === assigned.get(key));
  if (kept) return kept;
  const taken = new Set([...assigned].filter(([k]) => k !== key).map(([, id]) => id));
  const fits = offers.filter(
    o =>
      (o.spots?.length ? o.spots.includes(spot) : spot !== 'hanging') &&
      (!o.modes?.length || !ctx.mode || o.modes.includes(ctx.mode as 'onsite' | 'remote')),
  );
  if (!fits.length) return null;
  const score = (o: Offer) =>
    (o.weight || 1) * (o.categories?.length && ctx.category && o.categories.includes(ctx.category) ? 3 : 1);
  const fresh = fits.filter(o => !taken.has(o.id));
  const pool = (fresh.length ? fresh : fits).slice().sort((a, b) => score(b) - score(a));
  const best = pool.filter(o => score(o) === score(pool[0]));
  const o = best[Math.floor(Math.random() * best.length)];
  assigned.set(key, o.id);
  return o;
}

// ---------------------------------------------------------------- view counting
/** Counts one view once half the ad is on screen, in our dashboard and with the partner's pixel if there is one. */
function useImpression(ref: React.RefObject<HTMLElement | null>, url?: string, offerId?: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el || (!url && !offerId)) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        if (offerId) track('sponsored_view', offerId);
        if (url) {
          const img = new Image();
          img.referrerPolicy = 'no-referrer-when-downgrade';
          img.src = url;
        }
      },
      {threshold: 0.5},
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, url, offerId]);
}

/** Two letters for a text ad without a logo. */
const initials = (name: string) =>
  name
    .replace(/[^A-Za-z0-9 ]/g, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase() || 'AD';

// ---------------------------------------------------------------- the ad itself
/** One ad: an image banner if it has one, otherwise a text card. `preview` (dashboard) skips view counting. */
export function OfferCard({offer, spot, preview = false}: {offer: Offer; spot: Spot; preview?: boolean}) {
  const ref = useRef<HTMLElement>(null);
  useImpression(ref, preview ? undefined : offer.impressionUrl, preview ? undefined : offer.id);
  const link = {
    href: offer.url,
    target: '_blank',
    rel: 'sponsored noopener',
    'data-offer': preview ? undefined : offer.id,
    'data-partner': offer.partner,
  };
  return (
    <aside
      ref={ref}
      className={'sponsored sp-' + spot + (offer.image ? ' sp-image' : '')}
      aria-label={'Sponsored: ' + offer.partner}
    >
      <div className="sp-top">
        <span className="sp-label">Sponsored</span>
        <span className="sp-partner">{offer.partner}</span>
      </div>
      {offer.image ? (
        <a className="sp-banner" {...link}>
          <img src={offer.image} alt={offer.title} loading="lazy" />
        </a>
      ) : (
        <a className="sp-body" {...link}>
          {offer.logo ? (
            <img className="sp-logo" src={offer.logo} alt="" loading="lazy" width={48} height={48} />
          ) : (
            <span className="sp-logo">{initials(offer.partner)}</span>
          )}
          <span className="sp-text">
            <strong>{offer.title}</strong>
            {offer.text && <small>{offer.text}</small>}
            {offer.badge && <em>{offer.badge}</em>}
          </span>
          <span className="sp-cta">
            {offer.cta || 'Learn more'}
            <ArrowUpRight size={15} />
          </span>
        </a>
      )}
      <p className="sp-note">We may earn a commission when you use this link.</p>
    </aside>
  );
}

/** One ad spot on a job page. `index` = how many spots of this kind came before, so each gets a different ad. */
export function AdSlot({
  spot,
  index = 0,
  category,
  mode,
}: {
  spot: 'feed' | 'article' | 'sidebar';
  index?: number;
  category?: string;
  mode?: string;
}) {
  const offers = useOffers();
  const offer = useMemo(() => (offers ? pickOffer(offers, spot, {category, mode}, index) : null), [offers]); // eslint-disable-line react-hooks/exhaustive-deps
  return offer ? <OfferCard offer={offer} spot={spot} /> : null;
}

/** The small banner at the bottom of phones. Appears after some scrolling; closing it hides it for 3 days. */
export function HangingOffer() {
  const offers = useOffers();
  const [offer, setOffer] = useState<Offer | null>(null);
  useEffect(() => {
    if (!offers) return;
    try {
      if (Number(localStorage.getItem('cw-hang-closed') || 0) > Date.now() - 3 * 86400000) return;
    } catch {
      /* storage blocked */
    }
    const choices = offers.filter(x => x.spots?.includes('hanging'));
    if (!choices.length) return;
    const pick = choices[Math.floor(Math.random() * choices.length)];
    const onScroll = () => {
      if (window.scrollY > window.innerHeight * 1.2) {
        setOffer(pick);
        window.removeEventListener('scroll', onScroll);
      }
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, [offers]);
  const ref = useRef<HTMLDivElement>(null);
  useImpression(ref, offer?.impressionUrl, offer?.id);
  if (!offer) return null;
  const close = () => {
    setOffer(null);
    try {
      localStorage.setItem('cw-hang-closed', String(Date.now()));
    } catch {
      /* storage blocked */
    }
  };
  return (
    <div
      ref={ref}
      className={'hanging' + (offer.image ? ' hang-image' : '')}
      role="complementary"
      aria-label={'Sponsored: ' + offer.partner}
    >
      <a href={offer.url} target="_blank" rel="sponsored noopener" data-offer={offer.id} data-partner={offer.partner}>
        {offer.image ? (
          <img src={offer.image} alt={offer.title} />
        ) : (
          <>
            <span className="hang-text">
              <small>
                <b>Sponsored</b> · {offer.partner}
              </small>
              <strong>{offer.title}</strong>
            </span>
            <span className="hang-cta">{offer.cta || 'Open'}</span>
          </>
        )}
      </a>
      <button className="icon-btn" aria-label="Close sponsored message" onClick={close}>
        <X size={18} />
      </button>
    </div>
  );
}
