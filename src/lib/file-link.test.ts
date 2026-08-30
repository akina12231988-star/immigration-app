import { describe, expect, it } from "vitest";
import { fileLinkCopyPath, isWebFileLink } from "./file-link";

describe("isWebFileLink", () => {
  it("https:// / http:// はウェブのリンク", () => {
    expect(isWebFileLink("https://drive.google.com/drive/folders/abc")).toBe(true);
    expect(isWebFileLink("http://example.com/a")).toBe(true);
  });

  it("パソコン上のパスはウェブのリンクではない", () => {
    expect(isWebFileLink("/Users/noguchi/Documents/THANH 登録支援機関")).toBe(false);
    expect(isWebFileLink("C:\\Users\\noguchi\\Documents")).toBe(false);
    expect(isWebFileLink("\\\\server\\share\\folder")).toBe(false);
    expect(isWebFileLink("file:///Users/noguchi/Documents")).toBe(false);
    expect(isWebFileLink("")).toBe(false);
  });
});

describe("fileLinkCopyPath", () => {
  it("素のパスはそのまま", () => {
    expect(fileLinkCopyPath("/Users/noguchi/Documents")).toBe("/Users/noguchi/Documents");
    expect(fileLinkCopyPath("C:\\Users\\noguchi")).toBe("C:\\Users\\noguchi");
  });

  it("file:// の形はパスに直す（日本語の%表記も戻す）", () => {
    expect(fileLinkCopyPath("file:///Users/noguchi/Documents")).toBe("/Users/noguchi/Documents");
    expect(fileLinkCopyPath("file://localhost/Users/noguchi")).toBe("/Users/noguchi");
    expect(fileLinkCopyPath("file:///Users/noguchi/%E6%9B%B8%E9%A1%9E")).toBe(
      "/Users/noguchi/書類",
    );
  });

  it("%の使い方がおかしくても壊れない", () => {
    expect(fileLinkCopyPath("file:///a/100%off")).toBe("/a/100%off");
  });
});
