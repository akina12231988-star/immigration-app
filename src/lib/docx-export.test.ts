import { describe, expect, it } from "vitest";
import { A4_LANDSCAPE, buildDocx, docxDocumentXml } from "./docx-export";

describe("docxDocumentXml", () => {
  it("段落を書き出す", () => {
    const xml = docxDocumentXml({ blocks: [{ kind: "paragraph", text: "こんにちは" }] });
    expect(xml).toContain("<w:t xml:space=\"preserve\">こんにちは</w:t>");
  });

  it("XMLで使えない文字を逃がす", () => {
    const xml = docxDocumentXml({ blocks: [{ kind: "paragraph", text: "A&B<C>" }] });
    expect(xml).toContain("A&amp;B&lt;C&gt;");
  });

  it("太字・文字の大きさ・そろえを反映する", () => {
    const xml = docxDocumentXml({
      blocks: [{ kind: "paragraph", text: "見出し", bold: true, size: 11, align: "right" }],
    });
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain('<w:sz w:val="22"/>');
    expect(xml).toContain('<w:jc w:val="right"/>');
  });

  it("改行は同じ段落の中で折り返す", () => {
    const xml = docxDocumentXml({ blocks: [{ kind: "paragraph", text: "1行目\n2行目" }] });
    expect(xml).toContain("<w:br/>");
  });

  it("日本語と英数字でフォントを指定する", () => {
    const xml = docxDocumentXml({
      fontEast: "ＭＳ 明朝",
      fontAscii: "Century",
      blocks: [{ kind: "paragraph", text: "あ" }],
    });
    expect(xml).toContain('w:eastAsia="ＭＳ 明朝"');
    expect(xml).toContain('w:ascii="Century"');
  });

  it("表は列幅を固定して罫線を引く", () => {
    const xml = docxDocumentXml({
      blocks: [
        {
          kind: "table",
          columnWidths: [1000, 2000],
          rows: [["見出し1", "見出し2"], ["値1", "値2"]],
          headerRows: 1,
        },
      ],
    });
    expect(xml).toContain('<w:tblW w:w="3000" w:type="dxa"/>');
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain("<w:tblHeader/>"); // 見出し行はページをまたいでも繰り返す
    expect(xml).toContain("値2");
  });

  it("行が足りない列は空欄で埋める", () => {
    const xml = docxDocumentXml({
      blocks: [{ kind: "table", columnWidths: [1000, 2000, 3000], rows: [["A"]] }],
    });
    expect((xml.match(/<w:tc>/g) ?? []).length).toBe(3);
  });

  it("用紙の大きさと余白を入れる", () => {
    const xml = docxDocumentXml({ page: A4_LANDSCAPE, blocks: [] });
    expect(xml).toContain('w:w="16838"');
    expect(xml).toContain('w:left="902"');
  });
});

describe("buildDocx", () => {
  it("Wordが開けるzipを作る（必要な部品が入っている）", async () => {
    const blob = await buildDocx({ blocks: [{ kind: "paragraph", text: "テスト" }] });
    expect(blob.size).toBeGreaterThan(0);
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const files = Object.keys(zip.files)
      .filter((n) => !zip.files[n].dir)
      .sort();
    expect(files).toEqual([
      "[Content_Types].xml",
      "_rels/.rels",
      "word/_rels/document.xml.rels",
      "word/document.xml",
    ]);
    expect(await zip.file("word/document.xml")!.async("string")).toContain("テスト");
  });
});
