import { describe, expect, it } from "vitest";
import { buildMailTable, displayStatus, parseImmigrationMail, receiptKey, type TableMail } from "./immigration-mail-table";

const prov = [
  "（本メールは、在留申請オンラインシステムから自動的に送信しております。）",
  "ICHIHARA AYANA様",
  "NGUYEN VAN A様",
  "申請受付日（Application acceptance date）",
  "2026/10/30",
  "申請種別（Type of application）",
  "在留資格変更許可申請（特定技能）",
  "申請人在留カード等番号（Residence card number）",
  "UH92913332RD",
  "申請受付仮番号（Provisional application acceptance no.）",
  "96720260000443452-00",
].join("\n");
const recv = [
  "ICHIHARA AYANA様",
  "NGUYEN VAN A様",
  "申請受付日（Application acceptance date）",
  "2026/10/30",
  "申請受付番号（Application acceptance no.）",
  "福オンＣＶ26010044",
  "申請受付仮番号（Provisional application acceptance no.）",
  "96720260000443452-00",
].join("\n");
const done = [
  "ICHIHARA AYANA様",
  "申請人氏名（Name）",
  "NGUYEN VAN A様",
  "申請受付番号（Application acceptance no.）",
  "福オンＣＶ26010044",
  "申請人在留期限（Period of stay）",
  "2026/12/11",
  "在留カードは郵送による受領となります。",
].join("\n");
const payLink = [
  "U123-ICHIHARA AYANA様",
  "●申請受付番号",
  "967CV26010044",
  "●納付金額",
  "27,330円",
  "●許可の内容",
  "特定技能１号（在留資格変更）",
].join("\n");
const paid = ["在留申請 手数料", "注文番号：ISA01_UH92913332RD-967CV26010044-1-ABC", "合計金額：27,330", "完了日時：2026/11/12 10:00"].join("\n");

const mail = (id: string, subject: string, body: string, at: string, extra: Partial<TableMail> = {}): TableMail => ({
  id, subject, body, receivedAt: at, gmailLink: `https://mail/${id}`, isRead: true, matchedApplicationId: null, matchedWorkerId: null, ...extra,
});

describe("parseImmigrationMail", () => {
  it("仮番号メールから担当・申請人・受付日・種別・カード番号・仮番号を読む", () => {
    const i = parseImmigrationMail("【入管庁】申請受付仮番号のお知らせ", prov);
    expect(i).toMatchObject({
      type: "prov", status: "審査中", staff: "ICHIHARA AYANA", applicant: "NGUYEN VAN A", acceptDate: "2026/10/30",
      appType: "在留資格変更許可申請（特定技能）", card: "UH92913332RD", prov: "96720260000443452-00",
    });
  });
  it("申請受付完了・無関係な決済メールは載せない", () => {
    expect(parseImmigrationMail("【入管庁】申請受付完了のお知らせ", "").type).toBe("skip");
    expect(parseImmigrationMail("決済申込完了のお知らせ", "ネットショップ").type).toBe("skip");
  });
  it("受付番号は官署番号にそろえて比べる", () => {
    expect(receiptKey("福オンＣＶ26010044")).toBe("967CV26010044");
    expect(receiptKey("967CV26010044")).toBe("967CV26010044");
  });
});

describe("buildMailTable", () => {
  it("仮番号 → 受付番号 → 審査完了 → 決済リンク → 入金完了 を1行にまとめる", () => {
    const rows = buildMailTable([
      mail("5", "入金完了のお知らせ", paid, "2026-11-12T01:00:00Z"),
      mail("1", "【入管庁】申請受付仮番号のお知らせ", prov, "2026-10-30T01:00:00Z"),
      mail("2", "【入管庁】申請受付番号のお知らせ", recv, "2026-10-31T01:00:00Z", { isRead: false, matchedApplicationId: "app1" }),
      mail("3", "【入管庁】審査完了に関するお知らせ", done, "2026-11-11T01:00:00Z"),
      mail("4", "手数料納付用決済リンクのお知らせ", payLink, "2026-11-11T02:00:00Z"),
      mail("6", "広告", "関係ないメール", "2026-11-12T02:00:00Z"),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      applicant: "NGUYEN VAN A",
      staff: "市原彩奈",
      receipt: "福オンCV26010044",
      card: "UH92913332RD",
      prov: "96720260000443452-00",
      examDoneDate: "2026/11/11",
      permit: "特定技能１号（在留資格変更）",
      fee: "27330",
      paidDate: "2026/11/12",
      expiry: "2026/12/11",
      pickup: "郵送",
      autoStatus: "入金済・受領待ち",
      latestMailId: "5",
      unread: 1,
      applicationId: "app1",
    });
  });
  it("手で選んだ状態は、そのあとに状態を進めるメールが来るまで優先する", () => {
    const row = { autoStatus: "納付待ち", statusUpdatedAt: "2026-11-11T00:00:00Z" };
    expect(displayStatus(row, { key: "k", status: "完了", memo: "", updatedAt: "2026-11-12T00:00:00Z" })).toBe("完了");
    expect(displayStatus(row, { key: "k", status: "審査中", memo: "", updatedAt: "2026-11-10T00:00:00Z" })).toBe("納付待ち");
    expect(displayStatus(row, null)).toBe("納付待ち");
  });
});
