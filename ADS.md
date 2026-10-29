# Making money: affiliate offers and Google ads

Money spots appear **only on the job pages**: Home, Find work (in person and online) and job details. Each spot shows, in this order:

1. **Your affiliate offer** — added in **CEO dashboard → Ads** (easiest: add, pause, schedule and see views/clicks there), or in `affiliates.json` — you earn per click, sign-up or sale (or per view, if your network gives you a view pixel).
2. **A Google AdSense ad** from `ads-config.json` — Google pays per 1,000 views and per click.
3. **Nothing** — empty spots disappear. There are no filler promos.

When both are set up, spots alternate between your offers and Google ads so you earn from both.

## Where the spots are

| Spot | Where | Phone | Computer |
| --- | --- | --- | --- |
| **In the feed** | After the 5th job, then every 10 jobs. Looks like a job card, labelled “Sponsored”. Picks the offer that best matches the job above it (category, in-person or online). | ✔ | ✔ |
| **Between text** | Job details (between the description and the start time), How it works, Help | ✔ | ✔ |
| **Sidebar** | Jobs sidebar, under “Your area” | — | ✔ |
| **Hanging bar** | Slides up above the tab bar after scrolling; closable, stays closed 3 days. Only when Google ads are off (then Google’s anchor ad takes its place). | ✔ | — |

No spots on Post a job, the CV builder, Privacy, Terms or the offline page. No pop-ups. Every spot says “Sponsored” or “Advertisement”, links carry `rel="sponsored"` (Google’s rule for paid links), and the footer, Privacy and Terms pages disclose affiliate commissions.

**See it before you go live:** add `?adpreview=1` to any page, e.g. `https://zayaiken21.github.io/South-Africa-Community-Work/find-work.html?adpreview=1`. The five sample offers show, marked “Sample”.

## Affiliate offers — affiliates.json

Edit it on GitHub (pencil icon) — no rebuild needed. One block per offer:

```json
{
  "id": "coursera-excel",
  "partner": "Coursera",
  "title": "Learn Excel in two weeks",
  "text": "Short online course with a certificate you can add to your CV.",
  "badge": "Certificate included",
  "cta": "See course",
  "url": "https://YOUR-AFFILIATE-TRACKING-LINK",
  "logo": "https://…/logo.png",
  "spots": ["feed", "article", "sidebar"],
  "categories": ["Admin & office", "Finance"],
  "modes": ["remote"],
  "weight": 2,
  "impressionUrl": "https://…/view-pixel",
  "start": "2026-11-01", "end": "2026-12-31"
}
```

- **url** — your tracking link from the affiliate network. This is how you get credited for clicks and sales.
- **spots** — any of `feed`, `article`, `sidebar`, `hanging`. Leave out for all except `hanging`.
- **categories** — job types it suits (`Hospitality`, `Retail`, `Cleaning`, `Warehouse & logistics`, `Driving & delivery`, `Construction`, `Events`, `Admin & office`, `Customer service`, `Sales & marketing`, `Tech & IT`, `Healthcare`, `Education`, `Finance`, `Other`). Matching offers show beside matching jobs.
- **modes** — `onsite` (in person) or `remote` (online). Leave out for both.
- **weight** — higher shows more often.
- **impressionUrl** — for pay-per-view deals: the network’s view pixel. It fires once when half the card is on screen.
- **start / end** — run a deal for a set time.
- To go live, delete the sample offers (or remove `"sample": true` and swap in your links).

### What fits a jobs app

Offers that help people get hired convert best: online courses and certificates, CV and interview help, freelance marketplaces (for the Online tab), driving lessons (for delivery jobs), workwear and safety boots (for warehouse and building jobs), data bundles and phones, and bank accounts for a first payslip. Coursera, Udemy and Fiverr all run affiliate programs; check each one accepts South African sites before you apply.

Never promote paid “job placement” fees or get-rich-quick schemes — they hurt trust and break Google’s rules.

# Google AdSense (optional, runs alongside offers)

## 1. Apply for AdSense

1. Go to https://adsense.google.com and sign up with the Google account you want paid to.
2. Add your site as **`zayaiken21.github.io`**. (`github.io` is on the public suffix list, which AdSense accepts. A custom domain such as `communitywork.co.za` is better long term — it’s yours if you ever move hosting, and it looks more trustworthy.)
3. AdSense gives you a publisher ID like `ca-pub-1234567890123456` and asks you to verify the site. Choose **ads.txt** (step 2 below) or the code snippet — the app adds the AdSense script automatically once step 4 is done.
4. Approval usually takes a few days to a few weeks. Sites with real content, a privacy policy (already done) and clear navigation get approved faster.

## 2. Add ads.txt (required to get paid in full)

ads.txt must live at the **root** of your site: `https://zayaiken21.github.io/ads.txt`. That root belongs to your user site repo `Zayaiken21.github.io` (the same one Play needs for `assetlinks.json`, see `PLAY_STORE.md`).

1. Create the repo `Zayaiken21.github.io` if you don’t have it, with an empty `.nojekyll` file.
2. Add a file named `ads.txt` with this one line (use your own publisher number):

   ```
   google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
   ```
3. Check https://zayaiken21.github.io/ads.txt opens.

## 3. Create the ad units

In AdSense → **Ads → By ad unit**:

| Create | Name it | Copy into `ads-config.json` |
| --- | --- | --- |
| **In-feed ad** (“Generate automatically”) | CW feed | `slots.feed` = data-ad-slot, `feedLayoutKey` = data-ad-layout-key |
| **In-article ad** | CW article | `slots.article` = data-ad-slot |
| **Display ad**, Responsive | CW sidebar | `slots.sidebar` = data-ad-slot |

## 4. Turn it on

Edit `ads-config.json` in the repo (you can do it on github.com with the pencil icon):

```json
{
  "enabled": true,
  "client": "ca-pub-1234567890123456",
  "slots": { "feed": "1111111111", "sidebar": "2222222222", "article": "3333333333" },
  "feedLayoutKey": "-6t+ed+2i-1n-4w"
}
```

Commit. The site picks it up on the next page load — no rebuild needed. Set `"enabled": false` any time to switch paid ads off.

## 5. Hanging ads and side rails (Auto ads)

AdSense → **Ads → By site → zayaiken21.github.io → Edit**:

- **Auto ads: on.**
- **Ad formats:**
  - Anchor ads: **on**. Set position to **Top only** on mobile — the app’s tab bar is at the bottom, and Google doesn’t allow ads that crowd navigation. Allow desktop anchor ads.
  - Side rail ads: **on**.
  - Vignette (full-screen) ads: **off** — they interrupt people mid-search.
  - In-page ads: **off** — the app already places those spots carefully; turning this on lets Google add extra ads between jobs.
- **Ad load:** keep near the middle. More ads ≠ more money if people leave.

## 6. Consent (needed for visitors from Europe/UK)

AdSense → **Privacy & messaging** → create a **European regulations** message (Google’s own consent banner, no code). Google requires a certified consent message for visitors from the EEA, UK and Switzerland. South African visitors are covered by the Privacy page’s advertising section.

## 7. Getting paid

- AdSense pays monthly once your balance reaches the payment threshold (about US$100 for most countries).
- Add your tax info (US: W-9 in **Payments → Settings**) and a bank account. You’ll verify a PIN mailed to your address once earnings pass the verification threshold.
- Earnings show in **Reports**. Job sites with South African traffic earn less per view than US sites; in-feed and anchor ads are usually the best earners on phones.

## Play Store

AdSense’s own policy allows ads shown inside **Trusted Web Activities**, which is how the Play app works. In Play Console you must:

- Answer **Yes** to “Does your app contain ads?” (shows a *Contains ads* label).
- In **Data safety**, add *Device or other IDs* (advertising ID) collected for *Advertising or marketing*, shared with Google.
