/* ===================== UI infrastructure ===================== */
const RENDER = {}, AFTER = {}, OPEN = {}, ACT = {};
let VIEW = 'overview', drawerFn = null, renderPending = false;
const VIEWS = [
  ['grp', 'Command'], ['overview', 'Overview'], ['assistant', 'AI Assistant'],
  ['grp', 'Operations'], ['orders', 'Orders'], ['ppc', 'Project Planning & Control (PPC)'],
  ['grp', 'Departments'], ['manufacturing', 'Manufacturing'], ['qc', 'Quality Control'], ['qa', 'Quality Assurance'], ['dispatch', 'Dispatch'],
  ['grp', 'Setup'], ['masters', 'Master Data']
];
const NAV_SHORT = { ppc: 'PPC' };
const CRUMB = { overview: 'Management', assistant: 'Management', orders: 'Operations', ppc: 'Operations', manufacturing: 'Department', qc: 'Department', qa: 'Department', dispatch: 'Department', masters: 'Setup' };
function navCounts() {
  const c = { orders: S.orders.filter(o => !o.projectId).length, ppc: S.projects.filter(p => pStatus(p) === 'Active').length };
  Object.keys(DEPT_VIEW).forEach(v => { c[v] = deptBatches(v).length; c[v + '_new'] = deptNew(v); });
  c.ppc_new = S.projects.reduce((t, p) => t + unreadRemarks(p.id), 0);
  return c;
}
function renderNav() {
  const c = navCounts();
  $('#nav').innerHTML = VIEWS.map(([k, l]) => k === 'grp' ? `<div class="grp">${l}</div>` :
    `<button type="button" data-nav="${k}" class="${VIEW === k ? 'on' : ''}" title="${l}">${ico(k)}<span class="lbl">${l}</span>${c[k + '_new'] ? `<span class="cnt hot" title="${c[k + '_new']} new">${c[k + '_new']} new</span>` : c[k] ? `<span class="cnt">${c[k]}</span>` : ''}</button>`).join('');
}
function go(v) {
  if (!RENDER[v]) v = 'overview'; VIEW = v;
  if (DEPT_VIEW[v]) { VISIT_PREV[v] = deptSeen(v); LS.set('ot-seen-' + v, nowISO()); }
  try { if (location.hash !== '#' + v) history.replaceState(null, '', '#' + v); } catch (e) { }
  $('#side').classList.remove('open'); closePop(); render(true); $('#view').scrollTop = 0;
}
function scheduleRender() { if (renderPending) return; renderPending = true; requestAnimationFrame(() => { renderPending = false; render(); }); }
let deferred = false;
function render(force) {
  const ae = document.activeElement;
  if (!force && ae && ae.matches && ae.matches('input,textarea,select,[contenteditable]') && (ae.closest('#view') || ae.closest('.drawer'))) { if (!deferred) { deferred = true; ae.addEventListener('blur', () => { deferred = false; setTimeout(scheduleRender, 50); }, { once: true }); } return; }
  renderNav();
  const t = VIEWS.find(v => v[0] === VIEW); $('#title').textContent = t ? t[1] : ''; $('#crumb').textContent = CRUMB[VIEW] || '';
  const st = $('#view').scrollTop;
  destroyCharts('view');
  $('#view').innerHTML = `<div class="view-in">${modeBanner()}${RENDER[VIEW]()}</div>`;
  $('#view').scrollTop = st;
  (AFTER[VIEW] || (() => { }))();
  if (drawerFn) renderDrawer();
}
function modeBanner() { return MODE === 'local' ? `<div class="banner"><b>Working in this browser only.</b> The shared plant database is not reachable from this view, so changes stay on this device. Open the page signed in on claude.ai to work on the shared data.</div>` : ''; }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3400); }

/* ===================== searchable dropdown (combobox) ===================== */
/* Every filter and every master-backed field uses this. strict = value must come from the list. */
const CBX = {}; let CBXN = 0;
function combo({ opts, value = '', k, flt, tcf, strict = true, all = '', ph = 'Search…', id, onPick, cls = '', ro = false }) {
  const cid = id || ('cb' + (++CBXN));
  const list = (typeof opts === 'function' ? opts() : opts).map(o => typeof o === 'object' ? o : { v: String(o), l: String(o) });
  const full = all ? [{ v: '', l: all }, ...list] : list;
  if (strict && value !== '' && value !== null && value !== undefined && !full.some(o => o.v === String(value))) full.push({ v: String(value), l: String(value), sub: 'Existing value, not in Master Data yet' });
  CBX[cid] = { opts: full, strict, onPick };
  const cur = full.find(o => o.v === String(value ?? ''));
  const label = cur ? (cur.v === '' && all ? '' : cur.l) : (strict ? '' : String(value ?? ''));
  return `<div class="cbx ${cls}"><input id="${cid}" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" autocomplete="off" spellcheck="false" data-cbx="${cid}" data-val="${esc(cur ? cur.v : (strict ? '' : value ?? ''))}" value="${esc(label)}" placeholder="${esc(all && !label ? all : ph)}" ${k ? `data-k="${k}"` : ''} ${flt ? `data-flt="${flt}"` : ''} ${tcf ? `data-tcf="${tcf}"` : ''} ${ro ? 'readonly' : ''}><span class="cbx-car" aria-hidden="true">▾</span></div>`;
}
let POP = null;
function closePop() { if (POP) { POP.el.remove(); POP.input.setAttribute('aria-expanded', 'false'); POP = null; } }
function openPop(input) {
  const c = CBX[input.dataset.cbx]; if (!c || input.readOnly) return;
  if (!POP || POP.input !== input) { closePop(); const el = document.createElement('div'); el.className = 'cbx-pop'; el.setAttribute('role', 'listbox'); document.body.appendChild(el); POP = { el, input, idx: 0, list: [] }; input.setAttribute('aria-expanded', 'true'); }
  const q = (POP.typed ? input.value : '').trim().toLowerCase();
  POP.list = c.opts.filter(o => !q || o.l.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q) || o.v.toLowerCase().includes(q)).slice(0, 200);
  POP.idx = Math.min(POP.idx, Math.max(0, POP.list.length - 1));
  POP.el.innerHTML = POP.list.length ? POP.list.map((o, i) => `<div class="cbx-opt ${i === POP.idx ? 'on' : ''} ${o.v === input.dataset.val ? 'sel' : ''}" role="option" data-i="${i}">${esc(o.l)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>`).join('') : `<div class="cbx-empty">${c.strict ? 'Not in Master Data. Add it under Master Data first.' : 'No match'}</div>`;
  placePop();
}
function placePop() { if (!POP) return; const r = POP.input.getBoundingClientRect(); const h = Math.min(300, POP.el.scrollHeight); const below = window.innerHeight - r.bottom > h + 12 || r.top < h + 12; POP.el.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 240) - 8)) + 'px'; POP.el.style.minWidth = Math.max(r.width, 240) + 'px'; POP.el.style.top = (below ? r.bottom + 4 : r.top - h - 4) + 'px'; }
function pick(input, o) {
  const c = CBX[input.dataset.cbx]; input.dataset.val = o.v; input.value = (o.v === '' && c.opts[0] && c.opts[0].v === '') ? '' : o.l; input.classList.remove('bad'); closePop();
  if (c.onPick) c.onPick(o, input);
  input.dispatchEvent(new CustomEvent('pick', { bubbles: true, detail: o }));
}
function commitTyped(input) {
  const c = CBX[input.dataset.cbx]; if (!c) return; const t = input.value.trim();
  if (!t) { if (input.dataset.val !== '') { const blank = c.opts.find(o => o.v === '') || { v: '', l: '' }; if (c.strict || c.opts[0]?.v === '') pick(input, blank); else input.dataset.val = ''; } return; }
  const m = c.opts.find(o => o.l.toLowerCase() === t.toLowerCase() || o.v.toLowerCase() === t.toLowerCase());
  if (m) { if (m.v !== input.dataset.val) pick(input, m); else input.value = m.v === '' ? '' : m.l; return; }
  if (c.strict) { const cur = c.opts.find(o => o.v === input.dataset.val); input.value = cur && cur.v !== '' ? cur.l : ''; input.classList.add('bad'); toast(`"${t}" is not in Master Data. Pick from the list, or add it under Master Data first.`); }
  else input.dataset.val = t;
}
document.addEventListener('focusin', e => { const i = e.target.closest && e.target.closest('[data-cbx]'); if (i) { if (POP && POP.input !== i) closePop(); POP && (POP.typed = false); setTimeout(() => { if (document.activeElement === i) { openPop(i); POP.typed = false; i.select && i.select(); } }, 0); } });
document.addEventListener('input', e => { const i = e.target.closest && e.target.closest('[data-cbx]'); if (i) { if (!POP || POP.input !== i) openPop(i); POP.typed = true; POP.idx = 0; openPop(i); } }, true);
document.addEventListener('keydown', e => {
  const i = e.target.closest && e.target.closest('[data-cbx]'); if (!i) return;
  if (!POP || POP.input !== i) { if (e.key === 'ArrowDown') { openPop(i); e.preventDefault(); } return; }
  if (e.key === 'ArrowDown') { POP.idx = Math.min(POP.idx + 1, POP.list.length - 1); openPop(i); e.preventDefault(); const on = $('.cbx-opt.on', POP.el); on && on.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'ArrowUp') { POP.idx = Math.max(POP.idx - 1, 0); openPop(i); e.preventDefault(); const on = $('.cbx-opt.on', POP.el); on && on.scrollIntoView({ block: 'nearest' }); }
  else if (e.key === 'Enter') { e.preventDefault(); if (POP.list[POP.idx] && (POP.typed || true)) pick(i, POP.list[POP.idx]); }
  else if (e.key === 'Escape') { e.stopPropagation(); closePop(); }
  else if (e.key === 'Tab') { if (POP.typed && POP.list.length === 1) pick(i, POP.list[0]); else { closePop(); commitTyped(i); } }
}, true);
document.addEventListener('mousedown', e => { if (POP && e.target.closest('.cbx-pop')) { e.preventDefault(); const o = e.target.closest('.cbx-opt'); if (o) pick(POP.input, POP.list[+o.dataset.i]); } }, true);
document.addEventListener('focusout', e => { const i = e.target.closest && e.target.closest('[data-cbx]'); if (i) setTimeout(() => { if (document.activeElement !== i) { if (POP && POP.input === i) closePop(); commitTyped(i); } }, 120); });
window.addEventListener('scroll', () => placePop(), true); window.addEventListener('resize', () => placePop());

/* ===================== forms ===================== */
let modalStack = [];
function openModal({ title, body, actions = [], wide = false, onOpen, head = '' }) {
  const id = uid('m'); const layer = $('#layer');
  const sc = document.createElement('div'); sc.className = 'scrim top'; sc.dataset.m = id;
  const md = document.createElement('div'); md.className = 'modal' + (wide ? ' wide' : ''); md.dataset.m = id; md.setAttribute('role', 'dialog'); md.setAttribute('aria-modal', 'true');
  md.innerHTML = `<header><h3>${esc(title)}</h3>${head}<button class="x-btn" type="button" data-close aria-label="Close">×</button></header><div class="mb">${body}</div><footer></footer>`;
  const ft = $('footer', md);
  [{ label: 'Cancel', cls: 'ghost', close: true }, ...actions].forEach(a => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (a.cls || ''); b.innerHTML = a.label; if (a.id) b.id = a.id; b.onclick = async () => { if (a.close) return close(); closePop(); const r = a.run ? await a.run(md) : true; if (r !== false) close(); }; ft.appendChild(b); });
  const close = () => { closePop(); sc.remove(); md.remove(); modalStack = modalStack.filter(x => x !== id); };
  sc.onclick = close; $('[data-close]', md).onclick = close;
  layer.append(sc, md); modalStack.push(id);
  if (onOpen) onOpen(md, close);
  const f = $('input:not([data-cbx]):not([readonly]),textarea', md); if (f) setTimeout(() => f.focus(), 30);
  return { el: md, close };
}
function confirmBox(title, text, label, run, cls = 'danger') { openModal({ title, body: `<p style="margin:0">${text}</p>`, actions: [{ label, cls, run }] }); }
const val = (root, k) => { const e = $(`[data-k="${k}"]`, root); if (!e) return undefined; if (e.dataset.cbx) return e.dataset.val || ''; return e.type === 'checkbox' ? e.checked : e.value.trim(); };
function readForm(root) { const o = {}; $$('[data-k]', root).forEach(e => { if (e.closest('[data-item]')) return; o[e.dataset.k] = e.dataset.cbx ? (e.dataset.val || '') : e.type === 'checkbox' ? e.checked : (e.type === 'number' ? (e.value === '' ? '' : +e.value) : e.value.trim()); }); return o; }
function setField(root, k, v) { const e = $(`[data-k="${k}"]`, root); if (!e) return false; if (e.dataset.cbx) { const c = CBX[e.dataset.cbx]; const o = c.opts.find(x => x.v === String(v ?? '')); if (!o && c.strict) return false; e.dataset.val = o ? o.v : String(v ?? ''); e.value = o ? o.l : String(v ?? ''); return true; } e.value = v ?? ''; return true; }
/* option sources from Master Data */
const MSRC = {
  customers: () => M('customers').map(c => ({ v: c.name, l: c.name, sub: [c.location, c.type].filter(Boolean).join(' · ') })),
  products: () => M('products').map(p => ({ v: p.code, l: p.code, sub: `${p.name || ''}${p.grade ? ' · ' + p.grade : ''}` })),
  salespersons: () => M('salespersons').map(s => ({ v: s.name, l: s.name })),
  units: () => M('units').map(s => ({ v: s.name, l: s.name })),
  packing: () => M('packing').map(s => ({ v: s.name, l: s.name })),
  incoterms: () => M('incoterms').map(s => ({ v: s.name, l: s.name })),
  payment: () => M('payment').map(s => ({ v: s.name, l: s.name })),
  containers: () => M('containers').map(s => ({ v: s.name, l: s.name })),
  shipmodes: () => M('shipmodes').map(s => ({ v: s.name, l: s.name })),
  ports: () => M('ports').map(s => ({ v: s.name, l: s.name, sub: s.country || '' })),
  employees: () => M('employees').map(e => ({ v: e.name, l: e.name, sub: e.dept || '' })),
  departments: () => M('departments').map(d => ({ v: d.name, l: d.name })),
  lines: () => lineNames().map(l => ({ v: l, l })),
  machines: () => M('machines').map(m => ({ v: m.name, l: m.name, sub: m.line || '' })),
  qctests: () => M('qctests').map(q => ({ v: q.name, l: q.name, sub: q.spec || '' })),
  templates: () => (S.templates.length ? S.templates : [tplById('')]).map(t => ({ v: t.id, l: t.name + (t.isDefault ? ' (default)' : ''), sub: t.stages.map(s => s.name).join(' → ') })),
  stages: () => stageMaster().map(s => ({ v: s.name, l: s.name, sub: STAGE_TYPES[s.type] || '' })),
  orderType: () => ['Domestic', 'Export'], orderStatus: () => ['Open', 'Dispatched', 'Closed', 'On Hold'], material: () => ['Available', 'Partial', 'Awaited', 'Not Available']
};
function field(f, v) {
  const id = 'f_' + f.k; const req = f.req ? ' req' : ''; const w = f.wide ? ' wide' : '';
  let input;
  if (f.src) input = combo({ opts: MSRC[f.src], value: v, k: f.k, id, strict: f.strict !== false, ph: f.ph || 'Search and select…', ro: f.ro });
  else if (f.type === 'textarea') input = `<textarea id="${id}" data-k="${f.k}" rows="2" ${f.ro ? 'readonly' : ''}>${esc(v)}</textarea>`;
  else input = `<input id="${id}" data-k="${f.k}" type="${f.type || 'text'}" value="${esc(v)}" ${f.ro ? 'readonly tabindex="-1"' : ''} ${f.type === 'number' ? 'step="any" min="0"' : ''}>`;
  return `<label class="f${req}${w}${f.ro ? ' ro' : ''}" ${f.src ? '' : `for="${id}"`}><span>${esc(f.label)}${f.hint ? ` <em>${esc(f.hint)}</em>` : ''}</span>${input}</label>`;
}

/* ===================== drawer ===================== */
function openDrawer(fn) { drawerFn = fn; renderDrawer(); }
function closeDrawer() { drawerFn = null; destroyCharts('drawer'); closePop(); $('#drawerHost') && $('#drawerHost').remove(); scheduleRender(); }
function renderDrawer() {
  let host = $('#drawerHost');
  if (!host) { host = document.createElement('div'); host.id = 'drawerHost'; host.innerHTML = '<div class="scrim" data-dclose></div><div class="drawer" role="dialog" aria-modal="true"></div>'; $('#layer').prepend(host); }
  const dr = $('.drawer', host); const st = $('.dbody', dr) ? $('.dbody', dr).scrollTop : 0;
  const r = drawerFn(); if (!r) return closeDrawer();
  dr.innerHTML = `<div class="dh-bar">${r.head}<span class="spacer"></span><button class="x-btn" type="button" data-dclose aria-label="Close">×</button></div><div class="dbody">${r.body}</div>`;
  if ($('.dbody', dr)) $('.dbody', dr).scrollTop = st;
  r.after && r.after(dr);
}

/* ===================== tables (sort, search, per-column filters) ===================== */
const TSTATE = {};
const cellText = (c, r) => String(c.x ? c.x(r) : c.sv ? c.sv(r) : c.v(r)).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function table(id, cols, rows, opts = {}) {
  const s = TSTATE[id] = TSTATE[id] || { sort: opts.sort ?? null, dir: opts.dir || 1, q: '', cf: {} };
  let rs = rows;
  Object.entries(s.cf).forEach(([i, v]) => { if (v !== '' && cols[i]) rs = rs.filter(r => cellText(cols[i], r).split(' | ').includes(v) || cellText(cols[i], r) === v); });
  if (s.q) { const q = s.q.toLowerCase(); rs = rs.filter(r => cols.some(c => !c.noexp && cellText(c, r).toLowerCase().includes(q))); }
  if (s.sort != null) { const c = cols[s.sort]; if (c) rs = [...rs].sort(by(r => { const x = c.sv ? c.sv(r) : cellText(c, r); return typeof x === 'number' ? x : String(x ?? '').toLowerCase(); }, s.dir)); }
  const lim = opts.limit || 400, shown = rs.slice(0, lim);
  const anyCf = Object.values(s.cf).some(v => v !== '');
  const filterRow = opts.colFilters ? `<tr class="cf-row">${cols.map((c, i) => `<th class="ns">${c.f === false || c.noexp ? '' : combo({ opts: uniq(rows.flatMap(r => cellText(c, r).split(' | '))).sort(), value: s.cf[i] || '', tcf: `${id}:${i}`, all: 'All', strict: true, cls: 'sm' })}</th>`).join('')}</tr>` : '';
  return `<div class="row tbar">${opts.search === false ? '' : `<div class="tsearch"><input type="search" data-tq="${id}" placeholder="Search this table…" value="${esc(s.q)}"></div>`}<span class="muted" style="font-size:13px">${rs.length} record${rs.length === 1 ? '' : 's'}${rs.length > lim ? `, first ${lim} shown` : ''}</span>${anyCf ? `<button class="link" type="button" data-cfclear="${id}">Clear column filters</button>` : ''}<span class="spacer"></span>${opts.tools || ''}</div>
  <div class="tw"><table class="t"><thead><tr>${cols.map((c, i) => `<th class="${c.r ? 'r' : ''} ${c.ns ? 'ns' : ''}" ${c.ns ? '' : `data-ts="${id}:${i}"`}>${esc(c.h)} ${s.sort === i ? `<span class="ar">${s.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`).join('')}</tr>${filterRow}</thead>
  <tbody>${shown.length ? shown.map(r => `<tr ${opts.click ? `class="click ${opts.rowCls ? opts.rowCls(r) : ''}" data-row="${esc(opts.click(r))}"` : ''}>${cols.map(c => `<td class="${c.r ? 'r num' : ''}">${c.v(r)}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${cols.length}"><div class="empty"><b>${esc(opts.empty || 'Nothing here yet')}</b>${opts.emptyHint || ''}</div></td></tr>`}</tbody></table></div>`;
}
let EXPORTS = {};
const exportRows = (name, cols, rows) => ({ name, cols: cols.filter(c => !c.noexp), rows });
function exportTools(key) { return DL ? `<button class="btn ghost sm" type="button" data-exp="${key}:xlsx">${ico('dl')} Excel</button><button class="btn ghost sm" type="button" data-exp="${key}:pdf">${ico('dl')} PDF</button>` : ''; }
async function doExport(key, fmt) {
  const e = EXPORTS[key]; if (!e || !DL) return;
  const head = e.cols.map(c => c.h), body = e.rows.map(r => e.cols.map(c => cellText(c, r)));
  const fname = `${e.name.replace(/\s+/g, '-')}-${TODAY}`;
  try {
    if (fmt === 'xlsx') { const ws = XLSX.utils.aoa_to_sheet([head, ...body]); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, e.name.slice(0, 30)); const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); await DL.save({ filename: fname + '.xlsx', data: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }); }
    else { const doc = new jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' }); doc.setFontSize(14); doc.text(`OrderTrack — ${e.name}`, 40, 36); doc.setFontSize(9); doc.text(`Generated ${fmtD(TODAY)} · ${body.length} records`, 40, 52); doc.autoTable({ head: [head], body, startY: 62, styles: { fontSize: 7.5, cellPadding: 3 }, headStyles: { fillColor: [20, 88, 200] } }); await DL.save({ filename: fname + '.pdf', data: doc.output('blob') }); }
  } catch (err) { if (err && err.code !== 'declined') toast('Export did not complete: ' + (err.message || err.code || 'unknown')); }
}

/* ===================== filter bar (all searchable) ===================== */
const FLT = { ov: {}, orders: { tab: 'open' }, ppc: {}, mfg: { tab: 'prod' }, qc: { tab: 'queue' }, qa: { tab: 'queue' }, disp: { tab: 'ready' }, masters: { type: 'customers' } };
function filterBar(scope, defs) {
  const f = FLT[scope];
  return `<div class="filters">${defs.map(d => d.type === 'date' ? `<label class="f"><span>${d.label}</span><input type="date" data-flt="${scope}:${d.k}" value="${esc(f[d.k] || '')}"></label>` :
    `<label class="f"><span>${d.label}</span>${combo({ opts: d.opts, value: f[d.k] || '', flt: `${scope}:${d.k}`, all: 'All', strict: true })}</label>`).join('')}<button class="btn ghost sm" type="button" data-act="clearFlt" data-s="${scope}">Reset</button></div>`;
}
ACT.clearFlt = el => { const s = el.dataset.s; const keep = { tab: FLT[s].tab, type: FLT[s].type }; FLT[s] = {}; Object.keys(keep).forEach(k => keep[k] !== undefined && (FLT[s][k] = keep[k])); render(true); };
const DEPT_OPTS = [{ v: 'material', l: 'Stores / Material In' }, { v: 'mfg', l: 'Manufacturing' }, { v: 'qc', l: 'Quality Control' }, { v: 'qa', l: 'Quality Assurance' }, { v: 'ready', l: 'Ready for Dispatch' }, { v: 'dispatch', l: 'Dispatch' }];

/* ===================== uploads ===================== */
const docChips = (docs = []) => docs.length ? `<div class="docs">${docs.map(d => `<span class="doc">${ico('clip').replace('<svg', '<svg width="14" height="14" stroke="currentColor" fill="none" stroke-width="2"')}${d.url ? `<a href="${esc(d.url)}" target="_blank" rel="noopener">${esc(d.name)}</a>` : esc(d.name)}<span class="muted">${fmtD(d.at)}</span></span>`).join('')}</div>` : '<span class="muted">No documents yet.</span>';
function uploadBtn(target) { return ASSETS ? `<label class="btn ghost sm" style="cursor:pointer">${ico('up')} Upload<input type="file" multiple hidden data-upload="${esc(target)}" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.txt,.md,.json"></label>` : `<span class="muted" style="font-size:12.5px">Uploads are available to editors of this page.</span>`; }
async function uploadFiles(files) { const out = []; for (const f of files) { try { const r = await ASSETS.upload(f); out.push({ id: r.id, url: r.url, name: f.name, size: r.sizeBytes, at: TODAY }); } catch (e) { toast(`${f.name} was not uploaded: ${e.message || e.code || 'error'}`); } } return out; }
async function handleUpload(target, files) {
  if (!ASSETS) return; toast(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`);
  const docs = await uploadFiles(files); if (!docs.length) return;
  const [kind, a, c] = target.split(':');
  if (kind === 'project') { const p = clone(P(a)); p.docs = (p.docs || []).concat(docs); put('projects', p); log(`${docs.length} document(s) added to ${pRef(p)}`, a); }
  else if (kind === 'order') { const o = clone(O(a)); o.docs = (o.docs || []).concat(docs); put('orders', o); }
  else {
    const b = clone(B(a));
    if (kind === 'batch') b.docs = (b.docs || []).concat(docs);
    if (kind === 'test') { const t = b.qcTests.find(x => x.id === c); t.docs = (t.docs || []).concat(docs); }
    if (kind === 'coa') b.coa.docs = (b.coa.docs || []).concat(docs);
    if (kind === 'qa') b.qa.docs = (b.qa.docs || []).concat(docs);
    if (kind === 'ship') { const s = b.shipments.find(x => x.id === c); s.docs = (s.docs || []).concat(docs); }
    if (kind === 'rw') { const r = b.reworks.find(x => x.id === c); r.docs = (r.docs || []).concat(docs); }
    saveBatch(b, `${docs.length} document(s) added to batch ${a}`);
  }
  toast('Uploaded'); refreshModals();
}
let modalRefreshers = [];
function refreshModals() { modalRefreshers = modalRefreshers.filter(f => f()); }

/* ===================== charts ===================== */
const CHARTS = { view: [], drawer: [] };
function destroyCharts(scope) { CHARTS[scope].forEach(c => { try { c.destroy(); } catch (e) { } }); CHARTS[scope] = []; }
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
function chart(canvas, type, data, opt = {}, scope = 'view') {
  if (!window.Chart || !canvas) return;
  const fg = tok('--muted'), grid = tok('--line');
  Chart.defaults.font.family = tok('--f-body'); Chart.defaults.color = fg;
  const c = new Chart(canvas, { type, data, options: Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 400 }, plugins: { legend: { labels: { boxWidth: 12, boxHeight: 12, color: fg } }, tooltip: { mode: 'index', intersect: false } }, scales: type === 'doughnut' ? {} : { x: { grid: { color: grid, drawTicks: false }, ticks: { color: fg }, border: { color: grid } }, y: { grid: { color: grid }, ticks: { color: fg }, border: { display: false }, beginAtZero: true } } }, opt) });
  CHARTS[scope].push(c); return c;
}
const SC = () => ({ notstarted: tok('--st-grey'), progress: tok('--st-blue'), done: tok('--st-green'), pending: tok('--st-yellow'), rejected: tok('--st-red'), rework: tok('--st-orange'), accent: tok('--accent'), surface3: tok('--surface-3') });
function kpi(label, value, sub, color, act) { return `<button type="button" class="kpi" style="--k:${color}" ${act ? `data-go="${act}"` : ''}><div class="l">${esc(label)}</div><div class="v">${value}</div>${sub ? `<div class="s">${sub}</div>` : ''}</button>`; }
const strip = list => `<div class="strip">${list.map(([l, v, c]) => `<div class="strip-i" style="--k:${c || 'var(--accent)'}"><span>${esc(l)}</span><b>${v}</b></div>`).join('')}</div>`;
