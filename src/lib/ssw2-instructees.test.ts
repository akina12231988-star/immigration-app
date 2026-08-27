import { describe, expect, it } from "vitest";
import {
  instructeeCandidates,
  instructeeMissingFields,
  orgSsw2Field,
  ssw2Capacity,
  instructeeShortage,
  requiredInstructeeCount,
  SSW2_PREP_SITUATION,
  type Ssw2Applicant,
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

  it("本人と退職者は候補に出さない", () => {
    expect(instructeeCandidates(workers, opts).map((c) => c.id)).toEqual(["a", "b", "d"]);
  });

  it("ほかの所属機関の人も選べるが、同じ機関の人を先に並べる", () => {
    const list = instructeeCandidates(workers, opts);
    expect(list.map((c) => c.sameOrg)).toEqual([true, true, false]);
    expect(list.find((c) => c.id === "d")?.sameOrg).toBe(false);
  });

  it("在留カード番号も一緒に返す（様式に書くため）", () => {
    expect(instructeeCandidates(workers, opts).find((c) => c.id === "a")?.residence_card_no).toBe("A1");
  });

  it("他の2号申請者が押さえている人には、誰の対象者かを付ける", () => {
    const taken = new Map([["a", "グエン"]]);
    const list = instructeeCandidates(workers, { ...opts, takenBy: taken });
    expect(list.find((c) => c.id === "a")?.takenBy).toBe("グエン");
    expect(list.find((c) => c.id === "b")?.takenBy).toBeNull();
  });

  it("所属機関が分からないときは全員を同じ機関として扱う", () => {
    const list = instructeeCandidates(workers, { ...opts, organizationId: null });
    expect(list.every((c) => c.sameOrg)).toBe(true);
  });
});

describe("orgSsw2Field", () => {
  it("在籍者の分野のうち、いちばん多いものを使う", () => {
    expect(
      orgSsw2Field([
        { field: "農業", status: "在籍中" },
        { field: "農業", status: "在籍中" },
        { field: "外食業", status: "在籍中" },
      ]),
    ).toBe("農業");
  });

  it("退職した人と未入力は数えない", () => {
    expect(
      orgSsw2Field([
        { field: "外食業", status: "退職" },
        { field: "", status: "在籍中" },
        { field: "建設", status: "在籍中" },
      ]),
    ).toBe("建設");
  });

  it("誰も分野を登録していなければ空", () => {
    expect(orgSsw2Field([{ field: "", status: "在籍中" }])).toBe("");
  });
});

describe("ssw2Capacity", () => {
  const applicant = (n: number, field = "農業"): Ssw2Applicant => ({
    workerId: `w${n}`,
    name: `申請者${n}`,
    field,
    instructeeCount: 0,
  });

  it("空いている人数を必要人数で割った数だけ受け入れられる", () => {
    const cap = ssw2Capacity({ field: "農業", applicants: [], free: 7 });
    expect(cap.required).toBe(2);
    expect(cap.more).toBe(3); // 7名 ÷ 2名 = 3名
  });

  it("準備中の人に足りないぶんを先に引く", () => {
    // 農業は1人あたり2名。準備中が1人で対象者0名なので、まず2名が要る
    const cap = ssw2Capacity({ field: "農業", applicants: [applicant(1)], free: 6 });
    expect(cap.shortage).toBe(2);
    expect(cap.more).toBe(2); // (6 - 2) ÷ 2 = 2名
  });

  it("準備中の人が満たされていれば引かない", () => {
    const cap = ssw2Capacity({
      field: "農業",
      applicants: [{ ...applicant(1), instructeeCount: 2 }],
      free: 4,
    });
    expect(cap.shortage).toBe(0);
    expect(cap.more).toBe(2);
  });

  it("足りていないときは受け入れ0名になる", () => {
    const cap = ssw2Capacity({ field: "農業", applicants: [applicant(1)], free: 1 });
    expect(cap.shortage).toBe(2);
    expect(cap.more).toBe(0); // マイナスにはしない
  });

  it("人数の決まりが無い分野は more を出さない", () => {
    const cap = ssw2Capacity({ field: "外食業", applicants: [], free: 3 });
    expect(cap.required).toBe(0);
    expect(cap.more).toBeNull();
  });

  it("申請者ごとに分野が違うときは、その人の分野で必要人数を見る", () => {
    const cap = ssw2Capacity({
      field: "農業",
      applicants: [applicant(1, "自動車整備")], // 1名以上
      free: 5,
    });
    expect(cap.shortage).toBe(1);
    expect(cap.more).toBe(2); // (5 - 1) ÷ 2 = 2名
  });
});
