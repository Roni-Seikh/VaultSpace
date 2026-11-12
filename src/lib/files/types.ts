/**
 * Client-side file type validation. Runs in the browser BEFORE encryption, because after
 * encryption the server can only see ciphertext and cannot inspect content.
 *
 * We never trust the extension alone: the leading bytes must match the claimed type.
 * Anything executable or renderable-as-code (exe, dll, sh, js, html, svg, …) is refused outright.
 */

export type MimeCategory =
  | "image"
  | "video"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "text"
  | "archive";

export const MIME_CATEGORIES: readonly MimeCategory[] = [
  "image", "video", "document", "spreadsheet", "presentation", "text", "archive",
];

export interface DetectedType {
  category: MimeCategory;
  mime: string;
  ext: string;
}

export type DetectResult = { ok: true; type: DetectedType } | { ok: false; reason: string };

/** Every MIME type the app will ever store. The API validates against this list too. */
export const ALLOWED_MIMES = new Set<string>([
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "video/mp4", "video/quicktime", "video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain", "text/csv", "text/markdown",
  "application/zip", "application/x-7z-compressed", "application/vnd.rar", "application/gzip",
]);

export const BLOCKED_EXTENSIONS = new Set([
  "exe", "dll", "com", "scr", "msi", "bat", "cmd", "ps1", "psm1", "vbs", "vbe", "wsf", "jar", "apk",
  "app", "bin", "sh", "bash", "zsh", "csh", "js", "mjs", "cjs", "ts", "py", "pl", "rb", "php", "lnk",
  "reg", "hta", "cpl", "html", "htm", "xhtml", "svg", "xml", "swf", "iso", "dmg", "pkg", "deb", "rpm",
]);

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? name;
  const dot = base.lastIndexOf(".");
  return dot > 0 && dot < base.length - 1 ? base.slice(dot + 1).toLowerCase() : "";
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

function looksExecutable(head: Uint8Array): boolean {
  return (
    startsWith(head, [0x4d, 0x5a]) || // MZ (Windows PE)
    startsWith(head, [0x7f, 0x45, 0x4c, 0x46]) || // ELF
    startsWith(head, [0x23, 0x21]) || // #! script
    startsWith(head, [0xcf, 0xfa, 0xed, 0xfe]) || // Mach-O
    startsWith(head, [0xce, 0xfa, 0xed, 0xfe]) ||
    startsWith(head, [0xfe, 0xed, 0xfa, 0xce]) ||
    startsWith(head, [0xfe, 0xed, 0xfa, 0xcf]) ||
    startsWith(head, [0xca, 0xfe, 0xba, 0xbe]) // Mach-O fat / Java class
  );
}

function containsAscii(haystacks: Uint8Array[], needle: string): boolean {
  const n = Array.from(needle, (c) => c.charCodeAt(0));
  return haystacks.some((h) => {
    outer: for (let i = 0; i <= h.length - n.length; i++) {
      for (let j = 0; j < n.length; j++) if (h[i + j] !== n[j]) continue outer;
      return true;
    }
    return false;
  });
}

const OOXML = {
  docx: { marker: "word/", category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  xlsx: { marker: "xl/", category: "spreadsheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  pptx: { marker: "ppt/", category: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
} as const;

const fail = (reason: string): DetectResult => ({ ok: false, reason });
const ok = (category: MimeCategory, mime: string, ext: string): DetectResult => ({ ok: true, type: { category, mime, ext } });

export function isLikelyText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}

/** Pure detection on pre-read bytes (unit-testable without File objects). */
export function detectFromBytes(name: string, head: Uint8Array, tail: Uint8Array): DetectResult {
  const ext = extensionOf(name);
  if (!ext) return fail("Files need an extension so the type can be verified.");
  if (BLOCKED_EXTENSIONS.has(ext)) return fail(`".${ext}" files are not allowed for security reasons.`);
  if (head.length === 0) return fail("Empty files cannot be uploaded.");
  if (looksExecutable(head)) return fail("Executable files are not allowed.");

  const mismatch = () => fail(`The file content does not match its ".${ext}" extension.`);

  // ---- images ----
  if (startsWith(head, [0xff, 0xd8, 0xff])) {
    return ["jpg", "jpeg", "jpe"].includes(ext) ? ok("image", "image/jpeg", ext) : mismatch();
  }
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return ext === "png" ? ok("image", "image/png", ext) : mismatch();
  }
  if (ascii(head, 0, 6) === "GIF87a" || ascii(head, 0, 6) === "GIF89a") {
    return ext === "gif" ? ok("image", "image/gif", ext) : mismatch();
  }
  if (ascii(head, 0, 4) === "RIFF" && ascii(head, 8, 12) === "WEBP") {
    return ext === "webp" ? ok("image", "image/webp", ext) : mismatch();
  }

  // ---- video ----
  if (ascii(head, 4, 8) === "ftyp") {
    const brand = ascii(head, 8, 12);
    if (["mp4", "m4v"].includes(ext)) return ok("video", "video/mp4", ext);
    if (ext === "mov" && (brand === "qt  " || brand.length === 4)) return ok("video", "video/quicktime", ext);
    return mismatch();
  }
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) {
    return ext === "webm" ? ok("video", "video/webm", ext) : mismatch();
  }

  // ---- PDF ----
  if (ascii(head, 0, Math.min(head.length, 1024)).includes("%PDF-")) {
    return ext === "pdf" ? ok("document", "application/pdf", ext) : mismatch();
  }

  // ---- legacy Office (OLE2) ----
  if (startsWith(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) {
    if (ext === "doc") return ok("document", "application/msword", ext);
    if (ext === "xls") return ok("spreadsheet", "application/vnd.ms-excel", ext);
    if (ext === "ppt") return ok("presentation", "application/vnd.ms-powerpoint", ext);
    return mismatch();
  }

  // ---- ZIP family (zip, docx, xlsx, pptx) ----
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04]) || startsWith(head, [0x50, 0x4b, 0x05, 0x06])) {
    if (ext === "zip") return ok("archive", "application/zip", ext);
    if (ext === "docx" || ext === "xlsx" || ext === "pptx") {
      const spec = OOXML[ext];
      if (!containsAscii([head, tail], "[Content_Types].xml") || !containsAscii([head, tail], spec.marker)) {
        return fail(`This does not look like a valid .${ext} file.`);
      }
      return ok(spec.category, spec.mime, ext);
    }
    return mismatch();
  }

  // ---- other archives ----
  if (startsWith(head, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) {
    return ext === "7z" ? ok("archive", "application/x-7z-compressed", ext) : mismatch();
  }
  if (ascii(head, 0, 4) === "Rar!") {
    return ext === "rar" ? ok("archive", "application/vnd.rar", ext) : mismatch();
  }
  if (startsWith(head, [0x1f, 0x8b])) {
    return ["gz", "tgz"].includes(ext) ? ok("archive", "application/gzip", ext) : mismatch();
  }

  // ---- plain text (no magic number; must be valid UTF-8 without NUL bytes) ----
  if (["txt", "csv", "md"].includes(ext)) {
    if (!isLikelyText(head)) return fail("This does not look like a text file.");
    const mime = ext === "csv" ? "text/csv" : ext === "md" ? "text/markdown" : "text/plain";
    return ok("text", mime, ext);
  }

  return fail(`".${ext}" files are not supported or the content does not match the extension.`);
}

const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 128 * 1024;

export async function detectFileType(file: File): Promise<DetectResult> {
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const tail = new Uint8Array(await file.slice(Math.max(0, file.size - TAIL_BYTES)).arrayBuffer());
  return detectFromBytes(file.name, head, tail);
}

/** Only these categories may be previewed in the browser, and only after local decryption. */
export const PREVIEWABLE_MIMES = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm", "video/quicktime",
  "application/pdf", "text/plain", "text/csv", "text/markdown",
]);

const CATEGORY_BY_MIME: Record<string, MimeCategory> = {
  "image/jpeg": "image", "image/png": "image", "image/gif": "image", "image/webp": "image",
  "video/mp4": "video", "video/quicktime": "video", "video/webm": "video",
  "application/pdf": "document", "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "spreadsheet",
  "application/vnd.ms-powerpoint": "presentation",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "presentation",
  "text/plain": "text", "text/csv": "text", "text/markdown": "text",
  "application/zip": "archive", "application/x-7z-compressed": "archive",
  "application/vnd.rar": "archive", "application/gzip": "archive",
};

export function categoryOfMime(mime: string): MimeCategory | null {
  return CATEGORY_BY_MIME[mime] ?? null;
}
