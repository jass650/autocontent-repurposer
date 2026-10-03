// App shell: routing, sidebar, top bar, page view, home, search, templates, settings, trash, pickers.
import { api, h, ICONS, popover, closePopover, menuList, toast, timeAgo, formatDate, applyTheme, escapeHtml, blocksToMd, debounce, safeUrl, cssUrl } from './common.js';
import { state, on, loadPages, childrenOf, ancestors, createPage, savePatch, flushSaves, trashPage, restorePage, deleteForever, duplicatePage, isVisible } from './store.js';
import { Editor } from './editor.js';
import { renderDatabase, renderRowProps } from './database.js';
import { openInlineAI, closeInlineAI, renderAIChat, aiOffNotice } from './ai.js';
import { TEMPLATES } from './templates.js';
import { EMOJI } from './emoji.js';

const $ = (id) => document.getElementById(id);
const sidebar = $('sidebar');
const topbar = $('topbar');
const view = $('view');
const scroller = $('mainScroll');
const mobile = matchMedia('(max-width: 800px)');

let editor = null;
let chat = null;
let route = { name: 'boot' };
let expanded = new Set();
try { expanded = new Set(JSON.parse(localStorage.getItem('py-expanded') || '[]')); } catch {}
const saveExpanded = () => { try { localStorage.setItem('py-expanded', JSON.stringify([...expanded])); } catch {} };

// ---------- boot ----------
async function boot() {
  try {
    const me = await api('/me');
    state.me = me.user;
    state.ai = me.ai;
  } catch (e) {
    if (e.status === 401) { location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search); return; }
    view.replaceChildren(h('div', { class: 'empty-state' }, h('h2', { text: 'Can’t reach PumpitYeah' }), h('p', { text: e.message })));
    return;
  }
  applyTheme(state.me.theme);
  await loadPages();
  $('aiFab').innerHTML = ICONS.sparkle;
  $('aiFab').addEventListener('click', () => navigate(`/app/ai${route.name === 'page' ? '?page=' + route.id : ''}`));
  $('scrim').addEventListener('click', () => setSidebar(false));
  try { if (localStorage.getItem('py-sidebar') === 'closed' && !mobile.matches) document.body.classList.add('sb-collapsed'); } catch {}
  if (mobile.matches) document.body.classList.add('sb-collapsed');
  renderSidebar();
  on('pages', () => { renderSidebar(); if (route.name === 'page') renderBreadcrumbs(); });
  on('saving', (busy) => setSaveStatus(busy));
  addEventListener('popstate', () => go());
  document.addEventListener('keydown', globalKeys);
  state.beforeUnload = () => editor?.flush();
  setInterval(() => { if (route.name === 'page') setSaveStatus(false); }, 30_000);
  go();
}

export function navigate(path) {
  if (path === location.pathname + location.search) return;
  history.pushState(null, '', path);
  go();
}
const openPage = (id) => navigate(`/app/p/${id}`);

async function go() {
  closeInlineAI();
  closePopover();
  editor?.destroy(); editor = null;
  chat?.destroy(); chat = null;
  await flushSaves();
  if (mobile.matches) setSidebar(false);
  const path = location.pathname;
  const params = new URLSearchParams(location.search);
  const m = path.match(/^\/app\/p\/([\w-]+)/);
  if (m) { route = { name: 'page', id: m[1] }; await showPage(m[1]); }
  else if (path.startsWith('/app/ai')) { route = { name: 'ai' }; showChat(params.get('page'), params.get('q')); }
  else { route = { name: 'home' }; showHome(); }
  $('aiFab').hidden = route.name === 'ai';
  renderSidebar();
  scroller.scrollTop = 0;
}

function setSidebar(open) {
  document.body.classList.toggle('sb-collapsed', !open);
  $('scrim').hidden = !(open && mobile.matches);
  if (!mobile.matches) { try { localStorage.setItem('py-sidebar', open ? 'open' : 'closed'); } catch {} }
  renderTopbar();
}
const sidebarOpen = () => !document.body.classList.contains('sb-collapsed');

function globalKeys(e) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && (e.key.toLowerCase() === 'k' || e.key.toLowerCase() === 'p') && !e.defaultPrevented) {
    if (e.key.toLowerCase() === 'k' && !getSelection().isCollapsed && document.activeElement?.closest('.editable')) return;
    e.preventDefault(); openSearch();
  }
  if (mod && e.key === '\\') { e.preventDefault(); setSidebar(!sidebarOpen()); }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'l') { e.preventDefault(); toggleDark(); }
  if (mod && e.key.toLowerCase() === 'j') { e.preventDefault(); navigate(`/app/ai${route.name === 'page' ? '?page=' + route.id : ''}`); }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); editor?.flush(); flushSaves(); toast('Saved'); }
}
function toggleDark() {
  const isDark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  setTheme(isDark ? 'light' : 'dark');
}
async function setTheme(theme) {
  applyTheme(theme);
  state.me.theme = theme;
  try { await api('/me', { method: 'PATCH', body: { theme } }); } catch {}
}

// ---------- sidebar ----------
function renderSidebar() {
  const first = (state.me.name || 'My').split(' ')[0];
  const ws = h('button', { class: 'ws-btn', onclick: (e) => workspaceMenu(e.currentTarget) },
    h('span', { class: 'ws-avatar', text: (state.me.name || '?')[0].toUpperCase() }),
    h('span', { class: 'ws-name', text: `${first}’s PumpitYeah` }),
    h('span', { class: 'ws-chev', html: ICONS.chevronDown }));
  const collapse = h('button', { class: 'icon-btn sb-collapse', title: 'Close sidebar (Ctrl+\\)', 'aria-label': 'Close sidebar', html: ICONS.chevronsLeft, onclick: () => setSidebar(false) });
  const newBtn = h('button', { class: 'icon-btn', title: 'New page', 'aria-label': 'New page', html: ICONS.edit, onclick: () => newPage(null) });

  const navItem = (label, icon, onclick, active = false, hint = '', cls = '') => h('button', { class: `sb-item ${active ? 'active' : ''} ${cls}`, onclick },
    h('span', { class: 'sb-icon', html: icon }), h('span', { class: 'sb-label', text: label }), hint ? h('span', { class: 'sb-hint', text: hint }) : null);

  const top = h('div', { class: 'sb-top' }, h('div', { class: 'sb-ws-row' }, ws, collapse, newBtn),
    navItem('Search', ICONS.search, openSearch, false, 'Ctrl K'),
    navItem('Home', ICONS.home, () => navigate('/app'), route.name === 'home'),
    navItem('PumpitYeah AI', ICONS.sparkle, () => navigate('/app/ai'), route.name === 'ai', '', 'sb-ai'));

  const scroll = h('div', { class: 'sb-scroll' });
  const favs = [...state.pages.values()].filter((p) => p.favorite && !p.row && isVisible(p)).sort((a, b) => a.order - b.order);
  if (favs.length) {
    scroll.append(sectionHead('Favorites'));
    favs.forEach((p) => scroll.append(...treeItem(p, 0, 'fav')));
  }
  scroll.append(sectionHead('Private', () => newPage(null)));
  const roots = childrenOf(null);
  roots.forEach((p) => scroll.append(...treeItem(p, 0)));
  if (!roots.length) scroll.append(h('div', { class: 'sb-empty', text: 'No pages yet' }));
  scroll.append(h('button', { class: 'sb-item sb-add', onclick: () => newPage(null) }, h('span', { class: 'sb-icon', html: ICONS.plus }), h('span', { class: 'sb-label', text: 'Add a page' })));

  const bottom = h('div', { class: 'sb-bottom' },
    navItem('Templates', ICONS.template, openTemplates),
    navItem('Trash', ICONS.trash, (e) => openTrash(e.currentTarget)),
    navItem('Settings', ICONS.settings, openSettings));

  sidebar.replaceChildren(top, scroll, bottom);
}
function sectionHead(label, onAdd) {
  return h('div', { class: 'sb-section' }, h('span', { text: label }),
    onAdd ? h('button', { class: 'icon-btn sm', title: `Add a page`, 'aria-label': 'Add a page', html: ICONS.plus, onclick: onAdd }) : null);
}
function treeItem(p, depth, scope = 'tree') {
  const kids = childrenOf(p.id);
  const key = `${scope}:${p.id}`;
  const isOpen = expanded.has(key);
  const active = route.name === 'page' && route.id === p.id;
  const row = h('div', { class: `tree-item ${active ? 'active' : ''}`, style: { paddingLeft: `${8 + depth * 14}px` }, role: 'treeitem', 'aria-expanded': kids.length ? String(isOpen) : null });
  const caret = h('button', { class: `tree-caret ${isOpen ? 'open' : ''}`, 'aria-label': isOpen ? 'Collapse' : 'Expand', html: ICONS.chevronRight, onclick: (e) => {
    e.stopPropagation();
    if (isOpen) expanded.delete(key); else expanded.add(key);
    saveExpanded(); renderSidebar();
  } });
  const icon = h('span', { class: 'tree-icon', text: p.icon || '' });
  if (!p.icon) icon.innerHTML = p.kind === 'database' ? ICONS.table : ICONS.doc;
  const iconWrap = h('span', { class: 'tree-iconwrap' }, icon, caret);
  row.append(iconWrap, h('span', { class: 'tree-title', text: p.title || 'Untitled' }),
    h('span', { class: 'tree-actions' },
      h('button', { class: 'icon-btn sm', title: 'Delete, duplicate, and more…', 'aria-label': 'Page options', html: ICONS.more, onclick: (e) => { e.stopPropagation(); pageMenu(p, e.currentTarget); } }),
      p.kind !== 'database' ? h('button', { class: 'icon-btn sm', title: 'Add a page inside', 'aria-label': 'Add a page inside', html: ICONS.plus, onclick: (e) => { e.stopPropagation(); expanded.add(key); saveExpanded(); newPage(p.id); } }) : null));
  row.addEventListener('click', () => openPage(p.id));
  const out = [row];
  if (isOpen) {
    if (kids.length) kids.forEach((k) => out.push(...treeItem(k, depth + 1, scope)));
    else out.push(h('div', { class: 'tree-empty', style: { paddingLeft: `${30 + depth * 14}px` }, text: p.kind === 'database' ? 'Open to see entries' : 'No pages inside' }));
  }
  return out;
}

function workspaceMenu(anchor) {
  let pop;
  const header = h('div', { class: 'ws-menu-head' }, h('span', { class: 'ws-avatar lg', text: (state.me.name || '?')[0].toUpperCase() }),
    h('div', {}, h('div', { class: 'ws-menu-name', text: state.me.name }), h('div', { class: 'ws-menu-email', text: state.me.email })));
  const list = menuList([
    { label: 'Settings', icon: ICONS.settings, onClick: openSettings },
    { label: 'Toggle dark mode', icon: ICONS.moon, hint: 'Ctrl+Shift+L', onClick: toggleDark },
    { label: 'Templates', icon: ICONS.template, onClick: openTemplates },
    { divider: true },
    { label: 'Log out', icon: ICONS.logout, onClick: logout },
  ], () => pop.close());
  pop = popover(anchor, h('div', {}, header, list), { width: 280 });
}
async function logout() {
  await flushSaves();
  await api('/logout', { method: 'POST' });
  location.href = '/';
}

function pageMenu(p, anchor) {
  let pop;
  pop = popover(anchor, menuList([
    { label: p.favorite ? 'Remove from Favorites' : 'Add to Favorites', icon: p.favorite ? ICONS.starFilled : ICONS.star, onClick: () => toggleFavorite(p.id) },
    { label: 'Copy link', icon: ICONS.link, onClick: () => copyLink(p.id) },
    { label: 'Duplicate', icon: ICONS.duplicate, onClick: async () => { const c = await duplicatePage(p.id); toast('Page duplicated', { action: 'Open', onAction: () => openPage(c.id) }); } },
    { label: 'Rename', icon: ICONS.edit, onClick: () => renamePage(p, anchor) },
    { divider: true },
    { label: 'Move to Trash', icon: ICONS.trash, danger: true, onClick: () => moveToTrash(p.id) },
  ], () => pop.close()), { width: 240 });
}
function renamePage(p, anchor) {
  const input = h('input', { class: 'pop-input', value: p.title || '' });
  const pop = popover(anchor, h('div', { class: 'pop-pad' }, input), { width: 280 });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') pop.close(); });
  input.addEventListener('input', () => { savePatch(p.id, { title: input.value }); if (state.current?.id === p.id) { state.current.title = input.value; const t = view.querySelector('.page-title'); if (t) t.textContent = input.value; } });
  setTimeout(() => { input.focus(); input.select(); }, 0);
}
function toggleFavorite(id) {
  const p = state.pages.get(id);
  savePatch(id, { favorite: !p.favorite });
  toast(p.favorite ? 'Added to Favorites' : 'Removed from Favorites');
  renderTopbar();
}
async function copyLink(id) {
  try { await navigator.clipboard.writeText(`${location.origin}/app/p/${id}`); toast('Link copied to clipboard'); } catch { toast('Couldn’t copy link', { type: 'error' }); }
}
async function moveToTrash(id) {
  const parent = state.pages.get(id)?.parentId;
  await trashPage(id);
  toast('Moved to Trash', { action: 'Undo', onAction: async () => { await restorePage(id); } });
  if (route.name === 'page' && (route.id === id || ancestors(route.id).some((a) => a.id === id))) {
    navigate(parent && isVisible(state.pages.get(parent)) ? `/app/p/${parent}` : '/app');
  }
}
async function newPage(parentId, fields = {}) {
  try {
    const page = await createPage({ parentId, ...fields });
    if (parentId) { expanded.add(`tree:${parentId}`); saveExpanded(); }
    openPage(page.id);
    return page;
  } catch (e) { toast(e.message, { type: 'error' }); }
}

// ---------- top bar ----------
let saveLabel = null;
function renderTopbar() {
  const left = h('div', { class: 'tb-left' });
  if (!sidebarOpen()) left.append(h('button', { class: 'icon-btn', 'aria-label': 'Open sidebar', title: 'Open sidebar (Ctrl+\\)', html: ICONS.menu, onclick: () => setSidebar(true) }));
  const crumbs = h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' });
  left.append(crumbs);
  const right = h('div', { class: 'tb-right' });
  topbar.replaceChildren(left, right);
  if (route.name === 'page' && state.current) {
    const p = state.pages.get(route.id) || state.current;
    saveLabel = h('span', { class: 'save-label' });
    right.append(saveLabel,
      h('button', { class: 'btn btn-ghost btn-sm tb-share', text: 'Share', onclick: (e) => openShare(e.currentTarget) }),
      h('button', { class: 'icon-btn', title: 'Ask AI about this page', 'aria-label': 'Ask AI about this page', html: ICONS.sparkle, onclick: () => navigate(`/app/ai?page=${route.id}`) }),
      h('button', { class: 'icon-btn', title: p.favorite ? 'Remove from Favorites' : 'Add to Favorites', 'aria-label': 'Favorite', 'aria-pressed': String(!!p.favorite), html: p.favorite ? ICONS.starFilled : ICONS.star, onclick: () => toggleFavorite(route.id) }),
      h('button', { class: 'icon-btn', title: 'Style, export, and more…', 'aria-label': 'More', html: ICONS.more, onclick: (e) => moreMenu(e.currentTarget) }));
    renderBreadcrumbs();
    setSaveStatus(false);
  } else {
    crumbs.append(h('span', { class: 'crumb static', html: route.name === 'ai' ? `${ICONS.sparkle}<span>PumpitYeah AI</span>` : `${ICONS.home}<span>Home</span>` }));
  }
}
function renderBreadcrumbs() {
  const crumbs = topbar.querySelector('.crumbs');
  if (!crumbs || route.name !== 'page') return;
  crumbs.replaceChildren();
  let chain = ancestors(route.id);
  if (!chain.length && state.current) chain = [state.current];
  if (chain.length > 3) chain = [chain[0], { ellipsis: true }, ...chain.slice(-2)];
  chain.forEach((p, i) => {
    if (i) crumbs.append(h('span', { class: 'crumb-sep', text: '/' }));
    if (p.ellipsis) { crumbs.append(h('span', { class: 'crumb static', text: '…' })); return; }
    crumbs.append(h('button', { class: 'crumb', onclick: () => openPage(p.id) }, p.icon ? h('span', { class: 'crumb-icon', text: p.icon }) : null, h('span', { class: 'crumb-text', text: p.title || 'Untitled' })));
  });
}
function setSaveStatus(busy) {
  if (!saveLabel || !state.current) return;
  const meta = state.pages.get(state.current.id);
  saveLabel.textContent = busy ? 'Saving…' : `Edited ${timeAgo(meta?.updatedAt || state.current.updatedAt)}`;
}

function openShare(anchor) {
  const p = state.pages.get(route.id);
  const url = `${location.origin}/p/${route.id}`;
  const box = h('div', { class: 'share-pop' });
  const draw = () => {
    box.replaceChildren(
      h('div', { class: 'share-tabs' }, h('span', { class: 'share-tab active', text: 'Publish' })),
      h('div', { class: 'share-row' },
        h('div', { class: 'share-globe', html: ICONS.globe }),
        h('div', { class: 'share-copy' }, h('b', { text: p.published ? 'Published to the web' : 'Publish to the web' }),
          h('span', { text: p.published ? 'Anyone with the link can view this page.' : 'Create a public, read-only page anyone can view.' })),
        h('button', { class: `switch ${p.published ? 'on' : ''}`, role: 'switch', 'aria-checked': String(!!p.published), 'aria-label': 'Publish to web', onclick: async () => {
          savePatch(route.id, { published: !p.published }, { immediate: true });
          draw();
        } }, h('span'))),
      p.published ? h('div', { class: 'share-link' },
        h('input', { class: 'pop-input', readonly: true, value: url, onclick: (e) => e.target.select() }),
        h('button', { class: 'btn btn-primary btn-sm', text: 'Copy', onclick: async () => { await navigator.clipboard.writeText(url); toast('Public link copied'); } })) : null,
      p.published ? h('a', { class: 'share-view', href: url, target: '_blank', rel: 'noopener', html: `${ICONS.open}<span>View published page</span>` }) : null,
      h('div', { class: 'menu-divider' }),
      h('button', { class: 'menu-item', onclick: () => copyLink(route.id) }, h('span', { class: 'menu-icon', html: ICONS.link }), h('span', { class: 'menu-label', text: 'Copy private link' })));
  };
  draw();
  popover(anchor, box, { width: 360, align: 'end' });
}
function moreMenu(anchor) {
  const page = state.current;
  let pop;
  const fontBtn = (font, label, sample) => h('button', { class: `font-opt ${(page.font || 'default') === font ? 'active' : ''}`, onclick: () => {
    page.font = font; savePatch(page.id, { font }); applyPageStyle(); pop.close();
  } }, h('span', { class: `font-sample f-${font}`, text: sample }), h('span', { text: label }));
  const toggleRow = (label, key) => h('button', { class: 'menu-item', onclick: () => { page[key] = !page[key]; savePatch(page.id, { [key]: page[key] }); applyPageStyle(); pop.close(); } },
    h('span', { class: 'menu-label', text: label }), h('span', { class: `switch sm ${page[key] ? 'on' : ''}` }, h('span')));
  const box = h('div', {},
    h('div', { class: 'menu-header', text: 'Style' }),
    h('div', { class: 'font-row' }, fontBtn('default', 'Default', 'Ag'), fontBtn('serif', 'Serif', 'Ag'), fontBtn('mono', 'Mono', 'Ag')),
    toggleRow('Small text', 'smallText'), toggleRow('Full width', 'fullWidth'),
    menuList([
      { divider: true },
      { label: 'Copy link', icon: ICONS.link, onClick: () => copyLink(page.id) },
      { label: 'Duplicate', icon: ICONS.duplicate, onClick: async () => { const c = await duplicatePage(page.id); openPage(c.id); } },
      { label: 'Export as Markdown', icon: ICONS.download, onClick: exportMarkdown },
      { label: 'Move to Trash', icon: ICONS.trash, danger: true, onClick: () => moveToTrash(page.id) },
    ], () => pop.close()),
    h('div', { class: 'menu-foot', text: `Last edited ${timeAgo(state.pages.get(page.id)?.updatedAt || page.updatedAt)} · ${countWords(page)} words` }));
  pop = popover(anchor, box, { width: 260, align: 'end' });
}
function countWords(page) {
  return blocksToMd(page.blocks || []).split(/\s+/).filter((w) => /\w/.test(w)).length;
}
function exportMarkdown() {
  const page = state.current;
  const titles = Object.fromEntries([...state.pages.values()].map((p) => [p.id, p.title || 'Untitled']));
  let md = `# ${page.title || 'Untitled'}\n\n`;
  if (page.kind === 'database') {
    const cols = ['Name', ...page.schema.map((s) => s.name)];
    md += `| ${cols.join(' | ')} |\n| ${cols.map(() => '---').join(' | ')} |\n`;
    for (const r of page.rows) md += `| ${[r.title || 'Untitled', ...page.schema.map((s) => [].concat(r.props[s.id] ?? '').join(', '))].join(' | ')} |\n`;
  } else md += blocksToMd(page.blocks, titles);
  const a = h('a', { href: URL.createObjectURL(new Blob([md], { type: 'text/markdown' })), download: `${(page.title || 'Untitled').replace(/[\\/:*?"<>|]/g, '')}.md` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- page view ----------
async function showPage(id) {
  state.current = null;
  renderTopbar();
  view.replaceChildren(skeleton());
  let page;
  try {
    page = (await api(`/pages/${id}`)).page;
  } catch (e) {
    if (route.id !== id) return;
    view.replaceChildren(h('div', { class: 'empty-state' },
      h('div', { class: 'empty-emoji', text: '🔍' }), h('h2', { text: 'This page couldn’t be found' }),
      h('p', { text: e.status === 404 ? 'It may have been deleted permanently.' : e.message }),
      h('button', { class: 'btn btn-primary', text: 'Back to Home', onclick: () => navigate('/app') })));
    return;
  }
  if (route.id !== id) return; // navigated away while loading
  state.current = page;
  page.blocks = page.blocks || [];
  document.title = `${page.icon ? page.icon + ' ' : ''}${page.title || 'Untitled'} – PumpitYeah`;
  try {
    const recent = JSON.parse(localStorage.getItem('py-recent') || '[]').filter((x) => x !== id);
    localStorage.setItem('py-recent', JSON.stringify([id, ...recent].slice(0, 12)));
  } catch {}

  const root = h('div', { class: 'page' });
  const meta = state.pages.get(id);
  if (meta?.trashed || (meta && !isVisible(meta))) {
    root.append(h('div', { class: 'trash-banner' }, h('span', { text: 'This page is in Trash.' }),
      h('button', { class: 'btn btn-outline btn-sm', text: 'Restore page', onclick: async () => { await restorePage(id); go(); } }),
      h('button', { class: 'btn btn-danger btn-sm', text: 'Delete from Trash', onclick: async () => { if (confirm('Permanently delete this page and everything inside it?')) { await deleteForever(id); navigate('/app'); } } })));
  }
  const coverEl = h('div', { class: 'cover' });
  const inner = h('div', { class: 'page-inner' });
  const head = h('div', { class: 'page-head' });
  const iconEl = h('button', { class: 'page-icon', 'aria-label': 'Change icon' });
  const controls = h('div', { class: 'page-controls' });
  const title = h('h1', { class: 'page-title', contenteditable: 'true', spellcheck: 'true', 'data-placeholder': 'Untitled' });
  title.textContent = page.title || '';

  const drawCover = () => {
    coverEl.className = 'cover';
    coverEl.style.backgroundImage = '';
    coverEl.replaceChildren();
    coverEl.hidden = !page.cover;
    root.classList.toggle('has-cover', !!page.cover);
    if (!page.cover) return;
    const [kind, val] = page.cover.includes(':') && !/^(https?|data):/.test(page.cover) ? page.cover.split(':') : ['url', page.cover];
    if (kind === 'url') coverEl.style.backgroundImage = cssUrl(page.cover);
    else coverEl.classList.add(`cover-${kind}-${val}`);
    coverEl.append(h('div', { class: 'cover-tools' },
      h('button', { text: 'Change cover', onclick: (e) => coverPicker(e.currentTarget, (c) => { page.cover = c; savePatch(id, { cover: c }); drawCover(); drawControls(); }) }),
      h('button', { text: 'Remove', onclick: () => { page.cover = ''; savePatch(id, { cover: '' }); drawCover(); drawControls(); } })));
  };
  const drawIcon = () => {
    iconEl.textContent = page.icon || '';
    iconEl.hidden = !page.icon;
    head.classList.toggle('has-icon', !!page.icon);
  };
  const setIcon = (emoji) => { page.icon = emoji; savePatch(id, { icon: emoji }); drawIcon(); drawControls(); renderBreadcrumbs(); };
  iconEl.addEventListener('click', () => emojiPicker(iconEl, setIcon, true));
  const drawControls = () => {
    controls.replaceChildren();
    if (!page.icon) controls.append(h('button', { class: 'ctrl-btn', html: `${ICONS.smile}<span>Add icon</span>`, onclick: () => setIcon(EMOJI[Math.floor(Math.random() * 40)][0]) }));
    if (!page.cover) controls.append(h('button', { class: 'ctrl-btn', html: `${ICONS.image}<span>Add cover</span>`, onclick: () => { const g = ['sunrise', 'ocean', 'forest', 'peach', 'mint', 'candy']; page.cover = `gradient:${g[Math.floor(Math.random() * g.length)]}`; savePatch(id, { cover: page.cover }); drawCover(); drawControls(); } }));
    if (page.kind !== 'database' && state.ai.enabled !== undefined) controls.append(h('button', { class: 'ctrl-btn', html: `${ICONS.sparkle}<span>Ask AI</span>`, onclick: () => navigate(`/app/ai?page=${id}`) }));
  };
  drawCover(); drawIcon(); drawControls();

  title.addEventListener('input', () => {
    if (!title.textContent && title.innerHTML) title.innerHTML = '';
    page.title = title.textContent;
    savePatch(id, { title: page.title });
    document.title = `${page.title || 'Untitled'} – PumpitYeah`;
  });
  title.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain').replace(/\n/g, ' ')); });
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || (e.key === 'ArrowDown')) {
      if (e.key === 'Enter') e.preventDefault();
      if (editor) { e.preventDefault(); editor.blocks.length ? editor.focusStart() : startEmpty(); }
    }
  });

  head.append(iconEl, controls, title);
  inner.append(head);

  if (page.row && page.dbSchema?.length) {
    const props = h('div', { class: 'row-props' });
    renderRowProps(props, page, page.dbSchema, {
      saveRow: (patch) => savePatch(id, patch),
      saveSchema: (schema) => savePatch(page.parentId, { schema }),
    });
    inner.append(props, h('div', { class: 'row-props-sep' }));
  }

  if (page.kind === 'database') {
    const dbEl = h('div', { class: 'database' });
    inner.append(dbEl);
    renderDatabase(dbEl, page, {
      navigate: openPage,
      save: (patch) => savePatch(id, patch),
      saveRow: (rid, patch) => savePatch(rid, patch),
      createRow: (props) => createPage({ parentId: id, row: true, props }),
      trashRow: (rid) => trashPage(rid),
      restoreRow: (rid) => restorePage(rid),
    });
  } else {
    const edEl = h('div');
    const quick = h('div', { class: 'quick-start' });
    inner.append(edEl, quick);
    editor = new Editor(edEl, page.blocks, {
      onChange: (blocks) => { savePatch(id, { blocks }); quick.hidden = blocks.length > 0; },
      onAI: (opts) => openInlineAI({ editor, page }, opts),
      createSubpage: async (kind) => {
        const child = await createPage({ parentId: id, kind: kind === 'page' ? 'page' : 'database', view: kind === 'board' ? 'board' : 'table', title: kind === 'page' ? '' : 'Untitled database' });
        expanded.add(`tree:${id}`); saveExpanded();
        return child.id;
      },
      navigate: openPage,
      pageMeta: (pid) => { const m = state.pages.get(pid); return m && isVisible(m) ? m : null; },
      pickEmoji: (anchor, cb) => emojiPicker(anchor, cb, false),
    });
    const startEmpty = () => { quick.hidden = true; editor.focusEndOrAppend(); };
    const drawQuick = () => {
      quick.hidden = page.blocks.length > 0;
      quick.replaceChildren(
        h('p', { class: 'qs-hint', text: 'Press Enter to continue with an empty page, or pick a starting point:' }),
        h('button', { class: 'qs-item', onclick: startEmpty }, h('span', { html: ICONS.doc }), h('span', { text: 'Empty page' })),
        h('button', { class: 'qs-item ai', onclick: () => { startEmpty(); openInlineAI({ editor, page }, { anchorId: page.blocks[0]?.id, selection: '', selectedIds: [] }); } }, h('span', { html: ICONS.sparkle }), h('span', { text: 'Start writing with AI' })),
        h('div', { class: 'qs-label', text: 'Add new' }),
        h('button', { class: 'qs-item', onclick: () => convertToDatabase('table') }, h('span', { html: ICONS.table }), h('span', { text: 'Table' })),
        h('button', { class: 'qs-item', onclick: () => convertToDatabase('board') }, h('span', { html: ICONS.board }), h('span', { text: 'Board' })),
        h('button', { class: 'qs-item', onclick: openTemplates }, h('span', { html: ICONS.template }), h('span', { text: 'Templates' })));
    };
    const convertToDatabase = async (v) => {
      await flushSaves();
      try {
        await api(`/pages/${id}`, { method: 'PATCH', body: { kind: 'database', view: v, title: page.title || 'Untitled database', schema: [
          { id: 'status', name: 'Status', type: 'status', options: [{ name: 'Not started', color: 'gray' }, { name: 'In progress', color: 'blue' }, { name: 'Done', color: 'green' }] },
          { id: 'date', name: 'Date', type: 'date' },
        ] } });
        await loadPages();
        go();
      } catch (e) { toast(e.message, { type: 'error' }); }
    };
    drawQuick();
    const pad = h('div', { class: 'page-bottom', onclick: () => editor.focusEndOrAppend() });
    inner.append(pad);
  }
  root.append(coverEl, inner);
  view.replaceChildren(root);
  applyPageStyle();
  renderTopbar();
  if (!page.title && !page.blocks.length && page.kind !== 'database') title.focus();
}
function applyPageStyle() {
  const p = state.current;
  const root = view.querySelector('.page');
  if (!p || !root) return;
  root.classList.toggle('full-width', !!p.fullWidth);
  root.classList.toggle('small-text', !!p.smallText);
  root.dataset.font = p.font || 'default';
}
function skeleton() {
  return h('div', { class: 'page' }, h('div', { class: 'page-inner skeleton' },
    h('div', { class: 'sk sk-title' }), h('div', { class: 'sk' }), h('div', { class: 'sk short' }), h('div', { class: 'sk' }), h('div', { class: 'sk shorter' })));
}

// ---------- pickers ----------
function emojiPicker(anchor, onPick, allowRemove) {
  let pop;
  const search = h('input', { class: 'pop-input', placeholder: 'Filter…', 'aria-label': 'Filter emoji' });
  const grid = h('div', { class: 'emoji-grid' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    grid.replaceChildren(...EMOJI.filter(([, k]) => !q || k.includes(q)).map(([e]) => h('button', { class: 'emoji-btn', text: e, 'aria-label': e, onclick: () => { onPick(e); pop.close(); } })));
    if (!grid.childNodes.length) grid.append(h('div', { class: 'muted pad', text: 'No emoji found' }));
  };
  search.addEventListener('input', draw);
  draw();
  const head = h('div', { class: 'emoji-head' }, h('span', { class: 'emoji-tab', text: 'Emoji' }), h('span', { class: 'spacer' }),
    h('button', { class: 'btn btn-ghost btn-sm', text: 'Random', onclick: () => { onPick(EMOJI[Math.floor(Math.random() * EMOJI.length)][0]); pop.close(); } }),
    allowRemove ? h('button', { class: 'btn btn-ghost btn-sm', text: 'Remove', onclick: () => { onPick(''); pop.close(); } }) : null);
  pop = popover(anchor, h('div', { class: 'emoji-pop' }, head, h('div', { class: 'pop-pad' }, search), grid), { width: 360 });
  setTimeout(() => search.focus(), 0);
}
function coverPicker(anchor, onPick) {
  let pop;
  const swatch = (value, cls) => h('button', { class: `cover-swatch ${cls}`, 'aria-label': value, onclick: () => { onPick(value); pop.close(); } });
  const gradients = ['sunrise', 'ocean', 'forest', 'peach', 'mint', 'candy', 'night', 'paper'];
  const solids = ['red', 'yellow', 'blue', 'green'];
  const url = h('input', { class: 'pop-input', placeholder: 'Paste an image link…', type: 'url' });
  const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
  file.addEventListener('change', async () => {
    const f = file.files[0]; if (!f) return;
    const img = await createImageBitmap(f);
    const scale = Math.min(1, 2000 / img.width);
    const c = h('canvas', { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    onPick(c.toDataURL('image/jpeg', 0.82));
    pop.close();
  });
  const box = h('div', { class: 'cover-pop' },
    h('div', { class: 'menu-header', text: 'Gradients' }), h('div', { class: 'cover-grid' }, gradients.map((g) => swatch(`gradient:${g}`, `cover-gradient-${g}`))),
    h('div', { class: 'menu-header', text: 'Colors' }), h('div', { class: 'cover-grid' }, solids.map((s) => swatch(`solid:${s}`, `cover-solid-${s}`))),
    h('div', { class: 'menu-header', text: 'Image' }),
    h('div', { class: 'pop-pad pop-row' }, url, h('button', { class: 'btn btn-primary btn-sm', text: 'Use', onclick: () => { if (safeUrl(url.value.trim())) { onPick(url.value.trim()); pop.close(); } else toast('Enter a valid image URL', { type: 'error' }); } })),
    h('div', { class: 'pop-pad' }, h('button', { class: 'btn btn-outline btn-sm', text: 'Upload an image', onclick: () => file.click() }), file));
  pop = popover(anchor, box, { width: 380, align: 'end' });
}

// ---------- home ----------
async function showHome() {
  state.current = null;
  document.title = 'Home – PumpitYeah';
  renderTopbar();
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Good evening' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const first = (state.me.name || '').split(' ')[0];
  const recentRow = h('div', { class: 'home-cards' }, ...Array.from({ length: 4 }, () => h('div', { class: 'home-card sk-card' })));
  const tasksBox = h('div', { class: 'home-tasks' }, h('div', { class: 'sk' }), h('div', { class: 'sk short' }));
  const aiInput = h('input', { class: 'home-ai-input', placeholder: 'Ask AI anything about your workspace…', 'aria-label': 'Ask AI' });
  aiInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && aiInput.value.trim()) navigate(`/app/ai?q=${encodeURIComponent(aiInput.value.trim())}`); });
  const home = h('div', { class: 'home' },
    h('h1', { class: 'home-greet', text: `${greet}, ${first}` }),
    h('div', { class: 'home-ai' }, h('span', { class: 'home-ai-icon', html: ICONS.sparkle }), aiInput,
      h('button', { class: 'btn btn-primary btn-sm', text: 'Ask', onclick: () => aiInput.value.trim() && navigate(`/app/ai?q=${encodeURIComponent(aiInput.value.trim())}`) })),
    h('section', {}, h('h2', { class: 'home-h', html: `${ICONS.clock}<span>Recently visited</span>` }), recentRow),
    h('div', { class: 'home-grid' },
      h('section', {}, h('h2', { class: 'home-h', html: `${ICONS.calendar}<span>Upcoming tasks</span>` }), tasksBox),
      h('section', {}, h('h2', { class: 'home-h', html: `${ICONS.template}<span>Start from a template</span>` }),
        h('div', { class: 'home-tpls' }, TEMPLATES.slice(0, 4).map((t) => h('button', { class: 'home-tpl', onclick: () => useTemplate(t) },
          h('span', { class: 'ht-icon', text: t.icon }), h('span', {}, h('b', { text: t.name }), h('small', { text: t.desc }))))))));
  view.replaceChildren(home);
  try {
    const data = await api('/home');
    if (route.name !== 'home') return;
    let recentIds = [];
    try { recentIds = JSON.parse(localStorage.getItem('py-recent') || '[]'); } catch {}
    const byId = new Map(data.recent.map((p) => [p.id, p]));
    const ordered = [...recentIds.map((id) => state.pages.get(id)).filter((p) => p && isVisible(p) && !p.row), ...data.recent]
      .filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i).slice(0, 8);
    recentRow.replaceChildren(...ordered.map((p) => {
      const cover = byId.get(p.id)?.cover || '';
      const cv = h('div', { class: 'hc-cover' });
      if (cover.startsWith('gradient:') || cover.startsWith('solid:')) cv.classList.add(`cover-${cover.replace(':', '-')}`);
      else if (cover) cv.style.backgroundImage = cssUrl(cover);
      return h('button', { class: 'home-card', onclick: () => openPage(p.id) }, cv,
        h('span', { class: 'hc-icon', text: p.icon || (p.kind === 'database' ? '🗂️' : '📄') }),
        h('span', { class: 'hc-title', text: p.title || 'Untitled' }),
        h('span', { class: 'hc-time', text: timeAgo(p.updatedAt) }));
    }));
    if (!ordered.length) recentRow.replaceChildren(h('div', { class: 'muted', text: 'Pages you visit will show up here.' }));
    tasksBox.replaceChildren(...(data.tasks.length ? data.tasks.map((t) => {
      const overdue = t.due < new Date().toISOString().slice(0, 10);
      return h('button', { class: 'task-row', onclick: () => openPage(t.id) },
        h('span', { class: 'task-title', text: t.title || 'Untitled' }),
        h('span', { class: `tag c-${t.color}` }, h('span', { class: 'status-dot' }), t.status || 'No status'),
        h('span', { class: `task-due ${overdue ? 'overdue' : ''}`, text: formatDate(t.due) }),
        h('span', { class: 'task-db', text: `${t.dbIcon || ''} ${t.db}` }));
    }) : [h('div', { class: 'home-empty' }, h('span', { text: '🎉' }), h('span', { text: 'Nothing due. Add dates to tasks in any database to see them here.' }))]));
  } catch (e) { tasksBox.replaceChildren(h('div', { class: 'muted', text: e.message })); }
}

// ---------- AI chat ----------
function showChat(pageId, q) {
  state.current = null;
  document.title = 'PumpitYeah AI';
  renderTopbar();
  const wrap = h('div', { class: 'chat-wrap' });
  view.replaceChildren(wrap);
  chat = renderAIChat(wrap, {
    navigate: openPage,
    contextPageId: pageId,
    initialPrompt: q,
    createPageFromBlocks: async (title, blocks) => (await createPage({ title, icon: '✨', blocks })).id,
  });
  if (q) history.replaceState(null, '', '/app/ai' + (pageId ? `?page=${pageId}` : ''));
}

// ---------- modals ----------
function modal(content, { className = '', onClose } = {}) {
  const dlg = h('dialog', { class: `modal ${className}` });
  dlg.append(content);
  document.body.append(dlg);
  dlg.addEventListener('close', () => { dlg.remove(); onClose?.(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.showModal();
  return dlg;
}

function openSearch() {
  closePopover();
  if (document.querySelector('dialog.search-modal')) return;
  const input = h('input', { class: 'search-input', placeholder: `Search or ask AI in ${(state.me.name || '').split(' ')[0]}’s PumpitYeah…`, 'aria-label': 'Search', autocomplete: 'off' });
  const list = h('div', { class: 'search-list', role: 'listbox' });
  let items = [];
  let index = 0;
  const dlg = modal(h('div', { class: 'search-box' },
    h('div', { class: 'search-head' }, h('span', { html: ICONS.search }), input),
    list,
    h('div', { class: 'search-foot' }, h('span', { html: '<kbd>↑</kbd><kbd>↓</kbd> Select' }), h('span', { html: '<kbd>Enter</kbd> Open' }), h('span', { html: '<kbd>Esc</kbd> Close' }))), { className: 'search-modal' });
  const draw = () => {
    list.replaceChildren();
    if (!items.length) { list.append(h('div', { class: 'search-empty', text: 'No results' })); return; }
    let lastGroup = '';
    items.forEach((it, i) => {
      if (it.group !== lastGroup) { lastGroup = it.group; list.append(h('div', { class: 'search-group', text: it.group })); }
      const el = h('button', { class: `search-item ${i === index ? 'active' : ''} ${it.ai ? 'ai' : ''}`, role: 'option', 'aria-selected': String(i === index), onclick: () => choose(i), onmousemove: () => { if (index !== i) { index = i; draw(); } } },
        h('span', { class: 'si-icon', html: it.ai ? ICONS.sparkle : '', text: it.ai ? undefined : (it.icon || '') }),
        h('span', { class: 'si-main' }, h('span', { class: 'si-title', html: it.titleHtml }), it.snippet ? h('span', { class: 'si-snip', text: it.snippet }) : null),
        it.parent ? h('span', { class: 'si-parent', text: it.parent }) : null);
      if (!it.ai && !it.icon) el.querySelector('.si-icon').innerHTML = it.kind === 'database' ? ICONS.table : ICONS.doc;
      list.append(el);
    });
    list.querySelector('.active')?.scrollIntoView({ block: 'nearest' });
  };
  const choose = (i) => {
    const it = items[i];
    if (!it) return;
    dlg.close();
    if (it.ai) navigate(`/app/ai?q=${encodeURIComponent(it.q)}`);
    else openPage(it.id);
  };
  const highlight = (text, q) => {
    const safe = escapeHtml(text);
    if (!q) return safe;
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? safe : escapeHtml(text.slice(0, i)) + '<mark>' + escapeHtml(text.slice(i, i + q.length)) + '</mark>' + escapeHtml(text.slice(i + q.length));
  };
  const search = debounce(async () => {
    const q = input.value.trim();
    try {
      const { results } = await api(`/search?q=${encodeURIComponent(q)}`);
      items = [];
      if (q) items.push({ ai: true, q, group: 'PumpitYeah AI', titleHtml: `Ask AI: <b>“${escapeHtml(q)}”</b>` });
      items.push(...results.map((r) => ({ ...r, group: q ? 'Pages' : 'Recent', titleHtml: highlight(r.title, q), parent: r.parentTitle })));
      index = 0;
      draw();
    } catch (e) { list.replaceChildren(h('div', { class: 'search-empty', text: e.message })); }
  }, 120);
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); index = Math.min(items.length - 1, index + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); index = Math.max(0, index - 1); draw(); }
    if (e.key === 'Enter') { e.preventDefault(); choose(index); }
  });
  search.flush();
  input.focus();
}

function openTemplates() {
  closePopover();
  let cat = 'All';
  const grid = h('div', { class: 'tpl-grid' });
  const chips = h('div', { class: 'tpl-chips' });
  const draw = () => {
    chips.replaceChildren(...['All', 'Work', 'Personal'].map((c) => h('button', { class: `chip ${c === cat ? 'active' : ''}`, text: c, onclick: () => { cat = c; draw(); } })));
    grid.replaceChildren(...TEMPLATES.filter((t) => cat === 'All' || t.category === cat).map((t) => h('button', { class: 'tpl-card', onclick: () => { dlg.close(); useTemplate(t); } },
      h('span', { class: 'tpl-icon', text: t.icon }), h('b', { text: t.name }), h('small', { text: t.desc }), h('span', { class: 'tpl-use', text: 'Use template →' }))));
  };
  draw();
  const dlg = modal(h('div', { class: 'tpl-modal' },
    h('div', { class: 'modal-head' }, h('h2', { text: 'Templates' }), h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.x, onclick: () => dlg.close() })),
    h('p', { class: 'muted', text: 'Get a head start. Every template is fully editable.' }), chips, grid), { className: 'wide' });
}
async function useTemplate(t) {
  try {
    const def = t.build();
    const { rows, ...fields } = def;
    const page = await createPage({ parentId: null, ...fields });
    if (rows?.length) {
      let order = 0;
      for (const r of rows) await createPage({ parentId: page.id, row: true, order: order++, ...r });
    }
    toast(`Created “${def.title}”`);
    openPage(page.id);
  } catch (e) { toast(e.message, { type: 'error' }); }
}

function openTrash(anchor) {
  const search = h('input', { class: 'pop-input', placeholder: 'Filter by page title…', 'aria-label': 'Filter trash' });
  const list = h('div', { class: 'trash-list' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const items = [...state.pages.values()].filter((p) => p.trashed && (!q || (p.title || 'untitled').toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    list.replaceChildren(...items.map((p) => h('div', { class: 'trash-item' },
      h('button', { class: 'trash-open', onclick: () => { closePopover(); openPage(p.id); } }, h('span', { text: p.icon || '📄' }), h('span', { class: 'trash-title', text: p.title || 'Untitled' })),
      h('button', { class: 'icon-btn sm', title: 'Restore', 'aria-label': 'Restore', html: ICONS.restore, onclick: async () => { await restorePage(p.id); toast('Restored'); draw(); } }),
      h('button', { class: 'icon-btn sm', title: 'Delete permanently', 'aria-label': 'Delete permanently', html: ICONS.trash, onclick: async () => {
        if (!confirm(`Permanently delete “${p.title || 'Untitled'}”? This can’t be undone.`)) return;
        await deleteForever(p.id); draw();
      } }))));
    if (!items.length) list.append(h('div', { class: 'trash-empty' }, h('div', { text: '🗑️' }), h('div', { text: q ? 'No matches' : 'Trash is empty' })));
  };
  search.addEventListener('input', draw);
  draw();
  popover(anchor, h('div', { class: 'trash-pop' }, h('div', { class: 'pop-pad' }, search), list,
    h('div', { class: 'menu-foot', text: 'Pages in Trash can be restored any time.' })), { width: 360, place: 'above' });
  setTimeout(() => search.focus(), 0);
}

function openSettings() {
  closePopover();
  const name = h('input', { class: 'field-input', value: state.me.name, 'aria-label': 'Name' });
  name.addEventListener('change', async () => {
    try { const { user } = await api('/me', { method: 'PATCH', body: { name: name.value } }); state.me = user; renderSidebar(); toast('Name updated'); } catch (e) { toast(e.message, { type: 'error' }); }
  });
  const theme = h('select', { class: 'field-input', 'aria-label': 'Appearance' },
    ['system', 'light', 'dark'].map((t) => h('option', { value: t, selected: (state.me.theme || 'system') === t, text: t === 'system' ? 'Use system setting' : t[0].toUpperCase() + t.slice(1) })));
  theme.addEventListener('change', () => setTheme(theme.value));
  const shortcuts = [
    ['Ctrl/⌘ + K', 'Search'], ['Ctrl/⌘ + J', 'PumpitYeah AI'], ['Ctrl/⌘ + \\', 'Toggle sidebar'], ['Ctrl/⌘ + Shift + L', 'Dark mode'],
    ['/', 'Insert a block'], ['Space (empty line)', 'Ask AI to write'], ['Ctrl/⌘ + B / I / U', 'Bold / italic / underline'], ['Ctrl/⌘ + E', 'Inline code'],
    ['Ctrl/⌘ + D', 'Duplicate block'], ['Alt + Shift + ↑/↓', 'Move block'],
  ];
  const dlg = modal(h('div', { class: 'settings' },
    h('div', { class: 'modal-head' }, h('h2', { text: 'Settings' }), h('button', { class: 'icon-btn', 'aria-label': 'Close', html: ICONS.x, onclick: () => dlg.close() })),
    h('section', {}, h('h3', { text: 'My account' }),
      h('label', { class: 'field' }, h('span', { text: 'Preferred name' }), name),
      h('div', { class: 'field' }, h('span', { text: 'Email' }), h('div', { class: 'field-static', text: state.me.email }))),
    h('section', {}, h('h3', { text: 'Appearance' }), h('label', { class: 'field' }, h('span', { text: 'Theme' }), theme)),
    h('section', {}, h('h3', { text: 'PumpitYeah AI' }),
      state.ai.enabled
        ? h('div', { class: 'ai-on' }, h('span', { class: 'dot-on' }), h('span', { html: `Connected · model <code>${escapeHtml(state.ai.model)}</code>` }))
        : aiOffNotice()),
    h('section', {}, h('h3', { text: 'Keyboard shortcuts' }),
      h('div', { class: 'shortcuts' }, shortcuts.map(([k, v]) => h('div', { class: 'sc' }, h('kbd', { text: k }), h('span', { text: v }))))),
    h('div', { class: 'settings-foot' }, h('button', { class: 'btn btn-outline', html: `${ICONS.logout}<span>Log out</span>`, onclick: logout }))), { className: 'medium' });
}

boot();
