// End-to-end UI smoke test. Start the server first (PORT=3456 node server.js), then: node test/ui-smoke.mjs
import { launch } from './cdp.mjs';
const B = process.env.BASE_URL || 'http://localhost:3456';
const log = (...a) => console.log('•', ...a);
const p = await launch();
try {
  await p.goto(B + '/', 1500);
  await p.shot('01-landing');
  log('landing h1:', await p.eval(`document.querySelector('h1').innerText.replace(/\\n/g,' ')`));

  await p.goto(B + '/login?demo=1', 2500);
  log('after demo login url:', await p.eval('location.pathname'));
  await p.sleep(800);
  await p.shot('02-home');
  log('home greet:', await p.eval(`document.querySelector('.home-greet')?.innerText`));
  log('sidebar items:', await p.eval(`[...document.querySelectorAll('.tree-title')].map(e=>e.innerText).join(' | ')`));
  log('home tasks:', await p.eval(`document.querySelectorAll('.task-row').length`), 'recent cards:', await p.eval(`document.querySelectorAll('.home-card:not(.sk-card)').length`));

  await p.click('.sb-scroll .tree-item');
  await p.sleep(900);
  await p.shot('03-welcome');
  log('page title:', await p.eval(`document.querySelector('.page-title').innerText`), 'blocks:', await p.eval(`document.querySelectorAll('.editor .block').length`));

  // Type with markdown shortcuts at the end of the page
  await p.click('.page-bottom');
  await p.type('# '); await p.type('Test heading'); await p.key('Enter');
  await p.type('- '); await p.type('first bullet'); await p.key('Enter');
  await p.type('second bullet'); await p.key('Enter');
  await p.key('Enter'); // exit list
  await p.type('[] '); await p.type('a todo'); await p.key('Enter');
  await p.key('Backspace'); // empty todo -> text
  await p.type('/');
  await p.sleep(200);
  log('slash menu open:', await p.eval(`!!document.querySelector('.slash-menu')`), 'items:', await p.eval(`document.querySelectorAll('.slash-item').length`));
  await p.type('code');
  await p.sleep(150);
  log('filtered first item:', await p.eval(`document.querySelector('.slash-item.active .slash-label')?.innerText`));
  await p.shot('04-slash');
  await p.key('Enter');
  await p.type('const x = 1;');
  await p.sleep(200);
  log('last blocks:', await p.eval(`[...document.querySelectorAll('.editor .block')].slice(-7).map(b=>b.className.replace('block ','')+':'+(b.querySelector('.editable')?.innerText||'')).join(' || ')`));
  await p.sleep(1200);
  await p.shot('05-typed');

  const url = await p.eval('location.href');
  await p.goto(url, 2000);
  log('persisted heading:', await p.eval(`[...document.querySelectorAll('.b-h1 .editable')].map(e=>e.innerText).includes('Test heading')`),
    'code:', await p.eval(`[...document.querySelectorAll('.code-edit')].pop()?.innerText`));

  await p.eval(`[...document.querySelectorAll('.tree-item')].find(e=>e.innerText.includes('Q4 Launch'))?.click()`);
  await p.sleep(1200);
  await p.shot('06-table');
  log('table rows:', await p.eval(`document.querySelectorAll('.db-table tbody tr').length`), 'cols:', await p.eval(`document.querySelectorAll('.db-table th').length`));
  await p.click('.db-tab:nth-child(2)');
  await p.sleep(500);
  await p.shot('07-board');
  log('board cols:', await p.eval(`document.querySelectorAll('.board-col').length`), 'cards:', await p.eval(`document.querySelectorAll('.board-card').length`));
  await p.click('.db-tab:nth-child(1)');
  await p.click('.db-table tbody tr td.td-status');
  await p.sleep(200);
  log('status picker options:', await p.eval(`document.querySelectorAll('.popover .menu-item').length`));
  await p.shot('08-picker');
  await p.key('Escape');

  await p.key('k', { mods: 2 });
  await p.sleep(200);
  await p.type('lisbon');
  await p.sleep(500);
  log('search results:', await p.eval(`[...document.querySelectorAll('.search-item .si-title')].map(e=>e.innerText).join(' | ')`));
  await p.shot('09-search');
  await p.key('ArrowDown');
  await p.key('Enter');
  await p.sleep(1000);
  log('opened via search:', await p.eval(`document.querySelector('.page-title')?.innerText`));

  await p.goto(B + '/app/ai', 1500);
  await p.shot('10-ai');
  log('ai empty state:', await p.eval(`document.querySelector('.chat-empty h1')?.innerText`));
  await p.click('.chat-sg');
  await p.sleep(Number(process.env.AI_WAIT || 1500));
  log('ai reply:', await p.eval(`(document.querySelector('.msg.ai .msg-body')?.innerText || '').slice(0, 300)`));
  log('ai error:', await p.eval(`document.querySelector('.msg.ai .ai-err')?.innerText`));
  await p.shot('10b-ai-answer');

  await p.goto(B + '/app', 1500);
  await p.click('.home-tpl');
  await p.sleep(1500);
  log('template created page:', await p.eval(`document.querySelector('.page-title')?.innerText`), 'blocks', await p.eval(`document.querySelectorAll('.editor .block').length`));

  await p.key('L', { mods: 2 | 8 });
  await p.sleep(300);
  await p.shot('11-dark');
  log('theme:', await p.eval('document.documentElement.dataset.theme'));
  await p.key('L', { mods: 2 | 8 });
} catch (e) {
  console.log('TEST FAILURE:', e.message);
} finally {
  console.log('\nBrowser errors:', p.errors.length ? '\n' + p.errors.join('\n') : 'none');
  p.close();
  process.exit(0);
}
