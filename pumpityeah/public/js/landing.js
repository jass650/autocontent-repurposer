// Landing page: nav state, tabs, logged-in CTA swap, and the hero's typing AI demo.
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 4), { passive: true });

const burger = document.getElementById('burger');
const mobileNav = document.getElementById('mobileNav');
burger.addEventListener('click', () => {
  const open = mobileNav.hidden;
  mobileNav.hidden = !open;
  burger.setAttribute('aria-expanded', String(open));
});
mobileNav.addEventListener('click', (e) => { if (e.target.closest('a')) { mobileNav.hidden = true; burger.setAttribute('aria-expanded', 'false'); } });

document.querySelectorAll('.tabs button').forEach((btn) => btn.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
  document.querySelectorAll('.tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.tab; });
}));

fetch('/api/me', { credentials: 'same-origin' }).then((r) => {
  if (!r.ok) return;
  document.querySelectorAll('[data-auth="out"]').forEach((el) => { el.hidden = true; });
  document.querySelectorAll('[data-auth="in"]').forEach((el) => { el.hidden = false; });
}).catch(() => {});

// Hero demo: types a prompt, then "streams" an answer. Purely illustrative.
const demos = [
  ['Find action items', '☐ Maya — two pricing page variants by Fri\n☐ Sam — request staging capacity\n☐ Jordan — offline mode proposal'],
  ['Summarize this page', 'Launch is on track: pricing copy is done, onboarding v2 ships next, and the launch video is the last open item.'],
  ['Brainstorm launch ideas', '• Live build-along stream\n• Template contest with prizes\n• “PumpitYeah in 60 seconds” videos'],
];
const promptEl = document.getElementById('mockPrompt');
const outEl = document.getElementById('mockOut');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function runDemo() {
  for (let i = 0; ; i = (i + 1) % demos.length) {
    const [prompt, out] = demos[i];
    promptEl.textContent = ''; outEl.textContent = '';
    if (reduced) { promptEl.textContent = prompt; outEl.textContent = out; return; }
    for (const ch of prompt) { promptEl.textContent += ch; await sleep(45); }
    await sleep(400);
    for (const word of out.split(/(\s+)/)) { outEl.textContent += word; await sleep(40); }
    await sleep(2600);
  }
}
runDemo();
