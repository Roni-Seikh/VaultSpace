/**
 * Local, rule-based query understanding. No network, no model: everything runs in the browser over
 * already-decrypted file NAMES and plaintext metadata (category, date, size). File contents are not indexed.
 */
import MiniSearch from "minisearch";
import type { FileItem } from "@/lib/client/types";
import type { MimeCategory } from "@/lib/files/types";
import { extensionOf } from "@/lib/files/types";
import { findDuplicateGroups } from "@/lib/files/browse";

export type Intent = "search" | "duplicates" | "summarize" | "largest" | "empty";

export interface ParsedQuery {
  intent: Intent;
  categories: MimeCategory[];
  extension?: string;
  from?: Date;
  to?: Date;
  rangeLabel?: string;
  /** Each group is an OR of synonyms; a file must match every group. */
  keywordGroups: string[][];
  keywords: string[];
}

const TYPE_WORDS: { re: RegExp; category?: MimeCategory; ext?: string }[] = [
  { re: /\bpdfs?\b/, ext: "pdf", category: "document" },
  { re: /\b(photos?|pictures?|images?|photographs?|jpe?gs?|pngs?|screenshots?)\b/, category: "image" },
  { re: /\b(videos?|movies?|clips?|mp4s?|mov)\b/, category: "video" },
  { re: /\b(spreadsheets?|excel|xlsx?|csv)\b/, category: "spreadsheet" },
  { re: /\b(presentations?|slides?|powerpoint|pptx?)\b/, category: "presentation" },
  { re: /\b(word|docx?|documents?|docs?)\b/, category: "document" },
  { re: /\b(text|txt|notes?)\b(?!\s+(?:with|containing))/, category: "text" },
  { re: /\b(archives?|zip|zips|zipped|compressed)\b/, category: "archive" },
];

const SYNONYMS: Record<string, string[]> = {
  certificate: ["certificate", "certification", "cert", "diploma", "degree"],
  invoice: ["invoice", "bill", "receipt"],
  resume: ["resume", "cv", "curriculum"],
  photo: ["photo", "picture", "image", "img"],
  report: ["report", "summary"],
  id: ["id", "passport", "license", "licence", "aadhaar", "aadhar", "pan"],
};

const STOP = new Set([
  "a", "an", "the", "my", "me", "all", "any", "some", "of", "in", "on", "at", "to", "for", "from", "with", "by", "and", "or", "is", "are", "was", "were",
  "find", "show", "search", "list", "get", "give", "look", "locate", "display", "open", "please", "can", "you", "i", "have", "has", "that", "this", "those", "these",
  "file", "files", "uploaded", "upload", "added", "created", "word", "words", "named", "called", "containing", "contains", "contain", "name", "names", "which", "where", "what",
  "last", "this", "week", "month", "today", "yesterday", "past", "recent", "recently", "ago", "days", "day", "weeks", "months", "year", "years", "since", "before", "after",
  "pdf", "pdfs", "photo", "photos", "picture", "pictures", "image", "images", "photograph", "photographs", "video", "videos", "document", "documents", "doc", "docs",
  "spreadsheet", "spreadsheets", "presentation", "presentations", "slides", "archive", "archives", "zip", "text", "duplicate", "duplicates", "duplicated", "same", "copies",
  "largest", "biggest", "heaviest", "summarize", "summarise", "summary", "summarizing", "about", "tl;dr", "tldr", "do", "does", "there", "any",
]);

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const daysAgo = (now: Date, n: number) => { const x = startOfDay(now); x.setDate(x.getDate() - n); return x; };

function parseRange(q: string, now: Date): Pick<ParsedQuery, "from" | "to" | "rangeLabel"> {
  const n = q.match(/\b(?:last|past)\s+(\d{1,3})\s+(day|week|month)s?\b/);
  if (n) {
    const count = Number(n[1]);
    const days = n[2] === "day" ? count : n[2] === "week" ? count * 7 : count * 30;
    return { from: daysAgo(now, days), to: now, rangeLabel: `the last ${count} ${n[2]}${count === 1 ? "" : "s"}` };
  }
  if (/\btoday\b/.test(q)) return { from: startOfDay(now), to: now, rangeLabel: "today" };
  if (/\byesterday\b/.test(q)) return { from: daysAgo(now, 1), to: startOfDay(now), rangeLabel: "yesterday" };
  if (/\blast week\b|\bpast week\b/.test(q)) return { from: daysAgo(now, 7), to: now, rangeLabel: "the last 7 days" };
  if (/\bthis week\b/.test(q)) { const d = startOfDay(now); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return { from: d, to: now, rangeLabel: "this week (since Monday)" }; }
  if (/\blast month\b|\bpast month\b/.test(q)) return { from: daysAgo(now, 30), to: now, rangeLabel: "the last 30 days" };
  if (/\bthis month\b/.test(q)) return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now, rangeLabel: "this month" };
  if (/\blast year\b|\bpast year\b/.test(q)) return { from: daysAgo(now, 365), to: now, rangeLabel: "the last 365 days" };
  if (/\bthis year\b/.test(q)) return { from: new Date(now.getFullYear(), 0, 1), to: now, rangeLabel: "this year" };
  return {};
}

function singular(w: string) { return w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w; }

export function parseQuery(input: string, now: Date = new Date()): ParsedQuery {
  const q = input.toLowerCase().replace(/[“”"']/g, " ").replace(/[?!.,]+/g, " ").replace(/\s+/g, " ").trim();
  if (!q) return { intent: "empty", categories: [], keywordGroups: [], keywords: [] };

  const categories: MimeCategory[] = [];
  let extension: string | undefined;
  // "with the word project" uses "word" as a noun, not the Microsoft Word file type.
  const typeText = q.replace(/\b(?:with|containing|contains|has|have|having)\s+(?:the\s+)?words?\b/g, " ");
  for (const t of TYPE_WORDS) {
    if (t.re.test(typeText)) {
      if (t.ext) extension = t.ext;
      if (t.category && !categories.includes(t.category)) categories.push(t.category);
    }
  }
  const intent: Intent = /\bsummar(?:y|i[sz]e|i[sz]ing)\b|\btl;?dr\b/.test(q) ? "summarize"
    : /\bduplicat|\bsame (?:photo|file|image|picture)|\bcopies of\b/.test(q) ? "duplicates"
    : /\b(largest|biggest|heaviest|taking (?:up )?(?:the most )?space)\b/.test(q) ? "largest" : "search";

  const range = parseRange(q, now);
  // "with the word X" / "named X" / "called X": the quoted target is a keyword even if it looks like a stop word.
  const explicit = [...q.matchAll(/\b(?:word|words|named|called|containing|contains)\s+([a-z0-9][\w-]*)/g)].map((m) => m[1]);
  const tokens = q.split(" ").filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t));
  const keywords = [...new Set([...explicit, ...tokens].map(singular).filter((t) => t.length > 1 && !STOP.has(t)))];

  const keywordGroups = keywords.map((k) => SYNONYMS[k] ?? [k]);
  return { intent, categories, extension, ...range, keywordGroups, keywords };
}

export interface AssistantResult {
  summary: string;
  files: FileItem[];
  groups?: FileItem[][];
  interpretation: string;
  /** True when results came from fuzzy "similar name" matching rather than exact matches. */
  fuzzy?: boolean;
}

function matchesName(name: string, group: string[]): boolean {
  const n = name.toLowerCase();
  return group.some((g) => n.includes(g));
}

export function runQuery(parsed: ParsedQuery, files: FileItem[]): AssistantResult {
  const parts: string[] = [];
  if (parsed.extension) parts.push(`.${parsed.extension} files`);
  else if (parsed.categories.length) parts.push(parsed.categories.join(" / ") + " files");
  if (parsed.keywords.length) parts.push(`names containing ${parsed.keywords.map((k) => `"${k}"`).join(" and ")}`);
  if (parsed.rangeLabel) parts.push(`added ${parsed.rangeLabel}`);
  const interpretation = parts.length ? `I looked for ${parts.join(", ")}.` : "I looked at all your files.";

  if (parsed.intent === "duplicates") {
    const pool = files.filter((f) => (!parsed.categories.length || parsed.categories.includes(f.category)));
    const groups = findDuplicateGroups(pool);
    return {
      summary: groups.length
        ? `Found ${groups.length} set${groups.length === 1 ? "" : "s"} of duplicates (${groups.reduce((n, g) => n + g.length, 0)} files). Matching uses a keyed hash computed in your browser, so only byte-identical files are flagged.`
        : "No exact duplicates found. Files uploaded before duplicate detection was available cannot be compared, and visually similar (but not identical) photos are not detected.",
      files: groups.flat(), groups, interpretation,
    };
  }

  let pool = files.filter((f) => {
    if (parsed.extension) { if (extensionOf(f.name) !== parsed.extension && !(parsed.extension === "pdf" && f.mimeType === "application/pdf")) return false; }
    else if (parsed.categories.length && !parsed.categories.includes(f.category)) return false;
    if (parsed.from && new Date(f.createdAt) < parsed.from) return false;
    if (parsed.to && new Date(f.createdAt) > parsed.to) return false;
    return parsed.keywordGroups.every((g) => matchesName(f.name, g));
  });

  let fuzzy = false;
  if (pool.length === 0 && parsed.keywords.length) {
    // Fall back to typo-tolerant matching over names (MiniSearch).
    const scoped = files.filter((f) => (!parsed.categories.length || parsed.categories.includes(f.category)) && (!parsed.from || new Date(f.createdAt) >= parsed.from) && (!parsed.to || new Date(f.createdAt) <= parsed.to));
    const ms = new MiniSearch<{ id: string; name: string }>({ fields: ["name"], storeFields: ["id"], tokenize: (s) => s.split(/[\s._\-()]+/).filter(Boolean) });
    ms.addAll(scoped.map((f) => ({ id: f.id, name: f.name })));
    const hits = ms.search(parsed.keywords.join(" "), { prefix: true, fuzzy: 0.25, combineWith: "OR" });
    const byId = new Map(scoped.map((f) => [f.id, f]));
    pool = hits.map((h) => byId.get(h.id as string)).filter((f): f is FileItem => !!f);
    fuzzy = pool.length > 0;
  }

  if (parsed.intent === "largest") pool = [...pool].sort((a, b) => b.size - a.size).slice(0, 10);
  else if (!fuzzy) pool = [...pool].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const summary = pool.length === 0
    ? "No files matched. Searches use file names and dates only; contents are not indexed."
    : parsed.intent === "largest" ? `Your ${pool.length} largest matching file${pool.length === 1 ? "" : "s"}:`
    : fuzzy ? `No exact matches, but ${pool.length} file${pool.length === 1 ? " has a similar name" : "s have similar names"}:`
    : `Found ${pool.length} file${pool.length === 1 ? "" : "s"}.`;
  return { summary, files: pool.slice(0, 100), interpretation, fuzzy };
}

/** For "summarize X": pick the file whose name best matches the words in the request. */
export function pickSummaryTarget(parsed: ParsedQuery, files: FileItem[]): FileItem | null {
  const candidates = files.filter((f) => !parsed.categories.length || parsed.categories.includes(f.category));
  if (parsed.keywords.length === 0) return null;
  const scored = candidates.map((f) => {
    const n = f.name.toLowerCase();
    return { f, score: parsed.keywords.filter((k) => n.includes(k)).length };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score || b.f.createdAt.localeCompare(a.f.createdAt));
  return scored[0]?.f ?? null;
}
