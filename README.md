# VaultSpace

Privacy-first cloud storage with client-side AES-256-GCM encryption, secure sharing, versioning and quota control.

> **Honesty notes.** VaultSpace is client-side encrypted but **not "zero-knowledge"** (see `docs/security-model.md`). If you lose your vault passphrase *and* recovery key, your data cannot be recovered. Live Supabase Auth and Storage flows were **not** exercised in the build environment; follow `docs/deployment.md` and test them yourself.

## Problem and solution
Mainstream cloud storage can read your files. VaultSpace encrypts files and names in the browser, so the database and bucket hold only ciphertext.

## Features
Landing page, email auth with TOTP MFA, dashboard, encrypted file manager (folders, rename, move, copy, delete), image gallery, document viewer (PDF via pdf.js canvas, text), version history and restore, share links (expiry, password, revoke, key in URL fragment), local rule-based assistant (no external AI), security center (sessions, passphrase and recovery key), settings, admin overview, per-user and global quotas, dark/light themes.

## Stack
Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 · Framer Motion · Lucide · Supabase (Postgres, Auth, RLS) · Supabase Storage · Vitest · Playwright · Vercel.

## Architecture
See `docs/architecture.md`. Browser encrypts → Next.js API (auth, quota, signed URLs) → Supabase Storage for ciphertext, Postgres for metadata.

## Security model
See `docs/security-model.md`.

## Install and run (Windows PowerShell)
```powershell
npm install
Copy-Item .env.example .env.local   # fill in values
npm run dev
```
Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `IP_HASH_SALT` (optional: `STORAGE_BUCKET`). No card or extra account is needed: files are stored in Supabase Storage. Quota limits live in the database (`docs/cost-guide.md`).

## Scripts
`npm run typecheck` · `npm run lint` · `npm test` · `npm run build` · `npm run test:e2e` · `npm run scan:secrets`

## Verification status (what was actually run in the build environment)
- TypeScript, ESLint: clean. Vitest: unit, crypto, assistant and in-memory-Postgres (PGlite) RLS/quota tests passed. Production build passed. Playwright smoke tests (landing, redirects, headers, share error page; desktop and mobile Chromium) passed.
- **Not verified:** real Supabase Auth/MFA, email delivery, real Supabase Storage uploads/downloads (signed upload URL with a raw PUT body), Vercel deployment, PDF rendering in a browser with a real file.

## Documentation
`docs/api.md`, `docs/deployment.md`, `docs/cost-guide.md`, `docs/github-guide.md`, `docs/run-guide-windows.md`, `docs/resume-and-interview.md`.

## Future work
Redis-backed rate limiting, shared-folder collaboration, resumable uploads, authenticated-encryption key rotation, offline support.

## Contributing / License
See `CONTRIBUTING.md`. MIT licensed (`LICENSE`).
