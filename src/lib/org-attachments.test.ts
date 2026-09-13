import { describe, expect, it } from "vitest";
import {
  flexHoursLabel,
  isAgricultureIndustry,
  isImageFile,
  latestOrgFiles,
  needsFlexDocs,
  orgFilesPrintHref,
  parsePrintKinds,
} from "./org-attachments";
import type { OrganizationFileRow } from "@/types/db";

const row = (id: string, kind: string, created_at: string, file_name = `${id}.jpg`): OrganizationFileRow => ({
  id,
  organization_id: "org1",
  kind,
  storage_path: `orgs/org1/${id}`,
  file_name,
  mime_type: file_name.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
  uploaded_by: null,
  created_at,
});

describe("flexHoursLabel", () => {
  it("1年単位は「1年単位の変形労働」、未登録は「未登録」", () => {
    expect(flexHoursLabel("1年単位")).toBe("1年単位の変形労働");
    expect(flexHoursLabel("1ヶ月単位")).toBe("1ヶ月単位の変形労働");
    expect(flexHoursLabel("なし")).toBe("なし");
    expect(flexHoursLabel("")).toBe("未登録");
    expect(needsFlexDocs("1年単位")).toBe(true);
    expect(needsFlexDocs("なし")).toBe(false);
  });
});

describe("isAgricultureIndustry", () => {
  it("農業のときだけ true", () => {
    expect(isAgricultureIndustry("農業")).toBe(true);
    expect(isAgricultureIndustry("漁業")).toBe(false);
    expect(isAgricultureIndustry("")).toBe(false);
  });
});

describe("latestOrgFiles", () => {
  it("いちばん新しいアップロード日の分を、アップロードした順に返す", () => {
    const files = [
      row("c", "年間カレンダー", "2026-09-10T02:00:00Z"),
      row("b", "年間カレンダー", "2026-09-10T01:00:00Z"),
      row("a", "年間カレンダー", "2026-04-01T00:00:00Z"),
      row("x", "労使協定書", "2026-09-11T00:00:00Z"),
    ];
    const latest = latestOrgFiles(files, "年間カレンダー");
    expect(latest?.uploadedOn).toBe("2026-09-10");
    expect(latest?.files.map((f) => f.id)).toEqual(["b", "c"]);
  });

  it("その種類のファイルが無ければ null", () => {
    expect(latestOrgFiles([row("a", "労使協定書", "2026-01-01T00:00:00Z")], "年間カレンダー")).toBeNull();
  });
});

describe("isImageFile", () => {
  it("画像は true、PDF は false", () => {
    expect(isImageFile({ mime_type: "image/png", file_name: "a.png" })).toBe(true);
    expect(isImageFile({ mime_type: "application/octet-stream", file_name: "a.JPG" })).toBe(true);
    expect(isImageFile({ mime_type: "application/pdf", file_name: "a.pdf" })).toBe(false);
  });
});

describe("印刷ページのURL", () => {
  it("種類を複数まとめて渡し、受け付けない種類は除いて戻す", () => {
    const href = orgFilesPrintHref("org1", ["年間カレンダー", "労使協定書"]);
    expect(href).toBe(`/organizations/org1/files/print?kind=${encodeURIComponent("年間カレンダー,労使協定書")}`);
    expect(parsePrintKinds("年間カレンダー,労使協定書,見積書")).toEqual(["年間カレンダー", "労使協定書"]);
    expect(parsePrintKinds("農業特定技能加入通知書")).toEqual(["農業特定技能加入通知書"]);
    expect(parsePrintKinds(undefined)).toEqual([]);
  });
});
