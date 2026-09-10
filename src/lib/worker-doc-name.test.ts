import { describe, expect, it } from "vitest";
import { workerDocFileName } from "./worker-doc-name";

describe("外国人の書類のダウンロード名", () => {
  it("氏名_書類名.拡張子 にする（所属機関名は入れない）", () => {
    expect(workerDocFileName("PHAM MANH DUC", "雇用契約書", "scan 2026.PDF")).toBe("PHAM MANH DUC_雇用契約書.pdf");
    expect(workerDocFileName("BUI NGOC TUAN", "雇用条件書", "IMG_0012.jpg")).toBe("BUI NGOC TUAN_雇用条件書.jpg");
  });
  it("使えない文字は中黒に、氏名が無ければ元の名前にする", () => {
    expect(workerDocFileName("A/B", "在留カード", "card.png")).toBe("A・B_在留カード.png");
    expect(workerDocFileName("", "", "original.pdf")).toBe("original.pdf");
    expect(workerDocFileName("", "", "")).toBe("document");
  });
});
