import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { buildXlsx } from "./xlsx-export";
import { readXlsx, parseSheetXml } from "./xlsx-read";
import { matchRoster, parseRosterSheets } from "./roster-sync";

const header = ["No.", "氏名", "フリガナ", "在留カード番号", "配属先", "居住について", "在籍状況"];

describe("readXlsx（書き出した名簿を読み戻す）", () => {
  it("buildXlsx で作ったブックのシート名と文字を読める", async () => {
    const blob = await buildXlsx([
      { name: "有限会社國崎青果", rows: [["在籍名簿（有限会社國崎青果）"], [], header, [1, "A & B", "", "LJ1", "熊本", "社宅", "在籍中"]] },
    ]);
    const sheets = await readXlsx(new Uint8Array(await blob.arrayBuffer()));
    expect(sheets[0].name).toBe("有限会社國崎青果");
    expect(sheets[0].rows[2]).toEqual(header);
    expect(sheets[0].rows[3]).toEqual(["1", "A & B", "", "LJ1", "熊本", "社宅", "在籍中"]);
  });
  it("共有文字列（エクセルで保存し直したブック）も読める", () => {
    const xml = '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="3"><c r="B3"><v>12</v></c></row></sheetData>';
    expect(parseSheetXml(xml, ["氏名", "配属先"])).toEqual([["氏名", "", "配属先"], [], ["", "12"]]);
  });
  it("zip を直接読む", async () => {
    const zip = new JSZip();
    zip.file("xl/workbook.xml", '<workbook><sheets><sheet name="S" sheetId="1" r:id="rId1"/></sheets></workbook>');
    zip.file("xl/_rels/workbook.xml.rels", '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>');
    zip.file("xl/sharedStrings.xml", "<sst><si><t>熊本</t></si></sst>");
    zip.file("xl/worksheets/sheet1.xml", '<sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row></sheetData>');
    const buf = await zip.generateAsync({ type: "uint8array" });
    expect((await readXlsx(buf))[0]).toEqual({ name: "S", rows: [["熊本"]] });
  });
});

describe("parseRosterSheets / matchRoster（配属先・居住の反映）", () => {
  const sheets = [
    {
      name: "國崎青果",
      rows: [
        ["在籍名簿"],
        header,
        ["1", "H BOAN MLO", "", "LJ27218590RG", "熊本", "社宅", "在籍中"],
        ["2", "KUY  SARORS", "", "", "熊本", "自分のアパート", "在籍中"],
        ["3", "NOT FOUND", "", "XX1", "熊本", "社宅", "在籍中"],
        ["4", "TWIN", "", "", "熊本", "社宅", "在籍中"],
        ["5", "SAME", "", "LJ5", "熊本", "", "在籍中"],
      ],
    },
    { name: "メモ", rows: [["見出しの無いシート"]] },
  ];
  const workers = [
    { id: "w1", name: "H BOAN MLO", residence_card_no: "lj27218590rg", assigned_office: "", residence_note: "社宅" },
    { id: "w2", name: "KUY SARORS", residence_card_no: "", assigned_office: "熊本", residence_note: "社宅" },
    { id: "w4a", name: "TWIN", residence_card_no: "", assigned_office: "", residence_note: "" },
    { id: "w4b", name: "TWIN", residence_card_no: "", assigned_office: "", residence_note: "" },
    { id: "w5", name: "SAME", residence_card_no: "LJ5", assigned_office: "熊本", residence_note: "社宅" },
  ];
  it("在留カード番号、無ければ氏名で照合し、変わる項目だけを出す。名簿で空の欄は変えない", () => {
    const entries = parseRosterSheets(sheets);
    expect(entries).toHaveLength(5);
    const m = matchRoster(entries, workers);
    expect(m[0]).toMatchObject({ worker: { id: "w1" }, by: "card", officeChanged: true, residenceChanged: false });
    expect(m[1]).toMatchObject({ worker: { id: "w2" }, by: "name", officeChanged: false, residenceChanged: true });
    expect(m[2]).toMatchObject({ worker: null, reason: "外国人が見つかりません" });
    expect(m[3]).toMatchObject({ worker: null, reason: "同じ氏名の外国人が複数いるため照合できません" });
    expect(m[4]).toMatchObject({ worker: { id: "w5" }, officeChanged: false, residenceChanged: false });
  });
});
