// PumpitYeah AI: inline writing assistant inside the editor + full-page workspace chat.
import { h, ICONS, streamPost, mdToHtml, mdToBlocks, blocksToMd, toast, escapeHtml } from './common.js';
import { state, childrenOf } from './store.js';

const SELECTION_ACTIONS = [
  { header: 'Edit or review selection' },
  { action: 'improve', label: 'Improve writing', icon: '✨' },
  { action: 'grammar', label: 'Fix spelling & grammar', icon: '✓' },
  { action: 'shorter', label: 'Make shorter', icon: '↙' },
  { action: 'longer', label: 'Make longer', icon: '↗' },
  { action: 'simplify', label: 'Simplify language', icon: '◎' },
  { action: 'professional', label: 'Change tone: Professional', icon: '👔' },
  { action: 'casual', label: 'Change tone: Casual', icon: '😎' },
  { action: 'explain', label: 'Explain this', icon: '❓' },
  { header: 'Translate' },
  { action: 'translate', lang: 'Spanish', label: 'Translate to Spanish', icon: '🌍' },
  { action: 'translate', lang: 'French', label: 'Translate to French', icon: '🌍' },
  { action: 'translate', lang: 'Japanese', label: 'Translate to Japanese', icon: '🌍' },
];
const PAGE_ACTIONS = [
  { header: 'Write with AI' },
  { action: 'continue', label: 'Continue writing', icon: '✍️' },
  { action: 'summarize', label: 'Summarize this page', icon: '≡' },
  { action: 'action_items', label: 'Find action items', icon: '☑' },
  { action: 'brainstorm', label: 'Brainstorm ideas…', icon: '💡', needsPrompt: 'Brainstorm ideas for ' },
  { action: 'outline', label: 'Draft an outline…', icon: '📑', needsPrompt: 'Outline for ' },
  { header: 'Draft' },
  { prompt: 'Write a short blog post about ', label: 'Blog post…', icon: '📝', needsPrompt: true },
  { prompt: 'Draft a meeting agenda for ', label: 'Meeting agenda…', icon: '🗓️', needsPrompt: true },
  { prompt: 'Write a pros and cons list for ', label: 'Pros & cons list…', icon: '⚖️', needsPrompt: true },
  { action: 'translate', lang: 'Spanish', label: 'Translate page to Spanish', icon: '🌍' },
];

let activePanel = null;
export function closeInlineAI() { activePanel?.close(); }

/**
 * Inline AI panel anchored under a block.
 * ctx: { editor, page }   opts: { anchorId, selection, selectedIds, preset }
 */
export function openInlineAI(ctx, opts) {
  closeInlineAI();
  const { editor, page } = ctx;
  const anchorEl = editor.elOf(opts.anchorId) || editor.root.lastElementChild;
  const hasSel = !!opts.selection?.trim();
  let controller = null;
  let result = '';
  let lastReq = null;

  const panel = h('div', { class: 'ai-panel', contenteditable: 'false' });
  const selPreview = hasSel ? h('div', { class: 'ai-sel', text: opts.selection.trim().slice(0, 220) + (opts.selection.length > 220 ? '…' : '') }) : null;
  const out = h('div', { class: 'ai-out rich', hidden: true, 'aria-live': 'polite' });
  const err = h('div', { class: 'ai-err', hidden: true });
  const input = h('textarea', { class: 'ai-input', rows: 1, placeholder: hasSel ? 'Tell AI what to do with the selection…' : 'Ask AI to write anything…', 'aria-label': 'Ask AI' });
  const sendBtn = h('button', { class: 'ai-send', 'aria-label': 'Send', html: ICONS.send });
  const status = h('div', { class: 'ai-status', hidden: true }, h('span', { class: 'ai-dots' }, h('i'), h('i'), h('i')), h('span', { text: 'AI is writing…' }));
  const actions = h('div', { class: 'ai-actions', hidden: true });
  const menu = h('div', { class: 'ai-menu' });
  const foot = h('div', { class: 'ai-foot', text: 'AI responses can be inaccurate or misleading.' });

  panel.append(...[selPreview, out, err, status, h('div', { class: 'ai-input-row' }, h('span', { class: 'ai-spark', html: ICONS.sparkle }), input, sendBtn), actions, menu, foot].filter(Boolean));
  anchorEl.after(panel);
  panel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; };
  input.addEventListener('input', () => { autosize(); drawMenu(); });

  const drawMenu = () => {
    menu.replaceChildren();
    if (result || controller) { menu.hidden = true; return; }
    const q = input.value.trim().toLowerCase();
    const items = (hasSel ? SELECTION_ACTIONS : PAGE_ACTIONS).filter((it) => it.header || !q || it.label.toLowerCase().includes(q));
    const visible = items.filter((it, i) => !it.header || (items[i + 1] && !items[i + 1].header));
    menu.hidden = !visible.some((i) => !i.header);
    for (const it of visible) {
      if (it.header) { menu.append(h('div', { class: 'menu-header', text: it.header })); continue; }
      menu.append(h('button', { class: 'menu-item', onclick: () => pick(it) },
        h('span', { class: 'menu-icon', text: it.icon }), h('span', { class: 'menu-label', text: it.label })));
    }
  };
  const pick = (it) => {
    if (it.needsPrompt) {
      input.value = typeof it.needsPrompt === 'string' ? it.needsPrompt : it.prompt;
      input.dataset.action = it.action || '';
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      autosize();
      drawMenu();
      return;
    }
    run({ action: it.action, lang: it.lang, prompt: it.prompt });
  };

  const pageText = (upto) => blocksToMd(upto ? editor.textBefore(upto) : page.blocks, titles());
  const run = async (req) => {
    lastReq = req;
    controller?.abort();
    controller = new AbortController();
    result = '';
    err.hidden = true;
    out.hidden = false;
    out.innerHTML = '';
    status.hidden = false;
    actions.hidden = true;
    menu.hidden = true;
    sendBtn.innerHTML = ICONS.stop;
    sendBtn.setAttribute('aria-label', 'Stop');
    input.value = '';
    input.placeholder = 'Tell AI what to do next…';
    autosize();
    try {
      await streamPost('/ai/complete', {
        action: req.action, lang: req.lang, prompt: req.prompt,
        selection: req.selection ?? (hasSel ? opts.selection : ''),
        pageTitle: page.title,
        pageText: pageText(req.action === 'continue' ? opts.anchorId : null),
      }, (text) => {
        result = text;
        out.innerHTML = mdToHtml(text) + '<span class="ai-cursor"></span>';
      }, controller.signal);
      out.innerHTML = mdToHtml(result);
      if (!result.trim()) throw new Error('AI returned an empty response. Try rephrasing.');
    } catch (e) {
      if (e.name === 'AbortError') { out.innerHTML = mdToHtml(result); }
      else {
        err.hidden = false;
        err.textContent = e.message;
        if (!result) out.hidden = true;
      }
    } finally {
      controller = null;
      status.hidden = true;
      sendBtn.innerHTML = ICONS.send;
      sendBtn.setAttribute('aria-label', 'Send');
      drawActions();
      input.focus();
    }
  };

  const drawActions = () => {
    actions.replaceChildren();
    if (!result.trim()) { actions.hidden = true; drawMenu(); return; }
    actions.hidden = false;
    const btn = (label, icon, fn, cls = '') => h('button', { class: `ai-act ${cls}`, html: `${icon}<span>${label}</span>`, onclick: fn });
    if (hasSel && opts.selectedIds?.length) {
      actions.append(btn('Replace selection', ICONS.replace, () => {
        editor.replaceBlocks(opts.selectedIds, mdToBlocks(result));
        close(); toast('Replaced with AI text');
      }, 'primary'));
    }
    actions.append(
      btn('Insert below', ICONS.arrowDown, () => {
        const blocks = mdToBlocks(result);
        const anchor = hasSel ? opts.selectedIds[opts.selectedIds.length - 1] : opts.anchorId;
        const anchorBlock = editor.get(anchor);
        const anchorEd = editor.editableOf(anchor);
        if (!hasSel && anchorBlock && anchorBlock.type === 'p' && anchorEd && !anchorEd.textContent) editor.replaceBlocks([anchor], blocks);
        else editor.insertBlocks(anchor, blocks);
        close();
      }, hasSel ? '' : 'primary'),
      btn('Copy', ICONS.copy, async () => { await navigator.clipboard.writeText(result); toast('Copied to clipboard'); }),
      btn('Try again', ICONS.refresh, () => run(lastReq)),
      btn('Discard', ICONS.x, () => close(), 'muted'),
    );
  };

  const submit = () => {
    if (controller) { controller.abort(); return; }
    const text = input.value.trim();
    if (!text) return;
    const action = input.dataset.action || undefined;
    delete input.dataset.action;
    if (result) run({ prompt: text, selection: result }); // refine previous answer
    else run({ action, prompt: text });
  };
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowDown' && !input.value && !menu.hidden) { e.preventDefault(); menu.querySelector('.menu-item')?.focus(); }
  });
  menu.addEventListener('keydown', (e) => {
    const items = [...menu.querySelectorAll('.menu-item')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[Math.min(items.length - 1, i + 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else items[i - 1].focus(); }
    if (e.key === 'Escape') close();
  });
  const onDocDown = (e) => {
    if (!panel.contains(e.target) && !result && !controller && !e.target.closest('.popover')) close();
  };
  setTimeout(() => document.addEventListener('mousedown', onDocDown), 0);

  const close = () => {
    controller?.abort();
    panel.remove();
    document.removeEventListener('mousedown', onDocDown);
    if (activePanel?.panel === panel) activePanel = null;
    const ed = editor.editableOf(opts.anchorId);
    if (ed) ed.focus({ preventScroll: true });
  };
  activePanel = { panel, close };

  drawMenu();
  input.focus();
  if (opts.preset) run({ action: opts.preset, lang: opts.preset === 'translate' ? 'Spanish' : undefined });
}

function titles() {
  const t = {};
  for (const p of state.pages.values()) t[p.id] = p.title || 'Untitled';
  return t;
}

// ---------- full-page AI chat ----------
const CHAT_KEY = () => `py-chat-${state.me?.id}`;
function loadChat() { try { return JSON.parse(localStorage.getItem(CHAT_KEY())) || []; } catch { return []; } }
function saveChat(msgs) { try { localStorage.setItem(CHAT_KEY(), JSON.stringify(msgs.slice(-40))); } catch {} }

export function renderAIChat(container, ctx) {
  // ctx: { navigate(id), createPageFromBlocks(title, blocks) -> Promise<id>, contextPageId, initialPrompt }
  let messages = loadChat();
  let controller = null;

  const thread = h('div', { class: 'chat-thread' });
  const input = h('textarea', { class: 'chat-input', rows: 1, placeholder: 'Ask anything about your workspace…', 'aria-label': 'Message PumpitYeah AI' });
  const send = h('button', { class: 'chat-send', 'aria-label': 'Send', html: ICONS.send });
  const ctxPage = ctx.contextPageId && state.pages.get(ctx.contextPageId);
  const chip = h('div', { class: 'chat-chip', html: `${ICONS.globe}<span>All pages in your workspace${ctxPage ? ` · focused on <b>${escapeHtml(ctxPage.title || 'Untitled')}</b>` : ''}</span>` });
  const composer = h('div', { class: 'chat-composer' }, h('div', { class: 'chat-box' }, input, h('div', { class: 'chat-box-foot' }, chip, send)),
    h('div', { class: 'chat-disclaimer', text: 'PumpitYeah AI can make mistakes. Check important info.' }));
  const newBtn = h('button', { class: 'btn btn-ghost btn-sm', html: `${ICONS.edit}<span>New chat</span>`, onclick: () => { controller?.abort(); messages = []; saveChat(messages); draw(); input.focus(); } });
  container.replaceChildren(h('div', { class: 'chat-page' }, h('div', { class: 'chat-top' }, h('div', { class: 'chat-top-title', html: `${ICONS.sparkle}<span>PumpitYeah AI</span>` }), newBtn), thread, composer));

  const linkify = (md) => md.replace(/\[\[([^\]]+)\]\]/g, (m, title) => {
    const p = [...state.pages.values()].find((x) => !x.trashed && (x.title || 'Untitled').toLowerCase() === title.trim().toLowerCase());
    return p ? `[${p.icon ? p.icon + ' ' : ''}${title}](/app/p/${p.id})` : `**${title}**`;
  });

  const suggestions = () => {
    const names = childrenOf(null).slice(0, 6).map((p) => p.title).filter(Boolean);
    const list = [
      ['📝', 'Summarize my latest meeting notes'],
      ['🚀', 'What’s in progress and what’s overdue?'],
      ['📣', 'Draft a weekly status update from my workspace'],
      ['🎯', 'What should I focus on this week?'],
    ];
    if (ctxPage) list.unshift(['📄', `Summarize “${ctxPage.title || 'Untitled'}”`]);
    void names;
    return list.slice(0, 4);
  };

  const draw = () => {
    thread.replaceChildren();
    if (!messages.length) {
      const first = (state.me?.name || '').split(' ')[0];
      thread.append(h('div', { class: 'chat-empty' },
        h('div', { class: 'chat-face', html: ICONS.sparkle }),
        h('h1', { text: `How can I help${first ? ', ' + first : ''}?` }),
        h('p', { text: 'I can read every page in your workspace. Ask questions, find information, or get a first draft.' }),
        h('div', { class: 'chat-suggest' }, suggestions().map(([icon, text]) => h('button', { class: 'chat-sg', onclick: () => ask(text) }, h('span', { class: 'sg-icon', text: icon }), h('span', { text }))))));
      if (!state.ai.enabled) thread.querySelector('.chat-empty').append(aiOffNotice());
      return;
    }
    messages.forEach((m, i) => thread.append(renderMsg(m, i)));
    thread.scrollTop = thread.scrollHeight;
  };
  const renderMsg = (m, i) => {
    if (m.role === 'user') return h('div', { class: 'msg user' }, h('div', { class: 'bubble', text: m.content }));
    const body = h('div', { class: 'msg-body rich', html: m.content ? mdToHtml(linkify(m.content)) : '' });
    if (m.error) body.append(h('div', { class: 'ai-err', text: m.error }));
    const el = h('div', { class: 'msg ai' }, h('div', { class: 'msg-avatar', html: ICONS.sparkle }), h('div', { class: 'msg-main' }, body));
    if (m.content && !m.streaming) {
      el.querySelector('.msg-main').append(h('div', { class: 'msg-actions' },
        h('button', { class: 'ai-act', html: `${ICONS.copy}<span>Copy</span>`, onclick: async () => { await navigator.clipboard.writeText(m.content); toast('Copied'); } }),
        h('button', { class: 'ai-act', html: `${ICONS.doc}<span>Save as page</span>`, onclick: async () => {
          const q = messages[i - 1]?.content || 'AI answer';
          const id = await ctx.createPageFromBlocks(q.slice(0, 80), mdToBlocks(m.content.replace(/\[\[([^\]]+)\]\]/g, '**$1**')));
          toast('Saved as a new page', { action: 'Open', onAction: () => ctx.navigate(id) });
        } }),
        i === messages.length - 1 ? h('button', { class: 'ai-act', html: `${ICONS.refresh}<span>Retry</span>`, onclick: () => { messages.pop(); const last = messages.pop(); ask(last.content); } }) : null));
    }
    if (m.streaming) body.insertAdjacentHTML('beforeend', m.content ? '<span class="ai-cursor"></span>' : '<span class="ai-dots"><i></i><i></i><i></i></span>');
    return el;
  };
  thread.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/app/p/"]');
    if (a) { e.preventDefault(); ctx.navigate(a.getAttribute('href').split('/').pop()); }
  });

  const ask = async (text) => {
    if (controller || !text.trim()) return;
    messages.push({ role: 'user', content: text.trim() });
    const reply = { role: 'assistant', content: '', streaming: true };
    messages.push(reply);
    input.value = ''; autosize();
    draw();
    controller = new AbortController();
    send.innerHTML = ICONS.stop;
    const payload = messages.filter((m) => !m.error && m.content && m !== reply).map((m) => ({ role: m.role, content: m.content }));
    let pending = false;
    try {
      await streamPost('/ai/chat', { messages: payload, pageId: ctx.contextPageId }, (t) => {
        reply.content = t;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; const last = thread.lastElementChild; last?.replaceWith(renderMsg(reply, messages.length - 1)); thread.scrollTop = thread.scrollHeight; });
      }, controller.signal);
    } catch (e) {
      if (e.name !== 'AbortError') reply.error = e.message;
    } finally {
      reply.streaming = false;
      controller = null;
      send.innerHTML = ICONS.send;
      if (!reply.content && !reply.error) messages.pop();
      saveChat(messages.filter((m) => !m.error));
      draw();
      input.focus();
    }
  };

  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(200, input.scrollHeight) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  send.addEventListener('click', () => (controller ? controller.abort() : ask(input.value)));

  draw();
  if (ctx.initialPrompt) ask(ctx.initialPrompt);
  else setTimeout(() => input.focus(), 0);
  return { destroy: () => controller?.abort() };
}

export function aiOffNotice() {
  return h('div', { class: 'ai-off' },
    h('b', { text: 'AI isn’t connected yet. ' }),
    h('span', { html: 'Add <code>ANTHROPIC_API_KEY</code> to <code>pumpityeah/.env</code> and restart the server to turn on PumpitYeah AI.' }));
}
