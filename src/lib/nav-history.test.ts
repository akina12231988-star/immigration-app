import { beforeEach, describe, expect, it } from "vitest";
import { popNavHistory, pushNavHistory, readNavHistory } from "./nav-history";

// sessionStorage の簡易版（テスト環境には window が無い）
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as unknown as { window: unknown }).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

describe("nav-history", () => {
  it("表示した順に積み、同じ画面の再表示は足さない", () => {
    pushNavHistory("/a");
    pushNavHistory("/b");
    pushNavHistory("/b");
    expect(readNavHistory()).toEqual(["/a", "/b"]);
  });
  it("1つ前の画面に戻ってきたら最後の1件を外す（行ったり来たりで増えない）", () => {
    pushNavHistory("/a");
    pushNavHistory("/b");
    pushNavHistory("/a");
    expect(readNavHistory()).toEqual(["/a"]);
  });
  it("戻る先は1つ前の画面。返すと同時に今の画面を外す", () => {
    pushNavHistory("/a");
    pushNavHistory("/b");
    pushNavHistory("/c");
    expect(popNavHistory("/c")).toBe("/b");
    expect(readNavHistory()).toEqual(["/a", "/b"]);
    expect(popNavHistory("/b")).toBe("/a");
    expect(popNavHistory("/a")).toBeNull();
  });
  it("履歴が無ければ null", () => {
    expect(popNavHistory("/x")).toBeNull();
  });
});
