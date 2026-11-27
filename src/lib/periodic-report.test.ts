import { describe, expect, it } from "vitest";
import {
  bonusAverage,
  buildSection36,
  countedMonths,
  entryToMonthTotals,
  fiscalYearMonths,
  gradeStartYm,
  hoursText,
  parseHoursInput,
  raiseBase,
  raiseRate,
  type MonthTotals,
} from "@/lib/periodic-report";

const month = (patch: Partial<MonthTotals>): MonthTotals => ({
  ym: "2025-04",
  excluded: false,
  workDays: null,
  regularHours: null,
  overtimeHours: null,
  cashPay: null,
  overtimePay: 0,
  commute: 0,
  attendance: 0,
  family: 0,
  bonus: 0,
  food: 0,
  housing: 0,
  taxSocial: 0,
  otherDeduction: 0,
  ...patch,
});

describe("entryToMonthTotals（項目のカテゴリで3-6号の欄に集計）", () => {
  const items = {
    kihon: { category: "基本給など" },
    zangyo: { category: "超過労働給与" },
    tsukin: { category: "通勤手当" },
    kaikin: { category: "精皆勤手当" },
    kazoku: { category: "家族手当" },
    shoyo: { category: "賞与など" },
    shokuhi: { category: "控除 食費" },
    ryohi: { category: "控除 居住費" },
    zei: { category: "控除 税・社会保険料" },
    sonota: { category: "控除 その他" },
    sashihiki: { category: "集計しない" },
  };

  it("（4）は基本給など＋超過＋通勤＋精皆勤＋家族。賞与・控除・集計しないは入れない", () => {
    const t = entryToMonthTotals(
      {
        ym: "2025-04",
        work_days: 21,
        total_hours: 178,
        overtime_hours: 10,
        amounts: {
          kihon: 200000,
          zangyo: 17000,
          tsukin: 5000,
          kaikin: 3000,
          kazoku: 2000,
          shoyo: 100000,
          shokuhi: 1000,
          ryohi: 20000,
          zei: 32000,
          sonota: 500,
          sashihiki: 999999, // 差引支給額など。無視する
        },
        excluded: false,
      },
      items,
    );
    expect(t.cashPay).toBe(227000); // 200000+17000+5000+3000+2000
    expect(t.overtimePay).toBe(17000);
    expect(t.commute).toBe(5000);
    expect(t.attendance).toBe(3000);
    expect(t.family).toBe(2000);
    expect(t.bonus).toBe(100000);
    expect(t.food).toBe(1000);
    expect(t.housing).toBe(20000);
    expect(t.taxSocial).toBe(32000);
    expect(t.otherDeduction).toBe(500);
    expect(t.regularHours).toBe(168); // （2）＝実労働時間178−超過10
  });

  it("同じカテゴリの項目は合算する（手当が2つある場合など）", () => {
    const t = entryToMonthTotals(
      { ym: "2025-04", work_days: null, total_hours: null, overtime_hours: null, amounts: { zangyo: 1000, zangyo2: 2000 }, excluded: false },
      { zangyo: { category: "超過労働給与" }, zangyo2: { category: "超過労働給与" } },
    );
    expect(t.overtimePay).toBe(3000);
    expect(t.cashPay).toBe(3000);
  });

  it("金額が1つも入っていない月は（4）が未入力（null）になる", () => {
    const t = entryToMonthTotals(
      { ym: "2025-04", work_days: 21, total_hours: null, overtime_hours: null, amounts: {}, excluded: false },
      items,
    );
    expect(t.cashPay).toBeNull();
  });
});

describe("buildSection36（要領の計算ルール）", () => {
  it("月の途中の入退社の月を除いた人×月の加重平均（記載例の21日）", () => {
    // Aは12か月×20日、Bは4/15入社で4月を除外して11か月×22日 → (240+242)/23 = 20.95… → 21
    const a = { months: fiscalYearMonths(2025).map((ym) => month({ ym, workDays: 20 })) };
    const b = {
      months: fiscalYearMonths(2025).map((ym, i) =>
        month({ ym, workDays: i === 0 ? 10 : 22, excluded: i === 0 }),
      ),
    };
    expect(buildSection36([a, b]).workDays).toBe(21);
  });

  it("（5）賞与は支払われた人数で割る（記載例の356,667円）", () => {
    // A 200,000＋250,000 / B 210,000＋230,000 / C 0＋180,000 → 1,070,000 ÷ 3名 = 356,666.6… → 356,667
    const w = (b1: number, b2: number) => ({
      months: [month({ ym: "2025-06", bonus: b1, cashPay: 1 }), month({ ym: "2025-12", bonus: b2, cashPay: 1 })],
    });
    expect(bonusAverage([w(200000, 250000), w(210000, 230000), w(0, 180000)])).toBe(356667);
  });

  it("集計できる月が無ければ（1）〜（6）は0＋備考「1か月未満」", () => {
    const s = buildSection36([{ months: [month({ ym: "2025-04", workDays: 5, excluded: true })] }]);
    expect(s.workDays).toBe(0);
    expect(s.cashPay).toBe(0);
    expect(s.note).toBe("1か月未満");
  });

  it("対象の人がいなければ平均は0・備考なし（2号の列が空のときなど）", () => {
    const s = buildSection36([]);
    expect(s.cashPay).toBe(0);
    expect(s.note).toBe("");
  });
});

describe("raiseBase / raiseRate（要領の記載例）", () => {
  it("基準額は（4）−（①〜④）の月額平均", () => {
    const months = [
      month({ ym: "2025-04", cashPay: 230000, overtimePay: 17000, commute: 5000 }),
      month({ ym: "2025-05", cashPay: 230000, overtimePay: 17000, commute: 5000 }),
    ];
    expect(raiseBase(months)).toBe(208000);
    expect(raiseBase([month({ ym: "2025-04" })])).toBeNull(); // 金額が無ければ計算しない
  });

  it("昇給率1号の記載例: 2.7%", () => {
    // {(190,000+189,000)−(185,000+184,000)} ÷ (185,000+184,000) ×100 = 2.7100… → 2.7
    expect(
      raiseRate([
        { baseCurrent: 190000, basePrevious: 185000 },
        { baseCurrent: 189000, basePrevious: 184000 },
      ]),
    ).toBe(2.7);
  });

  it("昇給率2号の記載例: 4.6%", () => {
    // (193,000−184,500) ÷ 184,500 ×100 = 4.607… → 4.6
    expect(raiseRate([{ baseCurrent: 193000, basePrevious: 184500 }])).toBe(4.6);
  });

  it("昇給していなければ0%・対象者がいなければ空欄（null）", () => {
    expect(raiseRate([{ baseCurrent: 185000, basePrevious: 185000 }])).toBe(0);
    expect(raiseRate([])).toBeNull();
  });
});

describe("fiscalYearMonths / countedMonths", () => {
  it("年度の12か月（4月〜翌3月）", () => {
    const months = fiscalYearMonths(2025);
    expect(months[0]).toBe("2025-04");
    expect(months[8]).toBe("2025-12");
    expect(months[9]).toBe("2026-01");
    expect(months[11]).toBe("2026-03");
  });

  it("除外月と未入力の月は集計に入れない", () => {
    const months = [
      month({ ym: "2025-04", workDays: 20 }),
      month({ ym: "2025-05", workDays: 20, excluded: true }),
      month({ ym: "2025-06" }), // 何も入っていない
    ];
    expect(countedMonths(months).map((m) => m.ym)).toEqual(["2025-04"]);
  });
});

describe("gradeStartYm（2号移行の月割り）", () => {
  it("月の初日の許可はその月から、月の途中は翌月から", () => {
    expect(gradeStartYm("2025-09-01")).toBe("2025-09");
    expect(gradeStartYm("2025-09-15")).toBe("2025-10"); // 要領の記載例（9/15許可→10月分以降）
    expect(gradeStartYm("2025-12-20")).toBe("2026-01");
    expect(gradeStartYm("")).toBe("");
  });
});

describe("parseHoursInput / hoursText（時:分の入力）", () => {
  it("「2110」→ 21:10（21+10/60時間）。「:」付き・全角「：」もそのまま受ける", () => {
    expect(parseHoursInput("2110")).toBeCloseTo(21 + 10 / 60, 10);
    expect(parseHoursInput("21:10")).toBeCloseTo(21 + 10 / 60, 10);
    expect(parseHoursInput("21：10")).toBeCloseTo(21 + 10 / 60, 10);
    expect(parseHoursInput("104")).toBeCloseTo(1 + 4 / 60, 10); // 3桁は最後の2桁が分
  });
  it("2桁以下は時間だけ。小数・空も受ける。分の60以上は繰り上げ", () => {
    expect(parseHoursInput("34")).toBe(34);
    expect(parseHoursInput("8.5")).toBe(8.5);
    expect(parseHoursInput("")).toBeNull();
    expect(parseHoursInput("2175")).toBeCloseTo(22 + 15 / 60, 10); // 21:75 → 22:15
  });
  it("表示は「21:10」の形（分は四捨五入）", () => {
    expect(hoursText(21 + 10 / 60)).toBe("21:10");
    expect(hoursText(34)).toBe("34:00");
    expect(hoursText(null)).toBe("");
    expect(hoursText(167.9999)).toBe("168:00");
  });
});

describe("超過時間数（時:分）の項目の合算", () => {
  const items = {
    jikangai: { category: "超過時間数（時:分）" },
    kyujitsu: { category: "超過時間数（時:分）" },
    kihon: { category: "基本給など" },
  };
  it("時間外・休日などの項目を（3）超過実労働時間数へ合算し、金額には入れない", () => {
    const t = entryToMonthTotals(
      {
        ym: "2025-04",
        work_days: 21,
        total_hours: 178.5,
        overtime_hours: null,
        amounts: { jikangai: 10.25, kyujitsu: 4.5, kihon: 200000 },
        excluded: false,
      },
      items,
    );
    expect(t.overtimeHours).toBeCloseTo(14.75, 10);
    expect(t.regularHours).toBeCloseTo(178.5 - 14.75, 10); // （2）＝実労働−合算した超過
    expect(t.cashPay).toBe(200000); // 時間数は金額に入らない
  });
  it("直接入力した超過時間とも足し合わせる。どちらも無い月は未入力のまま", () => {
    const t = entryToMonthTotals(
      { ym: "2025-04", work_days: null, total_hours: null, overtime_hours: 5, amounts: { jikangai: 10 }, excluded: false },
      items,
    );
    expect(t.overtimeHours).toBe(15);
    const none = entryToMonthTotals(
      { ym: "2025-04", work_days: null, total_hours: null, overtime_hours: null, amounts: { kihon: 1 }, excluded: false },
      items,
    );
    expect(none.overtimeHours).toBeNull();
  });
});
