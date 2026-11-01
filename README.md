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
| `tests/e2e/` | Playwright end-to-end suite (87 checks) |
| `docs/` | Deployment and backend integration guides |

## Run locally

```bash
npm run build          # writes public/
npx serve public       # or any static server
```

## Deploy

See **[docs/DEPLOY.md](docs/DEPLOY.md)**: GitHub → Vercel → your own domain.

## Important: backend on your own domain

On claude.ai, OrderTrack uses the platform's shared database, file storage and AI. On Vercel those are not present, so out of the box the app runs in **"This browser only"** mode: each person's data stays in their own browser.

To make it a shared team app on your domain, connect a database (e.g. Supabase) and an AI endpoint (your Anthropic API key). The app talks to these through one small interface, described in **[docs/INTEGRATION.md](docs/INTEGRATION.md)**. No screen code needs to change.

## Tests

```bash
cd tests/e2e && npm install && npx playwright install chromium
OT_SEED=/path/to/ordertrack-database.json OT_SHEET=/path/to/Order_sheet.xlsx npm test
```

`OT_SEED` is a database export (the `data/ordertrack-database.json` file from an OrderTrack backup). The order sheet and live-folder checks are skipped when their variables are not set.
