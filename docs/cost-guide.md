# Cost guide (free-tier operation)

Verify current limits on the official pages before relying on them; they change.
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/ (a free monthly allowance exists, currently 10 GB-month storage; check the page).
- Supabase pricing: https://supabase.com/pricing (free projects pause after inactivity and have DB size limits).
- Vercel limits: https://vercel.com/docs/limits (Hobby is for non-commercial use).

| Feature | Status |
|---|---|
| Next.js on Vercel Hobby, Supabase free, R2 free allowance, GitHub Actions on public repos | Free (limited) |
| Custom domain | Costs money (optional) |
| Supabase custom SMTP | Free providers exist but limited; default Supabase email is rate-limited |
| Large user counts / big uploads | Will exceed free tiers |

## Cap protection
- Per-user quota: `profiles.quota_bytes` (default 1 GiB).
- Global cap: `app_capacity.max_bytes` (default 8 GiB, below the free allowance) and `max_file_bytes` (default 100 MiB). Uploads beyond either are refused by the server.
```sql
update app_capacity set max_bytes = 8 * 1024^3, max_file_bytes = 100 * 1024^2 where id = 1;
update profiles set quota_bytes = 2 * 1024^3 where id = '<user uuid>';
```
## Monitoring
Check the Cloudflare R2 dashboard and Supabase usage page weekly; configure billing notifications in Cloudflare if you ever add a payment method. Orphaned objects are handled by the maintenance cron.
