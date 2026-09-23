import { describe, expect, it } from "vitest";
import { isSsw1Renewal } from "./contract-org-notice";

const app = (applicationContent: string, extra: Record<string, unknown> = {}) =>
  ({ applicationContent, status: "許可済", withdrawnOn: undefined, visaAtGrant: undefined, ...extra }) as never;

describe("isSsw1Renewal", () => {
  it("いちばん新しい申請が特定技能1号の更新許可なら true", () => {
    expect(isSsw1Renewal([app("在留期間の更新許可")], "特定技能1号")).toBe(true);
    expect(isSsw1Renewal([app("在留期間の更新許可")], "特定技能１号（農業）")).toBe(true); // 全角
    expect(isSsw1Renewal([app("在留期間の更新許可", { visaAtGrant: "特定技能1号" })], "")).toBe(true);
  });
  it("変更許可・認定・特定技能2号・申請なしは false", () => {
    expect(isSsw1Renewal([app("在留資格の変更許可")], "特定技能1号")).toBe(false);
    expect(isSsw1Renewal([app("在留期間の更新許可")], "特定技能2号")).toBe(false);
    expect(isSsw1Renewal([], "特定技能1号")).toBe(false);
  });
  it("取下げた申請は飛ばして、その前の申請で判定する", () => {
    expect(
      isSsw1Renewal([app("在留資格の変更許可", { status: "取下げ" }), app("在留期間の更新許可")], "特定技能1号"),
    ).toBe(true);
  });
});
