import { describe, expect, it } from "vitest";
import {
  groupByIssuer,
  isIssueRequestDoc,
  issueRequestState,
  issueRequestSummary,
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

  it("発行依頼のない書類は対象外", () => {
    expect(isIssueRequestDoc("zairyu")).toBe(false);
    expect(isIssueRequestDoc("photo")).toBe(false);
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

  it("発行依頼のない書類は出さない", () => {
    expect(toIssueRequestRow({ ...base, docId: "zairyu" })).toBeNull();
  });

  it("完了しているものは done になる", () => {
    expect(toIssueRequestRow({ ...base, status: "発行完了" })?.done).toBe(true);
  });
});

const row = (patch: Partial<IssueRequestRow> = {}): IssueRequestRow => ({
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
