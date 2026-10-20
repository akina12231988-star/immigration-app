import { describe, expect, it } from "vitest";
import {
  addressCsvFileName,
  addressLabelText,
  buildAddressCsv,
  csvCell,
  formatPostal,
  labelCompanyName,
  postalDigits,
} from "./org-address-label";

describe("所属機関の住所ラベル", () => {
  it("郵便番号は 861-8041 の形にそろえる", () => {
    expect(formatPostal("8618041")).toBe("861-8041");
    expect(formatPostal("861-8041")).toBe("861-8041");
    expect(formatPostal("〒８６１−８０４１")).toBe("861-8041");
    expect(formatPostal("")).toBe("");
    expect(formatPostal("86180")).toBe("86180"); // 7桁でなければそのまま
    expect(postalDigits("861-8041")).toBe("8618041");
    expect(postalDigits("86180")).toBe("");
  });

  it("会社名の空白は全角1つ。敬称を付けられる", () => {
    expect(labelCompanyName("有限会社 丸尾工務店")).toBe("有限会社　丸尾工務店");
    expect(labelCompanyName("有限会社　　丸尾工務店", "御中")).toBe("有限会社　丸尾工務店　御中");
  });

  it("テープに貼るテキスト（〒・住所・空行・会社名）", () => {
    expect(
      addressLabelText({ name: "有限会社 丸尾工務店", postal: "8618041", address: "熊本県熊本市東区戸島５丁目15番29号" }),
    ).toBe("〒861-8041\n熊本県熊本市東区戸島５丁目15番29号\n\n有限会社　丸尾工務店");
    // 郵便番号が無ければ〒の行は出さない
    expect(addressLabelText({ name: "白石智和", postal: "", address: "熊本県八代市" }, { honorific: "様" })).toBe(
      "熊本県八代市\n\n白石智和　様",
    );
  });

  it("CSV は見出し付き・BOM 付き。カンマや改行は引用符で囲む", () => {
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('x"y')).toBe('"x""y"');
    const csv = buildAddressCsv([
      { name: "有限会社 丸尾工務店", postal: "8618041", address: "熊本県熊本市東区戸島5丁目15番29号" },
      { name: "白石智和", postal: "", address: "熊本県八代市,郡築" },
    ]);
    expect(csv.startsWith("﻿会社名,郵便番号,住所,宛名\r\n")).toBe(true);
    expect(csv).toContain("有限会社 丸尾工務店,861-8041,熊本県熊本市東区戸島5丁目15番29号,有限会社　丸尾工務店\r\n");
    expect(csv).toContain('白石智和,,"熊本県八代市,郡築",白石智和\r\n');
  });

  it("ファイル名", () => {
    expect(addressCsvFileName(12, "2026-10-20")).toBe("所属機関の住所_2026-10-20_12件.csv");
  });
});
