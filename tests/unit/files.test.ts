// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectFromBytes, extensionOf } from "@/lib/files/types";
import { copyName, sanitizeFileName, sanitizeFolderName } from "@/lib/files/names";
import { formatBytes, percent, timeAgo } from "@/lib/format";
import {
  settingsSchema, shareCreateSchema, shareTokenSchema, uploadInitSchema, vaultSchema,
} from "@/lib/validation/schemas";

const bytes = (...v: number[]) => new Uint8Array(v);
const withAscii = (prefix: number[], text: string, at: number, total = 64) => {
  const b = new Uint8Array(total);
  b.set(prefix);
  for (let i = 0; i < text.length; i++) b[at + i] = text.charCodeAt(i);
  return b;
};
const text = (s: string) => new TextEncoder().encode(s);
const none = new Uint8Array(0);

describe("detectFromBytes: accepts genuine files", () => {
  it("JPEG / PNG / GIF / WEBP", () => {
    expect(detectFromBytes("a.jpg", bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0), none)).toMatchObject({ ok: true, type: { category: "image", mime: "image/jpeg" } });
    expect(detectFromBytes("A.JPEG", bytes(0xff, 0xd8, 0xff, 0xe1), none)).toMatchObject({ ok: true });
    expect(detectFromBytes("a.png", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0), none)).toMatchObject({ ok: true, type: { mime: "image/png" } });
    expect(detectFromBytes("a.gif", text("GIF89a\u0001\u0000"), none)).toMatchObject({ ok: true, type: { mime: "image/gif" } });
    const webp = withAscii([], "RIFF", 0);
    webp.set(text("WEBP"), 8);
    expect(detectFromBytes("a.webp", webp, none)).toMatchObject({ ok: true, type: { mime: "image/webp" } });
  });

  it("MP4, MOV, WEBM", () => {
    const ftyp = (brand: string) => withAscii([0, 0, 0, 0x20], "ftyp" + brand, 4);
    expect(detectFromBytes("v.mp4", ftyp("isom"), none)).toMatchObject({ ok: true, type: { category: "video", mime: "video/mp4" } });
    expect(detectFromBytes("v.mov", ftyp("qt  "), none)).toMatchObject({ ok: true, type: { mime: "video/quicktime" } });
    expect(detectFromBytes("v.webm", bytes(0x1a, 0x45, 0xdf, 0xa3, 1), none)).toMatchObject({ ok: true, type: { mime: "video/webm" } });
  });

  it("PDF and legacy Office", () => {
    expect(detectFromBytes("d.pdf", text("%PDF-1.7\n"), none)).toMatchObject({ ok: true, type: { mime: "application/pdf" } });
    const ole = bytes(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0);
    expect(detectFromBytes("a.doc", ole, none)).toMatchObject({ ok: true, type: { category: "document" } });
    expect(detectFromBytes("a.xls", ole, none)).toMatchObject({ ok: true, type: { category: "spreadsheet" } });
    expect(detectFromBytes("a.ppt", ole, none)).toMatchObject({ ok: true, type: { category: "presentation" } });
  });

  it("OOXML (docx/xlsx/pptx) only when the zip contains the matching parts; plain zip as archive", () => {
    const zip = (...names: string[]) => text("PK\u0003\u0004" + names.join("\u0000"));
    expect(detectFromBytes("a.docx", zip("[Content_Types].xml", "word/document.xml"), none)).toMatchObject({ ok: true, type: { category: "document" } });
    expect(detectFromBytes("a.xlsx", zip("[Content_Types].xml"), zip("xl/workbook.xml"))).toMatchObject({ ok: true, type: { category: "spreadsheet" } });
    expect(detectFromBytes("a.pptx", zip("[Content_Types].xml", "ppt/slides/slide1.xml"), none)).toMatchObject({ ok: true, type: { category: "presentation" } });
    expect(detectFromBytes("a.zip", zip("readme.txt"), none)).toMatchObject({ ok: true, type: { category: "archive", mime: "application/zip" } });
    expect(detectFromBytes("a.docx", zip("readme.txt"), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("a.xlsx", zip("[Content_Types].xml", "word/document.xml"), none)).toMatchObject({ ok: false });
  });

  it("7z / rar / gzip and text files", () => {
    expect(detectFromBytes("a.7z", bytes(0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c, 0), none)).toMatchObject({ ok: true, type: { category: "archive" } });
    expect(detectFromBytes("a.rar", text("Rar!\u001a\u0007"), none)).toMatchObject({ ok: true });
    expect(detectFromBytes("a.gz", bytes(0x1f, 0x8b, 8), none)).toMatchObject({ ok: true });
    expect(detectFromBytes("n.txt", text("hello — wörld 😀"), none)).toMatchObject({ ok: true, type: { category: "text", mime: "text/plain" } });
    expect(detectFromBytes("n.csv", text("a,b\n1,2"), none)).toMatchObject({ ok: true, type: { mime: "text/csv" } });
  });
});

describe("detectFromBytes: rejects dangerous or mismatching files", () => {
  it("rejects blocked extensions regardless of content", () => {
    for (const n of ["x.exe", "x.dll", "x.sh", "x.js", "x.html", "x.htm", "x.svg", "x.bat", "x.ps1", "x.jar", "x.php", "x.xml"]) {
      expect(detectFromBytes(n, text("harmless"), none)).toMatchObject({ ok: false });
    }
  });

  it("rejects executables disguised with safe extensions", () => {
    expect(detectFromBytes("photo.jpg", bytes(0x4d, 0x5a, 0x90, 0), none)).toMatchObject({ ok: false, reason: expect.stringMatching(/executable/i) });
    expect(detectFromBytes("doc.pdf", bytes(0x7f, 0x45, 0x4c, 0x46), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("notes.txt", text("#!/bin/sh\nrm -rf /"), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("a.zip", bytes(0xca, 0xfe, 0xba, 0xbe), none)).toMatchObject({ ok: false });
  });

  it("rejects extension / content mismatches", () => {
    expect(detectFromBytes("fake.jpg", text("%PDF-1.4"), none)).toMatchObject({ ok: false, reason: expect.stringMatching(/does not match/) });
    expect(detectFromBytes("fake.pdf", bytes(0xff, 0xd8, 0xff, 0xe0), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("fake.png", bytes(0xff, 0xd8, 0xff, 0xe0), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("fake.mp4", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), none)).toMatchObject({ ok: false });
  });

  it("rejects binary data pretending to be text, files without extension, and empty files", () => {
    expect(detectFromBytes("bin.txt", bytes(0x68, 0x69, 0x00, 0x01, 0x02), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("bad.txt", bytes(0xff, 0xfe, 0xfd, 0xfc), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("README", text("hello"), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("empty.txt", none, none)).toMatchObject({ ok: false });
    expect(detectFromBytes("x.unknownext", text("hello"), none)).toMatchObject({ ok: false });
  });

  it("does not use double extensions to bypass checks", () => {
    expect(detectFromBytes("invoice.pdf.exe", text("%PDF-1.4"), none)).toMatchObject({ ok: false });
    expect(detectFromBytes("pic.jpg.js", bytes(0xff, 0xd8, 0xff), none)).toMatchObject({ ok: false });
  });

  it("extensionOf handles paths and dotfiles", () => {
    expect(extensionOf("a/b\\c.PDF")).toBe("pdf");
    expect(extensionOf(".bashrc")).toBe("");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf("trailing.")).toBe("");
  });
});

describe("sanitizeFileName", () => {
  it("strips paths, control and bidi characters, and reserved characters", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName("C:\\Users\\me\\a.pdf")).toBe("a.pdf");
    expect(sanitizeFileName("we\u0000ird\u001f.txt")).toBe("weird.txt");
    expect(sanitizeFileName("evil\u202Egnp.exe")).toBe("evilgnp.exe");
    expect(sanitizeFileName('a<b>c:d"e|f?g*.txt')).toBe("a_b_c_d_e_f_g_.txt");
  });

  it("handles empty, dotted and reserved Windows names", () => {
    expect(sanitizeFileName("")).toBe("file");
    expect(sanitizeFileName("...")).toBe("file");
    expect(sanitizeFileName("   ")).toBe("file");
    expect(sanitizeFileName("CON")).toBe("_CON");
    expect(sanitizeFileName("nul.txt")).toBe("_nul.txt");
    expect(sanitizeFileName("name. ")).toBe("name");
  });

  it("limits length while keeping the extension, and normalises Unicode", () => {
    const long = "a".repeat(500) + ".pdf";
    const out = sanitizeFileName(long);
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(".pdf")).toBe(true);
    expect(sanitizeFileName("cafe\u0301.txt")).toBe("caf\u00e9.txt");
  });

  it("folder names and copy names", () => {
    expect(sanitizeFolderName("Trips 2026")).toBe("Trips 2026");
    expect(sanitizeFolderName("a/b")).toBe("b");
    expect(sanitizeFolderName("")).toBe("file");
    expect(copyName("report.pdf")).toBe("report (copy).pdf");
    expect(copyName("README")).toBe("README (copy)");
  });
});

describe("format helpers", () => {
  it("formatBytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 ** 3)).toBe("1.0 GB");
    expect(formatBytes(-5)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
  it("percent clamps and handles zero", () => {
    expect(percent(5, 0)).toBe(0);
    expect(percent(50, 100)).toBe(50);
    expect(percent(500, 100)).toBe(100);
  });
  it("timeAgo", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    expect(timeAgo(new Date("2026-01-10T11:59:50Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-01-10T11:00:00Z"), now)).toBe("1 hour ago");
    expect(timeAgo(new Date("2026-01-08T12:00:00Z"), now)).toBe("2 days ago");
  });
});

describe("request schemas", () => {
  const good = {
    nameEnc: "A".repeat(32),
    category: "image",
    mimeType: "image/png",
    size: 1000,
    wrappedKey: "B".repeat(80),
  };

  it("accepts a valid upload request and rejects bad types, sizes and categories", () => {
    expect(uploadInitSchema.safeParse(good).success).toBe(true);
    expect(uploadInitSchema.safeParse({ ...good, mimeType: "application/x-msdownload" }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, mimeType: "text/html" }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, category: "executable" }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, size: 0 }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, size: -1 }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, size: 1.5 }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, size: 3 * 1024 ** 3 }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, fileId: "not-a-uuid" }).success).toBe(false);
    expect(uploadInitSchema.safeParse({ ...good, nameEnc: "<script>alert(1)</script>" }).success).toBe(false);
  });

  it("vault schema enforces Argon2id lower bounds", () => {
    const vault = {
      kdf: "argon2id", kdfParams: { memoryKiB: 65536, iterations: 3, parallelism: 1 }, salt: "A".repeat(24),
      wrappedMasterKeyPass: "C".repeat(80), wrappedMasterKeyRecovery: "D".repeat(80), formatVersion: 1,
    };
    expect(vaultSchema.safeParse(vault).success).toBe(true);
    expect(vaultSchema.safeParse({ ...vault, kdfParams: { ...vault.kdfParams, memoryKiB: 8 } }).success).toBe(false);
    expect(vaultSchema.safeParse({ ...vault, kdfParams: { ...vault.kdfParams, iterations: 1 } }).success).toBe(false);
    expect(vaultSchema.safeParse({ ...vault, kdf: "pbkdf2" }).success).toBe(false);
  });

  it("share schemas", () => {
    expect(shareTokenSchema.safeParse("A".repeat(43)).success).toBe(true);
    expect(shareTokenSchema.safeParse("A".repeat(42)).success).toBe(false);
    expect(shareTokenSchema.safeParse("../".repeat(15)).success).toBe(false);
    const base = {
      fileId: "11111111-1111-4111-8111-111111111111", expiresAt: new Date(Date.now() + 86400000).toISOString(),
      canDownload: true, wrappedFileKey: "E".repeat(80), nameEnc: "F".repeat(32),
    };
    expect(shareCreateSchema.safeParse(base).success).toBe(true);
    expect(shareCreateSchema.safeParse({ ...base, extra: 1 }).success).toBe(false); // strict
    expect(shareCreateSchema.safeParse({ ...base, expiresAt: "tomorrow" }).success).toBe(false);
  });

  it("settings schema rejects empty updates and unknown themes", () => {
    expect(settingsSchema.safeParse({}).success).toBe(false);
    expect(settingsSchema.safeParse({ theme: "neon" }).success).toBe(false);
    expect(settingsSchema.safeParse({ theme: "dark", displayName: " Alice " })).toMatchObject({ success: true, data: { displayName: "Alice" } });
  });
});
