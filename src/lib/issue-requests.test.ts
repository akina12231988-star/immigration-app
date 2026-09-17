import { describe, expect, it } from "vitest";
import {
  elapsedDays,
  followupRequestRows,
  groupByIssuer,
  isIssueRequestDoc,
  issueRequestState,
  issueRequestSummary,
  issuerOf,
  requestedOnOf,
  toIssueRequestRow,
  type IssueRequestRow,
} from "@/lib/issue-requests";

const base = {
  checklistId: "c1",
  docId: "kazei",
  status: "発行依頼中",
  note: "VUONG VAN THANH",
  updatedAt: "2026-08-27T00:00:00Z",
  workerId: "w1",
  workerName: "グエン",
  todoNo: "TODO-1",
  targetReiwa: 7,
  currentReiwa: 8,
};

describe("isIssueRequestDoc", () => {
  it("発行依頼中を選べる書類だけが対象", () => {
    expect(isIssueRequestDoc("kazei")).toBe(true);
    expect(isIssueRequestDoc("nozei_shiken")).toBe(true);
    expect(isIssueRequestDoc("nozei_kokuho")).toBe(true);
  });

  it("年金記録・保険証など「〜依頼中」がある書類も対象", () => {
    expect(isIssueRequestDoc("nenkin")).toBe(true);
    expect(isIssueRequestDoc("hokensho")).toBe(true);
  });

  it("依頼中の選択肢が無い書類（合格証など）は対象外", () => {
    expect(isIssueRequestDoc("cert_nihongo")).toBe(false);
    expect(isIssueRequestDoc("cert_senmonkyu")).toBe(false);
  });
});

describe("issuerOf / requestedOnOf / elapsedDays", () => {
  it("発行依頼先の欄があればそれ、無ければ状況の文から相手を読む", () => {
    expect(issuerOf("発行依頼中", "NGAさん")).toBe("NGAさん");
    expect(issuerOf("秋吉伽恋に発行依頼中", "")).toBe("秋吉伽恋");
    expect(issuerOf("本人に依頼中", "")).toBe("本人");
    expect(issuerOf("未払いのため本人に納付を依頼中", "")).toBe("未払いのため本人");
    expect(issuerOf("年金免除手続きの発行依頼中", "")).toBe("");
  });
  it("依頼日は date_on を優先し、無ければ最終更新日", () => {
    expect(requestedOnOf("2026-09-01", "2026-09-10T00:00:00Z")).toBe("2026-09-01");
    expect(requestedOnOf(null, "2026-09-10T00:00:00Z")).toBe("2026-09-10");
    expect(requestedOnOf(null, "")).toBeNull();
  });
  it("経過日数", () => {
    expect(elapsedDays("2026-09-01", "2026-09-16")).toBe(15);
    expect(elapsedDays(null, "2026-09-16")).toBeNull();
  });
});

describe("issueRequestState", () => {
  it("発行依頼中はまだ", () => {
    expect(issueRequestState("kazei", "発行依頼中")).toBe("依頼中");
  });

  it("発行完了は済み", () => {
    expect(issueRequestState("kazei", "発行完了")).toBe("完了");
  });

  it("発行できなかった理由も完了として扱う（もう待たなくてよい）", () => {
    expect(issueRequestState("kazei", "1月1日時点で日本に在住していなかった為発行できなかった")).toBe(
      "完了",
    );
  });
});

describe("toIssueRequestRow", () => {
  it("年度つきの書類名になる", () => {
    expect(toIssueRequestRow(base)?.docLabel).toBe("令和7年度 課税証明書");
  });

  it("発行依頼先を取り出す", () => {
    expect(toIssueRequestRow(base)?.issuer).toBe("VUONG VAN THANH");
    expect(toIssueRequestRow({ ...base, note: "  " })?.issuer).toBe("");
  });

  it("何も選んでいないものは出さない", () => {
    expect(toIssueRequestRow({ ...base, status: "" })).toBeNull();
  });

  it("依頼中の選択肢が無い書類は出さない", () => {
    expect(toIssueRequestRow({ ...base, docId: "cert_nihongo" })).toBeNull();
  });

  it("完了しているものは done になる", () => {
    expect(toIssueRequestRow({ ...base, status: "発行完了" })?.done).toBe(true);
  });

  it("依頼中でも完了でもない状況（郵送請求中）は出さない", () => {
    expect(toIssueRequestRow({ ...base, status: "郵送請求中" })).toBeNull();
  });

  it("依頼日は date_on、無ければ最終更新日", () => {
    expect(toIssueRequestRow({ ...base, dateOn: "2026-08-01" })?.requestedOn).toBe("2026-08-01");
    expect(toIssueRequestRow(base)?.requestedOn).toBe("2026-08-27");
  });

  it("年金記録の「秋吉伽恋に発行依頼中」は依頼先を文から読む", () => {
    const r = toIssueRequestRow({ ...base, docId: "nenkin", status: "秋吉伽恋に発行依頼中", note: "" });
    expect(r?.issuer).toBe("秋吉伽恋");
    expect(r?.done).toBe(false);
    expect(r?.docLabel).toBe("年金記録");
  });
});

describe("followupRequestRows", () => {
  it("転居手続きの依頼中と、依頼を記録した国保加入を行にする", () => {
    const rows = followupRequestRows([
      {
        id: "w1",
        name: "グエン",
        followups: {
          moving: { needed: true, status: "依頼中", requested_to: "NGAさん", requested_on: "2026-09-01", planned_on: "2026-10-01" },
          kokuho: { needed: true, requested_to: "本人", requested_on: "2026-09-05" },
        },
      },
      { id: "w2", name: "チャン", followups: { moving: { needed: true, status: "未依頼" }, kokuho: { needed: true } } },
      { id: "w3", name: "レ", followups: { kokuho: { needed: true, requested_to: "本人", kokuho_done: true, nenkin_done: true } } },
    ]);
    expect(rows.map((r) => `${r.workerName}:${r.docLabel}:${r.issuer}:${r.requestedOn}`)).toEqual([
      "グエン:転居手続き:NGAさん:2026-09-01",
      "グエン:国民健康保険・国民年金の加入:本人:2026-09-05",
    ]);
    expect(rows[0].status).toContain("転居予定 2026-10-01");
    expect(rows[0].status).not.toContain("保険証");
    expect(rows[1].status).toContain("退職書類の発行待ち");
  });
});

const row = (patch: Partial<IssueRequestRow> = {}): IssueRequestRow => ({
  kind: "doc",
  requestedOn: "2026-08-27",
  checklistId: "c1",
  docId: "kazei",
  docLabel: "令和7年度 課税証明書",
  status: "発行依頼中",
  issuer: "VUONG VAN THANH",
  workerId: "w1",
  workerName: "グエン",
  todoNo: "TODO-1",
  targetReiwa: 7,
  done: false,
  updatedAt: "2026-08-27T00:00:00Z",
  ...patch,
});

describe("groupByIssuer", () => {
  it("依頼先ごとに、まだと済みに分ける", () => {
    const groups = groupByIssuer([
      row(),
      row({ docId: "nozei_shiken", done: true }),
      row({ issuer: "NGAさん" }),
    ]);
    const thanh = groups.find((g) => g.issuer === "VUONG VAN THANH");
    expect(thanh?.pending).toHaveLength(1);
    expect(thanh?.done).toHaveLength(1);
    expect(groups.find((g) => g.issuer === "NGAさん")?.pending).toHaveLength(1);
  });

  it("残っている件数が多い依頼先を先に出す", () => {
    const groups = groupByIssuer([
      row({ issuer: "NGAさん" }),
      row({ issuer: "野口　明菜" }),
      row({ issuer: "野口　明菜", workerName: "チャン" }),
    ]);
    expect(groups[0].issuer).toBe("野口　明菜");
  });

  it("依頼先が未選択のものは最後に回す", () => {
    const groups = groupByIssuer([row({ issuer: "" }), row({ issuer: "NGAさん" })]);
    expect(groups.map((g) => g.issuer)).toEqual(["NGAさん", ""]);
  });

  it("同じ依頼先の中では氏名の順に並べる", () => {
    const groups = groupByIssuer([row({ workerName: "チャン" }), row({ workerName: "グエン" })]);
    expect(groups[0].pending.map((r) => r.workerName)).toEqual(["グエン", "チャン"]);
  });
});

describe("issueRequestSummary", () => {
  it("まだ・済み・依頼先が未選択の件数を出す", () => {
    const rows = [row(), row({ done: true }), row({ issuer: "" })];
    expect(issueRequestSummary(rows)).toEqual({ pending: 2, done: 1, noIssuer: 1 });
  });

  it("済みのものは依頼先が空でも数えない", () => {
    expect(issueRequestSummary([row({ issuer: "", done: true })]).noIssuer).toBe(0);
  });
});
