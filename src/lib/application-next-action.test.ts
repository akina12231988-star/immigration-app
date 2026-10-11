import { describe, expect, it } from "vitest";
import {
  applicationNextAction,
  approvalSummary,
  basicSummary,
  extraSummary,
  extraWarn,
  grantMissing,
  lineSummary,
  receiveSummary,
  type NextActionApp,
} from "./application-next-action";

const base: NextActionApp = {
  status: "申請済",
  approved: false,
  lineReported: false,
  applicationDate: "2026-08-20",
  applicationNumber: "FK-2026-0812",
  assignee: "村田敬一",
  isSelfApply: false,
};

const none = { extraOpen: 0, mailPending: 0 };

describe("applicationNextAction（今やること）", () => {
  it("申請直後はLINE報告が先", () => {
    const a = applicationNextAction({ ...base, status: "申請前" }, none);
    expect(a.section).toBe("line");
    expect(a.done).toBe(false);
    expect(applicationNextAction(base, none).section).toBe("line");
  });

  it("報告済みで依頼も郵送待ちも無ければ審査中（通知書の登録を待つ）", () => {
    const a = applicationNextAction({ ...base, status: "LINE報告済", lineReported: true }, none);
    expect(a.section).toBe("basic");
    expect(a.text).toContain("通知書");
  });

  it("未郵送の追加資料の依頼があれば追加資料の折りたたみを開く", () => {
    const a = applicationNextAction({ ...base, status: "LINE報告済", lineReported: true }, { extraOpen: 2, mailPending: 0 });
    expect(a.section).toBe("extra");
    expect(a.text).toContain("2件");
  });

  it("申請後に入管へ郵送する書類が残っていれば追加資料の折りたたみを開く", () => {
    const a = applicationNextAction({ ...base, status: "LINE報告済", lineReported: true }, { extraOpen: 0, mailPending: 1 });
    expect(a.section).toBe("extra");
    expect(a.text).toContain("1件");
  });

  it("通知書到着なら許可処理へ", () => {
    const a = applicationNextAction({ ...base, status: "通知書到着", lineReported: true }, none);
    expect(a.section).toBe("approval");
    expect(a.text).toContain("入管から許可がおりた通知あり");
  });

  it("許可済みで許可情報が未入力なら許可情報の入力を促す", () => {
    const a = applicationNextAction({ ...base, status: "許可済", approved: true, lineReported: true }, none);
    expect(a.section).toBe("approval");
    expect(a.text).toContain("在留カード番号・在留許可日・在留期限");
  });

  it("許可情報が入っていれば在留カードの受領を待つ", () => {
    const a = applicationNextAction(
      {
        ...base,
        status: "許可済",
        approved: true,
        lineReported: true,
        grantedCardNo: "AB12345678CD",
        grantedPermitDate: "2026-09-30",
        grantedExpiryDate: "2027-09-30",
      },
      { extraOpen: 1, mailPending: 1 }, // 許可後は追加資料の依頼より受領が先
    );
    expect(a.section).toBe("receive");
    expect(a.done).toBe(false);
  });

  it("在留カード受領で完了", () => {
    const a = applicationNextAction({ ...base, status: "在留カード受領", approved: true, cardReceivedOn: "2026-10-01" }, none);
    expect(a.section).toBe("receive");
    expect(a.done).toBe(true);
  });

  it("取下げ済みは取下げ・削除の折りたたみを開き、元に戻す案内を出す", () => {
    const a = applicationNextAction({ ...base, status: "取下げ", withdrawnOn: "2026-09-01" }, none);
    expect(a.section).toBe("danger");
    expect(a.done).toBe(true);
    expect(a.text).toContain("2026-09-01");
    expect(a.text).toContain("取下げを元に戻す");
  });
});

describe("折りたたみの要約", () => {
  it("grantMissing は未入力の項目名だけを返す", () => {
    expect(grantMissing(base)).toEqual(["在留カード番号", "在留許可日", "在留期限"]);
    expect(grantMissing({ ...base, grantedCardNo: " AB12345678CD ", grantedPermitDate: "2026-09-30" })).toEqual(["在留期限"]);
    expect(grantMissing({ ...base, grantedCardNo: "   " })).toContain("在留カード番号");
  });

  it("basicSummary は申請日・申請番号・担当・画像の枚数", () => {
    expect(basicSummary(base, 3)).toBe("申請日 2026-08-20・申請番号 FK-2026-0812・村田敬一・画像 3枚");
    expect(basicSummary({ ...base, applicationNumber: "", isSelfApply: true }, 0)).toBe(
      "申請日 2026-08-20・申請番号 未登録・本人申請・画像 0枚",
    );
  });

  it("lineSummary", () => {
    expect(lineSummary({ lineReported: true })).toBe("報告済み");
    expect(lineSummary({ lineReported: false })).toBe("まだ報告していません");
  });

  it("extraSummary / extraWarn", () => {
    expect(extraSummary({ extraOpen: 0, extraDone: 0, mailPending: 0, mailings: 0 })).toBe("依頼なし");
    expect(extraSummary({ extraOpen: 1, extraDone: 2, mailPending: 0, mailings: 0 })).toBe("依頼 1件が未郵送");
    expect(extraSummary({ extraOpen: 0, extraDone: 2, mailPending: 1, mailings: 1 })).toBe(
      "依頼 2件は郵送済み・郵送待ちの書類・タスク 1件・郵送した追加資料 1回",
    );
    expect(extraWarn({ extraOpen: 0, mailPending: 0 })).toBe(false);
    expect(extraWarn({ extraOpen: 0, mailPending: 1 })).toBe(true);
    expect(extraWarn({ extraOpen: 1, mailPending: 0 })).toBe(true);
  });

  it("approvalSummary は許可前・未入力・入力済みで変わる", () => {
    expect(approvalSummary(base).warn).toBe(false);
    expect(approvalSummary(base).text).toContain("入管から許可がおりた通知あり");
    const missing = approvalSummary({ ...base, status: "許可済", approved: true, grantedCardNo: "AB12345678CD" });
    expect(missing).toEqual({ text: "在留許可日・在留期限が未入力", warn: true });
    const filled = approvalSummary({
      ...base,
      status: "許可済",
      approved: true,
      grantedCardNo: "AB12345678CD",
      grantedPermitDate: "2026-09-30",
      grantedExpiryDate: "2027-09-30",
    });
    expect(filled).toEqual({ text: "在留カード AB12345678CD・許可日 2026-09-30・期限 2027-09-30", warn: false });
  });

  it("receiveSummary", () => {
    expect(receiveSummary(base)).toBe("許可情報を保存すると開けます");
    expect(receiveSummary({ ...base, status: "許可済", approved: true })).toContain("受け取った（完了）");
    expect(receiveSummary({ ...base, status: "在留カード受領", cardReceivedOn: "2026-10-01" })).toBe(
      "受領日 2026-10-01・届出（1の5）の Excel を作れます",
    );
  });
});
