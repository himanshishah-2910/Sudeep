'use strict';
/* ===================== utilities ===================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = o => JSON.parse(JSON.stringify(o));
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());
const nowISO = () => new Date().toISOString();
const toD = s => new Date(s + 'T00:00:00');
const addDays = (s, n) => { const d = toD(s || TODAY); d.setDate(d.getDate() + n); return iso(d); };
const dayDiff = (a, b) => Math.round((toD(b) - toD(a)) / 864e5);
const fmtD = s => s ? toD(String(s).slice(0, 10)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const fmtDT = s => s ? new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const kg = n => (Math.round(+n || 0)).toLocaleString('en-IN');
const uid = p => p + Date.now().toString(36).slice(-5).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
const sum = (a, f) => a.reduce((t, x) => t + (+f(x) || 0), 0);
const uniq = a => [...new Set(a.filter(v => v !== '' && v !== null && v !== undefined))];
const by = (k, dir = 1) => (a, b) => { const x = typeof k === 'function' ? k(a) : a[k], y = typeof k === 'function' ? k(b) : b[k]; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } } };
const ICON = {
  overview: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z"/>',
  orders: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  ppc: '<path d="M3 7h18v13H3z"/><path d="M8 7V4h8v3M3 12h18"/>',
  manufacturing: '<path d="M2 21V11l6 3v-3l6 3V5l8 4v12z"/>',
  qc: '<path d="M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3"/><path d="M7.5 14h9"/>',
  qa: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  dispatch: '<path d="M1 6h13v10H1zM14 10h4l3 3v3h-7"/><circle cx="5.5" cy="18" r="2"/><circle cx="17.5" cy="18" r="2"/>',
  masters: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  assistant: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', up: '<path d="M12 19V5M5 12l7-7 7 7"/>', dl: '<path d="M12 4v12M6 11l6 6 6-6M4 20h16"/>', clip: '<path d="M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7"/>',
  pdf: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/><path d="M9 14h1.5a1.5 1.5 0 0 0 0-3H9v6M14 11v6h1a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2z"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>'
};
const ico = (k, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${ICON[k]}</svg>`;
const ARROW = '<div class="arrow" aria-hidden="true"><svg viewBox="0 0 30 16"><path d="M1 8h24M19 2l7 6-7 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>';

/* ===================== status vocabulary ===================== */
const ST = { notstarted: 'Not Started', progress: 'In Progress', done: 'Completed', pending: 'Pending', rejected: 'Rejected', rework: 'Rework Required' };
const pill = (k, label) => `<span class="pill s-${esc(k)}">${esc(label || ST[k] || k)}</span>`;
const newChip = () => '<span class="newchip">NEW</span>';
const STAGE_TYPES = { order: 'Order Punching', material: 'Material In', mfg: 'Manufacturing / PR line', qc: 'Quality Control', qa: 'Quality Assurance', rework: 'Rework', ready: 'Ready for Dispatch', dispatch: 'Dispatch', done: 'Project Completion' };
const DEFAULT_STAGES = [['Order Punching', 'order'], ['Material In', 'material'], ['Manufacturing', 'mfg'], ['PR1', 'mfg'], ['PR2', 'mfg'], ['PR3', 'mfg'], ['PR4', 'mfg'], ['PR5', 'mfg'], ['QC', 'qc'], ['QA', 'qa'], ['Rework', 'rework'], ['Ready for Dispatch', 'ready'], ['Dispatch', 'dispatch'], ['Project Completion', 'done']].map(([name, type]) => ({ name, type }));
const DEFAULT_FLOW = ['Order Punching', 'Material In', 'Manufacturing', 'QC', 'QA', 'Ready for Dispatch', 'Dispatch', 'Project Completion'];
const PHASE = { order: 'Order Punching', material: 'Material In', mfg: 'Manufacturing', qc: 'QC', qa: 'QA', rework: 'Rework', ready: 'Ready for Dispatch', dispatch: 'Dispatch', done: 'Completion' };
const DEPT_OF_TYPE = { order: 'Operations', material: 'Stores', mfg: 'Manufacturing', qc: 'Quality Control', qa: 'Quality Assurance', rework: 'Manufacturing', ready: 'Dispatch', dispatch: 'Dispatch', done: 'Operations' };

/* ===================== store ===================== */
const S = { orders: [], projects: [], batches: [], activity: [], templates: [], remarks: [], masters: {} };
let DB = null, MODE = 'init', ASSETS = null, DL = null, SAMPLE = null;
const LKEY = 'ordertrack-local-v1';
const writeQ = {};
function saveLocal() { try { localStorage.setItem(LKEY, JSON.stringify(S)); } catch (e) { } }
function loadLocal() { try { const d = JSON.parse(localStorage.getItem(LKEY) || 'null'); if (d) Object.assign(S, d); } catch (e) { } normalizeAll(); }
function persist(coll, id, data) {
  if (DB) {
    const k = coll + '/' + id;
    writeQ[k] = (writeQ[k] || Promise.resolve()).then(() => data === null ? DB.collection(coll).doc(id).delete() : DB.collection(coll).doc(id).set(data))
      .catch(e => toast(e && e.code === 'permission_denied' ? 'You have view-only access, so this change was not saved.' : `Could not save ${id}: ${(e && (e.message || e.code)) || 'unknown error'}`));
  } else saveLocal();
}
function put(coll, obj) {
  const c = clone(obj); const arr = S[coll]; const i = arr.findIndex(x => x.id === c.id);
  if (i < 0) arr.push(c); else arr[i] = c;
  persist(coll, c.id, c); scheduleRender(); return c;
}
function removeRec(coll, id) { S[coll] = S[coll].filter(x => x.id !== id); persist(coll, id, null); scheduleRender(); }
function putMaster(type, items) { S.masters[type] = { items: clone(items) }; persist('masters', type, { items: S.masters[type].items }); scheduleRender(); }
const M = t => (S.masters[t] && S.masters[t].items) ? S.masters[t].items : (Array.isArray(S.masters[t]) ? S.masters[t] : []);
const AUTO = () => { const s = M('settings')[0]; return !s || s.auto !== false; };
const stageMaster = () => M('stages').length ? M('stages') : DEFAULT_STAGES;

/* ===================== domain helpers ===================== */
const O = id => S.orders.find(o => o.id === id);
const P = id => S.projects.find(p => p.id === id);
const B = id => S.batches.find(b => b.id === id);
const pOrder = p => (p && O(p.orderId)) || {};
const items = o => (o && Array.isArray(o.items)) ? o.items : [];
const itemOf = (o, iid) => items(o).find(i => i.id === iid) || items(o)[0] || {};
const bOrder = b => pOrder(P(b.projectId));
const bItem = b => itemOf(bOrder(b), b.itemId);
const oRef = o => { if (!o) return '—'; const a = []; if (o.poNo) a.push('PO ' + o.poNo); if (o.soNo) a.push('SO ' + o.soNo); return a.join(' · ') || '—'; };
const pRef = p => oRef(pOrder(p));
const refOfPid = id => { const p = P(id); return p ? pRef(p) : id; };
const oQty = o => sum(items(o), i => (i.openQty === '' || i.openQty === undefined || i.openQty === null) ? i.poQty : i.openQty);
const oPoQty = o => sum(items(o), i => i.poQty);
const oProducts = o => uniq(items(o).map(i => i.productName)).join(' + ');
const oCodes = o => uniq(items(o).map(i => i.productCode)).join(', ');
const oGrades = o => uniq(items(o).map(i => i.grade)).join(', ');
const pQty = p => oQty(pOrder(p));
const pBatches = pid => S.batches.filter(b => b.projectId === pid).sort(by('id'));
const lineNames = () => uniq(M('lines').map(l => l.name)).length ? uniq(M('lines').map(l => l.name)) : ['PR1', 'PR2', 'PR3', 'PR4', 'PR5'];
function unitToLine(u) { const L = lineNames(); if (!u) return L[0]; if (L.includes(u)) return u; const m = String(u).match(/PR\d/); return m && L.includes(m[0]) ? m[0] : (L.includes('PROTH') && /PROTH/i.test(u) ? 'PROTH' : L[0]); }
const stageType = name => (stageMaster().find(s => s.name === name) || {}).type || (/^PR/i.test(name) ? 'mfg' : 'mfg');
/* PRJ-numbers are internal keys only; anything shown to people is traced by PO / SO */
const deRef = t => String(t || '').replace(/PRJ-\d+/g, m => refOfPid(m));

const ITEM_KEYS = ['productCode', 'grade', 'productName', 'productDesc', 'poQty', 'openQty', 'packing', 'pallet', 'specialReq', 'mktRemarks', 'batchNo'];
function normalizeOrder(o) {
  if (!Array.isArray(o.items)) {
    const it = { id: 'L1', tplId: '', line: o.assignedLine || '', nBatches: 1 };
    ITEM_KEYS.forEach(k => { it[k] = o[k] ?? ''; delete o[k]; });
    it.poQty = +it.poQty || 0; it.openQty = it.openQty === '' ? it.poQty : +it.openQty || 0;
    o.items = [it]; delete o.assignedLine;
  }
  o.items.forEach((it, i) => { if (!it.id) it.id = 'L' + (i + 1); });
  return o;
}
function normalizeBatch(b) {
  if (!b.itemId) b.itemId = 'L1'; ['stages', 'reworks', 'qcTests', 'shipments', 'history', 'docs', 'prodLog'].forEach(k => { if (!Array.isArray(b[k])) b[k] = []; }); b.qa = b.qa || { status: 'Not Started', docs: [] }; b.coa = b.coa || { status: 'Not Started', docs: [] };
  /* repair reworks made by the earlier version: the "<Dept> Rework" marker stage was left at "Rework Required",
     which hid the batch from every department. The marker is a record, so it is done; the next stage is running. */
  b.reworks.forEach((r, ri) => {
    const L = r.stages || []; const m = L[0];
    if (m && m.type === 'rework' && m.status !== 'done') { m.status = 'done'; m.actual = m.actual || r.start || ''; }
    const last = ri === b.reworks.length - 1;
    if (last && (r.status === 'In Progress' || r.status === 'Pending') && !L.some(s => ['progress', 'pending', 'rework', 'rejected'].includes(s.status))) {
      const k = L.findIndex(s => s.status === 'notstarted');
      if (k > 0 && L.slice(0, k).every(s => s.status === 'done')) { L[k].status = L[k].type === 'ready' ? 'pending' : 'progress'; L[k].startedAt = L[k].startedAt || (r.start ? r.start + 'T09:00:00.000Z' : ''); }
    }
  });
  return b;
}
function normalizeAll() { S.orders.forEach(normalizeOrder); S.batches.forEach(normalizeBatch); S.remarks = S.remarks || []; }

/* ---------- driving line: the latest rework drives the batch once punched ---------- */
const drivingRW = b => (b.reworks && b.reworks.length) ? b.reworks[b.reworks.length - 1] : null;
const activeLine = b => { const r = drivingRW(b); return r ? r.stages : (b.stages || []); };
const inRework = b => { const r = drivingRW(b); return !!r && r.status !== 'Completed'; };
const openRW = b => (b.reworks || []).filter(r => r.status === 'In Progress' || r.status === 'Pending');
const curStage = b => activeLine(b).find(s => s.status !== 'done') || null;
const dispatchedQty = b => sum((b.shipments || []).filter(s => s.status === 'Dispatched'), s => s.qty);
const bookedQty = b => sum((b.shipments || []).filter(s => s.status !== 'Dispatched'), s => s.qty);
function phaseKey(b) {
  const p = P(b.projectId); if (p && p.status === 'On Hold') return 'hold';
  const s = curStage(b); if (!s) return 'completed';
  return s.type === 'done' ? 'completed' : s.type;
}
function phaseLabel(b) {
  const k = phaseKey(b); if (k === 'hold') return 'On Hold'; if (k === 'completed') return 'Completed';
  return (inRework(b) ? drivingRW(b).id + ' · ' : '') + PHASE[k];
}
function phasePill(b) {
  const k = phaseKey(b), s = curStage(b);
  const st = k === 'hold' ? 'pending' : k === 'completed' ? 'done' : inRework(b) ? 'rework' : (s && s.status === 'rejected' ? 'rejected' : (s && s.status) || 'progress');
  return pill(st === 'notstarted' ? 'pending' : st, phaseLabel(b));
}
function batchDelayed(b) {
  const k = phaseKey(b); if (k === 'completed' || k === 'hold') return false;
  const s = curStage(b); if (s && s.planned && s.planned < TODAY) return true;
  const mfg = activeLine(b).find(x => x.type === 'mfg'); if (mfg && mfg.status !== 'done' && b.plannedEnd && b.plannedEnd < TODAY) return true;
  return false;
}
const pDelivery = p => { const o = pOrder(p); return o.rowDelivery || o.exPlant || ''; };
function pStatus(p) {
  if (!p) return 'Unknown'; if (p.status === 'On Hold') return 'On Hold';
  const bs = pBatches(p.id); if (!bs.length) return 'Not Started';
  return bs.every(b => phaseKey(b) === 'completed') ? 'Completed' : 'Active';
}
const pDelayed = p => { const st = pStatus(p); if (st === 'Completed' || st === 'On Hold') return false; const d = pDelivery(p); return (d && d < TODAY) || pBatches(p.id).some(batchDelayed); };
function lineStageStatus(b, type) { const s = [...activeLine(b)].reverse().find(x => x.type === type) || [...(b.stages || [])].reverse().find(x => x.type === type); return s ? s.status : 'notstarted'; }
function pStageStatus(p, type) {
  const bs = pBatches(p.id); if (!bs.length) return 'notstarted';
  const ss = bs.map(b => lineStageStatus(b, type));
  if (ss.every(s => s === 'done')) return 'done';
  if (ss.includes('rejected')) return 'rejected';
  if (ss.includes('progress')) return 'progress';
  if (ss.includes('pending') || ss.includes('done')) return 'pending';
  return 'notstarted';
}
function bProgress(b) { const L = activeLine(b); if (!L.length) return 0; return Math.round(100 * L.filter(s => s.status === 'done').length / L.length); }
function pProgress(p) { const bs = pBatches(p.id); if (!bs.length) return 0; return Math.round(sum(bs, bProgress) / bs.length); }
function tplById(id) { return S.templates.find(t => t.id === id) || S.templates.find(t => t.isDefault) || S.templates[0] || { id: '', name: 'Standard flow', stages: DEFAULT_FLOW.map(n => ({ name: n, type: stageType(n) })) }; }
function buildStages(tpl, line, qty, start) {
  return tpl.stages.map((s, i) => { const slot = s.name === 'Manufacturing' || s.name === '{LINE}'; const name = slot ? line : s.name; const type = slot ? 'mfg' : (s.type || stageType(s.name));
    return { name, type, status: 'notstarted', alloc: qty, done: 0, person: '', planned: addDays(start, i * 2), actual: '', comment: '' }; });
}

/* ===================== automation engine ===================== */
function addHist(b, text) { (b.history = b.history || []).push({ at: TODAY, ts: nowISO(), text }); }
function startStage(s) { if (s && s.status === 'notstarted') { s.status = s.type === 'ready' ? 'pending' : 'progress'; s.startedAt = nowISO(); } }
function reschedule(L, i) { const s = L[i]; if (!s.planned || !s.actual) return; const d = dayDiff(s.planned, s.actual); if (!d) return; for (let k = i + 1; k < L.length; k++) if (L[k].status !== 'done' && L[k].planned) L[k].planned = addDays(L[k].planned, d); }
function syncBatchDates(b) { const L = activeLine(b); const f = t => (L.find(s => s.type === t && s.status !== 'done') || {}).planned; b.qcPlanned = f('qc') || b.qcPlanned; b.qaPlanned = f('qa') || b.qaPlanned; b.expDispatch = f('dispatch') || b.expDispatch; }
function finalize(b) {
  const r = drivingRW(b); if (r && r.status !== 'Completed' && r.stages.every(s => s.status === 'done')) { r.status = 'Completed'; r.actual = TODAY; addHist(b, `${r.id} completed`); }
}
function completeStage(b, L, i, note) {
  const s = L[i]; s.status = 'done'; s.actual = s.actual || TODAY; s.done = s.alloc || s.done; s.completedAt = nowISO();
  addHist(b, `${s.name} completed${note ? ' — ' + note : ''}`);
  /* hand-off is unconditional: the next department always sees the batch as In Progress, and later dates re-plan */
  reschedule(L, i);
  const n = L.findIndex((x, k) => k > i && x.status !== 'done');
  if (n >= 0) { if (L[n].type === 'done' && s.type === 'dispatch') { L[n].status = 'done'; L[n].actual = TODAY; L[n].completedAt = nowISO(); } else startStage(L[n]); }
  syncBatchDates(b); finalize(b);
}
function completeType(b, type, note) { const L = activeLine(b); const i = L.findIndex(s => s.type === type && s.status !== 'done'); if (i >= 0) completeStage(b, L, i, note); return i >= 0; }
function afterBatchChange(b) {
  const p = P(b.projectId); if (!p) return;
  const bs = pBatches(p.id).map(x => x.id === b.id ? b : x);
  if (bs.length && bs.every(x => !curStage(x) || curStage(x).type === 'done') && p.status !== 'Completed' && p.status !== 'On Hold') {
    put('projects', Object.assign(clone(p), { status: 'Completed' })); const o = O(p.orderId); if (o) put('orders', Object.assign(clone(o), { status: 'Dispatched' }));
    log(`${pRef(p)} completed — all batches dispatched`, p.id);
  }
}
function saveBatch(b, msg) { put('batches', b); if (msg) log(msg, b.projectId); afterBatchChange(b); }
function defaultReworkSeq(b) {
  const L = activeLine(b); const qi = L.findIndex(s => s.type === 'qc'); const tail = (qi >= 0 ? L.slice(qi) : L.filter(s => ['qc', 'qa', 'ready', 'dispatch', 'done'].includes(s.type))).map(s => s.name);
  return [b.line, ...tail.filter(n => n !== b.line)];
}
function createRework(b, f) {
  const L = activeLine(b);
  const oi = L.findIndex(s => s.type === f.originType && s.status !== 'done');
  const idx = oi >= 0 ? oi : L.findIndex(s => s.status !== 'done');
  if (idx >= 0) { L[idx].status = 'rejected'; L[idx].actual = TODAY; L[idx].comment = f.reason; }
  const prev = drivingRW(b); if (prev && prev.status !== 'Completed') prev.status = 'Re-rejected';
  const n = (b.reworks || []).length + 1, id = 'RW' + n;
  const stages = [{ name: `${f.origin} Rework`, type: 'rework', status: 'done', alloc: +f.qty, done: +f.qty, person: f.by, planned: f.start, actual: TODAY, comment: f.reason, completedAt: nowISO() }]
    .concat(f.seq.map((nm, k) => ({ name: nm, type: nm === f.line || lineNames().includes(nm) ? 'mfg' : stageType(nm), status: 'notstarted', alloc: +f.qty, done: 0, person: '', planned: addDays(f.start, (k + 1) * 2), actual: '', comment: '' })));
  startStage(stages[1]);
  (b.reworks = b.reworks || []).push({ id, origin: f.origin, by: f.by, reason: f.reason, qty: +f.qty, line: f.line, start: f.start, expected: f.expected, actual: '', status: 'In Progress', comments: f.comments || '', docs: [], stages });
  b.line = f.line || b.line;
  addHist(b, `${id} raised by ${f.origin}: ${f.reason}`);
  syncBatchDates(b);
  saveBatch(b, `${b.id} sent to rework ${id} by ${f.origin} — ${f.reason}`);
  addRemark(b.projectId, deptOfOrigin(f.origin), `${id} on batch ${b.id}: ${f.reason}${f.comments ? ' — ' + f.comments : ''}`, { by: f.by, batchId: b.id, itemId: b.itemId, source: 'Rework' });
  toast(`${id} created — batch ${b.id} now runs on the rework line`);
}
const deptOfOrigin = o => ({ QC: 'Quality Control', QA: 'Quality Assurance' }[o] || o || 'Operations');

/* ===================== remarks + activity ===================== */
function log(text, ref) { put('activity', { id: uid('A'), at: nowISO(), text, ref: ref || '' }); }
function addRemark(pid, dept, text, o = {}) {
  text = String(text || '').trim(); if (!pid || !text) return;
  put('remarks', { id: uid('R'), projectId: pid, dept: dept || 'Operations', text, by: o.by || LS.get('ot-me', ''), batchId: o.batchId || '', itemId: o.itemId || '', source: o.source || 'Remark', at: nowISO() });
}
const pRemarks = pid => S.remarks.filter(r => r.projectId === pid).sort(by('at', -1));
const SEEN_BASE = (() => { let v = LS.get('ot-seen-base', ''); if (!v) { v = nowISO(); LS.set('ot-seen-base', v); } return v; })();
const rmSeen = pid => LS.get('ot-rm-' + pid, SEEN_BASE);
const markRmSeen = pid => { const latest = pRemarks(pid)[0]; const t = nowISO(); LS.set('ot-rm-' + pid, latest && latest.at > t ? latest.at : t); };
const unreadRemarks = pid => { const s = rmSeen(pid); return pRemarks(pid).filter(r => r.at > s).length; };

/* ---------- department "new work" tracking (per viewer) ---------- */
const DEPT_VIEW = { manufacturing: ['material', 'mfg'], qc: ['qc'], qa: ['qa'], dispatch: ['ready', 'dispatch'] };
const VISIT_PREV = {};
const deptSeen = v => LS.get('ot-seen-' + v, SEEN_BASE);
const stageStarted = b => (curStage(b) || {}).startedAt || '';
const isNewFor = (v, b, since) => { const t = stageStarted(b); return !!t && t > (since ?? deptSeen(v)); };
const deptBatches = v => S.batches.filter(b => P(b.projectId) && (DEPT_VIEW[v] || []).includes(phaseKey(b)));
const deptNew = v => deptBatches(v).filter(b => isNewFor(v, b)).length;
