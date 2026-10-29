/*
  Builds the website for GitHub Pages:
    1. bundles frontend/main.tsx and app.css into assets/ (with a content hash so browsers pick up new versions)
    2. writes one HTML page per route with full search-engine and social tags, structured data (JSON-LD) and
       crawlable fallback content with links to every public page
    3. writes the service worker (sw.js), the app manifest, sitemap.xml, robots.txt and llms.txt
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

/** Today's date, used as "last updated" in the sitemap and structured data. */
const today = new Date().toISOString().slice(0, 10);
/** Search-engine priority and how often each public page changes (sitemap). */
const crawl = {
  'index.html': [1.0, 'hourly'],
  'find-work.html': [0.9, 'hourly'],
  'shifts.html': [0.9, 'hourly'],
  'post-job.html': [0.8, 'weekly'],
  'how-it-works.html': [0.6, 'monthly'],
  'rules.html': [0.6, 'monthly'],
  'support.html': [0.6, 'weekly'],
  'help.html': [0.5, 'weekly'],
  'about.html': [0.5, 'monthly'],
  'account.html': [0.4, 'monthly'],
  'cv-builder.html': [0.7, 'monthly'],
  'privacy.html': [0.2, 'yearly'],
  'terms.html': [0.2, 'yearly'],
};
/** A page's public address (the home page is the folder itself). */
const urlOf = file => base + (file === 'index.html' ? '' : file);
/** Pages that show the same thing as another page point search engines to that one, so it isn't counted twice. */
const sameAs = {'help.html': 'support.html'};
/** Text made safe to put inside an HTML attribute or tag. */
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** The public pages, in the order they're linked from every page's fallback content. */
const publicPages = Object.keys(pages).filter(p => !hidden.includes(p) && p !== 'help.html');

// Common questions from Randy's knowledge, for the support pages' FAQ structured data and fallback text.
await build({
  entryPoints: ['frontend/randy-knowledge.ts'],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: 'data/.randy.mjs',
  logLevel: 'error',
});
const {knowledge} = await import(new URL('../data/.randy.mjs', import.meta.url).href + '?' + Date.now());
await import('node:fs/promises').then(fs => fs.rm('data/.randy.mjs', {force: true}));
/** Randy's answers as plain text, with the settings' usual values filled in. */
const plain = a =>
  a
    .replace(/\{fee\}/g, '10')
    .replace(/\{strikes\}/g, '3')
    .replace(/\{grace\}/g, '10')
    .replace(/\{minwage\}/g, '30.23')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s*\[[^\]]+\]\([^)]+\)\s*$/, '') // a trailing "[Open page](…)" button isn't part of the answer
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
const faqs = knowledge
  .filter(e => ['start', 'payments', 'shifts', 'hiring', 'rules', 'safety', 'support'].includes(e.topic))
  .slice(0, 30)
  .map(e => [
    e.q[0]
      .replace(/^./, c => c.toUpperCase())
      .replace(/\bi\b/g, 'I')
      .replace(/community work/gi, 'Community Work') + '?',
    plain(e.a),
  ]);

/** Who runs the site, for search engines (Organization). */
const organization = {
  '@type': 'Organization',
  '@id': base + '#organization',
  name,
  alternateName: 'Community Work',
  url: base,
  logo: {'@type': 'ImageObject', url: base + 'assets/icons/icon-512.png', width: 512, height: 512},
  areaServed: {'@type': 'Country', name: 'South Africa'},
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer support',
    email: 'zayaiken2001@gmail.com',
    areaServed: 'ZA',
    availableLanguage: ['English'],
  },
};
/** The site itself, with its job search (WebSite + SearchAction). */
const website = {
  '@type': 'WebSite',
  '@id': base + '#website',
  name,
  url: base,
  inLanguage: 'en-ZA',
  publisher: {'@id': base + '#organization'},
  potentialAction: {
    '@type': 'SearchAction',
    target: {'@type': 'EntryPoint', urlTemplate: base + 'find-work.html?q={search_term_string}'},
    'query-input': 'required name=search_term_string',
  },
};

/** Structured data (JSON-LD) for one page: the page, where it sits in the site, and extra detail for some pages. */
function structuredData(file, title, description) {
  const page = {
    '@type':
      file === 'find-work.html' || file === 'shifts.html'
        ? 'CollectionPage'
        : file === 'about.html'
          ? 'AboutPage'
          : file === 'support.html' || file === 'help.html'
            ? 'FAQPage'
            : 'WebPage',
    '@id': urlOf(file) + '#webpage',
    url: urlOf(file),
    name: title,
    description,
    inLanguage: 'en-ZA',
    isPartOf: {'@id': base + '#website'},
    dateModified: today,
    primaryImageOfPage: {'@type': 'ImageObject', url: base + 'assets/icons/og-image.png', width: 1200, height: 630},
  };
  if (page['@type'] === 'FAQPage')
    page.mainEntity = faqs.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {'@type': 'Answer', text: a},
    }));
  if (file !== 'index.html')
    page.breadcrumb = {
      '@type': 'BreadcrumbList',
      itemListElement: [
        {'@type': 'ListItem', position: 1, name: 'Home', item: base},
        {'@type': 'ListItem', position: 2, name: title, item: urlOf(file)},
      ],
    };
  const graph = file === 'index.html' ? [organization, website, page] : [page];
  return JSON.stringify({'@context': 'https://schema.org', '@graph': graph}).replace(/</g, '\\u003c');
}

/** What crawlers and people without JavaScript see: the page's heading, its text, and links to every public page. */
function fallback(file, title, description) {
  const links =
    publicPages.map(p => `<li><a href="./${p}">${esc(pages[p]?.[0] || 'CV builder')}</a></li>`).join('') +
    '<li><a href="./cv-builder.html">CV builder</a></li>';
  const faqHtml =
    file === 'support.html' || file === 'help.html'
      ? '<h2>Common questions</h2>' + faqs.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')
      : '';
  return `<noscript><main style="max-width:760px;margin:auto;padding:24px;font-family:sans-serif;line-height:1.6"><h1>${esc(title)}</h1><p>${esc(description)}</p>${faqHtml}<p>Turn on JavaScript to search jobs, pick up shifts and hire workers.</p><nav aria-label="Pages"><ul>${links}</ul></nav></main></noscript>`;
}

for (const [file, [title, description]] of Object.entries(pages)) {
  const full = `${title} | ${name}`;
  const indexable = !hidden.includes(file) && !sameAs[file];
  const head = [
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">',
    '<meta name="theme-color" content="#f5f6f1" media="(prefers-color-scheme: light)">',
    '<meta name="theme-color" content="#0e1613" media="(prefers-color-scheme: dark)">',
    `<title>${esc(full)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<meta name="robots" content="${indexable ? 'index,follow,max-image-preview:large,max-snippet:-1' : 'noindex,follow'}">`,
    `<link rel="canonical" href="${urlOf(sameAs[file] || file)}">`,
    `<link rel="alternate" hreflang="en-ZA" href="${urlOf(file)}">`,
    `<link rel="alternate" hreflang="x-default" href="${urlOf(file)}">`,
    `<link rel="sitemap" type="application/xml" href="./sitemap.xml">`,
    `<meta name="geo.region" content="ZA">`,
    `<meta name="format-detection" content="telephone=no">`,
    `<meta property="og:site_name" content="${esc(name)}">`,
    `<meta property="og:locale" content="en_ZA">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(full)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${urlOf(file)}">`,
    `<meta property="og:image" content="${base}assets/icons/og-image.png">`,
    '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(name)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(full)}">`,
    `<meta name="twitter:description" content="${esc(description)}">`,
    `<meta name="twitter:image" content="${base}assets/icons/og-image.png">`,
    '<link rel="manifest" href="./manifest.webmanifest">',
    '<link rel="icon" href="./assets/favicon.svg" type="image/svg+xml">',
    '<link rel="icon" href="./assets/icons/icon-192.png" type="image/png" sizes="192x192">',
    '<link rel="apple-touch-icon" href="./assets/icons/apple-touch-icon.png">',
    '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">',
    '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '<meta name="apple-mobile-web-app-title" content="Community Work"><meta name="application-name" content="Community Work">',
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
    `<link rel="stylesheet" href="./assets/community-app.css?v=${hash}">`,
    indexable ? `<script type="application/ld+json">${structuredData(file, title, description)}</script>` : '',
  ].join('');
  await writeFile(
    file,
    `<!doctype html><html lang="en-ZA"><head>${head}</head><body><div id="root"></div>${fallback(file, title, description)}<script type="module" src="./assets/community-app.js?v=${hash}"></script></body></html>`,
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
      // Shown in the install sheet and used by app-store packagers (Google Play, Apple App Store).
      screenshots: [
        {
          src: 'assets/screenshots/phone-jobs.webp',
          sizes: '780x1688',
          type: 'image/webp',
          form_factor: 'narrow',
          label: 'Find jobs and shifts near you',
        },
        {
          src: 'assets/screenshots/phone-support.webp',
          sizes: '780x1688',
          type: 'image/webp',
          form_factor: 'narrow',
          label: 'Instant help from Randy',
        },
        {
          src: 'assets/screenshots/phone-rules.webp',
          sizes: '780x1688',
          type: 'image/webp',
          form_factor: 'narrow',
          label: 'Fair rules for workers and businesses',
        },
      ],
      // Opening a Community Work link while the app is installed opens the app instead of a browser tab.
      launch_handler: {client_mode: 'navigate-existing'},
      handle_links: 'preferred',
      prefer_related_applications: false,
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
// sitemap.xml: every public page with when it last changed, how often it changes and how important it is.
await writeFile(
  'sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    Object.entries(crawl)
      .map(
        ([p, [priority, freq]]) =>
          `  <url><loc>${urlOf(p)}</loc><lastmod>${today}</lastmod><changefreq>${freq}</changefreq><priority>${priority.toFixed(1)}</priority></url>`,
      )
      .join('\n') +
    '\n</urlset>\n',
);

// robots.txt: everyone may crawl the public pages; personal and team pages stay out of results. Points to the sitemap.
// Search engines only read robots.txt at the root of a domain — see SEO.md for using it on a custom domain.
await writeFile(
  'robots.txt',
  [
    '# Community Work South Africa — rules for search engines and other crawlers',
    'User-agent: *',
    'Allow: /',
    'Disallow: /South-Africa-Community-Work/admin.html',
    'Disallow: /South-Africa-Community-Work/*?ticket=',
    '',
    `Sitemap: ${base}sitemap.xml`,
    '',
  ].join('\n'),
);

// llms.txt: a plain summary of the site for AI assistants and answer engines.
await writeFile(
  'llms.txt',
  `# ${name}\n\n> ${pages['index.html'][1]}\n\nCommunity Work is a South African job and shift marketplace. Workers pick up paid hourly shifts from local businesses (pay held in escrow by TradeSafe, at least the national minimum wage), and browse in-person jobs from South African employers and online jobs open to South Africans. Businesses post shifts and hire by the day. Support is available from Randy, the assistant, or the team.\n\n## Pages\n\n` +
    Object.keys(crawl)
      .map(
        p =>
          `- [${pages[p]?.[0] || 'CV builder'}](${urlOf(p)}): ${pages[p]?.[1] || 'Build a South African CV and download it as PDF or Word.'}`,
      )
      .join('\n') +
    `\n\n## Common questions\n\n` +
    faqs.map(([q, a]) => `- **${q}** ${a}`).join('\n') +
    '\n',
);

try {
  await readFile('data/jobs-feed.json');
} catch {
  await writeFile('data/jobs-feed.json', '{"updated":null,"sources":[],"jobs":[]}\n');
}
console.log(
  `Built ${Object.keys(pages).length} pages, app bundle (${hash}), manifest, service worker, favicon, sitemap, robots.txt and llms.txt.`,
);
