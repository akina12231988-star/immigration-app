import { describe, expect, it } from "vitest";
import { businessCategoryOptions } from "./online-business-categories";

describe("businessCategoryOptions", () => {
  it("工業製品製造業・建設はオンライン申請の画面と同じ並び", () => {
    expect(businessCategoryOptions("工業製品製造業")[0]).toBe("機械金属加工");
    expect(businessCategoryOptions("工業製品製造業分野")).toHaveLength(17);
    expect(businessCategoryOptions("建設")).toEqual(["土木", "建築", "ライフライン・設備"]);
    expect(businessCategoryOptions("造船・舶用工業")).toEqual(["造船", "舶用機械", "舶用電気電子機器"]);
    expect(businessCategoryOptions("造船・船用工業分野")).toEqual(["造船", "舶用機械", "舶用電気電子機器"]); // 「船用」と書かれても同じ
  });
  it("画面の並びを登録していない分野は会社・機関マスタの業務区分", () => {
    expect(businessCategoryOptions("農業")).toEqual(["耕種農業全般", "畜産農業全般"]);
  });
  it("分野が分からなければ全部の区分", () => {
    expect(businessCategoryOptions("").length).toBeGreaterThan(20);
  });
});
