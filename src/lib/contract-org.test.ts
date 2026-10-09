import { describe, expect, it } from "vitest";
import { contractOrgOptions, resolveContractOrgId } from "@/lib/contract-org";

const choices = [
  { id: "now", name: "阿蘇ピッグファーム", current: true },
  { id: "old", name: "前の会社", current: false },
];
const organizations = [
  { id: "now", name: "阿蘇ピッグファーム" },
  { id: "old", name: "前の会社" },
  { id: "other", name: "別の会社" },
];

describe("契約書を登録する会社の選び方", () => {
  it("未選択なら先頭（現在の所属機関）", () => {
    expect(resolveContractOrgId("", choices, organizations)).toBe("now");
  });

  it("関係する会社を選べばそれ", () => {
    expect(resolveContractOrgId("old", choices, organizations)).toBe("old");
  });

  it("関係する会社に無い別の会社を選んでも、その会社のまま（先頭に戻らない）", () => {
    expect(resolveContractOrgId("other", choices, organizations)).toBe("other");
  });

  it("どちらの一覧にも無い id なら先頭に戻す", () => {
    expect(resolveContractOrgId("gone", choices, organizations)).toBe("now");
    expect(resolveContractOrgId("gone", [], organizations)).toBe("");
  });

  it("選択肢は関係する会社（現在は印付き）→ その他の会社の順で重複なし", () => {
    expect(contractOrgOptions(choices, organizations)).toEqual([
      { id: "now", name: "阿蘇ピッグファーム（現在）" },
      { id: "old", name: "前の会社" },
      { id: "other", name: "別の会社" },
    ]);
  });
});
