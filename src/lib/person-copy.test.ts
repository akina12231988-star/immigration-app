import { describe, expect, it } from "vitest";
import { addressPeriods, birthSeireki, birthWareki, periodLabel, personCopyText } from "./person-copy";
import type { WorkerAddress } from "./worker-address";

const a = (id: string, moved_on: string, address: string): WorkerAddress => ({
  id,
  worker_id: "w",
  moved_on,
  address,
  kind: "転入",
  note: "",
  created_at: "",
});
const addresses = [
  a("1", "2024-07-11", "熊本県八代市千丁町太牟田2506番地4"),
  a("3", "2026-07-14", "熊本県八代市新浜町1番1号"),
  a("2", "2025-04-04", "熊本県八代市鏡町下村1420番地14"),
];

describe("住所歴の期間と1月1日の印", () => {
  it("新しい順に、次の転入日の前日までの期間にし、年度の1月1日の住所に印を付ける", () => {
    const ps = addressPeriods(addresses, [2026, 2025]);
    expect(ps.map((p) => [periodLabel(p), p.address, p.marks])).toEqual([
      ["2026/07/14〜現在", "熊本県八代市新浜町1番1号", []],
      ["2025/04/04〜2026/07/13", "熊本県八代市鏡町下村1420番地14", ["R8（2026/1/1）"]],
      ["2024/07/11〜2025/04/03", "熊本県八代市千丁町太牟田2506番地4", ["R7（2025/1/1）"]],
    ]);
  });
  it("同じ住所に2年度の印が付くこともある", () => {
    const ps = addressPeriods([a("1", "2020-01-01", "A")], [2026, 2025]);
    expect(ps[0].marks).toEqual(["R8（2026/1/1）", "R7（2025/1/1）"]);
  });
});

describe("まとめてコピー", () => {
  it("氏名・フリガナ・生年月日（西暦と和暦）・現在の住所・住所歴", () => {
    expect(birthSeireki("1995-03-08")).toBe("1995年3月8日");
    expect(birthWareki("1995-03-08")).toBe("平成7年3月8日");
    const text = personCopyText(
      { name: "VI THI THIN", kana: "ヴィ ティ ティン", birth: "1995-03-08", address: "熊本県八代市新浜町1番1号", postal: "866-0021" },
      addressPeriods(addresses, [2026]),
    );
    expect(text).toBe(
      [
        "氏名: VI THI THIN",
        "フリガナ: ヴィ ティ ティン",
        "生年月日: 1995年3月8日（平成7年3月8日）",
        "現在の住所: 〒866-0021 熊本県八代市新浜町1番1号",
        "住所歴:",
        "  2026/07/14〜現在 熊本県八代市新浜町1番1号",
        "  2025/04/04〜2026/07/13 熊本県八代市鏡町下村1420番地14（R8（2026/1/1）の住所）",
        "  2024/07/11〜2025/04/03 熊本県八代市千丁町太牟田2506番地4",
      ].join("\n"),
    );
  });
});
