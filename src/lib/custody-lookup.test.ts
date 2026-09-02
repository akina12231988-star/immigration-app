import { describe, expect, it } from "vitest";
import {
  buildCustodyNoIndex,
  findCustodyNo,
  normalizeWorkerName,
  type ActiveCustodyRow,
} from "./custody-lookup";

const row = (
  worker_id: string,
  worker_name: string,
  storage_no: number,
): ActiveCustodyRow => ({ worker_id, worker_name, storage_no });

describe("normalizeWorkerName", () => {
  it("全角・余分な空白・小文字を揃える", () => {
    expect(normalizeWorkerName("　truong  thi　duyen ")).toBe("TRUONG THI DUYEN");
    expect(normalizeWorkerName("ＴＲＵＯＮＧ ＴＨＩ ＤＵＹＥＮ")).toBe("TRUONG THI DUYEN");
  });

  it("空欄は空文字にする", () => {
    expect(normalizeWorkerName("   ")).toBe("");
  });
});

describe("buildCustodyNoIndex", () => {
  it("外国人IDと氏名の両方から引ける", () => {
    const idx = buildCustodyNoIndex([row("w1", "TRUONG THI DUYEN", 203)]);
    expect(idx.byWorkerId.get("w1")).toBe(203);
    expect(idx.byName.get("TRUONG THI DUYEN")).toBe(203);
  });

  it("1人が複数の番号を持つときは小さい番号を採る", () => {
    const idx = buildCustodyNoIndex([row("w1", "A B", 300), row("w1", "A B", 12)]);
    expect(idx.byWorkerId.get("w1")).toBe(12);
    expect(idx.byName.get("A B")).toBe(12);
  });

  it("同姓同名が別人で預かり中なら氏名では引けない", () => {
    const idx = buildCustodyNoIndex([row("w1", "A B", 10), row("w2", "A B", 20)]);
    expect(idx.byWorkerId.get("w1")).toBe(10);
    expect(idx.byWorkerId.get("w2")).toBe(20);
    expect(idx.byName.get("A B")).toBeNull();
  });

  it("氏名が空の預かりは氏名の索引に入れない", () => {
    const idx = buildCustodyNoIndex([row("w1", "  ", 5)]);
    expect(idx.byWorkerId.get("w1")).toBe(5);
    expect(idx.byName.size).toBe(0);
  });
});

describe("findCustodyNo", () => {
  const idx = buildCustodyNoIndex([
    row("w1", "TRUONG THI DUYEN", 203),
    row("w2", "A B", 10),
    row("w3", "A B", 20),
  ]);

  it("外国人が紐づいていればそのIDで引く", () => {
    expect(findCustodyNo(idx, "w1", "別の名前")).toBe(203);
  });

  it("外国人が紐づいていなくても氏名で引ける", () => {
    expect(findCustodyNo(idx, null, "truong thi duyen")).toBe(203);
  });

  it("紐づいた外国人が預かり中でなければ氏名で照合する（重複登録の救済）", () => {
    expect(findCustodyNo(idx, "wX", "TRUONG THI DUYEN")).toBe(203);
  });

  it("同姓同名で特定できないときは出さない", () => {
    expect(findCustodyNo(idx, null, "A B")).toBeNull();
  });

  it("預かっていない・氏名が空なら null", () => {
    expect(findCustodyNo(idx, null, "誰か")).toBeNull();
    expect(findCustodyNo(idx, null, "")).toBeNull();
  });
});
