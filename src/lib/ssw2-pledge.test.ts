import { describe, expect, it } from "vitest";
import {
  buildSsw2PledgeDoc,
  instructeeRow,
  pledgeDateText,
  pledgeFileName,
} from "@/lib/ssw2-pledge";
import { EMPTY_SSW2_DUTIES } from "@/lib/org-ssw2-duties";
import type { Ssw2Instructee } from "@/lib/ssw2-instructees";

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

  it("未入力のときは様式どおりの空欄", () => {
    expect(pledgeDateText("")).toBe("２０　　　年　　　月　　　日");
    expect(pledgeDateText("なにか")).toBe("２０　　　年　　　月　　　日");
  });
});

describe("instructeeRow", () => {
  it("外国人は氏名の下に在留カード番号を入れる", () => {
    const row = instructeeRow(1, person({ residence_card_no: "AB1234567CD" }));
    expect(row[0]).toBe("1");
    expect(row[1]).toContain("山田　太郎");
    expect(row[1]).toContain("AB1234567CD");
  });

  it("在留カード番号が無ければ氏名だけ", () => {
    expect(instructeeRow(2, person())[1]).toBe("山田　太郎");
  });

  it("登録が無い枠は番号だけの空行", () => {
    expect(instructeeRow(3, undefined)).toEqual(["3", "", "", "", ""]);
  });
});

describe("buildSsw2PledgeDoc", () => {
  const input = {
    workerName: "グエン　バン　ナム",
    orgName: "BASE株式会社",
    authorName: "田中　輝久　代表取締役",
    filledOn: "2026-08-27",
    duties: { ...EMPTY_SSW2_DUTIES, department: "製造部", position: "班長", duties: "選別" },
    instructees: [person()],
  };

  it("A4縦で作る", () => {
    const spec = buildSsw2PledgeDoc(input);
    expect(spec.page?.width).toBeLessThan(spec.page!.height);
  });

  it("様式の見出しが入る", () => {
    const texts = buildSsw2PledgeDoc(input)
      .blocks.filter((b) => b.kind === "paragraph")
      .map((b) => (b as { text: string }).text);
    expect(texts).toContain("参考様式第１－３２号");
    expect(texts).toContain("２号特定技能外国人の業務内容に関する誓約書");
    expect(texts).toContain("１　当該２号特定技能外国人の業務内容");
    expect(texts).toContain("２　当該２号特定技能外国人に指導を受ける対象者一覧");
  });

  it("外国人の氏名・所属機関・作成責任者が入る", () => {
    const texts = buildSsw2PledgeDoc(input)
      .blocks.filter((b) => b.kind === "paragraph")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    expect(texts).toContain("グエン　バン　ナム");
    expect(texts).toContain("BASE株式会社");
    expect(texts).toContain("田中　輝久　代表取締役");
    expect(texts).toContain("2026年8月27日");
  });

  it("業務内容の①〜④が表に入る", () => {
    const tables = buildSsw2PledgeDoc(input).blocks.filter((b) => b.kind === "table");
    const duty = tables[0] as { rows: string[][] };
    expect(duty.rows).toHaveLength(4);
    expect(duty.rows[0][1]).toBe("製造部");
    expect(duty.rows[3][1]).toBe(""); // ④は未入力なので空欄
  });

  it("対象者の表は見出し＋5行（登録が少なくても枠を出す）", () => {
    const tables = buildSsw2PledgeDoc(input).blocks.filter((b) => b.kind === "table");
    const list = tables[1] as { rows: string[][] };
    expect(list.rows).toHaveLength(6); // 見出し1 + 5枠
    expect(list.rows[1][1]).toBe("山田　太郎");
    expect(list.rows[5]).toEqual(["5", "", "", "", ""]);
  });

  it("対象者が6人以上なら枠を足す（記載欄が足りない場合は適宜追加）", () => {
    const many = Array.from({ length: 7 }, (_, i) => person({ id: `i${i}`, name: `対象者${i}` }));
    const tables = buildSsw2PledgeDoc({ ...input, instructees: many }).blocks.filter(
      (b) => b.kind === "table",
    );
    expect((tables[1] as { rows: string[][] }).rows).toHaveLength(8);
  });

  it("留意事項の4（他の2号に指導を受けている者は記載しない）が入る", () => {
    const texts = buildSsw2PledgeDoc(input)
      .blocks.filter((b) => b.kind === "paragraph")
      .map((b) => (b as { text: string }).text)
      .join("\n");
    expect(texts).toContain("他の２号特定技能外国人に指導を受けている者については記載しないこと");
  });
});

describe("pledgeFileName", () => {
  it("氏名と作成年月日を入れる", () => {
    expect(pledgeFileName("グエン", "2026-08-27")).toBe(
      "参考様式1-32_業務内容に関する誓約書_グエン_2026-08-27.docx",
    );
  });

  it("未入力でも壊れない", () => {
    expect(pledgeFileName("", "")).toBe("参考様式1-32_業務内容に関する誓約書_特定技能2号_未記入.docx");
  });
});
