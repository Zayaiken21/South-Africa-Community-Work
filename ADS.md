# Ads: setup and getting paid

The app already has ad spots built in. Until you connect Google AdSense they show Community Work promos (CV builder, post a job, online jobs, install the app), labelled “From Community Work”. Once AdSense is connected, the same spots show paid ads labelled “Advertisement”.

## Where ads appear

| Spot | Where | Phone | Computer |
| --- | --- | --- | --- |
| **In-feed** (between content) | After the 4th job, then every 8 jobs | ✔ | ✔ |
| **In-article** (between text) | Job details (between description and start time), How it works, Help | ✔ | ✔ |
| **Sidebar** | Jobs sidebar, job details contact panel | — | ✔ |
| **Hanging / anchor** | Google’s anchor bar (paid). Before approval: a dismissible “No CV yet?” bar above the tab bar | ✔ | ✔ |
| **Side rails** | Google’s side rail ads in the empty margins of wide screens | — | ✔ |

No ads on: Post a job, CV builder, Privacy, Terms, offline page. No pop-ups or full-screen ads. The first 4 results are never interrupted.

**Video ads:** AdSense ad units now serve all ad types, so the in-feed, in-article and sidebar spots can show video ads automatically. True “before the video” ads (in-stream) need your own videos and Google Ad Manager; add that later if you publish video content.

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
  "feedLayoutKey": "-6t+ed+2i-1n-4w",
  "houseAds": true
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
