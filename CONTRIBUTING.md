# Contributing

1. Fork, then create a branch: `git checkout -b feature/short-name`.
2. `npm install`, copy `.env.example` to `.env.local` (never commit it).
3. Before opening a PR run: `npm run typecheck && npm run lint && npm test && npm run scan:secrets`.
4. Security-sensitive changes (crypto, RLS, quota SQL, share links) need a test that fails without the change.
5. Do not add telemetry, paid APIs, or claims that are not true (for example "zero-knowledge").
