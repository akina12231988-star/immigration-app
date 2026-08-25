import { afterEach, describe, expect, it, vi } from "vitest";
import { canShareFile, fileSaveMessage, saveOrShareFile } from "./file-save";

const PDF = () => new File(["x"], "預かり証_テスト_No015.pdf", { type: "application/pdf" });

function setNavigator(value: unknown) {
  vi.stubGlobal("navigator", value);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("canShareFile", () => {
  it("共有に対応していない端末（パソコンのブラウザなど）は false", () => {
    setNavigator({});
    expect(canShareFile(PDF())).toBe(false);
  });

  it("ファイルを共有できる端末（スマホ）は true", () => {
    setNavigator({ share: () => Promise.resolve(), canShare: () => true });
    expect(canShareFile(PDF())).toBe(true);
  });

  it("canShare が例外を投げる端末でも落ちない", () => {
    setNavigator({
      share: () => Promise.resolve(),
      canShare: () => {
        throw new Error("not supported");
      },
    });
    expect(canShareFile(PDF())).toBe(false);
  });
});

describe("saveOrShareFile", () => {
  it("スマホでは共有シートへファイルそのものを渡す（リンクではなくファイル）", async () => {
    const share = vi.fn(() => Promise.resolve());
    setNavigator({ share, canShare: () => true });

    const result = await saveOrShareFile(new Blob(["x"]), "預かり証_テスト.pdf", "application/pdf");

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    const arg = share.mock.calls[0][0] as { files: File[]; url?: string; title?: string };
    // files だけを渡す（url や title を混ぜると iPhone でリンクの共有に化けることがある）
    expect(Object.keys(arg)).toEqual(["files"]);
    expect(arg.files[0].name).toBe("預かり証_テスト.pdf");
    expect(arg.files[0].type).toBe("application/pdf");
  });

  it("共有シートを閉じただけのときはダウンロードし直さない", async () => {
    const share = vi.fn(() => Promise.reject(new DOMException("canceled", "AbortError")));
    setNavigator({ share, canShare: () => true });

    expect(await saveOrShareFile(new Blob(["x"]), "a.pdf", "application/pdf")).toBe("canceled");
  });
});

describe("fileSaveMessage", () => {
  it("結果に合わせた案内を出す（閉じただけのときは出さない）", () => {
    expect(fileSaveMessage("downloaded", "a.pdf")).toBe("a.pdf を保存しました");
    expect(fileSaveMessage("shared", "a.pdf")).toContain("渡しました");
    expect(fileSaveMessage("canceled", "a.pdf")).toBeNull();
  });
});
