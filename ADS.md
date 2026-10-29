# Affiliate ads

Community Work earns from **affiliate ads**: links to partners who pay a commission when people click or sign up.
You add them yourself in **CEO dashboard → Affiliate ads**. Nothing needs editing on GitHub.

## Where they appear

Only on the job pages — Home, Find work (in person and online) and a job's details page. Never on account, shift,
support, rules, legal or dashboard pages.

| Place | Where on the page | Best banner size |
|---|---|---|
| Between jobs | After the 5th job in the list, then every 10 jobs | 728 × 250 (wide), or a text ad |
| Sidebar | Beside the job list on computers; inside the page flow on phones | 300 × 250 or 300 × 600 |
| Inside job text | Inside a job's description, after the first paragraph | 728 × 90 or 728 × 250 |
| Phone banner | A small strip at the bottom of phones after some scrolling (closable for 3 days) | 320 × 100 |

Every ad is labelled **Sponsored** with “We may earn a commission when you use this link.”, so visitors always
know it's an ad.

## Adding an ad

1. Open **CEO dashboard → Affiliate ads → Add an ad**.
2. Choose **Image banner** (upload a picture, up to 3 MB) or **Text ad** (headline, short text, button).
3. Paste your **affiliate link** (must start with `https://`).
4. Pick **where it can appear**, whether it shows with in-person jobs, online jobs or both, and (optionally) the kinds
   of jobs it suits best — it's then shown more often next to those jobs.
5. Optional: start and end dates, how often it shows, and a view-tracking pixel if your affiliate programme gives one.
6. Check the preview and press **Add ad**.

You can pause, edit, schedule or delete any ad, and switch all ads off with one switch.

## Results

The dashboard shows **views** (half the ad on screen), **clicks** and **click rate** for each ad over the last 30 days,
and the Overview shows total affiliate ad clicks. Your earnings themselves are in each affiliate programme's own report.

## How it works in the code

- `frontend/ads.tsx` loads live ads from the `promos` table, picks the best one for each spot, and counts views.
- `frontend/analytics.ts` records the click when someone taps an ad (`data-offer` on the link).
- `frontend/admin-people.tsx` → `AdsAdmin` is the dashboard screen; images go to the public `promos` storage folder.
- Database: `promos` table and `promos` storage bucket in `supabase/migrations/20261028300000_ceo_mode_bans_ads.sql`.
