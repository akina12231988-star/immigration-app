import { describe, expect, it } from "vitest";
import { rosterJpDate, rosterWorkKind } from "./roster";

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
