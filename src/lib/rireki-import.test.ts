import { describe, expect, it } from "vitest";
import {
  extractRirekiPayload,
  findRirekiMatches,
  rirekiGender,
  rirekiPreviewRows,
  rirekiResidenceStatus,
  rirekiToWorkHistories,
  rirekiToWorkerPatch,
  rirekiVisaType,
} from "./rireki-import";

const payload = {
  docType: "resume",
  schema: "tokutei-rireki",
  version: 1,
  generatedAt: "2026-09-08T03:10:37.283Z",
  sourceLang: "vi",
  basic: {
    name: "NGUYEN VAN A",
    kana: "グエン バン アー",
    gender: "女性",
    birth: "1996-02-10",
    nationality: "ベトナム",
    languages: "ベトナム語",
    spouse: "無",
    trainingType: "農業",
    trainingTypeKey: "",
    trainingWork: "",
    trainingWorkKey: "",
    trainingEnd: "",
    visaExpiry: "2027-04-07",
    residenceStatus: "特定活動（特定技能1号移行準備）",
    residenceStatusKey: "cur_tokkatsu_ikou",
    addressJapan: "熊本県八代市郡築五番町126番地2",
    addressHome: "Hà Nội",
    qualifications: "",
    height: "",
    weight: "",
    bloodType: "",
    illness: "",
    vision: "",
    dominantHand: "",
    hobby: "",
    drinking: "",
    smoking: "",
  },
  careers: [
    {
      startYear: "2021",
      startMonth: "4",
      startDay: "",
      endYear: "2024",
      endMonth: "3",
      endDay: "",
      company: "株式会社ベース",
      sswFieldKey: "nogyo",
      sswField: "農業",
      residenceStatusKey: "ginou_jisshu_2",
      residenceStatus: "技能実習2号で修了",
    },
    {
      startYear: "2018",
      startMonth: "",
      startDay: "",
      endYear: "",
      endMonth: "",
      endDay: "",
      company: "Công ty ABC",
      sswFieldKey: "",
      sswField: "",
      residenceStatusKey: "",
      residenceStatus: "",
    },
    { startYear: "", startMonth: "", startDay: "", endYear: "", endMonth: "", endDay: "", company: "", sswFieldKey: "", sswField: "", residenceStatusKey: "", residenceStatus: "" },
  ],
  families: [{ relation: "母", name: "NGUYEN THI B", birthYear: "1970", job: "農業" }],
};

// ツールと同じ形で埋め込む（UTF-8 の Base64）
function embed(obj: unknown): string {
  const b64 = Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
  return `特定技能外国人の履歴書\n氏名 NGUYEN VAN A\n@@RIREKI_JSON_V1@@${b64}@@END@@`;
}

describe("extractRirekiPayload", () => {
  it("PDFの文字から埋め込みデータを取り出す（途中に空白や改行が入っていても）", () => {
    const text = embed(payload);
    // PDFの読み取りでは Base64 が途中で改行・空白で切れることがある
    const broken = text.replace(/(.{40})/g, "$1\n ");
    const p = extractRirekiPayload(broken);
    expect(p?.basic.name).toBe("NGUYEN VAN A");
    expect(p?.basic.birth).toBe("1996-02-10");
    expect(p?.careers).toHaveLength(3);
    expect(p?.families[0].name).toBe("NGUYEN THI B");
  });

  it("埋め込みが無い・壊れている・別の種類のデータは null", () => {
    expect(extractRirekiPayload("ただの文字")).toBeNull();
    expect(extractRirekiPayload("@@RIREKI_JSON_V1@@!!!@@END@@")).toBeNull();
    expect(extractRirekiPayload(embed({ ...payload, schema: "other" }))).toBeNull();
  });
});

describe("外国人の登録内容への変換", () => {
  it("性別・在留資格の表記をそろえる", () => {
    expect(rirekiGender("女性")).toBe("女");
    expect(rirekiGender("男")).toBe("男");
    expect(rirekiGender("")).toBe("");
    expect(rirekiResidenceStatus("特定活動（特定技能1号移行準備）")).toBe("特定活動（特定技能1号以降準備）");
    expect(rirekiResidenceStatus("特定技能１号")).toBe("特定技能1号");
    expect(rirekiResidenceStatus("留学")).toBe("留学");
    expect(rirekiResidenceStatus("その他")).toBe("");
  });

  it("空でない項目だけを登録内容にする", () => {
    const patch = rirekiToWorkerPatch(extractRirekiPayload(embed(payload))!);
    expect(patch).toEqual({
      name: "NGUYEN VAN A",
      kana: "グエン バン アー",
      gender: "女",
      birth: "1996-02-10",
      nationality: "ベトナム",
      residence_status: "特定活動（特定技能1号以降準備）",
      residence_expiry_date: "2027-04-07",
      address: "熊本県八代市郡築五番町126番地2",
      home_address: "Hà Nội",
      has_spouse: "無",
    });
  });

  it("職歴は開始年がある行だけ。在留資格が無い職歴は本国での職歴", () => {
    const rows = rirekiToWorkHistories(extractRirekiPayload(embed(payload))!);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      visa: "技能実習",
      start_date: "2021-04-01",
      end_date: "2024-03-01",
      org_name: "株式会社ベース",
      role: "農業",
    });
    expect(rows[1]).toMatchObject({
      visa: "本国での職歴",
      start_date: "2018-01-01",
      end_date: null,
      org_name: "Công ty ABC",
    });
  });

  it("当時の在留資格の区分", () => {
    expect(rirekiVisaType("技能実習1号で修了")).toBe("技能実習");
    expect(rirekiVisaType("特定技能1号")).toBe("特定技能1号");
    expect(rirekiVisaType("特定活動（特定技能1号移行準備）")).toBe("特定活動（特定技能1号移行準備）");
    expect(rirekiVisaType("特定活動（コロナによる帰国困難）")).toBe("その他");
    expect(rirekiVisaType("")).toBe("本国での職歴");
  });
});

describe("findRirekiMatches", () => {
  it("氏名が同じ人を、生年月日も一致する人を先にして返す", () => {
    const p = extractRirekiPayload(embed(payload))!;
    const workers = [
      { id: "w1", name: "Nguyen Van A", birth: "1990-01-01" },
      { id: "w2", name: "NGUYEN  VAN A", birth: "1996-02-10" },
      { id: "w3", name: "TRAN THI B", birth: "1996-02-10" },
    ];
    const m = findRirekiMatches(p, workers);
    expect(m.map((x) => [x.worker.id, x.sameBirth])).toEqual([
      ["w2", true],
      ["w1", false],
    ]);
  });
});

describe("rirekiPreviewRows", () => {
  it("値がある項目だけ並べる", () => {
    const rows = rirekiPreviewRows(extractRirekiPayload(embed(payload))!);
    expect(rows.map((r) => r.label)).toContain("在留期限");
    expect(rows.map((r) => r.label)).not.toContain("資格・免許");
  });
});
