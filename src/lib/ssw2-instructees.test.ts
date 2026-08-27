import { describe, expect, it } from "vitest";
import {
  instructeeCandidates,
  instructeeMissingFields,
  instructeeShortage,
  requiredInstructeeCount,
  SSW2_PREP_SITUATION,
  type Ssw2InstructeeInput,
} from "@/lib/ssw2-instructees";

const row = (patch: Partial<Ssw2InstructeeInput> = {}): Ssw2InstructeeInput => ({
  worker_id: "self",
  target_worker_id: null,
  name: "山田　太郎",
  residence_card_no: "",
  office: "八代工場　製造部",
  position: "班長",
  duties: "野菜の選別",
  sort_order: 0,
  ...patch,
});

describe("SSW2_PREP_SITUATION", () => {
  it("準備の内容のいちばん下（特定技能2号）の保存値と同じ", () => {
    expect(SSW2_PREP_SITUATION).toBe("特定技能2号申請準備中");
  });
});

describe("requiredInstructeeCount", () => {
  it("様式の（参考）表のとおりの人数を返す", () => {
    expect(requiredInstructeeCount("農業")).toBe(2);
    expect(requiredInstructeeCount("建設")).toBe(2);
    expect(requiredInstructeeCount("飲食料品製造業")).toBe(2);
    expect(requiredInstructeeCount("自動車整備")).toBe(1);
    expect(requiredInstructeeCount("航空")).toBe(1);
  });

  it("人数の記載が無い分野は0（対象者が不在でも差し支えない）", () => {
    expect(requiredInstructeeCount("漁業")).toBe(0);
    expect(requiredInstructeeCount("外食業")).toBe(0);
  });

  it("分野名の後ろに区分が付いていても読み取れる", () => {
    expect(requiredInstructeeCount("農業（耕種農業全般）")).toBe(2);
    expect(requiredInstructeeCount("飲食料品製造業（惣菜製造）")).toBe(2);
  });

  it("未入力・知らない分野は0", () => {
    expect(requiredInstructeeCount("")).toBe(0);
    expect(requiredInstructeeCount("介護")).toBe(0);
  });
});

describe("instructeeShortage", () => {
  it("足りない人数を返す", () => {
    expect(instructeeShortage("農業", 0)).toBe(2);
    expect(instructeeShortage("農業", 1)).toBe(1);
    expect(instructeeShortage("農業", 2)).toBe(0);
    expect(instructeeShortage("農業", 3)).toBe(0);
  });

  it("人数の決まりが無い分野は足りないことにならない", () => {
    expect(instructeeShortage("外食業", 0)).toBe(0);
  });
});

describe("instructeeMissingFields", () => {
  it("様式の4欄が埋まっていれば足りない欄は無い", () => {
    expect(instructeeMissingFields(row())).toEqual([]);
  });

  it("空の欄を並べる", () => {
    expect(instructeeMissingFields(row({ name: "", duties: "  " }))).toEqual([
      "氏名",
      "指導を受ける職務内容",
    ]);
  });

  it("登録のある外国人を選んだときは在留カード番号も要る", () => {
    expect(instructeeMissingFields(row({ target_worker_id: "w1" }))).toEqual(["在留カード番号"]);
    expect(
      instructeeMissingFields(row({ target_worker_id: "w1", residence_card_no: "AB1234567CD" })),
    ).toEqual([]);
  });
});

describe("instructeeCandidates", () => {
  const workers = [
    { id: "self", name: "本人", status: "在籍中", current_organization_id: "org1" },
    { id: "a", name: "あさひ", status: "在籍中", residence_card_no: "A1", current_organization_id: "org1" },
    { id: "b", name: "いろは", status: "在籍中", current_organization_id: "org1" },
    { id: "c", name: "うえだ", status: "退職", current_organization_id: "org1" },
    { id: "d", name: "えのき", status: "在籍中", current_organization_id: "org2" },
  ];
  const opts = { selfWorkerId: "self", organizationId: "org1", takenBy: new Map<string, string>() };

  it("本人・退職者・別の所属機関の人は候補に出さない", () => {
    expect(instructeeCandidates(workers, opts).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("在留カード番号も一緒に返す（様式に書くため）", () => {
    const a = instructeeCandidates(workers, opts).find((c) => c.id === "a");
    expect(a?.residence_card_no).toBe("A1");
  });

  it("他の2号申請者が押さえている人には、誰の対象者かを付ける", () => {
    const taken = new Map([["a", "グエン"]]);
    const list = instructeeCandidates(workers, { ...opts, takenBy: taken });
    expect(list.find((c) => c.id === "a")?.takenBy).toBe("グエン");
    expect(list.find((c) => c.id === "b")?.takenBy).toBeNull();
  });

  it("所属機関が分からないときは会社で絞らない", () => {
    const list = instructeeCandidates(workers, { ...opts, organizationId: null });
    expect(list.map((c) => c.id)).toEqual(["a", "b", "d"]);
  });
});
