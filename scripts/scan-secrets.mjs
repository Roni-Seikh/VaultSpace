// Simple credential scanner. Usage: node scripts/scan-secrets.mjs  (exit 1 if anything suspicious is found)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "coverage"]);
const SKIP_FILES = new Set(["package-lock.json", "scan-secrets.mjs"]);
const PATTERNS = [
  ["AWS/R2 style access key", /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
  ["Private key block", /-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ["JWT (Supabase key?)", /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/],
  ["Supabase secret key", /\bsb_secret_[A-Za-z0-9_-]{10,}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{30,}\b/],
  ["Hard-coded secret assignment", /(SERVICE_ROLE_KEY|SECRET_ACCESS_KEY|CRON_SECRET|IP_HASH_SALT)\s*[:=]\s*["']?[A-Za-z0-9/+_-]{20,}/],
];

const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    const rel = relative(ROOT, p);
    if (SKIP_FILES.has(name) || st.size > 2_000_000) continue;
    if (/^\.env(\.|$)/.test(name) && name !== ".env.example") hits.push([rel, 0, "Environment file must not be committed"]);
    if (/\.(png|jpe?g|gif|ico|woff2?|zip|pdf)$/i.test(name)) continue;
    const lines = readFileSync(p, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const [label, re] of PATTERNS) if (re.test(line)) hits.push([rel, i + 1, label]);
    });
  }
}
walk(ROOT);

if (hits.length) {
  console.error("Possible secrets found:");
  for (const [f, l, why] of hits) console.error(`  ${f}:${l}  ${why}`);
  process.exit(1);
}
console.log("Secret scan clean: no credential patterns or .env files found.");
