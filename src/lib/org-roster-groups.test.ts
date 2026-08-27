import { describe, expect, it } from "vitest";
import { notCountedReason, splitCurrentRoster } from "@/lib/org-roster-groups";

describe("splitCurrentRoster", () => {
  it("状態が「在籍中」の人だけを在籍中にする", () => {
    const rows = [
      { id: "a", status: "在籍中" },
      { id: "b", status: "申請準備中" },
      { id: "c", status: "在籍中" },
      { id: "d", status: "退職" },
    ];
    const { active, notYet } = splitCurrentRoster(rows);
    expect(active.map((r) => r.id)).toEqual(["a", "c"]);
    expect(notYet.map((r) => r.id)).toEqual(["b", "d"]);
  });

  it("誰もいなくても落ちない", () => {
    expect(splitCurrentRoster([])).toEqual({ active: [], notYet: [] });
  });
});

describe("notCountedReason", () => {
  const ok = { status: "在籍中", support: "支援対象", residenceStatus: "特定技能1号" };

  it("3つそろっていれば理由なし", () => {
    expect(notCountedReason(ok)).toBeNull();
  });

  it("全角の「１」で登録されていると数えられない（支援体制の判定と同じ）", () => {
    // isSsw1Residence が半角の1しか見ないため。表にも理由が出るので気づける
    expect(notCountedReason({ ...ok, residenceStatus: "特定技能１号" })).toBe(
      "在留資格が特定技能1号ではない（特定技能１号）",
    );
  });

  it("支援区分が支援開始前なら、その理由を返す", () => {
    expect(notCountedReason({ ...ok, support: "支援開始前" })).toBe("支援区分が「支援開始前」");
  });

  it("状態が申請準備中なら、その理由を返す", () => {
    expect(notCountedReason({ ...ok, status: "申請準備中" })).toBe("状態が「申請準備中」");
  });

  it("特定活動は在留資格の理由を返す", () => {
    expect(notCountedReason({ ...ok, residenceStatus: "特定活動（特定技能1号移行準備）" })).toBe(
      "在留資格が特定活動",
    );
  });

  it("技能実習は特定技能1号ではないとして返す", () => {
    expect(notCountedReason({ ...ok, residenceStatus: "技能実習2号" })).toBe(
      "在留資格が特定技能1号ではない（技能実習2号）",
    );
  });

  it("未設定でも文言が壊れない", () => {
    expect(notCountedReason({ status: "", support: "", residenceStatus: "" })).toBe(
      "支援区分が「未設定」",
    );
  });
});
