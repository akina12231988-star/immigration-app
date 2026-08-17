import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildFuyoFieldValues,
  fillFuyoForm,
  fuyoOverflow,
  type FuyoFormData,
} from "./fuyo-form";

const TODAY = "2026-07-30";

// 扶養親族証明書の例（カンボジア）: 父49歳・母46歳・妹21歳
const DATA: FuyoFormData = {
  worker: {
    name: "BOY SAMNANG",
    kana: "ボン　サムナン",
    birth: "1999-12-12",
    address: "熊本県八代市新浜町1番1号",
    myNumber: "058796259394",
    hasSpouse: "",
  },
  householdHead: "BOY SAMNANG",
  headRelation: "本人",
  dependents: [
    {
      name: "PORY PHANNA",
      kana: "ポーイ　パンナー",
      relation: "父",
      birth: "1977-05-05",
      address: "POR SANGKAE VILLAGE, KOMNOB COMMUNE, KIRI VONG DISTRICT, TAKEO PROVINCE.",
      occupation: "FARMER",
      my_number: "",
      income: "0円",
      remittances: [],
    },
    {
      name: "BAN KIMHOEURN",
      kana: "バン　キムホウン",
      relation: "母",
      birth: "1979-11-12",
      address: "POR SANGKAE VILLAGE, KOMNOB COMMUNE, KIRI VONG DISTRICT, TAKEO PROVINCE.",
      occupation: "FARMER",
      my_number: "",
      income: "0円",
      remittances: [],
    },
    {
      name: "BORY REATREY",
      kana: "ポーイ　レアトレイ",
      relation: "妹",
      birth: "2005-06-01",
      address: "POR SANGKAE VILLAGE, KOMNOB COMMUNE, KIRI VONG DISTRICT, TAKEO PROVINCE.",
      occupation: "BURDEN",
      my_number: "",
      income: "0円",
      remittances: [],
    },
  ],
};

describe("buildFuyoFieldValues", () => {
  const v = buildFuyoFieldValues(DATA, TODAY);

  it("本人情報を対応するフィールドに入れ、給与の支払者の欄は記入しない", () => {
    expect(v.texts["Text3"]).toBeUndefined(); // 名称
    expect(v.texts["Text4"]).toBeUndefined(); // 法人番号
    expect(v.texts["Text5"]).toBeUndefined(); // 所在地
    expect(v.texts["Text7"]).toBe("BOY SAMNANG");
    expect(v.texts["Text8"]).toBe("058796259394");
    // 本人の生年月日は平成11年12月12日
    expect(v.dropdowns["Dropdown1"]).toBe("平");
    expect(v.texts["Text11"]).toBe("11");
    expect(v.texts["Text12"]).toBe("12");
    expect(v.texts["Text13"]).toBe("12");
    expect(v.texts["Text14"]).toBe("BOY SAMNANG");
    expect(v.texts["Text15"]).toBe("本人");
  });

  it("配偶者がいなければ配偶者の有無は無・A欄は空", () => {
    expect(v.dropdowns["Dropdown2"]).toBe("無");
    expect(v.texts["Text17"]).toBeUndefined();
  });

  it("16歳以上の扶養親族をB欄1〜3行目に入れる", () => {
    expect(v.texts["Text26"]).toBe("PORY PHANNA"); // 1行目: 父
    expect(v.texts["Text28"]).toBe("父");
    expect(v.dropdowns["Dropdown5"]).toBe("昭"); // 1977年 → 昭和52年
    expect(v.texts["Text29"]).toBe("52");
    expect(v.texts["Text36"]).toBe("BAN KIMHOEURN"); // 2行目: 母
    expect(v.texts["Text46"]).toBe("BORY REATREY"); // 3行目: 妹
    expect(v.texts["Text56"]).toBeUndefined(); // 4行目は空
  });

  it("控除区分のチェック: 父母(30-70歳)は38万円以上の支払、妹(21歳)は特定扶養と16-30歳", () => {
    expect(v.checks).toContain("Check Box3-4"); // 父: 38万円以上の支払
    expect(v.checks).toContain("Check Box6-4"); // 母: 38万円以上の支払
    expect(v.checks).toContain("Check Box8-1"); // 妹: 特定扶養親族
    expect(v.checks).toContain("Check Box9-1"); // 妹: 16歳以上30歳未満又は70歳以上
    expect(v.checks).not.toContain("Check Box3-1"); // 父は16-30歳ではない
  });

  it("配偶者はA欄に入り、配偶者の有無が有になる", () => {
    const withSpouse = buildFuyoFieldValues(
      {
        ...DATA,
        dependents: [
          {
            name: "SOK SREYPICH",
            kana: "ソク　スレイピッチ",
            relation: "配偶者",
            birth: "2000-03-15",
            address: "TAKEO PROVINCE.",
            occupation: "",
            my_number: "",
            income: "0円",
            remittances: [],
          },
        ],
      },
      TODAY,
    );
    expect(withSpouse.dropdowns["Dropdown2"]).toBe("有");
    expect(withSpouse.texts["Text17"]).toBe("SOK SREYPICH");
    expect(withSpouse.dropdowns["Dropdown4"]).toBe("平");
    expect(withSpouse.dropdowns["Dropdown50"]).toBe("○");
    // B欄には入らない
    expect(withSpouse.texts["Text26"]).toBeUndefined();
  });

  it("入社時（既定）は「生計を一にする事実」欄を記載しない", () => {
    const withMoney = buildFuyoFieldValues(
      {
        ...DATA,
        dependents: [
          {
            ...DATA.dependents[0],
            remittances: [
              { year: "2026", amount: "200,000" },
              { year: "2026", amount: "180,000" },
            ],
          },
        ],
      },
      TODAY,
    );
    expect(withMoney.texts["Text120"]).toBeUndefined();
  });

  it("年末調整時はB欄の「生計を一にする事実」に対象年の送金合計額を入れる", () => {
    const v2 = buildFuyoFieldValues(
      {
        ...DATA,
        kind: "年末調整時",
        year: "2026",
        dependents: [
          {
            ...DATA.dependents[0], // 父: 2026年は38万円、2025年の分は含めない
            remittances: [
              { year: "2026", amount: "200,000" },
              { year: "2026", amount: "180,000" },
              { year: "2025", amount: "500,000" },
            ],
          },
          {
            ...DATA.dependents[2], // 妹: 2026年は1万円
            remittances: [{ year: "2026", amount: "10,000" }],
          },
        ],
      },
      TODAY,
    );
    expect(v2.texts["Text120"]).toBe("380,000円"); // B欄1行目
    expect(v2.texts["Text121"]).toBe("10,000円"); // B欄2行目
    expect(v2.texts["Text122"]).toBeUndefined(); // 3行目は空
  });

  it("対象年に送金の記録がなければ「生計を一にする事実」欄は空のまま", () => {
    const v3 = buildFuyoFieldValues({ ...DATA, kind: "年末調整時", year: "2026" }, TODAY);
    expect(v3.texts["Text120"]).toBeUndefined();
    const v4 = buildFuyoFieldValues(
      {
        ...DATA,
        kind: "年末調整時",
        year: "2026",
        dependents: [
          { ...DATA.dependents[0], remittances: [{ year: "2025", amount: "500,000" }] },
        ],
      },
      TODAY,
    );
    expect(v4.texts["Text120"]).toBeUndefined();
  });

  it("16歳未満は住民税欄に入り、控除対象外国外扶養親族に○が付く", () => {
    const withChild = buildFuyoFieldValues(
      {
        ...DATA,
        dependents: [
          {
            name: "BOY DARA",
            kana: "ボン　ダラ",
            relation: "子",
            birth: "2015-02-01",
            address: "TAKEO PROVINCE.",
            occupation: "",
            my_number: "",
            income: "",
            remittances: [],
          },
        ],
      },
      TODAY,
    );
    expect(withChild.texts["Text91"]).toBe("BOY DARA");
    expect(withChild.texts["Text93"]).toBe("子");
    expect(withChild.dropdowns["Dropdown20"]).toBe("○");
    expect(withChild.texts["Text26"]).toBeUndefined(); // B欄には入らない
  });
});

describe("fuyoOverflow", () => {
  it("B欄4行・住民税欄2行を超えた人数を返す", () => {
    expect(fuyoOverflow(DATA, TODAY)).toEqual({ over16Overflow: 0, under16Overflow: 0 });
    const many = {
      ...DATA,
      dependents: Array.from({ length: 6 }, (_, i) => ({
        ...DATA.dependents[0],
        name: `DEP ${i}`,
      })),
    };
    expect(fuyoOverflow(many, TODAY).over16Overflow).toBe(2);
  });
});

describe("fillFuyoForm", () => {
  it("テンプレートPDFに値が書き込まれる（flattenなしで検証）", async () => {
    const template = await readFile(path.join(process.cwd(), "public", "forms", "fuyo-r8.pdf"));
    const font = await readFile(
      path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"),
    );
    const bytes = await fillFuyoForm(template, font, DATA, TODAY, { flatten: false });

    const doc = await PDFDocument.load(bytes);
    const form = doc.getForm();
    expect(form.getTextField("Text7").getText()).toBe("BOY SAMNANG");
    expect(form.getTextField("Text26").getText()).toBe("PORY PHANNA");
    expect(form.getDropdown("Dropdown1").getSelected()).toEqual(["平"]);
    expect(form.getCheckBox("Check Box3-4").isChecked()).toBe(true);
    expect(form.getCheckBox("Check Box3-1").isChecked()).toBe(false);
    // 個人番号（コーム欄・12桁）が桁数制限内で入っている
    expect(form.getTextField("Text8").getText()).toBe("058796259394");
  }, 30000);

  it("flattenすると編集不可の確定版になる", async () => {
    const template = await readFile(path.join(process.cwd(), "public", "forms", "fuyo-r8.pdf"));
    const font = await readFile(
      path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf"),
    );
    const bytes = await fillFuyoForm(template, font, DATA, TODAY);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getForm().getFields()).toHaveLength(0);
  }, 30000);
});

// 日本語フォントの形式が崩れると、生成したPDFをスマホなどで開いたときに
// 文字が表示されなくなる（pdf-lib は OpenType/CFF でも TrueType 用の入れ物で
// 埋め込んでしまうため）。差し替え事故を防ぐためにここで見張る
describe("日本語フォントの埋め込み形式", () => {
  const fontPath = path.join(process.cwd(), "public", "fonts", "NotoSansJP-Regular.ttf");

  it("同梱フォントは TrueType（glyf）である（OpenType/CFF は使えない）", async () => {
    const font = await readFile(fontPath);
    const signature = font.subarray(0, 4).toString("hex");
    expect(signature).not.toBe("4f54544f"); // OTTO = CFF形式。これだと文字が出ない
    expect(["00010000", "74727565"]).toContain(signature); // TrueType
  });

  it("生成したPDFにも CFF 形式のフォントが入らない", async () => {
    const [template, font] = await Promise.all([
      readFile(path.join(process.cwd(), "public", "forms", "fuyo-r8.pdf")),
      readFile(fontPath),
    ]);
    const bytes = await fillFuyoForm(template, font, DATA, TODAY);
    const raw = Buffer.from(bytes);

    // 埋め込まれたフォント本体が CFF 形式（先頭 OTTO）でないこと。
    // pdf-lib は .otf でも TrueType 用の入れ物で埋め込むため、
    // これが入っているとスマホなどのビューアで文字が消える
    expect(raw.includes(Buffer.from("OTTO", "latin1"))).toBe(false);
    // 本文が読み取れる（フォント埋め込みが壊れていない）こと
    expect(raw.includes(Buffer.from("NotoSansJP", "latin1"))).toBe(true);
  }, 60000);
});
