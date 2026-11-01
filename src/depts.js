/* ===================== shared bits for department queues ===================== */
const bCols = {
  batch: v => ({ h: 'Batch', v: b => `<b class="mono">${esc(b.id)}</b>${isNewFor(v, b, VISIT_PREV[v]) ? ' ' + newChip() : ''}${inRework(b) ? ' ' + pill('rework', drivingRW(b).id) : ''}`, sv: b => b.id, x: b => b.id }),
  ref: () => ({ h: 'PO / SO', v: b => `<span>${esc(refOfPid(b.projectId))}</span>`, sv: b => refOfPid(b.projectId), x: b => refOfPid(b.projectId) }),
  cust: () => ({ h: 'Customer', v: b => esc(bOrder(b).customer), sv: b => bOrder(b).customer || '' }),
  prod: () => ({ h: 'Product', v: b => `${esc(bItem(b).productName)}<div class="muted mono" style="font-size:12px">${esc(bItem(b).productCode)}</div>`, sv: b => bItem(b).productName || '', x: b => bItem(b).productName }),
  grade: () => ({ h: 'Grade', v: b => esc(bItem(b).grade), sv: b => bItem(b).grade || '' }),
  line: () => ({ h: 'Line', v: b => esc(b.line), sv: b => b.line || '' }),
  qty: () => ({ h: 'Qty kg', r: 1, v: b => kg(b.qty), sv: b => +b.qty, f: false }),
  stage: () => ({ h: 'Current stage', v: b => phasePill(b) + (batchDelayed(b) ? ' ' + pill('rejected', 'Late') : ''), sv: phaseLabel, x: phaseLabel }),
  since: () => ({ h: 'Arrived', v: b => stageStarted(b) ? fmtDT(stageStarted(b)) : '—', sv: stageStarted, x: b => stageStarted(b), f: false })
};
const rowNew = v => b => isNewFor(v, b, VISIT_PREV[v]) ? 'unread' : '';
const newNote = v => { const n = deptBatches(v).filter(b => isNewFor(v, b, VISIT_PREV[v])).length; return n ? `<div class="alert s-progress"><span><b>${n} batch${n > 1 ? 'es' : ''} arrived since your last visit</b>, marked NEW below. The previous department completed its stage and the batch moved here automatically.</span></div>` : ''; };

/* ===================== Manufacturing (list-first, column filters) ===================== */
const prodEntries = b => (b.prodLog && b.prodLog.length) ? b.prodLog : (+b.produced ? [{ date: b.actualEnd || b.actualStart || b.plannedStart, qty: +b.produced }] : []);
RENDER.manufacturing = () => {
  const tab = FLT.mfg.tab; const all = S.batches.filter(b => P(b.projectId));
  const inProd = all.filter(b => phaseKey(b) === 'mfg'), material = all.filter(b => phaseKey(b) === 'material');
  const rows = tab === 'prod' ? inProd : tab === 'material' ? material : all;
  const act = all.filter(b => !['completed', 'hold'].includes(phaseKey(b)));
  const planned = sum(act, b => b.qty), produced = sum(act, b => b.produced);
  const cols = [bCols.batch('manufacturing'), bCols.ref(), bCols.cust(), bCols.prod(), bCols.grade(), bCols.line(), bCols.qty(),
    { h: 'Produced kg', r: 1, v: b => kg(b.produced), sv: b => +b.produced || 0, f: false }, { h: 'Pending kg', r: 1, v: b => kg(Math.max(0, b.qty - (b.produced || 0))), sv: b => b.qty - (b.produced || 0), f: false },
    { h: 'Start → finish', v: b => `${fmtD(b.actualStart || b.plannedStart)} → ${fmtD(b.actualEnd || b.plannedEnd)}`, sv: b => b.plannedStart || '', x: b => `${b.actualStart || b.plannedStart} → ${b.actualEnd || b.plannedEnd}`, f: false },
    bCols.stage(), bCols.since()];
  EXPORTS.mfg = exportRows('Manufacturing', cols, rows);
  return `${strip([['In production', inProd.length + ' batches', 'var(--st-blue)'], ['Awaiting material', material.length + ' batches', 'var(--st-yellow)'], ['In rework', all.filter(b => inRework(b) && phaseKey(b) === 'mfg').length + ' batches', 'var(--st-orange)'], ['Planned (open batches)', kg(planned) + ' kg', 'var(--st-grey)'], ['Produced', kg(produced) + ' kg', 'var(--st-green)'], ['Pending', kg(Math.max(0, planned - produced)) + ' kg', 'var(--st-yellow)']])}
    ${newNote('manufacturing')}
    <div class="row"><div class="tabs">${[['prod', `In production (${inProd.length})`], ['material', `Awaiting material (${material.length})`], ['all', `All batches (${all.length})`]].map(([k, l]) => `<button type="button" data-ftab="mfg:${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <section class="panel">${table('mfg' + tab, cols, rows, { sort: 11, dir: -1, colFilters: true, click: b => 'mfgb:' + b.id, rowCls: rowNew('manufacturing'), tools: exportTools('mfg'), empty: tab === 'prod' ? 'No batches on the lines right now' : 'Nothing here' })}</section>`;
};
OPEN.mfgb = bid => {
  const draw = () => { const b = B(bid), it = bItem(b); const cur = curStage(b); const L = activeLine(b); const s = L.find(x => x.type === 'mfg' && x.status !== 'done') || [...L].reverse().find(x => x.type === 'mfg');
    return `${inRework(b) ? `<div class="banner" style="background:color-mix(in srgb,var(--st-orange) 12%,var(--surface));border-color:color-mix(in srgb,var(--st-orange) 40%,transparent)"><b>${esc(drivingRW(b).id)} rework:</b> ${esc(drivingRW(b).reason)}</div>` : ''}
    <dl class="kvs"><div><dt>Order</dt><dd>${esc(refOfPid(b.projectId))}</dd></div><div><dt>Customer</dt><dd>${esc(bOrder(b).customer)}</dd></div><div><dt>Product · grade</dt><dd>${esc(it.productName)} · ${esc(it.grade)}</dd></div><div><dt>Line</dt><dd>${esc(b.line)}</dd></div><div><dt>Allocated</dt><dd>${kg(b.qty)} kg</dd></div><div><dt>Produced so far</dt><dd>${kg(b.produced)} kg</dd></div><div><dt>Pending</dt><dd>${kg(Math.max(0, b.qty - (b.produced || 0)))} kg</dd></div><div><dt>Current stage</dt><dd>${phasePill(b)}</dd></div></dl>
    ${cur && cur.type === 'material' ? `<div class="alert s-pending"><span>Waiting for raw material. When it arrives, click <b>Material received</b> to start production on ${esc(b.line)}.</span><span class="spacer"></span><button class="btn sm ok" type="button" id="matIn">Material received</button></div>` : ''}
    <fieldset class="sec"><legend>Record production</legend>${field({ k: 'pdate', label: 'Production date', type: 'date' }, TODAY)}${field({ k: 'pqty', label: 'Quantity produced (kg)', type: 'number' }, '')}<label class="f"><span>Manufacturing status</span>${combo({ opts: Object.entries({ notstarted: 'Not Started', progress: 'In Progress', done: 'Completed', pending: 'Pending' }).map(([v, l]) => ({ v, l })), value: s ? s.status : 'notstarted', k: 'mstatus' })}</label>
      ${field({ k: 'actualStart', label: 'Actual start', type: 'date' }, b.actualStart)}${field({ k: 'actualEnd', label: 'Actual completion', type: 'date' }, b.actualEnd)}${field({ k: 'mfgDetails', label: 'Manufacturing details / remarks (posted to Remarks)', type: 'textarea', wide: true }, '')}</fieldset>
    <section><div class="row"><span class="eyebrow">Production history</span></div><div class="tw"><table class="t"><thead><tr><th class="ns">Date</th><th class="ns r">Qty kg</th><th class="ns">Note</th></tr></thead><tbody>${prodEntries(b).map(e => `<tr><td>${fmtD(e.date)}</td><td class="r num">${kg(e.qty)}</td><td>${esc(e.note || '')}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">No production recorded.</td></tr>'}</tbody></table></div></section>
    <section><div class="row"><span class="eyebrow">Production documents</span><span class="spacer"></span>${uploadBtn('batch:' + bid)}</div><div style="margin-top:8px">${docChips(b.docs)}</div></section>`; };
  const m = openModal({ title: `Manufacturing · batch ${bid}`, wide: true, body: `<div id="mfd">${draw()}</div>`, onOpen: md => md.addEventListener('click', e => { if (e.target.id !== 'matIn') return; const b = clone(B(bid)); b.materialIn = b.materialIn || 'Raw material received'; completeType(b, 'material', 'material received'); saveBatch(b, `Material received for batch ${bid} — production started on ${b.line}`); $('#mfd', md).innerHTML = draw(); toast('Material received · production started'); }),
    actions: [{ label: 'Save production', id: 'saveProd', run: md => {
      const r = readForm(md); const b = clone(B(bid)); b.prodLog = b.prodLog && b.prodLog.length ? b.prodLog : prodEntries(b).map(e => Object.assign({}, e));
      const rw = inRework(b) ? drivingRW(b) : null; const q = +r.pqty || 0;
      let L = activeLine(b); const mi = L.findIndex(x => x.type === 'material' && x.status !== 'done'); if (mi >= 0 && (q > 0 || r.mstatus === 'done')) completeStage(b, L, mi, 'material received');
      L = activeLine(b); const i = L.findIndex(x => x.type === 'mfg' && x.status !== 'done');
      if (q > 0) {
        if (rw) { const st = L[i] || {}; if ((+st.done || 0) + q > (+st.alloc || rw.qty) * 1.05) { toast(`That would exceed the ${rw.id} rework quantity by more than 5%.`); return false; } b.prodLog.push({ date: r.pdate || TODAY, qty: q, note: `${rw.id} reprocess${r.mfgDetails ? ' · ' + r.mfgDetails.slice(0, 60) : ''}` }); if (i >= 0) L[i].done = (+L[i].done || 0) + q; addHist(b, `${rw.id}: reprocessed ${kg(q)} kg`); }
        else { if ((+b.produced || 0) + q > b.qty * 1.05) { toast('That would exceed the batch quantity by more than 5%.'); return false; } b.prodLog.push({ date: r.pdate || TODAY, qty: q, note: r.mfgDetails ? r.mfgDetails.slice(0, 80) : '' }); b.produced = (+b.produced || 0) + q; if (i >= 0) L[i].done = Math.min(L[i].alloc, b.produced); addHist(b, `Produced ${kg(q)} kg`); }
      }
      b.actualStart = r.actualStart || (q > 0 ? b.actualStart || r.pdate : b.actualStart); b.actualEnd = r.actualEnd;
      if (r.mfgDetails) { b.mfgDetails = r.mfgDetails; addRemark(b.projectId, 'Manufacturing', `Batch ${bid}: ${r.mfgDetails}`, { batchId: bid, itemId: b.itemId, source: 'Manufacturing' }); }
      if (i >= 0) {
        const full = (+L[i].done || 0) >= (+L[i].alloc || 0) - 0.001 && (+L[i].alloc || 0) > 0;
        if (r.mstatus === 'done' || (full && AUTO())) { if (!rw) b.actualEnd = b.actualEnd || TODAY; completeStage(b, L, i, `${kg(L[i].done)} kg ${rw ? 'reprocessed' : 'produced'}`); }
        else if (r.mstatus && r.mstatus !== L[i].status) { L[i].status = r.mstatus; if (r.mstatus === 'progress') L[i].startedAt = L[i].startedAt || nowISO(); }
      }
      saveBatch(b, `Batch ${bid}: production updated — ${rw ? `${rw.id} ${kg((L[i] || {}).done)} of ${kg(rw.qty)} kg reprocessed` : `${kg(b.produced)} of ${kg(b.qty)} kg`}`);
    } }] });
  modalRefreshers.push(() => { if (!document.body.contains(m.el)) return false; $('#mfd', m.el).innerHTML = draw(); return true; });
};

/* ===================== Quality Control ===================== */
const qcStage = b => { const L = activeLine(b); return L.find(s => s.type === 'qc' && s.status !== 'done') || [...L].reverse().find(s => s.type === 'qc'); };
RENDER.qc = () => {
  const tab = FLT.qc.tab; const all = S.batches.filter(b => P(b.projectId));
  const tests = all.flatMap(b => b.qcTests || []);
  const rows = tab === 'queue' ? all.filter(b => phaseKey(b) === 'qc') : tab === 'failed' ? all.filter(b => (b.qcTests || []).some(t => t.status === 'Failed') || (b.reworks || []).some(r => r.origin === 'QC')) : tab === 'done' ? all.filter(b => lineStageStatus(b, 'qc') === 'done') : all.filter(b => (b.qcTests || []).length);
  const cols = [bCols.batch('qc'), bCols.ref(), bCols.cust(), bCols.prod(), bCols.qty(),
    { h: 'Tests', v: b => { const t = b.qcTests || []; return `${t.filter(x => x.status === 'Passed').length}/${t.length} passed${t.some(x => x.status === 'Failed') ? ' · ' + pill('rejected', t.filter(x => x.status === 'Failed').length + ' failed') : ''}`; }, sv: b => (b.qcTests || []).length, x: b => `${(b.qcTests || []).filter(x => x.status === 'Passed').length}/${(b.qcTests || []).length} passed`, f: false },
    { h: 'QC planned', v: b => fmtD((qcStage(b) || {}).planned || b.qcPlanned), sv: b => (qcStage(b) || {}).planned || '', x: b => (qcStage(b) || {}).planned, f: false }, { h: 'Assigned', v: b => esc((qcStage(b) || {}).person || '—'), sv: b => (qcStage(b) || {}).person || '' }, { h: 'QC status', v: b => pill(lineStageStatus(b, 'qc')), sv: b => ST[lineStageStatus(b, 'qc')], x: b => ST[lineStageStatus(b, 'qc')] }, bCols.since()];
  EXPORTS.qc = exportRows('QC register', cols, rows);
  return `${strip([['Awaiting QC', all.filter(b => phaseKey(b) === 'qc').length + ' batches', 'var(--st-yellow)'], ['Tests pending', tests.filter(t => t.status === 'Pending').length, 'var(--st-yellow)'], ['In progress', tests.filter(t => t.status === 'In Progress').length, 'var(--st-blue)'], ['Passed', tests.filter(t => t.status === 'Passed').length, 'var(--st-green)'], ['Failed', tests.filter(t => t.status === 'Failed').length, 'var(--st-red)'], ['QC reworks open', all.filter(b => inRework(b) && drivingRW(b).origin === 'QC').length, 'var(--st-orange)']])}
    ${newNote('qc')}<div class="row"><div class="tabs">${[['queue', 'Awaiting QC'], ['all', 'All tested batches'], ['failed', 'Failed & rework'], ['done', 'QC completed']].map(([k2, l]) => `<button type="button" data-ftab="qc:${k2}" class="${tab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <section class="panel">${table('qc' + tab, cols, rows, { colFilters: true, click: b => 'qcb:' + b.id, rowCls: rowNew('qc'), tools: exportTools('qc'), empty: tab === 'queue' ? 'No batches waiting for QC' : 'Nothing here' })}</section>`;
};
OPEN.qcb = bid => {
  const draw = () => { const b = B(bid), it = bItem(b), s = qcStage(b);
    return `${inRework(b) ? `<div class="banner" style="background:color-mix(in srgb,var(--st-orange) 12%,var(--surface))"><b>Re-test after ${esc(drivingRW(b).id)}:</b> ${esc(drivingRW(b).reason)}</div>` : ''}<dl class="kvs"><div><dt>Order</dt><dd>${esc(refOfPid(b.projectId))}</dd></div><div><dt>Customer</dt><dd>${esc(bOrder(b).customer)}</dd></div><div><dt>Product · grade</dt><dd>${esc(it.productName)} · ${esc(it.grade)}</dd></div><div><dt>Batch qty</dt><dd>${kg(b.qty)} kg on ${esc(b.line)}</dd></div><div><dt>QC stage</dt><dd>${pill((s || {}).status || 'notstarted')}</dd></div><div><dt>Special requirement</dt><dd>${esc(it.specialReq || '—')}</dd></div></dl>
    <div class="row">${field({ k: 'qcPerson', label: 'QC personnel assigned', src: 'employees' }, (s || {}).person)}${field({ k: 'qcPlanned', label: 'Testing planned date', type: 'date' }, (s || {}).planned)}</div>
    <div class="tw"><table class="t" id="qct"><thead><tr>${['Test', 'Parameter', 'Specification', 'Tested by', 'Date', 'Result', 'Status', 'Analysis / observations', 'Remarks', 'Docs', ''].map(h => `<th class="ns">${h}</th>`).join('')}</tr></thead><tbody>
    ${(b.qcTests || []).map(t => `<tr data-tid="${esc(t.id)}"><td style="min-width:150px">${combo({ opts: MSRC.qctests, value: t.name, strict: false }).replace('data-cbx', 'data-t="name" data-cbx')}</td><td><input data-t="parameter" value="${esc(t.parameter)}" style="min-width:110px"></td><td><input data-t="spec" value="${esc(t.spec)}" style="min-width:110px"></td><td style="min-width:150px">${combo({ opts: MSRC.employees, value: t.by, strict: true }).replace('data-cbx', 'data-t="by" data-cbx')}</td><td><input data-t="date" type="date" value="${esc(t.date)}"></td><td><input data-t="result" value="${esc(t.result)}" style="min-width:80px"></td>
      <td style="min-width:130px">${combo({ opts: ['Pending', 'In Progress', 'Passed', 'Failed'], value: t.status, strict: true }).replace('data-cbx', 'data-t="status" data-cbx')}</td><td><input data-t="analysis" value="${esc(t.analysis)}" style="min-width:150px"></td><td><input data-t="remarks" value="${esc(t.remarks)}" style="min-width:110px"></td><td>${(t.docs || []).length ? `<span class="tag">${t.docs.length}</span>` : ''} ${ASSETS ? `<label class="link" style="cursor:pointer">${ico('clip').replace('<svg', '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"')}<input type="file" hidden multiple data-upload="test:${esc(bid)}:${esc(t.id)}"></label>` : ''}</td><td><button class="link" type="button" data-deltest="${esc(t.id)}" style="color:var(--st-red)">Remove</button></td></tr>`).join('') || `<tr><td colspan="11" class="muted">No tests yet. Add the standard set or individual tests.</td></tr>`}</tbody></table></div>
    <div class="row"><button class="btn ghost sm" type="button" data-addtest="std">${ico('plus')} Add standard tests</button><button class="btn ghost sm" type="button" data-addtest="one">${ico('plus')} Add a test</button><span class="spacer"></span>${uploadBtn('batch:' + bid)}</div>
    <div>${docChips([...(b.docs || []), ...(b.qcTests || []).flatMap(t => t.docs || [])])}</div>`; };
  const collect = md => { const b = clone(B(bid)); $$('#qct tr[data-tid]', md).forEach(tr => { const t = b.qcTests.find(x => x.id === tr.dataset.tid); if (!t) return; $$('[data-t]', tr).forEach(i => { t[i.dataset.t] = i.dataset.cbx ? (i.dataset.val || i.value.trim()) : i.value.trim(); }); const q = M('qctests').find(x => x.name === t.name); if (q) { t.parameter = t.parameter || q.parameter; t.spec = t.spec || q.spec; } });
    const s = activeLine(b).find(x => x.type === 'qc' && x.status !== 'done'); if (s) { s.person = val(md, 'qcPerson') || s.person; s.planned = val(md, 'qcPlanned') || s.planned; } return b; };
  const m = openModal({ title: `Quality Control · batch ${bid}`, wide: true, body: `<div id="qcd">${draw()}</div>`, onOpen: md => {
    md.addEventListener('click', e => { const a = e.target.closest('[data-addtest]'), d = e.target.closest('[data-deltest]'); if (!a && !d) return; const b = collect(md);
      if (d) b.qcTests = b.qcTests.filter(t => t.id !== d.dataset.deltest);
      if (a) { const add = a.dataset.addtest === 'std' ? M('qctests').filter(q => !b.qcTests.some(t => t.name === q.name)) : [{ name: '', parameter: '', spec: '' }]; add.forEach(q => b.qcTests.push({ id: uid('T'), name: q.name, parameter: q.parameter, spec: q.spec, date: TODAY, by: val(md, 'qcPerson') || '', result: '', status: 'Pending', analysis: '', remarks: '', docs: [] })); const s = activeLine(b).find(x => x.type === 'qc' && x.status === 'notstarted'); if (s) startStage(s); }
      put('batches', b); $('#qcd', md).innerHTML = draw(); });
  }, actions: [{ label: 'Fail & send to rework', cls: 'warn', id: 'qcFail', run: md => { const b = collect(md); put('batches', b); setTimeout(() => OPEN.reworkForm(bid, 'qc'), 40); } },
    { label: 'Save tests', cls: 'ghost', id: 'qcSave', run: md => qcSave(collect(md), false) }, { label: 'Save & complete QC', cls: 'ok', id: 'qcDone', run: md => qcSave(collect(md), true) }] });
  modalRefreshers.push(() => { if (!document.body.contains(m.el)) return false; $('#qcd', m.el).innerHTML = draw(); return true; });
};
function qcSave(b, complete) {
  const old = B(b.id); const t = b.qcTests || []; const failed = t.filter(x => x.status === 'Failed'); const allPass = t.length && t.every(x => x.status === 'Passed');
  if (complete && !allPass) { toast(failed.length ? 'Some tests failed. Send the batch to rework instead.' : 'Every test must be Passed to complete QC.'); return false; }
  t.forEach(x => { const ox = (old.qcTests || []).find(y => y.id === x.id) || {}; const txt = [x.analysis !== ox.analysis && x.analysis, x.remarks !== ox.remarks && x.remarks].filter(Boolean).join(' — '); if (txt) addRemark(b.projectId, 'Quality Control', `${x.name} (batch ${b.id}): ${txt}`, { by: x.by, batchId: b.id, itemId: b.itemId, source: 'QC' }); });
  const s = activeLine(b).find(x => x.type === 'qc' && x.status !== 'done');
  if (s && s.status === 'notstarted' && t.some(x => x.status !== 'Pending')) startStage(s);
  if (allPass && (complete || AUTO()) && s) { completeStage(b, activeLine(b), activeLine(b).indexOf(s), `${t.length} tests passed`); saveBatch(b, `QC passed for batch ${b.id} — moved to QA`); toast('QC completed · batch moved to QA'); return; }
  addHist(b, `QC tests updated (${t.filter(x => x.status === 'Passed').length}/${t.length} passed)`); saveBatch(b, `QC tests updated on batch ${b.id}`);
  if (failed.length && AUTO()) { toast('A test failed — set up the rework line.'); setTimeout(() => OPEN.reworkForm(b.id, 'qc'), 60); }
}

/* ===================== Quality Assurance ===================== */
RENDER.qa = () => {
  const tab = FLT.qa.tab; const all = S.batches.filter(b => P(b.projectId));
  const rows = tab === 'queue' ? all.filter(b => phaseKey(b) === 'qa') : tab === 'coa' ? all.filter(b => b.coa && b.coa.status !== 'Not Started') : tab === 'approved' ? all.filter(b => b.qa && b.qa.status === 'Approved') : all.filter(b => b.qa && b.qa.status === 'Rejected' || (b.reworks || []).some(r => r.origin === 'QA'));
  const cols = tab === 'coa' ? [{ h: 'COA no.', v: b => `<b class="mono">${esc(b.coa.no || '—')}</b>`, sv: b => b.coa.no || '', x: b => b.coa.no }, bCols.batch('qa'), bCols.ref(), bCols.cust(), bCols.prod(), { h: 'Prepared', v: b => fmtD(b.coa.prepared), sv: b => b.coa.prepared || '', x: b => b.coa.prepared, f: false }, { h: 'Reviewed', v: b => fmtD(b.coa.reviewed), sv: b => b.coa.reviewed || '', x: b => b.coa.reviewed, f: false }, { h: 'Released', v: b => fmtD(b.coa.released), sv: b => b.coa.released || '', x: b => b.coa.released, f: false }, { h: 'Status', v: b => pill(b.coa.status === 'Released' ? 'done' : 'pending', b.coa.status), sv: b => b.coa.status, x: b => b.coa.status }]
    : [bCols.batch('qa'), bCols.ref(), bCols.cust(), bCols.prod(), bCols.qty(), { h: 'QC', v: b => pill(lineStageStatus(b, 'qc')), sv: b => ST[lineStageStatus(b, 'qc')], x: b => ST[lineStageStatus(b, 'qc')] }, { h: 'Inspection', v: b => `${esc(b.qa.by || '—')}<div class="muted" style="font-size:12px">${fmtD(b.qa.date)}</div>`, sv: b => b.qa.by || '', x: b => b.qa.by }, { h: 'QA status', v: b => pill({ Approved: 'done', Rejected: 'rejected', 'In Review': 'progress' }[b.qa.status] || 'pending', b.qa.status), sv: b => b.qa.status, x: b => b.qa.status }, { h: 'COA', v: b => esc(b.coa.status), sv: b => b.coa.status }, bCols.since()];
  EXPORTS.qa = exportRows(tab === 'coa' ? 'COA register' : 'QA register', cols, rows);
  return `${strip([['Awaiting QA', all.filter(b => phaseKey(b) === 'qa').length + ' batches', 'var(--st-yellow)'], ['In review', all.filter(b => b.qa.status === 'In Review').length, 'var(--st-blue)'], ['Approved', all.filter(b => b.qa.status === 'Approved').length, 'var(--st-green)'], ['Rejected', all.filter(b => b.qa.status === 'Rejected').length, 'var(--st-red)'], ['COA awaiting release', all.filter(b => ['Prepared', 'Reviewed'].includes(b.coa.status)).length, 'var(--st-yellow)'], ['COA released', all.filter(b => b.coa.status === 'Released').length, 'var(--st-green)']])}
    ${newNote('qa')}<div class="row"><div class="tabs">${[['queue', 'Awaiting QA'], ['approved', 'Approved'], ['rejected', 'Rejected & rework'], ['coa', 'COA register']].map(([k2, l]) => `<button type="button" data-ftab="qa:${k2}" class="${tab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <section class="panel">${table('qa' + tab, cols, rows, { colFilters: true, click: b => 'qab:' + b.id, rowCls: rowNew('qa'), tools: exportTools('qa'), empty: 'Nothing here' })}</section>`;
};
OPEN.qab = bid => {
  const draw = () => { const b = B(bid), it = bItem(b); const qa = b.qa || {}, coa = b.coa || {};
    return `<dl class="kvs"><div><dt>Order</dt><dd>${esc(refOfPid(b.projectId))}</dd></div><div><dt>Customer</dt><dd>${esc(bOrder(b).customer)}</dd></div><div><dt>Product · grade</dt><dd>${esc(it.productName)} · ${esc(it.grade)}</dd></div><div><dt>QC</dt><dd>${pill(lineStageStatus(b, 'qc'))} ${(b.qcTests || []).filter(t => t.status === 'Passed').length}/${(b.qcTests || []).length} tests passed</dd></div></dl>
    <fieldset class="sec"><legend>QA inspection</legend><label class="f"><span>QA approval status</span>${combo({ opts: ['Not Started', 'In Review', 'Approved', 'Rejected'], value: qa.status, k: 'status' })}</label>${field({ k: 'date', label: 'Inspection date', type: 'date' }, qa.date || TODAY)}${field({ k: 'by', label: 'Inspection personnel', src: 'employees' }, qa.by)}${field({ k: 'completed', label: 'QA completion date', type: 'date' }, qa.completed)}
      ${field({ k: 'observations', label: 'Observations (posted to Remarks)', type: 'textarea', wide: true }, qa.observations)}${field({ k: 'remarks', label: 'Remarks (posted to Remarks)', type: 'textarea', wide: true }, qa.remarks)}
      <div class="wide"><div class="eyebrow" style="margin-bottom:6px">Inspection checklist</div><div class="row">${(qa.checks && qa.checks.length ? qa.checks : M('qachecks').map(c => ({ name: c.name, ok: false }))).map(c => `<label class="row chk"><input type="checkbox" data-chk="${esc(c.name)}" ${c.ok ? 'checked' : ''}> ${esc(c.name)}</label>`).join('')}</div></div>
      <div class="wide row"><span class="eyebrow">QA documents</span><span class="spacer"></span>${uploadBtn('qa:' + bid)}</div><div class="wide">${docChips(qa.docs)}</div></fieldset>
    <fieldset class="sec"><legend>Certificate of Analysis</legend>${field({ k: 'coa_no', label: 'COA number' }, coa.no || `COA/${TODAY.slice(2, 4)}/${bid}`)}${field({ k: 'coa_prepared', label: 'Preparation date', type: 'date' }, coa.prepared)}${field({ k: 'coa_reviewed', label: 'Review date', type: 'date' }, coa.reviewed)}${field({ k: 'coa_released', label: 'Released date', type: 'date' }, coa.released)}<label class="f"><span>COA status</span>${combo({ opts: ['Not Started', 'Prepared', 'Reviewed', 'Released'], value: coa.status, k: 'coa_status' })}</label>
      <div class="wide row"><span class="eyebrow">COA document</span><span class="spacer"></span>${uploadBtn('coa:' + bid)}</div><div class="wide">${docChips(coa.docs)}</div></fieldset>`; };
  const collect = md => { const b = clone(B(bid)); const r = readForm(md); const oq = clone(b.qa || {});
    b.qa = Object.assign(b.qa || {}, { status: r.status, date: r.date, by: r.by, completed: r.completed, observations: r.observations, remarks: r.remarks, checks: $$('[data-chk]', md).map(c => ({ name: c.dataset.chk, ok: c.checked })) });
    b.coa = Object.assign(b.coa || {}, { no: r.coa_no, prepared: r.coa_prepared, reviewed: r.coa_reviewed, released: r.coa_released, status: r.coa_released ? 'Released' : r.coa_status });
    const txt = [r.observations !== oq.observations && r.observations, r.remarks !== oq.remarks && r.remarks].filter(Boolean).join(' — '); if (txt) b._rm = txt; return b; };
  const post = b => { if (b._rm) { addRemark(b.projectId, 'Quality Assurance', `Batch ${b.id}: ${b._rm}`, { by: b.qa.by, batchId: b.id, itemId: b.itemId, source: 'QA' }); delete b._rm; } };
  const m = openModal({ title: `QA & COA · batch ${bid}`, wide: true, body: `<div id="qad">${draw()}</div>`, actions: [
    { label: 'Reject & send to rework', cls: 'warn', id: 'qaReject', run: md => { const b = collect(md); post(b); b.qa.status = 'Rejected'; addHist(b, 'QA rejected'); saveBatch(b, `QA rejected batch ${bid}`); setTimeout(() => OPEN.reworkForm(bid, 'qa'), 40); } },
    { label: 'Save', cls: 'ghost', id: 'qaSave', run: md => { const b = collect(md); post(b); return qaSave(b, false); } }, { label: 'Approve QA', cls: 'ok', id: 'qaApprove', run: md => { const b = collect(md); post(b); b.qa.status = 'Approved'; return qaSave(b, true); } }] });
  modalRefreshers.push(() => { if (!document.body.contains(m.el)) return false; $('#qad', m.el).innerHTML = draw(); return true; });
};
function qaSave(b, approve) {
  if (b.coa.status === 'Released') { const o = O(P(b.projectId).orderId); if (o && !o.coaDate) put('orders', Object.assign(clone(o), { coaDate: b.coa.released })); }
  const s = activeLine(b).find(x => x.type === 'qa' && x.status !== 'done');
  if (approve || (b.qa.status === 'Approved' && AUTO())) {
    if (lineStageStatus(b, 'qc') !== 'done') { toast('QC must be completed before QA approval.'); return false; }
    if (s) { b.qa.completed = b.qa.completed || TODAY; completeStage(b, activeLine(b), activeLine(b).indexOf(s), 'QA approved'); }
    saveBatch(b, `QA approved batch ${b.id} — moved to Ready for Dispatch`); toast('QA approved · batch ready for dispatch'); return;
  }
  if (s && b.qa.status === 'In Review' && s.status === 'notstarted') startStage(s);
  addHist(b, `QA record updated (${b.qa.status}); COA ${b.coa.status}`); saveBatch(b, `QA/COA updated on batch ${b.id}`);
}

/* ===================== Dispatch ===================== */
RENDER.dispatch = () => {
  const tab = FLT.disp.tab; const all = S.batches.filter(b => P(b.projectId));
  const ready = all.filter(b => ['ready', 'dispatch'].includes(phaseKey(b)) && !(b.shipments || []).some(s => s.status !== 'Dispatched'));
  const transit = all.filter(b => (b.shipments || []).some(s => s.status !== 'Dispatched'));
  const done = all.filter(b => dispatchedQty(b) > 0);
  const rows = tab === 'ready' ? ready : tab === 'transit' ? transit : done;
  const pend = sum(all.filter(b => phaseKey(b) !== 'completed'), b => Math.max(0, b.qty - dispatchedQty(b)));
  const o = b => bOrder(b);
  const cols = [bCols.batch('dispatch'), bCols.ref(), { h: 'Customer · ship to', v: b => `${esc(o(b).customer)}<div class="muted" style="font-size:12px">${esc(o(b).shipToName || '')} ${esc(o(b).location || '')}</div>`, sv: b => o(b).customer || '', x: b => o(b).customer }, bCols.prod(),
    bCols.qty(), { h: 'Dispatched', r: 1, v: b => kg(dispatchedQty(b)), sv: dispatchedQty, f: false }, { h: 'Pending', r: 1, v: b => kg(Math.max(0, b.qty - dispatchedQty(b))), sv: b => b.qty - dispatchedQty(b), f: false }, { h: 'Packing', v: b => esc(bItem(b).packing || '—'), sv: b => bItem(b).packing || '' }, { h: 'Incoterms', v: b => esc(o(b).incoterms || '—'), sv: b => o(b).incoterms || '' }, { h: 'Port', v: b => esc(o(b).port || '—'), sv: b => o(b).port || '' }, { h: 'Mode', v: b => `${esc(o(b).shipmentType || '—')} ${esc(o(b).containerSize || '')}`, sv: b => o(b).shipmentType || '', x: b => `${o(b).shipmentType || ''} ${o(b).containerSize || ''}` },
    { h: 'Invoice', v: b => esc((b.shipments || []).map(s => s.invoiceNo).filter(Boolean).join(', ') || '—'), sv: b => (b.shipments || []).map(s => s.invoiceNo).join(), f: false }, { h: 'Status', v: b => phaseKey(b) === 'completed' ? pill('done', 'Dispatched') : bookedQty(b) ? pill('progress', 'Booked') : pill('pending', 'Ready'), sv: phaseLabel, x: b => phaseKey(b) === 'completed' ? 'Dispatched' : bookedQty(b) ? 'Booked' : 'Ready' }, bCols.since()];
  EXPORTS.disp = exportRows('Dispatch register', cols, rows);
  return `${strip([['Ready for dispatch', ready.length + ' batches', 'var(--st-yellow)'], ['Booked / in transit', transit.length + ' batches', 'var(--st-blue)'], ['Dispatched', kg(sum(all, dispatchedQty)) + ' kg', 'var(--st-green)'], ['Pending dispatch', kg(pend) + ' kg', 'var(--st-grey)'], ['Shipments', all.reduce((t, b) => t + (b.shipments || []).length, 0), 'var(--accent)']])}
    ${newNote('dispatch')}<div class="row"><div class="tabs">${[['ready', `Ready (${ready.length})`], ['transit', `Booked / in transit (${transit.length})`], ['done', `Dispatched (${done.length})`]].map(([k2, l]) => `<button type="button" data-ftab="disp:${k2}" class="${tab === k2 ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <section class="panel">${table('disp' + tab, cols, rows, { colFilters: true, click: b => 'dispb:' + b.id, rowCls: rowNew('dispatch'), tools: exportTools('disp'), empty: tab === 'ready' ? 'No batches ready for dispatch' : 'Nothing here', emptyHint: tab === 'ready' ? '<span>Batches arrive here after QA approval.</span>' : '' })}</section>`;
};
OPEN.dispb = bid => {
  const draw = () => { const b = B(bid), o = bOrder(b), it = bItem(b);
    return `<dl class="kvs">${[['Order', refOfPid(b.projectId)], ['Customer', o.customer], ['Ship to', `${o.shipToName || o.customer} ${o.shipToCode ? '(' + o.shipToCode + ')' : ''}`], ['Destination', o.location], ['Product', `${it.productName} · ${it.productCode} · ${it.grade}`], ['Packing', it.packing], ['Pallet formation', it.pallet], ['Incoterms', o.incoterms], ['Port of discharge', o.port], ['Shipment type', o.shipmentType], ['Payment terms', o.paymentTerms], ['COA', b.coa.no ? `${b.coa.no} · ${b.coa.status}` : b.coa.status]].map(([l, v]) => `<div><dt>${l}</dt><dd>${esc(v || '—')}</dd></div>`).join('')}</dl>
    ${strip([['Batch qty', kg(b.qty) + ' kg'], ['Dispatched', kg(dispatchedQty(b)) + ' kg', 'var(--st-green)'], ['Booked', kg(bookedQty(b)) + ' kg', 'var(--st-blue)'], ['Pending', kg(Math.max(0, b.qty - dispatchedQty(b) - bookedQty(b))) + ' kg', 'var(--st-yellow)']])}
    ${(b.shipments || []).map(s => `<fieldset class="sec" data-sid="${esc(s.id)}"><legend>${esc(s.id)} ${pill(s.status === 'Dispatched' ? 'done' : s.status === 'Booked' ? 'progress' : 'pending', s.status)}</legend>
      ${[['qty', 'Dispatch qty (kg)', 'number'], ['invoiceNo', 'Invoice number'], ['invoiceDate', 'Invoice date', 'date'], ['containerNo', 'Container number'], ['containers', 'No. of containers', 'number'], ['booking', 'Shipment / booking details'], ['vehicle', 'Vehicle / BL / AWB no.'], ['dispatchDate', 'Actual dispatch date', 'date']].map(([k, l, t]) => `<label class="f"><span>${l}</span><input data-s="${k}" type="${t || 'text'}" value="${esc(s[k])}"></label>`).join('')}
      <label class="f"><span>Container size</span>${combo({ opts: MSRC.containers, value: s.containerSize, strict: true }).replace('data-cbx', 'data-s="containerSize" data-cbx')}</label>
      <label class="f"><span>Dispatch status</span>${combo({ opts: ['Planned', 'Booked', 'Dispatched'], value: s.status, strict: true }).replace('data-cbx', 'data-s="status" data-cbx')}</label>
      <label class="f wide"><span>Remarks (posted to Remarks)</span><input data-s="remarks" value="${esc(s.remarks)}"></label>
      <div class="wide row">${docChips(s.docs)}<span class="spacer"></span>${uploadBtn(`ship:${bid}:${s.id}`)}<button class="link" type="button" data-delship="${esc(s.id)}" style="color:var(--st-red)">Remove shipment</button></div></fieldset>`).join('')}
    <div class="row"><button class="btn ghost" type="button" data-addship>${ico('plus')} Add shipment / container</button></div>`; };
  const collect = md => { const b = clone(B(bid)); $$('[data-sid]', md).forEach(fs => { const s = b.shipments.find(x => x.id === fs.dataset.sid); if (!s) return; $$('[data-s]', fs).forEach(i => { s[i.dataset.s] = i.dataset.cbx ? (i.dataset.val || '') : i.type === 'number' ? +i.value || 0 : i.value.trim(); }); }); return b; };
  const m = openModal({ title: `Dispatch · batch ${bid}`, wide: true, body: `<div id="dpd">${draw()}</div>`, onOpen: md => md.addEventListener('click', e => {
    const a = e.target.closest('[data-addship]'), d = e.target.closest('[data-delship]'); if (!a && !d) return; const b = collect(md);
    if (a) { const o = bOrder(b); b.shipments = b.shipments || []; b.shipments.push({ id: nextId('SH-', S.batches.flatMap(x => x.shipments || []).concat(b.shipments), 3000), qty: Math.max(0, b.qty - sum(b.shipments, s => s.qty)), invoiceNo: '', invoiceDate: TODAY, containerNo: '', containerSize: o.containerSize || '', containers: 1, booking: '', vehicle: '', dispatchDate: '', status: 'Planned', remarks: '', docs: [] }); }
    if (d) b.shipments = b.shipments.filter(s => s.id !== d.dataset.delship);
    put('batches', b); $('#dpd', md).innerHTML = draw(); }),
    actions: [{ label: 'Save shipments', id: 'saveShip', run: md => dispSave(collect(md)) }] });
  modalRefreshers.push(() => { if (!document.body.contains(m.el)) return false; $('#dpd', m.el).innerHTML = draw(); return true; });
};
function dispSave(b) {
  const old = B(b.id); const tot = sum(b.shipments || [], s => s.qty); if (tot > b.qty * 1.02) { toast(`Shipments total ${kg(tot)} kg, more than the batch (${kg(b.qty)} kg).`); return false; }
  (b.shipments || []).forEach(s => { if (s.status === 'Dispatched' && !s.dispatchDate) s.dispatchDate = TODAY; const os = (old.shipments || []).find(x => x.id === s.id) || {}; if (s.remarks && s.remarks !== os.remarks) addRemark(b.projectId, 'Dispatch', `${s.id} (batch ${b.id}): ${s.remarks}`, { batchId: b.id, itemId: b.itemId, source: 'Dispatch' }); });
  let L = activeLine(b); const ri = L.findIndex(s => s.type === 'ready' && s.status !== 'done');
  if (ri >= 0 && (b.shipments || []).some(s => s.status !== 'Planned')) completeStage(b, L, ri, 'Shipment booked');
  L = activeLine(b); const di = L.findIndex(s => s.type === 'dispatch' && s.status !== 'done');
  if (di >= 0) { L[di].done = dispatchedQty(b); if (dispatchedQty(b) >= b.qty - 0.001) completeStage(b, L, di, `${kg(dispatchedQty(b))} kg dispatched`); else if ((dispatchedQty(b) > 0 || bookedQty(b) > 0) && L[di].status === 'notstarted') startStage(L[di]); }
  const last = (b.shipments || []).filter(s => s.status === 'Dispatched').sort(by('dispatchDate', -1))[0];
  const o = O(P(b.projectId).orderId); if (o && last) { const no = clone(o); no.invoiceNo = no.invoiceNo || last.invoiceNo; no.invoiceDate = no.invoiceDate || last.invoiceDate; no.actualDispatch = last.dispatchDate; if (no.soDate && no.invoiceDate) no.soToInvoiceDays = dayDiff(no.soDate, no.invoiceDate); put('orders', no); }
  addHist(b, `Shipments updated: ${kg(dispatchedQty(b))} kg dispatched, ${kg(bookedQty(b))} kg booked`); saveBatch(b, `Dispatch updated for batch ${b.id} — ${kg(dispatchedQty(b))} of ${kg(b.qty)} kg dispatched`);
}
