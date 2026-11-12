# API reference

All endpoints are Next.js route handlers under `/api`. Unless marked **public**, they require a signed-in Supabase session (cookie) and, for accounts with a verified TOTP factor, an `aal2` session.
Mutating requests (`POST/PUT/PATCH/DELETE`) are rejected unless the `Origin` header matches the app's origin. Errors are JSON: `{ "error": { "code": "...", "message": "..." } }`.
Request bodies are validated with Zod (`src/lib/validation/schemas.ts`). All names/keys in bodies are opaque client-encrypted base64 blobs.

| Method & path | Auth | Body / params | Purpose |
|---|---|---|---|
| `GET /api/health` | public | – | `{status:"ok"}` (200) or `{status:"degraded"}` (503). One tiny DB query. |
| `GET /api/vault` | user | – | Returns the user's encryption metadata (salt, KDF params, wrapped keys) or `null`. |
| `POST /api/vault` | user | `vaultSchema` | Creates vault metadata once (409 if exists). |
| `PUT /api/vault` | user | `vaultSchema` | Replaces wraps (passphrase change / recovery-key regeneration). |
| `GET /api/library` | user | – | All folders and files (latest version metadata) for the user. |
| `POST /api/files/upload-init` | user | `uploadInitSchema` | Reserves quota (server-enforced per-user + global cap), returns `{versionId, fileId, uploadUrl}`, a 300 s presigned PUT with a signed content-length. |
| `POST /api/files/upload-complete` | user | `{versionId}` | HEADs the R2 object, checks size equals reservation, commits. |
| `POST /api/files/upload-abort` | user | `{versionId}` | Releases the reservation and deletes any partial object. |
| `PATCH /api/files/:id` | user | `{nameEnc?, folderId?}` | Rename / move. |
| `DELETE /api/files/:id` | user | – | Deletes file, all versions, R2 objects, frees quota. |
| `GET /api/files/:id/download?version=n` | user | – | 60 s presigned GET for the ciphertext. |
| `GET /api/files/:id/key?version=n` | user | – | Wrapped file key (client unwraps). |
| `POST /api/files/:id/copy` | user | `{nameEnc, folderId?}` | Server-side R2 copy; counts toward quota. |
| `GET /api/files/:id/versions` | user | – | Version list. |
| `DELETE /api/files/:id/versions/:v` | user | – | Delete one non-current version. |
| `POST /api/files/:id/versions/:v/restore` | user | – | Make an older version current. |
| `POST /api/folders` | user | `{nameEnc, parentId?}` | Create folder. |
| `PATCH /api/folders/:id` | user | `{nameEnc?, parentId?}` | Rename / move (cycles rejected by DB trigger). |
| `DELETE /api/folders/:id` | user | – | Deletes folder tree and contained files. |
| `GET /api/shares` | user | – | The user's share links. |
| `POST /api/shares` | user | `shareCreateSchema` | Creates a link. Server stores only SHA-256 of the token. Returns the token once. |
| `DELETE /api/shares/:id` | user | – | Revokes a link. |
| `GET /api/public/shares/:token` | **public**, rate-limited | – | Link metadata (encrypted name, size, whether a password is needed). Unknown/revoked/expired → identical 404. |
| `POST /api/public/shares/:token/access` | **public**, rate-limited | `{gateToken?}` | Re-checks expiry/revocation/password gate, returns a 60 s download URL and wrapped key; increments access count atomically. |
| `GET /api/storage` | user | – | Usage vs per-user quota, plus global capacity. |
| `GET /api/activity?limit&scope` | user | – | The user's audit log (no secrets stored). |
| `GET/PATCH /api/settings` | user | `settingsSchema` | Profile preferences. |
| `GET /api/security` | user | – | Sessions and recent security events. |
| `POST /api/security/event` | user | event name | Records client-observed security events (e.g. vault unlock failure). |
| `DELETE /api/account` | user | `{confirm:"DELETE"}` | Deletes R2 objects, DB rows and the auth user. Admins cannot delete themselves via the API. |
| `GET /api/admin/overview` | admin | – | Aggregate counts and storage. No file contents or names. |
| `GET /api/admin/users` | admin | `?q` | User list with usage (emails, no file data). |
| `GET /api/admin/events` | admin | – | Recent security events. |
| `GET/POST /api/cron/maintenance` | `Authorization: Bearer $CRON_SECRET` | – | Cleans stale reservations, prunes old logs, recomputes usage. |

Rate limits are in-memory per serverless instance, so they are best-effort, not a hard guarantee.
View-only share links are a UI restriction only: anyone holding the link can obtain the ciphertext and key, so a determined recipient can save the file.
