import { describe, expect, it } from "vitest";
import {
  isWithinRosterRetention,
  residencePermitHistory,
  rosterDateKey,
  rosterFileName,
  rosterJpDate,
  rosterRetentionEnd,
  rosterWorkKind,
  sortRosterHistory,
  withResidencePermitHistory,
} from "./roster";

describe("rosterWorkKind", () => {
  it("農業の耕種農業全般は「耕種農業の一般社員（役員なし）」", () => {
    expect(rosterWorkKind("農業／耕種農業全般")).toBe("耕種農業の一般社員（役員なし）");
  });

  it("農業の畜産農業全般は「畜産農業の一般社員（役員なし）」", () => {
    expect(rosterWorkKind("農業／畜産農業全般")).toBe("畜産農業の一般社員（役員なし）");
  });

  it("職種が1つの分野は分野名で言い表す（介護）", () => {
    expect(rosterWorkKind("介護／身体介護等")).toBe("介護の一般社員（役員なし）");
  });

  it("細分化された区分は「分野（区分）」（建設・土木）", () => {
    expect(rosterWorkKind("建設／土木")).toBe("建設（土木）の一般社員（役員なし）");
  });

  it("付記の（）と「全般」を外す（飲食料品製造業）", () => {
    expect(rosterWorkKind("飲食料品製造業／飲食料品製造業全般（酒類を除く）")).toBe(
      "飲食料品製造業の一般社員（役員なし）",
    );
  });

  it("外食業全般（調理・接客・店舗管理）は「外食業の一般社員（役員なし）」", () => {
    expect(rosterWorkKind("外食業／外食業全般（調理・接客・店舗管理）")).toBe(
      "外食業の一般社員（役員なし）",
    );
  });

  it("職種と分野が同名なら分野名のみ（漁業）", () => {
    expect(rosterWorkKind("漁業／漁業")).toBe("漁業の一般社員（役員なし）");
  });

  it("漁業の養殖業は「養殖業の一般社員（役員なし）」", () => {
    expect(rosterWorkKind("漁業／養殖業")).toBe("養殖業の一般社員（役員なし）");
  });

  it("宿泊は「宿泊業」に言い換える", () => {
    expect(rosterWorkKind("宿泊／フロント・企画広報・接客・レストランサービス等")).toBe(
      "宿泊業の一般社員（役員なし）",
    );
  });

  it("自動車運送業のトラックは「自動車運送業（トラック）」", () => {
    expect(rosterWorkKind("自動車運送業／トラック")).toBe(
      "自動車運送業（トラック）の一般社員（役員なし）",
    );
  });

  it("分野のみの場合は分野名で作る", () => {
    expect(rosterWorkKind("農業")).toBe("農業の一般社員（役員なし）");
  });

  it("未入力なら空文字", () => {
    expect(rosterWorkKind("")).toBe("");
  });
});

describe("rosterJpDate", () => {
  it("YYYY-MM-DD を和暦風の年月日表記にする", () => {
    expect(rosterJpDate("1999-12-12")).toBe("1999年12月12日");
    expect(rosterJpDate("2026-07-31")).toBe("2026年7月31日");
  });

  it("日付形式でない文字列はそのまま返す", () => {
    expect(rosterJpDate("2026年7月31日")).toBe("2026年7月31日");
  });

  it("null・空は空文字", () => {
    expect(rosterJpDate(null)).toBe("");
    expect(rosterJpDate("")).toBe("");
  });
});

describe("rosterDateKey", () => {
  it("年月日表記・ISO・スラッシュ・和暦を解釈する", () => {
    expect(rosterDateKey("2026年8月1日")).toBe("2026-08-01");
    expect(rosterDateKey("2026-08-01")).toBe("2026-08-01");
    expect(rosterDateKey("2026/8/1")).toBe("2026-08-01");
    expect(rosterDateKey("令和8年8月1日")).toBe("2026-08-01");
    expect(rosterDateKey("平成11年12月12日")).toBe("1999-12-12");
  });

  it("読めない文字列は null", () => {
    expect(rosterDateKey("")).toBeNull();
    expect(rosterDateKey("入社時")).toBeNull();
  });
});

describe("sortRosterHistory", () => {
  it("年月日の昇順（上から下へ時系列順）に並び替える", () => {
    const rows = [
      { on: "2026年8月1日", content: "入社" },
      { on: "2026年7月30日", content: "特定活動ビザの許可おりる" },
    ];
    expect(sortRosterHistory(rows).map((r) => r.content)).toEqual([
      "特定活動ビザの許可おりる",
      "入社",
    ]);
  });

  it("日付が読めない行は順序を保って末尾に置く", () => {
    const rows = [
      { on: "", content: "メモ1" },
      { on: "2026年8月1日", content: "入社" },
      { on: "その他", content: "メモ2" },
      { on: "2026年1月1日", content: "来日" },
    ];
    expect(sortRosterHistory(rows).map((r) => r.content)).toEqual([
      "来日",
      "入社",
      "メモ1",
      "メモ2",
    ]);
  });
});

describe("rosterRetentionEnd", () => {
  it("発行から5年後の日付を返す", () => {
    expect(rosterRetentionEnd("2026-07-30")).toBe("2031-07-30");
  });

  it("うるう日は翌日に繰り上がる", () => {
    expect(rosterRetentionEnd("2024-02-29")).toBe("2029-03-01");
  });
});

describe("isWithinRosterRetention", () => {
  it("満了日までは保存期間内", () => {
    expect(isWithinRosterRetention("2026-07-30", "2031-07-30")).toBe(true);
  });

  it("満了日を過ぎたら期間外", () => {
    expect(isWithinRosterRetention("2026-07-30", "2031-07-31")).toBe(false);
  });

  it("発行年月日未設定は期間内扱い（保護する）", () => {
    expect(isWithinRosterRetention(null, "2031-07-31")).toBe(true);
  });
});

describe("residencePermitHistory / withResidencePermitHistory", () => {
  it("在留資格の許可を履歴の1行にする", () => {
    expect(residencePermitHistory("特定技能1号", "2026-08-19")).toEqual({
      on: "2026年8月19日",
      content: "特定技能1号ビザの許可",
    });
  });

  it("在留資格が空でも許可の行は作る", () => {
    expect(residencePermitHistory("", "2026-08-19")?.content).toBe("在留資格の許可");
  });

  it("許可年月日が無ければ作らない", () => {
    expect(residencePermitHistory("特定技能1号", null)).toBeNull();
  });

  it("履歴に許可を足して、古い順に並べる", () => {
    const rows = withResidencePermitHistory(
      [{ on: "2026年8月20日", content: "入社" }],
      "特定技能1号",
      "2026-08-19",
    );
    expect(rows.map((r) => r.content)).toEqual(["特定技能1号ビザの許可", "入社"]);
  });

  it("同じ年月日の行が既にあれば足さない", () => {
    const rows = withResidencePermitHistory(
      [{ on: "2026年8月19日", content: "特定技能１号ビザの許可" }],
      "特定技能1号",
      "2026-08-19",
    );
    expect(rows).toHaveLength(1);
  });
});

describe("rosterFileName", () => {
  it("労働者名簿_氏名_会社名 にする", () => {
    expect(rosterFileName("TEGUH RIZKI", "有限会社國崎青果")).toBe(
      "労働者名簿_TEGUH RIZKI_有限会社國崎青果",
    );
  });

  it("ファイル名に使えない記号は - にする", () => {
    expect(rosterFileName("A/B", "C:D")).toBe("労働者名簿_A-B_C-D");
  });

  it("会社名が空でも氏名だけで作る", () => {
    expect(rosterFileName("TEGUH RIZKI", "")).toBe("労働者名簿_TEGUH RIZKI");
  });
});
