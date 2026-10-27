import { describe, expect, it } from "vitest";
import { PREP_STALE_DAYS, prepOpenedInfo, showsPrepOpened } from "./prep-opened";

describe("prepOpenedInfo（申請準備の詳細を最後に開いてからの経過）", () => {
  it("記録が無ければ「記録なし」でアラートにしない", () => {
    expect(prepOpenedInfo(null, "2026-10-27")).toEqual({
      openedOn: null,
      days: null,
      stale: false,
      label: "最終確認 記録なし",
    });
    expect(prepOpenedInfo("", "2026-10-27").openedOn).toBeNull();
    expect(prepOpenedInfo("not a date", "2026-10-27").openedOn).toBeNull();
  });

  it("日本時間の日付で数え、今日なら 0日（今日）", () => {
    // UTC の 10/26 23:00 は日本時間では 10/27 08:00
    const info = prepOpenedInfo("2026-10-26T23:00:00Z", "2026-10-27");
    expect(info.openedOn).toBe("2026-10-27");
    expect(info.days).toBe(0);
    expect(info.stale).toBe(false);
    expect(info.label).toBe("最終確認 2026-10-27（今日）");
  });

  it("2週間（14日）以上開いていなければアラート。13日ならまだ出さない", () => {
    expect(PREP_STALE_DAYS).toBe(14);
    const ok = prepOpenedInfo("2026-10-14T03:00:00Z", "2026-10-27");
    expect(ok.days).toBe(13);
    expect(ok.stale).toBe(false);
    const stale = prepOpenedInfo("2026-10-13T03:00:00Z", "2026-10-27");
    expect(stale.days).toBe(14);
    expect(stale.stale).toBe(true);
    expect(stale.label).toBe("最終確認 2026-10-13（14日前）");
  });

  it("開いた日が今日より後（時計のずれ）でも負にならない", () => {
    expect(prepOpenedInfo("2026-10-30T03:00:00Z", "2026-10-27").days).toBe(0);
  });
});

describe("showsPrepOpened（入管へ申請済み・完了には出さない）", () => {
  it("準備中のステータスなら出す", () => {
    expect(showsPrepOpened("書類作成中", "進行中")).toBe(true);
    expect(showsPrepOpened("", "未着手")).toBe(true);
  });
  it("入管へ申請！！・完了なら出さない", () => {
    expect(showsPrepOpened("入管へ申請！！", "進行中")).toBe(false);
    expect(showsPrepOpened("完了", "完了")).toBe(false);
  });
});
