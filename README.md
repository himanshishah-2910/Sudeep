# OrderTrack

Manufacturing order-to-dispatch project management: order punching (multi-product, PDF autofill), Project Planning & Control (PPC), Manufacturing, Quality Control, Quality Assurance / COA, Dispatch, Master Data with workflow templates, and an AI project assistant.

Orders are traced by **PO / SO number**. Each product in an order runs on its own workflow and batches. When a batch is sent to rework, the rework line (RW1, RW2…) drives it, and the original line is kept as history. Completing a stage hands the batch to the next department automatically.

## Repository layout

| Path | What it is |
| --- | --- |
| `src/page.html` | Page markup and all CSS |
| `src/core.js` | Data model, normalisation of older records, automation engine (hand-off, auto-schedule, rework) |
| `src/ui.js` | Navigation, searchable dropdowns, tables with column filters, modals, exports |
| `src/orders.js` | Orders list, punch form (multi-product), PO/SO PDF autofill, Excel import |
| `src/ppc.js` | PPC list, order page (products, workflow lanes, remarks, history), rework + stage editing |
| `src/depts.js` | Manufacturing, QC, QA / COA and Dispatch queues |
| `src/misc.js` | Overview, Master Data (incl. workflow templates), AI assistant, events, startup |
| `scripts/build.mjs` | Builds `public/index.html` + `public/app.js` |
| `vercel.json` | Vercel build settings (`npm run build` → `public/`) |
| `src/backend.js` | Supabase + AI adapter for the own-domain build |
| `api/` | Vercel Functions: `config.js`, `ai.js` (OpenAI gpt-4.1) |
| `supabase/setup.sql` | Database table, Realtime, storage bucket, access rules |
| `tests/e2e/` | Playwright suites: `run.js` (88 checks, app) and `vercel.js` (22 checks, own-domain build with Supabase + AI path) |
| `docs/` | Deployment and backend integration guides |

## Run locally

```bash
npm run build          # writes public/
npx serve public       # or any static server
```

## Deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)**: GitHub → Vercel → your own domain.

## Backend on your own domain (connected)

| Piece | Where | Notes |
| --- | --- | --- |
| Shared database | Supabase project `pugkpvtdcnpwrvmtbamz`, table `public.ot_docs` | One row per record; Realtime on, so every open dashboard updates live, including edits made in the Supabase table editor |
| Files (PO/SO PDFs, QC forms, COAs) | Supabase Storage bucket `ordertrack` | |
| AI assistant + PO/SO PDF reading | `api/ai.js` (Vercel Function) → OpenAI **gpt-4.1** | Key read from the Vercel environment variable `open_ai_sudeep_key`; it never reaches the browser |
| Browser adapter | `src/backend.js` | Implements the app's `window.claude.use()` interface on top of the above |
| Public config | `api/config.js` | Supabase URL + publishable key, AI on/off, seed sheet path |
| Database setup | `supabase/setup.sql` | Already applied; safe to re-run |

The first time the site opens on an empty database it loads default master data and offers **Load order sheet data**, which imports the sheet shipped in `seed/` through the normal importer (orders, masters, optional workflow start).

How changes flow: data edits on the website are written straight to Supabase (no GitHub involved). Code changes are pushed to GitHub, and Vercel redeploys automatically.

## Tests

```bash
cd tests/e2e && npm install && npx playwright install chromium
OT_SEED=/path/to/ordertrack-database.json OT_SHEET=/path/to/Order_sheet.xlsx npm test
```

`OT_SEED` is a database export (the `data/ordertrack-database.json` file from an OrderTrack backup). The order sheet and live-folder checks are skipped when their variables are not set.
