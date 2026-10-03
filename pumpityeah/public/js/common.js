// Shared utilities: API client, streaming, sanitizer, markdown <-> blocks, icons, toasts, popovers.

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch('/api' + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json() : null;
  if (!res.ok) throw Object.assign(new Error(data?.error || res.statusText || 'Request failed'), { status: res.status });
  return data;
}

// POST and stream a plain-text response, calling onText(fullTextSoFar) as chunks arrive.
export async function streamPost(path, body, onText, signal) {
  const res = await fetch('/api' + path, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    throw Object.assign(new Error(msg), { status: res.status });
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText(text);
  }
  return text;
}

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

export function escapeHtml(s = '') {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function stripTags(html = '') {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  return d.textContent || '';
}

// Whitelist sanitizer for inline rich text stored in blocks.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'DEL', 'CODE', 'A', 'BR', 'MARK']);
const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'SVG', 'MATH', 'NOSCRIPT', 'TITLE', 'META', 'LINK']);
export function sanitize(html = '') {
  const doc = new DOMParser().parseFromString(`<body><div>${html}</div></body>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';
  clean(root);
  return root.innerHTML;
}
function clean(node) {
  for (const child of [...node.childNodes]) {
    if (child.nodeType === 3) continue;
    if (child.nodeType !== 1) { child.remove(); continue; }
    if (DROP.has(child.tagName)) { child.remove(); continue; }
    clean(child);
    if (!ALLOWED.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
    for (const a of [...child.attributes]) {
      const n = a.name.toLowerCase();
      const keep = (child.tagName === 'A' && n === 'href' && /^(https?:|mailto:|\/)/i.test(a.value.trim()))
        || (child.tagName === 'MARK' && n === 'class' && /^hl-[a-z]+$/.test(a.value));
      if (!keep) child.removeAttribute(a.name);
    }
    if (child.tagName === 'A') { child.setAttribute('target', '_blank'); child.setAttribute('rel', 'noopener noreferrer'); }
  }
}

// ---------- markdown ----------
export function inlineMd(text = '') {
  let s = escapeHtml(text);
  const codes = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/\[([^\]]+)\]\(((?:https?:|\/)[^)\s]+)\)/g, '<a href="$2">$1</a>');
  s = s.replace(/\[\[([^\]]+)\]\]/g, '<b>$1</b>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/__([^_]+)__/g, '<b>$1</b>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<i>$2</i>').replace(/(^|[^_\w])_([^_\n]+)_(?!_)/g, '$1<i>$2</i>');
  s = s.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
  return s;
}
const blk = (type, html = '', extra = {}) => ({ id: uid(), type, html, ...extra });
export function mdToBlocks(md = '') {
  const lines = md.replace(/\r/g, '').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const lang = line.trim().slice(3).trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++]);
      out.push(blk('code', escapeHtml(buf.join('\n')), { lang: lang || 'plain text' }));
      continue;
    }
    if (!line.trim()) continue;
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.*)/))) out.push(blk('h' + Math.min(3, m[1].length), inlineMd(m[2])));
    else if ((m = line.match(/^\s*[-*+]\s+\[( |x|X)\]\s*(.*)/))) out.push(blk('todo', inlineMd(m[2]), { checked: m[1].toLowerCase() === 'x' }));
    else if ((m = line.match(/^\s*[-*+•]\s+(.*)/))) out.push(blk('bullet', inlineMd(m[1])));
    else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) out.push(blk('numbered', inlineMd(m[1])));
    else if ((m = line.match(/^>\s?(.*)/))) out.push(blk('quote', inlineMd(m[1])));
    else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) out.push(blk('divider'));
    else out.push(blk('p', inlineMd(line.trim())));
  }
  return out;
}
function htmlToMdInline(html = '') {
  const d = document.createElement('div');
  d.innerHTML = sanitize(html);
  const walk = (n) => [...n.childNodes].map((c) => {
    if (c.nodeType === 3) return c.textContent;
    const inner = walk(c);
    switch (c.tagName) {
      case 'B': case 'STRONG': return `**${inner}**`;
      case 'I': case 'EM': return `*${inner}*`;
      case 'S': case 'DEL': case 'STRIKE': return `~~${inner}~~`;
      case 'CODE': return '`' + inner + '`';
      case 'A': return `[${inner}](${c.getAttribute('href')})`;
      case 'BR': return '\n';
      default: return inner;
    }
  }).join('');
  return walk(d);
}
export function blocksToMd(blocks = [], pageTitles = {}) {
  let n = 0;
  return blocks.map((b) => {
    const t = b.type === 'code' ? stripTags(b.html) : htmlToMdInline(b.html);
    if (b.type !== 'numbered') n = 0;
    switch (b.type) {
      case 'h1': return `# ${t}`;
      case 'h2': return `## ${t}`;
      case 'h3': return `### ${t}`;
      case 'bullet': return `- ${t}`;
      case 'numbered': return `${++n}. ${t}`;
      case 'todo': return `- [${b.checked ? 'x' : ' '}] ${t}`;
      case 'quote': return `> ${t}`;
      case 'callout': return `> ${b.icon || '💡'} ${t}`;
      case 'toggle': return `- ${t}\n  ${stripTags(b.body || '')}`;
      case 'code': return '```' + (b.lang && b.lang !== 'plain text' ? b.lang : '') + '\n' + t + '\n```';
      case 'divider': return '---';
      case 'image': return b.url && !b.url.startsWith('data:') ? `![${b.caption || ''}](${b.url})` : '';
      case 'page': return pageTitles[b.pageId] ? `[${pageTitles[b.pageId]}]` : '';
      default: return t;
    }
  }).filter((s) => s !== '').join('\n\n');
}

// Minimal markdown -> HTML for AI chat/preview rendering (safe: everything escaped first).
export function mdToHtml(md = '') {
  return mdToBlocks(md).map((b) => renderStaticBlock(b)).join('');
}
export function renderStaticBlock(b, ctx = {}) {
  const h = sanitize(b.html || '');
  switch (b.type) {
    case 'h1': return `<h1 class="sb sb-h1">${h}</h1>`;
    case 'h2': return `<h2 class="sb sb-h2">${h}</h2>`;
    case 'h3': return `<h3 class="sb sb-h3">${h}</h3>`;
    case 'bullet': return `<div class="sb sb-li"><span class="sb-dot">•</span><div>${h}</div></div>`;
    case 'numbered': return `<div class="sb sb-li"><span class="sb-num">${ctx.num || 1}.</span><div>${h}</div></div>`;
    case 'todo': return `<div class="sb sb-li sb-todo ${b.checked ? 'done' : ''}"><span class="sb-check">${b.checked ? ICONS.check : ''}</span><div>${h}</div></div>`;
    case 'quote': return `<blockquote class="sb sb-quote">${h}</blockquote>`;
    case 'callout': return `<div class="sb sb-callout"><span>${escapeHtml(b.icon || '💡')}</span><div>${h}</div></div>`;
    case 'divider': return `<hr class="sb sb-hr">`;
    case 'code': return `<pre class="sb sb-code"><code>${h}</code></pre>`;
    case 'toggle': return `<details class="sb sb-toggle" ${b.open ? 'open' : ''}><summary>${h}</summary><div>${escapeHtml(b.body || '').replace(/\n/g, '<br>')}</div></details>`;
    case 'image': return b.url ? `<figure class="sb sb-img"><img src="${escapeHtml(safeUrl(b.url))}" alt="${escapeHtml(b.caption || '')}" loading="lazy">${b.caption ? `<figcaption>${escapeHtml(b.caption)}</figcaption>` : ''}</figure>` : '';
    case 'page': {
      const l = ctx.links?.[b.pageId];
      if (!l) return '';
      const inner = `<span>${escapeHtml(l.icon || '📄')}</span><span class="sb-pagelink-title">${escapeHtml(l.title || 'Untitled')}</span>`;
      return l.published ? `<a class="sb sb-pagelink" href="/p/${b.pageId}">${inner}</a>` : `<div class="sb sb-pagelink muted">${inner}</div>`;
    }
    default: return `<p class="sb sb-p">${h || '&nbsp;'}</p>`;
  }
}
export function renderStaticBlocks(blocks = [], ctx = {}) {
  let n = 0;
  return blocks.map((b) => {
    n = b.type === 'numbered' ? n + 1 : 0;
    return renderStaticBlock(b, { ...ctx, num: n });
  }).join('');
}
export function safeUrl(u = '') {
  return /^(https?:|data:image\/(png|jpe?g|gif|webp);base64,|\/)/i.test(u) ? u : '';
}
// For CSS url("…"): quotes, parens, backslashes and whitespace can't break out of the value.
export function cssUrl(u = '') {
  return `url("${safeUrl(u).replace(/["'()\\\s]/g, (c) => encodeURIComponent(c))}")`;
}

// ---------- misc ----------
export function timeAgo(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  wrapped.flush = (...a) => { clearTimeout(t); fn(...a); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export function toast(message, { type = '', action, onAction, duration = 3200 } = {}) {
  let wrap = document.querySelector('.toasts');
  if (!wrap) { wrap = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(wrap); }
  const t = h('div', { class: `toast ${type}` }, h('span', { text: message }));
  if (action) t.append(h('button', { text: action, onclick: () => { onAction?.(); t.remove(); } }));
  wrap.append(t);
  setTimeout(() => t.remove(), duration);
}

// Popover anchored to an element; closes on outside click / Escape. Returns { el, close }.
let openPop = null;
export function popover(anchor, content, { align = 'start', width, offset = 6, onClose, className = '', place = 'below' } = {}) {
  closePopover();
  const el = h('div', { class: `popover ${className}`, role: 'dialog' });
  if (width) el.style.width = typeof width === 'number' ? width + 'px' : width;
  el.append(content);
  document.body.append(el);
  const position = () => {
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor;
    const pw = el.offsetWidth, ph = el.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    let left = align === 'end' ? r.right - pw : align === 'center' ? r.left + r.width / 2 - pw / 2 : r.left;
    left = Math.max(8, Math.min(left, vw - pw - 8));
    let top = place === 'above' ? r.top - ph - offset : r.bottom + offset;
    if (top + ph > vh - 8) top = Math.max(8, r.top - ph - offset);
    if (top < 8) top = 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  };
  position();
  const onDown = (e) => { if (!el.contains(e.target) && !(anchor.contains && anchor.contains(e.target))) close(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => document.addEventListener('mousedown', onDown), 0);
  document.addEventListener('keydown', onKey, true);
  const close = () => {
    if (!el.isConnected) return;
    el.remove();
    document.removeEventListener('mousedown', onDown);
    document.removeEventListener('keydown', onKey, true);
    if (openPop?.el === el) openPop = null;
    onClose?.();
  };
  openPop = { el, close, position };
  return openPop;
}
export function closePopover() { openPop?.close(); }

// A list menu (used by many popovers). items: {label, icon, hint, onClick, danger, divider, header}
export function menuList(items, close) {
  const list = h('div', { class: 'menu', role: 'menu' });
  for (const it of items) {
    if (it.divider) { list.append(h('div', { class: 'menu-divider' })); continue; }
    if (it.header) { list.append(h('div', { class: 'menu-header', text: it.header })); continue; }
    list.append(h('button', {
      class: `menu-item ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}`, role: 'menuitem',
      onclick: (e) => { e.preventDefault(); close?.(); it.onClick?.(); },
    },
    h('span', { class: 'menu-icon', html: it.icon || '' }),
    h('span', { class: 'menu-label', text: it.label }),
    it.hint ? h('span', { class: 'menu-hint', text: it.hint }) : null,
    it.active ? h('span', { class: 'menu-check', html: ICONS.check }) : null));
  }
  return list;
}

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
  try { localStorage.setItem('py-theme', theme || 'system'); } catch {}
}

const s = (d, extra = '') => `<svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
export const ICONS = {
  search: s('<circle cx="9" cy="9" r="5.5"/><path d="m13.2 13.2 3.8 3.8"/>'),
  home: s('<path d="M3.5 9 10 3.5 16.5 9v7a1 1 0 0 1-1 1h-3.5v-5h-4v5H4.5a1 1 0 0 1-1-1z"/>'),
  sparkle: s('<path d="M10 2.5c.5 3.4 2.1 5 5.5 5.5-3.4.5-5 2.1-5.5 5.5-.5-3.4-2.1-5-5.5-5.5 3.4-.5 5-2.1 5.5-5.5Z" fill="currentColor" stroke="none"/><path d="M15.5 12.5c.2 1.5.9 2.2 2.3 2.4-1.4.2-2.1.9-2.3 2.4-.2-1.5-.9-2.2-2.4-2.4 1.5-.2 2.2-.9 2.4-2.4Z" fill="currentColor" stroke="none"/>'),
  settings: s('<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>'),
  plus: s('<path d="M10 4v12M4 10h12"/>'),
  trash: s('<path d="M4 6h12M8 6V4h4v2M5.5 6l.7 10a1 1 0 0 0 1 .9h5.6a1 1 0 0 0 1-.9l.7-10"/>'),
  template: s('<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 8h14M8 8v9"/>'),
  chevronRight: s('<path d="m8 5 5 5-5 5"/>'),
  chevronDown: s('<path d="m5 8 5 5 5-5"/>'),
  chevronsLeft: s('<path d="m10 5-5 5 5 5M15 5l-5 5 5 5"/>'),
  menu: s('<path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13"/>'),
  more: s('<circle cx="4.5" cy="10" r="1.2" fill="currentColor"/><circle cx="10" cy="10" r="1.2" fill="currentColor"/><circle cx="15.5" cy="10" r="1.2" fill="currentColor"/>'),
  star: s('<path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3.1 8l4.8-.6z"/>'),
  starFilled: s('<path d="m10 3 2.1 4.4 4.8.6-3.5 3.3.9 4.7L10 13.7 5.7 16l.9-4.7L3.1 8l4.8-.6z" fill="#f5c344" stroke="#f5c344"/>'),
  doc: s('<path d="M5 2.5h6.5L15 6v11a.5.5 0 0 1-.5.5h-9.5A.5.5 0 0 1 4.5 17V3a.5.5 0 0 1 .5-.5Z"/><path d="M11 2.5V6.5h4M7 10h6M7 13h6"/>'),
  table: s('<rect x="3" y="4" width="14" height="12" rx="1.5"/><path d="M3 8h14M3 12h14M8 4v12"/>'),
  board: s('<rect x="3" y="3.5" width="4" height="13" rx="1"/><rect x="8" y="3.5" width="4" height="9" rx="1"/><rect x="13" y="3.5" width="4" height="11" rx="1"/>'),
  drag: '<svg viewBox="0 0 10 16" width="10" height="16" fill="currentColor" aria-hidden="true"><circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/><circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/><circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/></svg>',
  check: '<svg viewBox="0 0 14 14" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m2.5 7.5 3 3 6-7"/></svg>',
  x: s('<path d="m5 5 10 10M15 5 5 15"/>'),
  share: s('<path d="M10 12V3M6.5 6.5 10 3l3.5 3.5M4 11v5h12v-5"/>'),
  globe: s('<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2 2.2 2.8 4.5 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.5-2.8-7S8 5.2 10 3Z"/>'),
  link: s('<path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.5-2.5a3 3 0 0 0-4.2-4.2L10 5.8M11.5 8.5a3 3 0 0 0-4.2 0L4.8 11a3 3 0 0 0 4.2 4.2l1-1"/>'),
  copy: s('<rect x="6.5" y="6.5" width="10" height="10" rx="1.5"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>'),
  duplicate: s('<rect x="6.5" y="6.5" width="10" height="10" rx="1.5"/><path d="M13.5 6.5V4.5a1 1 0 0 0-1-1h-8a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2"/>'),
  edit: s('<path d="m13 3.5 3.5 3.5L7 16.5H3.5V13z"/>'),
  restore: s('<path d="M4 10a6 6 0 1 0 2-4.5L4 7.5"/><path d="M4 3.5v4h4"/>'),
  logout: s('<path d="M8 4H4.5v12H8M12 6.5 15.5 10 12 13.5M15.5 10H8"/>'),
  sun: s('<circle cx="10" cy="10" r="3.5"/><path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.3 4.3l1 1M14.7 14.7l1 1M4.3 15.7l1-1M14.7 5.3l1-1"/>'),
  moon: s('<path d="M16 12.5A6.5 6.5 0 0 1 7.5 4 6.5 6.5 0 1 0 16 12.5Z"/>'),
  image: s('<rect x="3" y="4" width="14" height="12" rx="1.5"/><circle cx="7.5" cy="8.5" r="1.5"/><path d="m3.5 14.5 4-4 3 3 2-2 4 4"/>'),
  smile: s('<circle cx="10" cy="10" r="7"/><path d="M7 11.5c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5M7.5 8h.01M12.5 8h.01"/>'),
  send: s('<path d="M10 16V4M5 9l5-5 5 5"/>'),
  stop: '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><rect x="5" y="5" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  clock: s('<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2"/>'),
  download: s('<path d="M10 3v9M6.5 8.5 10 12l3.5-3.5M4 14v2.5h12V14"/>'),
  text: s('<path d="M4 5V4h12v1M10 4v12M7.5 16h5"/>'),
  filter: s('<path d="M3.5 5h13M6 10h8M8.5 15h3"/>'),
  sort: s('<path d="M6 4v12M3 13l3 3 3-3M14 16V4M11 7l3-3 3 3"/>'),
  open: s('<path d="M11 3.5h5.5V9M16.5 3.5 9.5 10.5M8 4.5H4.5v11h11V12"/>'),
  user: s('<circle cx="10" cy="7" r="3"/><path d="M4 16.5c1-3 3.3-4.5 6-4.5s5 1.5 6 4.5"/>'),
  calendar: s('<rect x="3" y="4.5" width="14" height="12" rx="1.5"/><path d="M3 8.5h14M7 3v3M13 3v3"/>'),
  hash: s('<path d="M8 3 6 17M14 3l-2 14M3.5 7.5h13M3 12.5h13"/>'),
  list: s('<path d="M8 5.5h9M8 10h9M8 14.5h9"/><circle cx="4" cy="5.5" r=".8" fill="currentColor"/><circle cx="4" cy="10" r=".8" fill="currentColor"/><circle cx="4" cy="14.5" r=".8" fill="currentColor"/>'),
  status: s('<circle cx="10" cy="10" r="6.5" stroke-dasharray="3 2"/><circle cx="10" cy="10" r="2.5" fill="currentColor"/>'),
  checkbox: s('<rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/><path d="m6.5 10 2.5 2.5 4.5-5"/>'),
  refresh: s('<path d="M15.5 8A6 6 0 0 0 4.6 6.5M4.5 12a6 6 0 0 0 10.9 1.5"/><path d="M4.5 3.5v3h3M15.5 16.5v-3h-3"/>'),
  arrowDown: s('<path d="M10 4v12M5 11l5 5 5-5"/>'),
  replace: s('<path d="M4 7h10l-3-3M16 13H6l3 3"/>'),
};

export const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
