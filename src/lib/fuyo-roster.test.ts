import { describe, expect, it } from "vitest";
import { buildFuyoRoster, fuyoFileName, type FuyoRosterWorker } from "./fuyo-roster";

const today = "2026-11-02";
const w = (id: string, name: string, dependents: unknown[]): FuyoRosterWorker => ({
  id,
  name,
  kana: "",
  birth: "1995-01-01",
  address: "",
  my_number: "",
  has_spouse: "",
  status: "在籍中",
  current_organization_id: "org-1",
  dependents,
});
const dep = (name: string, birth: string, remittances: { year: string; amount: string }[]) => ({
  name,
  kana: "",
  relation: "父",
  birth,
  address: "",
  occupation: "",
  my_number: "",
  income: "",
  remittances,
});

describe("buildFuyoRoster（送金が目標額に達した扶養親族の抽出）", () => {
  it("30歳以上70歳未満は38万円以上、16歳以上30歳未満は1円以上で達成。達成した人だけ achieved に入る", () => {
    const rows = buildFuyoRoster(
      [
        w("a", "B WORKER", [
          dep("父", "1970-05-01", [{ year: "2026", amount: "200,000" }, { year: "2026", amount: "200000" }]),
          dep("母", "1972-05-01", [{ year: "2026", amount: "100000" }]),
          dep("弟", "2005-05-01", [{ year: "2026", amount: "10000" }]),
        ]),
        w("b", "A WORKER", []),
      ],
      "2026",
      today,
    );
    expect(rows).toHaveLength(1); // 扶養家族がいない人は出さない
    expect(rows[0].achieved.map((d) => d.name)).toEqual(["父", "弟"]);
    expect(rows[0].shortages).toHaveLength(1);
    expect(rows[0].shortages[0]).toMatchObject({ total: 100000, target: 380000 });
  });
  it("対象年が違う送金は数えない", () => {
    const rows = buildFuyoRoster([w("a", "A", [dep("父", "1970-05-01", [{ year: "2025", amount: "500000" }])])], "2026", today);
    expect(rows[0].achieved).toHaveLength(0);
  });
  it("ファイル名", () => {
    expect(fuyoFileName("年末調整時", "2026", "NGUYEN/VAN A")).toBe("扶養控除等申告書_年末調整時_2026_NGUYEN_VAN A.pdf");
    expect(fuyoFileName("入社時", "2026", "A")).toBe("扶養控除等申告書_入社時_A.pdf");
  });
});
