/* OrderTrack backend adapter for your own domain (Vercel).
   Provides window.claude.use(name) — the single interface the app uses — on top of:
     db        → Supabase table public.ot_docs (one row per record) with Realtime
     assets    → Supabase Storage bucket "ordertrack"
     downloads → normal browser download
     sample    → /api/ai (Vercel Function → OpenAI gpt-4.1 with your key; the key never reaches the browser)
   Loaded before app.js. If configuration is missing, each capability resolves to null and the app falls back. */
(function () {
  'use strict';
  const TABLE = 'ot_docs', BUCKET = 'ordertrack';
  const state = { cfg: null, sb: null, dbReady: null, status: 'init', problem: '' };
  const log = (...a) => { try { console.info('[OrderTrack backend]', ...a); } catch (e) { } };

  async function getConfig() {
    if (state.cfg) return state.cfg;
    try { const r = await fetch('/api/config', { cache: 'no-store' }); state.cfg = r.ok ? await r.json() : {}; }
    catch (e) { state.cfg = {}; }
    return state.cfg;
  }

  /* ---------------- database ---------------- */
  async function initDb() {
    const cfg = await getConfig();
    if (!cfg.supabaseUrl || !cfg.supabaseKey) { state.problem = 'Supabase is not configured (SUPABASE_URL / SUPABASE_ANON_KEY missing in Vercel).'; log(state.problem); return null; }
    if (!window.supabase || !window.supabase.createClient) { state.problem = 'Supabase library did not load.'; log(state.problem); return null; }
    const sb = state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, { auth: { persistSession: false } });
    let probe = await sb.from(TABLE).select('id').limit(1);
    if (probe.error) {
      state.problem = probe.error.message; log('Database unavailable:', state.problem); showSetupNotice(); return null;
    }
    state.status = 'ok';
    return makeDb(sb);
  }

  function makeDb(sb) {
    const cache = {};      // collection -> Map(id -> data)
    const subs = {};       // collection -> Set(listener)
    const loaded = {};     // collection -> Promise
    const emitT = {};
    const snap = c => { const docs = [...(cache[c] || new Map()).entries()].map(([id, d]) => ({ id, exists: true, data: () => d, metadata: { fromCache: false, hasPendingWrites: false } })); return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
    const emit = c => { clearTimeout(emitT[c]); emitT[c] = setTimeout(() => (subs[c] || new Set()).forEach(fn => { try { fn(snap(c)); } catch (e) { console.error(e); } }), 40); };
    async function load(c, q) {
      const m = cache[c] = cache[c] || new Map();
      let from = 0; const page = 1000;
      for (; ;) {
        let req = sb.from(TABLE).select('id,data').eq('collection', c);
        if (q && q.order) req = req.order(`data->>${q.order.field}`, { ascending: q.order.dir !== 'desc' });
        req = req.range(from, from + page - 1);
        const { data, error } = await req;
        if (error) throw error;
        data.forEach(r => m.set(r.id, r.data));
        if (data.length < page || (q && q.limit && m.size >= q.limit)) break;
        from += page;
      }
    }
    // one Realtime channel for all collections: changes made anywhere (another user, Supabase table editor) appear live
    sb.channel('ot-docs').on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, p => {
      const row = p.eventType === 'DELETE' ? p.old : p.new; if (!row || !row.collection) return;
      const m = cache[row.collection] = cache[row.collection] || new Map();
      if (p.eventType === 'DELETE') m.delete(row.id); else m.set(row.id, row.data);
      emit(row.collection);
    }).subscribe(s => log('realtime', s));

    /* writes are batched: many records saved together (e.g. a sheet import) go in a few requests */
    const pending = { up: new Map(), del: new Map() }; let flushT = null, flushing = Promise.resolve();
    const schedule = () => { clearTimeout(flushT); flushT = setTimeout(() => { flushing = flushing.then(flush); }, 60); return new Promise((res, rej) => { (pending.waiters = pending.waiters || []).push({ res, rej }); }); };
    async function flush() {
      const ups = [...pending.up.values()], dels = [...pending.del.entries()], waiters = pending.waiters || [];
      pending.up = new Map(); pending.del = new Map(); pending.waiters = [];
      try {
        for (let i = 0; i < ups.length; i += 400) { const { error } = await sb.from(TABLE).upsert(ups.slice(i, i + 400), { onConflict: 'collection,id' }); if (error) throw error; }
        const byC = {}; dels.forEach(([k, v]) => { (byC[v.collection] = byC[v.collection] || []).push(v.id); });
        for (const [c, ids] of Object.entries(byC)) for (let i = 0; i < ids.length; i += 200) { const { error } = await sb.from(TABLE).delete().eq('collection', c).in('id', ids.slice(i, i + 200)); if (error) throw error; }
        waiters.forEach(w => w.res());
      } catch (e) { const err = { code: /permission|policy|rls/i.test(e.message || '') ? 'permission_denied' : 'unavailable', message: e.message || String(e) }; waiters.forEach(w => w.rej(err)); }
    }
    const docRef = (c, id) => ({
      id,
      async get() { await (loaded[c] || (loaded[c] = load(c))); const d = (cache[c] || new Map()).get(id); return { id, exists: !!d, data: () => d, metadata: {} }; },
      set(data) { const d = JSON.parse(JSON.stringify(data)); (cache[c] = cache[c] || new Map()).set(id, d); emit(c); pending.del.delete(c + '/' + id); pending.up.set(c + '/' + id, { collection: c, id, data: d, updated_at: new Date().toISOString() }); return schedule(); },
      update(data) { const cur = (cache[c] || new Map()).get(id) || {}; return this.set(Object.assign({}, cur, data)); },
      delete() { (cache[c] || new Map()).delete(id); emit(c); pending.up.delete(c + '/' + id); pending.del.set(c + '/' + id, { collection: c, id }); return schedule(); }
    });
    const query = (c, q = {}) => ({
      limit: n => query(c, Object.assign({}, q, { limit: n })),
      orderBy: (field, dir) => query(c, Object.assign({}, q, { order: { field, dir } })),
      where: () => query(c, q),
      async get() { await (loaded[c] || (loaded[c] = load(c, q))); return snap(c); },
      onSnapshot(next, error) {
        (subs[c] = subs[c] || new Set()).add(next);
        (loaded[c] || (loaded[c] = load(c, q))).then(() => next(snap(c)), e => { log('load failed', c, e.message); error && error({ code: 'unavailable', message: e.message }); });
        return () => subs[c] && subs[c].delete(next);
      },
      doc: id => docRef(c, id || ('id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6))),
      add: async data => { const id = 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); await docRef(c, id).set(data); return docRef(c, id); }
    });
    return { collection: c => query(c), doc: path => { const [c, id] = path.split('/'); return docRef(c, id); } };
  }

  function showSetupNotice() {
    const go = () => {
      if (document.getElementById('ot-setup')) return;
      const d = document.createElement('div'); d.id = 'ot-setup';
      d.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:300;max-width:min(760px,calc(100% - 32px));background:#fff;color:#0D2140;border:1px solid #D4343D;border-radius:12px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.25);font:14px/1.5 system-ui,sans-serif';
      d.innerHTML = '<b>Shared database not ready.</b> ' + (state.problem || '') + '<br>Run <b>supabase/setup.sql</b> from the repository once in Supabase → SQL Editor, then reload this page. Until then, changes stay in this browser only.' + '<div style="text-align:right;margin-top:6px"><button type="button" style="border:0;background:#1458C8;color:#fff;border-radius:8px;padding:6px 12px;cursor:pointer" onclick="this.closest(\'#ot-setup\').remove()">Close</button></div>';
      document.body.appendChild(d);
    };
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  /* ---------------- file uploads ---------------- */
  async function initAssets() {
    const db = await capP.db; if (!db || !state.sb) return null;
    const sb = state.sb;
    return {
      async upload(blob) {
        const name = (blob.name || 'file').replace(/[^\w.\-]+/g, '_'); const path = `${new Date().toISOString().slice(0, 10)}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}-${name}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', upsert: false });
        if (error) throw { code: 'unavailable', message: error.message };
        const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
        return { id: path, url: data.publicUrl, sizeBytes: blob.size, contentType: blob.type };
      },
      async list() { return { assets: [], usage: {} }; },
      async delete(id) { await sb.storage.from(BUCKET).remove([id]); }
    };
  }

  /* ---------------- downloads ---------------- */
  const downloads = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data]);
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename || 'download'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000); return { saved: true };
    }
  };

  /* ---------------- AI via /api/ai (OpenAI gpt-4.1) ---------------- */
  async function callAI(body, signal) {
    let r; try { r = await fetch('/api/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal }); }
    catch (e) { if (e && e.name === 'AbortError') throw { code: 'cancelled', message: 'Stopped' }; throw { code: 'unavailable', message: e.message }; }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw { code: (j.error && j.error.code) || (r.status === 429 ? 'rate_limited' : 'unavailable'), message: (j.error && j.error.message) || ('AI request failed (' + r.status + ')') };
    return j;
  }
  const blobToDataUrl = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  function toMessages(input) {
    if (typeof input === 'string') return [{ role: 'user', content: input }];
    return (input || []).map(t => ({ role: t.role === 'assistant' ? 'assistant' : 'user', content: String(t.content || '') }));
  }
  async function initSample() {
    const cfg = await getConfig(); if (!cfg.ai) { log('AI not configured (open_ai_sudeep_key missing in Vercel).'); return null; }
    async function sample(input, opts = {}) {
      const msgs = toMessages(input); const tools = opts.tools || [];
      const oaTools = tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema || { type: 'object', properties: {} } } }));
      for (let round = 0; round < 8; round++) {
        if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'Stopped' };
        const j = await callAI({ messages: msgs, tools: oaTools }, opts.signal);
        const m = j.message || {};
        if (m.tool_calls && m.tool_calls.length) {
          msgs.push({ role: 'assistant', content: m.content || null, tool_calls: m.tool_calls });
          for (const tc of m.tool_calls) {
            const tool = tools.find(t => t.name === tc.function.name); let out;
            try { const args = JSON.parse(tc.function.arguments || '{}'); out = tool ? await tool.execute(args, { signal: opts.signal || new AbortController().signal }) : { error: 'Unknown tool ' + tc.function.name }; }
            catch (e) { out = 'Error: ' + (e && e.message || e); }
            let s = typeof out === 'string' ? out : JSON.stringify(out); if (s.length > 60000) s = s.slice(0, 60000) + '…(truncated)';
            msgs.push({ role: 'tool', tool_call_id: tc.id, content: s });
          }
          continue;
        }
        const text = m.content || '';
        opts.onText && opts.onText({ text, delta: text });
        return { text, truncated: j.finish_reason === 'length' };
      }
      throw { code: 'unavailable', message: 'The assistant used too many lookup steps. Ask a narrower question.' };
    }
    sample.json = async (prompt, opts = {}) => {
      const parts = [{ type: 'text', text: String(prompt) }];
      if (opts.pdf && opts.pdf.dataUrl) parts.push({ type: 'file', file: { filename: opts.pdf.name || 'order.pdf', file_data: opts.pdf.dataUrl } });
      for (const img of (opts.images || []).slice(0, 5)) parts.push({ type: 'image_url', image_url: { url: await blobToDataUrl(img) } });
      const j = await callAI({ messages: [{ role: 'user', content: parts }], json: true }, opts.signal);
      const t = (j.message && j.message.content) || ''; const a = t.indexOf('{'), b = t.lastIndexOf('}');
      try { return JSON.parse(a >= 0 ? t.slice(a, b + 1) : t); } catch (e) { throw { code: 'bad_response', message: 'The AI reply was not valid JSON.' }; }
    };
    sample.limits = async () => ({ images: { maxCount: 5, mediaTypes: ['image/png', 'image/jpeg', 'image/webp'] } });
    sample.acceptsPdf = true;
    return sample;
  }

  const capP = {};
  capP.db = initDb().catch(e => { log('db init failed', e); return null; });
  capP.assets = initAssets().catch(() => null);
  capP.sample = initSample().catch(() => null);
  capP.downloads = Promise.resolve(downloads);
  window.claude = { use: name => capP[name] || Promise.resolve(null) };
  window.OT_BACKEND = state;
})();
