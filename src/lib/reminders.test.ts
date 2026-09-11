import { describe, expect, it } from "vitest";
import {
  advanceAlertText,
  advanceRepaidPatch,
  amountItemsPatch,
  amountItemsTotal,
  dueLabel,
  earliestDue,
  normalizeAmountItems,
  completionBlockedReason,
  daysSince,
  isAdvanceRepaid,
  isAdvanceUnpaid,
  payerLabel,
  payerPatch,
  reminderAmount,
  remindersCsv,
  repaymentLabel,
  formatReminderNo,
  nextReminderNo,
  reminderAlertText,
  reminderBoxes,
  reminderCounts,
  reminderStatusPatch,
  sortReminders,
} from "./reminders";
import type { Reminder } from "@/types/db";

const TODAY = "2026-09-07";

const rem = (over: Partial<Reminder>): Reminder => ({
  id: over.id ?? String(over.reminder_no ?? 1),
  reminder_no: 1,
  worker_id: "w1",
  kind: "市役所からの通知",
  content: "",
  status: "未連絡",
  contacted_on: null,
  replied_on: null,
  completed_on: null,
  note: "",
  created_by: null,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

describe("nextReminderNo（番号の割り当て）", () => {
  it("1〜30の中で最小の空き番号を返す", () => {
    expect(nextReminderNo([])).toBe(1);
    expect(nextReminderNo([1, 2, 4])).toBe(3);
    expect(nextReminderNo([2, 3])).toBe(1);
  });

  it("完了して空いた番号は次の人に割り当てる（30番まで埋まるまで31番以降は使わない）", () => {
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(nextReminderNo(all.filter((n) => n !== 7))).toBe(7);
  });

  it("30番まで全部埋まっているときだけ31番以降を割り当てる", () => {
    const all = Array.from({ length: 30 }, (_, i) => i + 1);
    expect(nextReminderNo(all)).toBe(31);
    expect(nextReminderNo([...all, 31, 32])).toBe(33);
    expect(nextReminderNo([...all, 32])).toBe(31);
  });
});

describe("formatReminderNo", () => {
  it("2桁でそろえる", () => {
    expect(formatReminderNo(1)).toBe("No.01");
    expect(formatReminderNo(30)).toBe("No.30");
    expect(formatReminderNo(31)).toBe("No.31");
  });
});

describe("reminderStatusPatch（進捗を変えたときの日付）", () => {
  it("連絡済みにしたら連絡日、返事ありにしたら返事日、完了にしたら完了日が入る", () => {
    const r = rem({});
    expect(reminderStatusPatch(r, "連絡済み（返事待ち）", TODAY)).toEqual({
      status: "連絡済み（返事待ち）",
      contacted_on: TODAY,
      completed_on: null,
    });
    expect(reminderStatusPatch(r, "返事あり", TODAY)).toEqual({
      status: "返事あり",
      contacted_on: TODAY,
      replied_on: TODAY,
      completed_on: null,
    });
    expect(reminderStatusPatch(r, "完了", TODAY)).toEqual({ status: "完了", completed_on: TODAY });
  });

  it("すでに入っている日付は変えない。完了を取り消したら完了日を消す", () => {
    const r = rem({ contacted_on: "2026-09-01", completed_on: "2026-09-05", status: "完了" });
    expect(reminderStatusPatch(r, "返事あり", TODAY)).toEqual({
      status: "返事あり",
      replied_on: TODAY,
      completed_on: null,
    });
  });
});

describe("sortReminders・reminderBoxes・reminderCounts", () => {
  const rows = [
    rem({ id: "a", reminder_no: 3, status: "連絡済み（返事待ち）", contacted_on: "2026-09-01" }),
    rem({ id: "b", reminder_no: 1, status: "完了", completed_on: "2026-08-01" }),
    rem({ id: "c", reminder_no: 1, status: "未連絡" }),
    rem({ id: "d", reminder_no: 31, status: "返事あり" }),
    rem({ id: "e", reminder_no: 2, status: "完了", completed_on: "2026-08-20" }),
  ];

  it("進行中を番号順に、完了は完了日の新しい順で後ろに並べる", () => {
    expect(sortReminders(rows).map((r) => r.id)).toEqual(["c", "a", "d", "e", "b"]);
  });

  it("箱は1〜30を全部出し、31番以降は使っている番号だけ出す", () => {
    const boxes = reminderBoxes(rows);
    expect(boxes).toHaveLength(31);
    expect(boxes[0]).toEqual({ no: 1, reminder: rows[2] }); // 完了した1番ではなく、いま使っている1番
    expect(boxes[1].reminder).toBeNull(); // 2番は完了しているので空き
    expect(boxes[30]).toEqual({ no: 31, reminder: rows[3] });
  });

  it("件数（進行中・未連絡・返事待ち・返事あり）", () => {
    expect(reminderCounts(rows)).toEqual({ open: 3, notContacted: 1, awaiting: 1, replied: 1, advanceUnpaid: 0 });
  });
});

describe("daysSince・reminderAlertText", () => {
  it("連絡からの日数を出す", () => {
    expect(daysSince("2026-09-01", TODAY)).toBe(6);
    expect(daysSince(null, TODAY)).toBeNull();
  });

  it("外国人詳細のアラート文", () => {
    expect(
      reminderAlertText(
        rem({ reminder_no: 3, status: "連絡済み（返事待ち）", contacted_on: "2026-09-01", content: "住民税の納付書" }),
        TODAY,
      ),
    ).toBe("No.03 市役所からの通知：住民税の納付書 … 返事待ち（連絡から6日）");
    expect(reminderAlertText(rem({ reminder_no: 5, kind: "" }), TODAY)).toBe("No.05 督促 … 未連絡");
    expect(reminderAlertText(rem({ reminder_no: 5, status: "返事あり" }), TODAY)).toBe(
      "No.05 市役所からの通知 … 返事あり（手続き中）",
    );
  });
});

describe("立替払い（本人の代わりに支払った分の返金の追いかけ）", () => {
  it("立て替えて返金が無ければ未返金。返金日が入れば返金済み", () => {
    const unpaid = rem({ advance_paid: true, advance_amount: 12000, advance_paid_on: "2026-08-28" });
    expect(isAdvanceUnpaid(unpaid)).toBe(true);
    expect(isAdvanceRepaid(unpaid)).toBe(false);
    expect(advanceAlertText(unpaid, TODAY)).toBe("立替 12,000円 未返金（支払から10日）");
    expect(advanceAlertText(rem({ advance_paid: true }), TODAY)).toBe("立替 金額未入力 未返金");
    const repaid = rem({ advance_paid: true, advance_amount: 12000, advance_repaid_on: "2026-09-05" });
    expect(isAdvanceUnpaid(repaid)).toBe(false);
    expect(isAdvanceRepaid(repaid)).toBe(true);
    expect(advanceAlertText(repaid, TODAY)).toBe("");
    // 立て替えていない・古いデータ（項目なし）は対象外
    expect(isAdvanceUnpaid(rem({}))).toBe(false);
    expect(isAdvanceUnpaid({ advance_paid: undefined, advance_repaid_on: undefined })).toBe(false);
  });

  it("未返金の間は完了にできず、返金日を入れると完了になる", () => {
    const r = rem({ status: "返事あり", advance_paid: true, advance_amount: 5000, completed_on: null });
    expect(completionBlockedReason(r)).toContain("5,000円");
    expect(completionBlockedReason(rem({}))).toBeNull();
    expect(advanceRepaidPatch(r, "2026-09-06", TODAY)).toEqual({
      advance_repaid_on: "2026-09-06",
      status: "完了",
      completed_on: TODAY,
    });
    // すでに完了なら返金日だけ入れる
    expect(advanceRepaidPatch(rem({ status: "完了", completed_on: "2026-09-01" }), "2026-09-06", TODAY)).toEqual({
      advance_repaid_on: "2026-09-06",
    });
  });

  it("件数とアラート文に立替の未返金が入る", () => {
    const rows = [
      rem({ reminder_no: 1, status: "返事あり", advance_paid: true, advance_amount: 3000, advance_paid_on: "2026-09-01" }),
      rem({ reminder_no: 2, status: "完了", advance_paid: true, advance_repaid_on: "2026-09-02" }),
      rem({ reminder_no: 3 }),
    ];
    expect(reminderCounts(rows).advanceUnpaid).toBe(1);
    expect(reminderAlertText(rows[0], TODAY)).toBe("No.01 市役所からの通知 … 返事あり（手続き中） ／ 立替 3,000円 未返金（支払から6日）");
  });
});

describe("金額・誰が払うか・一覧表", () => {
  it("支払の表示と返金確認", () => {
    expect(payerLabel(rem({ payer: "本人" }))).toBe("本人が払う");
    expect(payerLabel(rem({ payer: "代わり" }))).toBe("代わりに払う");
    expect(payerLabel(rem({ advance_paid: true }))).toBe("代わりに払う"); // 未設定でも立替なら代わり
    expect(payerLabel(rem({}))).toBe("");
    expect(repaymentLabel(rem({ payer: "本人" }))).toEqual({ text: "", unpaid: false });
    expect(repaymentLabel(rem({ payer: "代わり" }))).toEqual({ text: "未返金", unpaid: true });
    expect(repaymentLabel(rem({ payer: "代わり", advance_repaid_on: "2026-09-05" }))).toEqual({ text: "返金済み（2026-09-05）", unpaid: false });
    expect(reminderAmount(rem({ amount: 12000, advance_amount: 11000 }))).toBe(12000);
    expect(reminderAmount(rem({ advance_amount: 11000 }))).toBe(11000);
    expect(reminderAmount(rem({}))).toBeNull();
  });

  it("代わりに払うに変えると立替払いが有効になり、金額が立替金額に入る", () => {
    expect(payerPatch(rem({ amount: 8000 }), "代わり")).toEqual({ payer: "代わり", advance_paid: true, advance_amount: 8000 });
    expect(payerPatch(rem({ amount: 8000, advance_amount: 7000 }), "代わり")).toEqual({ payer: "代わり", advance_paid: true });
    expect(payerPatch(rem({}), "本人")).toEqual({ payer: "本人", advance_paid: false });
    // 返金済みの記録があれば立替の記録は残す
    expect(payerPatch(rem({ advance_repaid_on: "2026-09-05" }), "本人")).toEqual({ payer: "本人" });
  });

  it("一覧表のCSV", () => {
    const csv = remindersCsv([
      { ...rem({ reminder_no: 1, created_at: "2026-09-01T00:00:00Z", amount: 12000, payer: "代わり", advance_paid: true, advance_paid_on: "2026-09-02", content: "住民税 \"第2期\"" }), workerName: "NGUYEN VAN A", orgName: "有限会社國崎青果" },
    ]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe('"作成日","番号","氏名","所属機関","種類","内容","金額（合計）","内訳","支払期限","支払","返金確認","支払日（立替）","進捗"');
    expect(lines[1]).toBe('"2026-09-01","No.01","NGUYEN VAN A","有限会社國崎青果","市役所からの通知","住民税 ""第2期""","12000","","","代わりに払う","未返金","2026-09-02","未連絡"');
  });
});

describe("金額の内訳（複数行・合計・支払期限）", () => {
  it("合計と一番早い期限を自動で出し、空行は保存しない", () => {
    const items = [
      { label: "第1期", amount: 8500, due_on: "2026-09-30" },
      { label: "第2期", amount: 8500, due_on: "2026-11-30" },
      { label: "", amount: null, due_on: null },
    ];
    expect(amountItemsTotal(items)).toBe(17000);
    expect(earliestDue(items)).toBe("2026-09-30");
    expect(amountItemsPatch(items)).toEqual({
      amount_items: items.slice(0, 2),
      amount: 17000,
      due_on: "2026-09-30",
    });
    expect(amountItemsPatch([{ label: "", amount: null, due_on: null }])).toEqual({ amount_items: [], amount: null, due_on: null });
  });

  it("保存データの読み込みは不正な形を捨てる", () => {
    expect(normalizeAmountItems(null)).toEqual([]);
    expect(normalizeAmountItems([{ label: "第1期", amount: 8500.4, due_on: "2026-09-30" }, { amount: "x", due_on: "9/30" }, 3])).toEqual([
      { label: "第1期", amount: 8500, due_on: "2026-09-30" },
      { label: "", amount: null, due_on: null },
    ]);
  });

  it("支払期限の表示（あと○日・過ぎ・完了）", () => {
    expect(dueLabel("2026-09-10", TODAY, "未連絡")).toEqual({ text: "期限 2026-09-10（あと3日）", overdue: false });
    expect(dueLabel("2026-09-07", TODAY, "未連絡")).toEqual({ text: "期限 2026-09-07（今日）", overdue: true });
    expect(dueLabel("2026-09-01", TODAY, "返事あり")).toEqual({ text: "期限 2026-09-01（6日過ぎ）", overdue: true });
    expect(dueLabel("2026-09-01", TODAY, "完了")).toEqual({ text: "期限 2026-09-01", overdue: false });
    expect(dueLabel(null, TODAY, "未連絡")).toEqual({ text: "", overdue: false });
  });

  it("CSVに内訳と支払期限が入る", () => {
    const csv = remindersCsv([
      { ...rem({ reminder_no: 2, created_at: "2026-09-01T00:00:00Z", amount: 17000, due_on: "2026-09-30", amount_items: [{ label: "第1期", amount: 8500, due_on: "2026-09-30" }, { label: "第2期", amount: 8500, due_on: "2026-11-30" }], payer: "本人" }), workerName: "A", orgName: "" },
    ]);
    expect(csv.split("\r\n")[1]).toBe('"2026-09-01","No.02","A","","市役所からの通知","","17000","第1期 8500（期限 2026-09-30） / 第2期 8500（期限 2026-11-30）","2026-09-30","本人が払う","","","未連絡"');
  });
});
