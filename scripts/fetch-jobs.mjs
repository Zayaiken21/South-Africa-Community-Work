#!/usr/bin/env node
// Builds the job database the app reads, split into small files so phones only download what they need.
// Runs every 3 hours in GitHub Actions (.github/workflows/update-jobs.yml) and writes to the `jobs-data` branch.
//
// Each run adds the newest jobs to what it already has, and removes jobs older than 30 days (45 for online),
// so the collection grows and stays fresh even with small API allowances.
//
// Sources (all optional — one failing never empties the app):
//   In person, South Africa:  Adzuna (ADZUNA_APP_ID + ADZUNA_APP_KEY secrets), Jooble (JOOBLE_API_KEY secret)
//   Online, open to SA:       Remotive, Jobicy, Himalayas, Remote OK, Working Nomads, We Work Remotely
//
// Output (OUT_DIR, default jobs-data/jobs):
//   index.json        totals, counts per field, sources, update time
//   latest.json       newest jobs across every field (what the app shows first)
//   remote.json       online jobs
//   c-<field>.json    every job in one field
//   p-<province>.json in-person jobs in one province
//   state.json        where the rotating API queries got to

import {readFile, writeFile, mkdir, readdir, rm} from 'node:fs/promises';
import {placeFor} from './sa-places.mjs';

const OUT = process.env.OUT_DIR || 'jobs-data/jobs';
const UA = 'CommunityWorkSA/1.0 (+https://github.com/Zayaiken21/South-Africa-Community-Work)';
const ADZUNA_CALLS = Number(process.env.ADZUNA_CALLS_PER_RUN || 10);  // free plan: 2,500 calls a month ≈ 8 runs × 10 a day
const JOOBLE_CALLS = Number(process.env.JOOBLE_CALLS_PER_RUN || 12);
const KEEP_DAYS = {onsite: 30, remote: 45};
const CAP = {latest: 1500, category: 4000, province: 4000, remote: 4000};

export const fields = [
  'Hospitality', 'Retail', 'Cleaning', 'Warehouse & logistics', 'Driving & delivery', 'Construction', 'Engineering',
  'Manufacturing', 'Mining', 'Agriculture', 'Security', 'Events', 'Admin & office', 'Customer service', 'Sales & marketing',
  'Creative & design', 'Tech & IT', 'Healthcare', 'Education', 'Finance', 'HR & recruitment', 'Legal', 'Other',
];
const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];
export const slug = s => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Order matters: the first rule that matches wins.
const rules = [
  ['Tech & IT', /\b(software|developer|devops|full[- ]?stack|front[- ]?end|back[- ]?end|web dev|data (analyst|engineer|scientist)|it support|it technician|sysadmin|system administrator|cloud|cyber|qa engineer|sdet|programmer|machine learning|\bai\b|network engineer|database|\.net|java|python|php|react)\b/i],
  ['Healthcare', /\b(nurse|nursing|doctor|medical|health|pharmac|clinic|caregiver|care worker|therap|dental|radiograph|paramedic|hospital)\b/i],
  ['Education', /\b(teacher|tutor|lecturer|educator|teaching|school|trainer|instructor|esl|facilitator|ecd|au pair)\b/i],
  ['Legal', /\b(attorney|lawyer|legal|paralegal|conveyanc|candidate attorney|compliance officer)\b/i],
  ['HR & recruitment', /\b(hr\b|human resources|recruit|talent acquisition|payroll administrator|people partner)\b/i],
  ['Finance', /\b(accountant|accounting|finance|financial|bookkeep|creditors|debtors|audit|tax|credit controller|bank|actuar|investment|insurance)\b/i],
  ['Customer service', /\b(call cent|customer (service|support|success|care)|contact cent|support agent|help ?desk|client service|receptionist)\b/i],
  ['Sales & marketing', /\b(sales|marketing|seo|social media|brand|business development|account (manager|executive)|copywrit|growth|telesales|rep\b)\b/i],
  ['Creative & design', /\b(designer|graphic|ux|ui\b|video edit|photograph|content creat|writer|illustrat|animator|creative)\b/i],
  ['Mining', /\b(mine|mining|underground|blaster|geolog|shaft|metallurg)\b/i],
  ['Agriculture', /\b(farm|agri|harvest|horticult|livestock|veterinar|crop|orchard)\b/i],
  ['Security', /\b(security (officer|guard)|psira|guard|armed response|cctv|loss prevention)\b/i],
  ['Driving & delivery', /\b(driver|delivery|courier|code 1[0-4]|chauffeur|fleet|transport)\b/i],
  ['Warehouse & logistics', /\b(warehouse|logistic|picker|packer|forklift|stock controller|inventory|supply chain|dispatch|storeman|procurement|buyer)\b/i],
  ['Manufacturing', /\b(production|factory|machine operator|assembl|manufactur|packaging operator|quality control|cnc|operator)\b/i],
  ['Engineering', /\b(engineer|engineering|technician|draughtsman|drafter|millwright|instrumentation|electrician|fitter|turner|boilermaker|mechanic)\b/i],
  ['Construction', /\b(construction|builder|plumber|artisan|welder|carpent|bricklay|site manager|civil|quantity surveyor|painter|tiler|handyman|maintenance)\b/i],
  ['Hospitality', /\b(chef|cook|waiter|waitress|barista|hotel|kitchen|restaurant|hospitality|bartender|housekeep|front of house|lodge|guest)\b/i],
  ['Retail', /\b(retail|cashier|store|shop|merchandis|sales assistant|till|branch manager)\b/i],
  ['Cleaning', /\b(clean|domestic|janitor|hygiene|housekeeper|gardener)\b/i],
  ['Events', /\b(event|promoter|promotion|usher|brand ambassador)\b/i],
  ['Admin & office', /\b(admin|administrat|office|secretary|assistant|clerk|data captur|coordinator|virtual assistant|personal assistant)\b/i],
];
const categorize = (...t) => (rules.find(([, re]) => re.test(t.filter(Boolean).join(' '))) || ['Other'])[0];

const adzunaTags = {
  'it-jobs': 'Tech & IT', 'engineering-jobs': 'Engineering', 'accounting-finance-jobs': 'Finance', 'healthcare-nursing-jobs': 'Healthcare',
  'teaching-jobs': 'Education', 'hospitality-catering-jobs': 'Hospitality', 'retail-jobs': 'Retail', 'logistics-warehouse-jobs': 'Warehouse & logistics',
  'trade-construction-jobs': 'Construction', 'admin-jobs': 'Admin & office', 'customer-services-jobs': 'Customer service', 'sales-jobs': 'Sales & marketing',
  'pr-advertising-marketing-jobs': 'Sales & marketing', 'creative-design-jobs': 'Creative & design', 'hr-jobs': 'HR & recruitment', 'legal-jobs': 'Legal',
  'manufacturing-jobs': 'Manufacturing', 'domestic-help-cleaning-jobs': 'Cleaning', 'energy-oil-gas-jobs': 'Engineering', 'maintenance-jobs': 'Construction',
  'scientific-qa-jobs': 'Engineering', 'social-work-jobs': 'Healthcare', 'travel-jobs': 'Hospitality',
};

const strip = html => String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, '’').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const excerpt = html => { const t = strip(html); return t.length > 170 ? t.slice(0, 167).replace(/\s+\S*$/, '') + '…' : t; };
const fmt = n => Math.round(n).toLocaleString('en-ZA').replace(/[, ]/g, ' ');
function salaryLabel(min, max, cur, period) {
  if (!min && !max) return undefined;
  const c = !cur || cur === 'ZAR' ? 'R' : cur + ' ';
  const r = min && max && Math.round(min) !== Math.round(max) ? `${c}${fmt(min)} – ${c}${fmt(max)}` : `${c}${fmt(min || max)}`;
  return period ? `${r} ${period}` : r;
}
const openToSA = loc => !loc || /worldwide|anywhere|global|south africa|\bafrica\b|emea|\bza\b|^remote$|^$/i.test(String(loc).trim());
const iso = v => { const t = typeof v === 'number' ? (v > 1e12 ? v : v * 1000) : Date.parse(v); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

async function getJson(url, init = {}) {
  const r = await fetch(url, {...init, headers: {'User-Agent': UA, Accept: 'application/json', ...(init.headers || {})}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url.replace(/(app_key=|jooble\.org\/api\/)[^&/?]+/, '$1***')}`);
  return r.json();
}
async function getText(url) {
  const r = await fetch(url, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  return r.text();
}

function located(location, lat, lon) {
  if (Number.isFinite(lat) && Number.isFinite(lon)) { const p = placeFor(location); return {lat, lon, province: p?.province}; }
  const p = placeFor(location);
  return p ? {lat: p.lat, lon: p.lon, province: p.province} : {};
}

// ---------- In person (South Africa) ----------

async function adzuna(state) {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) { console.log('Adzuna: skipped — add ADZUNA_APP_ID and ADZUNA_APP_KEY secrets for in-person South African jobs'); return null; }
  const auth = `app_id=${encodeURIComponent(id)}&app_key=${encodeURIComponent(key)}`;
  let tags = state.adzunaTags;
  let calls = ADZUNA_CALLS;
  if (!tags?.length || (state.adzunaTagsAt || 0) < Date.now() - 7 * 864e5) {
    const d = await getJson(`https://api.adzuna.com/v1/api/jobs/za/categories?${auth}`); calls--;
    tags = (d.results || []).map(c => c.tag).filter(Boolean);
    state.adzunaTags = tags; state.adzunaTagsAt = Date.now();
  }
  // Rotate through every field; each call takes the 50 newest jobs in one field.
  const jobs = []; let cursor = state.adzunaCursor || 0;
  // One call per run for the newest jobs across all fields, so nothing brand-new is missed.
  const queue = ['', ...Array.from({length: Math.max(0, calls - 1)}, () => tags[(cursor++) % tags.length])];
  state.adzunaCursor = cursor % Math.max(1, tags.length);
  for (const tag of queue) {
    const p = new URLSearchParams({results_per_page: '50', sort_by: 'date', max_days_old: '14', 'content-type': 'application/json'});
    if (tag) p.set('category', tag);
    const d = await getJson(`https://api.adzuna.com/v1/api/jobs/za/search/1?${auth}&${p}`);
    for (const j of d.results || []) {
      const title = strip(j.title), area = j.location?.area || [];
      const where = strip(j.location?.display_name) || area.slice(1).reverse().join(', ') || 'South Africa';
      const pos = located(where, j.latitude, j.longitude);
      const annual = j.salary_is_predicted === '1' ? 0 : (j.salary_min || j.salary_max || 0);
      jobs.push({
        id: 'adzuna:' + j.id, source: 'Adzuna', sourceUrl: 'https://www.adzuna.co.za', url: j.redirect_url, title,
        company: strip(j.company?.display_name) || 'Employer', mode: 'onsite', location: where,
        province: provinces.find(x => area.includes(x)) || pos.province, lat: pos.lat, lon: pos.lon,
        category: adzunaTags[j.category?.tag] || categorize(title, j.category?.label),
        type: [j.contract_time, j.contract_type].filter(Boolean).map(s => s.replace('_', '-')).join(' · ') || undefined,
        salary: j.salary_is_predicted === '1' ? undefined : salaryLabel(j.salary_min / 12, j.salary_max / 12, 'ZAR', 'per month'),
        hourlyZar: annual ? Math.round(annual / 2080) : undefined, posted: j.created, excerpt: excerpt(j.description),
      });
    }
  }
  return jobs;
}

async function jooble(state) {
  const key = process.env.JOOBLE_API_KEY;
  if (!key) { console.log('Jooble: skipped — add a JOOBLE_API_KEY secret for more South African jobs'); return null; }
  const words = fields.filter(f => f !== 'Other').map(f => f.replace(' & ', ' ').replace('Tech IT', 'IT'));
  let cursor = state.joobleCursor || 0;
  const jobs = [];
  for (let i = 0; i < JOOBLE_CALLS; i++) {
    const keywords = i === 0 ? '' : words[(cursor++) % words.length];
    const d = await getJson(`https://jooble.org/api/${encodeURIComponent(key)}`, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({keywords, location: 'South Africa', page: 1, ResultOnPage: 50}),
    });
    for (const j of d.jobs || []) {
      const title = strip(j.title), where = strip(j.location) || 'South Africa';
      const remote = /remote|work from home|wfh/i.test(`${title} ${where} ${j.type || ''}`);
      const pos = remote ? {} : located(where);
      jobs.push({
        id: 'jooble:' + (j.id || j.link), source: 'Jooble', sourceUrl: 'https://za.jooble.org', url: j.link, title,
        company: strip(j.company) || strip(j.source) || 'Employer', mode: remote ? 'remote' : 'onsite',
        location: remote ? 'South Africa (remote)' : where, province: pos.province, lat: pos.lat, lon: pos.lon,
        category: categorize(title, keywords), type: strip(j.type) || undefined, salary: strip(j.salary) || undefined,
        posted: iso(j.updated) || new Date().toISOString(), excerpt: excerpt(j.snippet),
      });
    }
  }
  state.joobleCursor = cursor % words.length;
  return jobs;
}

// ---------- Online (open to people in South Africa) ----------

async function remotive() {
  const d = await getJson('https://remotive.com/api/remote-jobs?limit=1000');
  return (d.jobs || []).filter(j => openToSA(j.candidate_required_location)).map(j => ({
    id: 'remotive:' + j.id, source: 'Remotive', sourceUrl: 'https://remotive.com', url: j.url, title: strip(j.title), company: strip(j.company_name),
    mode: 'remote', location: j.candidate_required_location || 'Worldwide', category: categorize(j.title, j.category),
    type: j.job_type ? j.job_type.replace(/_/g, '-') : undefined, salary: strip(j.salary) || undefined, posted: j.publication_date, excerpt: excerpt(j.description),
  }));
}

async function jobicy() {
  const out = [];
  for (const geo of ['anywhere', 'emea']) {
    const d = await getJson(`https://jobicy.com/api/v2/remote-jobs?count=100&geo=${geo}`);
    for (const j of d.jobs || []) if (openToSA(j.jobGeo)) out.push({
      id: 'jobicy:' + j.id, source: 'Jobicy', sourceUrl: 'https://jobicy.com', url: j.url, title: strip(j.jobTitle), company: strip(j.companyName),
      mode: 'remote', location: j.jobGeo || 'Anywhere', category: categorize(j.jobTitle, ...(j.jobIndustry || [])),
      type: (j.jobType || []).join(' · ') || undefined, salary: salaryLabel(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency, 'per year'),
      posted: j.pubDate, excerpt: excerpt(j.jobExcerpt || j.jobDescription),
    });
  }
  return out;
}

async function himalayas() {
  const out = [];
  for (let offset = 0; offset < 400; offset += 20) {
    const d = await getJson(`https://himalayas.app/jobs/api?limit=20&offset=${offset}`);
    for (const j of d.jobs || []) {
      const where = j.locationRestrictions || [];
      if (where.length && !where.some(l => /south africa|africa|worldwide|anywhere/i.test(l))) continue;
      out.push({
        id: 'himalayas:' + (j.guid || j.applicationLink), source: 'Himalayas', sourceUrl: 'https://himalayas.app', url: j.applicationLink || j.guid,
        title: strip(j.title), company: strip(j.companyName), mode: 'remote', location: where.length ? where.join(', ') : 'Worldwide',
        category: categorize(j.title, ...(j.categories || [])), type: j.employmentType || undefined,
        salary: salaryLabel(j.minSalary, j.maxSalary, j.currency, 'per year'), posted: iso(j.pubDate), excerpt: excerpt(j.excerpt || j.description),
      });
    }
    if ((d.jobs || []).length < 20) break;
  }
  return out;
}

async function remoteok() {
  const d = await getJson('https://remoteok.com/api');
  return (Array.isArray(d) ? d : []).filter(j => j && j.id && j.position && openToSA(j.location)).map(j => ({
    id: 'remoteok:' + j.id, source: 'Remote OK', sourceUrl: 'https://remoteok.com', url: j.url || j.apply_url, title: strip(j.position), company: strip(j.company),
    mode: 'remote', location: j.location || 'Worldwide', category: categorize(j.position, ...(j.tags || [])),
    salary: salaryLabel(j.salary_min, j.salary_max, 'USD', 'per year'), posted: iso(j.date || j.epoch), excerpt: excerpt(j.description),
  }));
}

async function workingNomads() {
  const d = await getJson('https://www.workingnomads.com/api/exposed_jobs/');
  return (Array.isArray(d) ? d : []).filter(j => j.url && openToSA(j.location)).map(j => ({
    id: 'workingnomads:' + j.url, source: 'Working Nomads', sourceUrl: 'https://www.workingnomads.com', url: j.url, title: strip(j.title),
    company: strip(j.company_name), mode: 'remote', location: j.location || 'Worldwide', category: categorize(j.title, j.category_name, j.tags),
    posted: iso(j.pub_date), excerpt: excerpt(j.description),
  }));
}

async function weWorkRemotely() {
  const xml = await getText('https://weworkremotely.com/remote-jobs.rss');
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`)); return m ? m[1].trim() : ''; };
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(m => m[1]).map(it => {
    const full = strip(tag(it, 'title')), [company, ...rest] = full.split(': '), region = strip(tag(it, 'region'));
    return {id: 'wwr:' + tag(it, 'guid'), source: 'We Work Remotely', sourceUrl: 'https://weworkremotely.com', url: tag(it, 'link'),
      title: rest.join(': ') || full, company: rest.length ? company : 'Employer', mode: 'remote', location: region || 'Anywhere',
      category: categorize(full, tag(it, 'category')), type: strip(tag(it, 'type')) || undefined, posted: iso(tag(it, 'pubDate')), excerpt: excerpt(tag(it, 'description'))};
  }).filter(j => openToSA(j.location));
}

const sources = [
  {name: 'Adzuna', url: 'https://www.adzuna.co.za', run: adzuna},
  {name: 'Jooble', url: 'https://za.jooble.org', run: jooble},
  {name: 'Remotive', url: 'https://remotive.com', run: remotive},
  {name: 'Jobicy', url: 'https://jobicy.com', run: jobicy},
  {name: 'Himalayas', url: 'https://himalayas.app', run: himalayas},
  {name: 'Remote OK', url: 'https://remoteok.com', run: remoteok},
  {name: 'Working Nomads', url: 'https://www.workingnomads.com', run: workingNomads},
  {name: 'We Work Remotely', url: 'https://weworkremotely.com', run: weWorkRemotely},
];

// ---------- Build ----------

async function readJson(p, fallback) { try { return JSON.parse(await readFile(p, 'utf8')); } catch { return fallback; } }

async function previousJobs() {
  const map = new Map();
  try {
    for (const f of await readdir(OUT)) if (/^(c-.*|remote)\.json$/.test(f)) for (const j of (await readJson(`${OUT}/${f}`, {jobs: []})).jobs || []) map.set(j.id, j);
  } catch { /* first run */ }
  if (!map.size) for (const j of (await readJson('data/jobs-feed.json', {jobs: []})).jobs || []) map.set(j.id, j); // seed from the old single-file feed
  return map;
}

const state = await readJson(`${OUT}/state.json`, {});
const all = await previousJobs();
const before = all.size;
const used = new Map();
for (const s of sources) {
  try {
    const jobs = await s.run(state);
    if (!jobs) continue;
    let added = 0;
    for (const j of jobs) {
      if (!j.url || !/^https?:\/\//.test(j.url) || !j.title || !j.posted || !Number.isFinite(Date.parse(j.posted))) continue;
      j.category = fields.includes(j.category) ? j.category : categorize(j.title);
      if (!all.has(j.id)) added++;
      all.set(j.id, j);
    }
    console.log(`${s.name}: ${jobs.length} fetched, ${added} new`);
  } catch (e) { console.warn(`${s.name}: failed — ${e.message}. Keeping its earlier jobs.`); }
}

// Expire old jobs, re-categorise older entries, remove duplicate adverts of the same role.
const now = Date.now(), seen = new Set();
let jobs = [...all.values()]
  .map(j => ({...j, category: fields.includes(j.category) ? j.category : categorize(j.title)}))
  .filter(j => now - Date.parse(j.posted) < KEEP_DAYS[j.mode === 'remote' ? 'remote' : 'onsite'] * 864e5)
  .sort((a, b) => Date.parse(b.posted) - Date.parse(a.posted))
  .filter(j => { const k = `${j.title}|${j.company}|${j.mode === 'onsite' ? j.location : ''}`.toLowerCase().replace(/\s+/g, ' '); if (seen.has(k)) return false; seen.add(k); return true; })
  .map(j => Object.fromEntries(Object.entries(j).filter(([, v]) => v !== undefined && v !== null && v !== '')));

if (!jobs.length && before) { console.warn('Nothing usable this run; leaving the published data as it is.'); process.exit(0); }
for (const j of jobs) used.set(j.source, (used.get(j.source) || 0) + 1);

await rm(OUT, {recursive: true, force: true});
await mkdir(OUT, {recursive: true});
const put = (name, list, cap) => writeFile(`${OUT}/${name}.json`, JSON.stringify({jobs: list.slice(0, cap)}));

// latest: newest overall, but every field gets its 40 newest so no field is empty on first load
const latest = new Map();
for (const f of fields) for (const j of jobs.filter(x => x.category === f).slice(0, 40)) latest.set(j.id, j);
for (const j of jobs) { if (latest.size >= CAP.latest) break; latest.set(j.id, j); }
await put('latest', [...latest.values()].sort((a, b) => Date.parse(b.posted) - Date.parse(a.posted)), CAP.latest);
await put('remote', jobs.filter(j => j.mode === 'remote'), CAP.remote);
for (const f of fields) await put('c-' + slug(f), jobs.filter(j => j.category === f), CAP.category);
for (const p of provinces) await put('p-' + slug(p), jobs.filter(j => j.mode === 'onsite' && j.province === p), CAP.province);

const index = {
  updated: new Date().toISOString(),
  total: jobs.length,
  onsite: jobs.filter(j => j.mode === 'onsite').length,
  remote: jobs.filter(j => j.mode === 'remote').length,
  fields: fields.map(f => ({name: f, slug: slug(f), count: jobs.filter(j => j.category === f).length})),
  provinces: provinces.map(p => ({name: p, slug: slug(p), count: jobs.filter(j => j.mode === 'onsite' && j.province === p).length})),
  sources: sources.filter(s => used.get(s.name)).map(s => ({name: s.name, url: s.url, count: used.get(s.name)})),
};
await writeFile(`${OUT}/index.json`, JSON.stringify(index));
await writeFile(`${OUT}/state.json`, JSON.stringify(state));
console.log(`Saved ${index.total} jobs (${index.onsite} in person, ${index.remote} online; was ${before}).`);
