/* ===================== workflow components ===================== */
function stageCard(b, lineId, i, s, dim) {
  const pend = Math.max(0, (+s.alloc || 0) - (+s.done || 0));
  const late = s.status !== 'done' && s.status !== 'rejected' && s.planned && s.planned < TODAY && !dim;
  return `<div class="stg s-${esc(s.status)}${dim ? ' dim' : ''}" data-stage="${esc(b.id)}|${lineId}|${i}" tabindex="0" role="button" aria-label="${esc(s.name)} ${esc(ST[s.status])}">
    <h4><span>${esc(s.name)}</span>${late ? '<span class="tag" style="color:var(--st-red)">Late</span>' : ''}</h4>
    <div>${pill(s.status)}</div>
    <div class="kv"><span>Batch</span><b class="mono">${esc(b.id)}</b></div>
    <div class="kv"><span>Allocated</span><b>${kg(s.alloc)} kg</b></div>
    <div class="kv"><span>Completed</span><b>${kg(s.done)} kg</b></div>
    <div class="kv"><span>Pending</span><b>${kg(pend)} kg</b></div>
    <div class="kv"><span>Owner</span><b>${esc(s.person || '—')}</b></div>
    <div class="kv"><span>Planned</span><b>${fmtD(s.planned)}</b></div>
    <div class="kv"><span>Actual</span><b>${fmtD(s.actual)}</b></div>
    ${s.comment ? `<div class="cm" title="${esc(s.comment)}">“${esc(s.comment)}”</div>` : ''}
  </div>`;
}
function rwPillKey(r) { return r.status === 'Completed' ? 'done' : r.status === 'Re-rejected' ? 'rejected' : 'rework'; }
function lanes(b) {
  const rws = b.reworks || []; const drive = drivingRW(b);
  const rwLane = (r, isDrive) => `<div class="lane rw${isDrive ? ' drive' : ''}"><div class="lane-lbl"><b>${esc(r.id)}</b>${isDrive ? '<span class="tag drive-tag">Driving line</span>' : ''}${pill(rwPillKey(r), r.status)}<button class="link" type="button" data-act="rwEdit" data-b="${esc(b.id)}" data-r="${esc(r.id)}">Rework details</button></div>${r.stages.map((s, i) => stageCard(b, r.id, i, s, !isDrive)).join(ARROW)}</div>
    <div class="rwmeta"><span><b>Origin:</b> ${esc(r.origin)}</span><span><b>By:</b> ${esc(r.by)}</span><span><b>Qty:</b> ${kg(r.qty)} kg</span><span><b>Line:</b> ${esc(r.line)}</span><span><b>Start:</b> ${fmtD(r.start)}</span><span><b>Expected:</b> ${fmtD(r.expected)}</span><span><b>Done:</b> ${fmtD(r.actual)}</span><span><b>Reason:</b> ${esc(r.reason)}</span></div>`;
  const main = `<div class="lane${drive ? ' hist' : ''}"><div class="lane-lbl"><b>${drive ? 'Original line' : 'Main line'}</b><span class="mono muted" style="font-size:12px">${esc(b.id)}</span>${drive ? '<span class="tag">History · kept</span>' : '<span class="tag drive-tag">Driving line</span>'}</div>${(b.stages || []).map((s, i) => stageCard(b, 'main', i, s, !!drive)).join(ARROW)}</div>`;
  let h = '';
  if (drive) { h += rwLane(drive, true); [...rws].slice(0, -1).reverse().forEach(r => { h += rwLane(r, false); }); h += main; }
  else h = main;
  return `<div class="lane-wrap">${h}</div>`;
}
function batchWorkflowPanel(b) {
  const it = bItem(b);
  return `<section class="panel"><header><h3 class="mono">${esc(b.id)}</h3>${phasePill(b)}${batchDelayed(b) ? pill('rejected', 'Delayed') : ''}<span class="muted">${esc(it.productName || '')} · ${kg(b.qty)} kg on ${esc(b.line)}</span><span class="spacer"></span>
    <button class="btn ghost sm" type="button" data-act="editLine" data-b="${esc(b.id)}">Edit stages</button>
    ${phaseKey(b) === 'completed' ? '' : `<button class="btn warn sm" type="button" data-act="rework" data-b="${esc(b.id)}">Send to rework</button>`}</header><div class="pb">${lanes(b)}</div></section>`;
}
const legend = () => `<div class="legend">${Object.entries(ST).map(([k, l]) => `<span class="s-${k}">${l}</span>`).join('')}</div>`;
function lineRef(b, lineId) { return lineId === 'main' ? b.stages : (b.reworks.find(r => r.id === lineId) || {}).stages; }
OPEN.stage = key => {
  const [bid, lineId, i] = key.split('|'); const b0 = B(bid); if (!b0) return; const s = lineRef(b0, lineId)[+i];
  const drive = drivingRW(b0); const isDrive = lineId === (drive ? drive.id : 'main');
  const f = [{ k: 'status', label: 'Status', src: '_st' }, { k: 'person', label: 'Responsible person', src: 'employees' },
    { k: 'alloc', label: 'Allocated qty (kg)', type: 'number' }, { k: 'done', label: 'Completed qty (kg)', type: 'number' }, { k: 'planned', label: 'Planned date', type: 'date' }, { k: 'actual', label: 'Actual date', type: 'date' }, { k: 'comment', label: 'Comment (also posted to Remarks)', type: 'textarea', wide: true }];
  MSRC._st = () => Object.entries(ST).map(([k, l]) => ({ v: k, l }));
  openModal({ title: `${s.name} · batch ${bid} · ${lineId === 'main' ? (drive ? 'Original line' : 'Main line') : lineId}`, body: `${isDrive ? '' : '<div class="banner">This line is history. The batch now runs on the driving line, so changes here do not move the batch.</div>'}<fieldset class="sec"><legend>Stage</legend>${f.map(x => field(x, s[x.k])).join('')}</fieldset>
    <p class="muted" style="margin:0;font-size:13px">Completing a stage starts the next one automatically and moves later planned dates by the same number of days it ran early or late. Rejecting a QC or QA stage opens a rework line.</p>`,
    actions: [{ label: 'Save stage', run: md => {
      const b = clone(B(bid)), L = lineRef(b, lineId), st = L[+i]; const r = readForm(md);
      const nk = r.status || st.status; const was = st.status; const oldC = st.comment;
      Object.assign(st, { person: r.person, alloc: +r.alloc || 0, done: +r.done || 0, planned: r.planned, actual: r.actual, comment: r.comment });
      if (r.comment && r.comment !== oldC) addRemark(b.projectId, DEPT_OF_TYPE[st.type] || 'Operations', `${st.name} (batch ${bid}): ${r.comment}`, { by: r.person, batchId: bid, itemId: b.itemId, source: 'Workflow' });
      if (nk === 'done' && was !== 'done') { completeStage(b, L, +i); saveBatch(b, `${st.name} completed on batch ${bid}`); }
      else { st.status = nk; if (nk === 'progress' && was !== 'progress') st.startedAt = nowISO(); if (nk === 'rejected' && was !== 'rejected') st.actual = st.actual || TODAY; addHist(b, `${st.name} updated: ${ST[nk]}`); syncBatchDates(b); saveBatch(b, `${st.name} on batch ${bid} set to ${ST[nk]}`);
        if (nk === 'rejected' && ['qc', 'qa'].includes(st.type) && isDrive) setTimeout(() => OPEN.reworkForm(bid, st.type), 60); }
    } }] });
};
OPEN.reworkForm = (bid, originType) => {
  const b = B(bid); const cur = curStage(b);
  const ot = originType || (cur ? cur.type : 'qc'); const origin = ot === 'qa' ? 'QA' : ot === 'qc' ? 'QC' : ot === 'dispatch' || ot === 'ready' ? 'Dispatch' : 'Manufacturing';
  let seq = defaultReworkSeq(b);
  const n = (b.reworks || []).length + 1;
  const body = `<div class="banner info">Batch <b class="mono">${esc(bid)}</b> will run on <b>RW${n}</b> from now on. The current line is kept as history. The first stage below starts immediately and shows up in that department's queue.</div>
    <fieldset class="sec"><legend>Rework RW${n}</legend>
    <label class="f"><span>Origin department</span>${combo({ opts: uniq([origin, 'QC', 'QA', 'Manufacturing', 'Dispatch', 'Customer Complaint']), value: origin, k: 'origin', strict: true })}</label>
    ${field({ k: 'by', label: 'Assigned by', src: 'employees', req: true }, ot === 'qa' ? (M('employees').find(e => /assurance/i.test(e.dept)) || {}).name : (M('employees').find(e => /quality control/i.test(e.dept)) || {}).name)}
    ${field({ k: 'qty', label: 'Rework quantity (kg)', type: 'number', req: true }, b.qty)}
    ${field({ k: 'line', label: 'Rework department / line', src: 'lines', req: true }, b.line)}
    ${field({ k: 'start', label: 'Rework start date', type: 'date' }, TODAY)}
    ${field({ k: 'expected', label: 'Expected completion', type: 'date' }, addDays(TODAY, 6))}
    ${field({ k: 'reason', label: 'Reason for rework', type: 'textarea', wide: true, req: true }, '')}
    ${field({ k: 'comments', label: 'Comments', type: 'textarea', wide: true }, '')}</fieldset>
    <div><div class="eyebrow" style="margin-bottom:8px">Stages after rework · drag to reorder, drag stages in from the palette</div><div id="rwBuilder"></div></div>`;
  openModal({ title: `Send batch ${bid} to rework`, wide: true, body, onOpen: md => { mountBuilder($('#rwBuilder', md), () => seq.map(n => ({ name: n, type: lineNames().includes(n) ? 'mfg' : stageType(n) })), st => { seq = st.map(s => s.name); }); $('[data-k="line"]', md).addEventListener('pick', e => { const old = seq.findIndex(x => lineNames().includes(x)); if (old >= 0) seq[old] = e.detail.v; else seq.unshift(e.detail.v); mountBuilder($('#rwBuilder', md), () => seq.map(n => ({ name: n })), st => { seq = st.map(s => s.name); }, undefined, true); }); },
    actions: [{ label: `Create RW${n} and run batch on it`, cls: 'warn', id: 'rwCreate', run: md => {
      const r = readForm(md); if (!r.reason || !r.by || !r.qty) { toast('Reason, assigned by and quantity are required.'); return false; }
      if (+r.qty > +b.qty) { toast('Rework quantity cannot exceed the batch quantity.'); return false; }
      if (!seq.length) { toast('Add at least one stage after rework.'); return false; }
      if (!seq.includes(r.line)) seq = [r.line, ...seq];
      const nb = clone(B(bid)); createRework(nb, Object.assign(r, { originType: r.origin === 'QA' ? 'qa' : r.origin === 'QC' ? 'qc' : (cur ? cur.type : 'mfg'), seq }));
    } }] });
};
ACT.rework = el => OPEN.reworkForm(el.dataset.b);
ACT.rwEdit = el => {
  const bid = el.dataset.b, rid = el.dataset.r; const draw = () => { const b = B(bid), r = b.reworks.find(x => x.id === rid);
    return `<div class="kvs"><div><dt>Rework</dt><dd class="mono">${esc(r.id)}</dd></div><div><dt>Origin</dt><dd>${esc(r.origin)}</dd></div><div><dt>Assigned by</dt><dd>${esc(r.by)}</dd></div><div><dt>Quantity</dt><dd>${kg(r.qty)} kg</dd></div><div><dt>Line</dt><dd>${esc(r.line)}</dd></div><div><dt>Start</dt><dd>${fmtD(r.start)}</dd></div></div>
    <fieldset class="sec"><legend>Update</legend><label class="f"><span>Rework status</span>${combo({ opts: ['Pending', 'In Progress', 'Completed', 'Re-rejected'], value: r.status, k: 'status' })}</label>${field({ k: 'expected', label: 'Expected completion', type: 'date' }, r.expected)}${field({ k: 'actual', label: 'Actual completion', type: 'date' }, r.actual)}
    ${field({ k: 'reason', label: 'Reason', type: 'textarea', wide: true }, r.reason)}${field({ k: 'comments', label: 'Comments (also posted to Remarks)', type: 'textarea', wide: true }, r.comments)}</fieldset>
    <div><div class="row"><span class="eyebrow">Attachments</span>${uploadBtn(`rw:${bid}:${rid}`)}</div><div style="margin-top:8px">${docChips(r.docs)}</div></div>`; };
  const m = openModal({ title: `${rid} · batch ${bid}`, body: `<div id="rwd">${draw()}</div>`, actions: [{ label: 'Save rework', run: md => {
    const b = clone(B(bid)), r = b.reworks.find(x => x.id === rid); const old = r.comments; Object.assign(r, readForm(md)); if (r.status === 'Completed' && !r.actual) r.actual = TODAY;
    if (r.comments && r.comments !== old) addRemark(b.projectId, deptOfOrigin(r.origin), `${rid} (batch ${bid}): ${r.comments}`, { batchId: bid, itemId: b.itemId, source: 'Rework' });
    addHist(b, `${rid} updated: ${r.status}`); saveBatch(b, `${rid} on batch ${bid} updated (${r.status})`); } }] });
  modalRefreshers.push(() => { if (!document.body.contains(m.el)) return false; $('#rwd', m.el).innerHTML = draw(); return true; });
};

/* ---------- drag-and-drop stage builder (templates, batch lines, rework sequence) ---------- */
function mountBuilder(host, get, set, locked = () => false, redraw) {
  const draw = () => {
    const st = get();
    host.innerHTML = `<div class="palette" style="margin-bottom:10px">${stageMaster().map(s => `<span class="chip" draggable="true" data-new="${esc(s.name)}" style="--c:${s.type === 'rework' ? 'var(--st-orange)' : s.type === 'qc' || s.type === 'qa' ? 'var(--st-green)' : s.type === 'mfg' ? 'var(--accent)' : 'var(--st-grey)'}" title="Drag into the line, or click to append"><i></i>${esc(s.name)}</span>`).join('')}</div>
    <div class="drop" data-drop>${st.length ? st.map((s, i) => `${i ? ARROW : ''}<div class="bstg" draggable="${locked(s) ? 'false' : 'true'}" data-i="${i}" style="--c:${locked(s) ? 'var(--st-green)' : 'var(--accent)'}">
      <div class="row" style="gap:4px"><span class="mono muted" style="font-size:11px">${i + 1}</span><span class="spacer"></span>${locked(s) ? '<span class="tag">Done</span>' : `<button type="button" class="x" data-mv="-1" aria-label="Move left">‹</button><button type="button" class="x" data-mv="1" aria-label="Move right">›</button><button type="button" class="x" data-rm aria-label="Remove">×</button>`}</div>
      <div class="nm" ${locked(s) ? '' : 'contenteditable="true"'} spellcheck="false">${esc(s.name)}</div><span class="muted" style="font-size:11.5px">${esc(PHASE[s.type || stageType(s.name)] || '')}</span></div>`).join('') : '<span class="muted">Drag stages here to build the line.</span>'}</div>`;
  };
  if (redraw && host._bound) { host._get = get; host._set = set; return draw(); }
  host._get = get; host._set = set; host._bound = true;
  const list = () => clone(host._get());
  const G = () => host._get, Sx = v => host._set(v);
  host.addEventListener('dragstart', e => { const n = e.target.closest('[data-new]'), it = e.target.closest('.bstg'); if (n) e.dataTransfer.setData('text/plain', 'new:' + n.dataset.new); else if (it) { e.dataTransfer.setData('text/plain', 'mv:' + it.dataset.i); it.classList.add('dragging'); } });
  host.addEventListener('dragend', () => $$('.dragging', host).forEach(x => x.classList.remove('dragging')));
  host.addEventListener('dragover', e => { const d = e.target.closest('[data-drop]'); if (d) { e.preventDefault(); d.classList.add('over'); } });
  host.addEventListener('dragleave', e => { const d = e.target.closest('[data-drop]'); if (d) d.classList.remove('over'); });
  host.addEventListener('drop', e => {
    const d = e.target.closest('[data-drop]'); if (!d) return; e.preventDefault(); d.classList.remove('over');
    const data = e.dataTransfer.getData('text/plain'); const its = $$('.bstg', d); let at = its.length;
    for (let k = 0; k < its.length; k++) { const r = its[k].getBoundingClientRect(); if (e.clientX < r.left + r.width / 2) { at = k; break; } }
    const L = list(); const lastLocked = L.reduce((m, s, i) => locked(s) ? i : m, -1); if (at <= lastLocked) at = lastLocked + 1;
    if (data.startsWith('new:')) { const name = data.slice(4); L.splice(at, 0, { name, type: stageType(name) }); }
    else if (data.startsWith('mv:')) { const from = +data.slice(3); if (locked(L[from])) return; const [x] = L.splice(from, 1); L.splice(from < at ? at - 1 : at, 0, x); }
    Sx(L); draw();
  });
  host.addEventListener('click', e => {
    const n = e.target.closest('[data-new]'); if (n) { const L = list(); L.push({ name: n.dataset.new, type: stageType(n.dataset.new) }); Sx(L); draw(); return; }
    const it = e.target.closest('.bstg'); if (!it) return; const i = +it.dataset.i; const L = list();
    if (e.target.closest('[data-rm]')) { L.splice(i, 1); Sx(L); draw(); }
    const mv = e.target.closest('[data-mv]'); if (mv) { const j = i + +mv.dataset.mv; if (j < 0 || j >= L.length || locked(L[j])) return; [L[i], L[j]] = [L[j], L[i]]; Sx(L); draw(); }
  });
  host.addEventListener('focusout', e => { const nm = e.target.closest('.nm'); if (!nm) return; const i = +nm.closest('.bstg').dataset.i; const L = list(); const t = nm.textContent.trim(); if (t && L[i] && t !== L[i].name) { L[i].name = t; Sx(L); } });
  host.addEventListener('keydown', e => { if (e.target.closest('.nm') && e.key === 'Enter') { e.preventDefault(); e.target.blur(); } });
  draw();
}
ACT.editLine = el => {
  const bid = el.dataset.b; const b0 = B(bid); const drive = drivingRW(b0); const lid = drive ? drive.id : 'main';
  let st = clone(lineRef(b0, lid));
  openModal({ title: `Edit stages · batch ${bid} · ${lid === 'main' ? 'Main line' : lid}`, wide: true,
    body: `<p class="muted" style="margin:0">You are editing the driving line. Completed stages are locked to keep history. Drag to reorder, click a name to rename, drag from the palette to add.</p><div id="lineB"></div>`,
    onOpen: md => mountBuilder($('#lineB', md), () => st, x => { st = x; }, s => s.status === 'done' || s.status === 'rejected'),
    actions: [{ label: 'Save stages', run: () => {
      const b = clone(B(bid)); const old = lineRef(b, lid);
      const next = st.map((s, i) => { const prev = s.status ? s : old.find(o => o.name === s.name); return Object.assign({ status: 'notstarted', alloc: b.qty, done: 0, person: '', planned: addDays(b.plannedStart || TODAY, i * 2), actual: '', comment: '' }, prev ? clone(prev) : {}, { name: s.name, type: s.type || (prev && prev.type) || stageType(s.name) }); });
      if (lid === 'main') b.stages = next; else b.reworks.find(r => r.id === lid).stages = next;
      if (!next.some(s => ['progress', 'pending', 'rework'].includes(s.status))) { const k = next.findIndex(s => s.status === 'notstarted'); if (k >= 0 && (k === 0 || next[k - 1].status === 'done')) startStage(next[k]); }
      addHist(b, `Workflow stages edited (${lid})`); saveBatch(b, `Workflow of batch ${bid} edited`);
    } }] });
};

/* ===================== PPC (Project Planning & Control) ===================== */
const pStatusPill = p => pill({ 'Not Started': 'notstarted', Active: 'progress', 'On Hold': 'pending', Completed: 'done' }[pStatus(p)], pStatus(p));
const bubble = n => n ? `<span class="bubble" title="${n} new">${n}</span>` : '';
RENDER.ppc = () => {
  const f = FLT.ppc;
  let rows = S.projects.filter(p => O(p.orderId));
  if (f.status === 'delayed') rows = rows.filter(pDelayed); else if (f.status) rows = rows.filter(p => pStatus(p) === f.status);
  if (f.cust) rows = rows.filter(p => pOrder(p).customer === f.cust); if (f.line) rows = rows.filter(p => pBatches(p.id).some(b => b.line === f.line)); if (f.sales) rows = rows.filter(p => pOrder(p).salesPerson === f.sales); if (f.prod) rows = rows.filter(p => items(pOrder(p)).some(i => i.productCode === f.prod));
  const cols = [
    { h: 'PO / SO', v: p => `<b>${esc(pOrder(p).poNo ? 'PO ' + pOrder(p).poNo : '')}</b><div class="muted mono" style="font-size:12px">${esc(pOrder(p).soNo ? 'SO ' + pOrder(p).soNo : '')}</div>`, sv: p => pRef(p), x: pRef },
    { h: 'Customer', v: p => esc(pOrder(p).customer), sv: p => pOrder(p).customer || '' },
    { h: 'Products', v: p => itemsCell(pOrder(p)), sv: p => oProducts(pOrder(p)), x: p => items(pOrder(p)).map(i => i.productName).join(' | ') },
    { h: 'Order kg', r: 1, v: p => kg(oPoQty(pOrder(p))), sv: p => oPoQty(pOrder(p)), f: false },
    { h: 'Raw Delivery Date', v: p => `${fmtD(pDelivery(p))}${pDelayed(p) ? ' ' + pill('rejected', 'Delayed') : ''}`, sv: pDelivery, x: pDelivery, f: false },
    { h: 'Batches', r: 1, v: p => pBatches(p.id).length, sv: p => pBatches(p.id).length, f: false },
    { h: 'Progress', v: p => `<div class="row" style="flex-wrap:nowrap;min-width:110px"><div class="bar" style="flex:1"><i style="width:${pProgress(p)}%"></i></div><span class="num muted" style="font-size:12px">${pProgress(p)}%</span></div>`, sv: pProgress, x: p => pProgress(p) + '%', f: false },
    { h: 'Mfg', v: p => pill(pStageStatus(p, 'mfg')), sv: p => ST[pStageStatus(p, 'mfg')], x: p => ST[pStageStatus(p, 'mfg')] },
    { h: 'QC', v: p => pill(pStageStatus(p, 'qc')), sv: p => ST[pStageStatus(p, 'qc')], x: p => ST[pStageStatus(p, 'qc')] },
    { h: 'QA', v: p => pill(pStageStatus(p, 'qa')), sv: p => ST[pStageStatus(p, 'qa')], x: p => ST[pStageStatus(p, 'qa')] },
    { h: 'Dispatch', v: p => pill(pStageStatus(p, 'dispatch')), sv: p => ST[pStageStatus(p, 'dispatch')], x: p => ST[pStageStatus(p, 'dispatch')] },
    { h: 'Remarks', v: p => `<span class="rmcell">${pRemarks(p.id).length}${bubble(unreadRemarks(p.id))}</span>`, sv: p => unreadRemarks(p.id) * 1000 + pRemarks(p.id).length, x: p => pRemarks(p.id).length, f: false },
    { h: 'Status', v: p => pStatusPill(p) + (pBatches(p.id).some(inRework) ? ' ' + pill('rework', 'Rework') : ''), sv: pStatus, x: pStatus }
  ];
  EXPORTS.ppc = exportRows('PPC', cols, rows);
  return `${filterBar('ppc', [{ k: 'status', label: 'Status', opts: [...['Not Started', 'Active', 'On Hold', 'Completed'].map(s => ({ v: s, l: s })), { v: 'delayed', l: 'Delayed' }] }, { k: 'cust', label: 'Customer', opts: () => uniq(S.projects.map(p => pOrder(p).customer)).sort() }, { k: 'prod', label: 'Product code', opts: () => uniq(S.projects.flatMap(p => items(pOrder(p)).map(i => i.productCode))).sort() }, { k: 'line', label: 'Production line', opts: lineNames }, { k: 'sales', label: 'Sales person', opts: () => uniq(S.projects.map(p => pOrder(p).salesPerson)).sort() }])}
  <section class="panel">${table('ppc', cols, rows, { sort: 0, dir: -1, colFilters: true, click: p => 'project:' + p.id, rowCls: p => unreadRemarks(p.id) ? 'unread' : '', tools: exportTools('ppc'), empty: 'No orders in PPC yet', emptyHint: '<span>Punch an order to start its products here.</span>' })}</section>`;
};

/* ---------- project drawer ---------- */
let PTAB = 'overview'; const RM_PREV = {};
OPEN.project = pid => { PTAB = 'overview'; delete RM_PREV[pid]; openDrawer(() => projectDrawer(pid)); };
OPEN.projectRemarks = pid => { PTAB = 'remarks'; delete RM_PREV[pid]; openDrawer(() => projectDrawer(pid)); };
function projectDrawer(pid) {
  const p = P(pid); if (!p) return null; const o = pOrder(p); const bs = pBatches(pid);
  const batched = sum(bs, b => b.qty), produced = sum(bs, b => b.produced), disp = sum(bs, dispatchedQty), qty = pQty(p);
  const unread = unreadRemarks(pid);
  const head = `<div style="min-width:0"><div class="eyebrow">Project Planning &amp; Control</div><h2>${esc(o.poNo ? 'PO ' + o.poNo : '')}${o.soNo ? `<span class="soref">SO ${esc(o.soNo)}</span>` : ''}</h2><div class="muted">${esc(o.customer)} · ${items(o).length} product${items(o).length > 1 ? 's' : ''}: ${esc(oProducts(o))}</div></div>
    <div class="row">${pStatusPill(p)}${pDelayed(p) ? pill('rejected', 'Delayed') : ''}
    <button class="btn ghost sm" type="button" data-open="order:${esc(o.id)}">Edit order / add product</button><button class="btn ghost sm" type="button" data-act="toggleHold" data-p="${esc(pid)}">${p.status === 'On Hold' ? 'Resume' : 'Put on hold'}</button></div>`;
  const tabs = [['overview', 'Overview'], ['products', `Products & batches (${bs.length})`], ['workflow', 'Workflow'], ['quality', 'QC / QA'], ['dispatch', 'Dispatch'], ['remarks', `Remarks${unread ? ` <span class="bubble">${unread}</span>` : ` <span class="tag">${pRemarks(pid).length}</span>`}`], ['history', 'History & documents']];
  let body = `<div class="tabs dtabs">${tabs.map(([k, l]) => `<button type="button" data-ptab="${k}" class="${PTAB === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  const qtyStrip = `<div class="kpis">${[['Order qty', qty], ['Allocated to batches', batched], ['Produced', produced], ['Dispatched', disp], ['Pending dispatch', Math.max(0, qty - disp)]].map(([l, v], i) => `<div class="kpi" style="cursor:default;--k:${['var(--accent)', 'var(--st-blue)', 'var(--st-blue)', 'var(--st-green)', 'var(--st-yellow)'][i]}"><div class="l">${l}</div><div class="v">${kg(v)}</div><div class="s">kg</div></div>`).join('')}</div>`;
  const kvs = (fs, src) => `<dl class="kvs">${fs.map(f => `<div><dt>${esc(f.label)}</dt><dd>${f.type === 'date' ? fmtD(src[f.k]) : esc(src[f.k] || '—')}</dd></div>`).join('')}</dl>`;
  if (PTAB === 'overview') {
    body += qtyStrip + ORDER_SECTIONS.slice(0, 2).map(([t, fs]) => `<section class="panel"><header><h3>${t.replace(/^[A-E]\. /, '')}</h3></header><div class="pb">${kvs(fs, o)}</div></section>`).join('') +
      `<section class="panel"><header><h3>Products</h3></header><div class="tw"><table class="t"><thead><tr>${['Product', 'Code', 'Grade', 'PO kg', 'Open kg', 'Packing', 'Workflow', 'Line', 'Special requirements'].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>${items(o).map(i => `<tr><td><b>${esc(i.productName)}</b></td><td class="mono">${esc(i.productCode)}</td><td>${esc(i.grade)}</td><td class="num">${kg(i.poQty)}</td><td class="num">${kg(i.openQty)}</td><td>${esc(i.packing || '—')}</td><td>${esc(tplById(i.tplId).name)}</td><td>${esc(i.line || '—')}</td><td>${esc(i.specialReq || '—')}</td></tr>`).join('')}</tbody></table></div></section>` +
      ORDER_SECTIONS.slice(2).map(([t, fs]) => `<section class="panel"><header><h3>${t.replace(/^[A-E]\. /, '')}</h3></header><div class="pb">${kvs(fs, o)}</div></section>`).join('');
  }
  if (PTAB === 'products') {
    body += qtyStrip + items(o).map(it => { const ibs = bs.filter(b => b.itemId === it.id); const left = (+it.openQty || +it.poQty || 0) - sum(ibs, b => b.qty);
      return `<section class="panel"><header><h3>${esc(it.productName || it.productCode)}</h3><span class="muted mono">${esc(it.productCode)} · ${esc(it.grade || '')}</span><span class="tag">${esc(tplById(it.tplId).name)}</span><span class="tag">${esc(it.line || '—')}</span><span class="spacer"></span><span class="muted" style="font-size:13px">${kg(sum(ibs, b => b.qty))} of ${kg(it.openQty || it.poQty)} kg in ${ibs.length} batch${ibs.length === 1 ? '' : 'es'}</span><button class="btn sm" type="button" data-act="addBatch" data-p="${esc(pid)}" data-i="${esc(it.id)}">${ico('plus')} Add batch</button></header>
      ${left > 0.5 && ibs.length ? `<div class="banner" style="margin:12px 18px 0">${kg(left)} kg of this product is not in a batch yet.</div>` : ''}
      <div class="tw"><table class="t"><thead><tr>${['Batch', 'Line', 'Qty kg', 'Planned', 'Actual', 'Produced', 'Dispatched', 'Stage', ''].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>${ibs.map(b => `<tr><td class="mono"><b>${esc(b.id)}</b></td><td>${esc(b.line)}</td><td class="num">${kg(b.qty)}</td><td>${fmtD(b.plannedStart)} → ${fmtD(b.plannedEnd)}</td><td>${fmtD(b.actualStart)} → ${fmtD(b.actualEnd)}</td><td class="num">${kg(b.produced)}</td><td class="num">${kg(dispatchedQty(b))}</td><td>${phasePill(b)}</td><td class="row" style="flex-wrap:nowrap"><button class="btn ghost sm" type="button" data-act="editBatch" data-b="${esc(b.id)}">Edit</button><button class="btn ghost sm" type="button" data-act="gotoWf" data-b="${esc(b.id)}">Workflow</button></td></tr>`).join('') || `<tr><td colspan="9"><div class="empty">No batches for this product yet.${O(p.orderId).projectId ? '' : ''}</div></td></tr>`}</tbody></table></div></section>`; }).join('');
  }
  if (PTAB === 'workflow') body += legend() + (items(o).map(it => { const ibs = bs.filter(b => b.itemId === it.id); return ibs.length ? `<div class="prodgrp"><div class="eyebrow">${esc(it.productName || it.productCode)} · ${esc(tplById(it.tplId).name)}</div>${ibs.map(batchWorkflowPanel).join('')}</div>` : ''; }).join('') || '<div class="empty">No batches yet.</div>');
  if (PTAB === 'quality') body += bs.map(b => `<section class="panel"><header><h3 class="mono">${esc(b.id)}</h3><span class="muted">${esc(bItem(b).productName || '')}</span>${pill(lineStageStatus(b, 'qc'), 'QC ' + ST[lineStageStatus(b, 'qc')])} ${pill(lineStageStatus(b, 'qa'), 'QA ' + ST[lineStageStatus(b, 'qa')])}<span class="spacer"></span><button class="btn ghost sm" type="button" data-open="qcb:${esc(b.id)}">Open QC</button><button class="btn ghost sm" type="button" data-open="qab:${esc(b.id)}">Open QA &amp; COA</button></header>
      <div class="tw"><table class="t"><thead><tr>${['Test', 'Parameter', 'Spec', 'Result', 'Status', 'By', 'Date'].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>${(b.qcTests || []).map(t => `<tr><td>${esc(t.name)}</td><td>${esc(t.parameter)}</td><td>${esc(t.spec)}</td><td class="num">${esc(t.result || '—')}</td><td>${pill(testKey(t.status), t.status)}</td><td>${esc(t.by)}</td><td>${fmtD(t.date)}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">No QC tests recorded.</td></tr>'}</tbody></table></div>
      <div class="pb"><dl class="kvs"><div><dt>QA status</dt><dd>${esc(b.qa.status)}</dd></div><div><dt>Inspected by</dt><dd>${esc(b.qa.by || '—')}</dd></div><div><dt>QA date</dt><dd>${fmtD(b.qa.date)}</dd></div><div><dt>COA no.</dt><dd class="mono">${esc(b.coa.no || '—')}</dd></div><div><dt>COA status</dt><dd>${esc(b.coa.status)}</dd></div><div><dt>COA released</dt><dd>${fmtD(b.coa.released)}</dd></div></dl></div></section>`).join('');
  if (PTAB === 'dispatch') body += bs.map(b => `<section class="panel"><header><h3 class="mono">${esc(b.id)}</h3><span class="muted">${esc(bItem(b).productName || '')} · ${kg(dispatchedQty(b))} of ${kg(b.qty)} kg dispatched</span><span class="spacer"></span><button class="btn ghost sm" type="button" data-open="dispb:${esc(b.id)}">Manage shipments</button></header>
      <div class="tw"><table class="t"><thead><tr>${['Shipment', 'Qty kg', 'Invoice', 'Container', 'Dispatch date', 'Status'].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>${(b.shipments || []).map(s => `<tr><td class="mono">${esc(s.id)}</td><td class="num">${kg(s.qty)}</td><td>${esc(s.invoiceNo)} · ${fmtD(s.invoiceDate)}</td><td>${esc(s.containerNo || '—')} ${esc(s.containerSize || '')}</td><td>${fmtD(s.dispatchDate)}</td><td>${pill(s.status === 'Dispatched' ? 'done' : s.status === 'Booked' ? 'progress' : 'pending', s.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No shipments yet.</td></tr>'}</tbody></table></div></section>`).join('');
  if (PTAB === 'remarks') {
    if (!(pid in RM_PREV)) { RM_PREV[pid] = rmSeen(pid); markRmSeen(pid); setTimeout(renderNav, 0); } else if (pRemarks(pid)[0] && pRemarks(pid)[0].at > rmSeen(pid)) markRmSeen(pid);
    const prev = RM_PREV[pid]; const rms = pRemarks(pid); const nNew = rms.filter(r => r.at > prev).length;
    body += `<section class="panel"><header><h3>Add a remark</h3><span class="muted" style="font-size:13px">Everyone who opens this order sees it, highlighted as new.</span></header><div class="pb"><div class="rmform">
      <label class="f"><span>Department</span>${combo({ opts: MSRC.departments, value: LS.get('ot-dept', ''), k: 'rm_dept', id: 'rm_dept', strict: true })}</label>
      <label class="f"><span>Your name</span>${combo({ opts: MSRC.employees, value: LS.get('ot-me', ''), k: 'rm_by', id: 'rm_by', strict: true })}</label>
      <label class="f"><span>Product / batch (optional)</span>${combo({ opts: [{ v: '', l: 'Whole order' }, ...items(o).map(i => ({ v: 'i:' + i.id, l: i.productName || i.productCode })), ...bs.map(b => ({ v: 'b:' + b.id, l: 'Batch ' + b.id, sub: bItem(b).productName }))], value: '', k: 'rm_ref', id: 'rm_ref', strict: true })}</label>
      <label class="f wide"><span>Remark</span><textarea id="rm_text" rows="2" placeholder="Type the remark…"></textarea></label>
      <div class="wide row"><button class="btn" type="button" data-act="addRemark" data-p="${esc(pid)}">Post remark</button></div></div></div></section>
      <section class="panel"><header><h3>All remarks</h3>${nNew ? `<span class="bubble">${nNew} new</span>` : ''}<span class="spacer"></span><span class="muted" style="font-size:13px">${rms.length} total · newest first</span></header>
      <div class="tw"><table class="t rmt"><thead><tr>${['When', 'Department', 'Remark', 'By', 'Product / batch', 'From'].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>${rms.map(r => { const isNew = r.at > prev; const it = r.itemId ? itemOf(o, r.itemId) : null;
        return `<tr class="${isNew ? 'unread' : ''}"><td class="nowrap">${isNew ? newChip() + ' ' : ''}${fmtDT(r.at)}</td><td><span class="dept">${esc(r.dept)}</span></td><td class="rmtext">${esc(deRef(r.text))}</td><td>${esc(r.by || '—')}</td><td>${r.batchId ? `<span class="mono">${esc(r.batchId)}</span>` : ''}${it && it.productName ? `<div class="muted" style="font-size:12px">${esc(it.productName)}</div>` : r.batchId ? '' : 'Whole order'}</td><td><span class="tag">${esc(r.source || 'Remark')}</span></td></tr>`; }).join('') || `<tr><td colspan="6"><div class="empty"><b>No remarks yet</b><span>Remarks posted here, and comments entered in QC, QA, rework, manufacturing and dispatch, all collect on this tab.</span></div></td></tr>`}</tbody></table></div></section>`;
  }
  if (PTAB === 'history') {
    const ids = new Set([pid, o.id, ...bs.map(b => b.id)]);
    const ev = S.activity.filter(a => ids.has(a.ref)).map(a => ({ at: a.at.slice(0, 10), t: a.at, text: a.text })).concat(bs.flatMap(b => (b.history || []).map(h => ({ at: h.at, t: h.ts || h.at, text: `${b.id}: ${h.text}` }))));
    const seen = new Set(); const evs = ev.sort(by('t', -1)).filter(e => { const k = e.at + e.text; if (seen.has(k)) return false; seen.add(k); return true; });
    body += `<section class="panel"><header><h3>Order documents</h3><span class="spacer"></span>${uploadBtn('project:' + pid)}</header><div class="pb">${docChips([...(o.docs || []), ...(p.docs || [])])}</div></section>
      ${bs.map(b => `<section class="panel"><header><h3 class="mono" style="font-size:16px">${esc(b.id)} documents</h3><span class="spacer"></span>${uploadBtn('batch:' + b.id)}</header><div class="pb">${docChips([...(b.docs || []), ...(b.qcTests || []).flatMap(t => t.docs || []), ...(b.qa.docs || []), ...(b.coa.docs || []), ...(b.shipments || []).flatMap(s => s.docs || [])])}</div></section>`).join('')}
      <section class="panel"><header><h3>Activity and status history</h3></header><div class="pb list">${evs.map(e => `<div class="row" style="font-size:14px;flex-wrap:nowrap"><span class="mono muted" style="font-size:12px;width:90px;flex:none">${fmtD(e.at)}</span><span style="min-width:0">${esc(deRef(e.text))}</span></div>`).join('') || '<span class="muted">No history yet.</span>'}</div></section>`;
  }
  return { head, body };
}
const testKey = s => ({ Passed: 'done', Failed: 'rejected', 'In Progress': 'progress', Pending: 'pending' }[s] || 'notstarted');
ACT.addRemark = el => {
  const pid = el.dataset.p; const dr = $('.drawer'); const dept = val(dr, 'rm_dept'), by = val(dr, 'rm_by'), ref = val(dr, 'rm_ref'), text = $('#rm_text', dr).value.trim();
  if (!dept) { toast('Pick the department.'); return; } if (!text) { toast('Type the remark first.'); return; }
  LS.set('ot-dept', dept); if (by) LS.set('ot-me', by);
  const b = ref && ref.startsWith('b:') ? B(ref.slice(2)) : null;
  addRemark(pid, dept, text, { by, batchId: b ? b.id : '', itemId: b ? b.itemId : (ref && ref.startsWith('i:') ? ref.slice(2) : ''), source: 'Remark' });
  RM_PREV[pid] = rmSeen(pid); setTimeout(() => markRmSeen(pid), 50);
  log(`Remark from ${dept} on ${refOfPid(pid)}`, pid); toast('Remark posted');
};
ACT.gotoWf = () => { PTAB = 'workflow'; renderDrawer(); };
ACT.toggleHold = el => { const p = clone(P(el.dataset.p)); const hold = p.status !== 'On Hold'; p.status = hold ? 'On Hold' : 'Active'; put('projects', p); const o = O(p.orderId); if (o) put('orders', Object.assign(clone(o), { status: hold ? 'On Hold' : 'Open' })); log(`${pRef(p)} ${hold ? 'put on hold' : 'resumed'}`, p.id); };
ACT.addBatch = el => OPEN.batchForm(el.dataset.p, null, el.dataset.i);
ACT.editBatch = el => OPEN.batchForm(null, el.dataset.b);
OPEN.batchForm = (pid, bid, itemId) => {
  const b0 = bid ? B(bid) : null; pid = pid || b0.projectId; const p = P(pid), o = pOrder(p);
  const it = itemOf(o, b0 ? b0.itemId : itemId);
  const itemQty = +(it.openQty || it.poQty || 0);
  const rem = Math.max(0, itemQty - sum(pBatches(pid).filter(x => x.itemId === it.id && x.id !== bid), x => x.qty));
  const v = b0 ? clone(b0) : { qty: rem, line: it.line || unitToLine(o.unit), plannedStart: addDays(TODAY, 1), plannedEnd: addDays(TODAY, 5), materialInDate: TODAY, qcPlanned: addDays(TODAY, 6), qaPlanned: addDays(TODAY, 8), expDispatch: addDays(TODAY, 11), tpl: it.tplId || tplById('').id };
  const fs = [{ k: 'qty', label: 'Batch quantity (kg)', type: 'number', req: true }, { k: 'line', label: 'Production line', src: 'lines', req: true, ro: !!b0 }, { k: 'plannedStart', label: 'Planned start', type: 'date' }, { k: 'plannedEnd', label: 'Planned completion', type: 'date' }, { k: 'actualStart', label: 'Actual start', type: 'date' }, { k: 'actualEnd', label: 'Actual completion', type: 'date' }, { k: 'materialInDate', label: 'Material in date', type: 'date' }, { k: 'qcPlanned', label: 'QC planned date', type: 'date' }, { k: 'qaPlanned', label: 'QA planned date', type: 'date' }, { k: 'expDispatch', label: 'Expected dispatch', type: 'date' }, { k: 'resource', label: 'Resource / machine', src: 'machines' }, { k: 'materialIn', label: 'Material in details', type: 'textarea', wide: true }, { k: 'remarks', label: 'Batch remarks (also posted to Remarks)', type: 'textarea', wide: true }];
  openModal({ title: bid ? `Batch ${bid}` : `New batch · ${it.productName || it.productCode}`, wide: true, body: `<fieldset class="sec"><legend>${esc(it.productName || '')} · ${esc(it.grade || '')} · ${esc(oRef(o))}</legend>${fs.map(f => field(f, v[f.k])).join('')}
    ${bid ? '' : field({ k: 'tpl', label: 'Workflow', src: 'templates' }, v.tpl)}</fieldset><p class="muted" style="margin:0">${kg(rem)} kg of ${kg(itemQty)} kg of this product is not yet in another batch.</p>`,
    actions: [{ label: bid ? 'Save batch' : 'Create batch', run: md => {
      const r = readForm(md); if (!r.qty || !r.line) { toast('Quantity and line are required.'); return false; }
      if (+r.qty > rem + 0.001) { toast(`Only ${kg(rem)} kg of this product is unallocated.`); return false; }
      if (bid) { const b = clone(B(bid)); const old = b.remarks; Object.assign(b, r, { qty: +r.qty }); if (r.remarks && r.remarks !== old) addRemark(pid, 'Planning', `Batch ${bid}: ${r.remarks}`, { batchId: bid, itemId: b.itemId, source: 'Batch' }); addHist(b, 'Batch details edited'); saveBatch(b, `Batch ${bid} edited`); return; }
      const tpl = r.tpl; delete r.tpl; const o2 = clone(O(p.orderId)); const it2 = itemOf(o2, it.id); const before = new Set(S.batches.map(x => x.id));
      createBatchesForItem(o2, Object.assign({}, it2, { tplId: tpl, line: r.line, openQty: +r.qty, poQty: +r.qty }), pid, 1);
      const nb = S.batches.find(x => !before.has(x.id)); if (nb) { const b = clone(nb); ['plannedStart', 'plannedEnd', 'materialInDate', 'qcPlanned', 'qaPlanned', 'expDispatch', 'resource', 'materialIn', 'remarks'].forEach(k => { if (r[k]) b[k] = r[k]; }); put('batches', b); log(`Batch ${b.id} (${kg(b.qty)} kg) added for ${it.productName} on ${b.line}`, pid); toast(`Batch ${b.id} created`); }
    } }] });
};
