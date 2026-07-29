import { describe, expect, it } from "vitest";
import { applicantLabel, juminhyoTitle, requestKindLabel } from "./tax-cert";

describe("requestKindLabel", () => {
  it("請求種別の表示名を返す（未設定の既存記録は課税・納税証明書）", () => {
    expect(requestKindLabel("tax")).toBe("課税・納税証明書");
    expect(requestKindLabel("tenshutsu")).toBe("転出届");
    expect(requestKindLabel("juminhyo")).toBe("住民票");
    expect(requestKindLabel(undefined)).toBe("課税・納税証明書");
  });
});

describe("juminhyoTitle", () => {
  it("個人番号（マイナンバー）記載の有無をタイトルに含める", () => {
    expect(juminhyoTitle(true)).toBe("住民票の写し（個人番号の記載あり）");
    expect(juminhyoTitle(false)).toBe("住民票の写し（個人番号の記載なし）");
  });
});

describe("applicantLabel", () => {
  it("本人申請・代理人（名前）を表示する", () => {
    expect(applicantLabel("self")).toBe("本人申請");
    expect(applicantLabel(undefined)).toBe("本人申請");
    expect(applicantLabel("agent", "山田太郎")).toBe("代理人（山田太郎）");
    expect(applicantLabel("agent", "")).toBe("代理人（名前未入力）");
  });
});
