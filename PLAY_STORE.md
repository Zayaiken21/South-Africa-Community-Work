# Publishing Community Work on Google Play

The app is a Progressive Web App (PWA): it has a web manifest, a service worker with an offline page, and app icons. Google Play accepts PWAs packaged as a **Trusted Web Activity (TWA)** — a small Android app that opens the site full-screen in Chrome, with no browser bar. When you update the site on GitHub, the Play app updates too; you only rebuild the Android package to change the icon, name or package settings.

## What’s already in this repo

| File | Purpose |
| --- | --- |
| `manifest.webmanifest` | App name, icons, colours, start page, shortcuts |
| `sw.js` | Offline support and fast loading |
| `offline.html` | Shown when there’s no connection |
| `assets/icons/` | 192/512 icons, maskable icon, Apple touch icon, share image |
| `play-store/play-icon-512.png` | Play Store listing icon (512×512) |
| `play-store/feature-graphic-1024x500.png` | Play Store feature graphic |
| `privacy.html` | Privacy policy URL required by Play |

## 1. Make sure the site is live

Push to `main`, wait for GitHub Pages to deploy, then open https://zayaiken21.github.io/South-Africa-Community-Work/ on an Android phone in Chrome. You should be offered **Install app**. If you are, the PWA side is ready.

## 2. Generate the Android package

1. Go to https://www.pwabuilder.com and enter `https://zayaiken21.github.io/South-Africa-Community-Work/`.
2. Choose **Package for stores → Android → Google Play**.
3. Suggested settings:
   - Package ID: `io.github.zayaiken21.communitywork` (permanent — pick carefully)
   - App name: `Community Work South Africa`, launcher name: `Community Work`
   - Status bar / theme colour: `#176B4E`, splash background: `#F5F6F1`
   - Signing key: **Create new** — then back up the `.keystore` file and passwords somewhere safe. You can never update the app without them.
4. Download the zip. It contains the `.aab` (upload to Play), a test `.apk`, your signing key, and `assetlinks.json`.

## 3. Prove you own the website (removes the browser bar)

Android checks `https://zayaiken21.github.io/.well-known/assetlinks.json` — the root of your GitHub user site, not this project.

1. Create a repository named exactly `Zayaiken21.github.io` (if you don’t have one).
2. Add `.well-known/assetlinks.json` from the PWABuilder zip.
3. Add an empty `.nojekyll` file at the root of that repo (otherwise GitHub Pages hides folders that start with a dot).
4. Enable Pages for it, then check the URL above opens the JSON.

After uploading to Play, open **Play Console → Setup → App signing** and copy the **SHA-256 fingerprint of the app signing key**. Add it to the `sha256_cert_fingerprints` list in `assetlinks.json` (keep the one PWABuilder put there too). Without this step the Play-installed app shows a URL bar.

> A custom domain (e.g. communitywork.co.za) avoids needing the separate user-site repo; `assetlinks.json` then lives on that domain.

## 4. Create the Play listing

In Play Console (one-time US$25 developer registration):

- **App details:** name, short description (80 chars), full description.
  - Short: *Find local shifts, jobs across South Africa and online work near you.*
- **Graphics:** icon `play-store/play-icon-512.png`, feature graphic `play-store/feature-graphic-1024x500.png`, and at least 2 phone screenshots (take them on your phone from the installed app).
- **Category:** Business. **Tags:** Jobs.
- **Privacy policy:** https://zayaiken21.github.io/South-Africa-Community-Work/privacy.html
- **Data safety form:** declare
  - *Location* — approximate and precise; used for app functionality; not shared for advertising; processed to find nearby jobs.
  - *Personal info* — name, email or phone only if a user posts a job (shown publicly by design).
  - *Personal info* (accounts) — name, email, phone, profile and CV for people who sign up; used for app functionality.
  - *Financial info* — escrow payments are handled by TradeSafe.
  - *App activity* — anonymous page views and clicks, used for analytics.
- **Ads:** answer **Yes** to “Contains ads” (affiliate ads on the job pages). See `ADS.md`.
- **Content rating:** complete the questionnaire (no violence or user-to-user chat; listings are user-generated content).
- **Target audience:** 18+ (job seekers).

## 5. Testing before production

New personal developer accounts must run a **closed test with at least 12 testers who stay opted in for 14 days in a row** before you can apply for production. Upload the `.aab` to a closed testing track, invite friends, family or community members by email, and keep them opted in. Then apply for production access from the Dashboard.

## Updating later

- Website changes (design, features, job listings): just push to GitHub. No Play update needed.
- Name, icon, package settings: regenerate in PWABuilder **with the same signing key**, bump the version code, upload the new `.aab`.
