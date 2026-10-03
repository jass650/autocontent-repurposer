// Databases: table + board views, typed properties, inline cell editors, row property panel.
import { h, ICONS, popover, menuList, closePopover, formatDate, uid, toast, escapeHtml } from './common.js';

export const PROP_TYPES = [
  { type: 'text', label: 'Text', icon: ICONS.text },
  { type: 'number', label: 'Number', icon: ICONS.hash },
  { type: 'select', label: 'Select', icon: ICONS.chevronDown },
  { type: 'multi_select', label: 'Multi-select', icon: ICONS.list },
  { type: 'status', label: 'Status', icon: ICONS.status },
  { type: 'date', label: 'Date', icon: ICONS.calendar },
  { type: 'person', label: 'Person', icon: ICONS.user },
  { type: 'checkbox', label: 'Checkbox', icon: ICONS.checkbox },
];
const typeIcon = (t) => PROP_TYPES.find((p) => p.type === t)?.icon || ICONS.text;
const OPTION_COLORS = ['blue', 'green', 'orange', 'purple', 'pink', 'yellow', 'red', 'brown', 'gray'];
const hasOptions = (p) => ['select', 'multi_select', 'status'].includes(p.type);

function optColor(prop, name) { return prop.options?.find((o) => o.name === name)?.color || 'default'; }
function tag(prop, name) {
  const color = optColor(prop, name);
  const t = h('span', { class: `tag c-${color}` });
  if (prop.type === 'status') t.append(h('span', { class: 'status-dot' }));
  t.append(document.createTextNode(name));
  return t;
}
function avatar(name) {
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return h('span', { class: 'avatar', style: { background: `hsl(${hue} 55% 55%)` }, text: name.trim()[0]?.toUpperCase() || '?' });
}

export function renderValue(prop, v) {
  const wrap = h('div', { class: `cell-val cv-${prop.type}` });
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) {
    if (prop.type === 'checkbox') wrap.append(h('span', { class: 'cbox' }));
    else wrap.classList.add('empty');
    return wrap;
  }
  switch (prop.type) {
    case 'select': case 'status': wrap.append(tag(prop, v)); break;
    case 'multi_select': (Array.isArray(v) ? v : [v]).forEach((x) => wrap.append(tag(prop, x))); break;
    case 'date': wrap.textContent = formatDate(v); break;
    case 'person': wrap.append(avatar(String(v)), h('span', { text: v })); break;
    case 'checkbox': wrap.append(h('span', { class: `cbox ${v ? 'on' : ''}`, html: v ? ICONS.check : '' })); break;
    case 'number': wrap.textContent = Number(v).toLocaleString(); break;
    default: wrap.textContent = v;
  }
  return wrap;
}

// Opens the right editor for a property value. onSave(newValue, {schemaChanged}) is called on change.
export function editValue(anchor, prop, value, onSave) {
  if (prop.type === 'checkbox') { onSave(!value); return; }
  if (hasOptions(prop)) return optionPicker(anchor, prop, value, onSave);
  if (prop.type === 'date') {
    const input = h('input', { type: 'date', class: 'pop-input', value: value || '' });
    const box = h('div', { class: 'pop-pad' }, input,
      h('div', { class: 'pop-row' },
        h('button', { class: 'btn btn-ghost btn-sm', text: 'Today', onclick: () => { onSave(new Date().toISOString().slice(0, 10)); pop.close(); } }),
        h('button', { class: 'btn btn-ghost btn-sm', text: 'Clear', onclick: () => { onSave(''); pop.close(); } })));
    input.addEventListener('change', () => onSave(input.value));
    const pop = popover(anchor, box, { width: 260 });
    setTimeout(() => input.focus(), 0);
    return;
  }
  const input = h(prop.type === 'number' ? 'input' : 'textarea', {
    class: 'pop-input', rows: 3, type: prop.type === 'number' ? 'number' : undefined, placeholder: prop.type === 'person' ? 'Name' : 'Empty',
  });
  input.value = value ?? '';
  const commit = () => {
    const v = prop.type === 'number' ? (input.value === '' ? null : Number(input.value)) : input.value.trim();
    if (v !== value) onSave(v);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pop.close(); } });
  const pop = popover(anchor, h('div', { class: 'pop-pad' }, input), { width: Math.max(240, anchor.offsetWidth || 0), onClose: commit, offset: -(anchor.offsetHeight || 0) });
  setTimeout(() => { input.focus(); input.select?.(); }, 0);
}

function optionPicker(anchor, prop, value, onSave) {
  const multi = prop.type === 'multi_select';
  let current = multi ? [...(Array.isArray(value) ? value : value ? [value] : [])] : value;
  const search = h('input', { class: 'pop-input', placeholder: multi ? 'Search or create options…' : 'Search or create an option…' });
  const list = h('div', { class: 'opt-list' });
  const chips = h('div', { class: 'opt-chips' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    chips.replaceChildren(...(multi ? current : current ? [current] : []).map((n) => {
      const t = tag(prop, n);
      t.append(h('button', { class: 'tag-x', 'aria-label': `Remove ${n}`, html: '×', onclick: () => choose(n) }));
      return t;
    }));
    list.replaceChildren(h('div', { class: 'menu-header', text: multi ? 'Select options' : 'Select an option' }));
    const opts = (prop.options || []).filter((o) => !q || o.name.toLowerCase().includes(q));
    opts.forEach((o) => list.append(h('button', { class: 'menu-item', onclick: () => choose(o.name) },
      h('span', { class: 'menu-label' }, tag(prop, o.name)),
      (multi ? current.includes(o.name) : current === o.name) ? h('span', { class: 'menu-check', html: ICONS.check }) : null)));
    if (q && !(prop.options || []).some((o) => o.name.toLowerCase() === q)) {
      list.append(h('button', { class: 'menu-item', onclick: () => create(search.value.trim()) },
        h('span', { class: 'menu-label' }, 'Create ', h('span', { class: `tag c-${OPTION_COLORS[(prop.options || []).length % OPTION_COLORS.length]}`, text: search.value.trim() }))));
    }
  };
  const choose = (name) => {
    if (multi) {
      current = current.includes(name) ? current.filter((x) => x !== name) : [...current, name];
      onSave([...current]);
      draw();
    } else {
      current = current === name ? '' : name;
      onSave(current);
      pop.close();
    }
  };
  const create = (name) => {
    if (!name) return;
    prop.options = [...(prop.options || []), { name, color: OPTION_COLORS[(prop.options || []).length % OPTION_COLORS.length] }];
    search.value = '';
    if (multi) { current = [...current, name]; onSave([...current], { schemaChanged: true }); draw(); }
    else { current = name; onSave(name, { schemaChanged: true }); pop.close(); }
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = search.value.trim();
      const match = (prop.options || []).find((o) => o.name.toLowerCase() === q.toLowerCase()) || (prop.options || []).find((o) => o.name.toLowerCase().includes(q.toLowerCase()));
      if (q && match) choose(match.name); else create(q);
    }
  });
  draw();
  const pop = popover(anchor, h('div', { class: 'pop-pad' }, chips, search, list), { width: 280 });
  setTimeout(() => search.focus(), 0);
}

// ---------- database view ----------
export function renderDatabase(container, page, ctx) {
  // ctx: { navigate(id), save(patch), createRow(props) -> Promise<row>, trashRow(id), saveRow(id, patch) }
  const local = { q: '', sort: null };
  const groupProp = () => page.schema.find((p) => p.id === page.groupBy) || page.schema.find((p) => p.type === 'status') || page.schema.find((p) => p.type === 'select');

  const draw = () => {
    const bar = h('div', { class: 'db-bar' });
    const tabs = h('div', { class: 'db-tabs', role: 'tablist' },
      h('button', { class: `db-tab ${page.view !== 'board' ? 'active' : ''}`, role: 'tab', 'aria-selected': String(page.view !== 'board'), html: `${ICONS.table}<span>Table</span>`, onclick: () => setView('table') }),
      h('button', { class: `db-tab ${page.view === 'board' ? 'active' : ''}`, role: 'tab', 'aria-selected': String(page.view === 'board'), html: `${ICONS.board}<span>Board</span>`, onclick: () => setView('board') }));
    const search = h('input', { class: 'db-search', type: 'search', placeholder: 'Search…', value: local.q, 'aria-label': 'Search this database' });
    search.addEventListener('input', () => { local.q = search.value; drawBody(); });
    const newBtn = h('button', { class: 'btn btn-primary btn-sm', html: `New`, onclick: () => addRow({}) });
    bar.append(tabs, h('div', { class: 'db-actions' }, h('span', { class: 'db-search-wrap', html: ICONS.search }, search), newBtn));
    const body = h('div', { class: 'db-body' });
    container.replaceChildren(bar, body);
    const drawBody = () => { body.replaceChildren(page.view === 'board' ? board() : table()); };
    drawBody();
  };
  const setView = (v) => {
    if (v === 'board' && !groupProp()) { toast('Add a Select or Status property to use Board view.'); return; }
    page.view = v;
    ctx.save({ view: v });
    draw();
  };
  const visibleRows = () => {
    let rows = page.rows.filter((r) => !local.q || (r.title || '').toLowerCase().includes(local.q.toLowerCase()));
    if (local.sort) {
      const { pid, dir } = local.sort;
      const val = (r) => (pid === '__title' ? r.title : r.props[pid]) ?? '';
      rows = [...rows].sort((a, b) => {
        const va = val(a), vb = val(b);
        const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb));
        return dir === 'asc' ? c : -c;
      });
    }
    return rows;
  };
  const saveRowProp = (row, pid, v, opts = {}) => {
    row.props = { ...row.props, [pid]: v };
    ctx.saveRow(row.id, { props: row.props });
    if (opts.schemaChanged) ctx.save({ schema: page.schema });
  };
  const addRow = async (props, focus = true) => {
    try {
      const row = await ctx.createRow(props);
      page.rows.push({ id: row.id, title: '', icon: '', props: row.props || {}, order: row.order });
      draw();
      if (!focus) return;
      if (page.view === 'board') ctx.navigate(row.id);
      else container.querySelector(`tr[data-id="${row.id}"] .name-text`)?.focus();
    } catch (e) { toast(e.message, { type: 'error' }); }
  };

  // ----- table -----
  const table = () => {
    const wrap = h('div', { class: 'db-table-wrap' });
    const tbl = h('table', { class: 'db-table' });
    const headRow = h('tr');
    const sortMark = (pid) => (local.sort?.pid === pid ? (local.sort.dir === 'asc' ? ' ↑' : ' ↓') : '');
    const nameTh = h('th', { class: 'th-name' }, h('button', { class: 'th-btn', html: `${ICONS.text}<span>Name${sortMark('__title')}</span>`, onclick: (e) => headerMenu(e.currentTarget, null) }));
    headRow.append(nameTh);
    for (const prop of page.schema) {
      headRow.append(h('th', {}, h('button', { class: 'th-btn', html: `${typeIcon(prop.type)}<span>${escapeHtml(prop.name)}${sortMark(prop.id)}</span>`, onclick: (e) => headerMenu(e.currentTarget, prop) })));
    }
    headRow.append(h('th', { class: 'th-add' }, h('button', { class: 'th-btn', 'aria-label': 'Add a property', html: ICONS.plus, onclick: (e) => addProperty(e.currentTarget) })));
    tbl.append(h('thead', {}, headRow));
    const tbody = h('tbody');
    const rows = visibleRows();
    for (const row of rows) {
      const tr = h('tr', { 'data-id': row.id });
      const name = h('span', { class: 'name-text', contenteditable: 'plaintext-only', 'data-placeholder': 'Untitled', spellcheck: 'false' });
      name.textContent = row.title || '';
      name.addEventListener('input', () => { row.title = name.textContent; ctx.saveRow(row.id, { title: row.title }); });
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); name.blur(); } });
      const nameTd = h('td', { class: 'td-name' },
        h('div', { class: 'name-wrap' },
          row.icon ? h('span', { class: 'row-icon', text: row.icon }) : h('span', { class: 'row-icon dim', html: ICONS.doc }),
          name,
          h('div', { class: 'row-tools' },
            h('button', { class: 'row-open', html: `${ICONS.open}<span>Open</span>`, onclick: () => ctx.navigate(row.id) }),
            h('button', { class: 'row-del', title: 'Delete row', 'aria-label': 'Delete row', html: ICONS.trash, onclick: () => deleteRow(row) }))));
      tr.append(nameTd);
      for (const prop of page.schema) {
        const td = h('td', { class: `td-${prop.type}`, tabindex: '0' });
        const paint = () => td.replaceChildren(renderValue(prop, row.props[prop.id]));
        paint();
        const open = () => editValue(td, prop, row.props[prop.id], (v, o) => { saveRowProp(row, prop.id, v, o); paint(); });
        td.addEventListener('click', open);
        td.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); open(); } });
        tr.append(td);
      }
      tr.append(h('td', { class: 'td-pad' }));
      tbody.append(tr);
    }
    tbl.append(tbody);
    wrap.append(tbl);
    if (!rows.length) wrap.append(h('div', { class: 'db-empty', text: local.q ? 'No results.' : 'No entries yet. Click “New” to add one.' }));
    wrap.append(h('button', { class: 'db-new-row', html: `${ICONS.plus}<span>New</span>`, onclick: () => addRow({}) }));
    wrap.append(h('div', { class: 'db-count', text: `Count ${rows.length}` }));
    return wrap;
  };

  const deleteRow = async (row) => {
    await ctx.trashRow(row.id);
    page.rows = page.rows.filter((r) => r.id !== row.id);
    draw();
    toast('Moved to trash', { action: 'Undo', onAction: async () => { await ctx.restoreRow(row.id); page.rows.push(row); draw(); } });
  };

  const headerMenu = (anchor, prop) => {
    const pid = prop ? prop.id : '__title';
    let pop;
    const items = [];
    if (prop) {
      const nameIn = h('input', { class: 'pop-input', value: prop.name, 'aria-label': 'Property name' });
      nameIn.addEventListener('change', () => { prop.name = nameIn.value.trim() || prop.name; ctx.save({ schema: page.schema }); draw(); });
      nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { nameIn.dispatchEvent(new Event('change')); pop.close(); } });
      const box = h('div', {}, h('div', { class: 'pop-pad' }, nameIn));
      items.push(
        { label: 'Sort ascending', icon: '↑', onClick: () => { local.sort = { pid, dir: 'asc' }; draw(); } },
        { label: 'Sort descending', icon: '↓', onClick: () => { local.sort = { pid, dir: 'desc' }; draw(); } },
      );
      if (local.sort) items.push({ label: 'Clear sort', icon: '×', onClick: () => { local.sort = null; draw(); } });
      items.push({ divider: true }, { header: 'Property type' });
      PROP_TYPES.forEach((t) => items.push({ label: t.label, icon: t.icon, active: prop.type === t.type, onClick: () => changeType(prop, t.type) }));
      items.push({ divider: true }, { label: 'Delete property', icon: ICONS.trash, danger: true, onClick: () => {
        page.schema = page.schema.filter((p) => p !== prop);
        ctx.save({ schema: page.schema });
        draw();
      } });
      box.append(menuList(items, () => pop.close()));
      pop = popover(anchor, box, { width: 240 });
      setTimeout(() => nameIn.focus(), 0);
    } else {
      items.push(
        { label: 'Sort ascending', icon: '↑', onClick: () => { local.sort = { pid, dir: 'asc' }; draw(); } },
        { label: 'Sort descending', icon: '↓', onClick: () => { local.sort = { pid, dir: 'desc' }; draw(); } },
      );
      if (local.sort) items.push({ label: 'Clear sort', icon: '×', onClick: () => { local.sort = null; draw(); } });
      pop = popover(anchor, menuList(items, () => pop.close()), { width: 220 });
    }
  };
  const changeType = (prop, type) => {
    if (prop.type === type) return;
    const fromOptions = hasOptions(prop), toOptions = ['select', 'multi_select', 'status'].includes(type);
    prop.type = type;
    if (toOptions && !prop.options) prop.options = [];
    if (!toOptions) delete prop.options;
    // Best-effort value conversion so the column never shows garbage
    for (const row of page.rows) {
      let v = row.props[prop.id];
      if (v == null) continue;
      if (type === 'multi_select') v = Array.isArray(v) ? v : String(v) ? [String(v)] : [];
      else if (toOptions) v = Array.isArray(v) ? v[0] || '' : String(v);
      else if (type === 'number') v = Number.isFinite(Number(v)) ? Number(v) : null;
      else if (type === 'checkbox') v = !!v && v !== 'false';
      else if (type === 'date') v = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';
      else v = Array.isArray(v) ? v.join(', ') : String(v);
      if (toOptions && v) for (const name of [].concat(v)) if (!prop.options.some((o) => o.name === name)) prop.options.push({ name, color: OPTION_COLORS[prop.options.length % OPTION_COLORS.length] });
      row.props[prop.id] = v;
      ctx.saveRow(row.id, { props: row.props });
    }
    void fromOptions;
    ctx.save({ schema: page.schema });
    draw();
  };
  const addProperty = (anchor) => {
    let pop;
    const nameIn = h('input', { class: 'pop-input', placeholder: 'Property name', 'aria-label': 'Property name' });
    const add = (type) => {
      const name = nameIn.value.trim() || PROP_TYPES.find((t) => t.type === type).label;
      const prop = { id: uid(), name, type };
      if (hasOptions(prop)) prop.options = type === 'status'
        ? [{ name: 'Not started', color: 'gray' }, { name: 'In progress', color: 'blue' }, { name: 'Done', color: 'green' }] : [];
      page.schema.push(prop);
      ctx.save({ schema: page.schema });
      pop.close();
      draw();
    };
    const box = h('div', {}, h('div', { class: 'pop-pad' }, nameIn), menuList([{ header: 'Type' }, ...PROP_TYPES.map((t) => ({ label: t.label, icon: t.icon, onClick: () => add(t.type) }))]));
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') add('text'); });
    pop = popover(anchor, box, { width: 240, align: 'end' });
    setTimeout(() => nameIn.focus(), 0);
  };

  // ----- board -----
  const board = () => {
    const gp = groupProp();
    const wrap = h('div', { class: 'board' });
    if (!gp) { wrap.append(h('div', { class: 'db-empty', text: 'Add a Select or Status property to group cards.' })); return wrap; }
    const rows = visibleRows();
    const groups = [...(gp.options || []).map((o) => ({ name: o.name, color: o.color })), { name: '', color: 'default' }];
    const others = page.schema.filter((p) => p !== gp);
    for (const g of groups) {
      const cards = rows.filter((r) => (r.props[gp.id] || '') === g.name);
      if (!g.name && !cards.length) continue;
      const col = h('div', { class: 'board-col', 'data-group': g.name });
      col.append(h('div', { class: 'board-head' },
        g.name ? tag(gp, g.name) : h('span', { class: 'tag c-default', text: `No ${gp.name}` }),
        h('span', { class: 'board-count', text: String(cards.length) })));
      const list = h('div', { class: 'board-list' });
      for (const row of cards) {
        const card = h('div', { class: 'board-card', draggable: 'true', tabindex: '0', role: 'button', 'aria-label': row.title || 'Untitled' },
          h('div', { class: 'card-title' }, row.icon ? h('span', { text: row.icon + ' ' }) : null, h('span', { text: row.title || 'Untitled', class: row.title ? '' : 'dim' })));
        const propsBox = h('div', { class: 'card-props' });
        for (const p of others) {
          const v = row.props[p.id];
          if (v == null || v === '' || (Array.isArray(v) && !v.length) || p.type === 'checkbox') continue;
          propsBox.append(renderValue(p, v));
        }
        if (propsBox.childNodes.length) card.append(propsBox);
        card.addEventListener('click', () => ctx.navigate(row.id));
        card.addEventListener('keydown', (e) => { if (e.key === 'Enter') ctx.navigate(row.id); });
        card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', row.id); e.dataTransfer.effectAllowed = 'move'; card.classList.add('dragging'); });
        card.addEventListener('dragend', () => card.classList.remove('dragging'));
        list.append(card);
      }
      col.append(list);
      col.append(h('button', { class: 'board-new', html: `${ICONS.plus}<span>New</span>`, onclick: () => addRow(g.name ? { [gp.id]: g.name } : {}) }));
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', (e) => {
        e.preventDefault();
        col.classList.remove('over');
        const row = page.rows.find((r) => r.id === e.dataTransfer.getData('text/plain'));
        if (!row || (row.props[gp.id] || '') === g.name) return;
        saveRowProp(row, gp.id, g.name);
        draw();
      });
      wrap.append(col);
    }
    return wrap;
  };

  draw();
  return { redraw: draw };
}

// Property panel at the top of a database row page
export function renderRowProps(container, row, schema, ctx) {
  // ctx: { saveRow(patch), saveSchema(schema) }
  container.replaceChildren();
  for (const prop of schema) {
    const val = h('div', { class: 'prop-value', tabindex: '0', role: 'button' });
    const paint = () => val.replaceChildren(renderValue(prop, row.props?.[prop.id]));
    paint();
    const open = () => editValue(val, prop, row.props?.[prop.id], (v, o) => {
      row.props = { ...(row.props || {}), [prop.id]: v };
      ctx.saveRow({ props: row.props });
      if (o?.schemaChanged) ctx.saveSchema(schema);
      paint();
    });
    val.addEventListener('click', open);
    val.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
    container.append(h('div', { class: 'prop-row' },
      h('div', { class: 'prop-name', html: `${typeIcon(prop.type)}<span>${escapeHtml(prop.name)}</span>` }), val));
  }
  void closePopover;
}
