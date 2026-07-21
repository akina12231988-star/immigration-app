import { describe, expect, it } from "vitest";
import type { WorkHistory } from "@/types/ssw";
import { calcSsw, entryDays, ymdFullText } from "./calc";

let seq = 0;
const h = (
  visa: WorkHistory["visa"],
  start: string,
  end: string | null,
  keptResidence = false,
): WorkHistory => ({
  id: `t${++seq}`,
  visa,
  start,
  end,
  org: "",
  role: "",
  note: "",
  keptResidence,
});

describe("entryDays（両端を含む在留日数）", () => {
  it("同日開始・終了は1日", () => {
    expect(entryDays({ start: "2024-01-01", end: "2024-01-01" }, "2026-01-01")).toBe(1);
  });
  it("1か月まるごとは月の日数どおり", () => {
    expect(entryDays({ start: "2024-01-01", end: "2024-01-31" }, "2026-01-01")).toBe(31);
    expect(entryDays({ start: "2024-02-01", end: "2024-02-29" }, "2026-01-01")).toBe(29); // うるう年
  });
  it("終了日が空なら今日までを数える（継続中）", () => {
    expect(entryDays({ start: "2024-01-01", end: null }, "2024-01-10")).toBe(10);
  });
  it("開始日より前の終了日でも負にならない", () => {
    expect(entryDays({ start: "2024-01-10", end: "2024-01-01" }, "2026-01-01")).toBe(0);
  });
});

describe("calcSsw: 5年上限（暦上の5年後までの実日数）", () => {
  it("うるう年を2回跨ぐ起点では1827日", () => {
    // 2023-06-01 → 2028-06-01（2024年・2028年の2月を含む）
    const c = calcSsw([h("特定技能1号", "2023-06-01", "2023-06-30")], "2023-07-01");
    expect(c.capDays).toBe(1827);
  });
  it("うるう年を1回だけ跨ぐ起点では1826日", () => {
    // 2022-04-01 → 2027-04-01（2024年の2月のみ含む）
    const c = calcSsw([h("特定技能1号", "2022-04-01", "2022-04-30")], "2022-05-01");
    expect(c.capDays).toBe(1826);
  });
  it("対象期間が未登録なら既定の1826日（5×365.25の丸め）", () => {
    const c = calcSsw([h("技能実習", "2020-01-01", "2022-12-31")], "2026-07-12");
    expect(c.capDays).toBe(1826);
    expect(c.usedDays).toBe(0);
    expect(c.firstStart).toBeNull();
    expect(c.status).toBe("1号期間未登録");
  });
});

describe("calcSsw: 通算対象の区分", () => {
  it("特定活動（特定技能1号移行準備）は通算に算入される", () => {
    const c = calcSsw(
      [h("特定活動（特定技能1号移行準備）", "2024-01-01", "2024-01-31")],
      "2026-07-12",
    );
    expect(c.usedDays).toBe(31);
    expect(c.firstStart).toBe("2024-01-01");
  });
  it("特定活動（特定技能2号移行準備）・技能実習・本国での職歴は算入されない", () => {
    const c = calcSsw(
      [
        h("技能実習", "2019-04-01", "2022-03-31"),
        h("特定活動（特定技能2号移行準備）", "2024-01-01", "2024-03-31"),
        h("本国での職歴", "2015-01-01", "2018-12-31"),
      ],
      "2026-07-12",
    );
    expect(c.usedDays).toBe(0);
    expect(c.status).toBe("1号期間未登録");
  });
});

describe("calcSsw: 在留資格を保持したままの帰国期間", () => {
  // 特定技能1号で就労 → 退職して帰国（特定技能1号は保持したまま）→ 再雇用で再来日（継続中）
  const history = [
    h("特定技能1号", "2025-12-04", "2026-01-12"),
    h("本国での職歴", "2026-01-13", "2026-07-13", true),
    h("特定技能1号", "2026-07-14", null),
  ];

  it("保持したまま帰国した期間もカウントされ、起算日から今日まで連続で数える", () => {
    const c = calcSsw(history, "2026-07-21");
    // 40日 + 帰国182日 + 8日 = 230日（2025-12-04〜2026-07-21 の連続日数と一致）
    expect(c.usedDays).toBe(230);
    expect(c.firstStart).toBe("2025-12-04");
    expect(c.ongoing).toBe(true);
    expect(c.status).toBe("1号在留中");
    expect(c.remainDays).toBe(1826 - 230);
  });

  it("在留資格を切って帰国した場合は帰国期間をカウントしない", () => {
    const cut = [
      h("特定技能1号", "2025-12-04", "2026-01-12"),
      h("本国での職歴", "2026-01-13", "2026-07-13", false),
      h("特定技能1号", "2026-07-14", null),
    ];
    const c = calcSsw(cut, "2026-07-21");
    expect(c.usedDays).toBe(48); // 40日 + 8日のみ
  });

  it("保持フラグは帰国期間の区分（本国での職歴・その他）にだけ効く", () => {
    // 技能実習に誤ってフラグが付いてもカウントされない
    const c = calcSsw([h("技能実習", "2024-01-01", "2024-12-31", true)], "2026-07-21");
    expect(c.usedDays).toBe(0);
    expect(c.status).toBe("1号期間未登録");
  });
});

describe("calcSsw: 複数期間の合算（実運用ケース）", () => {
  // 技能実習 → 移行準備の特定活動 → 特定技能1号（継続中）
  const history = [
    h("技能実習", "2019-04-01", "2022-03-31"),
    h("特定活動（特定技能1号移行準備）", "2022-04-01", "2022-05-30"),
    h("特定技能1号", "2022-05-31", null),
  ];
  const c = calcSsw(history, "2026-07-12");

  it("対象2期間だけを日数合算する（60 + 1504 = 1564日）", () => {
    expect(c.usedDays).toBe(1564);
  });
  it("カウント起点は最初の対象期間（特定活動）の開始日", () => {
    expect(c.firstStart).toBe("2022-04-01");
  });
  it("残日数 = 上限1826 − 通算1564 = 262日", () => {
    expect(c.capDays).toBe(1826);
    expect(c.remainDays).toBe(262);
  });
  it("継続中なので満了予定日 = 今日 + 残日数 − 1 = 2027-03-30", () => {
    expect(c.ongoing).toBe(true);
    expect(c.expiry).toBe("2027-03-30");
    expect(c.status).toBe("1号在留中");
  });
  it("年月日換算は 1か月=30.4375日 の近似（4年3か月12日）", () => {
    expect(ymdFullText(c.used)).toBe("4年3か月12日");
    expect(c.usedMonths).toBe(51);
  });
  it("履歴は開始日昇順に並ぶ", () => {
    expect(c.hist.map((x) => x.start)).toEqual(["2019-04-01", "2022-04-01", "2022-05-31"]);
  });
});

describe("calcSsw: ステータス判定", () => {
  it("通算が上限を超えたら「5年到達」・残0・満了予定なし", () => {
    const c = calcSsw([h("特定技能1号", "2020-01-01", "2025-01-10")], "2026-01-01");
    expect(c.capDays).toBe(1827);
    expect(c.usedDays).toBe(1837);
    expect(c.remainDays).toBe(0);
    expect(c.status).toBe("5年到達");
    expect(c.expiry).toBeNull();
  });
  it("対象期間が過去に終了し残があれば「中断中」・満了予定なし", () => {
    const c = calcSsw([h("特定技能1号", "2023-01-01", "2023-12-31")], "2026-07-12");
    expect(c.ongoing).toBe(false);
    expect(c.status).toBe("中断中");
    expect(c.expiry).toBeNull();
    expect(c.remainDays).toBeGreaterThan(0);
  });
  it("終了日が今日以降なら継続中扱い", () => {
    const c = calcSsw([h("特定技能1号", "2024-01-01", "2026-12-31")], "2026-07-12");
    expect(c.ongoing).toBe(true);
    expect(c.status).toBe("1号在留中");
  });
});

describe("calcSsw: ゲージ上限", () => {
  it("usedMonths は60か月で頭打ち", () => {
    const c = calcSsw([h("特定技能1号", "2018-01-01", "2025-12-31")], "2026-07-12");
    expect(c.usedMonths).toBe(60);
  });
});
