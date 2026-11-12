/** Extractive summariser: picks the most representative sentences. Runs locally; no model, no network. */

const STOP = new Set(("a about above after again against all am an and any are as at be because been before being below between both but by can did do does doing down during each few for from further had has have having he her here hers him his how i if in into is it its itself just me more most my no nor not now of off on once only or other our out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with you your").split(" "));

export function splitSentences(text: string): string[] {
  return text.replace(/\s+/g, " ").match(/[^.!?]+(?:[.!?]+["')\]]*|$)/g)?.map((s) => s.trim()).filter((s) => s.length >= 25 && /[a-z]/i.test(s)) ?? [];
}

function words(s: string): string[] {
  return s.toLowerCase().match(/[a-z][a-z'-]{2,}/g)?.filter((w) => !STOP.has(w)) ?? [];
}

export interface Summary { sentences: string[]; usedChars: number; truncated: boolean }

export function summarize(text: string, maxSentences = 5, maxChars = 200_000): Summary | null {
  const truncated = text.length > maxChars;
  const sentences = splitSentences(truncated ? text.slice(0, maxChars) : text);
  if (sentences.length === 0) return null;
  if (sentences.length <= maxSentences) return { sentences, usedChars: Math.min(text.length, maxChars), truncated };

  const freq = new Map<string, number>();
  for (const s of sentences) for (const w of words(s)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const scored = sentences.map((s, i) => {
    const ws = words(s);
    const score = ws.length ? ws.reduce((n, w) => n + (freq.get(w) ?? 0), 0) / Math.sqrt(ws.length) : 0;
    return { s, i, score: score * (i < 3 ? 1.15 : 1) };
  });
  const top = scored.sort((a, b) => b.score - a.score).slice(0, maxSentences).sort((a, b) => a.i - b.i);
  return { sentences: top.map((t) => t.s), usedChars: Math.min(text.length, maxChars), truncated };
}
