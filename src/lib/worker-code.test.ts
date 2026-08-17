import { describe, expect, it } from "vitest";
import {
  codeLetter,
  letterForNationality,
  nextWorkerCode,
  shouldReissueWorkerCode,
} from "./worker-code";

describe("letterForNationality", () => {
  it("対応表の国は決まった英字になる", () => {
    expect(letterForNationality("カンボジア")).toBe("C");
    expect(letterForNationality("ベトナム")).toBe("V");
    expect(letterForNationality(" インドネシア ")).toBe("I");
  });
  it("未入力・対応表に無い国は X", () => {
    expect(letterForNationality("")).toBe("X");
    expect(letterForNationality(null)).toBe("X");
    expect(letterForNationality("ブラジル")).toBe("X");
  });
});

describe("nextWorkerCode", () => {
  it("その英字の最大の連番の次を返す", () => {
    expect(nextWorkerCode("C", ["C-1", "C-3", "C-2"])).toBe("C-4");
  });
  it("その英字が1件も無ければ1番", () => {
    expect(nextWorkerCode("V", [])).toBe("V-1");
    expect(nextWorkerCode("V", ["C-9", null])).toBe("V-1");
  });
});

describe("codeLetter", () => {
  it("IDの英字を取り出す", () => {
    expect(codeLetter("C-5")).toBe("C");
    expect(codeLetter("X-12")).toBe("X");
  });
  it("IDが無い・形が違うときは null", () => {
    expect(codeLetter(null)).toBeNull();
    expect(codeLetter("")).toBeNull();
    expect(codeLetter("C5")).toBeNull();
  });
});

describe("shouldReissueWorkerCode", () => {
  it("申請登録で作った X のIDは、国籍を登録したら振り直す", () => {
    expect(shouldReissueWorkerCode("X-1", "カンボジア")).toBe(true);
  });
  it("国籍を訂正して英字が変わるときも振り直す", () => {
    expect(shouldReissueWorkerCode("C-3", "ベトナム")).toBe(true);
  });
  it("英字が合っているなら振り直さない（IDを保つ）", () => {
    expect(shouldReissueWorkerCode("C-3", "カンボジア")).toBe(false);
    expect(shouldReissueWorkerCode("X-1", "ブラジル")).toBe(false); // 対応表に無い国はXのまま
  });
  it("国籍を消しても、国の入ったIDは X に戻さない", () => {
    expect(shouldReissueWorkerCode("C-3", "")).toBe(false);
    expect(shouldReissueWorkerCode("C-3", null)).toBe(false);
  });
  it("IDがまだ無い外国人には採番する", () => {
    expect(shouldReissueWorkerCode(null, "カンボジア")).toBe(true);
    expect(shouldReissueWorkerCode(null, "")).toBe(true);
  });
});
