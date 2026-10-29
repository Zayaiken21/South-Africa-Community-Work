/*
  Builds the website for GitHub Pages:
    1. bundles frontend/main.tsx and app.css into assets/ (with a content hash so browsers pick up new versions)
    2. writes one HTML page per route with its title, description and social tags
    3. writes the service worker (sw.js) for offline use and instant updates, the app manifest and the sitemap
  Run: pnpm build:pages   (or: node frontend/build.mjs)
*/
import {build} from 'esbuild';
import {writeFile, readFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

await mkdir('assets', {recursive: true});
await mkdir('data', {recursive: true});
await build({
  entryPoints: ['frontend/main.tsx'],
  bundle: true,
  minify: true,
  outfile: 'assets/community-app.js',
  platform: 'browser',
  target: ['es2020'],
  jsx: 'automatic',
  define: {'process.env.NODE_ENV': '"production"'},
  legalComments: 'none',
});

/** Content hash of the bundle, added to asset links so browsers never use an old copy. */
const hash = createHash('sha256')
  .update(await readFile('assets/community-app.js'))
  .update(await readFile('assets/community-app.css'))
  .digest('hex')
  .slice(0, 10);

/** Site name used in page titles. */
const name = 'Community Work South Africa';
/** Every page: file name → [title, description]. */
const pages = {
  'index.html': [
    'Find work close to home',
    'Find local shifts, in-person jobs across South Africa and online work you can do from home. Clear pay, hours and distance.',
  ],
  'find-work.html': [
    'Find jobs near you and online',
    'Browse jobs near you and remote jobs open to South Africans. Filter by distance, type of work and pay.',
  ],
  'post-job.html': [
    'Hire workers by the shift',
    'Hire workers by the day across South Africa. Set an hourly rate in rand and pay safely through escrow.',
  ],
  'shifts.html': [
    'Paid shifts near you',
    'Book paid shifts with local businesses in South Africa. Hourly pay in rand, secured in escrow before you start.',
  ],
  'account.html': ['Your account', 'Sign in or create a Community Work account to apply for shifts or hire workers.'],
  'admin.html': ['Team dashboard', 'Community Work team dashboard.'],
  'profile.html': ['Profile', 'A Community Work member profile: skills, experience and shifts completed.'],
  'job.html': ['Job details', 'View a local opportunity, check pay and hours, and contact the poster.'],
  'saved-jobs.html': ['Saved jobs', 'Revisit jobs you saved on this device.'],
  'support.html': [
    'Support',
    'Get help from Randy, our support assistant, or reach the Community Work team by chat, phone or email.',
  ],
  'rules.html': [
    'Community rules',
    'The rules for workers and businesses on Community Work: pay, hours, cancellations, strikes, payments and safety, based on South African labour law.',
  ],
  'how-it-works.html': [
    'How it works',
    'Learn how to find local and online work and post jobs on Community Work South Africa.',
  ],
  'about.html': [
    'About Community Work',
    'Local work, online work and local hiring throughout South Africa’s nine provinces.',
  ],
  'help.html': [
    'Help and support',
    'Ask Randy, our support assistant, read common questions and staying-safe tips, or contact the Community Work team.',
  ],
  'privacy.html': [
    'Privacy information',
    'How Community Work uses location, job listing information and device storage.',
  ],
  'terms.html': ['Platform terms', 'The conditions for using Community Work South Africa.'],
  'offline.html': ['You’re offline', 'Connect to the internet to load the latest jobs.'],
  '404.html': ['Page not found', 'Find your way back to Community Work South Africa.'],
};
/** Pages kept out of search engines (personal or dynamic pages). */
const hidden = ['job.html', 'saved-jobs.html', '404.html', 'offline.html', 'admin.html', 'profile.html'];
/** The site's public address. */
const base = 'https://zayaiken21.github.io/South-Africa-Community-Work/';

for (const [file, [title, description]] of Object.entries(pages)) {
  await writeFile(
    file,
    `<!doctype html><html lang="en-ZA"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#f5f6f1" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0e1613" media="(prefers-color-scheme: dark)"><title>${title} | ${name}</title><meta name="description" content="${description}"><meta name="robots" content="${hidden.includes(file) ? 'noindex,follow' : 'index,follow'}"><link rel="canonical" href="${base + (file === 'index.html' ? '' : file)}"><meta property="og:title" content="${title} | ${name}"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${base + file}"><meta property="og:image" content="${base}assets/icons/og-image.png"><link rel="manifest" href="./manifest.webmanifest"><link rel="icon" href="./assets/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Community Work"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="./assets/community-app.css?v=${hash}"></head><body><div id="root"></div><noscript><main style="padding:24px;font-family:sans-serif"><h1>${title}</h1><p>${description}</p><p>Enable JavaScript to search jobs and post work.</p><a href="./index.html">Home</a> · <a href="./find-work.html">Find work</a> · <a href="./shifts.html">Paid shifts</a></main></noscript><script type="module" src="./assets/community-app.js?v=${hash}"></script></body></html>`,
  );
}

await writeFile('assets/favicon.svg', await readFile('brand/logo-mark.svg'));

await writeFile(
  'manifest.webmanifest',
  JSON.stringify(
    {
      id: './',
      name,
      short_name: 'Community Work',
      description: 'Find local shifts, in-person jobs across South Africa and online work. Hire workers by the shift.',
      start_url: './index.html?source=app',
      scope: './',
      display: 'standalone',
      display_override: ['standalone', 'minimal-ui'],
      orientation: 'portrait',
      background_color: '#f5f6f1',
      theme_color: '#176b4e',
      lang: 'en-ZA',
      dir: 'ltr',
      categories: ['business', 'productivity', 'lifestyle'],
      icons: [
        {src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any'},
        {src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any'},
        {src: 'assets/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable'},
        {src: 'assets/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any'},
      ],
      shortcuts: [
        {
          name: 'Online jobs',
          url: './find-work.html?mode=remote',
          icons: [{src: 'assets/icons/icon-192.png', sizes: '192x192'}],
        },
        {name: 'Paid shifts', url: './shifts.html', icons: [{src: 'assets/icons/icon-192.png', sizes: '192x192'}]},
        {name: 'Saved jobs', url: './saved-jobs.html', icons: [{src: 'assets/icons/icon-192.png', sizes: '192x192'}]},
        {name: 'Build a CV', url: './cv-builder.html', icons: [{src: 'assets/icons/icon-192.png', sizes: '192x192'}]},
      ],
    },
    null,
    2,
  ) + '\n',
);

// Service worker: app shell works offline; job data always tries the network first.
await writeFile(
  'sw.js',
  `const CACHE='cw-${hash}';
/** Files the service worker keeps for offline use. */
const SHELL=['./','./index.html','./find-work.html','./shifts.html','./account.html','./saved-jobs.html','./job.html','./offline.html','./cv-builder.html','./assets/community-app.js?v=${hash}','./assets/community-app.css?v=${hash}','./assets/favicon.svg','./assets/icons/icon-192.png','./manifest.webmanifest'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(n=>n!==CACHE).map(n=>caches.delete(n)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET')return;
  if(u.origin!==location.origin){
    if(u.hostname==='raw.githubusercontent.com'&&u.pathname.includes('/jobs-data/')){e.respondWith(fetch(r).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;}).catch(()=>caches.match(r)));return;}
    if(u.hostname.endsWith('fonts.gstatic.com')||u.hostname.endsWith('fonts.googleapis.com')||u.hostname==='cdnjs.cloudflare.com'||u.hostname==='cdn.jsdelivr.net')e.respondWith(caches.open(CACHE).then(async c=>(await c.match(r))||fetch(r).then(res=>{c.put(r,res.clone());return res;})));
    return;
  }
  if(r.mode==='navigate'){e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;}).catch(async()=>(await caches.match(r,{ignoreSearch:true}))||caches.match('./offline.html')));return;}
  if(u.pathname.endsWith('/data/jobs-feed.json')||u.pathname.endsWith('/backend-config.json')||u.pathname.endsWith('/analytics-config.json')||u.pathname.endsWith('/support-config.json')){e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;}).catch(()=>caches.match(r,{ignoreSearch:true})));return;}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return res;})));
});
`,
);

await writeFile('.nojekyll', '');
await writeFile(
  'sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    [...Object.keys(pages).filter(p => !hidden.includes(p)), 'cv-builder.html']
      .map(p => '<url><loc>' + base + (p === 'index.html' ? '' : p) + '</loc></url>')
      .join('') +
    '</urlset>',
);
try {
  await readFile('data/jobs-feed.json');
} catch {
  await writeFile('data/jobs-feed.json', '{"updated":null,"sources":[],"jobs":[]}\n');
}
console.log(
  `Built ${Object.keys(pages).length} pages, app bundle (${hash}), manifest, service worker, favicon and sitemap.`,
);
