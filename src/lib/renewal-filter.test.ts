import { describe, expect, test } from "vitest";
import { underReviewWorkerIds } from "@/lib/renewal-filter";
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
