const CACHE='cw-310882ab3d';
const SHELL=['./','./index.html','./find-work.html','./shifts.html','./account.html','./saved-jobs.html','./job.html','./offline.html','./cv-builder.html','./assets/community-app.js?v=310882ab3d','./assets/community-app.css?v=310882ab3d','./assets/favicon.svg','./assets/icons/icon-192.png','./manifest.webmanifest'];
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
  if(u.pathname.endsWith('/data/jobs-feed.json')||u.pathname.endsWith('/ads-config.json')||u.pathname.endsWith('/affiliates.json')||u.pathname.endsWith('/backend-config.json')||u.pathname.endsWith('/analytics-config.json')||u.pathname.endsWith('/support-config.json')){e.respondWith(fetch(r,{cache:'no-cache'}).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));return res;}).catch(()=>caches.match(r,{ignoreSearch:true})));return;}
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy));}return res;})));
});
