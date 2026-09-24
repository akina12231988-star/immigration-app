import { describe, expect, it } from "vitest";
import { buildSsw2PledgeCopy, instructeeNameText, pledgeDateText } from "@/lib/ssw2-pledge";
import { EMPTY_SSW2_DUTIES, ssw2DutiesOf, withInstructeeDefaults } from "@/lib/org-ssw2-duties";
import { instructeeMissingFields, type Ssw2Instructee } from "@/lib/ssw2-instructees";

const person = (patch: Partial<Ssw2Instructee> = {}): Ssw2Instructee => ({
  id: "i1",
  worker_id: "w1",
  target_worker_id: null,
  name: "山田　太郎",
  residence_card_no: "",
  office: "八代工場　製造部",
  position: "班長",
  duties: "野菜の選別",
  sort_order: 0,
  created_at: "",
  updated_at: "",
  ...patch,
});

describe("pledgeDateText", () => {
  it("年月日の形にする", () => {
    expect(pledgeDateText("2026-08-27")).toBe("2026年8月27日");
    expect(pledgeDateText("2026-09-01")).toBe("2026年9月1日");
  });

  it("未入力・形が違うときは空", () => {
    expect(pledgeDateText("")).toBe("");
    expect(pledgeDateText("なにか")).toBe("");
  });
});

describe("instructeeNameText", () => {
  it("外国人は在留カード番号も付ける", () => {
    expect(instructeeNameText(person({ residence_card_no: "AB1234567CD" }))).toBe(
      "山田　太郎（在留カード番号：AB1234567CD）",
    );
  });

  it("在留カード番号が無ければ氏名だけ", () => {
    expect(instructeeNameText(person())).toBe("山田　太郎");
  });

  it("氏名が無ければ空", () => {
    expect(instructeeNameText(person({ name: " ", residence_card_no: "AB1" }))).toBe("");
  });
});

describe("buildSsw2PledgeCopy", () => {
  const input = {
    workerName: "グエン　バン　ナム",
    orgName: "BASE株式会社",
    authorName: "田中　輝久　代表取締役",
    filledOn: "2026-08-27",
    duties: { ...EMPTY_SSW2_DUTIES, department: "製造部", position: "班長", duties: "選別" },
    instructees: [person({ residence_card_no: "AB1234567CD" }), person({ id: "i2", name: "佐藤　花子" })],
  };
  const sections = buildSsw2PledgeCopy(input);
  const find = (where: string) =>
    sections.flatMap((s) => s.items).find((i) => i.where.includes(where));

  it("様式の見出しの順に並ぶ", () => {
    expect(sections.map((s) => s.title)).toEqual([
      "冒頭の文章",
      "１　当該２号特定技能外国人の業務内容",
      "２　当該２号特定技能外国人に指導を受ける対象者一覧",
      "最後の署名欄",
    ]);
  });

  it("冒頭の空欄に外国人の氏名が入る", () => {
    expect(sections[0].items[0].value).toBe("グエン　バン　ナム");
  });

  it("業務内容の①〜④が欄ごとに入る（未入力は空）", () => {
    const items = sections[1].items;
    expect(items).toHaveLength(4);
    expect(items[0].where).toContain("①　所属部署名");
    expect(items[0].value).toBe("製造部");
    expect(items[3].value).toBe("");
  });

  it("対象者は1人4欄ずつ、何行目のどの欄かが分かる", () => {
    const items = sections[2].items;
    expect(items).toHaveLength(8);
    expect(items[0].where).toContain("1行目");
    expect(items[0].value).toBe("山田　太郎（在留カード番号：AB1234567CD）");
    expect(items[0].parts).toEqual([
      { label: "氏名", value: "山田　太郎" },
      { label: "在留カード番号", value: "AB1234567CD" },
    ]);
    expect(items[1].value).toBe("八代工場　製造部");
    expect(items[4].where).toContain("2行目");
    expect(items[4].parts).toBeUndefined();
  });

  it("署名欄に作成年月日（年・月・日の部品つき）・所属機関・作成責任者が入る", () => {
    const date = find("作成年月日");
    expect(date?.value).toBe("2026年8月27日");
    expect(date?.parts?.map((p) => p.value)).toEqual(["2026", "8", "27"]);
    expect(find("特定技能所属機関の氏名又は名称")?.value).toBe("BASE株式会社");
    expect(find("作成責任者の氏名及び役職")?.value).toBe("田中　輝久　代表取締役");
  });

  it("本人の署名欄は貼らずに案内だけ", () => {
    const sign = find("２号特定技能外国人の署名");
    expect(sign?.value).toBe("");
    expect(sign?.note).toContain("本人");
  });

  it("対象者がいなくても壊れない", () => {
    const empty = buildSsw2PledgeCopy({ ...input, instructees: [], filledOn: "" });
    expect(empty[2].items).toEqual([]);
    expect(empty[3].items[0].parts).toBeUndefined();
  });
});

describe("所属機関の対象者の共通の内容", () => {
  const duties = {
    ...EMPTY_SSW2_DUTIES,
    instructee_office: "髙濱農園　農業部門",
    instructee_position: "耕種農業の一般社員",
    instructee_duties: "トマトの栽培や仕事の段取り",
  };

  it("対象者の欄が空なら共通の内容が入り、入っていればその人の内容が優先される", () => {
    const sections = buildSsw2PledgeCopy({
      workerName: "TRAN THI VAN",
      orgName: "髙濱　伸吉",
      authorName: "髙濱　伸吉",
      filledOn: "2026-08-20",
      duties,
      instructees: [
        person({ office: "", position: "", duties: "" }),
        person({ id: "i2", office: "", position: "班長", duties: "" }),
      ],
    });
    const values = sections[2].items.map((i) => i.value);
    expect(values.slice(1, 4)).toEqual([
      "髙濱農園　農業部門",
      "耕種農業の一般社員",
      "トマトの栽培や仕事の段取り",
    ]);
    expect(values[6]).toBe("班長");
  });

  it("withInstructeeDefaults は空の欄だけ埋める", () => {
    const r = withInstructeeDefaults(person({ office: " ", position: "班長", duties: "" }), duties);
    expect(r.office).toBe("髙濱農園　農業部門");
    expect(r.position).toBe("班長");
    expect(r.duties).toBe("トマトの栽培や仕事の段取り");
  });

  it("共通の内容で埋まれば、誓約書に書けていない欄として出ない", () => {
    const row = withInstructeeDefaults(person({ office: "", position: "", duties: "" }), duties);
    expect(instructeeMissingFields(row)).toEqual([]);
  });

  it("ssw2DutiesOf は共通の内容も読む（無ければ空）", () => {
    expect(ssw2DutiesOf({ ssw2_duties: { instructee_office: "本社" } }).instructee_office).toBe("本社");
    expect(ssw2DutiesOf(null).instructee_duties).toBe("");
  });
});
