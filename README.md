# South Africa Community Work

A mobile-friendly, full-stack local jobs platform for South African cities and towns.

## First version
- Location from browser GPS or a manually entered map coordinate, with free-text city/town names and all nine provinces.
- Jobs within the worker's selected radius (1–200 km, default 25), ordered nearest first.
- Server-side filtering also respects the poster's hiring radius.
- Search, category, minimum hourly pay, highest-pay and newest sorting.
- Shared persistent D1 job records, not browser-only listings or sample jobs.
- Posting form: title, description, poster/business, city, province, precise workplace coordinates, category, hiring radius, pay in rand (hourly or total), shift hours, SAST start time, and public contact details.
- Expired shifts are excluded. API validates all fields and coordinates and uses parameterized database operations.

## Architecture and deployment
React / Vinext with Cloudflare Workers and D1. `app/api/jobs/route.ts` is the database-backed API. `db/schema.ts` and `drizzle/` own the database schema. `.openai/hosting.json` binds `DB` for the hosted Sites deployment.

Install dependencies with `pnpm install`, generate schema migrations with `pnpm db:generate`, typecheck with `pnpm exec tsc --noEmit`, and build with `pnpm build`. The repository retains the Sites build helpers and deployment configuration for reproducibility. A server runtime and D1 are required; GitHub Pages alone cannot run this API. GitHub changes do not automatically redeploy the hosted Site.

## Release scope
This initial deployment is private for owner review. Public launch still needs user accounts, verified poster ownership, moderation and editing/removal, abuse controls, a privacy policy, and an operational employment/payment model. Do not treat browser coordinates as verified identity or anti-spoofing protection. The radius filter is a server-side distance rule using client-supplied coordinates; manual coordinates are deliberately supported. Mainland coordinate bounds are sanity checks rather than a national-boundary polygon. No GPS history is retained in the database. Job coordinates and public business contact details are returned only in matching listings.

Workers view details and contact the poster directly. There is no shift booking, application management, payroll, payment collection, penalty deduction or payment-provider integration in this version. Posted wages are advertised compensation, not a posting charge. Search distances are straight-line estimates, not route or transport estimates. Posting start times use South Africa Standard Time (UTC+02:00).

The app does not claim any business partnerships or display fabricated listings. Private review metadata is deliberately noindex until public launch.

## Verification
`node --experimental-strip-types --test tests/jobs.test.ts` checks distance calculations, both radius limits, edge cases and listing validation. TypeScript and a production build validate the application source. Browser visual QA was unavailable in the build environment.
