# Accounts, shifts, escrow and tracking: setup

The website is already connected to your Supabase project (`backend-config.json`).
Do these steps once, in order. Nothing here needs a terminal except step 5.

## 1. Create the database (5 minutes)

1. Open Supabase → your project → **SQL Editor** → **New query**.
2. Paste the whole file `supabase/migrations/20261028000000_marketplace.sql` and press **Run**.
   It creates the tables, security rules, the private `resumes` storage bucket and the dashboard functions.

### Updates (run each once, in this order, after the file above)

| File | What it adds |
|---|---|
| `supabase/migrations/20261028120000_shift_pickup_strikes.sql` | Workers pick up shifts themselves, strikes, suspension and appeals |
| `supabase/migrations/20261028140000_dual_accounts_profiles.sql` | One account for working and hiring, profile photos, themes, detailed profiles |
| `supabase/migrations/20261028160000_optional_2step_cleanup.sql` | Two-step sign-in becomes optional; deleting jobs; nightly clean-up of old data |
| `supabase/migrations/20261028180000_one_mode_at_a_time.sql` | One mode at a time: Working or Hiring, switched from the dashboard |
| `supabase/migrations/20261028200000_rebook_blocks_business_profiles.sql` | Re-booking after cancellations, business blocks, permanent bans, business-only profiles |

They keep all existing data. `supabase/repair-accounts.sql` fixes logins created before the database was set up.

## 2. Sign-in settings

Supabase → **Authentication**:

- **URL Configuration** → Site URL: `https://zayaiken21.github.io/South-Africa-Community-Work/`.
  Add a redirect URL: `https://zayaiken21.github.io/South-Africa-Community-Work/account.html`.
- **Sign In / Providers → Email**: keep **Confirm email** on.
- **Multi-Factor**: make sure **TOTP (authenticator app)** is enabled.
- Recommended: **Attack Protection** → turn on leaked-password protection and CAPTCHA if offered.

## 3. Your CEO account

1. On the site, open **Sign in → Create account** and sign up with **zayaiken2001@gmail.com**.
2. Confirm the email. That address automatically becomes **CEO**; nobody else can be made CEO.
3. Open **admin.html** (also under **More → CEO dashboard**).
4. Optional but recommended: **Account → Settings → Two-step sign-in → Turn on** and scan the QR code with Google Authenticator
   or Authy. Once on, signing in and every money action need your password **and** a code from your phone.
   In **CEO dashboard → Settings** you can require it for every staff member.
5. Add admins in **Team** (they must sign up first). Only the CEO can add or remove admins or change settings.

## 4. TradeSafe escrow

1. Create a developer account at https://developer.tradesafe.co.za and an application. You'll get a
   **Client ID**, **Client Secret** and your own **agent token** (the account that receives the service fee).
2. In the TradeSafe application, set the callback URL to:
   `https://avjnabylsfxwnqwsfzum.supabase.co/functions/v1/tradesafe-callback?secret=YOUR_CALLBACK_SECRET`
   (make up a long random secret, 40+ characters).
3. Start in the **sandbox**. Before going live, test one full shift: book → pay → record hours → release. A few
   GraphQL field names in `supabase/functions/_shared/tradesafe.ts` are marked `VERIFY` and must be checked against the sandbox.

## 5. Server functions and secrets

Supabase → **Edge Functions → Secrets**, add:

| Name | Value |
|---|---|
| `TRADESAFE_CLIENT_ID` | from TradeSafe |
| `TRADESAFE_CLIENT_SECRET` | from TradeSafe |
| `TRADESAFE_AGENT_TOKEN` | your TradeSafe agent token |
| `TRADESAFE_CALLBACK_SECRET` | the secret from step 4 |
| `TRADESAFE_API_URL` | sandbox: `https://api-developer.tradesafe.dev/graphql` · live: `https://api.tradesafe.co.za/graphql` |
| `ALLOWED_ORIGINS` | `https://zayaiken21.github.io` |

Then deploy (one time, from a computer with the Supabase CLI):

```bash
npx supabase login
npx supabase link --project-ref avjnabylsfxwnqwsfzum
npx supabase functions deploy payments
npx supabase functions deploy tradesafe-callback --no-verify-jwt
```

## 6. Google Analytics

1. Create a GA4 property at https://analytics.google.com → Admin → Data streams → Web, URL
   `https://zayaiken21.github.io/South-Africa-Community-Work/`.
2. Copy the **Measurement ID** (`G-XXXXXXX`) into `analytics-config.json` on GitHub: `{"ga4": "G-XXXXXXX"}`.
   Visitors see a short cookie question; GA loads only for those who accept. Your own tracking (dashboard) always works.

## Keys: what's public, what's secret

- `backend-config.json` holds the **anon public** key. It is meant to be public; the database rules protect the data.
- The **service_role** key bypasses every rule. Never put it in the website, GitHub or a chat. If it has been shared,
  roll it in Supabase → Project Settings → API Keys.

## How the money is protected

- Money is never held by this app. TradeSafe (a registered SA escrow company) holds it in a trust account.
- Pay can only be released to the worker's own verified bank account. A stolen login can't redirect it.
- Only the business that booked, or staff with a phone code, can release; every action is in the **Activity log**.
- The callback from TradeSafe is checked by secret and IP address, then re-checked against TradeSafe's API.
- Hourly pay is enforced at the national minimum wage (R30.23/hour from 1 March 2026; update it in **Settings** each March).
