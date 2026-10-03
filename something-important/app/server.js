'use strict';
// TwoCents marketplace server. Zero dependencies (Node 18+). All money is integer cents.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seed, FEE, mondayOf, addWeeks } = require('./seed');

const PORT = Number(process.env.PORT) || 3100;
const DATA_DIR = process.env.TWOCENTS_DATA_DIR ? path.resolve(process.env.TWOCENTS_DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const COOKIE = 'tc_session';
const DEMO = { email: 'demo@twocents.money', password: 'demo1234' };
const AD_PRICES = { hero: 500, side: 100 };
const SIDE_SLOTS = 3;
const KINDS = ['item', 'service', 'billboard'];
const UNITS = { item: ['each'], service: ['hour', 'job'], billboard: ['week'] };

// ---------- persistence ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
let db;
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch {
  db = { ...seed(hashPassword), sessions: {} };
  db.users[0].email = DEMO.email;
  flush();
}
let timer;
function save() { clearTimeout(timer); timer = setTimeout(flush, 150); }
function flush() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
}
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { flush(); process.exit(0); });
const newId = () => crypto.randomBytes(6).toString('hex');
const today = () => new Date().toISOString().slice(0, 10);

// ---------- http helpers ----------
function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
function body(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 3e6) { reject(new HttpError(413, 'Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}); } catch { reject(new HttpError(400, 'Invalid JSON')); } });
  });
}
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)]));
}
function me(req) {
  const s = db.sessions[cookies(req)[COOKIE]];
  return s && s.expires > Date.now() ? db.users.find((u) => u.id === s.userId) : null;
}
function login(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, expires: Date.now() + 30 * 864e5 };
  save();
  return { 'set-cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}` };
}

// ---------- views ----------
const userById = (id) => db.users.find((u) => u.id === id);
const pubUser = (u) => u && ({ id: u.id, name: u.name, location: u.location, bio: u.bio, createdAt: u.createdAt, ...stats(u.id) });
function stats(uid) {
  const sales = db.orders.filter((o) => o.sellerId === uid);
  return { sales: sales.length, listings: db.listings.filter((l) => l.sellerId === uid && l.status !== 'deleted').length };
}
function listingView(l) {
  const s = userById(l.sellerId);
  return { ...l, seller: s ? { id: s.id, name: s.name, location: s.location } : null, sold: db.orders.filter((o) => o.listingId === l.id).length };
}
function bookedWeeks(listingId) {
  const weeks = new Set();
  for (const o of db.orders) if (o.listingId === listingId && o.booking) for (let i = 0; i < o.booking.weeks; i++) weeks.add(addWeeks(o.booking.start, i));
  return [...weeks].sort();
}
function cleanListing(input, existing = {}) {
  const kind = KINDS.includes(input.kind) ? input.kind : existing.kind;
  if (!kind) fail(400, 'Pick what you’re selling: stuff, a service, or a billboard.');
  const title = String(input.title ?? existing.title ?? '').trim().slice(0, 120);
  if (title.length < 3) fail(400, 'Give it a title (at least 3 characters).');
  const price = Math.round(Number(input.price ?? existing.price));
  if (!Number.isFinite(price) || price < 1) fail(400, 'Price must be at least 1¢.');
  if (price > 100_000_000) fail(400, 'Price is capped at $1,000,000 for now.');
  const unit = UNITS[kind].includes(input.unit) ? input.unit : UNITS[kind][0];
  const out = {
    kind, title, price, unit,
    description: String(input.description ?? existing.description ?? '').slice(0, 4000),
    category: String(input.category ?? existing.category ?? 'Other').trim().slice(0, 40) || 'Other',
    location: String(input.location ?? existing.location ?? '').trim().slice(0, 80),
    emoji: String(input.emoji ?? existing.emoji ?? '🪙').slice(0, 8),
    colors: Array.isArray(input.colors) && input.colors.length === 2 && input.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)) ? input.colors : existing.colors || ['#14532d', '#22c55e'],
    image: /^https:\/\/\S+$/i.test(input.image || '') ? input.image.slice(0, 1000) : input.image === '' ? '' : existing.image || '',
  };
  if (kind === 'item') out.stock = Math.max(0, Math.min(100000, Math.round(Number(input.stock ?? existing.stock ?? 1)) || 0));
  else out.stock = null;
  if (kind === 'billboard') {
    const bb = input.billboard || existing.billboard || {};
    out.billboard = { size: String(bb.size || '').slice(0, 40), daily: Math.max(0, Math.round(Number(bb.daily) || 0)), lit: !!bb.lit };
  } else out.billboard = null;
  return out;
}

// ---------- API ----------
async function api(req, res, url) {
  const [, , route, a, b] = url.pathname.split('/');
  const M = req.method;
  const user = me(req);
  const need = () => user || fail(401, 'Log in first.');

  if (route === 'signup' && M === 'POST') {
    const { name, email, password, location } = await body(req);
    if (!name?.trim() || !email?.trim() || !password) fail(400, 'Name, email and password are required.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'That email doesn’t look right.');
    if (password.length < 8) fail(400, 'Password needs 8+ characters.');
    if (db.users.some((u) => u.email === email.toLowerCase().trim())) fail(409, 'That email already has an account — log in instead.');
    const u = { id: newId(), name: name.trim().slice(0, 60), email: email.toLowerCase().trim(), ...hashPassword(password), location: String(location || '').slice(0, 80), bio: '', createdAt: Date.now() };
    db.users.push(u);
    return send(res, 201, { user: pubUser(u) }, login(res, u));
  }
  if (route === 'login' && M === 'POST') {
    const { email, password } = await body(req);
    const u = db.users.find((x) => x.email === String(email || '').toLowerCase().trim());
    const ok = u && password && crypto.timingSafeEqual(Buffer.from(hashPassword(password, u.salt).hash, 'hex'), Buffer.from(u.hash, 'hex'));
    if (!ok) fail(401, 'Wrong email or password.');
    return send(res, 200, { user: pubUser(u) }, login(res, u));
  }
  if (route === 'logout' && M === 'POST') {
    delete db.sessions[cookies(req)[COOKIE]]; save();
    return send(res, 200, { ok: true }, { 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0` });
  }
  if (route === 'me' && M === 'GET') {
    if (!user) return send(res, 200, { user: null });
    return send(res, 200, { user: { ...pubUser(user), email: user.email } });
  }
  if (route === 'me' && M === 'PATCH') {
    need();
    const { name, location, bio } = await body(req);
    if (name?.trim()) user.name = name.trim().slice(0, 60);
    if (location != null) user.location = String(location).slice(0, 80);
    if (bio != null) user.bio = String(bio).slice(0, 400);
    save();
    return send(res, 200, { user: pubUser(user) });
  }

  if (route === 'listings' && !a && M === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const kind = url.searchParams.get('kind');
    const cat = url.searchParams.get('cat');
    const seller = url.searchParams.get('seller');
    const sort = url.searchParams.get('sort') || 'new';
    let list = db.listings.filter((l) => l.status === 'active' || (seller && l.sellerId === seller && l.status !== 'deleted' && user?.id === seller));
    if (kind) list = list.filter((l) => l.kind === kind);
    if (cat) list = list.filter((l) => l.category === cat);
    if (seller) list = list.filter((l) => l.sellerId === seller);
    if (q) list = list.filter((l) => `${l.title} ${l.description} ${l.category} ${l.location}`.toLowerCase().includes(q));
    const sorters = { new: (x, y) => y.createdAt - x.createdAt, cheap: (x, y) => x.price - y.price, pricey: (x, y) => y.price - x.price, popular: (x, y) => y.views - x.views };
    list.sort(sorters[sort] || sorters.new);
    const cats = {};
    for (const l of db.listings) if (l.status === 'active' && (!kind || l.kind === kind)) cats[l.category] = (cats[l.category] || 0) + 1;
    return send(res, 200, { listings: list.slice(0, 120).map(listingView), categories: cats });
  }
  if (route === 'listings' && !a && M === 'POST') {
    need();
    const data = cleanListing(await body(req));
    const l = { id: newId(), sellerId: user.id, ...data, location: data.location || user.location || '', status: 'active', views: 0, createdAt: Date.now() };
    db.listings.push(l); save();
    return send(res, 201, { listing: listingView(l) });
  }
  if (route === 'listings' && a) {
    const l = db.listings.find((x) => x.id === a && x.status !== 'deleted');
    if (!l) fail(404, 'That listing is gone.');
    if (!b && M === 'GET') {
      if (user?.id !== l.sellerId) { l.views++; save(); }
      const more = db.listings.filter((x) => x.sellerId === l.sellerId && x.id !== l.id && x.status === 'active').slice(0, 4).map(listingView);
      return send(res, 200, { listing: listingView(l), seller: pubUser(userById(l.sellerId)), booked: l.kind === 'billboard' ? bookedWeeks(l.id) : [], more });
    }
    if (!b && (M === 'PATCH' || M === 'DELETE')) {
      need();
      if (l.sellerId !== user.id) fail(403, 'That’s not your listing.');
      if (M === 'DELETE') { l.status = 'deleted'; save(); return send(res, 200, { ok: true }); }
      const input = await body(req);
      if (input.status && ['active', 'paused'].includes(input.status) && Object.keys(input).length === 1) l.status = input.status;
      else Object.assign(l, cleanListing({ ...input, kind: l.kind }, l));
      save();
      return send(res, 200, { listing: listingView(l) });
    }
    if (b === 'buy' && M === 'POST') {
      need();
      if (l.sellerId === user.id) fail(400, 'You can’t buy your own listing (nice try).');
      if (l.status !== 'active') fail(400, 'This listing isn’t available right now.');
      const input = await body(req);
      let qty = 1, subtotal, booking = null;
      if (l.kind === 'item') {
        qty = Math.max(1, Math.round(Number(input.qty) || 1));
        if (l.stock < qty) fail(400, l.stock ? `Only ${l.stock} left.` : 'Sold out.');
        subtotal = l.price * qty;
      } else if (l.kind === 'service') {
        qty = l.unit === 'hour' ? Math.max(1, Math.min(100, Math.round(Number(input.qty) || 1))) : 1;
        subtotal = l.price * qty;
      } else {
        const weeks = Math.max(1, Math.min(52, Math.round(Number(input.weeks) || 1)));
        const start = String(input.start || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || mondayOf(new Date(start + 'T00:00:00Z')) !== start) fail(400, 'Pick a start week.');
        if (start < mondayOf(new Date())) fail(400, 'That week already started — pick a future week.');
        const taken = new Set(bookedWeeks(l.id));
        for (let i = 0; i < weeks; i++) if (taken.has(addWeeks(start, i))) fail(409, `The week of ${addWeeks(start, i)} is already booked.`);
        booking = { start, weeks };
        qty = weeks;
        subtotal = l.price * weeks;
      }
      const fee = FEE(subtotal);
      const order = {
        id: newId(), listingId: l.id, title: l.title, kind: l.kind, emoji: l.emoji, sellerId: l.sellerId, buyerId: user.id,
        qty, subtotal, fee, payout: subtotal - fee, booking, note: String(input.note || '').slice(0, 1000), status: 'paid', createdAt: Date.now(),
      };
      if (l.kind === 'item') { l.stock -= qty; if (l.stock === 0) l.status = 'sold'; }
      db.orders.push(order); save();
      return send(res, 201, { order });
    }
  }

  if (route === 'orders' && a && b === 'complete' && M === 'POST') {
    need();
    const o = db.orders.find((x) => x.id === a);
    if (!o || (o.sellerId !== user.id && o.buyerId !== user.id)) fail(404, 'Order not found.');
    o.status = 'completed'; save();
    return send(res, 200, { order: o });
  }

  if (route === 'users' && a && M === 'GET') {
    const u = userById(a);
    if (!u) fail(404, 'No such seller.');
    return send(res, 200, { user: pubUser(u), listings: db.listings.filter((l) => l.sellerId === u.id && l.status === 'active').map(listingView) });
  }

  if (route === 'dashboard' && M === 'GET') {
    need();
    const sales = db.orders.filter((o) => o.sellerId === user.id).sort((x, y) => y.createdAt - x.createdAt);
    const purchases = db.orders.filter((o) => o.buyerId === user.id).sort((x, y) => y.createdAt - x.createdAt);
    const name = (id) => userById(id)?.name || 'Someone';
    return send(res, 200, {
      listings: db.listings.filter((l) => l.sellerId === user.id && l.status !== 'deleted').sort((x, y) => y.createdAt - x.createdAt).map(listingView),
      sales: sales.map((o) => ({ ...o, buyerName: name(o.buyerId) })),
      purchases: purchases.map((o) => ({ ...o, sellerName: name(o.sellerId) })),
      ads: db.ads.filter((x) => x.ownerId === user.id).sort((x, y) => y.date.localeCompare(x.date)),
      totals: {
        earned: sales.reduce((s, o) => s + o.payout, 0),
        fees: sales.reduce((s, o) => s + o.fee, 0),
        spent: purchases.reduce((s, o) => s + o.subtotal, 0) + db.ads.filter((x) => x.ownerId === user.id).reduce((s, x) => s + x.price, 0),
      },
    });
  }

  if (route === 'ads' && a === 'live' && M === 'GET') {
    const d = today();
    const enrich = (ad) => { const l = db.listings.find((x) => x.id === ad.listingId); return { ...ad, listing: l && l.status === 'active' ? listingView(l) : null }; };
    const live = db.ads.filter((x) => x.date === d).map(enrich).filter((x) => x.listing);
    return send(res, 200, { hero: live.find((x) => x.slot === 'hero') || null, side: live.filter((x) => x.slot === 'side').slice(0, SIDE_SLOTS), prices: AD_PRICES });
  }
  if (route === 'ads' && a === 'calendar' && M === 'GET') {
    const days = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(Date.now() + i * 864e5).toISOString().slice(0, 10);
      const onDay = db.ads.filter((x) => x.date === d);
      days.push({ date: d, heroTaken: onDay.some((x) => x.slot === 'hero'), sideLeft: SIDE_SLOTS - onDay.filter((x) => x.slot === 'side').length, mine: user ? onDay.filter((x) => x.ownerId === user.id).map((x) => x.slot) : [] });
    }
    return send(res, 200, { days, prices: AD_PRICES, sideSlots: SIDE_SLOTS });
  }
  if (route === 'ads' && !a && M === 'POST') {
    need();
    const { slot, dates, listingId, headline } = await body(req);
    if (!AD_PRICES[slot]) fail(400, 'Pick the hero board or a side board.');
    const l = db.listings.find((x) => x.id === listingId && x.sellerId === user.id && x.status === 'active');
    if (!l) fail(400, 'Pick one of your active listings to promote.');
    const list = [...new Set(Array.isArray(dates) ? dates : [])].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    if (!list.length) fail(400, 'Pick at least one day.');
    for (const d of list) {
      if (d < today()) fail(400, `${d} is in the past.`);
      const onDay = db.ads.filter((x) => x.date === d);
      if (slot === 'hero' && onDay.some((x) => x.slot === 'hero')) fail(409, `The hero board is taken on ${d}.`);
      if (slot === 'side' && onDay.filter((x) => x.slot === 'side').length >= SIDE_SLOTS) fail(409, `Side boards are full on ${d}.`);
    }
    const created = list.map((d) => ({ id: newId(), slot, date: d, ownerId: user.id, listingId: l.id, headline: String(headline || l.title).slice(0, 80), price: AD_PRICES[slot], createdAt: Date.now() }));
    db.ads.push(...created); save();
    return send(res, 201, { ads: created, total: created.reduce((s, x) => s + x.price, 0) });
  }

  if (route === 'jar' && M === 'GET') {
    const fees = db.orders.reduce((s, o) => s + o.fee, 0);
    const adRev = db.ads.reduce((s, x) => s + x.price, 0);
    const gmv = db.orders.reduce((s, o) => s + o.subtotal, 0);
    const series = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 864e5).toISOString().slice(0, 10);
      const dayFees = db.orders.filter((o) => new Date(o.createdAt).toISOString().slice(0, 10) === d).reduce((s, o) => s + o.fee, 0);
      const dayAds = db.ads.filter((x) => new Date(x.createdAt).toISOString().slice(0, 10) === d).reduce((s, x) => s + x.price, 0);
      series.push({ date: d, fees: dayFees, ads: dayAds });
    }
    const recent = [
      ...db.orders.map((o) => ({ at: o.createdAt, cents: o.fee, what: `${o.emoji} ${o.title}`, type: o.kind })),
      ...db.ads.map((x) => ({ at: x.createdAt, cents: x.price, what: `${x.slot === 'hero' ? 'Hero' : 'Side'} board — ${x.headline}`, type: 'ad' })),
    ].sort((x, y) => y.at - x.at).slice(0, 15);
    return send(res, 200, { total: fees + adRev, fees, adRev, gmv, deals: db.orders.length, ads: db.ads.length, sellers: new Set(db.listings.map((l) => l.sellerId)).size, series, recent });
  }

  fail(404, 'Not found.');
}

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
function serveStatic(res, pathname) {
  let file = path.normalize(path.join(PUBLIC, decodeURIComponent(pathname)));
  if (!file.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  if (!path.extname(file) || !fs.existsSync(file)) file = path.join(PUBLIC, 'index.html'); // SPA routes
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(res, url.pathname);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    send(res, e.status || 500, { error: e instanceof HttpError ? e.message : 'Something broke on our end.' });
  }
}).listen(PORT, () => {
  console.log(`\n  TwoCents running at http://localhost:${PORT}`);
  console.log(`  Demo login: ${DEMO.email} / ${DEMO.password}\n`);
});
