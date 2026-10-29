# Publishing Community Work on Google Play

The Play app is a **Trusted Web Activity**: a small Android app that opens the website full-screen, without a browser
bar. When the website changes, the app changes too — you only upload a new bundle to change the name, icon or version.

## What's ready

| Item | Where |
|---|---|
| Signed app bundle (`.aab`) to upload | Sent to you separately — `community-work-south-africa-1.0.0.aab` |
| Upload key (keep it safe!) | Sent to you separately — `upload-key.jks` + password |
| App settings (package id, colours, icons, shortcuts) | `android/twa-manifest.json` |
| Bundle build | `.github/workflows/android-bundle.yml` → `android-build` branch (unsigned) |
| Website-ownership file | `play-store/site-root/.well-known/assetlinks.json` |
| Store text, data-safety and rating answers | `play-store/listing.md` |
| Icon and feature graphic | `play-store/play-icon-512.png`, `play-store/feature-graphic-1024x500.png` |
| Screenshots | `assets/screenshots/` (or take your own from the installed app) |

Package id: **`communityworksouthafrica.app`** — permanent once published.

## 1. Back up the upload key (do this first)

Save `upload-key.jks` and its password in two safe places (e.g. a password manager and a USB drive). Every future
update must be signed with it. If it's ever lost, Google can reset it (Play Console → App integrity → Request upload
key reset), but that takes days.

## 2. Put the ownership file on your domain root (removes the browser bar)

Android looks for `https://zayaiken21.github.io/.well-known/assetlinks.json` — the root of your GitHub user site.

1. On GitHub create a **public** repository named exactly **`Zayaiken21.github.io`**.
2. Upload the contents of `play-store/site-root/` into it: the `.well-known` folder, `.nojekyll` and `robots.txt`.
3. Settings → Pages → Source: **Deploy from a branch** → `main` / root → Save.
4. After a minute, open https://zayaiken21.github.io/.well-known/assetlinks.json — it should show the JSON.

(Bonus: `robots.txt` there also makes search engines read your crawl rules — see `SEO.md`.)

## 3. Create the Play Console account

https://play.google.com/console → sign up as an **individual** (one-time US$25), verify your identity and phone.

## 4. Create the app and upload to closed testing

1. **Create app** → name *Community Work South Africa*, app, free, accept the declarations.
2. Fill in **App content** using `play-store/listing.md` (privacy policy, ads = yes, app access with a test login,
   target audience 18+, data safety, content rating).
3. **Store listing**: paste the text, upload the icon, feature graphic and at least 2 phone screenshots.
4. **Testing → Closed testing → Create track** → upload `community-work-south-africa-1.0.0.aab` → add testers (an email list).
   Accept **Play App Signing** when asked (Google keeps the final signing key; you keep the upload key).

## 5. Add Google's signing fingerprint (after the first upload)

Play Console → **Test and release → App integrity → App signing** → copy the **SHA-256 certificate fingerprint**
of the *app signing key*. Add it to `sha256_cert_fingerprints` in your `Zayaiken21.github.io` repo's
`.well-known/assetlinks.json` (keep the existing one too — or send it to me and I'll update both files).
Without this, the Play-installed app shows a browser bar.

## 6. The 12-tester rule, then production

New personal accounts need **at least 12 testers opted in to the closed test for 14 days in a row** before you can
apply for production. Invite 15+ people so a few dropping out doesn't reset the clock. After 14 days:
**Dashboard → Apply for production**, answer the questions, then publish to Production.

## How the Android app is built

The app is a Trusted Web Activity generated with Bubblewrap — there is no hand-written Android code to maintain.

| What | Where |
|---|---|
| App settings: package name, version, name, colours, icons, start page, shortcuts | `android/twa-manifest.json` (the source of truth) |
| Gradle project, `AndroidManifest.xml`, Java sources | Generated from that file on every build; a copy of the generated project is published to the `android-build` branch (`project/`) for review |
| Build | `.github/workflows/android-bundle.yml` — runs on every push to `main` that changes `android/twa-manifest.json`, or from Actions → *Android app bundle* → *Run workflow* |
| Checks | The build reads the package name, versionCode and versionName back out of the bundle with Google's bundletool and fails if they don't match (`verification.txt` on the `android-build` branch) |
| Signing | The bundle is built **unsigned**. You sign it with your upload key (`upload-key.jks`), which is never stored on GitHub |

Package name (applicationId and namespace): **`communityworksouthafrica.app`**. It can never change once the app is
published — a different package name is a different app on Google Play.

## Releasing an update (version numbers)

Every upload to Google Play needs a **higher versionCode** than any before it. `android/bump-version.mjs` handles this:

1. After uploading a version to Play, record it:
   `node android/bump-version.mjs --released` (adds it to `android/version-history.json`, then commit and push).
2. To prepare the next one: `node android/bump-version.mjs 1.0.1` — sets versionName 1.0.1 and raises versionCode by
   one (it never goes back to a code already recorded). Push to `main`.
3. Wait for the *Android app bundle* workflow (about 3 minutes), then download `app-release-unsigned.aab` from the
   `android-build` branch and sign it:

   ```sh
   jarsigner -keystore upload-key.jks -sigalg SHA256withRSA -digestalg SHA-256 app-release-unsigned.aab upload
   ```

   (It asks for the password from `upload-key-details.txt`.) Or send it to Claude to sign.
4. Upload it in Play Console as a new release on the same track, with release notes.

`node android/bump-version.mjs --show` prints the current version and the highest code already released.

Website changes (design, features, jobs) need no app update at all — the app always shows the live site.
