import { describe, expect, it } from "vitest";
import {
  SSW_CANCEL_TODO_TITLE,
  SSW_JOIN_TODO_TITLE,
  addMonthsDate,
  buildSswInsuranceRows,
  isSswInsuranceTarget,
  sswActionCount,
  sswApplyCopyText,
  sswApplyFields,
  sswInsuranceMonths,
  sswInsuranceState,
  sswTodosByWorker,
  tomorrowOf,
  type SswInsuranceWorker,
} from "./ssw-insurance";
import type { TodoStatusOption } from "./todo";

const TODAY = "2026-09-07";

function worker(over: Partial<SswInsuranceWorker> = {}): SswInsuranceWorker {
  return {
    id: "w1",
    name: "VU THI NHAN",
    kana: "ヴー ティ ニャン",
    nationality: "ベトナム",
    gender: "女",
    birth: "1988-09-30",
    status: "在籍中",
    residence_status: "特定技能1号",
    residence_expiry_date: "2027-04-07",
    leaving_on: null,
    current_organization_id: "o1",
    organizations: { name: "株式会社ベース" },
    messenger_link: "",
    ssw_insurance_link: "",
    ssw_insurance_expiry_date: null,
    ssw_insurance_self_join: false,
    ssw_insurance_no: "",
    ssw_insurance_declined: false,
    ssw_insurance_declined_on: null,
    ssw_insurance_note: "",
    ...over,
  };
}

const OPTIONS: TodoStatusOption[] = [
  { id: "1", kind: "特定技能総合保険", stage: "未着手", name: "未着手", sort_no: 1 },
  { id: "2", kind: "特定技能総合保険", stage: "進行中", name: "申込手続中", sort_no: 1 },
  { id: "3", kind: "特定技能総合保険", stage: "完了", name: "完了", sort_no: 1 },
];

describe("isSswInsuranceTarget", () => {
  it("特定技能の在留資格だけを対象にする", () => {
    expect(isSswInsuranceTarget("特定技能1号")).toBe(true);
    expect(isSswInsuranceTarget("特定技能2号")).toBe(true);
    expect(isSswInsuranceTarget("技能実習2号ロ")).toBe(false);
    expect(isSswInsuranceTarget("")).toBe(false);
  });
});

describe("sswInsuranceState", () => {
  it("未加入・会社負担は加入手続きが必要", () => {
    expect(sswInsuranceState(worker(), "会社負担", TODAY)).toBe("notJoined");
  });

  it("未加入・外国人負担で希望が未確認なら意思確認", () => {
    expect(sswInsuranceState(worker(), "外国人負担", TODAY)).toBe("willCheck");
  });

  it("外国人負担でも本人が希望していれば加入手続きが必要", () => {
    expect(
      sswInsuranceState(worker({ ssw_insurance_self_join: true }), "外国人負担", TODAY),
    ).toBe("notJoined");
  });

  it("意思確認をして加入しないと決めた人は加入しないの欄に出す", () => {
    expect(
      sswInsuranceState(worker({ ssw_insurance_declined: true }), "外国人負担", TODAY),
    ).toBe("declined");
  });

  it("有効期限が過ぎていれば期限切れ", () => {
    expect(
      sswInsuranceState(worker({ ssw_insurance_expiry_date: "2026-09-06" }), "会社負担", TODAY),
    ).toBe("expired");
  });

  it("有効期限まで1か月以内はまもなく期限", () => {
    expect(
      sswInsuranceState(worker({ ssw_insurance_expiry_date: "2026-10-01" }), "会社負担", TODAY),
    ).toBe("soon");
  });

  it("有効期限まで余裕があれば加入中", () => {
    expect(
      sswInsuranceState(worker({ ssw_insurance_expiry_date: "2027-04-07" }), "会社負担", TODAY),
    ).toBe("active");
  });

  it("退職者で加入したままなら解約手続きが必要", () => {
    const w = worker({ status: "退職", ssw_insurance_expiry_date: "2027-04-07" });
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("cancel");
    // 解約手続きのTODOが完了していれば一覧から外す
    expect(sswInsuranceState(w, "会社負担", TODAY, true)).toBe("none");
  });

  it("退職者で未加入なら一覧に出さない", () => {
    expect(sswInsuranceState(worker({ status: "退職" }), "会社負担", TODAY)).toBe("none");
  });
});

describe("sswTodosByWorker", () => {
  const todos = [
    {
      id: "t1",
      todo_no: "TODO-2001",
      kind: "特定技能総合保険",
      worker_id: "w1",
      title: SSW_JOIN_TODO_TITLE,
      status: "申込手続中",
      deleted_at: null,
    },
    {
      id: "t2",
      todo_no: "TODO-2002",
      kind: "特定技能総合保険",
      worker_id: "w1",
      title: SSW_CANCEL_TODO_TITLE,
      status: "完了",
      deleted_at: null,
    },
    {
      id: "t3",
      todo_no: "TODO-2003",
      kind: "申請準備",
      worker_id: "w1",
      title: "更新",
      status: "未着手",
      deleted_at: null,
    },
    {
      id: "t4",
      todo_no: "TODO-2004",
      kind: "特定技能総合保険",
      worker_id: "w1",
      title: SSW_JOIN_TODO_TITLE,
      status: "未着手",
      deleted_at: "2026-09-01T00:00:00Z",
    },
  ];

  it("加入・解約のTODOを外国人ごとに拾い、完了かどうかを付ける", () => {
    const map = sswTodosByWorker(todos, OPTIONS);
    const pair = map.get("w1");
    expect(pair?.join?.id).toBe("t1");
    expect(pair?.join?.done).toBe(false);
    expect(pair?.cancel?.id).toBe("t2");
    expect(pair?.cancel?.done).toBe(true);
  });

  it("他の構成のTODOと削除フォルダのTODOは拾わない", () => {
    const map = sswTodosByWorker(
      todos.filter((t) => t.id === "t3" || t.id === "t4"),
      OPTIONS,
    );
    expect(map.get("w1")).toBeUndefined();
  });
});

describe("buildSswInsuranceRows", () => {
  it("所属機関の負担区分で仕分けし、期限の早い順に並べる", () => {
    const rows = buildSswInsuranceRows(
      [
        worker({ id: "a", name: "A", ssw_insurance_expiry_date: "2026-10-01" }),
        worker({ id: "b", name: "B", ssw_insurance_expiry_date: "2026-09-01" }),
        worker({ id: "c", name: "C", current_organization_id: "o2" }),
        worker({ id: "d", name: "D", status: "退職" }),
      ],
      new Map([
        ["o1", { name: "株式会社ベース", burden: "会社負担" }],
        ["o2", { name: "株式会社さくら", burden: "外国人負担" }],
      ]),
      new Map(),
      TODAY,
    );
    // 退職・未加入の D は出さない
    expect(rows.map((r) => r.worker.id)).toEqual(["b", "a", "c"]);
    expect(rows.map((r) => r.state)).toEqual(["expired", "soon", "willCheck"]);
    expect(rows[2].orgName).toBe("株式会社さくら");
    expect(sswActionCount(rows)).toBe(2);
  });
});

describe("加入月数の計算", () => {
  it("月末は日を丸めて月を足す", () => {
    expect(addMonthsDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsDate("2026-09-08", 7)).toBe("2027-04-08");
  });

  it("在留期限までをカバーする最小の月数を返す", () => {
    // 2026/09/08 から7ヶ月で 2027/04/08 → 在留期限 2027/04/07 をカバーできる
    expect(sswInsuranceMonths("2026-09-08", "2027-04-07")).toBe(7);
    expect(sswInsuranceMonths("2026-09-08", "2026-10-08")).toBe(1);
    expect(sswInsuranceMonths("2026-09-08", "2026-10-09")).toBe(2);
  });

  it("在留期限が未登録・始期が期限より後のときは計算しない", () => {
    expect(sswInsuranceMonths("2026-09-08", null)).toBeNull();
    expect(sswInsuranceMonths("2027-05-01", "2027-04-07")).toBeNull();
  });

  it("保険始期希望日の初期値は着金日以降にするため翌日", () => {
    expect(tomorrowOf("2026-09-07")).toBe("2026-09-08");
    expect(tomorrowOf("2026-12-31")).toBe("2027-01-01");
  });
});

describe("sswApplyFields", () => {
  it("申込フォームの並びで外国人情報を出す", () => {
    const fields = sswApplyFields(worker(), "株式会社ベース", "2026-09-08");
    expect(fields.map((f) => f.value)).toEqual([
      "VU THI NHAN",
      "ベトナム",
      "女",
      "1988/09/30",
      "2026/09/08",
      "株式会社ベース",
    ]);
    expect(sswApplyCopyText(fields).split("\n")).toHaveLength(6);
  });

  it("未登録の項目には案内を出す", () => {
    const fields = sswApplyFields(worker({ birth: null, gender: "" }), "", "2026-09-08");
    expect(fields[2].hint).toBe("外国人詳細の性別が未登録です");
    expect(fields[3].value).toBe("");
    expect(fields[5].hint).toBe("現在の所属機関が未設定です");
  });
});
