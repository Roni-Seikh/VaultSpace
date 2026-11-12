# Run guide (Windows PowerShell)
```powershell
node -v; npm -v                 # Node 20+ required
cd C:\path\to\VaultSpace
npm install
Copy-Item .env.example .env.local   # then edit with VS Code: code .env.local
npm run dev                          # http://localhost:3000
```
Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run scan:secrets`.
End-to-end browser tests: `npx playwright install chromium` then `npm run test:e2e` (it builds nothing; run `npm run build` first).
Without Supabase/R2 configured the landing page, auth forms and share error pages still render; sign-in and file operations need the services (see deployment.md).
