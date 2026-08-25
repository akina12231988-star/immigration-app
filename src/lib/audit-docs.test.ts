import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import path from "node:path";
import { AUDIT_DOCS, auditDocsBundleName, storedAuditDocs } from "./audit-docs";

describe("AUDIT_DOCS", () => {
  it("訪問通知文の【別紙】確認書類①〜⑨がそろっている", () => {
    expect(AUDIT_DOCS.map((d) => d.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("有料職業紹介事業者のみの書類は②⑥⑧⑨", () => {
    expect(AUDIT_DOCS.filter((d) => d.paidOnly).map((d) => d.no)).toEqual([2, 6, 8, 9]);
  });

  it("「保管」の書類はPDFの場所と出すファイル名を持っている", () => {
    for (const doc of storedAuditDocs()) {
      expect(doc.file?.url).toMatch(/^\/audit-docs\/[a-z0-9-]+\.pdf$/);
      expect(doc.file?.fileName).toMatch(/\.pdf$/);
      expect(doc.file?.pages).toBeGreaterThan(0);
    }
  });

  it("「保管」のPDFが実際に public に入っている（リンク切れにしない）", () => {
    for (const doc of storedAuditDocs()) {
      const file = path.join(process.cwd(), "public", doc.file!.url);
      expect(existsSync(file), `${doc.file!.url} が見つかりません`).toBe(true);
    }
  });

  it("「作成」の書類はどの画面から出すかを持っている", () => {
    for (const doc of AUDIT_DOCS.filter((d) => d.source === "作成")) {
      expect(doc.screen?.href).toMatch(/^\//);
      expect(doc.screen?.label).toBeTruthy();
    }
  });
});

describe("auditDocsBundleName", () => {
  it("まとめたPDFのファイル名に日付が入る", () => {
    expect(auditDocsBundleName("2026-08-26")).toBe("訪問指導_規程・手数料表_2026-08-26.pdf");
  });
});
