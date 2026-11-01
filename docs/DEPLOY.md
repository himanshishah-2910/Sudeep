# Deploy: GitHub → Vercel → your domain

## 1. Import the repository into Vercel

1. Sign in at vercel.com with your GitHub account.
2. **Add New… → Project**, pick this repository, click **Import**.
3. Framework preset: **Other**. Leave build settings as they are; `vercel.json` already sets
   - Build command: `npm run build`
   - Output directory: `public`
4. Click **Deploy**. You get a `*.vercel.app` URL in about a minute.

Every push to the default branch redeploys production automatically; pushes to other branches get preview URLs.

## 2. Connect your existing domain

1. In the Vercel project: **Settings → Domains → Add Domain**.
2. Enter the domain you want OrderTrack on, for example `ordertrack.yourcompany.com` (a subdomain keeps your main website untouched) or `yourcompany.com`.
3. Vercel shows the DNS records to create. Add them where your domain's DNS is managed (GoDaddy, Hostinger, Cloudflare, etc.):

| You are adding | Record type | Name | Value |
| --- | --- | --- | --- |
| Subdomain, e.g. `ordertrack.yourcompany.com` | `CNAME` | `ordertrack` | the project-specific value Vercel shows (looks like `xxxx.vercel-dns-0xx.com`) |
| Apex, e.g. `yourcompany.com` | `A` | `@` | `76.76.21.21`, or the value on your Vercel domain card |
| `www.yourcompany.com` | `CNAME` | `www` | the value Vercel shows |

4. Wait for Vercel to show **Valid Configuration** (minutes to a few hours). HTTPS certificates are issued automatically.

Tips
- Use the values shown in **your** project's Domains page; they can differ per project.
- Remove any older A / AAAA / CNAME record for the same name first, or Vercel reports "Invalid configuration".
- Only change the one website record. Do not move nameservers unless you also copy your email (MX) and verification (TXT) records.
- If Cloudflare manages your DNS, set the record to **DNS only** (grey cloud) while Vercel verifies it.

## 3. Environment variables

| Variable | Used for | Notes |
| --- | --- | --- |
| `open_ai_sudeep_key` | AI assistant + PO/SO PDF reading (OpenAI gpt-4.1) | **Required for AI.** Server-side only (read by `api/ai.js`) |
| `OPENAI_MODEL` | optional model override | default `gpt-4.1` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or `NEXT_PUBLIC_…` / `…_PUBLISHABLE_KEY`) | Database + storage | Optional: falls back to project `pugkpvtdcnpwrvmtbamz` and its publishable key |
| `OT_SEED_SHEET` | path of the one-time seed sheet | default `/seed/sheet-7f3k9q2m.xlsx` |

After changing variables, redeploy (Deployments → ⋯ → Redeploy).

See [INTEGRATION.md](INTEGRATION.md) for the interface the app expects.

References: [Vercel — Adding & configuring a custom domain](https://vercel.com/docs/domains/add-a-domain), [Vercel — A records](https://vercel.com/kb/guide/a-record-and-caa-with-vercel).
