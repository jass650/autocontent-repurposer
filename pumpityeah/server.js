'use strict';
// PumpitYeah server: static files, JSON-file persistence, cookie auth, pages API, and Claude-powered AI.
// Zero dependencies — needs Node 18+ (global fetch).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { seedWorkspace } = require('./seed');

loadEnv();

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.PUMPIT_DATA_DIR ? path.resolve(process.env.PUMPIT_DATA_DIR) : path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const AI_MODEL = process.env.PUMPIT_AI_MODEL || 'claude-sonnet-5-5';
const ANTHROPIC_BASE = (process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/$/, '');
const COOKIE = 'py_session';
const DEMO = { email: 'demo@pumpityeah.com', password: 'demo1234', name: 'Alex Rivera' };

function loadEnv() {
  const file = path.join(__dirname, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- persistence ----------
let db = loadDb();
function loadDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch {
    return { users: [], sessions: {}, pages: [] };
  }
}
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}
function flush() {
  clearTimeout(saveTimer);
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { flush(); process.exit(0); });

const newId = () => crypto.randomBytes(6).toString('hex');

// ---------- auth ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}
function checkPassword(user, password) {
  const { hash } = hashPassword(password, user.salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(user.hash, 'hex'));
}
function createUser({ name, email, password }) {
  const { salt, hash } = hashPassword(password);
  const user = { id: newId(), name, email: email.toLowerCase(), salt, hash, theme: 'system', createdAt: Date.now() };
  db.users.push(user);
  db.pages.push(...seedWorkspace(user.id, name));
  save();
  return user;
}
function ensureDemoUser() {
  if (!db.users.find((u) => u.email === DEMO.email)) createUser(DEMO);
}
function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function currentUser(req) {
  const token = parseCookies(req)[COOKIE];
  const s = token && db.sessions[token];
  if (!s || s.expires < Date.now()) return null;
  return db.users.find((u) => u.id === s.userId) || null;
}
function startSession(res, user) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, expires: Date.now() + 30 * 864e5 };
  save();
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`);
}
const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, theme: u.theme || 'system' });

// ---------- helpers ----------
function send(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
function readBody(req, limit = 6 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const stripTags = (html = '') => String(html).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

const userPages = (uid) => db.pages.filter((p) => p.ownerId === uid);
const findPage = (uid, id) => db.pages.find((p) => p.id === id && p.ownerId === uid);
function isHidden(p, all) {
  // trashed itself or any ancestor trashed
  let cur = p;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    if (cur.trashed) return true;
    seen.add(cur.id);
    cur = cur.parentId ? all.find((x) => x.id === cur.parentId) : null;
  }
  return false;
}
function descendants(uid, id) {
  const all = userPages(uid);
  const out = [];
  const walk = (pid) => all.filter((p) => p.parentId === pid).forEach((c) => { out.push(c); walk(c.id); });
  walk(id);
  return out;
}
const meta = (p) => ({
  id: p.id, parentId: p.parentId, title: p.title, icon: p.icon, kind: p.kind, row: !!p.row,
  favorite: !!p.favorite, trashed: !!p.trashed, published: !!p.published,
  createdAt: p.createdAt, updatedAt: p.updatedAt, order: p.order || 0,
});
function fullPage(uid, p) {
  const out = { ...p };
  delete out.ownerId;
  if (p.kind === 'database') {
    out.rows = userPages(uid).filter((r) => r.parentId === p.id && r.row && !r.trashed)
      .sort((a, b) => (a.order || 0) - (b.order || 0))
      .map((r) => ({ id: r.id, title: r.title, icon: r.icon, props: r.props || {}, order: r.order, updatedAt: r.updatedAt }));
  }
  if (p.row && p.parentId) {
    const parent = findPage(uid, p.parentId);
    if (parent) out.dbSchema = parent.schema || [];
  }
  return out;
}
function blocksToText(blocks = [], uid) {
  return blocks.map((b) => {
    const t = stripTags(b.html);
    switch (b.type) {
      case 'h1': return `# ${t}`;
      case 'h2': return `## ${t}`;
      case 'h3': return `### ${t}`;
      case 'bullet': return `- ${t}`;
      case 'numbered': return `1. ${t}`;
      case 'todo': return `- [${b.checked ? 'x' : ' '}] ${t}`;
      case 'quote': return `> ${t}`;
      case 'callout': return `> ${b.icon || '💡'} ${t}`;
      case 'toggle': return `▸ ${t}\n  ${stripTags(b.body || '')}`;
      case 'code': return '```' + (b.lang || '') + '\n' + t + '\n```';
      case 'divider': return '---';
      case 'image': return `[image: ${b.caption || b.url || ''}]`;
      case 'page': {
        const linked = uid && findPage(uid, b.pageId);
        return linked ? `[sub-page: ${linked.title}]` : '';
      }
      default: return t;
    }
  }).filter(Boolean).join('\n');
}
function formatProps(props = {}, schema = []) {
  return schema.map((s) => {
    const v = props[s.id];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return null;
    return `${s.name}: ${Array.isArray(v) ? v.join(', ') : v === true ? 'Yes' : v}`;
  }).filter(Boolean).join(' · ');
}

// ---------- AI ----------
const aiHits = new Map();
function rateLimited(uid) {
  const now = Date.now();
  const hits = (aiHits.get(uid) || []).filter((t) => now - t < 60_000);
  hits.push(now);
  aiHits.set(uid, hits);
  return hits.length > 20;
}

const WRITER_SYSTEM = `You are PumpitYeah AI, the writing assistant built into PumpitYeah, a block-based notes and docs workspace.
Write the requested content directly — no preamble like "Here is", no closing remarks, no meta commentary.
Format output as Markdown using ONLY these elements, one per line: headings (#, ##, ###), plain paragraphs, "- " bullets, "1. " numbered items, "- [ ] " to-dos, "> " quotes, "---" dividers, and fenced code blocks. Inline **bold**, *italic*, \`code\` and [links](url) are fine. No tables, no nested lists, no HTML.
Match the language and tone of the existing page unless asked otherwise. Be concise and genuinely useful.`;

const ACTIONS = {
  continue: 'Continue writing from where the page leaves off. Match the style and pick up the thought naturally. Write 1–3 paragraphs or list items as appropriate.',
  summarize: 'Summarize the page in a short paragraph followed by 3–6 key bullet points.',
  action_items: 'Extract every action item from the page as a to-do list ("- [ ] "). Include the owner and due date when mentioned.',
  brainstorm: 'Brainstorm 8–10 creative, specific ideas related to the page topic (or the prompt) as a bulleted list, each with a one-line rationale.',
  outline: 'Draft a well-structured outline with headings and bullets for the topic.',
  improve: 'Rewrite the selected text to be clearer, more engaging and better structured while keeping its meaning.',
  grammar: 'Fix spelling and grammar in the selected text. Change nothing else.',
  shorter: 'Make the selected text noticeably shorter while keeping the key points.',
  longer: 'Expand the selected text with more detail, examples and depth.',
  simplify: 'Rewrite the selected text in simple, plain language anyone can understand.',
  professional: 'Rewrite the selected text in a polished, professional tone.',
  casual: 'Rewrite the selected text in a friendly, casual tone.',
  explain: 'Explain the selected text clearly, as if to a smart newcomer.',
  translate: 'Translate the selected text (or the whole page if nothing is selected) into {lang}. Output only the translation.',
};

async function streamClaude(req, res, { system, messages, maxTokens = 2048 }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return send(res, 503, { error: 'PumpitYeah AI isn’t configured yet. Add ANTHROPIC_API_KEY to pumpityeah/.env and restart the server.' });
  }
  const controller = new AbortController();
  req.on('close', () => { if (!res.writableEnded) controller.abort(); });
  let upstream;
  try {
    upstream = await fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: AI_MODEL, max_tokens: maxTokens, system, messages, stream: true }),
    });
  } catch (e) {
    if (controller.signal.aborted) return;
    return send(res, 502, { error: `Couldn’t reach the AI service: ${e.message}` });
  }
  if (!upstream.ok) {
    const text = await upstream.text();
    let msg = text.slice(0, 300);
    try { msg = JSON.parse(text).error.message; } catch {}
    return send(res, 502, { error: `AI request failed (${upstream.status}): ${msg}` });
  }
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-cache', 'x-accel-buffering': 'no' });
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        let ev;
        try { ev = JSON.parse(line.slice(5)); } catch { continue; }
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') res.write(ev.delta.text);
        else if (ev.type === 'error') res.write(`\n\n⚠️ AI error: ${ev.error?.message || 'unknown'}`);
      }
    }
  } catch (e) {
    if (!controller.signal.aborted) res.write(`\n\n⚠️ Stream interrupted: ${e.message}`);
  }
  res.end();
}

function workspaceContext(uid, focusId) {
  const all = userPages(uid).filter((p) => !isHidden(p, db.pages));
  const parts = [];
  // Put the page the user is looking at first so it survives truncation.
  all.sort((a, b) => (a.id === focusId ? -1 : b.id === focusId ? 1 : (b.updatedAt || 0) - (a.updatedAt || 0)));
  for (const p of all) {
    if (p.row) continue;
    let body = `### ${p.icon ? p.icon + ' ' : ''}${p.title || 'Untitled'}\n`;
    if (p.kind === 'database') {
      const rows = all.filter((r) => r.parentId === p.id && r.row);
      body += `(database with ${rows.length} entries)\n` + rows.map((r) => `- ${r.title} — ${formatProps(r.props, p.schema)}`).join('\n');
    } else {
      body += blocksToText(p.blocks, uid);
    }
    parts.push(body);
  }
  let ctx = parts.join('\n\n');
  if (ctx.length > 90_000) ctx = ctx.slice(0, 90_000) + '\n…(truncated)';
  return ctx;
}

// ---------- API ----------
async function api(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean).slice(1); // drop "api"
  const method = req.method;
  const route = parts[0];

  // Public, unauthenticated routes
  if (route === 'signup' && method === 'POST') {
    const { name, email, password } = await readBody(req);
    if (!name?.trim() || !email?.trim() || !password) return send(res, 400, { error: 'Name, email and password are required.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
    if (password.length < 8) return send(res, 400, { error: 'Password must be at least 8 characters.' });
    if (db.users.find((u) => u.email === email.toLowerCase().trim())) return send(res, 409, { error: 'An account with this email already exists. Try logging in.' });
    const user = createUser({ name: name.trim().slice(0, 60), email: email.trim(), password });
    startSession(res, user);
    return send(res, 201, { user: publicUser(user) });
  }
  if (route === 'login' && method === 'POST') {
    const { email, password } = await readBody(req);
    const user = db.users.find((u) => u.email === String(email || '').toLowerCase().trim());
    if (!user || !password || !checkPassword(user, password)) return send(res, 401, { error: 'Incorrect email or password.' });
    startSession(res, user);
    return send(res, 200, { user: publicUser(user) });
  }
  if (route === 'logout' && method === 'POST') {
    const token = parseCookies(req)[COOKIE];
    if (token) { delete db.sessions[token]; save(); }
    res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    return send(res, 200, { ok: true });
  }
  if (route === 'public' && method === 'GET' && parts[1]) {
    const p = db.pages.find((x) => x.id === parts[1]);
    if (!p || !p.published || isHidden(p, db.pages)) return send(res, 404, { error: 'This page doesn’t exist or isn’t published.' });
    const owner = db.users.find((u) => u.id === p.ownerId);
    const full = fullPage(p.ownerId, p);
    // Only expose linked sub-pages that are themselves published
    const links = {};
    for (const bl of p.blocks || []) {
      if (bl.type !== 'page') continue;
      const lp = db.pages.find((x) => x.id === bl.pageId);
      if (lp) links[lp.id] = { title: lp.title, icon: lp.icon, published: !!lp.published };
    }
    return send(res, 200, { page: { ...full, favorite: undefined }, links, author: owner?.name || 'Someone' });
  }

  const user = currentUser(req);
  if (!user) return send(res, 401, { error: 'Please log in.' });
  const uid = user.id;

  if (route === 'me') {
    if (method === 'GET') return send(res, 200, { user: publicUser(user), ai: { enabled: !!process.env.ANTHROPIC_API_KEY, model: AI_MODEL } });
    if (method === 'PATCH') {
      const body = await readBody(req);
      if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim().slice(0, 60);
      if (['light', 'dark', 'system'].includes(body.theme)) user.theme = body.theme;
      save();
      return send(res, 200, { user: publicUser(user) });
    }
  }

  if (route === 'pages') {
    const id = parts[1];
    if (!id && method === 'GET') return send(res, 200, { pages: userPages(uid).map(meta) });
    if (!id && method === 'POST') {
      const body = await readBody(req);
      let parentId = body.parentId || null;
      if (parentId && !findPage(uid, parentId)) parentId = null;
      const siblings = userPages(uid).filter((p) => p.parentId === parentId);
      const page = {
        id: newId(), ownerId: uid, parentId,
        kind: body.kind === 'database' ? 'database' : 'page',
        title: String(body.title || '').slice(0, 300), icon: body.icon || '', cover: body.cover || '',
        blocks: Array.isArray(body.blocks) ? body.blocks : [],
        favorite: false, trashed: false, published: false, row: !!body.row, props: body.props || {},
        createdAt: Date.now(), updatedAt: Date.now(),
        order: body.order ?? siblings.reduce((m, p) => Math.max(m, p.order || 0), -1) + 1,
      };
      if (page.kind === 'database') {
        page.view = body.view === 'board' ? 'board' : 'table';
        page.schema = Array.isArray(body.schema) ? body.schema : [
          { id: 'status', name: 'Status', type: 'status', options: [
            { name: 'Not started', color: 'gray' }, { name: 'In progress', color: 'blue' }, { name: 'Done', color: 'green' },
          ] },
          { id: 'date', name: 'Date', type: 'date' },
        ];
      }
      db.pages.push(page);
      save();
      return send(res, 201, { page: fullPage(uid, page) });
    }
    const page = id && findPage(uid, id);
    if (!page) return send(res, 404, { error: 'Page not found.' });
    const action = parts[2];

    if (!action && method === 'GET') return send(res, 200, { page: fullPage(uid, page) });
    if (!action && method === 'PATCH') {
      const body = await readBody(req);
      const allowed = ['title', 'icon', 'cover', 'blocks', 'favorite', 'published', 'schema', 'view', 'props', 'order', 'fullWidth', 'smallText', 'font'];
      for (const k of allowed) if (k in body) page[k] = body[k];
      if (body.kind === 'database' && page.kind !== 'database') {
        page.kind = 'database';
        page.view = body.view === 'board' ? 'board' : 'table';
        if (!Array.isArray(page.schema)) page.schema = [];
      }
      if ('parentId' in body) {
        const target = body.parentId;
        const invalid = target && (target === page.id || !findPage(uid, target) || descendants(uid, page.id).some((d) => d.id === target));
        if (!invalid) page.parentId = target || null;
      }
      if (typeof page.title === 'string') page.title = page.title.slice(0, 300);
      page.updatedAt = Date.now();
      save();
      return send(res, 200, { page: meta(page), updatedAt: page.updatedAt });
    }
    if (!action && method === 'DELETE') {
      if (url.searchParams.get('permanent') === '1') {
        const doomed = new Set([page.id, ...descendants(uid, page.id).map((d) => d.id)]);
        db.pages = db.pages.filter((p) => !doomed.has(p.id));
      } else {
        page.trashed = true;
        page.trashedAt = Date.now();
      }
      save();
      return send(res, 200, { ok: true });
    }
    if (action === 'restore' && method === 'POST') {
      page.trashed = false;
      const parent = page.parentId && findPage(uid, page.parentId);
      if (parent && isHidden(parent, db.pages)) page.parentId = null;
      save();
      return send(res, 200, { page: meta(page) });
    }
    if (action === 'duplicate' && method === 'POST') {
      const map = new Map();
      const copyOf = (src, parentId, rename) => {
        const c = JSON.parse(JSON.stringify(src));
        c.id = newId();
        map.set(src.id, c.id);
        c.parentId = parentId;
        c.title = rename ? `${src.title || 'Untitled'} (copy)` : src.title;
        c.favorite = false; c.published = false;
        c.createdAt = c.updatedAt = Date.now();
        db.pages.push(c);
        userPages(uid).filter((p) => p.parentId === src.id && !p.trashed && p.id !== c.id).forEach((ch) => copyOf(ch, c.id, false));
        return c;
      };
      const copy = copyOf(page, page.parentId, true);
      copy.order = (page.order || 0) + 0.5;
      // Re-point sub-page links at the copies
      for (const newPid of map.values()) {
        const np = db.pages.find((p) => p.id === newPid);
        (np.blocks || []).forEach((bl) => { if (bl.type === 'page' && map.has(bl.pageId)) bl.pageId = map.get(bl.pageId); });
      }
      save();
      return send(res, 201, { page: meta(copy) });
    }
  }

  if (route === 'search' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').toLowerCase().trim();
    const all = userPages(uid).filter((p) => !isHidden(p, db.pages));
    const results = [];
    for (const p of all) {
      const title = (p.title || 'Untitled');
      const text = blocksToText(p.blocks);
      const inTitle = title.toLowerCase().includes(q);
      const idx = q ? text.toLowerCase().indexOf(q) : -1;
      if (!q || inTitle || idx >= 0) {
        const snippet = idx >= 0 ? text.slice(Math.max(0, idx - 40), idx + 80).replace(/\s+/g, ' ') : '';
        const parent = p.parentId && all.find((x) => x.id === p.parentId);
        results.push({ id: p.id, title, icon: p.icon, kind: p.kind, snippet, parentTitle: parent ? parent.title : '', score: (inTitle ? 2 : 1) + p.updatedAt / 1e14 });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return send(res, 200, { results: results.slice(0, 20) });
  }

  if (route === 'home' && method === 'GET') {
    const all = userPages(uid).filter((p) => !isHidden(p, db.pages));
    const recent = all.filter((p) => !p.row).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
      .map((p) => ({ ...meta(p), cover: p.cover || '' }));
    const tasks = [];
    for (const dbPage of all.filter((p) => p.kind === 'database')) {
      const statusProp = (dbPage.schema || []).find((s) => s.type === 'status');
      const dateProp = (dbPage.schema || []).find((s) => s.type === 'date');
      if (!statusProp || !dateProp) continue;
      const doneName = statusProp.options?.[statusProp.options.length - 1]?.name;
      all.filter((r) => r.parentId === dbPage.id && r.row).forEach((r) => {
        const status = r.props?.[statusProp.id];
        if (status === doneName || !r.props?.[dateProp.id]) return;
        const opt = statusProp.options.find((o) => o.name === status);
        tasks.push({ id: r.id, title: r.title, icon: r.icon, due: r.props[dateProp.id], status, color: opt?.color || 'gray', db: dbPage.title, dbIcon: dbPage.icon });
      });
    }
    tasks.sort((a, b) => a.due.localeCompare(b.due));
    return send(res, 200, { recent, tasks: tasks.slice(0, 8) });
  }

  if (route === 'ai' && method === 'POST') {
    if (rateLimited(uid)) return send(res, 429, { error: 'You’re going fast! Wait a moment and try again.' });
    const body = await readBody(req);
    if (parts[1] === 'complete') {
      let task = ACTIONS[body.action] || '';
      if (body.action === 'translate') task = task.replace('{lang}', body.lang || 'Spanish');
      if (body.prompt) task = task ? `${task}\nAdditional instructions from the user: ${body.prompt}` : body.prompt;
      if (!task) return send(res, 400, { error: 'Tell PumpitYeah AI what to do.' });
      const pageText = String(body.pageText || '').slice(0, 40_000);
      const selection = String(body.selection || '').slice(0, 20_000);
      let content = `Page title: ${body.pageTitle || 'Untitled'}\n\n<page>\n${pageText || '(empty page)'}\n</page>\n\n`;
      if (selection) content += `<selection>\n${selection}\n</selection>\n\n`;
      content += `Task: ${task}`;
      return streamClaude(req, res, { system: WRITER_SYSTEM, messages: [{ role: 'user', content }] });
    }
    if (parts[1] === 'chat') {
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-20);
      if (!history.length || history[history.length - 1].role !== 'user') return send(res, 400, { error: 'Ask a question first.' });
      const today = new Date().toISOString().slice(0, 10);
      const system = `You are PumpitYeah AI, an assistant built into ${user.name}'s PumpitYeah workspace. Today is ${today}.
You can see the full contents of their workspace below. Answer questions about it accurately, help them plan, draft and think.
When you use information from a page, cite it inline as [[Page title]] using the exact page title. Never invent pages or facts that aren't in the workspace; if the workspace doesn't contain the answer, say so and offer general help.
Use concise Markdown (headings, bullets, to-dos, bold). No tables.

<workspace>
${workspaceContext(uid, body.pageId)}
</workspace>`;
      return streamClaude(req, res, { system, messages: history, maxTokens: 3000 });
    }
  }

  return send(res, 404, { error: 'Not found.' });
}

// ---------- static ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};
function serveStatic(req, res, url) {
  let p = url.pathname;
  if (p === '/') p = '/index.html';
  else if (p === '/login' || p === '/signup') p = '/auth.html';
  else if (p === '/app' || p.startsWith('/app/')) p = '/app.html';
  else if (p.startsWith('/p/')) p = '/share.html';
  const file = path.normalize(path.join(PUBLIC_DIR, decodeURIComponent(p)));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      return res.end('<!doctype html><title>Not found</title><body style="font-family:system-ui;padding:80px;text-align:center"><h1>404</h1><p>This page doesn’t exist. <a href="/">Go home</a></p>');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong.' });
    else res.end();
  }
});

ensureDemoUser();
server.listen(PORT, () => {
  console.log(`\n  PumpitYeah running at http://localhost:${PORT}`);
  console.log(`  Demo login: ${DEMO.email} / ${DEMO.password}`);
  console.log(`  AI: ${process.env.ANTHROPIC_API_KEY ? `enabled (${AI_MODEL})` : 'disabled — set ANTHROPIC_API_KEY in pumpityeah/.env'}\n`);
});
