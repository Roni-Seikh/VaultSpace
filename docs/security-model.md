# Security model

## What VaultSpace is
Client-side-encrypted cloud storage: files and file/folder names are encrypted in the browser with AES-256-GCM before upload. R2 and Supabase store ciphertext and encrypted metadata.

## What we do NOT claim
We do not call this "zero-knowledge". The server still knows: your email, file sizes, MIME category, timestamps, folder structure shape (IDs), share metadata, and IP-derived hashes in logs. The server operator also ships the JavaScript that does the encryption, so a malicious or compromised deployment could serve code that exfiltrates keys. Client-side E2EE protects against storage-provider and database leaks, not against a compromised app server.

## Keys
- Vault passphrase → Argon2id (64 MiB, 3 iterations, 1 lane via hash-wasm) → HKDF → KEK. The KEK wraps a random 256-bit master key.
- A second wrap of the master key uses a random 32-byte recovery key shown once.
- **If you lose both the passphrase and the recovery key, your data cannot be recovered. No one, including the operator, can help.**
- Each file gets its own random AES-256 key, wrapped by a master-derived key. Names are encrypted with a separate derived key; duplicate detection uses an HMAC (reveals equality of identical files to the account owner's client only).
- Keys live in memory only; the vault auto-locks after 15 minutes idle and on reload.

## File format
16-byte header `VSP1 | chunkSize | noncePrefix`, then 4 MiB AES-GCM chunks. IV = prefix‖counter; AAD = header‖chunkIndex‖finalFlag, preventing reorder, truncation and splicing.

## Sharing
Link: `/s/<token>#<secret>`. The secret in the fragment never goes to the server. Server stores SHA-256(token). Password-protected links add an Argon2id-derived key and a gate token (server stores only its hash). Expiry and revocation are re-checked each request. Unknown/revoked/expired are indistinguishable. Pages send `Referrer-Policy: no-referrer` and `noindex`.

## Server controls
- Row Level Security on every table; users cannot change role or quota (column-level grants).
- Quota/capacity functions are `security definer`, callable by `service_role` only, with fixed lock ordering.
- Presigned URLs: 300 s upload with signed content-length, 60 s download. Bucket is private.
- File type validation by magic bytes in the browser; executables/HTML/SVG/etc. are refused; previews only for an allow-list, PDFs rendered to canvas.
- Same-origin checks, MFA (TOTP) enforcement, rate limiting (best-effort), CSP and security headers, audit logs without secrets.
- Service-role and R2 secrets are server-only (`server-only` import guard).

## Known limitations
- Server-side validation cannot inspect encrypted content; type checks are client-side and bypassable by a malicious client (impact is limited to that user's own storage, never executed).
- In-memory rate limiting does not coordinate across instances.
- Live Supabase/R2 flows were not exercised in the build environment (see README, "Verification status").
