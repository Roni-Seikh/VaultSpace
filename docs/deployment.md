# Deployment guide (phases A–M)

Nothing here has been executed for you. "Deployed" is only true after you complete and test these steps yourself. All commands are Windows PowerShell.

**A. Prerequisites.** Node 20+ (https://nodejs.org), Git (https://git-scm.com), accounts: GitHub, Supabase, Cloudflare, Vercel.

**B. Local install.**
```powershell
cd C:\path\to\VaultSpace
npm install
Copy-Item .env.example .env.local
```
**C. Supabase project.** Create at https://supabase.com/dashboard. Copy Project URL, anon key, and service_role key (Settings → API). The service_role key is secret: server only.

**D. Database.** SQL Editor → run, in order, `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0003_rls.sql`. Docs: https://supabase.com/docs/guides/database/overview

**E. Auth settings** (Authentication): enable Email provider; set minimum password length to 10 (Providers → Email) — the app's vault passphrase is separate and requires 12; add Site URL (`http://localhost:3000`, later your Vercel URL) and Redirect URLs `http://localhost:3000/auth/callback` and `https://<your-app>/auth/callback`; enable MFA (TOTP). Default email sending is heavily rate-limited; configure custom SMTP for real use: https://supabase.com/docs/guides/auth/auth-smtp

**F. Cloudflare R2.** Dashboard → R2 → create a **private** bucket (do not enable public access / r2.dev). Create an API token with Object Read & Write scoped to that bucket (https://developers.cloudflare.com/r2/api/tokens/). Note Account ID, Access Key ID, Secret, bucket name.

**G. R2 CORS** (bucket → Settings → CORS policy; https://developers.cloudflare.com/r2/buckets/cors/). Replace origins with yours:
```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://<your-app>.vercel.app"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["content-type", "content-length"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```
**H. Environment variables.** Fill `.env.local` (never commit it). Generate random values:
```powershell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Maximum 256 }) -as [byte[]])
```
(use for `CRON_SECRET` and `IP_HASH_SALT`; for stronger randomness use `[System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)`).

**I. Run locally.** `npm run dev` → http://localhost:3000. Register, confirm email, create vault, upload a file, download it, make a share link in a private window.

**J. First admin.** After registering, in the Supabase SQL editor:
```sql
update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');
```
**K. Verify before deploying.** `npm run typecheck; npm run lint; npm test; npm run build; npm run scan:secrets` (and `npx playwright install chromium; npm run test:e2e`).

**L. GitHub + Vercel.** Push per `docs/github-guide.md`. Vercel → Add New Project → import repo (https://vercel.com/docs/deployments/git). Add every variable from `.env.local` under Environment Variables, deploy, then add the Vercel URL to Supabase redirect URLs and R2 CORS. Optional daily maintenance: Vercel Cron (https://vercel.com/docs/cron-jobs) calling `/api/cron/maintenance` with `Authorization: Bearer <CRON_SECRET>` — or use the included GitHub `keepalive.yml` (set repo variable `APP_URL`).

**M. Post-deploy checklist.** Register/login; MFA enrol; upload ≥1 file and a >4 MiB file; download and compare; share with expiry, password, revoke; check `/api/health`; confirm R2 bucket has no public access; confirm quota changes in Security/Storage pages; check the R2 and Supabase usage dashboards.
