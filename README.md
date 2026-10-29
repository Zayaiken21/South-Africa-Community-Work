# South Africa Community Work

A job and shift marketplace for South Africa: workers pick up paid hourly shifts (pay held in escrow), businesses hire
by the shift, and everyone can browse in-person and online jobs. It installs on phones as an app.

**Live site:** https://zayaiken21.github.io/South-Africa-Community-Work/

## How it fits together

| Part | Where it runs | What it does |
|---|---|---|
| Website (`frontend/` → root `*.html` + `assets/`) | GitHub Pages | Every page people see. React, bundled by `frontend/build.mjs`. |
| Accounts, shifts, payments, support, ads (`supabase/`) | Supabase | Database with row-level security, file storage, and two server functions for escrow. |
| Job feed (`scripts/` + `.github/workflows/update-jobs.yml`) | GitHub Actions, every 3 hours | Collects jobs and publishes them to the `jobs-data` branch, which the site reads. |
| Community posts API (`app/`, `db/`, `drizzle/`, `lib/jobs.ts`) | Hosted separately (Sites) | The older posting API; the site still reads community posts from it. |

Setup steps for the database, sign-in emails, payments and the CEO account: **[BACKEND.md](BACKEND.md)**.
Affiliate ads: **[ADS.md](ADS.md)**. Search engines, sitemap and app stores: **[SEO.md](SEO.md)**.
Publishing to Google Play: **[PLAY_STORE.md](PLAY_STORE.md)**.

## Code map

### Website — `frontend/`

| File | What it is |
|---|---|
| `build.mjs` | Builds the site: bundles the app, writes one HTML page per route with search-engine tags and structured data, the service worker (`sw.js`), the app manifest, `sitemap.xml`, `robots.txt` and `llms.txt`. Run with `pnpm build:pages`. |
| `main.tsx` | The app shell: header, menu, bottom tab bar, footer, and the simple pages (home, job details, saved jobs, how it works, about, privacy, terms, offline, 404). Picks the page to show from the file name. |
| `JobsView.tsx` | The job board (Home and Find work): location, filters, in-person/online, the job list with affiliate ads between jobs and in the sidebar. Also the shared bottom `Sheet`. |
| `marketplace.tsx` | Accounts and shifts: sign-in, the Working/Hiring dashboard, posting and managing shifts, picking up shifts, payouts, appeals, two-step sign-in, and the CEO dashboard (overview, payments, team, settings, activity log). |
| `admin-people.tsx` | CEO dashboard parts: People (cards with pause/ban per side), Live activity feed, and Affiliate ads. |
| `profile.tsx` | Profile photos, themes, public profile pages and the profile editor. |
| `support.tsx` | Support page: Randy the assistant, talk-to-a-person queue, request threads, contact card, and the CEO support queue. |
| `randy-knowledge.ts` | Everything Randy knows: questions people ask and the answers. |
| `rules.tsx` | The Community rules page. |
| `ads.tsx` | Affiliate ads: loading, choosing which ad goes where, the ad cards/banners and view counting. |
| `analytics.ts` | Anonymous page-view and click counting for the dashboard, plus optional Google Analytics after consent. |
| `backend.ts` | Connection to Supabase, the signed-in account (`useAccount`) and the `Profile` type. |
| `catalog.ts` | Job feed addresses, job types, money and distance formatting, saved jobs. |
| `location.ts`, `LocationPicker.tsx` | Finding the visitor's area (GPS, then network estimate) and the place search. |
| `themes.ts` | The colour themes people can pick for their profile. |
| `app.css` | All styles. |

Root `*.html`, `assets/community-app.js|css`, `sw.js`, `manifest.webmanifest`, `sitemap.xml`, `robots.txt` and `llms.txt`
are **generated** by
`build.mjs` — edit `frontend/` and rebuild instead. `cv-builder.html` is the standalone CV builder.

Site settings you can change on GitHub without rebuilding: `backend-config.json` (Supabase address and public key),
`support-config.json` (support email, phone, WhatsApp, hours), `analytics-config.json` (Google Analytics ID).

### Database — `supabase/`

| Path | What it is |
|---|---|
| `migrations/20261028000000_marketplace.sql` | The base database (run once). |
| `migrations/2026102812…` to `20261029010000_…sql` | Updates 1–12, each safe to run again. |
| `run-updates.sql` | Updates 1–12 in one file — the easy way to bring the database up to date. |
| `repair-accounts.sql` | Fixes accounts created before the database existed and makes the CEO account staff. |
| `functions/payments`, `functions/tradesafe-callback`, `functions/_shared` | Server functions for TradeSafe escrow. |
| `email-templates/` | Branded sign-up, password-reset and other emails to paste into Supabase. |
| `tests/security.test.mjs` | Tests that the database rules block what they should (run instructions at the top of the file). |

### Job feed — `scripts/`

| File | What it does |
|---|---|
| `fetch-jobs.mjs` | Collects jobs from employer career sites, Jooble and online job boards, sorts them by type and province, and writes the feed files. |
| `ats.mjs` | Reads employers' hiring-system feeds (the in-person jobs). |
| `sa-employers.mjs` | The list of South African employers to check. |
| `sa-places.mjs` | South African towns and provinces, used to place each job. |
| `make-brand.mjs` | Draws the logo and app icons in `brand/` and `play-store/`. |

### Community posts API and its hosting

`app/` (page and `api/jobs` route), `db/` and `drizzle/` (D1 database schema), `lib/jobs.ts` (shared rules and
validation, tested by `tests/jobs.test.ts`). `vite.config.ts`, `next.config.ts`, `build/`, `lib/connector*`,
`scripts/run-framework.mjs`, `scripts/install-pnpm.sh`, `scripts/*install*.mjs`, `scripts/sites-env.*`,
`scripts/execution-profile.mjs`, `scripts/build-verified.sh`, `scripts/connector-preview/` and `.openai/hosting.json`
are that host's build setup — keep them so the API can still be rebuilt.

### Other

`brand/` logo files · `play-store/` store graphics · `assets/icons/` app icons · `data/jobs-feed.json` fallback feed ·
`jooble-boost.json` optional one-off Jooble boost.

## Working on it

```sh
pnpm install          # once
pnpm build:pages      # rebuild the website after changing frontend/
npx tsc --noEmit -p . # type check
```
