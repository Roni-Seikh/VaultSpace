// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseQuery, pickSummaryTarget, runQuery } from "@/lib/assistant/query";
import { splitSentences, summarize } from "@/lib/assistant/summarize";
import { breadcrumbs, filterFiles, findDuplicateGroups, sortFiles } from "@/lib/files/browse";
import type { FileItem, FolderItem } from "@/lib/client/types";

const NOW = new Date("2026-11-09T10:00:00");
const mk = (id: string, name: string, category: FileItem["category"], mime: string, daysOld: number, size = 1000, hmac: string | null = null): FileItem => ({
  id, folderId: null, name, nameEnc: "x", category, mimeType: mime, size, version: 1, hmac,
  createdAt: new Date(NOW.getTime() - daysOld * 86_400_000).toISOString(), updatedAt: new Date(NOW.getTime() - daysOld * 86_400_000).toISOString(),
});

const FILES = [
  mk("1", "College Certificate 2023.pdf", "document", "application/pdf", 40),
  mk("2", "Diploma scan.pdf", "document", "application/pdf", 3),
  mk("3", "project-plan.docx", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", 2),
  mk("4", "Project Budget.xlsx", "spreadsheet", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 20),
  mk("5", "IMG_001.jpg", "image", "image/jpeg", 1, 5000, "HASHAAAAAAAAAAAAAA"),
  mk("6", "IMG_001 copy.jpg", "image", "image/jpeg", 1, 5000, "HASHAAAAAAAAAAAAAA"),
  mk("7", "IMG_002.jpg", "image", "image/jpeg", 10, 9000, "HASHBBBBBBBBBBBBBB"),
  mk("8", "holiday.mp4", "video", "video/mp4", 5, 90_000),
  mk("9", "notes.txt", "text", "text/plain", 0),
];

describe("parseQuery", () => {
  it("understands file types", () => {
    expect(parseQuery("Show my PDF files", NOW)).toMatchObject({ intent: "search", extension: "pdf", keywords: [] });
    expect(parseQuery("find my photos", NOW).categories).toEqual(["image"]);
    expect(parseQuery("any videos?", NOW).categories).toEqual(["video"]);
    expect(parseQuery("spreadsheets", NOW).categories).toEqual(["spreadsheet"]);
  });
  it("understands time ranges", () => {
    const last = parseQuery("Find documents uploaded last week", NOW);
    expect(last.rangeLabel).toBe("the last 7 days");
    expect(last.from!.getTime()).toBeLessThan(NOW.getTime() - 6 * 86_400_000);
    expect(parseQuery("files from yesterday", NOW).rangeLabel).toBe("yesterday");
    expect(parseQuery("added in the last 3 days", NOW).rangeLabel).toBe("the last 3 days");
    expect(parseQuery("this month", NOW).from!.getDate()).toBe(1);
  });
  it("extracts keywords and synonyms", () => {
    expect(parseQuery("Find my college certificates.", NOW).keywords).toEqual(["college", "certificate"]);
    expect(parseQuery("Search for files with the word project.", NOW).keywords).toEqual(["project"]);
    expect(parseQuery("find my college certificates", NOW).keywordGroups[1]).toContain("diploma");
  });
  it("detects intents", () => {
    expect(parseQuery("Find duplicate photographs.", NOW)).toMatchObject({ intent: "duplicates", categories: ["image"] });
    expect(parseQuery("Summarize this document: budget", NOW).intent).toBe("summarize");
    expect(parseQuery("what are my biggest files", NOW).intent).toBe("largest");
    expect(parseQuery("   ", NOW).intent).toBe("empty");
  });
});

describe("runQuery", () => {
  it("finds certificates using synonyms across names", () => {
    const r = runQuery(parseQuery("Find my college certificates.", NOW), FILES);
    expect(r.files.map((f) => f.id)).toEqual(["1"]); // needs BOTH "college" and certificate-synonym
  });
  it("PDF query returns only PDFs, newest first", () => {
    expect(runQuery(parseQuery("Show my PDF files.", NOW), FILES).files.map((f) => f.id)).toEqual(["2", "1"]);
  });
  it("date filter limits results", () => {
    const r = runQuery(parseQuery("Find documents uploaded last week", NOW), FILES);
    expect(r.files.map((f) => f.id).sort()).toEqual(["2", "3"]);
    expect(r.interpretation).toMatch(/last 7 days/);
  });
  it("keyword search across types", () => {
    expect(runQuery(parseQuery("Search for files with the word project", NOW), FILES).files.map((f) => f.id).sort()).toEqual(["3", "4"]);
  });
  it("finds exact duplicates by keyed hash only", () => {
    const r = runQuery(parseQuery("Find duplicate photographs", NOW), FILES);
    expect(r.groups).toHaveLength(1);
    expect(r.groups![0].map((f) => f.id).sort()).toEqual(["5", "6"]);
  });
  it("is honest when nothing matches", () => {
    const r = runQuery(parseQuery("find my tax returns", NOW), FILES);
    expect(r.files).toHaveLength(0);
    expect(r.summary).toMatch(/No files matched/);
    const none = runQuery(parseQuery("duplicate videos", NOW), FILES);
    expect(none.summary).toMatch(/No exact duplicates/);
  });
  it("falls back to fuzzy name matching and says so", () => {
    const r = runQuery(parseQuery("find holliday", NOW), FILES);
    expect(r.fuzzy).toBe(true);
    expect(r.files[0].id).toBe("8");
    expect(r.summary).toMatch(/similar/);
  });
  it("largest files are sorted by size", () => {
    expect(runQuery(parseQuery("show my largest files", NOW), FILES).files[0].id).toBe("8");
  });
  it("pickSummaryTarget picks the best name match or null", () => {
    expect(pickSummaryTarget(parseQuery("summarize the budget", NOW), FILES)?.id).toBe("4");
    expect(pickSummaryTarget(parseQuery("summarize nonexistentthing", NOW), FILES)).toBeNull();
    expect(pickSummaryTarget(parseQuery("summarize", NOW), FILES)).toBeNull();
  });
});

describe("summarize", () => {
  const text = `Climate change is altering weather patterns across the globe. Rising temperatures cause glaciers to melt and sea levels to rise. Coastal cities face increased flooding risk as sea levels rise. Governments are investing in renewable energy to reduce emissions. Solar and wind power costs have fallen sharply over the last decade. Many farmers are adapting crops to hotter and drier conditions. Scientists warn that rapid emission cuts are needed this decade. A cafeteria menu was updated last Tuesday to include soup. Public transport expansion also lowers emissions in large cities.`;
  it("returns at most N sentences in original order, favouring the main topic", () => {
    const s = summarize(text, 3)!;
    expect(s.sentences).toHaveLength(3);
    const idx = s.sentences.map((x) => text.indexOf(x));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
    expect(s.sentences.join(" ")).not.toMatch(/cafeteria/);
  });
  it("returns short texts whole and null for empty/no-sentence text", () => {
    expect(summarize("This is just one reasonably long sentence here.", 5)!.sentences).toHaveLength(1);
    expect(summarize("", 5)).toBeNull();
    expect(summarize("ok. no. yes.", 5)).toBeNull();
  });
  it("splitSentences drops fragments", () => {
    expect(splitSentences("Hi. This sentence is long enough to be kept. Bye.")).toEqual(["This sentence is long enough to be kept."]);
  });
});

describe("browse helpers", () => {
  const folders: FolderItem[] = [
    { id: "a", parentId: null, name: "Work", createdAt: "" }, { id: "b", parentId: "a", name: "2026", createdAt: "" }, { id: "c", parentId: "b", name: "Q4", createdAt: "" },
  ];
  it("breadcrumbs walk the folder chain and survive cycles", () => {
    expect(breadcrumbs(folders, "c").map((f) => f.name)).toEqual(["Work", "2026", "Q4"]);
    expect(breadcrumbs(folders, null)).toEqual([]);
    expect(breadcrumbs([{ id: "x", parentId: "y", name: "X", createdAt: "" }, { id: "y", parentId: "x", name: "Y", createdAt: "" }], "x")).toHaveLength(2);
  });
  it("sorts naturally by name, size, date", () => {
    const f = [mk("1", "file10.txt", "text", "text/plain", 1, 5), mk("2", "file2.txt", "text", "text/plain", 2, 50)];
    expect(sortFiles(f, "name", "asc").map((x) => x.id)).toEqual(["2", "1"]);
    expect(sortFiles(f, "size", "desc").map((x) => x.id)).toEqual(["2", "1"]);
    expect(sortFiles(f, "date", "desc").map((x) => x.id)).toEqual(["1", "2"]);
  });
  it("filters by category and query; groups duplicates", () => {
    expect(filterFiles(FILES, { category: "image", query: "002" }).map((f) => f.id)).toEqual(["7"]);
    expect(findDuplicateGroups(FILES)).toHaveLength(1);
  });
});
