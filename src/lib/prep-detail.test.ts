import { describe, expect, it } from "vitest";
import {
  ASSEN_NONE_REASONS,
  ASSEN_OTHER,
  PREP_DETAIL_SECTIONS,
  assenDecided,
  assenReasonChoice,
  daysSince,
  prepDocRequestee,
  requesteeCounts,
  waitingNoteFromMissing,
} from "@/lib/prep-detail";

describe("PREP_DETAIL_SECTIONS", () => {
  it("案Bの順に並んでいて、id が重ならない", () => {
    expect(PREP_DETAIL_SECTIONS.map((s) => s.label)).toEqual([
      "基本情報・所属機関",
      "前回の申請",
      "必要な書類",
      "申請書に貼る情報",
      "署名・賃金・雇用契約書",
      "あっせん",
      "支援計画書の日付",
      "1-17号 支援計画書",
      "農業 加入通知書",
      "提出・申請後の郵送",
    ]);
    expect(new Set(PREP_DETAIL_SECTIONS.map((s) => s.id)).size).toBe(PREP_DETAIL_SECTIONS.length);
  });
});

describe("assenReasonChoice", () => {
  it("選択肢と同じ文ならその選択肢", () => {
    expect(assenReasonChoice(ASSEN_NONE_REASONS[0])).toEqual({ choice: ASSEN_NONE_REASONS[0], other: "" });
  });
  it("それ以外の文は「その他」で文を残す", () => {
    expect(assenReasonChoice("特定技能の更新申請のため")).toEqual({
      choice: ASSEN_OTHER,
      other: "特定技能の更新申請のため",
    });
  });
  it("空なら未選択", () => {
    expect(assenReasonChoice("")).toEqual({ choice: "", other: "" });
    expect(assenReasonChoice(null)).toEqual({ choice: "", other: "" });
  });
});

describe("assenDecided", () => {
  it("有りは決まり、無しは理由まで入っていれば決まり", () => {
    expect(assenDecided("あり", "")).toBe(true);
    expect(assenDecided("なし", "")).toBe(false);
    expect(assenDecided("なし", ASSEN_NONE_REASONS[1])).toBe(true);
    expect(assenDecided("", "")).toBe(false);
    expect(assenDecided(null, null)).toBe(false);
  });
});

describe("prepDocRequestee", () => {
  const open = { hasIssuerField: false, done: false };
  it("発行依頼中は依頼先の入力を使う", () => {
    expect(prepDocRequestee("発行依頼中", "NGAさん", { hasIssuerField: true, done: false })).toEqual({
      kind: "person",
      who: "NGAさん",
    });
    expect(prepDocRequestee("発行依頼中", "", { hasIssuerField: true, done: false })?.who).toBe("依頼先未入力");
  });
  it("選択値の文から読み取る", () => {
    expect(prepDocRequestee("本人に依頼中", "", open)).toEqual({ kind: "self", who: "本人" });
    expect(prepDocRequestee("写真だけ先に本人に依頼中", "", open)?.who).toBe("本人");
    expect(prepDocRequestee("秋吉伽恋に発行依頼中", "", open)).toEqual({ kind: "person", who: "秋吉伽恋" });
    expect(prepDocRequestee("送り出し機関に依頼中", "", open)?.who).toBe("送り出し機関");
    expect(prepDocRequestee("郵送請求中", "", open)).toEqual({ kind: "mail", who: "郵送請求" });
    expect(prepDocRequestee("納税証明書その3を税務署に郵送請求中", "", open)?.kind).toBe("mail");
    expect(prepDocRequestee("未納のため領収書発行待ち", "", open)?.who).toBe("本人");
  });
  it("完了・未選択・読み取れないものは null", () => {
    expect(prepDocRequestee("発行完了", "", { hasIssuerField: false, done: true })).toBeNull();
    expect(prepDocRequestee("", "", open)).toBeNull();
    expect(prepDocRequestee("受診済み・発行待ち", "", open)).toBeNull();
  });
});

describe("daysSince", () => {
  it("依頼日からの日数", () => {
    expect(daysSince("2026-09-20", "2026-09-26")).toBe(6);
    expect(daysSince("2026-09-26", "2026-09-26")).toBe(0);
  });
  it("日付が無い・未来なら null", () => {
    expect(daysSince(null, "2026-09-26")).toBeNull();
    expect(daysSince("2026-10-01", "2026-09-26")).toBeNull();
  });
});

describe("requesteeCounts", () => {
  it("依頼先ごとに数えて多い順", () => {
    expect(
      requesteeCounts([
        { kind: "self", who: "本人" },
        null,
        { kind: "person", who: "NGAさん" },
        { kind: "self", who: "本人" },
      ]),
    ).toEqual([
      { who: "本人", kind: "self", count: 2 },
      { who: "NGAさん", kind: "person", count: 1 },
    ]);
  });
});

describe("waitingNoteFromMissing", () => {
  it("依頼先が分かれば括弧で付けて「・」でつなぐ", () => {
    expect(
      waitingNoteFromMissing([
        { label: "健康診断書", who: "本人" },
        { label: "納税証明書（国保税）", who: "依頼先未入力" },
        { label: "住民票" },
      ]),
    ).toBe("健康診断書（本人）・納税証明書（国保税）・住民票");
  });
});
