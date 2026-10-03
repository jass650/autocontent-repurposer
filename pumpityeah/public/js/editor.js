// Block editor: contenteditable blocks, slash menu, markdown shortcuts, drag & drop, selection toolbar.
import { h, uid, sanitize, escapeHtml, mdToBlocks, ICONS, popover, menuList, toast, debounce, safeUrl } from './common.js';

const TEXT_TYPES = new Set(['p', 'h1', 'h2', 'h3', 'bullet', 'numbered', 'todo', 'quote', 'callout', 'toggle']);
const LIST_TYPES = new Set(['bullet', 'numbered', 'todo']);
const PLACEHOLDER = {
  p: "Write something, or press 'space' for AI, '/' for commands…",
  h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', bullet: 'List', numbered: 'List', todo: 'To-do',
  quote: 'Empty quote', callout: 'Type something…', toggle: 'Toggle',
};
export const BLOCK_TYPES = [
  { type: 'p', label: 'Text', desc: 'Just start writing with plain text.', icon: 'Aa', keys: 'text paragraph plain' },
  { type: 'h1', label: 'Heading 1', desc: 'Big section heading.', icon: 'H1', keys: 'heading title h1 #' },
  { type: 'h2', label: 'Heading 2', desc: 'Medium section heading.', icon: 'H2', keys: 'heading subtitle h2 ##' },
  { type: 'h3', label: 'Heading 3', desc: 'Small section heading.', icon: 'H3', keys: 'heading h3 ###' },
  { type: 'todo', label: 'To-do list', desc: 'Track tasks with a to-do list.', icon: '☑', keys: 'todo task checkbox check []' },
  { type: 'bullet', label: 'Bulleted list', desc: 'Create a simple bulleted list.', icon: '•', keys: 'bullet unordered list ul -' },
  { type: 'numbered', label: 'Numbered list', desc: 'Create a list with numbering.', icon: '1.', keys: 'numbered ordered list ol' },
  { type: 'toggle', label: 'Toggle list', desc: 'Toggles can hide and show content inside.', icon: '▸', keys: 'toggle collapse details >' },
  { type: 'quote', label: 'Quote', desc: 'Capture a quote.', icon: '❝', keys: 'quote blockquote citation' },
  { type: 'callout', label: 'Callout', desc: 'Make writing stand out.', icon: '💡', keys: 'callout note info tip' },
  { type: 'divider', label: 'Divider', desc: 'Visually divide blocks.', icon: '—', keys: 'divider line hr separator' },
  { type: 'code', label: 'Code', desc: 'Capture a code snippet.', icon: '</>', keys: 'code snippet program' },
  { type: 'image', label: 'Image', desc: 'Upload or embed with a link.', icon: '🖼️', keys: 'image picture photo upload' },
];
const CODE_LANGS = ['plain text', 'javascript', 'typescript', 'python', 'bash', 'html', 'css', 'json', 'sql', 'go', 'rust', 'java', 'markdown'];

// ---------- caret helpers ----------
function textOffset(el) {
  const sel = getSelection();
  if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer)) return 0;
  const pre = document.createRange();
  pre.selectNodeContents(el);
  pre.setEnd(r.startContainer, r.startOffset);
  return pre.toString().length;
}
function rangeAt(el, start, end = start) {
  const r = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0, startSet = false, node;
  while ((node = walker.nextNode())) {
    const len = node.textContent.length;
    if (!startSet && start <= pos + len) { r.setStart(node, start - pos); startSet = true; }
    if (startSet && end <= pos + len) { r.setEnd(node, end - pos); return r; }
    pos += len;
  }
  if (!startSet) r.setStart(el, el.childNodes.length);
  r.setEnd(el, el.childNodes.length);
  return r;
}
function setCaret(el, offset = 'end') {
  if (!el) return;
  el.focus({ preventScroll: true });
  let r;
  if (offset === 'end' || offset === 'start') {
    r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(offset === 'start');
  } else {
    r = rangeAt(el, offset);
    r.collapse(true);
  }
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(r);
  const rect = el.getBoundingClientRect();
  if (rect.bottom > innerHeight - 40 || rect.top < 60) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function caretRect() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange();
  r.collapse(true);
  const rects = r.getClientRects();
  return rects.length ? rects[0] : null;
}
function onFirstLine(el) {
  if (!el.textContent) return true;
  const rect = caretRect();
  if (!rect) return textOffset(el) === 0;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return rect.top < el.getBoundingClientRect().top + lh * 0.8;
}
function onLastLine(el) {
  if (!el.textContent) return true;
  const rect = caretRect();
  if (!rect) return textOffset(el) >= el.textContent.length;
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 24;
  return rect.bottom > el.getBoundingClientRect().bottom - lh * 0.8;
}
function cleanEmpty(container) {
  container.querySelectorAll('b,i,u,s,strong,em,code,a,mark').forEach((n) => { if (!n.textContent) n.remove(); });
}
function htmlOf(el) {
  if (!el.textContent && !el.querySelector('br + *')) return '';
  return el.innerHTML.replace(/<br>$/, '');
}
async function fileToDataUrl(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85);
  } finally { URL.revokeObjectURL(url); }
}

export class Editor {
  /**
   * opts: onChange(blocks), onAI({anchorId, selection, selectedIds, preset}), createSubpage(kind) -> Promise<id>,
   *       navigate(id), pageMeta(id), pickEmoji(anchor, cb)
   */
  constructor(root, blocks, opts) {
    this.root = root;
    this.blocks = blocks;
    this.opts = opts;
    this.slash = null;
    this.emit = debounce(() => this.opts.onChange(this.blocks), 450);
    this.root.classList.add('editor');
    this.root.addEventListener('dragover', (e) => this.onDragOver(e));
    this.root.addEventListener('drop', (e) => this.onDrop(e));
    this.root.addEventListener('dragleave', (e) => { if (!this.root.contains(e.relatedTarget)) this.clearDrop(); });
    this.onSelChange = () => this.updateToolbar();
    document.addEventListener('selectionchange', this.onSelChange);
    this.render();
  }
  destroy() {
    this.emit.flush?.();
    document.removeEventListener('selectionchange', this.onSelChange);
    this.closeSlash();
    this.toolbar?.remove();
  }
  changed() { this.emit(); }
  flush() { this.emit.flush(); }

  // ---------- lookup ----------
  idx(id) { return this.blocks.findIndex((b) => b.id === id); }
  get(id) { return this.blocks.find((b) => b.id === id); }
  elOf(id) { return this.root.querySelector(`.block[data-id="${id}"]`); }
  editableOf(id) { return this.elOf(id)?.querySelector('.editable'); }
  prevTextual(id) {
    for (let i = this.idx(id) - 1; i >= 0; i--) if (this.editableOf(this.blocks[i].id)) return this.blocks[i];
    return null;
  }
  nextTextual(id) {
    for (let i = this.idx(id) + 1; i < this.blocks.length; i++) if (this.editableOf(this.blocks[i].id)) return this.blocks[i];
    return null;
  }

  // ---------- render ----------
  render() {
    this.root.replaceChildren(...this.blocks.map((b) => this.renderBlock(b)));
    this.renumber();
  }
  renumber() {
    let n = 0;
    for (const b of this.blocks) {
      if (b.type === 'numbered') {
        n++;
        const el = this.elOf(b.id)?.querySelector('.num');
        if (el) el.textContent = n + '.';
      } else n = 0;
    }
  }
  rerender(id) {
    const old = this.elOf(id);
    const b = this.get(id);
    if (old && b) old.replaceWith(this.renderBlock(b));
    this.renumber();
  }
  insertEl(b, afterId) {
    const el = this.renderBlock(b);
    const after = afterId && this.elOf(afterId);
    if (after) after.after(el);
    else this.root.prepend(el);
    this.renumber();
    return el;
  }

  renderBlock(b) {
    const el = h('div', { class: `block b-${b.type}`, 'data-id': b.id });
    const gutter = h('div', { class: 'gutter', contenteditable: 'false' },
      h('button', { class: 'g-btn g-add', title: 'Click to add below', 'aria-label': 'Add block below', html: ICONS.plus, onclick: () => this.addBelowWithSlash(b.id) }),
      h('button', {
        class: 'g-btn g-drag', title: 'Drag to move\nClick to open menu', 'aria-label': 'Block menu', draggable: 'true', html: ICONS.drag,
        onclick: (e) => this.blockMenu(b.id, e.currentTarget),
        ondragstart: (e) => this.onDragStart(e, b.id),
        ondragend: () => this.onDragEnd(),
      }));
    el.append(gutter);
    const body = h('div', { class: 'block-body' });
    el.append(body);

    const editable = (cls = '') => {
      const ed = h('div', { class: `editable ${cls}`, contenteditable: 'true', spellcheck: 'true', 'data-placeholder': PLACEHOLDER[b.type] || '' });
      ed.innerHTML = sanitize(b.html || '');
      this.wire(ed, b);
      return ed;
    };

    switch (b.type) {
      case 'bullet':
        body.append(h('span', { class: 'marker', text: '•' }), editable());
        break;
      case 'numbered':
        body.append(h('span', { class: 'marker num', text: '1.' }), editable());
        break;
      case 'todo': {
        const box = h('button', { class: `check ${b.checked ? 'on' : ''}`, role: 'checkbox', 'aria-checked': String(!!b.checked), 'aria-label': 'Toggle to-do', html: b.checked ? ICONS.check : '' });
        box.addEventListener('click', () => {
          b.checked = !b.checked;
          box.classList.toggle('on', b.checked);
          box.innerHTML = b.checked ? ICONS.check : '';
          box.setAttribute('aria-checked', String(b.checked));
          el.classList.toggle('done', b.checked);
          this.changed();
        });
        if (b.checked) el.classList.add('done');
        body.append(h('span', { class: 'marker' }, box), editable());
        break;
      }
      case 'toggle': {
        const caret = h('button', { class: `caret ${b.open ? 'open' : ''}`, 'aria-label': b.open ? 'Collapse' : 'Expand', 'aria-expanded': String(!!b.open), html: ICONS.chevronRight });
        const wrap = h('div', { class: 'toggle-wrap' });
        const sum = editable();
        const inner = h('div', { class: 'toggle-body', contenteditable: 'plaintext-only', 'data-placeholder': 'Empty toggle. Click to add content.', spellcheck: 'true' });
        inner.textContent = b.body || '';
        inner.hidden = !b.open;
        inner.addEventListener('input', () => { b.body = inner.innerText.replace(/\n$/, ''); this.changed(); });
        caret.addEventListener('click', () => {
          b.open = !b.open;
          caret.classList.toggle('open', b.open);
          caret.setAttribute('aria-expanded', String(b.open));
          inner.hidden = !b.open;
          this.changed();
        });
        wrap.append(sum, inner);
        body.append(h('span', { class: 'marker' }, caret), wrap);
        break;
      }
      case 'callout': {
        const icon = h('button', { class: 'callout-icon', text: b.icon || '💡', 'aria-label': 'Change callout icon' });
        icon.addEventListener('click', () => this.opts.pickEmoji(icon, (emoji) => { b.icon = emoji || '💡'; icon.textContent = b.icon; this.changed(); }));
        body.append(icon, editable());
        break;
      }
      case 'divider':
        body.append(h('div', { class: 'divider', tabindex: '0', role: 'separator' }));
        break;
      case 'code': {
        const lang = h('select', { class: 'code-lang', 'aria-label': 'Code language' }, CODE_LANGS.map((l) => h('option', { value: l, selected: (b.lang || 'plain text') === l, text: l })));
        lang.addEventListener('change', () => { b.lang = lang.value; this.changed(); });
        const copy = h('button', { class: 'code-copy', text: 'Copy' });
        const code = h('div', { class: 'editable code-edit', contenteditable: 'plaintext-only', spellcheck: 'false', 'data-placeholder': '// code' });
        code.textContent = new DOMParser().parseFromString(`<body>${sanitize(b.html || '')}</body>`, 'text/html').body.textContent;
        copy.addEventListener('click', async () => { await navigator.clipboard.writeText(code.innerText); copy.textContent = 'Copied!'; setTimeout(() => { copy.textContent = 'Copy'; }, 1200); });
        this.wire(code, b);
        body.append(h('div', { class: 'code-box' }, h('div', { class: 'code-head', contenteditable: 'false' }, lang, copy), code));
        break;
      }
      case 'image':
        body.append(this.renderImage(b));
        break;
      case 'page': {
        const meta = this.opts.pageMeta(b.pageId);
        const link = h('a', { class: `page-link ${meta ? '' : 'missing'}`, href: meta ? `/app/p/${b.pageId}` : '#' },
          h('span', { class: 'pl-icon', text: meta?.icon || (meta?.kind === 'database' ? '🗂️' : '📄') }),
          h('span', { class: 'pl-title', text: meta ? (meta.title || 'Untitled') : 'Deleted page' }));
        link.addEventListener('click', (e) => { e.preventDefault(); if (meta) this.opts.navigate(b.pageId); });
        body.append(link);
        break;
      }
      default:
        body.append(editable());
    }
    return el;
  }

  renderImage(b) {
    if (b.url) {
      const img = h('img', { src: safeUrl(b.url), alt: b.caption || '', loading: 'lazy', draggable: 'false' });
      img.addEventListener('error', () => img.replaceWith(h('div', { class: 'img-error', text: 'Couldn’t load this image.' })));
      const cap = h('div', { class: 'img-caption', contenteditable: 'plaintext-only', 'data-placeholder': 'Write a caption…' });
      cap.textContent = b.caption || '';
      cap.addEventListener('input', () => { b.caption = cap.innerText.trim(); this.changed(); });
      const tools = h('div', { class: 'img-tools' },
        h('button', { text: 'Replace', onclick: () => { b.url = ''; this.rerender(b.id); this.changed(); } }),
        h('button', { text: 'Delete', onclick: () => this.removeBlock(b.id) }));
      return h('figure', { class: 'img-figure' }, h('div', { class: 'img-wrap' }, img, tools), cap);
    }
    const file = h('input', { type: 'file', accept: 'image/*', hidden: true });
    const urlIn = h('input', { type: 'url', class: 'img-url', placeholder: 'Paste an image link…' });
    const setUrl = (u) => { if (!safeUrl(u)) { toast('That doesn’t look like an image URL.', { type: 'error' }); return; } b.url = u; this.rerender(b.id); this.changed(); };
    file.addEventListener('change', async () => {
      const f = file.files[0];
      if (!f) return;
      try { setUrl(await fileToDataUrl(f)); } catch { toast('Couldn’t read that image.', { type: 'error' }); }
    });
    urlIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); setUrl(urlIn.value.trim()); } });
    return h('div', { class: 'img-empty', contenteditable: 'false' },
      h('span', { class: 'img-empty-icon', html: ICONS.image }),
      h('div', { class: 'img-empty-actions' },
        h('button', { class: 'btn btn-outline btn-sm', text: 'Upload', onclick: () => file.click() }),
        urlIn,
        h('button', { class: 'btn btn-primary btn-sm', text: 'Embed', onclick: () => setUrl(urlIn.value.trim()) })),
      file);
  }

  // ---------- events ----------
  wire(ed, b) {
    ed.addEventListener('input', (e) => this.onInput(e, ed, b));
    ed.addEventListener('keydown', (e) => this.onKeyDown(e, ed, b));
    ed.addEventListener('paste', (e) => this.onPaste(e, ed, b));
    ed.addEventListener('blur', () => setTimeout(() => {
      // The element may have been replaced by a re-render; only close if focus truly left this block.
      if (this.slash?.id === b.id && document.activeElement !== this.editableOf(b.id) && !this.slash.el.matches(':hover')) this.closeSlash();
    }, 150));
  }
  sync(ed, b) {
    if (b.type === 'code') b.html = escapeHtml(ed.innerText.replace(/\n$/, ''));
    else {
      if (!ed.textContent && ed.innerHTML) ed.innerHTML = '';
      b.html = htmlOf(ed);
    }
    this.changed();
  }

  onInput(e, ed, b) {
    // Markdown shortcuts at the start of a text block
    if (b.type !== 'code' && e.inputType === 'insertText') {
      const text = ed.textContent.replace(/ /g, ' ');
      const off = textOffset(ed);
      const before = text.slice(0, off);
      const map = { '# ': 'h1', '## ': 'h2', '### ': 'h3', '- ': 'bullet', '* ': 'bullet', '+ ': 'bullet', '1. ': 'numbered', '[] ': 'todo', '[ ] ': 'todo', '> ': 'toggle', '" ': 'quote' };
      if (e.data?.endsWith(' ') && map[before] && (b.type === 'p' || (LIST_TYPES.has(b.type) && map[before] !== b.type))) {
        rangeAt(ed, 0, before.length).deleteContents();
        this.sync(ed, b);
        this.convert(b.id, map[before]);
        return;
      }
      if (b.type === 'p' && text === '---') { b.html = ''; this.convert(b.id, 'divider'); return; }
      if (b.type === 'p' && text === '```') { b.html = ''; this.convert(b.id, 'code'); return; }
      if (e.data === '/') this.openSlash(b.id, off - 1);
    }
    this.sync(ed, b);
    if (this.slash?.id === b.id) this.updateSlash(ed);
  }

  onKeyDown(e, ed, b) {
    if (this.slash && this.slash.id === b.id && this.slashKey(e)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (b.type === 'code') {
      if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
      if (e.key === 'Enter' && mod) { e.preventDefault(); this.insertAfter(b.id, { type: 'p' }, true); return; }
      if (e.key === 'Backspace' && !ed.textContent) { e.preventDefault(); this.convert(b.id, 'p'); return; }
      if (e.key === 'ArrowUp' && onFirstLine(ed)) { const p = this.prevTextual(b.id); if (p) { e.preventDefault(); setCaret(this.editableOf(p.id), 'end'); } return; }
      if (e.key === 'ArrowDown' && onLastLine(ed)) {
        e.preventDefault();
        const n = this.nextTextual(b.id);
        if (n) setCaret(this.editableOf(n.id), 'start'); else this.insertAfter(b.id, { type: 'p' }, true);
      }
      return;
    }
    if (mod && e.key.toLowerCase() === 'e') { e.preventDefault(); this.wrapSelection('code'); return; }
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') { e.preventDefault(); this.wrapSelection('mark'); return; }
    if (mod && e.key.toLowerCase() === 'k') {
      const sel = getSelection();
      if (sel.rangeCount && !sel.isCollapsed) { e.preventDefault(); e.stopPropagation(); this.updateToolbar(true); }
      return;
    }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); this.duplicate(b.id); return; }
    if (mod && e.key === 'Enter' && b.type === 'todo') { e.preventDefault(); this.elOf(b.id).querySelector('.check').click(); return; }
    if (mod && e.key === 'Enter' && b.type === 'toggle') { e.preventDefault(); this.elOf(b.id).querySelector('.caret').click(); return; }
    if (e.altKey && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); this.move(b.id, e.key === 'ArrowUp' ? -1 : 1); return; }

    if (e.key === ' ' && !ed.textContent && b.type === 'p' && !e.shiftKey) {
      e.preventDefault();
      this.opts.onAI({ anchorId: b.id, selection: '', selectedIds: [] });
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      this.splitBlock(ed, b);
      return;
    }
    if (e.key === 'Backspace') {
      const sel = getSelection();
      if (sel.isCollapsed && textOffset(ed) === 0) { e.preventDefault(); this.backspaceAtStart(ed, b); }
      return;
    }
    if (e.key === 'Delete') {
      const sel = getSelection();
      if (sel.isCollapsed && textOffset(ed) >= ed.textContent.length) {
        const n = this.blocks[this.idx(b.id) + 1];
        if (n && TEXT_TYPES.has(n.type)) {
          e.preventDefault();
          const len = ed.textContent.length;
          b.html = htmlOf(ed) + (n.html || '');
          this.blocks.splice(this.idx(n.id), 1);
          this.elOf(n.id)?.remove();
          this.rerender(b.id);
          setCaret(this.editableOf(b.id), len);
          this.changed();
        }
      }
      return;
    }
    if (e.key === 'ArrowUp' && !e.shiftKey && onFirstLine(ed)) {
      const p = this.prevTextual(b.id);
      if (p) { e.preventDefault(); setCaret(this.editableOf(p.id), 'end'); }
      return;
    }
    if (e.key === 'ArrowDown' && !e.shiftKey && onLastLine(ed)) {
      const n = this.nextTextual(b.id);
      if (n) { e.preventDefault(); setCaret(this.editableOf(n.id), 'start'); }
      return;
    }
    if (e.key === 'Escape') { ed.blur(); }
  }

  splitBlock(ed, b) {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (!r.collapsed) r.deleteContents();
    const empty = !ed.textContent;
    if (empty && (LIST_TYPES.has(b.type) || b.type === 'quote' || b.type === 'toggle' || b.type === 'callout')) {
      // Enter on an empty list item exits the list
      this.convert(b.id, 'p');
      return;
    }
    const after = document.createRange();
    after.setStart(r.endContainer, r.endOffset);
    after.setEnd(ed, ed.childNodes.length);
    const tmp = document.createElement('div');
    tmp.append(after.extractContents());
    cleanEmpty(tmp);
    cleanEmpty(ed);
    const afterHtml = tmp.textContent ? tmp.innerHTML : '';
    const beforeHtml = htmlOf(ed);
    const nextType = LIST_TYPES.has(b.type) ? b.type : 'p';
    if (!ed.textContent && afterHtml) {
      // Caret at start of a non-empty block: push an empty block above
      b.html = afterHtml;
      const nb = { id: uid(), type: nextType, html: '' };
      this.blocks.splice(this.idx(b.id), 0, nb);
      this.elOf(b.id).before(this.renderBlock(nb));
      this.rerender(b.id);
      setCaret(this.editableOf(b.id), 'start');
    } else {
      b.html = beforeHtml;
      if (b.type === 'toggle' && !b.open) { /* keep closed */ }
      this.rerender(b.id);
      this.insertAfter(b.id, { type: nextType, html: afterHtml }, 'start');
    }
    this.changed();
  }

  backspaceAtStart(ed, b) {
    if (b.type !== 'p') { this.convert(b.id, 'p', 'start'); return; }
    const i = this.idx(b.id);
    const prev = this.blocks[i - 1];
    if (!prev) return;
    if (TEXT_TYPES.has(prev.type)) {
      const prevEd = this.editableOf(prev.id);
      const len = prevEd.textContent.length;
      prev.html = htmlOf(prevEd) + htmlOf(ed);
      this.blocks.splice(i, 1);
      this.elOf(b.id).remove();
      this.rerender(prev.id);
      setCaret(this.editableOf(prev.id), len);
    } else if (!ed.textContent) {
      this.blocks.splice(i, 1);
      this.elOf(b.id).remove();
      const p = this.prevTextual(prev.id) || prev;
      const pe = this.editableOf(p.id);
      if (pe) setCaret(pe, 'end');
      this.renumber();
    } else {
      // previous block is a divider / image / page link: remove it
      this.blocks.splice(i - 1, 1);
      this.elOf(prev.id).remove();
      this.renumber();
      setCaret(ed, 'start');
    }
    this.changed();
  }

  onPaste(e, ed, b) {
    const text = e.clipboardData.getData('text/plain');
    const file = [...(e.clipboardData.files || [])].find((f) => f.type.startsWith('image/'));
    e.preventDefault();
    if (file && b.type !== 'code') {
      fileToDataUrl(file).then((url) => this.insertAfter(b.id, { type: 'image', url }, false));
      return;
    }
    if (!text) return;
    if (b.type === 'code' || !text.includes('\n')) {
      if (b.type !== 'code' && /^https?:\/\/\S+$/.test(text.trim()) && !getSelection().isCollapsed) {
        document.execCommand('createLink', false, text.trim());
      } else document.execCommand('insertText', false, text);
      return;
    }
    const newBlocks = mdToBlocks(text);
    if (!newBlocks.length) return;
    let anchor = b.id;
    if (!ed.textContent && b.type === 'p') {
      const i = this.idx(b.id);
      this.blocks.splice(i, 1, ...newBlocks);
      this.render();
    } else {
      const i = this.idx(anchor);
      this.blocks.splice(i + 1, 0, ...newBlocks);
      this.render();
    }
    const last = newBlocks[newBlocks.length - 1];
    const le = this.editableOf(last.id);
    if (le) setCaret(le, 'end');
    this.changed();
  }

  // ---------- structural ops ----------
  insertAfter(afterId, partial, focus = 'start') {
    const nb = { id: uid(), html: '', ...partial };
    const i = afterId ? this.idx(afterId) : -1;
    this.blocks.splice(i + 1, 0, nb);
    this.insertEl(nb, afterId);
    if (focus) {
      const ed = this.editableOf(nb.id);
      if (ed) setCaret(ed, focus === true ? 'start' : focus);
      else this.elOf(nb.id)?.querySelector('input,button')?.focus();
    }
    this.changed();
    return nb;
  }
  insertBlocks(afterId, newBlocks) {
    const i = afterId ? this.idx(afterId) : this.blocks.length - 1;
    this.blocks.splice(i + 1, 0, ...newBlocks);
    this.render();
    this.changed();
  }
  replaceBlocks(ids, newBlocks) {
    const idxs = ids.map((id) => this.idx(id)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (!idxs.length) return;
    this.blocks.splice(idxs[0], idxs[idxs.length - 1] - idxs[0] + 1, ...newBlocks);
    this.render();
    this.changed();
  }
  convert(id, type, caret = 'end') {
    const b = this.get(id);
    if (!b) return;
    const ed = this.editableOf(id);
    if (ed && b.type !== 'code') b.html = htmlOf(ed);
    if (b.type === 'code' && type !== 'code') b.html = escapeHtml(ed?.innerText || '');
    const wasText = TEXT_TYPES.has(b.type) || b.type === 'code';
    b.type = type;
    if (type === 'todo') b.checked = !!b.checked;
    if (type === 'callout' && !b.icon) b.icon = '💡';
    if (type === 'toggle' && b.open == null) b.open = false;
    if (type === 'code') { b.lang = b.lang || 'plain text'; b.html = escapeHtml(new DOMParser().parseFromString(`<body>${sanitize(b.html || '')}</body>`, 'text/html').body.textContent); }
    if (type === 'divider' || type === 'image') {
      if (wasText && b.html) {
        // keep text: insert the non-text block after instead
        b.type = 'p';
        this.rerender(id);
        this.insertAfter(id, { type }, false);
        if (type === 'divider') this.insertAfter(this.blocks[this.idx(id) + 1].id, { type: 'p' }, 'start');
        return;
      }
      b.html = '';
      this.rerender(id);
      if (type === 'divider') {
        const next = this.blocks[this.idx(id) + 1];
        if (next && TEXT_TYPES.has(next.type)) setCaret(this.editableOf(next.id), 'start');
        else this.insertAfter(id, { type: 'p' }, 'start');
      } else this.elOf(id)?.querySelector('.img-url')?.focus();
      this.changed();
      return;
    }
    this.rerender(id);
    setCaret(this.editableOf(id), caret);
    this.changed();
  }
  removeBlock(id) {
    const i = this.idx(id);
    if (i < 0) return;
    const prev = this.prevTextual(id);
    this.blocks.splice(i, 1);
    this.elOf(id)?.remove();
    this.renumber();
    if (prev) setCaret(this.editableOf(prev.id), 'end');
    this.changed();
  }
  duplicate(id) {
    const b = this.get(id);
    const copy = { ...JSON.parse(JSON.stringify(b)), id: uid() };
    this.blocks.splice(this.idx(id) + 1, 0, copy);
    this.insertEl(copy, id);
    this.changed();
  }
  move(id, dir) {
    const i = this.idx(id);
    const j = i + dir;
    if (j < 0 || j >= this.blocks.length) return;
    const [b] = this.blocks.splice(i, 1);
    this.blocks.splice(j, 0, b);
    const el = this.elOf(id);
    const focused = el.contains(document.activeElement);
    const off = focused ? textOffset(document.activeElement) : 0;
    if (dir < 0) el.previousElementSibling.before(el); else el.nextElementSibling.after(el);
    this.renumber();
    if (focused) setCaret(this.editableOf(id), off);
    this.changed();
  }
  addBelowWithSlash(id) {
    const b = this.get(id);
    const ed = this.editableOf(id);
    let target = b;
    if (!(b.type === 'p' && ed && !ed.textContent)) target = this.insertAfter(id, { type: 'p' }, 'start');
    const ted = this.editableOf(target.id);
    ted.textContent = '/';
    setCaret(ted, 'end');
    this.openSlash(target.id, 0);
  }

  // ---------- block menu ----------
  blockMenu(id, anchor) {
    const b = this.get(id);
    let pop;
    const items = [
      { label: 'Ask AI', icon: ICONS.sparkle, onClick: () => this.opts.onAI({ anchorId: id, selection: this.editableOf(id)?.innerText || '', selectedIds: [id] }) },
      { divider: true },
      { label: 'Delete', icon: ICONS.trash, hint: 'Del', onClick: () => this.removeBlock(id) },
      { label: 'Duplicate', icon: ICONS.duplicate, hint: 'Ctrl+D', onClick: () => this.duplicate(id) },
      { label: 'Move up', icon: '↑', hint: 'Alt+Shift+↑', onClick: () => this.move(id, -1) },
      { label: 'Move down', icon: '↓', hint: 'Alt+Shift+↓', onClick: () => this.move(id, 1) },
    ];
    if (TEXT_TYPES.has(b.type) || b.type === 'code') {
      items.push({ divider: true }, { header: 'Turn into' });
      for (const t of BLOCK_TYPES.filter((t) => TEXT_TYPES.has(t.type) || t.type === 'code')) {
        items.push({ label: t.label, icon: `<span class="ti">${t.icon}</span>`, active: b.type === t.type, onClick: () => this.convert(id, t.type) });
      }
    }
    pop = popover(anchor, menuList(items, () => pop.close()), { width: 260, className: 'menu-pop' });
  }

  // ---------- slash menu ----------
  commands() {
    const cmds = BLOCK_TYPES.map((t) => ({ ...t, group: 'Basic blocks', run: (id) => this.applyType(id, t.type) }));
    cmds.push(
      { label: 'Page', desc: 'Embed a sub-page inside this page.', icon: '📄', keys: 'page subpage new', group: 'Pages', run: (id) => this.makeSubpage(id, 'page') },
      { label: 'Table', desc: 'Database with a table view.', icon: '▦', keys: 'table database db grid', group: 'Pages', run: (id) => this.makeSubpage(id, 'table') },
      { label: 'Board', desc: 'Kanban board database.', icon: '▥', keys: 'board kanban database', group: 'Pages', run: (id) => this.makeSubpage(id, 'board') },
    );
    const ai = (label, desc, preset, keys) => ({ label, desc, icon: '✨', keys: 'ai ' + keys, group: 'PumpitYeah AI', ai: true, run: (id) => this.opts.onAI({ anchorId: id, selection: '', selectedIds: [], preset }) });
    cmds.push(
      ai('Ask AI', 'Ask AI to write anything.', null, 'ask write generate'),
      ai('Continue writing', 'Let AI pick up where you left off.', 'continue', 'continue'),
      ai('Summarize page', 'Summarize everything on this page.', 'summarize', 'summary summarize tldr'),
      ai('Find action items', 'Pull out to-dos from this page.', 'action_items', 'action todo tasks'),
      ai('Brainstorm ideas', 'Generate ideas about anything.', 'brainstorm', 'brainstorm ideas'),
      ai('Translate page', 'Translate this page into another language.', 'translate', 'translate language'),
    );
    return cmds;
  }
  async makeSubpage(id, kind) {
    try {
      const pageId = await this.opts.createSubpage(kind);
      const b = this.get(id);
      const ed = this.editableOf(id);
      if (b && b.type === 'p' && ed && !ed.textContent) {
        b.type = 'page'; b.pageId = pageId; b.html = '';
        this.rerender(id);
      } else this.insertAfter(id, { type: 'page', pageId }, false);
      this.flush();
      this.opts.navigate(pageId);
    } catch (e) { toast(e.message, { type: 'error' }); }
  }
  applyType(id, type) {
    const b = this.get(id);
    const ed = this.editableOf(id);
    if (ed && !ed.textContent) this.convert(id, type);
    else if (type === 'divider' || type === 'image') this.insertAfter(id, { type }, false);
    else this.insertAfter(id, { type, ...(type === 'callout' ? { icon: '💡' } : {}), ...(type === 'code' ? { lang: 'plain text' } : {}) }, 'start');
    if (type === 'image') this.root.querySelectorAll('.img-url').forEach((x, i, all) => { if (i === all.length - 1) x.focus(); });
    void b;
  }
  openSlash(id, start) {
    this.closeSlash();
    const el = h('div', { class: 'slash-menu', role: 'listbox' });
    el.addEventListener('mousedown', (e) => e.preventDefault());
    document.body.append(el);
    this.slash = { id, start, el, index: 0, items: [], query: '' };
    this.updateSlash(this.editableOf(id));
  }
  updateSlash(ed) {
    const s = this.slash;
    if (!s) return;
    const text = ed.textContent;
    const off = textOffset(ed);
    if (text[s.start] !== '/' || off <= s.start) { this.closeSlash(); return; }
    const q = text.slice(s.start + 1, off).toLowerCase().trim();
    if (q.length > 24) { this.closeSlash(); return; }
    s.query = q;
    s.end = off;
    s.items = this.commands().filter((c) => !q || c.label.toLowerCase().includes(q) || c.keys.includes(q));
    if (!s.items.length) {
      s.misses = (s.misses || 0) + 1;
      if (s.misses > 3) { this.closeSlash(); return; }
    } else s.misses = 0;
    s.index = Math.min(s.index, Math.max(0, s.items.length - 1));
    this.drawSlash();
    const rect = caretRect() || ed.getBoundingClientRect();
    const mh = s.el.offsetHeight;
    let top = rect.bottom + 6;
    if (top + mh > innerHeight - 8) top = Math.max(8, rect.top - mh - 6);
    s.el.style.top = top + 'px';
    s.el.style.left = Math.max(8, Math.min(rect.left, document.documentElement.clientWidth - s.el.offsetWidth - 8)) + 'px';
  }
  drawSlash() {
    const s = this.slash;
    s.el.replaceChildren();
    if (!s.items.length) { s.el.append(h('div', { class: 'slash-empty', text: 'No results' })); return; }
    let group = '';
    s.items.forEach((c, i) => {
      if (c.group !== group) { group = c.group; s.el.append(h('div', { class: 'slash-group', text: group })); }
      const item = h('div', { class: `slash-item ${i === s.index ? 'active' : ''} ${c.ai ? 'ai' : ''}`, role: 'option', 'aria-selected': String(i === s.index) },
        h('span', { class: 'slash-icon', text: c.icon }),
        h('span', { class: 'slash-text' }, h('span', { class: 'slash-label', text: c.label }), h('span', { class: 'slash-desc', text: c.desc })));
      item.addEventListener('mousemove', () => { if (s.index !== i) { s.index = i; this.drawSlash(); } });
      item.addEventListener('click', () => this.runSlash(i));
      s.el.append(item);
    });
    s.el.querySelector('.slash-item.active')?.scrollIntoView({ block: 'nearest' });
  }
  slashKey(e) {
    const s = this.slash;
    if (e.key === 'ArrowDown') { e.preventDefault(); s.index = (s.index + 1) % Math.max(1, s.items.length); this.drawSlash(); return true; }
    if (e.key === 'ArrowUp') { e.preventDefault(); s.index = (s.index - 1 + s.items.length) % Math.max(1, s.items.length); this.drawSlash(); return true; }
    if ((e.key === 'Enter' || e.key === 'Tab') && s.items.length) { e.preventDefault(); this.runSlash(s.index); return true; }
    if (e.key === 'Escape') { e.preventDefault(); this.closeSlash(); return true; }
    return false;
  }
  runSlash(i) {
    const s = this.slash;
    const cmd = s.items[i];
    const ed = this.editableOf(s.id);
    const b = this.get(s.id);
    this.closeSlash();
    if (!cmd || !ed) return;
    // delete the "/query" text the user typed
    rangeAt(ed, s.start, Math.max(s.start + 1, s.end || 0)).deleteContents();
    this.sync(ed, b);
    setCaret(ed, s.start);
    cmd.run(s.id);
  }
  closeSlash() {
    this.slash?.el.remove();
    this.slash = null;
  }

  // ---------- selection toolbar ----------
  selectionInfo() {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return null;
    const r = sel.getRangeAt(0);
    if (!this.root.contains(r.commonAncestorContainer)) return null;
    const startEd = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement)?.closest('.editable');
    if (!startEd || startEd.classList.contains('code-edit')) return null;
    const ids = this.blocks.filter((b) => { const el = this.elOf(b.id); return el && r.intersectsNode(el); }).map((b) => b.id);
    return { range: r, text: sel.toString(), ids };
  }
  updateToolbar(linkMode = false) {
    if (this.toolbarLocked) return;
    const info = this.selectionInfo();
    if (!info || !info.text.trim()) { this.toolbar?.remove(); this.toolbar = null; return; }
    if (!this.toolbar) {
      this.toolbar = h('div', { class: 'sel-toolbar', role: 'toolbar', 'aria-label': 'Formatting' });
      this.toolbar.addEventListener('mousedown', (e) => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
      document.body.append(this.toolbar);
    }
    const tb = this.toolbar;
    tb.replaceChildren();
    if (linkMode) {
      const saved = info.range.cloneRange();
      const input = h('input', { class: 'tb-link', type: 'url', placeholder: 'Paste link and press Enter' });
      this.toolbarLocked = true;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          e.preventDefault();
          this.toolbarLocked = false;
          const sel = getSelection();
          sel.removeAllRanges(); sel.addRange(saved);
          const url = input.value.trim();
          if (e.key === 'Enter' && url) document.execCommand('createLink', false, /^(https?:|mailto:|\/)/.test(url) ? url : 'https://' + url);
          this.updateToolbar();
        }
      });
      input.addEventListener('blur', () => { this.toolbarLocked = false; });
      tb.append(input);
      setTimeout(() => input.focus(), 0);
    } else {
      const btn = (label, html, title, fn, cls = '') => h('button', { class: `tb-btn ${cls}`, title, 'aria-label': title, html, onclick: fn });
      tb.append(
        btn('ai', `${ICONS.sparkle}<span>Ask AI</span>`, 'Ask AI', () => {
          const i = this.selectionInfo(); if (!i) return;
          this.opts.onAI({ anchorId: i.ids[i.ids.length - 1], selection: i.text, selectedIds: i.ids });
          this.toolbar?.remove(); this.toolbar = null;
        }, 'tb-ai'),
        h('span', { class: 'tb-sep' }),
        btn('b', '<b>B</b>', 'Bold (Ctrl+B)', () => document.execCommand('bold')),
        btn('i', '<i>i</i>', 'Italic (Ctrl+I)', () => document.execCommand('italic')),
        btn('u', '<u>U</u>', 'Underline (Ctrl+U)', () => document.execCommand('underline')),
        btn('s', '<s>S</s>', 'Strikethrough', () => document.execCommand('strikeThrough')),
        btn('code', '<span class="mono">&lt;/&gt;</span>', 'Inline code (Ctrl+E)', () => this.wrapSelection('code')),
        btn('mark', '<span class="hl">A</span>', 'Highlight (Ctrl+Shift+H)', () => this.wrapSelection('mark')),
        btn('link', ICONS.link, 'Link (Ctrl+K)', () => this.updateToolbar(true)),
      );
    }
    const rect = info.range.getBoundingClientRect();
    const tw = tb.offsetWidth;
    let top = rect.top - tb.offsetHeight - 8;
    if (top < 56) top = rect.bottom + 8;
    tb.style.top = top + 'px';
    tb.style.left = Math.max(8, Math.min(rect.left + rect.width / 2 - tw / 2, document.documentElement.clientWidth - tw - 8)) + 'px';
  }
  wrapSelection(tag) {
    const sel = getSelection();
    if (!sel.rangeCount || sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    const ed = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest('.editable');
    if (!ed) return;
    const existing = (r.startContainer.parentElement)?.closest(tag);
    if (existing && ed.contains(existing)) {
      existing.replaceWith(...existing.childNodes);
    } else {
      const w = document.createElement(tag);
      w.append(r.extractContents());
      w.querySelectorAll(tag).forEach((n) => n.replaceWith(...n.childNodes));
      r.insertNode(w);
      sel.removeAllRanges();
      const nr = document.createRange(); nr.selectNodeContents(w); sel.addRange(nr);
    }
    const id = ed.closest('.block').dataset.id;
    this.sync(ed, this.get(id));
  }

  // ---------- drag & drop ----------
  onDragStart(e, id) {
    this.dragId = id;
    const el = this.elOf(id);
    el.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
    try { e.dataTransfer.setDragImage(el, 20, 14); } catch {}
  }
  onDragEnd() {
    this.elOf(this.dragId)?.classList.remove('dragging');
    this.dragId = null;
    this.clearDrop();
  }
  clearDrop() { this.root.querySelectorAll('.drop-before,.drop-after').forEach((n) => n.classList.remove('drop-before', 'drop-after')); }
  onDragOver(e) {
    if (!this.dragId) return;
    e.preventDefault();
    const target = e.target.closest?.('.block');
    this.clearDrop();
    if (!target || target.dataset.id === this.dragId) { this.dropTarget = null; return; }
    const r = target.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    target.classList.add(before ? 'drop-before' : 'drop-after');
    this.dropTarget = { id: target.dataset.id, before };
  }
  onDrop(e) {
    if (!this.dragId) return;
    e.preventDefault();
    const t = this.dropTarget;
    this.clearDrop();
    if (!t) return;
    const [moved] = this.blocks.splice(this.idx(this.dragId), 1);
    const ti = this.idx(t.id);
    this.blocks.splice(t.before ? ti : ti + 1, 0, moved);
    this.render();
    this.changed();
  }

  // ---------- focus helpers for the page ----------
  focusStart() {
    const first = this.blocks.find((b) => this.editableOf(b.id));
    if (first) setCaret(this.editableOf(first.id), 'start');
    else this.insertAfter(null, { type: 'p' }, 'start');
  }
  focusEndOrAppend() {
    const last = this.blocks[this.blocks.length - 1];
    const ed = last && this.editableOf(last.id);
    if (last && last.type === 'p' && ed && !ed.textContent) setCaret(ed, 'end');
    else this.insertAfter(last?.id || null, { type: 'p' }, 'start');
  }
  textBefore(id) {
    const i = this.idx(id);
    return this.blocks.slice(0, i + 1);
  }
}
