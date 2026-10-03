// App state + persistence. Pages metadata lives in state.pages; the open page's full content in state.current.
import { api, toast } from './common.js';

export const state = {
  me: null,
  ai: { enabled: false, model: '' },
  pages: new Map(), // id -> meta
  current: null,
};

const bus = new EventTarget();
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));

export async function loadPages() {
  const { pages } = await api('/pages');
  state.pages = new Map(pages.map((p) => [p.id, p]));
  emit('pages');
}

export function isVisible(p) {
  let cur = p;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    if (cur.trashed) return false;
    seen.add(cur.id);
    cur = cur.parentId ? state.pages.get(cur.parentId) : null;
  }
  return true;
}
export function childrenOf(parentId) {
  return [...state.pages.values()]
    .filter((p) => p.parentId === parentId && !p.trashed && !p.row)
    .sort((a, b) => a.order - b.order || a.createdAt - b.createdAt);
}
export function ancestors(id) {
  const out = [];
  let p = state.pages.get(id);
  const seen = new Set();
  while (p && !seen.has(p.id)) { out.unshift(p); seen.add(p.id); p = p.parentId ? state.pages.get(p.parentId) : null; }
  return out;
}

export async function createPage(fields = {}) {
  const { page } = await api('/pages', { method: 'POST', body: fields });
  state.pages.set(page.id, metaFrom(page));
  emit('pages');
  return page;
}
const metaFrom = (p) => ({
  id: p.id, parentId: p.parentId, title: p.title, icon: p.icon, kind: p.kind, row: !!p.row,
  favorite: !!p.favorite, trashed: !!p.trashed, published: !!p.published, createdAt: p.createdAt, updatedAt: p.updatedAt, order: p.order || 0,
});

// ---- debounced saving ----
const pending = new Map(); // id -> patch
let timer = null;
let inflight = 0;
export function savePatch(id, patch, { immediate = false } = {}) {
  pending.set(id, { ...(pending.get(id) || {}), ...patch });
  const meta = state.pages.get(id);
  if (meta) {
    let metaChanged = false;
    for (const k of ['title', 'icon', 'favorite', 'published', 'parentId', 'order']) {
      if (k in patch && meta[k] !== patch[k]) { meta[k] = patch[k]; metaChanged = true; }
    }
    meta.updatedAt = Date.now();
    if (metaChanged) emit('pages');
  }
  emit('saving', true);
  clearTimeout(timer);
  if (immediate) return flushSaves();
  timer = setTimeout(flushSaves, 500);
}
export async function flushSaves() {
  clearTimeout(timer);
  const batch = [...pending.entries()];
  pending.clear();
  if (!batch.length) return;
  inflight++;
  try {
    await Promise.all(batch.map(([id, patch]) => api(`/pages/${id}`, { method: 'PATCH', body: patch })));
  } catch (e) {
    toast(`Couldn’t save: ${e.message}`, { type: 'error' });
    // put the failed changes back so the next save retries them
    for (const [id, patch] of batch) pending.set(id, { ...patch, ...(pending.get(id) || {}) });
  } finally {
    inflight--;
    if (!pending.size && !inflight) emit('saving', false);
  }
}
export function hasUnsaved() { return pending.size > 0 || inflight > 0; }
// Flush pending edits on unload with keepalive requests, so leaving never loses work or nags the user.
addEventListener('pagehide', () => {
  state.beforeUnload?.(); // lets the open editor push its debounced changes into `pending`
  if (!pending.size) return;
  clearTimeout(timer);
  for (const [id, patch] of pending) {
    fetch(`/api/pages/${id}`, { method: 'PATCH', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) });
  }
  pending.clear();
});

export async function trashPage(id) {
  await flushSaves();
  await api(`/pages/${id}`, { method: 'DELETE' });
  const p = state.pages.get(id);
  if (p) { p.trashed = true; p.favorite = p.favorite; }
  emit('pages');
}
export async function restorePage(id) {
  const { page } = await api(`/pages/${id}/restore`, { method: 'POST' });
  state.pages.set(id, page);
  emit('pages');
}
export async function deleteForever(id) {
  await api(`/pages/${id}?permanent=1`, { method: 'DELETE' });
  await loadPages();
}
export async function duplicatePage(id) {
  await flushSaves();
  const { page } = await api(`/pages/${id}/duplicate`, { method: 'POST' });
  await loadPages();
  return page;
}
