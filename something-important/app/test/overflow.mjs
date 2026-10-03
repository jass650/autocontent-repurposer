// Checks every screen at phone width (390px). If anything is too wide, mobile Chrome lays the page out wider and
// zooms out, so the real check is innerWidth === 390. Lists offending elements. Usage: node test/overflow.mjs
import { launch } from './cdp.mjs';
const B = process.env.BASE_URL || 'http://localhost:3100';
const p = await launch({ width: 390, height: 844, port: 9341 });
const check = async (label) => {
  const w = await p.eval('innerWidth');
  const bad = w === 390 ? '' : await p.eval(`[...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > 391).slice(0, 5).map(e => e.tagName.toLowerCase() + '.' + [...e.classList].join('.')).join(' | ')`);
  console.log(`${w === 390 ? 'ok  ' : 'WIDE'} ${label} (layout ${w}px) ${bad}`);
};
for (const path of ['/', '/browse', '/browse?kind=billboard', '/jar', '/login', '/signup']) { await p.goto(B + path, 1500); await check(path); }
await p.goto(B + '/login', 800);
await p.eval(`document.querySelector('.auth .btn-ghost').click()`);
await p.sleep(1200);
const lid = await p.eval(`fetch('/api/listings?kind=billboard').then(r => r.json()).then(d => d.listings[0].id)`);
for (const path of ['/me', '/me?tab=sales', '/me?tab=profile', '/sell', `/l/${lid}`, '/advertise', `/sell/${lid}`]) { await p.goto(B + path, 1500); await check(path); }
p.close();
process.exit(0);
