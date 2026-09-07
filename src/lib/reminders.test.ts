import { describe, expect, it } from "vitest";
import {
  daysSince,
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
    expect(reminderCounts(rows)).toEqual({ open: 3, notContacted: 1, awaiting: 1, replied: 1 });
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
