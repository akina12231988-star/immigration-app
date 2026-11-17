import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { SUBMISSION_ITEMS, buildSubmissionRows } from "./submission-list";
import { SUBMISSION_PDF_TEMPLATES, canFillSubmissionPdf, fillSubmissionPdf } from "./submission-pdf";

const pub = (p: string) => readFileSync(path.join(process.cwd(), "public", p));
const base = { jointKind: "単独", hasKokuho: false, hasNenkin: true, flexYear: false, assen: "なし", nationality: "カンボジア", certPattern: "専門級" };

describe("提出書類一覧表を入管の様式の PDF で作る", () => {
  it("様式の行の数が一覧表の書類の数と同じ", () => {
    expect(SUBMISSION_PDF_TEMPLATES["1"]?.rows).toHaveLength(SUBMISSION_ITEMS.filter((i) => i.table === "1").length);
    expect(SUBMISSION_PDF_TEMPLATES["3agri"]?.rows).toHaveLength(SUBMISSION_ITEMS.filter((i) => i.table === "3agri").length);
    expect(SUBMISSION_PDF_TEMPLATES["2-3agri"]?.rows).toHaveLength(SUBMISSION_ITEMS.filter((i) => i.table === "2-3agri").length);
  });

  it("1号も2号も様式の PDF で作れる", () => {
    expect(canFillSubmissionPdf(buildSubmissionRows({}, base, { agri: true }))).toBe(true);
    expect(canFillSubmissionPdf(buildSubmissionRows({}, base, { agri: true, ssw2: true }))).toBe(true);
    expect(SUBMISSION_PDF_TEMPLATES["2-1"]?.rows).toHaveLength(SUBMISSION_ITEMS.filter((i) => i.table === "2-1").length);
  });

  it("2号: 表紙＋第1表（3ページ）と農業の第3表の8の1（1ページ）", async () => {
    const rows = buildSubmissionRows({}, base, { agri: true, ssw2: true });
    const bytes = await fillSubmissionPdf({
      templates: { "2-1": pub("forms/submission-ssw2.pdf"), "2-3agri": pub("forms/submission-ssw2-agri.pdf") },
      fontBytes: pub("fonts/NotoSansJP-Regular.ttf"),
      rows,
      workerName: "A",
      orgName: "B",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  }, 30000);

  it("表紙＋第1表（4ページ）と農業の第3表（1ページ）を1つの PDF にする", async () => {
    const rows = buildSubmissionRows({ "t1-4-1": "無" }, base, { agri: true });
    const bytes = await fillSubmissionPdf({
      templates: { "1": pub("forms/submission-ssw1.pdf"), "3agri": pub("forms/submission-ssw1-agri.pdf") },
      fontBytes: pub("fonts/NotoSansJP-Regular.ttf"),
      rows,
      workerName: "NGUYEN VAN A",
      orgName: "株式会社サンプル農園",
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(5);
  }, 30000);
});
