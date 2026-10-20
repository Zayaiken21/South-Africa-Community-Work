#!/usr/bin/env node
// Builds data/jobs-feed.json from public job sources. Runs in GitHub Actions (see .github/workflows/refresh-jobs.yml),
// so no API keys ever reach the browser.
//
//   In-person South African jobs: Adzuna (needs free ADZUNA_APP_ID + ADZUNA_APP_KEY repository secrets)
//   Online jobs open to South Africa: Remotive, Jobicy, Himalayas (no keys)
//
// Each source is optional. If one fails, its previous listings are kept so the app never goes blank because of an outage.

import {readFile, writeFile, mkdir} from 'node:fs/promises';

const OUT = 'data/jobs-feed.json';
const UA = 'CommunityWorkSA/1.0 (+https://github.com/Zayaiken21/South-Africa-Community-Work)';
const MAX_REMOTE = 250, MAX_ONSITE = 400, REMOTE_MAX_AGE_DAYS = 45;

const provinces = ['Eastern Cape', 'Free State', 'Gauteng', 'KwaZulu-Natal', 'Limpopo', 'Mpumalanga', 'North West', 'Northern Cape', 'Western Cape'];

const categoryRules = [
  ['Tech & IT', /\b(developer|engineer|software|devops|data|it support|web|frontend|backend|full[- ]?stack|qa|sdet|cloud|cyber|programmer|analyst|technical|it )\b/i],
  ['Healthcare', /\b(nurse|nursing|doctor|medical|health|pharmac|clinic|caregiver|care worker|therap|dental)\b/i],
  ['Education', /\b(teacher|tutor|lecturer|education|teaching|school|trainer|instructor|esl)\b/i],
  ['Finance', /\b(accountant|accounting|finance|financial|bookkeep|payroll|audit|tax|credit|bank)\b/i],
  ['Customer service', /\b(call cent|customer (service|support|success)|contact cent|support agent|help ?desk|client service)\b/i],
  ['Sales & marketing', /\b(sales|marketing|seo|social media|brand|business development|account (manager|executive)|copywrit|growth)\b/i],
  ['Warehouse & logistics', /\b(warehouse|logistic|picker|packer|forklift|stock|inventory|supply chain|dispatch)\b/i],
  ['Driving & delivery', /\b(driver|delivery|courier|code 1[0-4]|transport|fleet)\b/i],
  ['Hospitality', /\b(chef|cook|waiter|waitress|barista|hotel|kitchen|restaurant|hospitality|bartender|housekeep)\b/i],
  ['Retail', /\b(retail|cashier|store|shop|merchandis|sales assistant|till)\b/i],
  ['Cleaning', /\b(clean|domestic|janitor|hygiene)\b/i],
  ['Construction', /\b(construction|builder|electrician|plumber|artisan|welder|carpent|bricklay|site manager|civil|technician|mechanic|fitter)\b/i],
  ['Events', /\b(event|promoter|promotion|usher)\b/i],
  ['Admin & office', /\b(admin|administrat|receptionist|office|secretary|assistant|clerk|data capturer|coordinator|virtual assistant)\b/i],
];
const categorize = (...text) => (categoryRules.find(([, re]) => re.test(text.join(' '))) || ['Other'])[0];

const strip = html => String(html || '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&rsquo;|&lsquo;/g, '’')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ').trim();
const excerpt = html => { const t = strip(html); return t.length > 220 ? t.slice(0, 217).replace(/\s+\S*$/, '') + '…' : t; };

async function getJson(url) {
  const r = await fetch(url, {headers: {'User-Agent': UA, Accept: 'application/json'}, signal: AbortSignal.timeout(30000)});
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} for ${url.replace(/app_key=[^&]+/, 'app_key=***')}`);
  return r.json();
}

const fmt = n => Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ');
function salaryLabel(min, max, currency, period) {
  if (!min && !max) return undefined;
  const cur = currency === 'ZAR' || !currency ? 'R' : currency + ' ';
  const range = min && max && Math.round(min) !== Math.round(max) ? `${cur}${fmt(min)} – ${cur}${fmt(max)}` : `${cur}${fmt(min || max)}`;
  return period ? `${range} ${period}` : range;
}

// Remote roles must be open to people in South Africa.
const openToSA = loc => !loc || /worldwide|anywhere|global|south africa|\bafrica\b|emea|\bza\b|^remote$/i.test(loc);

// ---------- Sources ----------

async function adzuna() {
  const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
  if (!id || !key) { console.log('Adzuna: skipped (set ADZUNA_APP_ID and ADZUNA_APP_KEY secrets to enable in-person SA jobs)'); return null; }
  const jobs = [];
  for (let page = 1; page <= 8; page++) {
    const p = new URLSearchParams({app_id: id, app_key: key, results_per_page: '50', sort_by: 'date', max_days_old: '30', 'content-type': 'application/json'});
    const d = await getJson(`https://api.adzuna.com/v1/api/jobs/za/search/${page}?${p}`);
    for (const j of d.results || []) {
      const area = j.location?.area || [];
      const title = strip(j.title);
      const annual = j.salary_is_predicted === '1' ? 0 : (j.salary_min || j.salary_max || 0);
      jobs.push({
        id: 'adzuna:' + j.id, source: 'Adzuna', sourceUrl: 'https://www.adzuna.co.za', url: j.redirect_url,
        title, company: strip(j.company?.display_name) || 'Employer', mode: 'onsite',
        location: strip(j.location?.display_name) || area.slice(1).reverse().join(', ') || 'South Africa',
        province: provinces.find(p => area.includes(p)),
        lat: Number.isFinite(j.latitude) ? j.latitude : undefined, lon: Number.isFinite(j.longitude) ? j.longitude : undefined,
        category: categorize(title, j.category?.label),
        type: [j.contract_time, j.contract_type].filter(Boolean).map(s => s.replace('_', '-')).join(' · ') || undefined,
        salary: j.salary_is_predicted === '1' ? undefined : salaryLabel(j.salary_min / 12, j.salary_max / 12, 'ZAR', 'per month'),
        hourlyZar: annual ? Math.round(annual / 2080) : undefined,
        posted: j.created, excerpt: excerpt(j.description),
      });
    }
    if ((d.results || []).length < 50) break;
  }
  return jobs;
}

async function remotive() {
  const d = await getJson('https://remotive.com/api/remote-jobs?limit=400');
  return (d.jobs || []).filter(j => openToSA(j.candidate_required_location)).map(j => ({
    id: 'remotive:' + j.id, source: 'Remotive', sourceUrl: 'https://remotive.com', url: j.url,
    title: strip(j.title), company: strip(j.company_name), mode: 'remote', location: j.candidate_required_location || 'Worldwide',
    category: categorize(j.title, j.category), type: j.job_type ? j.job_type.replace(/_/g, '-') : undefined,
    salary: strip(j.salary) || undefined, posted: j.publication_date, excerpt: excerpt(j.description),
  }));
}

async function jobicy() {
  const d = await getJson('https://jobicy.com/api/v2/remote-jobs?count=100&geo=anywhere');
  return (d.jobs || []).filter(j => openToSA(j.jobGeo)).map(j => ({
    id: 'jobicy:' + j.id, source: 'Jobicy', sourceUrl: 'https://jobicy.com', url: j.url,
    title: strip(j.jobTitle), company: strip(j.companyName), mode: 'remote', location: j.jobGeo || 'Anywhere',
    category: categorize(j.jobTitle, ...(j.jobIndustry || [])), type: (j.jobType || []).join(' · ') || undefined,
    salary: salaryLabel(j.annualSalaryMin, j.annualSalaryMax, j.salaryCurrency, 'per year'),
    posted: j.pubDate, excerpt: excerpt(j.jobExcerpt || j.jobDescription),
  }));
}

async function himalayas() {
  const out = [];
  for (let offset = 0; offset < 100; offset += 20) {
    const d = await getJson(`https://himalayas.app/jobs/api?limit=20&offset=${offset}`);
    for (const j of d.jobs || []) {
      const where = j.locationRestrictions || [];
      if (where.length && !where.some(l => /south africa|africa|worldwide|anywhere/i.test(l))) continue;
      out.push({
        id: 'himalayas:' + (j.guid || j.applicationLink), source: 'Himalayas', sourceUrl: 'https://himalayas.app', url: j.applicationLink || j.guid,
        title: strip(j.title), company: strip(j.companyName), mode: 'remote', location: where.length ? where.join(', ') : 'Worldwide',
        category: categorize(j.title, ...(j.categories || [])), type: j.employmentType || undefined,
        salary: salaryLabel(j.minSalary, j.maxSalary, j.currency, 'per year'),
        posted: new Date((j.pubDate || 0) * (j.pubDate > 1e12 ? 1 : 1000)).toISOString(), excerpt: excerpt(j.excerpt || j.description),
      });
    }
    if ((d.jobs || []).length < 20) break;
  }
  return out;
}

const sources = [
  {name: 'Adzuna', url: 'https://www.adzuna.co.za', run: adzuna},
  {name: 'Remotive', url: 'https://remotive.com', run: remotive},
  {name: 'Jobicy', url: 'https://jobicy.com', run: jobicy},
  {name: 'Himalayas', url: 'https://himalayas.app', run: himalayas},
];

// ---------- Build ----------

let previous = {jobs: []};
try { previous = JSON.parse(await readFile(OUT, 'utf8')); } catch { /* first run */ }

const all = [], used = [];
for (const s of sources) {
  let jobs;
  try { jobs = await s.run(); } catch (e) { console.warn(`${s.name}: failed — ${e.message}. Keeping previous listings.`); jobs = previous.jobs.filter(j => j.source === s.name); }
  if (!jobs) continue;
  const valid = jobs.filter(j => j.url && /^https:\/\//.test(j.url) && j.title && Number.isFinite(Date.parse(j.posted)));
  console.log(`${s.name}: ${valid.length} jobs`);
  if (valid.length) used.push({name: s.name, url: s.url, count: valid.length});
  all.push(...valid);
}

// De-duplicate the same role listed on several boards.
const seen = new Set();
const unique = all.filter(j => { const k = (j.title + '|' + j.company).toLowerCase().replace(/\s+/g, ' '); if (seen.has(k)) return false; seen.add(k); return true; });

const cutoff = Date.now() - REMOTE_MAX_AGE_DAYS * 86400000;
const byDate = (a, b) => Date.parse(b.posted) - Date.parse(a.posted);
const remote = unique.filter(j => j.mode === 'remote' && Date.parse(j.posted) > cutoff).sort(byDate).slice(0, MAX_REMOTE);
const onsite = unique.filter(j => j.mode === 'onsite').sort(byDate).slice(0, MAX_ONSITE);
const jobs = [...onsite, ...remote].map(j => Object.fromEntries(Object.entries(j).filter(([, v]) => v !== undefined && v !== '')));

if (!jobs.length && previous.jobs?.length) { console.warn('No jobs fetched at all; leaving the existing feed unchanged.'); process.exit(0); }

await mkdir('data', {recursive: true});
await writeFile(OUT, JSON.stringify({updated: new Date().toISOString(), sources: used, jobs}) + '\n');
console.log(`Wrote ${jobs.length} jobs (${onsite.length} in person, ${remote.length} online) to ${OUT}`);
