import { describe, expect, it } from "vitest";
import {
  historyOptionLabel,
  insuranceCardLabel,
  kokuhoInsuranceHint,
  type InsuranceHistoryRef,
} from "./insurance-card";

const HISTORIES: InsuranceHistoryRef[] = [
  { id: "h1", org_name: "株式会社やつしろ食品", start_date: "2024-04-01", end_date: null },
  { id: "h2", org_name: "有限会社ながさき水産", start_date: "2022-07-01", end_date: "2024-03-31" },
];

function card(kind: string, kind_note = "", work_history_id: string | null = null) {
  return { kind, kind_note, work_history_id };
}

describe("insuranceCardLabel", () => {
  it("国保・マイナ保険証はそのまま", () => {
    expect(insuranceCardLabel(card("国保"), HISTORIES)).toBe("国保");
    expect(insuranceCardLabel(card("マイナ保険証"), HISTORIES)).toBe("マイナ保険証");
  });

  it("社保は紐付けた職歴の会社名を添える", () => {
    expect(insuranceCardLabel(card("社保", "", "h2"), HISTORIES)).toBe(
      "社保（有限会社ながさき水産）",
    );
    expect(insuranceCardLabel(card("社保"), HISTORIES)).toBe("社保"); // 紐付け無し
    expect(insuranceCardLabel(card("社保", "", "消えた職歴"), HISTORIES)).toBe("社保");
  });

  it("その他は内容を添える", () => {
    expect(insuranceCardLabel(card("その他", "旅行保険"), HISTORIES)).toBe("その他（旅行保険）");
    expect(insuranceCardLabel(card("その他"), HISTORIES)).toBe("その他");
  });

  it("未設定・無しは空", () => {
    expect(insuranceCardLabel(card(""), HISTORIES)).toBe("");
    expect(insuranceCardLabel(null, HISTORIES)).toBe("");
  });
});

describe("historyOptionLabel", () => {
  it("会社名と期間（継続中は「現在」）", () => {
    expect(historyOptionLabel(HISTORIES[0])).toBe("株式会社やつしろ食品（2024-04-01〜現在）");
    expect(historyOptionLabel(HISTORIES[1])).toBe(
      "有限会社ながさき水産（2022-07-01〜2024-03-31）",
    );
  });
});

describe("kokuhoInsuranceHint", () => {
  it("未登録は muted で登録をうながす", () => {
    expect(kokuhoInsuranceHint(null, HISTORIES).tone).toBe("muted");
    expect(kokuhoInsuranceHint(card(""), HISTORIES).tone).toBe("muted");
  });

  it("国保はすでに加入中（ok）", () => {
    const hint = kokuhoInsuranceHint(card("国保"), HISTORIES);
    expect(hint.tone).toBe("ok");
    expect(hint.text).toContain("加入中");
  });

  it("社保は退職後に切り替えが必要（attention）で、会社名も出す", () => {
    const hint = kokuhoInsuranceHint(card("社保", "", "h1"), HISTORIES);
    expect(hint.tone).toBe("attention");
    expect(hint.text).toContain("株式会社やつしろ食品");
    expect(hint.text).toContain("切り替え");
  });

  it("マイナ保険証は断定しない（muted で表示だけ）", () => {
    const hint = kokuhoInsuranceHint(card("マイナ保険証"), HISTORIES);
    expect(hint.tone).toBe("muted");
    expect(hint.text).toContain("マイナ保険証");
  });
});
