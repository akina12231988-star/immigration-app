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
  it("介護・ビルクリーニング・リネンサプライは区分が1つ（分野名と同じ）", () => {
    expect(businessCategoryOptions("介護分野")).toEqual(["介護"]);
    expect(businessCategoryOptions("ビルクリーニング")).toEqual(["ビルクリーニング"]);
    expect(businessCategoryOptions("リネンサプライ")).toEqual(["リネンサプライ"]);
  });
  it("ほかの分野も画面の選択肢のとおり", () => {
    expect(businessCategoryOptions("農業")).toEqual(["耕種農業", "畜産農業"]);
    expect(businessCategoryOptions("漁業")).toEqual(["漁業", "養殖業"]);
    expect(businessCategoryOptions("航空")).toEqual(["空港グランドハンドリング", "航空機整備"]);
    expect(businessCategoryOptions("自動車運送業")).toEqual(["トラック運転者", "タクシー運転者", "バス運転者"]);
    expect(businessCategoryOptions("鉄道")).toHaveLength(6);
    expect(businessCategoryOptions("自動車整備")).toEqual(["自動車の整備等"]);
    expect(businessCategoryOptions("資源循環")).toEqual(["廃棄物処分業"]);
    expect(businessCategoryOptions("飲食料品製造業")).toEqual(["飲食料品製造業全般"]);
  });
  it("分野が分からなければ全部の区分", () => {
    expect(businessCategoryOptions("").length).toBeGreaterThan(20);
  });
});
