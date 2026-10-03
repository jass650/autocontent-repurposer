// AI flow test. Needs the server running with AI configured (real key, or ANTHROPIC_BASE_URL pointing at test/mock-anthropic.mjs).
import { launch } from './cdp.mjs';
const B = process.env.BASE_URL || 'http://localhost:3457';
const log = (...a) => console.log('•', ...a);
const p = await launch({ port: 9335 });
try {
  await p.goto(B + '/login?demo=1', 2500);
  await p.eval(`[...document.querySelectorAll('.tree-item')].find(e=>e.innerText.includes('Ideas'))?.click()`);
  await p.sleep(1000);
  const before = await p.eval(`document.querySelectorAll('.editor .block').length`);
  // Space on an empty line opens AI
  await p.click('.page-bottom');
  await p.key(' ', { text: ' ' });
  await p.sleep(200);
  log('ai panel open:', await p.eval(`!!document.querySelector('.ai-panel')`), 'menu items:', await p.eval(`document.querySelectorAll('.ai-menu .menu-item').length`));
  await p.click('.ai-menu .menu-item:nth-of-type(2)'); // Summarize
  await p.sleep(Number(process.env.AI_WAIT || 2000));
  log('ai output:', await p.eval(`document.querySelector('.ai-out')?.innerText.replace(/\\n+/g,' / ')`));
  log('ai error:', await p.eval(`document.querySelector('.ai-err:not([hidden])')?.innerText || 'none'`));
  await p.shot('20-inline-ai');
  await p.click('.ai-act.primary'); // Insert below
  await p.sleep(400);
  log('blocks before/after insert:', before, '->', await p.eval(`document.querySelectorAll('.editor .block').length`));
  log('inserted types:', await p.eval(`[...document.querySelectorAll('.editor .block')].slice(-5).map(b=>b.className.split(' ')[1]).join(',')`));

  // Selection -> Ask AI -> Replace
  await p.eval(`(() => { const ed = [...document.querySelectorAll('.b-p .editable')].find(e => e.innerText.trim().length > 10); window.__orig = ed.innerText; const r = document.createRange(); r.selectNodeContents(ed); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange')); })()`);
  await p.sleep(300);
  log('selection toolbar:', await p.eval(`!!document.querySelector('.sel-toolbar')`));
  await p.shot('21-toolbar');
  await p.click('.tb-ai');
  await p.sleep(200);
  await p.click('.ai-menu .menu-item'); // Improve writing
  await p.sleep(Number(process.env.AI_WAIT || 2000));
  log('replace button:', await p.eval(`[...document.querySelectorAll('.ai-act')].map(b=>b.innerText).join(' | ')`));
  await p.click('.ai-act.primary');
  await p.sleep(300);
  log('original replaced:', await p.eval(`![...document.querySelectorAll('.editable')].some(e => e.innerText === window.__orig)`));

  // Chat
  await p.goto(B + '/app/ai', 1500);
  await p.click('.chat-sg');
  await p.sleep(Number(process.env.AI_WAIT || 2500));
  log('chat reply:', await p.eval(`document.querySelector('.msg.ai .msg-body')?.innerText.replace(/\\n+/g,' / ')`));
  log('page citation link:', await p.eval(`document.querySelector('.msg.ai .msg-body a')?.getAttribute('href')`));
  await p.shot('22-chat');
  await p.click('.msg.ai .msg-body a');
  await p.sleep(1000);
  log('citation opened:', await p.eval(`document.querySelector('.page-title')?.innerText`));
} catch (e) {
  console.log('TEST FAILURE:', e.message);
} finally {
  console.log('\nBrowser errors:', p.errors.filter((e) => !e.includes('/api/me')).join('\n') || 'none');
  p.close();
  process.exit(0);
}
