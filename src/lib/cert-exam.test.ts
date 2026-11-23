import { describe, expect, it } from "vitest";
import {
  CERT_BASE_DOC_KEY,
  certExamDocKey,
  certExamRows,
  isCertDocKeyOf,
  newCertExamId,
  normalizeCertExams,
} from "./cert-exam";

describe("certExamDocKey / isCertDocKeyOf", () => {
  it("2件目以降は枝番のキーになる", () => {
    expect(certExamDocKey("nihongo", "a1b2c3")).toBe("cert_nihongo_a1b2c3");
    expect(certExamDocKey("senmongai", "a1b2c3")).toBe("cert_senmongai_a1b2c3");
  });

  it("保存キーの制限（英数字と_のみ・32文字まで）に収まる", () => {
    expect(certExamDocKey("senmongai", newCertExamId([]))).toMatch(/^[a-z0-9_]{1,32}$/);
  });

  it("1件目・2件目以降のどちらもその合格証のファイルとして数える", () => {
    expect(isCertDocKeyOf("cert_nihongo", "cert_nihongo")).toBe(true);
    expect(isCertDocKeyOf("cert_nihongo", "cert_nihongo_a1b2c3")).toBe(true);
    // 別の合格証のキーは数えない（専門級と専門外を取り違えない）
    expect(isCertDocKeyOf("cert_senmongai", "cert_senmonkyu")).toBe(false);
    expect(isCertDocKeyOf("cert_nihongo", "cert_senmongai_a1b2c3")).toBe(false);
  });
});

describe("newCertExamId", () => {
  it("すでにある識別子とは重ならない", () => {
    const used = ["aaaaaa", "bbbbbb"];
    const id = newCertExamId(used);
    expect(used).not.toContain(id);
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe("normalizeCertExams", () => {
  it("配列でない・識別子が無い行は落とす", () => {
    expect(normalizeCertExams(null)).toEqual([]);
    expect(normalizeCertExams("[]")).toEqual([]);
    expect(normalizeCertExams([{ kind: "nihongo", name: "JLPT" }])).toEqual([]);
  });

  it("足りない項目は空文字で埋め、保存キーが無ければ組み立てる", () => {
    expect(normalizeCertExams([{ id: "a1b2c3", kind: "senmongai", name: "農業技能測定試験" }])).toEqual([
      {
        id: "a1b2c3",
        kind: "senmongai",
        name: "農業技能測定試験",
        location: "",
        level: "",
        doc_key: "cert_senmongai_a1b2c3",
      },
    ]);
  });
});

describe("certExamRows", () => {
  it("1件目は従来のキーで、受験情報が空でも必ず出す", () => {
    const rows = certExamRows("nihongo", "", "", "", []);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("");
    expect(rows[0].doc_key).toBe(CERT_BASE_DOC_KEY.nihongo);
  });

  it("1件目のうしろに、その種類の2件目以降が並ぶ", () => {
    const stored = normalizeCertExams([
      { id: "x1", kind: "nihongo", name: "JLPT" },
      { id: "y1", kind: "senmongai", name: "農業" }, // 別の種類は混ざらない
    ]);
    const rows = certExamRows("nihongo", "JFT-Basic", "日本国内", "N4", stored);
    expect(rows.map((r) => r.doc_key)).toEqual(["cert_nihongo", "cert_nihongo_x1"]);
    expect(rows[0]).toMatchObject({ name: "JFT-Basic", location: "日本国内", level: "N4" });
  });
});
