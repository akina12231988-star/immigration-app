import { describe, expect, it } from "vitest";
import {
  SSW_CANCEL_TODO_TITLE,
  SSW_JOIN_TODO_TITLE,
  addMonthsDate,
  buildSswInsuranceRows,
  isSswInsuranceCandidate,
  isSswInsuranceTarget,
  sswActionCount,
  sswApplyCopyText,
  sswApplyFields,
  sswAutoDeclineReason,
  hasUnjoinedSales,
  sswBurdenRows,
  sswBurdenUnsetCount,
  isSswTodoInProgress,
  sswColumnOf,
  sswDeclineNote,
  sswInsuranceMonths,
  sswInsuranceState,
  sswTodosByWorker,
  sswSalesByWorker,
  sswTaskOf,
  sortSswRows,
  isSswActionRow,
  tomorrowOf,
  type SswInsuranceWorker,
  formatYenInput,
  formatYenLabel,
  parseYenDigits
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
    support: "支援対象",
    residence_status: "特定技能1号",
    residence_expiry_date: "2027-04-07",
    residence_permit_date: "2026-02-19",
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
    ssw_insurance_declined_org_id: null,
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
  it("特定技能1号だけを対象にする", () => {
    expect(isSswInsuranceTarget("特定技能1号")).toBe(true);
    expect(isSswInsuranceTarget("特定技能１号")).toBe(true);
    expect(isSswInsuranceTarget("特定技能1号（農業）")).toBe(true);
  });

  it("移行準備の特定活動・特定技能2号・技能実習は対象にしない", () => {
    expect(isSswInsuranceTarget("特定活動（特定技能1号以降準備）")).toBe(false);
    expect(isSswInsuranceTarget("特定活動（特定技能1号移行準備）")).toBe(false);
    expect(isSswInsuranceTarget("特定活動（特定技能2号移行準備）")).toBe(false);
    expect(isSswInsuranceTarget("特定技能2号")).toBe(false);
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

describe("保険に入る候補の人か", () => {
  it("申請準備中で支援開始前の人は一覧に出さない", () => {
    const w = worker({ status: "申請準備中", support: "支援開始前" });
    expect(isSswInsuranceCandidate(w)).toBe(false);
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("none");
  });

  it("申請準備中でも支援対象なら出す（更新の準備中など）", () => {
    const w = worker({ status: "申請準備中", support: "支援対象" });
    expect(isSswInsuranceCandidate(w)).toBe(true);
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("notJoined");
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

describe("加入しない理由", () => {
  it("外国人負担のときは理由を選ばず自動で残す", () => {
    expect(sswAutoDeclineReason("外国人負担")).toBe("外国人負担だから");
    expect(sswAutoDeclineReason("会社負担")).toBeNull();
    expect(sswAutoDeclineReason("")).toBeNull();
  });

  it("選んだ理由をそのまま備考にする", () => {
    expect(sswDeclineNote("特定技能２号になったから", "")).toBe("特定技能２号になったから");
  });

  it("その他のときは入力した内容を備考にする", () => {
    expect(sswDeclineNote("その他", " 本人が希望しなかった ")).toBe("本人が希望しなかった");
  });
});

describe("加入しないの引き継ぎ（転職したらまた出す）", () => {
  it("判断したときの所属機関にいる間はTODOに出さない", () => {
    const w = worker({
      ssw_insurance_declined: true,
      ssw_insurance_declined_org_id: "o1",
      current_organization_id: "o1",
    });
    expect(sswInsuranceState(w, "外国人負担", TODAY)).toBe("declined");
  });

  it("別の所属機関に転職したら、また未加入として出す", () => {
    const w = worker({
      ssw_insurance_declined: true,
      ssw_insurance_declined_org_id: "o1",
      current_organization_id: "o2",
    });
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("notJoined");
  });

  it("期限切れでも、加入しないと決めた人はTODOに出さない", () => {
    const w = worker({
      ssw_insurance_declined: true,
      ssw_insurance_declined_org_id: "o1",
      ssw_insurance_expiry_date: "2026-09-01",
    });
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("declined");
  });

  it("有効期限に余裕がある間は加入中のまま", () => {
    const w = worker({
      ssw_insurance_declined: true,
      ssw_insurance_declined_org_id: "o1",
      ssw_insurance_expiry_date: "2027-04-07",
    });
    expect(sswInsuranceState(w, "会社負担", TODAY)).toBe("active");
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

describe("未着手／申込手続中の2列", () => {
  const base = {
    worker: worker({ ssw_insurance_expiry_date: "2026-09-01" }),
    orgName: "株式会社ベース",
    burden: "会社負担",
    state: "expired" as const,
  };

  it("TODOが無い人は未着手の列に出す", () => {
    expect(sswColumnOf({ ...base, todos: {} })).toBe("notStarted");
  });

  it("経過が未着手のTODOも未着手の列", () => {
    const todos = sswTodosByWorker(
      [
        {
          id: "t1",
          todo_no: "TODO-2001",
          kind: "特定技能総合保険",
          worker_id: "w1",
          title: SSW_JOIN_TODO_TITLE,
          status: "未着手",
          deleted_at: null,
        },
      ],
      OPTIONS,
    );
    expect(sswColumnOf({ ...base, todos: todos.get("w1") ?? {} })).toBe("notStarted");
  });

  it("申込手続中のTODOは申込手続中の列", () => {
    const todos = sswTodosByWorker(
      [
        {
          id: "t1",
          todo_no: "TODO-2001",
          kind: "特定技能総合保険",
          worker_id: "w1",
          title: SSW_JOIN_TODO_TITLE,
          status: "申込手続中",
          deleted_at: null,
        },
      ],
      OPTIONS,
    );
    expect(sswColumnOf({ ...base, todos: todos.get("w1") ?? {} })).toBe("inProgress");
  });

  it("手続き中の判定: TODOが無い・未着手は手続き中でない。申込手続中・完了は手続き中（ダッシュボードのアラートから外す）", () => {
    const todo = (status: string) =>
      sswTodosByWorker(
        [
          {
            id: "t1",
            todo_no: "TODO-2001",
            kind: "特定技能総合保険",
            worker_id: "w1",
            title: SSW_JOIN_TODO_TITLE,
            status,
            deleted_at: null,
          },
        ],
        OPTIONS,
      ).get("w1")?.join;
    expect(isSswTodoInProgress(undefined)).toBe(false);
    expect(isSswTodoInProgress(todo("未着手"))).toBe(false);
    expect(isSswTodoInProgress(todo("申込手続中"))).toBe(true);
    expect(isSswTodoInProgress(todo("完了"))).toBe(true);
  });

  it("退職の行は解約手続きのTODOで列を決める", () => {
    const todos = sswTodosByWorker(
      [
        {
          id: "t2",
          todo_no: "TODO-2002",
          kind: "特定技能総合保険",
          worker_id: "w1",
          title: SSW_CANCEL_TODO_TITLE,
          status: "申込手続中",
          deleted_at: null,
        },
      ],
      OPTIONS,
    );
    expect(
      sswColumnOf({ ...base, state: "cancel", todos: todos.get("w1") ?? {} }),
    ).toBe("inProgress");
  });

  it("加入中・加入しないは列に出さない", () => {
    expect(isSswActionRow({ ...base, todos: {} })).toBe(true);
    expect(isSswActionRow({ ...base, state: "active", todos: {} })).toBe(false);
    expect(isSswActionRow({ ...base, state: "declined", todos: {} })).toBe(false);
  });
});

describe("加入手続きと解約手続きの仕分け", () => {
  const row = (state: "expired" | "cancel" | "notJoined") => ({
    worker: worker(),
    orgName: "株式会社ベース",
    burden: "会社負担",
    state,
    todos: {},
  });

  it("退職の行だけ解約手続き、そのほかは加入手続き", () => {
    expect(sswTaskOf(row("cancel"))).toBe("cancel");
    expect(sswTaskOf(row("expired"))).toBe("join");
    expect(sswTaskOf(row("notJoined"))).toBe("join");
  });
});

describe("並び替え", () => {
  const row = (name: string, expiry: string | null, orgName: string) => ({
    worker: worker({ id: name, name, ssw_insurance_expiry_date: expiry }),
    orgName,
    burden: "会社負担",
    state: "expired" as const,
    todos: {},
  });
  const rows = [
    row("B", "2026-10-01", "さくら"),
    row("C", null, "あおば"),
    row("A", "2026-08-01", "みらい"),
  ];

  it("既定は有効期限が古い順（期限なしは最後）", () => {
    expect(sortSswRows(rows, "expiry").map((r) => r.worker.name)).toEqual(["A", "B", "C"]);
  });

  it("有効期限が新しい順でも、期限なしは最後にまとめる", () => {
    expect(sortSswRows(rows, "expiryDesc").map((r) => r.worker.name)).toEqual(["B", "A", "C"]);
  });

  it("氏名順・所属機関名順に並べ替えられる", () => {
    expect(sortSswRows(rows, "name").map((r) => r.worker.name)).toEqual(["A", "B", "C"]);
    expect(sortSswRows(rows, "org").map((r) => r.orgName)).toEqual(["あおば", "さくら", "みらい"]);
  });

  it("元の配列は変えない", () => {
    const before = rows.map((r) => r.worker.name);
    sortSswRows(rows, "name");
    expect(rows.map((r) => r.worker.name)).toEqual(before);
  });
});

describe("所属機関の負担区分の設定", () => {
  const orgs = [
    { id: "1", name: "みらい", intake: { ssw_insurance_burden: "会社負担" } },
    { id: "2", name: "さくら", intake: {} },
    { id: "3", name: "あおば", intake: { ssw_insurance_burden: "外国人負担" } },
    { id: "4", name: "かえで", intake: null },
  ];

  it("未設定の機関を先に、そのあと名前順に並べる", () => {
    expect(sswBurdenRows(orgs).map((r) => r.name)).toEqual([
      "かえで",
      "さくら",
      "あおば",
      "みらい",
    ]);
  });

  it("未設定の件数を数える", () => {
    expect(sswBurdenUnsetCount(sswBurdenRows(orgs))).toBe(2);
  });
});

describe("保険No.（売上）", () => {
  const sales = [
    { id: "s1", worker_id: "w1", freee_no: "S-0000004592", insurance_joined_on: null },
    { id: "s2", worker_id: "w1", freee_no: "S-0000004000", insurance_joined_on: "2026-03-01" },
    { id: "s3", worker_id: "w2", freee_no: "S-0000004601", insurance_joined_on: "2026-09-01" },
  ];

  it("外国人ごとにまとめる", () => {
    const map = sswSalesByWorker(sales);
    expect(map.get("w1")?.map((r) => r.id)).toEqual(["s1", "s2"]);
    expect(map.get("w2")).toHaveLength(1);
  });

  it("請求はあるのに加入の記録が無い売上があるか分かる", () => {
    const map = sswSalesByWorker(sales);
    expect(hasUnjoinedSales(map.get("w1"))).toBe(true);
    expect(hasUnjoinedSales(map.get("w2"))).toBe(false);
    expect(hasUnjoinedSales(undefined)).toBe(false);
  });
});

describe("解約金の金額入力", () => {
  it("数字だけを取り出し、3桁ごとのカンマと円で表示する", () => {
    expect(parseYenDigits("12,340")).toBe(12340);
    expect(parseYenDigits("１２３４０円")).toBe(12340);
    expect(parseYenDigits("abc")).toBeNull();
    expect(parseYenDigits("")).toBeNull();
    expect(formatYenInput(12340)).toBe("12,340");
    expect(formatYenInput(null)).toBe("");
    expect(formatYenLabel(12340)).toBe("12,340円");
    expect(formatYenLabel(undefined)).toBe("");
  });
});
