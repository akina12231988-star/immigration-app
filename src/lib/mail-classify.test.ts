import { describe, expect, it } from "vitest";
import {
  classifyMailCategory,
  matchNotification,
  matchWorker,
  pickApplicationForWorker,
  type ApplicationCandidate,
  type WorkerNameCandidate,
} from "./mail-classify";

describe("classifyMailCategory", () => {
  it("許可・交付を許可に分類する", () => {
    expect(classifyMailCategory("在留期間更新許可のお知らせ", "")).toBe("許可");
    expect(classifyMailCategory("在留資格認定証明書の交付", "本文")).toBe("許可");
    expect(classifyMailCategory("", "認定証明書を交付します")).toBe("許可");
  });

  it("受付を申請受付に分類する", () => {
    expect(classifyMailCategory("申請を受け付けました", "")).toBe("申請受付");
    expect(classifyMailCategory("オンライン申請 受付完了", "申請番号 123")).toBe("申請受付");
  });

  it("不許可は許可に含めずその他にする", () => {
    expect(classifyMailCategory("在留期間更新 不許可のお知らせ", "")).toBe("その他");
  });

  it("該当なしはその他", () => {
    expect(classifyMailCategory("メンテナンスのお知らせ", "システム停止")).toBe("その他");
  });
});

describe("matchWorker", () => {
  const workers: WorkerNameCandidate[] = [
    { id: "w1", name: "グエン バン ティ", kana: "グエン バン ティ" },
    { id: "w2", name: "田中 太郎", kana: "タナカ タロウ" },
    { id: "w3", name: "李", kana: "リ" }, // 短すぎる氏名
  ];

  it("空白を無視して氏名を一致させる", () => {
    const hit = matchWorker("グエンバンティさんの在留期間更新許可について", workers);
    expect(hit?.id).toBe("w1");
  });

  it("フリガナでも一致させる", () => {
    const hit = matchWorker("タナカタロウ 様 申請受付", workers);
    expect(hit?.id).toBe("w2");
  });

  it("2文字以下の氏名は誤検出しない", () => {
    expect(matchWorker("李という文字を含む本文", workers)?.id).not.toBe("w3");
  });

  it("該当なしはnull", () => {
    expect(matchWorker("該当者のいないメール", workers)).toBeNull();
  });
});

describe("pickApplicationForWorker", () => {
  const apps: ApplicationCandidate[] = [
    { id: "a1", workerId: "w1", name: "グエン", status: "取下げ", applicationDate: "2026-05-01" },
    { id: "a2", workerId: "w1", name: "グエン", status: "審査中", applicationDate: "2026-06-01" },
    { id: "a3", workerId: "w1", name: "グエン", status: "申請済", applicationDate: "2026-07-01" },
    { id: "a4", workerId: "w2", name: "田中", status: "申請済", applicationDate: "2026-07-10" },
  ];

  it("進行中かつ最新の申請を選ぶ", () => {
    expect(pickApplicationForWorker("w1", apps)).toBe("a3");
  });

  it("紐づく申請がなければnull", () => {
    expect(pickApplicationForWorker("w9", apps)).toBeNull();
  });
});

describe("matchNotification", () => {
  const workers: WorkerNameCandidate[] = [
    { id: "w1", name: "グエン バン ティ", kana: "グエン バン ティ" },
  ];
  const apps: ApplicationCandidate[] = [
    { id: "a1", workerId: "w1", name: "グエン バン ティ", status: "申請済", applicationDate: "2026-07-01" },
    { id: "a2", workerId: null, name: "未登録 花子", status: "申請済", applicationDate: "2026-07-02" },
  ];

  it("外国人と申請を紐づける", () => {
    const r = matchNotification("在留期間更新許可", "グエンバンティ 様", workers, apps);
    expect(r.workerId).toBe("w1");
    expect(r.applicationId).toBe("a1");
  });

  it("外国人未登録でも氏名一致の申請を拾う", () => {
    const r = matchNotification("申請受付", "未登録花子 様の申請を受け付けました", workers, apps);
    expect(r.workerId).toBeNull();
    expect(r.applicationId).toBe("a2");
  });

  it("該当なしは空の結果", () => {
    const r = matchNotification("メンテナンス", "該当者なし", workers, apps);
    expect(r.workerId).toBeNull();
    expect(r.applicationId).toBeNull();
    expect(r.matchedName).toBe("");
  });
});
