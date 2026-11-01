# Backend integration (database, files, AI)

All screens reach the outside world through **one function**: `window.claude.use(name)`, which resolves to a capability object or `null`. On claude.ai the platform provides it. On your own domain, define `window.claude` yourself in a small script loaded **before** `app.js` (e.g. `src/backend.js` → copied to `public/backend.js`, plus a `<script src="backend.js"></script>` line ahead of `app.js` in `src/page.html`).

If `use()` returns `null` for a capability, the app degrades gracefully:

| Capability | When `null` |
| --- | --- |
| `db` | "This browser only" mode (localStorage) |
| `sample` | PDF autofill and AI Assistant show "needs connection" |
| `assets` | Upload buttons hidden |
| `downloads` | Excel / PDF export buttons hidden |

`app.js` waits up to 10 s for `use()` and never reads `window.claude.db` etc. directly.

## 1. `db` — shared database

The app uses a small Firestore-like surface:

```js
const db = await claude.use('db');
db.collection(name)                // CollectionRef
  .limit(n) / .orderBy(field, 'asc'|'desc') / .where(field, op, value)   // return a Query (chainable)
  .onSnapshot(next, error)         // next({ docs: [{ id, data: () => object }] }) on load and on every change; returns unsubscribe()
db.collection(name).doc(id).set(object)   // full replace (upsert)
db.collection(name).doc(id).delete()
```

Collections and their documents (one JSON object per document):

| Collection | Document id | Contents |
| --- | --- | --- |
| `orders` | `ORD-2601`… | PO/SO header, customer, planning, dispatch & commercial fields, `items[]` (one per product: code, name, grade, qty, packing, workflow `tplId`, `line`, batches), `projectId`, `docs[]` |
| `projects` | internal key | `orderId`, `status`, `remarks`, `docs[]` (never shown to users; orders are traced by PO/SO) |
| `batches` | `PR1-2700`… | `projectId`, `itemId`, qty, line, plan dates, `stages[]` (main line), `reworks[]` (each with its own `stages[]`; the last one drives), `qcTests[]`, `qa`, `coa`, `shipments[]`, `history[]`, `prodLog[]` |
| `templates` | `T-STD`… | workflow templates: `name`, `stages[{name,type}]`, `isDefault` |
| `remarks` | `R-…` | `projectId`, `dept`, `text`, `by`, `batchId`, `itemId`, `source`, `at` (ISO time) |
| `masters` | master type (`customers`, `products`, `ports`, …) | `{ items: [ … ] }` |
| `activity` | `A-…` | `{ at, text, ref }` |

### Supabase mapping (suggested)

One generic table keeps the app unchanged:

```sql
create table public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
alter table public.docs enable row level security;
-- Replace with your real rules (e.g. only signed-in company users):
create policy "team read"  on public.docs for select using (auth.role() = 'authenticated');
create policy "team write" on public.docs for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
alter publication supabase_realtime add table public.docs;
```

- `onSnapshot(c)`: `select id, data from docs where collection = c`, then subscribe to Realtime changes filtered on `collection=eq.c` and re-emit the full list.
- `doc(id).set(obj)`: `upsert({ collection: c, id, data: obj })`.
- `doc(id).delete()`: `delete().match({ collection: c, id })`.
- To migrate existing data, load `data/ordertrack-database.json` from an OrderTrack backup: every array entry becomes one row (`collection` = array name, `id` = entry `id`, `data` = the entry). Masters are rows in collection `masters` with id = master type.

## 2. `assets` — file uploads

```js
const assets = await claude.use('assets');
await assets.upload(fileOrBlob)   // → { id, url, sizeBytes, contentType }
```

Store the file (e.g. Supabase Storage bucket `ordertrack`) and return a URL people can open. The app saves `{ id, url, name }` inside the order/batch records.

## 3. `downloads` — Excel / PDF exports

```js
const downloads = await claude.use('downloads');
await downloads.save({ filename, data })   // data: Blob | ArrayBuffer | string
```

Outside claude.ai this can simply create an object URL and click a temporary `<a download>` link.

## 4. `sample` — AI (PDF autofill + assistant)

```js
const sample = await claude.use('sample');
await sample(input, { tools, onText, signal, cache })   // → { text, truncated }
await sample.json(prompt, { images })                   // → parsed JSON object from the reply
await sample.limits()                                   // → { images: { maxCount, mediaTypes } } or { images: null }
```

- `input` is a prompt string or `[{ role, content }]` turns ending on a user turn.
- `tools` is `[{ name, description, inputSchema, execute(input) }]`. `execute` runs **in the browser** against the loaded data. Implement the loop client-side: send messages + tool schemas to your endpoint, run any `tool_use` blocks with `execute`, send the `tool_result`s back, repeat until the model returns text.
- Your endpoint (e.g. `api/ai.js`, a Vercel Function) forwards to the Anthropic Messages API with `ANTHROPIC_API_KEY` from the environment. **Never put the API key in browser code.**
- `sample.json` is the same call without tools; parse the JSON object out of the reply text.
- PDF autofill extracts text in the browser with pdf.js. For scanned PDFs it sends page images, only if `sample.limits().images` is set.

## Checklist

1. Create `src/backend.js` defining `window.claude = { use: async name => ... }` for `db`, `assets`, `downloads`, `sample`.
2. Add `<script src="backend.js"></script>` before `app.js` in `src/page.html`, and copy the file to `public/` in `scripts/build.mjs`.
3. Add the Vercel Function for AI and the environment variables (see [DEPLOY.md](DEPLOY.md)).
4. Run the end-to-end suite (`tests/e2e`). It already exercises this exact interface with an in-memory stand-in.
