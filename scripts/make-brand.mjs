// Run from a folder with: npm i opentype.js @expo-google-fonts/manrope @expo-google-fonts/dm-sans @resvg/resvg-js
// then: node make-brand.mjs /path/to/South-Africa-Community-Work
// Community Work South Africa — logo system generator.
// Grid: the mark is drawn on a 96-unit square. Spacing unit X = 24 units (a quarter of the mark).
import opentype from 'opentype.js'; import {Resvg} from '@resvg/resvg-js';
import {writeFileSync, mkdirSync, readFileSync} from 'node:fs';
const R = process.argv[2]; // repo root
const font = p => opentype.parse(readFileSync(p).buffer.slice(0));
const M800 = font('node_modules/@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf');
const M500 = font('node_modules/@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf');
const D700 = font('node_modules/@expo-google-fonts/dm-sans/700Bold/DMSans_700Bold.ttf');
const C = {green: '#176B4E', greenDeep: '#0F5A40', lime: '#A9C479', sand: '#D6DDAC', ink: '#13261F', paper: '#F5F6F1', white: '#FFFFFF', night: '#0E1613', mint: '#3FAE7F'};

// ---- Mark ----
const PIN = 'M48 93.5C45.8 93.5 13 61.5 13 40.5A35 35 0 1 1 83 40.5C83 61.5 50.2 93.5 48 93.5Z';
const tiles = [[27.5, 19.5], [50.5, 19.5], [27.5, 42.5], [50.5, 42.5]];
let markId = 0;
function mark(_options = {}) {
  const id = 'sa' + (++markId);
  return `<path d="M48 93.5C45.8 93.5 13 61.5 13 40.5A35 35 0 1 1 83 40.5C83 61.5 50.2 93.5 48 93.5Z" fill="#007A4D"/><defs><clipPath id="${id}"><circle cx="48" cy="40" r="28"/></clipPath></defs><g clip-path="url(#${id})"><path d="M20 12H76V40H20Z" fill="#DE3831"/><path d="M20 40H76V68H20Z" fill="#002395"/><path d="M17 10L51 40L17 70M49 40H80" fill="none" stroke="#FFFFFF" stroke-width="23"/><path d="M17 10L51 40L17 70M49 40H80" fill="none" stroke="#007A4D" stroke-width="15"/><path d="M16 18L41 40L16 62Z" fill="#FFB612"/><path d="M16 26L32 40L16 54Z" fill="#141414"/></g><circle cx="48" cy="40" r="28" fill="none" stroke="#FFFFFF" stroke-width="2"/>`;
}
const markOn = (x, y, size, opt) => `<g transform="translate(${x} ${y}) scale(${size / 96})">${mark(opt)}</g>`;
const svg = (w, h, body, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${bg ? `<rect width="${w}" height="${h}" fill="${bg}"/>` : ''}${body}</svg>`;

const n2 = v => (Math.round(v * 100) / 100).toString();
const pathData = p => p.commands.map(c => c.type === 'Z' ? 'Z' : c.type === 'Q' ? `Q${n2(c.x1)} ${n2(c.y1)} ${n2(c.x)} ${n2(c.y)}` : c.type === 'C' ? `C${n2(c.x1)} ${n2(c.y1)} ${n2(c.x2)} ${n2(c.y2)} ${n2(c.x)} ${n2(c.y)}` : `${c.type}${n2(c.x)} ${n2(c.y)}`).join('');
// ---- Text as outlines (no font needed wherever the logo is used) ----
function textPath(f, str, x, y, size, fill, tracking = 0) {
  let cx = x, d = '';
  const glyphs = [...str].map(ch => f.charToGlyph(ch));
  glyphs.forEach((g, i) => {
    d += pathData(g.getPath(cx, y, size));
    cx += g.advanceWidth * size / f.unitsPerEm + tracking * size;
    if (i < glyphs.length - 1) { const k = f.getKerningValue(g, glyphs[i + 1]); if (Number.isFinite(k)) cx += k * size / f.unitsPerEm; }
  });
  return {path: `<path d="${d}" fill="${fill}"/>`, width: cx - x - (glyphs.length ? tracking * size : 0)};
}
const width = (f, s, size, tr = 0) => textPath(f, s, 0, 0, size, '#000', tr).width;

// Wordmark: "community" + "work" set tight, tagline tracked under it.
function wordmark(x, baseline, size, {word = C.ink, accent = C.green, tag = C.green, showTag = true, center = false} = {}) {
  const tr = -0.035;
  const a = textPath(M800, 'community', x, baseline, size, word, tr);
  const b = textPath(M800, 'work', x + a.width + size * tr, baseline, size, accent, tr);
  const total = a.width + size * tr + b.width;
  let out = a.path + b.path;
  if (showTag) {
    // tagline: tracked caps, left-aligned under the wordmark, about 60% of its width
    const tsize = size * 0.25;
    const tw = width(D700, 'SOUTH AFRICA', tsize, 0.24);
    out += textPath(D700, 'SOUTH AFRICA', center ? x + (total - tw) / 2 : x + size * 0.03, baseline + size * 0.56, tsize, tag, 0.24).path;
  }
  return {out, width: total};
}

// ---- Lockups ----
// Horizontal: mark height H; wordmark cap-to-tagline block centred on the mark; gap = X/96*H*0.9
function horizontal(H, theme = 'light', pad = 0) {
  const s = H / 96, X = 24 * s;
  const size = H * 0.42, gap = X * 0.85;
  const wm = wordmark(0, 0, size); const w = Math.ceil(pad * 2 + 70 * s + gap + wm.width);
  const dark = theme === 'dark', mono = theme === 'mono-white' || theme === 'mono-ink';
  const fg = theme === 'mono-white' ? C.white : theme === 'mono-ink' ? C.ink : null;
  const markX = pad - 13 * s; // pin's left edge sits on the padding line
  const m = markOn(markX, pad, H, mono ? {pin: fg, t: Array(4).fill(theme === 'mono-white' ? C.green : C.paper)} : dark ? {pin: C.mint, t: [C.night, C.lime, C.sand, C.night]} : {});
  const textX = pad + 70 * s + gap, baseline = pad + H * 0.56;
  const w2 = wordmark(textX, baseline, size, mono ? {word: fg, accent: fg, tag: fg} : dark ? {word: C.white, accent: C.mint, tag: C.lime} : {});
  return svg(w, Math.ceil(H + pad * 2), m + w2.out, theme === 'mono-white' || dark ? null : null);
}
function stacked(H, theme = 'light', pad = 0) {
  const s = H / 96, size = H * 0.5;
  const wm = wordmark(0, 0, size); const w = Math.ceil(Math.max(wm.width, 70 * s) + pad * 2);
  const dark = theme === 'dark';
  const m = markOn(w / 2 - 48 * s, pad, H, dark ? {pin: C.mint, t: [C.night, C.lime, C.sand, C.night]} : {});
  const baseline = pad + H + 24 * s * 0.9 + size * 0.78;
  const w2 = wordmark(w / 2 - wm.width / 2, baseline, size, dark ? {word: C.white, accent: C.mint, tag: C.lime, center: true} : {center: true});
  return svg(w, Math.ceil(baseline + size * 0.62 + pad), m + w2.out);
}
// App icon: white pin on green, tiles in brand colours. Content kept inside the 66% safe zone for maskable icons.
function appIcon(n, {rounded = false, scale = 0.62} = {}) {
  const size = n * scale;
  return svg(n, n, `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D7D5B"/><stop offset="1" stop-color="${C.greenDeep}"/></linearGradient></defs><rect width="${n}" height="${n}" rx="${rounded ? n * 0.225 : 0}" fill="url(#g)"/>` +
    markOn(n / 2 - size / 2, n / 2 - size / 2 + size * 0.02, size, {pin: C.white, t: [C.green, C.lime, C.sand, C.green]}));
}

const png = (s, w, file) => writeFileSync(file, new Resvg(s, {fitTo: {mode: 'width', value: w}}).render().asPng());
const B = R + '/brand'; mkdirSync(B, {recursive: true}); mkdirSync(R + '/assets/icons', {recursive: true}); mkdirSync(R + '/play-store', {recursive: true});
const write = (f, s) => writeFileSync(f, s);

// Brand folder: vector masters + PNGs
const files = {
  'logo-mark.svg': svg(96, 96, mark()),
  'logo-mark-white.svg': svg(96, 96, mark({pin: C.white, t: [C.green, C.lime, C.sand, C.green]})),
  'logo-mark-ink.svg': svg(96, 96, mark({pin: C.ink, t: Array(4).fill(C.paper)})),
  'logo-horizontal.svg': horizontal(96, 'light', 24),
  'logo-horizontal-dark.svg': horizontal(96, 'dark', 24),
  'logo-horizontal-white.svg': horizontal(96, 'mono-white', 24),
  'logo-horizontal-ink.svg': horizontal(96, 'mono-ink', 24),
  'logo-stacked.svg': stacked(96, 'light', 24),
  'logo-stacked-dark.svg': stacked(96, 'dark', 24),
  'app-icon.svg': appIcon(512, {rounded: true}),
};
for (const [f, s] of Object.entries(files)) write(`${B}/${f}`, s);
png(files['logo-horizontal.svg'], 1600, `${B}/logo-horizontal.png`);
png(files['logo-horizontal-dark.svg'], 1600, `${B}/logo-horizontal-dark.png`);
png(files['logo-stacked.svg'], 1000, `${B}/logo-stacked.png`);
png(files['logo-mark.svg'], 512, `${B}/logo-mark.png`);
png(appIcon(1024, {rounded: false}), 1024, `${B}/social-avatar-1024.png`);

// App icons
write(R + '/assets/favicon.svg', svg(96, 96, mark()));
png(appIcon(512, {rounded: true}), 512, R + '/assets/icons/icon-512.png');
png(appIcon(192, {rounded: true}), 192, R + '/assets/icons/icon-192.png');
png(appIcon(512, {scale: 0.5}), 512, R + '/assets/icons/maskable-512.png');
png(appIcon(180, {scale: 0.6}), 180, R + '/assets/icons/apple-touch-icon.png');
png(appIcon(512, {scale: 0.58}), 512, R + '/play-store/play-icon-512.png');

// Share image + Play feature graphic
function banner(w, h) {
  const lock = (H) => { const s = H / 96; return {s}; };
  const H = h * 0.2, s = H / 96;
  let body = `<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D7D5B"/><stop offset="1" stop-color="${C.greenDeep}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#bg)"/>`;
  body += `<circle cx="${w * 0.84}" cy="${h * 0.52}" r="${h * 0.6}" fill="none" stroke="#fff" stroke-opacity=".07" stroke-width="2"/><circle cx="${w * 0.84}" cy="${h * 0.52}" r="${h * 0.4}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="2"/>`;
  body += markOn(w * 0.84 - h * 0.21, h * 0.31, h * 0.42, {pin: C.white, t: [C.green, C.lime, C.sand, C.green]});
  const x = w * 0.07;
  body += markOn(x - 13 * s, h * 0.14, H, {pin: C.white, t: [C.green, C.lime, C.sand, C.green]}).replace('', '');
  body += wordmark(x + 70 * s + 24 * s * 0.85, h * 0.14 + H * 0.56, H * 0.42, {word: C.white, accent: C.lime, tag: C.sand}).out;
  body += textPath(M800, 'Good work,', x, h * 0.6, h * 0.12, C.white, -0.03).path;
  body += textPath(M800, 'closer to home.', x, h * 0.75, h * 0.12, C.lime, -0.03).path;
  body += textPath(M500, 'Local shifts  ·  Jobs across South Africa  ·  Online work  ·  Free CV builder', x, h * 0.88, h * 0.042, '#DCE9E0').path;
  return svg(w, h, body);
}
png(banner(1200, 630), 1200, R + '/assets/icons/og-image.png');
png(banner(1024, 500), 1024, R + '/play-store/feature-graphic-1024x500.png');
write(B + '/feature-graphic.svg', banner(1024, 500));
console.log('brand assets written');
