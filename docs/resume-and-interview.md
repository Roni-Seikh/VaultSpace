# Resume, interview and demo pack

## Resume description
**VaultSpace** — privacy-first cloud storage web app (Next.js, TypeScript, Supabase, Cloudflare R2). Files and names are encrypted in the browser (AES-256-GCM, Argon2id-derived keys) before upload.

## Resume bullets (edit to match what you actually deploy and measure)
- Built a full-stack encrypted storage app with Next.js App Router, TypeScript, Supabase (Postgres, Auth, RLS) and Cloudflare R2 using presigned URLs.
- Designed a key hierarchy (passphrase → Argon2id → KEK → master key → per-file keys) and a chunked AES-GCM format that resists chunk reorder/truncation.
- Implemented secure share links with expiry, optional password, revocation, and the decryption key kept in the URL fragment.
- Enforced per-user and global storage quotas atomically in Postgres (reserve/commit/cancel functions) and verified with an in-memory Postgres test suite.
- Wrote unit, DB and Playwright tests; added CI and a secret-scanning workflow.

GitHub description: Privacy-first cloud storage with client-side AES-256-GCM encryption, secure sharing, versioning and quota control.

## Presentation outline
1. Problem: cloud storage providers can read your files. 2. Approach & threat model. 3. Architecture. 4. Crypto design. 5. Upload/quota flow. 6. Sharing design. 7. Testing. 8. Limits (not zero-knowledge; lost keys = lost data). 9. Demo. 10. Future work.

## Interview explanation (60 s)
"Files are encrypted in the browser with a random key per file, and those keys are wrapped by a master key derived from the user's passphrase with Argon2id. The server only holds ciphertext, so a database or bucket leak doesn't expose content. Uploads go straight to R2 with short-lived presigned URLs, and Postgres functions reserve quota atomically so concurrent uploads can't exceed limits."

## Q&A
- **Is it zero-knowledge?** No. The server sees email, sizes, categories, timestamps; and it serves the JS, so a compromised server could ship malicious code.
- **Why AES-GCM chunks with AAD?** Authenticated per chunk, and binding index+final flag prevents reorder, truncation and splicing.
- **Why keep the share secret in the fragment?** Browsers don't send it to servers; the server can't decrypt shared files.
- **What if the user forgets the passphrase?** Use the recovery key; if both are lost, data is unrecoverable.
- **How do you stop quota races?** Row locks in a fixed order inside security-definer SQL functions; tested.
- **How is validation done on encrypted files?** Magic bytes in the browser before encryption; server enforces MIME allow-list and size, but cannot inspect content.
- **What isn't tested?** Live Supabase Auth and R2 flows; add them in staging.

## Demo script (5 min)
Register → create vault, save recovery key → upload image/PDF/>4 MiB file → preview → rename/move → new version and restore → share link with password+expiry, open in private window → revoke, reload (404) → enable MFA → show Security and Storage pages → show admin overview.
