import { describe, expect, it } from "vitest";
import { employmentStartPatch, suggestSupportScope } from "./worker-support";

describe("支援区分の自動判別", () => {
  it("特定技能2号とその移行準備は支援対象外", () => {
    expect(suggestSupportScope("特定技能2号", "在籍中")).toBe("支援対象外");
    expect(suggestSupportScope("特定活動（特定技能2号移行準備）", "在籍中")).toBe("支援対象外");
    // 全角の２号でも同じ
    expect(suggestSupportScope("特定技能２号", "在籍中")).toBe("支援対象外");
  });

  it("特定技能1号とその移行準備は支援対象", () => {
    expect(suggestSupportScope("特定技能1号", "在籍中")).toBe("支援対象");
    expect(suggestSupportScope("特定活動（特定技能1号移行準備）", "在籍中")).toBe("支援対象");
    expect(suggestSupportScope("特定技能1号更新", "在籍中")).toBe("支援対象");
  });

  it("申請準備中はまだ支援開始前", () => {
    expect(suggestSupportScope("特定技能1号", "申請準備中")).toBe("支援開始前");
    // 2号は準備中でも支援対象外のまま
    expect(suggestSupportScope("特定技能2号", "申請準備中")).toBe("支援対象外");
  });

  it("技能実習はこれから特定技能へ移るので支援開始前", () => {
    expect(suggestSupportScope("技能実習1号", "在籍中")).toBe("支援開始前");
    expect(suggestSupportScope("技能実習3号", "在籍中")).toBe("支援開始前");
  });

  it("退職・帰国・求職活動中では支援区分を変えない", () => {
    // 退職と同時に支援対象外にすると退職月の日割り請求が名簿から消えるため
    expect(suggestSupportScope("特定技能1号", "退職")).toBeNull();
    expect(suggestSupportScope("特定技能1号", "帰国")).toBeNull();
    expect(suggestSupportScope("特定技能1号", "求職活動中")).toBeNull();
  });

  it("在留資格が未設定なら判断しない", () => {
    expect(suggestSupportScope("", "在籍中")).toBeNull();
    expect(suggestSupportScope(null, "在籍中")).toBeNull();
  });
});

describe("employmentStartPatch（所属機関＋雇用開始日で在籍中へ）", () => {
  it("只今の状況が未入力なら、特定技能1号・支援対象の人に「特定技能1号＜支援委託中＞」を入れる", () => {
    expect(employmentStartPatch("申請準備中", "特定技能1号", true, true, "")).toEqual({
      status: "在籍中",
      support: "支援対象",
      current_situation: "特定技能1号＜支援委託中＞",
    });
    // すでに入力されている只今の状況は上書きしない
    expect(employmentStartPatch("申請準備中", "特定技能1号", true, true, "更新")).toEqual({
      status: "在籍中",
      support: "支援対象",
    });
    // 支援対象外（2号）は只今の状況を入れない
    expect(employmentStartPatch("申請準備中", "特定技能2号", true, true, "")).toEqual({
      status: "在籍中",
      support: "支援対象外",
    });
    // 在留資格が未設定なら只今の状況は入れない
    expect(employmentStartPatch("申請準備中", "", true, true, "")).toEqual({
      status: "在籍中",
      support: "支援対象",
    });
  });

  it("申請準備中で両方そろったら在籍中＋支援区分になる", () => {
    // 只今の状況が入力済みの人（＝状況は変えない）で、状態・支援区分だけを見る
    expect(employmentStartPatch("申請準備中", "特定技能1号", true, true, "更新")).toEqual({
      status: "在籍中",
      support: "支援対象",
    });
    // 2号は在籍しても支援計画の対象外
    expect(employmentStartPatch("申請準備中", "特定技能2号", true, true, "更新")).toEqual({
      status: "在籍中",
      support: "支援対象外",
    });
    // 在留資格が未設定でも、雇用が始まるなら支援対象にする
    expect(employmentStartPatch("申請準備中", "", true, true, "更新")).toEqual({
      status: "在籍中",
      support: "支援対象",
    });
  });

  it("どちらかが未入力なら何もしない", () => {
    expect(employmentStartPatch("申請準備中", "特定技能1号", false, true)).toBeNull();
    expect(employmentStartPatch("申請準備中", "特定技能1号", true, false)).toBeNull();
  });

  it("申請準備中以外の状態は触らない", () => {
    expect(employmentStartPatch("在籍中", "特定技能1号", true, true)).toBeNull();
    expect(employmentStartPatch("退職", "特定技能1号", true, true)).toBeNull();
    expect(employmentStartPatch("帰国", "特定技能1号", true, true)).toBeNull();
    expect(employmentStartPatch("求職活動中", "特定技能1号", true, true)).toBeNull();
  });
});
