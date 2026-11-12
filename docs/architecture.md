# Architecture

```
Browser (Next.js client)
  ├─ Web Crypto AES-GCM + Argon2id (hash-wasm)   ← keys exist only here
  ├─ calls /api/* (JSON, wrapped keys, encrypted names)
  └─ PUT/GET ciphertext directly to R2 via presigned URLs
Next.js on Vercel (route handlers, proxy.ts)
  ├─ Supabase Auth (cookies via @supabase/ssr)
  ├─ Supabase Postgres (RLS + service-role SQL functions for quota)
  └─ Cloudflare R2 (private bucket, S3 API)
```

Upload: validate magic bytes → encrypt → `upload-init` (reserve quota) → PUT to R2 → `upload-complete` (HEAD size check, commit) → `upload-abort` on failure. Stale reservations are cleaned by `/api/cron/maintenance`.

Tables: profiles, encryption_metadata, folders, files, file_versions, shares, user_sessions, activity_logs, security_events, storage_usage, app_capacity. Migrations: `supabase/migrations/0001_schema.sql`, `0002_functions.sql`, `0003_rls.sql`.

Quota: counted on ciphertext bytes across all versions; reserve→complete→cancel; lock order `app_capacity` then user's `storage_usage` (no deadlocks). Limits are rows in the DB, not env vars.

AI assistant: runs entirely in the browser over decrypted metadata (rule-based query parser, MiniSearch fuzzy fallback, extractive summarizer). No external AI service and no data leaves the device.
