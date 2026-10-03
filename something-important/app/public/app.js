// TwoCents single-page frontend. Vanilla JS, no build step. All money is integer cents.
const view = document.getElementById('view');
const top = document.getElementById('top');
const state = { me: null };

// ---------- helpers ----------
async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
  return data;
}
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v; // only ever used with static markup
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const money = (c) => (Math.abs(c) < 100 ? `${c}¢` : `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const fee = (c) => Math.round(c * 0.03) + 2;
const per = (l) => (l.unit === 'each' ? '' : `/${l.unit}`);
const KIND = { item: 'Stuff', service: 'Service', billboard: 'Billboard' };
const hue = (s) => [...(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
const cssUrl = (u) => `url("${String(u).replace(/["'()\\\s]/g, encodeURIComponent)}")`;
const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const ago = (ts) => {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return m <= 1 ? 'just now' : `${m}m ago`;
  const hr = Math.round(m / 60);
  return hr < 24 ? `${hr}h ago` : `${Math.round(hr / 24)}d ago`;
};
function mondayOf(d = new Date()) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}
function addWeeks(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n * 7); return d.toISOString().slice(0, 10); }
function avatar(user, size) {
  const a = h('a', { class: 'avatar', href: `/u/${user.id}`, title: user.name, style: { background: `hsl(${hue(user.name)} 55% 42%)` }, text: (user.name || '?')[0].toUpperCase() });
  if (size) Object.assign(a.style, { width: size + 'px', height: size + 'px' });
  return a;
}
function tile(l, cls = 'tile') {
  const t = h('div', { class: cls, style: { background: `linear-gradient(135deg, ${l.colors[0]}, ${l.colors[1]})` } });
  if (l.image) { t.style.backgroundImage = cssUrl(l.image); } else t.textContent = l.emoji;
  return t;
}
function toast(msg, err = false) {
  const t = h('div', { class: `toast ${err ? 'err' : ''}`, text: msg });
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), 3200);
}
function loading() { view.replaceChildren(h('div', { class: 'loading' }, h('div', { class: 'spin', 'aria-label': 'Loading' }))); }
function countUp(el, cents, ms = 1200) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = money(cents); return; }
  const t0 = performance.now();
  const step = (t) => {
    const p = Math.min(1, (t - t0) / ms);
    el.textContent = money(Math.round(cents * (1 - Math.pow(1 - p, 3))));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function modal(...content) {
  const d = h('dialog', { class: 'modal' }, h('div', { class: 'modal-in' }, ...content));
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  document.body.append(d);
  d.showModal();
  return d;
}
function needLogin() {
  if (state.me) return false;
  go(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
  return true;
}

// ---------- cards ----------
function card(l, { sponsored } = {}) {
  const t = tile(l, `tile ${l.kind === 'billboard' ? 'billboard-tile' : ''}`);
  t.append(h('span', { class: `badge ${l.kind === 'billboard' ? 'bb' : ''}`, text: KIND[l.kind] }));
  if (sponsored) t.append(h('span', { class: 'badge sp', text: 'Sponsored' }));
  if (l.status === 'sold') t.append(h('span', { class: 'badge st', text: 'Sold out' }));
  if (l.status === 'paused') t.append(h('span', { class: 'badge st', text: 'Paused' }));
  return h('a', { class: 'card', href: `/l/${l.id}` }, t,
    h('div', { class: 'card-body' },
      h('div', { class: 'price' }, money(l.price), h('small', { text: ` ${per(l)}` })),
      h('div', { class: 'card-title', text: l.title }),
      h('div', { class: 'card-meta', text: [l.seller?.name, l.location].filter(Boolean).join(' · ') })));
}
function grid(list, opts) {
  if (!list.length) return h('div', { class: 'empty' }, h('div', { class: 'big', text: '🪙' }), h('p', { text: 'Nothing here yet. Be the first to sell something.' }), h('a', { class: 'btn btn-green', href: '/sell', text: 'Sell something' }));
  return h('div', { class: 'grid' }, list.map((l) => card(l, opts)));
}
function billboard(ad, { preview } = {}) {
  const lights = h('div', { class: 'board-lights' }, h('span'), h('span'), h('span'));
  const posts = h('div', { class: 'board-posts' }, h('span'), h('span'));
  let face;
  if (ad?.listing) {
    const l = ad.listing;
    face = h(preview ? 'div' : 'a', { class: 'board-face', href: preview ? null : `/l/${l.id}`, style: { background: l.image ? `${cssUrl(l.image)} center/cover` : `linear-gradient(120deg, ${l.colors[0]}, ${l.colors[1]})` } },
      h('span', { class: 'board-tag', text: preview ? 'Preview' : 'Sponsored · today' }),
      l.image ? null : h('div', { class: 'board-emoji', text: l.emoji }),
      h('div', { class: 'board-text' }, h('div', { class: 'board-headline', text: ad.headline || l.title }), h('div', { class: 'board-sub', text: `${l.title} · ${money(l.price)}${per(l)}` })));
  } else {
    face = h('a', { class: 'board-face board-house', href: '/advertise' },
      h('span', { class: 'board-tag', text: 'Available today' }),
      h('div', { class: 'board-text' }, h('div', { class: 'board-headline', text: 'THIS SPACE: $5/DAY' }), h('div', { class: 'board-sub', text: 'You’re reading it. So would everyone else. →' })));
  }
  return h('div', { class: 'board' }, h('div', { class: 'board-frame' }, lights, face), posts);
}

// ---------- header ----------
function renderTop() {
  const q = h('input', { type: 'search', name: 'q', placeholder: 'Search stuff, services, billboards…', 'aria-label': 'Search', value: new URLSearchParams(location.search).get('q') || '' });
  const search = h('form', { class: 'search', role: 'search', onsubmit: (e) => { e.preventDefault(); go(`/browse?q=${encodeURIComponent(q.value.trim())}`); } },
    q, h('button', { type: 'submit', 'aria-label': 'Search', html: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="9" cy="9" r="6"/><path d="m14 14 4 4"/></svg>' }));
  const p = location.pathname;
  const nl = (href, text, on) => h('a', { class: `nl ${on ? 'on' : ''}`, href, text });
  const nav = h('nav', { class: 'nav', 'aria-label': 'Main' },
    nl('/browse', 'Browse', p === '/browse' && !location.search.includes('billboard')),
    nl('/browse?kind=billboard', 'Billboards', location.search.includes('kind=billboard')),
    nl('/advertise', 'Advertise', p === '/advertise'),
    nl('/jar', 'Penny Jar', p === '/jar'),
    h('a', { class: 'btn btn-green btn-sm', href: '/sell', text: 'Sell' }),
    state.me ? avatar(state.me) : h('a', { class: 'btn btn-ghost btn-sm', href: '/login', text: 'Log in' }));
  if (state.me) nav.lastChild.href = '/me';
  const burger = h('button', { class: 'btn btn-ghost btn-sm burger', 'aria-label': 'Menu', 'aria-expanded': 'false', text: '☰', onclick: () => { const o = nav.classList.toggle('open'); burger.setAttribute('aria-expanded', String(o)); } });
  nav.prepend(burger);
  top.replaceChildren(h('div', { class: 'top-in' }, h('a', { class: 'brand', href: '/' }, h('span', { class: 'coin', text: '2¢' }), 'TwoCents'), search, nav));
}

// ---------- pages ----------
async function home() {
  const [live, all, boards, jar] = await Promise.all([api('/ads/live'), api('/listings?sort=popular'), api('/listings?kind=billboard'), api('/jar')]);
  document.title = 'TwoCents — everybody’s selling something';
  const counts = { item: 0, service: 0, billboard: 0 };
  all.listings.forEach((l) => counts[l.kind]++);
  const ticker = h('b', { text: '$0.00' });
  const kind = (k, big, title, blurb) => h('a', { class: `kind kind-${k}`, href: `/browse?kind=${k}` }, h('div', { class: 'big', text: big }), h('span', { class: 'count', text: `${counts[k]} listed` }), h('h3', { text: title }), h('p', { text: blurb }));
  const sideCards = live.side.map((a) => card(a.listing, { sponsored: true }));
  if (sideCards.length < 3) sideCards.push(h('a', { class: 'card', href: '/advertise' }, h('div', { class: 'tile', style: { background: 'repeating-linear-gradient(-45deg,#fef3c7 0 18px,#fde68a 18px 36px)' }, text: '📣' }),
    h('div', { class: 'card-body' }, h('div', { class: 'price', text: '$1/day' }), h('div', { class: 'card-title', text: 'Your listing could be right here.' }), h('div', { class: 'card-meta', text: 'Sponsored spots → Advertise' }))));
  view.replaceChildren(h('div', { class: 'wrap' },
    h('section', { class: 'hero' },
      h('div', {},
        h('h1', {}, 'Everybody’s selling ', h('em', { text: 'something.' })),
        h('p', { class: 'lead', text: 'Stuff, services, and billboard space — one account, no “business side.” List it free. We keep 3% + 2¢ when it sells. That’s it.' }),
        h('div', { class: 'hero-ctas' }, h('a', { class: 'btn btn-green btn-lg', href: '/sell', text: 'Start selling' }), h('a', { class: 'btn btn-ghost btn-lg', href: '/browse', text: 'Browse everything' })),
        h('a', { class: 'ticker', href: '/jar' }, h('span', { class: 'coin', text: '2¢' }), h('span', {}, 'The jar: ', ticker, ' made, one cent at a time →'))),
      billboard(live.hero)),
    h('section', { class: 'section' }, h('div', { class: 'kinds' },
      kind('item', '📦', 'Stuff', 'Used, handmade, weird. If it exists, list it.'),
      kind('service', '🛠️', 'Services', 'Sell your time: by the hour or by the job.'),
      kind('billboard', '🪧', 'Billboards', 'Roadside, digital, windows, trucks, yard signs. Rent by the week.'))),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'Sponsored' }), h('a', { href: '/advertise', text: 'Get your spot →' })), h('div', { class: 'grid' }, sideCards)),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'Billboards for rent' }), h('a', { href: '/browse?kind=billboard', text: 'All billboards →' })), grid(boards.listings.slice(0, 4))),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: 'Trending' }), h('a', { href: '/browse?sort=popular', text: 'See more →' })), grid(all.listings.filter((l) => l.kind !== 'billboard').slice(0, 8)))));
  countUp(ticker, jar.total);
}

async function browse() {
  const p = new URLSearchParams(location.search);
  const qs = new URLSearchParams();
  for (const k of ['q', 'kind', 'cat', 'sort']) if (p.get(k)) qs.set(k, p.get(k));
  const data = await api('/listings?' + qs);
  const set = (k, v) => { const n = new URLSearchParams(location.search); if (v) n.set(k, v); else n.delete(k); if (k === 'kind') n.delete('cat'); go('/browse?' + n); };
  const kind = p.get('kind') || '';
  const title = p.get('q') ? `“${p.get('q')}”` : kind ? { item: 'Stuff', service: 'Services', billboard: 'Billboards' }[kind] : 'Everything for sale';
  document.title = `${title} — TwoCents`;
  const pill = (label, on, onclick, count) => h('button', { class: `pill ${on ? 'on' : ''}`, onclick }, h('span', { text: label }), count != null ? h('span', { text: count }) : null);
  const sort = h('select', { class: 'input', 'aria-label': 'Sort', onchange: (e) => set('sort', e.target.value) },
    [['new', 'Newest'], ['popular', 'Most viewed'], ['cheap', 'Price: low to high'], ['pricey', 'Price: high to low']].map(([v, t]) => h('option', { value: v, selected: (p.get('sort') || 'new') === v, text: t })));
  view.replaceChildren(h('div', { class: 'wrap browse' },
    h('aside', { class: 'filters' },
      h('div', {}, h('h4', { text: 'Type' }), h('div', { class: 'pill-list' },
        pill('All', !kind, () => set('kind', '')), pill('📦 Stuff', kind === 'item', () => set('kind', 'item')),
        pill('🛠️ Services', kind === 'service', () => set('kind', 'service')), pill('🪧 Billboards', kind === 'billboard', () => set('kind', 'billboard')))),
      h('div', {}, h('h4', { text: 'Category' }), h('div', { class: 'pill-list' },
        pill('Any', !p.get('cat'), () => set('cat', '')),
        Object.entries(data.categories).sort((a, b) => b[1] - a[1]).map(([c, n]) => pill(c, p.get('cat') === c, () => set('cat', c), n))))),
    h('div', {},
      h('div', { class: 'browse-head' }, h('div', {}, h('h1', { text: title }), h('div', { class: 'muted small', text: `${data.listings.length} listing${data.listings.length === 1 ? '' : 's'}` })), sort),
      grid(data.listings))));
}

async function listing(id) {
  const { listing: l, seller, booked, more } = await api(`/listings/${id}`);
  document.title = `${l.title} — TwoCents`;
  const mine = state.me?.id === l.sellerId;
  const taken = new Set(booked);
  const s = { qty: 1, start: null, weeks: 1 };

  const box = h('div', { class: 'buybox' });
  const drawBox = () => {
    const subtotal = l.price * (l.kind === 'billboard' ? s.weeks : s.qty);
    const stepper = (val, min, max, set) => h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Less', text: '−', onclick: () => { set(Math.max(min, val - 1)); drawBox(); } }),
      h('span', { text: val }),
      h('button', { 'aria-label': 'More', text: '+', onclick: () => { set(Math.min(max, val + 1)); drawBox(); } }));
    box.replaceChildren(h('div', { class: 'price' }, money(l.price), h('small', { text: ` ${per(l)}` })));
    if (l.status !== 'active') {
      box.append(h('div', { class: 'cut-note', text: l.status === 'sold' ? 'Sold out. Check the seller’s other listings.' : 'The seller paused this listing.' }));
      if (!mine) return;
    }
    if (mine) {
      box.append(h('p', { class: 'muted', text: 'This is your listing.' }),
        h('a', { class: 'btn btn-ink', href: `/sell/${l.id}`, text: 'Edit listing' }),
        h('a', { class: 'btn btn-copper', href: `/advertise?listing=${l.id}`, text: 'Promote it on a billboard' }),
        h('div', { class: 'cut-note', text: `Each ${l.unit === 'each' ? 'sale' : l.unit} pays you ${money(l.price - fee(l.price))}. We keep ${money(fee(l.price))}.` }));
      return;
    }
    let ready = true;
    if (l.kind === 'item') box.append(h('div', { class: 'row' }, h('span', { class: 'label', text: `Quantity (${l.stock} left)` }), stepper(s.qty, 1, l.stock, (v) => (s.qty = v))));
    if (l.kind === 'service' && l.unit === 'hour') box.append(h('div', { class: 'row' }, h('span', { class: 'label', text: 'Hours' }), stepper(s.qty, 1, 100, (v) => (s.qty = v))));
    if (l.kind === 'billboard') {
      const thisMon = mondayOf();
      const range = new Set(s.start ? Array.from({ length: s.weeks }, (_, i) => addWeeks(s.start, i)) : []);
      const clash = [...range].some((w) => taken.has(w));
      ready = !!s.start && !clash;
      box.append(h('div', { class: 'label', text: 'Pick a start week' }),
        h('div', { class: 'weeks' }, Array.from({ length: 12 }, (_, i) => {
          const w = addWeeks(thisMon, i);
          const isTaken = taken.has(w);
          return h('button', { class: `wk ${isTaken ? 'taken' : ''} ${range.has(w) && !isTaken ? 'sel' : ''}`, disabled: isTaken, 'aria-pressed': String(range.has(w)), title: isTaken ? 'Booked' : `Week of ${fmtDate(w)}`, onclick: () => { s.start = w; drawBox(); } },
            fmtDate(w), h('small', { text: isTaken ? 'booked' : i === 0 ? 'this week' : 'open' }));
        })),
        h('div', { class: 'row' }, h('span', { class: 'label', text: 'Weeks' }), stepper(s.weeks, 1, 12, (v) => (s.weeks = v))));
      if (clash) box.append(h('div', { class: 'err', text: 'Part of that range is already booked. Pick another start week or fewer weeks.' }));
    }
    const note = h('textarea', { class: 'input', rows: 3, placeholder: l.kind === 'billboard' ? 'What are you advertising?' : l.kind === 'service' ? 'What do you need done? When?' : 'Anything the seller should know?', 'aria-label': 'Note to seller' });
    note.value = s.note || '';
    note.addEventListener('input', () => { s.note = note.value; });
    box.append(note,
      h('div', { class: 'lines' },
        h('div', { class: 'row' }, h('span', { text: l.kind === 'billboard' ? `${money(l.price)} × ${s.weeks} week${s.weeks > 1 ? 's' : ''}` : `${money(l.price)} × ${s.qty}` }), h('span', { text: money(subtotal) })),
        h('div', { class: 'row total' }, h('span', { text: 'You pay' }), h('span', { text: money(subtotal) }))),
      h('button', { class: 'btn btn-green btn-lg', disabled: !ready, onclick: () => checkout(l, s, subtotal), text: l.kind === 'billboard' ? (s.start ? `Book ${s.weeks} week${s.weeks > 1 ? 's' : ''}` : 'Pick a week to book') : l.kind === 'service' ? 'Hire now' : 'Buy now' }),
      h('div', { class: 'cut-note', text: `No buyer fees. The seller keeps ${money(subtotal - fee(subtotal))}; TwoCents keeps ${money(fee(subtotal))} (3% + 2¢).` }));
  };
  drawBox();

  const specs = l.billboard ? h('div', { class: 'specs' },
    h('div', { class: 'spec' }, h('b', { text: l.billboard.size || '—' }), h('span', { text: 'Size' })),
    h('div', { class: 'spec' }, h('b', { text: l.billboard.daily ? l.billboard.daily.toLocaleString() : '—' }), h('span', { text: 'Eyeballs / day' })),
    h('div', { class: 'spec' }, h('b', { text: l.billboard.lit ? 'Yes' : 'No' }), h('span', { text: 'Lit at night' }))) : null;
  const cpm = l.billboard?.daily ? h('p', { class: 'muted small', text: `≈ ${money(Math.round(l.price / (l.billboard.daily * 7) * 1000))} per 1,000 views` }) : null;

  view.replaceChildren(h('div', { class: 'wrap' },
    h('div', { class: 'lp' },
      h('div', {},
        tile(l, 'lp-tile'),
        h('h1', { text: l.title }),
        h('div', { class: 'lp-meta' }, h('span', { class: 'chip', text: KIND[l.kind] }), h('span', { text: l.category }), l.location ? h('span', { text: `📍 ${l.location}` }) : null, h('span', { text: `👀 ${l.views} views` }), l.sold ? h('span', { text: `✅ ${l.sold} sold` }) : null),
        specs, cpm,
        h('div', { class: 'lp-desc', text: l.description || 'No description.' }),
        h('a', { class: 'seller-card', href: `/u/${seller.id}` }, avatar(seller, 46), h('div', {}, h('b', { text: seller.name }), h('span', { class: 'muted small', text: `${seller.location || 'Somewhere'} · ${seller.sales} sales · ${seller.listings} listings` })))),
      box),
    more.length ? h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: `More from ${seller.name}` })), grid(more)) : null));
}

function checkout(l, s, subtotal) {
  if (needLogin()) return;
  const what = l.kind === 'billboard' ? `${s.weeks} week${s.weeks > 1 ? 's' : ''} from ${fmtDate(s.start)}` : l.kind === 'service' ? (l.unit === 'hour' ? `${s.qty} hour${s.qty > 1 ? 's' : ''}` : '1 job') : `Qty ${s.qty}`;
  const pay = h('button', { class: 'btn btn-green btn-lg', text: `Pay ${money(subtotal)}` });
  const d = modal(h('h2', { text: 'Confirm & pay' }),
    h('div', { class: 'r' }, tile(l, 'r-tile'), h('div', { class: 'r-main' }, h('b', { text: l.title }), h('span', { text: what })), h('span', { class: 'amt', text: money(subtotal) })),
    h('div', { class: 'test-mode', text: 'Test mode — no real money moves. Real payments are coming next.' }),
    pay, h('button', { class: 'btn btn-ghost', text: 'Cancel', onclick: () => d.close() }));
  pay.addEventListener('click', async () => {
    pay.disabled = true; pay.textContent = 'Paying…';
    try {
      const { order } = await api(`/listings/${l.id}/buy`, { method: 'POST', body: { qty: s.qty, start: s.start, weeks: s.weeks, note: s.note } });
      d.close();
      const done = modal(h('div', { class: 'success' }, h('div', { class: 'big', text: '🪙' }), h('h2', { text: 'Paid. Nice.' }),
        h('p', { class: 'muted', text: `${money(order.subtotal)} sent to the seller. They keep ${money(order.payout)}, we keep ${money(order.fee)}.` })),
        h('a', { class: 'btn btn-ink', href: '/me?tab=purchases', text: 'See my purchases' }), h('button', { class: 'btn btn-ghost', text: 'Keep browsing', onclick: () => done.close() }));
      done.addEventListener('close', () => render());
    } catch (e) { toast(e.message, true); pay.disabled = false; pay.textContent = `Pay ${money(subtotal)}`; }
  });
}

const EMOJI = { item: ['📦', '🗝️', '☎️', '🥚', '🪑', '🎸', '👟', '🧸', '📚', '🖼️', '🪴', '🛹'], service: ['🛠️', '🌿', '🎨', '📦', '⏳', '🐕', '🧹', '📊', '📸', '💇', '🚗', '🍳'], billboard: ['🪧', '🛣️', '📺', '🚚', '☕', '🏙️', '🏟️', '🚏', '🪟', '🎈', '🚌', '🗽'] };
const PALETTES = [['#14532d', '#22c55e'], ['#1d3557', '#457b9d'], ['#7209b7', '#f72585'], ['#ffb703', '#fb8500'], ['#0b090a', '#e5383b'], ['#023e8a', '#48cae4'], ['#6c584c', '#dde5b6'], ['#3a0ca3', '#4cc9f0']];
const CATS = { item: ['Weird finds', 'Home & yard', 'Food', 'Outdoors', 'Electronics', 'Clothing', 'Merch', 'Collectibles'], service: ['Home & yard', 'Creative', 'Moving', 'Errands', 'Business', 'Pets', 'Lessons', 'Repairs'], billboard: ['Roadside', 'Digital', 'Storefront', 'Mobile', 'Event', 'Indoor'] };

async function sell(id) {
  if (needLogin()) return;
  let f = { kind: 'item', title: '', description: '', category: '', price: '', unit: 'each', stock: 1, emoji: '📦', colors: PALETTES[0], image: '', location: state.me.location || '', billboard: { size: '', daily: '', lit: false } };
  if (id) {
    const { listing: l } = await api(`/listings/${id}`);
    if (l.sellerId !== state.me.id) { toast('That’s not your listing.', true); return go('/me'); }
    f = { ...f, ...l, price: (l.price / 100).toFixed(2), billboard: l.billboard || f.billboard };
  }
  document.title = `${id ? 'Edit listing' : 'Sell something'} — TwoCents`;
  const form = h('form', { novalidate: true });
  const preview = h('div');
  const earn = h('div', { class: 'earn' });
  const cents = () => Math.round(parseFloat(String(f.price).replace(/[$,]/g, '')) * 100) || 0;

  const drawPreview = () => {
    const c = cents();
    preview.replaceChildren(h('div', { class: 'label', text: 'Preview', style: { marginBottom: '8px' } }),
      card({ ...f, price: c, id: 'preview', seller: { name: state.me.name }, status: 'active' }));
    preview.querySelector('a').removeAttribute('href');
    earn.replaceChildren(h('h3', { text: `Every ${f.kind === 'item' ? 'sale' : f.unit === 'each' ? 'sale' : f.unit} you keep` }),
      h('div', { class: 'keep', text: c ? money(Math.max(0, c - fee(c))) : '$0.00' }),
      h('div', { class: 'cut', text: c ? `We keep ${money(fee(c))} — that’s 3% + 2¢. No listing fees.` : 'Set a price to see your cut.' }));
  };
  const field = (label, input, hint) => h('div', { class: 'field' }, h('label', { text: label }), input, hint ? h('span', { class: 'hint', text: hint }) : null);
  const bind = (el, key, sub) => { el.addEventListener('input', () => { if (sub) f[sub][key] = el.type === 'checkbox' ? el.checked : el.value; else f[key] = el.value; drawPreview(); }); return el; };

  const drawForm = () => {
    const k = f.kind;
    const kp = (kind, big, title, sub) => h('button', { type: 'button', class: `kp ${k === kind ? 'on' : ''}`, disabled: !!id && k !== kind, 'aria-pressed': String(k === kind), onclick: () => {
      if (f.kind === kind) return;
      f.kind = kind; f.unit = kind === 'item' ? 'each' : kind === 'service' ? 'hour' : 'week'; f.emoji = EMOJI[kind][0]; f.category = '';
      drawForm(); drawPreview();
    } }, h('div', { class: 'big', text: big }), h('b', { text: title }), h('span', { text: sub }));
    const title = bind(h('input', { class: 'input', value: f.title, maxlength: 120, placeholder: k === 'billboard' ? 'e.g. Lit bulletin on Hwy 290 eastbound' : k === 'service' ? 'e.g. I’ll assemble your IKEA furniture' : 'e.g. Box of vintage postcards', required: true }), 'title');
    const desc = bind(h('textarea', { class: 'input', rows: 5, placeholder: 'What is it, what condition, what’s included?' }), 'description');
    desc.value = f.description;
    const cat = bind(h('input', { class: 'input', value: f.category, list: 'cats', placeholder: 'Pick or type one' }), 'category');
    const cats = h('datalist', { id: 'cats' }, CATS[k].map((c) => h('option', { value: c })));
    const price = bind(h('input', { class: 'input', inputmode: 'decimal', value: f.price, placeholder: '0.00', required: true }), 'price');
    const unit = k === 'service' ? bind(h('select', { class: 'input' }, h('option', { value: 'hour', selected: f.unit === 'hour', text: 'per hour' }), h('option', { value: 'job', selected: f.unit === 'job', text: 'per job' })), 'unit')
      : h('div', { class: 'input', style: { display: 'flex', alignItems: 'center', color: 'var(--ink-3)' }, text: k === 'billboard' ? 'per week' : 'each' });
    const loc = bind(h('input', { class: 'input', value: f.location, placeholder: 'City, State' }), 'location');
    const img = bind(h('input', { class: 'input', type: 'url', value: f.image, placeholder: 'https://… (optional photo link)' }), 'image');

    form.replaceChildren(
      h('div', { class: 'kind-pick' }, kp('item', '📦', 'Stuff', 'A thing'), kp('service', '🛠️', 'Service', 'Your time'), kp('billboard', '🪧', 'Billboard', 'Ad space')),
      field('Title', title), field('Description', desc),
      h('div', { class: 'two' }, field('Price', h('div', { class: 'money-in' }, price), k === 'billboard' ? 'Per week of display' : null), field('Priced', unit)),
      k === 'item' ? field('How many do you have?', bind(h('input', { class: 'input', type: 'number', min: 0, value: f.stock }), 'stock')) : null,
      k === 'billboard' ? h('div', { class: 'two' },
        field('Size', bind(h('input', { class: 'input', value: f.billboard.size, placeholder: 'e.g. 14×48 ft' }), 'size', 'billboard')),
        field('Eyeballs per day (estimate)', bind(h('input', { class: 'input', type: 'number', min: 0, value: f.billboard.daily, placeholder: 'e.g. 20000' }), 'daily', 'billboard'))) : null,
      k === 'billboard' ? h('label', { class: 'check', style: { marginBottom: '16px' } }, bind(h('input', { type: 'checkbox', checked: f.billboard.lit }), 'lit', 'billboard'), 'Lit at night') : null,
      h('div', { class: 'two' }, field('Category', h('div', {}, cat, cats)), field('Location', loc)),
      field('Icon', h('div', { class: 'emojis' }, EMOJI[k].map((e) => h('button', { type: 'button', class: f.emoji === e ? 'on' : '', 'aria-label': e, text: e, onclick: () => { f.emoji = e; drawForm(); drawPreview(); } })))),
      field('Color', h('div', { class: 'swatches' }, PALETTES.map((p) => h('button', { type: 'button', class: f.colors.join() === p.join() ? 'on' : '', 'aria-label': `Colors ${p.join(' to ')}`, style: { background: `linear-gradient(135deg, ${p[0]}, ${p[1]})` }, onclick: () => { f.colors = p; drawForm(); drawPreview(); } })))),
      field('Photo', img, 'Optional. Paste an https link to an image.'),
      h('div', { class: 'err', hidden: true }),
      h('button', { class: 'btn btn-green btn-lg', type: 'submit', text: id ? 'Save changes' : 'Post it — free' }),
      h('p', { class: 'rules', text: 'We sell what others won’t — but nothing illegal: no weapons, drugs, stolen goods, or adult services.' }));
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('.err');
    const btn = form.querySelector('[type=submit]');
    err.hidden = true;
    const body = { ...f, price: cents(), stock: Number(f.stock), billboard: { ...f.billboard, daily: Number(f.billboard.daily) || 0 } };
    if (body.title.trim().length < 3) { err.textContent = 'Give it a title (at least 3 characters).'; err.hidden = false; return; }
    if (!body.price) { err.textContent = 'Set a price — even 1¢ counts.'; err.hidden = false; return; }
    btn.disabled = true;
    try {
      const { listing: l } = await api(id ? `/listings/${id}` : '/listings', { method: id ? 'PATCH' : 'POST', body });
      toast(id ? 'Saved.' : 'It’s live! 🎉');
      go(`/l/${l.id}`);
    } catch (ex) { err.textContent = ex.message; err.hidden = false; btn.disabled = false; }
  });
  drawForm(); drawPreview();
  view.replaceChildren(h('div', { class: 'wrap sell' },
    h('div', {}, h('h1', { text: id ? 'Edit listing' : 'Sell something' }), h('p', { class: 'muted', text: 'Stuff, a service, or space on a billboard. Listing is free.' }), form),
    h('div', { class: 'preview-col' }, preview, earn)));
}

async function dashboard() {
  if (needLogin()) return;
  const d = await api('/dashboard');
  document.title = 'My stuff — TwoCents';
  const tab = new URLSearchParams(location.search).get('tab') || 'listings';
  const body = h('div');
  const stat = (label, val, cls = '') => h('div', { class: `stat ${cls}` }, h('span', { text: label }), h('b', { text: val }));
  const statusChip = (s) => h('span', { class: `chip ${s === 'active' || s === 'completed' ? 'green' : s === 'paid' ? 'amber' : s === 'sold' ? 'red' : ''}`, text: s === 'paid' ? 'paid · in progress' : s });
  const row = (t, title, sub, ...side) => h('div', { class: 'r' }, t, h('div', { class: 'r-main' }, h('b', { text: title }), h('span', { text: sub })), h('div', { class: 'r-side' }, ...side));
  const emojiTile = (e) => h('div', { class: 'r-tile', style: { background: '#f1efe6' }, text: e });
  const empty = (msg, href, cta) => h('div', { class: 'empty' }, h('p', { text: msg }), href ? h('a', { class: 'btn btn-green', href, text: cta }) : null);
  const when = (o) => o.booking ? `${o.booking.weeks} wk from ${fmtDate(o.booking.start)}` : o.kind === 'service' ? `${o.qty} ${o.qty > 1 ? 'units' : 'unit'}` : `qty ${o.qty}`;

  const tabs = {
    listings: () => d.listings.length ? d.listings.map((l) => row(tile(l, 'r-tile'), l.title, `${money(l.price)}${per(l)} · ${l.views} views · ${l.sold} sold`,
      statusChip(l.status),
      h('a', { class: 'btn btn-ghost btn-sm', href: `/l/${l.id}`, text: 'View' }),
      h('a', { class: 'btn btn-ghost btn-sm', href: `/sell/${l.id}`, text: 'Edit' }),
      l.status !== 'sold' ? h('button', { class: 'btn btn-ghost btn-sm', text: l.status === 'paused' ? 'Resume' : 'Pause', onclick: async () => { await api(`/listings/${l.id}`, { method: 'PATCH', body: { status: l.status === 'paused' ? 'active' : 'paused' } }); render(); } }) : null,
      l.status === 'active' ? h('a', { class: 'btn btn-copper btn-sm', href: `/advertise?listing=${l.id}`, text: 'Promote' }) : null,
      h('button', { class: 'btn btn-ghost btn-sm', 'aria-label': `Delete ${l.title}`, text: '🗑', onclick: async () => { if (confirm(`Delete “${l.title}”?`)) { await api(`/listings/${l.id}`, { method: 'DELETE' }); toast('Deleted.'); render(); } } })))
      : empty('You haven’t listed anything yet.', '/sell', 'Sell something'),
    sales: () => d.sales.length ? d.sales.map((o) => row(emojiTile(o.emoji), o.title, `${o.buyerName} · ${when(o)} · ${ago(o.createdAt)}${o.note ? ` · “${o.note}”` : ''}`,
      statusChip(o.status), h('span', { class: 'amt plus', text: `+${money(o.payout)}` }), h('span', { class: 'fee', text: `−${money(o.fee)} fee` }),
      o.status === 'paid' ? h('button', { class: 'btn btn-ink btn-sm', text: 'Mark done', onclick: async () => { await api(`/orders/${o.id}/complete`, { method: 'POST' }); toast('Marked complete.'); render(); } }) : null))
      : empty('No sales yet. Promote a listing to get eyes on it.', '/advertise', 'Advertise'),
    purchases: () => d.purchases.length ? d.purchases.map((o) => row(emojiTile(o.emoji), o.title, `from ${o.sellerName} · ${when(o)} · ${ago(o.createdAt)}`,
      statusChip(o.status), h('span', { class: 'amt', text: money(o.subtotal) }), h('a', { class: 'btn btn-ghost btn-sm', href: `/l/${o.listingId}`, text: 'View' })))
      : empty('You haven’t bought anything yet.', '/browse', 'Go shopping'),
    ads: () => d.ads.length ? d.ads.map((a) => row(emojiTile(a.slot === 'hero' ? '🪧' : '📣'), a.headline, `${a.slot === 'hero' ? 'Hero board' : 'Side board'} · ${fmtDate(a.date)}`,
      h('span', { class: `chip ${a.date >= new Date().toISOString().slice(0, 10) ? 'green' : ''}`, text: a.date >= new Date().toISOString().slice(0, 10) ? 'upcoming' : 'ran' }), h('span', { class: 'amt', text: money(a.price) })))
      : empty('No ads yet. The home page billboard is $5/day.', '/advertise', 'Buy a billboard spot'),
    profile: () => {
      const name = h('input', { class: 'input', value: state.me.name });
      const loc = h('input', { class: 'input', value: state.me.location || '', placeholder: 'City, State' });
      const bio = h('textarea', { class: 'input', rows: 3, placeholder: 'What do you sell?' });
      bio.value = state.me.bio || '';
      return h('form', { style: { maxWidth: '480px' }, onsubmit: async (e) => { e.preventDefault(); const { user } = await api('/me', { method: 'PATCH', body: { name: name.value, location: loc.value, bio: bio.value } }); state.me = { ...state.me, ...user }; renderTop(); toast('Profile saved.'); } },
        h('div', { class: 'field' }, h('label', { text: 'Name' }), name), h('div', { class: 'field' }, h('label', { text: 'Location' }), loc), h('div', { class: 'field' }, h('label', { text: 'Bio' }), bio),
        h('div', { class: 'row', style: { justifyContent: 'flex-start' } }, h('button', { class: 'btn btn-green', type: 'submit', text: 'Save' }), h('a', { class: 'btn btn-ghost', href: `/u/${state.me.id}`, text: 'View public profile' }),
          h('button', { class: 'btn btn-ghost', type: 'button', text: 'Log out', onclick: async () => { await api('/logout', { method: 'POST' }); state.me = null; toast('Logged out.'); go('/'); } })));
    },
  };
  const tabBtn = (k, label) => h('button', { class: `tab ${tab === k ? 'on' : ''}`, role: 'tab', 'aria-selected': String(tab === k), text: label, onclick: () => go(`/me?tab=${k}`) });
  body.append(...[].concat(tabs[tab] ? tabs[tab]() : tabs.listings()));
  view.replaceChildren(h('div', { class: 'wrap dash' },
    h('div', { class: 'row' }, h('h1', { text: `Hey, ${state.me.name.split(' ')[0]}.` }), h('a', { class: 'btn btn-green', href: '/sell', text: '+ New listing' })),
    h('div', { class: 'stats' }, stat('You’ve earned', money(d.totals.earned), 'g'), stat('Our cut (fees)', money(d.totals.fees), 'c'), stat('You’ve spent', money(d.totals.spent)), stat('Active listings', String(d.listings.filter((l) => l.status === 'active').length))),
    h('div', { class: 'tabs', role: 'tablist' }, tabBtn('listings', `Listings (${d.listings.length})`), tabBtn('sales', `Sales (${d.sales.length})`), tabBtn('purchases', `Purchases (${d.purchases.length})`), tabBtn('ads', `My ads (${d.ads.length})`), tabBtn('profile', 'Profile')),
    h('div', { class: 'rows' }, body)));
}

async function advertise() {
  const [cal, dash] = await Promise.all([api('/ads/calendar'), state.me ? api('/dashboard') : Promise.resolve({ listings: [] })]);
  document.title = 'Advertise — TwoCents';
  const mine = dash.listings.filter((l) => l.status === 'active');
  const pre = new URLSearchParams(location.search).get('listing');
  const s = { slot: 'hero', days: new Set(), listingId: mine.find((l) => l.id === pre)?.id || mine[0]?.id, headline: '' };
  const left = h('div');
  const right = h('div', { class: 'preview-col' });

  const draw = () => {
    const price = cal.prices[s.slot];
    const full = (d) => (s.slot === 'hero' ? d.heroTaken : d.sideLeft <= 0) || d.mine.includes(s.slot);
    const slotBtn = (slot, title, desc) => h('button', { class: `slot ${s.slot === slot ? 'on' : ''}`, 'aria-pressed': String(s.slot === slot), onclick: () => { s.slot = slot; s.days.clear(); draw(); } },
      h('b', { text: title }), h('div', { class: 'price', text: `${money(cal.prices[slot])}/day` }), h('span', { class: 'muted small', text: desc }));
    const select = h('select', { class: 'input', 'aria-label': 'Listing to promote', onchange: (e) => { s.listingId = e.target.value; draw(); } }, mine.map((l) => h('option', { value: l.id, selected: l.id === s.listingId, text: `${l.emoji} ${l.title}` })));
    const headline = h('input', { class: 'input', maxlength: 80, placeholder: 'Your headline (7 words or fewer reads best)', value: s.headline, 'aria-label': 'Headline' });
    headline.addEventListener('input', () => { s.headline = headline.value; drawPreview(); });
    const total = s.days.size * price;
    const buy = h('button', { class: 'btn btn-copper btn-lg', disabled: !s.days.size || !s.listingId, text: s.days.size ? `Buy ${s.days.size} day${s.days.size > 1 ? 's' : ''} — ${money(total)}` : 'Pick days on the calendar' });
    buy.addEventListener('click', async () => {
      if (needLogin()) return;
      buy.disabled = true;
      try {
        const r = await api('/ads', { method: 'POST', body: { slot: s.slot, dates: [...s.days], listingId: s.listingId, headline: s.headline } });
        toast(`Booked! ${money(r.total)} into the jar. 🪙`);
        go('/me?tab=ads');
      } catch (e) { toast(e.message, true); buy.disabled = false; }
    });
    left.replaceChildren(
      h('h1', { text: 'Rent our billboard.' }),
      h('p', { class: 'muted', text: 'TwoCents is a billboard too. Put any of your listings in front of everyone who visits.' }),
      h('div', { class: 'slots' }, slotBtn('hero', '🪧 Hero board', 'The giant billboard at the top of the home page. One advertiser per day.'), slotBtn('side', '📣 Side board', `A sponsored card on the home page. ${cal.sideSlots} spots per day.`)),
      h('div', { class: 'label', style: { margin: '6px 0 8px' }, text: 'Pick your days' }),
      h('div', { class: 'cal' }, cal.days.map((d) => {
        const dt = new Date(d.date + 'T00:00:00');
        const isFull = full(d);
        return h('button', { class: `day ${isFull ? 'full' : ''} ${s.days.has(d.date) ? 'sel' : ''}`, disabled: isFull, 'aria-pressed': String(s.days.has(d.date)), onclick: () => { s.days.has(d.date) ? s.days.delete(d.date) : s.days.add(d.date); draw(); } },
          h('small', { text: dt.toLocaleDateString('en-US', { weekday: 'short' }) }), h('b', { text: dt.getDate() }),
          h('small', { text: d.mine.includes(s.slot) ? 'yours' : isFull ? 'taken' : s.slot === 'side' ? `${d.sideLeft} left` : 'open' }));
      })),
      h('div', { style: { marginTop: '20px' } },
        !state.me ? h('div', { class: 'cut-note' }, 'Log in to buy a spot. ', h('a', { href: '/login?next=/advertise', text: 'Log in →' }))
          : mine.length ? h('div', {}, h('div', { class: 'field' }, h('label', { text: 'Promote which listing?' }), select), h('div', { class: 'field' }, h('label', { text: 'Headline' }), headline), buy)
            : h('div', { class: 'cut-note' }, 'You need an active listing to promote. ', h('a', { href: '/sell', text: 'Post one →' }))));
    drawPreview();
  };
  const drawPreview = () => {
    const l = mine.find((x) => x.id === s.listingId);
    const sample = l || { id: 'x', kind: 'item', title: 'Your listing here', price: 100, unit: 'each', emoji: '🪙', colors: ['#c2703d', '#facc15'], seller: { name: 'You' } };
    right.replaceChildren(h('div', { class: 'label', text: 'Preview' }),
      s.slot === 'hero' ? billboard({ headline: s.headline || sample.title, listing: sample }, { preview: true }) : h('div', { style: { maxWidth: '260px' } }, card(sample, { sponsored: true })),
      h('div', { class: 'earn' }, h('h3', { text: 'Where your money goes' }), h('div', { class: 'keep', style: { color: '#fdba74' }, text: money(s.days.size * cal.prices[s.slot]) }), h('div', { class: 'cut', style: { color: '#fff' }, text: 'Straight into the Penny Jar. Every cent is counted publicly.' })));
    right.querySelectorAll('a.card').forEach((a) => a.removeAttribute('href'));
  };
  draw();
  view.replaceChildren(h('div', { class: 'wrap adv' }, left, right));
}

async function jar() {
  const j = await api('/jar');
  document.title = 'The Penny Jar — TwoCents';
  const total = h('div', { class: 'jar-total', text: '$0.00' });
  const stat = (label, val, cls) => h('div', { class: `stat ${cls || ''}` }, h('span', { text: label }), h('b', { text: val }));
  // stacked bar chart (fees + ads) for the last 14 days
  const W = 640, H = 200, pad = 24, bw = (W - pad * 2) / j.series.length;
  const max = Math.max(100, ...j.series.map((d) => d.fees + d.ads));
  const bars = j.series.map((d, i) => {
    const x = pad + i * bw + 4, w = bw - 8;
    const fh = (d.fees / max) * (H - 40), ah = (d.ads / max) * (H - 40);
    const day = new Date(d.date + 'T00:00:00');
    return `<g><title>${fmtDate(d.date)}: ${money(d.fees)} fees + ${money(d.ads)} ads</title>
      <rect x="${x}" y="${H - 20 - fh}" width="${w}" height="${fh}" rx="3" fill="#16a34a"/>
      <rect x="${x}" y="${H - 20 - fh - ah}" width="${w}" height="${ah}" rx="3" fill="#c2703d"/>
      <text x="${x + w / 2}" y="${H - 6}" text-anchor="middle" font-size="10" fill="#8b8a83">${i % 2 ? '' : day.getDate()}</text></g>`;
  }).join('');
  const chart = h('div', { class: 'chart-card' }, h('h3', { text: 'Last 14 days' }),
    h('div', { class: 'legend', html: '<span><i style="background:#16a34a"></i>Transaction fees</span><span><i style="background:#c2703d"></i>Billboard ads</span>' }),
    h('div', { html: `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Daily platform revenue, last 14 days">${bars}</svg>` }));
  const feed = h('div', { class: 'chart-card' }, h('h3', { text: 'Latest pennies' }),
    h('div', { class: 'feed' }, j.recent.map((r) => h('div', {}, h('span', { text: r.what }), h('b', { text: `+${money(r.cents)}` })))));
  view.replaceChildren(h('div', { class: 'wrap jar' },
    h('span', { class: 'coin', style: { width: '64px', height: '64px', fontSize: '24px', margin: '0 auto' }, text: '2¢' }),
    h('h1', { text: 'The Penny Jar' }), total,
    h('p', { class: 'jar-sub', text: `made one cent at a time from ${j.deals} deals and ${j.ads} billboard days. Every cent we make is counted right here.` }),
    h('div', { class: 'jar-grid' }, stat('Transaction fees', money(j.fees), 'g'), stat('Billboard ads', money(j.adRev), 'c'), stat('Money moved for sellers', money(j.gmv)), stat('Sellers', String(j.sellers))),
    h('div', { class: 'jar-two' }, chart, feed),
    h('p', { class: 'muted', style: { marginTop: '28px' } }, 'One cent makes us happy for a moment. Then we want two. ', h('a', { href: '/sell', text: 'Help fill the jar →' }))));
  countUp(total, j.total, 1600);
}

async function profile(id) {
  const { user, listings } = await api(`/users/${id}`);
  document.title = `${user.name} — TwoCents`;
  view.replaceChildren(h('div', { class: 'wrap profile' },
    h('div', { class: 'profile-head' }, avatar(user), h('div', {}, h('h1', { text: user.name }),
      h('div', { class: 'muted', text: `${user.location || 'Somewhere'} · member since ${new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} · ${user.sales} sales` }),
      user.bio ? h('p', { text: user.bio }) : null)),
    h('div', { class: 'section-head' }, h('h2', { text: `Selling (${listings.length})` })), grid(listings)));
}

function auth(mode) {
  if (state.me) return go(new URLSearchParams(location.search).get('next') || '/me');
  const signup = mode === 'signup';
  document.title = `${signup ? 'Sign up' : 'Log in'} — TwoCents`;
  const err = h('div', { class: 'err', hidden: true });
  const f = {};
  const field = (key, label, attrs) => { f[key] = h('input', { class: 'input', id: key, ...attrs }); return h('div', { class: 'field' }, h('label', { for: key, text: label }), f[key]); };
  const finish = async (path, body) => {
    err.hidden = true;
    try {
      const { user } = await api(path, { method: 'POST', body });
      state.me = user;
      const me = await api('/me'); state.me = me.user;
      toast(`Welcome${signup ? '' : ' back'}, ${user.name.split(' ')[0]}!`);
      const next = new URLSearchParams(location.search).get('next');
      go(next && next.startsWith('/') && !next.startsWith('//') ? next : '/me');
    } catch (e) { err.textContent = e.message; err.hidden = false; }
  };
  const form = h('form', { novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value.trim()]));
    body.password = f.password.value;
    finish(signup ? '/signup' : '/login', body);
  } },
  err,
  signup ? field('name', 'Your name', { autocomplete: 'name', required: true }) : null,
  field('email', 'Email', { type: 'email', autocomplete: 'email', required: true }),
  field('password', 'Password', { type: 'password', autocomplete: signup ? 'new-password' : 'current-password', required: true, minlength: 8 }),
  signup ? field('location', 'Where are you? (optional)', { placeholder: 'City, State' }) : null,
  h('button', { class: 'btn btn-green btn-lg', type: 'submit', text: signup ? 'Create my account' : 'Log in' }));
  view.replaceChildren(h('div', { class: 'auth' },
    h('h1', { text: signup ? 'Start selling.' : 'Welcome back.' }),
    h('p', { class: 'lead', text: signup ? 'One account to buy and sell anything — stuff, services, billboards.' : 'Log in to buy, sell and book billboards.' }),
    form,
    h('div', { class: 'or', text: 'or' }),
    h('button', { class: 'btn btn-ghost', style: { width: '100%' }, text: '🪙 Use the demo account', onclick: () => finish('/login', { email: 'demo@twocents.money', password: 'demo1234' }) }),
    h('p', { class: 'muted', style: { textAlign: 'center', marginTop: '20px' } }, signup ? 'Have an account? ' : 'New here? ', h('a', { href: signup ? '/login' : '/signup', text: signup ? 'Log in' : 'Create an account' }))));
  (signup ? f.name : f.email).focus();
}

function notFound() {
  document.title = 'Not found — TwoCents';
  view.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big', text: '🕳️' }), h('h1', { text: 'Nothing here.' }), h('p', { text: 'Not even a penny.' }), h('a', { class: 'btn btn-green', href: '/', text: 'Go home' })));
}

// ---------- router ----------
const routes = [
  [/^\/$/, home], [/^\/browse$/, browse], [/^\/l\/(\w+)$/, listing], [/^\/sell$/, () => sell()], [/^\/sell\/(\w+)$/, sell],
  [/^\/me$/, dashboard], [/^\/advertise$/, advertise], [/^\/jar$/, jar], [/^\/u\/(\w+)$/, profile],
  [/^\/login$/, () => auth('login')], [/^\/signup$/, () => auth('signup')],
];
let renderId = 0;
async function render() {
  const id = ++renderId;
  renderTop();
  const match = routes.map(([re, fn]) => [location.pathname.match(re), fn]).find(([m]) => m);
  if (!match) return notFound();
  loading();
  try {
    await match[1](...match[0].slice(1));
  } catch (e) {
    if (id !== renderId) return;
    if (e.status === 401) { state.me = null; return go(`/login?next=${encodeURIComponent(location.pathname)}`); }
    view.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'big', text: '😬' }), h('h1', { text: e.status === 404 ? 'Not found' : 'Something went wrong' }), h('p', { text: e.message }), h('a', { class: 'btn btn-green', href: '/', text: 'Go home' })));
  }
}
function go(path) {
  if (path !== location.pathname + location.search) history.pushState(null, '', path);
  scrollTo(0, 0);
  render();
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return;
  e.preventDefault();
  document.querySelector('.nav.open')?.classList.remove('open');
  go(url.pathname + url.search);
});
addEventListener('popstate', render);

api('/me').then(({ user }) => { state.me = user; }).catch(() => {}).finally(render);
