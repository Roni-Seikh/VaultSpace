export const MIN_PASSPHRASE_LENGTH = 12;

export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string; ok: boolean; hint: string }

const COMMON = ["password", "passphrase", "qwerty", "123456", "letmein", "welcome", "iloveyou", "admin", "vaultspace"];

/** Lightweight, offline strength estimate (length + variety + obvious patterns). Not a guarantee. */
export function assessPassphrase(p: string): Strength {
  const labels = ["Too weak", "Weak", "Fair", "Good", "Strong"] as const;
  if (p.length < MIN_PASSPHRASE_LENGTH) {
    return { score: p.length > 7 ? 1 : 0, label: p.length ? "Too short" : "", ok: false, hint: `Use at least ${MIN_PASSPHRASE_LENGTH} characters. A few random words work well.` };
  }
  const lower = p.toLowerCase();
  if (COMMON.some((c) => lower.includes(c)) && p.length < 20) {
    return { score: 1, label: labels[1], ok: false, hint: "Avoid common words. Use unrelated words or a longer phrase." };
  }
  if (/^(.)\1+$/.test(p) || /^(?:0123456789|abcdefghij)/i.test(p)) {
    return { score: 0, label: labels[0], ok: false, hint: "Avoid repeated or sequential characters." };
  }
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  const unique = new Set(p).size;
  let score = 1;
  if (p.length >= 14) score++;
  if (p.length >= 18 || (p.length >= 14 && classes >= 3)) score++;
  if (p.length >= 24 || (p.length >= 18 && classes >= 3 && unique >= 12)) score++;
  const s = Math.min(4, score) as 1 | 2 | 3 | 4;
  return { score: s, label: labels[s], ok: s >= 2, hint: s >= 3 ? "Nice. Remember: nobody can reset this for you." : "Longer is better: add more words." };
}
