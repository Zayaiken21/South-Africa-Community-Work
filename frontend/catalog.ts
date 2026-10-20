// Shared front-end constants and helpers for the GitHub Pages app.
// The posting form still uses `categories` from lib/jobs.ts, because the hosted API validates against that list.

export const API = 'https://south-africa-community-work.chummy-tuna-9459.chatgpt.site/api/jobs';
export const FEED_URL = './data/jobs-feed.json';

export type Location = {lat: number; lon: number; label: string; approx?: boolean; source?: 'gps' | 'ip' | 'search' | 'city'};

export type CommunityJob = {
  id: string; title: string; description: string; business: string; city: string; province: string;
  category: string; pay: number; payType: string; hours: number; radius: number; start: string;
  contact: string; distance: number; hourly: number; createdAt?: number;
};

export type FeedJob = {
  id: string; source: string; sourceUrl: string; url: string; title: string; company: string;
  mode: 'onsite' | 'remote'; location: string; province?: string; lat?: number; lon?: number;
  category: string; type?: string; salary?: string; hourlyZar?: number; posted: string; excerpt: string;
};

export type Feed = {updated: string | null; sources: {name: string; url: string; count: number}[]; jobs: FeedJob[]};

// Unified card model used by the feed.
export type Listing = {
  key: string; kind: 'community' | 'feed'; mode: 'onsite' | 'remote'; title: string; company: string;
  place: string; category: string; excerpt: string; payLabel?: string; paySub?: string; hourly?: number;
  distance?: number; date: number; dateLabel: string; href: string; external: boolean; source?: string; sourceUrl?: string;
};

export const browseCategories = [
  'Hospitality', 'Retail', 'Cleaning', 'Warehouse & logistics', 'Driving & delivery', 'Construction', 'Events',
  'Admin & office', 'Customer service', 'Sales & marketing', 'Tech & IT', 'Healthcare', 'Education', 'Finance', 'Other',
];

// Quick picks so nobody is stuck if GPS or place search fails.
export const cities: Location[] = [
  {label: 'Johannesburg, Gauteng', lat: -26.2041, lon: 28.0473},
  {label: 'Pretoria, Gauteng', lat: -25.7479, lon: 28.2293},
  {label: 'Soweto, Gauteng', lat: -26.2678, lon: 27.8585},
  {label: 'Cape Town, Western Cape', lat: -33.9249, lon: 18.4241},
  {label: 'Durban, KwaZulu-Natal', lat: -29.8587, lon: 31.0218},
  {label: 'Pietermaritzburg, KwaZulu-Natal', lat: -29.6006, lon: 30.3794},
  {label: 'Gqeberha, Eastern Cape', lat: -33.9608, lon: 25.6022},
  {label: 'East London, Eastern Cape', lat: -33.0153, lon: 27.9116},
  {label: 'Bloemfontein, Free State', lat: -29.0852, lon: 26.1596},
  {label: 'Polokwane, Limpopo', lat: -23.9045, lon: 29.4689},
  {label: 'Mbombela, Mpumalanga', lat: -25.4753, lon: 30.9694},
  {label: 'Rustenburg, North West', lat: -25.6676, lon: 27.2421},
  {label: 'Kimberley, Northern Cape', lat: -28.7282, lon: 24.7499},
  {label: 'George, Western Cape', lat: -33.9630, lon: 22.4617},
].map(c => ({...c, source: 'city' as const}));

export const money = (v: number) =>
  new Intl.NumberFormat('en-ZA', {style: 'currency', currency: 'ZAR', maximumFractionDigits: 0}).format(v);

export function ago(ms: number) {
  const d = Math.max(0, Date.now() - ms) / 86400000;
  if (d < 1) return 'Today';
  if (d < 2) return 'Yesterday';
  if (d < 30) return `${Math.floor(d)} days ago`;
  return new Date(ms).toLocaleDateString('en-ZA', {day: 'numeric', month: 'short'});
}

export const when = (v: string) =>
  new Date(v).toLocaleString('en-ZA', {timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

export function distanceKm(a: number, b: number, c: number, d: number) {
  const r = Math.PI / 180;
  const x = Math.sin((c - a) * r / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin((d - b) * r / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

// Device storage helpers that never throw (private mode, blocked storage).
export function readStore<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback; } catch { return fallback; }
}
export function writeStore(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export type SavedJob = {key: string; title: string; company: string; place: string; href: string; external: boolean; mode: 'onsite' | 'remote'; savedAt: number};

export function savedJobs(): SavedJob[] {
  const list = readStore<SavedJob[]>('cw-saved-jobs', []);
  // Older versions only stored community job IDs.
  const legacy = readStore<string[]>('cw-saved-ids', []);
  for (const id of legacy) {
    const key = 'community:' + id;
    if (!list.some(s => s.key === key)) list.push({key, title: 'Saved community job', company: '', place: '', href: 'job.html?id=' + encodeURIComponent(id), external: false, mode: 'onsite', savedAt: 0});
  }
  return list;
}
export function setSavedJobs(list: SavedJob[]) {
  writeStore('cw-saved-jobs', list);
  writeStore('cw-saved-ids', list.filter(s => s.key.startsWith('community:')).map(s => s.key.slice(10)));
  window.dispatchEvent(new Event('cw-saved'));
}
export function toggleSaved(job: Omit<SavedJob, 'savedAt'>) {
  const list = savedJobs();
  const next = list.some(s => s.key === job.key) ? list.filter(s => s.key !== job.key) : [{...job, savedAt: Date.now()}, ...list];
  setSavedJobs(next);
  return next.some(s => s.key === job.key);
}
