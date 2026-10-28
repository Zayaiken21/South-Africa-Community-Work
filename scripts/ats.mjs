// In-person South African jobs straight from employers' public hiring-system feeds (no keys needed).
// See sa-employers.mjs for the list of employers that are tried.

import {employers, knownBoards, workdayBoards} from './sa-employers.mjs';

const UA = 'CommunityWorkSA/1.0 (+https://github.com/Zayaiken21/South-Africa-Community-Work)';
const WEEK = 7 * 864e5;
const MAX_PROBES_PER_RUN = Number(process.env.ATS_MAX_PROBES || 1500);
const CONCURRENCY = 8;

async function get(url, init = {}) {
  const r = await fetch(url, {...init, headers: {'User-Agent': UA, Accept: 'application/json', ...(init.headers || {})}, signal: AbortSignal.timeout(20000), redirect: 'follow'});
  if (r.status === 404 || r.status === 410) return null;                       // no board under that name
  if (!r.ok) throw new Error(`${r.status} for ${url}`);
  const type = r.headers.get('content-type') || '';
  if (!/json/.test(type)) return null;                                         // a login or marketing page, not a feed
  return r.json();
}

// Each system returns plain {id, title, company, url, location, remote, posted, type, team, html} records.
const systems = {
  async gh(name) {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(name)}/jobs?content=true`);
    if (!d || !Array.isArray(d.jobs)) return null;
    const company = d.meta?.name || name;
    return d.jobs.map(j => ({id: `gh:${name}:${j.id}`, title: j.title, company, url: j.absolute_url, location: j.location?.name || (j.offices || []).map(o => o.name).join(', '),
      posted: j.updated_at || j.first_published, team: (j.departments || []).map(x => x.name).join(' '), html: decode(j.content)}));
  },
  async lever(name) {
    let d = await get(`https://api.lever.co/v0/postings/${encodeURIComponent(name)}?mode=json`);
    if (!Array.isArray(d) || !d.length) d = await get(`https://api.eu.lever.co/v0/postings/${encodeURIComponent(name)}?mode=json`);
    if (!Array.isArray(d)) return null;
    return d.map(j => ({id: `lever:${name}:${j.id}`, title: j.text, company: prettify(name), url: j.hostedUrl,
      location: [j.categories?.location, ...(j.categories?.allLocations || [])].filter(Boolean).join(', '), remote: j.workplaceType === 'remote',
      posted: j.createdAt, type: j.categories?.commitment, team: j.categories?.team, html: j.descriptionPlain || j.description}));
  },
  async sr(name) {
    const out = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const d = await get(`https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(name)}/postings?limit=100&offset=${offset}&country=za`);
      if (!d || !Array.isArray(d.content)) return offset ? out : null;
      if (!offset && !d.totalFound && !d.content.length) return null;                // SmartRecruiters answers for any name; empty means no such company
      for (const j of d.content) {
        const l = j.location || {};
        out.push({id: `sr:${name}:${j.id}`, title: j.name, company: j.company?.name || prettify(name), url: `https://jobs.smartrecruiters.com/${name}/${j.id}`,
          location: [l.city, l.region, l.country === 'za' ? 'South Africa' : l.country].filter(Boolean).join(', '), remote: !!l.remote,
          posted: j.releasedDate, type: j.typeOfEmployment?.label, team: j.function?.label || j.department?.label});
      }
      if (d.content.length < 100 || out.length >= (d.totalFound || 0)) break;
    }
    return out;
  },
  async wk(name) {
    if (wkLimited || ++wkCount > Number(process.env.WORKABLE_PER_RUN || 60)) return undefined;   // the rest wait for later runs
    await wkTurn();
    const out = [];
    let token = null;
    for (let page = 0; page < 10; page++) {
      const d = await get(`https://apply.workable.com/api/v3/accounts/${encodeURIComponent(name)}/jobs`, {
        method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({query: '', location: [], department: [], worktype: [], remote: [], ...(token ? {token} : {})}),
      });
      if (!d || !Array.isArray(d.results)) return page ? out : null;
      for (const j of d.results) {
        const l = j.location || {};
        out.push({id: `wk:${name}:${j.shortcode}`, title: j.title, company: prettify(name), url: `https://apply.workable.com/${name}/j/${j.shortcode}/`,
          location: [l.city, l.region, l.country].filter(Boolean).join(', '), remote: !!j.remote, posted: j.published, type: j.type, team: j.department});
      }
      token = d.nextPage; if (!token) break;
    }
    return out;
  },
  async ashby(name) {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(name)}?includeCompensation=true`);
    if (!d || !Array.isArray(d.jobs)) return null;
    return d.jobs.map(j => ({id: `ashby:${name}:${j.id}`, title: j.title, company: prettify(name), url: j.jobUrl,
      location: [j.location, j.address?.postalAddress?.addressLocality, j.address?.postalAddress?.addressCountry, ...(j.secondaryLocations || []).map(s => s.location)].filter(Boolean).join(', '),
      remote: !!j.isRemote, posted: j.publishedAt, type: j.employmentType, team: j.department, html: j.descriptionPlain,
      salary: j.compensation?.compensationTierSummary}));
  },
  async rc(name) {
    const d = await get(`https://${encodeURIComponent(name)}.recruitee.com/api/offers/`);
    if (!d || !Array.isArray(d.offers)) return null;
    return d.offers.map(j => ({id: `rc:${name}:${j.id}`, title: j.title, company: j.company_name || prettify(name), url: j.careers_url,
      location: [j.city, j.state_name, j.country].filter(Boolean).join(', ') || j.location, remote: !!j.remote, posted: j.published_at || j.created_at,
      type: j.employment_type_code, team: j.department, html: j.description}));
  },
  async bamboo(name) {
    const d = await get(`https://${encodeURIComponent(name)}.bamboohr.com/careers/list`);
    if (!d || !Array.isArray(d.result)) return null;
    return d.result.map(j => ({id: `bamboo:${name}:${j.id}`, title: j.jobOpeningName, company: prettify(name), url: `https://${name}.bamboohr.com/careers/${j.id}`,
      location: [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', '), remote: !!j.isRemote, posted: new Date().toISOString(),
      type: j.employmentStatusLabel, team: j.departmentLabel}));
  },
};

// Workable limits how fast it can be asked: one request at a time, 1.5 s apart, and stop for this run on a 429.
let wkLimited = false, wkCount = 0, wkChain = Promise.resolve();
const wkTurn = () => (wkChain = wkChain.then(() => new Promise(res => setTimeout(res, Number(process.env.WORKABLE_DELAY_MS ?? 1500)))));

const decode = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const prettify = s => s.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase());

// Every name on every system, known-good boards first, then a rotating slice of untried or failed ones.
function plan(state) {
  const health = state.ats ||= {};
  const keys = new Set(knownBoards);
  for (const raw of employers) for (const sys of Object.keys(systems)) {
    const names = new Set([raw, raw.toLowerCase().replace(/[^a-z0-9-]/g, '')]);
    for (const n of names) if (n) keys.add(`${sys}:${n}`);
  }
  const now = Date.now();
  const good = [], probe = [];
  for (const k of keys) {
    const h = health[k];
    if (h?.ok && h.sa) good.push(k);                                              // has South African jobs: every run
    else if (h?.ok && now - (h.checked || 0) > 864e5) good.push(k);               // answers, no SA jobs yet: daily
    else if (!h?.ok && now - (h?.checked || 0) > WEEK) probe.push(k);             // never answered: weekly
  }
  return {good, probe: probe.slice(0, MAX_PROBES_PER_RUN)};
}

async function pool(items, fn) {
  const results = [];
  let i = 0;
  await Promise.all(Array.from({length: CONCURRENCY}, async () => { while (i < items.length) { const k = items[i++]; results.push(await fn(k)); } }));
  return results;
}

// Workday: each site is read page by page (20 jobs a page).
function workdayDate(t) {
  const s = String(t || '').toLowerCase(), d = Date.now();
  if (/today/.test(s)) return new Date(d).toISOString();
  if (/yesterday/.test(s)) return new Date(d - 864e5).toISOString();
  const m = s.match(/(\d+)\+?\s*days?/); return new Date(d - (m ? Number(m[1]) : 0) * 864e5).toISOString();
}
async function workday(b) {
  const base = `https://${b.tenant}.${b.dc}.myworkdayjobs.com`;
  const out = [];
  let total = 0;                                                               // Workday only sends the total on the first page
  for (let offset = 0; offset < Number(process.env.WORKDAY_MAX || 2000); offset += 20) {
    const d = await get(`${base}/wday/cxs/${b.tenant}/${b.site}/jobs`, {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({appliedFacets: {}, limit: 20, offset, searchText: ''})});
    if (!d || !Array.isArray(d.jobPostings)) return offset ? out : null;
    for (const j of d.jobPostings) {
      if (!j.title || !j.externalPath) continue;
      out.push({id: `wd:${b.tenant}:${j.bulletFields?.[0] || j.externalPath}`, title: j.title, company: b.company, url: `${base}/en-US/${b.site}${j.externalPath}`,
        location: j.locationsText || '', posted: workdayDate(j.postedOn), saSite: !!b.sa});
    }
    if (d.total) total = d.total;
    if (d.jobPostings.length < 20 || (total && offset + 20 >= total)) break;
    await new Promise(res => setTimeout(res, 250));
  }
  return out;
}

export async function atsJobs(state, h) {
  const health = state.ats ||= {};
  const {good, probe} = plan(state);
  const jobs = [];
  let boardsWithSA = 0, found = 0;
  const wdKeys = workdayBoards.map(b => `wd:${b.tenant}:${b.site}`);
  await pool([...wdKeys, ...good, ...probe], async key => {
    const [sys, ...rest] = key.split(':'), name = rest.join(':');
    let list = null;
    try { list = sys === 'wd' ? await workday(workdayBoards.find(b => `wd:${b.tenant}:${b.site}` === key)) : await systems[sys](name); }
    catch (e) {
      if (sys === 'wk' && /\b429\b/.test(e.message)) { wkLimited = true; return; }   // try again next run
      health[key] = {...health[key], checked: Date.now(), error: String(e.message).slice(0, 80)}; return;
    }
    if (list === undefined) return;                                                  // skipped this run
    if (!list) { health[key] = {ok: false, checked: Date.now()}; return; }
    found++;
    let sa = 0;
    for (const j of list) {
      if (!j.title || !j.url) continue;
      let where = String(j.location || '');
      const remoteSA = j.remote && /south africa|\bza\b/i.test(where);
      if (j.saSite && !h.isSouthAfrican(where)) where = /^\d+ locations?$/i.test(where) || !where ? 'South Africa' : `${where}, South Africa`;
      if (!h.isSouthAfrican(where) && !remoteSA) continue;
      sa++;
      const remote = !!j.remote || /\bremote\b|work from home/i.test(where);
      const pos = remote ? {} : h.located(where);
      jobs.push({
        id: j.id, source: 'Employer sites', sourceUrl: j.url, url: j.url, title: h.strip(j.title), company: h.strip(j.company),
        mode: remote ? 'remote' : 'onsite', location: remote ? 'South Africa (remote)' : where, province: pos.province, lat: pos.lat, lon: pos.lon,
        category: h.categorize(j.title, j.team), type: j.type ? h.strip(j.type) : undefined, salary: j.salary || undefined,
        posted: h.iso(j.posted) || new Date().toISOString(), seenAt: new Date().toISOString(), excerpt: h.excerpt(j.html),
      });
    }
    if (sa) boardsWithSA++;
    health[key] = {ok: true, checked: Date.now(), total: list.length, sa};
  });
  console.log(`Employer sites: ${good.length} known boards, ${probe.length} names tried, ${found} answered, ${boardsWithSA} with South African jobs, ${jobs.length} listings`);
  return jobs;
}
