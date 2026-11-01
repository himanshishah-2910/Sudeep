/* ===================== Orders: list, punch form (multi-product), PDF autofill, import ===================== */
function nextId(prefix, arr, start) { let n = start; const ids = new Set(arr.map(x => x.id)); arr.forEach(x => { const m = String(x.id).match(/(\d+)$/); if (m && String(x.id).startsWith(prefix)) n = Math.max(n, +m[1] + 1); }); while (ids.has(prefix + n)) n++; return prefix + n; }
const orderState = o => { const s = o.status || 'Open'; if (['Dispatched', 'Closed'].includes(s)) return s; if (!o.projectId) return s === 'On Hold' ? 'On Hold' : 'Not Started'; return s; };
const ostPill = o => { const s = orderState(o); return pill({ 'Not Started': 'pending', Open: 'progress', Dispatched: 'done', Closed: 'done', 'On Hold': 'pending' }[s] || 'notstarted', s); };
const itemsCell = o => items(o).map(i => `<div class="it"><b>${esc(i.productName || '—')}</b><span class="muted mono">${esc(i.productCode)}${i.grade ? ' · ' + esc(i.grade) : ''} · ${kg(i.poQty)} kg</span></div>`).join('');

RENDER.orders = () => {
  const f = FLT.orders; const tab = f.tab || 'open';
  let rows = S.orders.filter(o => { const s = orderState(o); return tab === 'all' ? true : tab === 'open' ? ['Open', 'Not Started'].includes(s) : tab === 'hold' ? s === 'On Hold' : ['Dispatched', 'Closed'].includes(s); });
  if (f.type) rows = rows.filter(o => o.orderType === f.type); if (f.unit) rows = rows.filter(o => o.unit === f.unit); if (f.sales) rows = rows.filter(o => o.salesPerson === f.sales); if (f.cust) rows = rows.filter(o => o.customer === f.cust); if (f.prod) rows = rows.filter(o => items(o).some(i => i.productCode === f.prod));
  const cols = [
    { h: 'PO number', v: o => `<b>${esc(o.poNo)}</b>`, sv: o => o.poNo, x: o => o.poNo },
    { h: 'SO number', v: o => `<span class="mono">${esc(o.soNo || '—')}</span>`, sv: o => o.soNo || '', x: o => o.soNo },
    { h: 'SO date', v: o => fmtD(o.soDate), sv: o => o.soDate || '', x: o => o.soDate, f: false },
    { h: 'Type', v: o => esc(o.orderType), sv: o => o.orderType || '' },
    { h: 'Customer', v: o => `${esc(o.customer)}<div class="muted" style="font-size:12px">${esc(o.location)}</div>`, sv: o => o.customer, x: o => o.customer },
    { h: 'Products', v: itemsCell, sv: o => oProducts(o), x: o => items(o).map(i => i.productName).join(' | ') },
    { h: 'PO kg', r: 1, v: o => kg(oPoQty(o)), sv: oPoQty, f: false },
    { h: 'Open kg', r: 1, v: o => kg(oQty(o)), sv: oQty, f: false },
    { h: 'Unit', v: o => esc(o.unit), sv: o => o.unit || '' },
    { h: 'Sales person', v: o => esc(o.salesPerson), sv: o => o.salesPerson || '' },
    { h: 'Raw Delivery Date', v: o => fmtD(o.rowDelivery), sv: o => o.rowDelivery || '', x: o => o.rowDelivery, f: false },
    { h: 'Status', v: ostPill, sv: orderState, x: orderState },
    { h: '', ns: 1, noexp: 1, v: o => o.projectId ? `<button class="link" type="button" data-open="project:${esc(o.projectId)}">Open in PPC</button>` : `<button class="btn sm ok" type="button" data-act="startOrder" data-o="${esc(o.id)}">Start</button>` }
  ];
  EXPORTS.orders = exportRows('Orders', cols, rows);
  const notStarted = rows.filter(o => !o.projectId);
  return `<div class="row"><div class="tabs" role="tablist">${[['open', 'Open orders'], ['hold', 'On hold'], ['closed', 'Dispatched / closed'], ['all', 'All orders']].map(([k, l]) => `<button type="button" role="tab" data-ftab="orders:${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><span class="spacer"></span>
    <button class="btn ghost" type="button" data-act="importSheet">${ico('up')} Import order sheet</button>${DL ? `<button class="btn ghost" type="button" data-act="exportSheet">${ico('dl')} Export order sheet</button>` : ''}<button class="btn" type="button" data-act="newOrder">${ico('plus')} Punch order</button></div>
    ${seedOffer()}${filterBar('orders', [{ k: 'cust', label: 'Customer', opts: () => uniq(S.orders.map(o => o.customer)).sort() }, { k: 'prod', label: 'Product code', opts: () => uniq(S.orders.flatMap(o => items(o).map(i => i.productCode))).sort() }, { k: 'type', label: 'Order type', opts: ['Domestic', 'Export'] }, { k: 'unit', label: 'Unit / PR', opts: () => uniq(S.orders.map(o => o.unit)).sort() }, { k: 'sales', label: 'Sales person', opts: () => uniq(S.orders.map(o => o.salesPerson)).sort() }])}
    <section class="panel">${table('orders', cols, rows, { sort: 2, dir: -1, colFilters: true, click: o => 'order:' + o.id, tools: (notStarted.length ? `<button class="btn ok sm" type="button" data-act="startAll">Start ${notStarted.length} imported order${notStarted.length > 1 ? 's' : ''}</button>` : '') + exportTools('orders'), empty: 'No orders here', emptyHint: '<span>Click Punch order to enter a new PO.</span>' })}</section>`;
};
ACT.newOrder = () => OPEN.order('');

/* ---------- product line rows inside the punch form ---------- */
function itemRowHTML(it, locked) {
  const nb = it.id && it._batches ? it._batches : 0;
  return `<div class="itemrow" data-item="${esc(it.id)}">
    <div class="ir-head"><b class="ir-n"></b>${nb ? `<span class="tag">${nb} batch${nb > 1 ? 'es' : ''} running</span>` : ''}<span class="spacer"></span>${locked ? '' : '<button type="button" class="link danger" data-rmitem>Remove product</button>'}</div>
    <div class="ir-grid">
      <label class="f req"><span>Product code</span>${combo({ opts: MSRC.products, value: it.productCode, strict: true, ph: 'Search code or name…', ro: locked, onPick: (o, inp) => { const p = M('products').find(x => x.code === o.v) || {}; const row = inp.closest('.itemrow'); $('[data-ik="productName"]', row).value = p.name || ''; $('[data-ik="grade"]', row).value = p.grade || ''; } }).replace('data-cbx', 'data-ik="productCode" data-cbx')}</label>
      <label class="f ro wide2"><span>Product name <em>from Master Data</em></span><input data-ik="productName" value="${esc(it.productName)}" readonly tabindex="-1"></label>
      <label class="f ro"><span>Grade <em>from Master Data</em></span><input data-ik="grade" value="${esc(it.grade)}" readonly tabindex="-1"></label>
      <label class="f req"><span>PO qty (kg)</span><input data-ik="poQty" type="number" min="0" step="any" value="${esc(it.poQty)}" ${locked ? 'readonly' : ''}></label>
      <label class="f"><span>Open qty (kg)</span><input data-ik="openQty" type="number" min="0" step="any" value="${esc(it.openQty)}"></label>
      <label class="f"><span>Packing type</span>${combo({ opts: MSRC.packing, value: it.packing, strict: true }).replace('data-cbx', 'data-ik="packing" data-cbx')}</label>
      <label class="f"><span>Pallet formation</span><input data-ik="pallet" value="${esc(it.pallet)}"></label>
      <label class="f req"><span>Workflow for this product</span>${combo({ opts: MSRC.templates, value: it.tplId || tplById('').id, strict: true, ro: locked }).replace('data-cbx', 'data-ik="tplId" data-cbx')}</label>
      <label class="f req"><span>Production line</span>${combo({ opts: MSRC.lines, value: it.line, strict: true, ro: locked }).replace('data-cbx', 'data-ik="line" data-cbx')}</label>
      <label class="f"><span>No. of batches</span><input data-ik="nBatches" type="number" min="1" max="20" step="1" value="${esc(it.nBatches || 1)}" ${locked ? 'readonly' : ''}></label>
      <label class="f wide"><span>Special requirements / customer specifications</span><input data-ik="specialReq" value="${esc(it.specialReq)}"></label>
      <label class="f wide"><span>Marketing remarks</span><input data-ik="mktRemarks" value="${esc(it.mktRemarks)}"></label>
    </div></div>`;
}
function readItems(md) {
  return $$('.itemrow', md).map(row => { const it = { id: row.dataset.item }; $$('[data-ik]', row).forEach(e => { const k = e.dataset.ik; it[k] = e.dataset.cbx ? (e.dataset.val || '') : e.type === 'number' ? (e.value === '' ? '' : +e.value) : e.value.trim(); }); return it; });
}
function numberRows(md) { $$('.itemrow', md).forEach((r, i) => { $('.ir-n', r).textContent = `Product ${i + 1}`; }); }

const ORDER_SECTIONS = [
  ['A. Order information', [{ k: 'poNo', label: 'Order / PO number', req: true }, { k: 'poDate', label: 'PO date', type: 'date' }, { k: 'soNo', label: 'Sales order (SO) number' }, { k: 'soDate', label: 'SO date', type: 'date' }, { k: 'soUpdate', label: 'SO update date', type: 'date' }, { k: 'orderType', label: 'Order type', src: 'orderType' }, { k: 'unit', label: 'Business / production unit (PR)', src: 'units' }, { k: 'salesPerson', label: 'Sales person', src: 'salespersons' }, { k: 'month', label: 'Plan month', type: 'month' }, { k: 'planRemarks', label: 'Planning team remarks', type: 'textarea', wide: true }]],
  ['B. Customer information', [{ k: 'customer', label: 'Customer name', src: 'customers', req: true }, { k: 'location', label: 'Location / country', ro: true, hint: 'from Master Data' }, { k: 'shipToName', label: 'Ship-to customer', src: 'customers' }, { k: 'shipToCode', label: 'Ship-to code', ro: true, hint: 'from Master Data' }, { k: 'custDetails', label: 'Domestic / international customer details', type: 'textarea', wide: true }]],
  ['D. Production and planning', [{ k: 'exPlant', label: 'Ex-plant date', type: 'date' }, { k: 'rowDelivery', label: 'Raw Delivery Date', type: 'date', req: true }, { k: 'tentSampling', label: 'Tentative sampling date', type: 'date' }, { k: 'actSampling', label: 'Actual sampling date', type: 'date' }, { k: 'materialStatus', label: 'Material availability', src: 'material' }]],
  ['E. Dispatch and commercial', [{ k: 'coaDate', label: 'COA released date', type: 'date' }, { k: 'plannedReady', label: 'Planned readiness date', type: 'date' }, { k: 'actualReady', label: 'Actual readiness date', type: 'date' }, { k: 'actualDispatch', label: 'Actual dispatch date', type: 'date' }, { k: 'invoiceNo', label: 'Invoice number' }, { k: 'invoiceDate', label: 'Invoice date', type: 'date' }, { k: 'incoterms', label: 'Incoterms', src: 'incoterms' }, { k: 'port', label: 'Port of discharge', src: 'ports' }, { k: 'shipmentType', label: 'Shipment type', src: 'shipmodes' }, { k: 'containerSize', label: 'Container size', src: 'containers' }, { k: 'paymentTerms', label: 'Payment terms', src: 'payment' }, { k: 'soToInvoiceDays', label: 'Days from SO to invoice', ro: true }, { k: 'status', label: 'Order status', src: 'orderStatus' }, { k: 'planRemarks2', label: 'Planning team remarks (dispatch)', type: 'textarea', wide: true }]]
];
const ALL_ORDER_FIELDS = ORDER_SECTIONS.flatMap(s => s[1]);
OPEN.order = id => {
  const o = id ? normalizeOrder(clone(O(id))) : { id: '', orderType: 'Domestic', materialStatus: 'Available', status: 'Open', poDate: TODAY, soDate: TODAY, month: TODAY.slice(0, 7), items: [] };
  if (o.soDate && o.invoiceDate) o.soToInvoiceDays = dayDiff(o.soDate, o.invoiceDate);
  const bc = {}; if (o.projectId) pBatches(o.projectId).forEach(b => { bc[b.itemId] = (bc[b.itemId] || 0) + 1; });
  const its = o.items.length ? o.items.map(i => Object.assign({}, i, { _batches: bc[i.id] || 0 })) : [{ id: 'L1', nBatches: 1, line: '', tplId: tplById('').id }];
  let pendingPdf = null;
  const sec = (t, fs) => `<fieldset class="sec"><legend>${t}</legend>${fs.map(f => field(f, o[f.k])).join('')}</fieldset>`;
  const body = `<div class="pdfbar"><div><b>Have the PO or SO as a PDF?</b><span class="muted">Upload it and the AI fills in every field it can find. Values must exist in Master Data.</span></div>
      ${SAMPLE ? `<label class="btn ghost" style="cursor:pointer">${ico('pdf')} Upload PO / SO PDF<input type="file" id="pdfIn" accept="application/pdf,.pdf" hidden></label>` : `<span class="muted" style="font-size:13px">PDF autofill needs the Claude connection (open this page signed in on claude.ai).</span>`}</div>
    <div id="pdfStatus"></div>
    ${o.projectId ? `<div class="banner info">This order is live in PPC. Products with running batches are locked; you can add new products.</div>` : ''}
    ${sec(...ORDER_SECTIONS[0])}${sec(...ORDER_SECTIONS[1])}
    <fieldset class="sec items"><legend>C. Products in this order</legend><div class="wide" id="itemRows">${its.map(i => itemRowHTML(i, !!i._batches)).join('')}</div>
      <div class="wide row"><button class="btn ghost sm" type="button" id="addItem">${ico('plus')} Add another product</button><span class="muted" style="font-size:13px">Each product gets its own workflow, production line and batches.</span></div></fieldset>
    ${sec(...ORDER_SECTIONS[2])}${sec(...ORDER_SECTIONS[3])}`;
  const save = md => {
    const r = readForm(md); const its2 = readItems(md).filter(i => i.productCode || i.poQty);
    const miss = ALL_ORDER_FIELDS.filter(f => f.req && !r[f.k] && (!id || f.k === 'poNo' || f.k === 'customer')).map(f => f.label);
    if (!its2.length) miss.push('at least one product');
    its2.forEach((i, n) => { if (!i.productCode) miss.push(`product code (product ${n + 1})`); if (!(+i.poQty > 0 || +i.openQty > 0)) miss.push(`PO or open qty (product ${n + 1})`); if (!i.tplId) miss.push(`workflow (product ${n + 1})`); if (!i.line) miss.push(`production line (product ${n + 1})`); });
    if (miss.length) { toast('Please fill: ' + miss.join(', ')); return false; }
    const key = `${r.poNo}|${r.soNo || ''}`.toLowerCase();
    const dup = S.orders.find(x => x.id !== o.id && `${x.poNo}|${x.soNo || ''}`.toLowerCase() === key);
    if (dup) { toast(`PO ${r.poNo}${r.soNo ? ' / SO ' + r.soNo : ''} already exists. Open that order to add products.`); return false; }
    if (r.soDate && r.invoiceDate) r.soToInvoiceDays = dayDiff(r.soDate, r.invoiceDate);
    const prev = id ? O(id) : null; const prevItems = prev ? items(prev) : [];
    let n = 0; its2.forEach(i => { if (!i.id || its2.filter(x => x.id === i.id).length > 1) i.id = ''; });
    its2.forEach(i => { if (!i.id) { do { n++; } while (its2.some(x => x.id === 'L' + n) || prevItems.some(x => x.id === 'L' + n)); i.id = 'L' + n; } if (i.openQty === '' || i.openQty === undefined) i.openQty = i.poQty; i.nBatches = Math.max(1, Math.min(20, Math.round(+i.nBatches || 1))); });
    its2.forEach((i, k) => { const p0 = prevItems.find(p => p.id === i.id); if (p0) its2[k] = Object.assign({}, p0, i); }); const lockedIds = Object.keys(bc); const keep = prevItems.filter(i => lockedIds.includes(i.id) && !its2.some(x => x.id === i.id));
    const no = Object.assign(o, r, { items: [...keep, ...its2] }); delete no._batches; no.items.forEach(i => delete i._batches);
    if (!no.id) { no.id = nextId('ORD-', S.orders, 2601); no.createdAt = TODAY; }
    if (pendingPdf) no.docs = (no.docs || []).concat([pendingPdf]);
    put('orders', no); log(`${id ? 'Order updated' : 'Order punched'}: ${oRef(no)} · ${no.customer} · ${no.items.length} product${no.items.length > 1 ? 's' : ''}`, no.projectId || '');
    if (no.projectId && no.status === 'On Hold') { const p = P(no.projectId); if (p && p.status !== 'On Hold') put('projects', Object.assign(clone(p), { status: 'On Hold' })); }
    const pid = startOrder(no.id, true);
    const rm = [['planRemarks', 'Planning'], ['planRemarks2', 'Dispatch']]; rm.forEach(([k, d]) => { if (no[k] && (!prev || prev[k] !== no[k])) addRemark(pid, d, no[k], { source: 'Order' }); });
    no.items.forEach(i => { const pi = prevItems.find(x => x.id === i.id) || {}; if (i.mktRemarks && i.mktRemarks !== pi.mktRemarks) addRemark(pid, 'Marketing', `${i.productName}: ${i.mktRemarks}`, { itemId: i.id, source: 'Order' }); if (i.specialReq && i.specialReq !== pi.specialReq) addRemark(pid, 'Marketing', `${i.productName} — special requirement: ${i.specialReq}`, { itemId: i.id, source: 'Order' }); });
    toast(id ? 'Order saved' : `${oRef(no)} punched — workflows started for ${no.items.length} product${no.items.length > 1 ? 's' : ''}`);
  };
  openModal({ title: id ? `Order ${oRef(o)}` : 'Punch order', wide: true, body, onOpen: md => {
    numberRows(md);
    const cust = $('[data-k="customer"]', md);
    cust.addEventListener('pick', e => { const c = M('customers').find(x => x.name === e.detail.v) || {}; setField(md, 'location', c.location || ''); setField(md, 'shipToName', c.shipTo && M('customers').some(x => x.name === c.shipTo) ? c.shipTo : c.name || ''); setField(md, 'shipToCode', c.shipToCode || ''); if (c.type) setField(md, 'orderType', c.type); });
    $('[data-k="shipToName"]', md).addEventListener('pick', e => { const c = M('customers').find(x => x.name === e.detail.v) || {}; setField(md, 'shipToCode', c.shipToCode || ''); });
    $('[data-k="unit"]', md).addEventListener('pick', e => { $$('.itemrow', md).forEach(row => { const li = $('[data-ik="line"]', row); if (li && !li.dataset.val && !li.readOnly) { const L = unitToLine(e.detail.v); li.dataset.val = L; li.value = L; } }); });
    $('#addItem', md).onclick = () => { const w = document.createElement('div'); const unit = val(md, 'unit'); w.innerHTML = itemRowHTML({ id: '', nBatches: 1, line: unit ? unitToLine(unit) : '', tplId: tplById('').id }, false); $('#itemRows', md).appendChild(w.firstElementChild); numberRows(md); const last = $$('.itemrow', md).slice(-1)[0]; last.scrollIntoView({ block: 'nearest' }); $('[data-ik="productCode"]', last).focus(); };
    md.addEventListener('click', e => { const b = e.target.closest('[data-rmitem]'); if (!b) return; if ($$('.itemrow', md).length === 1) { toast('An order needs at least one product.'); return; } b.closest('.itemrow').remove(); numberRows(md); });
    const pin = $('#pdfIn', md); if (pin) pin.addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; const doc = await pdfAutofill(md, f); if (doc) pendingPdf = doc; });
  }, actions: [{ label: id ? 'Save order' : 'Punch order & start workflows', cls: id ? '' : 'ok', id: 'saveOrder', run: md => save(md) }].concat(id ? [{ label: 'Delete order', cls: 'danger', id: 'delOrder', run: () => { setTimeout(() => ACT.deleteOrder({ dataset: { o: id } }), 30); } }] : []) });
};

/* ---------- make an order live: project + batches per product ---------- */
function startOrder(oid, quiet) {
  const o = clone(O(oid)); if (!o) return null; normalizeOrder(o);
  let pid = o.projectId;
  if (!pid) { pid = nextId('PRJ-', S.projects, 26101); put('projects', { id: pid, orderId: oid, status: 'Active', remarks: '', docs: [], createdAt: TODAY }); o.projectId = pid; o.status = o.status || 'Open'; put('orders', o); }
  const have = new Set(pBatches(pid).map(b => b.itemId)); let made = 0;
  items(o).forEach(it => { if (!have.has(it.id)) made += createBatchesForItem(o, it, pid); });
  if (made && !quiet) log(`${oRef(o)} is live: ${made} batch${made > 1 ? 'es' : ''} created across ${items(o).length} product${items(o).length > 1 ? 's' : ''}`, pid);
  if (!quiet && made) toast(`${oRef(o)} started: ${made} batches`);
  return pid;
}
/* ---------- where a sheet row says the product is today ---------- */
const RANK = { order: 0, material: 1, mfg: 2, qc: 3, qa: 4, ready: 5, dispatch: 6, done: 7 };
const isoIn = v => { const s = String(v || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; const m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})\b/); return m && +m[2] <= 12 ? `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}` : ''; };
function sheetBatches(cell, qty) {
  const s = String(cell || '').toUpperCase(); const re = /\b(\d{2}[A-Z]{3,6}\d{2,4})\b\s*(?:-+\s*([\d.]+)\s*(MT|KG)?)?/g; const out = []; let m;
  while ((m = re.exec(s))) { let q = m[2] ? +m[2] : 0; if (q && m[3] === 'MT') q *= 1000; out.push({ code: m[1], qty: q }); }
  if (!out.length) return [];
  const known = sum(out, b => b.qty); if (!(known > 0 && out.every(b => b.qty > 0))) { const each = Math.round(qty / out.length); out.forEach((b, k) => b.qty = k < out.length - 1 ? each : qty - each * (out.length - 1)); }
  return out;
}
function sheetPlan(o, it) {
  const r = it.row; if (!r) return null; const t = v => String(v || '').trim();
  const rmPending = /RM\s*PENDING|RM\s*EXPECTED/i.test(t(r.batchNo) + ' ' + t(r.actualDispatch));
  const coaTxt = t(r.coaDate), coaDone = /COA\s*(DONE|RELEASE|ALREADY)/i.test(coaTxt) || /^\d{4}-\d{2}-\d{2}$/.test(coaTxt), coaQA = /COA\s*(SENT|SUBMITTED)/i.test(coaTxt);
  const dispatched = !!isoIn(r.actualDispatch) || /dispat?c/i.test(t(r.actualDispatch)) || !!t(r.invoiceNo);
  const ready = /^ready$/i.test(t(r.plannedReady)) || !!isoIn(r.actualReady);
  const sampled = !!t(r.actSampling) && !/pending/i.test(t(r.actSampling));
  const codes = sheetBatches(r.batchNo, +it.openQty || +it.poQty || 0);
  let target = dispatched ? 'done' : (ready || coaDone) ? 'ready' : coaQA ? 'qa' : (sampled || /SAMPLING PENDING|NOT COMPLIES/i.test(coaTxt)) ? 'qc' : (codes.length || t(r.tentSampling)) ? 'mfg' : 'material';
  if (rmPending && RANK[target] <= RANK.mfg) target = 'material';
  const coaDate = isoIn(coaTxt);
  return { target, codes, rmPending, coaDone: coaDone || ready || dispatched, coaDate, hold: /hold/i.test(t(r.month)),
    dates: { mfg: isoIn(r.actSampling), qc: coaDate, qa: coaDate, ready: isoIn(r.actualReady), dispatch: isoIn(r.actualDispatch) || isoIn(r.invoiceDate) },
    planned: { mfg: isoIn(r.tentSampling), ready: isoIn(r.plannedReady) }, note: /NOT COMPLIES/i.test(coaTxt) ? 'Sheet COA column: NOT COMPLIES' : '' };
}
const freeBatchId = (code, used) => { const c = code.replace(/[^A-Z0-9-]/gi, ''); if (!used.has(c)) return c; let k = 2; while (used.has(`${c}-${k}`)) k++; return `${c}-${k}`; };
function createBatchesForItem(o, it, pid, nOverride) {
  const plan = !nOverride && sheetPlan(o, it); if (plan) return createSheetBatches(o, it, pid, plan);
  const n = Math.max(1, nOverride || it.nBatches || 1); const qty = +(it.openQty === '' || it.openQty === undefined ? it.poQty : it.openQty) || +it.poQty || 0;
  const line = it.line || unitToLine(o.unit); const tpl = tplById(it.tplId);
  const parts = Array.from({ length: n }, (_, k) => k < n - 1 ? Math.round(qty / n) : qty - Math.round(qty / n) * (n - 1));
  parts.forEach((q, k) => {
    const start = addDays(TODAY, k * 2); const stages = buildStages(tpl, line, q, start);
    const first = stages.findIndex(s => s.type !== 'order'); stages.forEach((s, i) => { if (i < first) { s.status = 'done'; s.actual = TODAY; s.done = s.alloc; s.person = 'Operations'; s.completedAt = nowISO(); } });
    startStage(stages[first]);
    const bid = nextId(line + '-', S.batches, 2700);
    const mfg = stages.find(s => s.type === 'mfg') || {};
    put('batches', normalizeBatch({ id: bid, projectId: pid, itemId: it.id, qty: q, line, tplId: tpl.id, plannedStart: mfg.planned || addDays(start, 2), plannedEnd: addDays(mfg.planned || start, 2), actualStart: '', actualEnd: '', materialIn: '', mfgDetails: '', produced: 0, prodLog: [], remarks: '', materialInDate: addDays(start, 1), qcPlanned: (stages.find(s => s.type === 'qc') || {}).planned || '', qaPlanned: (stages.find(s => s.type === 'qa') || {}).planned || '', expDispatch: (stages.find(s => s.type === 'dispatch') || {}).planned || '', resource: '', stages, reworks: [], qcTests: [], qa: { status: 'Not Started', checks: M('qachecks').map(c => ({ name: c.name, ok: false })), docs: [] }, coa: { status: 'Not Started', docs: [] }, shipments: [], history: [{ at: TODAY, ts: nowISO(), text: `Batch created for ${it.productName || it.productCode} (${kg(q)} kg) on ${line} using “${tpl.name}”` }], docs: [] }));
  });
  return n;
}
function createSheetBatches(o, it, pid, plan) {
  const qty = +(it.openQty === '' || it.openQty === undefined ? it.poQty : it.openQty) || +it.poQty || 0;
  const line = it.line || unitToLine(o.unit); const tpl = tplById(it.tplId);
  const used = new Set(S.batches.map(b => b.id));
  const parts = plan.codes.length ? plan.codes : [{ code: '', qty }];
  const shipIds = new Set(S.batches.flatMap(x => (x.shipments || []).map(s => s.id))); let shipN = 3000;
  parts.forEach((p, k) => {
    const q = p.qty || 0; const start = TODAY; const stages = buildStages(tpl, line, q, start);
    if (plan.planned.mfg) stages.filter(s => s.type === 'mfg').forEach(s => s.planned = plan.planned.mfg);
    if (plan.planned.ready) stages.filter(s => s.type === 'ready').forEach(s => s.planned = plan.planned.ready);
    let cur = stages.findIndex(s => s.type !== 'order' && RANK[s.type] !== undefined && RANK[s.type] >= RANK[plan.target]);
    if (plan.target === 'done') cur = stages.length;
    if (cur < 0) cur = stages.findIndex(s => s.type !== 'order');
    stages.forEach((s, i) => { if (i < cur) { s.status = 'done'; s.done = s.alloc; s.actual = s.type === 'order' ? (o.soDate || o.poDate || '') : (plan.dates[s.type] || ''); s.person = 'Order sheet'; s.completedAt = nowISO(); if (s.actual && s.planned > s.actual) s.planned = s.actual; } });
    if (cur < stages.length) { startStage(stages[cur]); if (plan.note && stages[cur].type === 'qc') stages[cur].comment = plan.note; }
    const id = p.code ? freeBatchId(p.code, used) : nextId(line + '-', S.batches, 2700); used.add(id);
    const mfgS = stages.find(s => s.type === 'mfg') || {}; const mfgDone = mfgS.status === 'done';
    const b = { id, projectId: pid, itemId: it.id, qty: q, line, tplId: tpl.id, sheetBatchNo: it.batchNo || '', plannedStart: mfgS.planned || addDays(start, 2), plannedEnd: addDays(mfgS.planned || start, 2), actualStart: '', actualEnd: mfgDone ? (mfgS.actual || '') : '', materialIn: plan.rmPending ? '' : (RANK[plan.target] > RANK.material ? 'Raw material received' : ''), mfgDetails: '', produced: mfgDone ? q : 0, prodLog: [], remarks: plan.rmPending ? 'Order sheet: raw material pending' : '', materialInDate: addDays(start, 1),
      qcPlanned: (stages.find(s => s.type === 'qc') || {}).planned || '', qaPlanned: (stages.find(s => s.type === 'qa') || {}).planned || '', expDispatch: (stages.find(s => s.type === 'dispatch') || {}).planned || '', resource: '', stages, reworks: [], qcTests: [],
      qa: { status: plan.coaDone ? 'Approved' : 'Not Started', checks: M('qachecks').map(c => ({ name: c.name, ok: !!plan.coaDone })), docs: [] }, coa: plan.coaDone ? { status: 'Released', date: plan.coaDate || plan.dates.ready || '', docs: [] } : { status: 'Not Started', docs: [] }, shipments: [],
      history: [{ at: TODAY, ts: nowISO(), text: `Batch created from the order sheet for ${it.productName || it.productCode} (${kg(q)} kg) on ${line}${it.batchNo ? ` · sheet batch “${it.batchNo}”` : ''} · now at ${plan.target === 'done' ? 'Dispatched' : PHASE[plan.target]}` }], docs: [] };
    if (plan.target === 'done') { while (shipIds.has('SH-' + shipN)) shipN++; shipIds.add('SH-' + shipN); const r = it.row || {};
      b.shipments.push({ id: 'SH-' + shipN, qty: q, invoiceNo: String(r.invoiceNo || ''), invoiceDate: isoIn(r.invoiceDate), containerNo: '', containerSize: o.containerSize || '', containers: 1, booking: '', vehicle: '', dispatchDate: plan.dates.dispatch || '', status: 'Dispatched', remarks: String(r.actualDispatch || ''), docs: [] }); }
    put('batches', normalizeBatch(b));
  });
  return parts.length;
}
/* after a sheet import: order status, material and hold follow the sheet */
function applySheetState(oid) {
  const o = clone(O(oid)); if (!o || !o.projectId) return; const plans = items(o).map(i => sheetPlan(o, i)).filter(Boolean); if (!plans.length) return;
  if (plans.some(p => p.rmPending)) o.materialStatus = 'Awaited';
  if (plans.every(p => p.target === 'done')) o.status = 'Dispatched';
  if (plans.some(p => p.hold)) { o.status = 'On Hold'; const p = clone(P(o.projectId)); if (p) { p.status = 'On Hold'; put('projects', p); } }
  put('orders', o);
}
ACT.startOrder = el => { startOrder(el.dataset.o); };
ACT.startAll = () => { const ids = S.orders.filter(o => !o.projectId).map(o => o.id); confirmBox('Start imported orders', `Start workflows for <b>${ids.length}</b> imported orders? Each product gets one batch on its line with the default workflow.`, 'Start all', () => { ids.forEach(id => startOrder(id, true)); toast(`${ids.length} orders started`); }, 'ok'); };

/* ---------- PO / SO PDF → AI autofill ---------- */
let PDFJS = null;
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }); }
async function getPdfjs() { if (PDFJS) return PDFJS; await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'); await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'); PDFJS = window.pdfjsLib; return PDFJS; }
async function readPdf(file) {
  const lib = await getPdfjs(); const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  let text = ''; const n = Math.min(pdf.numPages, 8);
  for (let i = 1; i <= n; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); let lastY = null; tc.items.forEach(t => { const y = t.transform && t.transform[5]; if (lastY !== null && Math.abs(y - lastY) > 2) text += '\n'; else if (lastY !== null) text += ' '; text += t.str; lastY = y; }); text += '\n\n'; }
  const images = [];
  if (text.replace(/\s/g, '').length < 120) { for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) { const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 1.7 }); const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; images.push(await new Promise(r => c.toBlob(r, 'image/png'))); } }
  return { text: text.slice(0, 24000), images, pages: pdf.numPages };
}
async function pdfAutofill(md, file) {
  const st = $('#pdfStatus', md); const set = h => { st.innerHTML = h; };
  set(`<div class="banner info">Reading <b>${esc(file.name)}</b>…</div>`);
  let doc = null;
  try {
    const { text, images } = await readPdf(file);
    const pdfOk = !!SAMPLE.acceptsPdf && file.size <= 3 * 1024 * 1024;
    const pdfPart = pdfOk ? { name: file.name, dataUrl: await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); }) } : null;
    if (images.length && !pdfPart) { const lim = await SAMPLE.limits().catch(() => null); if (!lim || !lim.images) { set(`<div class="alert s-rejected">This PDF is a scanned image and image reading is not available here. Type the order in by hand.</div>`); return null; } }
    set(`<div class="banner info">AI is reading the order from <b>${esc(file.name)}</b>… this takes up to a minute.</div>`);
    const list = (n, a) => `${n}: ${a.slice(0, 400).join(' | ')}`;
    const prompt = `You extract purchase-order / sales-order data for a manufacturing order-entry form.
Return ONLY a JSON object with these keys (use "" or [] when not present in the document; never guess):
{"poNo":"","poDate":"YYYY-MM-DD","soNo":"","soDate":"YYYY-MM-DD","customer":"","shipToName":"","rawDeliveryDate":"YYYY-MM-DD","exPlantDate":"YYYY-MM-DD","incoterms":"","paymentTerms":"","port":"","shipmentType":"","containerSize":"","salesPerson":"","orderType":"Domestic|Export|","remarks":"","items":[{"productCode":"","productName":"","qtyKg":0,"packing":"","specialReq":""}]}
Rules:
- For customer, shipToName, incoterms, paymentTerms, port, shipmentType, containerSize, salesPerson, packing and productCode: if the document's value clearly corresponds to an entry in the matching list below, return that list entry EXACTLY as written. If nothing matches, return the value as written in the document.
- productCode: match by code, or by product name to the product list ("code = name"). qtyKg in kilograms (convert MT/tonnes ×1000).
- Dates as YYYY-MM-DD. Do not invent values.
${list('Customers', M('customers').map(c => c.name))}
${list('Products (code = name)', M('products').map(p => `${p.code} = ${p.name}`))}
${list('Incoterms', M('incoterms').map(x => x.name))}
${list('Payment terms', M('payment').map(x => x.name))}
${list('Ports', M('ports').map(x => x.name))}
${list('Shipment types', M('shipmodes').map(x => x.name))}
${list('Container sizes', M('containers').map(x => x.name))}
${list('Packing', M('packing').map(x => x.name))}
${list('Sales persons', M('salespersons').map(x => x.name))}

DOCUMENT TEXT:
${text || '(scanned document — read the attached PDF / page images)'}`;
    const data = await SAMPLE.json(prompt, pdfPart ? { pdf: pdfPart } : images.length ? { images } : {});
    if (!data || typeof data !== 'object') throw new Error('The AI did not return order data.');
    const filled = [], missing = [];
    const try1 = (k, v, label) => { if (v === undefined || v === null || v === '') return; if (setField(md, k, v)) filled.push(label); else missing.push(`${label}: “${v}”`); };
    try1('poNo', data.poNo, 'PO number'); try1('poDate', /^\d{4}-\d\d-\d\d$/.test(data.poDate) ? data.poDate : '', 'PO date'); try1('soNo', data.soNo, 'SO number'); try1('soDate', /^\d{4}-\d\d-\d\d$/.test(data.soDate) ? data.soDate : '', 'SO date');
    if (data.customer) { const c = M('customers').find(x => x.name.toLowerCase() === String(data.customer).toLowerCase()); if (c) { setField(md, 'customer', c.name); $('[data-k="customer"]', md).dispatchEvent(new CustomEvent('pick', { bubbles: true, detail: { v: c.name, l: c.name } })); filled.push('Customer'); } else missing.push(`Customer: “${data.customer}”`); }
    if (data.shipToName) { if (setField(md, 'shipToName', (M('customers').find(x => x.name.toLowerCase() === String(data.shipToName).toLowerCase()) || {}).name || '__none')) filled.push('Ship-to'); }
    try1('rowDelivery', /^\d{4}-\d\d-\d\d$/.test(data.rawDeliveryDate) ? data.rawDeliveryDate : '', 'Raw Delivery Date'); try1('exPlant', /^\d{4}-\d\d-\d\d$/.test(data.exPlantDate) ? data.exPlantDate : '', 'Ex-plant date');
    [['incoterms', 'incoterms', 'Incoterms'], ['paymentTerms', 'paymentTerms', 'Payment terms'], ['port', 'port', 'Port'], ['shipmentType', 'shipmentType', 'Shipment type'], ['containerSize', 'containerSize', 'Container size'], ['salesPerson', 'salesPerson', 'Sales person'], ['orderType', 'orderType', 'Order type']].forEach(([k, d, l]) => try1(k, data[d], l));
    if (data.remarks) { const t = $('[data-k="planRemarks"]', md); if (t && !t.value) { t.value = String(data.remarks).slice(0, 500); filled.push('Remarks'); } }
    const its = Array.isArray(data.items) ? data.items.filter(i => i && (i.productCode || i.productName)) : [];
    if (its.length) {
      const rowsEl = $('#itemRows', md); $$('.itemrow', rowsEl).forEach(r => { if (!$('[data-ik="productCode"]', r).readOnly) r.remove(); });
      its.forEach(i => {
        const p = M('products').find(x => x.code.toLowerCase() === String(i.productCode || '').toLowerCase()) || (i.productName ? M('products').find(x => x.name && x.name.toLowerCase() === String(i.productName).toLowerCase()) : null);
        const pk = M('packing').find(x => x.name.toLowerCase() === String(i.packing || '').toLowerCase());
        const unit = val(md, 'unit');
        const w = document.createElement('div'); w.innerHTML = itemRowHTML({ id: '', productCode: p ? p.code : '', productName: p ? p.name : '', grade: p ? p.grade : '', poQty: +i.qtyKg || '', openQty: +i.qtyKg || '', packing: pk ? pk.name : '', specialReq: i.specialReq || '', nBatches: 1, line: unit ? unitToLine(unit) : '', tplId: tplById('').id }, false); rowsEl.appendChild(w.firstElementChild);
        if (p) filled.push(`Product ${p.code}`); else missing.push(`Product: “${i.productCode || i.productName}”`);
        if (i.packing && !pk) missing.push(`Packing: “${i.packing}”`);
      });
      if (!$$('.itemrow', rowsEl).length) { const w = document.createElement('div'); w.innerHTML = itemRowHTML({ id: '', nBatches: 1, tplId: tplById('').id }, false); rowsEl.appendChild(w.firstElementChild); }
      numberRows(md);
    }
    if (ASSETS) { try { const r = await ASSETS.upload(file); doc = { id: r.id, url: r.url, name: file.name, at: TODAY }; } catch (e) { } }
    set(`<div class="alert s-done"><span><b>Filled ${filled.length} field${filled.length === 1 ? '' : 's'} from ${esc(file.name)}.</b> Check every value before saving.${doc ? ' The PDF will be attached to the order.' : ''}</span></div>${missing.length ? `<div class="alert s-pending"><span><b>Not in Master Data, left blank:</b> ${missing.map(esc).join('; ')}. Add these under Master Data, then pick them here.</span></div>` : ''}`);
    return doc;
  } catch (e) {
    set(`<div class="alert s-rejected"><span>Could not read this PDF: ${esc(e && (e.message || e.code) || 'unknown error')}. ${e && e.code === 'not_granted' ? 'Allow the AI permission for this page and try again.' : 'Fill the form by hand or try another file.'}</span></div>`); return null;
  }
}

/* ---------- Excel import: sheet rows grouped into multi-product orders by PO + SO ---------- */
const HMAP = { month: 'month', planningteamremarks: 'planRemarks', exportdomestic: 'orderType', unitpr: 'unit', salesperson: 'salesPerson', ponumber: 'poNo', podate: 'poDate', sonumber: 'soNo', sodate: 'soDate', soupdatedate: 'soUpdate', explantdate: 'exPlant', rowdeliverydate: 'rowDelivery', rawdeliverydate: 'rowDelivery', plannedreadinessdate: 'plannedReady', customername: 'customer', locationcountry: 'location', productcode: 'productCode', grade: 'grade', productname: 'productName', poquantitykgs: 'poQty', openquantitykgs: 'openQty', marketingremarks: 'mktRemarks', remarksspecialrequirement: 'specialReq', packing: 'packing', palletformation: 'pallet', tentativesamplingdate: 'tentSampling', actualsamplingdate: 'actSampling', batchnumber: 'batchNo', coareleaseddate: 'coaDate', readinessdateofsudeep: 'plannedReady', actaulreadinessdate: 'actualReady', actualreadinessdate: 'actualReady', actauldispatchdate: 'actualDispatch', actualdispatchdate: 'actualDispatch', remarksplanningteam: 'planRemarks2', noofsotoinvoicedays: 'soToInvoiceDays', opendispatchclosedonhold: 'status', invoiceno: 'invoiceNo', invoicedate: 'invoiceDate', shiptocode: 'shipToName', incoterms: 'incoterms', portofdischarge: 'port', typeofshipmentseaair: 'shipmentType', containersize: 'containerSize', paymentterms: 'paymentTerms' };
const DATEK = new Set(['poDate', 'soDate', 'soUpdate', 'exPlant', 'rowDelivery', 'tentSampling', 'actSampling', 'coaDate', 'plannedReady', 'actualReady', 'actualDispatch', 'invoiceDate']);
function normCell(k, v) {
  if (v === null || v === undefined) return '';
  if (DATEK.has(k) || k === 'month') { if (v instanceof Date) return k === 'month' ? iso(v).slice(0, 7) : iso(v); const m = String(v).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return k === 'month' ? `${y}-${pad(m[2])}` : `${y}-${pad(m[2])}-${pad(m[1])}`; } return k === 'month' ? String(v).trim() : ''; }
  if (k === 'poQty' || k === 'openQty') return +String(v).replace(/[^\d.]/g, '') || 0;
  let s = String(v).trim(); if (['-', '#NAME?', 'NA'].includes(s)) s = '';
  if (k === 'orderType') s = /export/i.test(s) && !/domestic/i.test(s) ? 'Export' : 'Domestic';
  if (k === 'status') s = /dispatch/i.test(s) ? 'Dispatched' : /close/i.test(s) ? 'Closed' : /hold/i.test(s) ? 'On Hold' : 'Open';
  return s;
}
/* the sheet's own value for one product row, kept as typed: dates become ISO only when they really are dates */
function rawCell(k, v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return k === 'month' ? iso(v).slice(0, 7) : iso(v);
  if (typeof v === 'number') return v;
  const s = String(v).replace(/\s+/g, ' ').trim();
  if (DATEK.has(k)) { const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/); if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 1) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; } }
  return s;
}
ACT.importSheet = (el, presetFile) => {
  let parsed = [];
  openModal({ title: 'Import order sheet', wide: true, body: `<p style="margin:0">Choose the Excel order sheet (.xlsx). Columns are matched by header name. Rows with the same PO and SO become one order with several products. Orders already in OrderTrack (same PO + SO) are skipped.</p>
    <label class="btn ghost" style="width:max-content;cursor:pointer">${ico('up')} Choose Excel file<input id="imf" type="file" accept=".xlsx,.xls,.csv" hidden></label><div id="imp"></div>`,
    onOpen: md => { const parse = async f => {
      if (!f) return; const out = $('#imp', md); out.innerHTML = `<span class="muted">Reading ${esc(f.name || 'sheet')}…</span>`;
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true }); const ws = wb.Sheets[wb.SheetNames[0]]; const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
        const hi = aoa.findIndex(r => r && r.some(c => /customer\s*name/i.test(String(c || '')))); if (hi < 0) throw new Error('No "Customer Name" header row found.');
        const keys = aoa[hi].map(h => HMAP[String(h || '').toLowerCase().replace(/[^a-z0-9]/g, '')] || null);
        const have = new Set(S.orders.map(o => `${o.poNo}|${o.soNo || ''}`.toLowerCase()));
        const groups = new Map(); let dupRows = 0, rowsN = 0;
        aoa.slice(hi + 1).forEach(r => { if (!r) return; const x = {}, raw = {}; keys.forEach((k, i) => { if (k && !(k in x && x[k])) { x[k] = normCell(k, r[i]); raw[k] = rawCell(k, r[i]); } }); if (!x.customer) return; rowsN++;
          x.poNo = x.poNo || ('NO-PO-' + (x.soNo || rowsN)); const key = `${x.poNo}|${x.soNo || ''}`.toLowerCase(); if (have.has(key)) { dupRows++; return; }
          if (!groups.has(key)) { const o = { items: [] }; Object.keys(x).forEach(k => { if (!ITEM_KEYS.includes(k)) o[k] = x[k]; }); o.materialStatus = 'Available'; groups.set(key, o); }
          const o = groups.get(key); const it = { id: 'L' + (o.items.length + 1), tplId: '', line: unitToLine(x.unit), nBatches: 1 }; ITEM_KEYS.forEach(k => it[k] = x[k] ?? ''); it.batchNo = raw.batchNo === undefined ? it.batchNo : String(raw.batchNo); it.row = raw; it.poQty = +it.poQty || 0; it.openQty = it.openQty === '' ? it.poQty : +it.openQty || 0; o.items.push(it); });
        parsed = [...groups.values()];
        out.innerHTML = `<div class="kvs"><div><dt>Orders ready</dt><dd class="num big">${parsed.length}</dd></div><div><dt>Product lines</dt><dd class="num big">${sum(parsed, o => o.items.length)}</dd></div><div><dt>Rows skipped (already in OrderTrack)</dt><dd class="num big">${dupRows}</dd></div><div><dt>Multi-product orders</dt><dd class="num big">${parsed.filter(o => o.items.length > 1).length}</dd></div></div>
          ${parsed.length > 2000 ? `<p class="banner">Only the first 2000 orders will be imported in one go; run the import again for the rest.</p>` : ''}
          <div class="kvs"><div><dt>Sheet status Open / blank</dt><dd class="num big">${parsed.filter(o => !['Dispatched', 'Closed', 'On Hold'].includes(o.status)).length}</dd></div><div><dt>Dispatched / Closed</dt><dd class="num big">${parsed.filter(o => ['Dispatched', 'Closed'].includes(o.status)).length}</dd></div><div><dt>On hold</dt><dd class="num big">${parsed.filter(o => o.status === 'On Hold').length}</dd></div></div>
          <label class="row" style="font-size:14px"><input type="checkbox" id="imM" checked style="width:auto"> Add new customers, products, grades, salespersons, packing types, ports, incoterms and payment terms to Master Data</label>
          <label class="row" style="font-size:14px"><input type="checkbox" id="imS" checked style="width:auto"> Start workflows now (each product's batches start at the stage the sheet shows: material, manufacturing, QC, QA, ready or dispatched)</label>
          <p class="muted" style="margin:0;font-size:13px">Every product row keeps all of its own sheet values exactly as typed. The sheet's batch numbers become the batch IDs. Orders marked Hold stay on hold.</p>`;
      } catch (err) { out.innerHTML = `<div class="alert s-rejected">Could not read this file: ${esc(err.message)}</div>`; }
    }; $('#imf', md).addEventListener('change', e => parse(e.target.files[0])); if (presetFile) parse(presetFile); },
    actions: [{ label: 'Import orders', run: md => {
      if (!parsed.length) { toast('Choose a sheet with new rows first.'); return false; }
      const addM = $('#imM', md) && $('#imM', md).checked; const startNow = $('#imS', md) && $('#imS', md).checked; const rows = parsed.slice(0, 2000);
      if (addM) mergeMasters(rows);
      let n = +nextId('ORD-', S.orders, 2601).split('-')[1];
      rows.forEach(o => { o.id = 'ORD-' + (n++); o.createdAt = TODAY; o.items.forEach(i => { i.tplId = i.tplId || tplById('').id; }); put('orders', o); });
      let started = 0; if (startNow) rows.filter(o => o.status !== 'Closed').forEach(o => { startOrder(o.id, true); applySheetState(o.id); started++; });
      log(`Order sheet imported: ${rows.length} orders, ${sum(rows, o => o.items.length)} product lines${started ? `, ${started} started` : ''}`, ''); toast(`${rows.length} orders imported${started ? ` · ${started} started` : ''}`); FLT.orders.tab = 'all'; go('orders');
    } }] });
};
function mergeMasters(rows) {
  const add = (type, list, key) => { const cur = M(type); const have = new Set(cur.map(x => String(x[key]).toLowerCase())); const nw = list.filter(x => x[key] && !have.has(String(x[key]).toLowerCase()) && (have.add(String(x[key]).toLowerCase()), true)); if (nw.length) putMaster(type, cur.concat(nw)); };
  const its = rows.flatMap(o => items(o).map(i => Object.assign({ unit: o.unit }, i)));
  add('customers', rows.map(o => ({ name: o.customer, location: o.location, type: o.orderType, shipTo: o.shipToName })), 'name');
  add('products', its.map(i => ({ code: i.productCode, grade: i.grade, name: i.productName })), 'code');
  add('grades', its.map(i => ({ name: i.grade })), 'name'); add('salespersons', rows.map(o => ({ name: o.salesPerson })), 'name');
  add('packing', its.map(i => ({ name: i.packing })), 'name'); add('units', rows.map(o => ({ name: o.unit })), 'name');
  add('ports', rows.map(o => ({ name: o.port })), 'name'); add('incoterms', rows.map(o => ({ name: o.incoterms })), 'name'); add('payment', rows.map(o => ({ name: o.paymentTerms })), 'name');
}

/* ---------- export in the original order-sheet layout (one row per product) ---------- */
/* columns that differ from row to row inside one PO/SO come from that product's own sheet row */
const rv = k => (o, i) => { const r = i.row || {}; return items(o).length > 1 && r[k] !== undefined && r[k] !== '' ? r[k] : (o[k] || r[k] || ''); };
const SHEET_COLS = [['MONTH', rv('month')], ['Planning Team Remarks', rv('planRemarks')], ['Export/ Domestic', o => o.orderType], ['UNIT / PR', o => o.unit], ['Sales Person', o => o.salesPerson], ['PO Number', o => o.poNo], ['PO Date', o => o.poDate], ['SO number', o => o.soNo], ['SO Date', o => o.soDate], ['SO update date', o => o.soUpdate], ['Ex Plant Date', rv('exPlant')], ['Raw Delivery Date', rv('rowDelivery')], ['Customer Name', o => o.customer], ['Location / Country', o => o.location], ['Product Code', (o, i) => i.productCode], ['GRADE', (o, i) => i.grade], ['Product Name', (o, i) => i.productName], ['PO Quantity (kgs)', (o, i) => +i.poQty || ''], ['Open Quantity (kgs)', (o, i) => +i.openQty || ''], ['MARKETING REMARKS', (o, i) => i.mktRemarks], ['Remarks/ special requirement', (o, i) => i.specialReq], ['Packing', (o, i) => i.packing], ['PALLET FORMATION', (o, i) => i.pallet], ['Tentative sampling date', rv('tentSampling')], ['Actual Sampling date', rv('actSampling')], ['Batch Number', (o, i) => i.row || !o.projectId ? i.batchNo : pBatches(o.projectId).filter(b => b.itemId === i.id).map(b => b.id).join(', ')], ['COA RELEASED DATE', rv('coaDate')], ['Planned Readiness Date', rv('plannedReady')], ['Actual Readiness Date', rv('actualReady')], ['Actual Dispatch Date', rv('actualDispatch')], ['REMARKS PLANNING TEAM', rv('planRemarks2')], ['No. of SO to Invoice Days', rv('soToInvoiceDays')], ['Open/Dispatch/Closed/Onhold', o => orderState(o)], ['Invoice no.', rv('invoiceNo')], ['Invoice Date', rv('invoiceDate')], ['Ship-to Code', o => o.shipToName], ['Incoterms', o => o.incoterms], ['Port of Discharge', o => o.port], ['Type of shipment Sea/Air', o => o.shipmentType], ['CONTAINER SIZE', o => o.containerSize], ['Payment Terms', o => o.paymentTerms]];
ACT.exportSheet = async () => {
  if (!DL) return; const rows = [SHEET_COLS.map(c => c[0])];
  S.orders.slice().sort(by(o => o.soDate || o.poDate || '', -1)).forEach(o => items(o).forEach(i => rows.push(SHEET_COLS.map(c => { const v = c[1](o, i); return v === undefined || v === null ? '' : v; }))));
  try { const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Order sheet'); const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }); await DL.save({ filename: `Order-sheet-${TODAY}.xlsx`, data: new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }) }); toast(`Exported ${rows.length - 1} product rows`); }
  catch (e) { if (e && e.code !== 'declined') toast('Export did not complete: ' + (e.message || e.code || 'unknown')); }
};
/* ---------- delete an order with everything under it ---------- */
ACT.deleteOrder = el => {
  const o = O(el.dataset.o); if (!o) return; const pid = o.projectId; const bs = pid ? pBatches(pid) : []; const rms = pid ? pRemarks(pid) : [];
  openModal({ title: `Delete ${oRef(o)}`, body: `<div class="alert s-rejected"><span>This permanently deletes the order <b>${esc(oRef(o))}</b> (${esc(o.customer)}), its ${items(o).length} product${items(o).length > 1 ? 's' : ''}, <b>${bs.length} batch${bs.length === 1 ? '' : 'es'}</b> with their workflow, QC, QA and dispatch records, and ${rms.length} remark${rms.length === 1 ? '' : 's'}. It cannot be undone.</span></div>
    <label class="f"><span>Type the PO number <b>${esc(o.poNo)}</b> to confirm</span><input id="delConfirm" autocomplete="off"></label>`,
    actions: [{ label: 'Delete permanently', cls: 'danger', id: 'delYes', run: md => {
      if ($('#delConfirm', md).value.trim() !== String(o.poNo).trim()) { toast('The PO number does not match.'); return false; }
      bs.forEach(b => removeRec('batches', b.id)); rms.forEach(r => removeRec('remarks', r.id)); if (pid) removeRec('projects', pid); removeRec('orders', o.id);
      log(`Order ${oRef(o)} (${o.customer}) deleted with ${bs.length} batches`, ''); if (drawerFn) closeDrawer(); toast(`${oRef(o)} deleted`);
    } }] });
};

/* ---------- one-time load of the order sheet shipped with the deployment ---------- */
const seedUrl = () => (window.OT_BACKEND && OT_BACKEND.cfg && OT_BACKEND.cfg.seedSheet) || '';
const seedOffer = () => MODE === 'live' && !S.orders.length && seedUrl() ? `<div class="alert s-progress"><span><b>Your shared database is empty.</b> Load the order sheet that was set up with this deployment: every PO becomes an order (rows with the same PO + SO become one multi-product order), and customers, products and other masters are created from it.</span><span class="spacer"></span><button class="btn ok" type="button" data-act="loadSeed">Load order sheet data</button></div>` : '';
ACT.loadSeed = async () => {
  try { const r = await fetch(seedUrl(), { cache: 'no-store' }); if (!r.ok) throw new Error('The sheet file was not found on the server (' + r.status + ').'); const b = await r.blob(); ACT.importSheet(null, new File([b], 'Order sheet.xlsx', { type: b.type })); }
  catch (e) { toast('Could not load the sheet: ' + e.message); }
};
