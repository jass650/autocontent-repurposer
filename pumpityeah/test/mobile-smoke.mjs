// Mobile viewport pass: checks for horizontal overflow and captures screenshots.
import { launch } from './cdp.mjs';
const B = process.env.BASE_URL || 'http://localhost:3456';
const p = await launch({ width: 390, height: 844, port: 9336 });
const overflow = () => p.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
try {
  await p.goto(B + '/', 1500);
  console.log('landing overflow:', await overflow());
  await p.shot('30-m-landing');
  await p.goto(B + '/login', 1200);
  await p.shot('31-m-login');
  await p.goto(B + '/login?demo=1', 2500);
  console.log('home overflow:', await overflow());
  await p.shot('32-m-home');
  await p.click('.topbar .icon-btn'); // open sidebar
  await p.sleep(400);
  await p.shot('33-m-sidebar');
  await p.eval(`[...document.querySelectorAll('.tree-item')].find(e=>e.innerText.includes('Welcome'))?.click()`);
  await p.sleep(1200);
  console.log('page overflow:', await overflow(), 'sidebar hidden:', await p.eval(`document.body.classList.contains('sb-collapsed')`));
  await p.shot('34-m-page');
  await p.eval(`[...document.querySelectorAll('.tree-item')].find(e=>e.innerText.includes('Q4'))?.click()`);
  await p.sleep(1200);
  console.log('db overflow:', await overflow());
  await p.shot('35-m-db');
} catch (e) { console.log('TEST FAILURE:', e.message); }
finally { console.log('errors:', p.errors.filter((e) => !e.includes('/api/me')).join('\n') || 'none'); p.close(); process.exit(0); }
