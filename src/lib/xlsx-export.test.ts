import { describe, expect, it } from "vitest";
import {
  buildXlsx,
  columnLetter,
  escapeXml,
  safeSheetName,
  uniqueSheetNames,
} from "./xlsx-export";

describe("columnLetter", () => {
  it("列番号を列記号にする", () => {
    expect(columnLetter(0)).toBe("A");
    expect(columnLetter(25)).toBe("Z");
    expect(columnLetter(26)).toBe("AA");
    expect(columnLetter(51)).toBe("AZ");
  });
});

describe("safeSheetName", () => {
  it("そのまま使える名前は変えない（全角・絵文字を含む機関名も可）", () => {
    expect(safeSheetName("有限会社　國崎青果", 0)).toBe("有限会社　國崎青果");
    expect(safeSheetName("（通貨💰）髙濱　伸吉", 0)).toBe("（通貨💰）髙濱　伸吉");
  });

  it("シート名に使えない文字を置き換える", () => {
    expect(safeSheetName("a[b]:c*d?e/f\\g", 0)).toBe("ab：c＊d？e／f／g");
  });

  it("31文字までに切り、空なら連番で代用する", () => {
    expect([...safeSheetName("あ".repeat(40), 0)]).toHaveLength(31);
    expect(safeSheetName("", 3)).toBe("シート4");
  });
});

describe("uniqueSheetNames", () => {
  it("同じ名前が並ばないよう連番を足す", () => {
    expect(uniqueSheetNames(["A社", "A社", "A社"])).toEqual(["A社", "A社(2)", "A社(3)"]);
  });
});

describe("escapeXml", () => {
  it("XMLの特殊文字を逃がす", () => {
    expect(escapeXml('a<b>&"c')).toBe("a&lt;b&gt;&amp;&quot;c");
  });
});

describe("buildXlsx", () => {
  it("複数シートのブックを作れる", async () => {
    const blob = await buildXlsx([
      {
        name: "サマリー",
        rows: [
          ["所属機関", "掲載人数", "支援費請求額合計"],
          ["有限会社　國崎青果", 77, 1086776],
          ["合計", 184, 2273517],
        ],
        headerRows: 1,
        columnWidths: [30, 10, 16],
      },
      {
        name: "有限会社　國崎青果",
        rows: [["No.", "氏名", "支援費請求額"], [1, "BOEURN DANY", 15000]],
        headerRows: 1,
      },
    ]);
    // zip（PK シグネチャ）で始まる中身のあるファイルになっている
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(500);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it("シートが無ければエラー", async () => {
    await expect(buildXlsx([])).rejects.toThrow("シートがありません");
  });
});
