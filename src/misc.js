/* ===================== Overview ===================== */
function ovFiltered() {
  const f = FLT.ov;
  const okO = o => { if (f.cust && o.customer !== f.cust) return false; if (f.prod && !items(o).some(i => i.productCode === f.prod)) return false; if (f.unit && o.unit !== f.unit) return false; if (f.from && (o.soDate || '') < f.from) return false; if (f.to && (o.soDate || '') > f.to) return false; return true; };
  const ps = S.projects.filter(p => { const o = pOrder(p); if (!o.id || !okO(o)) return false; if (f.status && pStatus(p) !== f.status) return false; if (f.dept && !pBatches(p.id).some(b => phaseKey(b) === f.dept)) return false; return true; });
  const ids = new Set(ps.map(p => p.id)); const bs = S.batches.filter(b => ids.has(b.projectId) && (!f.dept || phaseKey(b) === f.dept) && (!f.prod || bItem(b).productCode === f.prod));
  return { ps, bs, os: S.orders.filter(okO) };
}
RENDER.overview = () => {
  if (!S.orders.length) return emptyStart();
  const { ps, bs, os } = ovFiltered();
  const act = bs.filter(b => !['completed', 'hold'].includes(phaseKey(b)));
  const cnt = k => act.filter(b => phaseKey(b) === k).length;
  const delayedP = ps.filter(pDelayed); const unreadAll = ps.reduce((t, p) => t + unreadRemarks(p.id), 0);
  const k = [
    kpi('Total Orders', os.length, `${kg(sum(os, oPoQty))} kg · ${sum(os, o => items(o).length)} products`, 'var(--accent)', 'orders:all'),
    kpi('Open Orders', os.filter(o => ['Open', 'Not Started'].includes(orderState(o))).length, `${os.filter(o => !o.projectId).length} not started`, 'var(--st-yellow)', 'orders:open'),
    kpi('Active in PPC', ps.filter(p => pStatus(p) === 'Active').length, `${ps.length} in view`, 'var(--accent)', 'ppc:Active'),
    kpi('Active Batches', act.length, `${kg(sum(act, b => b.qty))} kg in process`, 'var(--st-blue)', 'manufacturing'),
    kpi('On Hold', ps.filter(p => pStatus(p) === 'On Hold').length, '', 'var(--st-yellow)', 'ppc:On Hold'),
    kpi('Manufacturing', cnt('mfg') + cnt('material'), `${act.filter(b => inRework(b)).length} in rework`, 'var(--st-blue)', 'manufacturing'),
    kpi('QC Pending', cnt('qc'), 'batches with QC', 'var(--st-yellow)', 'qc'),
    kpi('QA Pending', cnt('qa'), 'batches with QA', 'var(--st-yellow)', 'qa'),
    kpi('Ready for Dispatch', cnt('ready') + cnt('dispatch'), `${kg(sum(act.filter(b => ['ready', 'dispatch'].includes(phaseKey(b))), b => b.qty - dispatchedQty(b)))} kg`, 'var(--st-green)', 'dispatch'),
    kpi('Delayed', delayedP.length, 'past plan or delivery date', 'var(--st-red)', 'ppc:delayed'),
    kpi('Completed', ps.filter(p => pStatus(p) === 'Completed').length, `${kg(sum(bs, dispatchedQty))} kg shipped`, 'var(--st-green)', 'ppc:Completed'),
    kpi('New remarks', unreadAll, 'unread across orders', 'var(--st-orange)', 'ppc:')
  ].join('');
  const upcoming = ps.filter(p => pStatus(p) !== 'Completed' && pDelivery(p) >= TODAY && pDelivery(p) <= addDays(TODAY, 21)).sort(by(pDelivery)).slice(0, 8);
  const alerts = [];
  S.batches.forEach(b => { if (inRework(b)) { const r = drivingRW(b); alerts.push(['rework', `Batch <b class="mono">${esc(b.id)}</b> (${esc(refOfPid(b.projectId))}) running on ${esc(r.id)} — ${esc(r.reason)}`, b.projectId]); }
    (b.qcTests || []).filter(t => t.status === 'Failed').forEach(t => { if (!inRework(b)) alerts.push(['rejected', `QC failed on <b class="mono">${esc(b.id)}</b>: ${esc(t.name)} ${esc(t.result)} (spec ${esc(t.spec)})`, b.projectId]); });
    if (b.qa && b.qa.status === 'Rejected' && !inRework(b)) alerts.push(['rejected', `QA rejected <b class="mono">${esc(b.id)}</b>: ${esc(b.qa.observations)}`, b.projectId]); });
  S.orders.filter(o => o.projectId && ['Awaited', 'Not Available'].includes(o.materialStatus) && pStatus(P(o.projectId)) !== 'Completed').forEach(o => alerts.push(['pending', `Material ${esc(o.materialStatus.toLowerCase())} for <b>${esc(oRef(o))}</b> · ${esc(o.customer)}`, o.projectId]));
  S.projects.filter(p => p.status === 'On Hold').forEach(p => alerts.push(['pending', `<b>${esc(pRef(p))}</b> is on hold`, p.id]));
  const custs = {}; ps.forEach(p => { const o = pOrder(p); const c = custs[o.customer] = custs[o.customer] || { name: o.customer, n: 0, act: 0, qty: 0, prod: 0, disp: 0 }; c.n++; if (pStatus(p) === 'Active') c.act++; c.qty += pQty(p); pBatches(p.id).forEach(b => { c.prod += +b.produced || 0; c.disp += dispatchedQty(b); }); });
  const actB = act.slice().sort(by(b => (batchDelayed(b) ? 0 : 1) * 1000 + bProgress(b))).slice(0, 10);
  const newRm = S.remarks.filter(r => r.at > rmSeen(r.projectId)).sort(by('at', -1)).slice(0, 6);
  return `${filterBar('ov', [{ k: 'from', label: 'SO date from', type: 'date' }, { k: 'to', label: 'SO date to', type: 'date' }, { k: 'cust', label: 'Customer', opts: () => uniq(S.orders.map(o => o.customer)).sort() }, { k: 'prod', label: 'Product code', opts: () => uniq(S.orders.flatMap(o => items(o).map(i => i.productCode))).sort() }, { k: 'dept', label: 'Department', opts: DEPT_OPTS }, { k: 'unit', label: 'Production unit', opts: () => uniq(S.orders.map(o => o.unit)).sort() }, { k: 'status', label: 'Order status', opts: ['Not Started', 'Active', 'On Hold', 'Completed'] }])}
  <div class="kpis">${k}</div>
  <div class="grid g2">
    <section class="panel"><header><h3>Department-wise pending batches</h3></header><div class="pb"><div class="chart"><canvas id="c_dept" aria-label="Pending batches by department"></canvas></div></div></section>
    <section class="panel"><header><h3>Production line performance</h3><span class="muted" style="font-size:13px">planned vs produced, kg</span></header><div class="pb"><div class="chart"><canvas id="c_line"></canvas></div></div></section>
    <section class="panel"><header><h3>Product-wise production</h3><span class="muted" style="font-size:13px">top products, kg</span></header><div class="pb"><div class="chart"><canvas id="c_prod"></canvas></div></div></section>
    <section class="panel"><header><h3>Order status</h3><span class="spacer"></span>${pill('rejected', delayedP.length + ' delayed')}</header><div class="pb"><div class="chart"><canvas id="c_status"></canvas></div></div></section>
  </div>
  <div class="grid g3">
    <section class="panel"><header><h3>Important alerts</h3><span class="tag">${alerts.length}</span></header><div class="pb list">${alerts.slice(0, 9).map(([k, t, ref]) => `<div class="alert s-${k}" ${ref ? `data-open="project:${esc(ref)}" style="cursor:pointer"` : ''}><span>${t}</span></div>`).join('') || '<span class="muted">No alerts.</span>'}</div></section>
    <section class="panel"><header><h3>New remarks</h3>${unreadAll ? `<span class="bubble">${unreadAll}</span>` : ''}</header><div class="pb list">${newRm.map(r => `<div class="alert s-progress" data-open="projectRemarks:${esc(r.projectId)}" style="cursor:pointer"><span><b>${esc(r.dept)}</b> on ${esc(refOfPid(r.projectId))}: ${esc(deRef(r.text).slice(0, 140))}<div class="muted" style="font-size:12px">${fmtDT(r.at)}${r.by ? ' · ' + esc(r.by) : ''}</div></span></div>`).join('') || '<span class="muted">No unread remarks.</span>'}</div></section>
    <section class="panel"><header><h3>Upcoming deliveries</h3><span class="muted" style="font-size:13px">next 21 days</span></header><div class="pb list">${upcoming.map(p => { const o = pOrder(p); const d = dayDiff(TODAY, pDelivery(p)); return `<div class="row" data-open="project:${esc(p.id)}" style="cursor:pointer;justify-content:space-between"><div style="min-width:0"><b>${esc(pRef(p))}</b> <span class="muted">${esc(o.customer)}</span><div style="font-size:13px">${esc(oProducts(o))} · ${kg(pQty(p))} kg</div></div>${pill(d <= 3 ? 'rejected' : d <= 7 ? 'pending' : 'progress', d === 0 ? 'Today' : `in ${d} d`)}</div>`; }).join('') || '<span class="muted">No deliveries due.</span>'}</div></section>
  </div>
  <div class="grid g2">
    <section class="panel"><header><h3>Delayed orders</h3><span class="tag">${delayedP.length}</span></header><div class="pb list">${delayedP.slice(0, 8).map(p => { const o = pOrder(p); return `<div class="row" data-open="project:${esc(p.id)}" style="cursor:pointer;justify-content:space-between"><div style="min-width:0"><b>${esc(pRef(p))}</b> <span class="muted">${esc(o.customer)}</span><div style="font-size:13px">Due ${fmtD(pDelivery(p))} · ${esc(pBatches(p.id).map(phaseLabel).join(', '))}</div></div>${pill('rejected', 'Delayed')}</div>`; }).join('') || '<span class="muted">Nothing delayed.</span>'}</div></section>
    <section class="panel"><header><h3>Batch-wise progress</h3></header><div class="tw"><table class="t"><thead><tr><th class="ns">Batch</th><th class="ns">Order</th><th class="ns">Stage</th><th class="ns">Progress</th></tr></thead><tbody>${actB.map(b => `<tr class="click" data-open="project:${esc(b.projectId)}"><td class="mono">${esc(b.id)}</td><td>${esc(refOfPid(b.projectId))}<div class="muted" style="font-size:12px">${esc(bItem(b).productName || '')}</div></td><td>${phasePill(b)}${batchDelayed(b) ? ' ' + pill('rejected', 'Late') : ''}</td><td><div class="row" style="flex-wrap:nowrap"><div class="bar" style="flex:1"><i style="width:${bProgress(b)}%"></i></div><span class="num muted" style="font-size:12px">${bProgress(b)}%</span></div></td></tr>`).join('')}</tbody></table></div></section>
  </div>
  <div class="grid g2">
    <section class="panel"><header><h3>Customer-wise summary</h3></header><div class="tw"><table class="t"><thead><tr><th class="ns">Customer</th><th class="ns r">Orders</th><th class="ns r">Active</th><th class="ns r">Ordered kg</th><th class="ns r">Produced kg</th><th class="ns r">Dispatched kg</th></tr></thead><tbody>${Object.values(custs).sort(by('qty', -1)).slice(0, 10).map(c => `<tr><td>${esc(c.name)}</td><td class="r num">${c.n}</td><td class="r num">${c.act}</td><td class="r num">${kg(c.qty)}</td><td class="r num">${kg(c.prod)}</td><td class="r num">${kg(c.disp)}</td></tr>`).join('')}</tbody></table></div></section>
    <section class="panel"><header><h3>Recent activities</h3></header><div class="pb list">${S.activity.slice().sort(by('at', -1)).slice(0, 10).map(a => `<div class="row" style="font-size:14px;flex-wrap:nowrap"><span class="mono muted" style="font-size:12px;width:110px;flex:none">${fmtDT(a.at)}</span><span style="min-width:0">${esc(deRef(a.text))}</span></div>`).join('') || '<span class="muted">Activity appears here as departments update orders, batches and shipments.</span>'}</div></section>
  </div>`;
};
AFTER.overview = () => {
  if (!S.projects.length) return; const { ps, bs } = ovFiltered(); const c = SC();
  const act = bs.filter(b => !['completed', 'hold'].includes(phaseKey(b)));
  const depts = [['material', 'Material In'], ['mfg', 'Manufacturing'], ['qc', 'QC'], ['qa', 'QA'], ['ready', 'Ready'], ['dispatch', 'Dispatch']];
  chart($('#c_dept'), 'bar', { labels: depts.map(d => d[1]), datasets: [
    { label: 'On plan', data: depts.map(d => act.filter(b => phaseKey(b) === d[0] && !batchDelayed(b) && !inRework(b)).length), backgroundColor: c.progress, borderRadius: 4, stack: 's' },
    { label: 'In rework', data: depts.map(d => act.filter(b => phaseKey(b) === d[0] && inRework(b)).length), backgroundColor: c.rework, borderRadius: 4, stack: 's' },
    { label: 'Delayed', data: depts.map(d => act.filter(b => phaseKey(b) === d[0] && batchDelayed(b) && !inRework(b)).length), backgroundColor: c.rejected, borderRadius: 4, stack: 's' }] }, { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, ticks: { precision: 0 } } } });
  const L = lineNames(); chart($('#c_line'), 'bar', { labels: L, datasets: [{ label: 'Planned', data: L.map(l => sum(bs.filter(b => b.line === l), b => b.qty)), backgroundColor: c.surface3, borderRadius: 4 }, { label: 'Produced', data: L.map(l => sum(bs.filter(b => b.line === l), b => b.produced)), backgroundColor: c.accent, borderRadius: 4 }] }, { scales: { x: { grid: { display: false } } } });
  const prod = {}; bs.forEach(b => { const n = bItem(b).productName || '—'; prod[n] = prod[n] || [0, 0]; prod[n][0] += +b.qty; prod[n][1] += +b.produced || 0; });
  const top = Object.entries(prod).sort((a, b) => b[1][0] - a[1][0]).slice(0, 7);
  chart($('#c_prod'), 'bar', { labels: top.map(t => t[0].length > 28 ? t[0].slice(0, 27) + '…' : t[0]), datasets: [{ label: 'Planned', data: top.map(t => t[1][0]), backgroundColor: c.surface3, borderRadius: 4 }, { label: 'Produced', data: top.map(t => t[1][1]), backgroundColor: c.accent, borderRadius: 4 }] }, { indexAxis: 'y', scales: { y: { grid: { display: false } } } });
  const sts = ['Not Started', 'Active', 'On Hold', 'Completed']; const col = [c.notstarted, c.progress, c.pending, c.done];
  chart($('#c_status'), 'doughnut', { labels: sts.map(s => `${s} (${ps.filter(p => pStatus(p) === s).length})`), datasets: [{ data: sts.map(s => ps.filter(p => pStatus(p) === s).length), backgroundColor: col, borderWidth: 2, borderColor: tok('--surface') }] }, { cutout: '60%', plugins: { legend: { position: 'right', labels: { color: tok('--muted') } } } });
};
function emptyStart() {
  return `${seedOffer()}<section class="panel"><div class="empty" style="padding:60px 20px"><b style="font-size:24px">Start with your orders</b><span style="max-width:560px">Punch a PO by hand or from its PDF, or import the Excel order sheet. Each product in an order runs on its own workflow and batches until dispatch.</span>
  <div class="row" style="justify-content:center"><button class="btn" type="button" data-act="newOrder">${ico('plus')} Punch order</button><button class="btn ghost" type="button" data-act="importSheet">${ico('up')} Import order sheet</button></div></div></section>`;
}

/* ===================== Master Data (incl. workflow templates) ===================== */
const MDEF = {
  customers: ['Customer Master', 'Commercial', [['name', 'Customer name'], ['location', 'Location / country'], ['type', 'Domestic / Export'], ['shipTo', 'Default ship-to customer'], ['shipToCode', 'Ship-to code']]],
  salespersons: ['Salesperson Master', 'Commercial', [['name', 'Sales person'], ['region', 'Region / team']]],
  incoterms: ['Incoterms', 'Commercial', [['name', 'Incoterm']]],
  payment: ['Payment Terms', 'Commercial', [['name', 'Payment terms']]],
  products: ['Product & Product Code Master', 'Product', [['code', 'Product code'], ['name', 'Product name'], ['grade', 'Grade'], ['desc', 'Description']]],
  grades: ['Product Grade Master', 'Product', [['name', 'Grade']]],
  packing: ['Packing Material Master', 'Product', [['name', 'Packing type'], ['notes', 'Notes']]],
  departments: ['Department Master', 'Organisation', [['name', 'Department'], ['head', 'Head of department']]],
  employees: ['Employee Master', 'Organisation', [['name', 'Employee'], ['dept', 'Department'], ['role', 'Role']]],
  units: ['Production Unit / PR Master', 'Production', [['name', 'Unit / PR'], ['notes', 'Notes']]],
  lines: ['Manufacturing Line Master', 'Production', [['name', 'Line'], ['unit', 'Unit'], ['capacity', 'Capacity']]],
  machines: ['Machine / Resource Master', 'Production', [['name', 'Machine / resource'], ['line', 'Line'], ['notes', 'Notes']]],
  _templates: ['Workflow Templates', 'Production', []],
  _data: ['Backup, restore & defaults', 'Data tools', []],
  stages: ['Workflow Stage Master', 'Production', [['name', 'Stage name'], ['type', 'Stage type']]],
  qctests: ['QC Test Master', 'Quality', [['name', 'Test name'], ['parameter', 'Parameter'], ['spec', 'Specification / standard']]],
  qachecks: ['QA Master', 'Quality', [['name', 'QA check']]],
  ports: ['Port of Discharge Master', 'Dispatch & Shipment', [['name', 'Port'], ['country', 'Country']]],
  containers: ['Container Master', 'Dispatch & Shipment', [['name', 'Container size']]],
  shipmodes: ['Shipment Mode Master', 'Dispatch & Shipment', [['name', 'Mode']]]
};
const allMdefs = () => Object.assign({}, MDEF, Object.fromEntries(M('customDefs').map(d => [d.key, [d.label, 'Custom', [['name', 'Name'], ['value', 'Value'], ['notes', 'Notes']]]])));
const MDRAFT = {};
const mCount = k => k === '_templates' ? S.templates.length : k === '_data' ? S.orders.length : (k === 'stages' ? stageMaster() : M(k)).length;
RENDER.masters = () => {
  const defs = allMdefs(); const t = defs[FLT.masters.type] ? FLT.masters.type : 'customers'; const [label, , fields] = defs[t];
  const groups = {}; Object.entries(defs).forEach(([k, d]) => (groups[d[1]] = groups[d[1]] || []).push([k, d[0]]));
  const side = `<section class="panel"><header><h3>Masters</h3></header><div class="pb list" style="gap:2px"><div style="margin-bottom:6px">${combo({ opts: Object.entries(defs).map(([k, d]) => ({ v: k, l: d[0], sub: d[1] })), value: '', ph: 'Search masters…', strict: true, id: 'mjump', onPick: o => { if (o.v) { FLT.masters.type = o.v; FLT.masters.q = ''; render(true); } } })}</div>${Object.entries(groups).map(([g, its]) => `<div class="eyebrow" style="margin:10px 0 4px">${esc(g)}</div>${its.map(([k, l]) => `<button type="button" class="link mlink ${k === t ? 'on' : ''}" data-mtype="${esc(k)}">${esc(l)}<span class="mono muted" style="font-size:12px">${mCount(k)}</span></button>`).join('')}`).join('')}
      <button class="btn ghost sm" type="button" data-act="newMaster" style="margin-top:12px">${ico('plus')} New custom master</button></div></section>`;
  if (t === '_templates') return `<div class="grid mgrid">${side}${templatesPanel()}</div>`;
  if (t === '_data') return `<div class="grid mgrid">${side}${dataPanel()}</div>`;
  if (!MDRAFT[t]) MDRAFT[t] = clone(t === 'stages' ? stageMaster() : M(t));
  const rows = MDRAFT[t]; const q = (FLT.masters.q || '').toLowerCase();
  const dirty = JSON.stringify(rows) !== JSON.stringify(t === 'stages' ? stageMaster() : M(t));
  return `<div class="grid mgrid">${side}
    <section class="panel" style="min-width:0"><header><h3>${esc(label)}</h3><span class="tag">${rows.length} records</span><span class="spacer"></span><div class="tsearch" style="max-width:220px"><input type="search" data-mq placeholder="Search records…" value="${esc(FLT.masters.q || '')}"></div><button class="btn ghost sm" type="button" data-act="mAdd">${ico('plus')} Add record</button><button class="btn sm" type="button" data-act="mSave" ${dirty ? '' : 'disabled'}>Save changes</button></header>
      ${dirty ? '<div class="banner" style="margin:12px 18px 0">Unsaved changes. Save to make them available in every form.</div>' : ''}
      <div class="tw" style="max-height:62vh;overflow:auto"><table class="t"><thead><tr>${fields.map(f => `<th class="ns">${esc(f[1])}</th>`).join('')}<th class="ns"></th></tr></thead><tbody>
      ${rows.map((r, i) => ({ r, i })).filter(({ r }) => !q || fields.some(f => String(r[f[0]] || '').toLowerCase().includes(q))).map(({ r, i }) => `<tr>${fields.map(f => `<td>${t === 'stages' && f[0] === 'type' ? combo({ opts: Object.entries(STAGE_TYPES).map(([v, l]) => ({ v, l })), value: r.type, strict: true }).replace('data-cbx', `data-mr="${i}" data-mf="type" data-cbx`) : `<input data-mr="${i}" data-mf="${f[0]}" value="${esc(r[f[0]])}">`}</td>`).join('')}<td><button class="link" type="button" data-mdel="${i}" style="color:var(--st-red)">Delete</button></td></tr>`).join('') || `<tr><td colspan="${fields.length + 1}"><div class="empty"><b>No records</b><span>Add the first record for this master.</span></div></td></tr>`}</tbody></table></div></section></div>`;
};
let TPL_DRAFT = null; const TPLF = { tpl: null };
function templatesPanel() {
  const tpls = S.templates; if (!TPLF.tpl) TPLF.tpl = (tpls.find(t => t.isDefault) || tpls[0] || { id: '__new' }).id;
  const cur = tpls.find(t => t.id === TPLF.tpl);
  return `<section class="panel" style="min-width:0"><header><h3>Workflow Templates</h3><span class="muted" style="font-size:13px">Each product in an order picks one of these. Drag stages from the palette, reorder, click a name to rename.</span><span class="spacer"></span>
      <label class="row" style="font-size:14px;font-weight:600" title="Hand-off to the next department always happens when a stage is completed. This switch decides whether stages also complete by themselves from entered data."><input type="checkbox" id="autoT" style="width:auto" ${AUTO() ? 'checked' : ''}> Auto-complete stages from entered data</label></header>
    <div class="pb" style="display:flex;flex-direction:column;gap:12px">
      <div class="row"><label class="f" style="width:280px"><span>Template</span>${combo({ opts: [...tpls.map(t => ({ v: t.id, l: t.name + (t.isDefault ? ' (default)' : '') })), { v: '__new', l: '+ New template' }], value: TPLF.tpl, strict: true, id: 'tplSel', onPick: o => { TPLF.tpl = o.v; TPL_DRAFT = null; render(true); } })}</label>
      <label class="f" style="width:280px"><span>Template name</span><input id="tplName" value="${esc(cur ? cur.name : 'New workflow')}"></label>
      <span class="spacer"></span><button class="btn ghost sm" type="button" data-act="tplDefault">Make default</button><button class="btn ghost sm" type="button" data-act="tplDelete">Delete</button><button class="btn sm" type="button" data-act="tplSave">Save template</button></div>
      <div id="tplB"></div>
      <p class="muted" style="margin:0;font-size:13px">A stage named <b>Manufacturing</b> becomes the production line chosen for each product (PR1, PR2…).</p>
      <div class="eyebrow">Automation rules</div>
      <div class="legend" style="font-size:13.5px;gap:18px"><span class="s-done">Always: a stage completes → the next stage starts and that department sees it as NEW</span><span class="s-progress">With auto-complete on: full production recorded or all QC tests passed completes the stage by itself</span><span class="s-progress">Later planned dates move by the days a stage ran early or late</span><span class="s-rejected">QC or QA fails → a rework line opens and drives the batch</span><span class="s-done">Full quantity dispatched → batch and order complete</span></div>
    </div></section>`;
}
AFTER.masters = () => {
  if (FLT.masters.type !== '_templates') return;
  const cur = S.templates.find(t => t.id === TPLF.tpl);
  if (!TPL_DRAFT || TPL_DRAFT.id !== TPLF.tpl) TPL_DRAFT = { id: TPLF.tpl, stages: clone(cur ? cur.stages : DEFAULT_FLOW.map(n => ({ name: n, type: stageType(n) }))) };
  mountBuilder($('#tplB'), () => TPL_DRAFT.stages, s => { TPL_DRAFT.stages = s; });
  $('#autoT').onchange = e => { putMaster('settings', [{ auto: e.target.checked }]); toast(`Auto-complete ${e.target.checked ? 'on' : 'off'}`); };
};
ACT.tplSave = () => {
  const name = $('#tplName').value.trim() || 'Untitled workflow';
  const stages = TPL_DRAFT.stages.map(s => ({ name: s.name, type: s.name === 'Manufacturing' ? 'mfg' : (s.type || stageType(s.name)) }));
  if (!stages.length) { toast('Add at least one stage.'); return; }
  if (S.templates.some(t => t.name.toLowerCase() === name.toLowerCase() && t.id !== TPLF.tpl)) { toast('A template with that name already exists.'); return; }
  const id = TPLF.tpl && TPLF.tpl !== '__new' ? TPLF.tpl : uid('T-'); const ex = S.templates.find(t => t.id === id);
  put('templates', { id, name, stages, isDefault: ex ? !!ex.isDefault : !S.templates.length }); TPLF.tpl = id; TPL_DRAFT = null; log(`Workflow template "${name}" saved`, ''); toast('Template saved');
};
ACT.tplDefault = () => { const id = TPLF.tpl; if (!S.templates.find(t => t.id === id)) { toast('Save the template first.'); return; } S.templates.forEach(t => { if (!!t.isDefault !== (t.id === id)) put('templates', Object.assign(clone(t), { isDefault: t.id === id })); }); toast('Default template set'); };
ACT.tplDelete = () => { const id = TPLF.tpl; const t = S.templates.find(x => x.id === id); if (!t) return; const used = S.orders.some(o => items(o).some(i => i.tplId === id)); confirmBox('Delete template', `Delete “${esc(t.name)}”?${used ? ' Orders already using it keep their stages.' : ''}`, 'Delete', () => { removeRec('templates', id); TPLF.tpl = null; TPL_DRAFT = null; }); };
ACT.mAdd = () => { const t = FLT.masters.type; MDRAFT[t].unshift({}); render(true); const f = $('[data-mr="0"]'); f && f.focus(); };
ACT.mSave = () => {
  const t = FLT.masters.type; const [label, , fields] = allMdefs()[t]; const k0 = fields[0][0];
  const rows = MDRAFT[t].filter(r => String(r[k0] || '').trim()).map(r => { const o = {}; Object.keys(r).forEach(k => o[k] = typeof r[k] === 'string' ? r[k].trim() : r[k]); return o; });
  const seen = new Set(); const dups = rows.filter(r => { const k = String(r[k0]).toLowerCase(); if (seen.has(k)) return true; seen.add(k); return false; });
  if (dups.length) { toast(`Duplicate ${fields[0][1].toLowerCase()}: ${dups.map(d => d[k0]).join(', ')}`); return; }
  putMaster(t, rows); MDRAFT[t] = clone(rows); log(`${label} updated (${rows.length} records)`, ''); toast(`${label} saved`);
};
ACT.newMaster = () => openModal({ title: 'New custom master', body: field({ k: 'label', label: 'Master name, e.g. Storage Location Master', req: true }, ''), actions: [{ label: 'Create', run: md => { const l = val(md, 'label'); if (!l) return false; const key = 'x_' + l.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30); if (allMdefs()[key]) { toast('That master already exists.'); return false; } putMaster('customDefs', M('customDefs').concat([{ key, label: l }])); FLT.masters.type = key; MDRAFT[key] = []; } }] });

/* ===================== data tools: defaults, backup, restore ===================== */
const DEFAULT_MASTERS = {
  lines: [['PR1', 'PR1'], ['PR2', 'PR2'], ['PR3', 'PR3'], ['PR4', 'PR4'], ['PR5', 'PR5'], ['PROTH', 'PROTH']].map(([name, unit]) => ({ name, unit, capacity: '' })),
  units: ['PR1', 'PR2', 'PR3', 'PR4', 'PR5', 'PROTH'].map(name => ({ name })),
  departments: ['Operations', 'Planning', 'Marketing', 'Stores', 'Manufacturing', 'Quality Control', 'Quality Assurance', 'Dispatch'].map(name => ({ name })),
  stages: DEFAULT_STAGES,
  qctests: [['Assay', 'Purity (%)', '98.0 – 102.0'], ['Loss on Drying', 'LOD (%)', 'NMT 1.0'], ['Heavy Metals', 'Pb (ppm)', 'NMT 2'], ['Particle Size', 'D90 (µm)', 'NMT 75'], ['Bulk Density', 'g/ml', '0.6 – 0.9'], ['Microbial Limit', 'TAMC (cfu/g)', 'NMT 1000'], ['Appearance', 'Visual', 'As per specification']].map(([name, parameter, spec]) => ({ name, parameter, spec })),
  qachecks: ['BMR Review', 'Label Verification', 'COA Review', 'Deviation Check', 'Packing Inspection'].map(name => ({ name })),
  containers: ['20ft', '40ft', '40 Reefer', 'LCL Shipment', 'AIR Shipment'].map(name => ({ name })),
  shipmodes: ['BY SEA', 'By Air', 'By Courier', 'By Road'].map(name => ({ name })),
  settings: [{ auto: true }]
};
const DEFAULT_TEMPLATES = [{ id: 'T-STD', name: 'Standard flow', isDefault: true, stages: DEFAULT_FLOW.map(n => ({ name: n, type: n === 'Manufacturing' ? 'mfg' : stageType(n) })) },
  { id: 'T-EXP', name: 'Export with sampling', isDefault: false, stages: ['Order Punching', 'Material In', 'Manufacturing', 'QC', 'QA', 'Customer Sampling', 'Ready for Dispatch', 'Dispatch', 'Project Completion'].map(n => ({ name: n, type: n === 'Manufacturing' ? 'mfg' : n === 'Customer Sampling' ? 'qa' : stageType(n) })) }];
function seedDefaults(onlyMissing = true) {
  let n = 0; Object.entries(DEFAULT_MASTERS).forEach(([k, v]) => { if (!onlyMissing || !M(k).length) { putMaster(k, v); n++; } });
  if (!S.templates.length) DEFAULT_TEMPLATES.forEach(t => { put('templates', t); n++; });
  return n;
}
function dataPanel() {
  return `<section class="panel" style="min-width:0"><header><h3>Backup, restore &amp; defaults</h3><span class="muted" style="font-size:13px">${MODE === 'live' ? 'Connected to the shared database' : 'This browser only'}</span></header><div class="pb" style="display:flex;flex-direction:column;gap:18px">
    <div class="row" style="align-items:flex-start;gap:16px"><div style="flex:1;min-width:240px"><b>Download a full backup</b><div class="muted" style="font-size:13px">Every order, batch, remark, template and master as one JSON file.</div></div>${DL ? '<button class="btn ghost" type="button" data-act="backupDl">' + ico('dl') + ' Download backup</button>' : '<span class="muted">Downloads are not available here.</span>'}</div>
    <div class="row" style="align-items:flex-start;gap:16px"><div style="flex:1;min-width:240px"><b>Restore from a backup</b><div class="muted" style="font-size:13px">Choose <span class="mono">ordertrack-database.json</span> from an OrderTrack backup (for example the one taken from the claude.ai version). Records with the same number are replaced; nothing else is deleted.</div></div><label class="btn ghost" style="cursor:pointer">${ico('up')} Choose backup file<input type="file" id="restoreIn" accept=".json,application/json" hidden></label></div>
    <div class="row" style="align-items:flex-start;gap:16px"><div style="flex:1;min-width:240px"><b>Load default master data</b><div class="muted" style="font-size:13px">Adds production lines, departments, workflow stages and templates, QC tests, QA checks, containers and shipment modes, only where a master is empty.</div></div><button class="btn ghost" type="button" data-act="seedDefaults">Load defaults</button></div>
    <div id="restoreOut"></div></div></section>`;
}
ACT.seedDefaults = () => { const n = seedDefaults(true); toast(n ? `Loaded ${n} default master list${n > 1 ? 's' : ''}` : 'Every master already has data'); };
ACT.backupDl = async () => {
  const out = { exportedAt: nowISO(), orders: S.orders, projects: S.projects, batches: S.batches, templates: S.templates, remarks: S.remarks, activity: S.activity, masters: Object.entries(S.masters).map(([id, v]) => Object.assign({ id }, v)) };
  try { await DL.save({ filename: `ordertrack-database-${TODAY}.json`, data: new Blob([JSON.stringify(out, null, 1)], { type: 'application/json' }) }); } catch (e) { if (e && e.code !== 'declined') toast('Backup did not complete: ' + (e.message || e.code)); }
};
document.addEventListener('change', async e => {
  if (e.target.id !== 'restoreIn' || !e.target.files[0]) return; const f = e.target.files[0]; e.target.value = '';
  try {
    const d = JSON.parse(await f.text()); let n = 0;
    ['orders', 'projects', 'batches', 'templates', 'remarks', 'activity'].forEach(c => (d[c] || []).forEach(x => { if (!x || !x.id) return; const y = c === 'orders' ? normalizeOrder(clone(x)) : c === 'batches' ? normalizeBatch(clone(x)) : clone(x); put(c, y); n++; }));
    (d.masters || []).forEach(m => { if (m && m.id) { putMaster(m.id, m.items || []); n++; } });
    const el = $('#restoreOut'); if (el) el.innerHTML = `<div class="alert s-done"><span>Restored ${n} records from ${esc(f.name)}.</span></div>`; log(`Backup restored: ${n} records from ${f.name}`, ''); toast(`Restored ${n} records`);
  } catch (err) { toast('Could not read that backup: ' + err.message); }
});

/* ===================== AI Assistant (answers from live data, traced by PO / SO) ===================== */
let CHAT = [], CHAT_BUSY = false, CHAT_CTL = null;
const orderSummary = p => { const o = pOrder(p); const bs = pBatches(p.id); return { order: pRef(p), po_number: o.poNo, so_number: o.soNo, status: pStatus(p), delayed: pDelayed(p), customer: o.customer, products: items(o).map(i => ({ code: i.productCode, name: i.productName, grade: i.grade, po_qty_kg: +i.poQty || 0, workflow: tplById(i.tplId).name, line: i.line })), raw_delivery_date: pDelivery(p), sales_person: o.salesPerson, unit: o.unit, progress_pct: pProgress(p), qc: ST[pStageStatus(p, 'qc')], qa: ST[pStageStatus(p, 'qa')], dispatch: ST[pStageStatus(p, 'dispatch')], unread_remarks: unreadRemarks(p.id), batches: bs.map(b => ({ batch: b.id, product: bItem(b).productName, line: b.line, qty_kg: b.qty, produced_kg: +b.produced || 0, dispatched_kg: dispatchedQty(b), current_stage: phaseLabel(b), delayed: batchDelayed(b), driving_rework: inRework(b) ? drivingRW(b).id : null })) }; };
const batchFull = b => ({ batch: b.id, order: refOfPid(b.projectId), customer: bOrder(b).customer, product: bItem(b).productName, line: b.line, qty_kg: b.qty, produced_kg: +b.produced || 0, dispatched_kg: dispatchedQty(b), booked_kg: bookedQty(b), planned: { material_in: b.materialInDate, start: b.plannedStart, end: b.plannedEnd, qc: b.qcPlanned, qa: b.qaPlanned, dispatch: b.expDispatch }, actual: { start: b.actualStart, end: b.actualEnd }, current_stage: phaseLabel(b), delayed: batchDelayed(b),
  driving_line: inRework(b) || drivingRW(b) ? drivingRW(b).id : 'main', main_workflow: (b.stages || []).map(s => ({ stage: s.name, status: ST[s.status], owner: s.person, planned: s.planned, actual: s.actual, done_kg: s.done, comment: s.comment })),
  reworks: (b.reworks || []).map(r => ({ id: r.id, origin: r.origin, by: r.by, reason: r.reason, qty_kg: r.qty, line: r.line, start: r.start, expected: r.expected, completed: r.actual, status: r.status, stages: r.stages.map(s => `${s.name}: ${ST[s.status]}`) })),
  qc_tests: (b.qcTests || []).map(t => ({ test: t.name, parameter: t.parameter, spec: t.spec, result: t.result, status: t.status, by: t.by, date: t.date, analysis: t.analysis })), qa: { status: b.qa.status, by: b.qa.by, date: b.qa.date, observations: b.qa.observations }, coa: { no: b.coa.no, status: b.coa.status, released: b.coa.released },
  shipments: (b.shipments || []).map(s => ({ id: s.id, qty_kg: s.qty, invoice: s.invoiceNo, invoice_date: s.invoiceDate, container: s.containerNo, size: s.containerSize, dispatch_date: s.dispatchDate, status: s.status })), history: (b.history || []).slice(-25).map(h => ({ at: h.at, text: deRef(h.text) })) });
const findProject = id => { const q = String(id || '').trim().toLowerCase().replace(/^(po|so)[\s:#-]*/, ''); return S.projects.find(p => { const o = pOrder(p); return String(o.poNo || '').toLowerCase() === q || String(o.soNo || '').toLowerCase() === q; }) || S.projects.find(p => { const o = pOrder(p); return String(o.poNo || '').toLowerCase().includes(q) || String(o.soNo || '').toLowerCase().includes(q); }); };
const AI_TOOLS = [
  { name: 'plant_summary', description: 'Current plant-wide figures: orders by status, batches by current stage, delayed orders, batches running on a rework line, failed QC tests, per-line planned vs produced kg, pending dispatch kg, unread remark count. Use for any overall or count question.', execute: () => {
    const act = S.batches.filter(b => !['completed', 'hold'].includes(phaseKey(b))); const st = {}; act.forEach(b => st[phaseLabel(b)] = (st[phaseLabel(b)] || 0) + 1);
    return { today: TODAY, orders: Object.fromEntries(['Not Started', 'Active', 'On Hold', 'Completed'].map(s => [s, S.projects.filter(p => pStatus(p) === s).length])), imported_not_started: S.orders.filter(o => !o.projectId).length, total_orders: S.orders.length, active_batches_by_stage: st,
      delayed_orders: S.projects.filter(pDelayed).map(p => ({ order: pRef(p), customer: pOrder(p).customer, delivery: pDelivery(p) })), batches_in_rework: S.batches.filter(inRework).map(b => ({ batch: b.id, order: refOfPid(b.projectId), rework: drivingRW(b).id, origin: drivingRW(b).origin, reason: drivingRW(b).reason, now_at: phaseLabel(b) })),
      failed_qc_tests: S.batches.flatMap(b => (b.qcTests || []).filter(t => t.status === 'Failed').map(t => ({ batch: b.id, order: refOfPid(b.projectId), test: t.name, result: t.result, spec: t.spec }))),
      lines: lineNames().map(l => { const bs = S.batches.filter(b => b.line === l); return { line: l, batches: bs.length, active: bs.filter(b => !['completed', 'hold'].includes(phaseKey(b))).length, in_manufacturing: bs.filter(b => phaseKey(b) === 'mfg').length, planned_kg: sum(bs, b => b.qty), produced_kg: sum(bs, b => b.produced) }; }),
      pending_dispatch_kg: sum(S.batches.filter(b => phaseKey(b) !== 'completed'), b => Math.max(0, b.qty - dispatchedQty(b))), dispatched_kg: sum(S.batches, dispatchedQty), unread_remarks: S.projects.reduce((t, p) => t + unreadRemarks(p.id), 0) }; } },
  { name: 'search_orders', description: 'Search orders (each order is traced by its PO and SO number). All filters optional and combined: text (matches PO/SO no., customer, product name or code), customer, line (e.g. PR1), stage (Material In, Manufacturing, QC, QA, Ready for Dispatch, Dispatch, Completed, On Hold, Rework), status (Not Started/Active/On Hold/Completed), delayed (true), rework (true). Returns up to 40 order summaries with products and batches.',
    inputSchema: { type: 'object', properties: { text: { type: 'string' }, customer: { type: 'string' }, line: { type: 'string' }, stage: { type: 'string' }, status: { type: 'string' }, delayed: { type: 'boolean' }, rework: { type: 'boolean' } } },
    execute: i => { const lc = v => String(v || '').toLowerCase(); let ps = S.projects.filter(p => pOrder(p).id);
      if (i.text) { const q = lc(i.text); ps = ps.filter(p => { const o = pOrder(p); return [o.poNo, o.soNo, o.customer, ...items(o).flatMap(x => [x.productName, x.productCode, x.grade])].some(x => lc(x).includes(q)); }); }
      if (i.customer) ps = ps.filter(p => lc(pOrder(p).customer).includes(lc(i.customer)));
      if (i.line) ps = ps.filter(p => pBatches(p.id).some(b => lc(b.line) === lc(i.line)));
      if (i.status) ps = ps.filter(p => lc(pStatus(p)) === lc(i.status));
      if (i.stage) ps = ps.filter(p => pBatches(p.id).some(b => lc(phaseLabel(b)).includes(lc(i.stage))));
      if (i.delayed) ps = ps.filter(pDelayed); if (i.rework) ps = ps.filter(p => pBatches(p.id).some(inRework));
      return { count: ps.length, orders: ps.slice(0, 40).map(orderSummary) }; } },
  { name: 'get_order', description: 'Full record of one order by PO number or SO number: all order fields, every product line, every batch with workflow lines (including the driving rework line), QC tests, QA, COA, shipments, history, and all remarks with department.',
    inputSchema: { type: 'object', properties: { po_or_so: { type: 'string' } }, required: ['po_or_so'] },
    execute: i => { const p = findProject(i.po_or_so); if (!p) throw new Error(`No order matches PO/SO "${i.po_or_so}".`); const o = clone(pOrder(p)); delete o.projectId; delete o.id; return { summary: orderSummary(p), order: o, batches: pBatches(p.id).map(batchFull), remarks: pRemarks(p.id).slice(0, 40).map(r => ({ at: r.at, dept: r.dept, by: r.by, text: deRef(r.text), batch: r.batchId })) }; } },
  { name: 'get_batch', description: 'Complete history of one batch by batch number (e.g. PR1-2700): plan, production, workflow, reworks, QC, QA, COA, shipments and dated history.',
    inputSchema: { type: 'object', properties: { batch: { type: 'string' } }, required: ['batch'] },
    execute: i => { const q = String(i.batch || '').trim().toLowerCase(); const b = S.batches.find(x => x.id.toLowerCase() === q) || S.batches.find(x => x.id.toLowerCase().includes(q)); if (!b) throw new Error(`No batch matches "${i.batch}".`); return batchFull(b); } },
  { name: 'customer_quantities', description: 'Per customer: ordered, produced, dispatched and pending kg, with the PO/SO references. Optional customer filter (partial name).',
    inputSchema: { type: 'object', properties: { customer: { type: 'string' } } },
    execute: i => { const m = {}; S.projects.forEach(p => { const o = pOrder(p); if (!o.id) return; if (i.customer && !String(o.customer).toLowerCase().includes(String(i.customer).toLowerCase())) return; const c = m[o.customer] = m[o.customer] || { customer: o.customer, orders: [], ordered_kg: 0, produced_kg: 0, dispatched_kg: 0 }; c.orders.push(pRef(p)); c.ordered_kg += pQty(p); pBatches(p.id).forEach(b => { c.produced_kg += +b.produced || 0; c.dispatched_kg += dispatchedQty(b); }); }); return Object.values(m).map(c => Object.assign(c, { pending_dispatch_kg: Math.max(0, c.ordered_kg - c.dispatched_kg) })); } }
];
const AI_RULES = () => `You are the project assistant inside OrderTrack, a manufacturing order-to-dispatch system. Orders are identified by PO number and SO number; each order can have several products, each with its own workflow and batches. When a batch is sent to rework, the latest rework line (RW1, RW2…) drives the batch. Today is ${TODAY}.
Rules:
- Answer only from data returned by the tools. Call a tool before answering any question about orders, batches, quality, remarks or dispatch.
- If the data does not contain the answer, say it is not recorded in the system. Never guess or invent PO/SO numbers, batch numbers, dates, quantities or names.
- Refer to orders by PO / SO number, never by internal IDs. Quantities are kilograms.
- Be concise: lead with the direct answer, then short bullet points. Plain text with "- " bullets; **bold** allowed; no tables.`;
const mdLite = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
RENDER.assistant = () => {
  const rwB = S.batches.find(b => (b.reworks || []).length) || S.batches[0]; const o1 = S.orders.find(o => o.projectId) || {};
  const sugg = ['Which orders are currently in QC?', 'How many batches are pending in manufacturing?', 'Which batches have failed QC?', 'What is the production status of PR1?', 'Which orders are delayed?', 'What is the pending dispatch quantity?', 'Which batches are running on a rework line?', `Show the complete history of batch ${rwB ? rwB.id : 'PR1-2700'}`, `What is the status of ${o1.poNo ? 'PO ' + o1.poNo : 'my latest order'}?`];
  if (!SAMPLE) return `<section class="panel"><div class="empty" style="padding:48px 20px"><b>The assistant needs the Claude connection</b><span style="max-width:560px">Open this page signed in on claude.ai to ask questions in plain language. Every answer is looked up live from orders, batches, QC/QA records, remarks and shipments.</span></div></section>`;
  return `<section class="panel chat"><header><h3>AI Project Assistant</h3><span class="muted" style="font-size:13px">Answers come only from live system data</span><span class="spacer"></span>${CHAT.length ? '<button class="btn ghost sm" type="button" data-act="chatClear">New conversation</button>' : ''}</header>
    <div class="msgs" id="msgs">${CHAT.length ? CHAT.map(m => `<div class="msg ${m.role === 'user' ? 'u' : 'a'}">${m.tl ? `<div class="tl">${esc(m.tl)}</div>` : ''}${m.role === 'user' ? esc(m.content) : mdLite(m.content || '')}</div>`).join('') : `<div class="empty"><b>Ask about any PO, SO, batch or line</b><span>Try one of these:</span><div class="sugg">${sugg.map(s => `<button type="button" data-ask="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`}</div>
    <form class="composer" id="chatF"><input id="chatI" placeholder="e.g. What is the status of ${esc(o1.poNo ? 'PO ' + o1.poNo : 'PO 4562144774')}?" autocomplete="off" ${CHAT_BUSY ? 'disabled' : ''}><button class="btn" type="submit" ${CHAT_BUSY ? 'hidden' : ''}>Ask</button>${CHAT_BUSY ? '<button class="btn ghost" type="button" data-act="chatStop">Stop</button>' : ''}</form></section>`;
};
AFTER.assistant = () => { const m = $('#msgs'); if (m) m.scrollTop = m.scrollHeight; const f = $('#chatF'); if (f) f.onsubmit = e => { e.preventDefault(); ask($('#chatI').value); }; };
async function ask(q) {
  q = String(q || '').trim(); if (!q || CHAT_BUSY || !SAMPLE) return;
  CHAT.push({ role: 'user', content: q }); const a = { role: 'assistant', content: '', tl: 'Thinking…' }; CHAT.push(a); CHAT_BUSY = true; render(true);
  const bubbleEl = () => $$('#msgs .msg.a').slice(-1)[0];
  const upd = () => { const el = bubbleEl(); if (el) { el.innerHTML = `${a.tl ? `<div class="tl">${esc(a.tl)}</div>` : ''}${mdLite(a.content)}`; const m = $('#msgs'); m.scrollTop = m.scrollHeight; } };
  const turns = CHAT.slice(0, -1).filter(m => m.content).map((m, i) => ({ role: m.role, content: i === 0 ? AI_RULES() + '\n\nQuestion: ' + m.content : m.content }));
  const tools = AI_TOOLS.map(t => Object.assign({}, t, { execute: (inp, ctx) => { a.tl = `Looking up ${t.name.replace(/_/g, ' ')}…`; upd(); return t.execute(inp || {}, ctx); } }));
  CHAT_CTL = new AbortController();
  try { const r = await SAMPLE(turns, { tools, cache: false, signal: CHAT_CTL.signal, onText: ({ text }) => { a.content = text; a.tl = ''; upd(); } }); a.content = r.text; a.tl = r.truncated ? 'Answer was cut short; ask for less at a time.' : ''; }
  catch (e) { a.tl = ''; a.content = e && e.code === 'cancelled' ? (a.content || 'Stopped.') : e && e.code === 'rate_limited' ? 'Too many questions in a short time. Wait a minute and ask again.' : e && e.code === 'not_granted' ? 'The assistant was not allowed to run. Allow it from the page permissions to use it.' : `The assistant could not answer: ${(e && (e.message || e.code)) || 'unknown error'}`; }
  CHAT_BUSY = false; render(true); const ci = $('#chatI'); ci && ci.focus();
}
ACT.chatStop = () => CHAT_CTL && CHAT_CTL.abort();
ACT.chatClear = () => { CHAT = []; render(true); };

/* ===================== events ===================== */
document.addEventListener('click', e => {
  const t = e.target; let el;
  if ((el = t.closest('[data-nav]'))) return go(el.dataset.nav);
  if ((el = t.closest('[data-go]'))) { const [v, x] = el.dataset.go.split(':'); if (v === 'orders') FLT.orders.tab = x || 'all'; if (v === 'ppc') FLT.ppc = { status: x || '' }; return go(v); }
  if ((el = t.closest('[data-ts]'))) { const [id, i] = el.dataset.ts.split(':'); const s = TSTATE[id]; if (s.sort === +i) s.dir = -s.dir; else { s.sort = +i; s.dir = 1; } return render(true); }
  if ((el = t.closest('[data-cfclear]'))) { TSTATE[el.dataset.cfclear].cf = {}; return render(true); }
  if ((el = t.closest('[data-ftab]'))) { const [s, k] = el.dataset.ftab.split(':'); FLT[s].tab = k; return render(true); }
  if ((el = t.closest('[data-ptab]'))) { PTAB = el.dataset.ptab; renderDrawer(); $('.dbody') && ($('.dbody').scrollTop = 0); return; }
  if ((el = t.closest('[data-mtype]'))) { FLT.masters.type = el.dataset.mtype; FLT.masters.q = ''; return render(true); }
  if ((el = t.closest('[data-mdel]'))) { MDRAFT[FLT.masters.type].splice(+el.dataset.mdel, 1); return render(true); }
  if ((el = t.closest('[data-exp]'))) { const [k, f] = el.dataset.exp.split(':'); return doExport(k, f); }
  if ((el = t.closest('[data-ask]'))) return ask(el.dataset.ask);
  if ((el = t.closest('[data-dclose]'))) return closeDrawer();
  if ((el = t.closest('[data-stage]'))) return OPEN.stage(el.dataset.stage);
  if ((el = t.closest('[data-act]'))) { const f = ACT[el.dataset.act]; if (f) f(el); return; }
  if ((el = t.closest('[data-open]')) || (el = t.closest('[data-row]'))) { if (t.closest('input,select,textarea,label,.cbx')) return; const v = el.dataset.open || el.dataset.row; const i = v.indexOf(':'); const k = v.slice(0, i), id = v.slice(i + 1); if (OPEN[k]) OPEN[k](id); return; }
  if (!t.closest('.gsearch')) $('#gres').hidden = true;
});
document.addEventListener('pick', e => {
  const t = e.target;
  if (t.dataset.flt) { const [s, k] = t.dataset.flt.split(':'); FLT[s][k] = e.detail.v; render(true); }
  else if (t.dataset.tcf) { const [id, i] = t.dataset.tcf.split(':'); TSTATE[id].cf[i] = e.detail.v; render(true); }
  else if (t.dataset.mr !== undefined) { MDRAFT[FLT.masters.type][+t.dataset.mr][t.dataset.mf] = e.detail.v; const btn = $('[data-act="mSave"]'); if (btn) btn.disabled = false; }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && !POP) { if (modalStack.length) { const id = modalStack[modalStack.length - 1]; $$(`[data-m="${id}"]`).forEach(x => x.remove()); modalStack.pop(); } else if (drawerFn) closeDrawer(); }
  if (e.key === 'Enter' && e.target.matches && e.target.matches('[data-stage]')) OPEN.stage(e.target.dataset.stage);
});
const refocus = sel => { const el = $(sel); if (el) { el.focus(); const v = el.value; try { el.setSelectionRange(v.length, v.length); } catch (x) { } } };
let inputT;
document.addEventListener('input', e => {
  const t = e.target;
  if (t.matches('[data-tq]')) { TSTATE[t.dataset.tq].q = t.value; clearTimeout(inputT); inputT = setTimeout(() => { render(true); refocus(`[data-tq="${t.dataset.tq}"]`); }, 180); }
  if (t.matches('[data-mq]')) { FLT.masters.q = t.value; clearTimeout(inputT); inputT = setTimeout(() => { render(true); refocus('[data-mq]'); }, 160); }
  if (t.matches('input[data-mr]:not([data-cbx])')) { MDRAFT[FLT.masters.type][+t.dataset.mr][t.dataset.mf] = t.value; const btn = $('[data-act="mSave"]'); if (btn) btn.disabled = false; }
  if (t.id === 'gsearch') gsearch(t.value);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches('input[type=date][data-flt]')) { const [s, k] = t.dataset.flt.split(':'); FLT[s][k] = t.value; render(true); }
  if (t.matches('[data-upload]') && t.files.length) { handleUpload(t.dataset.upload, [...t.files]); t.value = ''; }
});
function gsearch(q) {
  const box = $('#gres'); q = q.trim().toLowerCase(); if (q.length < 2) { box.hidden = true; return; }
  const res = [];
  S.orders.forEach(o => { if ([o.poNo, o.soNo, o.customer, ...items(o).flatMap(i => [i.productName, i.productCode])].some(x => String(x || '').toLowerCase().includes(q))) res.push(`<button type="button" data-open="${o.projectId ? 'project:' + esc(o.projectId) : 'order:' + esc(o.id)}"><b>${esc(oRef(o))}</b> · ${esc(o.customer)}<div class="muted" style="font-size:12px">${esc(oProducts(o))} · ${esc(o.projectId ? pStatus(P(o.projectId)) : 'Not started')}</div></button>`); });
  S.batches.forEach(b => { if (b.id.toLowerCase().includes(q)) res.push(`<button type="button" data-open="project:${esc(b.projectId)}"><b class="mono">${esc(b.id)}</b> · batch of ${esc(refOfPid(b.projectId))}<div class="muted" style="font-size:12px">${esc(bItem(b).productName || '')} · ${esc(phaseLabel(b))}</div></button>`); });
  box.innerHTML = res.slice(0, 12).join('') || '<div class="muted" style="padding:10px 12px">No matches</div>'; box.hidden = false;
}
$('#gres').addEventListener('click', () => { $('#gres').hidden = true; $('#gsearch').value = ''; });
$('#collapseBtn').onclick = () => $('#side').classList.toggle('collapsed');
$('#burger').onclick = () => { if (matchMedia('(max-width:900px)').matches) $('#side').classList.toggle('open'); else $('#side').classList.toggle('collapsed'); };
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (h && h !== VIEW && RENDER[h]) go(h); });
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => render(true)); } catch (e) { }
new MutationObserver(() => render(true)).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ===================== boot ===================== */
function setConn(mode) { const c = $('#conn'); c.className = 'conn ' + mode; $('span', c).textContent = mode === 'live' ? 'Live · shared database' : mode === 'local' ? 'This browser only' : 'Connecting…'; }
const useCap = name => (window.claude && typeof window.claude.use === 'function') ? Promise.race([window.claude.use(name).catch(() => null), new Promise(r => setTimeout(() => r(null), 10000))]) : Promise.resolve(null);
async function boot() {
  let h = location.hash.slice(1); if (h === 'projects') h = 'ppc'; if (RENDER[h]) VIEW = h; else VIEW = 'overview'; if (DEPT_VIEW[VIEW]) { VISIT_PREV[VIEW] = deptSeen(VIEW); LS.set('ot-seen-' + VIEW, nowISO()); } renderNav();
  useCap('assets').then(a => { ASSETS = a; if (a) scheduleRender(); });
  useCap('downloads').then(d => { DL = d; if (d) scheduleRender(); });
  useCap('sample').then(s => { SAMPLE = s; if (s) scheduleRender(); });
  DB = await useCap('db');
  if (!DB) { MODE = 'local'; setConn('local'); loadLocal(); render(true); return; }
  MODE = 'live'; setConn('live');
  const need = new Set(['orders', 'projects', 'batches', 'masters', 'templates']); let first = true;
  const ready = k => { need.delete(k); if (first && !need.size) { first = false; if (!S.templates.length && !M('stages').length && !M('lines').length) { seedDefaults(true); toast('New database: default master data loaded. Add customers and products, or import your order sheet.'); } render(true); } else if (!first) scheduleRender(); };
  const norm = { orders: normalizeOrder, batches: normalizeBatch };
  ['orders', 'projects', 'batches', 'templates', 'remarks'].forEach(c => DB.collection(c).limit(1000).onSnapshot(snap => { S[c] = snap.docs.map(d => { const x = Object.assign(clone(d.data()), { id: d.id }); return norm[c] ? norm[c](x) : x; }); ready(c); }, err => { toast(`Could not load ${c}: ${err.message || err.code}`); ready(c); }));
  DB.collection('masters').limit(200).onSnapshot(snap => { const m = {}; snap.docs.forEach(d => { m[d.id] = clone(d.data()); }); S.masters = m; Object.keys(MDRAFT).forEach(k => { if (VIEW !== 'masters' || k !== FLT.masters.type) delete MDRAFT[k]; }); ready('masters'); }, () => ready('masters'));
  DB.collection('activity').orderBy('at', 'desc').limit(300).onSnapshot(snap => { S.activity = snap.docs.map(d => Object.assign(clone(d.data()), { id: d.id })); scheduleRender(); }, () => { });
  setTimeout(() => { if (first) { first = false; render(true); } }, 6000);
}
boot();
