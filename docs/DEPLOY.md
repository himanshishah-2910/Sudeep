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

## 3. Environment variables (when you connect the backend)

Set these in **Settings → Environment Variables**, then redeploy. Names are suggestions; match whatever your integration code reads.

| Variable | Used for | Expose to browser? |
| --- | --- | --- |
| `SUPABASE_URL` | Database + file storage | Yes (public) |
| `SUPABASE_ANON_KEY` | Database + file storage, protected by Row Level Security | Yes (public) |
| `ANTHROPIC_API_KEY` | AI: PDF autofill + assistant | **Never.** Server-side only, inside a Vercel Function |

See [INTEGRATION.md](INTEGRATION.md) for the interface the app expects.

References: [Vercel — Adding & configuring a custom domain](https://vercel.com/docs/domains/add-a-domain), [Vercel — A records](https://vercel.com/kb/guide/a-record-and-caa-with-vercel).
