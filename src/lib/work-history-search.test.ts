import { describe, expect, it } from "vitest";
import { matchHistoryOrgs } from "./work-history-search";

describe("matchHistoryOrgs", () => {
  it("全角・半角・大文字小文字・空白をそろえて勤務先の一部で探す", () => {
    const h = [{ org_name: "株式会社Life Lab" }, { org_name: "株式会社ＬＩＦＥ　ＬＡＢ" }, { org_name: "國崎青果" }, { org_name: "株式会社Life Lab" }];
    expect(matchHistoryOrgs(h, "lifelab")).toEqual(["株式会社Life Lab", "株式会社ＬＩＦＥ　ＬＡＢ"]);
    expect(matchHistoryOrgs(h, "Life Lab")).toHaveLength(2);
    expect(matchHistoryOrgs(h, "")).toEqual([]);
    expect(matchHistoryOrgs(h, "青果")).toEqual(["國崎青果"]);
  });
});
