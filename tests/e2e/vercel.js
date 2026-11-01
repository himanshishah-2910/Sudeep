/* Own-domain (Vercel) build test: public/index.html + backend.js + app.js.
   - Supabase: in-browser stand-in for the supabase-js client (same calls: from/select/eq/order/range/upsert/delete/in, channel realtime, storage)
   - /api/config and /api/ai: the REAL Vercel function files, called in Node; only OpenAI's HTTP endpoint is simulated. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), PUB = path.join(ROOT, 'public');
const OUT = path.join(__dirname, 'out-vercel'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const results = []; const ok = (n, c, d = '') => { results.push({ n, pass: !!c, d }); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${d ? '  — ' + d : ''}`); return !!c; };
const openaiCalls = [];

// ---------- fake OpenAI behind the real api/ai.js ----------
process.env.open_ai_sudeep_key = 'sk-test-sudeep-123';
const realFetch = global.fetch;
global.fetch = async (url, init) => {
  if (!String(url).startsWith('https://api.openai.com/')) return realFetch(url, init);
  const body = JSON.parse(init.body); openaiCalls.push({ auth: init.headers.Authorization, body });
  const msgs = body.messages; const last = msgs[msgs.length - 1];
  const reply = m => ({ ok: true, status: 200, json: async () => ({ model: body.model, choices: [{ message: m, finish_reason: 'stop' }], usage: {} }) });
  if (body.response_format && body.response_format.type === 'json_object') {
    const parts = Array.isArray(last.content) ? last.content : [{ type: 'text', text: last.content }];
    const hasPdf = parts.some(p => p.type === 'file' && /^data:application\/pdf;base64,/.test(p.file.file_data));
    const txt = parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
    if (!hasPdf || !/PO\/TEST\/7781/.test(txt)) return reply({ role: 'assistant', content: '{}' });
    const X = JSON.parse(fs.readFileSync(path.join(__dirname, 'pdf-expect-v.json')));
    return reply({ role: 'assistant', content: JSON.stringify({ poNo: 'PO/TEST/7781', soNo: '55210', poDate: '2026-11-01', customer: X.customer, rawDeliveryDate: '2026-11-28', incoterms: X.inco, paymentTerms: X.pay, items: [{ productCode: X.p1, qtyKg: 2000 }, { productCode: X.p2, qtyKg: 1500 }, { productCode: 'ZZZ-UNKNOWN-9', qtyKg: 500 }] }) });
  }
  if (last.role === 'tool') return reply({ role: 'assistant', content: 'From OrderTrack data: ' + last.content.slice(0, 300) });
  const q = typeof last.content === 'string' ? last.content : '';
  const po = (q.split('Question:').pop().match(/PO\s+(\S+?)\??$/) || [])[1];
  return reply({ role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: po ? { name: 'get_order', arguments: JSON.stringify({ po_or_so: po }) } : { name: 'plant_summary', arguments: '{}' } }] });
};
async function runFn(file, reqBody) {
  const mod = await import(path.join(ROOT, 'api', file) + '?v=' + Date.now());
  let status = 200, out = null; const headers = {};
  const res = { setHeader: (k, v) => { headers[k] = v; }, status(s) { status = s; return this; }, json(o) { out = o; return this; } };
  await mod.default({ method: reqBody === undefined ? 'GET' : 'POST', body: reqBody }, res);
  return { status, out };
}

// ---------- in-browser Supabase stand-in ----------
const FAKE_SB = `(() => {
  const KEY = 'fakesb'; const load = () => JSON.parse(localStorage.getItem(KEY) || '{}'); const save = st => localStorage.setItem(KEY, JSON.stringify(st));
  const chans = []; window.__sbStats = { upserts: 0, rows: 0, deletes: 0, uploads: [] };
  function rows() { const st = load(); return Object.entries(st).flatMap(([c, m]) => Object.entries(m).map(([id, data]) => ({ collection: c, id, data }))); }
  function builder() {
    const f = { ops: [] };
    const run = () => {
      const st = load();
      if (f.kind === 'upsert') { f.rows.forEach(r => { (st[r.collection] = st[r.collection] || {})[r.id] = r.data; }); save(st); window.__sbStats.upserts++; window.__sbStats.rows += f.rows.length; return { data: null, error: null }; }
      let rs = rows(); f.ops.forEach(([op, a, b]) => { if (op === 'eq') rs = rs.filter(r => r[a] === b); if (op === 'in') rs = rs.filter(r => b.includes(r[a])); });
      if (f.kind === 'delete') { rs.forEach(r => { delete st[r.collection][r.id]; }); save(st); window.__sbStats.deletes += rs.length; return { data: null, error: null }; }
      if (f.order) { const k = f.order.col.replace('data->>', ''); rs.sort((x, y) => String(x.data[k] || '') > String(y.data[k] || '') ? (f.order.asc ? 1 : -1) : (f.order.asc ? -1 : 1)); }
      if (f.range) rs = rs.slice(f.range[0], f.range[1] + 1); if (f.lim) rs = rs.slice(0, f.lim);
      return { data: rs.map(r => ({ id: r.id, data: r.data })), error: null };
    };
    const api = { select() { f.kind = f.kind || 'select'; return api; }, eq(a, b) { f.ops.push(['eq', a, b]); return api; }, in(a, b) { f.ops.push(['in', a, b]); return api; }, order(col, o) { f.order = { col, asc: o.ascending }; return api; }, range(a, b) { f.range = [a, b]; return api; }, limit(n) { f.lim = n; return api; },
      upsert(r) { f.kind = 'upsert'; f.rows = r; return api; }, delete() { f.kind = 'delete'; return api; }, then(res, rej) { return new Promise(r => setTimeout(r, 5)).then(run).then(res, rej); } };
    return api;
  }
  window.__sbExternal = (eventType, row) => { const st = load(); if (eventType === 'DELETE') delete (st[row.collection] || {})[row.id]; else (st[row.collection] = st[row.collection] || {})[row.id] = row.data; save(st); chans.forEach(cb => cb({ eventType, new: eventType === 'DELETE' ? {} : row, old: eventType === 'DELETE' ? row : {} })); };
  window.supabase = { createClient(url, key) { window.__sbCreated = { url, key }; return {
    from: t => { if (t !== 'ot_docs') throw new Error('unexpected table ' + t); return builder(); },
    channel: () => ({ on(type, filter, cb) { chans.push(cb); return this; }, subscribe(cb) { setTimeout(() => cb && cb('SUBSCRIBED'), 5); return this; } }),
    storage: { from: b => ({ upload: async (p, blob, o) => { window.__sbStats.uploads.push({ b, p, type: o.contentType }); return { data: { path: p }, error: null }; }, getPublicUrl: p => ({ data: { publicUrl: 'https://pugkpvtdcnpwrvmtbamz.supabase.co/storage/v1/object/public/' + b + '/' + p } }), remove: async () => ({ error: null }) }) }
  }; } };
})();`;

(async () => {
  // fixtures: a PO PDF that uses customers/products from the sheet
  const { jsPDF } = require('jspdf');
  const ms = JSON.parse(fs.readFileSync('/home/claude/sbload/masters_sheet.json'));
  const X = { customer: ms.customers[10].name, p1: ms.products[3].code, p2: ms.products[9].code, inco: ms.incoterms[2].name, pay: ms.payment[1].name };
  fs.writeFileSync(path.join(__dirname, 'pdf-expect-v.json'), JSON.stringify(X));
  const doc = new jsPDF(); ['PURCHASE ORDER', 'PO No: PO/TEST/7781', 'Customer: ' + X.customer, 'Item ' + X.p1 + ' 2,000 kg', 'Item ' + X.p2 + ' 1.5 MT'].forEach((t, i) => doc.text(t, 20, 20 + i * 10));
  fs.writeFileSync(path.join(__dirname, 'test-po-v.pdf'), Buffer.from(doc.output('arraybuffer')));

  const cfg = await runFn('config.js');
  ok('A1 api/config returns real Supabase project + publishable key, AI on, no secret', cfg.out.supabaseUrl === 'https://pugkpvtdcnpwrvmtbamz.supabase.co' && /^sb_publishable_/.test(cfg.out.supabaseKey) && cfg.out.ai === true && !JSON.stringify(cfg.out).includes('sk-test'), JSON.stringify(cfg.out));
  const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, timezoneId: 'Asia/Kolkata' });
  const NM = path.join(__dirname, 'node_modules'); const LIB = { 'chart.umd.min.js': 'chart.js/dist/chart.umd.js', 'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js', 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js' };
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.host === 'ordertrack.vercel.test') {
      if (u.pathname === '/api/config') { const x = await runFn('config.js'); return r.fulfill({ status: x.status, json: x.out }); }
      if (u.pathname === '/api/ai') { const x = await runFn('ai.js', JSON.parse(r.request().postData())); return r.fulfill({ status: x.status, json: x.out }); }
      const f = path.join(PUB, u.pathname === '/' ? 'index.html' : u.pathname); if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream' });
      return r.fulfill({ status: 404, body: 'not found' });
    }
    if (u.host === 'cdn.jsdelivr.net' && /supabase-js/.test(u.pathname)) return r.fulfill({ body: FAKE_SB, contentType: 'text/javascript' });
    if (u.host === 'cdnjs.cloudflare.com') { const f = LIB[path.basename(u.pathname)]; return f ? r.fulfill({ body: fs.readFileSync(path.join(NM, f)), contentType: 'text/javascript' }) : r.abort(); }
    return r.fulfill({ body: '', contentType: 'text/css' });
  });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const ev = (f, a) => page.evaluate(f, a); const wait = ms => page.waitForTimeout(ms);
  const sb = () => ev(() => { const st = JSON.parse(localStorage.getItem('fakesb') || '{}'); return Object.fromEntries(Object.entries(st).map(([c, m]) => [c, Object.keys(m).length])); });
  const pickIn = async (loc, text, exact) => { await loc.click(); await loc.fill(''); await loc.type(text, { delay: 5 }); await wait(120); const o = exact ? page.locator('.cbx-pop .cbx-opt', { hasText: exact }).first() : page.locator('.cbx-pop .cbx-opt').first(); await o.waitFor({ timeout: 3000 }); await o.dispatchEvent('mousedown'); await wait(150); };
  try {
    await page.goto('https://ordertrack.vercel.test/'); await page.waitForSelector('#view .view-in', { timeout: 15000 }); await wait(1200);
    ok('B1 backend connects to Supabase with the publishable key', await ev(() => window.__sbCreated && window.__sbCreated.url === 'https://pugkpvtdcnpwrvmtbamz.supabase.co'));
    ok('B2 header shows Live · shared database', /Live/.test(await page.locator('#conn').innerText()));
    const s0 = await sb(); ok('B3 empty database gets default masters + workflow templates', s0.masters >= 8 && s0.templates === 2, JSON.stringify(s0));
    ok('B4 "Load order sheet data" offered on empty database', await page.locator('[data-act="loadSeed"]').count() === 1);
    await page.click('[data-act="loadSeed"]'); await page.waitForSelector('#imp .kvs', { timeout: 30000 });
    const t = await page.locator('#imp').innerText(); ok('C1 seed sheet parsed: 793 orders, 972 product lines', /793/.test(t) && /972/.test(t), t.replace(/\s+/g, ' ').slice(0, 160));
    await page.screenshot({ path: path.join(OUT, 'c1-import.png') });
    const t0 = Date.now(); await page.locator('.modal footer button', { hasText: 'Import orders' }).click();
    await page.waitForFunction(() => S.orders.length >= 793 && S.batches.length >= 972, null, { timeout: 120000 }); await wait(1500);
    const s1 = await sb(); const st = await ev(() => window.__sbStats);
    ok('C2 all orders + started workflows written to Supabase', s1.orders === 793 && s1.projects === 793 && s1.batches === 986, JSON.stringify(s1) + ` in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    ok('C3 writes batched (few requests for ~2,600 records)', st.upserts < 60, `${st.upserts} upsert requests, ${st.rows} rows`);
    const m = await ev(() => ({ c: M('customers').length, p: M('products').length, ports: M('ports').length })); ok('C4 masters built from the sheet', m.c === 367 && m.p === 331 && m.ports >= 60, JSON.stringify(m));
    ok('C5 seed offer gone once data exists', await page.locator('[data-act="loadSeed"]').count() === 0);
    // reload: everything comes back from the database
    await page.reload(); await page.waitForFunction(() => S.orders.length >= 793, null, { timeout: 30000 }); await wait(800);
    const fid = await ev(() => { const its = S.orders.flatMap(o => o.items); const ph = {}; S.batches.forEach(b => { const k = phaseLabel(b); ph[k] = (ph[k] || 0) + 1; });
      return { rows: its.filter(i => i.row).length, coa: its.filter(i => i.row && i.row.coaDate !== '').length, bno: its.filter(i => i.row && i.row.batchNo !== '').length, ready: its.filter(i => i.row && /^ready$/i.test(i.row.plannedReady)).length,
        sheetIds: S.batches.filter(b => /^\d{2}[A-Z]{3,6}\d{2,4}/.test(b.id)).length, coaRel: S.batches.filter(b => b.coa.status === 'Released').length, disp: S.batches.filter(b => b.shipments.some(x => x.status === 'Dispatched')).length, hold: S.projects.filter(p => p.status === 'On Hold').length, awaited: S.orders.filter(o => o.materialStatus === 'Awaited').length, ph }; });
    const SD = JSON.parse(fs.readFileSync(path.join(__dirname, 'sheet-dates.json')));
    const bad = await ev(SD => { const b = []; S.orders.forEach(o => { const e = SD[`${o.poNo}|${o.soNo || ''}`.toLowerCase()]; if (!e) return; ['poDate', 'soDate', 'exPlant', 'rowDelivery'].forEach(k => { if (e[k] && o[k] !== e[k]) b.push(`${o.poNo} ${k} ${o[k]} vs ${e[k]}`); }); }); return b; }, SD);
    ok('C5 dates exactly as in the sheet (PO, SO, ex-plant, raw delivery) in IST', bad.length === 0, bad.length + ' mismatches ' + bad.slice(0, 3).join('; '));
    ok('C4 every sheet row kept with its own values; stages follow the sheet', fid.rows === 972 && fid.coa === 72 && fid.bno === 312 && fid.sheetIds > 250 && fid.coaRel > 50 && fid.disp >= 3, JSON.stringify(fid));
    ok('D1 after reload, data loads from Supabase', await ev(() => S.orders.length === 793 && S.batches.length === 986 && S.projects.length === 793));
    await page.click('[data-nav="ppc"]'); await wait(800); ok('D2 PPC lists the sheet orders', await page.locator('#view tbody tr.click').count() > 100);
    await page.screenshot({ path: path.join(OUT, 'd2-ppc.png') });
    // edit from the dashboard
    const oid = await ev(() => S.orders.find(o => o.items.length > 1).id);
    await ev(id => OPEN.order(id), oid); await wait(400); await page.fill('.modal [data-k="planRemarks"]', 'Edited on the website — priority'); await page.click('#saveOrder'); await wait(800);
    const saved = await ev(id => JSON.parse(localStorage.getItem('fakesb')).orders[id].planRemarks, oid); ok('E1 edit on the website is saved to Supabase', saved === 'Edited on the website — priority', saved);
    // edit made directly in Supabase shows up live
    await ev(id => { const st = JSON.parse(localStorage.getItem('fakesb')); const d = st.orders[id]; d.customer = d.customer + ' (edited in Supabase)'; __sbExternal('UPDATE', { collection: 'orders', id, data: d }); }, oid); await wait(400);
    ok('E2 change made in Supabase appears live on the dashboard', await ev(id => /edited in Supabase/.test(O(id).customer), oid));
    // delete an order
    const del = await ev(() => { const o = S.orders.find(o => o.projectId && pBatches(o.projectId).length); return { id: o.id, po: o.poNo, pid: o.projectId, bs: pBatches(o.projectId).map(b => b.id) }; });
    await ev(pid => OPEN.project(pid), del.pid); await wait(400); await page.click('.dh-bar [data-act="deleteOrder"]'); await wait(300);
    await page.fill('#delConfirm', 'wrong'); await page.click('#delYes'); await wait(200); ok('F1 delete needs the exact PO number', await ev(id => !!O(id), del.id));
    await page.fill('#delConfirm', del.po); await page.click('#delYes'); await page.waitForFunction(d => { const st = JSON.parse(localStorage.getItem('fakesb')); return !st.orders[d.id]; }, del, { timeout: 15000 }).catch(() => { }); await wait(500);
    const after = await ev(d => { const st = JSON.parse(localStorage.getItem('fakesb')); return { o: !!st.orders[d.id], p: !!st.projects[d.pid], b: d.bs.some(b => st.batches[b]) }; }, del);
    ok('F2 deleting removes the order, its project and batches from Supabase', !after.o && !after.p && !after.b, JSON.stringify(after));
    // AI assistant through api/ai.js → OpenAI gpt-4.1
    const anyPo = await ev(() => S.orders.find(o => o.projectId && /^[A-Za-z0-9\/-]+$/.test(o.poNo)).poNo);
    await page.click('[data-nav="assistant"]'); await wait(300); await page.fill('#chatI', `What is the status of PO ${anyPo}?`); await page.press('#chatI', 'Enter');
    await page.waitForFunction(() => !CHAT_BUSY, null, { timeout: 20000 }); await wait(200);
    const ans = await page.locator('#msgs .msg.a').last().innerText(); const c0 = openaiCalls[0] || { body: {} };
    ok('G1 assistant uses gpt-4.1 with your key, tools, and live data', c0.body.model === 'gpt-4.1' && c0.auth === 'Bearer sk-test-sudeep-123' && (c0.body.tools || []).some(t => t.function.name === 'get_order') && ans.includes(anyPo), ans.slice(0, 140));
    // PDF autofill: the PDF itself goes to gpt-4.1
    await page.click('[data-nav="orders"]'); await wait(300); await page.click('[data-act="newOrder"]'); await wait(300);
    await page.setInputFiles('#pdfIn', path.join(__dirname, 'test-po-v.pdf')); await page.waitForSelector('#pdfStatus .alert', { timeout: 20000 }); await wait(200);
    const pc = openaiCalls[openaiCalls.length - 1].body;
    ok('H1 PO PDF sent to gpt-4.1 as a file (JSON mode)', pc.model === 'gpt-4.1' && pc.response_format.type === 'json_object' && pc.messages[0].content.some(p => p.type === 'file'));
    const md = page.locator('.modal'); const codes = await ev(() => [...document.querySelectorAll('.modal .itemrow [data-ik="productCode"]')].map(i => i.dataset.val));
    ok('H2 fields filled from the PDF', (await md.locator('[data-k="poNo"]').inputValue()) === 'PO/TEST/7781' && (await md.locator('[data-k="customer"]').getAttribute('data-val')) === X.customer && codes[0] === X.p1 && codes[1] === X.p2 && codes[2] === '', codes.join(','));
    await page.screenshot({ path: path.join(OUT, 'h2-pdf.png') });
    await md.locator('.itemrow').nth(2).locator('[data-rmitem]').click(); for (const i of [0, 1]) await pickIn(md.locator('.itemrow').nth(i).locator('[data-ik="line"]'), 'PR1', 'PR1'); await md.locator('[data-k="rowDelivery"]').fill('2026-11-28');
    await md.locator('#saveOrder').click(); await page.waitForFunction(() => S.orders.some(o => o.poNo === 'PO/TEST/7781'), null, { timeout: 10000 }).catch(() => { }); await wait(800);
    const up = await ev(() => window.__sbStats.uploads); ok('H3 PDF stored in Supabase Storage bucket "ordertrack" and attached', up.some(u => u.b === 'ordertrack' && /pdf/.test(u.type)) && await ev(() => (S.orders.find(o => o.poNo === 'PO/TEST/7781').docs || []).some(d => /supabase\.co\/storage/.test(d.url))));
    // export in sheet layout
    await page.click('[data-nav="orders"]'); await wait(300);
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('[data-act="exportSheet"]')]);
    const fp = path.join(OUT, dl.suggestedFilename()); await dl.saveAs(fp);
    const XLSX = require('xlsx'); const wb = XLSX.readFile(fp); const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
    ok('I1 Export order sheet downloads with the sheet\'s columns, one row per product', aoa[0][0] === 'MONTH' && aoa[0].includes('Raw Delivery Date') && aoa[0].includes('Open/Dispatch/Closed/Onhold') && aoa.length - 1 >= 970, `${aoa.length - 1} rows, ${aoa[0].length} columns`);
    ok('J1 no script errors', !errs.length, errs.slice(0, 3).join(' | '));
  } catch (e) { ok('crash', false, e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, 'crash.png') }).catch(() => { }); }
  await browser.close();
  const f = results.filter(r => !r.pass); console.log(`\n${results.length - f.length}/${results.length} checks passed`);
})();
