import { describe, expect, test } from "vitest";
import { inReviewWorkerIds, underReviewWorkerIds, workerShowsInReview } from "@/lib/renewal-filter";
import type { Application, ApplicationStatus } from "@/types/application";

const app = (workerId: string | null, status: ApplicationStatus): Application =>
  ({ id: `app-${workerId}-${status}`, workerId, status }) as unknown as Application;

describe("underReviewWorkerIds", () => {
  test("審査中（申請済〜通知書到着）と在留カード受け取り待ち（許可済）の人を返す", () => {
    const ids = underReviewWorkerIds([
      app("w1", "申請済"),
      app("w2", "LINE報告済"),
      app("w3", "通知書到着"),
      app("w4", "許可済"), // 在留カード受け取り待ち
    ]);
    expect(ids.sort()).toEqual(["w1", "w2", "w3", "w4"]);
  });

  test("申請前・在留カード受領・取下げの人は含めない（次の準備の対象に戻る）", () => {
    expect(
      underReviewWorkerIds([
        app("w1", "申請前"),
        app("w2", "在留カード受領"),
        app("w3", "取下げ"),
      ]),
    ).toEqual([]);
  });

  test("外国人と紐づいていない申請は無視し、重複は1件にまとめる", () => {
    expect(
      underReviewWorkerIds([
        app(null, "申請済"),
        app("w1", "申請済"),
        app("w1", "許可済"),
      ]),
    ).toEqual(["w1"]);
  });
});

describe("inReviewWorkerIds（外国人管理の「審査中」バッジ）", () => {
  test("申請済〜通知書到着で、許可にも取下げにもなっていない申請の人を返す", () => {
    const ids = inReviewWorkerIds([
      app("w1", "申請済"),
      app("w2", "LINE報告済"),
      app("w3", "通知書到着"),
      app("w4", "許可済"), // 在留カード受け取り待ちは審査中ではない
      app("w5", "申請前"),
      app("w6", "取下げ"),
      { ...app("w7", "LINE報告済"), approved: true } as Application,
      { ...app("w8", "申請済"), withdrawnOn: "2026-10-01" } as Application,
      app(null, "申請済"),
    ]);
    expect(ids.sort()).toEqual(["w1", "w2", "w3"]);
  });
});

describe("workerShowsInReview（外国人詳細の見出しの「審査中」）", () => {
  test("審査中の申請がある／在留更新の状況が審査中／只今の状況に「審査中」と書いてある のどれかなら出す", () => {
    expect(workerShowsInReview({}, "", [app("w", "申請済")])).toBe(true);
    expect(workerShowsInReview({ residence_renewal_status: "審査中" }, "", [])).toBe(true);
    expect(workerShowsInReview({}, "特定技能更新許可の審査中", [])).toBe(true);
    expect(workerShowsInReview({ current_situation: "変更申請 審査中" }, "", [])).toBe(true);
  });

  test("どれにも当たらなければ出さない（許可済・取下げの申請は審査中ではない）", () => {
    expect(workerShowsInReview({}, "特定技能1号で在留中", [])).toBe(false);
    expect(workerShowsInReview({}, "", [{ ...app("w", "申請済"), approved: true }])).toBe(false);
    expect(workerShowsInReview({}, "", [{ ...app("w", "申請済"), withdrawnOn: "2026-10-01" }])).toBe(false);
  });
});
