import {useEffect, useRef, useState} from 'react';
import {FileUser, Plus, Download, Globe, ArrowRight} from 'lucide-react';

// Ad settings live in /ads-config.json so they can be edited on GitHub without rebuilding.
// Until `client` and the slot IDs are filled in, every spot shows an in-house promo instead.
export type AdKind = 'sidebar' | 'feed' | 'article';
type AdConfig = {
  enabled: boolean;
  client: string;                                  // "ca-pub-…" from AdSense
  slots: Partial<Record<AdKind, string>>;          // ad unit IDs from AdSense → Ads → By ad unit
  feedLayoutKey?: string;                          // shown when you create the In-feed unit
  houseAds: boolean;                               // show our own promos where no paid ad is configured
};

const fallback: AdConfig = {enabled: false, client: '', slots: {}, houseAds: true};
let configPromise: Promise<AdConfig> | null = null;
let scriptAdded = false;

export function loadAdConfig(): Promise<AdConfig> {
  if (!configPromise) {
    configPromise = fetch('./ads-config.json', {cache: 'no-cache'})
      .then(r => (r.ok ? r.json() : fallback))
      .then((c: any) => ({...fallback, ...c, slots: {...(c?.slots || {})}}))
      .catch(() => fallback);
  }
  return configPromise;
}

const live = (c: AdConfig) => c.enabled && /^ca-pub-\d{10,}$/.test(c.client);

// Loads Google's ad script once. Auto ads settings in AdSense (anchor/"hanging" ads, side rails) come from this same script.
export function initAds() {
  loadAdConfig().then(c => {
    if (!live(c) || scriptAdded) return;
    scriptAdded = true;
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(c.client);
    document.head.appendChild(s);
  });
}

function useAdConfig() {
  const [config, setConfig] = useState<AdConfig | null>(null);
  useEffect(() => { loadAdConfig().then(setConfig); }, []);
  return config;
}

// In-house promos keep the layout honest before AdSense approval (and fill unsold space after).
const promos = [
  {icon: FileUser, title: 'Build a CV that gets calls', text: 'Free CV builder. Download as PDF or Word in minutes.', href: 'cv-builder.html', cta: 'Make my CV'},
  {icon: Plus, title: 'Hiring in your area?', text: 'Post a job free and reach workers nearby.', href: 'post-job.html', cta: 'Post a job'},
  {icon: Globe, title: 'Work from anywhere', text: 'Online jobs open to people in South Africa.', href: 'find-work.html?mode=remote', cta: 'See online jobs'},
  {icon: Download, title: 'Get the app', text: 'Install Community Work on your phone for quicker job searches.', href: 'how-it-works.html', cta: 'How it works'},
];

function HouseAd({kind, seed}: {kind: AdKind; seed: number}) {
  const p = promos[seed % promos.length];
  const Icon = p.icon;
  return (
    <aside className={'ad house ad-' + kind} aria-label="Community Work promotion">
      <span className="ad-label">From Community Work</span>
      <a className="house-body" href={p.href}>
        <span className="house-icon"><Icon size={22}/></span>
        <span className="house-text"><strong>{p.title}</strong><small>{p.text}</small></span>
        <span className="house-cta">{p.cta}<ArrowRight size={15}/></span>
      </a>
    </aside>
  );
}

export function AdSlot({kind, seed = 0}: {kind: AdKind; seed?: number}) {
  const config = useAdConfig();
  const ref = useRef<HTMLModElement>(null);
  const slot = config?.slots[kind];
  const paid = !!config && live(config) && !!slot;

  useEffect(() => {
    if (!paid || !ref.current || ref.current.dataset.adsbygoogleStatus) return;
    try { ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({}); } catch { /* blocked */ }
  }, [paid]);

  if (!config) return null;
  if (!paid) return config.houseAds ? <HouseAd kind={kind} seed={seed}/> : null;

  const format = kind === 'feed'
    ? {'data-ad-format': 'fluid', 'data-ad-layout-key': config.feedLayoutKey || ''}
    : kind === 'article'
      ? {'data-ad-format': 'fluid', 'data-ad-layout': 'in-article'}
      : {'data-ad-format': 'auto', 'data-full-width-responsive': 'true'};

  return (
    <aside className={'ad ad-' + kind} aria-label="Advertisement">
      <span className="ad-label">Advertisement</span>
      <ins ref={ref} className="adsbygoogle" style={{display: 'block', textAlign: kind === 'article' ? 'center' : undefined}}
        data-ad-client={config.client} data-ad-slot={slot} {...format}/>
    </aside>
  );
}

// "Hanging" bottom promo for phones while AdSense isn't live. Once paid ads are on, Google's own anchor ads take this role.
export function HangingPromo() {
  const config = useAdConfig();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!config || live(config) || !config.houseAds) return;
    try { if (Number(localStorage.getItem('cw-hang-closed') || 0) > Date.now() - 7 * 86400000) return; } catch { /* ignore */ }
    const onScroll = () => { if (window.scrollY > window.innerHeight * 1.5) { setShow(true); window.removeEventListener('scroll', onScroll); } };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, [config]);
  if (!show) return null;
  const close = () => { setShow(false); try { localStorage.setItem('cw-hang-closed', String(Date.now())); } catch { /* ignore */ } };
  return (
    <div className="hanging" role="complementary" aria-label="Community Work promotion">
      <a href="cv-builder.html"><FileUser size={20}/><span><strong>No CV yet?</strong> Build one free in minutes</span><ArrowRight size={16}/></a>
      <button className="icon-btn" aria-label="Close" onClick={close}>×</button>
    </div>
  );
}
