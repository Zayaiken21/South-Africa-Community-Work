import {build} from 'esbuild';
import {writeFile,mkdir} from 'node:fs/promises';
await mkdir('assets',{recursive:true});
await build({entryPoints:['frontend/main.tsx'],bundle:true,minify:true,outfile:'assets/community-app.js',platform:'browser',target:['es2020'],jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'},legalComments:'none'});
const pages={
 'index.html':['Find work close to home','Discover local jobs across South Africa. Find nearby opportunities with clear pay, hours and workplace details.'],
 'find-work.html':['Find nearby jobs','Browse jobs near you. Filter by radius, category and hourly pay. Closest opportunities appear first.'],
 'post-job.html':['Post a job','Hire locally across South Africa. Post a job title, description, pay in rand, hours and workplace location.'],
 'job.html':['Job details','View a local opportunity, check pay and hours, and contact the poster.'],
 'saved-jobs.html':['Saved jobs','Revisit job opportunities you saved on this device.'],
 'how-it-works.html':['How it works','Learn how to find local work and post opportunities on Community Work South Africa.'],
 'about.html':['About Community Work','Local work and local hiring throughout South Africa’s nine provinces.'],
 'help.html':['Help and guidance','Get answers about location, job filters, posting work and safe direct contact.'],
 'privacy.html':['Privacy information','Understand how Community Work uses location, job listing information and browser storage.'],
 'terms.html':['Platform terms','Read the conditions for using Community Work South Africa.'],
 '404.html':['Page not found','Find your way back to Community Work South Africa.']
};
const base='https://zayaiken21.github.io/South-Africa-Community-Work/';
for(const [file,[title,description]] of Object.entries(pages)){
 const privatePage=['job.html','saved-jobs.html','404.html'].includes(file);
 await writeFile(file,`<!doctype html><html lang="en-ZA"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#176b4e"><title>${title} | Community Work South Africa</title><meta name="description" content="${description}"><meta name="robots" content="${privatePage?'noindex,follow':'index,follow'}"><link rel="canonical" href="${base+(file==='index.html'?'':file)}"><meta property="og:title" content="${title} | Community Work South Africa"><meta property="og:description" content="${description}"><meta property="og:type" content="website"><meta property="og:url" content="${base+file}"><link rel="stylesheet" href="./assets/community-app.css?v=2"><link rel="icon" href="./assets/favicon.svg" type="image/svg+xml"></head><body><div id="root"></div><noscript><main><h1>${title}</h1><p>${description}</p><p>Enable JavaScript to use location filters and submit jobs.</p><a href="./index.html">Home</a> · <a href="./find-work.html">Find work</a> · <a href="./post-job.html">Post a job</a></main></noscript><script type="module" src="./assets/community-app.js?v=2"></script></body></html>`);
}
await writeFile('assets/favicon.svg','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#176b4e"/><path d="M43 22a16 16 0 1 0 0 20" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/></svg>');
await writeFile('.nojekyll','');
await writeFile('sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Object.keys(pages).filter(p=>!['job.html','saved-jobs.html','404.html'].includes(p)).map(p=>'<url><loc>'+base+(p==='index.html'?'':p)+'</loc></url>').join('')+'</urlset>');
console.log('Built 11 GitHub Pages documents, bundled JS/CSS, favicon and sitemap.');
