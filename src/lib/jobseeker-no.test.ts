import { describe, expect, it } from "vitest";
import { jobseekerNoPrefix, nextJobseekerNo } from "./jobseeker-no";

describe("jobseekerNoPrefix", () => {
  it("受付年月日の年から令和の年で前置きを作る", () => {
    expect(jobseekerNoPrefix("2026-08-30")).toBe("R8KS"); // 令和8年
    expect(jobseekerNoPrefix("2019-05-01")).toBe("R1KS"); // 令和元年
    expect(jobseekerNoPrefix("2030-01-01")).toBe("R12KS");
  });

  it("日付が読めない・令和より前は空", () => {
    expect(jobseekerNoPrefix("")).toBe("");
    expect(jobseekerNoPrefix("2018-12-31")).toBe("");
  });
});

describe("nextJobseekerNo", () => {
  it("同じ年のいちばん大きい連番の次を返す", () => {
    expect(nextJobseekerNo(["R8KS-1", "R8KS-2"], "2026-08-30")).toBe("R8KS-3");
  });

  it("その年の番号がまだ無ければ 1 から", () => {
    expect(nextJobseekerNo([], "2026-08-30")).toBe("R8KS-1");
    // 前の年の番号は数えない（年ごとに1から振り直す）
    expect(nextJobseekerNo(["R7KS-9"], "2026-08-30")).toBe("R8KS-1");
  });

  it("形式に合わない番号・空は数えない", () => {
    expect(nextJobseekerNo(["独自-5", "", null, undefined, "R8KS-2"], "2026-08-30")).toBe(
      "R8KS-3",
    );
  });

  it("全角・小文字・空白もそろえて数える", () => {
    expect(nextJobseekerNo([" r8ks-4 ", "Ｒ８ＫＳ-７"], "2026-08-30")).toBe("R8KS-8");
  });

  it("抜け番があっても最大の次（詰め直さない）", () => {
    expect(nextJobseekerNo(["R8KS-1", "R8KS-5"], "2026-08-30")).toBe("R8KS-6");
  });
});
