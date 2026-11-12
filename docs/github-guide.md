# GitHub guide (Windows PowerShell)

```powershell
cd C:\path\to\VaultSpace
npm run scan:secrets          # must say "clean"
git init
git branch -M main
git add .
git status                    # confirm .env.local is NOT listed
git commit -m "Initial commit: VaultSpace"
```
Create an empty repo on https://github.com/new (no README), then:
```powershell
git remote add origin https://github.com/<your-username>/vaultspace.git
git push -u origin main
```
Repo description: **Privacy-first cloud storage with client-side AES-256-GCM encryption, secure sharing, versioning and quota control.**
Suggested topics: nextjs, typescript, supabase, cloudflare-r2, encryption, web-crypto.

If you ever commit a secret by mistake: rotate it immediately (Supabase and Cloudflare dashboards); deleting it from git history is not enough.
