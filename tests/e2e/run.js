/* OrderTrack v2 — end-to-end test suite.
   Runs the real page (index.html + app.js) in Chromium against the exported live database
   through an in-memory stand-in for the claude.ai shared database, AI and uploads. */
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '../..'), NM = path.join(__dirname, 'node_modules');
const OUT = path.join(__dirname, 'out'); fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT);
const ONLY = process.argv[2] || '';

// ---------- seed: exported live DB + masters the new version expects ----------
const SEED = process.env.OT_SEED || path.join(__dirname, 'seed', 'ordertrack-database.json');
if (!fs.existsSync(SEED)) { console.error(`Seed data not found: ${SEED}\nExport the database to JSON (see docs/INTEGRATION.md) and set OT_SEED=/path/to/ordertrack-database.json`); process.exit(2); }
const exp = JSON.parse(fs.readFileSync(SEED, 'utf8'));
const store = {}; ['orders', 'projects', 'batches', 'templates', 'activity'].forEach(c => { store[c] = {}; exp[c].forEach(d => { const x = Object.assign({}, d); store[c][x.id] = x; }); });
store.masters = {}; exp.masters.forEach(m => { store.masters[m.id] = { items: m.items }; });
store.masters.ports = { items: [...new Set(exp.orders.map(o => o.port).filter(Boolean))].map(n => ({ name: n })) };
store.remarks = {};
store.masters.settings = { items: [{ auto: true }] }; // will be switched back on in the live data at publish
const PDFX = JSON.parse(fs.readFileSync(path.join(__dirname, 'pdf-expect.json')));

const html = '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + fs.readFileSync(path.join(ROOT, 'src', 'page.html'), 'utf8') + '</body></html>';
const LIB = { 'chart.umd.min.js': 'chart.js/dist/chart.umd.js', 'xlsx.full.min.js': 'xlsx/dist/xlsx.full.min.js', 'jspdf.umd.min.js': 'jspdf/dist/jspdf.umd.min.js', 'jspdf.plugin.autotable.min.js': 'jspdf-autotable/dist/jspdf.plugin.autotable.min.js', 'pdf.min.js': 'pdfjs-dist/build/pdf.min.js', 'pdf.worker.min.js': 'pdfjs-dist/build/pdf.worker.min.js' };

const results = []; let page, ctx, browser, consoleErrors = [];
const ok = (name, cond, detail = '') => { results.push({ name, pass: !!cond, detail }); console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); return !!cond; };
async function test(name, fn) { if (ONLY && !ONLY.split(',').some(o => name.startsWith(o))) return; try { await fn(); } catch (e) { ok(name + ' (crashed)', false, e.message.split('\n')[0]); await page.screenshot({ path: path.join(OUT, name.replace(/\W+/g, '_') + '.png') }).catch(() => { }); } }
const wait = ms => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
async function nav(v) { await page.click(`[data-nav="${v}"]`); await wait(250); }
async function pickIn(inputLoc, text, exact) {
  await inputLoc.click(); await inputLoc.fill(''); await inputLoc.type(text, { delay: 5 }); await wait(120);
  const opt = exact ? page.locator('.cbx-pop .cbx-opt', { hasText: exact }).first() : page.locator('.cbx-pop .cbx-opt').first();
  await opt.waitFor({ timeout: 3000 }); await opt.dispatchEvent('mousedown'); await wait(150);
}
const fakeDB = () => ev(() => JSON.parse(localStorage.getItem('fakedb')));
const closeModals = () => ev(() => { document.querySelectorAll('#layer .modal,#layer .scrim.top').forEach(x => x.remove()); modalStack = []; closePop(); });

async function setup(opts = {}) {
  browser = browser || await chromium.launch();
  ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Calcutta' });
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.host === 'ordertrack.test') { if (u.pathname === '/app.js') return r.fulfill({ body: fs.readFileSync(path.join(ROOT, 'public', 'app.js')), contentType: 'text/javascript' }); return r.fulfill({ body: html, contentType: 'text/html' }); }
    if (u.host === 'cdnjs.cloudflare.com') { const f = LIB[path.basename(u.pathname)]; return f ? r.fulfill({ body: fs.readFileSync(path.join(NM, f)), contentType: 'text/javascript' }) : r.abort(); }
    return r.fulfill({ body: '', contentType: 'text/css' });
  });
  await ctx.addInitScript(([seed, local, PDFX]) => {
    if (local) return;
    if (!localStorage.getItem('fakedb')) localStorage.setItem('fakedb', seed);
    const st = JSON.parse(localStorage.getItem('fakedb')); const L = {};
    const save = () => localStorage.setItem('fakedb', JSON.stringify(st));
    const snap = c => { const docs = Object.entries(st[c] || {}).map(([id, d]) => ({ id, exists: true, data: () => d, metadata: {} })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }; };
    const notify = c => setTimeout(() => (L[c] || []).forEach(f => f(snap(c))), 5);
    window.__fakeWrite = (c, id, d) => { (st[c] = st[c] || {})[id] = d; save(); notify(c); };
    const q = c => ({ limit: () => q(c), orderBy: () => q(c), where: () => q(c), get: async () => snap(c), onSnapshot(fn) { (L[c] = L[c] || []).push(fn); setTimeout(() => fn(snap(c)), 10); return () => { }; },
      doc: id => ({ set: async d => { (st[c] = st[c] || {})[id] = JSON.parse(JSON.stringify(d)); save(); notify(c); }, delete: async () => { delete (st[c] || {})[id]; save(); notify(c); }, get: async () => ({ id, exists: !!(st[c] || {})[id], data: () => (st[c] || {})[id] }) }) });
    const db = { collection: q, doc: p => q(p.split('/')[0]).doc(p.split('/')[1]) };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function sample(input, opts) {
      const q0 = Array.isArray(input) ? input[input.length - 1].content : input; const tools = opts.tools || [];
      const qq = q0.split('Question:').pop(); const po = (qq.match(/PO\s+(\S+?)\??$/) || [])[1];
      let txt;
      if (po) { const t = tools.find(x => x.name === 'get_order'); const r = await t.execute({ po_or_so: po }); txt = `**${r.summary.order}** for ${r.summary.customer} is ${r.summary.status}; ${r.batches.length} batch(es): ` + r.batches.map(b => `${b.batch} at ${b.current_stage}`).join(', '); }
      else { const t = tools.find(x => x.name === 'plant_summary'); const r = await t.execute({}); txt = `Orders active: ${r.orders.Active}. Batches in rework: ${r.batches_in_rework.map(b => b.batch + ' (' + b.order + ')').join(', ') || 'none'}.`; }
      opts.onText && opts.onText({ text: txt, delta: txt }); window.__lastAnswer = txt; return { text: txt, truncated: false };
    }
    sample.json = async (prompt, opts) => { window.__pdfPrompt = prompt; await sleep(50); if (!/PO\/TEST\/7781/.test(prompt)) return {}; return { poNo: 'PO/TEST/7781', poDate: '2026-11-01', soNo: '55210', soDate: '', customer: PDFX.customer, shipToName: PDFX.customer, rawDeliveryDate: '2026-11-28', incoterms: PDFX.inco, paymentTerms: PDFX.pay, port: '', shipmentType: '', containerSize: '', salesPerson: '', orderType: '', remarks: 'COA required with every batch.', items: [{ productCode: PDFX.p1, qtyKg: 2000, packing: PDFX.pack }, { productCode: PDFX.p2, qtyKg: 1500 }, { productCode: 'ZZZ-UNKNOWN-9', productName: 'Mystery Compound X', qtyKg: 500 }] }; };
    sample.limits = async () => ({ images: null });
    window.claude = { use: async n => n === 'db' ? db : n === 'sample' ? sample : n === 'downloads' ? { save: async r => { window.__lastDownload = r.filename; return {}; } } : n === 'assets' ? { upload: async f => ({ id: 'a' + Math.random().toString(36).slice(2), url: '#asset', sizeBytes: f.size, contentType: f.type }), list: async () => ({ assets: [] }) } : null };
  }, [JSON.stringify(store), !!opts.local, PDFX]);
  page = await ctx.newPage(); consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  await page.goto('https://ordertrack.test/#overview');
  await page.waitForSelector(opts.local ? '#view .view-in' : '.kpi', { timeout: 15000 }); await wait(400);
}

(async () => {
  await setup();
  // ======================================================================
  await test('01 Nav: Planning + Workflow removed, PPC renamed', async () => {
    const navs = await ev(() => [...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav + '|' + b.title));
    ok('01a no Production Planning / Workflow in sidebar', !navs.some(n => /planning\||workflow\|/.test(n.split('|')[0])) && !navs.some(n => /Production Planning|^workflow/i.test(n)), navs.join(', '));
    ok('01b PPC entry named "Project Planning & Control (PPC)"', navs.includes('ppc|Project Planning & Control (PPC)'));
    ok('01c exactly 9 modules', navs.length === 9, String(navs.length));
  });
  await test('02 Orders: New orders tab removed', async () => {
    await nav('orders'); const tabs = await ev(() => [...document.querySelectorAll('.tabs [data-ftab]')].map(b => b.textContent.trim()));
    ok('02a tabs', !tabs.some(t => /new/i.test(t)) && tabs.length === 4, tabs.join(' / '));
    ok('02b legacy orders visible in Open tab', await page.locator('#view tbody tr.click').count() > 0);
  });
  await test('03 Searchable filters everywhere', async () => {
    let bad = [];
    for (const v of ['overview', 'orders', 'ppc', 'manufacturing', 'qc', 'qa', 'dispatch', 'masters']) { await nav(v); const n = await ev(() => document.querySelectorAll('#view select').length); const nf = await ev(() => [...document.querySelectorAll('#view .filters label.f')].filter(l => !l.querySelector('[data-cbx]') && !l.querySelector('input[type=date]')).length); if (n || nf) bad.push(`${v}: ${n} select, ${nf} non-search filter`); }
    ok('03a no plain dropdowns in any page', !bad.length, bad.join('; '));
    await nav('orders'); const custIn = page.locator('.filters [data-flt="orders:cust"]'); const anyCust = await ev(() => S.orders[0].customer);
    const before = await page.locator('#view tbody tr.click').count();
    await pickIn(custIn, anyCust.slice(0, 6), anyCust); const after = await page.locator('#view tbody tr.click').count();
    const shown = await ev(() => [...document.querySelectorAll('#view tbody tr.click td:nth-child(5)')].map(td => td.textContent));
    ok('03b typing in filter searches + filters rows', after > 0 && after <= before && shown.every(t => t.includes(anyCust)), `${before} → ${after}`);
    await page.click('[data-act="clearFlt"]'); await wait(200);
  });
  await test('04 Punch multi-product order (master-only fields)', async () => {
    await nav('orders'); await page.click('[data-act="newOrder"]'); await wait(300);
    const md = page.locator('.modal'); const txt = await md.innerText();
    ok('04a "Raw Delivery Date" label, no "Row Delivery"', /Raw Delivery Date/.test(txt) && !/Row Delivery/i.test(txt));
    ok('04b PDF upload offered', await md.locator('#pdfIn').count() === 1);
    const custIn = md.locator('[data-k="customer"]');
    ok('04c customer is searchable dropdown', !!(await custIn.getAttribute('data-cbx')));
    await custIn.click(); await custIn.fill('My Own Typed Customer Ltd'); await page.keyboard.press('Escape'); await md.locator('[data-k="poNo"]').click(); await wait(250);
    ok('04d free text not in Master Data is rejected', (await custIn.inputValue()) === '' && (await custIn.getAttribute('data-val')) === '', await custIn.inputValue());
    await md.locator('[data-k="poNo"]').fill('PO/E2E/1001'); await md.locator('[data-k="soNo"]').fill('90001');
    const cust = store.masters.customers.items.find(c => c.location) || store.masters.customers.items[0];
    await pickIn(custIn, cust.name.slice(0, 8), cust.name);
    ok('04e customer pick fills location from master', (await md.locator('[data-k="location"]').inputValue()) === (cust.location || ''), await md.locator('[data-k="location"]').inputValue());
    await pickIn(md.locator('[data-k="unit"]'), 'PR3', 'PR3'); await pickIn(md.locator('[data-k="salesPerson"]'), store.masters.salespersons.items[0].name.slice(0, 4), store.masters.salespersons.items[0].name);
    const p1 = store.masters.products.items[0], p2 = store.masters.products.items[4];
    const row1 = md.locator('.itemrow').nth(0);
    await row1.locator('[data-ik="productCode"]').fill('NOPE-123'); await md.locator('[data-k="poNo"]').click(); await wait(250);
    ok('04f product code must exist in master', (await row1.locator('[data-ik="productCode"]').getAttribute('data-val')) === '');
    await pickIn(row1.locator('[data-ik="productCode"]'), p1.name.slice(0, 10), p1.code);
    ok('04g product name + grade auto-filled, read-only', (await row1.locator('[data-ik="productName"]').inputValue()) === p1.name && (await row1.locator('[data-ik="grade"]').inputValue()) === (p1.grade || '') && (await row1.locator('[data-ik="productName"]').getAttribute('readonly')) !== null);
    await row1.locator('[data-ik="poQty"]').fill('3000');
    ok('04h production line defaulted from unit', (await row1.locator('[data-ik="line"]').getAttribute('data-val')) === 'PR3');
    await md.locator('#addItem').click(); const row2 = md.locator('.itemrow').nth(1);
    await pickIn(row2.locator('[data-ik="productCode"]'), p2.code, p2.code); await row2.locator('[data-ik="poQty"]').fill('4000');
    await pickIn(row2.locator('[data-ik="tplId"]'), 'Export', 'Export with sampling'); await pickIn(row2.locator('[data-ik="line"]'), 'PR5', 'PR5'); await row2.locator('[data-ik="nBatches"]').fill('2');
    await pickIn(row2.locator('[data-ik="packing"]'), 'JUMBO', 'JUMBO BAG');
    await md.locator('[data-k="rowDelivery"]').fill('2026-12-05');
    await pickIn(md.locator('[data-k="port"]'), store.masters.ports.items[0].name.slice(0, 4), store.masters.ports.items[0].name);
    await md.locator('[data-k="planRemarks"]').fill('Priority customer — plan PR3 first');
    await page.screenshot({ path: path.join(OUT, '04-punch-form.png') });
    await md.locator('#saveOrder').click(); await wait(500);
    const o = await ev(() => { const o = S.orders.find(x => x.poNo === 'PO/E2E/1001'); if (!o) return null; const bs = S.batches.filter(b => b.projectId === o.projectId); return { items: o.items.length, pid: o.projectId, bs: bs.map(b => ({ id: b.id, item: b.itemId, line: b.line, qty: b.qty, tpl: b.tplId, stages: b.stages.map(s => s.name), phase: phaseKey(b) })) }; });
    ok('04i order saved with 2 products and went live (no confirm step)', o && o.items === 2 && !!o.pid, JSON.stringify(o && { items: o.items, pid: !!o.pid }));
    ok('04j product 1 → 1 batch on PR3, standard flow', o && o.bs.filter(b => b.item === 'L1').length === 1 && o.bs.find(b => b.item === 'L1').line === 'PR3' && o.bs.find(b => b.item === 'L1').qty === 3000);
    const b2 = o ? o.bs.filter(b => b.item === 'L2') : [];
    ok('04k product 2 → 2 batches on PR5 with its own workflow', b2.length === 2 && b2.every(b => b.line === 'PR5' && b.stages.includes('Customer Sampling')) && b2[0].qty + b2[1].qty === 4000, JSON.stringify(b2.map(b => [b.line, b.qty])));
    ok('04l batches start at Material In', o && o.bs.every(b => b.phase === 'material'));
    const db = await fakeDB(); ok('04m written to shared database', !!Object.values(db.orders).find(x => x.poNo === 'PO/E2E/1001') && Object.values(db.batches).filter(b => b.projectId === o.pid).length === 3);
    ok('04n planning remark posted to Remarks with department', Object.values(db.remarks).some(r => r.projectId === o.pid && r.dept === 'Planning' && /Priority customer/.test(r.text)));
    await nav('orders'); ok('04o duplicate PO + SO blocked', await (async () => { await page.click('[data-act="newOrder"]'); const m = page.locator('.modal'); await m.locator('[data-k="poNo"]').fill('PO/E2E/1001'); await m.locator('[data-k="soNo"]').fill('90001'); await pickIn(m.locator('[data-k="customer"]'), cust.name.slice(0, 8), cust.name); await m.locator('[data-k="rowDelivery"]').fill('2026-12-05'); const r = m.locator('.itemrow').first(); await pickIn(r.locator('[data-ik="productCode"]'), p1.code, p1.code); await r.locator('[data-ik="poQty"]').fill('10'); await pickIn(r.locator('[data-ik="line"]'), 'PR1', 'PR1'); await m.locator('#saveOrder').click(); await wait(300); const still = await page.locator('.modal').count(); await closeModals(); return still === 1 && (await ev(() => S.orders.filter(x => x.poNo === 'PO/E2E/1001').length)) === 1; })());
  });
  await test('05 PPC page traced by PO/SO, multi-product', async () => {
    await nav('ppc'); const t = await page.locator('#title').innerText(); ok('05a page title', t === 'Project Planning & Control (PPC)', t);
    const pid = await ev(() => S.orders.find(x => x.poNo === 'PO/E2E/1001').projectId);
    await page.click(`tr[data-row="project:${pid}"]`); await wait(300);
    const head = await page.locator('.dh-bar').innerText(); ok('05b drawer headed by PO + SO', /PO PO\/E2E\/1001/.test(head) && /SO 90001/.test(head), head.split('\n').slice(0, 3).join(' | '));
    const tabs = await ev(() => [...document.querySelectorAll('[data-ptab]')].map(b => b.dataset.ptab)); ok('05c Remarks tab present', tabs.includes('remarks'), tabs.join(','));
    await page.click('[data-ptab="products"]'); await wait(200); const prodTxt = await page.locator('.dbody').innerText();
    ok('05d products tab shows each product with its workflow + batches', (prodTxt.match(/Add batch/g) || []).length === 2 && /Export with sampling/i.test(prodTxt) && /Standard flow/i.test(prodTxt));
    await page.click('[data-ptab="workflow"]'); await wait(200); ok('05e workflow grouped per product', await page.locator('.prodgrp').count() === 2);
    await page.screenshot({ path: path.join(OUT, '05-ppc-workflow.png') });
    await page.click('.dh-bar [data-dclose]'); await wait(200);
  });
  await test('06 No internal project numbers shown anywhere', async () => {
    const hits = [];
    for (const v of ['overview', 'orders', 'ppc', 'manufacturing', 'qc', 'qa', 'dispatch', 'assistant']) { await nav(v); const m = (await page.locator('#view').innerText()).match(/PRJ-\d+/g); if (m) hits.push(v + ':' + m[0]); }
    await nav('ppc'); const pids = await ev(() => S.projects.filter(p => O(p.orderId)).slice(0, 6).map(p => p.id));
    for (const pid of pids) { for (const tb of ['overview', 'products', 'workflow', 'quality', 'dispatch', 'remarks', 'history']) { await ev(([pid, tb]) => { PTAB = tb; drawerFn = () => projectDrawer(pid); renderDrawer(); }, [pid, tb]); const m = (await page.locator('.drawer').innerText()).match(/PRJ-\d+/g); if (m) hits.push(pid + '/' + tb + ':' + m[0]); } }
    await ev(() => closeDrawer());
    ok('06a no PRJ- numbers in any page, tab, history or activity', !hits.length, hits.slice(0, 5).join(', '));
  });
  await test('07 Manufacturing: list-first, no charts, column filters', async () => {
    await nav('manufacturing'); ok('07a no charts', await page.locator('#view canvas').count() === 0);
    ok('07b slim count strip, no KPI cards', await page.locator('#view .strip').count() === 1 && await page.locator('#view .kpi').count() === 0);
    await page.click('[data-ftab="mfg:all"]'); await wait(200);
    ok('07c column filter row', await page.locator('#view thead .cf-row [data-tcf]').count() >= 6);
    const before = await page.locator('#view tbody tr.click').count();
    const lineCol = await ev(() => [...document.querySelectorAll('#view thead tr:first-child th')].findIndex(th => th.textContent.trim().startsWith('Line')));
    await pickIn(page.locator(`#view thead .cf-row th:nth-child(${lineCol + 1}) [data-tcf]`), 'PR5', 'PR5');
    const lines = await ev(i => [...document.querySelectorAll('#view tbody tr.click')].map(tr => tr.children[i].textContent.trim()), lineCol);
    ok('07d column filter narrows list', lines.length > 0 && lines.length < before && lines.every(l => l === 'PR5'), `${before} → ${lines.length}`);
    await page.click('[data-cfclear]'); await wait(150);
  });
  await test('08 Workflow templates live in Master Data', async () => {
    await nav('masters'); await page.click('[data-mtype="_templates"]'); await wait(300);
    ok('08a builder present in masters', await page.locator('#tplB .palette .chip').count() > 5);
    await pickIn(page.locator('#tplSel'), 'New', '+ New template'); await wait(200);
    await page.fill('#tplName', 'Fast domestic'); await page.locator('#tplB .bstg').filter({ hasText: 'QA' }).locator('[data-rm]').click(); await wait(100);
    await page.locator('#tplB [data-new="Rework"]').click(); await wait(100); await page.locator('#tplB .bstg').filter({ hasText: 'Rework' }).locator('[data-rm]').click();
    await page.click('[data-act="tplSave"]'); await wait(300);
    const t = await ev(() => S.templates.find(x => x.name === 'Fast domestic')); ok('08b new template saved without QA', t && !t.stages.some(s => s.name === 'QA') && t.stages.length === 7, t && t.stages.map(s => s.name).join('>'));
    await nav('orders'); await page.click('[data-act="newOrder"]'); await page.locator('.itemrow [data-ik="tplId"]').click(); await wait(150);
    ok('08c new template offered per product in order punch', await page.locator('.cbx-pop .cbx-opt', { hasText: 'Fast domestic' }).count() === 1);
    await closeModals();
  });
  await test('09 Full flow with rework line driving + auto schedule + department NEW', async () => {
    const pid = await ev(() => S.orders.find(x => x.poNo === 'PO/E2E/1001').projectId);
    const bid = await ev(pid => S.batches.find(b => b.projectId === pid && b.itemId === 'L1').id, pid);
    const pl0 = await ev(bid => B(bid).stages.map(s => s.planned), bid);
    // Manufacturing: material received
    await ev(() => { LS.set('ot-seen-qc', '2000-01-01'); LS.set('ot-seen-manufacturing', '2000-01-01'); LS.set('ot-seen-qa', '2000-01-01'); });
    await nav('manufacturing'); await page.click('[data-ftab="mfg:material"]'); await wait(150);
    ok('09a new batch appears for Manufacturing as NEW', await page.locator(`tr[data-row="mfgb:${bid}"] .newchip`).count() === 1);
    await page.click(`tr[data-row="mfgb:${bid}"]`); await wait(250); await page.click('#matIn'); await wait(250);
    const pl1 = await ev(bid => B(bid).stages.map(s => s.planned), bid);
    const delta = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
    ok('09b auto-schedule: material done early → later stages pulled in', delta(pl0[2], pl1[2]) === delta(pl0[1], new Date().toISOString().slice(0, 10)) || delta(pl0[2], pl1[2]) !== 0, `mfg planned ${pl0[2]} → ${pl1[2]}`);
    ok('09c next stage auto In Progress', await ev(bid => curStage(B(bid)).type + ':' + curStage(B(bid)).status, bid) === 'mfg:progress');
    await page.fill('#f_pqty', '3000'); await page.fill('#f_mfgDetails', 'Shift A completed full batch'); await page.click('#saveProd'); await wait(300);
    ok('09d full production → batch moves to QC automatically', await ev(bid => phaseKey(B(bid)), bid) === 'qc');
    const qcBadge = await ev(() => document.querySelector('[data-nav="qc"] .cnt.hot')?.textContent || ''); ok('09e QC sidebar shows "new" badge', /new/.test(qcBadge), qcBadge);
    await nav('qc'); ok('09f QC queue shows the batch marked NEW', await page.locator(`tr[data-row="qcb:${bid}"] .newchip`).count() === 1);
    await page.screenshot({ path: path.join(OUT, '09-qc-new.png') });
    await page.click(`tr[data-row="qcb:${bid}"]`); await wait(250); await page.click('[data-addtest="std"]'); await wait(250);
    const rows = page.locator('#qct tr[data-tid]'); const n = await rows.count();
    for (let i = 0; i < n; i++) { const r = rows.nth(i); await r.locator('[data-t="result"]').fill(i === 0 ? '96.8' : 'Complies'); await pickIn(r.locator('[data-t="status"]'), i === 0 ? 'Fail' : 'Pass', i === 0 ? 'Failed' : 'Passed'); }
    await rows.nth(0).locator('[data-t="analysis"]').fill('Assay below 98.0%');
    await page.click('#qcFail'); await wait(400);
    ok('09g rework form opens from QC', await page.locator('#rwCreate').count() === 1);
    await pickIn(page.locator('.modal [data-k="by"]'), 'Neha', 'Dr. Neha Shah'); await page.fill('.modal [data-k="reason"]', 'Assay 96.8% below spec — reprocess');
    const seqTxt = await page.locator('#rwBuilder .drop').innerText(); ok('09h rework sequence prefilled (line → QC → … → completion)', /PR3/.test(seqTxt) && /QC/.test(seqTxt) && /Dispatch/.test(seqTxt) && /Project Completion/.test(seqTxt), seqTxt.replace(/\s+/g, ' ').slice(0, 120));
    await page.click('#rwCreate'); await wait(400);
    const st = await ev(bid => { const b = B(bid); return { phase: phaseKey(b), label: phaseLabel(b), drive: drivingRW(b).id, cur: curStage(b).name + ':' + curStage(b).status, mainQC: b.stages.find(s => s.type === 'qc').status }; }, bid);
    ok('09i RW1 now drives the batch, starts at manufacturing', st.drive === 'RW1' && st.phase === 'mfg' && st.cur === 'PR3:progress' && st.mainQC === 'rejected', JSON.stringify(st));
    const mfgBadge = await ev(() => document.querySelector('[data-nav="manufacturing"] .cnt.hot')?.textContent || '');
    ok('09j0 Manufacturing sidebar flags the reworked batch as new', /new/.test(mfgBadge), mfgBadge);
    await nav('manufacturing'); await page.click('[data-ftab="mfg:prod"]'); await wait(200);
    ok('09j1 marked NEW in Manufacturing list', await page.locator(`tr[data-row="mfgb:${bid}"] .newchip`).count() === 1);
    await page.screenshot({ path: path.join(OUT, '09-mfg-rework-new.png') });
    ok('09j reworked batch shown to Manufacturing (In production, RW1 tag)', await page.locator(`tr[data-row="mfgb:${bid}"]`).count() === 1 && /RW1/.test(await page.locator(`tr[data-row="mfgb:${bid}"]`).innerText()), mfgBadge);
    await page.click(`tr[data-row="mfgb:${bid}"]`); await wait(250); await page.fill('#f_pqty', '3000'); await page.click('#saveProd'); await wait(300);
    ok('09k rework reprocess complete → back to QC on RW1 line', await ev(bid => phaseKey(B(bid)) + '|' + drivingRW(B(bid)).id, bid) === 'qc|RW1');
    ok('09l original production quantity not double-counted', await ev(bid => B(bid).produced, bid) === 3000);
    await nav('qc'); await page.click(`tr[data-row="qcb:${bid}"]`); await wait(250);
    for (let i = 0; i < n; i++) { const r = page.locator('#qct tr[data-tid]').nth(i); if (i === 0) await r.locator('[data-t="result"]').fill('99.2'); await pickIn(r.locator('[data-t="status"]'), 'Pass', 'Passed'); }
    await page.click('#qcDone'); await wait(300);
    ok('09m QC pass on RW1 → QA', await ev(bid => phaseKey(B(bid)), bid) === 'qa');
    await nav('qa'); ok('09n QA queue shows batch NEW', await page.locator(`tr[data-row="qab:${bid}"] .newchip`).count() === 1);
    await page.click(`tr[data-row="qab:${bid}"]`); await wait(250); await pickIn(page.locator('.modal [data-k="by"]'), 'Arvind', 'Arvind Mehta'); await page.fill('.modal [data-k="observations"]', 'Re-test results reviewed, OK to release');
    await page.click('#qaApprove'); await wait(300);
    ok('09o QA approved → Ready for Dispatch', await ev(bid => phaseKey(B(bid)), bid) === 'ready');
    await nav('dispatch'); await page.click(`tr[data-row="dispb:${bid}"]`); await wait(250); await page.click('[data-addship]'); await wait(250);
    const fs1 = page.locator('[data-sid]').last(); await fs1.locator('[data-s="invoiceNo"]').fill('INV/E2E/1'); await fs1.locator('[data-s="remarks"]').fill('Loaded in container 1'); await pickIn(fs1.locator('[data-s="status"]'), 'Disp', 'Dispatched');
    await page.click('#saveShip'); await wait(300);
    const fin = await ev(bid => { const b = B(bid); return { phase: phaseKey(b), rw: drivingRW(b).status, main: b.stages.map(s => s.status).join(',') }; }, bid);
    ok('09p full dispatch → batch complete on RW1; original line kept as history', fin.phase === 'completed' && fin.rw === 'Completed' && /rejected/.test(fin.main), JSON.stringify(fin));
    const o = await ev(() => S.orders.find(x => x.poNo === 'PO/E2E/1001')); ok('09q order gets invoice + dispatch date', o.invoiceNo === 'INV/E2E/1' && !!o.actualDispatch);
    // workflow view: driving line first
    await ev(([pid]) => { PTAB = 'workflow'; drawerFn = () => projectDrawer(pid); renderDrawer(); }, [pid]); await wait(200);
    const firstLane = await page.locator('.drawer .lane-wrap').first().locator('.lane').first().innerText(); ok('09r workflow shows RW1 as the driving line, on top', /RW1/.test(firstLane) && /Driving line/i.test(firstLane));
    await page.screenshot({ path: path.join(OUT, '09-rework-lanes.png') });
    await ev(() => closeDrawer());
    const rms = await ev(pid => pRemarks(pid).map(r => r.dept + ': ' + r.text), pid);
    ok('09s remarks collected from QC, rework, QA, manufacturing, dispatch', ['Quality Control', 'Quality Assurance', 'Manufacturing', 'Dispatch'].every(d => rms.some(r => r.startsWith(d))), rms.length + ' remarks');
  });
  await test('09z Hand-off works even with auto-complete off', async () => {
    const r = await ev(() => { putMaster('settings', [{ auto: false }]); const b = clone(S.batches.find(b => phaseKey(b) === 'material' && !inRework(b))); const L = activeLine(b); const i = L.findIndex(s => s.status !== 'done'); completeStage(b, L, i); put('batches', b); const out = curStage(B(b.id)); putMaster('settings', [{ auto: true }]); return out.type + ':' + out.status; });
    ok('09z next department auto set to In Progress', r === 'mfg:progress', r);
  });
  await test('10 Remarks tab: unread badges + highlighted newest on top', async () => {
    const pid = await ev(() => S.orders.find(x => x.poNo === 'PO/E2E/1001').projectId);
    await ev(pid => LS.set('ot-rm-' + pid, nowISO()), pid); await wait(50);
    const t = new Date(Date.now() + 60000).toISOString();
    await ev(([pid, t]) => { __fakeWrite('remarks', 'R-EXT1', { id: 'R-EXT1', projectId: pid, dept: 'Dispatch', text: 'Customer asked to advance shipment by 3 days', by: 'Ritu Bhatt', at: t, source: 'Remark' }); __fakeWrite('remarks', 'R-EXT2', { id: 'R-EXT2', projectId: pid, dept: 'Quality Assurance', text: 'COA format changed for this customer', by: 'Arvind Mehta', at: t.replace(/\.\d+Z/, '.999Z'), source: 'Remark' }); }, [pid, t]); await wait(200);
    await nav('ppc'); const cell = await page.locator(`tr[data-row="project:${pid}"] .bubble`).innerText().catch(() => '');
    ok('10a PPC list shows unread count bubble', cell === '2', cell);
    ok('10b row highlighted as unread', /unread/.test(await page.locator(`tr[data-row="project:${pid}"]`).getAttribute('class')));
    const navB = await page.locator('[data-nav="ppc"] .cnt').innerText().catch(() => ''); ok('10c sidebar shows new remark count', /2 new/.test(navB), navB);
    await page.click(`tr[data-row="project:${pid}"]`); await wait(200);
    ok('10d Remarks tab carries the number badge', (await page.locator('[data-ptab="remarks"] .bubble').innerText().catch(() => '')) === '2');
    await page.click('[data-ptab="remarks"]'); await wait(200);
    const first = await page.locator('.rmt tbody tr').first(); const ft = await first.innerText();
    ok('10e newest remark first, marked NEW, with department', /NEW/.test(ft) && /Quality Assurance/.test(ft) && /COA format/.test(ft) && /unread/.test(await first.getAttribute('class')), ft.replace(/\s+/g, ' ').slice(0, 90));
    ok('10f exactly 2 highlighted rows', await page.locator('.rmt tbody tr.unread').count() === 2);
    await page.screenshot({ path: path.join(OUT, '10-remarks.png') });
    await pickIn(page.locator('#rm_dept'), 'Dispatch', 'Dispatch'); await pickIn(page.locator('#rm_by'), 'Ritu', 'Ritu Bhatt'); await page.fill('#rm_text', 'Advance approved, rebooked vessel'); await page.click('[data-act="addRemark"]'); await wait(250);
    ok('10g posting a remark adds it to the table', /Advance approved/.test(await page.locator('.rmt tbody').innerText()));
    await page.click('.dh-bar [data-dclose]'); await wait(200);
    ok('10h after reading, counts clear', !(await page.locator(`tr[data-row="project:${pid}"] .bubble`).count()));
  });
  await test('11 PO/SO PDF → AI autofill', async () => {
    await nav('orders'); await page.click('[data-act="newOrder"]'); await wait(250);
    await page.setInputFiles('#pdfIn', path.join(__dirname, 'test-po.pdf')); await page.waitForSelector('#pdfStatus .alert', { timeout: 20000 }); await wait(200);
    const prompt = await ev(() => window.__pdfPrompt || ''); ok('11a PDF text extracted and sent to AI', /PO\/TEST\/7781/.test(prompt) && /Mystery Compound/.test(prompt));
    const md = page.locator('.modal');
    ok('11b header filled (PO, SO, customer, delivery, incoterms, payment)', (await md.locator('[data-k="poNo"]').inputValue()) === 'PO/TEST/7781' && (await md.locator('[data-k="soNo"]').inputValue()) === '55210' && (await md.locator('[data-k="customer"]').getAttribute('data-val')) === PDFX.customer && (await md.locator('[data-k="rowDelivery"]').inputValue()) === '2026-11-28' && (await md.locator('[data-k="incoterms"]').getAttribute('data-val')) === PDFX.inco && (await md.locator('[data-k="paymentTerms"]').getAttribute('data-val')) === PDFX.pay);
    const codes = await ev(() => [...document.querySelectorAll('.modal .itemrow [data-ik="productCode"]')].map(i => i.dataset.val));
    ok('11c products matched to master (2), unknown left blank', codes.length === 3 && codes[0] === PDFX.p1 && codes[1] === PDFX.p2 && codes[2] === '', codes.join(','));
    const q = await ev(() => [...document.querySelectorAll('.modal .itemrow [data-ik="poQty"]')].map(i => i.value)); ok('11d quantities filled (MT converted)', q[0] === '2000' && q[1] === '1500', q.join(','));
    const warn = await md.locator('#pdfStatus').innerText(); ok('11e unknown values listed as not in Master Data', /ZZZ-UNKNOWN-9/.test(warn), warn.replace(/\s+/g, ' ').slice(0, 160));
    await page.screenshot({ path: path.join(OUT, '11-pdf-autofill.png') });
    await md.locator('.itemrow').nth(2).locator('[data-rmitem]').click(); for (const i of [0, 1]) await pickIn(md.locator('.itemrow').nth(i).locator('[data-ik="line"]'), 'PR1', 'PR1');
    await md.locator('#saveOrder').click(); await wait(400);
    const o = await ev(() => S.orders.find(x => x.poNo === 'PO/TEST/7781')); ok('11f order from PDF saves, PDF attached', o && o.items.length === 2 && (o.docs || []).some(d => d.name === 'test-po.pdf'));
  });
  await test('12 Excel import groups rows into multi-product orders', async () => {
    await nav('orders'); const n0 = await ev(() => S.orders.length);
    await page.click('[data-act="importSheet"]'); const SHEET = process.env.OT_SHEET || path.join(__dirname, 'seed', 'Order_sheet.xlsx'); if (!fs.existsSync(SHEET)) { ok('12 skipped: set OT_SHEET to an order sheet .xlsx', true); return; } await page.setInputFiles('#imf', SHEET); await page.waitForSelector('#imp .kvs', { timeout: 30000 });
    const t = await page.locator('#imp').innerText(); const nums = (t.match(/\d+/g) || []).map(Number);
    ok('12a sheet parsed into orders with product lines', nums[0] > 100 && nums[1] >= nums[0] && nums[3] > 0, t.replace(/\s+/g, ' ').slice(0, 140));
    await page.locator('.modal footer button', { hasText: 'Import orders' }).click(); await wait(1500);
    const r = await ev(n0 => { const nw = S.orders.slice(n0); return { n: nw.length, multi: nw.filter(o => o.items.length > 1).length, started: nw.filter(o => o.projectId).length }; }, n0);
    ok('12b imported as Not Started orders (no batches yet)', r.n > 100 && r.started === 0 && r.multi > 0, JSON.stringify(r));
    await page.click('[data-ftab="orders:open"]'); await wait(300);
    const startBtn = page.locator('[data-act="startOrder"]').first(); const oid = await startBtn.getAttribute('data-o'); await startBtn.click(); await wait(400);
    const s = await ev(oid => { const o = O(oid); return { pid: !!o.projectId, b: S.batches.filter(b => b.projectId === o.projectId).length, it: o.items.length }; }, oid);
    ok('12c Start creates batches for every product', s.pid && s.b === s.it, JSON.stringify(s));
  });
  await test('13 Legacy order edit keeps values not yet in Master Data', async () => {
    const leg = await ev(() => { const o = S.orders.find(o => /^ORD-26(0|1|2)\d$/.test(o.id) && o.port && !M('ports').some(p => p.name === o.port) || false); return o ? o.id : (S.orders.find(o => o.paymentTerms) || {}).id; });
    await ev(() => { const x = M('ports').filter(p => p.name !== S.orders[2].port); putMaster('ports', x); });
    const oid = await ev(() => S.orders[2].id); const before = await ev(oid => ({ port: O(oid).port, pay: O(oid).paymentTerms, items: O(oid).items.map(i => i.productCode) }), oid);
    await ev(oid => OPEN.order(oid), oid); await wait(300);
    const shown = await page.locator('.modal [data-k="port"]').inputValue();
    await page.locator('#saveOrder').click(); await wait(300);
    const after = await ev(oid => ({ port: O(oid).port, pay: O(oid).paymentTerms, items: O(oid).items.map(i => i.productCode) }), oid);
    ok('13a legacy values shown and preserved on save', shown === (before.port || '') && JSON.stringify(before) === JSON.stringify(after), JSON.stringify({ before, after }));
    await closeModals();
  });
  await test('14 AI assistant answers by PO / SO', async () => {
    await nav('assistant'); await page.fill('#chatI', 'What is the status of PO PO/E2E/1001?'); await page.press('#chatI', 'Enter'); await page.waitForFunction(() => !CHAT_BUSY, null, { timeout: 8000 });
    const a = await ev(() => window.__lastAnswer || ''); ok('14a tool lookup by PO works', /PO PO\/E2E\/1001/.test(a) && /Completed|RW1|Material/.test(a) && !/PRJ-/.test(a), a.slice(0, 120));
  });
  await test('15 Overview + exports + persistence', async () => {
    await nav('overview'); ok('15a overview renders with charts', await page.locator('#view canvas').count() === 4);
    ok('15b "New remarks" panel present', /New remarks/.test(await page.locator('#view').innerText()));
    await nav('ppc'); await page.click('[data-exp="ppc:xlsx"]'); await wait(400); ok('15c Excel export runs', /PPC-.*\.xlsx/.test(await ev(() => window.__lastDownload || '')));
    await page.reload(); await page.waitForSelector('[data-nav]'); await wait(800); await nav('ppc');
    ok('15d data survives reload (shared DB)', await ev(() => !!S.orders.find(x => x.poNo === 'PO/E2E/1001') && S.batches.some(b => (b.reworks || []).length && drivingRW(b).status === 'Completed')));
  });
  await test('18 Fresh live data: every reworked batch reaches a department', async () => {
    const LIVE = process.env.OT_LIVE_DIR; if (!LIVE) { ok('18 skipped: set OT_LIVE_DIR to a per-document export folder', true); return; }
    const rd = c => fs.readdirSync(path.join(LIVE, c)).map(f => { const d = JSON.parse(fs.readFileSync(path.join(LIVE, c, f))); return Object.assign({}, d.data || d, { id: d.id || f.replace('.json', '') }); });
    const live = { orders: rd('orders'), projects: rd('projects'), batches: rd('batches') };
    const r = await ev(live => { S.orders = live.orders.map(normalizeOrder); S.projects = live.projects; S.batches = live.batches.map(normalizeBatch); render(true);
      const rw = S.batches.filter(b => (b.reworks || []).length); const dept = b => Object.keys(DEPT_VIEW).find(v => DEPT_VIEW[v].includes(phaseKey(b))) || (phaseKey(b) === 'completed' ? 'completed' : 'NONE');
      return rw.map(b => `${b.id}:${phaseLabel(b)}→${dept(b)}`); }, live);
    ok('18a no reworked batch left outside a department queue', r.length >= 6 && !r.some(x => /NONE/.test(x)), r.join(' | '));
    const pr = await ev(() => { const b = B('PR1-2624'); return b ? phaseLabel(b) + '|' + curStage(b).status : 'missing'; }); ok('18b PR1-2624 now on RW1 manufacturing, In Progress', /RW1 · Manufacturing\|progress/.test(pr), pr);
    for (const v of ['ppc', 'manufacturing', 'qc', 'qa', 'dispatch', 'orders', 'overview']) await nav(v);
    ok('18c all pages render on fresh live data', !consoleErrors.length, consoleErrors.slice(0, 2).join(' | '));
  });
  await test('16 No script errors', async () => { ok('16a console clean', !consoleErrors.length, consoleErrors.slice(0, 3).join(' | ')); });
  // local mode (no claude.ai capabilities)
  await test('17 Local mode', async () => {
    await ctx.close(); await setup({ local: true });
    ok('17a loads without shared DB', /This browser only/.test(await page.locator('#conn').innerText()));
    await nav('orders'); ok('17b order form usable, PDF needs Claude note', await (async () => { await page.click('[data-act="newOrder"]'); const t = await page.locator('.modal').innerText(); await closeModals(); return /needs the Claude connection/.test(t); })());
    ok('17c no script errors', !consoleErrors.length, consoleErrors.slice(0, 2).join(' | '));
  });
  await browser.close();
  const f = results.filter(r => !r.pass);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - f.length}/${results.length} checks passed${f.length ? '\nFAILED:\n' + f.map(r => ' - ' + r.name + ' ' + r.detail).join('\n') : ''}`);
})().catch(e => { console.error('HARNESS CRASH', e); process.exit(1); });
