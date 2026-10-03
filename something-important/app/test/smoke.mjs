// End-to-end smoke test. Start the server first (PORT=3100 node server.js), then: node test/smoke.mjs
import { launch } from './cdp.mjs';
const B = process.env.BASE_URL || 'http://localhost:3100';
const log = (...a) => console.log('•', ...a);
const W = Number(process.env.WIDTH || 1366);
const p = await launch({ width: W, height: 900, port: 9340 });
const text = (sel) => p.eval(`document.querySelector(${JSON.stringify(sel)})?.innerText?.replace(/\\s+/g,' ').trim()`);
const count = (sel) => p.eval(`document.querySelectorAll(${JSON.stringify(sel)}).length`);
const overflow = () => p.eval(`document.documentElement.scrollWidth > document.documentElement.clientWidth + 1`);
const tag = W < 600 ? 'm-' : '';
try {
  await p.goto(B + '/', 2200);
  log('home h1:', await text('h1'), '| board:', await text('.board-headline'), '| cards:', await count('.card'), '| overflow:', await overflow());
  await p.shot(tag + '01-home');

  await p.goto(B + '/browse?kind=billboard', 1200);
  log('billboards:', await count('.grid .card'), '| head:', await text('.browse-head h1'));
  await p.shot(tag + '02-browse');

  // log in with demo account
  await p.goto(B + '/login', 1000);
  await p.click('.auth .btn-ghost');
  await p.sleep(1200);
  log('after login:', await p.eval('location.pathname'), '| stats:', await text('.stats'));
  await p.shot(tag + '03-dashboard');

  // buy an item from someone else
  await p.goto(B + '/browse?kind=item&sort=cheap', 1200);
  const itemHref = await p.eval(`[...document.querySelectorAll('.grid .card')].find(c => !c.innerText.includes('Jordan Miles'))?.getAttribute('href')`);
  await p.goto(B + itemHref, 1200);
  log('item page:', await text('.lp h1'), '| buy btn:', await text('.buybox .btn-green'));
  await p.click('.buybox .btn-green');
  await p.sleep(300);
  await p.click('dialog .btn-green');
  await p.sleep(1000);
  log('purchase result:', await text('dialog .success'));
  await p.shot(tag + '04-paid');
  await p.eval(`document.querySelector('dialog')?.close()`);
  await p.sleep(500);

  // book a billboard (not ours)
  await p.goto(B + '/browse?kind=billboard', 1200);
  const bbHref = await p.eval(`[...document.querySelectorAll('.grid .card')].find(c => !c.innerText.includes('Jordan Miles'))?.getAttribute('href')`);
  await p.goto(B + bbHref, 1200);
  log('billboard page:', await text('.lp h1'), '| taken weeks:', await count('.wk.taken'), '| open:', await count('.wk:not(.taken)'));
  await p.eval(`[...document.querySelectorAll('.wk:not(.taken)')].pop().click()`);
  await p.sleep(200);
  log('book btn:', await text('.buybox .btn-green'));
  await p.shot(tag + '05-billboard');
  await p.click('.buybox .btn-green');
  await p.sleep(300);
  await p.click('dialog .btn-green');
  await p.sleep(1000);
  log('booking result:', await text('dialog .success p'));
  await p.eval(`document.querySelector('dialog')?.close()`);
  await p.sleep(800);
  log('week now taken:', await count('.wk.taken'));

  // sell something
  await p.goto(B + '/sell', 1000);
  await p.click('.kp:nth-child(2)'); // service
  await p.eval(`(() => { const set = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    const inputs = document.querySelectorAll('form .input');
    set(inputs[0], 'Test: I will paint your fence');
    set(inputs[1], 'Any color. Bring your own paint.');
    set(document.querySelector('.money-in .input'), '120'); })()`);
  await p.sleep(200);
  log('earn box:', await text('.earn'));
  await p.shot(tag + '06-sell');
  await p.click('.sell form [type=submit]');
  await p.sleep(1200);
  log('posted ->', await p.eval('location.pathname'), '|', await text('.lp h1'));

  // advertise it on the hero board
  await p.goto(B + '/advertise', 1200);
  await p.eval(`[...document.querySelectorAll('.day:not(.full)')].pop().click()`);
  log('ad buy btn:', await text('.adv .btn-copper'));
  await p.shot(tag + '07-advertise');
  await p.click('.adv .btn-copper');
  await p.sleep(1200);
  log('after ad buy:', await p.eval('location.pathname + location.search'), '| ads rows:', await count('.rows .r'));

  await p.goto(B + '/jar', 2000);
  log('jar:', await text('.jar-total'), '|', await text('.jar-sub'));
  await p.shot(tag + '08-jar');
  log('overflow (jar):', await overflow());
} catch (e) {
  console.log('TEST FAILURE:', e.message);
} finally {
  console.log('\nBrowser errors:', p.errors.join('\n') || 'none');
  p.close();
  process.exit(0);
}
